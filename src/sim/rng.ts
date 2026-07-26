/** Deterministic PRNG. The sim must never call Math.random — a run has to be replayable. */

export type Rng = () => number

/** mulberry32: 32 bits of state, good enough distribution, three lines. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min)
}

/** Inclusive on both ends. */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!
}

export function chance(rng: Rng, p: number): boolean {
  return rng() < p
}

/** Picks an index from a weight table. Weights need not sum to 1. */
export function weighted(rng: Rng, weights: readonly number[]): number {
  let total = 0
  for (const w of weights) total += w
  let roll = rng() * total
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i]!
    if (roll <= 0) return i
  }
  return weights.length - 1
}
