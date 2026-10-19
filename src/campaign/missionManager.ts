/**
 * MissionManager — campaign progress, part/range unlocks, objective checks.
 *
 *   sandbox   every part and range unlocked, nothing is recorded (the game as it was before v0.18)
 *   campaign  Tier 0 + Koh Phangan to start; each completed mission unlocks the next tier
 *
 * Part availability = campaign unlock AND the Mixing Bench grade (the two locks stack; this
 * file only answers the first). Storage is injectable for tests; localStorage can throw or be
 * missing (private mode), in which case progress lives for the session only.
 */
import { bus } from '@/core/EventBus';
import { eaCap, type EarlyAccessCap } from '@/core/earlyAccess';
import { PART } from '@/phases/assembly/model/catalog';
import { PE_STABLE } from '@/orbit/state';
import {
  MISSIONS, MISSION, PROLOGUE, START,
  type CampaignSave, type FlightReport, type Mission, type MissionId, type ObjectiveCheck, type RangeId, type StoryEntry, type Tier,
} from './campaign';

export interface KV { get(k: string): string | null; set(k: string, v: string): void; del?(k: string): void }
const localKV: KV = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* session only */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
export const SAVE_KEY = 'rs.campaign.v1';

const fresh = (): CampaignSave => ({ v: 1, mode: 'campaign', completed: {}, story: [] });

export type MissionStatus = 'done' | 'available' | 'locked';

export class MissionManager {
  private s: CampaignSave;

  /**
   * `cap` (Early Access): parts above `cap.maxTier` are locked "coming soon" in every mode, and the
   * campaign ends with `cap.finale` — later missions are not offered. null = the full game.
   */
  constructor(private kv: KV = localKV, readonly cap: EarlyAccessCap | null = null) { this.s = this.load(); }

  /** The missions this build offers (all of them, or up to the Early Access finale) */
  get missions(): Mission[] {
    if (!this.cap) return MISSIONS;
    const last = MISSION[this.cap.finale].order;
    return MISSIONS.filter((m) => m.order <= last);
  }
  /** Missions the Early Access build holds back (for "coming soon" cards) */
  get upcoming(): Mission[] { return MISSIONS.filter((m) => !this.missions.includes(m)); }
  /** The Early Access finale is done: show the "End of Early Access" screen */
  get earlyAccessDone() { return !!this.cap && this.isDone(this.cap.finale); }
  /** Above the Early Access tier cap */
  comingSoon(partId: string) { const d = PART[partId]; return !!this.cap && !!d && d.tier > this.cap.maxTier; }

  private load(): CampaignSave {
    try {
      const raw = this.kv.get(SAVE_KEY);
      if (!raw) return fresh();
      const j = JSON.parse(raw) as Partial<CampaignSave>;
      if (j.v !== 1) return fresh();
      return {
        v: 1, mode: j.mode === 'sandbox' ? 'sandbox' : 'campaign',
        completed: Object.fromEntries(Object.entries(j.completed ?? {}).filter(([id]) => id in MISSION)),
        story: Array.isArray(j.story) ? j.story.filter((e) => e && typeof e.id === 'string') : [],
      };
    } catch { return fresh(); }
  }
  private save() { this.kv.set(SAVE_KEY, JSON.stringify(this.s)); bus.emit('campaign:changed', { mode: this.s.mode }); }

  /* ---------- mode ---------- */
  get mode() { return this.s.mode; }
  get sandbox() { return this.s.mode === 'sandbox'; }
  setMode(m: CampaignSave['mode']) { if (m !== this.s.mode) { this.s.mode = m; this.save(); } }
  /** Wipe campaign progress (mode is kept) */
  reset() { this.s = { ...fresh(), mode: this.s.mode }; this.save(); }

  /* ---------- progress ---------- */
  isDone(id: MissionId) { return !!this.s.completed[id]; }
  completedAt(id: MissionId) { return this.s.completed[id]?.at ?? null; }
  status(m: Mission): MissionStatus { return this.isDone(m.id) ? 'done' : m.requires.every((r) => this.isDone(r)) ? 'available' : 'locked'; }
  available(): Mission[] { return this.missions.filter((m) => this.status(m) === 'available'); }
  get complete() { return this.missions.every((m) => this.isDone(m.id)); }
  /** The next mission to show on the HUD (first available) */
  current(): Mission | null { return this.available()[0] ?? null; }

  /* ---------- unlocks ---------- */
  /** Highest part tier the player may use */
  unlockedTier(): Tier {
    const max: Tier = this.cap ? this.cap.maxTier : 4;
    if (this.sandbox) return max;
    const t = this.missions.reduce<Tier>((t, m) => (this.isDone(m.id) && m.rewards.tier > t ? m.rewards.tier : t), START.tier);
    return Math.min(t, max) as Tier;
  }
  partUnlocked(partId: string): boolean {
    const def = PART[partId];
    return !!def && def.tier <= this.unlockedTier();
  }
  /** The mission that unlocks a part, or null if it is already available */
  unlockedBy(partId: string): Mission | null {
    if (this.partUnlocked(partId) || this.comingSoon(partId)) return null;
    const t = PART[partId]?.tier;
    return this.missions.find((m) => m.rewards.tier === t) ?? null;
  }
  lockReason(partId: string): string | null {
    if (this.comingSoon(partId)) return this.cap!.label;
    const m = this.unlockedBy(partId);
    return m ? `Mission ${m.label} · ${m.title}` : null;
  }
  /** Locked part ids on a build (deduplicated) */
  lockedIn(partIds: string[]): string[] { return [...new Set(partIds.filter((id) => !this.partUnlocked(id)))]; }
  rangeUnlocked(r: RangeId): boolean {
    if (this.sandbox || START.ranges.includes(r)) return true;
    return MISSIONS.some((m) => this.isDone(m.id) && m.rewards.ranges?.includes(r));
  }

  /* ---------- objectives ---------- */
  check(c: ObjectiveCheck, r: FlightReport): boolean {
    switch (c.kind) {
      case 'max-tier': return r.partIds.length > 0 && r.maxTier <= c.tier;
      case 'uses-any': return r.partIds.some((id) => c.parts.includes(id));
      case 'launch-island': return r.island === c.island;
      case 'launch-range': return r.range === c.range;
      case 'airspace': return r.airspace.some((a) => (c.zones as string[]).includes(a));
      case 'apogee': return r.apogeeM >= c.m;
      case 'karman': return r.karman;
      // the stable flag already means "Pe above 140 km at some point this flight" — an EVA push-off
      // that nudges Pe a few metres afterwards must not un-complete it
      case 'orbit': return !!r.orbit?.stable && (r.orbit.peM >= c.peM || c.peM <= PE_STABLE);
      case 'zombie-aboard': return r.zombieAboard;
      case 'eva': return r.eva;
    }
  }
  progress(m: Mission, r: FlightReport): boolean[] { return m.objectives.map((o) => this.check(o.check, r)); }

  /**
   * Evaluate a (partial or final) flight report. Completes every available mission whose
   * objectives are all met, records the story entry, saves. Sandbox records nothing.
   * Returns the missions completed by this call.
   */
  evaluate(r: FlightReport, flightT = 0, now = Date.now()): Mission[] {
    if (this.sandbox) return [];
    const done: Mission[] = [];
    // loop: completing one mission can make the next available (the same flight may satisfy both)
    for (let guard = 0; guard < this.missions.length; guard++) {
      const m = this.available().find((x) => this.progress(x, r).every(Boolean));
      if (!m) break;
      this.s.completed[m.id] = { at: now, flightT };
      this.s.story.push({ id: m.story.id, at: now });
      done.push(m);
    }
    if (done.length) { this.save(); for (const m of done) bus.emit('campaign:complete', { id: m.id }); }
    return done;
  }

  /** The Story log: prologue, then each completed mission's entry in the order earned */
  story(): { entry: StoryEntry; at: number | null; mission: Mission | null }[] {
    const out: { entry: StoryEntry; at: number | null; mission: Mission | null }[] = [{ entry: PROLOGUE, at: null, mission: null }];
    for (const e of this.s.story) {
      const m = MISSIONS.find((x) => x.story.id === e.id);
      if (m) out.push({ entry: m.story, at: e.at, mission: m });
    }
    return out;
  }

  /** For tests and the debug console */
  snapshot(): Readonly<CampaignSave> { return JSON.parse(JSON.stringify(this.s)); }
}

/** The one the game uses */
export const campaign = new MissionManager(localKV, eaCap());
