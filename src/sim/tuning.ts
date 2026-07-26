/**
 * Every number that governs how the game feels lives here. Nothing outside this file
 * hard-codes a constant — the tuning pass is meant to be editing one file.
 *
 * Values marked "guess" have never been playtested; they are physically sensible
 * starting points, not answers.
 */

/** The one true step. Changing this changes the game, not just the smoothness. */
export const FIXED_DT = 1 / 60

/** Largest wall-clock chunk the loop will simulate at once, so a tab-out cannot spiral. */
export const MAX_FRAME_TIME = 0.25

export const grid = {
  /** Playable columns, inclusive. 19 wide — comfortably more than a phone shows. */
  minCol: -9,
  maxCol: 9,
  /** Entities live out to here before being recycled; keeps traffic streaming in. */
  spawnMargin: 14,
} as const

export const player = {
  /** Collision half-width in cells. Slightly under half a cell, so near-misses miss. */
  halfWidth: 0.34,
  /** Seconds per hop. Short — the genre lives on input responsiveness. (guess) */
  hopDuration: 0.14,
  /** Peak height of the hop arc, in cells. Cosmetic, but sold by the shadow. */
  hopHeight: 0.6,
  /** A hop pressed this long before landing still fires. Removes "it ate my input". */
  inputBuffer: 0.22,
} as const

export const camera = {
  /** How far behind the furthest row reached the kill line sits. */
  killMargin: 5,
  /** Kill-line scroll in rows/second at distance 0. (guess) */
  baseScroll: 0.5,
  /** Added rows/second per 100 rows travelled. (guess) */
  scrollRampPer100: 0.35,
  /** Hard ceiling on the scroll, or the late game becomes a cutscene. (guess) */
  maxScroll: 2.4,
} as const

export const world = {
  /** Rows kept generated ahead of the camera. Must exceed the deepest view (portrait). */
  generateAhead: 40,
  /** Rows kept alive behind the kill line, and generated behind the start. */
  keepBehind: 14,
  /** Opening rows that are guaranteed safe empty grass. */
  safeRows: 4,
  /** Rows travelled to reach maximum difficulty. */
  difficultyDistance: 250,
} as const

export const road = {
  /** Cars per lane move at one speed; the range widens with difficulty. (guess) */
  speedMin: 2.6,
  speedMax: 5.2,
  /** Multiplier applied to speed at full difficulty. */
  speedScale: 1.7,
  /** Gap between cars in cells, at zero difficulty. (guess) */
  gapMin: 3.4,
  gapMax: 9.0,
  /** Gaps shrink toward this fraction of themselves at full difficulty. */
  gapScale: 0.55,
  /** Widths of the vehicle variants, in cells. Index matches the render variant. */
  variantWidths: [1.8, 1.8, 2.0, 2.0, 2.6, 3.4],
  /** Lanes per road block. */
  blockMin: 1,
  blockMax: 4,
} as const

export const river = {
  speedMin: 1.2,
  speedMax: 2.8,
  speedScale: 1.45,
  /** Log lengths in cells. Short logs are the difficulty knob that matters. */
  logMin: 2,
  logMax: 5,
  /** Water between logs, in cells. Must stay hoppable. (guess) */
  gapMin: 1.3,
  gapMax: 3.2,
  gapScale: 1.35,
  /** How far past a log's edge the player's centre may sit and still count as aboard. */
  edgeGrip: 0.1,
  blockMin: 1,
  blockMax: 3,
} as const

export const rail = {
  /** Trains are fast enough that the warning, not the dodge, is the mechanic. */
  speed: 26,
  length: 22,
  /** Seconds of flashing signal before the train arrives. (guess) */
  warning: 1.15,
  idleMin: 1.6,
  idleMax: 4.5,
  blockMin: 1,
  blockMax: 2,
} as const

export const grass = {
  /** Fraction of columns holding a tree, at zero and full difficulty. (guess) */
  treeDensityMin: 0.14,
  treeDensityMax: 0.3,
  /** The corridor column shifts by at most this per lane, guaranteeing a path. */
  corridorDrift: 1,
  /** Density behind the start line, where trees are decoration rather than obstacle. */
  decorDensity: 0.26,
  blockMin: 1,
  blockMax: 2,
} as const

/** Lane-block weights at zero difficulty and at full difficulty; lerped between. */
export const laneWeights = {
  easy: { grass: 3.4, road: 3.4, river: 1.6, rail: 0.7 },
  hard: { grass: 1.8, road: 3.8, river: 2.2, rail: 1.8 },
} as const

export const input = {
  /**
   * Pointer travel below this (CSS px) is a tap, which means "forward"; crossing it
   * mid-gesture fires a swipe. Well above a thumb's tap drift (~10 px) so a sloppy tap
   * is not read as a steer, well below a deliberate flick so steering still feels fast.
   */
  tapThreshold: 32,
} as const
