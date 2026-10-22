# Gameplay Fun Pass — follow-up (v0.23.0 + 3 small fixes)

**Build tested:** local build of `bc2348f` plus the working-tree fixes below (committed afterwards as the follow-up commit). Not production, not GitHub Pages.
**Environment:** headless Chromium via `tools/playtest/cli.mjs`, emulated touch viewports 360×640, 320×568, desktop 1366×768. No real device.
**Not pushed / not deployed.** `FIELD_NOTES_PUBLIC = false` is unchanged.

## 1. Observed facts (driven through the game, screenshots in `playtest/runs/fin/`, git-ignored)

| # | What was done | Result |
|---|---|---|
| 1 | Title card at 360×640 | "Watch the legend" / "Start building" were 38 px high → now 44 px |
| 2 | Factory jump chips at 360×640 | Row scrolled sideways with the scrollbar hidden; "Mixing bench" (right edge 443) and "Payloads" (581) were off-screen with no cue. Now all four fit (20–340 px) at 360 and 320 wide, 44 px high |
| 3 | M1: Khom loi blueprint → Roll out → Risk check → Ignition → 10× | Risk check said "Not safe: enters the RWY 17 final approach (T+0.7 min)". The real flight raised the RWY 17 alert at T+39.3 s (= 0.65 min) and logged the game penalty. **Forecast matched the flight.** Haad Rin is the default pad. |
| 4 | Same, on phone | After pressing Risk check the answer sat below the fold of the card stack (stack 177 px tall, content 508 px) — the player saw the mission text, not the verdict. Now the forecast is scrolled into view; verified by a real tap |
| 5 | Console during the flight | No page errors (only WebGL GPU-stall perf warnings) |
| 6 | tsc / vitest / build | clean / 295 of 295 / ok |

Flight outcome of the run in row 3 (Haad Rin): climb above 300 m ✓, apogee 0.75 km, airspace alert ✗ → M1 not completed. Consistent with the in-game hint that Haad Rin is under the approach.

## 2. Persona table

AI personas were **not** driven this round: the agents in `.claude/agents/` have no way to play through this session, and no relevant gameplay change since the 2026-10-22 reports (only layout/scroll tweaks). The five reports in `playtest/reports/` remain *simulated critique / heuristic review from before the fixes*, not human results.

| Persona | Real play this round? | Status | Evidence / limit |
|---|---|---|---|
| Lantern maker (north) | No — harness run of M1 by the author, not the persona | Not tested as persona | Fact 3 above |
| Bang Fai participant (Isan) | No | Not tested | M2 is covered only by `forecast.test.ts` (headless) |
| Physics teacher | No | Not tested | Physics questions below stay open |
| Teen gamer | No | Not tested | — |
| Astronaut | No | Not tested | M2.5 has not been flown by a human |

## 3. Unresolved questions (not answered by anything here)
- Does a first-time player find and press Risk check unprompted, and do they read the debrief?
- Can a person pass M2 with and without the hint (only headless evidence that 5 km is reachable at wind 0, ramp 0)?
- Does anyone reach M2.5?
- Do players want to continue, or stop, after M1 fails at Haad Rin?

## 4. UI fixes made
- `src/story/story.css`: title-card buttons `min-height: 44px`.
- `src/phases/assembly/factory.css`: below 480 px the jump chips are a 4-column grid (Thai sublabels hidden) so none are off-screen.
- `src/phases/launch/LaunchPhase.ts`: Risk check scrolls the forecast into view.

Seen but **not** changed (not part of the reported items): at 320 px wide the "Story" tab sits outside the viewport; the "✕" close buttons are 28 px; desktop mouse layout reports 30–40 px controls (the `fit` tool applies touch rules everywhere).

## 5. Known issues (open, deliberately not touched)
- Twin-tail Bang Fai: CP vs CoM position not verified against a reference.
- Bang Fai ~30 s burn: plausibility vs real ones unverified.
- Real iPhone: audio, private browsing, notch / safe area untested.
- Parachutes stay locked until Tier 2, so every M2 flight ends in a crash (the debrief says so).
- Passing unit tests does not show the physics is right.
- Field notes / regional pad greeting hidden pending a Lanna/Isan reviewer.

## 6. 10–15 minute human playtest
Give one person a phone, no instructions. Screen-record. Ask them to think aloud.
1. (3 min) Start → build a lantern → release at the default beach. Note: do they press Risk check? Do they understand the red verdict?
2. (4 min) Try to complete M1 (hint: Thong Sala). Note where they stop.
3. (5 min) Start M2; first without the hint, then open it. Record: what they change, how many flights, whether they read the debrief.
4. (2 min) Ask: would you play another round? Why / why not.
Record device, browser, private-mode or not, and whether any control was hard to hit.
