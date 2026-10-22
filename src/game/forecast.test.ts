import { describe, it, expect } from 'vitest';
import { Flight, SITES } from '@/physics/flight2d';
import { PRESETS } from '@/phases/assembly/model/presets';
import { LANTERN_SITES } from '@/law/samui';
import { MISSION } from '@/campaign/campaign';
import { forecastFlight, forecastAsync, factsFromFlight } from './flightFacts';
import { buildDebrief, describeForecast, compareWith, digestOf, alternativesFor } from './debrief';
import { earnedBy, BADGES } from './achievements';

const preset = (id: string) => PRESETS.find((p) => p.id === id)!.build();
const twin = preset('bang-fai-twin');
const site = (wind: number, railAngleDeg = 0) => ({ rail: 22, railAngleDeg, wind });

describe('forecast = the real simulation', () => {
  it('a rocket forecast matches the flight it forecasts, number for number', () => {
    const fc = forecastFlight({ parts: twin, site: site(2, 10) });
    const f = new Flight(twin, { site: site(2, 10) });
    f.ignite(); while (!f.done && f.t < 2700) f.step();
    expect(fc.apogeeM).toBe(f.maxAlt);
    expect(fc.endS).toBeCloseTo(f.t, 6);
    expect(fc.outcome).toBe(f.outcome);
  });

  it('the Mission 2 hint is true: the calm, vertical setting makes 5 km; a breeze or a lean does not', () => {
    const setup = MISSION['m2-ballistics'].setup!;
    expect(forecastFlight({ parts: twin, site: site(setup.wind!, setup.railAngleDeg!) }).apogeeM).toBeGreaterThan(5000);
    expect(forecastFlight({ parts: twin, site: site(2, 0) }).apogeeM).toBeLessThan(5000);
    expect(forecastFlight({ parts: twin, site: site(0, 10) }).apogeeM).toBeLessThan(5000);
  });

  it('a lantern forecast knows Haad Rin is under the approach path and Thong Sala is clear', () => {
    const lantern = preset('khom-loi');
    const run = (id: string) => { const s = LANTERN_SITES.find((x) => x.id === id)!; return forecastFlight({ parts: lantern, site: { ...SITES.ground, rail: 0, railAngleDeg: 0, wind: 4 }, lantern: { site: s, windFrom: s.windFrom, permitted: false } }); };
    const haad = run('haad-rin'), thong = run('thong-sala');
    expect(haad.alerts).toContain('app-17');
    expect(thong.alerts).toEqual([]);
    expect(describeForecast(haad, null).tone).toBe('bad');
    expect(describeForecast(thong, null).tone).toBe('good');
  });

  it('the async forecast gives the same answer in slices, and can be cancelled', async () => {
    const sync = forecastFlight({ parts: twin, site: site(0, 0) });
    const asy = await forecastAsync({ parts: twin, site: site(0, 0) });
    expect(asy!.apogeeM).toBe(sync.apogeeM);
    expect(await forecastAsync({ parts: twin, site: site(0, 0) }, undefined, () => true)).toBe(null);
  });
});

describe('powder quality from the Mixing bench', () => {
  it('a perfect batch changes nothing; a lumpy one costs impulse smoothly and is in the forecast and the debrief', () => {
    const at = (q?: number) => forecastFlight({ parts: twin, site: site(0, 0), quality: q });
    expect(at(1).apogeeM).toBe(at(undefined).apogeeM);
    const a65 = at(0.65).apogeeM, a38 = at(0.38).apogeeM;
    expect(at(1).apogeeM).toBeGreaterThan(a65); expect(a65).toBeGreaterThan(a38);   // monotonic, no cliff
    expect(a65).toBeGreaterThan(5000); expect(a38).toBeLessThan(5000);                // ~55 % is the line for 5 km
    expect(at(0.38).stayedUpright).toBe(true);                                         // it never tips over: only less push
    const d = buildDebrief(at(0.38), { goalM: 5000 });
    expect(d.causes.some((c) => /powder batch was 38% even/.test(c.en))).toBe(true);
  });
  it('lanterns are not affected (no solid motor)', () => {
    const lantern = preset('khom-loi'), s0 = { ...SITES.ground, rail: 0, railAngleDeg: 0, wind: 0 };
    expect(forecastFlight({ parts: lantern, site: s0, quality: 0.1 }).apogeeM).toBe(forecastFlight({ parts: lantern, site: s0 }).apogeeM);
  });
});

describe('debrief', () => {
  const failed = () => forecastFlight({ parts: twin, site: site(2, 0) });

  it('explains a pitch-over from the simulation’s own numbers, and offers settings the simulation backs up', () => {
    const f = failed();
    const alts = alternativesFor({ parts: twin, site: site(2, 0) }, f);
    expect(alts[0].apogeeM).toBeGreaterThan(5000);                              // wind 0 + ramp 0°
    const d = buildDebrief(f, { goalM: 5000, alternatives: alts });
    expect(d.headline.tone).toBe('warn');
    expect(d.headline.en).toMatch(/short|pitched|tumbled/);
    expect(d.causes.some((c) => /crosswind/.test(c.en))).toBe(true);
    expect(d.next.some((n) => /Simulated alternative/.test(n.en))).toBe(true);
    for (const l of [d.headline, ...d.causes, ...d.next]) { expect(l.en.length).toBeGreaterThan(5); expect(l.th.length).toBeGreaterThan(5); }   // every line is bilingual
  });

  it('a success says what worked, not what failed', () => {
    const f = forecastFlight({ parts: twin, site: site(0, 0) });
    const d = buildDebrief(f, { goalM: 5000 });
    expect(d.headline.tone).toBe('good');
    expect(d.causes.some((c) => c.tone === 'good')).toBe(true);
    expect(d.next).toEqual([]);
  });

  it('compares with the previous flight and says when nothing changed', () => {
    const a = failed(), b = forecastFlight({ parts: twin, site: site(0, 0) });
    const prev = digestOf(a, 'k');
    const cmp = compareWith(b, prev).map((l) => l.en).join(' ');
    expect(cmp).toMatch(/wind 2\.0 → 0\.0 m\/s/);
    expect(compareWith(a, prev).map((l) => l.en).join(' ')).toMatch(/Same settings/);
  });

  it('a lantern debrief names the cause of an alert', () => {
    const haad = LANTERN_SITES[0];
    const f = forecastFlight({ parts: preset('khom-loi'), site: { ...SITES.ground, rail: 0, railAngleDeg: 0, wind: 4 }, lantern: { site: haad, windFrom: haad.windFrom, permitted: false } });
    const d = buildDebrief(f);
    expect(d.headline.tone).toBe('bad');
    expect(d.causes.some((c) => /Haad Rin lies right under/.test(c.en))).toBe(true);
  });
});

describe('discoveries', () => {
  it('are earned from facts, every badge is bilingual, and the same-settings badge needs a repeat', () => {
    for (const b of BADGES) { expect(b.title && b.titleTh && b.text && b.textTh).toBeTruthy(); }
    const calm = forecastFlight({ parts: twin, site: site(0, 0) });
    expect(earnedBy({ facts: calm, prev: null, repeated: false })).toEqual(expect.arrayContaining(['first-flight', 'dawn-launch', 'five-km']));
    expect(earnedBy({ facts: calm, prev: null, repeated: false })).not.toContain('same-same');
    expect(earnedBy({ facts: calm, prev: digestOf(calm, 'k'), repeated: true })).toContain('same-same');
    const flip = forecastFlight({ parts: twin, site: site(2, 0) });
    expect(earnedBy({ facts: flip, prev: digestOf(flip, 'k'), repeated: false })).not.toContain('five-km');
  });

  it('the facts of a flight can be rebuilt from a finished Flight', () => {
    const f = new Flight(twin, { site: site(0, 0) }); f.ignite(); while (!f.done && f.t < 2700) f.step();
    const facts = factsFromFlight(f, { parts: twin, site: site(0, 0) });
    expect(facts.kind).toBe('rocket'); expect(facts.railExitMs).toBeGreaterThan(5); expect(facts.stayedUpright).toBe(true);
  });
});
