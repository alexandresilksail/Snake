/* ============================================================
 * V3.World — 游戏世界（纯逻辑，零渲染依赖）
 * 负责：蛇移动/AI 决策/碰撞裁决/食物与能量球/计分/状态统计
 * ============================================================ */
(function (global) {
  'use strict';
  const V3 = global.V3;
  const SNAKE = V3.Snake;
  const COLL = V3.Collision;

  function createWorld(opts) {
    const map = V3.Map.createMap({ radius: opts.radius || 72 });
    const foods = V3.Food.createSystem(map, opts.rng);
    const rng = opts.rng || Math.random;

    const player = SNAKE.create({
      id: 'player',
      name: opts.nickname || '我',
      isPlayer: true,
      skin: opts.skin || 0,
      color: opts.playerColor || 0xffb03a,
      x: 0, y: 0,
      angle: 0
    });

    let aiSnakes = [];
    let aliveTime = 0;        // 本局存活秒数
    let killCount = 0;        // 本局击败 AI 数
    let startTime = 0;
    let sessionFoodEaten = 0;

    /* ---------- 更新 ---------- */
    function update(dt) {
      if (!player.alive) return;
      aliveTime += dt;

      /* 1. 玩家移动 */
      SNAKE.move(player, dt);

      /* 2. AI 决策与移动 */
      for (let i = 0; i < aiSnakes.length; i++) {
        const s = aiSnakes[i];
        V3.AI.think(s, world, dt);
        if (s.alive && !s.frozen) SNAKE.move(s, dt);
      }

      /* 3. 吃食（玩家与 AI 共用规则，同一食物只计一次：命中即移除） */
      eatChecks();

      /* 4. 碰撞裁决 */
      resolveCollisions();

      /* 5. 能量球与食物刷新 */
      foods.update(dt);
      foods.refill();

      /* 6. AI 重生计时（think 内处理） */
      for (let i = 0; i < aiSnakes.length; i++) {
        const s = aiSnakes[i];
        if (!s.alive && s.respawnIn <= 0) {
          // think 未触发（如世界暂停），兜底
          s.respawnIn = V3.AI.RESPAWN_TIME;
        }
      }
    }

    /* ---------- 吃食 ---------- */
    function eatChecks() {
      // 玩家
      if (player.alive) {
        const f = COLL.headVsFood(player, foods.foods);
        if (f) { foods.removeFood(f); SNAKE.eat(player, f.value); player.score = player.score || 0; player.score += f.value; sessionFoodEaten++; world.events.emit('eat', { snake: player, food: f }); }
        const o = COLL.headVsOrb(player, foods.orbs);
        if (o) { foods.removeOrb(o); SNAKE.eat(player, o.value); player.score += o.value; sessionFoodEaten++; world.events.emit('eatOrb', { snake: player, orb: o }); }
      }
      // AI
      for (let i = 0; i < aiSnakes.length; i++) {
        const s = aiSnakes[i];
        if (!s.alive || s.frozen) continue;
        const f = COLL.headVsFood(s, foods.foods);
        if (f) { foods.removeFood(f); SNAKE.eat(s, f.value); s.score = (s.score || 0) + f.value; world.events.emit('eat', { snake: s, food: f }); }
        const o = COLL.headVsOrb(s, foods.orbs);
        if (o) { foods.removeOrb(o); SNAKE.eat(s, o.value); s.score = (s.score || 0) + o.value; world.events.emit('eatOrb', { snake: s, orb: o }); }
      }
    }

    /* ---------- 碰撞裁决（统一规则） ---------- */
    function resolveCollisions() {
      const snakes = [player].concat(aiSnakes);
      const grid = COLL.buildGrid(snakes);

      // 边界：出界死亡
      for (let i = 0; i < snakes.length; i++) {
        const s = snakes[i];
        if (s.alive && !map.inBounds(s.pos.x, s.pos.y)) {
          die(s, 'boundary', grid);
        }
      }

      // 头-头 与 头-身体
      for (let i = 0; i < snakes.length; i++) {
        const s = snakes[i];
        if (!s.alive) continue;

        // 自撞
        if (COLL.selfCollision(s)) { die(s, 'self', grid); continue; }

        // 头 vs 其他蛇身体
        const hit = COLL.headVsBodies(s, grid, snakes);
        if (hit) {
          die(s, 'body', grid, hit.other);
          continue;
        }

        // 头-头（与存活蛇）
        for (let j = i + 1; j < snakes.length; j++) {
          const o = snakes[j];
          if (!o.alive) continue;
          if (COLL.headHead(s, o)) {
            die(s, 'head', grid, o);
            die(o, 'head', grid, s);
            break;
          }
        }
      }
    }

    /* 死亡统一处理：停止/掉球/统计 */
    function die(sn, cause, grid, by) {
      if (!sn.alive || sn.disabled) return;
      SNAKE.kill(sn);
      world.events.emit('die', { snake: sn, cause: cause, by: by });

      // 掉落能量球（AI 死亡；玩家死亡不掉球）
      if (!sn.isPlayer) {
        foods.spawnOrb(sn.pos.x, sn.pos.y, sn.len);
        sn.respawnIn = V3.AI.RESPAWN_TIME;
      } else {
        // 玩家死亡 → 游戏结束
        world.events.emit('playerDead', { cause: cause, by: by });
      }

      // 击败统计：对方 AI 被玩家撞死（玩家存活）
      if (by && by.isPlayer && player.alive && !sn.isPlayer && cause === 'body') {
        killCount++;
      }
    }

    /* ---------- 重启 ---------- */
    function reset(nickname, skin, playerColor) {
      // 玩家出生点：与所有 AI 保持安全距离，避免"出生即死"
      const p = map.randomFreePoint(function (x, y) {
        let best = 1e9;
        for (let i = 0; i < aiSnakes.length; i++) {
          const s = aiSnakes[i];
          if (!s.alive) continue;
          const d = Math.hypot(s.pos.x - x, s.pos.y - y) - s.len * 0.55;
          if (d < best) best = d;
        }
        return best;
      }, 5, rng);
      SNAKE.reset(player, { x: p.x, y: p.y, angle: 0 });
      player.name = nickname || '我';
      player.skin = skin || 0;
      player.color = playerColor || 0xffb03a;
      player.score = 0;

      foods.clear();
      // 预生成食物
      for (let i = 0; i < 60; i++) foods.spawnFood();

      // AI 重建（保证全新状态，出生点远离玩家）
      aiSnakes = V3.AI.createAISnakes(world, function (x, y) {
        return Math.hypot(player.pos.x - x, player.pos.y - y);
      }, 6);

      aliveTime = 0;
      killCount = 0;
      sessionFoodEaten = 0;
      startTime = 0;
    }

    function initAI() {
      aiSnakes = V3.AI.createAISnakes(world);
    }

    const world = {
      map: map,
      foods: foods,
      player: player,
      get aiSnakes() { return aiSnakes; },
      get snakes() { return [player].concat(aiSnakes); },
      get aliveTime() { return aliveTime; },
      get killCount() { return killCount; },
      get sessionFoodEaten() { return sessionFoodEaten; },
      update: update,
      reset: reset,
      initAI: initAI,
      events: V3.Core.createEngine({}).bus,   // 复用事件总线
      /* 测试句柄 */
      debugState: function () {
        const aiAlive = aiSnakes.filter(function (s) { return s.alive; }).length;
        return {
          playerLen: player.len,
          playerScore: player.score || 0,
          playerAlive: player.alive,
          playerPos: { x: player.pos.x, y: player.pos.y },
          aiCount: aiSnakes.length,
          aiAlive: aiAlive,
          foods: foods.foods.length,
          orbs: foods.orbs.length,
          aliveTime: aliveTime,
          killCount: killCount
        };
      }
    };

    /* 让 foods 能访问蛇列表（food.js occupiedBy 使用） */
    if (!V3.World) V3.World = { current: world };
    V3.World.current = world;
    return world;
  }

  V3.World = V3.World || {};
  V3.World.create = createWorld;
})(typeof window !== 'undefined' ? window : globalThis);
