import type * as THREE from 'three'

/**
 * Objects are recycled by key rather than rebuilt, because a run generates lanes
 * forever and allocating a tree per lane would hand the GC a job every second.
 */
export class Pool {
  private readonly free = new Map<string, THREE.Object3D[]>()

  constructor(private readonly build: (key: string) => THREE.Object3D) {}

  acquire(key: string): THREE.Object3D {
    const bucket = this.free.get(key)
    const reused = bucket?.pop()
    if (reused) {
      reused.visible = true
      return reused
    }
    return this.build(key)
  }

  release(key: string, obj: THREE.Object3D): void {
    obj.visible = false
    obj.parent?.remove(obj)
    let bucket = this.free.get(key)
    if (!bucket) {
      bucket = []
      this.free.set(key, bucket)
    }
    bucket.push(obj)
  }
}
