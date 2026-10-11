/* ============================================================
 * 星域蛇行 · 抖音小游戏入口（Snake V3.0 适配版）
 * 平台适配层（V3.Adapter）隔离 wx API；本入口仅做三件事：
 *   1) 为 three.js 提供最小 window/document polyfill
 *   2) 装载逻辑模块（与 PC 版共用 adapter/core/map/snake/food/collision/ai/world/renderer/audio）
 *   3) 用 CanvasTexture 在 WebGL 场景内绘制简化 UI（开始/暂停/结束/触摸操作）
 * 已适配：触摸转向、双指加速（消耗长度）、暂停/继续/重开、HUD。
 * 未真机验证（见 douyin/README.md 人工步骤）。
 * ============================================================ */
'use strict';

/* ---------- 1) three.js 运行所需的最小平台 polyfill ---------- */
const sys = wx.getSystemInfoSync();
const SW = sys.windowWidth, SH = sys.windowHeight, SDPR = sys.pixelRatio || 1;
const mainCanvas = wx.createCanvas();      // 首次调用 = 主画布（WebGL）

if (typeof window === 'undefined') {
  globalThis.window = {
    innerWidth: SW,
    innerHeight: SH,
    devicePixelRatio: Math.min(SDPR, 2),
    addEventListener: function () {},
    removeEventListener: function () {},
    requestAnimationFrame: function (cb) { return setTimeout(function () { cb(Date.now()); }, 16); },
    cancelAnimationFrame: function (id) { clearTimeout(id); }
  };
}
if (typeof document === 'undefined') {
  globalThis.document = {
    createElement: function (tag) {
      if (tag === 'canvas') return wx.createCanvas();
      throw new Error('douyin adapter: DOM element <' + tag + '> not supported');
    },
    head: { insertAdjacentHTML: function () {} },
    addEventListener: function () {},
    readyState: 'complete'
  };
}
if (typeof localStorage === 'undefined') {
  globalThis.localStorage = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };
}

/* ---------- 2) 装载 three 与共用逻辑模块 ---------- */
const THREE = require('./three.min.js');
globalThis.THREE = THREE;
globalThis.V3 = globalThis.V3 || {};

require('./js/adapter.js');
require('./js/core.js');
require('./js/map.js');
require('./js/snake.js');
require('./js/food.js');
require('./js/collision.js');
require('./js/ai.js');
require('./js/world.js');
require('./js/renderer.js');
require('./js/audio.js');

const V3 = globalThis.V3;

/* ---------- 3) 场景装配 ---------- */
const world = V3.World.create({ radius: 42, maxFood: 80, seed: 20251011 });
const renderer = V3.Renderer.create(world);

/* ---------- 简化 UI（离屏 2D canvas → CanvasTexture 贴到固定相机层） ---------- */
const uiCanvas = wx.createCanvas();        // 再次调用 = 离屏 2D canvas
uiCanvas.width = 640; uiCanvas.height = 400;
const uiCtx = uiCanvas.getContext('2d');

const uiTex = new THREE.CanvasTexture(uiCanvas);
uiTex.colorSpace = THREE.SRGBColorSpace;
const uiMat = new THREE.MeshBasicMaterial({ map: uiTex, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
const uiPlane = new THREE.Mesh(new THREE.PlaneGeometry(7, 4.4), uiMat);
uiPlane.position.z = -10;
const uiCam = new THREE.OrthographicCamera(-3.5, 3.5, 2.2, -2.2, 0.1, 100);
const uiScene = new THREE.Scene();
uiScene.add(uiPlane);

function drawUI(state, extra) {
  const g = uiCtx;
  g.clearRect(0, 0, 640, 400);
  if (state === 'menu') {
    g.fillStyle = 'rgba(30,42,66,0.82)';
    g.fillRect(0, 0, 640, 400);
    g.fillStyle = '#d9b25a';
    g.font = 'bold 44px sans-serif';
    g.textAlign = 'center';
    g.fillText('星域蛇行', 320, 120);
    g.fillStyle = '#9fd8ff';
    g.font = '20px sans-serif';
    g.fillText('ASTRO SNAKE · 3D 竞技场', 320, 160);
    g.fillStyle = '#f7f1e3';
    g.font = '22px sans-serif';
    g.fillText('触摸屏幕任意处开始', 320, 230);
    g.font = '16px sans-serif';
    g.fillStyle = 'rgba(247,241,227,0.7)';
    g.fillText('拖动转向 · 双指按下加速（消耗长度）', 320, 280);
    g.fillText('左上角返回键暂停', 320, 310);
  } else if (state === 'playing') {
    g.fillStyle = 'rgba(20,32,52,0.72)';
    g.fillRect(0, 0, 210, 96);
    g.fillStyle = '#f7f1e3';
    g.font = 'bold 22px sans-serif';
    g.textAlign = 'left';
    g.fillText('长度 ' + (extra.len | 0), 14, 34);
    g.fillText('分数 ' + (extra.score | 0), 14, 66);
    g.fillStyle = 'rgba(217,178,90,0.95)';
    g.font = '16px sans-serif';
    g.fillText('击败 ' + (extra.kills | 0), 14, 90);
  } else if (state === 'paused') {
    g.fillStyle = 'rgba(30,42,66,0.85)';
    g.fillRect(0, 0, 640, 400);
    g.fillStyle = '#d9b25a';
    g.font = 'bold 40px sans-serif';
    g.textAlign = 'center';
    g.fillText('已暂停', 320, 160);
    g.fillStyle = '#f7f1e3';
    g.font = '22px sans-serif';
    g.fillText('触摸左半屏继续 · 右半屏重新开始', 320, 220);
  } else if (state === 'over') {
    g.fillStyle = 'rgba(30,42,66,0.86)';
    g.fillRect(0, 0, 640, 400);
    g.fillStyle = '#d9b25a';
    g.font = 'bold 42px sans-serif';
    g.textAlign = 'center';
    g.fillText('游戏结束', 320, 105);
    g.fillStyle = '#f7f1e3';
    g.font = '24px sans-serif';
    g.fillText('最终分数 ' + (extra.score | 0), 320, 165);
    g.fillText('最终长度 ' + (extra.len | 0), 320, 205);
    g.fillText('存活 ' + (extra.aliveTime | 0) + 's · 击败 ' + (extra.kills | 0), 320, 245);
    g.fillText('排名 ' + extra.rank + ' / ' + extra.total, 320, 285);
    g.fillStyle = '#ffb03a';
    g.font = 'bold 24px sans-serif';
    g.fillText('触摸任意处再来一局', 320, 345);
  }
  uiTex.needsUpdate = true;
}

function computeRank() {
  let r = 1;
  const snakes = world.snakes;
  for (let i = 0; i < snakes.length; i++) {
    if (snakes[i] !== world.player && snakes[i].len > world.player.len) r++;
  }
  return r;
}

function refreshUI() {
  const st = engine.state;
  if (st === 'READY') drawUI('menu', {});
  else if (st === 'PLAYING') drawUI('playing', { len: world.player.len, score: world.player.score || 0, kills: world.killCount });
  else if (st === 'PAUSED') drawUI('paused', {});
  else if (st === 'GAME_OVER') drawUI('over', {
    score: world.player.score || 0,
    len: world.player.len,
    aliveTime: world.aliveTime,
    kills: world.killCount,
    rank: computeRank(),
    total: world.snakes.length
  });
}

/* ---------- 4) 引擎与主循环 ---------- */
const engine = V3.Core.createEngine({ fixedStep: 1 / 60 });
let boostHeld = false;

engine.onUpdate(function (dt) {
  world.player.boost = boostHeld;
  world.update(dt);
});
engine.onRender(function (t) {
  renderer.render(t, world, 1 / 60);
  renderer.renderer.render(uiScene, uiCam);
});
engine.bus.on('state', function () { refreshUI(); });

/* 玩家死亡 → 结束 */
world.events.on('playerDead', function () {
  engine.toGameOver();
  refreshUI();
});

/* ---------- 5) 输入（触摸） ---------- */
let touchCount = 0;
const Adapter = V3.Adapter;

Adapter.addPointerListener(function (ev) {
  const w = world.player;
  if (ev.type === 'down' || ev.type === 'move') {
    const dx = ev.x - SW / 2, dy = ev.y - SH / 2;
    if (Math.hypot(dx, dy) > 18) w.targetAngle = Math.atan2(dy, dx);
  }
  if (ev.type === 'down') touchCount++;
  if (ev.type === 'up') touchCount = Math.max(0, touchCount - 1);

  if (engine.state === 'READY' || engine.state === 'GAME_OVER') {
    startMatch();
    return;
  }
  if (engine.state === 'PAUSED') {
    if (ev.x > SW / 2) startMatch(); else engine.toResume();
    refreshUI();
    return;
  }
  /* PLAYING：双指加速；左上角暂停 */
  boostHeld = touchCount >= 2;
  if (ev.type === 'down' && ev.x < 70 && ev.y < 70) {
    engine.toPause();
    refreshUI();
  }
}, null);

Adapter.addKeyListener(function (ev) {
  if (ev.code === 'Space') boostHeld = ev.down;
});

/* ---------- 6) 生命周期 ---------- */
Adapter.onShow(function () {
  if (engine.state === 'PAUSED') engine.toResume();
  engine.start();
});
Adapter.onHide(function () {
  if (engine.isPlaying()) engine.toPause();
  engine.stop();
});
wx.onTouchCancel && wx.onTouchCancel(function () { touchCount = 0; boostHeld = false; });

/* ---------- 7) 开始 ---------- */
function startMatch() {
  world.reset('我', 0, 0xffb03a);
  boostHeld = false;
  engine.toPlay();
  engine.start();
  refreshUI();
}

/* 引擎常驻 rAF（READY 时渲染背景场景） */
engine.start();
refreshUI();

module.exports = {
  V3: V3,
  world: world,
  renderer: renderer,
  engine: engine,
  startMatch: startMatch
};
