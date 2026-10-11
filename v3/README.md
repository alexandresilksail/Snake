# Snake V3.0 · 星域蛇行（3D 单机贪吃蛇竞技）

全新 3D 单机 Slither.io 风格贪吃蛇竞技游戏。**独立于旧版**（仓库根目录历史版本仅作备份，不参与运行、不被引用）。

- 开放 3D 竞技场、连续转向、吃食成长、10 条本地 AI、能量掉落、实时排行榜
- 状态机 READY / PLAYING / PAUSED / GAME_OVER，固定时间步，逻辑与渲染分离
- 全部资源本地打包（Three.js r160 本地副本，无外部 CDN / 字体 / 图片）
- PC 网页版先行，抖音小游戏适配入口见 `douyin/`

## 新旧项目说明

| 目录 | 说明 |
| --- | --- |
| `v3/`（本目录） | V3.0 全新代码：`index.html` + `js/`（10 个模块）+ `three.min.js` + `snake_v3_test.py` + `douyin/` |
| 仓库根目录 | 旧版（`snake_game_3d.html` 等）历史备份，**不删除、不参与 V3 运行** |

V3.0 在独立 Git 分支 `v3` 开发，未改动旧版任何文件。

## 快速开始（PC 网页版）

直接用浏览器打开 `v3/index.html`（Chrome / Edge 均可，需 WebGL）：

```bash
cd v3
python3 -m http.server 8000     # 或直接双击 index.html
# 浏览器访问 http://localhost:8000
```

- 操作：鼠标/触屏拖动转向；空格或左键（按住）加速（消耗长度）；Esc 暂停
- 游戏：吃晶体增长，撞 AI 身体死亡，AI 头撞你则 AI 死亡并掉落能量球，收集能量球继续增长

## 自动化测试

```bash
cd v3
python3 snake_v3_test.py
```

测试脚本自动定位 `v3/index.html` 与当前环境可用的 Playwright Chromium（SwiftShader 软渲染），
覆盖：启动/菜单、吃食 +1（长度/分数/可见段同步）、同一食物只计一次、增长后 100 步跟随、
连吃 20 个数据一致、食物生成 200 次合法、AI 吃食增长、AI 撞玩家身体死亡并掉球、
玩家撞 AI 身体 GameOver + 重开完全重置、自撞、越界、暂停/继续、AI 10s 觅食、
逻辑层 10 分钟模拟、真实运行 60s 无 JS 异常、菜单/暂停/结束按钮、第二浏览器引擎启动。
最近一次全量结果：**19 / 19 通过**。

## 抖音小游戏适配

见 `douyin/README.md`。适配层已隔离 wx API，提供 `game.json` / `project.config.json` / `game.js` /
共用逻辑模块拷贝；因本机无抖音开发者工具，**未在开发工具与真机验证**（详见该 README 人工步骤与已知问题）。

## 已知问题

- 抖音侧音频未接入（静音），UI 为 CanvasTexture 简化绘制。
- 低配设备如帧率不足，可在 `js/renderer.js` 调低 DPR 上限或关闭阴影。
- 出生保护已实现（玩家与 AI 保持安全距离），但玩家静止不动时仍可能被 AI 撞死（Slither 类玩法预期行为）。
