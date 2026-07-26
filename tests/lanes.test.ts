import { describe, expect, it } from 'vitest'
import { LaneGenerator, logAt, spanMax, spanMin, updateLane } from '../src/sim/lanes'
import { mulberry32 } from '../src/sim/rng'
import * as T from '../src/sim/tuning'
import type { Lane } from '../src/sim/types'

function generate(seed: number, count: number): Lane[] {
  const gen = new LaneGenerator(mulberry32(seed))
  const out: Lane[] = []
  for (let row = 0; row < count; row++) {
    out.push(gen.next(row, Math.min(1, row / T.world.difficultyDistance)))
  }
  return out
}

function freeColumns(lane: Lane): number[] {
  if (lane.type !== 'grass') return []
  const out: number[] = []
  for (let c = T.grid.minCol; c <= T.grid.maxCol; c++) if (!lane.trees.has(c)) out.push(c)
  return out
}

describe('lane generation', () => {
  it('is reproducible from a seed', () => {
    const a = generate(42, 400).map((l) => l.type)
    const b = generate(42, 400).map((l) => l.type)
    expect(a).toEqual(b)
    expect(generate(43, 400).map((l) => l.type)).not.toEqual(a)
  })

  it('opens with safe empty grass', () => {
    for (const lane of generate(1, T.world.safeRows)) {
      expect(lane.type).toBe('grass')
      if (lane.type === 'grass') expect(lane.trees.size).toBe(0)
    }
  })

  it('produces every lane type within a few hundred rows', () => {
    const types = new Set(generate(7, 400).map((l) => l.type))
    expect([...types].sort()).toEqual(['grass', 'rail', 'river', 'road'])
  })

  it('always leaves a tree-free column on grass', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const lane of generate(seed, 600)) {
        if (lane.type === 'grass') expect(freeColumns(lane).length).toBeGreaterThan(0)
      }
    }
  })

  it('keeps consecutive grass lanes reachable from one another', () => {
    for (const seed of [1, 2, 3]) {
      const lanes = generate(seed, 600)
      for (let i = 1; i < lanes.length; i++) {
        const prev = lanes[i - 1]!
        const cur = lanes[i]!
        if (prev.type !== 'grass' || cur.type !== 'grass') continue
        const a = freeColumns(prev)
        const b = freeColumns(cur)
        const reachable = a.some((c1) => b.some((c2) => Math.abs(c1 - c2) <= 1))
        expect(reachable).toBe(true)
      }
    }
  })

  it('lands a river crossing on solid ground', () => {
    const lanes = generate(9, 800)
    for (let i = 0; i < lanes.length - 1; i++) {
      if (lanes[i]!.type !== 'river') continue
      const next = lanes[i + 1]!.type
      expect(next === 'river' || next === 'grass').toBe(true)
    }
  })

  it('never stacks more than two rail lanes', () => {
    const lanes = generate(21, 800)
    let run = 0
    for (const lane of lanes) {
      run = lane.type === 'rail' ? run + 1 : 0
      expect(run).toBeLessThanOrEqual(T.rail.blockMax)
    }
  })

  it('never lets a road or river lane be born empty', () => {
    for (const lane of generate(3, 600)) {
      if (lane.type === 'road') expect(lane.cars.length).toBeGreaterThan(0)
      if (lane.type === 'river') expect(lane.logs.length).toBeGreaterThan(0)
    }
  })

  it('speeds up and crowds together as difficulty rises', () => {
    const gen = new LaneGenerator(mulberry32(17))
    const sample = (difficulty: number) => {
      const speeds: number[] = []
      const gaps: number[] = []
      for (let row = 0; row < 4000; row++) {
        const lane = gen.next(row + T.world.safeRows, difficulty)
        if (lane.type === 'road') {
          speeds.push(lane.speed)
          gaps.push(lane.gapMax)
        }
      }
      return {
        speed: speeds.reduce((a, b) => a + b, 0) / speeds.length,
        gap: gaps.reduce((a, b) => a + b, 0) / gaps.length,
      }
    }
    const easy = sample(0)
    const hard = sample(1)
    expect(hard.speed).toBeGreaterThan(easy.speed)
    expect(hard.gap).toBeLessThan(easy.gap)
  })
})

describe('lane streams', () => {
  it('recycles traffic instead of running dry', () => {
    const rng = mulberry32(4)
    const gen = new LaneGenerator(rng)
    let lane: Lane | null = null
    for (let row = T.world.safeRows; row < 400 && !lane; row++) {
      const l = gen.next(row, 0)
      if (l.type === 'road') lane = l
    }
    expect(lane).not.toBeNull()
    const road = lane as Extract<Lane, { type: 'road' }>
    const initial = road.cars.length
    for (let i = 0; i < 60 * 120; i++) updateLane(road, T.FIXED_DT, rng)
    expect(road.cars.length).toBe(initial)
    for (const c of road.cars) {
      expect(c.x).toBeGreaterThan(spanMin - c.width - T.road.gapMax * 2)
      expect(c.x).toBeLessThan(spanMax + c.width + T.road.gapMax * 2)
    }
    // Traffic is still crossing the playfield two minutes in.
    const onScreen = road.cars.filter((c) => c.x > T.grid.minCol && c.x < T.grid.maxCol)
    expect(onScreen.length).toBeGreaterThan(0)
  })

  it('cycles a rail lane through idle, warning and train', () => {
    const rng = mulberry32(8)
    const lane: Lane = {
      row: 0,
      type: 'rail',
      dir: 1,
      phase: 'idle',
      timer: 0.5,
      train: null,
    }
    const seen = new Set<string>()
    for (let i = 0; i < 60 * 60; i++) {
      updateLane(lane, T.FIXED_DT, rng)
      seen.add(lane.phase)
    }
    expect([...seen].sort()).toEqual(['active', 'idle', 'warning'])
  })

  it('warns for the full lead time before the train arrives', () => {
    const rng = mulberry32(8)
    const lane: Lane = { row: 0, type: 'rail', dir: 1, phase: 'idle', timer: 0.1, train: null }
    let warningSteps = 0
    for (let i = 0; i < 60 * 30; i++) {
      updateLane(lane, T.FIXED_DT, rng)
      if (lane.phase === 'warning') warningSteps++
      if (lane.phase === 'active') break
    }
    expect(warningSteps * T.FIXED_DT).toBeCloseTo(T.rail.warning, 1)
  })
})

describe('logAt', () => {
  const lane = {
    row: 0,
    type: 'river' as const,
    dir: 1 as const,
    speed: 1,
    gapMin: 2,
    gapMax: 3,
    logs: [{ x: 0, width: 3, vx: 1, variant: 0 }],
  }

  it('finds the log under the player', () => {
    expect(logAt(lane, 0)).toBe(lane.logs[0])
    expect(logAt(lane, 1.4)).toBe(lane.logs[0])
  })

  it('returns null over open water', () => {
    expect(logAt(lane, 3)).toBeNull()
    expect(logAt(lane, -4)).toBeNull()
  })

  it('forgives the lip of the log by exactly edgeGrip', () => {
    expect(logAt(lane, 1.5 + T.river.edgeGrip - 0.001)).not.toBeNull()
    expect(logAt(lane, 1.5 + T.river.edgeGrip + 0.001)).toBeNull()
  })
})
