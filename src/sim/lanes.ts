import { chance, randInt, randRange, weighted, type Rng } from './rng'
import * as T from './tuning'
import type { Lane, LaneEntity, LaneType, RiverLane, RoadLane } from './types'

export const spanMin = T.grid.minCol - T.grid.spawnMargin
export const spanMax = T.grid.maxCol + T.grid.spawnMargin

const LANE_TYPES: readonly LaneType[] = ['grass', 'road', 'river', 'rail']

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Lanes are generated in blocks, not one at a time: a run of 1-4 roads reads as a
 * highway, where the same lanes shuffled read as noise. The generator holds the
 * pending remainder of the current block.
 */
export class LaneGenerator {
  private pending: LaneType[] = []
  private lastBlock: LaneType | null = null
  /** A column guaranteed free of trees on every grass lane, drifting by <= 1 per lane. */
  private corridor = 0
  private riverDir: 1 | -1 = 1

  constructor(private readonly rng: Rng) {}

  next(row: number, difficulty: number): Lane {
    // Behind the start line is scenery the player never has to cross, but an empty
    // field there looks like the world has not loaded yet.
    if (row < -1) return this.decorGrass(row)
    if (row < T.world.safeRows) return this.emptyGrass(row)
    if (this.pending.length === 0) this.startBlock(difficulty)
    const type = this.pending.shift() ?? 'grass'
    switch (type) {
      case 'grass':
        return this.grass(row, difficulty)
      case 'road':
        return this.road(row, difficulty)
      case 'river':
        return this.river(row, difficulty)
      case 'rail':
        return this.rail(row)
    }
  }

  private startBlock(difficulty: number): void {
    // A river block always ends on solid ground, so a crossing has somewhere to land.
    if (this.lastBlock === 'river') {
      this.pending.push('grass')
      this.lastBlock = 'grass'
      return
    }
    const w = T.laneWeights
    const weights = LANE_TYPES.map((t) => {
      const base = lerp(w.easy[t], w.hard[t], difficulty)
      // Back-to-back rail blocks are unreadable — two warnings at once is a coin flip.
      return t === 'rail' && this.lastBlock === 'rail' ? 0 : base
    })
    const type = LANE_TYPES[weighted(this.rng, weights)]!
    const [min, max] = blockLength(type)
    const count = randInt(this.rng, min, max)
    for (let i = 0; i < count; i++) this.pending.push(type)
    this.lastBlock = type
    if (type === 'river') this.riverDir = chance(this.rng, 0.5) ? 1 : -1
  }

  private emptyGrass(row: number): Lane {
    return { row, type: 'grass', trees: new Set(), treeVariants: new Map() }
  }

  /** Scenery only. The columns either side of the start stay clear regardless. */
  private decorGrass(row: number): Lane {
    const trees = new Set<number>()
    const treeVariants = new Map<number, number>()
    for (let col = T.grid.minCol; col <= T.grid.maxCol; col++) {
      if (Math.abs(col) <= 1) continue
      if (!chance(this.rng, T.grass.decorDensity)) continue
      trees.add(col)
      treeVariants.set(col, randInt(this.rng, 0, 2))
    }
    return { row, type: 'grass', trees, treeVariants }
  }

  private grass(row: number, difficulty: number): Lane {
    const drift = T.grass.corridorDrift
    this.corridor = clampCol(this.corridor + randInt(this.rng, -drift, drift))
    const density = lerp(T.grass.treeDensityMin, T.grass.treeDensityMax, difficulty)
    const trees = new Set<number>()
    const treeVariants = new Map<number, number>()
    for (let col = T.grid.minCol; col <= T.grid.maxCol; col++) {
      if (col === this.corridor) continue
      if (!chance(this.rng, density)) continue
      trees.add(col)
      treeVariants.set(col, randInt(this.rng, 0, 2))
    }
    return { row, type: 'grass', trees, treeVariants }
  }

  private road(row: number, difficulty: number): RoadLane {
    const dir: 1 | -1 = chance(this.rng, 0.5) ? 1 : -1
    const speed =
      randRange(this.rng, T.road.speedMin, T.road.speedMax) *
      lerp(1, T.road.speedScale, difficulty)
    const shrink = lerp(1, T.road.gapScale, difficulty)
    const gapMin = T.road.gapMin * shrink
    const gapMax = T.road.gapMax * shrink
    const cars = fillStream(this.rng, gapMin, gapMax, dir * speed, () => {
      const variant = randInt(this.rng, 0, T.road.variantWidths.length - 1)
      return { variant, width: T.road.variantWidths[variant]! }
    })
    return { row, type: 'road', dir, speed, cars, gapMin, gapMax }
  }

  private river(row: number, difficulty: number): RiverLane {
    // Consecutive rivers alternate, which is what makes a wide crossing readable.
    const dir = this.riverDir
    this.riverDir = (dir * -1) as 1 | -1
    const speed =
      randRange(this.rng, T.river.speedMin, T.river.speedMax) *
      lerp(1, T.river.speedScale, difficulty)
    const grow = lerp(1, T.river.gapScale, difficulty)
    const gapMin = T.river.gapMin * grow
    const gapMax = T.river.gapMax * grow
    const logs = fillStream(this.rng, gapMin, gapMax, dir * speed, () => ({
      variant: 0,
      width: randInt(this.rng, T.river.logMin, T.river.logMax),
    }))
    return { row, type: 'river', dir, speed, logs, gapMin, gapMax }
  }

  private rail(row: number): Lane {
    return {
      row,
      type: 'rail',
      dir: chance(this.rng, 0.5) ? 1 : -1,
      phase: 'idle',
      timer: randRange(this.rng, T.rail.idleMin, T.rail.idleMax),
      train: null,
    }
  }
}

function blockLength(type: LaneType): [number, number] {
  switch (type) {
    case 'grass':
      return [T.grass.blockMin, T.grass.blockMax]
    case 'road':
      return [T.road.blockMin, T.road.blockMax]
    case 'river':
      return [T.river.blockMin, T.river.blockMax]
    case 'rail':
      return [T.rail.blockMin, T.rail.blockMax]
  }
}

function clampCol(col: number): number {
  return Math.max(T.grid.minCol + 1, Math.min(T.grid.maxCol - 1, col))
}

/** Lays entities end to end across the whole span, so a lane is never born empty. */
function fillStream(
  rng: Rng,
  gapMin: number,
  gapMax: number,
  vx: number,
  spawn: () => { variant: number; width: number },
): LaneEntity[] {
  const out: LaneEntity[] = []
  let cursor = spanMin + randRange(rng, 0, gapMax)
  while (cursor < spanMax) {
    const { variant, width } = spawn()
    out.push({ x: cursor + width / 2, width, vx, variant })
    cursor += width + randRange(rng, gapMin, gapMax)
  }
  return out
}

export function updateLane(lane: Lane, dt: number, rng: Rng): void {
  switch (lane.type) {
    case 'grass':
      return
    case 'road':
      advanceStream(lane.cars, dt, lane.dir, lane.gapMin, lane.gapMax, rng)
      return
    case 'river':
      advanceStream(lane.logs, dt, lane.dir, lane.gapMin, lane.gapMax, rng)
      return
    case 'rail':
      advanceRail(lane, dt, rng)
      return
  }
}

function advanceStream(
  entities: LaneEntity[],
  dt: number,
  dir: 1 | -1,
  gapMin: number,
  gapMax: number,
  rng: Rng,
): void {
  for (const e of entities) e.x += e.vx * dt
  // Anything fully past the far edge goes to the back of the queue, which keeps the
  // stream endless without ever allocating.
  for (const e of entities) {
    if (dir > 0 && e.x - e.width / 2 > spanMax) {
      e.x = rearEdge(entities, e, dir) - randRange(rng, gapMin, gapMax) - e.width / 2
    } else if (dir < 0 && e.x + e.width / 2 < spanMin) {
      e.x = rearEdge(entities, e, dir) + randRange(rng, gapMin, gapMax) + e.width / 2
    }
  }
}

/** The trailing edge of the queue, ignoring the entity being recycled. */
function rearEdge(entities: LaneEntity[], self: LaneEntity, dir: 1 | -1): number {
  let edge = dir > 0 ? Infinity : -Infinity
  for (const o of entities) {
    if (o === self) continue
    edge = dir > 0 ? Math.min(edge, o.x - o.width / 2) : Math.max(edge, o.x + o.width / 2)
  }
  if (!Number.isFinite(edge)) return dir > 0 ? spanMin : spanMax
  return edge
}

function advanceRail(lane: Extract<Lane, { type: 'rail' }>, dt: number, rng: Rng): void {
  if (lane.phase === 'active') {
    const train = lane.train
    if (!train) {
      lane.phase = 'idle'
      lane.timer = randRange(rng, T.rail.idleMin, T.rail.idleMax)
      return
    }
    train.x += train.vx * dt
    const gone =
      lane.dir > 0 ? train.x - train.width / 2 > spanMax : train.x + train.width / 2 < spanMin
    if (gone) {
      lane.train = null
      lane.phase = 'idle'
      lane.timer = randRange(rng, T.rail.idleMin, T.rail.idleMax)
    }
    return
  }

  lane.timer -= dt
  if (lane.timer > 0) return

  if (lane.phase === 'idle') {
    lane.phase = 'warning'
    lane.timer = T.rail.warning
    return
  }

  lane.phase = 'active'
  lane.timer = 0
  const half = T.rail.length / 2
  lane.train = {
    x: lane.dir > 0 ? spanMin - half : spanMax + half,
    width: T.rail.length,
    vx: lane.dir * T.rail.speed,
    variant: 0,
  }
}

/** The log the player is standing on at world X, or null for open water. */
export function logAt(lane: RiverLane, x: number): LaneEntity | null {
  for (const log of lane.logs) {
    if (Math.abs(x - log.x) <= log.width / 2 + T.river.edgeGrip) return log
  }
  return null
}
