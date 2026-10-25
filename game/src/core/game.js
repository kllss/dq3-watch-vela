/**
 * game.js — 纯逻辑：移动、碰撞、相机、视口
 *
 * 注意：**不 import 任何数据模块**。
 * 实测这套编译链只打包"页面直接 import 的模块"，不递归；
 * 被 core 模块间接 import 的数据文件会被整块丢掉（页面上变成 undefined）。
 * 所以 world 一律由页面传入，这里只做纯函数。
 */

const MODULE_TAG = 'game.js@m1'

try {
  if (typeof globalThis !== 'undefined') {
    globalThis.__dq3_modules__ = globalThis.__dq3_modules__ || []
    if (globalThis.__dq3_modules__.indexOf(MODULE_TAG) < 0) {
      globalThis.__dq3_modules__.push(MODULE_TAG)
    }
  }
} catch (e) {}

const TILE = 36
const VIEW_W = 11
const VIEW_H = 9

function newGame(world, mapId) {
  return {
    mapId: mapId || world.startMap,
    x: 7,
    y: 9,
    steps: 0,
    facing: 'down'
  }
}

function currentMap(world, g) {
  return world.maps[g.mapId]
}

function tileAt(map, x, y) {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) {
    return '#'
  }
  return map.tiles[y][x]
}

function passable(map, x, y) {
  // 只有草地能走：'#' 墙、'~' 水都挡路
  return tileAt(map, x, y) === '.'
}

function npcAt(map, x, y) {
  for (let i = 0; i < map.npcs.length; i++) {
    if (map.npcs[i].x === x && map.npcs[i].y === y) {
      return map.npcs[i]
    }
  }
  return null
}

/** 相机夹取：玩家居中，靠边时夹住，玩家自然偏离中心 */
function camera(map, g, viewW, viewH) {
  const w = viewW || VIEW_W
  const h = viewH || VIEW_H
  let cx = g.x - Math.floor(w / 2)
  let cy = g.y - Math.floor(h / 2)
  cx = Math.max(0, Math.min(cx, map.w - w))
  cy = Math.max(0, Math.min(cy, map.h - h))
  return { x: cx, y: cy }
}

/**
 * 走一步。返回 { moved, reason, dx, dy, npc }
 * reason: 'wall' | 'edge' | 'npc' | ''
 */
function tryMove(world, g, dx, dy) {
  const map = currentMap(world, g)
  const nx = g.x + dx
  const ny = g.y + dy

  if (Math.abs(dx) + Math.abs(dy) !== 1) {
    return { moved: false, reason: 'edge', dx: dx, dy: dy, npc: null }
  }
  if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) {
    return { moved: false, reason: 'edge', dx: dx, dy: dy, npc: null }
  }

  const npc = npcAt(map, nx, ny)
  if (npc) {
    g.facing = dy > 0 ? 'down' : (dy < 0 ? 'up' : (dx > 0 ? 'right' : 'left'))
    return { moved: false, reason: 'npc', dx: dx, dy: dy, npc: npc }
  }

  if (!passable(map, nx, ny)) {
    return { moved: false, reason: 'wall', dx: dx, dy: dy, npc: null }
  }

  g.x = nx
  g.y = ny
  g.steps = g.steps + 1
  g.facing = dy > 0 ? 'down' : (dy < 0 ? 'up' : (dx > 0 ? 'right' : 'left'))
  return { moved: true, reason: '', dx: dx, dy: dy, npc: null }
}

/**
 * 生成 11×9 的视口。
 * 只输出"渲染需要的最小信息"：一个 class 名 + 可选的字符。
 * 颜色/边框全部交给 CSS class，避免每格一个 inline style（那会让 diff 变重）。
 */
function viewport(world, g, viewW, viewH) {
  const map = currentMap(world, g)
  const w = viewW || VIEW_W
  const h = viewH || VIEW_H
  const cam = camera(map, g, w, h)
  const rows = []

  for (let ry = 0; ry < h; ry++) {
    const cells = []
    for (let rx = 0; rx < w; rx++) {
      const x = cam.x + rx
      const y = cam.y + ry
      const t = tileAt(map, x, y)
      let cls = 'tile g'
      if (t === '#') {
        cls = 'tile w'
      } else if (t === '~') {
        cls = 'tile t'
      }

      let ch = ''
      if (npcAt(map, x, y)) {
        ch = '人'
        cls = 'tile g'
      }
      if (g.x === x && g.y === y) {
        ch = '勇'
        cls = 'tile g'
      }

      cells.push({ id: x + '_' + y, cls: cls, ch: ch })
    }
    rows.push({ id: ry, cells: cells })
  }
  return { rows: rows, cam: cam }
}

// 页面与单测都从这里取（本地模块不能写 export，见 docs/构建与模块验证.md）
try {
  if (typeof globalThis !== 'undefined') {
    globalThis.__dq3_game_api = {
      newGame: newGame,
      currentMap: currentMap,
      passable: passable,
      camera: camera,
      tryMove: tryMove,
      viewport: viewport,
      TILE: TILE,
      VIEW_W: VIEW_W,
      VIEW_H: VIEW_H
    }
  }
} catch (e) {}
