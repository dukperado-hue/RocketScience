import { describe, it, expect } from 'vitest';
import { Rng } from '@/core/rng';
import { TIER1_PARTS } from '@/data/schema';
import { MATERIALS } from '@/data/materials';
import { createPartState, checkIntegrity, shellMass, hoopStress, consume, currentMass } from './structure';
import { createCluster, stepCluster, wanHuMounts } from './cluster';
import { simulateWanHu, staticMargin, headingError, BangFaiSim, type BangFaiOptions } from './tier1';
import { flameColour, matchScore, EMITTERS, wavelengthToRgb } from '@/chemistry/flameLab';
import { scoreMill } from '@/chemistry/powderMill';
import { SpaceLawEngine } from '@/law/SpaceLawEngine';
import { offsetGeo, insideZone, THAI_ZONES } from '@/law/zones';

describe('materials & structure', () => {
  it('hoop stress formula: σ = P r / t', () => {
    expect(hoopStress(2, 0.1, 0.005)).toBeCloseTo(20, 6);
  });

  it('bamboo Bang Fai casing tends to split; steel holds — but steel is heavier', () => {
    const median = { flaw: 1, temperatureC: 30 };
    const env = { humidity: 0.7 };
    const bamboo = { ...createPartState(TIER1_PARTS['bang-fai-bamboo'], new Rng(1)), ...median, burning: true };
    const steel = { ...createPartState(TIER1_PARTS['bang-fai-steel'], new Rng(1)), ...median, burning: true };
    const rb = checkIntegrity(bamboo, { axialN: 1500, momentNm: 0 }, env);
    const rs = checkIntegrity(steel, { axialN: 1500, momentNm: 0 }, env);
    expect(rb.limitingMode).toBe('hoop');
    expect(rb.safetyFactor).toBeLessThan(1);
    expect(rs.safetyFactor).toBeGreaterThan(3);
    expect(shellMass(TIER1_PARTS['bang-fai-steel'])).toBeGreaterThan(3 * shellMass(TIER1_PARTS['bang-fai-bamboo']));
  });

  it('natural materials scatter far more than alloys', () => {
    const spread = (id: string) => {
      const rng = new Rng(7);
      const xs = Array.from({ length: 500 }, () => rng.weibull(MATERIALS[id].weibullModulus));
      return Math.max(...xs) / Math.min(...xs);
    };
    expect(spread('bamboo')).toBeGreaterThan(3 * spread('steel'));
  });

  it('mass drops as propellant burns (ṁ = F / Isp·g₀)', () => {
    const s = createPartState(TIER1_PARTS['bang-fai-steel'], new Rng(1));
    const m0 = currentMass(s);
    const used = consume(s, 1500, 80, 1);
    expect(used).toBeCloseTo(1500 / (80 * 9.80665), 6);
    expect(currentMass(s)).toBeCloseTo(m0 - used, 6);
  });
});

describe('Wan Hu cluster', () => {
  it('has exactly 47 mounts', () => {
    expect(wanHuMounts()).toHaveLength(47);
  });

  it('is deterministic for a given seed', () => {
    const a = simulateWanHu({ seed: 42 });
    const b = simulateWanHu({ seed: 42 });
    expect(a.outcome).toBe(b.outcome);
    expect(a.maxAltitude).toBe(b.maxAltitude);
  });

  it('staggered hand ignition wastes thrust compared with a fuse', () => {
    const avg = (ign: 'servants' | 'fuse') => {
      let lost = 0;
      for (let s = 1; s <= 30; s++) { const r = simulateWanHu({ seed: s, ignition: ign }); lost += 1 - r.peakThrust / r.idealThrust; }
      return lost / 30;
    };
    expect(avg('servants')).toBeGreaterThan(avg('fuse'));
  });

  it('centre of thrust wanders off the centreline', () => {
    const rng = new Rng(3);
    const cfg = { part: TIER1_PARTS['gunpowder-rocket'], mounts: wanHuMounts(), ignition: { mode: 'manual' as const, meanDelay: 0.8, sd: 0.5 }, propellantQuality: 0.3, chainReaction: 0.3 };
    const engines = createCluster(cfg, rng);
    let maxOffset = 0;
    for (let t = 0; t < 4; t += 1 / 60) {
      const out = stepCluster(engines, t, 1 / 60, cfg, rng);
      if (out.cot) maxOffset = Math.max(maxOffset, Math.abs(out.cot.x));
    }
    expect(maxOffset).toBeGreaterThan(0.02);
  });

  it('is destined to fail (mostly)', () => {
    let survived = 0;
    for (let s = 1; s <= 100; s++) if (simulateWanHu({ seed: s }).outcome === 'survived') survived++;
    expect(survived).toBeLessThan(15);
  });
});

describe('Bang Fai & Talai stability', () => {
  it('the tail stick turns an unstable motor into a stable rocket', () => {
    const motor = { part: TIER1_PARTS['bang-fai-steel'], top: 0 };
    const without = staticMargin([motor]);
    const withTail = staticMargin([motor, { part: TIER1_PARTS['tail-stick'], top: 2.0 }]);
    expect(withTail.calibers).toBeGreaterThan(without.calibers);
    expect(withTail.verdict).not.toBe('unstable');
  });

  const fly = (o: Partial<BangFaiOptions>) => {
    const s = new BangFaiSim({ seed: 1, casing: 'steel', tailLengthM: 2.5, elevationDeg: 85, azimuthDeg: 45, wind: { speed: 0, fromDeg: 0 }, ...o });
    while (!s.done) s.step();
    return s;
  };

  it('no tail → cartwheels low; with a tail → flies kilometres', () => {
    const bad = fly({ tailLengthM: 0 });
    const good = fly({});
    expect(bad.outcome).toBe('cartwheeled');
    expect(good.outcome).toBe('flew');
    expect(good.maxAlt).toBeGreaterThan(10 * bad.maxAlt);
  });

  it('a stable rocket weathercocks INTO the wind', () => {
    const calm = fly({ azimuthDeg: 0, elevationDeg: 88 });
    const westerly = fly({ azimuthDeg: 0, elevationDeg: 88, wind: { speed: 6, fromDeg: 270 } });
    expect(westerly.state.e).toBeLessThan(calm.state.e - 100); // drifts west, toward the wind
  });

  it('steel casings hold; bamboo sometimes splits', () => {
    let steel = 0, bamboo = 0;
    for (let s = 1; s <= 30; s++) {
      if (fly({ seed: s }).outcome === 'casing-split') steel++;
      if (fly({ seed: s, casing: 'bamboo' }).outcome === 'casing-split') bamboo++;
    }
    expect(steel).toBe(0);
    expect(bamboo).toBeGreaterThan(3);
    expect(bamboo).toBeLessThan(27);
  });

  it('spin bounds the heading error from thrust misalignment', () => {
    const noSpin = headingError(0.5, 0.01, 0, 2);
    const spin = headingError(0.5, 0.01, 60, 2);
    expect(spin).toBeLessThan(noSpin / 100);
  });
});

describe('chemistry', () => {
  it('strontium reads red, barium green, copper blue', () => {
    const hue = (id: string) => {
      const [r, g, b] = flameColour({ amounts: { [id]: 2 }, contamination: 0 });
      return r > g && r > b ? 'red' : g > r && g > b ? 'green' : 'blue';
    };
    expect(hue('Sr')).toBe('red');
    expect(hue('Ba')).toBe('green');
    expect(hue('Cu')).toBe('blue');
  });

  it('a trace of sodium ruins a blue flame', () => {
    const blue = flameColour({ amounts: { Cu: 2 }, contamination: 0 });
    const dirty = flameColour({ amounts: { Cu: 2 }, contamination: 0.5 });
    expect(matchScore(dirty, blue)).toBeLessThan(50);
    expect(EMITTERS.Na.brightness).toBeGreaterThan(5);
  });

  it('a washed-out mix does not count as a match for a saturated order', () => {
    const red = flameColour({ amounts: { Sr: 2 }, contamination: 0 });
    const muddy = flameColour({ amounts: { Sr: 3, Cu: 3 }, contamination: 0.18 });
    expect(matchScore(red, red)).toBe(100);
    expect(matchScore(muddy, red)).toBeLessThan(60);
  });

  it('wavelength conversion: 650 nm is red', () => {
    const [r, g, b] = wavelengthToRgb(650);
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });

  it('powder mill rewards a steady rhythm', () => {
    const steady = Array.from({ length: 45 }, (_, i) => i * 500);
    const rng = new Rng(5);
    const sloppy = Array.from({ length: 45 }, (_, i) => i * 500 + rng.range(-200, 200));
    const a = scoreMill({ taps: steady, targetIntervalMs: 500, humidity: 0.5, dryingTime: 30 });
    const b = scoreMill({ taps: sloppy, targetIntervalMs: 500, humidity: 0.5, dryingTime: 30 });
    expect(a.quality).toBeGreaterThan(b.quality);
    expect(a.quality).toBeGreaterThan(0.85);
  });
});

describe('space law engine', () => {
  const yasothon = { lat: 15.792, lon: 104.145 };

  it('flags a launch next to an airport and an airspace incursion', () => {
    const nearUbon = { lat: 15.30, lon: 104.87 };
    const law = new SpaceLawEngine({ launchSite: nearUbon, launchCountry: 'TH', permits: new Set() });
    law.evaluate({ t: 0, pos: nearUbon, altM: 0 });
    law.evaluate({ t: 5, pos: nearUbon, altM: 800 });
    const ids = law.log.map((e) => e.ruleId);
    expect(ids).toContain('th-no-launch-notice');
    expect(ids).toContain('th-launch-near-airport');
    expect(ids).toContain('th-airspace-incursion');
    expect(law.summary().aborted).toBe(true);
  });

  it('a permitted festival launch is clean; the permit ceiling still applies', () => {
    const law = new SpaceLawEngine({ launchSite: yasothon, launchCountry: 'TH', permits: new Set(['festival-permit']), permitCeilingM: 5000 });
    law.evaluate({ t: 0, pos: yasothon, altM: 0 });
    law.evaluate({ t: 20, pos: offsetGeo(yasothon, 2000, 6000), altM: 4000 });
    expect(law.log).toHaveLength(0);
    law.evaluate({ t: 30, pos: offsetGeo(yasothon, 3000, 9000), altM: 5200 });
    expect(law.log.map((e) => e.ruleId)).toEqual(['th-permit-ceiling']);
  });

  it('approach corridor is a rectangle along the runway heading', () => {
    const app = THAI_ZONES.find((z) => z.id === 'vtuu-app')!;
    const along = offsetGeo(app.centre, 12_000 * Math.sin(50 * Math.PI / 180), 12_000 * Math.cos(50 * Math.PI / 180));
    const beside = offsetGeo(app.centre, 12_000 * Math.sin(140 * Math.PI / 180), 12_000 * Math.cos(140 * Math.PI / 180));
    expect(insideZone(along, 500, app)).toBe(true);
    expect(insideZone(beside, 500, app)).toBe(false);
    expect(insideZone(along, 5_000, app)).toBe(false); // above the ceiling
  });

  it('Kármán line fires once; collisions carry fault liability', () => {
    const law = new SpaceLawEngine({ launchSite: yasothon, launchCountry: 'TH', permits: new Set(['launch-licence']) });
    law.evaluate({ t: 100, pos: yasothon, altM: 101_000 });
    law.evaluate({ t: 101, pos: yasothon, altM: 105_000 });
    expect(law.log.filter((e) => e.ruleId === 'ost-karman')).toHaveLength(1);
    const [ev] = law.evaluate({ t: 900, pos: yasothon, altM: 550_000, inOrbit: true, collision: { objectId: 'SAT-1234', ownerCountry: 'JP' } })
      .filter((e) => e.ruleId === 'liab-collision');
    expect(ev.consequence.liability).toBe('fault');
  });
});
