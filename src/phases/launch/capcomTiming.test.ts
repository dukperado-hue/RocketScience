import { describe, it, expect } from 'vitest';
import { CAPCOM_STALE_S, Capcom, type Line } from './capcom';

function rig() {
  const c = new Capcom();
  let wall = 100_000;
  c.clock = () => wall;
  const said: { line: Line; wall: number; sim: number }[] = [];
  let sim = 0;
  c.onSay = (line) => said.push({ line, wall, sim });
  const advance = (dtWall: number, dtSim: number) => { wall += dtWall; sim += dtSim; c.setSim(sim); c.tick(wall, sim); };
  return { c, said, advance, wall: () => wall, sim: () => sim };
}

describe('CAPCOM keeps up with the flight', () => {
  it('a line raised by an event is spoken in the same frame when nobody else is talking', () => {
    const r = rig();
    r.c.say('lee', 'Lift-off.', 1);
    r.advance(16, 0.16);
    expect(r.said.map((s) => s.line.text)).toEqual(['Lift-off.']);
  });

  it('a line that has to wait is dropped once the flight has moved on by a second (even under 10x warp)', () => {
    const r = rig();
    r.c.say('lee', 'first', 1);
    r.advance(16, 0.16);                                    // "first" is spoken
    r.c.say('owl', 'second: tower clear', 1);               // wants to speak, but the pacing gap is closed
    for (let i = 0; i < 20; i++) r.advance(16, 0.16);       // 320 ms real = 3.2 s of flight at 10x
    expect(r.said.map((s) => s.line.text)).toEqual(['first']);
  });

  it('a waiting line IS spoken if it gets its turn within the second', () => {
    const r = rig();
    r.c.say('lee', 'first', 1);
    r.advance(16, 0.016);
    r.c.say('owl', 'second', 1);
    for (let i = 0; i < 70; i++) r.advance(16, 0.016);      // 1x warp: ~1.1 s of real time and flight
    expect(r.said.map((s) => s.line.text)).toContain('second');
    const second = r.said.find((s) => s.line.text === 'second')!;
    expect(second.sim - second.line.simAt!).toBeLessThanOrEqual(CAPCOM_STALE_S + 0.1);
  });

  it('urgent lines (alerts, failures, impact) skip the pacing gap', () => {
    const r = rig();
    r.c.say('lee', 'chatter', 1);
    r.advance(16, 0.16);
    r.c.say('tortoise', 'ALERT: airspace', 4);
    r.advance(450, 0.45);                      // past the short urgent gap, well inside the second
    expect(r.said.map((s) => s.line.text)).toEqual(['chatter', 'ALERT: airspace']);
  });

  it('a line about a state that is gone (flight time jumped, e.g. a fast-forward) is never spoken', () => {
    const r = rig();
    r.c.say('zombie', 'Altitude 301 m, 6.1 m/s.', 1);
    r.advance(16, 90);                                      // 90 s of flight in one frame
    expect(r.said).toEqual([]);
  });
});
