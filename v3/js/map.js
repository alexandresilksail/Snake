/* ============================================================
 * V3.Map — 开放式 3D 竞技场（原创视觉：环形渐变场地 + 边界光带）
 * 逻辑坐标：以场地中心为原点，世界单位。场地为圆形，半径 R。
 * ============================================================ */
(function (global) {
  'use strict';
  const V3 = global.V3;

  function createMap(opts) {
    const R = opts.radius || 72;         // 竞技场半径
    const innerR = R - 1.2;              // 可活动边界（防出界）
    const borderCount = 36;              // 边界装饰分段数

    function inBounds(x, y) { return Math.sqrt(x * x + y * y) < innerR; }

    /* 随机合法生成点：至少距边界 2，且与给定实体（蛇）保持最小距离 */
    function randomFreePoint(occupied, minDist, rng) {
      const rand = rng || Math.random;
      for (let tries = 0; tries < 40; tries++) {
        const a = rand() * Math.PI * 2;
        const d = (innerR - 2) * Math.sqrt(rand());
        const x = Math.cos(a) * d, y = Math.sin(a) * d;
        if (!occupied || occupied(x, y) < minDist) return { x: x, y: y };
      }
      // 兜底：中心区域
      const a2 = rand() * Math.PI * 2, d2 = 4 + rand() * 8;
      return { x: Math.cos(a2) * d2, y: Math.sin(a2) * d2 };
    }

    return {
      R: R,
      innerR: innerR,
      borderCount: borderCount,
      inBounds: inBounds,
      randomFreePoint: randomFreePoint,
      /* 边界距离：<0 表示已越界 */
      distToBorder: function (x, y) { return innerR - Math.sqrt(x * x + y * y); }
    };
  }

  V3.Map = { createMap: createMap };
})(typeof window !== 'undefined' ? window : globalThis);
