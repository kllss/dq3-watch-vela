/**
 * save.js — A/B 双槽存档
 *
 * 记录格式：{ v, gen, sum, body }，body 是 JSON 字符串。
 * - gen 递增，决定写哪个槽（奇偶交替）
 * - sum 是 body 的 32 位校验，用来识别截断/损坏
 * - 读档时两个槽都解，取 gen 最大且校验通过的那个
 */

const MODULE_TAG = 'save.js@m1'

// 模块自注册：既是最可靠的构建哨兵，也能在界面上直接看到"哪些模块真的加载了"
try {
  if (typeof globalThis !== 'undefined') {
    globalThis.__dq3_modules__ = globalThis.__dq3_modules__ || []
    if (globalThis.__dq3_modules__.indexOf(MODULE_TAG) < 0) {
      globalThis.__dq3_modules__.push(MODULE_TAG)
    }
  }
} catch (e) {}


const SAVE_VER = 1
const KEY_A = 'saveA'
const KEY_B = 'saveB'

function hash32(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h = h ^ str.charCodeAt(i)
    h = Math.imul ? Math.imul(h, 0x01000193) : ((h * 0x01000193) >>> 0)
  }
  return (h >>> 0).toString(16)
}

function encode(payload) {
  const body = {}
  for (const k in payload) {
    body[k] = payload[k]
  }
  body.gen = (payload.gen || 0) + 1
  const text = JSON.stringify(body)
  return {
    gen: body.gen,
    raw: JSON.stringify({ v: SAVE_VER, gen: body.gen, sum: hash32(text), body: text })
  }
}

function decode(raw) {
  if (!raw) {
    return null
  }
  try {
    const rec = JSON.parse(raw)
    if (!rec || rec.v !== SAVE_VER || typeof rec.body !== 'string') {
      return null
    }
    if (hash32(rec.body) !== rec.sum) {
      return null
    }
    const data = JSON.parse(rec.body)
    if (!data || typeof data.gen !== 'number') {
      return null
    }
    return { gen: rec.gen, data: data }
  } catch (e) {
    return null
  }
}

/**
 * 写存档。回调 (err, gen)。
 */
function saveGame(storage, payload, cb) {
  const enc = encode(payload)
  const key = (enc.gen % 2 === 0) ? KEY_A : KEY_B
  try {
    storage.set({
      key: key,
      value: enc.raw,
      success: () => {
        if (cb) {
          cb(null, enc.gen)
        }
      },
      fail: (d, c) => {
        if (cb) {
          cb('code=' + c)
        }
      }
    })
  } catch (e) {
    if (cb) {
      cb('throw')
    }
  }
  return enc.gen
}

/**
 * 读存档。回调 (best, brokenCount)。
 * best = { gen, data } 或 null
 */
function loadGame(storage, cb) {
  let pending = 2
  let best = null
  let broken = 0

  const merge = (rec) => {
    if (!rec) {
      broken = broken + 1
    } else if (!best || rec.data.gen > best.data.gen) {
      best = rec
    }
    pending = pending - 1
    if (pending === 0 && cb) {
      cb(best, broken)
    }
  }

  const readOne = (key) => {
    try {
      storage.get({
        key: key,
        default: '',
        success: (v) => merge(decode(v)),
        fail: () => merge(null)
      })
    } catch (e) {
      merge(null)
    }
  }

  readOne(KEY_A)
  readOne(KEY_B)
}

function clearSaves(storage) {
  try {
    storage.delete({ key: KEY_A })
    storage.delete({ key: KEY_B })
  } catch (e) {}
}

globalThis.__dq3_save_api = { hash32, saveGame, loadGame, clearSaves, SAVE_VER }
