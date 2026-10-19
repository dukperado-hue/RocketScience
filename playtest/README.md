# Playtest harness

Drives the built game in headless Chromium (Playwright) so an agent can play it from the shell.
Code: `tools/playtest/cli.mjs`. Output: `playtest/runs/<persona>/` (git-ignored). Report form: `REPORT_TEMPLATE.md`.

One-time setup: `npm install` then `npx playwright install chromium`.

```
node tools/playtest/cli.mjs start <persona> [--viewport desktop|mobile] [--private] [--rebuild]   # desktop 1366x768 · mobile 390x844 touch
                                                       # --private: localStorage throws (Safari Private Mode)
node tools/playtest/cli.mjs newtab | reload | perf  # close the tab and come back (saves persist) · reload · load timings
node tools/playtest/cli.mjs screenshot [label]      # -> playtest/runs/<persona>/NNN-label.png (view it with an image reader)
node tools/playtest/cli.mjs click 640 400           # viewport pixels (tap on mobile)
node tools/playtest/cli.mjs tap "[data-act=go]"     # click by CSS selector, or  tap "text=Fly again"
node tools/playtest/cli.mjs key Space               # also: r, Escape, ArrowLeft, Shift+z
node tools/playtest/cli.mjs hold a 1.5              # hold a key for N seconds
node tools/playtest/cli.mjs drag x1 y1 x2 y2        # Factory part placement
node tools/playtest/cli.mjs type "text" · wait 5
node tools/playtest/cli.mjs log        # flight log, CAPCOM line, toast, milestone card, summary card
node tools/playtest/cli.mjs events     # window.__rsEvents (analytics)
node tools/playtest/cli.mjs state      # phase, mission, T+, altitude, velocity, apogee, retry attempt, storage mode
node tools/playtest/cli.mjs console    # browser console + page errors
node tools/playtest/cli.mjs eval "document.title"
node tools/playtest/cli.mjs stop
```

Sessions are per persona, so several run in parallel; add `--persona <name>` (or `-p`) to every command after `start`
(optional when only one session is running). Build once first (`start … --rebuild`) — parallel starts must not rebuild.

`start` builds the game into `dist-playtest/` the first time (use `--rebuild` after code changes) and serves it
with Vite preview. The session runs in a background process; each command is a separate call.

## Example: Mission 1 with the khom loi blueprint
```
start m1-lantern
tap "[data-pr=skip]"                 # dismiss the title card
tap "[data-preset=khom-loi]"         # Factory: load the blueprint
tap "[data-act=launch]"              # Roll out to the pad (defaults are already Haad Rin, wind 015°, no permit)
key Space                            # ignition
tap "[data-warp='10']"               # 10x warp; the lantern drifts into Samui airspace in ~30 s of game time
wait 30  ·  state  ·  log            # repeat until `summaryOpen: true`; M1 completes on the violation
key r                                # Retry Flight from the summary card
```
