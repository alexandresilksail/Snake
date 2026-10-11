#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Snake 增长修复专项测试（P1）
覆盖：经典/竞技吃食 → 身体段数据 + 可见 3D 段 + 分数同步增长；
100 步跟随；连吃 20 一致性；同一食物不重复计分；食物晶体模型无 JS 异常。
自动定位当前仓库 snake_game_3d.html 与当前环境 Chromium。
运行: python3 growth_test.py
"""
import os, sys
from playwright.sync_api import sync_playwright

_BASE = os.path.dirname(os.path.abspath(__file__))
HTML = "file://" + os.path.join(_BASE, "snake_game_3d.html")

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
        print("  ✓ " + name + (" " + detail if detail else ""))
    else:
        FAIL += 1
        print("  ✗ " + name + (" " + detail if detail else ""))

def main():
    launch_kw = dict(headless=True, args=GPU)
    if CHROME: launch_kw["executable_path"] = CHROME
    print("HTML:", HTML, "\nCHROME:", CHROME or "(playwright 默认)")
    with sync_playwright() as p:
        browser = p.chromium.launch(**launch_kw)
        ctx = browser.new_context(viewport={"width":1280,"height":800})
        page = ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.goto(HTML); page.wait_for_timeout(1100)

        # ========== 经典模式 ==========
        print("\n[经典模式 增长链路]")
        r = page.evaluate("""() => {
          startLevel(1); state='test-paused';          // 暂停 rAF 步进，手动步进唯一
          const step = () => { moveTimer = effectiveInterval(); updatePlay(0.016); };
          const h=snake.body[0], d=snake.dir.slice();
          const before={body:snake.body.length, visible:segMeshes.filter(m=>m.visible).length, score};
          food={x:h[0]+d[0], y:h[1]+d[1], type:'normal'};
          step(); step(); updateSnake3D(0,0.016);       // 吃食 + 下一次移动增长生效
          const after={body:snake.body.length, visible:segMeshes.filter(m=>m.visible).length, score};
          return {before, after, head:snake.body[0].slice(), headPathLen:headPath.length};
        }""")
        check("K1 普通食物: 数据长度+1", r["after"]["body"] == r["before"]["body"]+1,
              f"{r['before']['body']}→{r['after']['body']}")
        check("K2 普通食物: 可见3D段+1", r["after"]["visible"] == r["before"]["visible"]+1,
              f"{r['before']['visible']}→{r['after']['visible']}")
        check("K3 普通食物: 分数+1", r["after"]["score"] == r["before"]["score"]+1,
              f"{r['before']['score']}→{r['after']['score']}")

        # 100 步跟随（环绕边界关，手动步进；cellToWorld 返回共享 tmpV 需 clone）
        r = page.evaluate("""() => {
          state='test-paused';
          const step = () => { moveTimer = effectiveInterval(); updatePlay(0.016); };
          const len0 = snake.body.length;
          for(let i=0;i<100;i++){ step(); updateSnake3D(0,0.016); }
          const vis = segMeshes.filter(m=>m.visible).length;
          const headW = cellToWorld(snake.body[0][0], snake.body[0][1]).clone();
          const tailW = cellToWorld(snake.body[snake.body.length-1][0], snake.body[snake.body.length-1][1]).clone();
          return {len0, len:snake.body.length, vis, dist:Math.hypot(headW.x-tailW.x, headW.z-tailW.z),
                  state};
        }""")
        check("K4 100 步后新增段仍存在", r["len"] == r["len0"] and r["vis"] >= r["len0"],
              f"len={r['len']} vis={r['vis']} state={r['state']}")
        check("K5 100 步后身体跟随（头尾距离>0）", r["dist"] > 1.0,
              f"head-tail={r['dist']:.2f} len={r['len']}")

        # 连吃 20（大棋盘 U 形转向避开自撞；解除通关目标，屏蔽随机重生）
        r = page.evaluate("""() => {
          startLevel(3); state='test-paused'; cfg.win=1000;   // L3: 20×15 无墙无障
          window.spawnFood = () => ({x:-9,y:-9,type:'normal'});
          const step = () => { moveTimer = effectiveInterval(); updatePlay(0.016); };
          let dir=[1,0];
          const T={}; T['1,0']=[0,1]; T['0,1']=[-1,0]; T['-1,0']=[0,-1]; T['0,-1']=[1,0];  // 顺时针
          const grow = () => {
            const h=snake.body[0];
            let nx=h[0]+dir[0], ny=h[1]+dir[1];
            let nx2=h[0]+2*dir[0], ny2=h[1]+2*dir[1];   // step×2 需预测两步
            let guard=0;
            while(((nx<0||nx>=gw||ny<0||ny>=gh)||(nx2<0||nx2>=gw||ny2<0||ny2>=gh)) && guard<4){
              dir=T[dir[0]+','+dir[1]]; nx=h[0]+dir[0]; ny=h[1]+dir[1];
              nx2=h[0]+2*dir[0]; ny2=h[1]+2*dir[1]; guard++;
            }
            food={x:nx,y:ny,type:'normal'};
            snake.pending=dir;
            step(); step(); updateSnake3D(0,0.016);
          };
          for(let i=0;i<20;i++) grow();
          return {body:snake.body.length, visible:segMeshes.filter(m=>m.visible).length, score, state};
        }""")
        check("K6 连吃20: 数据/可见段/分数一致", r["body"] == 23 and r["visible"] == 23 and r["score"] == 20,
              f"body={r['body']} visible={r['visible']} score={r['score']} state={r['state']}")

        # 同一食物不重复计分
        r = page.evaluate("""() => {
          startLevel(1); state='test-paused';
          window.spawnFood = () => ({x:-9,y:-9,type:'normal'});
          const step = () => { moveTimer = effectiveInterval(); updatePlay(0.016); };
          const h=snake.body[0], d=snake.dir.slice();
          const s0={score, body:snake.body.length};
          food={x:h[0]+d[0], y:h[1]+d[1], type:'normal'};
          step();
          const s1={score, body:snake.body.length};
          step(); step(); step();
          const s2={score, body:snake.body.length};
          return {s0, s1, s2, food};
        }""")
        check("K7 同一食物只计一次（后续步不再加分）", r["s2"]["score"] == r["s1"]["score"],
              f"score {r['s1']['score']}→{r['s2']['score']}")
        check("K8 食物消失后正常重生", r["food"]["x"] == -9 and r["food"]["y"] == -9, "food respawned")

        # ========== 竞技模式 ==========
        print("\n[竞技模式 增长链路]")
        page.evaluate("arenaQuit(); startArena(); state='test-paused'; ARENA_MAX_FOOD=70; worldFoods=[];")
        r = page.evaluate("""() => {
          const p=playerSnake; p.x=0; p.y=0; p.path=[{x:0,y:0}]; p.len=4; p.score=0;
          worldFoods.push({x:1.5,y:0,r:0.55,gold:false,frost:false,value:1});
          for(let i=0;i<30;i++) updateArenaPlay(0.016);
          updateArena3D(0,0.016);
          return {len:p.len, score:p.score, count:playerBodyInst.count};
        }""")
        check("J1 竞技吃食: len+1", r["len"] == 5, f"4→{r['len']}")
        check("J2 竞技吃食: 分数+1", r["score"] == 1, f"score={r['score']}")
        check("J3 竞技: 3D 可见段同步", r["count"] == r["len"], f"count={r['count']} len={r['len']}")

        r = page.evaluate("""() => {
          const p=playerSnake;
          const len0 = p.len;
          for(let i=0;i<100;i++) updateArenaPlay(0.016);
          updateArena3D(0,0.016);
          const b4 = slitherBodyPoint(p, 3);
          return {len0, len:p.len, count:playerBodyInst.count,
                  tailDist:Math.hypot(b4.x-p.x, b4.y-p.y)};
        }""")
        check("J4 竞技 100 步后段数保持", r["len"] >= r["len0"] and r["count"] == r["len"],
              f"len={r['len']} count={r['count']}")
        check("J5 竞技身体跟随（末段距头≈4×1.2）", abs(r["tailDist"]-4.8) < 0.9,
              f"tailDist={r['tailDist']:.2f}")

        # 连吃 20（冻结 AI + 屏蔽食物回补，排除竞争，只测玩家链路）
        r = page.evaluate("""() => {
          window.arenaRefillFoods = () => {};    // 屏蔽回补随机食物
          aiSnakes.forEach(a=>{a.alive=false; a.respawnIn=1e9;});
          const p=playerSnake; p.x=0; p.y=0; p.path=[{x:0,y:0}]; p.len=4; p.score=0;
          worldFoods=[];
          for(let i=0;i<20;i++) worldFoods.push({x:2+i*1.7, y:0, r:0.55, gold:false, frost:false, value:1});
          for(let i=0;i<400;i++) updateArenaPlay(0.016);
          updateArena3D(0,0.016);
          return {len:p.len, score:p.score, count:playerBodyInst.count, foods:worldFoods.length};
        }""")
        check("J6 竞技连吃20: 长度/分数/可见段一致", r["len"] == 24 and r["score"] == 20 and r["count"] == 24,
              f"len={r['len']} score={r['score']} count={r['count']}")

        # ========== 食物模型 ==========
        print("\n[食物 3D 模型]")
        r = page.evaluate("""() => {
          arenaQuit(); startLevel(1);
          food={x:5,y:5,type:'normal'}; refreshFoodMesh();
          const n = foodCore.children[0].geometry.type;
          food={x:5,y:5,type:'frost'}; refreshFoodMesh();
          const f = foodCore.children[0].geometry.type;
          return {normalGeo:n, frostGeo:f, coreGeo:foodCore.children[1].geometry.type};
        }""")
        check("F1 经典普通食物=八面体晶体", r["normalGeo"] == "OctahedronGeometry", r["normalGeo"])
        check("F2 经典寒冰=六棱冰晶", r["frostGeo"] == "CylinderGeometry", r["frostGeo"])
        check("F3 经典晶体含内部发光核心", r["coreGeo"] == "SphereGeometry", r["coreGeo"])

        page.evaluate("arenaQuit(); startArena(); state='test-paused'; ARENA_MAX_FOOD=70; worldFoods=[];")
        r = page.evaluate("""() => {
          worldFoods.push({x:5,y:5,r:0.55,gold:false,frost:false,value:1});
          worldFoods.push({x:0,y:0,r:0.85,gold:true,frost:false,value:3});
          worldFoods.push({x:-5,y:-5,r:0.55,gold:false,frost:true,value:1});
          updateArena3D(0,0.016);
          return {food:foodInst.count, gold:goldFoodInst.count, frost:frostFoodInst.count,
                  gGeo:goldFoodInst.geometry.type, fGeo:frostFoodInst.geometry.type};
        }""")
        check("F4 竞技三类食物分派正常", r["food"] == 1 and r["gold"] == 1 and r["frost"] == 1,
              f"normal={r['food']} gold={r['gold']} frost={r['frost']}")
        check("F5 黄金=星形/寒冰=冰晶（形状区分）", r["gGeo"] == "ExtrudeGeometry" and r["fGeo"] == "CylinderGeometry",
              f"{r['gGeo']}/{r['fGeo']}")
        bad = [e for e in errs if "WebGL context" not in e]
        check("F6 全程无 JS 异常", len(bad) == 0, str(bad)[:200])

        ctx.close(); browser.close()

    print(f"\n==== 汇总: 通过 {PASS} 项, 失败 {FAIL} 项 ====")
    sys.exit(1 if FAIL else 0)

if __name__ == "__main__":
    main()
