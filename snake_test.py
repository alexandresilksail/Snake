# -*- coding: utf-8 -*-
"""贪吃蛇 3D 升级版回归测试
Part A: WebGL 3D 模式全功能（35 项）
Part B: WebGL 禁用 → 2D 兼容模式（验证“点击没反应”修复，12 项）
运行: python3 /tmp/snake_test3.py
"""
import asyncio, sys
from playwright.async_api import async_playwright

HTML  = "file:///home/user/Doubao/chats/38446245978458882/snake_game_3d.html"
CHROME = "/opt/vm/preinstall/ms-playwright/chromium-1169/chrome-linux/chrome"
GPU_ARGS = ["--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
DISABLE_WEBGL = ["--disable-webgl"]

passed, failed = [], []
def check(name, cond, extra=""):
    if cond: passed.append(name)
    else: failed.append((name, extra)); print("  FAIL:", name, extra)

async def st(page, expr):
    return await page.evaluate(expr)

async def new_page(browser, extra_args=()):
    ctx = await browser.new_context(viewport={"width":1280,"height":800})
    page = await ctx.new_page()
    errs = []
    page.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
    page.on("pageerror", lambda e: errs.append(str(e)))
    await page.goto(HTML)
    await page.wait_for_timeout(1300)
    return ctx, page, errs

async def place_food_front(page):
    await page.evaluate("""() => {
      const h = snake.body[0];
      food = {x:h[0]+snake.dir[0], y:h[1]+snake.dir[1], type:'normal'};
    }""")

async def run_3d(browser):
    print("== Part A: WebGL 3D 模式 ==")
    ctx, page, errs = await new_page(browser, GPU_ARGS)
    check("A01 启动无错误屏", await st(page, "!document.getElementById('err-screen').classList.contains('show')"))
    check("A02 Three.js 初始化成功", await st(page, "typeof THREE==='object' && !!renderer && !!scene"))
    check("A03 使用 3D 渲染", await st(page, "use2D===false"))
    check("A04 主菜单可见", await st(page, "document.getElementById('screen-menu').classList.contains('active')"))

    await page.click("#btn-menu-start"); await page.wait_for_timeout(350)
    check("A05 点击开始闯关 → 选关界面", await st(page, "state==='select' && document.getElementById('screen-select').classList.contains('active')"))
    await page.click(".level-card.unlocked >> nth=0"); await page.wait_for_timeout(400)
    check("A05b 点击关卡卡片 → play", await st(page, "state==='play' && currentLevelNumber===1"))
    check("A06 3D 竞技场已构建", await st(page, "!!arenaGroup && arenaGroup.children.length>=4"))
    check("A07 蛇身 3D 网格存在", await st(page, "segMeshes.length===60 && !!headGroup && segMeshes.filter(m=>m.visible).length===snake.body.length"))

    y0 = await st(page, "snake.body[0][1]")
    await page.keyboard.press("ArrowUp"); await page.wait_for_timeout(500)
    y1 = await st(page, "snake.body[0][1]")
    check("A08 方向键↑ 移动", y1 < y0, f"{y0}->{y1}")
    await page.keyboard.press("w"); await page.wait_for_timeout(500)
    y2 = await st(page, "snake.body[0][1]")
    check("A09 WASD(W) 移动", y2 < y1, f"{y1}->{y2}")
    x0 = await st(page, "snake.body[0][0]")
    await page.keyboard.press("ArrowRight"); await page.wait_for_timeout(500)
    x1 = await st(page, "snake.body[0][0]")
    check("A10 方向键→ 移动", x1 > x0, f"{x0}->{x1}")

    s0 = await st(page, "score"); L0 = await st(page, "snake.body.length")
    await page.evaluate("movers=[]; obstacles=[];")
    await place_food_front(page); await page.wait_for_timeout(700)
    s1 = await st(page, "score"); L1 = await st(page, "snake.body.length")
    check("A11 吃食物 +1 分", s1 == s0+1, f"{s0}->{s1}")
    check("A12 吃食物蛇身增长", L1 == L0+1, f"{L0}->{L1}")
    check("A13 蛇头 3D 位置跟随", await st(page, "!!headGroup && Math.abs(headGroup.position.x)<30"))

    await page.keyboard.press("Escape"); await page.wait_for_timeout(250)
    check("A14 Esc 暂停", await st(page, "state==='pause'"))
    check("A15 暂停面板可见", await st(page, "document.getElementById('screen-pause').classList.contains('active')"))
    await page.click("#btn-resume"); await page.wait_for_timeout(250)
    check("A16 继续游戏", await st(page, "state==='play'"))
    await page.click("#btn-pause"); await page.wait_for_timeout(250)
    check("A17 HUD 暂停按钮 → pause", await st(page, "state==='pause'"))
    await page.keyboard.press("p"); await page.wait_for_timeout(250)
    check("A18 P 键继续", await st(page, "state==='play'"))
    await page.keyboard.press("r"); await page.wait_for_timeout(350)
    check("A19 R 键重开本关", await st(page, "state==='play' && score===0"))

    # 通关: 第1关 win=5
    coins0 = await st(page, "save.coins")
    await page.evaluate("score = cfg.win - 1")
    await place_food_front(page); await page.wait_for_timeout(800)
    check("A20 通关进入 WIN", await st(page, "state==='win'"))
    coins1 = await st(page, "save.coins")
    check("A21 通关获得金币", coins1 > coins0, f"{coins0}->{coins1}")
    check("A22 解锁第 2 关", await st(page, "save.unlocked>=2"))

    # 撞墙死亡: 第3关 实体边界
    await st(page, "startLevel(3)")
    await page.wait_for_timeout(300)
    await page.evaluate("""() => {
      snake.body[0] = [gw-1, snake.body[0][1]];
      snake.dir = [1,0]; snake.pending = [1,0];
    }""")
    await page.wait_for_timeout(700)
    check("A23 撞墙进入 OVER", await st(page, "state==='over'"))
    await page.click("#btn-over-retry"); await page.wait_for_timeout(350)
    check("A24 重开按钮 → play", await st(page, "state==='play' && currentLevelNumber===3"))

    # 无限模式
    await st(page, "startLevel(11)")
    await page.wait_for_timeout(400)
    check("A25 无限模式第 11 关", await st(page, "state==='play' && isEndless && currentLevelNumber===11"))
    # 原子操作：读取路障数量并立即清空障碍，防止蛇在后续检查间隙撞死
    mcount = await st(page, "() => { const c = movers.length; obstacles=[]; movers=[]; return c; }")
    check("A26 无限模式有移动路障", mcount>0)
    check("A27 黄金食物生成机制", await st(page, "typeof spawnBonusFood==='function'"))
    await page.wait_for_timeout(150)

    # 黄金食物 +3（确定性：清除障碍并直接放置蛇头前方；禁随机 respawn 防连吃）
    s0 = await st(page, "score")
    await page.evaluate("window.__origSpawnFood = window.spawnFood; window.spawnFood = () => ({x:-9,y:-9,type:'normal'});")
    await page.evaluate("""() => {
      snake.body = [[10,10],[9,10],[8,10]];
      snake.dir = [1,0]; snake.pending = [1,0];
      food = {x:2,y:2,type:'normal'};
      bonusFood = {x:11,y:10,timer:7};
    }""")
    await page.wait_for_timeout(1200)
    s1 = await st(page, "score")
    if s1 != s0+3:
        print("  [A28现场]", await st(page, "({state, score, head:snake.body[0], dir:snake.dir, bonus:bonusFood, grow:snake.grow, moveTimer, interval:600/speed, cell:CELL})"))
    check("A28 黄金食物 +3 分", s1 == s0+3, f"{s0}->{s1}")

    # 商店
    await st(page, "save.coins = 300; persistSave(); goMenu()")
    await page.wait_for_timeout(200)
    await page.click("#btn-menu-shop"); await page.wait_for_timeout(250)
    check("A29 商店打开", await st(page, "state==='shop'"))
    check("A30 皮肤卡片渲染", await st(page, "document.querySelectorAll('.skin-card').length===6"))
    await page.evaluate("document.querySelectorAll('.skin-card')[1].click()")
    await page.wait_for_timeout(250)
    check("A31 购买皮肤生效", await st(page, "save.owned.includes('sky_blue') && save.coins===270"))
    await page.evaluate("document.querySelectorAll('.skin-card')[1].click()")
    await page.wait_for_timeout(200)
    check("A32 切换皮肤", await st(page, "save.skin==='sky_blue'"))
    await page.click("#tab-length"); await page.wait_for_timeout(200)
    check("A33 加长礼包", await st(page, "document.getElementById('shop-length').style.display!=='none'"))

    # 刷新持久化
    await st(page, "persistSave()")
    c = await st(page, "save.coins")
    await page.reload(); await page.wait_for_timeout(1300)
    check("A34 刷新后存档保留", await st(page, "save.coins==="+str(c)), f"want {c}")
    check("A35 刷新后无错误屏", await st(page, "!document.getElementById('err-screen').classList.contains('show')"))
    bad = [e for e in errs if "A WebGL context could not be created" not in e and "THREE.WebGLRenderer" not in e]
    check("A36 全程无 JS 错误", len(bad)==0, str(bad)[:300])

    # 新视觉/音频回归（本轮改造）
    await page.keyboard.press("Enter"); await page.wait_for_timeout(200)  # 刷新后真实手势解锁音频
    await st(page, "startLevel(1)"); await page.wait_for_timeout(400)
    check("A37 蛇头含分叉舌", await st(page, "!!headGroup && !!headGroup.userData && !!headGroup.userData.tongue"))
    check("A38 蛇头部件齐全", await st(page, "headGroup.children.length>=4"))
    check("A39 彩色漂浮光球", await st(page, "!!orbGroup && orbGroup.children.length===6"))
    await page.evaluate("movers=[]; obstacles=[];")
    await place_food_front(page); await page.wait_for_timeout(700)
    check("A40 吃食后尾部闪光(变长可见)", await st(page, "tailPulse>=0 && segMeshes.filter(m=>m.visible).length===snake.body.length"))
    # 音乐：首次点击后解锁
    check("A41 点击后音频解锁并启动音乐", await st(page, "!!audioCtx && musicOn===true"))
    check("A42 静音切换生效", await st(page, "() => { toggleMute(); const m1 = muted && masterGain.gain.value===0; toggleMute(); return m1 && !muted && masterGain.gain.value>0; }"))
    check("A43 静音偏好持久化", await st(page, "() => { setMuted(true); const saved = localStorage.getItem('snake3d_muted'); setMuted(false); return saved==='1'; }"))
    await ctx.close()

async def run_2d(browser):
    print("== Part B: WebGL 禁用 → 2D 兼容模式 ==")
    ctx, page, errs = await new_page(browser, GPU_ARGS + DISABLE_WEBGL)
    check("B01 无 WebGL 不显示错误屏", await st(page, "!document.getElementById('err-screen').classList.contains('show')"))
    check("B02 自动切换 2D 渲染", await st(page, "use2D===true && !!ctx2d"))
    check("B03 主菜单可见可点", await st(page, "document.getElementById('screen-menu').classList.contains('active')"))

    await page.click("#btn-menu-start"); await page.wait_for_timeout(350)
    check("B04 2D 模式点击开始 → 选关界面", await st(page, "state==='select'"))
    await page.click(".level-card.unlocked >> nth=0"); await page.wait_for_timeout(400)
    check("B04b 2D 点击关卡卡片 → play", await st(page, "state==='play' && currentLevelNumber===1"))
    check("B05 2D 画布有绘制内容", await st(page, """() => {
      const c = document.getElementById('cv3d');
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(0,0,c.width,c.height).data;
      let lit = 0;
      for(let i=0;i<d.length;i+=4){ if(d[i]>40||d[i+1]>40||d[i+2]>40) lit++; }
      return lit > 500;
    }"""))

    y0 = await st(page, "snake.body[0][1]")
    await page.keyboard.press("ArrowUp"); await page.wait_for_timeout(500)
    y1 = await st(page, "snake.body[0][1]")
    check("B06 2D 方向键移动", y1 < y0, f"{y0}->{y1}")

    s0 = await st(page, "score"); L0 = await st(page, "snake.body.length")
    # 禁随机 respawn，保证 700ms 内只吃蛇头前方这一颗
    await page.evaluate("window.__origSpawnFood = window.spawnFood; window.spawnFood = () => ({x:-9,y:-9,type:'normal'});")
    await place_food_front(page); await page.wait_for_timeout(700)
    s1 = await st(page, "score"); L1 = await st(page, "snake.body.length")
    check("B07 2D 吃食物 +1 分", s1 == s0+1, f"{s0}->{s1}")
    check("B08 2D 蛇身增长", L1 == L0+1, f"{L0}->{L1}")
    await page.evaluate("window.spawnFood = window.__origSpawnFood;")

    await page.keyboard.press("Escape"); await page.wait_for_timeout(250)
    check("B09 2D Esc 暂停", await st(page, "state==='pause'"))
    await page.click("#btn-resume"); await page.wait_for_timeout(250)
    check("B10 2D 继续游戏", await st(page, "state==='play'"))

    s0 = await st(page, "score")
    await page.evaluate("""() => {
      movers = [];
      food = {x:0,y:gh-1,type:'normal'};
      const h = snake.body[0];
      bonusFood = {x:h[0]+snake.dir[0], y:h[1]+snake.dir[1], timer:7};
    }""")
    await page.wait_for_timeout(700)
    s1 = await st(page, "score")
    check("B11 2D 黄金食物 +3 分", s1 == s0+3, f"{s0}->{s1}")

    await st(page, "startLevel(3)"); await page.wait_for_timeout(300)
    await page.evaluate("""() => {
      snake.body[0] = [gw-1, snake.body[0][1]];
      snake.dir = [1,0]; snake.pending = [1,0];
    }""")
    await page.wait_for_timeout(700)
    check("B12 2D 撞墙死亡 → OVER", await st(page, "state==='over'"))
    await page.click("#btn-over-retry"); await page.wait_for_timeout(350)
    check("B13 2D 重开按钮 → play", await st(page, "state==='play'"))
    bad = [e for e in errs if "A WebGL context could not be created" not in e and "THREE.WebGLRenderer" not in e]
    check("B14 2D 全程无 JS 错误", len(bad)==0, str(bad)[:300])
    await ctx.close()

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=CHROME, args=GPU_ARGS)
        await run_3d(browser)
        await browser.close()
        browser = await p.chromium.launch(executable_path=CHROME, args=GPU_ARGS + DISABLE_WEBGL)
        await run_2d(browser)
        await browser.close()
    print("\n==== 结果 ====")
    print("通过:", len(passed), " 失败:", len(failed))
    for name, extra in failed: print("  FAIL:", name, extra)
    sys.exit(1 if failed else 0)

if __name__ == "__main__":
    asyncio.run(main())
