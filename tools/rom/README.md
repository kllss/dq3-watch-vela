# tools/rom

SFC ROM 识别与数据提取工具。**只读 ROM，不修改、不上传。**

## identify.mjs

### 用途

- 计算 CRC32 / MD5 / SHA-1 / SHA-256（原始文件 + 去 copier header 的 ROM）
- 识别 SFC 头：LoROM / HiROM / ExHiROM、标题、ROM 大小、RAM 大小、地区、版本、校验和
- 与本项目锁定的 DQ3 SFC 日版（No-Intro）比对
- 输出人类可读文本或 JSON

### 依赖

- Node.js 18+（当前环境 22.22.2）
- 无第三方依赖

### 用法

```bash
node tools/rom/identify.mjs <rom路径>
node tools/rom/identify.mjs <rom路径> --json
```

示例：

```bash
node tools/rom/identify.mjs data/local/dq3.sfc
```

### 目标 ROM

| 项目 | 值 |
|---|---|
| 游戏 | Dragon Quest III: Soshite Densetsu e... (Japan) |
| 平台 | Super Famicom |
| 卡带容量 | 32 Mbit |
| ROM 大小 | 4,194,304 字节（无 copier header） |
| CRC32 | `13836bd2` |
| MD5 | `7c7c7db73b0608a184cc5e1d73d7695b` |
| SHA-1 | `b711341e4b1022d7645c5313840874aebc01b7b7` |
| SHA-256 | `dcf8fde55cec7095bc8b522820ffac65790a60054555f8665d54265d2ac36d8a` |

> 下载页显示的 `2.25 MB` 通常是 ZIP 体积，不是 `.sfc` 本体。32 Mbit 卡带应为 4,194,304 字节；工具会检查大小并给出警告。

### 退出码

| 码 | 含义 |
|---|---|
| 0 | 与目标 SHA-1 或 SHA-256 匹配 |
| 1 | 不匹配（ROM 可能是别的版本） |
| 2 | 用法错误 / 读文件失败 |

### 输出示例（真实 ROM 未测，以下为假文件）

```
SFC ROM identify
================
file        ...\.tmp-rom-test\fake.sfc
size        1048576 bytes
rom size    1048576 bytes

hashes (headerless ROM)
  crc32     b315b53b
  sha1      f6749dd0ef1c770243b9c0d4edaaaded2ff2738a
  sha256    90cdb3ad5f181148bf70c1d017e3c3514df952ea13dac0510ea53f7f54bd599c

SFC header
  offset    0x7FC0
  title     TEST QUEST III
  map mode  0x20 LoROM
  rom size  1024 KB
  ram size  32 KB
  checksum  0x1234 / complement 0xEDCB (pair ok)
  computed  0x061B (mismatch)

expected (No-Intro, DQ3 SFC Japan)
  crc32     13836bd2
  sha1      b711341e4b1022d7645c5313840874aebc01b7b7

match       NO  (sha1=false sha256=false crc32=false)
```

### 已知限制

- **尚未在真实 DQ3 ROM 上实测**；第一次拿到 ROM 后要跑一遍确认 header 位置。
- SFC 校验和是指示性的；以 SHA-1 为准。
- 只支持 SFC；ZIP 会提示先解压。
- 不检测 IPS/BPS 补丁，只比对最终哈希。
- 不读取/不修改/不上传 ROM。

### 安全

- 不要把 ROM 放进仓库。
- `data/local/` 应加入 `.gitignore`。
- 公开仓库只提交工具与 schema，不提交 ROM 或提取出的原版素材。

## 计划中的工具

| 文件 | 用途 | 状态 |
|---|---|---|
| `extract/monsters.mjs` | 160 条怪物表（名称/数值/抗性/掉落） | **已完成** |
| `extract/classes.mjs` | 9 个职业（经验表/成长/咒文学习） | **已完成** |
| `manifest.mjs` | 数据清单（ROM + 表哈希/条目数） | **已完成** |
| `extract/items.mjs` | 道具/装备/价格 | 未开始 |
| `extract/spells.mjs` | 咒文表 | 未开始 |
| `extract/encounters.mjs` | 遭遇表 | 未开始 |
| `extract/maps.mjs` | 地图拓扑/碰撞 | 未开始 |
| `ram/party.lua` | BizHawk 队伍结构 | 未开始 |
| `ram/flags.lua` | BizHawk flag diff | 未开始 |
| `ram/battle.lua` | BizHawk 伤害采样 | 未开始 |
| `validate.mjs` | 引用完整性 + 计数 | 未开始 |

### 已完成的提取

```bash
# 怪物
node tools/rom/extract/monsters.mjs --print 10
# → data/local/raw/monsters.json

# 职业
node tools/rom/extract/classes.mjs --print 9
# → data/local/raw/classes.json

# 清单
node tools/rom/manifest.mjs
# → data/local/raw/manifest.json
```

实际结果见 `docs/ROM-提取记录-01-怪物与职业.md`。

详细方案见 `docs/ROM-数据参考方案.md`。
