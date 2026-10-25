#!/usr/bin/env node
/**
 * map-image.mjs — 把地图数据预渲染成 PNG
 *
 * 为什么：手表上每走一步重建 99 个格子节点太慢。
 * 改成"整张地图一张图 + 一个角色文字"，每步只改 left/top 两个数字。
 *
 * 输入：game/src/core/world.js（副作用模块，import 后会挂到 globalThis.__dq3_world）
 * 输出：game/src/Common/map/<mapId>.png
 *
 * 用法：node tools/map-image.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { encodePng } from './lib/png-icon.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const WORLD = path.join(ROOT, 'game', 'src', 'core', 'world.js')
const OUT = path.join(ROOT, 'game', 'src', 'Common', 'map')

const TILE = 36

const COLORS = {
  '.': [0x16, 0x35, 0x1f], // 草地
  '#': [0x3b, 0x3b, 0x46], // 墙/树
  '~': [0x14, 0x30, 0x4a]  // 水
}

// 用副作用模块的方式加载数据：import 之后从 globalThis 取
await import(pathToFileURL(WORLD).href)
const world = globalThis.__dq3_world

if (!world || !world.maps) {
  console.error('读不到地图数据：globalThis.__dq3_world 为空')
  process.exit(1)
}

function renderMap(map) {
  const w = map.w * TILE
  const h = map.h * TILE
  const buf = Buffer.alloc(w * h * 3)

  for (let ty = 0; ty < map.h; ty++) {
    const row = map.tiles[ty]
    for (let tx = 0; tx < map.w; tx++) {
      const ch = row[tx] || '.'
      const c = COLORS[ch] || COLORS['.']
      for (let py = 0; py < TILE; py++) {
        const y = ty * TILE + py
        let o = (y * w + tx * TILE) * 3
        for (let px = 0; px < TILE; px++) {
          buf[o] = c[0]
          buf[o + 1] = c[1]
          buf[o + 2] = c[2]
          o += 3
        }
      }
    }
  }

  return encodePng(w, h, buf)
}

fs.mkdirSync(OUT, { recursive: true })

for (const id of Object.keys(world.maps)) {
  const map = world.maps[id]
  const png = renderMap(map)
  const file = path.join(OUT, id + '.png')
  fs.writeFileSync(file, png)
  console.log(`${id}.png  ${map.w * TILE}x${map.h * TILE}  ${png.length} B`)
}
