/* ============================================================
 * V3.Adapter — 平台适配层（隔离输入/存储/音频/生命周期/画布）
 * PC 网页版使用默认 DOM 实现；抖音小游戏提供 wx 实现（douyin/js/adapter.js）
 * 所有模块一律通过 V3.Adapter 访问平台能力，不直接触碰
 * window/document/localStorage/wx 等平台 API。
 * ============================================================ */
(function (global) {
  'use strict';
  const V3 = global.V3 = global.V3 || {};

  /* 平台探测：仅用于加载期选择实现，运行期统一走 V3.Adapter */
  function detectPlatform() {
    try {
      if (typeof wx !== 'undefined' && wx.getSystemInfoSync) return 'douyin';
    } catch (e) { /* noop */ }
    return 'web';
  }

  const platform = detectPlatform();

  const Adapter = {
    platform: platform,

    /* ---- 画布 ---- */
    createCanvas: function () {
      if (platform === 'douyin') {
        // 抖音小游戏：wx.createCanvas 首个调用返回主画布
        const c = wx.createCanvas();
        return c;
      }
      const c = document.createElement('canvas');
      return c;
    },

    /* ---- 视口尺寸 ---- */
    getScreenSize: function () {
      if (platform === 'douyin') {
        const info = wx.getSystemInfoSync();
        return { width: info.windowWidth, height: info.windowHeight, dpr: info.pixelRatio || 1 };
      }
      return {
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: Math.min(window.devicePixelRatio || 1, 2)
      };
    },

    /* ---- 输入 ---- */
    addKeyListener: function (onKey) {
      if (platform === 'douyin') {
        // 抖音：键盘仅开发者工具可用，真实设备走 touch
        if (wx.onKeyDown) wx.onKeyDown(function (e) { onKey({ code: e.keyCode, down: true }); });
        if (wx.onKeyUp) wx.onKeyUp(function (e) { onKey({ code: e.keyCode, down: false }); });
        return function () {};
      }
      const kd = function (e) { onKey({ code: e.code, down: true, original: e }); };
      const ku = function (e) { onKey({ code: e.code, down: false, original: e }); };
      window.addEventListener('keydown', kd, { passive: false });
      window.addEventListener('keyup', ku, { passive: false });
      return function () { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
    },

    addPointerListener: function (onPointer, target) {
      if (platform === 'douyin') {
        const t = function (e) {
          const t0 = e.touches && e.touches[0];
          const x = t0 ? t0.clientX : (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : 0);
          const y = t0 ? t0.clientY : (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : 0);
          onPointer({ type: e.type, x: x, y: y });
        };
        wx.onTouchStart(function (e) { t({ type: 'down', touches: e.touches }); });
        wx.onTouchMove(function (e) { t({ type: 'move', touches: e.touches }); });
        wx.onTouchEnd(function (e) { t({ type: 'up', touches: [] }); });
        return function () {};
      }
      const el = target || window;
      const down = function (e) { onPointer({ type: 'down', x: e.clientX, y: e.clientY, button: e.button, original: e }); };
      const move = function (e) { onPointer({ type: 'move', x: e.clientX, y: e.clientY, original: e }); };
      const up = function (e) { onPointer({ type: 'up', x: e.clientX, y: e.clientY, original: e }); };
      el.addEventListener('mousedown', down);
      el.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
      el.addEventListener('touchstart', function (e) {
        const t0 = e.touches[0]; onPointer({ type: 'down', x: t0.clientX, y: t0.clientY, original: e });
        if (e.cancelable) e.preventDefault();
      }, { passive: false });
      el.addEventListener('touchmove', function (e) {
        const t0 = e.touches[0]; onPointer({ type: 'move', x: t0.clientX, y: t0.clientY, original: e });
        if (e.cancelable) e.preventDefault();
      }, { passive: false });
      el.addEventListener('touchend', function (e) { onPointer({ type: 'up', x: 0, y: 0, original: e }); }, { passive: false });
      return function () {
        el.removeEventListener('mousedown', down);
        el.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
    },

    /* ---- 存储（昵称/皮肤/最高纪录） ---- */
    storage: {
      get: function (key, def) {
        try {
          if (platform === 'douyin') {
            const v = wx.getStorageSync(key);
            return (v === '' || v === undefined || v === null) ? def : v;
          }
          const v = localStorage.getItem(key);
          return v === null ? def : JSON.parse(v);
        } catch (e) { return def; }
      },
      set: function (key, value) {
        try {
          if (platform === 'douyin') { wx.setStorageSync(key, value); return; }
          localStorage.setItem(key, JSON.stringify(value));
        } catch (e) { /* noop */ }
      }
    },

    /* ---- 音频：WebAudio 或 wx 内部音频 ---- */
    createAudioContext: function () {
      if (platform === 'douyin') {
        // 抖音小游戏使用 wx.createInnerAudioContext（外部资源）或
        // WebAudio 需在开发者工具验证。此处暴露接口由 audio.js 按平台处理。
        return { platform: 'douyin' };
      }
      const AC = global.AudioContext || global.webkitAudioContext;
      return AC ? new AC() : null;
    },

    /* ---- 生命周期/主循环 ---- */
    requestFrame: function (cb) {
      if (platform === 'douyin') {
        // 抖音使用 requestAnimationFrame（开发者工具支持）
        const f = global.requestAnimationFrame || function (t) { setTimeout(function () { cb(t); }, 16); };
        return f(cb);
      }
      return global.requestAnimationFrame(cb);
    },
    cancelFrame: function (id) {
      if (platform === 'douyin') { const f = global.cancelAnimationFrame || clearTimeout; f(id); return; }
      global.cancelAnimationFrame(id);
    },
    onShow: function (cb) {
      if (platform === 'douyin') { if (wx.onShow) wx.onShow(cb); return function () {}; }
      window.addEventListener('focus', cb);
      return function () { window.removeEventListener('focus', cb); };
    },
    onHide: function (cb) {
      if (platform === 'douyin') { if (wx.onHide) wx.onHide(cb); return function () {}; }
      window.addEventListener('blur', cb);
      return function () { window.removeEventListener('blur', cb); };
    },

    /* ---- DOM（仅 PC 网页版 UI 使用；抖音版用 wx 原生渲染替代） ---- */
    dom: {
      createEl: function (tag, cls, parent) {
        if (platform === 'douyin') return null; // 抖音版由 douyin/ui.js 提供 wx 渲染
        const el = document.createElement(tag);
        if (cls) el.className = cls;
        if (parent) parent.appendChild(el);
        return el;
      },
      query: function (sel) { return platform === 'douyin' ? null : document.querySelector(sel); }
    },

    /* ---- 日志 ---- */
    log: function () {
      if (global.console && console.log) console.log.apply(console, arguments);
    },
    warn: function () {
      if (global.console && console.warn) console.warn.apply(console, arguments);
    },
    error: function () {
      if (global.console && console.error) console.error.apply(console, arguments);
    }
  };

  V3.Adapter = Adapter;
})(typeof window !== 'undefined' ? window : globalThis);
