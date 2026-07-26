import { LaneGenerator, logAt, updateLane } from './lanes'
import { mulberry32, type Rng } from './rng'
import * as T from './tuning'
import type { DeathCause, Intent, Lane, LaneEntity, PlayerState, Pose } from './types'

export type GameState = 'playing' | 'dead'

/**
 * The whole game. Advances in fixed steps and holds no reference to a renderer, a
 * canvas, or a clock — which is the only reason any of it is testable.
 */
export class World {
  readonly seed: number
  readonly lanes = new Map<number, Lane>()
  readonly player: PlayerState

  state: GameState = 'playing'
  death: DeathCause | null = null
  /** Furthest row reached. This is the score. */
  maxRow = 0
  /** Rows behind this line are fatal; it creeps forward on its own. */
  killRow: number
  prevKillRow: number
  elapsed = 0
  /** Bumped on every hop start, so the renderer can fire a trail puff. */
  hopsStarted = 0

  private readonly rng: Rng
  private readonly generator: LaneGenerator
  private bufferedIntent: Intent | null = null
  private bufferAge = 0
  /**
   * Generation starts behind the player, not at row 0. Without this the opening frame
   * shows the world ending in mid-air a few rows below the unicorn.
   */
  private generatedTo = -T.world.keepBehind - 1

  constructor(seed: number) {
    this.seed = seed >>> 0
    this.rng = mulberry32(this.seed)
    this.generator = new LaneGenerator(this.rng)
    this.killRow = -T.camera.killMargin
    this.prevKillRow = this.killRow
    this.player = {
      x: 0,
      row: 0,
      hopping: false,
      hopT: 0,
      fromX: 0,
      fromRow: 0,
      toX: 0,
      toRow: 0,
      facing: 'forward',
      onLog: null,
      prevX: 0,
      prevRowF: 0,
      prevY: 0,
    }
    this.generateAhead()
  }

  /** Where the camera looks: always at or ahead of the furthest row reached. */
  get cameraRow(): number {
    return this.killRow + T.camera.killMargin
  }

  get difficulty(): number {
    return Math.max(0, Math.min(1, this.maxRow / T.world.difficultyDistance))
  }

  /**
   * Queued rather than applied, so a hop pressed just before landing still counts.
   * The buffer expires — a press held from three lanes ago should not fire.
   */
  queueIntent(intent: Intent): void {
    this.bufferedIntent = intent
    this.bufferAge = 0
  }

  step(): void {
    if (this.state !== 'playing') return

    const dt = T.FIXED_DT
    const p = this.player
    const pose = this.pose()
    p.prevX = pose.x
    p.prevRowF = pose.rowF
    p.prevY = pose.y
    this.prevKillRow = this.killRow
    this.elapsed += dt

    if (this.bufferedIntent) {
      this.bufferAge += dt
      if (this.bufferAge > T.player.inputBuffer) this.bufferedIntent = null
    }

    this.generateAhead()
    this.prune()
    for (const lane of this.lanes.values()) updateLane(lane, dt, this.rng)

    if (p.hopping) {
      p.hopT += dt / T.player.hopDuration
      if (p.hopT >= 1) {
        p.hopping = false
        p.hopT = 0
        p.x = p.toX
        p.row = p.toRow
        if (p.row > this.maxRow) this.maxRow = p.row
      }
    }

    // The kill line advances before anything can end the run, so the camera is never
    // left inconsistent with the score on the frame the player dies.
    const scroll = Math.min(
      T.camera.maxScroll,
      T.camera.baseScroll + (T.camera.scrollRampPer100 * this.maxRow) / 100,
    )
    this.killRow = Math.max(this.killRow + scroll * dt, this.maxRow - T.camera.killMargin)

    // Hazards only bite on the ground; a hop clears the lane it passes over. The
    // grounded resolution has to finish — carry, then hazards — *before* the next hop
    // is allowed to start, or a buffered input would grant a free frame of immunity on
    // the landing step and let the player chain straight through traffic.
    if (!p.hopping) {
      const lane = this.lanes.get(p.row)
      if (lane?.type === 'river') {
        // Riding a log is the one thing that moves the player without a hop.
        const log = logAt(lane, p.x)
        if (!log) return this.die('water')
        p.onLog = log
        p.x += log.vx * dt
        if (p.x < T.grid.minCol - 1 || p.x > T.grid.maxCol + 1) return this.die('carried')
      } else {
        p.onLog = null
      }
      const hit = this.hazardAt(p.row, p.x)
      if (hit) return this.die(hit)
      if (this.bufferedIntent && this.tryHop(this.bufferedIntent)) this.bufferedIntent = null
    }

    if (p.row < this.killRow) return this.die('behind')
  }

  /** Interpolated between the last two steps. `alpha` is the leftover accumulator. */
  renderPose(alpha: number): Pose {
    const p = this.player
    const now = this.pose()
    return {
      x: p.prevX + (now.x - p.prevX) * alpha,
      rowF: p.prevRowF + (now.rowF - p.prevRowF) * alpha,
      y: p.prevY + (now.y - p.prevY) * alpha,
    }
  }

  renderKillRow(alpha: number): number {
    return this.prevKillRow + (this.killRow - this.prevKillRow) * alpha
  }

  private pose(): Pose {
    const p = this.player
    if (!p.hopping) return { x: p.x, rowF: p.row, y: 0 }
    const t = p.hopT
    return {
      x: p.fromX + (p.toX - p.fromX) * t,
      rowF: p.fromRow + (p.toRow - p.fromRow) * t,
      // Parabola peaking at hopHeight halfway across.
      y: T.player.hopHeight * 4 * t * (1 - t),
    }
  }

  private tryHop(intent: Intent): boolean {
    const p = this.player
    const dx = intent === 'left' ? -1 : intent === 'right' ? 1 : 0
    const dr = intent === 'forward' ? 1 : intent === 'back' ? -1 : 0
    // Riding a log leaves the player off-grid; a hop snaps to the nearest column.
    const toX = Math.round(p.x) + dx
    const toRow = p.row + dr

    if (toX < T.grid.minCol || toX > T.grid.maxCol) return false
    if (toRow < this.killRow) return false
    const lane = this.lanes.get(toRow)
    if (!lane) return false
    if (lane.type === 'grass' && lane.trees.has(toX)) return false

    p.hopping = true
    p.hopT = 0
    p.fromX = p.x
    p.fromRow = p.row
    p.toX = toX
    p.toRow = toRow
    p.facing = intent
    this.hopsStarted++
    return true
  }

  private hazardAt(row: number, x: number): DeathCause | null {
    const lane = this.lanes.get(row)
    if (!lane) return null
    if (lane.type === 'road') {
      return overlapsAny(lane.cars, x) ? 'car' : null
    }
    if (lane.type === 'rail') {
      return lane.train && overlaps(lane.train, x) ? 'train' : null
    }
    return null
  }

  private die(cause: DeathCause): void {
    this.state = 'dead'
    this.death = cause
  }

  private generateAhead(): void {
    const target = Math.ceil(this.cameraRow) + T.world.generateAhead
    for (let row = this.generatedTo + 1; row <= target; row++) {
      this.lanes.set(row, this.generator.next(row, this.difficulty))
    }
    if (target > this.generatedTo) this.generatedTo = target
  }

  private prune(): void {
    const cutoff = Math.floor(this.killRow) - T.world.keepBehind
    for (const row of this.lanes.keys()) {
      if (row < cutoff) this.lanes.delete(row)
    }
  }
}

function overlaps(e: LaneEntity, x: number): boolean {
  return Math.abs(x - e.x) < e.width / 2 + T.player.halfWidth
}

function overlapsAny(entities: readonly LaneEntity[], x: number): boolean {
  for (const e of entities) {
    if (overlaps(e, x)) return true
  }
  return false
}
