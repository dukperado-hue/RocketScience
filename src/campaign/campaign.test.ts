import { describe, it, expect } from 'vitest';
import { Flight, SITES } from '@/physics/flight2d';
import { PRESETS } from '@/phases/assembly/model/presets';
import { PART } from '@/phases/assembly/model/catalog';
import { AscentAssist, PROFILE_TIER3, PROFILE_TIER4 } from '@/orbit/ascent';
import { LANTERN_SITES } from '@/law/samui';
import { AirspaceMonitor } from '@/law/airspaceMonitor';
import { MISSIONS, MISSION, PROLOGUE, partsOfTier, type FlightReport } from './campaign';
import { MissionManager, SAVE_KEY, type KV } from './missionManager';
import { flightReport } from './report';

const mem = (): KV & { data: Map<string, string> } => { const data = new Map<string, string>(); return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v) }; };
const preset = (id: string) => PRESETS.find((p) => p.id === id)!.build();
const ids = (parts: { defId: string }[]) => parts.map((p) => p.defId);
const report = (o: Partial<FlightReport>): FlightReport => ({ partIds: ['envelope-m'], maxTier: 0, range: 'phangan', apogeeM: 0, karman: false, orbit: null, zombieAboard: false, eva: false, airspace: [], ...o });

describe('campaign data', () => {
  it('four missions in a chain, each unlocking the next tier, with English + Thai text everywhere', () => {
    expect(MISSIONS.map((m) => m.label)).toEqual(['1', '2', '2.5', '3']);
    expect(MISSIONS.map((m) => m.rewards.tier)).toEqual([1, 2, 3, 4]);
    for (let i = 1; i < MISSIONS.length; i++) expect(MISSIONS[i].requires).toEqual([MISSIONS[i - 1].id]);
    for (const m of [...MISSIONS.map((x) => x.story), PROLOGUE]) { expect(m.text.length).toBeGreaterThan(80); expect(m.textTh.length).toBeGreaterThan(80); expect(m.titleTh).toBeTruthy(); }
    for (const m of MISSIONS) for (const o of m.objectives) expect(o.textTh).toBeTruthy();
    expect(new Set(MISSIONS.map((m) => m.story.crew)).size).toBe(4);           // four different crew voices
  });

  it('rewards come straight from the catalogue tiers; every part belongs to exactly one tier', () => {
    expect(MISSION['m3-orbit'].rewards.parts).toContain('engine-modern');
    expect(MISSION['m2b-karman'].rewards.parts).toContain('engine-vac');
    expect(MISSION['m2-ballistics'].rewards.parts).toContain('engine-lv45');
    expect(MISSION['m1-lantern'].rewards.parts).toContain('bang-fai');
    const all = [0, 1, 2, 3, 4].flatMap((t) => partsOfTier(t as 0));
    expect(all.length).toBe(Object.keys(PART).length);
  });
});

describe('MissionManager', () => {
  it('a new campaign: Tier 0 and Koh Phangan only; sandbox unlocks everything and records nothing', () => {
    const m = new MissionManager(mem());
    expect(m.mode).toBe('campaign');
    expect(m.unlockedTier()).toBe(0);
    expect(m.partUnlocked('envelope-m')).toBe(true);
    expect(m.partUnlocked('bang-fai')).toBe(false);
    expect(m.lockReason('engine-lv45')).toBe('Mission 2 · Viral Ballistics');
    expect(m.rangeUnlocked('phangan')).toBe(true); expect(m.rangeUnlocked('yasothon')).toBe(false);
    m.setMode('sandbox');
    expect(m.partUnlocked('engine-modern')).toBe(true); expect(m.rangeUnlocked('yasothon')).toBe(true);
    expect(m.evaluate(report({ island: 'phangan', apogeeM: 750, ended: true }))).toEqual([]);
    expect(m.isDone('m1-lantern')).toBe(false);
  });

  it('completing Mission 1 unlocks Tier 1 + Yasothon and writes the Tortoise Clerk entry; one flight cannot skip ahead', () => {
    const m = new MissionManager(mem());
    const clean = { island: 'phangan' as const, apogeeM: 750, ended: true };
    expect(m.evaluate(report({ ...clean, airspace: ['app-17', 'fine'] }))).toEqual([]);         // under the RWY 17 approach: not clear
    expect(m.evaluate(report({ ...clean, airspace: ['ctr'] }))).toEqual([]);                    // inside the control zone: not clear
    expect(m.evaluate(report({ ...clean, island: 'samui' }))).toEqual([]);                      // wrong island
    expect(m.evaluate(report({ ...clean, ended: false }))).toEqual([]);                         // the flight is not over yet
    expect(m.evaluate(report({ ...clean, apogeeM: 120 }))).toEqual([]);                         // it never rose
    expect(m.evaluate(report({ ...clean, partIds: ['envelope-m', 'bang-fai'], maxTier: 1 }))).toEqual([]);
    const done = m.evaluate(report({ ...clean }), 900, 1234);
    expect(done.map((x) => x.id)).toEqual(['m1-lantern']);
    expect(m.unlockedTier()).toBe(1); expect(m.rangeUnlocked('yasothon')).toBe(true);
    expect(m.story().map((s) => s.entry.crew)).toEqual(['lee', 'tortoise']);
    expect(m.evaluate(report({ ...clean }))).toEqual([]);                                       // no double completion
    expect(m.current()!.id).toBe('m2-ballistics');
  });

  it('progress survives a reload; a corrupt or foreign save starts fresh; reset keeps the mode', () => {
    const kv = mem();
    const a = new MissionManager(kv);
    a.evaluate(report({ island: 'phangan', apogeeM: 750, ended: true }));
    a.setMode('sandbox');
    const b = new MissionManager(kv);
    expect(b.isDone('m1-lantern')).toBe(true); expect(b.mode).toBe('sandbox');
    kv.set(SAVE_KEY, '{nope'); expect(new MissionManager(kv).isDone('m1-lantern')).toBe(false);
    kv.set(SAVE_KEY, JSON.stringify({ v: 9 })); expect(new MissionManager(kv).unlockedTier()).toBe(0);
    kv.set(SAVE_KEY, JSON.stringify({ v: 1, mode: 'campaign', completed: { 'm1-lantern': { at: 1, flightT: 1 }, bogus: { at: 1 } }, story: [{ id: 'm1', at: 1 }] }));
    const c = new MissionManager(kv);
    expect(c.isDone('m1-lantern')).toBe(true); expect(Object.keys(c.snapshot().completed)).toEqual(['m1-lantern']);
    c.setMode('sandbox'); c.reset();
    expect(c.isDone('m1-lantern')).toBe(false); expect(c.mode).toBe('sandbox');
  });

  it('lockedIn lists the parts a build cannot use yet', () => {
    const m = new MissionManager(mem());
    expect(m.lockedIn(ids(preset('khom-loi')))).toEqual([]);
    expect(m.lockedIn(ids(preset('bang-fai-twin'))).sort()).toEqual(['bang-fai', 'nose-s', 'tail-stick']);
  });
});

/** Fly each mission the way a player would, with only what the campaign has unlocked by then */
describe('the campaign is flyable, in order, with what each mission unlocks', () => {
  const m = new MissionManager(mem());
  const usable = (parts: { defId: string }[]) => expect(m.lockedIn(ids(parts))).toEqual([]);

  it('Mission 1: a khom loi from Thong Sala on a NE wind floats out to sea, clear of Samui, and completes — from Haad Rin it is under the RWY 17 approach and does not', () => {
    const parts = preset('khom-loi'); usable(parts);
    const fly = (siteId: string) => {
      const site = LANTERN_SITES.find((s) => s.id === siteId)!;
      const f = new Flight(parts, { site: { ...SITES.ground, rail: 0, railAngleDeg: 0, wind: 4 } });
      const mon = new AirspaceMonitor(site, site.windFrom, false);
      f.ignite();
      while (!f.done && f.t < 3000) { f.step(); if (Math.round(f.t * 100) % 50 === 0) mon.update(f.t, f.vehicle.downrange, f.vehicle.alt, f.airborne); }
      return flightReport(f, ids(parts), { range: 'phangan', lanternSite: site.id, island: site.island, airspace: mon.alerts.map((a) => a.id), ended: true });
    };
    const bad = fly('haad-rin');
    expect(bad.airspace).toContain('app-17');
    expect(m.evaluate(bad)).toEqual([]);
    const good = fly('thong-sala');
    expect(good.airspace).toEqual([]);
    expect(good.apogeeM).toBeGreaterThan(300);
    expect(m.evaluate(good).map((x) => x.id)).toEqual(['m1-lantern']);
    expect(m.rangeUnlocked('yasothon')).toBe(true);
  });

  it('Mission 2: the twin-tail Bang Fai makes 5 km at Yasothon on a calm morning with a vertical ramp — and not in a breeze', () => {
    const parts = preset('bang-fai-twin'); usable(parts);
    const setup = MISSION['m2-ballistics'].setup!;                               // what the hint (and the one-tap button) set up
    const fly = (wind: number, angle: number) => { const f = new Flight(parts, { site: { rail: 22, railAngleDeg: angle, wind } }); f.ignite(); while (!f.done && f.t < 600) f.step(); return f; };
    expect(fly(2, 0).maxAlt).toBeLessThan(5000);                                // weathercocking: the lesson of the mission
    expect(fly(0, 10).maxAlt).toBeLessThan(5000);                               // a leaning ramp does not do it either
    const f = fly(setup.wind!, setup.railAngleDeg!);
    expect(f.maxAlt).toBeGreaterThan(5000);
    expect(m.evaluate(flightReport(f, ids(parts), { range: 'yasothon', airspace: [] })).map((x) => x.id)).toEqual(['m2-ballistics']);
  });

  it('Mission 2.5: the Tier-2 sounding rocket crosses the Kármán line with SAS holding vertical', () => {
    const parts = preset('sounding'); usable(parts);
    expect(Math.max(...parts.map((p) => PART[p.defId].tier))).toBe(2);
    const f = new Flight(parts, { site: { ...SITES.pad } });
    f.controls.sas = true; f.controls.target = 0; f.ignite();
    while (!f.done && f.t < 900 && !f.reachedSpace) f.step();
    expect(f.reachedSpace).toBe(true);
    expect(m.evaluate(flightReport(f, ids(parts), { range: 'yasothon', airspace: [] })).map((x) => x.id)).toEqual(['m2b-karman']);
  });

  it('Mission 3: the Tier-3 Hijacker reaches a stable orbit on the coast-to-Ap autopilot, the zombie steps out, campaign complete', () => {
    const parts = preset('naga-hijacker'); usable(parts);
    expect(Math.max(...parts.map((p) => PART[p.defId].tier))).toBe(3);
    const f = new Flight(parts, { site: { ...SITES.pad } });
    const a = new AscentAssist(PROFILE_TIER3); a.mode = 'auto';
    f.ignite();
    while (!f.done && f.t < 2500 && a.phase !== 'cutoff') { a.update(f); f.step(); }
    expect(f.reachedOrbit).toBe(true);
    expect(f.events.some((e) => e.kind === 'zombie-sat')).toBe(true);
    const before = flightReport(f, ids(parts), { range: 'yasothon', airspace: [] });
    expect(m.evaluate(before)).toEqual([]);                                     // orbit + zombie, but no spacewalk yet
    for (let i = 0; i < 200; i++) f.step();                                     // engines settle to zero thrust
    expect(f.evaBlockedBy).toBe(null);
    expect(f.startEva()).toBe(true);
    for (let i = 0; i < 100; i++) f.step();
    const done = m.evaluate(flightReport(f, ids(parts), { range: 'yasothon', airspace: [] }));
    expect(done.map((x) => x.id)).toEqual(['m3-orbit']);
    expect(m.complete).toBe(true);
    expect(m.unlockedTier()).toBe(4);
    expect(m.story().map((s) => s.entry.crew)).toEqual(['lee', 'tortoise', 'otter', 'owl', 'capybara']);
  });

  it('the Tier-4 profile is untouched (no coast phase), so Gate B behaviour is unchanged', () => {
    expect(PROFILE_TIER4.coastToAp).toBeFalsy();
  });
});
