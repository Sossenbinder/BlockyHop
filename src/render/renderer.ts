import * as THREE from 'three'
import { FIXED_DT } from '../sim/tuning'
import * as T from '../sim/tuning'
import type { Lane, LaneEntity } from '../sim/types'
import type { World } from '../sim/world'
import { background, buildByKey, lampMaterials, type TileView } from './models'
import { Pool } from './pool'

/**
 * A tall phone wants more columns than its width gives, but letting it have all of
 * them makes the view so deep the unicorn turns into a speck. The ceiling is the
 * compromise: roughly nine columns in portrait, a wide view on desktop.
 */
const MIN_VIEW_WIDTH = 11
const MIN_VIEW_HEIGHT = 15
const MAX_VIEW_HEIGHT = 19
/** Orthographic, so this only decides where the near/far planes sit. */
const CAMERA_DISTANCE = 60
const CAMERA_DIR = new THREE.Vector3(0.55, 1, 1).normalize()
/**
 * Rows past the player the camera looks. This is what puts the unicorn in the lower
 * third with the traffic laid out above it, rather than dead centre with half the
 * screen showing where you have already been.
 */
const CAMERA_LOOKAHEAD = 4

const TRAIL_COLORS = [0xff6b8b, 0xffb648, 0xffe95c, 0x6fe08a, 0x5cc9ff, 0xb08bff]
const TRAIL_LIFE = 0.55

interface View {
  key: string
  obj: THREE.Object3D
}

interface TrailPuff {
  mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
  life: number
  baseY: number
}

export class GameRenderer {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 200)
  private readonly sun = new THREE.DirectionalLight(0xfff6e8, 2.6)
  private readonly pool = new Pool(buildByKey)

  private readonly tiles = new Map<number, View>()
  private readonly trees = new Map<string, View>()
  private readonly entities = new Map<LaneEntity, View>()
  private readonly player: THREE.Object3D
  private readonly trail: TrailPuff[] = []
  private readonly freeTrail: TrailPuff[] = []

  private camX = 0
  private camZ = 0
  private facing = 0
  private lastHops = 0
  private deathT = 0
  private lastWorld: World | null = null

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.scene.background = new THREE.Color(background)

    const sky = new THREE.HemisphereLight(0xdff0ff, 0x5f8a55, 1.7)
    this.scene.add(sky)

    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(1024, 1024)
    const shadowCam = this.sun.shadow.camera
    shadowCam.left = -17
    shadowCam.right = 17
    shadowCam.top = 24
    shadowCam.bottom = -24
    shadowCam.near = 1
    shadowCam.far = 120
    // Boxes lit at a grazing angle acne badly without this.
    this.sun.shadow.normalBias = 0.05
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)

    this.player = this.pool.acquire('unicorn')
    this.scene.add(this.player)

    this.resize()
    window.addEventListener('resize', this.resize)
  }

  private readonly resize = (): void => {
    const width = this.canvas.clientWidth || window.innerWidth
    const height = this.canvas.clientHeight || window.innerHeight
    this.renderer.setSize(width, height, false)
    const aspect = width / height
    const view = Math.min(MAX_VIEW_HEIGHT, Math.max(MIN_VIEW_HEIGHT, MIN_VIEW_WIDTH / aspect))
    const halfHeight = view / 2
    this.camera.top = halfHeight
    this.camera.bottom = -halfHeight
    this.camera.left = -halfHeight * aspect
    this.camera.right = halfHeight * aspect
    this.camera.updateProjectionMatrix()
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize)
    this.renderer.dispose()
  }

  render(world: World, alpha: number, dt: number): void {
    if (world !== this.lastWorld) this.adoptWorld(world)

    const pose = world.renderPose(alpha)
    const entityAlpha = alpha * FIXED_DT

    this.syncTiles(world)
    this.syncEntities(world, entityAlpha)
    this.syncPlayer(world, pose, dt)
    this.syncTrail(world, pose, dt)
    this.syncCamera(world, pose, alpha, dt)

    this.renderer.render(this.scene, this.camera)
  }

  private adoptWorld(world: World): void {
    this.lastWorld = world
    this.deathT = 0
    this.lastHops = world.hopsStarted
    this.facing = 0
    this.player.rotation.set(0, 0, 0)
    this.player.scale.set(1, 1, 1)
    for (const puff of this.trail.splice(0)) this.retireTrail(puff)
  }

  // ------------------------------------------------------------------- tiles

  private syncTiles(world: World): void {
    const seenRows = new Set<number>()
    const seenTrees = new Set<string>()

    for (const lane of world.lanes.values()) {
      seenRows.add(lane.row)
      const key = tileKey(lane)
      let view = this.tiles.get(lane.row)
      if (view && view.key !== key) {
        this.pool.release(view.key, view.obj)
        view = undefined
      }
      if (!view) {
        const obj = this.pool.acquire(key)
        this.scene.add(obj)
        view = { key, obj }
        this.tiles.set(lane.row, view)
      }
      view.obj.position.set(0, 0, -lane.row)

      if (lane.type === 'rail') {
        const { lamps, warnings } = (view.obj as TileView).userData
        const lit = lane.phase !== 'idle' && Math.floor(world.elapsed * 5) % 2 === 0
        if (lamps) {
          const material = lit ? lampMaterials.on() : lampMaterials.off()
          for (const lamp of lamps) lamp.material = material
        }
        if (warnings) for (const stripe of warnings) stripe.visible = lit
      }

      if (lane.type === 'grass') {
        for (const col of lane.trees) {
          const id = `${lane.row}:${col}`
          seenTrees.add(id)
          if (this.trees.has(id)) continue
          const treeKey = `tree:${lane.treeVariants.get(col) ?? 0}`
          const obj = this.pool.acquire(treeKey)
          obj.position.set(col, 0, -lane.row)
          this.scene.add(obj)
          this.trees.set(id, { key: treeKey, obj })
        }
      }
    }

    for (const [row, view] of this.tiles) {
      if (seenRows.has(row)) continue
      this.pool.release(view.key, view.obj)
      this.tiles.delete(row)
    }
    for (const [id, view] of this.trees) {
      if (seenTrees.has(id)) continue
      this.pool.release(view.key, view.obj)
      this.trees.delete(id)
    }
  }

  // ---------------------------------------------------------------- entities

  private syncEntities(world: World, entityAlpha: number): void {
    const seen = new Set<LaneEntity>()
    for (const lane of world.lanes.values()) {
      if (lane.type === 'road') {
        for (const car of lane.cars) this.placeEntity(car, `car:${car.variant}`, lane.row, entityAlpha)
      } else if (lane.type === 'river') {
        for (const log of lane.logs) this.placeEntity(log, `log:${log.width}`, lane.row, entityAlpha)
      } else if (lane.type === 'rail' && lane.train) {
        this.placeEntity(lane.train, 'train', lane.row, entityAlpha)
      }
      if (lane.type === 'road') for (const car of lane.cars) seen.add(car)
      if (lane.type === 'river') for (const log of lane.logs) seen.add(log)
      if (lane.type === 'rail' && lane.train) seen.add(lane.train)
    }

    for (const [entity, view] of this.entities) {
      if (seen.has(entity)) continue
      this.pool.release(view.key, view.obj)
      this.entities.delete(entity)
    }
  }

  private placeEntity(entity: LaneEntity, key: string, row: number, entityAlpha: number): void {
    let view = this.entities.get(entity)
    if (!view) {
      const obj = this.pool.acquire(key)
      this.scene.add(obj)
      view = { key, obj }
      this.entities.set(entity, view)
    }
    // Entities move at a constant velocity, so extrapolating beats storing a previous
    // position for every car in the world.
    view.obj.position.set(entity.x + entity.vx * entityAlpha, 0, -row)
    view.obj.rotation.y = entity.vx < 0 ? Math.PI : 0
  }

  // ------------------------------------------------------------------ player

  private syncPlayer(world: World, pose: { x: number; rowF: number; y: number }, dt: number): void {
    const p = this.player
    p.position.set(pose.x, pose.y, -pose.rowF)

    const target = facingAngle(world.player.facing)
    this.facing += shortestAngle(this.facing, target) * (1 - Math.exp(-dt * 22))
    p.rotation.y = this.facing

    // Squash on take-off and landing, stretch at the top of the arc.
    const t = world.player.hopping ? world.player.hopT : 0
    const squash = Math.sin(Math.PI * t)
    p.scale.set(1 - 0.14 * squash, 1 + 0.24 * squash, 1 - 0.14 * squash)

    if (world.state !== 'dead') return
    this.deathT += dt
    if (world.death === 'car' || world.death === 'train') {
      const flat = Math.max(0.12, 1 - this.deathT * 7)
      const spread = 1 + (1 - flat) * 0.7
      p.scale.set(spread, flat, spread)
      p.position.y = 0
    } else if (world.death === 'water') {
      p.position.y = Math.max(-1.1, -this.deathT * 1.6)
    }
  }

  // ------------------------------------------------------------------- trail

  private syncTrail(world: World, pose: { x: number; rowF: number }, dt: number): void {
    if (world.hopsStarted > this.lastHops && world.state === 'playing') {
      // A burst of three, because a single flat pad seen at this camera angle is a
      // smudge. Rising cubes read as sparkle from every direction.
      const hop = world.hopsStarted
      for (let i = 0; i < 3; i++) {
        const color = TRAIL_COLORS[(hop + i) % TRAIL_COLORS.length]!
        this.spawnTrail(pose.x + (i - 1) * 0.26, -pose.rowF + (i % 2 ? 0.16 : -0.1), color, i)
      }
      this.lastHops = hop
    }

    for (let i = this.trail.length - 1; i >= 0; i--) {
      const puff = this.trail[i]!
      puff.life -= dt
      if (puff.life <= 0) {
        this.trail.splice(i, 1)
        this.retireTrail(puff)
        continue
      }
      const k = puff.life / TRAIL_LIFE
      puff.material.opacity = Math.min(1, k * 1.3)
      const size = 0.34 * k + 0.05
      puff.mesh.scale.set(size, size, size)
      puff.mesh.position.y = puff.baseY + (1 - k) * 0.75
      puff.mesh.rotation.y = (1 - k) * 2.2
    }
  }

  private spawnTrail(x: number, z: number, color: number, index: number): void {
    const puff = this.freeTrail.pop() ?? this.createTrail()
    puff.material.color.setHex(color)
    puff.material.opacity = 1
    puff.life = TRAIL_LIFE
    puff.baseY = 0.12 + index * 0.09
    puff.mesh.position.set(x, puff.baseY, z)
    puff.mesh.visible = true
    this.scene.add(puff.mesh)
    this.trail.push(puff)
  }

  private createTrail(): TrailPuff {
    const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material)
    return { mesh, material, life: 0, baseY: 0 }
  }

  private retireTrail(puff: TrailPuff): void {
    puff.mesh.visible = false
    this.scene.remove(puff.mesh)
    this.freeTrail.push(puff)
  }

  // ------------------------------------------------------------------ camera

  private syncCamera(
    world: World,
    pose: { x: number; rowF: number },
    alpha: number,
    dt: number,
  ): void {
    const targetZ = -(world.renderKillRow(alpha) + T.camera.killMargin + CAMERA_LOOKAHEAD)
    this.camZ += (targetZ - this.camZ) * (1 - Math.exp(-dt * 9))

    // The camera is yawed, so looking a few rows ahead also slides the view sideways
    // and pushes the unicorn off-centre. Cancel it: the look-at point has to sit on the
    // screen-vertical line through the player, which for this yaw means leaning X by
    // dir.x/dir.z per row of look-ahead.
    const playerZ = -pose.rowF
    const lean = (CAMERA_DIR.x / CAMERA_DIR.z) * (this.camZ - playerZ)
    const targetX = Math.max(T.grid.minCol, Math.min(T.grid.maxCol, pose.x)) + lean
    this.camX += (targetX - this.camX) * (1 - Math.exp(-dt * 6))

    this.camera.position.set(
      this.camX + CAMERA_DIR.x * CAMERA_DISTANCE,
      CAMERA_DIR.y * CAMERA_DISTANCE,
      this.camZ + CAMERA_DIR.z * CAMERA_DISTANCE,
    )
    this.camera.lookAt(this.camX, 0, this.camZ)

    this.sun.position.set(this.camX + 14, 32, this.camZ + 10)
    this.sun.target.position.set(this.camX, 0, this.camZ)
    this.sun.target.updateMatrixWorld()
  }
}

function tileKey(lane: Lane): string {
  if (lane.type === 'grass') return `tile:grass${((lane.row % 2) + 2) % 2}`
  return `tile:${lane.type}`
}

function facingAngle(facing: string): number {
  switch (facing) {
    case 'back':
      return Math.PI
    case 'left':
      return Math.PI / 2
    case 'right':
      return -Math.PI / 2
    default:
      return 0
  }
}

/** Signed delta from `from` to `to` taking the short way round. */
function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}
