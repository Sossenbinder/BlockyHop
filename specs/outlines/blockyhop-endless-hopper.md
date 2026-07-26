# Outline: BlockyHop — voxel endless hopper

## Context

Nothing exists yet: `BlockyHop` is a new sibling repo under `/home/stefan/Code/Personal/`,
following the same shape as `QuickRacer` and `OsrsClone` — a `specs/outlines/` design doc,
a README with a layout table, and an engine-free core with the engine only at the boundary.
The game is a Crossy Road–style endless hopper with a unicorn as the playable character,
running in the mobile browser.

## Scope

**In scope:**

- Endless procedural run: grass, road, river, and rail lanes, difficulty ramping with distance.
- Grid-locked hopping with an arced hop animation; tap/swipe on touch, WASD/arrows on desktop.
- Hazards: cars (dodge), logs (ride — the carry mechanic), trains (warned, then fast), trees (block).
- Death by collision, drowning, being carried off-screen, and falling behind the camera.
- Score = furthest row reached; best score in `localStorage`.
- One character: a unicorn assembled from box primitives, with a rainbow hop trail.
- Deterministic seeded sim, unit-tested with Vitest.
- `pnpm dev --host` for phone testing over LAN.

**Out of scope:**

- Any backend, account, or online leaderboard.
- Character roster, coins, unlocks, gacha.
- Audio and music.
- Deployment/hosting (deliberately deferred — see Trade-offs).
- Real voxel meshing, greedy meshing, or an asset pipeline.

## Approach

**Repo layout** (new, at `/home/stefan/Code/Personal/BlockyHop/`):

| Path | What it is |
| --- | --- |
| `src/sim/` | The game. Pure TypeScript, **must not import `three`**. |
| `src/render/` | Three.js scene, camera, model builders, entity pooling. |
| `src/input/` | Pointer/keyboard → intent (`forward`/`left`/`right`/`back`). |
| `src/ui/` | Score HUD and game-over overlay, plain DOM over the canvas. |
| `src/main.ts` | Wires sim + render + input; owns the loop. |
| `tests/` | Vitest over `src/sim/`. |

Vite + TypeScript + pnpm. The `sim`/`render` split is the same trick as `QuickRacer`'s
`VehicleModel`: the sim owns all state and advances by a fixed step; the renderer reads the
sim and interpolates. A lint rule or a plain test asserts `src/sim/` has no `three` import.

**The sim.** `World` holds a lane list, the player, and a row cursor. `World.step(dt, intent)`
advances at a fixed **60 Hz** via an accumulator in `main.ts`; the renderer gets the leftover
alpha for interpolation. Coordinates: lanes run along X, the player advances in −Z, one grid
cell = 1 unit. The player has an integer `(col, row)` plus a hop animation phase; during a hop
it is airborne and immune, and it commits to the destination cell on landing.

**Lane generation.** A seeded `mulberry32` PRNG generates lanes lazily as the row cursor
approaches, keeping a window of ~24 rows alive ahead and ~8 behind. Lane type is drawn from a
distance-weighted table with run-length rules (never more than N of a type in a row, always a
grass lane after a river block). Same seed → identical run, which is what makes the sim testable.

**Hazards.** Cars and logs are continuous-X entities inside a lane, spawned on a per-lane
interval with a per-lane speed and direction. Collision is a 1-D overlap test on X against the
player's cell, evaluated only when the player is grounded. River lanes invert the rule: being on
a log is safe and the log's velocity is added to the player's world X; being on open water kills.
Rail lanes flash a warning for a fixed lead time, then sweep a train the width of the lane.

**Death and camera.** An orthographic camera at a fixed isometric-ish angle tracks the player's
furthest row and scrolls forward at a floor speed that ramps with distance. Falling behind the
camera's trailing edge kills — that is the "eagle", implemented as geometry rather than a bird.

**Models.** `src/render/models.ts` builds every object from `BoxGeometry` parts described as
plain data (offset, size, colour), so the unicorn, cars, logs and trees are all editable in a
line. Geometries and materials are shared and entities are pooled per type; no instancing until
the profiler asks for it.

**Mobile.** DPR clamped to 2, `touch-action: none`, viewport locked against zoom/scroll,
resize-driven camera frustum. Swipe threshold in CSS pixels; a tap under the threshold means
"forward".

## Key Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Project location | New repo `BlockyHop`, sibling to `QuickRacer` | Unrelated to `OsrsClone`; matches one-repo-per-game convention |
| Stack | Vite + vanilla TS + Three.js | Smallest bundle and fastest mobile load; no reconciler in the frame loop |
| Sim/render split | `src/sim/` forbidden from importing `three` | Makes the whole game unit-testable, exactly as `VehicleModel` is |
| Timestep | Fixed 60 Hz accumulator, interpolated render | Determinism; a variable step makes collisions frame-rate dependent |
| Randomness | Seeded `mulberry32`, no `Math.random` in sim | A failing run can be reproduced from its seed in a test |
| Art | Box primitives from a data table | Zero asset pipeline, tiny bundle, and the unicorn exists nowhere as a free asset |
| Entity rendering | Pooled meshes, shared geometry/material | Dozens of entities on screen; instancing is premature complexity |
| Lane set | Grass, road, river, rail — all in v1 | River's carry mechanic is the most interesting lane; shipping without it makes runs samey |
| Theme | Crossy Road world, unicorn character + rainbow trail | User's call: naturalistic-blocky world, character carries the theme |
| Persistence | `localStorage` best score only | No backend in scope |
| Airborne immunity | Player cannot be hit mid-hop | Standard for the genre; removes unfair deaths at lane boundaries |
| Tests | Vitest over `src/sim/` | Determinism, collision, log carry, generation rules, difficulty ramp |
| Hosting | Deferred; `pnpm dev --host` for phone testing | User's call — see Trade-offs |

## Trade-offs

- **Determinism over convenience.** A seeded sim with a fixed step is more ceremony than
  `requestAnimationFrame` + `Math.random`, and it buys the only thing that makes a feel-driven
  game reviewable: a run you can replay in a test.
- **Code-built art over asset quality.** It will look plainer than a Kenney pack, and it costs
  nothing to load and nothing to change.
- **Full lane set over shipping speed.** River carry is the fiddliest mechanic in the game and
  will take the most tuning; the alternative is a run where every hazard behaves the same.
- **No hosting yet.** Deliberate, but it means "easy to play" is not yet true — the game is
  reachable only on your LAN. Adding a GitHub Pages workflow later is roughly one file.

## Execution profile

- **Tier:** in-session
- **Rationale:** greenfield game where the hard parts are correctness and feel, not translation.
  The fixed-timestep/interpolation seam, the log-carry mechanic (fractional X inside a
  grid-locked player), and the difficulty ramp all need judgment that no outline can fully
  pin down, and the tuning pass is iterative by nature.
- **Escalation triggers:** n/a — implemented directly.

## Open Questions

- **Tuning constants** — hop duration, car/log/train speeds, spawn intervals, camera scroll ramp,
  swipe threshold. _Only playing settles these; the outline's job is to make them all data in one
  place (`src/sim/tuning.ts`), not to guess the numbers._
- **Whether the river needs partial-cell alignment** — riding a log leaves the player off-grid, and
  the hop-off rule (snap to nearest cell vs. round toward travel) changes how forgiving the game
  feels. _Genuinely a feel decision; both are a one-line change, so it is deferred to the tuning pass._
