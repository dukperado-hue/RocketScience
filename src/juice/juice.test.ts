import { describe, it, expect } from 'vitest';
import { ImpactDirector, hitstopMs, intensityOf, impactSoon, type Impact } from './impactDirector';
import { ProceduralAudio } from './proceduralAudio';

const hit = (o: Partial<Impact> = {}): Impact => ({ kind: 'ground', x: 0, y: 0, vx: 30, vy: -60, energy: 5e6, size: 2, hero: true, ...o });

describe('ImpactDirector — time', () => {
  it('hit-stop runs 60–120 ms, longer for bigger energy', () => {
    expect(hitstopMs(1e3)).toBeCloseTo(60, 6);
    expect(hitstopMs(1e9)).toBeCloseTo(120, 6);
    expect(hitstopMs(1e6)).toBeGreaterThan(hitstopMs(1e4));
    expect(intensityOf(1e12)).toBe(1); expect(intensityOf(10)).toBe(0);
  });

  it('a hero crash: frozen (0), then 0.25× slow motion for ~0.6 s, then eased back to 1×', () => {
    const d = new ImpactDirector(), t0 = 1000;
    d.impact(hit(), t0);
    const stop = hitstopMs(5e6);
    expect(d.timeScale(t0 + 1)).toBe(0);
    expect(d.timeScale(t0 + stop - 1)).toBe(0);
    expect(d.timeScale(t0 + stop + 50)).toBeCloseTo(0.25, 6);
    expect(d.timeScale(t0 + stop + 550)).toBeGreaterThan(0.25);         // easing back
    expect(d.timeScale(t0 + stop + 700)).toBe(1);
  });

  it('tiny bumps, fireworks and limbs do not stop time', () => {
    const d = new ImpactDirector();
    d.impact(hit({ energy: 500 }), 0); expect(d.timeScale(1)).toBe(1);
    d.impact(hit({ kind: 'firework', energy: 1e7 }), 0); expect(d.timeScale(1)).toBe(1);
    d.impact(hit({ kind: 'limb', energy: 5e3 }), 0); expect(d.timeScale(1)).toBe(1);
  });

  it('auto-warp drop: falling toward the ground at 10× warp is "soon"; climbing high is not', () => {
    expect(impactSoon(300, -60, 10).soon).toBe(true);                    // ~4.6 s of sim → 0.46 s real
    expect(impactSoon(300, -60, 1).soon).toBe(false);                    // already real time
    expect(impactSoon(50_000, 1500, 10).soon).toBe(false);
    expect(impactSoon(300, -60, 10).vImpact).toBeGreaterThan(60);
  });
});

describe('ImpactDirector — camera and cues', () => {
  it('trauma rises with the hit and decays; the kick goes against the impact direction; zoom punches in', () => {
    const d = new ImpactDirector();
    d.impact(hit({ vx: 50, vy: 0 }), 0);                                   // moving right → camera kicks left
    expect(d.trauma).toBeGreaterThan(0.5);
    d.update(0.03);
    const c = d.camera();
    expect(c.zoom).toBeGreaterThan(1.05);
    // separate the kick from the shake: with trauma removed, only the spring remains
    d.trauma = 0;
    expect(d.camera().dx).toBeLessThan(0);
    for (let i = 0; i < 200; i++) d.update(0.016);
    const r = d.camera();
    expect(Math.abs(r.dx)).toBeLessThan(0.5); expect(r.zoom).toBeLessThan(1.01);
  });

  it('a falling hit kicks the camera DOWN the screen the other way: up', () => {
    const d = new ImpactDirector();
    d.impact(hit({ vx: 0, vy: -80 }), 0);
    d.update(0.03); d.trauma = 0;
    expect(d.camera().dy).toBeLessThan(0);                               // screen y is down; falling → kick up
  });

  it('cues: FX + audio per impact, the right sound for each kind, drained once', () => {
    const d = new ImpactDirector();
    d.impact(hit({ kind: 'explosion' }), 0);
    d.impact(hit({ kind: 'water', energy: 1e5 }), 0);
    d.impact(hit({ kind: 'ground', energy: 3e4 }), 0);
    d.impact(hit({ kind: 'limb', energy: 5e3 }), 0);
    const c = d.drain();
    expect(c.fx.length).toBe(4);
    expect(c.audio.map((a) => a.kind)).toEqual(['boom', 'splash', 'thud', 'crunch']);
    expect(d.drain().fx.length).toBe(0);
  });
});

describe('ProceduralAudio without WebAudio (tests, old browsers)', () => {
  it('every call is a silent no-op', () => {
    const a = new ProceduralAudio();
    let threw = false;
    try { a.unlock(); a.boom(1); a.thud(0.5); a.splash(0.3); a.pop(0.2); a.crunch(0.4); a.sizzle(0.8); a.rumble(1); a.quiet(); a.setMuted(true); } catch { threw = true; }
    expect(threw).toBe(false);
    expect(a.ready).toBe(false);
  });
});
