# Changelog

## v0.23.0 — Gameplay Fun Pass (unreleased)

> **Field notes are hidden in this build.** `FIELD_NOTES_PUBLIC = false` in `src/story/culture.ts` hides the Bang Fai / Yi Peng notes and the regional pad greeting until a Lanna / Isan reader reviews them. The drafts stay in the source; set the flag (or `reviewed: true` per note) to show them.

Driven by the five-persona playtest of 2026-10-22 (`playtest/reports/`): nobody passed Mission 2, nobody reached 2.5, the HUD
contradicted the flight log, and small screens stacked cards on top of each other.

### Small screens
- **Launch HUD rebuilt as three measured containers** (left: flight data / payload / orbit · right: goal / forecast / site / radar /
  log · bottom: CAPCOM and controls). Cards can no longer overlap: the stacks stop where the controls start (`--bar-h`,
  `--bottom-h`, measured with a ResizeObserver). `.compact` (< 900 px wide or < 660 px tall), `.phone` (< 640 px) and `.tiny`
  (< 460 px tall) change density, not content. The camera frames the vehicle between the top cards and the dock.
- The control bar wraps instead of squeezing labels together; a lantern or Bang Fai loses SAS / Hold / RCS / Auto-turn / throttle /
  pitch buttons it cannot use. Fast-forward is no longer rewritten every frame.
- Factory on phones: slim top bar, toolbar above (not on) the vehicle with 44 px buttons, a fixed dock with TWR · Δv · mass · first
  warning next to *Roll out*, jump chips (Blueprints · Parts · Mixing bench · Payloads), first-run coach as a strip.
- Checked at 360×640, 390×844, 740×360 (landscape), 768×1024, 1024×600, 1366×650 and 1366×768.

### Predict → Launch → Debrief → Improve
- **Forecast** (`src/game/flightFacts.ts`): the launch screen runs the *same* `Flight` headless with your settings (5–40 ms for a
  rocket, 1–3 s for a 25-minute lantern → *Risk check* button) and says what will happen. Tested to match the real flight exactly.
- **Debrief** (`src/game/debrief.ts`) on the summary card: headline, flight path with the goal line, *why* (tumble time and altitude,
  speed off the ramp vs crosswind, centre of pressure vs centre of mass, burn time vs the pre-flight panel, parachute, powder batch),
  *try next* (alternative settings that were actually simulated), and a comparison with the previous flight.
- **Discoveries / Logbook** (`src/game/achievements.ts`): 11 badges for things found by flying; Missions tab shows the Logbook.
- HUD/log consistency: Mach and throttle read 0 / — after the flight ends and throttle only shows for throttleable engines;
  "Coming down fast" states the real speed.

### Missions
- **Mission 1 is now a decision, not a violation**: keep the lantern out of Samui airspace for the whole flight and climb above
  300 m (new check `flight-clear`, evaluated when the flight ends). Haad Rin lies under the RWY 17 approach, so a lantern there alerts
  at lift-off; Thong Sala with the NE wind floats out to sea. *Risk check* shows it before you release.
- **Mission 2 can be passed by following the hint**: twin tails, vertical ramp, *Dawn · calm* (wind 0), powder ≥ 60 %. The goal strip
  is on the launch screen with a one-tap *Set up as hinted*; ramp angle and wind are remembered per site type between roll-outs.
  Physics is unchanged: 5.7 km at wind 0 / ramp 0°, never more than 2.4 km with any crosswind (tested in `forecast.test.ts`).
- **Powder quality now matters**: a lumpy Mixing-bench batch costs up to 12 % impulse on solid motors (smooth, no cliff);
  the Factory pre-flight panel, the forecast and the debrief say so. Quality 1 (and every existing test) is unchanged.
- Mixing bench: "What do these do?" help, recipes as ingredient classes (no chemicals, no amounts), quality shown as −x % impulse.
- Mission names: *Mission 2 · codename BAMBOO FEVER* no longer reads as a second title.

### Culture
- **Field notes** (`src/story/culture.ts`, shown in the Story room and on each mission card): Yi Peng (Lanna) and Bun Bang Fai
  (Isan, Phaya Thaen, rain, the mud) with a few northern / Isan words, and the spirit house; each states what the game simplifies.
  **Draft for community review** (`reviewed: false`). CAPCOM greets Yasothon and the lantern beaches with local colour.

### Tools
- Playtest harness: `--viewport WxH` (mouse) or `WxHt` (touch) for any screen size.
- Tests: 282 → 295 (forecast = flight, M2 hint is true, M1 clear vs alert, debrief wording and bilingual lines, badges, quality).

## v0.22.3 — soft launch, round 2 (branch `softlaunch`)

Playtest-driven polish. No physics or balance changes: the only edits near physics are message strings
(see `playtest/PHYSICS_NOTES.md` for the model questions that were left alone).

### Flow
- **Fast-forward** (⏩ เร่งไปดูผล): while no engine is burning (lantern floating, coasting, under a parachute) the same
  `Flight.step()` runs many times per frame at the same fixed step — bit-identical to playing at 1× (tested). It stops on
  airspace alerts, mission progress, a fast fall or the ground, and routine-breaking flight events.
  Measured (headless Chromium, ignition to summary): Up! chair 183 s at 10× → 93–105 s; Khom loi lantern ≈150 s at 10× → 17 s.
- **Objective banners**: every met objective shows a bilingual banner at once with a CAPCOM line and a log entry;
  the Mission-complete card is bilingual too.
- **End of Early Access card** appears the moment Mission 2.5 is met (the flight waits behind it). *Keep flying* hides it and
  brings it back when the flight ends.
- **CAPCOM and the flight log keep up**: lines are stamped with flight time and dropped when more than 1 s old, urgent lines skip
  the pacing gap; the "Impact in ~N s" line now states real altitude and fall speed.

### Onboarding and locks
- First "Start building": Khom loi is loaded for Mission 1 with a pointer to *Roll out*; on phones *Roll out* floats at the bottom and
  blueprints are first in the Parts list. (v0.22.2 follow-up, in this release's history: Retry remembers the launch site;
  R mid-flight uses the same Quick Retry; Quick Retry from the Launch tab; slider focus fix; SAS ON/OFF HUD and hint.)
- Every locked part or blueprint says where it unlocks and takes you there: the Mixing bench (opens and scrolls), Missions
  (one-tap button), or an Early Access explanation. The Sandbox banner now says what is still locked and why.

### Phones
- One bottom dock for the site card, radar and CAPCOM; all controls inside 390 px with 44 px targets; the vehicle is lifted and
  fitted into the free sky above the dock.

### Wording (no model change)
- "Re-entry plasma / blackout" only from 3 km/s up; below that it is "Hypersonic heating".
- Auto-turn is described as the pitch program it is. Legal/penalty text is neutral until reviewed (`playtest/LEGAL_TEXT.md`).

### Tooling
- Playtest harness: per-persona sessions, `--private`, `newtab`, `fit`; six persona agents under `.claude/agents/`.

## v0.22.2 — soft launch polish
safeKV, WebAudio unlock, Quick Retry, bilingual disclaimers, analytics.

## v0.22.1 — "Up!" / Early Access
Tagged original state.
