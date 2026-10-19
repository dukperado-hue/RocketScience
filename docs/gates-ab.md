# Engineering Gates A & B — report (v0.11.0)

Both gates pass: **110 tests passing** (21 of them in `src/orbit/gates.test.ts`), plus an end-to-end browser flight. The Three.js globe is still deliberately not started.

## Gate A — physics ⇄ rails handoff

### What changed

| Area | Before | Now |
|---|---|---|
| Physics integrator | semi-implicit Euler, 100 Hz | **velocity Verlet** (kick–drift–kick), 100 Hz: symplectic, 2nd order in gravity; thrust/drag/chutes held over the step |
| Gravity | `g0·(R/(R+h))²` along r̂ | `gravityAt(x, y) = −μ r/|r|³` — **the same μ and field as the rails** |
| Rails propagator | state → elements → Kepler's equation → state (a round-trip each chunk; separate ellipse/hyperbola code) | **universal variables** (Stumpff C/S) straight from the state: one formula for ellipse, parabola, hyperbola; no round-trip |
| Root finder | Newton | **rtsafe** (Newton guarded by bisection). F(χ) is strictly increasing, F′ = r > 0, so it always converges |
| Rails segment end | "half the time to fall to 140 km" heuristic, could overshoot | **exact time to the descending crossing of r = R + 140 km** (analytic, Newton-polished on the exact propagator) |
| Conic type | from e (rounding could disagree with the energy) | **from the energy** (dimensionless ε = E·r/μ, parabola when \|ε\| < 10⁻⁷); e is clamped to agree |

### Why Verlet, not RK4

RK4 is more accurate per step, but it is not symplectic. On an unpowered orbit its energy error grows steadily, lap after lap. Verlet's energy error stays bounded forever, which is what matters for a ship parked in orbit at 1× warp. The step is also tiny compared with an orbit (ωΔt ≈ 10⁻⁵).

Measured over one lap at 400 km:

| Integrator | Position error | Energy drift |
|---|---|---|
| Old Euler | < 1 mm | — |
| Verlet | < 1 cm | 10⁻¹³ |

Honest note: the integrator was never the weak point. The seam risks were all in the rails code: the elements round-trip, the interface overshoot, and the hyperbolic overflow below.

### Seam validation built into the game

Every switch of `propagationMode` writes a `Handoff` record to `flight.handoffs`.

- **physics → rails:** the last physics step is replayed with the exact propagator from the state before it, then compared with where physics actually put the vehicle.
- **rails → physics:** the first physics step is compared with the exact propagation from the rails exit state.

Each record holds Δr, Δv and the relative change of the two invariants (specific energy ε and angular momentum h). The tolerances (`SEAM_TOL`) are:

- Δr < 1 cm
- Δv < 1 mm/s
- relative ε, h < 10⁻⁷

A failed seam is logged in the flight log, with a console warning.

A seam is "validated" only when a match is physically expected: no thrust, above ~135 km, no open chute. A switch caused by lighting an engine is recorded but not judged.

**Measured:** across 79 alternating seams (1 s physics / 120 s rails, 40 cycles), the worst values were:

| Metric | Worst value |
|---|---|
| Δr | 2.6 × 10⁻⁹ m |
| Δv | 1.9 × 10⁻¹² m/s |
| Relative ε | 7.8 × 10⁻¹⁶ |
| Relative h | 2.9 × 10⁻¹⁶ |

In the browser flight: 1 seam, 1.6 × 10⁻⁹ m.

### Ground intersection and edge cases

- **Rails are allowed only in vacuum with nothing firing.** That means above 140 km, no engine able to push (a lit solid counts even at throttle 0), no open chute, and still flying.
- **A rails segment never goes below 140 km.** It ends at the exact descending crossing, so any orbit that meets the ground is handed back to physics at the interface. Drag, heating, chutes and the crash are always computed by physics. The test releases a vehicle on a ground-intersecting trajectory:
  - the handoff happens at 140 km ± 1 m;
  - the vehicle is never on rails below 140 km;
  - the flight ends in impact under physics, and the mission phase becomes `landed`.
- **Bugs the gates caught and fixed:**
  1. **Radial / degenerate states.** On the pad, h ≈ 0 so e ≈ 1, and the old code classified a vehicle sitting on the pad as an *escape*. The conic type now comes from energy.
  2. **Hyperbolic overflow.** At large warps, cosh/sinh overflow to ∞·0 = NaN. The root finder kept Newton-crawling and returned r ≈ 10⁸⁷ m. Fixed with rtsafe plus clamping by monotonicity.
  3. **Seam altitude logging.** It was recorded one step late (12.8 m off). It now records the switch point.
  4. **False "Tumbling" alarm.** It fired during orbit insertion, where pitch past horizontal is correct. Tumble now also requires angle of attack > 45°.
- **Edge cases tested against an independent RK4 reference** (Δt = 0.05 s), with error under 5 m after hours of flight:
  - circular orbit;
  - e ≈ 0.5;
  - e ≈ 0.97, which returns to its start within 1 m after 1 and after 25 periods;
  - hyperbolic;
  - near-parabolic at e = 1 − 10⁻⁹, 1, and 1 + 10⁻⁹;
  - a 5 × 10⁶ s hyperbolic warp, which stays finite with energy conserved.

## Gate B — three separate state variables (`src/orbit/state.ts`)

| Variable | Values | Decided by |
|---|---|---|
| `orbitClass` | `stable` (Pe > 140 km) · `decaying` (70 < Pe ≤ 140) · `suborbital` (Pe ≤ 70 or into the ground) · `escape` (hyperbolic/parabolic, or apoapsis beyond Earth's SOI, 924,000 km) | the conic only (`classifyOrbit`, pure) |
| `propagationMode` | `physics` · `rails` | how the last advance was computed |
| `missionPhase` | `ascent` → `orbital` ⇄ `deorbit` → `landed` (terminal) | `OrbitStateMachine` transitions |

- **Hysteresis.** A ±500 m band on the periapsis boundaries, so a Pe wobbling on 140 km cannot flicker CAPCOM or the achievements. This is tested at 139.8, 140.2, 139.7 and 140.3 km.
- **Phase rules:**
  - `ascent → orbital` when the class becomes stable or escape. A decaying orbit is **not** an orbit.
  - `orbital → deorbit` when the class becomes suborbital. Decaying only raises a warning.
  - `deorbit → orbital` on a re-boost.
  - `* → landed` on ground contact.
- **Events come only from transitions:**

  | Transition | Event | Milestone |
  |---|---|---|
  | `ascent → orbital` (stable), first time | `orbit` + `zombie-sat` | Falling and missing, Zombie-Sat |
  | later returns to orbit | `reboost` | — |
  | `stable → decaying` | `decaying` | — |
  | `orbital → deorbit` | `deorbit` | Coming home |
  | class → `escape` | `escape` | Goodbye, Earth |
  | laps | `lap`, counted by swept angle (robust at any warp) | — |

**Design consequence.** Zombie-Sat now means Pe > 140 km; the earlier Sprint D spec used 100 km. The old ascent ended at 2,560 × 134 km, which is now correctly *decaying*. The new Ascent Assist reaches 583 × 150 km.

## Tools

- **Maneuver Node Lite** (`src/orbit/maneuver.ts` plus the map panel):
  - choose when to burn (now, at Ap, at Pe) and a Δv from −1,500 to +1,500 m/s, or press Circularise;
  - see the dotted pink orbit, the node diamond and the new Ap/Pe;
  - see the class verdict, the time to the node, and the burn time from the rocket equation using the current engines;
  - pure preview: it never touches the ship, and a test checks this.
- **Ascent Assist** (`src/orbit/ascent.ts`, V key; cycles Off → Guide → Auto):
  - **Guide** draws a green "fly here" arrow on the rocket and shows a hint banner.
  - **Auto** steers, throttles to 3.5 g, stages, holds a 200 km insertion, and cuts the engine at Pe > 150 km.
  - The default profile is horizontal at about 100 km (45° at about 32 km).
  - **The suggested "45° at 10 km, 0° at 50 km" profile burns the Naga up in this sim:** zombie seat at 660 °C, four burn-ups, impact. It is kept as `PROFILE_STEEP_TURN` for comparison and teaching.

## Not done yet

- Three.js globe (after these gates).
- Execute-node autopilot.
- Radial/normal burns.
- Zombie art import: the user's computer was not reachable from this session.
