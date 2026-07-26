import * as T from '../sim/tuning'
import type { Intent } from '../sim/types'

const KEYS: Record<string, Intent> = {
  ArrowUp: 'forward',
  ArrowDown: 'back',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'forward',
  KeyS: 'back',
  KeyA: 'left',
  KeyD: 'right',
  Space: 'forward',
}

interface Touch {
  x: number
  y: number
  /** True once this gesture has produced a swipe; it will not produce a tap too. */
  fired: boolean
}

/**
 * Turns keys and pointer gestures into a short queue of intents.
 *
 * Three things matter on a phone and each is easy to get wrong:
 * a tap means forward, because that is nine hops out of ten; a swipe fires the moment
 * it crosses the threshold rather than on release, because waiting for the finger to
 * lift is a tenth of a second of lag on every steer; and every finger is tracked
 * separately, because players alternate thumbs and dropping the second one feels like
 * a dropped input.
 */
export class Controls {
  private readonly queue: Intent[] = []
  private readonly touches = new Map<number, Touch>()

  constructor(private readonly target: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown)
    target.addEventListener('pointerdown', this.onPointerDown)
    // Up and move go on the window: a finger that leaves the element, or lifts over the
    // game-over panel, still has to end its gesture.
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerCancel)
    target.addEventListener('contextmenu', this.onContextMenu)
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    this.target.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('pointercancel', this.onPointerCancel)
    this.target.removeEventListener('contextmenu', this.onContextMenu)
  }

  /** One intent per fixed step; the queue is capped so a mash cannot bank a run. */
  shift(): Intent | null {
    return this.queue.shift() ?? null
  }

  /** Drops queued intents and abandons gestures in flight, so a restart starts clean. */
  clear(): void {
    this.queue.length = 0
    this.touches.clear()
  }

  private push(intent: Intent): void {
    if (this.queue.length >= 3) this.queue.shift()
    this.queue.push(intent)
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const intent = KEYS[e.code]
    if (!intent) return
    e.preventDefault()
    if (e.repeat) return
    this.push(intent)
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY, fired: false })
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    const touch = this.touches.get(e.pointerId)
    if (!touch || touch.fired) return
    const dx = e.clientX - touch.x
    const dy = e.clientY - touch.y
    if (Math.hypot(dx, dy) < T.input.tapThreshold) return
    touch.fired = true
    if (Math.abs(dx) > Math.abs(dy)) this.push(dx > 0 ? 'right' : 'left')
    else this.push(dy > 0 ? 'back' : 'forward')
  }

  private readonly onPointerUp = (e: PointerEvent): void => {
    const touch = this.touches.get(e.pointerId)
    if (!touch) return
    this.touches.delete(e.pointerId)
    // A release that never crossed the threshold is a tap, however much it wandered.
    if (!touch.fired) this.push('forward')
  }

  private readonly onPointerCancel = (e: PointerEvent): void => {
    this.touches.delete(e.pointerId)
  }

  /** Long-pressing the playfield should not open the Android text menu. */
  private readonly onContextMenu = (e: Event): void => {
    e.preventDefault()
  }
}
