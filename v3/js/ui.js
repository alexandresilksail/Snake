/* ============================================================
 * V3.UI — 原创界面（开始/昵称/皮肤/HUD/排行榜/暂停/结束/方向提示）
 * 独立视觉体系：青空渐变底 + 羊皮纸面板 + 描金点缀（自建 token，不复用旧版布局）
 * ============================================================ */
(function (global) {
  'use strict';
  const V3 = global.V3;
  const Adapter = V3.Adapter;

  const SKINS = [
    { name: '曦焰', color: 0xffb03a },
    { name: '苍澜', color: 0x4fc3f7 },
    { name: '翠影', color: 0x66bb6a },
    { name: '紫夜', color: 0xce93d8 },
    { name: '雪翎', color: 0xcfd8dc }
  ];

  function createUI(engine, world, hooks) {
    const root = Adapter.dom.query('#v3-app') || Adapter.dom.query('body');
    const el = {};
    let currentView = null;
    let nickname = Adapter.storage.get('v3.nickname', '');
    let skinIdx = Adapter.storage.get('v3.skin', 0);

    function buildShell() {
      /* 覆盖层 + 主画布宿主 + HUD */
      const app = Adapter.dom.createEl('div', 'v3-app', root);
      app.innerHTML =
        '<div class="v3-canvas-host" id="v3-canvas-host"></div>' +
        '<canvas id="v3-arrows" class="v3-arrows"></canvas>' +
        '<div class="v3-hud" id="v3-hud" style="display:none">' +
        '  <div class="v3-panel v3-stats">' +
        '    <div class="v3-stat"><span class="v3-stat-label">长度</span><b id="v3-len">0</b></div>' +
        '    <div class="v3-stat"><span class="v3-stat-label">分数</span><b id="v3-score">0</b></div>' +
        '    <div class="v3-stat"><span class="v3-stat-label">击败</span><b id="v3-kills">0</b></div>' +
        '    <div class="v3-stat"><span class="v3-stat-label">存活</span><b id="v3-time">0s</b></div>' +
        '  </div>' +
        '  <div class="v3-panel v3-rank" id="v3-rank"></div>' +
        '  <div class="v3-boost" id="v3-boost" style="display:none">加速中 · 消耗长度</div>' +
        '</div>' +
        '<div class="v3-overlay" id="v3-overlay">' +
        '  <div class="v3-card" id="v3-card"></div>' +
        '</div>';
      document.head.insertAdjacentHTML('beforeend',
        '<style>' + V3.UI.CSS + '</style>');
      el.hud = app.querySelector('#v3-hud');
      el.stats = {
        len: app.querySelector('#v3-len'),
        score: app.querySelector('#v3-score'),
        kills: app.querySelector('#v3-kills'),
        time: app.querySelector('#v3-time'),
        rank: app.querySelector('#v3-rank'),
        boost: app.querySelector('#v3-boost')
      };
      el.arrows = app.querySelector('#v3-arrows');
      el.card = app.querySelector('#v3-card');
      el.overlay = app.querySelector('#v3-overlay');
      el.canvasHost = app.querySelector('#v3-canvas-host');
      return app;
    }

    /* ---------- 视图渲染 ---------- */
    function showMenu() {
      currentView = 'menu';
      el.overlay.style.display = 'flex';
      const sel = skinIdx;
      el.card.innerHTML =
        '<h1 class="v3-title">星域蛇行 <span class="v3-title-sub">ASTRO SNAKE</span></h1>' +
        '<p class="v3-sub">开放竞技场 · 10 条 AI · 连续转向 · 吃食成长</p>' +
        '<div class="v3-field"><label>昵称</label><input id="v3-nick" maxlength="12" value="' + escapeHtml(nickname) + '"></div>' +
        '<div class="v3-field"><label>皮肤</label><div class="v3-skins">' +
        SKINS.map(function (s, i) {
          return '<div class="v3-skin' + (i === sel ? ' v3-skin-on' : '') + '" data-i="' + i + '" style="background:#' + s.color.toString(16).padStart(6, '0') + '"></div>';
        }).join('') + '</div></div>' +
        '<button class="v3-btn v3-btn-primary" id="v3-start">进入竞技场</button>' +
        '<p class="v3-hint">鼠标 / 触屏拖动转向 · 空格或左键加速（消耗长度）</p>';
      const nick = el.card.querySelector('#v3-nick');
      nick.addEventListener('input', function () { nickname = nick.value; Adapter.storage.set('v3.nickname', nickname); });
      el.card.querySelectorAll('.v3-skin').forEach(function (n) {
        n.addEventListener('click', function () {
          skinIdx = parseInt(n.dataset.i, 10);
          Adapter.storage.set('v3.skin', skinIdx);
          el.card.querySelectorAll('.v3-skin').forEach(function (x) { x.classList.remove('v3-skin-on'); });
          n.classList.add('v3-skin-on');
        });
      });
      el.card.querySelector('#v3-start').addEventListener('click', function () {
        nickname = nick.value || '我';
        Adapter.storage.set('v3.nickname', nickname);
        hooks.onStart(nickname, skinIdx, SKINS[skinIdx].color);
      });
    }

    function showHUD() { el.hud.style.display = 'flex'; }

    function hideHUD() { el.hud.style.display = 'none'; }

    function updateHUD(state) {
      el.stats.len.textContent = Math.floor(state.playerLen);
      el.stats.score.textContent = state.playerScore;
      el.stats.kills.textContent = state.kills;
      el.stats.time.textContent = Math.floor(state.aliveTime) + 's';
      el.stats.boost.style.display = state.boosting ? 'block' : 'none';
      /* 排行榜：前 5 + 玩家 */
      const rows = state.ranking.map(function (r, i) {
        return '<div class="v3-rank-row' + (r.isPlayer ? ' v3-rank-me' : '') + '"><span class="v3-rank-no">' + (i + 1) + '</span><span>' + escapeHtml(r.name) + '</span><b>' + Math.floor(r.len) + '</b></div>';
      }).join('');
      el.stats.rank.innerHTML = '<div class="v3-rank-title">实时排行</div>' + rows;
    }

    function showPause() {
      currentView = 'pause';
      el.overlay.style.display = 'flex';
      el.card.innerHTML =
        '<h2 class="v3-card-title">已暂停</h2>' +
        '<button class="v3-btn v3-btn-primary" id="v3-resume">继续游戏</button>' +
        '<button class="v3-btn" id="v3-restart">重新开始</button>' +
        '<button class="v3-btn" id="v3-quit">返回主菜单</button>';
      el.card.querySelector('#v3-resume').addEventListener('click', function () { hooks.onResume(); });
      el.card.querySelector('#v3-restart').addEventListener('click', function () { hooks.onRestart(); });
      el.card.querySelector('#v3-quit').addEventListener('click', function () { hooks.onQuit(); });
    }

    function showGameOver(result) {
      currentView = 'over';
      el.overlay.style.display = 'flex';
      el.hud.style.display = 'none';
      el.card.innerHTML =
        '<h2 class="v3-card-title v3-over-title">游戏结束</h2>' +
        '<div class="v3-over-grid">' +
        '  <div><span>最终分数</span><b>' + result.score + '</b></div>' +
        '  <div><span>最终长度</span><b>' + Math.floor(result.len) + '</b></div>' +
        '  <div><span>存活时间</span><b>' + Math.floor(result.aliveTime) + 's</b></div>' +
        '  <div><span>击败敌蛇</span><b>' + result.kills + '</b></div>' +
        '  <div><span>排名</span><b>' + result.rank + '/' + result.total + '</b></div>' +
        '</div>' +
        '<button class="v3-btn v3-btn-primary" id="v3-replay">再来一局</button>' +
        '<button class="v3-btn" id="v3-over-quit">返回主菜单</button>';
      el.card.querySelector('#v3-replay').addEventListener('click', function () { hooks.onRestart(); });
      el.card.querySelector('#v3-over-quit').addEventListener('click', function () { hooks.onQuit(); });
    }

    /* ---------- 屏幕外食物方向提示（轻量箭头） ---------- */
    function drawArrows(world, camera, renderer) {
      const c = el.arrows;
      if (!c) return;
      const W = renderer.domElement ? renderer.domElement.clientWidth : window.innerWidth;
      const H = renderer.domElement ? renderer.domElement.clientHeight : window.innerHeight;
      if (c.width !== W) c.width = W;
      if (c.height !== H) c.height = H;
      const g = c.getContext('2d');
      g.clearRect(0, 0, W, H);
      const foods = world.foods.foods;
      if (!foods.length || !world.player.alive) return;
      /* 取最近食物 */
      let best = null, bestD = 1e9;
      const pl = world.player;
      for (let i = 0; i < foods.length; i++) {
        const f = foods[i];
        const d = Math.hypot(f.x - pl.pos.x, f.y - pl.pos.y);
        if (d < bestD) { bestD = d; best = f; }
      }
      if (!best || bestD < 16) return;
      const v = new THREE.Vector3(best.x, 0.6, best.y).project(camera);
      if (v.z > 1 || v.z < -1) return;
      const sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
      const pad = 34;
      if (sx > pad && sx < W - pad && sy > pad && sy < H - pad) return;
      const cx = W / 2, cy = H / 2;
      const ang = Math.atan2(sy - cy, sx - cx);
      const ex = Math.max(pad, Math.min(W - pad, sx + Math.cos(ang) * 60));
      const ey = Math.max(pad, Math.min(H - pad, sy + Math.sin(ang) * 60));
      g.save();
      g.translate(ex, ey);
      g.rotate(ang);
      g.fillStyle = 'rgba(255,214,90,0.95)';
      g.shadowColor = 'rgba(255,200,80,0.6)'; g.shadowBlur = 8;
      g.beginPath();
      g.moveTo(14, 0); g.lineTo(-6, -9); g.lineTo(-2, 0); g.lineTo(-6, 9);
      g.closePath(); g.fill();
      g.restore();
    }

    function hideOverlay() { el.overlay.style.display = 'none'; }

    return {
      build: buildShell,
      canvasHost: function () { return el.canvasHost; },
      showMenu: showMenu,
      showHUD: showHUD,
      hideHUD: hideHUD,
      updateHUD: updateHUD,
      showPause: showPause,
      showGameOver: showGameOver,
      hideOverlay: hideOverlay,
      drawArrows: drawArrows,
      overlayEl: function () { return el.overlay; }
    };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  V3.UI = { create: createUI, SKINS: SKINS, escapeHtml: escapeHtml };

  /* ---------- 原创视觉样式（青空渐变 + 羊皮纸 + 描金） ---------- */
  V3.UI.CSS = `
.v3-app{position:fixed;inset:0;overflow:hidden;font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;background:#bfe0ff;}
.v3-canvas-host{position:absolute;inset:0;}
.v3-canvas-host canvas{display:block;width:100%;height:100%;}
.v3-arrows{position:absolute;inset:0;pointer-events:none;z-index:5;}
.v3-hud{position:absolute;inset:0;pointer-events:none;z-index:6;display:flex;justify-content:space-between;align-items:flex-start;padding:14px;}
.v3-panel{pointer-events:auto;background:linear-gradient(160deg,rgba(255,252,243,0.94),rgba(247,241,227,0.92));border:1px solid rgba(217,178,90,0.85);border-radius:14px;box-shadow:0 6px 22px rgba(44,62,95,0.18),inset 0 0 0 1px rgba(255,255,255,0.5);backdrop-filter:blur(6px);}
.v3-stats{display:flex;gap:14px;padding:10px 16px;}
.v3-stat{display:flex;flex-direction:column;align-items:center;min-width:48px;}
.v3-stat-label{font-size:11px;color:#7a6a4a;letter-spacing:2px;}
.v3-stat b{font-size:20px;color:#2c3e5f;line-height:1.25;}
.v3-rank{width:150px;padding:10px 12px;margin-left:auto;}
.v3-rank-title{font-size:11px;color:#7a6a4a;letter-spacing:2px;margin-bottom:6px;text-align:center;}
.v3-rank-row{display:flex;align-items:center;gap:6px;font-size:12px;color:#4a5a72;padding:2px 0;border-bottom:1px dashed rgba(217,178,90,0.35);}
.v3-rank-row:last-child{border-bottom:none;}
.v3-rank-row b{margin-left:auto;color:#2c3e5f;}
.v3-rank-me{background:rgba(217,178,90,0.22);border-radius:6px;}
.v3-rank-no{color:#b8943f;font-weight:700;min-width:16px;}
.v3-boost{position:absolute;bottom:56px;left:50%;transform:translateX(-50%);background:linear-gradient(120deg,#ff8a5c,#ffb03a);color:#fff;font-size:13px;font-weight:700;padding:8px 18px;border-radius:999px;box-shadow:0 4px 14px rgba(255,138,92,0.5);letter-spacing:1px;}
.v3-overlay{position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,rgba(191,224,255,0.35) 0%,rgba(44,62,95,0.55) 100%);}
.v3-card{width:min(400px,88vw);background:linear-gradient(170deg,#fffaf0,#f7f1e3);border:2px solid #d9b25a;border-radius:20px;padding:26px 28px;box-shadow:0 18px 50px rgba(30,45,70,0.35),inset 0 1px 0 rgba(255,255,255,0.7);text-align:center;max-height:88vh;overflow:auto;}
.v3-title{font-size:34px;color:#2c3e5f;margin:0 0 2px;letter-spacing:4px;text-shadow:0 2px 0 rgba(255,255,255,0.6);}
.v3-title-sub{display:block;font-size:12px;color:#b8943f;letter-spacing:6px;margin-bottom:8px;}
.v3-sub{font-size:13px;color:#6a7a90;margin:0 0 18px;}
.v3-card-title{font-size:24px;color:#2c3e5f;margin:0 0 14px;letter-spacing:4px;}
.v3-over-title{color:#b3502a;}
.v3-field{margin:12px 0;text-align:left;}
.v3-field label{display:block;font-size:12px;color:#7a6a4a;letter-spacing:2px;margin-bottom:6px;}
.v3-field input{width:100%;box-sizing:border-box;padding:9px 12px;font-size:15px;border:1px solid #d9b25a;border-radius:10px;background:#fffdf6;color:#2c3e5f;outline:none;}
.v3-field input:focus{border-color:#b8943f;box-shadow:0 0 0 3px rgba(217,178,90,0.25);}
.v3-skins{display:flex;gap:12px;}
.v3-skin{width:38px;height:38px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(44,62,95,0.3);cursor:pointer;transition:transform .15s;}
.v3-skin:hover{transform:scale(1.12);}
.v3-skin-on{border-color:#b8943f;box-shadow:0 0 0 3px rgba(217,178,90,0.5);}
.v3-btn{display:block;width:100%;margin:10px 0 0;padding:12px 16px;font-size:16px;font-weight:700;letter-spacing:2px;border:none;border-radius:12px;cursor:pointer;color:#2c3e5f;background:linear-gradient(170deg,#fffdf0,#f0e6c8);border:1px solid #d9b25a;box-shadow:0 3px 10px rgba(44,62,95,0.15);transition:transform .12s,box-shadow .12s;}
.v3-btn:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(44,62,95,0.22);}
.v3-btn-primary{color:#fff;background:linear-gradient(120deg,#ff9a5c,#ffb03a);border-color:#f09a3e;text-shadow:0 1px 2px rgba(0,0,0,0.15);}
.v3-hint{font-size:12px;color:#8a7a5c;margin:16px 0 0;line-height:1.6;}
.v3-over-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:16px 0;}
.v3-over-grid div{background:rgba(217,178,90,0.14);border-radius:10px;padding:8px 4px;}
.v3-over-grid span{display:block;font-size:11px;color:#7a6a4a;letter-spacing:1px;}
.v3-over-grid b{font-size:18px;color:#2c3e5f;}
@media (max-width:640px){
  .v3-rank{display:none;}
  .v3-stats{gap:8px;padding:8px 12px;}
  .v3-stat{min-width:40px;}
  .v3-stat b{font-size:16px;}
}
`;
})(typeof window !== 'undefined' ? window : globalThis);
