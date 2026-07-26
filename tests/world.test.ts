import { describe, expect, it } from 'vitest'
import { World } from '../src/sim/world'
import * as T from '../src/sim/tuning'
import type { Intent } from '../src/sim/types'
import { car, grassLane, hop, railLane, riverLane, roadLane, stepFor } from './helpers'

describe('hopping', () => {
  it('advances a row and scores it', () => {
    const w = new World(1)
    expect(hop(w, 'forward')).toBe(true)
    expect(w.player.row).toBe(1)
    expect(w.maxRow).toBe(1)
  })

  it('moves sideways without scoring', () => {
    const w = new World(1)
    hop(w, 'forward')
    hop(w, 'right')
    expect(w.player.row).toBe(1)
    expect(w.player.x).toBe(1)
    expect(w.maxRow).toBe(1)
  })

  it('does not lower the score when hopping back', () => {
    const w = new World(1)
    hop(w, 'forward')
    hop(w, 'forward')
    hop(w, 'back')
    expect(w.player.row).toBe(1)
    expect(w.maxRow).toBe(2)
  })

  it('refuses to leave the playfield', () => {
    const w = new World(1)
    for (let i = 0; i < T.grid.maxCol; i++) expect(hop(w, 'right')).toBe(true)
    expect(w.player.x).toBe(T.grid.maxCol)
    expect(hop(w, 'right')).toBe(false)
    expect(w.player.x).toBe(T.grid.maxCol)
  })

  it('refuses to hop into a tree', () => {
    const w = new World(1)
    w.lanes.set(1, grassLane(1, [0]))
    expect(hop(w, 'forward')).toBe(false)
    expect(w.player.row).toBe(0)
    w.lanes.set(1, grassLane(1, [1]))
    expect(hop(w, 'forward')).toBe(true)
  })

  it('arcs through the air and lands flat', () => {
    const w = new World(1)
    w.queueIntent('forward')
    w.step()
    const heights: number[] = []
    while (w.player.hopping) {
      heights.push(w.renderPose(1).y)
      w.step()
    }
    expect(Math.max(...heights)).toBeCloseTo(T.player.hopHeight, 1)
    expect(w.renderPose(1).y).toBe(0)
  })

  it('buffers an input pressed mid-hop', () => {
    const w = new World(1)
    w.queueIntent('forward')
    w.step()
    expect(w.player.hopping).toBe(true)
    w.queueIntent('forward')
    let guard = 0
    while (w.hopsStarted < 2 && guard++ < 120) w.step()
    expect(w.hopsStarted).toBe(2)
    expect(w.player.toRow).toBe(2)
  })

  it('drops a buffered input that goes stale', () => {
    const w = new World(1)
    w.queueIntent('forward')
    w.step()
    w.queueIntent('right')
    // Sit still long enough for the buffer to expire, but the hop is only ~0.14 s,
    // so the buffer has to outlive the landing to matter. Force it stale instead.
    const staleSteps = Math.ceil(T.player.inputBuffer / T.FIXED_DT) + 2
    w.player.hopping = true
    w.player.hopT = 0
    for (let i = 0; i < staleSteps; i++) {
      w.player.hopT = 0 // pin the hop open so only the buffer ages
      w.step()
    }
    w.player.hopping = false
    const before = w.hopsStarted
    w.step()
    expect(w.hopsStarted).toBe(before)
  })
})

describe('road hazards', () => {
  it('kills on contact with a car', () => {
    const w = new World(1)
    w.lanes.set(1, roadLane(1, [car(0, 2)]))
    hop(w, 'forward')
    expect(w.state).toBe('dead')
    expect(w.death).toBe('car')
  })

  it('lets a near miss through', () => {
    const w = new World(1)
    // Nearest edge sits just outside the player's half-width.
    w.lanes.set(1, roadLane(1, [car(1 + T.player.halfWidth + 0.02, 2)]))
    hop(w, 'forward')
    expect(w.state).toBe('playing')
  })

  it('is judged on where the hop lands, not on what it passed over', () => {
    const w = new World(1)
    // The car sweeps across the landing cell mid-hop and is clear of it by touchdown.
    w.lanes.set(1, roadLane(1, [car(2, 2, -30)]))
    hop(w, 'forward')
    expect(w.player.row).toBe(1)
    expect(w.state).toBe('playing')
  })

  it('does not let a buffered hop chain through a car', () => {
    const w = new World(1)
    w.lanes.set(1, roadLane(1, [car(0, 40)]))
    w.lanes.set(2, grassLane(2, []))
    w.queueIntent('forward')
    w.step()
    // Queue the next hop while still airborne: landing on row 1 must still be fatal.
    w.queueIntent('forward')
    while (w.player.hopping && w.state === 'playing') w.step()
    expect(w.player.row).toBe(1)
    expect(w.death).toBe('car')
  })

  it('kills on contact with a train', () => {
    const w = new World(1)
    w.lanes.set(1, railLane(1, { x: 0, width: 20, vx: 0, variant: 0 }))
    hop(w, 'forward')
    expect(w.death).toBe('train')
  })

  it('leaves a rail lane safe while the train is away', () => {
    const w = new World(1)
    w.lanes.set(1, railLane(1, null))
    hop(w, 'forward')
    expect(w.state).toBe('playing')
  })
})

describe('rivers', () => {
  it('drowns the player who lands on open water', () => {
    const w = new World(1)
    w.lanes.set(1, riverLane(1, []))
    hop(w, 'forward')
    expect(w.death).toBe('water')
  })

  it('carries the player along with the log', () => {
    const w = new World(1)
    w.lanes.set(1, riverLane(1, [{ x: 0, width: 6, vx: 1, variant: 0 }]))
    hop(w, 'forward')
    expect(w.state).toBe('playing')
    expect(w.player.onLog).not.toBeNull()
    const start = w.player.x
    stepFor(w, 1)
    expect(w.state).toBe('playing')
    expect(w.player.x - start).toBeCloseTo(1, 1)
  })

  it('drowns the player who hops to a spot the log has left', () => {
    const w = new World(1)
    // A moving log carries the player fine, but a lateral hop is judged against where
    // the log ends up, and this one is barely wider than the hop it drifts.
    w.lanes.set(1, riverLane(1, [{ x: 0, width: 2, vx: -2, variant: 0 }]))
    hop(w, 'forward')
    expect(w.state).toBe('playing')
    expect(w.player.onLog).not.toBeNull()
    hop(w, 'right')
    expect(w.death).toBe('water')
  })

  it('kills the player carried off the edge of the world', () => {
    const w = new World(1)
    w.lanes.set(1, riverLane(1, [{ x: 0, width: 40, vx: 4, variant: 0 }]))
    hop(w, 'forward')
    stepFor(w, 5)
    expect(w.death).toBe('carried')
  })

  it('snaps back to the grid when hopping off a log', () => {
    const w = new World(1)
    w.lanes.set(1, riverLane(1, [{ x: 0, width: 8, vx: 1, variant: 0 }]))
    w.lanes.set(2, grassLane(2, []))
    hop(w, 'forward')
    stepFor(w, 0.7)
    expect(w.player.x).not.toBe(Math.round(w.player.x))
    hop(w, 'forward')
    expect(w.player.row).toBe(2)
    expect(Number.isInteger(w.player.x)).toBe(true)
  })
})

describe('the kill line', () => {
  it('catches a player who never moves', () => {
    const w = new World(1)
    stepFor(w, 60)
    expect(w.death).toBe('behind')
  })

  it('never falls further behind than the kill margin', () => {
    const w = new World(1)
    for (let i = 0; i < 40; i++) {
      if (!hop(w, 'forward')) break
      expect(w.killRow).toBeLessThanOrEqual(w.maxRow - T.camera.killMargin + 1e-9)
    }
  })

  it('scrolls faster the further the run goes', () => {
    const near = new World(1)
    const far = new World(1)
    far.maxRow = 400
    const advance = (w: World) => {
      const before = w.killRow
      w.step()
      return w.killRow - before
    }
    // `far` is clamped to maxRow - killMargin, so read the raw ramp instead.
    far.killRow = far.maxRow - T.camera.killMargin - 10
    expect(advance(far)).toBeGreaterThan(advance(near))
  })

  it('keeps the camera at or ahead of the furthest row', () => {
    const w = new World(1)
    for (let i = 0; i < 20; i++) hop(w, 'forward')
    expect(w.cameraRow).toBeGreaterThanOrEqual(w.maxRow)
  })
})

describe('determinism', () => {
  it('replays identically from the same seed and inputs', () => {
    const script: (Intent | null)[] = []
    const rng = (() => {
      let s = 12345
      return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
    })()
    for (let i = 0; i < 3000; i++) {
      const r = rng()
      script.push(r < 0.45 ? 'forward' : r < 0.55 ? 'left' : r < 0.65 ? 'right' : null)
    }

    const run = (seed: number) => {
      const w = new World(seed)
      for (const intent of script) {
        if (intent) w.queueIntent(intent)
        w.step()
      }
      return { max: w.maxRow, x: w.player.x, row: w.player.row, state: w.state, death: w.death }
    }

    expect(run(2024)).toEqual(run(2024))
    expect(run(2024)).not.toEqual(run(2025))
  })

  it('never calls Math.random', () => {
    const original = Math.random
    Math.random = () => {
      throw new Error('the sim reached for Math.random')
    }
    try {
      const w = new World(77)
      for (let i = 0; i < 5000; i++) {
        if (i % 9 === 0) w.queueIntent('forward')
        w.step()
      }
    } finally {
      Math.random = original
    }
  })
})

describe('lane lifetime', () => {
  it('keeps a bounded window of lanes alive over a long run', () => {
    const w = new World(5)
    for (let i = 0; i < 300; i++) {
      if (w.state !== 'playing') break
      hop(w, 'forward')
      expect(w.lanes.size).toBeLessThan(
        T.world.generateAhead + T.world.keepBehind + T.camera.killMargin + 8,
      )
    }
    expect(w.maxRow).toBeGreaterThan(0)
  })

  it('always has a lane under the player', () => {
    const w = new World(6)
    for (let i = 0; i < 200 && w.state === 'playing'; i++) {
      hop(w, 'forward')
      expect(w.lanes.has(w.player.row)).toBe(true)
    }
  })
})
