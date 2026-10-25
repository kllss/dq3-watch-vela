# DQ3 手表版 · REDMI Watch 6（Vela）

> 把《勇者斗恶龙 III》的机制搬到一块 432×514 的手表上。
> 屏幕只有 2 英寸，**没有返回键，右滑会退出应用，没有 canvas，模板不能给事件传参**——这个仓库记录在这些约束下做出来的东西和踩过的坑。

**当前阶段：M1a —— 可安装的最小运行原型。** 假地图、真输入、真存档。

---

## 现在能跑什么

| 功能 | 状态 |
|---|---|
| 标题页（栈底）读存档，显示 `Lv / 地图 / 步数` | 已实现 |
| 11×9 地图、相机跟随与边缘夹取 | 已实现（一张贴图 + 角色文字，不是 99 个格子） |
| 点相邻格移动 / 方向键兜底 | 已实现，**坐标精度待真机验证** |
| 撞墙提示、NPC 对话、手动存档 | 已实现 |
| 游戏中右滑 → 回标题页 → **自动存档** | 已实现 |
| A/B 双槽 + 32 位校验 + 版本号递增 | 已实现 |
| 战斗 / 菜单 / 道具 / 咒文 / 真实数据 | 未实现（M2 起） |

产物：`data/local/dq3-m1.rpk`（包名 `com.klls.dq3watch`），约 26 KB。

---

## 仓库结构

```
docs/                    设计文档（约 6000 行）
  GDD-v0.1.md              游戏设计文档：机制、数据表、里程碑、验收矩阵
  UI-SPEC-v0.1.md          10 个界面的像素级规格（Vela 可用/不可用属性）
  地图移动与手势规避方案.md   相机、点格、手势排除区、G0–G7 实测协议
  构建与模块验证.md          编译器的两个坑 + 给后续开发的 5 条规则
  ROM-数据参考方案.md        ROM 识别、提取顺序、与公开资料的差异修正
  ROM-提取记录-01-怪物与职业.md  首批两张表的逐字段解析
  M0-仓库审计报告.md         对基础探针仓库的审计（能不能直接拿来用）

design/                  纯 HTML 高保真稿，双击即开，无依赖
  ui-mockup.html           10 个界面 1:1 稿 + 网格/结构标注
  map-movement-demo.html   点格步进、相机夹取、手势排除区的可交互演示

game/                    RPK 工程
  src/pages/Title/         栈底页：存档摘要、继续/新游戏、回来即自动存档
  src/pages/Game/          地图、输入、对话、存档按钮
  src/core/                纯 JS：状态、存档、移动/碰撞/相机、假世界数据
  build.mjs                打包 + 哨兵校验（模块没进 bundle 就构建失败）
  test/game.test.mjs       12 项纯逻辑单测，不需要设备

tools/
  map-image.mjs            把地图数据渲染成一张 PNG（构建前自动调用）
  vela-bundle-check.mjs    解包 RPK，在 Node 里跑页面 bundle，几秒查出黑屏
  rom/                     ROM 识别（CRC32/MD5/SHA-1/SHA-256 + SFC 头）与数据提取
```

---

## 快速开始

```bash
# 纯逻辑单测，不需要设备、不需要工具链
node game/test/game.test.mjs

# 打包（需要 aiot-toolkit 2.0.x）
node game/build.mjs
AIOT_TOOLKIT_BIN=/path/to/aiot-toolkit/lib/bin.js node game/build.mjs

# 装之前先做加载检查（几秒，不用模拟器）
node tools/vela-bundle-check.mjs data/local/dq3-m1.rpk
```

安装：用 **AstroBox**（蓝牙 SPP）把 `.rpk` **拖进窗口**，不要点"安装快应用"按钮（它的原生文件框在 2.2.0 上会死锁）。

---

## 三条硬约束（每条都是踩出来的）

### 1. 右滑返回关不掉，所以标题页必须当"栈底"

`followHand: "disable"` 在小米 Vela 上**编译不报错、manifest 原样保留、运行期被忽略**。栈深度 1 右滑直接退出应用，深度 ≥ 2 弹回上一层。

→ 结构只能做成「标题页（栈底）+ 游戏页」：游戏中右滑退回标题而不是闪退，而退回标题的那一刻正好写一次存档。完整实验见平台研究仓库的 [实测记录 01](https://github.com/kllss/redmi-watch-6-vela-input/blob/main/docs/device-results-01-back-swipe.md)。

### 2. 本地 `.js` 模块不能写 `export`

编译产物里模块参数被改名成 `__webpack_exports__`，函数体却还写 `exports.xxx`，运行时 `ReferenceError: exports is not defined` → 页面脚本整体失败 → **黑屏**。

→ core 里的模块全部是"副作用模块"：内部定义函数，挂到 `globalThis.__dq3_*_api`，页面 `import './core/x.js'` 后从 `globalThis` 取。证据与复现步骤见 [`docs/构建与模块验证.md`](docs/构建与模块验证.md)。

### 3. 状态不能放页面里

游戏页被系统 pop 会走 `onDestroy`。所有跨页面状态放 `globalThis` + storage，任何模式都要能从存档重建。

---

## 为什么地图是一张贴图

第一版每走一步重建 9×11=99 个格子、每格还带一个 `<text>`，手表上明显卡。

现在 `tools/map-image.mjs` 在构建前把地图画成一张 540×468 的 PNG（2.6 KB），页面用 `<stack>` 放这张图和「勇」「人」两个文字，靠 `left/top` 平移——走一步只改 4 个数字，节点数从 ~200 降到 3。

---

## 这个仓库不含什么

- **不含 ROM**，也不含任何从 ROM 提取的数据表。`data/` 整个目录在 `.gitignore` 里。
- 不含原版美术、音乐、文本。地图是程序画的色块，文本是原创占位。
- `tools/rom/` 只是哈希识别与结构提取工具；要跑起来得自备合法持有的卡带转储。

---

## 免责声明

个人技术研究与互操作性项目，与 Enix / Square Enix、小米 / Redmi 均无关。
《勇者斗恶龙 III》及其角色、文本、图像版权归原权利人所有。本仓库不提供、不分发 ROM 或任何受版权保护的游戏素材，也不包含绕过授权的技术手段。

## License

- 代码（`game/`、`tools/`）：MIT
- 文档（`docs/`、`design/`、本 README）：CC BY 4.0
- `tools/rom/data/charmap-dq3.json`：来自 [dqutils](https://github.com/ButThouMust/dqutils)，MIT，见同目录 `LICENSE-dqutils.txt`
