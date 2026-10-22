import { describe, it, expect } from 'vitest';
import { PRESETS } from '@/phases/assembly/model/presets';
import { PART, CATALOG } from '@/phases/assembly/model/catalog';
import { EARLY_ACCESS } from '@/core/earlyAccess';
import { MISSION, type FlightReport } from './campaign';
import { MissionManager, type KV } from './missionManager';

const mem = (): KV => { const d = new Map<string, string>(); return { get: (k) => d.get(k) ?? null, set: (k, v) => void d.set(k, v) }; };
const report = (o: Partial<FlightReport>): FlightReport => ({ partIds: ['envelope-m'], maxTier: 0, range: 'phangan', apogeeM: 0, karman: false, orbit: null, zombieAboard: false, eva: false, airspace: [], ...o });
const ea = () => new MissionManager(mem(), EARLY_ACCESS);
/** Play the Early Access campaign through with flight reports that meet each mission */
const playThrough = (m: MissionManager) => {
  m.evaluate(report({ island: 'phangan', apogeeM: 750, ended: true }));
  m.evaluate(report({ partIds: ['bang-fai'], maxTier: 1, range: 'yasothon', apogeeM: 5200 }));
  return m.evaluate(report({ partIds: ['engine-lv45'], maxTier: 2, range: 'yasothon', apogeeM: 104_000, karman: true }));
};

describe('Early Access build (Tier 0–2, campaign ends at Mission 2.5)', () => {
  it('offers Missions 1, 2 and 2.5; Mission 3 is held back as "coming soon"', () => {
    const m = ea();
    expect(m.missions.map((x) => x.label)).toEqual(['1', '2', '2.5']);
    expect(m.upcoming.map((x) => x.label)).toEqual(['3']);
  });

  it('completing Mission 2.5 ends Early Access: campaign complete, no Tier 3 unlocked, nothing else to do', () => {
    const m = ea();
    const done = playThrough(m);
    expect(done.map((x) => x.id)).toEqual(['m2b-karman']);
    expect(m.earlyAccessDone).toBe(true);
    expect(m.complete).toBe(true);
    expect(m.unlockedTier()).toBe(2);
    expect(m.current()).toBe(null);
    // an orbital flight cannot complete the held-back mission
    expect(m.evaluate(report({ partIds: ['engine-vac'], maxTier: 3, orbit: { stable: true, peM: 200_000 }, zombieAboard: true, eva: true }))).toEqual([]);
    expect(m.isDone('m3-orbit')).toBe(false);
  });

  it('Tier 3+ parts say "Coming Soon in the Space Age Update" in every mode — Sandbox included', () => {
    const m = ea();
    m.setMode('sandbox');
    expect(m.unlockedTier()).toBe(2);
    for (const d of CATALOG) {
      expect(m.comingSoon(d.id)).toBe(d.tier > 2);
      if (d.tier > 2) { expect(m.lockReason(d.id)).toBe(EARLY_ACCESS.label); expect(m.unlockedBy(d.id)).toBe(null); }
      else expect(m.partUnlocked(d.id)).toBe(true);
    }
  });

  it('the campaign stays playable: each mission’s required parts are Tier 0–2, and the blueprints cover every era', () => {
    for (const id of ['m1-lantern', 'm2-ballistics', 'm2b-karman'] as const) {
      for (const o of MISSION[id].objectives) if (o.check.kind === 'uses-any') expect(o.check.parts.some((p) => PART[p].tier <= 2)).toBe(true);
    }
    const tier = (id: string) => Math.max(...PRESETS.find((p) => p.id === id)!.build().map((q) => PART[q.defId].tier));
    const playable = PRESETS.filter((p) => tier(p.id) <= 2).map((p) => p.id);
    expect(playable).toContain('khom-loi');
    expect(playable).toContain('bang-fai-twin');
    expect(playable.some((id) => PRESETS.find((p) => p.id === id)!.build().some((q) => ['engine-lv45', 'engine-pf', 'engine-tp'].includes(q.defId)))).toBe(true);
  });

  it('the full game is untouched without the cap', () => {
    const m = new MissionManager(mem());
    expect(m.missions.length).toBe(4);
    m.setMode('sandbox');
    expect(m.unlockedTier()).toBe(4);
    expect(m.comingSoon('engine-vac')).toBe(false);
  });
});
