import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const simDir = fileURLToPath(new URL('../src/sim', import.meta.url))

function simFiles(): string[] {
  return readdirSync(simDir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(simDir, f))
}

describe('src/sim', () => {
  it('has files to check', () => {
    expect(simFiles().length).toBeGreaterThan(3)
  })

  /**
   * The whole design rests on this: the sim is the game, the renderer only draws it.
   * The moment a Vector3 shows up in here, the game stops being testable in node.
   */
  it('never imports the renderer', () => {
    for (const file of simFiles()) {
      const source = readFileSync(file, 'utf8')
      expect(source, `${file} imports three`).not.toMatch(/from\s+['"]three/)
      expect(source, `${file} touches the DOM`).not.toMatch(/\b(document|window)\./)
    }
  })
})
