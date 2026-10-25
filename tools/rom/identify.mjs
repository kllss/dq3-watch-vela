#!/usr/bin/env node
/**
 * identify.mjs — SFC ROM 识别与校验
 *
 * 用途：
 *   1. 计算文件/去头 ROM 的 CRC32、MD5、SHA-1、SHA-256
 *   2. 识别 SFC 头（LoROM / HiROM / ExHiROM）、标题、ROM 大小、版本、校验和
 *   3. 与本项目锁定的 DQ3 SFC 日版（No-Intro）校验值比对
 *
 * 依赖：Node.js 18+（只用内置模块）
 * 用法：
 *   node tools/rom/identify.mjs <rom路径> [--json]
 *
 * 注意：
 *   - 不读取、不上传、不修改 ROM；只做只读校验。
 *   - No-Intro 校验值针对“无 copier header 的 ROM”；本工具会同时给出
 *     原始文件与去头 ROM 的哈希。
 *   - SFC 校验和只做指示性验证；非 2 的幂大小或特殊映射可能不准确。
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const EXPECTED = {
  name: 'Dragon Quest III: Soshite Densetsu e... (Japan)',
  region: 'Japan',
  platform: 'Super Famicom',
  romSize: 4 * 1024 * 1024,
  cartSize: '32 Mbit',
  crc32: '13836bd2',
  md5: '7c7c7db73b0608a184cc5e1d73d7695b',
  sha1: 'b711341e4b1022d7645c5313840874aebc01b7b7',
  sha256: 'dcf8fde55cec7095bc8b522820ffac65790a60054555f8665d54265d2ac36d8a'
}

const MAP_MODE = {
  0x20: 'LoROM',
  0x21: 'HiROM',
  0x22: 'SDD-1 LoROM',
  0x23: 'SA-1 LoROM',
  0x25: 'ExHiROM',
  0x30: 'LoROM + FastROM',
  0x31: 'HiROM + FastROM',
  0x32: 'SDD-1 LoROM + FastROM',
  0x35: 'ExHiROM + FastROM'
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
  }
  return ((c ^ 0xFFFFFFFF) >>> 0).toString(16).padStart(8, '0')
}

function hashAll(buf) {
  return {
    crc32: crc32(buf),
    md5: crypto.createHash('md5').update(buf).digest('hex'),
    sha1: crypto.createHash('sha1').update(buf).digest('hex'),
    sha256: crypto.createHash('sha256').update(buf).digest('hex')
  }
}

function u16le(buf, off) {
  return buf[off] | (buf[off + 1] << 8)
}

function parseHeader(rom, base) {
  if (base + 0x20 > rom.length) return null

  const rawTitle = rom.subarray(base, base + 21)
  let printable = 0
  let title = ''
  for (const b of rawTitle) {
    if (b === 0x00) break
    if (b >= 0x20 && b <= 0x7E) {
      printable++
      title += String.fromCharCode(b)
    } else {
      title += '.'
    }
  }
  title = title.trim()

  const mapMode = rom[base + 0x15]
  const romSizeByte = rom[base + 0x17]
  const ramSizeByte = rom[base + 0x18]
  const country = rom[base + 0x19]
  const license = rom[base + 0x1A]
  const version = rom[base + 0x1B]
  const checksumComplement = u16le(rom, base + 0x1C)
  const checksum = u16le(rom, base + 0x1E)

  const titleOk = rawTitle.length > 0 && printable >= 15
  const checksumPairOk = ((checksum ^ checksumComplement) & 0xFFFF) === 0xFFFF
  const mapModeOk = Object.prototype.hasOwnProperty.call(MAP_MODE, mapMode)
  const romSizeOk = romSizeByte >= 0x05 && romSizeByte <= 0x0D

  let score = 0
  if (titleOk) score += 2
  if (checksumPairOk) score += 4
  if (mapModeOk) score += 2
  if (romSizeOk) score += 1
  if (country <= 0x0F) score += 1

  return {
    offset: `0x${base.toString(16).toUpperCase()}`,
    title,
    mapMode: `0x${mapMode.toString(16).toUpperCase().padStart(2, '0')}`,
    mapModeName: MAP_MODE[mapMode] || 'Unknown',
    romSizeKB: 1 << romSizeByte,
    ramSizeKB: 1 << ramSizeByte,
    country: `0x${country.toString(16).toUpperCase().padStart(2, '0')}`,
    license: `0x${license.toString(16).toUpperCase().padStart(2, '0')}`,
    version: `1.${version}`,
    checksum: `0x${checksum.toString(16).toUpperCase().padStart(4, '0')}`,
    checksumComplement: `0x${checksumComplement.toString(16).toUpperCase().padStart(4, '0')}`,
    checksumPairOk,
    checksumValid: null,
    score
  }
}

function sfcChecksum(rom) {
  let sum = 0
  for (let i = 0; i < rom.length; i++) sum = (sum + rom[i]) & 0xFFFF
  return sum
}

function identify(filePath) {
  const stat = fs.statSync(filePath)
  const raw = new Uint8Array(fs.readFileSync(filePath))

  if (raw.length >= 4 && raw[0] === 0x50 && raw[1] === 0x4B && raw[2] === 0x03 && raw[3] === 0x04) {
    throw new Error('输入是 ZIP；请先解压出 .sfc/.smc 再运行')
  }

  const hasCopierHeader = (raw.length % 1024) === 512
  const rom = hasCopierHeader ? raw.subarray(512) : raw

  const fileHashes = hashAll(raw)
  const romHashes = hashAll(rom)

  const candidates = []
  const lo = parseHeader(rom, 0x7FC0)
  const hi = parseHeader(rom, 0xFFC0)
  if (lo) candidates.push(lo)
  if (hi) candidates.push(hi)
  candidates.sort((a, b) => b.score - a.score)

  const header = candidates[0] || null
  if (header && !header.checksumPairOk) {
    header.checksumValid = false
  } else if (header) {
    const sum = sfcChecksum(rom)
    header.checksumValid = sum === parseInt(header.checksum, 16)
    header.computedChecksum = `0x${sum.toString(16).toUpperCase().padStart(4, '0')}`
  }

  const match = {
    size: rom.length === EXPECTED.romSize,
    sha1: romHashes.sha1 === EXPECTED.sha1,
    sha256: romHashes.sha256 === EXPECTED.sha256,
    crc32: romHashes.crc32 === EXPECTED.crc32,
    md5: romHashes.md5 === EXPECTED.md5
  }

  return {
    file: {
      path: path.resolve(filePath),
      size: stat.size,
      copierHeader: hasCopierHeader,
      romSize: rom.length
    },
    hashes: { file: fileHashes, rom: romHashes },
    header,
    expected: EXPECTED,
    match,
    ok: match.sha1 || match.sha256
  }
}

function printHuman(result) {
  const r = result
  console.log('')
  console.log('SFC ROM identify')
  console.log('================')
  console.log(`file        ${r.file.path}`)
  console.log(`size        ${r.file.size} bytes${r.file.copierHeader ? ' (含 512B copier header)' : ''}`)
  console.log(`rom size    ${r.file.romSize} bytes${r.match.size ? '' : `  (expected ${EXPECTED.romSize} bytes / ${EXPECTED.cartSize})`}`)
  if (!r.match.size) {
    console.log(`            WARN: 大小不符。32 Mbit 卡带应为 ${EXPECTED.romSize} 字节；`)
    console.log('                  2.25 MB 之类的数字通常是压缩包体积，不是 .sfc 本体。')
  }
  console.log('')
  console.log('hashes (headerless ROM)')
  console.log(`  crc32     ${r.hashes.rom.crc32}`)
  console.log(`  md5       ${r.hashes.rom.md5}`)
  console.log(`  sha1      ${r.hashes.rom.sha1}`)
  console.log(`  sha256    ${r.hashes.rom.sha256}`)
  if (r.file.copierHeader) {
    console.log('hashes (original file, with copier header)')
    console.log(`  crc32     ${r.hashes.file.crc32}`)
    console.log(`  sha1      ${r.hashes.file.sha1}`)
  }
  console.log('')
  if (r.header) {
    const h = r.header
    console.log('SFC header')
    console.log(`  offset    ${h.offset}`)
    console.log(`  title     ${h.title}`)
    console.log(`  map mode  ${h.mapMode} ${h.mapModeName}`)
    console.log(`  rom size  ${h.romSizeKB} KB`)
    console.log(`  ram size  ${h.ramSizeKB} KB`)
    console.log(`  country   ${h.country}`)
    console.log(`  version   ${h.version}`)
    console.log(`  checksum  ${h.checksum} / complement ${h.checksumComplement} (pair ${h.checksumPairOk ? 'ok' : 'BAD'})`)
    if (h.checksumValid !== null) {
      console.log(`  computed  ${h.computedChecksum || '—'} (${h.checksumValid ? 'ok' : 'mismatch'})`)
    }
  } else {
    console.log('SFC header  not found (可能是非 SFC ROM，或 header 被裁掉)')
  }
  console.log('')
  console.log('expected (No-Intro, DQ3 SFC Japan)')
  console.log(`  size      ${EXPECTED.romSize} bytes (${EXPECTED.cartSize})`)
  console.log(`  crc32     ${EXPECTED.crc32}`)
  console.log(`  sha1      ${EXPECTED.sha1}`)
  console.log(`  sha256    ${EXPECTED.sha256}`)
  console.log('')
  console.log(`match       ${r.ok ? 'YES' : 'NO'}  (size=${r.match.size} sha1=${r.match.sha1} sha256=${r.match.sha256} crc32=${r.match.crc32})`)
  if (!r.ok) {
    console.log('')
    console.log('这不是本项目锁定的 DQ3 SFC 日版（No-Intro）。')
    console.log('请确认：地区=日本、平台=SFC、不是英文汉化补丁、不是 GBC/HD-2D 版。')
    if (!r.match.size) {
      console.log('另外：ROM 大小不是 32 Mbit；如果文件只有 2 MB 左右，可能是压缩包或截断文件。')
    }
  }
  console.log('')
}

function main() {
  const args = process.argv.slice(2)
  const json = args.includes('--json')
  const file = args.find(a => !a.startsWith('--'))

  if (!file) {
    console.error('usage: node tools/rom/identify.mjs <rom-path> [--json]')
    process.exit(2)
  }

  try {
    const result = identify(file)
    if (json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      printHuman(result)
    }
    process.exit(result.ok ? 0 : 1)
  } catch (err) {
    console.error(`error: ${err && err.message ? err.message : err}`)
    process.exit(2)
  }
}

main()
