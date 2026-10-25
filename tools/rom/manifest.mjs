#!/usr/bin/env node
/**
 * manifest.mjs — 为 data/local/raw 下的派生数据生成清单
 *
 * 用途：
 *   - 记录源 ROM 的 SHA-1
 *   - 记录每张表的文件名、条目数、SHA-1
 *   - 让"同一 ROM + 同一提取器 → 同一份数据"可核对
 *
 * 用法：
 *   node tools/rom/manifest.mjs [--dir data/local/raw] [--out data/local/raw/manifest.json]
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')

function sha1File(p) {
  return crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex')
}

function countOf(name, data) {
  if (name === 'monsters') return data.monsters?.length ?? 0
  if (name === 'classes') return data.classes?.length ?? 0
  return Array.isArray(data) ? data.length : 0
}

function main() {
  const args = process.argv.slice(2)
  const dirIdx = args.indexOf('--dir')
  const dir = dirIdx >= 0 ? args[dirIdx + 1] : path.join(ROOT, 'data/local/raw')
  const outIdx = args.indexOf('--out')
  const out = outIdx >= 0 ? args[outIdx + 1] : path.join(dir, 'manifest.json')

  if (!fs.existsSync(dir)) {
    console.error(`dir not found: ${dir}`)
    process.exit(2)
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'manifest.json')
  const tables = {}
  let source = null

  for (const f of files) {
    const p = path.join(dir, f)
    const data = JSON.parse(fs.readFileSync(p, 'utf8'))
    const name = f.replace(/\.json$/, '')
    if (data.source?.sha1 && !source) source = data.source
    tables[name] = {
      file: f,
      offset: data.source?.tableOffset ?? null,
      count: countOf(name, data),
      sha1: sha1File(p),
      warnings: data.warnings?.length ?? 0
    }
  }

  const manifest = {
    source: source ? {
      rom: source.rom,
      size: source.size,
      sha1: source.sha1
    } : null,
    generatedAt: new Date().toISOString(),
    tables
  }

  fs.writeFileSync(out, JSON.stringify(manifest, null, 2), 'utf8')
  console.log(`wrote ${out}`)
  console.log(JSON.stringify(manifest, null, 2))
}

main()
