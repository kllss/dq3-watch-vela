#!/usr/bin/env node
/**
 * vela-bundle-check.mjs — 不启动模拟器，直接验证 RPK 里的页面 bundle 能不能加载
 *
 * 背景：Vela 编译产物里，本地模块的包装函数参数被重命名成 `__webpack_exports__`，
 * 但函数体仍然写 `exports.xxx`，运行时抛 `ReferenceError: exports is not defined`，
 * 整个页面脚本加载失败 → 组件 default 为空 → 黑屏。
 * 这个错误在真机上只表现为"黑屏 + builder is null"，很难定位，所以在打包后先本地跑一遍。
 *
 * 做法：解包 RPK，取每个 pages/<Name>/index.js，在 Node 里用桩替换 $app_require$，
 * 执行 bundle 并调用 entry，检查导出的组件对象有没有 template / style。
 *
 * 用法：
 *   node tools/vela-bundle-check.mjs data/local/dq3-m1.rpk
 *   node tools/vela-bundle-check.mjs data/local/guard-demo.rpk
 *
 * 退出码：全部页面正常 = 0，有任何页面异常 = 1
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const rpk = process.argv[2]
if (!rpk || !fs.existsSync(rpk)) {
  console.error('用法: node tools/vela-bundle-check.mjs <path-to-rpk>')
  process.exit(2)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vela-check-'))

function stubRequire(name) {
  const system = {
    get(o) { if (o && o.fail) o.fail({}, 0) },
    set(o) { if (o && o.success) o.success() },
    delete(o) { if (o && o.success) o.success() },
    push() {},
    back() {},
    getLength() { return 1 },
    getPages() { return [] },
    getInfo(o) { if (o && o.success) o.success({ screenWidth: 432, screenHeight: 514 }) },
    getBattery(o) { if (o && o.success) o.success({ level: 1 }) },
    subscribeAccelerometer() {},
    unsubscribeAccelerometer() {},
    start(o) { if (o && o.success) o.success() }
  }
  return { default: system, __esModule: true, name: name }
}

globalThis.$app_require$ = stubRequire

function listPages() {
  const out = execFileSync('unzip', ['-l', rpk], { encoding: 'utf8' })
  return out
    .split('\n')
    .map((l) => l.trim().split(/\s+/).pop())
    .filter((f) => /^pages\/[^/]+\/index\.js$/.test(f))
}

async function checkPage(entry) {
  const code = execFileSync('unzip', ['-p', rpk, entry], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const name = entry.split('/')[1]
  const file = path.join(tmp, name + '.mjs')
  fs.writeFileSync(file, code, 'utf8')

  try {
    const mod = await import(pathToFileURL(file).href)
    const ex = {}
    mod.default(globalThis, globalThis, globalThis, ex, (x) => x)
    if (typeof ex.entry !== 'function') {
      return { page: name, ok: false, why: 'bundle 没有 entry 导出' }
    }
    ex.entry(ex)
    const comp = ex.default
    if (!comp || typeof comp !== 'object') {
      return { page: name, ok: false, why: '组件 default 为空（页面脚本执行失败）' }
    }
    if (!comp.template || !comp.style) {
      return { page: name, ok: false, why: '组件缺少 template/style' }
    }
    return { page: name, ok: true, keys: Object.keys(comp.private || {}).length }
  } catch (e) {
    const msg = (e && e.message) || String(e)
    return { page: name, ok: false, why: msg }
  }
}

const pages = listPages()
if (!pages.length) {
  console.error('RPK 里没有页面 bundle：' + rpk)
  process.exit(2)
}

let bad = 0
console.log('检查 ' + rpk)
for (const p of pages) {
  const r = await checkPage(p)
  if (r.ok) {
    console.log('  ok    ' + r.page + '（private 字段 ' + r.keys + ' 个）')
  } else {
    bad++
    console.log('  FAIL  ' + r.page + '：' + r.why)
  }
}

fs.rmSync(tmp, { recursive: true, force: true })

if (bad) {
  console.log('\n' + bad + ' 个页面加载失败。常见原因见 docs/构建与模块验证.md')
  process.exit(1)
}
console.log('\n全部页面可加载')
