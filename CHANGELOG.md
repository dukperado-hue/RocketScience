# Changelog

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
