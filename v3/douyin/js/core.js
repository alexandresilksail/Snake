/* ============================================================
 * V3.Core — 游戏状态机 + 固定时间步主循环 + 事件总线
 * 状态: READY / PLAYING / PAUSED / GAME_OVER，集中管理，单一权威
 * ============================================================ */
(function (global) {
  'use strict';
  const V3 = global.V3;

  const STATES = { READY: 'READY', PLAYING: 'PLAYING', PAUSED: 'PAUSED', GAME_OVER: 'GAME_OVER' };

  /* 事件总线：模块间解耦通信 */
  function createBus() {
    const handlers = {};
    return {
      on: function (ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return this; },
      off: function (ev, fn) {
        const h = handlers[ev]; if (!h) return;
        const i = h.indexOf(fn); if (i >= 0) h.splice(i, 1);
      },
      emit: function (ev, payload) {
        const h = handlers[ev]; if (!h) return;
        for (let i = 0; i < h.length; i++) { try { h[i](payload); } catch (e) { V3.Adapter.error('[bus:' + ev + ']', e); } }
      }
    };
  }

  function createEngine(opts) {
    const bus = createBus();
    const FIXED_STEP = opts.fixedStep || 1 / 60;
    const MAX_FRAME_STEPS = opts.maxFrameSteps || 5;

    let state = STATES.READY;
    let acc = 0;
    let lastTime = 0;
    let rafId = 0;
    let running = false;

    const listeners = {
      update: null,   // (dt) -> 固定步逻辑更新
      render: null    // (t, alpha) -> 渲染（alpha 插值可选）
    };

    function setState(s) {
      if (state === s) return;
      const prev = state;
      state = s;
      bus.emit('state', { from: prev, to: s });
    }

    function frame(t) {
      rafId = V3.Adapter.requestFrame(frame);
      if (!running) return;
      if (!lastTime) { lastTime = t; return; }
      let dt = (t - lastTime) / 1000;
      lastTime = t;
      if (dt > 0.25) dt = 0.25;            // 后台切回防螺旋

      if (state === STATES.PLAYING && listeners.update) {
        acc += dt;
        let n = 0;
        while (acc >= FIXED_STEP && n < MAX_FRAME_STEPS) {
          listeners.update(FIXED_STEP);
          acc -= FIXED_STEP;
          n++;
        }
        if (n === MAX_FRAME_STEPS) acc = 0;  // 掉帧时丢弃积压
      } else {
        acc = 0;
      }
      if (listeners.render) listeners.render(t / 1000, acc / FIXED_STEP);
    }

    const engine = {
      STATES: STATES,
      bus: bus,
      get state() { return state; },

      onUpdate: function (fn) { listeners.update = fn; },
      onRender: function (fn) { listeners.render = fn; },

      start: function () { running = true; lastTime = 0; rafId = V3.Adapter.requestFrame(frame); },
      stop: function () { running = false; V3.Adapter.cancelFrame(rafId); },

      toReady: function () { setState(STATES.READY); },
      toPlay: function () { setState(STATES.PLAYING); },
      toPause: function () { setState(STATES.PAUSED); },
      toResume: function () { if (state === STATES.PAUSED) setState(STATES.PLAYING); },
      toGameOver: function () { setState(STATES.GAME_OVER); },

      isPlaying: function () { return state === STATES.PLAYING; },
      isPaused: function () { return state === STATES.PAUSED; },
      isGameOver: function () { return state === STATES.GAME_OVER; },
      isReady: function () { return state === STATES.READY; }
    };

    return engine;
  }

  V3.Core = { createEngine: createEngine, STATES: STATES };
})(typeof window !== 'undefined' ? window : globalThis);
