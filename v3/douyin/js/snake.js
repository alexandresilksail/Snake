/* ============================================================
 * V3.Snake — 蛇（全新数据结构，零引用旧版）
 *
 * 数据模型：
 *   pos    — 蛇头世界坐标 {x,y}
 *   angle  — 朝向弧度
 *   len    — 长度数值（≈身体段数，含蛇头单位）
 *   path   — 蛇头历史轨迹（世界坐标数组），path[0] 为最新
 *   body   — 渲染/碰撞段（由 path 按 SEG_SPACING 采样派生，非独立存储）
 *
 * 增长规则：eat(grow) → len += grow；path 保留 len*SEG_SPACING 长度
 * 加速规则：boost 时速度×BOOST_MULT，且 len -= BOOST_COST*dt，path 同步裁剪
 * ============================================================ */
(function (global) {
  'use strict';
  const V3 = global.V3;

  const CFG = {
    BASE_SPEED: 6.2,        // 基础移动速度（单位/秒）
    BOOST_MULT: 1.65,       // 加速倍率
    BOOST_COST: 0.55,       // 加速每秒消耗的质量（长度）
    TURN_RATE: 3.4,         // 最大转向速率（弧度/秒）
    HEAD_RADIUS: 0.62,      // 蛇头碰撞半径
    SEG_RADIUS: 0.52,       // 身体段碰撞半径
    SEG_SPACING: 1.15,      // 身体段间距
    START_LEN: 4,           // 初始长度
    START_SPEED_JITTER: 0.9 // AI 初始速度扰动系数（乘在 BASE_SPEED 上）
  };

  function normAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function turnToward(cur, target, maxTurn, dt) {
    const diff = normAngle(target - cur);
    const step = maxTurn * dt;
    if (Math.abs(diff) <= step) return target;
    return cur + (diff > 0 ? step : -step);
  }

  function createSnake(opts) {
    const x = opts.x !== undefined ? opts.x : 0;
    const y = opts.y !== undefined ? opts.y : 0;
    const angle = opts.angle !== undefined ? opts.angle : 0;
    const snake = {
      id: opts.id,
      name: opts.name || 'Snake',
      isPlayer: !!opts.isPlayer,
      skin: opts.skin || 0,
      color: opts.color || 0xff8a4a,

      pos: { x: x, y: y },
      angle: angle,
      targetAngle: angle,
      len: CFG.START_LEN,
      speed: CFG.BASE_SPEED * (opts.speedMul !== undefined ? opts.speedMul : 1),

      path: [],
      boost: false,
      boostTimer: 0,
      alive: true,
      disabled: false,          // 测试/暂停用：完全冻结且不参与碰撞
      respawnIn: 0,
      kills: 0,
      eatCount: 0,
      bornAt: 0,
      frozen: false           // 测试用：冻结 AI 行为
    };

    /* 预填初始路径：向后延伸 START_LEN 段 */
    for (let i = 0; i < Math.ceil(CFG.START_LEN * CFG.SEG_SPACING / 0.18) + 2; i++) {
      snake.path.push({
        x: x - Math.cos(angle) * i * 0.18,
        y: y - Math.sin(angle) * i * 0.18
      });
    }
    snake._speedMul = opts.speedMul !== undefined ? opts.speedMul : 1;

    return snake;
  }

  /* 移动一步：更新蛇头位置与历史路径 */
  function move(snake, dt) {
    if (!snake.alive || snake.frozen) return;
    const mult = snake.boost ? CFG.BOOST_MULT : 1;
    const sp = snake.speed * mult;
    // 转向平滑逼近 targetAngle
    snake.angle = turnToward(snake.angle, snake.targetAngle, CFG.TURN_RATE, dt);
    snake.pos.x += Math.cos(snake.angle) * sp * dt;
    snake.pos.y += Math.sin(snake.angle) * sp * dt;
    snake.path.unshift({ x: snake.pos.x, y: snake.pos.y });
    trimPath(snake);

    if (snake.boost) {
      // 加速消耗质量：长度与可见段同步缩减
      snake.len = Math.max(1.5, snake.len - CFG.BOOST_COST * dt);
      trimPath(snake);
      snake.boostTimer = Math.max(0, snake.boostTimer - dt);
      if (snake.len <= 1.5) snake.boost = false;
    }
  }

  /* 裁剪路径使其承载 len 长度（len 单位 = len*SEG_SPACING 弧长）
     先裁剪到 ≤ 目标弧长，再补足到 ≥ 目标弧长，保证采样段数与 len 严格一致 */
  function trimPath(snake) {
    const maxLen = snake.len * CFG.SEG_SPACING;
    while (snake.path.length > 2 && pathLength(snake.path) > maxLen) {
      snake.path.pop();
    }
    padPath(snake, maxLen);
  }

  /* 路径弧长不足时沿尾部方向补足（minLen 为期望弧长下限） */
  function padPath(snake, minLen) {
    let cur = pathLength(snake.path);
    if (cur >= minLen) return;
    const tail = snake.path[snake.path.length - 1];
    const prev = snake.path.length > 1 ? snake.path[snake.path.length - 2] : null;
    let dx = 0, dy = 0;
    if (prev) { dx = tail.x - prev.x; dy = tail.y - prev.y; }
    else { dx = Math.cos(snake.angle); dy = Math.sin(snake.angle); }
    const L = Math.hypot(dx, dy) || 1;
    dx /= L; dy /= L;
    let guard = 0;
    while (cur < minLen && guard < 200) {
      const last = snake.path[snake.path.length - 1];
      snake.path.push({ x: last.x - dx * 0.18, y: last.y - dy * 0.18 });
      cur += 0.18; guard++;
    }
  }

  function pathLength(path) {
    const n = path.length;
    if (n < 2) return 0;
    let L = 0;
    for (let i = 0; i < n - 1; i++) {
      const a = path[i], b = path[i + 1];
      L += Math.hypot(a.x - b.x, a.y - b.y);
    }
    return L;
  }

  /* 沿路径按弧长采样得到身体段（渲染与碰撞共用，保证数据一致） */
  function sampleBody(snake) {
    const segs = [];
    const spacing = CFG.SEG_SPACING;
    let dist = spacing;
    let i = 0;
    const path = snake.path;
    let cur = path[0];
    let carry = 0;
    let total = 0;
    // 蛇头作为第 0 段
    segs.push({ x: cur.x, y: cur.y, r: CFG.HEAD_RADIUS, head: true });
    let segCount = 1;
    let want = spacing;
    for (let k = 0; k < path.length - 1 && segCount < Math.ceil(snake.len) + 1; k++) {
      const a = path[k], b = path[k + 1];
      const segLen = Math.hypot(a.x - b.x, a.y - b.y);
      let remain = segLen;
      while (remain >= want && segCount < Math.ceil(snake.len) + 1) {
        const t = 1 - want / segLen;
        segs.push({
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          r: CFG.SEG_RADIUS,
          head: false
        });
        segCount++;
        remain -= want;
        want = spacing;
      }
      want -= remain;
      if (want < 0.001) want = spacing;
    }
    return segs;
  }

  /* 吃食物：分数与长度按规则增长（grow 由食物类型决定） */
  function eat(snake, grow) {
    snake.len += grow;
    trimPath(snake);
    snake.eatCount++;
  }

  /* 增长后确保路径弧长恰好 ≥ len*SEG_SPACING（先裁剪，不足则沿尾部方向补足） */
  function extendPathToLen(snake) {
    const need = snake.len * CFG.SEG_SPACING;
    trimPath(snake);
    let cur = pathLength(snake.path);
    if (cur >= need) return;
    const tail = snake.path[snake.path.length - 1];
    const prev = snake.path.length > 1 ? snake.path[snake.path.length - 2] : null;
    let dx = 0, dy = 0;
    if (prev) { dx = tail.x - prev.x; dy = tail.y - prev.y; }
    else { dx = Math.cos(snake.angle); dy = Math.sin(snake.angle); }
    const L = Math.hypot(dx, dy) || 1;
    dx /= L; dy /= L;
    let guard = 0;
    while (cur < need && guard < 120) {
      const last = snake.path[snake.path.length - 1];
      snake.path.push({ x: last.x - dx * 0.18, y: last.y - dy * 0.18 });
      cur += 0.18; guard++;
    }
  }

  function kill(snake) {
    snake.alive = false;
    snake.boost = false;
  }

  function reset(snake, opts) {
    const x = opts.x !== undefined ? opts.x : 0;
    const y = opts.y !== undefined ? opts.y : 0;
    const angle = opts.angle !== undefined ? opts.angle : 0;
    snake.pos = { x: x, y: y };
    snake.angle = angle;
    snake.targetAngle = angle;
    snake.len = CFG.START_LEN;
    snake.path = [];
    for (let i = 0; i < Math.ceil(CFG.START_LEN * CFG.SEG_SPACING / 0.18) + 2; i++) {
      snake.path.push({ x: x - Math.cos(angle) * i * 0.18, y: y - Math.sin(angle) * i * 0.18 });
    }
    snake.boost = false;
    snake.boostTimer = 0;
    snake.alive = true;
    snake.disabled = false;
    snake.respawnIn = 0;
    snake.kills = 0;
    snake.eatCount = 0;
    snake.frozen = false;
  }

  V3.Snake = {
    CFG: CFG,
    create: createSnake,
    move: move,
    sampleBody: sampleBody,
    eat: eat,
    kill: kill,
    reset: reset,
    trimPath: trimPath,
    padPath: padPath,
    extendPathToLen: trimPath,
    turnToward: turnToward,
    normAngle: normAngle,
    pathLength: pathLength
  };
})(typeof window !== 'undefined' ? window : globalThis);
