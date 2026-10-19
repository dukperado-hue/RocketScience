/**
 * Space Law event system — a small rules engine.
 *
 * Every simulation tick (or at key moments) the flight sim hands the engine a
 * FlightSnapshot. Each rule is a predicate + consequence; when one fires, the
 * engine emits a LawEvent on the bus for the HUD ("legal ticker"), the
 * post-flight report and the career score.
 *
 * Legal summaries are written for a game audience. International instruments
 * are cited by name and article; Thai local rules are summarised and flagged
 * for verification against the current CAAT announcements.
 */
import { bus } from '@/core/EventBus';
import { THAI_ZONES, distanceM, insideZone, type AirspaceZone, type GeoPoint } from './zones';

export type PermitId = 'caat-launch-notice' | 'festival-permit' | 'launch-licence' | 'space-object-registration';
export type Severity = 'info' | 'warning' | 'violation';

export interface LawContext {
  launchSite: GeoPoint;
  launchCountry: string;               // ISO code, e.g. 'TH'
  permits: Set<PermitId>;
  /** Altitude limit granted in the permit, metres (undefined = no permit limit known) */
  permitCeilingM?: number;
}

export interface FlightSnapshot {
  t: number;
  pos: GeoPoint;
  altM: number;
  apoapsisM?: number;
  periapsisM?: number;
  inOrbit?: boolean;
  /** Set once, on the tick the vehicle (or a stage) hits the ground */
  impact?: { pos: GeoPoint; country: string; massKg: number };
  /** Set on the tick of a collision with another space object */
  collision?: { objectId: string; ownerCountry: string };
  /** Debris released this tick (spent stages, fairings, etc.) */
  debris?: { count: number; orbitalLifetimeYears: number };
}

export interface Consequence {
  reputation?: number;          // career score change
  fineTHB?: number;             // illustrative in-game fine
  abortMission?: boolean;
  liability?: 'absolute' | 'fault';
}

export interface LegalRule {
  id: string;
  scope: 'local' | 'international';
  severity: Severity;
  title: string;
  titleTh: string;
  basis: string;                // instrument + article
  /** Fire at most once per flight */
  once: boolean;
  /** Return a detail string to fire, or null/false to stay quiet */
  check(s: FlightSnapshot, ctx: LawContext, zones: AirspaceZone[]): string | null | false;
  consequence: Consequence;
  lesson: string;
}

export interface LawEvent {
  t: number;
  ruleId: string;
  scope: LegalRule['scope'];
  severity: Severity;
  title: string;
  titleTh: string;
  basis: string;
  detail: string;
  lesson: string;
  consequence: Consequence;
}

/* ---------------- Rules ---------------- */

export const RULES: LegalRule[] = [
  // ---------- Local: Thailand (Tier 1) ----------
  {
    id: 'th-no-launch-notice', scope: 'local', severity: 'warning', once: true,
    title: 'Launch without notifying the aviation authority',
    titleTh: 'จุดโดยไม่แจ้งหน่วยงานการบิน',
    basis: 'Air Navigation Act B.E. 2497 and CAAT announcements on releasing objects into airspace (summary — verify current rules)',
    check: (s, ctx) => (s.t === 0 && !ctx.permits.has('caat-launch-notice') && !ctx.permits.has('festival-permit')) && 'No launch notice or festival permit on file.',
    consequence: { reputation: -10 },
    lesson: 'Rockets, lanterns and balloons share the sky with aircraft. Authorities need to know when and where you launch.',
  },
  {
    id: 'th-launch-near-airport', scope: 'local', severity: 'violation', once: true,
    title: 'Launch site inside an airport safety zone',
    titleTh: 'ฐานจุดอยู่ในเขตปลอดภัยของท่าอากาศยาน',
    basis: 'CAAT airport vicinity restrictions (summary — verify current rules)',
    check: (s, ctx, zones) => {
      if (s.t !== 0) return null;
      const z = zones.find((z) => z.kind === 'airport' && distanceM(ctx.launchSite, z.centre) <= z.radiusM);
      return z ? `Launch pad is ${(distanceM(ctx.launchSite, z.centre) / 1000).toFixed(1)} km from ${z.name}.` : null;
    },
    consequence: { reputation: -30, abortMission: true },
    lesson: 'Aircraft climbing out or on final approach are low and slow — the worst place for an unguided rocket.',
  },
  {
    id: 'th-airspace-incursion', scope: 'local', severity: 'violation', once: true,
    title: 'Rocket entered airport-controlled airspace',
    titleTh: 'บั้งไฟล้ำเข้าเขตห้วงอากาศควบคุมของสนามบิน',
    basis: 'Air Navigation Act B.E. 2497 (summary — verify current rules)',
    check: (s, _ctx, zones) => {
      const z = zones.find((z) => (z.kind === 'airport' || z.kind === 'approach') && insideZone(s.pos, s.altM, z));
      return z ? `At ${s.altM.toFixed(0)} m inside the ${z.name} zone.` : null;
    },
    consequence: { reputation: -40, fineTHB: 40_000, abortMission: true },
    lesson: 'Wind drift matters: check where your trajectory can carry the rocket, not just where you point it.',
  },
  {
    id: 'th-permit-ceiling', scope: 'local', severity: 'warning', once: true,
    title: 'Exceeded permitted altitude',
    titleTh: 'สูงเกินเพดานที่ได้รับอนุญาต',
    basis: 'Conditions of the launch permit',
    check: (s, ctx) => ctx.permitCeilingM !== undefined && s.altM > ctx.permitCeilingM && `Reached ${s.altM.toFixed(0)} m; permit allows ${ctx.permitCeilingM} m.`,
    consequence: { reputation: -15 },
    lesson: 'A permit is a promise about where your vehicle will be. Over-performing breaks it too.',
  },
  {
    id: 'th-impact-populated', scope: 'local', severity: 'violation', once: false,
    title: 'Vehicle came down in a populated area',
    titleTh: 'ตกในพื้นที่ชุมชน',
    basis: 'Civil liability for damage to persons and property (summary)',
    check: (s, _ctx, zones) => {
      if (!s.impact) return null;
      const z = zones.find((z) => z.kind === 'populated' && distanceM(s.impact!.pos, z.centre) <= z.radiusM);
      return z ? `${s.impact.massKg.toFixed(0)} kg came down in ${z.name}.` : null;
    },
    consequence: { reputation: -25, fineTHB: 100_000 },
    lesson: 'Plan a recovery area downrange, away from homes and roads.',
  },

  // ---------- International ----------
  {
    id: 'ost-karman', scope: 'international', severity: 'info', once: true,
    title: 'Welcome to outer space',
    titleTh: 'ยินดีต้อนรับสู่อวกาศ',
    basis: 'Outer Space Treaty 1967, Arts. I, II & VI',
    check: (s) => s.altM >= 100_000 && 'Crossed the Kármán line (100 km) — the commonly used boundary of space.',
    consequence: { reputation: +20 },
    lesson: 'Space is free for all states to explore and cannot be claimed by any nation (Arts. I–II). Your state is internationally responsible for your activities, including private ones, and must authorise and supervise them (Art. VI).',
  },
  {
    id: 'ost-peaceful', scope: 'international', severity: 'info', once: true,
    title: 'Peaceful uses of outer space',
    titleTh: 'การใช้อวกาศเพื่อสันติ',
    basis: 'Outer Space Treaty 1967, Art. IV',
    check: (s) => (s.apoapsisM ?? 0) >= 1_000_000 && 'Long-range ballistic arc achieved.',
    consequence: {},
    lesson: 'The rockets of the 1950s were built for war; the treaty bans nuclear weapons and other weapons of mass destruction in orbit, and keeps the Moon and celestial bodies for peaceful purposes only. The same launchers carried Sputnik and Gagarin.',
  },
  {
    id: 'reg-registration', scope: 'international', severity: 'warning', once: true,
    title: 'Unregistered space object',
    titleTh: 'วัตถุอวกาศยังไม่ได้จดทะเบียน',
    basis: 'Registration Convention 1975, Art. II',
    check: (s, ctx) => !!s.inOrbit && !ctx.permits.has('space-object-registration') && 'Object is in orbit with no registry entry.',
    consequence: { reputation: -10 },
    lesson: 'The launching state records each object it puts in orbit in a national registry and informs the UN Secretary-General, so everyone knows whose object is whose.',
  },
  {
    id: 'liab-surface', scope: 'international', severity: 'violation', once: false,
    title: 'Space object caused damage on another state’s territory',
    titleTh: 'วัตถุอวกาศก่อความเสียหายในดินแดนรัฐอื่น',
    basis: 'Liability Convention 1972, Art. II (absolute liability)',
    check: (s, ctx) => !!s.impact && s.impact.country !== ctx.launchCountry && (s.apoapsisM ?? 0) >= 100_000 &&
      `Debris landed in ${s.impact.country}.`,
    consequence: { reputation: -30, liability: 'absolute' },
    lesson: 'For damage on the Earth’s surface or to aircraft in flight, the launching state pays even if it wasn’t careless — absolute liability. (Precedent: Cosmos 954 debris over Canada, 1978.)',
  },
  {
    id: 'liab-collision', scope: 'international', severity: 'violation', once: false,
    title: 'Collision with another space object',
    titleTh: 'ชนกับวัตถุอวกาศอื่น',
    basis: 'Liability Convention 1972, Art. III (fault-based liability)',
    check: (s) => !!s.collision && `Hit ${s.collision.objectId} (registered to ${s.collision.ownerCountry}).`,
    consequence: { reputation: -40, liability: 'fault' },
    lesson: 'In space, liability depends on fault — so your tracking data, manoeuvre logs and conjunction warnings become evidence.',
  },
  {
    id: 'debris-long-lived', scope: 'international', severity: 'warning', once: false,
    title: 'Long-lived orbital debris',
    titleTh: 'สร้างขยะอวกาศที่อยู่ในวงโคจรนาน',
    basis: 'IADC / UN COPUOS Space Debris Mitigation Guidelines (2007)',
    check: (s) => !!s.debris && s.debris.orbitalLifetimeYears > 25 &&
      `${s.debris.count} object(s) left with ~${s.debris.orbitalLifetimeYears.toFixed(0)}-year lifetime.`,
    consequence: { reputation: -15 },
    lesson: 'The guidelines ask that objects leave low Earth orbit within 25 years of mission end; some regulators now require much faster disposal (e.g. the US FCC 5-year rule for satellites it licenses). Lower your spent stage’s periapsis so drag pulls it down.',
  },
];

/* ---------------- Engine ---------------- */

export class SpaceLawEngine {
  private fired = new Set<string>();
  readonly log: LawEvent[] = [];

  constructor(
    private ctx: LawContext,
    private rules: LegalRule[] = RULES,
    private zones: AirspaceZone[] = THAI_ZONES,
  ) {}

  evaluate(s: FlightSnapshot): LawEvent[] {
    const out: LawEvent[] = [];
    for (const r of this.rules) {
      if (r.once && this.fired.has(r.id)) continue;
      const detail = r.check(s, this.ctx, this.zones);
      if (!detail) continue;
      this.fired.add(r.id);
      const ev: LawEvent = {
        t: s.t, ruleId: r.id, scope: r.scope, severity: r.severity,
        title: r.title, titleTh: r.titleTh, basis: r.basis, detail, lesson: r.lesson, consequence: r.consequence,
      };
      out.push(ev);
      this.log.push(ev);
      bus.emit('law:event', ev);
    }
    return out;
  }

  /** Totals for the post-flight report */
  summary() {
    return {
      reputation: this.log.reduce((s, e) => s + (e.consequence.reputation ?? 0), 0),
      finesTHB: this.log.reduce((s, e) => s + (e.consequence.fineTHB ?? 0), 0),
      aborted: this.log.some((e) => e.consequence.abortMission),
      violations: this.log.filter((e) => e.severity === 'violation').length,
    };
  }

  reset() { this.fired.clear(); this.log.length = 0; }
}
