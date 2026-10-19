import { describe, it, expect } from 'vitest';
import { CATALOG, PART, engineStats, shapeVolume, loadArea, dryMass, partCost, integrity } from './catalog';
import { MATERIALS } from '@/data/materials';
import { analyse, attach, autoAttach, findSnap, joints, mirrored, partsOverlap, telemetry, worldNodes, type PlacedPart } from './vehicle';
import { PRESETS } from './presets';
import { combine, stirQuality, STIR_BEAT_MS, recordCraft } from '@/chemistry/mixingBench';

const chairOnly = (): PlacedPart[] => [{ uid: 1, defId: 'wooden-chair', x: 0, y: 0, rot: 0 }];
const preset = (id: string) => PRESETS.find((p) => p.id === id)!.build();

describe('catalog', () => {
  it('has at least 30 base shapes across all five categories', () => {
    expect(CATALOG.length).toBeGreaterThan(29);
    for (const c of ['command', 'aero', 'tanks', 'propulsion', 'structural']) expect(CATALOG.some((p) => p.category === c)).toBe(true);
  });

  it('every node normal points outward along an axis', () => {
    for (const p of CATALOG) for (const n of p.nodes) expect(Math.abs(n.nx) + Math.abs(n.ny)).toBe(1);
  });
});

describe('material science', () => {
  const tank = PART['tank-m'];

  it('dry mass = shape volume × density', () => {
    const v = shapeVolume(tank.structure);
    expect(dryMass(tank, 'steel')).toBeCloseTo(v * 7850, 6);
    expect(dryMass(tank, 'carbon')).toBeCloseTo(v * 1600, 6);
  });

  it('cost = shape volume × material price', () => {
    const v = shapeVolume(tank.structure);
    expect(partCost(tank, 'aluminium')).toBeCloseTo(v * MATERIALS.aluminium.pricePerM3, 3);
    expect(partCost(tank, 'carbon')).toBeGreaterThan(partCost(tank, 'titanium'));
    expect(partCost(tank, 'bamboo')).toBeLessThan(partCost(tank, 'steel') / 10);
  });

  it('capacity = shape load area × material strength', () => {
    const i = integrity(tank, 'titanium', 1);
    expect(i.capacityN).toBeCloseTo(loadArea(tank.structure) * 880 * 1e6, -3);
  });

  it('a bamboo tank splits under pressure; aluminium holds', () => {
    expect(integrity(tank, 'bamboo', 1000).mode).toBe('pressure');
    expect(integrity(tank, 'bamboo', 1000).safetyFactor).toBeLessThan(1);
    expect(integrity(tank, 'aluminium', 1000).safetyFactor).toBeGreaterThan(3);
  });

  it('swapping tank material from steel to carbon fibre raises TWR and Δv instantly', () => {
    const steel = preset('liquid').map((p) => (p.defId.startsWith('tank') ? { ...p, mat: 'steel' } : p));
    const carbon = steel.map((p) => (p.defId.startsWith('tank') ? { ...p, mat: 'carbon' } : p));
    const a = telemetry(steel), b = telemetry(carbon);
    expect(b.wetMass).toBeLessThan(a.wetMass);
    expect(b.twr).toBeGreaterThan(a.twr);
    expect(b.deltaV).toBeGreaterThan(a.deltaV);
    expect(b.cost).toBeGreaterThan(a.cost);
  });

  it('Bang Fai: bamboo flies (TWR just over 1), steel is far too heavy', () => {
    const bamboo = telemetry(preset('bang-fai'));
    const steel = telemetry(preset('bang-fai-steel'));
    expect(bamboo.twr).toBeGreaterThan(1.05);
    expect(bamboo.twr).toBeLessThan(1.5);
    expect(steel.twr).toBeLessThan(0.6);
    expect(bamboo.burnTime).toBeGreaterThan(40);
  });

  it('solid motor impulse matches its propellant', () => {
    const es = engineStats(PART['gunpowder-tube'])!;
    expect(es.thrust * es.burnTime).toBeCloseTo(0.15 * 80 * 9.80665, 6);
  });

  it('heat weakens a carbon-fibre booster casing more than a steel one', () => {
    const srb = PART['srb-l'];
    expect(integrity(srb, 'carbon', 1).heatFactor).toBeLessThan(integrity(srb, 'steel', 1).heatFactor);
  });
});

describe('flip & mirror', () => {
  it('a fin can attach to the LEFT side only when flipped', () => {
    const parts: PlacedPart[] = [{ uid: 1, defId: 'tank-m', x: 0, y: 0, rot: 0 }];
    const left = worldNodes(parts[0]).find((n) => n.node.id === 'left')!;
    const unflipped = findSnap(parts, 'fin-swept', { rot: 0 }, left.x - 0.3, left.y, 0.4);
    const flipped = findSnap(parts, 'fin-swept', { rot: 0, fx: true }, left.x - 0.3, left.y, 0.4);
    expect(unflipped === null || unflipped.to.node.id !== 'left').toBe(true);
    expect(flipped!.to.node.id).toBe('left');
  });

  it('mirroring a part is a true reflection (flip toggles, rotation reverses)', () => {
    const fin: PlacedPart = { uid: 2, defId: 'fin-swept', x: 0.925, y: 0.1, rot: 0 };
    const m = mirrored(fin, 0);
    expect(m.x).toBeCloseTo(-0.925, 6);
    expect(m.fx).toBe(true);
    expect(mirrored({ ...fin, rot: 1 }, 0).rot).toBe(3);
    // node positions mirror exactly
    const a = worldNodes(fin)[0], b = worldNodes({ ...m, uid: 3 })[0];
    expect(b.x).toBeCloseTo(-a.x, 6); expect(b.y).toBeCloseTo(a.y, 6); expect(b.nx).toBeCloseTo(-a.nx, 6);
  });

  it('mirror-pair presets are connected and balanced', () => {
    for (const id of ['liquid', 'boosters']) {
      const parts = preset(id);
      expect(analyse(parts).active.length).toBe(parts.length);
      expect(telemetry(parts).thrustOffset).toBeLessThan(0.01);
    }
  });
});

describe('snapping & structure', () => {
  it('a Wan Hu tube snaps to the chair side from a near miss', () => {
    const parts = chairOnly();
    const n = worldNodes(parts[0]).find((w) => w.node.id === 'left-low')!;
    const s = findSnap(parts, 'gunpowder-tube', { rot: 0 }, n.x - 0.1, n.y + 0.05, 0.3)!;
    expect(s.to.node.id).toBe('left-low');
  });

  it('Wan Hu preset: 47 tubes, all connected, no overlaps', () => {
    const parts = preset('wan-hu');
    expect(parts.filter((p) => p.defId === 'gunpowder-tube')).toHaveLength(47);
    const st = analyse(parts);
    expect(st.overlapping.size).toBe(0);
    expect(st.active.length).toBe(parts.length);
  });

  it('snapping never produces an overlap', () => {
    const parts = chairOnly();
    attach(parts, 'gunpowder-tube', parts[0], 'seat0', 'top');
    const s = findSnap(parts, 'gunpowder-tube', { rot: 0 }, -0.24, -0.45, 0.2);
    if (s) expect(parts.some((p) => partsOverlap({ uid: 99, defId: 'gunpowder-tube', x: s.x, y: s.y, rot: 0 }, p))).toBe(false);
  });

  it('joints are derived from geometry', () => {
    const parts = chairOnly();
    attach(parts, 'gunpowder-tube', parts[0], 'seat1', 'top');
    expect(joints(parts)).toHaveLength(1);
    parts[1].x += 0.2;
    expect(joints(parts)).toHaveLength(0);
  });

  it('tap-to-add finds a home, flipping if it must', () => {
    const parts: PlacedPart[] = [{ uid: 1, defId: 'tank-m', x: 0, y: 0, rot: 0 }];
    attach(parts, 'fin-swept', parts[0], 'right', 'root');
    const spot = autoAttach(parts, 'fin-swept');
    expect(spot).not.toBe(null);
    expect(spot!.x).toBeLessThan(0);
  });

  it('upper side tubes firing into lower ones are flagged', () => {
    const parts = chairOnly();
    const high = attach(parts, 'gunpowder-tube', parts[0], 'left-high', 'right');
    const low = attach(parts, 'gunpowder-tube', parts[0], 'left-low', 'right');
    const t = telemetry(parts);
    expect(t.blocked).toContain(high.uid);
    expect(t.blocked.includes(low.uid)).toBe(false);
  });
});

describe('mixing bench', () => {
  it('recipes and failures', () => {
    const g = (xs: Parameters<typeof combine>[0]) => { const r = combine(xs); return r.ok ? r.grade.id : 'fail'; };
    expect(g(['oxidiser', 'fuel'])).toBe('fast-powder');
    expect(g(['fuel', 'oxidiser', 'moderator'])).toBe('slow-powder');
    expect(g(['oxidiser', 'binder', 'fuel'])).toBe('cast-grain');
    expect(g(['fuel'])).toBe('fail');
  });

  it('steady stirring beats sloppy stirring; best batch is kept', () => {
    const steady = Array.from({ length: 12 }, (_, i) => i * STIR_BEAT_MS);
    const sloppy = steady.map((t, i) => t + (i % 2 ? 230 : -180));
    expect(stirQuality(steady)).toBeGreaterThan(stirQuality(sloppy) + 0.2);
    expect(recordCraft(recordCraft({ crafted: {} }, 'fast-powder', 0.6), 'fast-powder', 0.4).crafted['fast-powder']).toBe(0.6);
  });
});
