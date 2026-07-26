import type { DeathCause } from '../sim/types'

const BEST_KEY = 'blockyhop.best'

const CAUSES: Record<DeathCause, string> = {
  car: 'Flattened by traffic',
  train: 'Should have watched the signal',
  water: 'Unicorns do not float',
  carried: 'Carried off downstream',
  behind: 'Left behind',
}

export class Hud {
  private readonly score: HTMLElement
  private readonly bestLabel: HTMLElement
  private readonly hint: HTMLElement
  private readonly overlay: HTMLElement
  private readonly overlayCause: HTMLElement
  private readonly overlayScore: HTMLElement
  private readonly overlayBest: HTMLElement
  private best: number

  constructor(root: ParentNode = document) {
    this.score = must(root, '#score')
    this.bestLabel = must(root, '#best')
    this.hint = must(root, '#hint')
    this.overlay = must(root, '#overlay')
    this.overlayCause = must(root, '#overlay-cause')
    this.overlayScore = must(root, '#overlay-score')
    this.overlayBest = must(root, '#overlay-best')
    this.best = readBest()
    this.bestLabel.textContent = `Best ${this.best}`
  }

  update(score: number, hopped: boolean): void {
    this.score.textContent = String(score)
    if (hopped) this.hint.classList.add('hidden')
  }

  /** Returns true the first time it is called for a given run. */
  showGameOver(score: number, cause: DeathCause | null): void {
    if (score > this.best) {
      this.best = score
      writeBest(score)
    }
    this.bestLabel.textContent = `Best ${this.best}`
    this.overlayCause.textContent = cause ? CAUSES[cause] : ''
    this.overlayScore.textContent = String(score)
    this.overlayBest.textContent = String(this.best)
    this.overlay.classList.remove('hidden')
  }

  hideGameOver(): void {
    this.overlay.classList.add('hidden')
  }

  showHint(): void {
    this.hint.classList.remove('hidden')
  }

  onRestart(handler: () => void): void {
    must(this.overlay, '#restart').addEventListener('click', (e) => {
      e.stopPropagation()
      handler()
    })
  }
}

function must(root: ParentNode, selector: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(selector)
  if (!el) throw new Error(`missing element: ${selector}`)
  return el
}

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0
  } catch {
    return 0
  }
}

function writeBest(value: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(value))
  } catch {
    // Private browsing, and a lost high score is not worth crashing a game over.
  }
}
