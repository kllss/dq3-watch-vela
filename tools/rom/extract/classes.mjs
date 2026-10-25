#!/usr/bin/env node
/**
 * classes.mjs — 从 DQ3 SFC 日版 ROM 提取职业表
 *
 * 数据来源（Datacrystal / ROM map / Character Classes）：
 *   - 表地址：$C4179E（HiROM 文件偏移 0x04179E）
 *   - 记录长度：$173（371）字节
 *   - 条目数：9（Warrior/Fighter/Mage/Cleric/Dealer/Jester/Thief/Sage/Hero）
 *   - 名称：$FECFB7 字符串表
 *   - 经验表：$00F-$134，98 条 × 3 字节（u24le，升到 2..99 级所需）
 *   - 成长：$135-$172，初始值（男/女）+ 分段等级/增量
 *   - 咒文学习：$00B-$00D 三字节 CPU 指针，$00E 条数；每条 2 字节（等级, 咒文 ID）
 *
 * 依赖：Node.js 18+；字符映射 tools/rom/data/charmap-dq3.json
 * 用法：
 *   node tools/rom/extract/classes.mjs [rom路径] [--out 输出路径] [--print N]
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../../..')

const DEFAULT_ROM = path.join(ROOT, 'data/local/Dragon Quest III - Soshite Densetsu e... (Japan).sfc')
const DEFAULT_OUT = path.join(ROOT, 'data/local/raw/classes.json')
const CHARMAP_PATH = path.join(ROOT, 'tools/rom/data/charmap-dq3.json')

const CLS = {
  base: 0x04179E,
  size: 0x173,
  count: 9
}

const STR = {
  base: 0x3ECFB7,
  count: 0x03BE,
  delimiter: 0xAC
}

const CLASS_NAMES = ['Warrior', 'Fighter', 'Mage', 'Cleric', 'Dealer', 'Jester', 'Thief', 'Sage', 'Hero']

function u16(rom, off) {
  return rom[off] | (rom[off + 1] << 8)
}

function u24(rom, off) {
  return rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16)
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

function readExpTable(rom, o) {
  const out = []
  for (let i = 0; i < 98; i++) out.push(u24(rom, o + 0x0f + i * 3))
  return out
}

function readSpellLearn(rom, pointer, count) {
  const off = pointer & 0x3fffff
  const out = []
  for (let i = 0; i < count; i++) {
    out.push({
      level: rom[off + i * 2],
      spellId: rom[off + i * 2 + 1]
    })
  }
  return out
}

function readBonuses(rom, o, count) {
  const out = []
  let last = -1
  for (let i = 0; i < count; i++) {
    const level = rom[o + i * 2]
    const amount = rom[o + i * 2 + 1]
    if (level < last) break // terminator / next structure
    out.push({ level, amount })
    last = level
  }
  return out
}

function statGrowth(rom, maleOff, femaleOff, bonusOff, bonusCount) {
  const maleInitial = rom[maleOff]
  const femaleInitial = rom[femaleOff]
  const bonuses = readBonuses(rom, bonusOff, bonusCount)
  const sum = bonuses.reduce((s, b) => s + b.amount, 0)
  return {
    maleInitial,
    femaleInitial,
    bonuses,
    maleAt99: maleInitial + sum,
    femaleAt99: femaleInitial + sum
  }
}

function parseClass(rom, strings, id) {
  const o = CLS.base + id * CLS.size
  const nameIndex = u16(rom, o)
  const ptr = u24(rom, o + 0x0b)
  const spellCount = rom[o + 0x0e]

  return {
    id,
    nameIndex,
    name: strings[nameIndex] ?? null,
    className: CLASS_NAMES[id],

    sprites: {
      male: rom[o + 0x02],
      female: rom[o + 0x03],
      swimsuit: rom[o + 0x04]
    },
    shorthand: rom[o + 0x05],
    personalityConditions: [
      rom[o + 0x06], rom[o + 0x07], rom[o + 0x08], rom[o + 0x09], rom[o + 0x0a]
    ],

    spellLearnPointer: `0x${ptr.toString(16).toUpperCase().padStart(6, '0')}`,
    spellCount,
    spellLearn: readSpellLearn(rom, ptr, spellCount),

    expTable: readExpTable(rom, o),

    growth: {
      strength: statGrowth(rom, o + 0x135, o + 0x136, o + 0x137, 5),
      agility: statGrowth(rom, o + 0x141, o + 0x142, o + 0x143, 5),
      stamina: statGrowth(rom, o + 0x14d, o + 0x14e, o + 0x14f, 6),
      wisdom: statGrowth(rom, o + 0x15b, o + 0x15c, o + 0x15d, 5),
      luck: statGrowth(rom, o + 0x167, o + 0x168, o + 0x169, 5)
    }
  }
}

function validate(classes) {
  const warnings = []
  if (classes.length !== CLS.count) warnings.push(`expected ${CLS.count} classes, got ${classes.length}`)

  for (const c of classes) {
    if (!c.name) warnings.push(`class ${c.id}: name is null`)
    if (c.spellLearn.length !== c.spellCount) warnings.push(`class ${c.id}: spellLearn length != spellCount`)
    for (let i = 1; i < c.spellLearn.length; i++) {
      if (c.spellLearn[i].level < c.spellLearn[i - 1].level) {
        warnings.push(`class ${c.id}: spell levels not sorted at ${i}`)
        break
      }
    }
    for (let i = 1; i < c.expTable.length; i++) {
      if (c.expTable[i] < c.expTable[i - 1]) {
        warnings.push(`class ${c.id}: exp table decreases at level ${i + 2}`)
        break
      }
    }
    for (const [key, g] of Object.entries(c.growth)) {
      for (let i = 1; i < g.bonuses.length; i++) {
        if (g.bonuses[i].level < g.bonuses[i - 1].level) {
          warnings.push(`class ${c.id}: ${key} bonus levels not sorted`)
          break
        }
      }
      if (g.maleAt99 > 255 || g.femaleAt99 > 255) {
        // not an error: the game caps at 255, but note it for review
        warnings.push(`class ${c.id}: ${key} total > 255 (male ${g.maleAt99}, female ${g.femaleAt99}); capped in game`)
      }
    }
  }
  return warnings
}

function main() {
  const args = process.argv.slice(2)
  const printIdx = args.indexOf('--print')
  const printN = printIdx >= 0 ? Number(args[printIdx + 1]) || 9 : 9
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

  const classes = []
  for (let i = 0; i < CLS.count; i++) classes.push(parseClass(rom, strings, i))
  const warnings = validate(classes)
  const sha1 = crypto.createHash('sha1').update(rom).digest('hex')

  const result = {
    source: {
      rom: path.basename(romPath),
      size: rom.length,
      sha1,
      tableOffset: '0x04179E',
      recordSize: CLS.size,
      count: CLS.count,
      stringTableOffset: '0x3ECFB7',
      notes: [
        'EXP table has 98 entries (level 2..99), stored as 3-byte little-endian.',
        'Spell learn entries are (level, spellId), sorted by level.',
        'Growth is stored as initial male/female + level/increment bands; interpretation still needs calibration.'
      ]
    },
    warnings,
    classes
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8')

  console.log(`rom        ${romPath}`)
  console.log(`sha1       ${sha1}`)
  console.log(`classes    ${classes.length}`)
  console.log(`warnings   ${warnings.length}`)
  for (const w of warnings.slice(0, 8)) console.log(`  - ${w}`)
  console.log('')
  for (const c of classes.slice(0, printN)) {
    const lv = c.spellLearn.map(s => s.level)
    console.log(`  ${c.id}  ${c.name} (${c.className})  spells ${c.spellCount}  first ${lv[0] ?? '-'}  last ${lv[lv.length - 1] ?? '-'}  exp2 ${c.expTable[0]}  exp99 ${c.expTable[97]}`)
  }
  console.log('')
  console.log(`wrote      ${outPath}`)
}

main()
