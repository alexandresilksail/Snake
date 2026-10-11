/* ============================================================
 * V3.Main — 装配与启动（输入绑定/规则钩子/排行榜/测试句柄）
 * ============================================================ */
(function (global) {
  'use strict';
  const V3 = global.V3;
  const Adapter = V3.Adapter;

  function boot() {
    /* ---- 核心装配 ---- */
    const engine = V3.Core.createEngine({});
    const world = V3.World.create({ radius: 72 });
    const audio = V3.Audio.create();

    const ui = V3.UI.create(engine, world, {
      onStart: function (nick, skin, color) { startGame(nick, skin, color); },
      onResume: function () { engine.toResume(); ui.hideOverlay(); },
      onRestart: function () { startGame(world.player.name, world.player.skin, world.player.color); },
      onQuit: function () { toMenu(); }
    });
    ui.build();
    const renderer = V3.Renderer.create(ui.canvasHost());

    /* ---- 输入 ---- */
    let pointer = { x: 0, y: 0, active: false, boosting: false };
    const keyState = { boost: false };
    const boostLock = { ptr: false, key: false };

    function setBoost(v) {
      if (world.player.boost === v) return;
      world.player.boost = v;
      if (v) audio.boostOn(); else audio.boostOff();
    }

    function applyBoost() {
      const want = keyState.boost || boostLock.ptr;
      if (want !== world.player.boost) setBoost(want);
    }

    /* 转向：指针相对蛇头的角度 */
    function steerTo(sx, sy) {
      const el = renderer.renderer.domElement;
      const r = el.getBoundingClientRect();
      const nx = sx - r.left, ny = sy - r.top;
      const head = world.player.pos;
      const v = new THREE.Vector3(head.x, 0, head.y).project(renderer.camera);
      const hx = (v.x * 0.5 + 0.5) * r.width, hy = (-v.y * 0.5 + 0.5) * r.height;
      const dx = nx - hx, dy = ny - hy;
      if (Math.hypot(dx, dy) < 8) return;
      world.player.targetAngle = Math.atan2(dy, dx);
    }

    Adapter.addPointerListener(function (e) {
      audio.unlock();
      if (e.type === 'down') {
        pointer.active = true;
        if (e.button === 0 || e.type === 'down') boostLock.ptr = true;
        steerTo(e.x, e.y);
        applyBoost();
      } else if (e.type === 'move') {
        if (pointer.active) steerTo(e.x, e.y);
      } else if (e.type === 'up') {
        pointer.active = false;
        boostLock.ptr = false;
        applyBoost();
      }
    }, renderer.renderer.domElement);

    Adapter.addKeyListener(function (e) {
      audio.unlock();
      if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
        keyState.boost = e.down;
        applyBoost();
      }
      if (e.down && e.code === 'Escape') {
        if (engine.isPlaying()) pause();
      }
    });

    /* ---- 事件钩子 ---- */
    world.events.on('eat', function (ev) {
      if (ev.snake === world.player) {
        audio[ev.food.type === 'gold' ? 'gold' : (ev.food.type === 'frost' ? 'frost' : 'eat')]();
        renderer.burst({ x: ev.food.x, y: 0.4, z: ev.food.y }, ev.food.type === 'gold' ? 0xffc400 : (ev.food.type === 'frost' ? 0x4cc9f0 : 0xff8a5c), 10);
      }
    });
    world.events.on('eatOrb', function (ev) {
      if (ev.snake === world.player) {
        audio.orb();
        renderer.burst({ x: ev.orb.x, y: 0.4, z: ev.orb.y }, 0xffd76a, 12);
      }
    });
    world.events.on('die', function (ev) {
      if (ev.snake === world.player) {
        audio.die();
        renderer.burst({ x: ev.snake.pos.x, y: 0.6, z: ev.snake.pos.y }, 0xff8a5c, 18);
      } else {
        renderer.burst({ x: ev.snake.pos.x, y: 0.6, z: ev.snake.pos.y }, 0x9fd8ff, 14);
      }
    });
    world.events.on('playerDead', function (ev) {
      engine.toGameOver();
      const rank = computeRank();
      ui.showGameOver({
        score: world.player.score || 0,
        len: world.player.len,
        aliveTime: world.aliveTime,
        kills: world.killCount,
        rank: rank,
        total: world.snakes.length
      });
    });

    /* ---- 排行榜 ---- */
    function computeRank() {
      let r = 1;
      const snakes = world.snakes;
      for (let i = 0; i < snakes.length; i++) {
        if (snakes[i] !== world.player && snakes[i].len > world.player.len) r++;
      }
      return r;
    }

    /* ---- 流程控制 ---- */
    function startGame(nick, skin, color) {
      world.reset(nick, skin, color);
      ui.showHUD();
      ui.hideOverlay();
      engine.toPlay();
      audio.click();
    }

    function pause() {
      if (!engine.isPlaying()) return;
      engine.toPause();
      ui.showPause();
      audio.click();
    }

    function toMenu() {
      engine.toReady();
      ui.hideHUD();
      ui.showMenu();
      audio.click();
    }

    /* ---- 主循环 ---- */
    engine.onUpdate(function (dt) {
      if (world.player.alive) {
        // 玩家死亡后停止逻辑（world.update 内部已处理）
      }
      world.update(dt);
      applyBoost();
    });

    const _dt = 1 / 60;
    engine.onRender(function (t) {
      renderer.render(t, world, _dt);
      ui.updateHUD({
        playerLen: world.player.len,
        playerScore: world.player.score || 0,
        kills: world.killCount,
        aliveTime: world.aliveTime,
        boosting: world.player.boost,
        ranking: rankingList()
      });
      ui.drawArrows(world, renderer.camera, renderer.renderer);
    });

    function rankingList() {
      const arr = world.snakes.filter(function (s) { return s.alive; })
        .concat(world.snakes.filter(function (s) { return !s.alive; }))
        .sort(function (a, b) { return b.len - a.len; });
      return arr.slice(0, 6).map(function (s) {
        return { name: s.name, len: s.len, isPlayer: s === world.player };
      });
    }

    /* 后台自动暂停 */
    Adapter.onHide(function () { if (engine.isPlaying()) pause(); });

    /* ---- 启动 ---- */
    ui.showMenu();
    engine.start();

    /* ---- 测试句柄（供 snake_v3_test.py 使用） ---- */
    global.V3Game = {
      engine: engine,
      world: world,
      renderer: renderer,
      ui: ui,
      audio: audio,
      startGame: startGame,
      pause: pause,
      toMenu: toMenu,
      setBoost: setBoost,
      state: function () {
        return {
          engineState: engine.state,
          playerLen: world.player.len,
          playerScore: world.player.score || 0,
          playerAlive: world.player.alive,
          aliveTime: world.aliveTime,
          kills: world.killCount,
          foods: world.foods.foods.length,
          orbs: world.foods.orbs.length,
          aiAlive: world.aiSnakes.filter(function (s) { return s.alive; }).length,
          renderCounts: renderer.debugCounts()
        };
      },
      step: function (n) {
        // 测试用：手动推进固定步
        for (let i = 0; i < n; i++) world.update(1 / 60);
      }
    };
  }

  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
