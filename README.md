# BlockyHop

A Crossy Road–style endless hopper built from scratch: procedural road, river, and rail
lanes, a unicorn with a rainbow hop trail, and a browser you can open on a phone. The
game itself is an engine-free TypeScript module running a fixed 60 Hz step, so the
mechanics are unit-tested rather than only felt.

The design lives in [`specs/outlines/blockyhop-endless-hopper.md`](specs/outlines/blockyhop-endless-hopper.md).

**v1 is complete and live at [blockyhop.dotschranz.net](https://blockyhop.dotschranz.net).**

## Layout

| Path | What it is |
| --- | --- |
| `src/sim/` | The game. Pure TypeScript. Never imports `three`, never touches the DOM. |
| `src/render/` | Three.js: models, pooling, camera, the scene. |
| `src/input/` | Pointer and keyboard gestures to intents. |
| `src/ui/` | Score, game-over panel, best score in `localStorage`. |
| `src/main.ts` | Wires the three together and owns the loop. |
| `tests/` | Vitest over `src/sim/`. |

## Running

```bash
pnpm install
pnpm dev          # --host is already in the script; use the Network URL on a phone
```

`pnpm test` runs the suite. `pnpm build` typechecks and emits a static `dist/` — the game
is a static site with no backend, so anything that serves files will host it.

## Deployment

Push to `main` → CI runs typecheck, tests, and build → a multi-stage image builds the
site and serves it from nginx → pushed to `ghcr.io/sossenbinder/blockyhop:latest`.
ArgoCD in [HKube](https://github.com/Sossenbinder/HKube) syncs `charts/blockyhop` onto
the k3s cluster within ~3 minutes, with Traefik terminating TLS from cert-manager.

The image tag is `latest` and ArgoCD only redeploys on manifest changes, so a build with
no chart change needs a nudge:

```bash
export KUBECONFIG=~/.kube/hkube-config
kubectl rollout restart deployment/blockyhop -n apps
```

**Controls:** tap to hop forward, swipe to steer. On desktop, WASD or the arrow keys, and
space to hop. Any tap restarts after a game over.

`?seed=123` pins the run. The sim is deterministic, so a seed reproduces a layout
exactly — which is how "that lane was impossible" becomes a test case.

## Architecture notes

**The game does not know what a renderer is.** `src/sim/` holds every rule — lane
generation, collision, the log-carry mechanic, the kill line — and `src/render/` only
draws whatever the sim currently says is true. A test asserts the boundary
(`tests/purity.test.ts`), because it is one careless `import * as THREE` away from being
untestable in node.

**60 Hz, fixed.** `FIXED_DT` is the one true step; `main.ts` accumulates real time and
steps the sim in whole ticks, handing the renderer the leftover fraction to interpolate.
A variable step would make collisions frame-rate dependent — on a 120 Hz phone the same
gap between two cars would be a different gap.

**Seeded, never `Math.random`.** The sim draws from a `mulberry32` stream seeded once. A
test pins this by making `Math.random` throw and running five thousand steps.

**Tuning is data.** Every constant that governs feel lives in `src/sim/tuning.ts` with
the reasoning written next to it, and the ones that were picked rather than derived are
labelled `(guess)`.

**Art is code.** Every object is a list of boxes in `src/render/models.ts` — `{size, pos,
color}` — sharing one unit `BoxGeometry` and a material per colour. No loader, no assets,
no atlas. Recolouring the unicorn is editing a hex value.

## What v1 established

Five things were wrong in ways that only showed up by testing or by looking, and each is
easy to reintroduce:

- **`touch-action` is not inherited.** Setting it on `body` leaves the canvas — the only
  element a player actually touches — free to pan and double-tap-zoom, eating the exact
  gestures the game needs. It has to go on `*`. Related: a swipe that fires on release
  rather than on crossing its threshold adds a tenth of a second of lag to every steer,
  and tracking one pointer at a time drops the second thumb of a player who alternates.

- **A buffered hop must not skip the landing.** Resolving the queued input on the same
  step the player lands, before the hazard check, granted one free frame of immunity —
  enough to chain straight through bumper-to-bumper traffic. Grounded resolution now
  finishes (carry, then hazards) before the next hop is allowed to start.
- **The camera must advance before anything can kill you.** The kill line was updated
  after the death checks, so on the frame the player died the camera was left one step
  behind the score, and `cameraRow >= maxRow` — an invariant the game reads as "you can
  always see yourself" — briefly did not hold.
- **A warning nobody can see is not a warning.** The rail signals started as posts beyond
  the playfield edge, which on a portrait phone are permanently off-screen. The signal is
  the whole reason a train is survivable, so it moved onto the lane's own edges.
- **An orthographic camera yaws its look-ahead sideways.** Aiming four rows ahead also
  slid the view across, pushing the unicorn a fifth of the screen off-centre. The look-at
  has to lean by `dir.x / dir.z` per row of look-ahead to cancel it.

## Still open

The tuning constants are a starting point, not an answer — only playing settles them. The
dials most worth turning are in `src/sim/tuning.ts`:

- `road.gapMin` / `gapScale` — how thick the traffic is, and how fast it thickens.
- `river.logMin` / `gapMax` — the difference between a crossing and a coin flip.
- `camera.baseScroll` / `scrollRampPer100` — how much time you are allowed to think.
- `world.safeRows` (4) — the runway before the first hazard. Currently short enough that a
  first road can appear on row 4.
- `player.hopDuration` (0.14 s) — responsiveness against readability.

Not built, in rough order of how much each would add:

- **Audio.** A hop blip and a splash would carry a lot for a few hundred bytes of
  WebAudio, no assets needed.
- **Characters and coins.** The renderer already builds models by key, so a second
  character is a second entry in `models.ts` plus an unlock screen.
- **Online leaderboard.** Would need a backend and an answer to trivially forged scores;
  the seeded, deterministic sim means a run could in principle be verified by replay.
