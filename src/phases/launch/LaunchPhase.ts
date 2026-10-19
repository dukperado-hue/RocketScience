/**
 * Phase 2 — Launch & Flight (live).
 *
 * Runs a `Flight` in real time (fixed 100 Hz physics, ×1/×2/×4 warp) and
 * draws it with `LaunchView`. HUD cards stay in the light theme:
 *   flight data · zombie status (live portrait) · launch site (before ignition)
 *   · flight log ticker · control bar · post-flight summary.
 *
 * Keys: Space countdown → ignition, then stage · T SAS · M SAS mode · F RCS · P parachute · G auto-turn ·
 *       Shift/Ctrl throttle up/down · Z full · X cut · A/D or ←/→ pitch ·
 *       1/2/3/4 warp (1×, 2×, 4×, 10×) · C camera · +/− zoom · R relaunch · Esc back to factory
 *       Tab orbital map (after the Kármán line) — in the map, 1–5 warp 1× … 10 000×
 *       E spacewalk (in orbit): eject the zombie, then E swaps control ship ⇄ zombie · K kit ·
 *         while flying the zombie: W fire · S fire the other way · A/D flail (or attitude jets)
 *       V ascent assist: off → guide (ghost arrow + hints) → auto (flies the gravity turn)
 *       Map: maneuver node lite — plan a prograde/retrograde Δv, preview the new orbit
 *
 * Orbital map (Phase 3): the same Flight keeps running; only the renderer and the
 * warp ladder change. Above RAILS_ALT with no engine burning, `Flight.advanceWarp`
 * propagates on Kepler rails, so huge warps are exact and cheap; anything else
 * (air, thrust, chutes) falls back to 100 Hz physics and the warp is capped at 10×.
 */
import type { Phase } from '@/core/PhaseManager';
import { bus, type LaunchPayload } from '@/core/EventBus';
import { PART } from '@/phases/assembly/model/catalog';
import { analyse, type PlacedPart } from '@/phases/assembly/model/vehicle';
import { VehicleStore } from '@/phases/assembly/store';
import { Flight, SITES, toLocal, R_EARTH, MU_EARTH, stagedDeltaV, LEO_DV, type LaunchSite } from '@/physics/flight2d';
import { timeTo } from '@/orbit/kepler';
import { AscentAssist, PROFILE_TIER3, PROFILE_TIER4, type AssistOutput } from '@/orbit/ascent';
import { planManeuver, circularizeDv, burnTime, type NodeAt } from '@/orbit/maneuver';
import { unlock } from '@/core/milestones';
import { ZOMBIES, type Limb } from '@/payload/zombies';
import { LaunchView } from './LaunchView';
import { MapView, fmtDur } from './MapView';
import type { GlobeView } from './GlobeView';
import { PlaneFrame, snapshot, LAUNCH_RANGES, YASOTHON, type GeoSite } from '@/orbit/frame3d';
import { Capcom, CREW, portrait, ZOMBIE_QUIPS, type Line } from './capcom';
import { moodOf, drawMood, MOOD_ART, MOOD_TEXT, type Mood } from './zombieMood';
import { playCutscene, nextWanHuTake, cutscenesEnabled } from '@/story/story';
import { playPalateCleanser } from '@/vfx/palateCleanser';
import { showEarlyAccessEnd } from '@/ui/earlyAccess';
import { openGallery } from '@/story/story';
import { ZOMBIES as ZB, isTerminal } from '@/payload/zombies';
import { AirspaceMonitor, type AirspaceAlert } from '@/law/airspaceMonitor';
import { LANTERN_SITES } from '@/law/samui';
import { RadarView } from './RadarView';
import { campaign } from '@/campaign/missionManager';
import { flightReport, type LaunchContext } from '@/campaign/report';
import type { Mission } from '@/campaign/campaign';
import { surfaceTrack } from '@/world/surface';
import { Heightfield } from '@/world/terrain';
import { ImpactDirector, impactSoon } from '@/juice/impactDirector';
import { sfx } from '@/juice/proceduralAudio';
import { FEATURES } from '@/core/features';
import type { Wreck, Mark, Touch } from './LaunchView';

/** Per launch site, for the session: its craters, scorch marks and baked wrecks persist between flights */
const SITE_STATE = new Map<string, { terrain: Heightfield; wrecks: Wreck[]; marks: Mark[] }>();
import type { Weather } from '@/vfx/environment';
import './launch.css';

const WARPS = [1, 2, 4, 10] as const;
const MAP_WARPS = [1, 10, 100, 1000, 10000] as const;
/** Physics (not on rails) can't go faster than this without the frame stalling */
const PHYS_WARP_CAP = 10;
const LIMBS: Limb[] = ['head', 'left arm', 'right arm', 'left leg', 'right leg'];

/** Bang Fai go up a tall bamboo ramp; Wan Hu's chair sits on the ground; everything else gets a pad rail */
export function defaultSite(parts: PlacedPart[]): { id: 'ground' | 'pad' | 'ramp'; site: LaunchSite } {
  const envelopes = parts.filter((p) => PART[p.defId].envelope).length;
  // an "Up!" cluster is a 20 m sail that lifts off with almost no spare lift: the pad rail holds it
  // upright (like the ground crew holding a lantern until it tugs) until it clears 6 m
  if (envelopes > 12 || (envelopes && parts.some((p) => PART[p.defId].crew))) return { id: 'pad', site: { ...SITES.pad, wind: 4 } };
  if (envelopes) return { id: 'ground', site: { ...SITES.ground, rail: 0, railAngleDeg: 0, wind: 4 } };
  if (parts.some((p) => p.defId === 'bang-fai')) return { id: 'ramp', site: { ...SITES.ramp, rail: 25, railAngleDeg: 10 } };
  if (parts.some((p) => p.defId === 'wooden-chair') && parts.every((p) => PART[p.defId].tier === 1)) return { id: 'ground', site: { ...SITES.ground } };
  return { id: 'pad', site: { ...SITES.pad } };
}

const TEMPLATE = `
<div class="flight-view">
  <canvas class="sky-canvas" aria-label="Flight view"></canvas>
  <div class="map-layer" hidden>
    <canvas class="map-gl" aria-label="Orbital map — drag to rotate, scroll to zoom, right-drag to pan"></canvas>
    <canvas class="map-canvas" aria-label="Orbital map (2D)" hidden></canvas>
    <div class="map-labels" aria-hidden="true"></div>
    <div class="map-tools" role="toolbar" aria-label="Map view">
      <span class="seg"><button type="button" data-act="map3d">3D</button><button type="button" data-act="map2d">2D</button></span>
      <span class="seg" data-only3d><button type="button" data-act="focusEarth">Earth</button><button type="button" data-act="focusShip">Ship</button></span>
      <button type="button" data-act="recentre" data-only3d title="Frame the whole orbit again">Re-centre</button>
      <small class="map-hint" data-only3d>Drag to rotate · scroll to zoom · right-drag to pan</small>
    </div>
  </div>

  <section class="hud-card hud-flight" aria-label="Flight data">
    <header><b>T+<span data-k="t">0.0</span> s</b><span class="pill" data-k="state">On the pad</span></header>
    <dl>
      <div><dt>Altitude</dt><dd data-k="alt">0 m</dd></div>
      <div><dt>Velocity</dt><dd data-k="vel">0 m/s</dd></div>
      <div><dt>Mach</dt><dd data-k="mach">0.00</dd></div>
      <div><dt>Vertical</dt><dd data-k="vy">0 m/s</dd></div>
      <div><dt>Apogee</dt><dd data-k="apo">—</dd></div>
      <div><dt>Pitch</dt><dd data-k="pitch">0°</dd></div>
      <div><dt>Throttle</dt><dd data-k="thr">100%</dd></div>
      <div><dt>Skin temp</dt><dd data-k="temp">25 °C</dd></div>
    </dl>
    <div class="hud-sas" data-k="sasline"></div>
  </section>

  <div class="hud-assist" data-k="assist" hidden aria-live="polite"></div>

  <section class="hud-card hud-zombie" aria-label="Payload">
    <div class="z-frame"><canvas class="z-portrait" width="144" height="156"></canvas><img class="z-art" alt="" hidden></div>
    <div class="z-info">
      <b data-k="zname">No payload</b>
      <small data-k="zstate"></small>
      <div class="g-read"><span>Seat</span><b data-k="g">1.0</b><span>g</span></div>
      <div class="g-bar"><i data-k="gbar"></i><em data-k="glimb"></em><em data-k="gdead"></em></div>
    </div>
  </section>

  <section class="hud-card hud-orbit" aria-label="Orbit" hidden>
    <h3>Orbit <span class="pill" data-k="otype">—</span></h3>
    <dl>
      <div><dt>Apoapsis</dt><dd data-k="oap">—</dd></div>
      <div><dt>Periapsis</dt><dd data-k="ope">—</dd></div>
      <div><dt>Time to Ap</dt><dd data-k="otap">—</dd></div>
      <div><dt>Period</dt><dd data-k="oper">—</dd></div>
    </dl>
    <div class="hud-sas" data-k="owarp"></div>
  </section>

  <section class="hud-card hud-eva" aria-label="Spacewalk" hidden>
    <h3>Spacewalk <span class="pill" data-k="evactl">Flying: zombie</span></h3>
    <div class="eva-gas"><span data-k="evakit">Fire extinguisher</span><i><b data-k="evabar"></b></i><small data-k="evapct"></small></div>
    <dl>
      <div><dt>Δv left</dt><dd data-k="evadv">—</dd></div>
      <div><dt>Spin</dt><dd data-k="evaspin">—</dd></div>
      <div><dt>From ship</dt><dd data-k="evadist">—</dd></div>
      <div><dt>Closing</dt><dd data-k="evarel">—</dd></div>
      <div><dt>Its orbit</dt><dd data-k="evaorb">—</dd></div>
      <div><dt>Status</dt><dd data-k="evastat">—</dd></div>
    </dl>
    <div class="hud-sas" data-k="evahint"></div>
  </section>

  <section class="hud-card hud-node" aria-label="Maneuver node" hidden>
    <h3>Maneuver node <small>preview — the ship is not touched</small></h3>
    <div class="seg" role="radiogroup" aria-label="Burn at">
      <button type="button" data-node-at="now" role="radio">Now</button>
      <button type="button" data-node-at="apo" role="radio">At Ap</button>
      <button type="button" data-node-at="peri" role="radio">At Pe</button>
    </div>
    <label class="slider">Δv prograde <output data-k="ndv">0 m/s</output><input type="range" min="-1500" max="1500" step="5" value="0" data-in="ndv"></label>
    <div class="node-btns">
      <button type="button" data-node-dv="-10">−10</button><button type="button" data-node-dv="-1">−1</button>
      <button type="button" data-node-dv="1">+1</button><button type="button" data-node-dv="10">+10</button>
      <button type="button" data-act="ncirc" title="Δv that makes the orbit circular at the node">Circularise</button>
      <button type="button" data-act="nclear">Clear</button>
    </div>
    <dl>
      <div><dt>New Ap</dt><dd data-k="nap">—</dd></div>
      <div><dt>New Pe</dt><dd data-k="npe">—</dd></div>
      <div><dt>Node in</dt><dd data-k="nt">—</dd></div>
      <div><dt>Burn time</dt><dd data-k="nbt">—</dd></div>
    </dl>
    <div class="hud-sas" data-k="nhint">Pick where and how much. The dotted pink line is the orbit you would get.</div>
  </section>

  <section class="hud-card hud-site" aria-label="Launch site">
    <h3>Launch site</h3>
    <div class="seg" role="radiogroup">
      <button type="button" data-site="pad" role="radio">Pad rail · 6 m</button>
      <button type="button" data-site="ramp" role="radio">Bamboo ramp</button>
      <button type="button" data-site="ground" role="radio">Bare ground</button>
    </div>
    <label class="slider" data-only="ramp">Ramp length <output data-k="rl"></output><input type="range" min="10" max="30" step="1" data-in="rail"></label>
    <label class="slider" data-only="ramp">Ramp angle <output data-k="ra"></output><input type="range" min="0" max="25" step="1" data-in="angle"></label>
    <label class="slider">Wind <output data-k="wd"></output><input type="range" min="0" max="8" step="0.5" data-in="wind"></label>
    <label class="range-pick" data-only="range">Range <select data-in="range">${LAUNCH_RANGES.map((r) => `<option value="${r.id}">${r.site.name}</option>`).join('')}</select>
      <small data-k="rangenote"></small></label>
    <button type="button" class="site-clean" data-act="cleanup" hidden>Clear craters &amp; wrecks</button>
    <div class="law-site" data-only="lowtier">
      <label>Location <select data-in="lsite">${LANTERN_SITES.map((s) => `<option value="${s.id}">${s.name}</option>`).join('')}<option value="yasothon">Yasothon (Bang Fai festival)</option></select></label>
      <label data-samui>Wind from <select data-in="wdir">${[0, 15, 45, 90, 135, 180, 225, 270, 315].map((d) => `<option value="${d}">${String(d).padStart(3, '0')}° ${['N', 'NNE', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][[0, 15, 45, 90, 135, 180, 225, 270, 315].indexOf(d)]}</option>`).join('')}</select></label>
      <label class="chk" data-samui><input type="checkbox" data-in="permit"> District permit + Samui Tower notified</label>
      <small data-k="sitenote"></small>
    </div>
  </section>

  <section class="hud-card hud-radar" aria-label="Airspace radar" hidden>
    <header><h3>Radar · Samui Tower</h3><span class="pill" data-k="radarstate">Clear</span></header>
    <canvas class="radar-canvas"></canvas>
    <div class="radar-foot"><span data-k="radarpos">—</span><b data-k="radarfine"></b></div>
  </section>
  <div class="law-alert" hidden role="alert"><b></b><span></span><small></small></div>

  <section class="hud-card hud-capcom" aria-label="Mission control" aria-live="polite">
    <div class="cc-avatar"><img alt="" hidden><span></span></div>
    <div class="cc-body"><b class="cc-name"></b><small class="cc-role"></small><p class="cc-text"></p><p class="cc-trans" hidden></p></div>
  </section>

  <div class="countdown" hidden aria-live="assertive"></div>

  <section class="hud-card hud-log" aria-label="Flight log">
    <h3>Flight log</h3>
    <ol data-k="log"></ol>
  </section>

  <nav class="hud-bar" aria-label="Flight controls">
    <button type="button" class="btn-go" data-act="go" title="Ignition / stage (Space)">IGNITION</button>
    <button type="button" data-act="sas" title="SAS — gimbal attitude hold (T)" aria-pressed="false">SAS</button>
    <button type="button" data-act="chute" title="Deploy parachutes (P)">Chute</button>
    <button type="button" data-act="mode" title="SAS mode: hold pitch / prograde / retrograde (M)">Hold</button>
    <button type="button" data-act="rcs" title="RCS thrusters on/off (F)" aria-pressed="true">RCS <small data-k="mono"></small></button>
    <button type="button" data-act="turn" title="Auto gravity turn: lean 1°/s to 80° (G)" aria-pressed="false">Auto-turn</button>
    <button type="button" data-act="assist" title="Ascent assist: off → guide → autopilot (V)">Assist: <span data-k="amode">Off</span></button>
    <label class="thr" title="Throttle (Shift/Ctrl, Z full, X cut)">Thr<input type="range" min="0" max="100" step="5" value="100" data-in="thr"></label>
    <span class="sep"></span>
    <button type="button" data-hold="-1" title="Pitch left (A / ←)">◀</button>
    <span class="bar-read" data-k="target">0°</span>
    <button type="button" data-hold="1" title="Pitch right (D / →)">▶</button>
    <span class="sep"></span>
    <span class="warp" role="radiogroup" aria-label="Time warp"></span>
    <button type="button" data-act="map" title="Orbital map (Tab) — after the Kármán line" disabled>Map</button>
    <button type="button" data-act="eva" title="Spacewalk (E): in orbit, engines off" hidden>EVA</button>
    <button type="button" data-act="kit" title="EVA kit (K)" hidden>Kit: <span data-k="kit">Extinguisher</span></button>
    <span class="sep"></span>
    <button type="button" data-act="cam" title="Camera target (C)">Cam: <span data-k="cam">Vehicle</span></button>
    <button type="button" data-act="sound" title="Sound on/off (U)" aria-pressed="true"><span data-k="sound">🔊</span></button>
    <button type="button" data-act="zout" title="Zoom out (−)">−</button>
    <button type="button" data-act="zin" title="Zoom in (+)">+</button>
    <span class="sep"></span>
    <button type="button" data-act="again" title="Relaunch (R)">↺</button>
    <button type="button" data-act="back" title="Back to the factory (Esc)">Factory</button>
  </nav>

  <section class="hud-card hud-summary" hidden aria-live="polite">
    <img class="sum-banner" alt="" hidden>
    <h2 data-k="sumtitle"></h2>
    <p data-k="sumz"></p>
    <dl data-k="sumstats"></dl>
    <div class="sum-actions">
      <button type="button" class="primary" data-act="again">Fly again</button>
      <button type="button" class="ghost" data-act="back">Back to the factory</button>
    </div>
  </section>
</div>`;

export class LaunchPhase implements Phase {
  private root!: HTMLElement;
  private parts: PlacedPart[] = [];
  private flight!: Flight;
  private view!: LaunchView;
  private siteId: 'ground' | 'pad' | 'ramp' = 'pad';
  private site: LaunchSite = { ...SITES.pad };
  private warp = 1;
  private acc = 0;
  private raf = 0;
  private last = 0;
  private logged = 0;
  private holds = new Set<number>();
  private keyHold = 0;
  private apo = 0;
  private frameNo = 0;
  private hudNo = 0;
  private endAt = 0;
  private cleanup: (() => void)[] = [];
  private capcom = new Capcom();
  private countdown: { start: number; said: number } | null = null;
  private thrKey = 0;
  private moodImg = '';
  private map!: MapView;
  private mapMode = false;
  private warpLimited = false;
  private mapTold = false;
  private assist = new AscentAssist();
  private assistOut: AssistOutput | null = null;
  private node: { at: NodeAt; dv: number } = { at: 'apo', dv: 0 };
  private seamWarned = false;
  private summaryBusy = false;
  /** Tier 0–1 airspace */
  private radar!: RadarView;
  private monitor: AirspaceMonitor | null = null;
  private lanternSite = LANTERN_SITES[0];
  /** Low-tier builds can launch at Yasothon instead (no airport for 100 km — no airspace monitor) */
  private atYasothon = false;
  /** Campaign: objectives already announced this flight, and the next evaluation frame */
  private objSeen = new Set<string>();
  private campaignAnnounced = false;
  /** Per-flight look: weather roll and Zombie Control call-outs */
  private weather: Weather = 'clear';
  private zombieCalls = new Set<number>();
  private polluted = false;
  /** J1: impacts → hit-stop, slow-mo, camera trauma, FX and audio cues */
  private director = new ImpactDirector();
  private warpDropped = false;
  private windFrom = LANTERN_SITES[0].windFrom;
  private permitted = false;
  private alertTimer = 0;
  /** Who the keys fly once a zombie is outside */
  private evaCtl = false;
  private evaKeys = { w: 0, s: 0, a: 0, d: 0 };
  private globe: GlobeView | null = null;
  private globeLoading: Promise<void> | null = null;
  private globeFailed = false;
  private rangeId: (typeof LAUNCH_RANGES)[number]['id'] = (() => { try { return localStorage.getItem('rs.range') === 'phangan' ? 'phangan' : 'yasothon'; } catch { return 'yasothon'; } })();
  private frame3d = new PlaneFrame(LAUNCH_RANGES.find((r) => r.id === this.rangeId)!.site);
  private mapStyle: '3d' | '2d' = (() => { try { return localStorage.getItem('rs.map.style') === '2d' ? '2d' : '3d'; } catch { return '3d'; } })();

  enter(root: HTMLElement, payload?: unknown) {
    this.root = root;
    const p = payload as LaunchPayload | undefined;
    this.parts = p?.parts?.length ? p.parts : analyse(new VehicleStore().parts).active;
    root.innerHTML = TEMPLATE;
    const d = defaultSite(this.parts);
    this.siteId = d.id; this.site = d.site;
    // rockets (not lanterns) go to the Bang Fai grounds once the campaign allows it
    this.atYasothon = this.lowTier() && !this.parts.some((q) => PART[q.defId].envelope) && campaign.rangeUnlocked('yasothon');
    if (!campaign.rangeUnlocked(this.rangeId)) this.rangeId = 'phangan';
    this.view = new LaunchView(this.q('.sky-canvas'));
    this.map = new MapView(this.q('.map-canvas'));
    this.radar = new RadarView(this.q('.radar-canvas'));
    this.wire();
    this.newFlight();
    this.last = performance.now();
    // schedule first, then draw: one bad frame (a canvas call throwing) must never stop the game loop
    let warned = false;
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      try { this.tick(now); } catch (e) { if (!warned) { warned = true; console.error('[RocketScience] frame error (game keeps running)', e); } }
    };
    this.raf = requestAnimationFrame(loop);
  }

  exit() {
    cancelAnimationFrame(this.raf);
    sfx.quiet();
    this.cleanup.forEach((f) => f());
    this.view.dispose();
    this.map.dispose();
    this.globe?.dispose(); this.globe = null;
    this.root.innerHTML = '';
  }

  private q<T extends HTMLElement = HTMLElement>(s: string) { return this.root.querySelector(s) as T; }
  private k(key: string) { return this.q(`[data-k="${key}"]`); }

  /* ---------- Setup ---------- */

  /** This site's persistent state (terrain, scorch, wrecks) */
  private siteKey() { return this.lowTier() ? (this.atYasothon ? 'yasothon' : this.lanternSite.id) : `range-${this.rangeId}`; }
  private siteState() {
    const key = this.siteKey();
    let st = SITE_STATE.get(key);
    if (!st) { st = { terrain: new Heightfield(), wrecks: [], marks: [] }; SITE_STATE.set(key, st); }
    return st;
  }

  /** Build the Flight for the current build + site; wrecks of the flight being replaced stay behind */
  private makeFlight() {
    const old = this.flight;
    if (old?.ignited && this.view) { const st = this.siteState(); st.wrecks.push(...this.view.bakeWrecks(old)); if (st.wrecks.length > 30) st.wrecks.splice(0, st.wrecks.length - 30); }
    const st = this.siteState();
    this.flight = new Flight(this.parts, { site: { ...this.site }, terrain: FEATURES.terrainCollision ? st.terrain : undefined });
    this.flight.controls.sas = this.flight.vehicle.gimbals.length > 0;
    this.view.terrain = st.terrain; this.view.wrecks = st.wrecks; this.view.marks = st.marks;
    this.view.strainOf = (b, it) => this.flight.strain(b, it);
    this.view.fx.clear(); this.view.fx.wind = this.site.wind;
    this.director.reset(); this.warpDropped = false;
    sfx.quiet();
  }

  private newFlight() {
    this.limbSeaSaid = false;
    this.makeFlight();
    this.view.reset(this.flight);
    this.setMap(false);
    this.assist.reset(); this.assistOut = null; this.view.guide = null;
    // Tier-4 engines burn straight through to orbit; anything weaker climbs lofted and coasts to Ap
    this.assist.profile = this.parts.some((q) => PART[q.defId].tier >= 4 && PART[q.defId].category === 'propulsion') ? PROFILE_TIER4 : PROFILE_TIER3;
    this.objSeen.clear(); this.campaignAnnounced = false;
    this.node = { at: this.node.at, dv: 0 }; this.map.plan = null; this.seamWarned = false; this.summaryBusy = false;
    this.evaCtl = false; this.evaKeys = { w: 0, s: 0, a: 0, d: 0 };
    this.resetMonitor();
    this.root.querySelector('.rs-milestone')?.remove();
    this.logged = 0; this.acc = 0; this.endAt = 0; this.apo = 0;
    this.countdown = null; this.q('.countdown').hidden = true;
    this.capcom.reset();
    this.capcom.zombieControl = this.zombieRun();
    this.zombieCalls.clear(); this.polluted = false;
    this.weather = this.rollWeather();
    this.configureScene();
    this.capcom.say('lee', `Mission control here. ${this.parts.length ? 'Vehicle on the pad — standing by for your go.' : 'No vehicle on the pad. Build one first.'}`, 2);
    this.k('log').innerHTML = '';
    this.q('.hud-summary').hidden = true;
    this.q('.hud-site').hidden = false;
    this.syncSite();
    if (!this.parts.length) this.logLine({ t: 0, kind: 'failure', text: 'No vehicle yet — build one in the factory first.' });
    else this.logLine({ t: 0, kind: 'info', text: `${this.flight.vehicle.items.length} parts on the ${this.siteId === 'ramp' ? 'bamboo ramp' : this.siteId === 'pad' ? 'pad' : 'ground'}. ${this.flight.stageCount ? `${this.flight.stageCount} stage${this.flight.stageCount > 1 ? 's' : ''} to fire.` : ''} Press Space or IGNITION.` });
    if (this.parts.length) this.orbitalCheck();
  }

  private wire() {
    this.capcom.onSay = (l) => this.showLine(l);
    this.view.onTouch = (t) => this.touch(t);
    this.view.onLimbSea = (limb, x) => this.limbAtSea(limb, x);
    const on = (el: Element | Window, ev: string, fn: (e: any) => void) => { el.addEventListener(ev, fn); this.cleanup.push(() => el.removeEventListener(ev, fn)); };
    // browsers only allow sound after a gesture
    const unlock = () => sfx.unlock();
    on(this.root, 'pointerdown', unlock); on(window, 'keydown', unlock);
    on(this.root, 'click', (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      const act = (t.closest('[data-act]') as HTMLElement | null)?.dataset.act;
      const warp = (t.closest('[data-warp]') as HTMLElement | null)?.dataset.warp;
      const site = (t.closest('[data-site]') as HTMLElement | null)?.dataset.site;
      if (warp) this.setWarp(+warp);
      const nAt = (t.closest('[data-node-at]') as HTMLElement | null)?.dataset.nodeAt as NodeAt | undefined;
      const nDv = (t.closest('[data-node-dv]') as HTMLElement | null)?.dataset.nodeDv;
      if (nAt) { this.node.at = nAt; this.nodeCard(); }
      if (nDv) { this.node.dv = Math.max(-1500, Math.min(1500, this.node.dv + +nDv)); this.nodeCard(); }
      if (site && !this.flight.ignited) { this.pickSite(site as 'pad' | 'ramp' | 'ground'); }
      if (act) this.act(act);
    });
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-hold]')) {
      const dir = +el.dataset.hold!;
      const down = (e: PointerEvent) => { e.preventDefault(); this.holds.add(dir); el.setPointerCapture(e.pointerId); };
      const up = () => this.holds.delete(dir);
      on(el, 'pointerdown', down); on(el, 'pointerup', up); on(el, 'pointercancel', up); on(el, 'lostpointercapture', up);
    }
    on(this.root, 'input', (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.in === 'rail') this.site.rail = +t.value;
      if (t.dataset.in === 'angle') this.site.railAngleDeg = +t.value;
      if (t.dataset.in === 'wind') this.site.wind = +t.value;
      if (t.dataset.in === 'range') {
        if (this.flight.ignited) return;
        this.pickRange(t.value as typeof this.rangeId);
        return;
      }
      if (t.dataset.in === 'lsite' || t.dataset.in === 'wdir' || t.dataset.in === 'permit') {
        if (this.flight.ignited) return;
        if (t.dataset.in === 'lsite') {
          this.atYasothon = t.value === 'yasothon' && campaign.rangeUnlocked('yasothon');
          if (!this.atYasothon) { this.lanternSite = LANTERN_SITES.find((x) => x.id === t.value) ?? LANTERN_SITES[0]; this.windFrom = this.lanternSite.windFrom; }
        }
        if (t.dataset.in === 'wdir') this.windFrom = +t.value;
        if (t.dataset.in === 'permit') this.permitted = (t as HTMLInputElement).checked;
        this.resetMonitor(); this.newFlightKeepLog();
        return;
      }
      if (t.dataset.in === 'thr') { this.flight.controls.throttle = +t.value / 100; return; }
      if (t.dataset.in === 'ndv') { this.node.dv = +t.value; this.nodeCard(); return; }
      if (t.dataset.in && !this.flight.ignited) this.newFlightKeepLog();
    });
    on(this.q('.sky-canvas'), 'wheel', (e: WheelEvent) => { e.preventDefault(); this.view.zoom *= Math.exp(-e.deltaY * 0.0015); this.clampZoom(); });
    on(window, 'keydown', (e: KeyboardEvent) => this.onKey(e, true));
    on(window, 'keyup', (e: KeyboardEvent) => this.onKey(e, false));
  }

  private newFlightKeepLog() {
    this.makeFlight();
    this.view.reset(this.flight);
    this.syncSite();
  }

  private pickSite(id: 'pad' | 'ramp' | 'ground') {
    this.siteId = id;
    this.site = id === 'ramp' ? { ...SITES.ramp, rail: this.site.rail >= 10 ? this.site.rail : 22, wind: this.site.wind }
      : { ...SITES[id], wind: this.site.wind };
    this.newFlightKeepLog();
  }

  /** Where the pad really is for this build (the globe draws it there) */
  private padSite(): GeoSite {
    if (!this.lowTier()) return LAUNCH_RANGES.find((r) => r.id === this.rangeId)!.site;
    if (this.atYasothon) return YASOTHON;
    return { name: this.lanternSite.name, lat: this.lanternSite.pos.lat, lon: this.lanternSite.pos.lon };
  }

  private applyFrame() {
    const s = this.padSite();
    if (s.lat === this.frame3d.site.lat && s.lon === this.frame3d.site.lon) return;
    this.frame3d = new PlaneFrame(s);
    this.globe?.setSite(this.frame3d);
  }

  /** Move the pad to another range. Rendering only: the flight plane maths is identical everywhere. */
  private pickRange(id: typeof this.rangeId) {
    const r = LAUNCH_RANGES.find((x) => x.id === id) ?? LAUNCH_RANGES[0];
    this.rangeId = r.id;
    try { localStorage.setItem('rs.range', r.id); } catch { /* private mode */ }
    this.frame3d = new PlaneFrame(r.site);
    this.globe?.setSite(this.frame3d);
    if (!this.flight.ignited) this.newFlightKeepLog(); else this.syncSite();
  }

  private syncSite() {
    for (const b of this.root.querySelectorAll<HTMLElement>('[data-site]')) b.setAttribute('aria-checked', String(b.dataset.site === this.siteId));
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-only="ramp"]')) el.hidden = this.siteId !== 'ramp';
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-only="lowtier"]')) el.hidden = !this.lowTier();
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-only="range"]')) el.hidden = this.lowTier();
    const rs = this.q<HTMLSelectElement>('[data-in="range"]'); if (rs) { rs.value = this.rangeId; rs.disabled = this.flight.ignited; }
    if (this.k('rangenote')) this.k('rangenote').textContent = `${this.frame3d.site.lat.toFixed(2)}°N · due east → ${this.frame3d.inclination.toFixed(1)}° orbit`;
    const sel = (k: string, v: string) => { const i = this.q<HTMLSelectElement>(`[data-in="${k}"]`); if (i) i.value = v; };
    sel('lsite', this.atYasothon ? 'yasothon' : this.lanternSite.id); sel('wdir', String(this.windFrom));
    const yo = this.root.querySelector<HTMLOptionElement>('[data-in="lsite"] option[value="yasothon"]');
    if (yo) { yo.disabled = !campaign.rangeUnlocked('yasothon'); yo.textContent = `Yasothon (Bang Fai festival)${yo.disabled ? ' · 🔒 Mission 1' : ''}`; }
    for (const o of this.root.querySelectorAll<HTMLOptionElement>('[data-in="range"] option')) {
      const ok = campaign.rangeUnlocked(o.value as typeof this.rangeId);
      o.disabled = !ok; o.textContent = `${LAUNCH_RANGES.find((r) => r.id === o.value)!.site.name}${ok ? '' : ' · 🔒 Mission 1'}`;
    }
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-samui]')) el.hidden = this.atYasothon;
    this.applyFrame();
    this.configureScene();
    const st = SITE_STATE.get(this.siteKey());
    const cl = this.q<HTMLButtonElement>('[data-act="cleanup"]');
    if (cl) { cl.hidden = !st || (st.terrain.empty && !st.wrecks.length && !st.marks.length); cl.disabled = this.flight.ignited; }
    if (this.k('sound')) this.k('sound').textContent = sfx.muted ? '🔇' : '🔊';
    const pc = this.q<HTMLInputElement>('[data-in="permit"]'); if (pc) pc.checked = this.permitted;
    if (this.k('sitenote')) this.k('sitenote').textContent = this.atYasothon
      ? 'Bang Fai festival grounds, Isan. No airport for a hundred kilometres; the only authority is the village headman.'
      : this.lanternSite.note;
    const set = (k: string, v: number) => { const i = this.q<HTMLInputElement>(`[data-in="${k}"]`); if (i) i.value = String(v); };
    set('rail', this.site.rail); set('angle', this.site.railAngleDeg); set('wind', this.site.wind);
    this.k('rl').textContent = `${this.site.rail} m`;
    this.k('ra').textContent = `${this.site.railAngleDeg}°`;
    this.k('wd').textContent = `${this.site.wind} m/s`;
    this.setWarp(this.warp);
  }

  private setWarp(w: number) {
    const ladder: readonly number[] = this.mapMode ? MAP_WARPS : WARPS;
    if (!ladder.includes(w)) w = ladder.filter((x) => x <= w).at(-1) ?? 1;
    this.warp = w;
    const box = this.q('.warp');
    if (box.childElementCount !== ladder.length || +(box.lastElementChild as HTMLElement).dataset.warp! !== ladder.at(-1)) {
      box.innerHTML = ladder.map((x, i) => `<button type="button" data-warp="${x}" title="Time warp (${i + 1})">${x >= 1000 ? `${x / 1000}k` : x}×</button>`).join('');
    }
    for (const b of this.root.querySelectorAll<HTMLElement>('[data-warp]')) b.setAttribute('aria-checked', String(+b.dataset.warp! === w));
  }

  private clampZoom() { this.view.zoom = Math.max(0.02, Math.min(8, this.view.zoom)); }

  /* ---------- Commands ---------- */

  private act(a: string) {
    const f = this.flight;
    switch (a) {
      case 'go':
        if (!f.ignited && this.countdown) { this.abortCountdown(); break; }
        if (!f.ignited) { this.startCountdown(); }
        else { const s = f.stage(); if (!s) this.logLine({ t: f.t, kind: 'info', text: 'Nothing left to stage.' }); }
        break;
      case 'sas':
        f.controls.sas = !f.controls.sas;
        if (f.controls.sas) f.controls.target = f.vehicle.pitch;   // hold the current attitude
        if (f.controls.sas && !f.vehicle.gimbals.length) this.logLine({ t: f.t, kind: 'info', text: 'SAS on — but nothing on this vehicle can gimbal. Liquid engines can.' });
        break;
      case 'chute': {
        const n = f.vehicle.items.filter((i) => i.chute?.state === 'packed').length;
        if (!n) this.logLine({ t: f.t, kind: 'info', text: 'No packed parachute on the vehicle.' });
        else f.deployChutes();
        break;
      }
      case 'mode': {
        const order = ['hold', 'prograde', 'retrograde'] as const;
        f.controls.sasMode = order[(order.indexOf(f.controls.sasMode) + 1) % 3];
        if (f.controls.sasMode === 'hold') f.controls.target = f.vehicle.pitch;
        f.controls.sas = true;
        if (f.controls.sasMode === 'retrograde') this.capcom.say('owl', 'Retrograde hold: heat shield into the wind. Good habit before re-entry.', 2);
        break;
      }
      case 'rcs': f.controls.rcs = !f.controls.rcs; break;
      case 'turn': {
        const c = f.controls;
        if (c.turnRate > 0) { c.turnRate = 0; break; }
        if (!f.vehicle.gimbals.length) { this.logLine({ t: f.t, kind: 'info', text: 'Auto-turn steers with the gimbals — this vehicle has none.' }); break; }
        c.sas = true; c.turnRate = Math.PI / 180; c.turnTo = 80 * Math.PI / 180;
        this.logLine({ t: f.t, kind: 'info', text: 'Gravity turn: leaning 1°/s toward 80°.' });
        break;
      }
      case 'map':
        if (this.mapMode) this.setMap(false);
        else if (this.canMap()) this.setMap(true);
        else this.logLine({ t: f.t, kind: 'info', text: 'The orbital map opens once you are past the Kármán line (100 km).' });
        break;
      case 'assist': {
        const order = ['off', 'guide', 'auto'] as const;
        this.assist.mode = order[(order.indexOf(this.assist.mode) + 1) % 3];
        if (this.assist.mode === 'off') { this.view.guide = null; this.assistOut = null; }
        if (this.assist.mode === 'auto' && !f.vehicle.gimbals.length) this.logLine({ t: f.t, kind: 'info', text: 'The autopilot steers with gimbals — this vehicle has none. Guide mode still works.' });
        this.capcom.say('owl', this.assist.mode === 'guide' ? 'Ascent guide on. Keep your nose on the green arrow — I will tell you when to lean.'
          : this.assist.mode === 'auto' ? 'Autopilot has the stick. Watch how it leans: gently, and only as the air thins.' : 'Assist off. Your rocket, your rules.', 2);
        break;
      }
      case 'ncirc': {
        const v = f.vehicle;
        this.node.dv = Math.round(circularizeDv({ x: v.x, y: v.y + R_EARTH }, { x: v.vx, y: v.vy }, MU_EARTH, this.node.at));
        this.nodeCard();
        break;
      }
      case 'nclear': this.node.dv = 0; this.nodeCard(); break;
      case 'eva': {
        if (f.eva) { this.toggleEvaControl(); break; }
        const why = f.evaBlockedBy;
        if (why) { this.logLine({ t: f.t, kind: 'info', text: `No spacewalk: ${why}` }); break; }
        f.startEva(f.evaKit);
        this.evaCtl = true;
        this.view.target = { kind: 'eva' };
        if (this.warp > PHYS_WARP_CAP) this.setWarp(1);
        break;
      }
      case 'kit': {
        if (f.eva) break;
        const order = ['extinguisher', 'rcs-pack', 'flail'] as const;
        f.evaKit = order[(order.indexOf(f.evaKit) + 1) % order.length];
        break;
      }
      case 'map3d': case 'map2d':
        this.mapStyle = a === 'map3d' ? '3d' : '2d';
        try { localStorage.setItem('rs.map.style', this.mapStyle); } catch { /* ignore */ }
        if (this.mapStyle === '3d') this.ensureGlobe();
        this.syncMapTools();
        break;
      case 'focusEarth': if (this.globe) this.globe.focus = 'earth'; this.syncMapTools(); break;
      case 'focusShip': if (this.globe) this.globe.focus = 'ship'; this.syncMapTools(); break;
      case 'recentre': this.globe?.recentre(); this.syncMapTools(); break;
      case 'sound': this.toggleSound(); break;
      case 'cleanup': { const st = this.siteState(); st.terrain.clear(); st.wrecks.length = 0; st.marks.length = 0; this.newFlightKeepLog(); break; }
      case 'cam': this.cycleCam(); break;
      case 'zin': this.view.zoom *= 1.4; this.clampZoom(); break;
      case 'zout': this.view.zoom /= 1.4; this.clampZoom(); break;
      case 'again': this.newFlight(); break;
      case 'back': bus.emit('phase:request', { phase: 'assembly' }); break;
    }
  }

  private cycleCam() {
    const f = this.flight, t = this.view.target;
    const list: typeof t[] = [{ kind: 'vehicle' }, ...f.bodies.filter((b) => b !== f.vehicle).map((b) => ({ kind: 'body' as const, id: b.id }))];
    if (this.view.head()) list.push({ kind: 'head' });
    const i = list.findIndex((x) => x.kind === t.kind && (x.kind !== 'body' || (t.kind === 'body' && x.id === t.id)));
    this.view.target = list[(i + 1) % list.length];
  }

  private toggleSound() {
    sfx.unlock(); sfx.setMuted(!sfx.muted);
    this.k('sound').textContent = sfx.muted ? '🔇' : '🔊';
    this.q('[data-act="sound"]').setAttribute('aria-pressed', String(!sfx.muted));
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    const k = e.key;
    if (down && (k === 'u' || k === 'U') && !(this.flight.eva && this.evaCtl)) { this.toggleSound(); return; }
    if (this.flight.eva && this.evaCtl && !this.flight.eva.ended) {
      const key = k.toLowerCase();
      if (key === 'w' || key === 's' || key === 'a' || key === 'd') {
        this.evaKeys[key as 'w' | 's' | 'a' | 'd'] = down ? 1 : 0;
        e.preventDefault();
        return;
      }
    }
    if (down && !e.repeat && (k === 'e' || k === 'E')) { e.preventDefault(); this.act('eva'); return; }
    if (down && !e.repeat && (k === 'k' || k === 'K')) { e.preventDefault(); this.act('kit'); return; }
    if (k === 'a' || k === 'A' || k === 'ArrowLeft') { this.keyHold = down ? -1 : this.keyHold === -1 ? 0 : this.keyHold; e.preventDefault(); return; }
    if (k === 'd' || k === 'D' || k === 'ArrowRight') { this.keyHold = down ? 1 : this.keyHold === 1 ? 0 : this.keyHold; e.preventDefault(); return; }
    if (k === 'Shift') { this.thrKey = down ? 1 : 0; return; }
    if (k === 'Control') { this.thrKey = down ? -1 : 0; return; }
    if (!down || e.repeat) return;
    if (k === 'z' || k === 'Z') { this.flight.controls.throttle = 1; return; }
    if (k === 'x' || k === 'X') { this.flight.controls.throttle = 0; return; }
    if (k === 'Tab') { e.preventDefault(); this.act('map'); return; }
    if (k === 'v' || k === 'V') { this.act('assist'); return; }
    const map: Record<string, string> = { ' ': 'go', t: 'sas', T: 'sas', m: 'mode', M: 'mode', f: 'rcs', F: 'rcs', p: 'chute', P: 'chute', g: 'turn', G: 'turn', c: 'cam', C: 'cam', '+': 'zin', '=': 'zin', '-': 'zout', r: 'again', R: 'again', Escape: 'back' };
    if (map[k]) { e.preventDefault(); this.act(map[k]); }
    const ladder: readonly number[] = this.mapMode ? MAP_WARPS : WARPS;
    if (k >= '1' && k <= String(ladder.length)) this.setWarp(ladder[+k - 1]);
  }

  /* ---------- Loop ---------- */

  private tick(now: number) {
    const real = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const f = this.flight;
    const nudge = Math.sign([...this.holds].reduce((a, b) => a + b, 0) + this.keyHold);
    f.controls.nudge = nudge;
    if (this.thrKey) f.controls.throttle = Math.max(0, Math.min(1, f.controls.throttle + this.thrKey * real * 0.6));
    if (f.eva) {
      const on = this.evaCtl && !f.eva.ended;
      f.eva.ctl.fire = on ? this.evaKeys.w - this.evaKeys.s : 0;
      f.eva.ctl.spin = on ? this.evaKeys.a - this.evaKeys.d : 0;     // A = counter-clockwise
      if (on && f.eva.wantsThrust && this.warp > PHYS_WARP_CAP) this.setWarp(1);
    }
    this.tickCountdown(now);
    this.capcom.tick(now);

    // J1: hit-stop (0) and slow motion (0.25) scale everything that moves in the scene
    const ts = FEATURES.timeFx ? this.director.timeScale(now) : 1;
    this.director.update(real);
    this.view.juice = this.director.camera();
    this.view.timeScale = ts;
    // Physics at a fixed step, warped
    if (f.ignited) {
      // On rails the whole warp is exact; otherwise physics, capped so a frame can't stall
      const rails = f.onRailsOk;
      const w = rails ? this.warp : Math.min(this.warp, PHYS_WARP_CAP);
      this.warpLimited = w < this.warp;
      if (rails && this.warp > PHYS_WARP_CAP) { f.advanceWarp(real * w * ts); this.acc = 0; }
      else {
        this.acc += real * w * ts;
        const dt = 0.01;
        let n = 0;
        const auto = this.assist.mode === 'auto';
        while (this.acc >= dt && n < 2000) { if (auto) this.takeAssist(this.assist.update(f)); f.step(); this.acc -= dt; n++; }
      }
      // Lighting an engine at high warp drops back to 1× (like any sane flight computer)
      if (this.warp > PHYS_WARP_CAP && !rails && f.vehicle.thrust > 0) this.setWarp(1);
    }
    // Particles get the new effects and age with the same warped time
    if (f.fxQueue.length) { this.view.particles.wind = f.site.wind; for (const fx0 of f.fxQueue.splice(0)) {
      // effects come in Earth-centred coordinates; the view works in the flat local frame
      const L = toLocal(fx0.x, fx0.y, fx0.vx, fx0.vy);
      const fx = { ...fx0, x: L.s, y: L.h, vx: L.vs, vy: L.vh } as typeof fx0;
      if (fx0.kind === 'rcs') { const D = toLocal(fx0.x, fx0.y, fx0.dx, fx0.dy); (fx as any).dx = D.vs; (fx as any).dy = D.vh; }
      this.view.particles.spawn(fx);
      if (fx.kind === 'limb' && fx.limb) this.view.attachFragment(fx.limb);
      if (fx.kind === 'explode') { this.view.burst(fx.firework ? 48 : fx.size * 3 + (fx.colors.length ? 20 : 0), !!fx.firework, fx.x, fx.y); this.explosion(fx.x, fx.y, fx.vx, fx.vy, fx.size, !!fx.firework); }
    } }
    this.view.particles.update(real * ts * (f.ignited ? Math.min(this.warp, PHYS_WARP_CAP) : 1));
    this.juiceTick(real, ts);
    if (this.assist.mode === 'guide') this.takeAssist(this.assist.update(f));
    this.view.guide = this.assistOut && this.assistOut.phase !== 'cutoff' && this.assistOut.phase !== 'idle' ? this.assistOut.targetPitch : null;
    if (this.mapMode) this.drawMap(f, real); else this.view.frame(f, real);
    this.airspace(now);
    if (f.ignited && this.frameNo % 20 === 0) this.campaignTick(false);

    if (this.frameNo++ % 6 === 0) this.hud();
    this.drainLog();
    if (f.done && !this.endAt) this.endAt = now + 1800;
    if (this.endAt && now > this.endAt && this.q('.hud-summary').hidden && !this.summaryBusy) this.endOfFlight();
  }

  /* ---------- HUD ---------- */

  private hud() {
    this.zombieCallouts();
    const f = this.flight, v = f.vehicle;
    const sp = Math.hypot(v.vx, v.vy);
    this.k('t').textContent = f.t.toFixed(1);
    this.k('alt').textContent = fmtAlt(Math.max(0, v.lowestAlt()));
    this.k('vel').textContent = `${sp.toFixed(0)} m/s`;
    this.k('mach').textContent = v.mach.toFixed(2);
    this.k('vy').textContent = `${v.vUp >= 0 ? '+' : ''}${v.vUp.toFixed(0)} m/s`;
    if (this.hudNo++ % 5 === 0) this.apo = f.predictApogee();
    this.k('apo').textContent = v.vUp > 0 ? `${fmtAlt(this.apo)}${v.thrust > 0 ? ' +' : ''}` : f.maxAlt > 1 ? fmtAlt(f.maxAlt) : '—';
    this.k('apo').title = v.thrust > 0 ? 'Coasting prediction from now — still burning, so it will go higher' : 'Coasting prediction with the current drag';
    const pitch = v.pitch * 180 / Math.PI;
    this.k('pitch').textContent = `${wrapDeg(pitch).toFixed(0)}°`;
    const state = !f.ignited ? 'On the pad' : f.outcome === 'landed' ? 'Landed' : f.outcome === 'impact' ? 'Crashed' : f.outcome === 'no-liftoff' ? 'Stuck on the pad' : f.outcome === 'structural-failure' ? 'Broke up' : !f.airborne ? 'Ignition' : v.thrust > 0 ? 'Powered' : v.items.some((i) => i.chute && (i.chute.state === 'open' || i.chute.state === 'opening')) ? 'Under canopy' : f.missionPhase === 'orbital' ? (f.orbitClass === 'decaying' ? 'Orbit decaying' : f.orbitClass === 'escape' ? 'Escaping' : 'In orbit')
      : f.missionPhase === 'deorbit' ? 'De-orbit' : v.vUp > 0 ? 'Coasting' : 'Falling';
    this.k('state').textContent = state;
    this.k('state').className = `pill ${f.outcome === 'landed' ? 'good' : f.outcome ? 'bad' : f.ignited ? 'live' : ''}`;

    this.k('thr').textContent = `${Math.round(f.controls.throttle * 100)}%`;
    (this.q<HTMLInputElement>('[data-in="thr"]')).value = String(Math.round(f.controls.throttle * 100));
    const hot = v.items.reduce((m, i) => (i.temp > m.temp ? i : m), v.items[0]);
    this.k('temp').textContent = hot ? `${hot.temp.toFixed(0)} °C` : '—';
    this.k('temp').className = hot && hot.temp > hot.melt * 0.75 ? 'bad' : hot && hot.temp > 250 ? 'warn' : '';
    this.k('temp').title = hot ? `${hot.name}: melts / burns at ${hot.melt} °C` : '';
    const mm = f.monoMax;
    this.k('mono').textContent = mm ? `${Math.round((f.mono / mm) * 100)}%` : '—';
    this.q('[data-act="rcs"]').setAttribute('aria-pressed', String(f.controls.rcs && mm > 0));
    this.q('[data-act="mode"]').textContent = { hold: 'Hold', prograde: 'Prograde', retrograde: 'Retro' }[f.controls.sasMode];
    const gs = v.gimbals;
    const sasBtn = this.q('[data-act="sas"]');
    sasBtn.setAttribute('aria-pressed', String(f.controls.sas));
    this.q('[data-act="turn"]').setAttribute('aria-pressed', String(f.controls.turnRate > 0));
    this.k('sasline').textContent = gs.length
      ? `${f.controls.sas ? 'SAS hold' : 'Manual'} · gimbal ${(gs[0].engine!.delta * 180 / Math.PI).toFixed(1)}° of ±${(gs[0].engine!.gimbal * 180 / Math.PI).toFixed(0)}°`
      : mm ? `RCS only · ${f.mono.toFixed(1)} kg mono` : 'No gimbal, no RCS — fins and luck only';
    this.k('target').textContent = f.controls.sas ? `${wrapDeg(f.controls.target * 180 / Math.PI).toFixed(0)}°` : 'manual';
    const go = this.q('[data-act="go"]');
    go.textContent = !f.ignited ? 'IGNITION' : f.stages.length ? `STAGE · ${f.stages.length}` : 'STAGE';
    (go as HTMLButtonElement).disabled = f.ignited && !f.stages.length;
    this.q<HTMLButtonElement>('[data-act="chute"]').disabled = !v.items.some((i) => i.chute?.state === 'packed');
    const t = this.view.target;
    this.k('cam').textContent = t.kind === 'vehicle' ? 'Vehicle' : t.kind === 'head' ? 'Zombie head' : t.kind === 'eva' ? 'Spacewalker' : `Dropped stage ${f.bodies.filter((b) => b !== f.vehicle).findIndex((b) => b.id === t.id) + 1}`;
    this.zombieCard();
    this.orbitCard();
    this.assistLine();
    this.evaCard();
    if (this.mapMode) this.nodeCard();
  }

  /* ---------- Tier 0–1 airspace: radar + regulatory alerts ---------- */

  /** Lanterns, Bang Fai, chairs: everything up to gunpowder gets the radar */
  /* ---------- J1/J2: impacts → time, camera, FX, sound, craters ---------- */

  /** A body came to rest: crater + scorch on land, splash at sea, and the director's treatment */
  private touch(t: Touch) {
    const now = performance.now(), E = 0.5 * t.mass * t.sp * t.sp;
    if (t.sp < 2) return;                                               // set down gently: nothing to see
    if (t.sea) {
      this.director.impact({ kind: 'water', x: t.x, y: 0, vx: t.vx, vy: t.vy, energy: E, size: t.size, hero: t.hero }, now);
      this.splashdown(t.x, t.hero);
      return;
    }
    const st = this.siteState();
    // craters always show; the physics only collides with them when FEATURES.terrainCollision is on
    const crater = st.terrain.impact(t.x, E, this.flight.t);
    if (E > 3000) st.marks.push({ s: t.x, r: crater ? crater.r * 1.7 : 0.6 + Math.cbrt(E) / 40 });
    if (st.marks.length > 80) st.marks.splice(0, st.marks.length - 80);
    this.director.impact({ kind: 'ground', x: t.x, y: 0, vx: t.vx, vy: t.vy, energy: E, size: t.size, hero: t.hero }, now);
    if (crater && crater.r > 1.5) this.logLine({ t: this.flight.t, kind: 'info', text: `New crater: ${(crater.r * 2).toFixed(1)} m across, ${crater.depth.toFixed(1)} m deep. It stays.` });
  }

  /** An explosion fx from the flight: energy guessed from its size (cube law), crater if it is near the ground */
  private explosion(x: number, y: number, vx: number, vy: number, size: number, firework: boolean) {
    const now = performance.now();
    const E = firework ? 2e4 : 5e4 * size ** 3;                     // size 1.5 ≈ 170 kJ, size 6 ≈ 11 MJ
    this.director.impact({ kind: firework ? 'firework' : 'explosion', x, y, vx, vy, energy: E, size, hero: true }, now);
    if (!firework && y < size * 2.5 && !this.view.env.isSea(x)) {
      const st = this.siteState();
      const c = st.terrain.impact(x, E * 0.3, this.flight.t);
      st.marks.push({ s: x, r: (c ? c.r : size) * 1.9 });
      if (c && c.r > 1.5) this.logLine({ t: this.flight.t, kind: 'info', text: `New crater: ${(c.r * 2).toFixed(1)} m across, ${c.depth.toFixed(1)} m deep. It stays.` });
    }
  }

  /** Every frame: play the director's cues, keep the continuous sounds in step, drop warp before impact */
  private juiceTick(real: number, ts: number) {
    const f = this.flight, v = f.vehicle;
    const cues = this.director.drain();
    for (const c of cues.fx) this.view.fx.play(c, this.view.env.quality);
    for (const a of cues.audio) {
      const pan = this.view.panFor(a.x) * 0.8;
      if (a.kind === 'boom') sfx.boom(a.intensity, pan);
      else if (a.kind === 'thud') sfx.thud(a.intensity, pan);
      else if (a.kind === 'splash') sfx.splash(a.intensity, pan);
      else if (a.kind === 'pop') sfx.pop(a.intensity, pan);
      else if (a.kind === 'crunch') sfx.crunch(a.intensity, pan);
    }
    this.view.fx.update(real * ts);
    this.view.fx.updateReal(real);
    // continuous voices: engine roar with thrust, sizzle with plasma or a burning lantern
    const airborneish = f.ignited && !v.landed;
    const thr = airborneish ? Math.min(1, v.thrust / Math.max(1, v.M * 9.81 * 2.5)) : 0;
    const fire = v.items.some((it) => it.envelope?.burnt) ? 0.45 : 0;
    sfx.rumble(ts > 0 ? thr : 0);
    sfx.sizzle(Math.max(this.view.plasmaLevel(v), fire));
    // auto-warp drop: falling fast toward the ground with the clock running fast → back to 1×
    if (this.warp > 1 && f.airborne && !v.landed && !this.mapMode) {
      const est = impactSoon(Math.max(0, v.lowestAlt()), v.vUp, Math.min(this.warp, f.onRailsOk ? this.warp : PHYS_WARP_CAP));
      // a parachute (open, or packed with auto-deploy on) will slow it down — don't interrupt that
      const chute = v.items.some((it) => it.chute && (it.chute.state === 'open' || it.chute.state === 'opening' || (it.chute.state === 'packed' && f.controls.autoChute)));
      if (est.soon && est.vImpact > 20 && -v.vUp > 15 && !chute && !this.warpDropped) {
        this.warpDropped = true; this.setWarp(1);
        this.logLine({ t: f.t, kind: 'info', text: `Impact in ~${est.tSim.toFixed(1)} s — time warp off so you can watch.` });
      }
    }
    if (v.vUp > 5) this.warpDropped = false;
  }

  /* ---------- Scene: time of day, weather, land & sea (rendering only) ---------- */

  /** The zombies run the early missions (campaign until Mission 2 is done; sandbox Tier 0–1 builds) */
  private zombieRun() { return campaign.sandbox ? this.lowTier() : !campaign.isDone('m2-ballistics'); }

  private rollWeather(): Weather {
    const r = Math.random();
    if (this.parts.some((q) => PART[q.defId].envelope)) return r < 0.7 ? 'clear' : 'cloudy';   // nobody flies lanterns in the rain
    return r < 0.5 ? 'clear' : r < 0.8 ? 'cloudy' : 'rain';
  }

  /** Night festival on the islands, day at Yasothon and for rockets; the track says where the sea is */
  private configureScene() {
    if (!this.view || !this.flight) return;
    const islands = this.lowTier() && !this.atYasothon;
    const bearing = islands ? (this.windFrom + 180) % 360 : 90;          // lanterns drift downwind; rockets fly east
    const pad = this.padSite();
    this.view.env.configure({
      night: islands,
      festival: islands && this.lanternSite.island === 'phangan',
      weather: this.weather,
      surface: surfaceTrack({ lat: pad.lat, lon: pad.lon }, bearing),
      wind: this.site.wind,
      seed: 1,
    });
  }

  /** Wreckage (or a whole lantern) settled in the Gulf of Thailand */
  /** A severed limb landed in the sea: a small splash, the shark, and one line per flight */
  private limbSeaSaid = false;
  private limbAtSea(limb: Limb, x: number) {
    sfx.splash(0.25, this.view.panFor(x));
    if (this.limbSeaSaid) return;
    this.limbSeaSaid = true;
    const part = limb === 'head' ? 'the head' : `the ${limb}`;
    if (this.capcom.zombieControl) this.capcom.say('zombie', `${part[0].toUpperCase()}${part.slice(1)} went in the sea. A shark took it. We will not be asking for it back. It was not a good ${limb === 'head' ? 'head' : limb.split(' ')[1]} anyway.`, 2, 'happy');
    else this.capcom.say('capybara', `The shark has ${part}. I am not going in after it. My mop is for floors.`, 2, 'serious');
  }

  private splashdown(x: number, vehicle: boolean) {
    const f = this.flight;
    if (!this.polluted) {
      this.polluted = true;
      this.logLine({ t: f.t, kind: 'law', text: `Polluting the ocean — ${vehicle ? 'the vehicle' : 'debris'} came down in the Gulf of Thailand, ${(Math.abs(x) / 1000).toFixed(1)} km from the pad. A shark is inspecting it.` });
      if (this.capcom.zombieControl) this.capcom.say('zombie', 'Splashdown. We are polluting the ocean. A shark came to look. The shark is not impressed. The shark is never impressed.', 3, 'happy');
      else { this.capcom.say('tortoise', 'Debris in the sea. That is marine pollution — the Department of Marine and Coastal Resources will want a word. Several words.', 3, 'serious'); this.capcom.say('capybara', 'There is a shark. It is circling the wreck. I will not be fetching my mop.', 2, 'serious'); }
    }
  }

  /** Zombie Control reads the altimeter out loud — in zombie — every time a round number goes by */
  private zombieCallouts() {
    const f = this.flight, v = f.vehicle;
    if (!this.capcom.zombieControl || !f.airborne || v.landed) return;
    const marks = [30, 100, 300, 1000, 2000, 5000, 10_000, 30_000, 100_000];
    const alt = Math.max(0, v.lowestAlt());
    const m = marks.find((x) => alt >= x && !this.zombieCalls.has(x) && alt < x * 3);
    if (m === undefined) return;
    for (const x of marks) if (x <= m) this.zombieCalls.add(x);
    const sp = Math.hypot(v.vx, v.vy);
    const a = m >= 1000 ? `${(alt / 1000).toFixed(1)} km` : `${Math.round(alt)} m`;
    const quip = ZOMBIE_QUIPS[(this.zombieCalls.size + Math.floor(f.t)) % ZOMBIE_QUIPS.length];
    this.capcom.say('zombie', `Altitude ${a}, ${sp < 10 ? sp.toFixed(1) : Math.round(sp)} m/s. ${quip}`, 1, 'neutral');
  }

  /* ---------- Campaign ---------- */

  private launchContext(): LaunchContext {
    const airspace = this.monitor ? this.monitor.alerts.map((a) => a.id) : [];
    if (this.lowTier()) {
      if (this.atYasothon) return { range: 'yasothon', airspace };
      return { range: 'phangan', lanternSite: this.lanternSite.id, island: this.lanternSite.island, airspace };
    }
    return { range: this.rangeId, island: this.rangeId === 'phangan' ? 'phangan' : undefined, airspace };
  }

  /** Report the flight to the campaign: announce objectives as they tick, celebrate completions */
  private campaignTick(final: boolean) {
    if (campaign.sandbox || !this.parts.length) return;
    const f = this.flight;
    const rep = flightReport(f, this.parts.map((q) => q.defId), this.launchContext());
    const cur = campaign.current();
    // the mission that was current at ignition is the one this flight reports on
    if (cur && this.objSeen.has('#done')) { /* a mission finished this flight — the next one starts next flight */ }
    else if (cur) {
      const prog = campaign.progress(cur, rep);
      if (!this.campaignAnnounced) {
        this.campaignAnnounced = true;
        this.logLine({ t: f.t, kind: 'info', text: `Mission ${cur.label} · ${cur.title}: ${cur.objectives.map((o, i) => `${prog[i] ? '✓' : '○'} ${o.text}`).join(' · ')}` });
        cur.objectives.forEach((o, i) => { if (prog[i]) this.objSeen.add(o.id); });
      } else cur.objectives.forEach((o, i) => {
        if (prog[i] && !this.objSeen.has(o.id)) { this.objSeen.add(o.id); this.logLine({ t: f.t, kind: 'milestone', text: `Mission ${cur.label} · ✓ ${o.text}` }); }
      });
    }
    for (const m of campaign.evaluate(rep, f.t)) { this.missionDone(m); this.objSeen.add('#done'); }
    if (final && cur && !campaign.isDone(cur.id) && !this.objSeen.has('#done')) {
      const prog = campaign.progress(cur, rep), left = cur.objectives.filter((_, i) => !prog[i]);
      if (left.length) this.logLine({ t: f.t, kind: 'info', text: `Mission ${cur.label} not yet: ${left.map((o) => o.text).join(' · ')}. ${cur.hint ?? ''}` });
    }
  }

  private missionDone(m: Mission) {
    const f = this.flight;
    if (campaign.cap?.finale === m.id) {
      // Early Access finale: celebrate now, the End of Early Access screen comes when the flight ends
      this.eaPending = true;
      this.logLine({ t: f.t, kind: 'milestone', text: `MISSION ${m.label} COMPLETE — ${m.title}. You have reached space. That is the end of Early Access: finish the flight for a message from Zombie Control.` });
      this.milestoneCard(`Mission ${m.label} complete · ${m.title}`, 'Space! Finish the flight — Zombie Control has something to say.', 'assets/zombie/zombie_zero_g.png');
      this.capcom.say('zombie', 'The void. We are touching the void. It is cold and it does not taste of anything.', 3, 'happy');
      return;
    }
    this.logLine({ t: f.t, kind: 'milestone', text: `MISSION ${m.label} COMPLETE — ${m.title}. Unlocked: ${m.rewards.text}.` });
    if (this.capcom.zombieControl) {
      const z: Record<string, string> = {
        'm1-lantern': 'Mission complete. The fine is sixty thousand baht. We do not have pockets. Next: bigger fire, in Yasothon.',
        'm2-ballistics': 'Five kilometres. Zombie Control is satisfied. Rockets are boring now. The animals may have their microphone back.',
      };
      this.milestoneCard(`Mission ${m.label} complete · ${m.title}`, `Zombie Control approves. Unlocked: ${m.rewards.text}.`, 'assets/zombie/zombie_zero_g.png');
      this.capcom.say('zombie', z[m.id] ?? 'Mission complete. More brains. More rockets.', 3, 'happy');
    } else {
      this.milestoneCard(`Mission ${m.label} complete · ${m.title}`, `Unlocked: ${m.rewards.text}. New entry in the Story log.`, m.story.image);
      this.capcom.say(m.story.crew, m.story.text.split(/(?<=[.!?])\s/)[0], 3, 'happy');
    }
  }

  private lowTier() { return this.parts.length > 0 && this.parts.every((p) => PART[p.defId].tier <= 1); }

  private resetMonitor() {
    this.monitor = this.lowTier() && !this.atYasothon ? new AirspaceMonitor(this.lanternSite, this.windFrom, this.permitted) : null;
    this.q('.law-alert').hidden = true;
  }

  private airspace(now: number) {
    const f = this.flight, m = this.monitor, v = f.vehicle;
    const card = this.q('.hud-radar');
    card.hidden = !m || this.mapMode;
    if (!m) return;
    const alt = Math.max(0, v.lowestAlt());
    for (const a of m.update(f.t, v.downrange, alt, f.airborne && !v.landed)) this.lawAlert(a, now);
    if (!card.hidden) this.radar.frame(m, now);
    const last = m.track[m.track.length - 1];
    if (this.frameNo % 6 === 0) {
      const bad = m.inside.size > 0;
      this.k('radarstate').textContent = bad ? 'VIOLATION' : m.alerts.length ? 'Logged' : 'Clear';
      this.k('radarstate').className = `pill ${bad ? 'bad' : m.alerts.length ? 'live' : 'good'}`;
      this.k('radarpos').textContent = last ? `${last.pos.lat.toFixed(4)}°N ${last.pos.lon.toFixed(4)}°E · ${Math.round(last.alt)} m AGL · drift ${(Math.abs(v.downrange) / 1000).toFixed(2)} km` : `${this.lanternSite.name}`;
      this.k('radarfine').textContent = m.fines ? `Fines: ฿${m.fines.toLocaleString()}` : '';
    }
    if (this.alertTimer && now > this.alertTimer) { this.q('.law-alert').hidden = true; this.alertTimer = 0; }
  }

  private lawAlert(a: AirspaceAlert, now: number) {
    const box = this.q('.law-alert');
    box.querySelector('b')!.textContent = `⚠ REGULATORY VIOLATION · ${a.title}`;
    box.querySelector('span')!.textContent = a.detail;
    box.querySelector('small')!.textContent = a.basis;
    box.hidden = false;
    box.classList.remove('pop'); void (box as HTMLElement).offsetWidth; box.classList.add('pop');
    this.alertTimer = now + 7000;
    this.logLine({ t: a.t, kind: 'law', text: `${a.title} — ${a.detail}` });
    const m = unlock('airspace');
    if (m) this.logLine({ t: a.t, kind: 'milestone', text: `Milestone — ${m.title}: ${m.text}` });
    const lines: Record<string, string[]> = {
      ctr: ['Samui control zone! Class D! Nobody filed anything! Where is my stamp? WHERE IS MY STAMP?', 'That is inside five nautical miles of Samui. I am drafting the incident report. With both hands.'],
      'app-17': ['It is on the RWY 17 final approach. Aircraft land through there. Engines swallow paper. I need to lie down on my shell.', 'Lantern on the extended centreline! Notify Samui Tower immediately — I am dialling with my flipper.'],
      'app-35': ['RWY 35 approach! Wrong end, same problem! Form 21-B, Form 21-C, Form… all of them.'],
      fine: ['No district permit, no notice to the tower. That is up to three years or sixty thousand baht, or both. I am not paying it. Otter is paying it.'],
    };
    const pool = lines[a.id] ?? lines.ctr;
    if (this.capcom.zombieControl) {
      const zl: Record<string, string> = {
        ctr: 'Samui Tower is screaming on the radio. We screamed back. They did not like our accent.',
        'app-17': 'Lantern in the airport approach. An aeroplane is coming. We are hungry. Interesting.',
        'app-35': 'Lantern in the airport approach. The pilots are waving. We wave back. With one arm.',
        fine: 'Fine: sixty thousand baht. We do not have pockets. We do not have money. We have teeth.',
      };
      this.capcom.say('zombie', zl[a.id] ?? 'The humans are upset about the sky again.', 4, 'happy');
      return;
    }
    this.capcom.say('tortoise', pool[Math.floor(Math.random() * pool.length)], 4, 'serious');
    if (a.id === 'app-17' || a.id === 'app-35') this.capcom.say('duck', 'Samui Tower, CAPCOM: unlit object drifting through your approach. Recommend holding traffic. Sorry. So sorry.', 3, 'serious');
  }

  /* ---------- Spacewalk ---------- */

  private toggleEvaControl() {
    const f = this.flight;
    if (!f.eva || f.eva.ended) { this.evaCtl = false; return; }
    this.evaCtl = !this.evaCtl;
    this.evaKeys = { w: 0, s: 0, a: 0, d: 0 };
    this.view.target = this.evaCtl ? { kind: 'eva' } : { kind: 'vehicle' };
  }

  private evaCard() {
    const f = this.flight, e = f.eva;
    const inOrbit = f.missionPhase === 'orbital' && f.airborne && !f.vehicle.landed;
    const evaBtn = this.q<HTMLButtonElement>('[data-act="eva"]'), kitBtn = this.q<HTMLButtonElement>('[data-act="kit"]');
    evaBtn.hidden = !(inOrbit || e) || f.seat === 'none';
    kitBtn.hidden = evaBtn.hidden || !!e;
    const why = f.evaBlockedBy;
    evaBtn.disabled = !e && !!why;
    evaBtn.title = e ? 'Switch control: ship ⇄ zombie (E)' : why ?? 'Spacewalk (E)';
    evaBtn.textContent = e ? (this.evaCtl ? 'Fly ship' : 'Fly zombie') : 'EVA';
    this.k('kit').textContent = { extinguisher: 'Extinguisher', 'rcs-pack': 'RCS pack', flail: 'None' }[f.evaKit];
    const card = this.q('.hud-eva');
    card.hidden = !e;
    if (!e) return;
    const b = e.body, v = f.vehicle;
    this.k('evactl').textContent = e.ended ? 'Lost' : this.evaCtl ? 'Flying: zombie' : 'Flying: ship';
    this.k('evactl').className = `pill ${e.ended ? 'bad' : this.evaCtl ? 'live' : ''}`;
    this.k('evakit').textContent = e.jarred ? 'Jar (no arms, no kit)' : e.armless ? 'No arms — flailing only' : !b.holding && b.kit.id !== 'flail' ? `${b.kit.name} — dropped!` : b.kit.name;
    const pct = Math.round(e.propFrac * 100);
    (this.k('evabar') as HTMLElement).style.width = `${pct}%`;
    this.k('evapct').textContent = b.kit.prop > 0 && b.holding ? `${pct}%` : '';
    this.k('evadv').textContent = `${e.deltaV.toFixed(1)} m/s`;
    this.k('evaspin').textContent = `${((b.om * 60) / (2 * Math.PI)).toFixed(1)} rpm`;
    this.k('evaspin').className = Math.abs(b.om) > 2.5 ? 'bad' : Math.abs(b.om) > 0.8 ? 'warn' : '';
    const dx = b.x - v.x, dy = b.y - v.y, d = Math.hypot(dx, dy);
    const rv = ((b.vx - v.vx) * dx + (b.vy - v.vy) * dy) / Math.max(1e-6, d);
    this.k('evadist').textContent = d < 1000 ? `${d.toFixed(1)} m` : `${(d / 1000).toFixed(2)} km`;
    this.k('evarel').textContent = `${rv > 0 ? 'opening' : 'closing'} ${Math.abs(rv).toFixed(2)} m/s`;
    const o = e.orbit, pe = (o.rP - R_EARTH) / 1000, ap = o.kind === 'ellipse' ? (o.rA - R_EARTH) / 1000 : Infinity;
    this.k('evaorb').textContent = Number.isFinite(ap) ? `${ap.toFixed(0)} × ${pe.toFixed(0)} km` : 'escape';
    this.k('evastat').textContent = e.ended === 'burnup' ? 'Shooting star' : e.ended === 'impact' ? 'On the ground' : { stable: 'Stable orbit', decaying: 'Decaying', suborbital: 'Coming down', escape: 'Leaving Earth' }[e.orbitClass];
    this.k('evahint').textContent = e.ended ? 'Capybara has been informed.'
      : e.jarred ? 'A jar cannot steer. It floats. It blinks. That is all it can do.'
      : !this.evaCtl ? 'E: take control of the zombie.'
      : b.kit.id === 'extinguisher' && b.holding ? 'W fire · S point it the other way · A/D flail. Every push also spins you.'
      : b.kit.id === 'rcs-pack' && b.holding ? 'W/S push · A/D attitude jets.'
      : 'A/D flail. Newton is unimpressed.';
  }

  /* ---------- Orbital map: 3D globe with the 2D map as fallback ---------- */

  /** Lazily load the Three.js globe the first time the 3D map is wanted */
  private ensureGlobe() {
    if (this.globe || this.globeLoading || this.globeFailed || this.mapStyle !== '3d') return;
    this.globeLoading = import('./GlobeView').then((m) => m.GlobeView.create(this.q('.map-layer'), this.frame3d)).then((g) => {
      this.globeLoading = null;
      if (!this.root.isConnected) { g?.dispose(); return; }
      if (!g) { this.globeFailed = true; this.logLine({ t: this.flight.t, kind: 'info', text: '3D map unavailable on this device (no WebGL) — showing the 2D map.' }); }
      this.globe = g;
      this.syncMapTools();
    });
  }

  private use3d() { return this.mapStyle === '3d' && !!this.globe; }

  private drawMap(f: Flight, real: number) {
    if (this.use3d()) this.globe!.frame(snapshot(f, this.frame3d, this.map.plan), real);
    else this.map.frame(f, real);
  }

  private syncMapTools() {
    const three = this.use3d();
    this.q('.map-gl').hidden = !three;
    this.q('.map-canvas').hidden = three;
    this.q('.map-labels').hidden = !three;
    this.q('[data-act="map3d"]').setAttribute('aria-pressed', String(this.mapStyle === '3d'));
    this.q('[data-act="map2d"]').setAttribute('aria-pressed', String(this.mapStyle === '2d'));
    this.q<HTMLButtonElement>('[data-act="map3d"]').disabled = this.globeFailed;
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-only3d]')) el.hidden = !three;
    if (this.globe) {
      this.q('[data-act="focusEarth"]').setAttribute('aria-pressed', String(this.globe.focus === 'earth'));
      this.q('[data-act="focusShip"]').setAttribute('aria-pressed', String(this.globe.focus === 'ship'));
    }
    if (this.mapStyle === '3d' && this.globeLoading) this.q('.map-hint').textContent = 'Loading the globe…';
    else this.q('.map-hint').textContent = 'Drag to rotate · scroll to zoom · right-drag to pan';
  }

  /* ---------- Ascent assist & maneuver node ---------- */

  private takeAssist(out: AssistOutput | null) {
    this.assistOut = out;
    if (out?.note) this.capcom.say(out.phase === 'cutoff' ? 'duck' : 'owl', out.note, 2, out.phase === 'cutoff' ? 'happy' : 'serious');
  }

  private assistLine() {
    const el = this.k('assist'), a = this.assistOut, mode = this.assist.mode;
    this.k('amode').textContent = { off: 'Off', guide: 'Guide', auto: 'Auto' }[mode];
    this.q('[data-act="assist"]').setAttribute('aria-pressed', String(mode !== 'off'));
    el.hidden = mode === 'off' || !a;
    if (!a || mode === 'off') return;
    const label: Record<string, string> = { idle: 'ready', vertical: 'vertical climb', 'gravity-turn': 'gravity turn', coast: 'coast to Ap', insertion: 'orbit insertion', cutoff: 'MECO' };
    el.textContent = `${mode === 'auto' ? 'Autopilot' : 'Guide'} · ${label[a.phase]} · aim ${a.elevation.toFixed(0)}° above horizon · ${a.hint}`;
    el.className = `hud-assist ${a.phase === 'cutoff' || /On profile/.test(a.hint) ? 'good' : 'warn'}`;
  }

  private nodeCard() {
    const f = this.flight, v = f.vehicle;
    const show = this.mapMode && f.airborne && !v.landed;
    this.q('.hud-node').hidden = !show;
    for (const b of this.root.querySelectorAll<HTMLElement>('[data-node-at]')) b.setAttribute('aria-checked', String(b.dataset.nodeAt === this.node.at));
    this.q<HTMLInputElement>('[data-in="ndv"]').value = String(this.node.dv);
    this.k('ndv').textContent = `${this.node.dv > 0 ? '+' : ''}${this.node.dv} m/s ${this.node.dv > 0 ? 'prograde' : this.node.dv < 0 ? 'retrograde' : ''}`;
    if (!show || this.node.dv === 0) {
      this.map.plan = null;
      for (const k of ['nap', 'npe', 'nt', 'nbt']) this.k(k).textContent = '—';
      return;
    }
    const plan = planManeuver({ x: v.x, y: v.y + R_EARTH }, { x: v.vx, y: v.vy }, MU_EARTH, R_EARTH, this.node.at, this.node.dv);
    this.map.plan = plan;
    const a = plan.after;
    this.k('nap').textContent = a.bound && a.kind === 'ellipse' ? fmtAlt(a.rA - R_EARTH) : '∞ (escape)';
    this.k('npe').textContent = a.rP - R_EARTH < 0 ? 'below ground' : fmtAlt(a.rP - R_EARTH);
    this.k('npe').className = plan.afterClass === 'stable' ? 'good' : plan.afterClass === 'decaying' ? 'warn' : plan.afterClass === 'suborbital' ? 'bad' : '';
    this.k('nt').textContent = plan.tNode > 0.5 ? `T−${fmtDur(plan.tNode)}` : 'now';
    // Burn time with whatever can still fire: lit engines, else the next stage's armed ones (vacuum figures)
    const live = v.engines.filter((i) => i.engine!.lit && !i.engine!.out);
    const eng = live.length ? live : v.engines.filter((i) => !i.engine!.out);
    const F = eng.reduce((s2, i) => s2 + i.engine!.fVac, 0);
    const ve = eng.length ? (eng.reduce((s2, i) => s2 + i.engine!.fVac * i.engine!.ispVac, 0) / Math.max(1, F)) * 9.80665 : 0;
    const tb = burnTime(this.node.dv, v.M, F, ve);
    this.k('nbt').textContent = Number.isFinite(tb) ? `${tb.toFixed(1)} s` : 'no engine';
    const verdict = { stable: 'stable orbit', decaying: 'decaying — the air will drag it down', suborbital: 'suborbital — it comes down', escape: 'escape — it leaves Earth' }[plan.afterClass];
    this.k('nhint').textContent = Number.isFinite(tb)
      ? `Result: ${verdict}. Point SAS ${this.node.dv > 0 ? 'prograde' : 'retrograde'} (M) and start ${(tb / 2).toFixed(0)} s before the node.`
      : `Result: ${verdict}. No engine left to fly it — RCS only.`;
  }

  /* ---------- Orbital map ---------- */

  private canMap() { const f = this.flight; return f.ignited && f.airborne && (f.reachedSpace || f.vehicle.alt > 70_000); }

  private setMap(on: boolean) {
    if (this.mapMode === on) { this.setWarp(this.warp); return; }
    this.mapMode = on;
    this.q('.map-layer').hidden = !on;
    this.q('.sky-canvas').hidden = on;
    if (on) this.ensureGlobe();
    this.syncMapTools();
    this.q('.flight-view').classList.toggle('in-map', on);
    this.q('[data-act="map"]').setAttribute('aria-pressed', String(on));
    this.setWarp(on ? this.warp : Math.min(this.warp, 10));
    if (on && !this.mapTold) { this.mapTold = true; this.capcom.say('owl', 'Map view. The cyan line is where gravity will take you if you do nothing. Burn prograde to raise the far side, retrograde to lower it.', 2); }
  }

  private orbitCard() {
    const f = this.flight, v = f.vehicle;
    const show = f.ignited && f.airborne && !v.landed && (this.mapMode || v.alt > 50_000);
    this.q('.hud-orbit').hidden = !show;
    this.q<HTMLButtonElement>('[data-act="map"]').disabled = !this.mapMode && !this.canMap();
    if (!f.seamsOk && !this.seamWarned) {
      this.seamWarned = true;
      const h = f.handoffs.find((x) => !x.ok)!;
      console.warn('[RocketScience] physics/rails seam outside tolerance', h);
      this.logLine({ t: f.t, kind: 'warn', text: `Integrator seam check failed at T+${h.t.toFixed(0)} (Δr ${h.dr.toFixed(3)} m, Δv ${h.dv.toFixed(4)} m/s).` });
    }
    if (!show) return;
    const o = f.orbit, cls = f.orbitClass;
    const pe = o.rP - R_EARTH, ap = o.rA - R_EARTH;
    const label = { stable: 'Stable', decaying: 'Decaying', suborbital: 'Suborbital', escape: 'Escape' }[cls];
    this.k('otype').textContent = label;
    this.k('otype').className = `pill ${cls === 'stable' ? 'good' : cls === 'escape' ? 'live' : cls === 'decaying' ? 'bad' : ''}`;
    this.k('oap').textContent = o.bound && o.kind === 'ellipse' ? fmtAlt(ap) : '∞';
    this.k('ope').textContent = pe < 0 ? 'below ground' : fmtAlt(pe);
    this.k('ope').className = cls === 'stable' ? 'good' : cls === 'decaying' ? 'warn' : '';
    this.k('otap').textContent = o.kind === 'ellipse' ? fmtDur(timeTo(o, 'apo')) : '—';
    this.k('oper').textContent = o.kind === 'ellipse' ? fmtDur(o.period) : '—';
    const mode = f.propagationMode === 'rails' ? 'On rails (exact Kepler)' : 'Full physics';
    const phase = { ascent: 'ascent', orbital: 'orbital', deorbit: 'de-orbit', landed: 'landed' }[f.missionPhase];
    this.k('owarp').textContent = this.warpLimited
      ? `Warp held at ${PHYS_WARP_CAP}× — ${v.alt < 140_000 ? 'below the 140 km rails line' : 'engines running'} · ${phase}`
      : `${mode} · ${phase}${f.laps ? ` · ${f.laps} lap${f.laps > 1 ? 's' : ''}` : ''}`;
  }

  /** Pre-flight: an orbital payload on a vehicle that can't reach orbit gets a gentle warning */
  private orbitalCheck() {
    const orbital = this.parts.some((p) => PART[p.defId].payload3d?.orbital);
    if (!orbital) return;
    const dv = stagedDeltaV(this.parts).total;
    const pct = Math.round((dv / LEO_DV) * 100);
    this.logLine({ t: 0, kind: dv >= LEO_DV ? 'info' : 'warn', text: `Orbital payload aboard. Staged Δv ≈ ${(dv / 1000).toFixed(1)} km/s of ~${(LEO_DV / 1000).toFixed(1)} needed for low orbit (${pct}%).` });
    this.capcom.say('owl', dv >= LEO_DV
      ? 'An orbital payload, and the Δv budget closes. Pitch over slowly, stay out of the thick air, and build sideways speed.'
      : `That payload wants orbit, but this stack has about ${pct}% of the Δv. It will be a lovely suborbital hop.`, 2);
  }

  private zombieCard() {
    const f = this.flight, z = f.zombie;
    const cv = this.q<HTMLCanvasElement>('.z-portrait');
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    (this.q('.z-frame') as HTMLElement).hidden = !z;
    if (!z) {
      this.k('zname').textContent = 'No payload';
      this.k('zstate').textContent = f.seat === 'none' ? 'No seat on this vehicle.' : 'Empty seat.';
      this.k('g').textContent = f.seatG.toFixed(1);
      return;
    }
    const v = z.v;
    // portrait: sprite for the current mood if the art exists, else the procedural version
    const mood: Mood = moodOf(f);
    const img = this.q<HTMLImageElement>('.z-art');
    if (this.moodImg !== mood) {
      this.moodImg = mood;
      img.hidden = true;
      img.onload = () => { img.hidden = false; };
      img.onerror = () => { img.hidden = true; };
      img.src = MOOD_ART[mood];
    }
    ctx.translate(cv.width / 2, cv.height * 0.72);
    const k = cv.height / 1.05;
    ctx.scale(k, -k);
    if (!img.hidden && img.complete && img.naturalWidth) { /* art covers it */ }
    else drawMood(ctx, v.id, mood, z.limbs, 1.4 / k, performance.now() / 1000);
    this.q('.z-frame').dataset.mood = mood;
    this.q('.z-frame').dataset.zombie = v.id;
    const missing = LIMBS.filter((l) => !z.limbs.has(l));
    this.k('zname').textContent = v.name;
    this.k('zstate').textContent = z.state === 'jarred' ? `Jarred at ${z.peakG.toFixed(1)} g. Shelf-stable.`
      : z.state === 'pieces' ? `In pieces.${v.worms ? ` ${v.worms - z.wormsLeft} worms lost.` : ''}`
      : `${MOOD_TEXT[moodOf(f)]}${missing.length ? ` · missing ${missing.join(', ')}` : ''}`;
    this.k('zstate').className = z.state === 'pieces' || z.state === 'jarred' ? 'bad' : missing.length ? 'warn' : '';
    const g = f.seatG;
    this.k('g').textContent = g.toFixed(1);
    this.k('g').className = g >= v.fallApartG ? 'bad' : g >= v.limbG ? 'warn' : '';
    const max = v.fallApartG * 1.25;
    (this.k('gbar') as HTMLElement).style.width = `${Math.min(100, (g / max) * 100)}%`;
    (this.k('gbar') as HTMLElement).className = g >= v.fallApartG ? 'bad' : g >= v.limbG ? 'warn' : '';
    (this.k('glimb') as HTMLElement).style.left = `${(v.limbG / max) * 100}%`;
    (this.k('glimb') as HTMLElement).title = `Limbs start going at ${v.limbG} g`;
    (this.k('gdead') as HTMLElement).style.left = `${(v.fallApartG / max) * 100}%`;
    (this.k('gdead') as HTMLElement).title = `Comes apart at ${v.fallApartG} g`;
  }

  private drainLog() {
    const ev = this.flight.events;
    while (this.logged < ev.length) {
      const e = ev[this.logged++];
      this.logLine(e); this.capcom.event(e);
      if (e.kind === 'zombie-limb') { const L = toLocal(this.flight.vehicle.x, this.flight.vehicle.y); this.director.impact({ kind: 'limb', x: L.s, y: L.h, vx: 0, vy: 0, energy: 5e3, size: 0.5, hero: true }, performance.now()); }
      const m = unlock(e.kind);
      if (m) {
        this.logLine({ t: e.t, kind: 'milestone', text: `Milestone — ${m.title}: ${m.text}` });
        if (m.id === 'zombie-sat' || m.id === 'orbit') this.milestoneCard(m.title, m.text);
      }
    }
  }

  private logLine(e: { t: number; kind: string; text: string }) {
    const ol = this.k('log');
    const li = document.createElement('li');
    const cls = e.kind.startsWith('zombie') ? 'zombie' : ['failure', 'impact', 'tumble', 'cartwheel', 'no-liftoff'].includes(e.kind) ? 'bad'
      : ['stall', 'reverse', 'gimbal', 'chute'].includes(e.kind) && /shred|stall|wrong|running out/.test(e.text) ? 'warn'
      : e.kind === 'law' || e.kind === 'lantern-fire' || e.kind === 'lantern-ground-fire' ? 'bad'
      : ['landed', 'karman', 'firework', 'orbit', 'zombie-sat', 'lap', 'reboost'].includes(e.kind) ? 'good' : e.kind === 'decaying' ? 'warn' : e.kind === 'milestone' ? 'milestone' : e.kind === 'warn' ? 'warn' : e.kind === 'burnup' || e.kind === 'plasma' ? 'bad' : '';
    li.className = e.kind === 'capcom' ? 'capcom' : cls;
    li.innerHTML = `<time>T+${e.t.toFixed(1)}</time><span></span>`;
    li.querySelector('span')!.textContent = e.text;
    ol.prepend(li);
    while (ol.children.length > 60) ol.lastElementChild!.remove();
  }

  /* ---------- Countdown & CAPCOM ---------- */

  private startCountdown() {
    if (!this.parts.length) return;
    this.countdown = { start: performance.now(), said: -1 };
    this.q('.hud-site').hidden = true;
    this.capcom.say('lee', 'All stations, final poll. We are go for launch.', 4);
  }

  private abortCountdown() {
    this.countdown = null;
    const el = this.q('.countdown'); el.hidden = true;
    this.q('.hud-site').hidden = false;
    this.capcom.say('lee', 'Hold, hold, hold! Countdown stopped.', 4);
  }

  private tickCountdown(now: number) {
    const c = this.countdown;
    if (!c) return;
    const el = this.q('.countdown');
    const sec = Math.floor((now - c.start) / 1000);
    el.hidden = false;
    if (sec !== c.said) {
      c.said = sec;
      const words = ['T-3', 'T-2', 'T-1', 'IGNITION'];
      el.textContent = words[Math.min(sec, 3)];
      el.className = `countdown n${Math.min(sec, 3)}`;
      if (sec === 0) this.capcom.say('otter', 'Engines armed and twitchy!', 4);
      if (sec === 1) this.capcom.say('capybara', `${this.flight.zombie ? 'Zombie strapped in. It seems fine. It always seems fine.' : 'No passenger today. Lucky seat.'}`, 4);
      if (sec === 3) { this.flight.ignite(); }
    }
    if (now - c.start > 4200) { this.countdown = null; el.hidden = true; }
  }

  private typer = 0;
  private showLine(l: Line) {
    const crew = CREW[l.who];
    const box = this.q('.hud-capcom');
    const img = box.querySelector('img') as HTMLImageElement;
    const badge = box.querySelector('.cc-avatar span') as HTMLElement;
    badge.textContent = crew.initials;
    (box.querySelector('.cc-avatar') as HTMLElement).style.background = crew.color;
    img.hidden = true;
    img.onload = () => { img.hidden = false; };
    img.onerror = () => { img.hidden = true; };
    img.src = portrait(l.who, l.face);
    box.dataset.face = l.face ?? 'neutral';
    (box.querySelector('.cc-name') as HTMLElement).textContent = crew.name;
    (box.querySelector('.cc-role') as HTMLElement).textContent = crew.role;
    const p = box.querySelector('.cc-text') as HTMLElement;
    const tr = box.querySelector('.cc-trans') as HTMLElement;
    tr.hidden = !l.translation; tr.textContent = l.translation ? `[Translation: ${l.translation}]` : '';
    box.classList.toggle('zombie', l.who === 'zombie');
    // typewriter (one at a time: a new line stops the last one mid-word)
    p.textContent = '';
    let i = 0;
    clearInterval(this.typer);
    const id = this.typer = window.setInterval(() => { p.textContent = l.text.slice(0, ++i * 2); if (i * 2 >= l.text.length) clearInterval(id); }, 18);
    box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
    this.logLine({ t: this.flight.t, kind: 'capcom', text: l.translation ? `${crew.name}: “${l.text}” [Translation: ${l.translation}]` : `${crew.name}: ${l.text}` });
  }

  /**
   * End-of-flight sequence: a total catastrophic crash gets slime on the lens and the
   * Capybara palate cleanser; Wan Hu chair flights that end badly then get the legend's
   * cutscene; then the summary.
   */
  private endOfFlight() {
    const f = this.flight;
    this.campaignTick(true);
    const bad = f.outcome === 'impact' || f.outcome === 'structural-failure' || f.outcome === 'no-liftoff' || f.events.some((e) => e.kind === 'burnup' || e.kind === 'failure');
    const steps: (() => Promise<void>)[] = [];
    if (catastrophic(f)) steps.push(() => this.cleanse(), () => this.punchline());
    if (f.seat === 'chair' && bad && cutscenesEnabled()) steps.push(() => playCutscene(nextWanHuTake()));
    if (this.eaPending) steps.push(() => this.earlyAccessEnd());
    if (!steps.length) { this.summary(); return; }
    this.summaryBusy = true;
    const flight = f;
    void steps.reduce((p, s) => p.then(s), Promise.resolve()).then(() => { if (this.flight === flight) this.summary(); this.summaryBusy = false; });
  }

  /**
   * The slapstick loop's last beat: once the lens is clean, Zombie Control comments on the crash
   * (gibberish + [Translation]) and we hold for a moment so it can be read before the summary.
   */
  private punchline(): Promise<void> {
    const f = this.flight, z = f.zombie;
    const lost = z ? 5 - z.limbs.size : 0;
    const lines = z ? [
      'We are fine. We were already dead. Again, please.',
      'Structural integrity: none. Morale: excellent. Build the next one.',
      `Parts recovered: ${5 - lost} of 5. That is a passing grade where we come from.`,
      'The ground won. The ground always wins. Bigger rocket.',
      'Write it down as a landing. A loud landing.',
    ] : [
      'No zombie on board, so nobody to blame. We will blame the bamboo.',
      'The rocket has been distributed evenly across the province. Very fair.',
    ];
    this.capcom.hush(5);
    this.capcom.say('zombie', pickOne(lines), 5, 'happy');
    return new Promise((r) => setTimeout(r, 3000));
  }

  /** Mission 2.5 done: the End of Early Access screen, then wherever the player chose */
  private eaPending = false;
  private async earlyAccessEnd(): Promise<void> {
    this.eaPending = false;
    const x = await showEarlyAccessEnd({ apogeeKm: this.flight.result().maxAlt / 1000 });
    if (x === 'sandbox') { campaign.setMode('sandbox'); this.logLine({ t: this.flight.t, kind: 'info', text: 'Sandbox on: every Tier 0–2 part, every range, nothing recorded. Fly something silly.' }); }
    else if (x === 'factory') bus.emit('phase:request', { phase: 'assembly' });
    else openGallery('log');
  }

  private cleanse(): Promise<void> {
    const z = this.flight.zombie;
    this.capcom.hush();                     // the crash chatter is over: Capybara, then Zombie Control
    const m = unlock('palate');
    if (m) this.logLine({ t: this.flight.t, kind: 'milestone', text: `Milestone — ${m.title}: ${m.text}` });
    return playPalateCleanser(this.q('.flight-view'), {
      slime: z ? ZB[z.v.id].slime : undefined,
      seed: Math.floor(this.flight.t * 1000) || 7,
      // the janitor keeps its own voice, even during a Zombie Control takeover
      onMop: () => this.capcom.say('capybara', pickOne([
        'Hold still. I’ve got it.', 'Don’t mind me. Just tidying.', 'There we go. Fresh lens. Fresh start.',
        'Happens to everyone. Mostly to us.', 'One more swipe… lovely.',
      ]), 4, 'neutral', true),
    });
  }

  private milestoneCard(title: string, text: string, img = 'assets/story/crew_lineup_hangar4.jpg') {
    this.root.querySelector('.rs-milestone')?.remove();
    const el = document.createElement('div');
    el.className = `rs-milestone${this.q('.law-alert').hidden ? '' : ' below-alert'}`;
    el.setAttribute('role', 'status');
    el.innerHTML = `<img src="${img}" alt=""><div><b></b><small></small></div>`;
    el.querySelector('b')!.textContent = `🏆 ${title}`;
    el.querySelector('small')!.textContent = text;
    el.querySelector('img')!.addEventListener('error', (e) => (e.target as HTMLElement).remove());
    if (/_full\.png$/.test(img)) el.querySelector('img')!.classList.add('portrait');
    el.addEventListener('click', () => el.remove());
    this.q('.flight-view').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, 6500);
  }

  private summary() {
    const f = this.flight, r = f.result();
    const title: Record<string, string> = {
      landed: 'Landed', impact: 'Crashed', 'no-liftoff': 'Never left the pad', 'structural-failure': 'Broke up', timeout: 'Still flying',
    };
    this.k('sumtitle').textContent = title[r.outcome] ?? r.outcome;
    this.k('sumz').textContent = r.zombie ? `${ZOMBIES[r.zombie].name}: ${r.zombieVerdict}` : r.zombieVerdict;
    const row = (k: string, v: string) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
    this.k('sumstats').innerHTML = row('Apogee', fmtAlt(r.maxAlt)) + row('Top speed', `${r.maxSpeed.toFixed(0)} m/s`)
      + row('Peak g (vehicle)', r.maxG.toFixed(1)) + row('Peak g (seat)', r.maxSeatG.toFixed(1))
      + row('Landing speed', `${r.impactSpeed.toFixed(1)} m/s`) + row('Range', `${(r.range / 1000).toFixed(2)} km`)
      + (this.monitor ? row('Airspace', this.monitor.alerts.length ? `${this.monitor.alerts.filter((a) => a.id !== 'fine').length} violation${this.monitor.alerts.length > 2 ? 's' : ''}${this.monitor.fines ? ` · ฿${this.monitor.fines.toLocaleString()}` : ''}` : 'Clear of Samui airspace') : '');
    // Banner from the story art: chair mishaps get the soot, Bang Fai gets the procession
    const banner = this.q<HTMLImageElement>('.sum-banner');
    const chairBad = f.seat === 'chair' && r.outcome !== 'landed';
    const src = chairBad ? 'assets/story/aftermath_soot.jpg'
      : this.parts.some((p) => p.defId === 'bang-fai') ? 'assets/story/bangfai_parade.jpg'
      : r.outcome === 'landed' && f.reachedSpace ? 'assets/story/crew_lineup_hangar4.jpg' : '';
    banner.hidden = !src;
    banner.onerror = () => { banner.hidden = true; };
    if (src) banner.src = src;
    this.q('.hud-summary').hidden = false;
  }
}

/** "Total catastrophic crash": the vehicle is lost AND the zombie is done for (or it hit very hard) */
export function catastrophic(f: Flight): boolean {
  if (f.outcome !== 'impact' && f.outcome !== 'structural-failure') return false;
  const z = f.zombie;
  return (!!z && isTerminal(z.state)) || f.impactSpeed > 60 || f.events.some((e) => e.kind === 'failure');
}
const pickOne = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

const fmtAlt = (m: number) => (m >= 10_000 ? `${(m / 1000).toFixed(1)} km` : m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(0)} m`);
const wrapDeg = (d: number) => ((d + 540) % 360) - 180;
