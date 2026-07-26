export type LaneType = 'grass' | 'road' | 'river' | 'rail'

export type Intent = 'forward' | 'back' | 'left' | 'right'

export type DeathCause = 'car' | 'train' | 'water' | 'carried' | 'behind'

/** A hazard or platform living inside one lane. `x` is a world-space cell coordinate. */
export interface LaneEntity {
  x: number
  /** Full extent along X, in cells. */
  width: number
  /** Cells per second, signed. */
  vx: number
  /** Render variant index — colour for cars, size for trees. */
  variant: number
}

export interface GrassLane {
  row: number
  type: 'grass'
  /** Columns holding a tree. Hopping into one is refused. */
  trees: Set<number>
  /** Tree render variants, keyed by column. */
  treeVariants: Map<number, number>
}

export interface RoadLane {
  row: number
  type: 'road'
  dir: 1 | -1
  speed: number
  cars: LaneEntity[]
  /** Kept on the lane because recycling has to reproduce the original spacing. */
  gapMin: number
  gapMax: number
}

export interface RiverLane {
  row: number
  type: 'river'
  dir: 1 | -1
  speed: number
  logs: LaneEntity[]
  gapMin: number
  gapMax: number
}

export type RailPhase = 'idle' | 'warning' | 'active'

export interface RailLane {
  row: number
  type: 'rail'
  dir: 1 | -1
  phase: RailPhase
  /** Seconds left in the current phase; unused while `active`. */
  timer: number
  train: LaneEntity | null
}

export type Lane = GrassLane | RoadLane | RiverLane | RailLane

export interface PlayerState {
  /** Continuous world X. Fractional only while riding a log. */
  x: number
  row: number
  hopping: boolean
  /** Hop progress in [0, 1). */
  hopT: number
  fromX: number
  fromRow: number
  toX: number
  toRow: number
  /** Last direction hopped, for facing. */
  facing: Intent
  onLog: LaneEntity | null
  /** Interpolation source, captured at the top of every step. */
  prevX: number
  prevRowF: number
  prevY: number
}

export interface Pose {
  x: number
  /** Fractional row — whole numbers are lane centres. */
  rowF: number
  /** Height above the lane surface, in cells. */
  y: number
}
