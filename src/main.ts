import './style.css'
import { Controls } from './input/controls'
import { GameRenderer } from './render/renderer'
import { FIXED_DT, MAX_FRAME_TIME } from './sim/tuning'
import { Hud } from './ui/hud'
import { World } from './sim/world'

/** A beat of dead time so the tap that killed you does not also restart the run. */
const RESTART_LOCKOUT = 0.6
/** Long enough for the squash or the sink to read before the panel covers it. */
const GAME_OVER_DELAY = 0.45

const canvas = document.querySelector<HTMLCanvasElement>('#game')
if (!canvas) throw new Error('missing #game canvas')

const renderer = new GameRenderer(canvas)
const controls = new Controls(document.body)
const hud = new Hud()

let world = new World(newSeed())
let deadFor = 0
let gameOverShown = false
let accumulator = 0
let last = performance.now() / 1000

/**
 * `?seed=123` pins the run. The sim is deterministic, so a seed reproduces a layout
 * exactly — which is how a "that lane was impossible" report becomes a test case.
 */
function newSeed(): number {
  const pinned = new URLSearchParams(location.search).get('seed')
  if (pinned !== null && pinned !== '' && Number.isFinite(Number(pinned))) {
    return Number(pinned) >>> 0
  }
  return (Math.random() * 0xffffffff) >>> 0
}

function restart(): void {
  world = new World(newSeed())
  deadFor = 0
  gameOverShown = false
  accumulator = 0
  controls.clear()
  hud.hideGameOver()
  hud.showHint()
}

hud.onRestart(restart)

function frame(nowMs: number): void {
  requestAnimationFrame(frame)

  const now = nowMs / 1000
  const dt = Math.min(now - last, MAX_FRAME_TIME)
  last = now

  if (world.state === 'playing') {
    accumulator += dt
    while (accumulator >= FIXED_DT) {
      const intent = controls.shift()
      if (intent) world.queueIntent(intent)
      world.step()
      accumulator -= FIXED_DT
      if (world.state !== 'playing') break
    }
    hud.update(world.maxRow, world.hopsStarted > 0)
  } else {
    // The sim is frozen, but the death animation and the camera keep running.
    accumulator = 0
    deadFor += dt
    if (!gameOverShown && deadFor > GAME_OVER_DELAY) {
      hud.showGameOver(world.maxRow, world.death)
      gameOverShown = true
    }
    if (deadFor > RESTART_LOCKOUT) {
      if (controls.shift()) restart()
    } else {
      controls.clear()
    }
  }

  renderer.render(world, accumulator / FIXED_DT, dt)
}

requestAnimationFrame(frame)
