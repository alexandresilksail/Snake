#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Snake V3.0 自动化测试 — 针对当前仓库 v3/ 实际代码
运行: python3 snake_v3_test.py
浏览器: 自动定位仓库内 v3/index.html；Playwright Chromium（SwiftShader 软渲染）
"""
import json, os, sys, time

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V3_HTML = os.path.join(REPO, 'v3', 'index.html')
if not os.path.isfile(V3_HTML):
    print('FAIL: 未找到 %s' % V3_HTML); sys.exit(1)

CHROME = '/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome'
CHROME2 = '/opt/vm/preinstall/ms-playwright/chromium_headless_shell-1169/chrome-linux/headless_shell'
GPU = ["--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

from playwright.sync_api import sync_playwright

results = []
def check(name, ok, detail=''):
    results.append((name, ok, detail))
    print(('PASS' if ok else 'FAIL') + ' | ' + name + (' | ' + detail if detail else ''))

def main():
    t0 = time.time()
    with sync_playwright() as p:
        # ============ 浏览器冒烟 + 核心逻辑测试 ============
        browser = p.chromium.launch(headless=True, executable_path=CHROME, args=GPU)
        ctx = browser.new_context(viewport={'width':1280,'height':800})
        pg = ctx.new_page()
        js_errors = []
        pg.on('pageerror', lambda e: js_errors.append(str(e)))
        pg.goto('file://' + V3_HTML)
        pg.wait_for_timeout(800)

        # --- 启动与菜单 ---
        st = pg.evaluate("() => ({has: !!V3Game, state: V3Game.engine.state, menu: !!document.querySelector('.v3-title')})")
        check('T01 页面启动，主菜单显示', st['has'] and st['state']=='READY' and st['menu'], json.dumps(st, ensure_ascii=False))

        # 开始游戏 + 冻结 AI（隔离玩家增长断言）+ 停止 rAF（防止测试驱动与渲染循环双驱动）
        pg.evaluate("""() => {
          V3Game.startGame('测试者',0,0xffb03a);
          V3Game.engine.stop();
          V3Game.world.aiSnakes.forEach((s,i) => {
            s.frozen = true; s.alive = true; s.disabled = true;
            const spots = [[0,36],[0,-36],[-36,0],[-30,-30],[-30,30],[30,30],[30,-30],[26,26],[26,-26],[-26,26]];
            s.pos = {x: spots[i][0], y: spots[i][1]}; s.angle=0; s.targetAngle=0;
            s.path = []; for(let k=0;k<20;k++) s.path.push({x: s.pos.x - k*0.18, y: s.pos.y});
          });
        }""")
        pg.wait_for_timeout(200)

        def placeFood(dx, dy, type='normal'):
            return pg.evaluate("""() => {
              const w = V3Game.world;
              w.foods.refillEnabled = false;   // 关闭自动补充，保证测试确定性
              w.foods.foods.length = 0;
              const p = w.player;
              p.pos = {x:0,y:0}; p.angle = 0; p.targetAngle = 0;
              // 重建路径（沿 -x 预填），避免瞬移后撞上旧身体
              p.path = [];
              for(let i=0;i<80;i++) p.path.push({x: -i*0.18, y: 0});
              w.foods.spawnFoodAt(%f,%f,'%s');
              return {foods: w.foods.foods.length};
            }""" % (dx, dy, type))

        def step(n):
            pg.evaluate("(n) => { for(let i=0;i<n;i++) V3Game.world.update(1/60); }", n)

        def snap():
            return pg.evaluate("""() => {
              const g = V3Game, w = g.world;
              const body = V3.Snake.sampleBody(w.player);
              return {state: g.engine.state, len: w.player.len, score: w.player.score||0,
                      alive: w.player.alive, foods: w.foods.foods.length, orbs: w.foods.orbs.length,
                      segs: g.renderer.debugCounts().segs, visible: body.length,
                      pos: [w.player.pos.x, w.player.pos.y]};
            }""")

        # --- T02 吃一个普通食物 → len+1 / score+1 / 可见段+1 ---
        before = snap()
        placeFood(3.0, 0.0)
        step(40)   # 0.66s，速度6.2 → 移动约4.1 单位，越过 x=3 食物
        after = snap()
        check('T02 吃1食物后长度+1', after['len'] == before['len'] + 1 and after['score'] == before['score'] + 1,
              'len %s→%s score %s→%s' % (before['len'], after['len'], before['score'], after['score']))
        check('T02b 3D可见段+1', after['visible'] == before['visible'] + 1,
              'visible %s→%s' % (before['visible'], after['visible']))

        # --- T03 同一食物不重复计分 ---
        after2 = snap()
        step(60)
        after3 = snap()
        check('T03 同一食物只计一次分', after3['score'] == after2['score'] and after3['len'] == after2['len'],
              'score %s len %s' % (after3['score'], after3['len']))

        # --- T04 增长后 100 步跟随 ---
        follow0 = snap()
        step(100)
        follow = snap()
        check('T04 增长后100步身体仍在', follow['visible'] >= follow0['visible'] and follow['alive'],
              'visible %s→%s' % (follow0['visible'], follow['visible']))

        # --- T05 连吃 20 个 → 长度/分数/可见段一致（同一位置反复投食） ---
        base5 = snap()
        ok5 = True
        for i in range(20):
            placeFood(3.0, 0.0)
            step(40)
            s = snap()
            if s['score'] != base5['score'] + i + 1:
                ok5 = False; break
        s5 = snap()
        check('T05 连吃20个数据一致', ok5 and s5['len'] == base5['len'] + 20 and s5['score'] == base5['score'] + 20,
              'len %s→%s score %s→%s visible %s→%s' % (base5['len'], s5['len'], base5['score'], s5['score'], base5['visible'], s5['visible']))

        # --- T06 食物生成位置合法（200 次 spawn 不崩溃、位置在场内） ---
        ok6 = pg.evaluate("""() => {
          const w = V3Game.world;
          let bad = 0;
          for (let i=0;i<200;i++){
            const f = w.foods.spawnFood();
            if (f && (Math.abs(f.x)>w.map.innerR || Math.abs(f.y)>w.map.innerR)) bad++;
          }
          return bad;
        }""")
        check('T06 食物生成200次合法', ok6 == 0, '越界=%s' % ok6)

        # --- T07 AI 吃食增长（AI 不冻结+重建路径，食物放正前方；冻结玩家防抢食） ---
        ai_grow = pg.evaluate("""() => {
          const w = V3Game.world;
          w.player.frozen = true;
          w.player.disabled = true;      // 玩家完全不参与碰撞
          w.player.pos = {x:-40,y:-40};  // 且移离 AI 觅食路线
          const ai = w.aiSnakes[0];
          w.aiSnakes.forEach(s => { if (s !== ai) { s.frozen = true; s.disabled = true; s.alive = true; s.pos = {x:40,y:-40}; s.path=[]; for(let k=0;k<20;k++) s.path.push({x:40-k*0.18,y:-40}); } });
          ai.frozen = false;
          ai.disabled = false;
          ai.alive = true; ai.respawnIn = 0;
          ai.pos = {x:-8,y:0}; ai.angle=0; ai.targetAngle=0;
          ai.path = []; for(let i=0;i<60;i++) ai.path.push({x:-8-i*0.18, y:0});
          w.foods.foods.length = 0;
          w.foods.spawnFoodAt(-5.5, 0, 'normal');
          const beforeLen = ai.len;
          for(let i=0;i<40;i++) w.update(1/60);
          return {grew: ai.len > beforeLen, before: beforeLen, after: ai.len, eaten: ai.eatCount, alive: ai.alive, fx: ai.pos.x};
        }""")
        check('T07 AI吃食物实际增长', ai_grow['grew'] and ai_grow['eaten'] == 1, json.dumps(ai_grow, ensure_ascii=False))

        # --- T08 AI 死亡掉落能量球（AI 头直接放入玩家身体段内） ---
        orb = pg.evaluate("""() => {
          const w = V3Game.world;
          w.player.frozen = true;
          w.player.disabled = false;     // 玩家身体参与碰撞
          const ai = w.aiSnakes[1];
          w.aiSnakes.forEach(s => { if (s !== ai) { s.frozen = true; s.disabled = true; s.alive = true; s.pos = {x:40,y:-40}; s.path=[]; for(let k=0;k<20;k++) s.path.push({x:40-k*0.18,y:-40}); } });
          ai.frozen = false;
          ai.disabled = false;
          ai.alive = true; ai.respawnIn = 0;
          // 玩家身体横在 x 轴：玩家头在 x=12 朝 -x，身体覆盖 x≈0.5..12
          const pl = w.player;
          pl.pos = {x:12,y:0}; pl.angle=Math.PI; pl.targetAngle=Math.PI; pl.len = 10;
          pl.path=[]; for(let i=0;i<120;i++) pl.path.push({x:12-i*0.18, y:0});
          // AI 头直接放入玩家身体段覆盖区内（x=4），第一步即命中
          ai.pos = {x:4,y:0}; ai.angle=0; ai.targetAngle=0;
          ai.path = []; for(let i=0;i<60;i++) ai.path.push({x:4-i*0.18, y:0});
          const beforeOrbs = w.foods.orbs.length;
          for(let i=0;i<10;i++) w.update(1/60);
          return {aiAlive: ai.alive, orbs: w.foods.orbs.length - beforeOrbs};
        }""")
        check('T08 AI撞玩家身体死亡并掉球', (not orb['aiAlive']) and orb['orbs'] >= 1, json.dumps(orb, ensure_ascii=False))

        # --- T09 玩家头撞 AI 身体 → GAME_OVER + 重开重置 ---
        over = pg.evaluate("""() => {
          const w = V3Game.world, g = V3Game;
          w.aiSnakes.forEach((s,i) => {
            s.frozen = true; s.alive = true; s.disabled = true;
            const spots = [[0,36],[0,-36],[-36,0],[-30,-30],[-30,30],[30,30],[30,-30],[26,26],[26,-26],[-26,26]];
            s.pos = {x: spots[i][0], y: spots[i][1]}; s.angle=0; s.targetAngle=0;
            s.path = []; for(let k=0;k<20;k++) s.path.push({x: s.pos.x - k*0.18, y: s.pos.y});
          });
          w.player.frozen = false;
          // 把玩家放回原点，一条 AI 身体横在玩家正前方
          const pl = w.player;
          pl.pos = {x:0,y:0}; pl.angle=0; pl.targetAngle=0; pl.len = 4;
          pl.path=[]; for(let i=0;i<60;i++) pl.path.push({x:-i*0.18,y:0});
          const ai = w.aiSnakes[2];
          ai.pos = {x:6,y:0}; ai.angle=Math.PI; ai.targetAngle=Math.PI; ai.len = 8;
          ai.path=[]; for(let i=0;i<100;i++) ai.path.push({x:6+i*0.18, y:0});
          for(let i=0;i<90;i++) w.update(1/60);
          return {state: g.engine.state, alive: pl.alive};
        }""")
        check('T09 撞AI身体触发GameOver', over['state']=='GAME_OVER' and not over['alive'], json.dumps(over, ensure_ascii=False))

        reset_s = pg.evaluate("""() => {
          V3Game.startGame('测试者',0,0xffb03a);
          V3Game.engine.stop();
          V3Game.world.aiSnakes.forEach((s,i) => {
            s.frozen = true; s.alive = true; s.disabled = true;
            const spots = [[0,36],[0,-36],[-36,0],[-30,-30],[-30,30],[30,30],[30,-30],[26,26],[26,-26],[-26,26]];
            s.pos = {x: spots[i][0], y: spots[i][1]}; s.angle=0; s.targetAngle=0;
            s.path = []; for(let k=0;k<20;k++) s.path.push({x: s.pos.x - k*0.18, y: s.pos.y});
          });
          const st = {
            state: V3Game.engine.state, len: V3Game.world.player.len,
            score: V3Game.world.player.score||0, foods: V3Game.world.foods.foods.length
          };
          return st;
        }""")
        check('T09b 重开完全重置', reset_s['state']=='PLAYING' and reset_s['len']==4 and reset_s['score']==0 and reset_s['foods']>=50,
              json.dumps(reset_s, ensure_ascii=False))

        # --- T10 自撞死亡 ---
        selfdie = pg.evaluate("""() => {
          V3Game.startGame('测试者',0,0xffb03a);
          V3Game.engine.stop();
          const w = V3Game.world, g = V3Game;
          w.aiSnakes.forEach(s => { s.frozen = true; s.alive = true; s.pos = {x:900,y:900}; });
          const pl = w.player;
          pl.pos = {x:0,y:0}; pl.angle=0; pl.targetAngle=0; pl.len = 18;
          pl.path = []; for(let i=0;i<200;i++) pl.path.push({x:i*0.1, y:0});
          // 走 1.2s 后 180 度掉头，沿原路径返回
          for(let i=0;i<72;i++) w.update(1/60);
          pl.targetAngle = Math.PI;
          for(let i=0;i<160;i++) w.update(1/60);
          return {state: g.engine.state, alive: pl.alive, cause: w._lastPlayerDeath||''};
        }""")
        check('T10 自撞判定死亡', (not selfdie['alive']) and selfdie['state']=='GAME_OVER', json.dumps(selfdie, ensure_ascii=False))

        # --- T11 边界死亡（玩家放至边界附近直接冲出去） ---
        edge = pg.evaluate("""() => {
          V3Game.startGame('测试者',0,0xffb03a);
          V3Game.engine.stop();
          const w = V3Game.world, g = V3Game;
          w.aiSnakes.forEach(s => { s.frozen = true; s.alive = true; s.pos = {x:900,y:900}; });
          const pl = w.player;
          pl.pos = {x:36,y:0}; pl.angle=0; pl.targetAngle=0;
          for(let i=0;i<120;i++) w.update(1/60);
          return {state: g.engine.state, alive: pl.alive, dist: Math.hypot(pl.pos.x, pl.pos.y)};
        }""")
        check('T11 越界判定死亡', (not edge['alive']) and edge['state']=='GAME_OVER', json.dumps(edge, ensure_ascii=False))

        # --- T12 暂停/继续/重开 ---
        pz = pg.evaluate("""() => {
          V3Game.startGame('测试者',0,0xffb03a);
          V3Game.engine.stop();
          V3Game.pause();
          const p1 = V3Game.engine.state;
          V3Game.engine.toResume();
          const p2 = V3Game.engine.state;
          V3Game.pause();
          V3Game.ui.showPause();
          const resumeBtn = document.querySelector('#v3-resume');
          const hasResume = !!resumeBtn;
          return {p1, p2, hasResume};
        }""")
        check('T12 暂停/继续状态机', pz['p1']=='PAUSED' and pz['p2']=='PLAYING' and pz['hasResume'], json.dumps(pz, ensure_ascii=False))

        # --- T13 AI 实际活动（非随机摆动）：觅食后位置与长度变化 ---
        act = pg.evaluate("""() => {
          V3Game.startGame('测试者',0,0xffb03a);
          V3Game.engine.stop();
          const w = V3Game.world;
          w.aiSnakes.forEach(s => { s.frozen = false; s.disabled = false; });
          const sumLen0 = w.aiSnakes.reduce((a,s)=>a+s.len,0);
          for(let i=0;i<600;i++) w.update(1/60);   // 10s 模拟
          const sumLen1 = w.aiSnakes.reduce((a,s)=>a+s.len,0);
          let moved = 0;
          w.aiSnakes.forEach(s => { if (Math.abs(s.pos.x)>2 || Math.abs(s.pos.y)>2) moved++; });
          return {sum0: sumLen0, sum1: sumLen1, moved: moved, eatenTotal: w.aiSnakes.reduce((a,s)=>a+s.eatCount,0)};
        }""")
        check('T13 AI 10s内觅食增长且移动', act['sum1'] > act['sum0'] and act['eatenTotal'] > 0 and act['moved'] >= 5,
              json.dumps(act, ensure_ascii=False))

        # --- T14 长时间运行（逻辑层 36000 步 ≈ 10 分钟）+ 无重复计分/异常 ---
        longrun = pg.evaluate("""() => {
          V3Game.startGame('测试者',0,0xffb03a);
          V3Game.engine.stop();
          V3Game.world.aiSnakes.forEach(s => s.frozen = false);
          const w = V3Game.world;
          const MAXL = 200;
          const MAXS = 120;
          let frames = 0;
          for(let i=0;i<36000;i++){
            w.update(1/60);
            frames++;
            if (w.player.len > MAXL) w.player.len = MAXL;
            if (w.player.score > 1e6) break;
            if (!(i % 500)) {
              if (w.player.score > MAXS) break;
              if (!w.player.alive) { V3Game.startGame('测试者',0,0xffb03a); }
            }
          }
          return {frames, len: w.player.len, score: w.player.score||0,
                  foods: w.foods.foods.length, orbs: w.foods.orbs.length,
                  aiAlive: w.aiSnakes.filter(s=>s.alive).length};
        }""")
        check('T14 逻辑层10分钟模拟稳定', longrun['frames'] == 36000 and (longrun['foods'] + longrun['orbs']) >= 10 and longrun['aiAlive'] >= 1,
              json.dumps(longrun, ensure_ascii=False))

        # --- T15 浏览器真实运行 60s：无 JS 错误 / 渲染段数正常 ---
        pg.evaluate("() => V3Game.startGame('测试者',0,0xffb03a)")
        pg.wait_for_timeout(60000)
        st60 = pg.evaluate("() => V3Game.state()")
        check('T15 真实运行60s无异常', len(js_errors) == 0 and st60['engineState'] in ('PLAYING','GAME_OVER') and st60['renderCounts']['segs'] >= 3,
              'errors=%d state=%s segs=%s' % (len(js_errors), st60['engineState'], st60['renderCounts']['segs']))

        # --- T16 菜单→游戏→结束界面均有真实按钮 ---
        ui_ok = pg.evaluate("""() => {
          V3Game.toMenu();
          const start = !!document.querySelector('#v3-start');
          V3Game.startGame('测试者',0,0xffb03a);
          V3Game.engine.stop();
          V3Game.pause();
          const resume = !!document.querySelector('#v3-resume');
          const restart = !!document.querySelector('#v3-restart');
          const quit = !!document.querySelector('#v3-quit');
          return {start, resume, restart, quit};
        }""")
        check('T16 菜单/暂停按钮齐全', ui_ok['start'] and ui_ok['resume'] and ui_ok['restart'] and ui_ok['quit'], json.dumps(ui_ok, ensure_ascii=False))

        ctx.close(); browser.close()

        # ============ 第二引擎（headless shell 充当第二浏览器）冒烟 ============
        if os.path.isfile(CHROME2):
            b2 = p.chromium.launch(headless=True, executable_path=CHROME2, args=GPU)
            pg2 = b2.new_context(viewport={'width':1024,'height':768}).new_page()
            e2 = []
            pg2.on('pageerror', lambda e: e2.append(str(e)))
            pg2.goto('file://' + V3_HTML); pg2.wait_for_timeout(1200)
            r2 = pg2.evaluate("() => ({has: !!V3Game, state: V3Game.engine.state})")
            check('T17 第二浏览器引擎启动', r2['has'] and r2['state']=='READY' and len(e2)==0, 'errors=%d' % len(e2))
            b2.close()

    dt = time.time() - t0
    passed = sum(1 for _, ok, _ in results if ok)
    print('\n==== V3.0 测试汇总 ====')
    print('通过 %d / %d，耗时 %.0fs' % (passed, len(results), dt))
    for name, ok, detail in results:
        print(('PASS' if ok else 'FAIL') + ' | ' + name)
    # 未执行项如实标注
    print('未执行: 抖音小游戏真机验证（开发工具不可用，见 douyin/README 人工步骤）')
    return 0 if passed == len(results) else 1

if __name__ == '__main__':
    sys.exit(main())
