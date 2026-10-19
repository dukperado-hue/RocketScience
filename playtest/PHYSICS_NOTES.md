# Physics notes — items from the nasa-engineer playtest (not changed)

Rule for this sprint: wording that was wrong was fixed; anything in the **physics model** is only proposed here.
I checked each claim against `src/physics/flight2d.ts` first.

## Fixed (wording only — no physics changed)
| nasa-engineer said | What the code does | What I changed |
|---|---|---|
| "Re-entry plasma … Expect blackout" at ~1.7 km/s (Mach ~5.7) | The event fires when **Mach > 5**, the vehicle is falling, and the flow energy ½ρv³ exceeds 10 MW/m² (`flight2d.ts` `heat()`). Nothing in the model computes ionisation or radio blackout; the text just claimed it. | The event text now says **"Hypersonic heating (Mach N)"** below 3 km/s and keeps **"Re-entry plasma"** from 3 km/s up. CAPCOM no longer says plasma/blackout/"hotter than the Sun" for the hypersonic case. The trigger condition is unchanged. |
| "Auto-turn" announced as a **gravity turn** | True: the control only leans the SAS target by a fixed 1°/s until 80° (`controls.turnRate`, `turnTo`). That is a pitch program, not a zero-angle-of-attack gravity turn. (The SAS **prograde** mode is the one that follows the flight path.) | Tooltip and log line now say "Pitch program … a fixed schedule, not a true zero-angle-of-attack gravity turn (try SAS prograde)". The button label and behaviour are unchanged. |

## Model questions — proposals, **not** implemented
1. **Parachute rating ignores load.** `chute: { diameter, maxSpeed }` — a canopy only shreds if it **opens above its rated speed** (`deployChutes`, `flight2d.ts:781`). There is no limit on the mass it carries or the opening force. A "Parachute, small" (6 m, 5.4 kg) therefore slows a ~6 t vehicle from 167 m/s without tearing, as nasa-engineer saw (the speed was under its 180 m/s rating). Proposal: add a rated opening force or rated mass per canopy (e.g. rated force ≈ ½ρv²·Cd·A at the rated speed for a rated mass), shred or "tear to a smaller effective area" above it, and show the rated mass in the part card. This changes balance (which builds survive), so it needs your call.
2. **Hypersonic-heating threshold.** Raising "plasma" gating from Mach 5 to an orbital-speed condition (≥ ~3 km/s) would make the wording and the model agree; today only the wording does. The thermal model (Sutton–Graves + recovery temperature) itself is untouched by this.
3. **Mach number above ~100 km** (HUD showed Mach 6.9 at 157 km): `speedOfSound` is a fixed 295.1 m/s above 11 km, so Mach keeps rising in vacuum. Display-only fix possible ("—" above ~100 km); the model has no atmosphere there anyway (ρ→0).
4. **Skin temperature after impact stays high** (294 °C) and **throttle shows 100 % after burnout**: HUD/thermal cooling on the ground is not modelled (parts radiate to 250 K with a long time constant). Proposal: cool wrecks toward ambient on the ground, show throttle "—" with no engine burning.
5. **Impact estimate**: the "Impact in ~N s" line used a gravity-only estimate (drag makes the real impact later). Wording was fixed in the log (it now states altitude and fall speed); a drag-aware estimate would be a model addition.
6. **Outer Space Treaty / 100 km** (Tortoise Clerk line): not physics; the legal wording is in `playtest/LEGAL_TEXT.md` and was already neutralised.
