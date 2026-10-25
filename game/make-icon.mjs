#!/usr/bin/env node
/**
 * make-icon.mjs — DQ3 手表版图标：黑底 + 金色菱形
 *
 * 用法：node game/make-icon.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodePng, renderShape } from '../tools/lib/png-icon.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SIZE = Number(process.env.ICON_SIZE || 192)

function inDiamond(x, y) {
  return Math.abs(x - 0.5) + Math.abs(y - 0.5) <= 0.31
}

const fg = [0xd4, 0xaf, 0x37]
const rgb = renderShape(inDiamond, fg, { size: SIZE })
const png = encodePng(SIZE, SIZE, rgb)

const outDir = path.join(HERE, 'assets')
fs.mkdirSync(outDir, { recursive: true })
const name = SIZE === 192 ? 'icon-dq3.png' : `preview-${SIZE}-icon-dq3.png`
fs.writeFileSync(path.join(outDir, name), png)
console.log(`${name}  ${SIZE}x${SIZE}  diamond  ${png.length} B`)
