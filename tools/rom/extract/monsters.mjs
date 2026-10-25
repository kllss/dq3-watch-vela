#!/usr/bin/env node
/**
 * monsters.mjs — 从 DQ3 SFC 日版 ROM 提取怪物表
 *
 * 数据来源（Datacrystal / ROM map）：
 *   - 表地址：$C20000（HiROM 文件偏移 0x020000）
 *   - 记录长度：$25（37）字节
 *   - 记录数：文档写 $A1（161），实测第 161 条是填充/越界；有效 0..159
 *   - 名称：$FECFB7 字符串表（958 条，0xAC 结尾），索引在记录 $00-$01
 *   - 掉落概率表：$C2AA34（8 个 u16le 阈值，分母 1024）
 *
 * 依赖：Node.js 18+；字符映射 tools/rom/data/charmap-dq3.json
 * 用法：
 *   node tools/rom/extract/monsters.mjs [rom路径] [--out 输出路径] [--print N]
 *
 * 注意：
 *   - 只读 ROM；不修改、不上传。
 *   - 输出的是派生数据；是否公开/打包由项目策略决定。
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../../..')

const DEFAULT_ROM = path.join(ROOT, 'data/local/Dragon Quest III - Soshite Densetsu e... (Japan).sfc')
const DEFAULT_OUT = path.join(ROOT, 'data/local/raw/monsters.json')
const CHARMAP_PATH = path.join(ROOT, 'tools/rom/data/charmap-dq3.json')

const MON = {
  base: 0x020000,
  size: 0x25,
  count: 160,
  documentedCount: 0xA1
}

const STR = {
  base: 0x3ECFB7, // $FECFB7 & 0x3FFFFF
  count: 0x03BE,
  delimiter: 0xAC
}

const DROP = {
  base: 0x02AA34,
  count: 8,
  denominator: 1024
}

const RESISTANCE_KEYS = [
  'fire', 'ice', 'wind', 'zap', 'whack', 'kamikazee', 'light',
  'dazzle', 'sleep', 'drain', 'fizzle', 'fuddle', 'sap', 'decelerate'
]

function u16(rom, off) {
  return rom[off] | (rom[off + 1] << 8)
}

function readStrings(rom, charmap) {
  const out = []
  let off = STR.base
  for (let i = 0; i < STR.count; i++) {
    const bytes = []
    while (off < rom.length) {
      const b = rom[off++]
      if (b === STR.delimiter) break
      bytes.push(b)
    }
    out.push(bytes.map(b => charmap[String(b)] ?? `{${b.toString(16).padStart(2, '0')}}`).join(''))
  }
  return out
}

function readDropTable(rom) {
  const table = []
  for (let i = 0; i < DROP.count; i++) {
    const threshold = u16(rom, DROP.base + i * 2)
    table.push({
      index: i,
      threshold,
      p: threshold / DROP.denominator
    })
  }
  return table
}

function readCommands(rom, o) {
  return [
    u16(rom, o + 0x0e) & 0x01ff,
    (u16(rom, o + 0x0f) & 0x03fe) >> 1,
    (u16(rom, o + 0x10) & 0x07fc) >> 2,
    (u16(rom, o + 0x11) & 0x0ff8) >> 3,
    (u16(rom, o + 0x12) & 0x1ff0) >> 4,
    (u16(rom, o + 0x13) & 0x3fe0) >> 5,
    (u16(rom, o + 0x14) & 0x7fc0) >> 6,
    (u16(rom, o + 0x15) & 0xff80) >> 7
  ]
}

function readAnimations(rom, o) {
  return [
    rom[o + 0x18] & 0x0f,
    (rom[o + 0x18] & 0xf0) >> 4,
    rom[o + 0x19] & 0x0f,
    (rom[o + 0x19] & 0xf0) >> 4,
    rom[o + 0x1a] & 0x0f,
    (rom[o + 0x1a] & 0xf0) >> 4,
    rom[o + 0x1b] & 0x0f,
    (rom[o + 0x1b] & 0xf0) >> 4
  ]
}

function readResistances(rom, o) {
  const b1e = rom[o + 0x1e]
  const b1f = rom[o + 0x1f]
  const b20 = rom[o + 0x20]
  const b21 = rom[o + 0x21]
  return [
    (b1e >> 4) & 3,
    (b1e >> 6) & 3,
    b1f & 3,
    (b1f >> 2) & 3,
    (b1f >> 4) & 3,
    (b1f >> 6) & 3,
    b20 & 3,
    (b20 >> 2) & 3,
    (b20 >> 4) & 3,
    (b20 >> 6) & 3,
    b21 & 3,
    (b21 >> 2) & 3,
    (b21 >> 4) & 3,
    (b21 >> 6) & 3
  ]
}

function parseMonster(rom, strings, dropTable, id) {
  const o = MON.base + id * MON.size
  const nameIndex = u16(rom, o)
  const b02 = rom[o + 0x02]
  const b1c = rom[o + 0x1c]
  const b1d = rom[o + 0x1d]
  const b1e = rom[o + 0x1e]
  const b24 = rom[o + 0x24]
  const dropIndex = (b1d & 0x38) >> 3
  const drop = dropTable[dropIndex] || null
  const resArray = readResistances(rom, o)

  return {
    id,
    recordId: id,
    nameIndex,
    name: strings[nameIndex] ?? null,

    level: b02 & 0x3f,
    isDragon: !!(b02 & 0x40),
    isZombie: !!(b02 & 0x80),

    hp: u16(rom, o + 0x22),
    mp: rom[o + 0x0b],
    exp: u16(rom, o + 0x03),
    gold: u16(rom, o + 0x05) & 0x03ff,
    attack: (u16(rom, o + 0x06) & 0x0ffc) >> 2,
    defense: (u16(rom, o + 0x07) & 0x3ff0) >> 4,
    agility: rom[o + 0x0a],
    palette: (u16(rom, o + 0x08) & 0xffc0) >> 6,

    dropItemId: rom[o + 0x0c],
    spriteId: rom[o + 0x0d],

    commands: readCommands(rom, o),
    commandConstraints: rom[o + 0x17],
    animations: readAnimations(rom, o),
    defaultAnimation: b1c & 0x0f,
    commandSelection: (b1c & 0x30) >> 4,
    commandStrategy: (b1c & 0xc0) >> 6,

    mikawashi: b1d & 0x07,
    dropProbabilityIndex: dropIndex,
    dropProbability: drop ? drop.p : null,
    dropThreshold: drop ? drop.threshold : null,
    runMultipleCommands: (b1d & 0xc0) >> 6,

    autoRecovery: b1e & 0x03,
    concentratedAttacks: (b1e & 0x0c) >> 2,

    resistances: Object.fromEntries(RESISTANCE_KEYS.map((k, i) => [k, resArray[i]])),
    resistanceArray: resArray,
    isMetal: !!(b24 & 0x01)
  }
}

function validate(monsters, strings) {
  const warnings = []

  if (monsters.length !== MON.count) {
    warnings.push(`expected ${MON.count} records, got ${monsters.length}`)
  }

  const dummy = monsters[0]
  if (dummy && (dummy.hp || dummy.exp || dummy.gold || dummy.attack || dummy.defense || dummy.agility)) {
    warnings.push('record 0 is not empty; check table base/record size')
  }

  for (const m of monsters) {
    if (m.id === 0) continue // dummy entry, expected to have no name
    if (m.nameIndex >= strings.length) {
      warnings.push(`id ${m.id}: nameIndex ${m.nameIndex} >= string count ${strings.length}`)
    }
    if (!m.name) {
      warnings.push(`id ${m.id}: name is null (index ${m.nameIndex})`)
    }
    if (m.hp > 9999) warnings.push(`id ${m.id}: suspicious hp ${m.hp}`)
    if (m.exp > 65535) warnings.push(`id ${m.id}: suspicious exp ${m.exp}`)
    if (m.gold > 1023) warnings.push(`id ${m.id}: suspicious gold ${m.gold}`)
    if (m.attack > 1023) warnings.push(`id ${m.id}: suspicious attack ${m.attack}`)
    if (m.defense > 1023) warnings.push(`id ${m.id}: suspicious defense ${m.defense}`)
    if (m.agility > 255) warnings.push(`id ${m.id}: suspicious agility ${m.agility}`)
    if (m.mp > 255) warnings.push(`id ${m.id}: suspicious mp ${m.mp}`)
  }

  return warnings
}

function main() {
  const args = process.argv.slice(2)
  const printIdx = args.indexOf('--print')
  const printN = printIdx >= 0 ? Number(args[printIdx + 1]) || 10 : 10
  const outIdx = args.indexOf('--out')
  const outPath = outIdx >= 0 ? args[outIdx + 1] : DEFAULT_OUT
  const romPath = args.find((a, i) =>
    !a.startsWith('--') &&
    !(outIdx >= 0 && i === outIdx + 1) &&
    !(printIdx >= 0 && i === printIdx + 1)
  ) || DEFAULT_ROM

  if (!fs.existsSync(romPath)) {
    console.error(`ROM not found: ${romPath}`)
    process.exit(2)
  }
  if (!fs.existsSync(CHARMAP_PATH)) {
    console.error(`charmap not found: ${CHARMAP_PATH}`)
    process.exit(2)
  }

  const rom = fs.readFileSync(romPath)
  const charmap = JSON.parse(fs.readFileSync(CHARMAP_PATH, 'utf8'))
  const strings = readStrings(rom, charmap)
  const dropTable = readDropTable(rom)
  const monsters = []
  for (let i = 0; i < MON.count; i++) monsters.push(parseMonster(rom, strings, dropTable, i))

  const warnings = validate(monsters, strings)
  const sha1 = crypto.createHash('sha1').update(rom).digest('hex')

  const result = {
    source: {
      rom: path.basename(romPath),
      size: rom.length,
      sha1,
      tableOffset: '0x020000',
      recordSize: MON.size,
      count: MON.count,
      documentedCount: MON.documentedCount,
      stringTableOffset: '0x3ECFB7',
      stringCount: STR.count,
      dropTableOffset: '0x02AA34',
      notes: [
        'Record 0 is a dummy entry.',
        'Records 135/136 are two Zoma phases; 138/139 are two Kandar variants; 140/159 are two Kandar-henchman variants.',
        'Official monster IDs 135+ therefore do not equal record indexes; keep both until an official-ID map is curated.',
        'Record 160 (0xA0) is padding and is not exported.',
        'Resistance values are raw 0-3; the 0/1/2/3 to x/triangle/circle/double-circle mapping still needs calibration.'
      ]
    },
    dropTable,
    warnings,
    monsters
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8')

  console.log(`rom        ${romPath}`)
  console.log(`sha1       ${sha1}`)
  console.log(`monsters   ${monsters.length} (documented ${MON.documentedCount}; last entry is padding)`)
  console.log(`names      ${monsters.filter(m => m.name).length}/${monsters.length}`)
  console.log(`warnings   ${warnings.length}`)
  if (warnings.length) {
    for (const w of warnings.slice(0, 8)) console.log(`  - ${w}`)
    if (warnings.length > 8) console.log(`  ... ${warnings.length - 8} more`)
  }
  console.log('')
  console.log('first records:')
  for (const m of monsters.slice(1, 1 + printN)) {
    console.log(`  ${String(m.id).padStart(3)}  ${m.name ?? '?'}  HP ${m.hp}  MP ${m.mp}  EXP ${m.exp}  G ${m.gold}  ATK ${m.attack}  DEF ${m.defense}  AGI ${m.agility}`)
  }
  console.log('')
  console.log(`wrote      ${outPath}`)
}

main()
