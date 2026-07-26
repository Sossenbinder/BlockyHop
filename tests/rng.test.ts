import { describe, expect, it } from 'vitest'
import { mulberry32, randInt, weighted } from '../src/sim/rng'

describe('mulberry32', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(1234)
    const b = mulberry32(1234)
    const left = Array.from({ length: 200 }, () => a())
    const right = Array.from({ length: 200 }, () => b())
    expect(left).toEqual(right)
  })

  it('gives different streams for different seeds', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    expect(a()).not.toBe(b())
  })

  it('stays inside [0, 1)', () => {
    const rng = mulberry32(99)
    for (let i = 0; i < 10_000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('spreads roughly evenly across ten buckets', () => {
    const rng = mulberry32(7)
    const buckets = new Array(10).fill(0)
    const n = 100_000
    for (let i = 0; i < n; i++) buckets[Math.floor(rng() * 10)]++
    for (const count of buckets) expect(Math.abs(count - n / 10)).toBeLessThan(n / 50)
  })
})

describe('randInt', () => {
  it('is inclusive on both ends and never escapes them', () => {
    const rng = mulberry32(5)
    const seen = new Set<number>()
    for (let i = 0; i < 5_000; i++) {
      const v = randInt(rng, -2, 2)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(-2)
      expect(v).toBeLessThanOrEqual(2)
      seen.add(v)
    }
    expect(seen.size).toBe(5)
  })
})

describe('weighted', () => {
  it('never picks a zero-weight entry', () => {
    const rng = mulberry32(11)
    for (let i = 0; i < 2_000; i++) expect(weighted(rng, [1, 0, 1])).not.toBe(1)
  })

  it('respects the weight ratio', () => {
    const rng = mulberry32(13)
    let ones = 0
    const n = 20_000
    for (let i = 0; i < n; i++) if (weighted(rng, [3, 1]) === 1) ones++
    expect(ones / n).toBeCloseTo(0.25, 1)
  })
})
