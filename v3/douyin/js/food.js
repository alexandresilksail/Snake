/* ============================================================
 * V3.Food — 食物与能量球系统（对象池 + 方向提示）
 *
 * 食物类型：
 *   normal  — 发光晶体，价值 1
 *   gold    — 金色星晶，价值 3（特殊）
 *   frost   — 寒冰晶，价值 1 且使食者短暂减速（特殊）
 * 能量球（orb）：蛇死亡后掉落，价值 = 死者长度的 40%
 * ============================================================ */
(function (global) {
  'use strict';
  const V3 = global.V3;

  const TYPES = { NORMAL: 'normal', GOLD: 'gold', FROST: 'frost' };
  const MAX_FOOD = 80;          // 食物总量上限（含能量球）
  const GOLD_CHANCE = 0.06;
  const FROST_CHANCE = 0.08;
  const ORB_LEN_RATIO = 0.4;
  const ORB_MAX_VALUE = 12;

  function createFoodSystem(map, rng) {
    const rand = rng || Math.random;
    const foods = [];           // {x,y,type,value,r,id,scale,t}
    const orbs = [];            // {x,y,value,r,id,vx,vy,t}
    let nextId = 1;
    let foodCount = 0;
    let refillEnabled = true;

    function occupiedBy(x, y, minD) {
      // 对所有蛇身做最近距离检查（延迟引用当前世界）
      const snakes = (V3.World && V3.World.current) ? V3.World.current.snakes : [];
      let best = 1e9;
      for (let s = 0; s < snakes.length; s++) {
        const sn = snakes[s];
        if (!sn.alive) continue;
        const body = V3.Snake.sampleBody(sn);
        for (let i = 0; i < body.length; i += 2) {
          const b = body[i];
          const d = Math.hypot(b.x - x, b.y - y);
          if (d < best) best = d;
        }
      }
      return best;
    }

    function spawnFoodAt(x, y, type) {
      const f = { x: x, y: y, type: type || TYPES.NORMAL, value: 1, r: 0.5, id: nextId++, scale: 1, t: rand() * 10, vx: 0, vy: 0 };
      if (f.type === TYPES.GOLD) { f.value = 3; f.r = 0.7; }
      if (f.type === TYPES.FROST) { f.value = 1; f.r = 0.5; }
      foods.push(f);
      return f;
    }

    function spawnFood() {
      if (foodCount >= MAX_FOOD) return null;
      const roll = rand();
      const type = roll < GOLD_CHANCE ? TYPES.GOLD : (roll < GOLD_CHANCE + FROST_CHANCE ? TYPES.FROST : TYPES.NORMAL);
      const p = map.randomFreePoint(function (x, y) { return occupiedBy(x, y, 2.2); }, 2.2, rand);
      const f = spawnFoodAt(p.x, p.y, type);
      foodCount++;
      return f;
    }

    function spawnOrb(x, y, value) {
      const v = Math.min(ORB_MAX_VALUE, Math.max(1, Math.round(value * ORB_LEN_RATIO)));
      const o = { x: x, y: y, value: v, r: 0.62, id: nextId++, vx: (rand() - 0.5) * 1.6, vy: (rand() - 0.5) * 1.6, t: 0 };
      orbs.push(o);
      return o;
    }

    function removeFood(f) {
      const i = foods.indexOf(f);
      if (i >= 0) { foods.splice(i, 1); foodCount--; }
    }
    function removeOrb(o) {
      const i = orbs.indexOf(o);
      if (i >= 0) orbs.splice(i, 1);
    }

    function refill() {
      if (!refillEnabled) return;
      // 保持场上食物数量（能量球占用部分额度）
      const target = Math.min(MAX_FOOD, Math.round(MAX_FOOD * 0.85));
      while (foodCount + orbs.length < target) {
        if (!spawnFood()) break;
      }
    }

    function update(dt) {
      // 能量球缓慢移动与衰减
      for (let i = orbs.length - 1; i >= 0; i--) {
        const o = orbs[i];
        o.t += dt;
        o.x += o.vx * dt; o.y += o.vy * dt;
        o.vx *= (1 - 0.8 * dt); o.vy *= (1 - 0.8 * dt);
        if (o.t > 25) removeOrb(o);   // 25 秒后消失
      }
      // 食物轻微漂移（视觉由渲染层处理）
      for (let i = 0; i < foods.length; i++) {
        foods[i].t += dt;
      }
    }

    function clear() {
      foods.length = 0; orbs.length = 0; foodCount = 0;
    }

    return {
      TYPES: TYPES,
      foods: foods,
      orbs: orbs,
      spawnFood: spawnFood,
      spawnFoodAt: spawnFoodAt,
      spawnOrb: spawnOrb,
      removeFood: removeFood,
      removeOrb: removeOrb,
      refill: refill,
      update: update,
      clear: clear,
      get foodCount() { return foodCount; },
      get refillEnabled() { return refillEnabled; },
      set refillEnabled(v) { refillEnabled = v; }
    };
  }

  V3.Food = { createSystem: createFoodSystem, TYPES: TYPES, MAX_FOOD: MAX_FOOD };
})(typeof window !== 'undefined' ? window : globalThis);
