# RocketScience — From Rocket Chair to Outer Space

A historical, physics-grounded space exploration game: from Thai *Bang Fai* and the legendary
Rocket Chair to Sputnik, Apollo, DART and Voyager.

## Quick start

```bash
npm install
# one-time: copy GLTF decoders used by the NASA/ESA model loader
mkdir -p public/draco public/basis
cp node_modules/three/examples/jsm/libs/draco/gltf/* public/draco/
cp node_modules/three/examples/jsm/libs/basis/* public/basis/

npm run dev      # http://localhost:5173/RocketScience/
npm test         # physics unit tests
npm run build    # → dist/
```

Live target: **https://dukperado-hue.github.io/marswalker/** (`base: '/marswalker/'` in `vite.config.ts`).
Pushing to `main` builds, tests and deploys via `.github/workflows/deploy.yml` — set the repo's
*Settings → Pages → Source* to **GitHub Actions** once. No need to commit `dist/` or keep a `gh-pages` branch.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language / build | **TypeScript + Vite** | Fast dev server, code-splitting so Three.js loads only when needed, trivial GitHub Pages deploy |
| UI | **Vanilla DOM + CSS** (no React yet) | The game is canvas-first; HUD panels are small. Add Preact/Svelte later only if menus grow |
| Phase 1 (factory) | **Canvas 2D, custom grid snapping** | Building is discrete; a physics engine would add jitter, not value |
| Phase 2 (launch) | **Custom fixed-step integrator** (RK4, 120 Hz) | Inverse-square gravity, exponential atmosphere, km-scale distances — beyond Matter.js. Matter.js optional for close-range debris/comedy |
| Phase 3 (orbit) | **Three.js** + patched-conics Kepler propagation | Map view, Ap/Pe markers, time warp |
| Phase 4 (EVA/docking) | **Three.js + Rapier3D (WASM)** or hand-rolled 6-DoF | Zero-g rigid bodies, Clohessy–Wiltshire relative motion |
| Assets | **GLTFLoader + DRACO + KTX2 + Meshopt** | NASA/ESA models are large; compressed formats matter |
| Tests | **Vitest** | Physics functions are pure and easy to test |

## Folder structure

```
rocketscience/
├─ index.html                  App shell + phase nav
├─ vite.config.ts              base=/RocketScience/, Three.js split into its own chunk
├─ public/
│  ├─ models/nasa|esa/         Downloaded .glb files (not in git — use LFS/releases)
│  ├─ draco/  basis/           Decoders copied from three/examples
│  └─ sprites/                 Character sprites (replace the box avatars)
├─ src/
│  ├─ main.ts                  Boot + nav wiring
│  ├─ core/
│  │  ├─ EventBus.ts           Typed pub/sub; phases never import each other
│  │  └─ PhaseManager.ts       Lazy-loads and swaps the active phase
│  ├─ data/
│  │  ├─ parts.ts              Part catalogue (SI units)
│  │  └─ (techTree.ts retired in v0.18 → src/campaign/)
│  ├─ physics/
│  │  ├─ rocketMath.ts         Mass, thrust, CoM/CoT, TWR, Tsiolkovsky Δv, validation
│  │  └─ rocketMath.test.ts
│  ├─ assets/
│  │  ├─ AssetLoader.ts        GLTF/DRACO/KTX2/Meshopt loader, normalise, placeholder
│  │  └─ modelManifest.ts      Every model's file, real size, credit and licence
│  ├─ phases/
│  │  ├─ assembly/             Phase 1 — Rocket Factory (complete)
│  │  ├─ launch/               Phase 2 — Launch & telemetry (stub)
│  │  ├─ orbit/                Phase 3 — Orbital view (Three.js pipeline wired)
│  │  └─ mission/              Phase 4 — EVA & docking (stub)
│  └─ ui/styles.css
└─ .github/workflows/deploy.yml
```

## Physics in Phase 1

- **Wet / dry mass** — sum of parts, with and without propellant
- **TWR** = F_SL / (m_wet · g₀) — must exceed 1 to lift off
- **Combined Isp** = ΣF / Σ(F/Isp)
- **Δv** (Tsiolkovsky) = Isp · g₀ · ln(m_wet / m_dry)
- **Centre of mass** (mass-weighted part centres) vs **centre of thrust** (nozzle exits) — an offset makes the vehicle tumble

## Assembly Factory (v0.6.1) — `src/phases/assembly/`

Spaceflight-Simulator-style builder with **material science** as the core mechanic.

**UI:** engineering graph-paper build area; a simple part list (each shape in its default material);
basic telemetry on the right (TWR, mass, thrust, Δv, burn time). Materials, flips, cost and
structural detail live in a floating **inspector** that opens only when you click a placed part
(`ui/Inspector.ts`).

### Parts are shapes; stats come from the material

| Formula | Code |
|---|---|
| Dry mass = shape volume × material density (+ crew/machinery) | `dryMass()` in `model/catalog.ts` |
| Cost = shape volume × material price per m³ | `partCost()` |
| Capacity = shape load area × material strength (heat-derated) | `integrity()` |
| Pressure check uses **across-grain** strength — bamboo splits | hoop σ = p·r/t |
| Fins/wings checked for root bending at max-q | σ = M/Z |

Materials (`src/data/materials.ts`): bamboo, steel, aluminium, titanium, carbon fibre (+ paper, wood
for Tier 1 parts). Swap any placed part's material in the inspector — mass, cost, TWR, Δv and
safety factors update instantly. The stress map (S, or Details → Show stress map) colours every part
by safety factor.

### Catalogue — 37 base shapes
Command (chair, pod) · Aerodynamics (4 nose cones, 3 fins, 2 wings) · Fuel tanks (5 sizes, radial,
adapter) · Propulsion (Wan Hu tube, Bang Fai, cast-grain motor, 2 SRBs, 4 liquid engines) ·
Structural (truss, 3 decouplers, fairing, adapter, tail stick, heat shield, kite).

### Flip & mirror
Every part can flip left↔right (H) and top↔bottom (V); nodes, collision hull and drawing all flip.
Mirror mode creates a true reflection (`rot' = −rot`, `fx' = !fx`), so fins and radial boosters come
out handed correctly.

Controls: drag from the list (or tap to auto-attach) · drag empty space to pan · wheel/pinch zoom ·
R rotate · H/V flip · M mirror · S stress · F fit · Del remove · Ctrl+Z / Ctrl+Shift+Z.

## Zombie vs Physics (v0.7) — test payloads

The seats carry **cartoon zombies** instead of people or animals. They're already dead, so the game can
put them through 18 g, cartwheels and hard landings and play it as slapstick — but they are honest
instruments: every limb lost is a real reading of the g-load **at the seat**.

| Zombie | Mass | Limbs start going | Falls apart | Landing |
|---|---|---|---|---|
| Standard | 70 kg | 11 g | 15 g | limbs pop > 12 m/s, splat > 28 m/s |
| Fat | 140 kg | 15 g | 20 g | padded: bounces up to 40 m/s |
| Brittle (574 worms) | 40 kg | 8 g | 12 g | fragile: 6 / 16 m/s |

- `src/payload/zombies.ts` — variants + `ZombiePayload` state machine (low-pass g, 0.15 s to count,
  limbs one at a time, mass and side area shrink as bits leave), dark-comedy log lines, `GoreFx` requests,
  pre-flight `zombieForecast()`.
- Factory: *Test payloads* section in the part list (tap to seat), zombie chips in the inspector for any
  seat part (`PlacedPart.rider`), zombie drawn in the chair / at the pod window, pre-flight warnings.

## Phase 2 — Launch & Flight (v0.8) — `src/phases/launch/`

Build in the factory → **Roll out to the pad** → fly it live.

- **Launch site** (before ignition): pad rail 6 m · tall bamboo ramp (10–30 m, 0–25° lean) · bare ground;
  crosswind 0–8 m/s. Bang Fai default to a 25 m ramp at 10°, Wan Hu's chair to bare ground.
- **HUD** (light cards): T+, altitude, velocity, Mach, vertical speed, apogee prediction (coasting, current
  drag area), pitch, SAS/gimbal state · live zombie portrait (missing limbs, worms) with seat-g bar marked at
  its limb and fall-apart limits · flight-log ticker (zombie lines green, failures red) · end-of-flight summary.
- **Controls**: Space ignition / stage · T SAS · P parachute · A/D or ←/→ pitch (moves the SAS target, or
  swings the gimbals by hand with SAS off) · 1–4 time warp 1×/2×/4×/10× · C camera (vehicle → dropped
  stages → flying zombie head) · wheel or +/− zoom · R relaunch · Esc factory.
- **View** (`LaunchView.ts`): camera locked on the target, easing on switch; auto-framing × player zoom; sky
  from pale blue to stratosphere blue to black with stars above ~50 km; clouds, altitude ladder, pad tower or
  bamboo ramp; flames follow the gimbal; canopies inflate and trail up-stream; cel-shaded particles.

## v0.22.1 — "Up!": sky lanterns on Wan Hu's chair

**Attachment nodes** (all `tiny`, so the usual size + facing rules decide what snaps):

| Part | New node | What it allows |
|---|---|---|
| Paper envelopes (all four) | `crown` — a string loop `TETHER` = 0.22 m above the paper, facing up | the next lantern's ring ties on: lanterns stack into columns |
| Bamboo mouth ring | `burner-l`/`burner-r` side hooks (down) | the heater hangs to the side, freeing the ring's bottom to tie onto a crown or the chair |
| Bamboo mouth ring | `tether-l`/`tether-r` loops at ±0.45 m (sideways) | rings tie side by side (rows); also onto the chair's side mounts |
| Bamboo hoop, large | `tether-l`/`tether-r` at ±0.55 m | the same, for cloth balloons |
| Wooden chair | `lantern-top` — a cord on the backrest, 0.22 m up | the first lantern ring ties on above the chair, with room for its heater |

The classic lantern (fuel cell under the ring) is unchanged. Blueprint **Up! Wan Hu's lantern chair** (`upCluster()` in
`presets.ts`): 20 × 20 festival lanterns, two wax fuel cells each, on the chair with the brittle zombie.

**Buoyancy stacks.** Every envelope on a body feeds one lumped heat balance: ΣP from every lit heater, ΣUA from every
envelope's paper, ΣV of hot air. For N identical lanterns, T_in is exactly one lantern's, and
F_b = (ρ_out − ρ_in)·g·ΣV = N × one lantern's lift, applied at the volume centroid (so the chair hangs below like a
pendulum). Carried air mass (ρ_in V + ½ρ_out V per envelope) adds inertia but no weight. Numbers:
a festival lantern on two fuel cells settles ≈ 176 °C (paper ignites at 233 °C) and nets ≈ 236 g after its own weight;
chair 21.8 kg + brittle zombie 40 kg → ~260 lanterns to float, 400 to climb briskly; a standard 70 kg zombie needs ~390
just to float. `physics/upChair.test.ts` checks N × lift, the Archimedes closed form, lift-off with 400 and no lift-off
with 150.

**Fixes found on the way.**
- *g-load with envelopes:* the structure's g-load is now its proper acceleration a − g with the carried air included
  (it divided the force by the structure mass alone, so a 4 m/s gust on 400 m² of paper read as 5 g and "buckled" the
  lanterns). Bodies without envelopes compute exactly as before.
- *Launch site:* a lantern cluster (or any lantern on a seat) defaults to the 6 m pad rail, which holds it upright until it
  pulls clear — on bare ground a 20 m sail lifting off with almost no spare lift tips a corner into the dirt in a breeze.
- *Performance:* past a dozen envelopes on one body the flight view draws lanterns without the blur halo / clip /
  gradients, skips sub-pixel heater flames, and smoke puffs are capped per body (≈ 17 fps → 12 fps at 10× in headless
  software rendering for 1,601 parts; was 3.5).

## Early Access build (v0.22) — Tier 0–2, Lanterns → Kármán line

**Scope.** One switch, `src/core/earlyAccess.ts` (`EARLY_ACCESS.on`). With it on: parts above Tier 2
say **"Coming Soon in the Space Age Update"** in every mode (Sandbox too), the campaign ends with
Mission 2.5 (Space Passport, the Kármán line), Mission 3 shows as a coming-soon card, and the Orbit
tab is hidden. Nothing orbital was deleted — `on: false` restores the full game. The cap lives in
`MissionManager(kv, cap)`, so the campaign tests still cover all four missions and
`campaign/earlyAccess.test.ts` covers the capped build.

**The Early Access loop.**
1. *Factory* — the inventory is grouped by era: **Tier 0 · Lanna Workshop** (lantern blueprints and
   parts first), **Tier 1–2 · Backyard Ballistics** (blueprints, then parts by category), and a
   collapsed **Tier 3–4 · Space Age** shelf of locked parts. Early parts carry a **Lanna Instruction
   Manual** tooltip (hover / focus, or the 📜 chip on touch) — `model/lannaManual.ts`.
2. *Fly* — M1 lantern into Samui airspace → M2 Bang Fai to 5 km → M2.5 liquid engine past 100 km.
3. *Crash* — ImpactDirector hit-stop, 0.25× slow-mo, trauma shake; limbs tear off the painted
   zombie (bone stubs with slime stay on the torso), fly as floppy fragments, land on crater floors
   or splash into the sea (where the shark comes to look, and CAPCOM says so once).
4. *Palate cleanser* — slime hits the lens, the painted capybara (4-frame sheet) mops it row by
   row while speaking in its own voice, then **Zombie Control** delivers the punchline: gibberish +
   `[Translation: …]`, held for three seconds before the summary.
5. *End of Early Access* — after the M2.5 flight: "Garrr… [Translation: We have touched the void.
   Now we build bigger rockets. See you in the next update.]" → Sandbox / Factory / Story log.

**Art.** `public/assets/zombie/rig/*.png` were cut from the two painted part sheets (checkerboard
removed); each sprite has a pivot and a tip anchor in pixels and `rig/zombieSprites.ts` maps them
onto its bone (`drawSprite`, tested to land joint-on-joint). `assets/capcom/capybara_mop_sheet.png`
is the painted 4-frame walk (background removed), facing left, mop low in front.

## Juice J3 — bone rigs & the mopping capybara (v0.21) — `src/rig/`

**FK bone rig** (`boneRig.ts`, pure, no DOM). Bones are affine matrices in canvas order;
`world(bone) = world(parent) · T(at) · R(angle)`, drawn with one `ctx.setTransform(base · world)`
per bone. Poses (`idle`, `highG`, `float` for the zombie) are per-bone offsets; their weights ease
toward targets (τ = 0.25 s), so states tween instead of snapping.

**Secondary motion from real acceleration.** Every bone is a Verlet angular spring (1/120 s
substeps) toward its blended target, plus a torque from the *extra* felt gravity:

    α = −stiff·(θ − target) + inertia · 2 · (d × ΔF),   ΔF = felt − (0, −g) + ω²·pivot
    θ' = θ + (θ − θ_prev)·(1 − damp·h) + α·h² − lag·Δ(parent angular velocity)

`LaunchView` finite-differences the vehicle (or EVA body) velocity over sim time, so
`felt = −(dv/dt − g)` rotated into the seat frame (EMA τ = 30 ms) — the springs are referenced
to 1 g, so on the pad the pose holds exactly; under thrust the arms sag, in free fall they float,
an impact makes them whip and settle; a spin makes them trail (follow-through).

**Limbs come off as subtrees.** When the zombie loses a limb, `rig.detach()` removes that bone
and all its children, leaves a bone stub on the torso, and hands back a `Fragment` (the same
bones, limp springs) that rides the limb particle and keeps flopping as it tumbles.

**Capybara palate cleanser** (`capybaraRig.ts`, `vfx/spriteSheet.ts`). Looks for
`assets/capcom/capybara_mop_sheet.png` — **4 frames in one row, transparent, facing right**, mop
head near (86 %, 32 %) of each frame — and plays it at 8 fps. Without the sheet, a 12-bone rig
(body, head, 2 legs × thigh+foot, 2 arms × arm+paw, mop handle, springy mop head) waddles across
the lens in three window-cleaner passes: legs in antiphase, both arms pushing the mop, handle aimed
in world angle, strands trailing on a high-lag spring. The wipe (`destination-out`) follows the
mop head's computed world position, so what you see mop is what gets cleaned.

## Juice J1 + J2 — impacts, sound, craters (v0.20) — `src/juice/`, `src/world/terrain.ts`

- **ImpactDirector** (`impactDirector.ts`, pure, tested) is the single entry point for every hit.
  Ground touchdowns, water landings, explosions, fireworks and lost limbs all call `impact()`.
  - **Intensity:** log scale of energy, from 1 kJ = 0 up to 1 GJ = 1.
  - **Hit-stop:** time freezes for 60–120 ms, scaled by energy.
  - **Slow motion:** after the freeze, 0.25× for 0.6 s, easing back to 1×. It scales physics,
    particles, FX and weather together.
  - **Trauma camera:**
    - shake = trauma² × the sum of three sines at unrelated frequencies (smooth, not random jitter);
    - a damped spring kick against the impact direction;
    - a zoom punch and a little roll.
    The sky backdrop is not shaken, because it is far away.
  - **Auto-warp drop:** a ballistic time-to-ground estimate switches warp back to 1× about 1.5 s of
    real time before a fast impact. It skips flights with a parachute open or set to deploy.
  - Feature flag `rs.flag.timefx`.
- **Additive FX** (`fxLayer.ts`):
  - a white flash frame and fireball sprites drawn with `lighter` (RGB add, clamped);
  - a shockwave ring that expands fast then slows;
  - sparks stretched along their velocity, cooling from white to orange to falling dirt;
  - dust and steam;
  - smoke that lingers 4–9 s and drifts with the wind.
  Fireballs feed the environment's light pass, so blasts light up the ground and the water. Every
  soft shape is a pre-rendered sprite, and the pools have caps.
- **Damage flicker** (`silhouette.ts`): a part near failure blinks a white silhouette. Near failure
  means `Flight.strain()` > 0.82, the worst of load against safety factor and heat against melting
  point. The silhouette is the part drawn once into a small canvas, then turned solid white with
  `source-in` and cached.
- **ProceduralAudio** (`proceduralAudio.ts`): WebAudio only, no sound files.
  - One-shot sounds: thud, boom (distorted noise, low-pass sweep, sub drop, crackle tail), splash
    (swept band-pass plus bubbles), pop and crunch.
  - Continuous sounds: engine rumble (brown noise, follows thrust) and sizzle (re-entry plasma or a
    burning lantern).
  - Stereo panning follows the impact's position on screen, and a limiter on the master stops
    clipping.
  - Audio unlocks on the first click or key. The 🔊 button or **U** mutes it. Without WebAudio it
    does nothing silently.
- **1D terrain** (`terrain.ts`):
  - A chunked `Float32Array` heightfield (0.25 m spacing) along ground distance.
  - Impacts carve parabolic bowls: r ≈ 0.11·E^0.27, depth 0.32 r, nothing under 20 kJ, at most 25 m.
  - The concrete pad (±4.5 m) never craters.
  - `Flight` takes an optional `terrain`, and ground contact then uses the lowest corner above the
    terrain (`Body.lowestAboveGround`). Without it the physics is **bit-identical** to before, which
    a test checks. Feature flag `rs.flag.terrain`.
- **Craters on screen:**
  - The land is drawn into an offscreen layer with the same transform, scorch is added with
    `source-atop`, and bowls are cut out with `destination-out` so the sky shows through. A burnt
    soil band and ejecta lips are drawn on top.
  - Bodies at rest sink into a crater carved under them.
  - Craters, scorch and wrecks persist per launch site for the session; wrecks are baked to images
    when you relaunch. Clear them with **Clear craters & wrecks** on the site card.

## Code Red: high-fidelity 2D (v0.19) — `src/vfx/environment.ts`, `src/vfx/lanternArt.ts`, `src/world/surface.ts`

- **Render loop.** `LaunchView.frame()` runs fixed passes, each one a separate method:
  1. `env.backdrop` (screen space): the sky (day, or full-moon night), stars, the moon, and two far
     parallax layers of festival lanterns.
  2. World space (metres): clouds → land/sea surface → pad → contact shadows → particles → bodies.
     Every flame, lit lantern and fire calls `env.light()` instead of drawing a glow itself.
     `env.lights()` then draws all the lights in **one additive batch**, followed by `env.waterFront`
     (translucent sea over anything sitting in it, spray, rings, the shark).
  3. `env.front` (screen space): rain below the cloud deck, wind streaks, near out-of-focus lanterns,
     and a night vignette.
  4. The altitude ladder.
- **Keeping it fast.**
  - Every soft shape (bokeh, glows, cloud puffs, the moon) is pre-rendered once to an offscreen
    canvas; per frame it is only `drawImage`.
  - Rain and streaks live in `Float32Array`s.
  - Layers return early when they are out of altitude, weather or time-of-day range.
  - `shadowBlur` is used only for the hero lantern's halo.
  - `env.quality` (0.35–1) adapts to measured frame time and scales particle counts.
  - Measured at about 2 ms per frame for the full Haad Rin festival scene.
- **Translucent lanterns** (`lanternArt.ts`):
  - a translucent paper fill and a paper-fibre texture pattern (`multiply`);
  - the flame lighting the inside (radial gradient, `lighter` plus a `screen` wash);
  - edge darkening, backlit ribs and a glowing seam band;
  - a `shadowBlur` halo;
  - flutter: every outline point rides two sine waves scaled by wind at altitude, strongest at the
    open mouth.
- **Festival and weather.**
  - Lantern launches from the islands happen at night under a full moon. From Koh Phangan, about 360
    festival lanterns drift upward in three parallax layers.
  - Weather is rolled per flight: clear, cloudy, or rain (lanterns are never flown in rain).
  - Wind streaks scale with wind at altitude.
- **Water vs land** (`surface.ts`). The flight line (east for rockets, downwind for lanterns) is
  sampled against the Ko Samui and Ko Pha-ngan coastlines, with the pad always on a beach. Yasothon
  is hard-coded inland. Anything that comes to rest over the sea:
  - splashes, with spray and rings;
  - logs "Polluting the ocean";
  - gets a CAPCOM line;
  - attracts a circling shark fin;
  - slowly sinks and lists. This is drawing only; the physics is unchanged.
- **Zombie Control.**
  - The zombies run CAPCOM for the early missions: campaign until Mission 2 is done, and sandbox
    Tier 0–1 builds.
  - Every line is deterministic zombie gibberish (the same word always gives the same grunt), with
    `[Translation: …]` underneath.
  - Zombie Control calls out altitude and speed with a quip about the humans, and has its own lines
    for events, airspace violations, splashdowns and mission completions.
  - The story now opens with the takeover; the crew gets the microphone back after Mission 2.
- **Fixes.**
  - A lantern still warming up on the beach no longer counts as "in the approach path". The airspace
    monitor ignores objects below 2 m.
  - Smoke is faded at night.

## Sprint G — Campaign & story (v0.18) — `src/campaign/`, `src/phases/mission/`

- **Four missions, one flight each.** All of a mission's objectives must be met in the same flight.
  Each one was flown in the simulator using only the parts unlocked before it, and `campaign.test.ts`
  keeps it that way.

  | # | Mission | Objective | Unlocks |
  |---|---|---|---|
  | 1 | Full Moon Festival of the Dead | Tier 0 lantern from Koh Phangan into Samui airspace | Tier 1 + Yasothon |
  | 2 | Viral Ballistics | Bang Fai / chair, Tier 1, Yasothon, 5 km | Tier 2 (LV-45, metal tanks) |
  | 2.5 | Space Passport | Liquid engine past the Kármán line | Tier 3 (vacuum engine, XL tanks, Mk1 pod, ZomSat) |
  | 3 | Orbital Hijack | Stable orbit (Pe > 140 km), zombie aboard, EVA | Tier 4 · campaign complete |

- **Why 2.5 exists.** Tier 1 tops out near 5.7 km, and Tier 2 near 7.1 km/s of Δv (orbit needs about 9.4).
  The original plan of "Bang Fai to 100 km" and "orbit on LV-45" could not be flown in this sim.
- **Mission 2 is a weathercocking lesson.** The twin-tail Bang Fai reaches 5.7 km only in zero wind on a
  vertical ramp. At 1 m/s of wind it turns into the wind and stays under 1 km, so the hint says to wait
  for a calm morning.
- **Mission 3 needs a two-burn ascent.** The Tier 3 vacuum engine (≈60 kN) cannot burn straight through
  to orbit. `PROFILE_TIER3` climbs on a lofted path, coasts to apoapsis (a new `coast` phase), then
  circularises. Assist uses it for every build without Tier 4 engines. `PROFILE_TIER4` is unchanged.
- **New blueprints.**
  - *Sounding rocket (LV-45)*: Tier 2, reaches about 390 km with SAS.
  - *Phaya Naga Hijacker*: Tier 3, a ZomSat in a ~200 × 145 km orbit.
- **MissionManager** (`missionManager.ts`):
  - A part is available only if both the campaign and the Mixing Bench allow it.
  - **Sandbox** unlocks every part and range and records nothing. Switching modes keeps campaign progress.
  - The save lives in `rs.campaign.v1`, wrapped in try/catch, and a corrupt or foreign save starts fresh.
- **Flight reports.** `flightReport()` (`report.ts`) is a pure read of the Flight plus the airspace
  monitor. LaunchPhase evaluates it every 20 frames and at the end of the flight. Objectives tick in the
  flight log, and a completion shows a card, a CAPCOM line and the rewards.
- **Factory.**
  - Blueprints are now at the top of the parts panel.
  - A strip shows the unlocked tier and the next mission.
  - Locked parts and blueprints say which mission opens them.
  - Roll-out refuses a build that contains locked parts.
  - Low-tier rockets launch from Yasothon once it's unlocked: no Samui radar there.
- **Lantern pre-flight fix.** Hot-air builds no longer fail the "no motor" check, which used to disable
  Roll out. The Factory now forecasts the heat balance using the same maths as the flight, and the tests
  confirm it agrees with the pad: tea-light too weak, flare catches fire.
- **Missions tab.** A vertical timeline of done, available and locked missions, each with its
  objectives, rewards and hint, plus the Campaign/Sandbox switch and a two-click reset.
- **Story tab.** A campaign log on top of the Story room:
  - Day 0 (Lee), then one entry per mission, written by Tortoise Clerk, Otter, Prof. Owl and Capybara.
  - Shown in EN, ไทย or both; the choice is remembered.
- `src/data/techTree.ts` is retired. It was never wired in, and its part ids didn't match the catalogue.

## Globe integration & launch ranges (v0.17) — `src/orbit/frame3d.ts`, `src/phases/launch/GlobeView.ts`

- **Ranges**: rocket builds get a *Range* picker on the site card: Yasothon (15.79°N, the default) or
  Koh Phangan / Haad Rin (9.68°N). The card shows the orbit a due-east launch gives: 15.8° or 9.7°. A
  due-east launch can't reach an inclination lower than the site's latitude, so Koh Phangan cannot give
  15.8°. The choice is remembered (`rs.range`) and locked after ignition.
- Changing range only moves the drawing: the pad cone, the 140 km rails ring and the sun angle
  (`GlobeView.setSite`). The flight plane, the integrator and every number on the HUD are the same at both
  ranges, and a test checks this (identical Ap/Pe).
- **Paths**: live orbit in solid cyan, a suborbital arc in dashed orange ending exactly on the ground at
  the impact marker, and the planned burn in **dotted** pink (in both 3D and 2D).
- **Markers** for Ap, Pe, node and impact are sized every frame from the camera distance, so they stay the
  same size on screen at any zoom (verified in the browser: half the distance gives half the world scale).
- **Fallback**: with WebGL unavailable, the 3D button is disabled, the 2D map takes over and the flight
  log says why. This was verified in headless Chromium with `--disable-webgl`.

## Sprint B — Sky lanterns & Samui airspace (v0.16) — `src/physics/buoyancy.ts`, `src/law/`

- **Tier 0 parts** ("Lantern factory"): four envelopes (paper S/M/L at 0.12/0.30/1.0 m³; a 3 m³ cotton
  balloon), a bamboo mouth ring and a hoop with two extra burner nodes, plus three heat sources: a tea-light
  (80 W), a wax fuel cell (1.8 kW, 12 min) and a smoke flare (3.2 kW, 2 min, smoke). Presets: *Khom loi*
  and *Cotton balloon* (3 cells). None of them has thrust.
- **Buoyancy** F_b = (ρ_out − ρ_in)·g·V with ρ_in = ρ_out·T_out/T_in. The air inside follows a lumped heat
  balance, m·c_p·dT/dt = P − UA·(T_in − T_out), with U = 5.5 W/m²K. It is solved **exactly** for each step
  (an exponential toward T_out + P/UA), so it stays stable at any time warp. T_out uses the ISA lapse rate.
  Paper catches fire at 233 °C and cotton at 255 °C.
- **Integration with Verlet.** The lift is one more world-frame force (along the local vertical) added
  in the same kick–drift–kick step as gravity, thrust, drag and wind. It acts at the envelopes' centre of
  volume, so it also gives a pendulum torque. The hot air inside, plus ½ρV of added mass, moves with the
  lantern: M_eff = M + m_carry, while only the structure has weight (gravity × M/M_eff). For any build
  without an envelope, m_carry = 0 and the step is bit-identical to v0.15, so the Gate A/B tests are unchanged.
- **Behaviour**: the pad waits up to 5 minutes while the heater warms the air. A khom loi lifts off after
  about 30 s, climbs at about 1.6 m/s, peaks near 750 m at burnout, then cools and falls, drifting about 9 km
  in a 4 m/s wind. Too little heat means no liftoff. Too much heat sets the paper on fire. A heater still
  lit at touchdown starts a ground fire.
- **Airspace (Tier 0/1 builds)**: a site picker (Haad Rin, Thong Sala, Chaweng) with wind direction and a
  "permit + tower notified" checkbox. A north-up radar shows the coastlines, the Samui control zone and both
  approach funnels, the runway, the wind arrow and the track. The sim's downrange axis is laid on the map
  along the wind. Entering a zone triggers a red **Regulatory Violation** banner and Tortoise Clerk panics.
  Without a permit, the CAAT fine is ฿60,000.
  - **Sourced** (AIP Thailand AD 2 VTSM, AIRAC 2025-01-23): the runway points and bearings, and the ATS
    airspace (5 NM around the SAMUI NDB, SFC–2,000 ft, Class D).
  - **Game model**: the funnels use an Annex 14 approach-surface planform (280 m inner edge, 15 % splay,
    15 km long), with a conflict below the 3° glide path + 150 m.
  - **Rules text**: CAAT public guidance (2017), which requires district approval and notice to the
    airport or ATC, under the NCPO s.44 order (up to 3 years and/or ฿60,000). Flagged *verify current* in
    the code.

## Sprint F — Spacewalks (v0.15) — `src/eva/evaSim.ts`

- **EVA.** Press **E** in orbit with the engines off; it works from a pod or a wooden chair.
  - The payload leaves the seat as its own body (`Flight.eva`), with its own orbit state machine.
  - The ship loses the zombie's mass and recoils, so momentum is conserved.
  - **E** swaps control between ship and zombie; **K** picks the kit before you go out.
- **Fire extinguisher.**
  - **W** fires, **S** points it the other way, **A/D** flail.
  - Its thrust line misses the centre of mass, so every push also spins the zombie (S spins the other way).
  - White CO₂ puffs come out of the nozzle.
  - 5 kg of CO₂ gives about 20 m/s, and the zombie may drop the bottle.
- **Other kits.** The RCS backpack gives about 40 m/s, with attitude jets on A/D.
- **No arms.** A jarred zombie, or one with no arms left, cannot hold any kit: the jar just floats.
- **Same physics rules as the ship.**
  - Verlet integration in the same gravity field.
  - Exact Kepler rails when nothing is firing; a firing zombie keeps everyone on full physics.
  - Its own stable / decaying / escape class.
  - Re-entry burns it up; a low orbit brings it down.
- **Display.** Spacewalk HUD card, a camera that follows the spacewalker, and a green orbit plus label on the 3D globe and the 2D map.
- **Story.** CAPCOM lines and three milestones: One small push, Freelance satellite, Make a wish.
- **Art wired in:** `zombie_jarred.png`, `fx_bone_stub.png`, `capybara_mop_walk.png` (the Palate Cleanser now does window-cleaner passes with it), and new crew busts for Lee, Owl, Tortoise and Otter.

## Sprint E — Slapstick physics (v0.14) — `src/payload/zombies.ts`, `src/vfx/`, `src/eva/`

- **Jarred.** Every zombie has a `jarG` above its fall-apart g (standard 18, fat 26, brittle 16).
  - A spike of at least 0.05 s above `jarG` compresses the zombie into a jar instead of tearing it. So does a spike that passes `jarG` inside the 0.15 s fall-apart window.
  - Jarred is a terminal state, but the mass stays in the seat and the drag area drops to 8 %.
  - It still counts as "in one piece" for Zombie-Sat.
  - It comes with a vector jar (eyeballs pressed to the glass), glass glints, CAPCOM lines and the "Preserves" milestone.
- **Bone stubs.** A missing limb now shows a white cartoon bone in a slime collar with a drip; a missing head shows a neck vertebra. Flying limbs show the other half of the bone. No red anywhere.
- **Capybara Palate Cleanser.** A total catastrophic crash (vehicle lost and the zombie in pieces or jarred, or an impact over 60 m/s) gets this sequence:
  - slime splats hit the "lens";
  - a serene hi-vis Capybara mops them off;
  - then the Wan Hu cutscene (if any), then the summary.

  It can be skipped and respects reduced motion.
- **EVA groundwork** (`src/eva/eva.ts`). Data structures and pure physics for a payload leaving the ship in orbit:
  - kits: RCS backpack, CO₂ fire extinguisher (every push also spins you, and you might drop it), and flailing;
  - Δv from the rocket equation;
  - rules for when EVA is allowed.

  Nothing is wired into the Flight yet.
- **Art prompts** for the jar, the mop walk and the bone stub are in `docs/art-prompts.md`.

## 3D orbital map (v0.13) — `src/phases/launch/GlobeView.ts`, `src/orbit/frame3d.ts`

- **Three.js globe** replaces the 2D map (which stays as a fallback: no WebGL, or the 3D/2D toggle).
  - Day map with sun shading and ocean glint.
  - City lights past the terminator.
  - Procedural clouds.
  - Fresnel limb haze and a twilight band.
  - Additive atmosphere shell.
- **The flight plane on the globe.** The 2D physics plane is placed with the pad at Yasothon and downrange due east, so the orbit's inclination equals the site latitude (15.8°).
- **Paths and markers.**
  - The live orbit and the planned burn are `Line2` (thickness in pixels). The orbit is cyan, or dashed orange when it hits the ground; the planned burn is dashed pink.
  - A faint ring shows the 140 km rails line.
  - Ap, Pe, node and impact markers keep a constant screen size. Their DOM labels hide behind the Earth.
  - The ship is drawn as a cone with a prograde arrow.
- **Camera.** OrbitControls (drag to rotate, scroll to zoom, right-drag to pan, damped). The view frames the whole orbit until you grab it. Buttons: Earth / Ship focus and Re-centre.
- **Rendering-only invariant.**
  - `frame3d.snapshot()` reads the Flight into frozen plain data.
  - `GlobeView` imports no simulation code.
  - Both are enforced by tests. `flight2d.ts`, `state.ts`, `kepler.ts` and the integrators are byte-identical to v0.12.2.
- **Textures.** NASA Blue Marble / Black Marble derivatives (public domain), from the three-globe examples, in `public/assets/earth/`.

## Art & story (v0.12) — `src/story/`, `public/assets/`

- **Zombie portraits.** The six live moods (idle, zero-g, high-g, spinning, re-entry, pieces) now use the drawn art. Fat and brittle zombies are reshaped in CSS. The Factory cards show the standing zombie.
- **Mission Control portraits** for Lee, Prof. Owl, Tortoise Clerk, Capybara and Otter.
- **New crew member: Aero-Duck** (CAPCOM · Guidance). His face changes with the news: happy for orbit and landing, serious for max-Q and decay, sad for losses. He also calls the autopilot's engine cut-off.
- **The Wan Hu legend.**
  - Three 10-second takes play as cutscenes after a wooden-chair flight crashes or breaks up. They rotate, and can be switched off.
  - A first-visit prologue card.
  - A **Story** room in the top bar with the videos, scenes and crew.
  - Summary banners: the soot-covered aftermath, the Bang Fai procession, and the Hangar 4 crew.
  - A milestone card with the crew lineup when you reach orbit or earn Zombie-Sat.
- Asset map: [`public/assets/README.md`](public/assets/README.md).

## Engineering Gates A & B (v0.11) — `src/orbit/state.ts`, `src/orbit/gates.test.ts`

- **Seamless handoff.**
  - Physics uses velocity Verlet with exactly the same −μr/|r|³ field as the rails.
  - Rails use universal-variable propagation, valid for every conic including near-parabolic.
  - Every physics ⇄ rails switch is checked in-game (Δr, Δv, energy, angular momentum) and logged to `flight.handoffs`.
- **Ground safety.** Rails end at the exact descending crossing of 140 km, so physics always flies re-entry and the crash.
- **State machine.** Three separate variables:
  - `orbitClass` (stable · decaying · suborbital · escape);
  - `propagationMode` (physics · rails);
  - `missionPhase` (ascent · orbital · deorbit · landed), with hysteresis.

  CAPCOM and the milestones react only to transitions.
- **Maneuver Node Lite** (map view): preview a prograde/retrograde burn, with the dotted new orbit, new Ap/Pe and burn time.
- **Ascent Assist** (V): Guide (green arrow and hints) or Auto (flies Tier-4 vehicles to orbit).
- Gate report with measured numbers: [`docs/gates-ab.md`](docs/gates-ab.md).

## Sprint D — Orbital phase & 3D payloads (v0.10) — `src/orbit/`, `src/assets/modelSprites.ts`

- **3D payloads.** Parts may carry `payload3d` (GLB path, primitive placeholder, up-axis, credit). `modelSprites` bakes the model into 2D sprites with one lazy Three.js renderer, cached by size and roll bucket. Physics still uses the 2D box only. Drop GLBs in `public/models/` (`zomsat.glb`, `satellite.glb`, `hubble.glb`).
- **Curved Earth + Kepler.** Gravity is inverse-square around Earth's centre. `orbit/kepler.ts` converts state ⇄ elements, propagates with Kepler's equation and samples the conic for drawing.
- **Orbital map.** Press Tab past 70–100 km. Warp goes to 10,000× on Kepler rails when no engine is burning; otherwise it is capped at 10×. Throttle, SAS prograde/retrograde and RCS all work in the map. The HUD shows Ap, Pe, time to Ap and period.
- **Story.** Pre-flight Δv check for orbital payloads; CAPCOM lines for orbit, Zombie-Sat, lap, de-orbit and escape; a milestone log in localStorage.
- **Blueprint.** *Phaya Naga Orbital (ZomSat-1)* uses the Tier-4 engines and can reach orbit.
- Details and the design rationale: [`docs/sprint-d-plan.md`](docs/sprint-d-plan.md).

## Sprint C + A (v0.9) — engineering polish & the show

**Physics** (`physics/flight2d.ts`)
- **Throttle** 0–100 % on liquid engines (Shift/Ctrl, Z full, X cut). MECO by hand is how you shape a
  survivable suborbital flight.
- **RCS**: the Mk1 pod has 3 kN·m of reaction control and 30 kg of monopropellant (Isp 220 s). SAS uses the
  gimbals first and RCS for the rest — which is everything once the engines are off. SAS modes:
  **Hold / Prograde / Retrograde** (M). Puffs show as white RCS particles.
- **Re-entry heating**: the flow carries ½ρv³ W/m²; the share reaching the wall follows Sutton–Graves
  (q̇ = 1.74·10⁻⁴·√(ρ/rₙ)·v³) on the leading part and a fraction in its wake, driven by
  (1 − T_wall/T_recovery) with T_r = T_air(1 + 0.2M²) — so a Mach-3 climb tops out near 340 °C while a
  5 km/s entry doesn't. Skins radiate (εσT⁴). Past its melting/burning point (paper 230, bamboo 300, carbon
  450, aluminium 660, steel 1450, titanium 1650 °C; heat shield ablates to ~2900 °C) a part burns up and
  the vehicle comes apart. Parts glow red→orange; the zombie gets crispy (150 °C) or cremated (450 °C).
- **Bang Fai fix**: the nozzle is carved off-centre (`thrustTrim`) so the thrust line runs through the
  centre of mass despite the side-lashed tail stick. The single-tail Bang Fai now climbs ~2.8 km.
- **Explosions**: structural failures, burn-ups and impacts > 40 m/s emit `explode` fx; solid motors can
  carry a **firework salt** (Sr red, Ba green, Cu blue, Na yellow, Li crimson — set in the inspector),
  which bursts at burnout and in any explosion, in its flame-test colour.

**Show** (`phases/launch/`)
- **T-3, 2, 1, IGNITION** countdown (Space starts it, Space again holds).
- **CAPCOM** (`capcom.ts`): Lee (Flight Director, brown Siamese cat), Prof. Owl (flight dynamics), the
  Tortoise Clerk (range safety, paperwork, space law), Capybara (recovery & zombie wellness), Otter
  (boosters) comment live on events; typed-out lines, stale chatter dropped, alerts jump the queue.
- **Zombie portrait moods** (`zombieMood.ts`): idle · zero-g · high-g · spinning · re-entry · pieces,
  from live telemetry; sprite if `public/assets/zombie/*.png` exists, else a procedural cel version.
- **VFX**: cel fireball, shockwave ring, debris sparks, firework stars, RCS puffs, re-entry plasma sheath,
  heat glow, camera pulls back and shakes for blasts.
- Art: `public/assets/README.md` (filenames) and `docs/art-prompts.md` (Gemini prompts).

## Phaya Naga Heavy (v0.8.1)

The biggest blueprint: three stages, 20 parts, 30.8 t, 17.3 m, 616 kN (TWR 2.0), ฿15.7M.
Two liquid side boosters with delta wings → two-tank core on a turbopump engine → vacuum upper stage under an
interstage → Mk1 pod, heat shield, 18 m parachute, one fat zombie. Fly with SAS + **Auto-turn (G)** (v0.9: for space and a live zombie, lean to ~50°, cut the upper
stage at 2.4 km/s with X, stage the pod, SAS → Retro — apogee ~163 km, lands ~790 km out at 10 g):
boosters away ~68 s, core ~99 s, upper stage to Mach 16, apogee ~65 km, lands ~1,100 km downrange.
Lean less (70°) and it reaches space — but the lift-less ballistic re-entry pulls ~19 g and the zombie comes apart.

v0.8.1 also: tanks feed only engines in their own stage (no cross-feed through decouplers), upper-stage
engines ignite only when nothing is left below them, liquid engines have an interstage (bottom) node.

## Flight simulator (v0.8) — `src/physics/flight2d.ts`

`new Flight(parts, { site })` is steppable (`ignite()`, `stage()`, `deployChutes()`, `step()`, `controls`);
`simulateFlight(parts, opts)` flies one to the end headless (tests).

- **Multi-body**: decouplers and structural failures split the vehicle into separate rigid bodies that keep
  flying (spent stages land downrange). Stage plan: radial decouplers (boosters) → axial decouplers bottom-up
  → parachutes. Engines above a decoupler wait and ignite when their stage becomes the bottom.
- **Gimbal (TVC)**: LV-45 ±6°, turbopump ±5°, pressure-fed ±8°, vacuum ±4°, 30°/s slew.
- **SAS**: PID on pitch error (ωn 2 rad/s, ζ 0.9, small integral with anti-windup) → required torque with the
  live aero moment and thrust offset fed forward → one gimbal angle ÷ control effectiveness Σ F·(r·d).
  The finned liquid rocket that flipped at Mach 3 now holds its line to 137 km.
- **Rails and ramps**: attitude and line held until the vehicle has climbed the guide length; liftoff when the
  push along the rail beats gravity's component along it.
- **Parachutes**: small (tiny mount, 6 m) · 0.625 m (10 m) · 1.25 m (18 m) · radial (7 m). Inflate over 2 s
  (area ∝ t², so there is an opening shock), drag on the canopy, the vehicle hangs beneath it (implicit
  pendulum), shredded if opened above the rated speed. Auto-deploy below 3 km when slow enough.
- **Ground**: contact on the lowest hull corner; < 15 m/s = landed, else impact.

## Aerodynamics & spin (v0.7) — `src/physics/aero.ts`

`simulateFlight(parts, { wind, rail, spinRps, seed })` flies any factory vehicle in the pitch plane.

**Full 360° aerodynamics** (`aero.ts`) — strip build-up, every part sees its own local flow `v + ω×r`, so
pitch damping and cartwheel braking come out of the physics (no fudge damping term):
- leading-end slender-body normal force (Barrowman CNα = 2) at whichever end meets the air first;
- viscous crossflow on bodies (Allen–Perkins, Cdc 1.2 → 1.7 transonic) — peaks flying sideways;
- fins/wings as flat plates: Helmbold low-aspect-ratio lift slope, Ackeret supersonic, stall sigmoid,
  Hoerner separated flow (CD90 ≈ 1.2), **reverse flow** (×0.8 slope, stall at 0.6 αs), centre of pressure
  moving from the Barrowman point to the planform centroid, body–fin interference 1 + R/(s+R);
- axial drag with separate nose-first / tail-first Cd and transonic drag rise;
- canted fins → roll torque with roll damping.

**Spin stabilisation** — while spinning, an out-of-plane yaw angle is integrated with gyroscopic coupling
(`I ω̇ = M − Ix p ψ̇`, `I ψ̈ = M_ψ + Ix p ω`), applied as an exact rotation and sub-stepped through each
nutation cycle. Reports Sg = (Ix p)² / (4 I Mα). A finless dart tumbles at Sg 0.8 and flies straight at Sg 2+.
A 6 m Bang Fai with its tail stick has Sg ≈ 0.0004 — spin can't save it; its pitch inertia is far too big.

Also: crosswind with a power-law profile (default 2 m/s), launch rail (default 6 m), speed of sound vs
altitude, seat specific force `a_CoM + α×r − ω²r`, engine-smoke and gore `fx` events for the Launch canvas.
Events: liftoff, rail, max-Q, stall, reverse, tumble, cartwheel, burnout, Kármán, apogee, impact, zombie-*.

**Pre-flight** CP check uses the same model (±4° secant) — and a second check at Mach 3 with empty tanks,
because fins lose lift supersonically while the CoM slides aft toward a heavy engine.



## VFX logic (v0.7) — `src/vfx/`
- `celStyle.ts` — the 2.5D cel-shaded look: thick ink outline, flat fill + one hard shadow band, one highlight.
- `zombieArt.ts` — seated zombies, pod-window face, loose limbs.
- `particles.ts` — pooled particle system fed by `FlightResult.fx`: smoke (size ∝ √thrust, thickness from
  the propellant's smoke density), flame puffs, slime droplets that splat, limbs that spin and bounce once,
  wriggling worms. Gore inside a closed pod is not shown.

## Tier 1 systems (v0.3)

| Module | What it does |
|---|---|
| `data/materials.ts` | Paper, bamboo, wood, steel, aluminium, titanium, carbon — density, strength, **anisotropy**, heat limit, Weibull scatter, humidity sensitivity |
| `data/propellants.ts` | Performance-only propellant types (Isp, density, reliability, throttle/restart) |
| `data/schema.ts` | Part schema v2: material + geometry → mass and strength are computed, not typed in |
| `physics/structure.ts` | Changing mass (ṁ = F/Isp·g₀); axial, bending and **hoop** stress; why bamboo casings split |
| `physics/cluster.ts` | N-engine cluster: per-engine ignition delay, thrust scatter, misalignment, duds, bursts, chain reactions → net force, wandering CoT, torque |
| `physics/tier1.ts` | Wan Hu planar flight sim with post-flight story; Bang Fai static margin (CoP vs CoM); Talai spin-stability bound |
| `chemistry/flameLab.ts` | Flame-test colour mixing from emission lines; sodium contamination; colour-match scoring |
| `chemistry/powderMill.ts` | Rhythm minigame → propellant *quality* 0–1 (craftsmanship only, no recipes) |
| `law/SpaceLawEngine.ts` | Rules engine: Thai airspace (placeholder zones), Outer Space Treaty, Registration & Liability Conventions, debris guidelines |

> ⚠ `law/zones.ts` radii/ceilings and the Thai rule summaries are **placeholders** — verify against current CAAT announcements / AIP before using them as teaching material.

**Hosting elsewhere:** the build path is one variable — `VITE_BASE=/your/subpath/ npm run build`.

## Content guidelines

V-2 and ICBM nodes teach ballistic trajectories and propulsion only, framed as the road to orbital
launchers. The 1957 animal flight is acknowledged honestly; the humour targets the missing re-entry
system, and that node is what unlocks the heat shield.

## Asset credits

- Earth day map and night lights: NASA Visible Earth (Blue Marble, Black Marble), public domain, via the three-globe examples. Clouds are generated procedurally in `GlobeView.ts`.
- Coastlines of Ko Samui and Ko Pha-ngan: Natural Earth 1:10m land, public domain, clipped in `src/law/samui.ts`.
- Samui airspace and runway data: AIP Thailand AD 2 VTSM (CAAT). For gameplay only, not for navigation.

Record every model in `src/assets/modelManifest.ts`. NASA media generally needs credit and must not
imply NASA endorsement; check each ESA model page for its specific terms.
