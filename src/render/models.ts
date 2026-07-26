import * as THREE from 'three'
import * as T from '../sim/tuning'

/**
 * Every object in the game is a pile of boxes described as data. No loader, no .glb,
 * no asset pipeline — recolouring the unicorn is editing one hex value below.
 */
export interface Part {
  size: [number, number, number]
  pos: [number, number, number]
  color: number
}

const palette = {
  unicornBody: 0xfefaff,
  unicornSnout: 0xffd6e8,
  unicornEye: 0x2b2540,
  horn: 0xffc94d,
  manePink: 0xff7ec1,
  maneViolet: 0xa87ee8,
  maneCyan: 0x7ed8ff,
  hoof: 0xffc94d,

  glass: 0xa9dcf0,
  wheel: 0x24242e,
  lamp: 0xfff3c4,
  taillight: 0xff5a4a,

  wood: 0x8a5a3b,
  woodTop: 0x9d6c4a,
  woodEnd: 0xc9a274,

  trunk: 0x6b4a30,
  leafDark: 0x2c8a4b,
  leafLight: 0x38a458,

  grassA: 0x6ac974,
  grassB: 0x60bf6a,
  asphalt: 0x494954,
  stripe: 0xd9d9c2,
  water: 0x3d84d6,
  waterDeep: 0x2f6cb5,
  gravel: 0x6f6f66,
  rail: 0x9a9aa4,
  sleeper: 0x554636,

  postBody: 0x3a3a44,
  lampOff: 0x5a2222,
  lampOn: 0xff3b30,

  bush: 0x246b3c,
  rock: 0x7d8894,
  barrier: 0x3a3a44,
} as const

const CAR_COLORS = [0xef4a4a, 0x4a90ef, 0xf2b134, 0x62c96f, 0xb06be0, 0xf5f5f5]

/** Half the visible ground strip. Wide enough that no camera ever sees the end. */
export const TILE_HALF_WIDTH = 26

const unitBox = new THREE.BoxGeometry(1, 1, 1)
const materials = new Map<number, THREE.MeshLambertMaterial>()

export function materialFor(color: number): THREE.MeshLambertMaterial {
  let m = materials.get(color)
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color })
    materials.set(color, m)
  }
  return m
}

function mesh(part: Part, castShadow: boolean, receiveShadow: boolean): THREE.Mesh {
  const m = new THREE.Mesh(unitBox, materialFor(part.color))
  m.scale.set(part.size[0], part.size[1], part.size[2])
  m.position.set(part.pos[0], part.pos[1], part.pos[2])
  m.castShadow = castShadow
  m.receiveShadow = receiveShadow
  return m
}

export function buildGroup(parts: Part[], castShadow = true, receiveShadow = false): THREE.Group {
  const g = new THREE.Group()
  for (const part of parts) g.add(mesh(part, castShadow, receiveShadow))
  return g
}

// ---------------------------------------------------------------- the unicorn

/**
 * Built facing -Z, which is forward. Roughly 0.7 wide and 1.45 tall in a 1-cell grid.
 * The neck matters: without one the head floats and the mane reads as a saddle.
 */
export function unicornParts(): Part[] {
  const body = palette.unicornBody
  const parts: Part[] = [
    { size: [0.64, 0.42, 0.84], pos: [0, 0.44, 0.06], color: body },
    { size: [0.34, 0.42, 0.3], pos: [0, 0.72, -0.3], color: body },
    { size: [0.42, 0.36, 0.46], pos: [0, 0.96, -0.44], color: body },
    { size: [0.3, 0.2, 0.16], pos: [0, 0.88, -0.72], color: palette.unicornSnout },
    { size: [0.09, 0.34, 0.09], pos: [0, 1.3, -0.5], color: palette.horn },
    // A rainbow crest running from between the ears back along the neck.
    { size: [0.14, 0.15, 0.4], pos: [0, 1.16, -0.26], color: palette.manePink },
    { size: [0.13, 0.13, 0.28], pos: [0, 1.02, -0.02], color: palette.maneViolet },
    { size: [0.12, 0.11, 0.2], pos: [0, 0.86, 0.16], color: palette.maneCyan },
    { size: [0.16, 0.36, 0.14], pos: [0, 0.58, 0.52], color: palette.manePink },
    { size: [0.13, 0.2, 0.12], pos: [0, 0.34, 0.54], color: palette.maneViolet },
  ]
  for (const side of [-1, 1]) {
    parts.push({ size: [0.1, 0.16, 0.09], pos: [side * 0.14, 1.2, -0.4], color: body })
    parts.push({ size: [0.07, 0.09, 0.05], pos: [side * 0.14, 1.0, -0.665], color: palette.unicornEye })
    for (const front of [-1, 1]) {
      parts.push({ size: [0.15, 0.26, 0.15], pos: [side * 0.21, 0.13, 0.06 + front * 0.28], color: body })
      parts.push({ size: [0.17, 0.08, 0.17], pos: [side * 0.21, 0.04, 0.06 + front * 0.28], color: palette.hoof })
    }
  }
  return parts
}

// ------------------------------------------------------------------- vehicles

function carParts(variant: number): Part[] {
  const len = T.road.variantWidths[variant] ?? 2
  const color = CAR_COLORS[variant % CAR_COLORS.length]!
  if (len >= 3) return truckParts(len, color)

  const parts: Part[] = [
    { size: [len * 0.96, 0.32, 0.82], pos: [0, 0.3, 0], color },
    { size: [len * 0.52, 0.3, 0.72], pos: [len * 0.04, 0.61, 0], color: palette.glass },
  ]
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      parts.push({
        size: [0.26, 0.24, 0.16],
        pos: [end * len * 0.3, 0.12, side * 0.42],
        color: palette.wheel,
      })
    }
    parts.push({
      size: [0.06, 0.1, 0.16],
      pos: [-len * 0.49, 0.34, side * 0.24],
      color: palette.lamp,
    })
    parts.push({
      size: [0.06, 0.1, 0.16],
      pos: [len * 0.49, 0.34, side * 0.24],
      color: palette.taillight,
    })
  }
  return parts
}

function truckParts(len: number, color: number): Part[] {
  const cabLen = len * 0.34
  const boxLen = len * 0.6
  const parts: Part[] = [
    { size: [cabLen, 0.5, 0.86], pos: [-len / 2 + cabLen / 2, 0.4, 0], color },
    { size: [cabLen * 0.7, 0.26, 0.76], pos: [-len / 2 + cabLen / 2, 0.78, 0], color: palette.glass },
    { size: [boxLen, 0.78, 0.88], pos: [len / 2 - boxLen / 2, 0.56, 0], color: 0xe8e8ee },
    { size: [boxLen * 0.96, 0.12, 0.9], pos: [len / 2 - boxLen / 2, 0.86, 0], color },
  ]
  for (const side of [-1, 1]) {
    for (const at of [-len * 0.36, len * 0.1, len * 0.34]) {
      parts.push({ size: [0.3, 0.3, 0.18], pos: [at, 0.15, side * 0.44], color: palette.wheel })
    }
    parts.push({
      size: [0.06, 0.12, 0.16],
      pos: [-len * 0.495, 0.38, side * 0.26],
      color: palette.lamp,
    })
  }
  return parts
}

function logParts(width: number): Part[] {
  // Top sits at y = 0 so the player stands level with the grass either side.
  const parts: Part[] = [
    { size: [width, 0.34, 0.66], pos: [0, -0.17, 0], color: palette.wood },
    { size: [width * 0.98, 0.08, 0.52], pos: [0, -0.02, 0], color: palette.woodTop },
  ]
  for (const end of [-1, 1]) {
    parts.push({
      size: [0.07, 0.32, 0.6],
      pos: [(end * width) / 2, -0.17, 0],
      color: palette.woodEnd,
    })
  }
  return parts
}

function trainParts(): Part[] {
  const len = T.rail.length
  const parts: Part[] = [
    { size: [len, 0.92, 0.9], pos: [0, 0.64, 0], color: 0x3d4c66 },
    { size: [len * 0.99, 0.14, 0.84], pos: [0, 1.15, 0], color: 0x2b3648 },
    { size: [len * 0.99, 0.16, 0.94], pos: [0, 0.86, 0], color: 0xf2d16b },
  ]
  for (const end of [-1, 1]) {
    parts.push({ size: [0.34, 0.94, 0.92], pos: [(end * len) / 2, 0.66, 0], color: 0xd4483c })
    for (const side of [-1, 1]) {
      parts.push({
        size: [0.08, 0.16, 0.2],
        pos: [(end * (len - 0.2)) / 2, 0.42, side * 0.3],
        color: palette.lamp,
      })
    }
  }
  return parts
}

function treeParts(variant: number): Part[] {
  const trunkH = [0.5, 0.66, 0.4][variant] ?? 0.5
  const leafW = [0.82, 0.7, 0.94][variant] ?? 0.82
  const parts: Part[] = [
    { size: [0.28, trunkH, 0.28], pos: [0, trunkH / 2, 0], color: palette.trunk },
    { size: [leafW, 0.72, leafW], pos: [0, trunkH + 0.34, 0], color: palette.leafDark },
  ]
  if (variant !== 2) {
    parts.push({
      size: [leafW * 0.66, 0.46, leafW * 0.66],
      pos: [0, trunkH + 0.9, 0],
      color: palette.leafLight,
    })
  }
  return parts
}

// ------------------------------------------------------------------ lane tiles

const W = TILE_HALF_WIDTH * 2

function grassTileParts(parity: number): Part[] {
  return [
    { size: [W, 0.4, 1], pos: [0, -0.2, 0], color: parity ? palette.grassA : palette.grassB },
  ]
}

function roadTileParts(): Part[] {
  return [
    { size: [W, 0.4, 1], pos: [0, -0.2, 0], color: palette.asphalt },
    { size: [W, 0.02, 0.07], pos: [0, 0.01, -0.5], color: palette.stripe },
  ]
}

function riverTileParts(): Part[] {
  return [
    { size: [W, 0.4, 1], pos: [0, -0.32, 0], color: palette.water },
    { size: [W, 0.06, 0.86], pos: [0, -0.13, 0], color: palette.waterDeep },
  ]
}

function railTileParts(): Part[] {
  const parts: Part[] = [{ size: [W, 0.4, 1], pos: [0, -0.2, 0], color: palette.gravel }]
  for (let x = -TILE_HALF_WIDTH + 0.5; x < TILE_HALF_WIDTH; x += 1) {
    parts.push({ size: [0.7, 0.06, 0.7], pos: [x, 0.01, 0], color: palette.sleeper })
  }
  for (const side of [-1, 1]) {
    parts.push({ size: [W, 0.1, 0.11], pos: [0, 0.06, side * 0.24], color: palette.rail })
  }
  return parts
}

/** The signal that makes a train survivable. Its lamp material is swapped per frame. */
function signalParts(x: number): Part[] {
  return [
    { size: [0.12, 1.0, 0.12], pos: [x, 0.5, 0], color: palette.postBody },
    { size: [0.3, 0.3, 0.16], pos: [x, 1.1, 0], color: palette.lampOff },
  ]
}

function edgeParts(kind: 'bush' | 'rock' | 'barrier'): Part[] {
  const x = T.grid.maxCol + 1
  const out: Part[] = []
  for (const side of [-1, 1]) {
    if (kind === 'bush') {
      out.push({ size: [0.9, 0.66, 0.9], pos: [side * x, 0.33, 0], color: palette.bush })
      out.push({ size: [0.6, 0.4, 0.6], pos: [side * x, 0.76, 0], color: palette.leafLight })
    } else if (kind === 'rock') {
      out.push({ size: [0.94, 0.5, 0.94], pos: [side * x, 0.15, 0], color: palette.rock })
    } else {
      out.push({ size: [0.94, 0.44, 0.4], pos: [side * x, 0.22, 0], color: palette.barrier })
    }
  }
  return out
}

// ------------------------------------------------------------------- factories

export interface TileView extends THREE.Group {
  userData: {
    /** Signal lamps, recoloured between off and on. */
    lamps?: THREE.Mesh[]
    /** Lane-edge stripes, shown only while a train is due. */
    warnings?: THREE.Mesh[]
  }
}

/**
 * One entry point for the pool: a key in, a fresh Object3D out. Keys are stable
 * strings so a released tree can be handed straight to the next lane that wants one.
 */
export function buildByKey(key: string): THREE.Object3D {
  const [kind, arg] = key.split(':')
  const n = Number(arg)
  switch (kind) {
    case 'unicorn':
      return buildGroup(unicornParts())
    case 'car':
      return buildGroup(carParts(n))
    case 'log':
      return buildGroup(logParts(n))
    case 'train':
      return buildGroup(trainParts())
    case 'tree':
      return buildGroup(treeParts(n))
    case 'tile': {
      switch (arg) {
        case 'grass0':
          return buildGroup([...grassTileParts(0), ...edgeParts('bush')], true, true)
        case 'grass1':
          return buildGroup([...grassTileParts(1), ...edgeParts('bush')], true, true)
        case 'road':
          return buildGroup([...roadTileParts(), ...edgeParts('barrier')], true, true)
        case 'river':
          return buildGroup([...riverTileParts(), ...edgeParts('rock')], true, true)
        case 'rail': {
          const parts = [...railTileParts(), ...edgeParts('barrier')]
          const group = buildGroup(parts, true, true) as TileView
          const lamps: THREE.Mesh[] = []
          for (const x of [-(T.grid.maxCol + 2.2), T.grid.maxCol + 2.2]) {
            const signal = buildGroup(signalParts(x))
            // The second part of a signal is its lamp; the renderer recolours it.
            lamps.push(signal.children[1]! as THREE.Mesh)
            group.add(signal)
          }
          group.userData.lamps = lamps
          // Posts alone sit outside the playfield and are off-screen on a phone, which
          // would make the warning useless. The lane's own edges carry the signal.
          const warnings: THREE.Mesh[] = []
          for (const z of [-0.45, 0.45]) {
            const stripe = mesh(
              { size: [W, 0.07, 0.12], pos: [0, 0.05, z], color: palette.lampOn },
              false,
              false,
            )
            stripe.visible = false
            group.add(stripe)
            warnings.push(stripe)
          }
          group.userData.warnings = warnings
          return group
        }
      }
      break
    }
  }
  throw new Error(`unknown model key: ${key}`)
}

export const lampMaterials = {
  off: () => materialFor(palette.lampOff),
  on: () => materialFor(palette.lampOn),
}

export const background = 0x9fd9f2
