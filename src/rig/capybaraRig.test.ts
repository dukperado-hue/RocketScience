import { describe, it, expect } from 'vitest';
import { CapybaraRig } from './capybaraRig';

const sample = (fn: (r: CapybaraRig, t: number) => number, s = 2) => {
  const r = new CapybaraRig(), out: number[] = [];
  for (let t = 0; t < s; t += 1 / 60) { r.update(t, 1 / 60); out.push(fn(r, t)); }
  return out;
};
const span = (a: number[]) => Math.max(...a) - Math.min(...a);

describe('capybara janitor rig', () => {
  it('its legs walk: front and back feet swing in antiphase', () => {
    const f = sample((r) => r.rig.point('footF', 0.09)[0]), b = sample((r) => r.rig.point('footB', 0.09)[0]);
    expect(span(f)).toBeGreaterThan(0.08);
    const corr = f.reduce((s, v, i) => s + (v - f[0]) * (b[i] - b[0]), 0);
    expect(corr).toBeLessThan(0);
  });

  it('its arms push the mop: the mop head sweeps a band, back and forth', () => {
    const y = sample((r) => r.mopPoint()[1]);
    expect(span(y)).toBeGreaterThan(0.4);
    let turns = 0; for (let i = 2; i < y.length; i++) if (Math.sign(y[i] - y[i - 1]) !== Math.sign(y[i - 1] - y[i - 2])) turns++;
    expect(turns).toBeGreaterThanOrEqual(4);
  });

  it('the mop head drags behind the handle (secondary motion), but stays on it', () => {
    const lagged = sample((r) => Math.abs(r.rig.bones.mopHead.a - r.rig.bones.mopHead.target));
    expect(Math.max(...lagged)).toBeGreaterThan(0.05);
    expect(Math.max(...lagged)).toBeLessThan(1.4 + 1e-6);
    const [hx] = sample((r) => r.rig.point('handle', 1.05)[0] - r.rig.point('mopHead')[0]);
    expect(Math.abs(hx)).toBeLessThan(1e-9);
  });
});
