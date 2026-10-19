import { describe, it, expect } from 'vitest';
import { surfaceTrack, isSea, onIsland } from './surface';
import { zombify, Capcom, CREW } from '@/phases/launch/capcom';

const HAAD_RIN = { lat: 9.6775, lon: 100.0652 };
const THONG_SALA = { lat: 9.7126, lon: 99.9876 };
const YASOTHON = { lat: 15.79, lon: 104.15 };

describe('water vs land under the track', () => {
  it('the pad is always on land; Haad Rin → SSW (the M1 lantern drift) crosses the sea and reaches Samui', () => {
    const t = surfaceTrack(HAAD_RIN, 195);
    expect(isSea(t, 0)).toBe(false);
    expect(isSea(t, 3_000)).toBe(true);                     // the channel between the islands
    expect(isSea(t, 15_000)).toBe(false);                   // Ko Samui
    expect(isSea(t, 70_000)).toBe(true);
  });
  it('Thong Sala on the NE monsoon drifts straight out to sea', () => {
    const t = surfaceTrack(THONG_SALA, 225);
    expect(isSea(t, 2_000)).toBe(true);
  });
  it('a rocket from Haad Rin flying east is over the Gulf within a few km', () => {
    expect(isSea(surfaceTrack(HAAD_RIN, 90), 5_000)).toBe(true);
  });
  it('Yasothon is inland: land everywhere a Tier-1 rocket can reach, sea only far east', () => {
    const t = surfaceTrack(YASOTHON, 90);
    expect(t.inland).toBe(true);
    expect(isSea(t, 0)).toBe(false); expect(isSea(t, 50_000)).toBe(false);
    expect(isSea(t, 900_000)).toBe(true);
  });
  it('island polygons: the middle of Ko Samui is land, the channel is not', () => {
    expect(onIsland({ lat: 9.5, lon: 100.0 })).toBe(true);
    expect(onIsland({ lat: 9.62, lon: 100.05 })).toBe(false);
  });
});

describe('Zombie Control translator', () => {
  it('turns a sentence into grunts: deterministic, no digits, same word → same grunt', () => {
    const a = zombify('Altitude 5 km. The humans are getting angry.');
    expect(a).toBe(zombify('Altitude 5 km. The humans are getting angry.'));
    expect(/\d/.test(a)).toBe(false);
    expect(a.length).toBeGreaterThan(10);
    const w = zombify('humans humans');
    const [x, y] = w.replace(/…/g, '').split(' ');
    expect(x.toLowerCase()).toBe(y.toLowerCase());
  });
  it('with Zombie Control on, every crew line comes out as Zombie Control with the meaning as a translation', () => {
    const c = new Capcom();
    const said: { who: string; text: string; translation?: string }[] = [];
    c.onSay = (l) => said.push(l);
    c.zombieControl = true;
    c.say('lee', 'Mission control here. Vehicle on the pad.', 2);
    c.event({ t: 1, kind: 'liftoff', text: 'Liftoff.' } as any);
    const t0 = performance.now(); c.tick(t0 + 2500); c.tick(t0 + 5000);   // lines go stale after 6 s
    expect(said.map((l) => l.who)).toEqual(['zombie', 'zombie']);
    expect(said[0].translation).toBe('Mission control here. Vehicle on the pad.');
    expect(said[0].text).not.toContain('Mission');
    expect(said[1].translation).toMatch(/humans|moving/i);
    expect(CREW.zombie.name).toBe('Zombie Control');
  });
  it('with Zombie Control off, the crew speaks normally (no translation line)', () => {
    const c = new Capcom();
    let last: { who: string; translation?: string } | null = null;
    c.onSay = (l) => (last = l);
    c.say('owl', 'Max-Q.', 2); c.tick(performance.now() + 2500);
    expect(last!.who).toBe('owl'); expect(last!.translation).toBe(undefined);
  });
});
