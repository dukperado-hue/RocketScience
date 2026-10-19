/**
 * Ready-made vehicles, assembled through the same node joints the player uses.
 */
import { attach, type PlacedPart } from './vehicle';
import type { GradeId } from '@/chemistry/mixingBench';

export interface Preset { id: string; name: string; nameTh: string; needs: GradeId[]; build: () => PlacedPart[] }

/** Tier 0: envelope → bamboo ring → heat source(s), joined through the factory nodes */
function lantern(env: string, ring: string, heater: string, burners: string[] = ['bottom']): PlacedPart[] {
  const parts: PlacedPart[] = [{ uid: 1, defId: env, x: 0, y: 0, rot: 0 }];
  const hoop = attach(parts, ring, parts[0], 'bottom', 'top');
  for (const n of burners) attach(parts, heater, hoop, n, 'top');
  return parts;
}

function wanHu(): PlacedPart[] {
  const parts: PlacedPart[] = [{ uid: 1, defId: 'wooden-chair', x: 0, y: 0, rot: 0 }];
  const chair = parts[0];
  for (let i = 0; i < 4; i++) attach(parts, 'gunpowder-tube', chair, `seat${i}`, 'top');
  // 11 + 11 + 11 + 10 = 43 more down the sides → 47 in total
  const chains: [string, 'left' | 'right', number][] = [['left-low', 'right', 11], ['right-low', 'left', 11], ['left-high', 'right', 11], ['right-high', 'left', 10]];
  for (const [chairNode, via, count] of chains) {
    let prev = attach(parts, 'gunpowder-tube', chair, chairNode, via);
    const outward = via === 'right' ? 'left' : 'right';
    for (let i = 1; i < count; i++) prev = attach(parts, 'gunpowder-tube', prev, outward, via);
  }
  attach(parts, 'kite', chair, 'kite-l', 'bottom');
  attach(parts, 'kite', chair, 'kite-r', 'bottom');
  return parts;
}

/**
 * "Up!" — Wan Hu's chair under a cluster of festival lanterns (v0.22.1). Each lantern: a large
 * paper envelope on a bamboo ring with a wax fuel cell on the ring's side hook, which leaves the
 * ring's bottom free to tie onto the crown of the lantern below (columns); rings tie to each
 * other through their side loops (rows). One column starts on the chair's backrest hook.
 *
 * Why so many: a festival lantern on TWO fuel cells (one per side hook) settles ~176 °C inside —
 * safely under paper's 233 °C — and nets ~236 g of lift after its own weight (one cell: ~105 g).
 * Chair (21.8 kg) + the brittle zombie (40 kg) ≈ 62 kg → ~260 lanterns to float; 400 here
 * (20 × 20) gives ~23 % spare lift, enough to climb through a breeze. A standard (70 kg) zombie
 * needs ~390 just to float.
 */
export function upCluster(cols = 20, rows = 20, rider: 'brittle' | 'standard' | 'fat' = 'brittle', env = 'envelope-l', cells = 2): PlacedPart[] {
  const parts: PlacedPart[] = [{ uid: 1, defId: 'wooden-chair', x: 0, y: 0, rot: 0, rider }];
  const lanternOn = (ring: PlacedPart) => {
    attach(parts, env, ring, 'top', 'bottom');
    attach(parts, 'fuel-cell', ring, 'burner-r', 'top');
    if (cells > 1) attach(parts, 'fuel-cell', ring, 'burner-l', 'top');
  };
  // the base row: the middle column ties onto the chair, the others out to both sides
  const mid = Math.floor(cols / 2);
  const base: PlacedPart[] = [];
  base[mid] = attach(parts, 'bamboo-ring', parts[0], 'lantern-top', 'bottom');
  for (let c = mid + 1; c < cols; c++) base[c] = attach(parts, 'bamboo-ring', base[c - 1], 'tether-r', 'tether-l');
  for (let c = mid - 1; c >= 0; c--) base[c] = attach(parts, 'bamboo-ring', base[c + 1], 'tether-l', 'tether-r');
  let row = base;
  for (let r = 0; r < rows; r++) {
    for (const ring of row) lanternOn(ring);
    if (r === rows - 1) break;
    // the next row: each ring ties onto the crown of the envelope just placed above this ring
    row = row.map((ring) => {
      const envelope = parts.find((p) => p.defId === env && Math.abs(p.x - ring.x) < 1e-6 && p.y > ring.y && p.y - ring.y < 1.5)!;
      return attach(parts, 'bamboo-ring', envelope, 'crown', 'bottom');
    });
  }
  return parts;
}

function bangFai(mat: string, twin = false): PlacedPart[] {
  const parts: PlacedPart[] = [{ uid: 1, defId: 'bang-fai', x: 0, y: 0, rot: 0, mat }];
  attach(parts, 'nose-s', parts[0], 'top', 'bottom');
  attach(parts, 'tail-stick', parts[0], 'right', 'left');
  // A second stick on the other side puts the thrust line back through the centre of mass
  if (twin) attach(parts, 'tail-stick', parts[0], 'left', 'right');
  return parts;
}

function liquid(mat: string): PlacedPart[] {
  const parts: PlacedPart[] = [{ uid: 1, defId: 'pod-mk1', x: 0, y: 0, rot: 0 }];
  attach(parts, 'chute-l', parts[0], 'top', 'bottom');
  const shield = attach(parts, 'heat-shield', parts[0], 'bottom', 'top');
  const t1 = attach(parts, 'tank-l', shield, 'bottom', 'top', { mat });
  const t2 = attach(parts, 'tank-m', t1, 'bottom', 'top', { mat });
  const eng = attach(parts, 'engine-lv45', t2, 'bottom', 'top');
  // Big delta wings on the engine skirt — as low and as large as possible, because the
  // 1.5 t engine drags the centre of mass down. The right one as drawn, the left one flipped.
  attach(parts, 'wing-delta', eng, 'right-skirt', 'root');
  attach(parts, 'wing-delta', eng, 'left-skirt', 'root', { fx: true });
  return parts;
}

function boosters(): PlacedPart[] {
  const parts: PlacedPart[] = [{ uid: 1, defId: 'pod-mk1', x: 0, y: 0, rot: 0 }];
  attach(parts, 'chute-l', parts[0], 'top', 'bottom');
  const shield = attach(parts, 'heat-shield', parts[0], 'bottom', 'top');
  const dec = attach(parts, 'decoupler-l', shield, 'bottom', 'top');
  const core = attach(parts, 'tank-xl', dec, 'bottom', 'top');
  attach(parts, 'engine-tp', core, 'bottom', 'top');
  const rdR = attach(parts, 'decoupler-radial', core, 'right', 'root');
  const rdL = attach(parts, 'decoupler-radial', core, 'left', 'root', { fx: true });
  attach(parts, 'srb-l', rdR, 'out', 'left');
  attach(parts, 'srb-l', rdL, 'out', 'right');
  return parts;
}

/**
 * Phaya Naga Heavy — the biggest stack the catalogue allows: three stages, 30 t, 17 m.
 *   stage 1: two liquid side boosters (tank-xl + LV-45) with big delta wings on their outer skirts
 *   stage 2: core of two tank-xl + turbopump engine
 *   stage 3: tank-l + vacuum engine under an interstage
 *   capsule: Mk1 pod, heat shield, 18 m parachute, one fat zombie
 * Fly it with SAS and a pitch program (Auto-turn): ~80° keeps re-entry survivable.
 */
function nagaHeavy(): PlacedPart[] {
  const p: PlacedPart[] = [{ uid: 1, defId: 'pod-mk1', x: 0, y: 0, rot: 0, rider: 'fat' }];
  attach(p, 'chute-l', p[0], 'top', 'bottom');
  const shield = attach(p, 'heat-shield', p[0], 'bottom', 'top');
  const d3 = attach(p, 'decoupler-l', shield, 'bottom', 'top');
  const upper = attach(p, 'tank-l', d3, 'bottom', 'top');
  const taper = attach(p, 'tank-adapter', upper, 'bottom', 'bottom', { fy: true });   // 1.25 → 0.625, upside down
  const vac = attach(p, 'engine-vac', taper, 'top', 'top');
  const d2 = attach(p, 'decoupler-m', vac, 'bottom', 'top');                        // interstage
  const inter = attach(p, 'tank-adapter', d2, 'bottom', 'top');
  const c1 = attach(p, 'tank-xl', inter, 'bottom', 'top');
  const c2 = attach(p, 'tank-xl', c1, 'bottom', 'top');
  attach(p, 'engine-tp', c2, 'bottom', 'top');
  for (const side of ['right', 'left'] as const) {
    const fx = side === 'left' ? { fx: true } : {};
    const rd = attach(p, 'decoupler-radial', c2, side, 'root', fx);
    const tank = attach(p, 'tank-xl', rd, 'out', side === 'left' ? 'right' : 'left');
    const eng = attach(p, 'engine-lv45', tank, 'bottom', 'top');
    attach(p, 'wing-delta', eng, `${side}-skirt`, 'root', fx);
  }
  return p;
}

/**
 * Phaya Naga Orbital — the first blueprint that can reach a real-size orbit.
 * Needs the Tier-4 engines (modern thrust-to-weight). 3 stages, ~36 t, ~10.3 km/s of staged Δv:
 *   stage 1: two side boosters (tank-xl + modern engine, delta wings)
 *   stage 2: core of three tank-xl + modern engine
 *   stage 3: tank-xl + tank-l + modern vacuum engine
 *   payload: ZomSat-1 (one zombie, a porthole, four antennas)
 * Ascent that works: SAS hold, lean smoothly to horizontal by ~100 km, keep burning
 * horizontally (throttle to ≤ 3.5 g), cut off when Pe > 140 km.
 */
function nagaOrbital(): PlacedPart[] {
  const p: PlacedPart[] = [{ uid: 1, defId: 'zomsat', x: 0, y: 0, rot: 0, rider: 'standard' }];
  let last = attach(p, 'tank-adapter', p[0], 'bottom', 'top');
  last = attach(p, 'tank-xl', last, 'bottom', 'top');
  last = attach(p, 'tank-l', last, 'bottom', 'top');
  const upper = attach(p, 'engine-vac-modern', last, 'bottom', 'top');
  const inter = attach(p, 'decoupler-l', upper, 'bottom', 'top');
  let core = attach(p, 'tank-xl', inter, 'bottom', 'top');
  core = attach(p, 'tank-xl', core, 'bottom', 'top');
  core = attach(p, 'tank-xl', core, 'bottom', 'top');
  attach(p, 'engine-modern', core, 'bottom', 'top');
  for (const side of ['right', 'left'] as const) {
    const fx = side === 'left' ? { fx: true } : {};
    const rd = attach(p, 'decoupler-radial', core, side, 'root', fx);
    const tank = attach(p, 'tank-xl', rd, 'out', side === 'left' ? 'right' : 'left');
    const eng = attach(p, 'engine-modern', tank, 'bottom', 'top');
    attach(p, 'wing-delta', eng, `${side}-skirt`, 'root', fx);
  }
  return p;
}

/**
 * Sounding rocket — Tier 2 only (campaign Mission 2.5, Space Passport). No payload: a nose,
 * two aluminium tanks, the LV-45 and swept fins on its skirt. With SAS holding vertical it
 * tops out near 390 km; without SAS it weathercocks and stays low.
 */
function sounding(): PlacedPart[] {
  const p: PlacedPart[] = [{ uid: 1, defId: 'nose-l', x: 0, y: 0, rot: 0 }];
  let l = attach(p, 'tank-l', p[0], 'bottom', 'top', { mat: 'aluminium' });
  l = attach(p, 'tank-m', l, 'bottom', 'top', { mat: 'aluminium' });
  const eng = attach(p, 'engine-lv45', l, 'bottom', 'top');
  attach(p, 'fin-swept', eng, 'right-skirt', 'root');
  attach(p, 'fin-swept', eng, 'left-skirt', 'root', { fx: true });
  return p;
}

/**
 * Phaya Naga Hijacker — the Tier-3 way to orbit (campaign Mission 3, Orbital Hijack).
 *   stage 1: two side boosters (tank-xl + turbopump, delta wings)
 *   stage 2: core of three tank-xl + turbopump
 *   stage 3: tank-xl + vacuum engine (≈60 kN — weak, so: lofted climb, coast to Ap, circularise)
 *   payload: ZomSat-1 with one standard zombie (EVA-ready)
 * ~10 km/s of staged Δv. Flies to a ~200 × 145 km orbit with Assist: Auto (PROFILE_TIER3).
 */
function nagaHijacker(): PlacedPart[] {
  const p: PlacedPart[] = [{ uid: 1, defId: 'zomsat', x: 0, y: 0, rot: 0, rider: 'standard' }];
  let last = attach(p, 'tank-adapter', p[0], 'bottom', 'top');
  last = attach(p, 'tank-xl', last, 'bottom', 'top');
  const taper = attach(p, 'tank-adapter', last, 'bottom', 'bottom', { fy: true });   // 1.25 → 0.625, upside down
  const vac = attach(p, 'engine-vac', taper, 'top', 'top');
  const d2 = attach(p, 'decoupler-m', vac, 'bottom', 'top');
  let core = attach(p, 'tank-adapter', d2, 'bottom', 'top');
  for (let i = 0; i < 3; i++) core = attach(p, 'tank-xl', core, 'bottom', 'top');
  attach(p, 'engine-tp', core, 'bottom', 'top');
  for (const side of ['right', 'left'] as const) {
    const fx = side === 'left' ? { fx: true } : {};
    const rd = attach(p, 'decoupler-radial', core, side, 'root', fx);
    const tank = attach(p, 'tank-xl', rd, 'out', side === 'left' ? 'right' : 'left');
    const eng = attach(p, 'engine-tp', tank, 'bottom', 'top');
    attach(p, 'wing-delta', eng, `${side}-skirt`, 'root', fx);
  }
  return p;
}

export const PRESETS: Preset[] = [
  { id: 'khom-loi', name: 'Khom loi (sky lantern)', nameTh: 'โคมลอย', needs: [], build: () => lantern('envelope-m', 'bamboo-ring', 'fuel-cell') },
  { id: 'cloth-balloon', name: 'Cotton hot-air balloon', nameTh: 'บอลลูนผ้าฝ้าย', needs: [], build: () => lantern('envelope-cloth', 'bamboo-frame', 'fuel-cell', ['bottom', 'burner-l', 'burner-r']) },
  { id: 'up-chair', name: 'Up! Wan Hu’s lantern chair (400 lanterns)', nameTh: 'เก้าอี้โคมลอย 400 ดวง', needs: [], build: () => upCluster() },
  { id: 'wan-hu', name: 'Wan Hu’s chair (47 rockets)', nameTh: 'เก้าอี้ว่านหู่ 47 กระบอก', needs: ['fast-powder'], build: wanHu },
  { id: 'bang-fai', name: 'Bang Fai (bamboo)', nameTh: 'บั้งไฟไม้ไผ่', needs: ['slow-powder'], build: () => bangFai('bamboo') },
  { id: 'bang-fai-twin', name: 'Bang Fai, twin tails', nameTh: 'บั้งไฟหางคู่', needs: ['slow-powder'], build: () => bangFai('bamboo', true) },
  { id: 'bang-fai-steel', name: 'Bang Fai (steel)', nameTh: 'บั้งไฟเหล็ก', needs: ['slow-powder'], build: () => bangFai('steel') },
  { id: 'sounding', name: 'Sounding rocket (LV-45)', nameTh: 'จรวดตรวจอากาศ LV-45', needs: [], build: sounding },
  { id: 'liquid', name: 'Liquid single stage', nameTh: 'จรวดเชื้อเพลิงเหลว', needs: [], build: () => liquid('aluminium') },
  { id: 'naga-heavy', name: 'Phaya Naga Heavy (3 stages)', nameTh: 'พญานาคเฮฟวี่ 3 ท่อน', needs: [], build: nagaHeavy },
  { id: 'naga-hijacker', name: 'Phaya Naga Hijacker (Tier 3 orbit)', nameTh: 'พญานาคปล้นวงโคจร (Tier 3)', needs: [], build: nagaHijacker },
  { id: 'naga-orbital', name: 'Phaya Naga Orbital (ZomSat-1)', nameTh: 'พญานาคโคจร + ดาวเทียมซอมบี้', needs: [], build: nagaOrbital },
  { id: 'boosters', name: 'Core + side boosters', nameTh: 'แกนกลาง + บูสเตอร์ข้าง', needs: [], build: boosters },
];
