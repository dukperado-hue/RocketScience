# Sprint D — Orbital Phase & 3D payloads (v0.10.0)

Status: **data structures, physics and the map transition are in; the full map renderer is a 2D scaffold** waiting for sign-off before the Three.js globe.

## 1. How 3D models merge with the 2D game

**Decision: bake models into sprites. No live Three.js overlay.**

```
FactoryPartDef.payload3d ──► modelSprites.get(def, px, roll)
                                │ cache hit → HTMLCanvasElement → ctx.drawImage (same canvas as flames/smoke)
                                │ miss      → queue bake → lazy import('three') → GLTFLoader(+DRACO)
                                │             GLB missing? → primitive placeholder
                                │             fitToBox(def.w × def.h) → ortho side view → 2D canvas
                                └ onReady() → factory / inventory / launch view redraw
```

| Concern | Who owns it |
|---|---|
| Mass, size, nodes, drag, heat, collisions | the part's 2D box in `catalog.ts` → `flight2d.ts` (unchanged authority) |
| Appearance | the GLB (or placeholder), scaled to exactly that box |
| Roll / spin | 16 roll buckets baked on demand; `drawPart(..., roll)` |
| Zoom | size buckets in powers of √2 (32–512 px) |

Why not a synced overlay: an overlay canvas is either all in front of or all behind the 2D scene, so exhaust, smoke and other parts would draw in the wrong order. It also needs a second camera kept in step with the 2D camera at every zoom and shake, and a separate WebGL context per view. Baking puts all of that cost on cache misses.

### Data structure

```ts
interface Payload3D {
  model: string;            // 'models/zomsat.glb' under public/ (BASE_URL-relative)
  placeholder: 'sputnik' | 'satellite' | 'telescope';
  upAxis?: 'y' | '-y' | 'x' | '-x' | 'z' | '-z';   // NASA models are often z-up
  credit?: string;          // shown in Asset credits
  orbital: true;            // drives pre-flight Δv check + CAPCOM
}
FactoryPartDef.payload3d?: Payload3D
```

Parts:

- **ZomSat-1**: 220 kg, seat + RCS, a zombie in the porthole.
- **Communications satellite**: 380 kg.
- **Space telescope**: 1.9 t, large node.

Drop a `.glb` file into `public/models/` and it replaces the placeholder automatically. Verified in headless Chromium: the WebGL bake works and inventory thumbnails show the shaded placeholders.

## 2. Physics → orbit

- **Curved Earth.** `flight2d.ts` now uses an Earth-centred inverse-square field (μ = g₀R²). The launch view draws in a local flat frame (`toLocal`), so nothing looks different near the pad.
- **Keplerian elements.** `src/orbit/kepler.ts` provides:
  - `elements(r, v)` → a, e, ω, ν, M, rP, rA, period
  - `propagate`, `timeTo('apo' | 'peri')`
  - `orbitPath` (clipped at the ground)
- **On rails.** `Flight.advanceWarp(s)`:
  - Above 140 km with nothing firing, it propagates analytically, in chunks that shrink as the vehicle approaches the air.
  - Otherwise it runs 100 Hz physics.
  - Rails and physics agree to under 2 km over a quarter orbit (tested).
- **Events from `checkOrbit()`.** `orbit` fires when Pe > 100 km. It also fires:
  - `zombie-sat`, once;
  - `lap`, after half a period;
  - `deorbit`, when Pe < 70 km;
  - `escape`.

## 3. Transition to the Orbital Map

```
Launch view ──Tab / Map button──► Map view          (enabled: airborne && (Kármán crossed || alt > 70 km))
   same Flight object, same controls (throttle, SAS prograde/retrograde, RCS, staging)
   warp ladder swaps 1/2/4/10 ⇄ 1/10/100/1k/10k
   rails? full warp : capped at 10× and the HUD says why
   engine lights while above 10× → drops to 1×
```

- **`MapView.ts`** has the same `frame(flight, dt)` contract as `LaunchView`. It draws the following on a 2D canvas: Earth, the Kármán ring, the predicted conic (cyan when stable, dashed orange when it hits the ground), Ap/Pe markers with time-to-go, the vehicle's attitude and prograde direction, and debris. The Three.js globe will implement the same interface.
- **Orbit HUD card:**
  - Ap, Pe, time to Ap, period;
  - a classification of Stable, Decaying, Suborbital or Escape;
  - a rails or physics indicator.

## 4. Story

- **Pre-flight.** A vehicle carrying an orbital payload logs its staged Δv against the ~9.4 km/s LEO budget. Prof. Owl comments on whether the budget closes.
- **CAPCOM lines** cover orbit, Zombie-Sat (the Tortoise Clerk registers it under the Registration Convention), lap, de-orbit and escape.
- **Milestones** (`src/core/milestones.ts`, localStorage):
  - It moves
  - Space passport
  - Falling and missing
  - **Zombie-Sat**
  - Around the world
  - Coming home
  - Goodbye, Earth

## 5. Findings worth knowing

- **The Tier 1–3 engines can't reach orbit on a real-size Earth.** Their thrust-to-weight of about 11:1 is KSP-like, so stacks lose too much Δv. The Naga Heavy stages to 7.7 km/s but only achieves about 5.6 km/s. Two Tier-4 engines (Modern booster and Modern vacuum) close the gap.
- **Hand-flying works, but it takes a profile.** The guidance that reliably reaches orbit:
  - pitch = 90°·(h / 100 km)^0.6;
  - then hold near horizontal on vertical speed;
  - limit to 3.5 g;
  - cut at Pe > 140 km.
- **The Phaya Naga Orbital blueprint** (Δv 10.3 km/s) reaches orbit at about 2,560 × 134 km with the zombie intact. This is covered by a test.

## Next (after sign-off)

1. Three.js globe for `MapView` (same interface), with day/night and the payload's own model at the vehicle marker.
2. Manoeuvre-node lite: drag a prograde/retrograde Δv on the orbit and preview the new conic.
3. An optional "ascent assist" button that flies the profile above, as a teaching aid.
4. Sprint B: sky lanterns and buoyancy.
