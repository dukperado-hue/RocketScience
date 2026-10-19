import { describe, it, expect } from 'vitest';
import { Capcom, type Line } from './capcom';

function said(text: string) {
  const c = new Capcom(); c.clock = () => 1e6;
  const out: Line[] = []; c.onSay = (l) => out.push(l);
  c.event({ t: 100, kind: 'plasma', text });
  c.tick(1e6 + 2000, 0);
  return out.map((l) => l.text).join(' ');
}

describe('plasma wording follows the speed', () => {
  it('hypersonic heating below orbital speed: no "plasma" and no "blackout"', () => {
    for (const t of ['Hypersonic heating (Mach 5.7): 10 MW/m² of flow energy hitting the nose cone. Nothing is shielding it.', 'Hypersonic heating (Mach 6.0): 12 MW/m² of flow energy hitting the pod. The heat shield is doing its job.']) {
      const s = said(t);
      expect(s.length).toBeGreaterThan(10);
      expect(s).not.toMatch(/plasma|blackout|Sun/i);
    }
  });
  it('orbital-speed re-entry keeps the plasma / blackout lines', () => {
    expect(said('Re-entry plasma: 900 MW/m² of flow energy hitting the pod. The heat shield is doing its job.')).toMatch(/Plasma sheath|blackout/);
  });
});
