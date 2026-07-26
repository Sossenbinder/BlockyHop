// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Controls } from '../src/input/controls'
import * as T from '../src/sim/tuning'
import type { Intent } from '../src/sim/types'

const SWIPE = T.input.tapThreshold + 10

let controls: Controls | null = null

function makeControls(): Controls {
  controls?.dispose()
  controls = new Controls(document.body)
  return controls
}

afterEach(() => {
  controls?.dispose()
  controls = null
})

function pointer(type: string, id: number, x: number, y: number): Event {
  const e = new Event(type, { bubbles: true }) as Event & {
    pointerId: number
    clientX: number
    clientY: number
  }
  e.pointerId = id
  e.clientX = x
  e.clientY = y
  return e
}

function down(id: number, x: number, y: number): void {
  document.body.dispatchEvent(pointer('pointerdown', id, x, y))
}
function move(id: number, x: number, y: number): void {
  window.dispatchEvent(pointer('pointermove', id, x, y))
}
function up(id: number, x: number, y: number): void {
  window.dispatchEvent(pointer('pointerup', id, x, y))
}

function drain(c: Controls): Intent[] {
  const out: Intent[] = []
  for (;;) {
    const intent = c.shift()
    if (!intent) return out
    out.push(intent)
  }
}

describe('taps', () => {
  it('reads a press and release as forward', () => {
    const c = makeControls()
    down(1, 100, 100)
    up(1, 100, 100)
    expect(drain(c)).toEqual(['forward'])
  })

  it('forgives a wandering thumb', () => {
    const c = makeControls()
    down(1, 100, 100)
    move(1, 100 + T.input.tapThreshold - 2, 104)
    up(1, 100 + T.input.tapThreshold - 2, 104)
    expect(drain(c)).toEqual(['forward'])
  })

  it('ignores a release from a finger it never saw press', () => {
    const c = makeControls()
    up(9, 100, 100)
    expect(drain(c)).toEqual([])
  })
})

describe('swipes', () => {
  it('fires on crossing the threshold, not on release', () => {
    const c = makeControls()
    down(1, 200, 200)
    move(1, 200 + SWIPE, 200)
    expect(drain(c)).toEqual(['right'])
    up(1, 200 + SWIPE, 200)
    expect(drain(c)).toEqual([])
  })

  it('maps all four directions from the dominant axis', () => {
    const cases: Array<[number, number, Intent]> = [
      [SWIPE, 0, 'right'],
      [-SWIPE, 0, 'left'],
      [0, -SWIPE, 'forward'],
      [0, SWIPE, 'back'],
      [SWIPE, 12, 'right'],
      [10, -SWIPE, 'forward'],
    ]
    for (const [dx, dy, expected] of cases) {
      const c = makeControls()
      down(1, 200, 200)
      move(1, 200 + dx, 200 + dy)
      expect(drain(c), `${dx},${dy}`).toEqual([expected])
    }
  })

  it('produces one intent per gesture however far the finger travels', () => {
    const c = makeControls()
    down(1, 200, 200)
    for (let i = 1; i <= 8; i++) move(1, 200 + SWIPE * i, 200)
    up(1, 900, 200)
    expect(drain(c)).toEqual(['right'])
  })

  it('does not track a pointer that never pressed', () => {
    const c = makeControls()
    move(1, 400, 400)
    expect(drain(c)).toEqual([])
  })
})

describe('multiple fingers', () => {
  it('lets alternating thumbs each land a hop', () => {
    const c = makeControls()
    down(1, 100, 700)
    down(2, 300, 700)
    up(1, 100, 700)
    up(2, 300, 700)
    expect(drain(c)).toEqual(['forward', 'forward'])
  })

  it('keeps one finger a swipe and the other a tap', () => {
    const c = makeControls()
    down(1, 100, 700)
    down(2, 300, 700)
    move(1, 100 - SWIPE, 700)
    up(1, 100 - SWIPE, 700)
    up(2, 300, 700)
    expect(drain(c)).toEqual(['left', 'forward'])
  })
})

describe('the queue', () => {
  it('caps at three so a mash cannot bank a run', () => {
    const c = makeControls()
    for (let i = 0; i < 8; i++) {
      down(i, 100, 100)
      up(i, 100, 100)
    }
    expect(drain(c).length).toBe(3)
  })

  it('drops queued intents and gestures in flight on clear', () => {
    const c = makeControls()
    down(1, 100, 100)
    up(1, 100, 100)
    down(2, 200, 200)
    c.clear()
    expect(drain(c)).toEqual([])
    // Finger 2 was mid-gesture when the run restarted; its release must not hop.
    up(2, 200, 200)
    expect(drain(c)).toEqual([])
  })
})

describe('keyboard', () => {
  it('maps arrows, WASD and space', () => {
    const cases: Array<[string, Intent]> = [
      ['ArrowUp', 'forward'],
      ['ArrowDown', 'back'],
      ['ArrowLeft', 'left'],
      ['ArrowRight', 'right'],
      ['KeyW', 'forward'],
      ['KeyA', 'left'],
      ['Space', 'forward'],
    ]
    for (const [code, expected] of cases) {
      const c = makeControls()
      window.dispatchEvent(new KeyboardEvent('keydown', { code }))
      expect(drain(c), code).toEqual([expected])
    }
  })

  it('ignores unmapped keys and auto-repeat', () => {
    const c = makeControls()
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', repeat: true }))
    expect(drain(c)).toEqual([])
  })
})
