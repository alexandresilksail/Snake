#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Snake V2 单机竞技模式测试 A–H（Playwright Chromium + 真实游戏状态/3D 场景验证）"""
import sys, time, json, os
from playwright.sync_api import sync_playwright

HTML = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'snake_game_3d.html')

def _find_chromium():
    cands = [
        os.environ.get("PLAYWRIGHT_CHROMIUM_PATH", ""),
        '/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome',
        '/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell',
        '/usr/bin/chromium', '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ]
    for c in cands:
        if c and os.path.exists(c):
            return c
    return None

CHROME = _find_chromium()
GPU = ["--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
PASS, FAIL = 0, 0
errors = []

def check(name, cond, detail=''):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ✓ {name} {detail}")
    else:
        FAIL += 1
        print(f"  ✗ {name} {detail}")
        errors.append(name)

JS_BOOT = """
() => {
  window.__t = {errors: []};
  window.addEventListener('error', e => window.__t.errors.push(String(e.message||e.error)));
  return !!window.startArena;
}
"""

JS_HOOKS = """
() => {
  window.__arena = {
    start: () => startArena(),
    state: () => arenaDebugState(),
    bodyCount: () => (playerBodyInst ? playerBodyInst.count : -1),
    aiBodyCount: (i) => (aiBodyInsts[i] ? aiBodyInsts[i].count : -1),
    headPos: () => [playerSnake.x, playerSnake.y, playerSnake.angle],
    bodyPoint: (i) => { const p = slitherBodyPoint(playerSnake, i); return [+p.x.toFixed(4), +p.y.toFixed(4)]; },
    foods: () => worldFoods.length,
    orbs: () => arenaOrbs.length,
    placeFood: (x,y,gold,frost) => { worldFoods.push({x,y,r:gold?0.85:0.55,gold:!!gold,frost:!!frost,value:gold?3:1}); },
    placeOrb: (x,y) => arenaOrbs.push({x,y,r:0.6,value:1,life:30}),
    clearFoods: () => { worldFoods.length = 0; },
    setMaxFood: (n) => { ARENA_MAX_FOOD = n; },
    setPlayer: (x,y,angle,len) => { const p=playerSnake; p.x=x; p.y=y; p.angle=angle; p.len=len; p.score=0; p.boostHold=0; p.path=[{x,y}]; },
    setAI: (i,x,y,angle,len) => { const a=aiSnakes[i]; a.x=x; a.y=y; a.angle=angle; if(len) a.len=len; a.alive=true; a.respawnIn=0; a.score=0; a.boostHold=0; a.path=[{x,y}]; },
    setAIStatic: (i,x,y,angle,len) => {
      const a=aiSnakes[i]; a.x=x; a.y=y; a.angle=angle; a.len=len||4; a.alive=true; a.respawnIn=1e9; a.static=true; a.score=0; a.boostHold=0;
      a.path=[]; for(let k=0;k<20;k++) a.path.push({x:x-Math.cos(angle)*1.2*(19-k), y:y-Math.sin(angle)*1.2*(19-k)});
      rebuildPathCache(a.path);
    },
    aiLen: (i) => (aiSnakes[i] ? aiSnakes[i].len : -1),
    aiAlive: (i) => (aiSnakes[i] ? aiSnakes[i].alive : false),
    killAI: (i) => killSnake(aiSnakes[i]),
    killPlayer: () => killSnake(playerSnake),
    freezeAI: () => aiSnakes.forEach(a=>{ a.alive=false; a.respawnIn=1e9; }),
    unfreezeAI: () => aiSnakes.forEach(a=>{ a.respawnIn=0; }),
    frames: (n) => { for(let i=0;i<n;i++) updateArenaPlay(0.016); },
    oneFrame: () => updateArenaPlay(0.016),
    render3D: () => { if(scene && renderer && camera) renderer.render(scene, camera); },
    stateCode: () => state,
    overScreenShown: () => document.getElementById('screen-arena-over').classList.contains('active'),
    rankFirst: () => { computeRanking(); const f=arenaRankCache[0]; return f? f.name+':'+f.len : 'none'; },
    perf: () => (performance.memory ? performance.memory.usedJSHeapSize : -1),
    frameCost: () => { const t0=performance.now(); for(let i=0;i<200;i++) updateArenaPlay(0.016); return (performance.now()-t0)/200; },
    syncRender: () => { if(!use2D){ updateArena3D(0, 0.016); } },
    pauseLoop: () => { window.__savedState = state; state = 'test-paused'; },
    resumeLoop: () => { state = window.__savedState || 'play'; },
  };
  return true;
}
"""

def run_test(page, name, fn):
    print(f"\n[{name}]")
    try:
        fn(page)
    except Exception as e:
        check(name + ' 执行', False, f'异常: {e}')

def main():
    with sync_playwright() as p:
        launch_kw = dict(headless=True, args=GPU + ["--enable-precise-memory-info"])
        if CHROME: launch_kw["executable_path"] = CHROME
        browser = p.chromium.launch(**launch_kw)
        ctx = browser.new_context(viewport={'width':1280,'height':800})
        page = ctx.new_page()
        page_errors = []
        page.on('pageerror', lambda e: page_errors.append(str(e)))
        page.goto('file://' + HTML)
        page.wait_for_timeout(600)
        assert page.evaluate(JS_BOOT), "startArena 不可用（脚本加载失败）"
        page.evaluate(JS_HOOKS)

        # ---------- A: 吃 1 个食物 → 长度+1 且分数增加 ----------
        def testA(page):
            page.evaluate("__arena.start()")
            page.evaluate("__arena.pauseLoop()")
            page.wait_for_timeout(300)
            L0 = page.evaluate("__arena.state()['playerLen']")
            S0 = page.evaluate("__arena.state()['playerScore']")
            hx, hy, ang = page.evaluate("__arena.headPos()")
            import math
            fx = hx + math.cos(ang)*2.0; fy = hy + math.sin(ang)*2.0
            page.evaluate("__arena.placeFood(%f,%f,false,false)" % (fx,fy))
            page.evaluate("__arena.frames(40)")
            st = page.evaluate("__arena.state()")
            check("A1 长度增长", st['playerLen'] > L0, f"{L0}→{st['playerLen']}")
            check("A2 分数增加", st['playerScore'] > S0, f"{S0}→{st['playerScore']}")
            check("A3 食物回补", page.evaluate("__arena.foods()") == 70, f"foods={page.evaluate('__arena.foods()')}")
            page.evaluate("__arena.syncRender()")
            bc = page.evaluate("__arena.bodyCount()")
            check("A4 3D 实例反映段数", bc == st['playerLen'], f"bodyCount={bc} len={st['playerLen']}")
        run_test(page, "测试A 吃食物增长", testA)

        # ---------- B: 同一食物只计分一次 ----------
        def testB(page):
            page.evaluate("__arena.start()")
            page.evaluate("__arena.pauseLoop()")
            page.evaluate("__arena.setMaxFood(1)")
            page.evaluate("__arena.clearFoods()")
            hx, hy, _ = page.evaluate("__arena.headPos()")
            page.evaluate("__arena.placeFood(%f,%f,false,false)" % (hx, hy))
            page.evaluate("__arena.frames(1)")
            st = page.evaluate("__arena.state()")
            L1, S1 = st['playerLen'], st['playerScore']
            page.evaluate("__arena.oneFrame()")
            st = page.evaluate("__arena.state()")
            check("B1 只触发一次(再跑1帧不重复)", st['playerLen']==L1 and st['playerScore']==S1,
                  f"len={st['playerLen']} score={st['playerScore']}")
            check("B2 食物已移除", page.evaluate("__arena.foods()") == 1, "foods=1(已补)")
        run_test(page, "测试B 同一食物只计一次", testB)

        # ---------- C: 增长后 100 步跟随 ----------
        def testC(page):
            page.evaluate("__arena.start()")
            page.evaluate("__arena.pauseLoop()")
            page.evaluate("__arena.setMaxFood(1)")
            page.evaluate("__arena.clearFoods()")
            page.evaluate("__arena.freezeAI()")
            page.evaluate("__arena.setPlayer(0,0,0,4)")
            page.evaluate("__arena.placeFood(2.2,0,false,false)")
            page.evaluate("__arena.frames(60)")
            st = page.evaluate("__arena.state()")
            L1 = st['playerLen']
            check("C1 吃到食物", L1 == 5, f"len={L1}")
            page.evaluate("__arena.frames(100)")
            st = page.evaluate("__arena.state()")
            check("C2 100 步后新段仍在", st['playerLen'] == L1, f"len={st['playerLen']}")
            hp = page.evaluate("__arena.headPos()")
            bp = page.evaluate("__arena.bodyPoint(4)")
            import math
            d = math.hypot(bp[0]-hp[0], bp[1]-hp[1])
            expect = 5*1.2
            check("C3 末段跟随距离正确", abs(d-expect) < 0.6, f"dist={d:.2f} expect≈{expect}")
            page.evaluate("__arena.syncRender()")
            bc = page.evaluate("__arena.bodyCount()")
            check("C4 3D 段数一致", bc == st['playerLen'], f"bodyCount={bc}")
        run_test(page, "测试C 100步跟随", testC)

        # ---------- D: 连吃 20 个一致性 ----------
        def testD(page):
            page.evaluate("__arena.start()")
            page.evaluate("__arena.pauseLoop()")
            page.evaluate("__arena.setMaxFood(20)")
            page.evaluate("__arena.clearFoods()")
            page.evaluate("__arena.freezeAI()")
            page.evaluate("__arena.setPlayer(-30,0,0,4)")
            for i in range(20):
                page.evaluate("__arena.placeFood(%f,0,false,false)" % (-30 + 2 + i*1.7))
            page.evaluate("__arena.frames(420)")
            st = page.evaluate("__arena.state()")
            check("D2 分数达 20+", st['playerScore'] >= 20, f"score={st['playerScore']}")
            page.evaluate("__arena.syncRender()")
            bc = page.evaluate("__arena.bodyCount()")
            check("D3 3D 实例与长度一致", bc == st['playerLen'], f"bodyCount={bc} len={st['playerLen']}")
            check("D4 食物数守恒", page.evaluate("__arena.foods()") == 20, f"foods={page.evaluate('__arena.foods()')}")
        run_test(page, "测试D 连吃20一致", testD)

        # ---------- E: AI 增长 / AI 死亡掉落 ----------
        def testE(page):
            page.evaluate("__arena.start()")
            page.evaluate("__arena.pauseLoop()")
            page.evaluate("__arena.setMaxFood(70)")
            page.evaluate("__arena.clearFoods()")
            page.evaluate("__arena.freezeAI()")
            page.evaluate("__arena.setAI(0, 0, 0, 0)")
            L0 = page.evaluate("__arena.aiLen(0)")
            page.evaluate("__arena.placeFood(2.2,0,false,false)")
            page.evaluate("__arena.frames(60)")
            L1 = page.evaluate("__arena.aiLen(0)")
            check("E1 AI 吃食物增长", L1 > L0, f"{L0}→{L1}")
            page.evaluate("__arena.syncRender()")
            cb = page.evaluate("__arena.aiBodyCount(0)")
            check("E2 AI 3D 实例反映段数", cb == L1, f"aiBodyCount={cb}")
            ob0 = page.evaluate("__arena.orbs()")
            page.evaluate("__arena.killAI(0)")
            ob1 = page.evaluate("__arena.orbs()")
            check("E3 AI 死亡掉落能量球", ob1 >= ob0 + 3, f"orbs {ob0}→{ob1}")
            check("E4 AI 死亡状态", page.evaluate("__arena.aiAlive(0)") == False)
            # 玩家收集能量球
            page.evaluate("__arena.setPlayer(6,0,0,4)")
            page.evaluate("__arena.placeOrb(7.5,0)")
            Lp0 = page.evaluate("__arena.state()['playerLen']")
            page.evaluate("__arena.frames(30)")
            Lp1 = page.evaluate("__arena.state()['playerLen']")
            check("E5 玩家收集能量球增长", Lp1 > Lp0, f"{Lp0}→{Lp1}")
        run_test(page, "测试E AI增长与掉落", testE)

        # ---------- F: 死亡 → 重开恢复 ----------
        def testF(page):
            page.evaluate("__arena.start()")
            page.evaluate("__arena.setMaxFood(70)")
            page.evaluate("__arena.clearFoods()")
            page.evaluate("__arena.freezeAI()")
            # 玩家朝 +x 直行，AI0 静态蛇身摆在玩家路径上（AI 头在玩家头前 4.8 单位，身体向后延伸）
            page.evaluate("__arena.setAIStatic(0, 4.8, 0, 3.14159, 6)")
            page.evaluate("__arena.setPlayer(0,0,0,4)")
            page.evaluate("__arena.frames(120)")
            st = page.evaluate("__arena.state()")
            check("F1 玩家死亡", st['playerAlive'] == False, f"alive={st['playerAlive']}")
            check("F2 游戏结束状态", page.evaluate("__arena.stateCode()") == 'over', "state=OVER")
            check("F3 结束面板显示", page.evaluate("__arena.overScreenShown()") == True)
            # 重开（同步块内完成，避免 rAF 插帧产生干扰）
            r2 = page.evaluate("""
            () => { startArena(); aiSnakes.forEach(a=>{a.alive=false;a.respawnIn=1e9;}); return arenaDebugState(); }
            """)
            st = r2
            page.evaluate("__arena.syncRender()")
            check("F4 重开后长度重置", st['playerLen'] == 4, f"len={st['playerLen']}")
            check("F5 重开后分数清零", st['playerScore'] == 0, f"score={st['playerScore']}")
            check("F6 重开后食物恢复", page.evaluate("__arena.foods()") == 70, f"foods={page.evaluate('__arena.foods()')}")
            check("F7 重开后能量球清空", page.evaluate("__arena.orbs()") == 0, f"orbs={page.evaluate('__arena.orbs()')}")
            check("F8 重开后玩家存活", st['playerAlive'] == True)
            page.evaluate("__arena.syncRender()")
            bc = page.evaluate("__arena.bodyCount()")
            check("F9 重开后 3D 段数重置", bc == 4, f"bodyCount={bc}")
        run_test(page, "测试F 死亡与重开", testF)

        # ---------- G: 食物生成合法且不死循环 ----------
        def testG(page):
            page.evaluate("__arena.start()")
            page.evaluate("__arena.pauseLoop()")
            ok = page.evaluate("""
            () => {
              let bad = 0;
              for (let t=0;t<300;t++){
                const f = arenaSpawnFood();
                if (Math.hypot(f.x,f.y) > ARENA_R) bad++;
                for (const p of arenaSegPts) { if (Math.hypot(p.x-f.x,p.y-f.y) < 1.2) { bad++; break; } }
                if (f.x===undefined || f.y===undefined) bad++;
              }
              return bad;
            }
            """)
            check("G1 300 次生成全部合法", ok == 0, f"非法次数={ok}")
            # 无空位极端场景：兜底返回且不卡死
            t0 = time.time()
            r = page.evaluate("""
            () => {
              arenaSegPts = [];
              for(let i=0;i<600;i++) arenaSegPts.push({x:(Math.random()-0.5)*76, y:(Math.random()-0.5)*76, r:0.52, s:null});
              const f = arenaSpawnFood();
              return [f.x!==undefined && f.y!==undefined, f.x, f.y];
            }
            """)
            dt = time.time() - t0
            check("G2 无空位时不无限循环", r[0] == True and dt < 1.0, f"耗时{dt:.3f}s")
        run_test(page, "测试G 食物生成合法", testG)

        # ---------- H: 稳定性（模拟 10 分钟 = 37500 帧） ----------
        def testH(page):
            page.evaluate("__arena.start()")
            page.evaluate("__arena.pauseLoop()")
            page.evaluate("__arena.setMaxFood(70)")
            mem0 = page.evaluate("__arena.perf()")
            r = page.evaluate("""
            () => {
              let maxCost = 0, sumCost = 0, n = 0;
              for (let i=0;i<37500;i++){
                const t0 = performance.now();
                updateArenaPlay(0.016);
                const c = performance.now()-t0;
                sumCost += c; n++;
                if (c > maxCost) maxCost = c;
              }
              return [sumCost/n, maxCost];
            }
            """)
            mem1 = page.evaluate("__arena.perf()")
            check("H1 37500 帧无异常", len(page_errors) == 0 and len(page.evaluate("window.__t.errors")) == 0,
                  f"pageErrors={len(page_errors)}")
            check("H2 平均单帧 < 4ms", r[0] < 4, f"avg={r[0]:.3f}ms")
            check("H3 峰值单帧 < 40ms", r[1] < 40, f"max={r[1]:.2f}ms")
            grow = mem1 - mem0
            check("H4 内存增长 < 80MB", grow < 80*1024*1024, f"heap {mem0/1048576:.0f}→{mem1/1048576:.0f}MB (+{grow/1048576:.1f}MB)")
        run_test(page, "测试H 10分钟稳定性", testH)

        # ---------- 经典模式回归冒烟 ----------
        def testClassic(page):
            r = page.evaluate("""
            () => {
              goMenu(); startLevel(1);
              const hx=snake.body[0][0], hy=snake.body[0][1];
              food = {x:hx+1, y:hy, type:'normal'};
              const L0 = snake.body.length, S0 = score;
              for(let i=0;i<120;i++) updatePlay(0.016);
              return [L0, snake.body.length, S0, score, state];
            }
            """)
            check("经典 吃食增长+1", r[1] > r[0], f"len {r[0]}→{r[1]}")
            check("经典 分数+1", r[3] > r[2], f"score {r[2]}→{r[3]}")
        run_test(page, "经典模式冒烟", testClassic)

        browser.close()

    print("\n========== 汇总 ==========")
    print(f"通过 {PASS} 项，失败 {FAIL} 项")
    if errors:
        print("失败项:", "; ".join(errors))
        sys.exit(1)
    print("全部通过")

if __name__ == '__main__':
    main()
