/* ============================================================
 * V3.AI — 10 条本地 AI 蛇（真实状态驱动：觅食/转向/规避/加速/复活）
 * 行为：
 *   1) 目标选择：最近食物/能量球（带随机扰动，避免全部抢同一目标）
 *   2) 转向：平滑追向目标
 *   3) 碰撞规避：探测前方圆锥内的蛇头/身体，偏转躲避
 *   4) 加速：目标较远且自身质量充足时短促加速（消耗质量）
 *   5) 死亡：掉能量球（由 World 处理），respawnIn 倒计时后复活
 * ============================================================ */
(function (global) {
  'use strict';
  const V3 = global.V3;
  const SNAKE = V3.Snake;

  const AI_COUNT = 10;
  const AI_SPEED_MIN = 0.92, AI_SPEED_MAX = 1.05;
  const RESPAWN_TIME = 3.2;
  const LOOKAHEAD = 3.2;          // 前方探测距离
  const LOOKAHEAD_BODY = 2.6;     // 前方身体探测距离
  const AVOID_ANGLE = 0.9;        // 规避偏转弧度
  const BOOST_THRESHOLD = 7;      // 长度 > 该值才允许加速
  const BOOST_COOLDOWN = 4;

  function createAISnakes(world, avoidPlayer, minDistFromPlayer) {
    const snakes = [];
    const names = ['青岚', '赤焰', '玄冰', '金鳞', '紫电', '翠微', '银羽', '绯云', '墨渊', '流光'];
    const colors = [0x4fc3f7, 0xff7043, 0x7e9cff, 0xffd54d, 0xce93d8, 0x66bb6a, 0xb0bec5, 0xff8a80, 0x8d6e63, 0x4dd0e1];
    for (let i = 0; i < AI_COUNT; i++) {
      // 出生点尽量远离玩家（开局保护）
      let px = 0, py = 0, pa = 0;
      for (let t = 0; t < 40; t++) {
        const a = Math.random() * Math.PI * 2;
        const d = 6 + Math.random() * 12;
        px = Math.cos(a) * d; py = Math.sin(a) * d;
        if (!avoidPlayer || avoidPlayer(px, py) >= minDistFromPlayer) break;
      }
      pa = Math.atan2(-py, -px) + (Math.random() - 0.5) * 0.6;   // 朝场地中心附近，避免贴边
      const sn = SNAKE.create({
        id: 'ai-' + i,
        name: names[i],
        skin: i,
        color: colors[i],
        speedMul: AI_SPEED_MIN + Math.random() * (AI_SPEED_MAX - AI_SPEED_MIN),
        x: px,
        y: py,
        angle: pa
      });
      sn._ai = {
        target: null,
        avoid: 0,          // 规避时间
        avoidDir: 0,
        boostCd: 0,
        wanderT: Math.random() * 10
      };
      snakes.push(sn);
    }
    return snakes;
  }

  /* 单条 AI 决策：输入 dt、世界（食物/球/蛇），输出 targetAngle 与 boost 意图 */
  function think(sn, world, dt) {
    const ai = sn._ai;
    if (sn.disabled) return;    // 完全冻结（不移动、不复活、不觅食）
    if (!sn.alive) {
      sn.respawnIn -= dt;
      if (sn.respawnIn <= 0) respawn(sn, world);
      return;
    }
    if (sn.frozen) return;

    ai.boostCd = Math.max(0, ai.boostCd - dt);

    /* ---- 1. 目标选择：加权最近目标 ---- */
    const best = pickTarget(sn, world);
    ai.target = best;

    /* ---- 2. 转向 ---- */
    let targetAngle = sn.angle;
    if (best) {
      targetAngle = Math.atan2(best.y - sn.pos.y, best.x - sn.pos.x);
    } else {
      // 无目标：慢速漂移，避免静止
      ai.wanderT += dt;
      targetAngle = sn.angle + Math.sin(ai.wanderT * 0.7) * 0.5;
    }

    /* ---- 3. 碰撞规避（优先级高于觅食） ---- */
    const avoid = probe(sn, world);
    if (avoid) {
      ai.avoid = 0.35;
      ai.avoidDir = avoid.dir;
    }
    if (ai.avoid > 0) {
      ai.avoid -= dt;
      targetAngle = sn.angle + ai.avoidDir * AVOID_ANGLE;
    }

    sn.targetAngle = SNAKE.normAngle(targetAngle);

    /* ---- 4. 加速决策 ---- */
    sn.boost = false;
    if (sn.len >= BOOST_THRESHOLD && ai.boostCd <= 0 && best && distTo(sn, best) > 14) {
      sn.boost = true;
      ai.boostCd = BOOST_COOLDOWN;
    }
  }

  function distTo(sn, p) { return Math.hypot(p.x - sn.pos.x, p.y - sn.pos.y); }

  function pickTarget(sn, world) {
    let best = null, bestD = 1e9;
    const foods = world.foods.foods, orbs = world.foods.orbs;
    for (let i = 0; i < foods.length; i++) {
      const f = foods[i];
      const d = distTo(sn, f) + (f.type === 'gold' ? -2 : 0) + (f.type === 'frost' ? 1.2 : 0);
      if (d < bestD) { bestD = d; best = f; }
    }
    for (let i = 0; i < orbs.length; i++) {
      const o = orbs[i];
      const d = distTo(sn, o) - o.value * 1.2;
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  }

  /* 前方圆锥探测：返回需要规避的方向（+1 左 / -1 右），否则 null */
  function probe(sn, world) {
    const snakes = world.snakes;
    const avoidable = [];
    for (let s = 0; s < snakes.length; s++) {
      const other = snakes[s];
      if (other === sn || !other.alive || other.disabled) continue;
      // 其他蛇头
      const dxh = other.pos.x - sn.pos.x, dyh = other.pos.y - sn.pos.y;
      const dh = Math.hypot(dxh, dyh);
      if (dh < LOOKAHEAD && dh > 0.01) {
        const rel = Math.atan2(dyh, dxh);
        const diff = SNAKE.normAngle(rel - sn.angle);
        if (Math.abs(diff) < 1.05) {
          const danger = 1 / Math.max(0.6, dh);
          avoidable.push({ dir: diff > 0 ? -1 : 1, danger: danger * (other.len > sn.len ? 1.6 : 1.0) });
        }
      }
      // 其他蛇身体（采样）
      const body = SNAKE.sampleBody(other);
      for (let i = 2; i < body.length; i += 2) {
        const b = body[i];
        const dx = b.x - sn.pos.x, dy = b.y - sn.pos.y;
        const d = Math.hypot(dx, dy);
        if (d < LOOKAHEAD_BODY) {
          const rel = Math.atan2(dy, dx);
          const diff = SNAKE.normAngle(rel - sn.angle);
          if (Math.abs(diff) < 1.2) {
            avoidable.push({ dir: diff > 0 ? -1 : 1, danger: (1 / Math.max(0.7, d)) * 1.8 });
          }
        }
      }
      // 边界规避
      const db = world.map.distToBorder(sn.pos.x, sn.pos.y);
      if (db < 6) {
        const inward = Math.atan2(-sn.pos.y, -sn.pos.x);
        const diff = SNAKE.normAngle(inward - sn.angle);
        avoidable.push({ dir: diff > 0 ? -1 : 1, danger: (1 / Math.max(0.8, db)) * 1.4 });
      }
    }
    if (!avoidable.length) return null;
    avoidable.sort(function (a, b) { return b.danger - a.danger; });
    return avoidable[0];
  }

  function respawn(sn, world) {
    // 复活点尽量远离玩家，避免"复活即撞"
    const p = world.map.randomFreePoint(function (x, y) {
      if (!world.player || !world.player.alive) return 1e9;
      return Math.hypot(world.player.pos.x - x, world.player.pos.y - y) - world.player.len * 0.55;
    }, 5, Math.random);
    SNAKE.reset(sn, { x: p.x, y: p.y, angle: Math.random() * Math.PI * 2 });
    sn.respawnIn = 0;
    sn._ai.avoid = 0;
    sn._ai.boostCd = 2;
  }

  V3.AI = {
    AI_COUNT: AI_COUNT,
    createAISnakes: createAISnakes,
    think: think,
    respawn: respawn,
    RESPAWN_TIME: RESPAWN_TIME
  };
})(typeof window !== 'undefined' ? window : globalThis);
