/**
 * world.js — M1 的假地图
 *
 * '#' 墙/树、'.' 草地、'~' 水。只用来验证移动、碰撞、相机夹取。
 */

const MODULE_TAG = 'world.js@m1'

// 模块自注册：既是最可靠的构建哨兵，也能在界面上直接看到"哪些模块真的加载了"
try {
  if (typeof globalThis !== 'undefined') {
    globalThis.__dq3_modules__ = globalThis.__dq3_modules__ || []
    if (globalThis.__dq3_modules__.indexOf(MODULE_TAG) < 0) {
      globalThis.__dq3_modules__.push(MODULE_TAG)
    }
  }
} catch (e) {}

globalThis.__dq3_world = {
  startMap: 'field',
  maps: {
    field: {
      name: '阿利亚罕平原',
      w: 15,
      h: 13,
      tiles: [
        '###############',
        '#.............#',
        '#..##.....##..#',
        '#..#.......#..#',
        '#.....~.......#',
        '#....~~~......#',
        '#.....~.......#',
        '#..#.......#..#',
        '#..##.....##..#',
        '#.............#',
        '#.............#',
        '#.............#',
        '###############'
      ],
      npcs: [
        { x: 5, y: 10, name: '村民', lines: ['你也是去城堡的吗？', '听说国王在找一个勇者。'] }
      ]
    }
  }
}
