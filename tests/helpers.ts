import { World } from '../src/sim/world'
import type { Intent, LaneEntity, RailLane, RiverLane, RoadLane } from '../src/sim/types'

/**
 * Requests a hop and runs it to completion. Returns false if the hop was refused,
 * which is the interesting answer for tree and boundary tests.
 */
export function hop(w: World, intent: Intent): boolean {
  const before = w.hopsStarted
  w.queueIntent(intent)
  w.step()
  if (w.hopsStarted === before) return false
  let guard = 0
  while (w.player.hopping && w.state === 'playing' && guard++ < 240) w.step()
  return true
}

export function stepFor(w: World, seconds: number): void {
  const steps = Math.round(seconds * 60)
  for (let i = 0; i < steps && w.state === 'playing'; i++) w.step()
}

export function car(x: number, width = 2, vx = 0): LaneEntity {
  return { x, width, vx, variant: 0 }
}

export function roadLane(row: number, cars: LaneEntity[]): RoadLane {
  return { row, type: 'road', dir: 1, speed: 0, cars, gapMin: 3, gapMax: 6 }
}

export function riverLane(row: number, logs: LaneEntity[], dir: 1 | -1 = 1): RiverLane {
  return { row, type: 'river', dir, speed: 0, logs, gapMin: 2, gapMax: 3 }
}

export function railLane(row: number, train: LaneEntity | null): RailLane {
  return {
    row,
    type: 'rail',
    dir: 1,
    phase: train ? 'active' : 'idle',
    timer: 999,
    train,
  }
}

export function grassLane(row: number, trees: number[]) {
  return {
    row,
    type: 'grass' as const,
    trees: new Set(trees),
    treeVariants: new Map(trees.map((c) => [c, 0])),
  }
}
