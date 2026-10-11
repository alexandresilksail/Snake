/* ============================================================
 * V3.Collision — 统一可测试碰撞系统
 * 逻辑碰撞体：蛇头圆 (HEAD_RADIUS)、身体段圆 (SEG_RADIUS)、食物/能量球圆
 * 空间分区：网格加速长蛇碰撞，避免 O(n²)
 *
 * 规则（权威，与渲染无关）：
 *   玩家头 vs AI 身体段  → 玩家死亡（GAME_OVER）
 *   AI 头 vs 玩家身体段  → AI 死亡，掉落能量球
 *   蛇头 vs 自身身体段   → 自撞死亡
 *   AI 头 vs AI 身体段   → 头方死亡（掉落能量球）
 *   头 vs 头             → 双方死亡（各自掉落）
 *   越出竞技场边界       → 死亡
 * ============================================================ */
(function (global) {
  'use strict';
  const V3 = global.V3;

  const CFG = V3.Snake.CFG;
  const CELL = 6.0;   // 空间分区格子尺寸

  function keyOf(x, y) {
    return ((x / CELL) | 0) + ':' + ((y / CELL) | 0);
  }

  /* 将蛇身体段注册到空间分区 */
  function buildGrid(snakes) {
    const grid = new Map();
    const bodies = [];
    for (let s = 0; s < snakes.length; s++) {
      const sn = snakes[s];
      if (!sn.alive) { bodies.push(null); continue; }
      const body = V3.Snake.sampleBody(sn);
      bodies.push(body);
      for (let i = 0; i < body.length; i++) {
        const b = body[i];
        const k = keyOf(b.x, b.y);
        let cell = grid.get(k);
        if (!cell) { cell = []; grid.set(k, cell); }
        cell.push({ snake: sn, seg: b, index: i });
      }
    }
    return { grid: grid, bodies: bodies };
  }

  /* 单条蛇头与"其他蛇"身体段的碰撞检测，返回命中详情 */
  function headVsBodies(headSnake, grid, snakes) {
    for (let s = 0; s < snakes.length; s++) {
      const other = snakes[s];
      if (other === headSnake || !other.alive || other.disabled) continue;
      const body = V3.Snake.sampleBody(other);
      const rSum = CFG.HEAD_RADIUS + CFG.SEG_RADIUS;
      const rSum2 = rSum * rSum;
      for (let i = 0; i < body.length; i++) {
        const b = body[i];
        if (b.head) continue; // 头-头单独判定
        const dx = headSnake.pos.x - b.x, dy = headSnake.pos.y - b.y;
        if (dx * dx + dy * dy < rSum2) {
          return { other: other, bodyIndex: i };
        }
      }
    }
    return null;
  }

  /* 自身碰撞（头 vs 自身身体段，跳过前 2 段以允许正常转弯） */
  function selfCollision(snake) {
    const body = V3.Snake.sampleBody(snake);
    const rSum = CFG.HEAD_RADIUS + CFG.SEG_RADIUS;
    const rSum2 = rSum * rSum;
    for (let i = 3; i < body.length; i++) {
      const b = body[i];
      const dx = snake.pos.x - b.x, dy = snake.pos.y - b.y;
      if (dx * dx + dy * dy < rSum2) return true;
    }
    return false;
  }

  /* 头-头碰撞 */
  function headHead(a, b) {
    const d = CFG.HEAD_RADIUS * 2;
    return Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y) < d * 0.82;
  }

  /* 头 vs 食物/能量球：返回命中对象 */
  function headVsFood(snake, foods) {
    const rSum = CFG.HEAD_RADIUS + 0.45;
    const rSum2 = rSum * rSum;
    for (let i = 0; i < foods.length; i++) {
      const f = foods[i];
      const dx = snake.pos.x - f.x, dy = snake.pos.y - f.y;
      if (dx * dx + dy * dy < rSum2) return f;
    }
    return null;
  }

  function headVsOrb(snake, orbs) {
    const rSum = CFG.HEAD_RADIUS + 0.5;
    const rSum2 = rSum * rSum;
    for (let i = 0; i < orbs.length; i++) {
      const o = orbs[i];
      const dx = snake.pos.x - o.x, dy = snake.pos.y - o.y;
      if (dx * dx + dy * dy < rSum2) return o;
    }
    return null;
  }

  V3.Collision = {
    buildGrid: buildGrid,
    headVsBodies: headVsBodies,
    selfCollision: selfCollision,
    headHead: headHead,
    headVsFood: headVsFood,
    headVsOrb: headVsOrb
  };
})(typeof window !== 'undefined' ? window : globalThis);
