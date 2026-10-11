/* ============================================================
 * V3.Audio — 轻量合成音效（WebAudio 振荡器，无外部音频资源）
 * 吃食/黄金/寒冰/死亡/加速 短促音效，音量受控
 * ============================================================ */
(function (global) {
  'use strict';
  const V3 = global.V3;
  const Adapter = V3.Adapter;

  function createAudio() {
    let ctx = null;
    let enabled = true;
    let master = null;

    function ensure() {
      if (ctx) return ctx;
      ctx = Adapter.createAudioContext();
      if (!ctx) return null;
      if (ctx.platform === 'douyin') return ctx; // 抖音版由 douyin/audio.js 接管
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return ctx;
    }

    /* 用户手势后解锁（浏览器自动播放策略） */
    function unlock() {
      if (!ctx) ensure();
      if (ctx && ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) { /* noop */ } }
    }

    function tone(freq, dur, type, vol, delay, slideTo) {
      if (!enabled) return;
      const c = ensure();
      if (!c || c.platform === 'douyin') return;
      if (c.state !== 'running') return;
      const t0 = c.currentTime + (delay || 0);
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.16, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + dur + 0.03);
    }

    return {
      unlock: unlock,
      setEnabled: function (v) { enabled = v; },
      isEnabled: function () { return enabled; },
      eat: function () { tone(620, 0.09, 'sine', 0.14); tone(880, 0.1, 'sine', 0.1, 0.05); },
      gold: function () { tone(660, 0.12, 'triangle', 0.16); tone(990, 0.14, 'triangle', 0.14, 0.06); tone(1320, 0.16, 'triangle', 0.1, 0.12); },
      frost: function () { tone(300, 0.16, 'sine', 0.13, 0, 150); },
      orb: function () { tone(520, 0.1, 'sine', 0.12); tone(780, 0.12, 'sine', 0.1, 0.05); },
      die: function () { tone(220, 0.3, 'sawtooth', 0.12, 0, 60); tone(110, 0.4, 'sine', 0.14, 0.08, 50); },
      boostOn: function () { tone(320, 0.08, 'square', 0.05, 0, 480); },
      boostOff: function () { tone(420, 0.08, 'square', 0.04, 0, 260); },
      click: function () { tone(480, 0.05, 'sine', 0.08); }
    };
  }

  V3.Audio = { create: createAudio };
})(typeof window !== 'undefined' ? window : globalThis);
