/**
 * store.js — 进程内共享状态
 *
 * 挂在 globalThis 上，而不是模块级变量：页面被 router 销毁重建后状态还在，
 * 这是「标题页当栈底」方案成立的前提。
 */

const MODULE_TAG = 'store.js@m1'

// 模块自注册：既是最可靠的构建哨兵，也能在界面上直接看到"哪些模块真的加载了"
try {
  if (typeof globalThis !== 'undefined') {
    globalThis.__dq3_modules__ = globalThis.__dq3_modules__ || []
    if (globalThis.__dq3_modules__.indexOf(MODULE_TAG) < 0) {
      globalThis.__dq3_modules__.push(MODULE_TAG)
    }
  }
} catch (e) {}

const KEY = '__dq3_store__'
let fallback = null

function blank() {
  return {
    inGame: false,
    game: null,
    stats: { lv: 3, hp: 34, hpMax: 34, mp: 6, mpMax: 6, gold: 128 },
    lastSave: null,
    boot: 0
  }
}

function attach(host) {
  if (!host) {
    return null
  }
  if (!host[KEY]) {
    try {
      host[KEY] = blank()
    } catch (e) {}
  }
  return host[KEY] || null
}

function getStore() {
  try {
    const g = (typeof globalThis !== 'undefined') ? globalThis : null
    const s = attach(g)
    if (s) {
      return s
    }
  } catch (e) {}
  try {
    const g = (typeof global !== 'undefined') ? global : null
    const s = attach(g)
    if (s) {
      return s
    }
  } catch (e) {}
  if (!fallback) {
    fallback = blank()
  }
  return fallback
}

function resetStore() {
  const s = getStore()
  const b = blank()
  for (const k in b) {
    s[k] = b[k]
  }
  return s
}

globalThis.__dq3_store_api = { getStore, resetStore }
