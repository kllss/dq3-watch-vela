#!/usr/bin/env node
/**
 * build.mjs — 构建 DQ3 手表版 M1
 *
 * 除了打包，还做一件必要的事：**哨兵校验**。
 * 曾经出现过本地 .js 模块被编译成空模块 `() {}`、页面拿到 undefined 的情况，
 * 而且只在那一次构建里出现、无法复现。所以每次构建后解包 RPK，
 * 检查每个模块里的 MODULE_TAG 是否真的进了页面 bundle，缺了直接失败。
 *
 * 用法：
 *   node game/build.mjs
 *   AIOT_TOOLKIT_BIN=/path/to/aiot-toolkit/lib/bin.js node game/build.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const SRC = path.join(HERE, 'src')
const WORK = path.join(HERE, '.build')
const OUT = path.join(ROOT, 'data', 'local')
const ICON = path.join(HERE, 'assets', 'icon-dq3.png')
const OUT_NAME = 'dq3-m1.rpk'

// 哨兵用"模块自注册"的标签：注册是有副作用的，不会被 tree-shaking 删掉。
// 只匹配标签字面量，不匹配调用形式——压缩后引号/空格会变。
const SENTINELS = [
  'store.js@m1',
  'save.js@m1',
  'game.js@m1',
  'world.js@m1'
]

// 自注册代码本身也必须存在，否则标签可能只是被别处引用
const REGISTRY_MARK = '__dq3_modules__'

function toolkitBin() {
  if (process.env.AIOT_TOOLKIT_BIN) {
    return process.env.AIOT_TOOLKIT_BIN
  }
  try {
    return createRequire(import.meta.url).resolve('aiot-toolkit/lib/bin.js')
  } catch (e) {
    throw new Error(
      '找不到 aiot-toolkit。请任选一种方式：\n' +
      '  1) 在工程目录 npm i -D aiot-toolkit\n' +
      '  2) 设置环境变量 AIOT_TOOLKIT_BIN=<path>/aiot-toolkit/lib/bin.js\n'
    )
  }
}

function pageTexts(rpk) {
  const list = execFileSync('unzip', ['-l', rpk], { encoding: 'utf8' })
  const pages = list
    .split('\n')
    .map((l) => l.trim().split(/\s+/).pop())
    .filter((f) => /^pages\/[^/]+\/index\.js$/.test(f))

  const out = {}
  for (const p of pages) {
    out[p] = execFileSync('unzip', ['-p', rpk, p], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  }
  return out
}

function verify(rpk) {
  const pages = pageTexts(rpk)
  const names = Object.keys(pages)
  if (!names.length) {
    throw new Error('RPK 里没有任何页面 bundle')
  }

  const all = names.map((n) => pages[n]).join('\n')
  const missing = SENTINELS.filter((s) => all.indexOf(s) === -1)
  if (all.indexOf(REGISTRY_MARK) === -1) {
    missing.push('(模块自注册代码)')
  }
  if (missing.length) {
    throw new Error(
      '哨兵校验失败，以下模块没有进到页面 bundle：\n' +
      missing.map((m) => '  - ' + m).join('\n') +
      '\n最可能的原因：模块被编译成空模块。删掉 .build 后重试。'
    )
  }

  // 空模块检测
  const empties = names.filter((n) => /"\.\/src\/[^"]+" \(\) \{\}/.test(pages[n]))
  if (empties.length) {
    throw new Error('检测到空模块，出现在：' + empties.join(', '))
  }

  return { pages: names, sentinels: SENTINELS.length }
}

function main() {
  if (!fs.existsSync(ICON)) {
    throw new Error(`缺少图标：${ICON}\n先运行 node game/make-icon.mjs`)
  }

  const bin = toolkitBin()

  // 地图数据改了但贴图没重生成，会出现"地图和数据不一致"，所以每次构建前都重画
  execFileSync(process.execPath, [path.join(ROOT, 'tools', 'map-image.mjs')], { stdio: 'inherit' })

  // 必须清缓存：实测「改文件后再构建」会命中旧缓存，把本地模块编译成空模块 () {}
  fs.rmSync(path.join(HERE, 'node_modules', '.cache'), { recursive: true, force: true })
  fs.rmSync(WORK, { recursive: true, force: true })
  fs.mkdirSync(WORK, { recursive: true })
  fs.cpSync(SRC, path.join(WORK, 'src'), { recursive: true })
  fs.copyFileSync(ICON, path.join(WORK, 'src', 'Common', 'icon.png'))

  execFileSync(process.execPath, [bin, 'build'], { cwd: WORK, stdio: 'inherit' })

  const distDir = path.join(WORK, 'dist')
  const rpk = fs.readdirSync(distDir).find((f) => f.endsWith('.rpk'))
  if (!rpk) {
    throw new Error('构建成功但没有找到 RPK：' + distDir)
  }

  const src = path.join(distDir, rpk)
  const info = verify(src)

  fs.mkdirSync(OUT, { recursive: true })
  const target = path.join(OUT, OUT_NAME)
  fs.copyFileSync(src, target)

  console.log('')
  console.log(`构建完成：${fs.statSync(target).size} B -> ${target}`)
  console.log(`  页面：${info.pages.join(', ')}`)
  console.log(`  哨兵：${info.sentinels} 个全部命中`)
}

main()
