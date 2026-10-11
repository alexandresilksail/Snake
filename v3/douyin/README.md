# 星域蛇行 · 抖音小游戏适配版（Snake V3.0 / douyin）

本目录是 PC 网页版（`../index.html`）的**抖音小游戏适配入口**，与网页版共用同一套逻辑模块
（`js/adapter.js`、`core.js`、`map.js`、`snake.js`、`food.js`、`collision.js`、`ai.js`、`world.js`、`renderer.js`、`audio.js`），
**不直接依赖浏览器 DOM / window / localStorage**，平台能力统一经由 `V3.Adapter` 隔离。

## 目录结构

```
douyin/
├── game.json              抖音小游戏配置（横屏）
├── project.config.json    抖音开发者工具项目配置
├── game.js                小游戏入口（polyfill + 模块装载 + CanvasTexture 简化 UI + 触摸输入）
├── three.min.js           Three.js r160 本地副本
└── js/                    共用逻辑模块（与 PC 版同源拷贝）
```

## 已实现的适配

- 触摸转向：以屏幕中心为基准的拖动方向 → 蛇头目标角度（连续转向）
- 双指按下加速（消耗长度，与 PC 版同一规则）
- 左上角触摸暂停 / 左半屏继续 / 右半屏重开
- 开始 / 暂停 / 结束简化 UI（离屏 2D canvas → CanvasTexture 贴到 WebGL 固定相机层）
- 游戏逻辑、AI、碰撞、增长、排行完全复用 PC 版
- 音效：WebAudio 在抖音侧静音（不引入外部音频资源），见"已知问题"

## 如何在抖音开发者工具中运行

1. 打开「抖音开发者工具」（字节跳动小游戏 IDE），选择「小游戏」→「导入项目」。
2. 项目目录选择本目录 `douyin/`，AppID 可先使用测试 AppID（`project.config.json` 中 `appid` 为占位，需替换为你的小游戏 AppID）。
3. 编译预览。控制台无报错即说明 three.js r160 与逻辑模块在抖音运行时加载成功。

## 人工验证步骤（开发工具 / 真机）

以下项目在当前环境**未执行**（本机无抖音开发者工具），需在开发工具与真机上逐项验证：

1. **启动**：编译后应出现 3D 竞技场背景 + 「触摸屏幕任意处开始」菜单，无黑屏、无 JS 异常。
2. **开始与移动**：触摸后进入 PLAYING；拖动手指蛇头应平滑转向；双指按下蛇应加速且长度随时间减少。
3. **吃食增长**：吃一颗普通食物后 HUD「长度 +1、分数 +1」，3D 蛇身增加一段并持续跟随。
4. **碰撞结束**：蛇头撞 AI 身体 → 游戏结束弹层（最终分数/长度/存活/排名）；触摸任意处可重开，重开后状态完全重置。
5. **暂停/继续**：左上角触摸暂停；后台切换（onHide/onShow）自动暂停/恢复。
6. **性能**：真机低端档位（如 2GB 内存机型）连续游玩 10 分钟，观察帧率与内存；必要时在 `renderer.js` 中下调 `MAX_DPR` 或关闭阴影。
7. **多机型**：至少验证 iOS / 安卓各一台（不同分辨率与 DPR 下的 UI 缩放与触摸精度）。

## 已知问题（适配边界）

- **音频**：抖音侧未接 `wx.createInnerAudioContext`，游戏静音。接入方式：在 `js/audio.js` 的 `ensure()` 中为 `platform === 'douyin'` 分支实现音效（或用 WebAudio 在开发者工具中验证真机兼容性）。
- **UI**：抖音版 UI 为 CanvasTexture 简化绘制（无 DOM 排版），按钮热区按屏幕比例固定，未做多分辨率精细化适配。
- **resize**：抖音侧没有窗口 resize 事件，竖屏/横屏切换后画布尺寸以首次 `getSystemInfoSync` 为准（game.json 已锁定横屏）。
- **three.js r160**：未在抖音开发者工具中实际加载验证；如遇 `window/document/self` 相关报错，优先检查 `game.js` 顶部的 polyfill 是否被覆盖，或升级到 `three-platformize` 适配方案。
