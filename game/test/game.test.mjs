/**
 * 纯逻辑单测：不需要设备、不需要 RPK。
 * 运行：node game/test/game.test.mjs
 */
import assert from 'node:assert/strict'
import '../src/core/game.js'
import '../src/core/world.js'

const gameApi = globalThis.__dq3_game_api
const world = globalThis.__dq3_world
const { newGame, currentMap, passable, tryMove, camera, viewport, VIEW_W, VIEW_H } = gameApi

let n = 0
function test(name, fn) {
  try {
    fn()
    n++
    console.log('  ok   ' + name)
  } catch (e) {
    console.log('  FAIL ' + name)
    console.log('       ' + e.message)
    process.exitCode = 1
  }
}

console.log('game.js')

test('开局站在可走格上', () => {
  const g = newGame(world)
  const m = currentMap(world, g)
  assert.equal(passable(m, g.x, g.y), true)
})

test('走进草地会移动并累加步数', () => {
  const g = newGame(world)
  const r = tryMove(world, g, 0, -1)
  assert.equal(r.moved, true)
  assert.equal(g.steps, 1)
  assert.equal(g.y, 8)
})

test('撞墙不移动', () => {
  const g = newGame(world)
  g.x = 2
  g.y = 2
  const r = tryMove(world, g, 1, 0)   // (3,2) 是 '#'
  assert.equal(r.moved, false)
  assert.equal(r.reason, 'wall')
  assert.equal(g.x, 2)
})

test('下水不移动', () => {
  const g = newGame(world)
  g.x = 7
  g.y = 4
  const r = tryMove(world, g, 0, 1)   // (7,5) 是 '~'
  assert.equal(r.moved, false)
  assert.equal(r.reason, 'wall')
})

test('撞 NPC 不移动但给出对话', () => {
  const g = newGame(world)
  g.x = 4
  g.y = 10
  const r = tryMove(world, g, 1, 0)   // (5,10) 是村民
  assert.equal(r.moved, false)
  assert.equal(r.reason, 'npc')
  assert.equal(r.npc.name, '村民')
  assert.equal(r.npc.lines.length, 2)
})

test('越界不移动', () => {
  const g = newGame(world)
  g.x = 1
  g.y = 1
  const r = tryMove(world, g, -1, 0)
  assert.equal(r.moved, false)
  assert.equal(r.reason, 'wall')   // (0,1) 是 '#'
})

test('斜走被拒绝', () => {
  const g = newGame(world)
  const r = tryMove(world, g, 1, 1)
  assert.equal(r.moved, false)
  assert.equal(r.reason, 'edge')
})

test('相机在地图中间居中', () => {
  const g = newGame(world)
  g.x = 7
  g.y = 6
  const c = camera(currentMap(world, g), g)
  assert.equal(c.x, 7 - 5)
  assert.equal(c.y, 6 - 4)
})

test('相机在左上角夹到 0', () => {
  const g = newGame(world)
  g.x = 1
  g.y = 1
  const c = camera(currentMap(world, g), g)
  assert.equal(c.x, 0)
  assert.equal(c.y, 0)
})

test('相机在右下角夹到边界', () => {
  const g = newGame(world)
  const m = currentMap(world, g)
  g.x = m.w - 2
  g.y = m.h - 2
  const c = camera(currentMap(world, g), g)
  assert.equal(c.x, m.w - VIEW_W)
  assert.equal(c.y, m.h - VIEW_H)
})

test('视口是 9 行 11 列，且玩家位置正确', () => {
  const g = newGame(world)
  const vp = viewport(world, g)
  assert.equal(vp.rows.length, VIEW_H)
  assert.equal(vp.rows[0].cells.length, VIEW_W)
  const px = g.x - vp.cam.x
  const py = g.y - vp.cam.y
  assert.equal(vp.rows[py].cells[px].ch, '勇')
})

test('NPC 在地图里显示为「人」', () => {
  const g = newGame(world)
  const vp = viewport(world, g)
  const nx = 5 - vp.cam.x
  const ny = 10 - vp.cam.y
  assert.equal(vp.rows[ny].cells[nx].ch, '人')
})

console.log(`\n${n} 项通过`)
