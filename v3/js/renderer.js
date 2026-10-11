/* ============================================================
 * V3.Renderer — 全新 3D 渲染（原创视觉，零引用旧版）
 * 技术要点：
 *   - 场景：渐变天空 + 环形渐变场地 + 边界光带 + 低多边形装饰
 *   - 蛇身：单个大 InstancedMesh + instanceColor 分蛇（胶囊感球串）
 *   - 蛇头：每蛇一个 Group（主球 + 双眼），原创造型
 *   - 食物：三类 InstancedMesh（八面体/五角星/六棱冰晶），光晕实例池
 *   - 粒子：Points 对象池（上限 240），吃食/死亡爆散
 *   - 摄像机：跟随玩家蛇头平滑插值
 *   - 几何/材质全部模块级复用；DPR ≤ 2
 * ============================================================ */
(function (global) {
  'use strict';
  const V3 = global.V3;
  const Adapter = V3.Adapter;

  /* ---------- 模块级共享几何/材质（一次创建，永久复用） ---------- */
  const SEG_GEO = new THREE.SphereGeometry(0.5, 12, 10);
  const HEAD_GEO = new THREE.SphereGeometry(0.6, 18, 14);
  const SNOUT_GEO = new THREE.SphereGeometry(0.34, 12, 10);
  const EYE_WHITE_GEO = new THREE.SphereGeometry(0.22, 10, 8);
  const EYE_PUPIL_GEO = new THREE.SphereGeometry(0.115, 8, 6);
  const TONGUE_GEO = new THREE.BoxGeometry(0.075, 0.028, 0.55);
  const CRYSTAL_GEO = new THREE.OctahedronGeometry(0.5, 0);
  const GOLD_GEO = (function () {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 0.55 : 0.22;
      const a = -Math.PI / 2 + i * Math.PI / 5;
      if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 });
  })();
  const FROST_GEO = new THREE.CylinderGeometry(0.16, 0.26, 0.9, 6);
  const HALO_GEO = new THREE.SphereGeometry(1, 8, 6);
  const ORB_GEO = new THREE.SphereGeometry(0.55, 10, 8);

  const MAX_SEG = 140;          // 单蛇身体段渲染上限
  const TOTAL_SEGS = 11 * MAX_SEG;
  const MAX_PARTICLES = 240;

  /* ---------- 渲染器 ---------- */
  function createRenderer(canvasHost) {
    const size = Adapter.getScreenSize();
    const dpr = Math.min(size.dpr, 2);
    const canvas = Adapter.createCanvas();
    if (canvasHost && canvasHost.appendChild) canvasHost.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: dpr <= 1.5, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(dpr);
    renderer.setSize(size.width, size.height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    scene.background = makeSkyTexture();

    const camera = new THREE.PerspectiveCamera(55, size.width / size.height, 0.1, 400);
    camera.position.set(0, 38, 38);
    camera.lookAt(0, 0, 0);

    /* 灯光：主光 + 补光 + 环境（受控数量，不逐对象加灯） */
    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0xf6e3c2, 0.9);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.2);
    sun.position.set(18, 30, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -100; sun.shadow.camera.right = 100;
    sun.shadow.camera.top = 100; sun.shadow.camera.bottom = -100;
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x6fc3ff, 0.5);
    rim.position.set(-14, 10, -18);
    scene.add(rim);

    /* ---------- 场地（原创：环形渐变 + 边界光带） ---------- */
    const arenaR = 72;
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(arenaR, 72),
      new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 0.55, metalness: 0.08 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    /* 外缘深色环带（压出边界感） */
    const edge = new THREE.Mesh(
      new THREE.RingGeometry(arenaR - 1.2, arenaR + 0.6, 72),
      new THREE.MeshStandardMaterial({ color: 0x2c4a6e, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide })
    );
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = 0.01;
    scene.add(edge);

    /* 发光边界光带（受控半透明环） */
    const glowRing = new THREE.Mesh(
      new THREE.RingGeometry(arenaR - 0.55, arenaR - 0.28, 96),
      new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })
    );
    glowRing.rotation.x = -Math.PI / 2;
    glowRing.position.y = 0.06;
    scene.add(glowRing);

    /* 装饰：环绕场地的低多边形小晶柱（16 根，静态） */
    const decoMat = new THREE.MeshStandardMaterial({ color: 0x9fd4ff, roughness: 0.35, metalness: 0.2, emissive: 0x2a5a8a, emissiveIntensity: 0.35 });
    const decoGeo = new THREE.CylinderGeometry(0.22, 0.34, 1.6, 5);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + 0.26;
      const d = arenaR - 0.9;
      const p = new THREE.Mesh(decoGeo, decoMat);
      p.position.set(Math.cos(a) * d, 0.8, Math.sin(a) * d);
      p.castShadow = true;
      scene.add(p);
    }

    /* ---------- 蛇身实例池（与蛇头同色、明亮球体） ---------- */
    const segMat = new THREE.MeshLambertMaterial({ roughness: 0.35, emissive: 0xffffff, emissiveIntensity: 0.32 });
    const segInst = new THREE.InstancedMesh(SEG_GEO, segMat, TOTAL_SEGS);
    segInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    segInst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TOTAL_SEGS * 3), 3);
    segInst.castShadow = true;
    scene.add(segInst);

    /* ---------- 蛇头（每蛇一个 Group：拉长头形 + 吻部 + 白眼黑瞳 + 蛇信） ---------- */
    const headGroups = new Map();
    const tongueMat = new THREE.MeshBasicMaterial({ color: 0xff5a5a });
    function ensureHead(snake) {
      let g = headGroups.get(snake.id);
      if (g) return g;
      g = new THREE.Group();
      /* 主头球：拉长水滴形（+x 为前进方向） */
      const headMat = new THREE.MeshStandardMaterial({ color: snake.color, roughness: 0.32, metalness: 0.18, emissive: snake.color, emissiveIntensity: 0.3 });
      const mainBall = new THREE.Mesh(HEAD_GEO, headMat);
      mainBall.scale.set(1.35, 0.92, 1.02);
      mainBall.castShadow = true;
      g.add(mainBall);
      /* 吻部（鼻尖）：前下方圆润小鼓包 */
      const snoutMat = new THREE.MeshStandardMaterial({ color: snake.color, roughness: 0.3, metalness: 0.15, emissive: snake.color, emissiveIntensity: 0.33 });
      const snout = new THREE.Mesh(SNOUT_GEO, snoutMat);
      snout.scale.set(1.25, 0.85, 0.95);
      snout.position.set(0.5, -0.06, 0);
      snout.castShadow = true;
      g.add(snout);
      /* 眼睛：白眼球 + 黑瞳孔（朝前偏上） */
      const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const pupilMat = new THREE.MeshBasicMaterial({ color: 0x1a2233 });
      const mkEye = function (side) {
        const w = new THREE.Mesh(EYE_WHITE_GEO, whiteMat);
        w.position.set(0.44, 0.26, side * 0.4);
        const p = new THREE.Mesh(EYE_PUPIL_GEO, pupilMat);
        p.position.set(0.56, 0.26, side * 0.42);
        g.add(w); g.add(p);
      };
      mkEye(1); mkEye(-1);
      /* 蛇信：红色分叉（吐信动画由 render 驱动） */
      const tL = new THREE.Mesh(TONGUE_GEO, tongueMat);
      tL.position.set(0.8, -0.18, 0.07);
      tL.rotation.z = 0.26;
      const tR = tL.clone();
      tR.position.z = -0.07;
      tR.rotation.z = -0.26;
      g.add(tL); g.add(tR);
      g.userData.tongue = [tL, tR];
      /* 高光小点 */
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      glint.position.set(0.56, 0.34, 0.4);
      g.add(glint);
      scene.add(g);
      headGroups.set(snake.id, g);
      return g;
    }

    /* ---------- 食物实例池（三类，明亮醒目） ---------- */
    const foodNormalMat = new THREE.MeshStandardMaterial({ color: 0xff9a5c, emissive: 0xff6a3c, emissiveIntensity: 1.5, roughness: 0.2, metalness: 0.2, envMapIntensity: 1.1 });
    const foodGoldMat = new THREE.MeshStandardMaterial({ color: 0xffd54d, emissive: 0xffc400, emissiveIntensity: 1.9, roughness: 0.2, metalness: 0.55 });
    const foodFrostMat = new THREE.MeshStandardMaterial({ color: 0xc8f2ff, emissive: 0x4cc9f0, emissiveIntensity: 1.6, roughness: 0.25, metalness: 0.15 });
    const foodInstN = new THREE.InstancedMesh(CRYSTAL_GEO, foodNormalMat, 200);
    foodInstN.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    foodInstN.castShadow = true; scene.add(foodInstN);
    const foodInstG = new THREE.InstancedMesh(GOLD_GEO, foodGoldMat, 12);
    foodInstG.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    foodInstG.castShadow = true; scene.add(foodInstG);
    const foodInstF = new THREE.InstancedMesh(FROST_GEO, foodFrostMat, 30);
    foodInstF.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    foodInstF.castShadow = true; scene.add(foodInstF);

    /* 食物光晕（实例半透明球，Additive，更亮更大） */
    const haloMat = new THREE.MeshBasicMaterial({ color: 0xfff3d0, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false });
    const haloInst = new THREE.InstancedMesh(HALO_GEO, haloMat, 260);
    haloInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(haloInst);

    /* 能量球 */
    const orbMat = new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xffc75a, emissiveIntensity: 1.0, roughness: 0.2, metalness: 0.3 });
    const orbInst = new THREE.InstancedMesh(ORB_GEO, orbMat, 60);
    orbInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    orbInst.castShadow = true; scene.add(orbInst);

    /* ---------- 粒子对象池（Points） ---------- */
    const pPos = new Float32Array(MAX_PARTICLES * 3);
    const pCol = new Float32Array(MAX_PARTICLES * 3);
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
    const pMat = new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    const particles = new THREE.Points(pGeo, pMat);
    particles.frustumCulled = false;
    scene.add(particles);
    const particlePool = [];    // {x,y,z,vx,vy,vz,life,maxLife,color}
    for (let i = 0; i < MAX_PARTICLES; i++) particlePool.push({ life: 0 });

    /* 变换复用对象 */
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _e = new THREE.Euler();

    /* ---------- 工具 ---------- */
    function setInst(im, i, x, y, z, scale, rotY, color) {
      _e.set(0, rotY, 0);
      _q.setFromEuler(_e);
      _s.set(scale, scale, scale);
      _m.compose(_v.set(x, y, z), _q, _s);
      im.setMatrixAt(i, _m);
      if (color !== undefined && im.instanceColor) im.setColorAt(i, _v.set(color.r, color.g, color.b));
    }

    function burst(pos, color, count) {
      const c = new THREE.Color(color);
      let n = 0;
      for (let i = 0; i < particlePool.length && n < count; i++) {
        const p = particlePool[i];
        if (p.life > 0) continue;
        p.x = pos.x; p.y = pos.y + 0.4; p.z = pos.z;
        const a = Math.random() * Math.PI * 2, up = Math.random() * 2.2;
        const sp = 1.6 + Math.random() * 3.2;
        p.vx = Math.cos(a) * sp; p.vz = Math.sin(a) * sp; p.vy = 0.8 + Math.random() * up;
        p.life = p.maxLife = 0.5 + Math.random() * 0.4;
        p.r = c.r + (Math.random() - 0.5) * 0.3; p.g = c.g + (Math.random() - 0.5) * 0.3; p.b = c.b + (Math.random() - 0.5) * 0.3;
        n++;
      }
      return n;
    }

    function updateParticles(dt) {
      let write = 0;
      for (let i = 0; i < particlePool.length; i++) {
        const p = particlePool[i];
        if (p.life <= 0) { pPos[write * 3] = pPos[write * 3 + 1] = pPos[write * 3 + 2] = -999; write++; continue; }
        p.life -= dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.vy -= 4.5 * dt;
        pPos[write * 3] = p.x; pPos[write * 3 + 1] = p.y; pPos[write * 3 + 2] = p.z;
        const f = Math.max(0, p.life / p.maxLife);
        pCol[write * 3] = p.r * f; pCol[write * 3 + 1] = p.g * f; pCol[write * 3 + 2] = p.b * f;
        write++;
      }
      pGeo.attributes.position.needsUpdate = true;
      pGeo.attributes.color.needsUpdate = true;
      pGeo.setDrawRange(0, write);
    }

    /* ---------- 纹理（程序化，本地无外部资源） ---------- */
    function makeSkyTexture() {
      const c = V3.Adapter.createCanvas();
      c.width = 2; c.height = 256;
      const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, '#bfe0ff');
      gr.addColorStop(0.55, '#e8f4ff');
      gr.addColorStop(1, '#fff6e8');
      g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }
    function makeGroundTexture() {
      const c = V3.Adapter.createCanvas();
      c.width = 256; c.height = 256;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(128, 128, 8, 128, 128, 180);
      gr.addColorStop(0, '#f8f2e2');
      gr.addColorStop(0.6, '#e9f4f0');
      gr.addColorStop(1, '#b9d8e8');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      /* 细腻同心纹（原创装饰） */
      g.strokeStyle = 'rgba(120,160,190,0.10)';
      for (let r = 24; r < 190; r += 22) {
        g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.stroke();
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }

    /* ---------- 帧渲染 ---------- */
    const tmpCol = new THREE.Color();
    function render(t, world, dt) {
      /* 蛇头 */
      const snakes = world.snakes;
      for (let i = 0; i < snakes.length; i++) {
        const sn = snakes[i];
        const g = ensureHead(sn);
        g.visible = sn.alive;
        if (!sn.alive) continue;
        g.position.set(sn.pos.x, 0.62, sn.pos.y);
        g.rotation.y = -sn.angle;
        /* 呼吸微动 */
        const sc = 1 + Math.sin(t * 4 + i) * 0.03;
        g.scale.set(sc, sc, sc);
        /* 蛇信吐信动画：周期性瞬间伸出 */
        const fl = Math.pow(Math.max(0, Math.sin(t * 2.6 + i * 1.9)), 10);
        const tk = 0.84 + fl * 0.85;
        for (let q = 0; q < 2; q++) {
          const tl = g.userData.tongue[q];
          tl.position.z = q === 0 ? 0.08 : -0.08;
          tl.position.x = tk;
          tl.visible = fl > 0.008;
        }
      }

      /* 蛇身（实例池：玩家 + AI，instanceColor 分蛇） */
      let segWrite = 0;
      for (let i = 0; i < snakes.length; i++) {
        const sn = snakes[i];
        if (!sn.alive) continue;
        const body = V3.Snake.sampleBody(sn);
        const n = Math.min(body.length, MAX_SEG);
        for (let k = 0; k < n; k++) {
          const b = body[k];
          const s = b.head ? 0.62 : 0.72;
          setInst(segInst, segWrite, b.x, b.y !== undefined ? 0.5 : 0.5, b.y, s, 0, tmpCol.setHex(sn.color));
          segWrite++;
        }
      }
      segInst.count = segWrite;
      segInst.instanceMatrix.needsUpdate = true;
      if (segInst.instanceColor) segInst.instanceColor.needsUpdate = true;

      /* 食物 */
      const foods = world.foods.foods;
      let nI = 0, gI = 0, fI = 0;
      for (let i = 0; i < foods.length; i++) {
        const f = foods[i];
        const bob = 0.6 + Math.sin(t * 3 + f.t * 2) * 0.16;
        const pulse = 1 + Math.sin(t * 5 + f.t * 3) * 0.15;
        const rot = t * 1.8 + f.id * 0.7;
        if (f.type === 'gold') setInst(foodInstG, gI++, f.x, bob, f.y, pulse * 2.2, rot, tmpCol.setHex(0xffd54d));
        else if (f.type === 'frost') setInst(foodInstF, fI++, f.x, bob, f.y, pulse * 1.9, rot, tmpCol.setHex(0x8fd8ff));
        else setInst(foodInstN, nI++, f.x, bob, f.y, pulse * 2.2, rot, tmpCol.setHex(0xff8a5c));
        setInst(haloInst, i, f.x, bob, f.y, 2.3 + pulse * 0.35, 0, tmpCol.setHex(0xfff3d0));
      }
      foodInstN.count = nI; foodInstN.instanceMatrix.needsUpdate = true;
      if (foodInstN.instanceColor) foodInstN.instanceColor.needsUpdate = true;
      foodInstG.count = gI; foodInstG.instanceMatrix.needsUpdate = true;
      if (foodInstG.instanceColor) foodInstG.instanceColor.needsUpdate = true;
      foodInstF.count = fI; foodInstF.instanceMatrix.needsUpdate = true;
      if (foodInstF.instanceColor) foodInstF.instanceColor.needsUpdate = true;
      haloInst.count = foods.length; haloInst.instanceMatrix.needsUpdate = true;
      if (haloInst.instanceColor) haloInst.instanceColor.needsUpdate = true;

      /* 能量球 */
      const orbs = world.foods.orbs;
      for (let i = 0; i < orbs.length; i++) {
        const o = orbs[i];
        const bob = 0.6 + Math.sin(t * 5 + o.id) * 0.12;
        setInst(orbInst, i, o.x, bob, o.y, 0.8 + o.value * 0.05, t * 2, tmpCol.setHex(0xffd76a));
      }
      orbInst.count = orbs.length; orbInst.instanceMatrix.needsUpdate = true;
      if (orbInst.instanceColor) orbInst.instanceColor.needsUpdate = true;

      updateParticles(dt || 0.016);

      /* 摄像机跟随玩家（拉远：可视范围约 2 倍） */
      const pl = world.player;
      if (pl.alive) {
        const fx = pl.pos.x + Math.cos(pl.angle) * 9;
        const fy = pl.pos.y + Math.sin(pl.angle) * 9;
        const target = new THREE.Vector3(pl.pos.x * 0.85 + fx * 0.15, 19 + Math.max(0, pl.len - 4) * 0.05, pl.pos.y * 0.85 + fy * 0.15);
        camera.position.lerp(target, 1 - Math.exp(-3.2 * (dt || 0.016)));
        camera.lookAt(_v.set(pl.pos.x + Math.cos(pl.angle) * 3.5, 0.4, pl.pos.y + Math.sin(pl.angle) * 3.5));
      }
      renderer.render(scene, camera);
    }

    function onResize() {
      const s = Adapter.getScreenSize();
      renderer.setSize(s.width, s.height);
      camera.aspect = s.width / s.height;
      camera.updateProjectionMatrix();
    }
    Adapter.onShow(onResize);
    if (typeof window !== 'undefined') window.addEventListener('resize', onResize);

    return {
      renderer: renderer,
      scene: scene,
      camera: camera,
      render: render,
      burst: burst,
      onResize: onResize,
      /* 测试句柄 */
      debugCounts: function () {
        return { segs: segInst.count, foods: foodInstN.count + foodInstG.count + foodInstF.count, orbs: orbInst.count };
      }
    };
  }

  V3.Renderer = { create: createRenderer };
})(typeof window !== 'undefined' ? window : globalThis);
