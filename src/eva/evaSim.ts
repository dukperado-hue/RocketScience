/**
 * EVA in flight: the payload that left the ship, flown as its own body.
 *
 * Same physics rules as the vehicle (Gate A):
 *   translation  velocity Verlet in the same −μr/|r|³ field (`gravityAt`), thrust held over the step
 *   rails        exact universal-variable Kepler when nothing is firing and it is above the
 *                rails line; the segment ends where the conic comes down to RAILS_ALT
 *   attitude     ω̇ = τ / I — the fire extinguisher's thrust line misses the CoM, so every
 *                push also spins you (that is the joke, and it is real angular momentum)
 * and its own Gate B state machine, so a zombie that leaves the ship can be in a stable,
 * decaying or escape orbit of its own.
 *
 * Controls (set by the UI): `fire` −1/0/+1 (S / W), `spin` −1/0/+1 (A / D).
 *   rcs-pack      W/S push along/against where it faces; A/D attitude jets (10 N·m)
 *   extinguisher  W/S fire forward / point it the other way (torque flips too); A/D flail (1.5 N·m)
 *   flail         no thrust; A/D flail
 *   jarred        nothing at all — a jar has no arms
 */
import { R_EARTH, MU_EARTH, RAILS_ALT, gravityAt } from '@/physics/flight2d';
import type { ZombieId, ZombieState } from '@/payload/zombies';
import { elements, propagateState, timeToRadiusDescending, type Orbit } from '@/orbit/kepler';
import { OrbitStateMachine, type OrbitClass, type MissionPhase } from '@/orbit/state';
import { evaDeltaV, evaMass, evaThrust, makeEvaBody, type EvaBody, type EvaKitId } from './eva';

const RHO0 = 1.225, H_SCALE = 8500;

export interface EvaControls { fire: number; spin: number }
export interface EvaFx { t: number; kind: 'rcs'; x: number; y: number; vx: number; vy: number; dx: number; dy: number; puff?: number }
export type EvaEnd = null | 'burnup' | 'impact';

export class EvaSim {
  readonly body: EvaBody;
  readonly ctl: EvaControls = { fire: 0, spin: 0 };
  readonly osm = new OrbitStateMachine(R_EARTH);
  /** Limbs the zombie still has (for drawing) and how many arms can hold the kit */
  readonly limbs: ReadonlySet<string>;
  readonly armless: boolean;
  ended: EvaEnd = null;
  thrusting = false;
  /** Total CO₂/N₂ used, and the peak spin reached (rad/s) — for the summary */
  peakSpin = 0;
  private stepNo = 0;
  private emptyTold = false;
  private fxAcc = 0;

  constructor(
    id: number, parent: number, t: number,
    seat: { x: number; y: number; vx: number; vy: number; th: number },
    readonly zombie: ZombieId, state: Exclude<ZombieState, 'pieces'>, mass: number, area: number,
    limbs: ReadonlySet<string>, kitId: EvaKitId,
    private emit: { ev(kind: string, text: string): void; fx(f: EvaFx): void; rnd(): number },
    pushOff = 0.6,
  ) {
    const arms = ['left arm', 'right arm'].filter((a) => limbs.has(a)).length;
    this.limbs = limbs;
    this.armless = state === 'jarred' || arms === 0;
    const kit: EvaKitId = this.armless ? 'flail' : kitId;
    this.body = makeEvaBody(id, parent, t, seat, { zombie, state, mass, area }, kit, pushOff);
    // One-armed: twice as likely to drop it
    if (arms === 1 && this.body.kit.fumble > 0) this.body.kit = { ...this.body.kit, fumble: this.body.kit.fumble * 2 };
  }

  get jarred() { return this.body.payload.state === 'jarred'; }
  get mass() { return evaMass(this.body); }
  get alt() { return Math.hypot(this.body.x, this.body.y + R_EARTH) - R_EARTH; }
  get orbit(): Orbit { const b = this.body; return elements({ x: b.x, y: b.y + R_EARTH }, { x: b.vx, y: b.vy }, MU_EARTH); }
  get orbitClass(): OrbitClass { return this.osm.orbitClass; }
  get missionPhase(): MissionPhase { return this.osm.missionPhase; }
  get deltaV() { return evaDeltaV(this.body); }
  get propFrac() { const k = this.body.kit; return k.prop > 0 && this.body.holding ? this.body.propLeft / k.prop : 0; }
  /** Wants to fire and can — the vehicle may not go on rails while this is true */
  get wantsThrust() { return !this.ended && this.ctl.fire !== 0 && this.body.holding && this.body.propLeft > 0 && this.body.kit.thrust > 0; }
  get railsOk() { return !this.ended && !this.wantsThrust && this.ctl.spin === 0 && this.alt > RAILS_ALT; }

  /** Seconds until this body's conic comes down to the rails line (∞ if it never does) */
  railChunk(): number {
    const b = this.body, r = { x: b.x, y: b.y + R_EARTH }, v = { x: b.vx, y: b.vy };
    return timeToRadiusDescending(elements(r, v, MU_EARTH), r, v, R_EARTH + RAILS_ALT);
  }

  /** One 100 Hz physics step */
  step(t: number, dt: number) {
    if (this.ended) return;
    const b = this.body, k = b.kit;
    // ---- thrust & torque ----
    let fx = 0, fy = 0, torque = 0, mdot = 0;
    this.thrusting = this.wantsThrust;
    if (this.thrusting) {
      const facing = b.th + Math.PI / 2;
      const dir = this.ctl.fire > 0 ? facing : facing + Math.PI;
      const r = evaThrust(b, 1, dir, dt);
      fx = r.fx; fy = r.fy; torque = r.torque; mdot = r.mdot;
      if (!k.vectored && this.ctl.fire < 0) { fx = -fx; fy = -fy; torque = -torque; }   // pointing it the other way
      b.propLeft = Math.max(0, b.propLeft - mdot * dt);
      this.puff(t, dt, fx, fy);
      if (b.propLeft <= 0 && !this.emptyTold) { this.emptyTold = true; this.emit.ev('eva-empty', k.id === 'extinguisher' ? 'Extinguisher empty. It is now a red metal souvenir.' : 'EVA pack dry. Coasting from here.'); }
      if (k.fumble > 0 && b.holding && this.emit.rnd() < k.fumble * dt) {
        b.holding = false;
        this.emit.ev('eva-fumble', 'The zombie dropped the fire extinguisher. It is drifting away, slowly, forever.');
      }
    }
    if (this.ctl.spin && !this.jarred) {
      const jets = k.id === 'rcs-pack' && b.holding && b.propLeft > 0;
      torque += this.ctl.spin * (jets ? 10 : this.armless ? 0 : 1.5);
    }
    // ---- attitude ----
    b.om += (torque / b.I) * dt;
    b.th += b.om * dt;
    this.peakSpin = Math.max(this.peakSpin, Math.abs(b.om));
    // ---- translation: Verlet in the shared gravity field (+ a little drag if it is low) ----
    const m = this.mass;
    const alt = this.alt;
    let dax = 0, day = 0;
    if (alt < RAILS_ALT) {
      const rho = RHO0 * Math.exp(-Math.max(0, alt) / H_SCALE), sp = Math.hypot(b.vx, b.vy);
      const D = 0.5 * rho * sp * sp * 1.1 * b.payload.area;
      if (sp > 1) { dax = (-D * b.vx) / sp / m; day = (-D * b.vy) / sp / m; }
      if (alt < 75_000 && sp > 2500 && !this.ended) { this.end('burnup', t); return; }
    }
    const ax = fx / m + dax, ay = fy / m + day, h = dt / 2;
    const [gx, gy] = gravityAt(b.x, b.y);
    b.vx += (ax + gx) * h; b.vy += (ay + gy) * h;
    b.x += b.vx * dt; b.y += b.vy * dt;
    const [gx2, gy2] = gravityAt(b.x, b.y);
    b.vx += (ax + gx2) * h; b.vy += (ay + gy2) * h;
    if (this.alt <= 0) { this.end('impact', t); return; }
    if (this.stepNo++ % 10 === 0) this.updateState();
  }

  /** On rails: exact Kepler, spin carries on */
  coast(dt: number) {
    if (this.ended) return;
    const b = this.body;
    this.thrusting = false;
    const s = propagateState({ x: b.x, y: b.y + R_EARTH }, { x: b.vx, y: b.vy }, dt, MU_EARTH);
    b.x = s.r.x; b.y = s.r.y - R_EARTH; b.vx = s.v.x; b.vy = s.v.y;
    b.th += b.om * dt;
    this.updateState();
  }

  private updateState() {
    for (const tr of this.osm.update(this.orbit, false)) {
      if (tr.kind === 'class' && tr.to === 'escape') this.emit.ev('eva-escape', 'The zombie has reached escape velocity on a fire extinguisher. Science will never recover.');
      if (tr.kind === 'phase' && tr.to === 'orbital') this.emit.ev('eva-orbit', `Independent zombie satellite: ${this.jarred ? 'a jar' : 'a zombie'} in its own stable orbit.`);
      if (tr.kind === 'phase' && tr.to === 'deorbit') this.emit.ev('eva-deorbit', 'The zombie’s periapsis is in the air now. It is coming home the hard way.');
    }
  }

  private end(how: Exclude<EvaEnd, null>, t: number) {
    this.ended = how;
    this.thrusting = false;
    this.emit.ev(how === 'burnup' ? 'eva-burnup' : 'eva-impact', how === 'burnup'
      ? (this.jarred ? 'The jar re-entered. Glass melts at about 1,400 °C. It got there.' : 'The zombie re-entered without a heat shield. Shooting star, make a wish.')
      : 'The zombie reached the ground by itself. Capybara has been notified.');
    void t;
  }

  /** CO₂ / N₂ puffs out of the nozzle, opposite the thrust, ~30 per second */
  private puff(t: number, dt: number, fx: number, fy: number) {
    this.fxAcc += dt * 30;
    if (this.fxAcc < 1) return;
    this.fxAcc -= 1;
    const b = this.body, F = Math.hypot(fx, fy) || 1;
    const ex = -fx / F, ey = -fy / F;
    // nozzle sits off the CoM by the kit's offset, on the body's side axis
    const off = b.kit.offset || 0.05;
    const sx = Math.cos(b.th) * off, sy = Math.sin(b.th) * off;
    this.emit.fx({ t, kind: 'rcs', x: b.x + sx + ex * 0.3, y: b.y + sy + ey * 0.3, vx: b.vx, vy: b.vy, dx: ex, dy: ey, puff: b.kit.id === 'extinguisher' ? 2.6 : 1.3 });
  }
}
