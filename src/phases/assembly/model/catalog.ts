/**
 * Factory part catalogue — parts are SHAPES; stats come from the MATERIAL.
 *
 *   dry mass   = shapeVolume(structure) × material.density   (+ fixed mass: crew, machinery)
 *   cost       = shapeVolume(structure) × material.pricePerM3 (+ fixed cost)
 *   capacity   = loadArea(structure)    × material.strength   (heat- and grain-derated)
 *
 * Coordinates are metres in the part's local frame: origin at the centre, +y up.
 * Attach nodes carry a position, an outward normal and a size. 'radial' nodes
 * are surface mounts and accept any size.
 */
import { GRADES, type GradeId } from '@/chemistry/mixingBench';
import { G0 } from '@/data/parts';
import { MATERIALS, CORE_MATERIALS, type Material } from '@/data/materials';
import { PROPELLANTS } from '@/data/propellants';
import { effectiveStrength } from '@/physics/structure';

export type Category = 'lantern' | 'command' | 'payload' | 'aero' | 'tanks' | 'propulsion' | 'structural' | 'recovery';
export type NodeSize = 'tiny' | 'small' | 'medium' | 'large' | 'radial';
export type Shape =
  | 'chair' | 'pod' | 'nose' | 'nose-ogive' | 'fin' | 'fin-swept' | 'fin-delta' | 'wing' | 'wing-delta'
  | 'tank' | 'tank-radial' | 'tank-adapter' | 'tube' | 'bangfai' | 'cast-motor' | 'srb'
  | 'engine-small' | 'engine' | 'engine-turbo' | 'engine-vac'
  | 'truss' | 'decoupler' | 'decoupler-radial' | 'fairing' | 'adapter' | 'stick' | 'shield' | 'kite' | 'chute' | 'chute-radial' | 'payload'
  | 'envelope' | 'lantern-ring' | 'heater';

export interface AttachNode { id: string; x: number; y: number; nx: number; ny: number; size: NodeSize }
export interface Rect { x: number; y: number; w: number; h: number } // centre-based

/** Geometry of the load-bearing material — this is what the material fills */
export type Structure =
  | { kind: 'tube'; d: number; l: number; wall: number; caps?: boolean }
  | { kind: 'cone'; d: number; l: number; wall: number }
  | { kind: 'ring'; d: number; h: number; wall: number }
  | { kind: 'plate'; area: number; thickness: number; rootChord: number; span: number }
  | { kind: 'frame'; members: number; memberArea: number; length: number }
  | { kind: 'solid'; volume: number; loadArea: number };

export interface SolidMotor { kind: 'solid'; grade: GradeId; propellant: number; baseBurn: number }
export interface Booster { kind: 'srb'; propellant: number; burnTime: number }
export interface LiquidEngine { kind: 'liquid'; thrustSL: number; thrustVac: number; ispSL: number; ispVac: number; /** Thrust-vector range, ± degrees */ gimbalDeg?: number }

/**
 * A 3D payload: the physics still uses the part's box, mass and nodes; the model
 * is how it LOOKS. It is baked to a 2D sprite by `assets/modelSprites.ts` and
 * drawn inside the part's box in the factory, the launch view and the map.
 */
export interface Payload3D {
  /** glTF/GLB under public/ — drop a NASA/ESA download here (see public/models/README.md) */
  model: string;
  /** Procedural stand-in built from Three.js primitives, used until `model` exists */
  placeholder: 'sputnik' | 'satellite' | 'telescope';
  /** Which axis of the downloaded model is its "up" (launch direction). Default 'y' */
  upAxis?: 'x' | 'y' | 'z' | '-x' | '-y' | '-z';
  /** Credit / licence line for the model (NASA media must be credited, no endorsement implied) */
  credit?: string;
  /** Counts toward orbital milestones */
  orbital: true;
}

export interface FactoryPartDef {
  id: string;
  name: string;
  nameTh: string;
  category: Category;
  /** 0 = pre-gunpowder (hot air) · 1 = gunpowder · 2–4 = modern */
  tier: 0 | 1 | 2 | 3 | 4;
  shape: Shape;
  w: number;
  h: number;
  nodes: AttachNode[];
  hull?: Rect[];
  structure: Structure;
  /** Materials the player may choose; null = fixed construction (engines) */
  materials: string[] | null;
  /** Default material */
  material: string;
  fixedMass?: number;
  fixedCost?: number;
  /** Liquid tank: internal volume (m³) of kerosene/LOX */
  tank?: { volume: number };
  /** Internal pressure (MPa) — tanks and motor casings — for the hoop-stress check */
  pressure?: number;
  engine?: SolidMotor | Booster | LiquidEngine;
  /** Fins and wings: checked for bending at the root under aerodynamic load */
  aero?: boolean;
  /** Has a seat: carries one zombie test payload (PlacedPart.rider) */
  crew?: boolean;
  /** Parachute: canopy diameter (m) and the fastest it can open without shredding (m/s) */
  chute?: { diameter: number; maxSpeed: number };
  /** 3D payload (satellites, telescopes) */
  payload3d?: Payload3D;
  /** Reaction control: max torque (N·m) and monopropellant (kg) */
  rcs?: { torque: number; mono: number };
  /** Bang Fai craft: the nozzle is carved off-centre so the thrust line passes through the centre of mass */
  thrustTrim?: boolean;
  /** Ablative heat shield: soaks re-entry heat up to ~3000 °C */
  heatShield?: boolean;
  /** Fins: cant angle (degrees) — sets the rocket spinning for gyroscopic stability */
  cantDeg?: number;
  /** Tier 0 — hot-air envelope: volume (m³), skin area (m²) and the inside temperature (°C) at which it catches fire */
  envelope?: { volume: number; area: number; igniteC: number };
  /** Tier 0 — heat source: steady power (W), burn time (s), fuel (kg, burns off), smoke density 0–1 */
  heater?: { kind: 'candle' | 'fuel-cell' | 'flare'; power: number; burnTime: number; fuel: number; smoke: number };
  /** Left/right-handed part: worth flipping (fins, wings, radial tanks) */
  asymmetric?: boolean;
  description: string;
}

/* ================================================================
 * Shape maths
 * ================================================================ */

export function shapeVolume(s: Structure): number {
  switch (s.kind) {
    case 'tube': return Math.PI * s.d * s.l * s.wall + (s.caps ? 2 * Math.PI * (s.d / 2) ** 2 * s.wall : 0);
    case 'cone': { const r = s.d / 2; return Math.PI * r * Math.hypot(r, s.l) * s.wall; }
    case 'ring': return Math.PI * s.d * s.h * s.wall;
    case 'plate': return s.area * s.thickness;
    case 'frame': return s.members * s.memberArea * s.length;
    case 'solid': return s.volume;
  }
}

/** Cross-section that carries axial load (m²) */
export function loadArea(s: Structure): number {
  switch (s.kind) {
    case 'tube': case 'cone': return Math.PI * s.d * s.wall;
    case 'ring': return Math.PI * s.d * s.wall;
    case 'plate': return s.rootChord * s.thickness;
    case 'frame': return s.members * s.memberArea;
    case 'solid': return s.loadArea;
  }
}

const KEROLOX_DENSITY = 1030;     // kg/m³, mixed kerosene + LOX
const MAX_Q = 15_000;             // Pa — illustrative dynamic pressure for fin/wing bending

export const materialFor = (def: FactoryPartDef, mat?: string): Material =>
  MATERIALS[mat && (def.materials?.includes(mat) ?? false) ? mat : def.material];

export const dryMass = (def: FactoryPartDef, mat?: string) => shapeVolume(def.structure) * materialFor(def, mat).density + (def.fixedMass ?? 0);
export const partCost = (def: FactoryPartDef, mat?: string) => shapeVolume(def.structure) * materialFor(def, mat).pricePerM3 + (def.fixedCost ?? 0);

export function propellantMass(def: FactoryPartDef): number {
  if (def.heater) return def.heater.fuel;
  if (def.tank) return def.tank.volume * KEROLOX_DENSITY;
  if (def.engine && def.engine.kind !== 'liquid') return def.engine.propellant;
  return 0;
}
export const propellantKind = (def: FactoryPartDef): 'liquid' | 'solid' | null =>
  def.tank ? 'liquid' : def.engine && def.engine.kind !== 'liquid' ? 'solid' : null;

/** Engine numbers used by telemetry and flight */
export interface EngineStats { thrust: number; isp: number; burnTime: number; smoke: number }

export function engineStats(def: FactoryPartDef, liquidBurnTime = 0): EngineStats | null {
  const e = def.engine;
  if (!e) return null;
  if (e.kind === 'solid') {
    const g = GRADES[e.grade];
    const burnTime = e.baseBurn * g.burnMultiplier;
    return { thrust: (e.propellant * g.ispSL * G0) / burnTime, isp: g.ispSL, burnTime, smoke: g.smokeDensity };
  }
  if (e.kind === 'srb') {
    const isp = PROPELLANTS['composite-solid'].ispSL;
    return { thrust: (e.propellant * isp * G0) / e.burnTime, isp, burnTime: e.burnTime, smoke: 0.6 };
  }
  return { thrust: e.thrustSL, isp: e.ispSL, burnTime: liquidBurnTime, smoke: 0.12 };
}

/** Grade a part needs before it can be placed (null = always available) */
export const requiredGrade = (def: FactoryPartDef): GradeId | null => (def.engine?.kind === 'solid' ? def.engine.grade : null);

/** Wall temperature a motor casing reaches during its burn (°C) */
export function casingTemp(def: FactoryPartDef): number {
  const e = def.engine;
  if (!e) return 30;
  if (e.kind === 'solid') return { 'fast-powder': 110, 'slow-powder': 140, 'cast-grain': 160 }[e.grade];
  if (e.kind === 'srb') return 260;
  return 30; // liquid engines: fixed construction, regeneratively cooled
}

export type FailureMode = 'load' | 'pressure' | 'bending' | 'heat';

export interface Integrity {
  safetyFactor: number;       // capacity ÷ load; < 1 means it fails
  mode: FailureMode;
  temperature: number;
  heatFactor: number;         // 1 = no heat weakening
  capacityN: number;          // axial load capacity
}

/**
 * Structural integrity of one part made of `mat`, carrying `loadN` of
 * compression at liftoff. Checks axial load, internal pressure (hoop stress,
 * using ACROSS-grain strength), fin/wing root bending, and heat.
 */
export function integrity(def: FactoryPartDef, mat: string | undefined, loadN: number): Integrity {
  const m = materialFor(def, mat);
  const temperature = casingTemp(def);
  const eff = effectiveStrength(m, { flaw: 1, temperatureC: temperature }, { humidity: 0.5 });
  const fresh = effectiveStrength(m, { flaw: 1, temperatureC: 30 }, { humidity: 0.5 });
  const heatFactor = fresh > 0 ? eff / fresh : 0;
  const s = def.structure;
  const capacityN = loadArea(s) * eff * 1e6;
  const modes: [FailureMode, number][] = [['load', loadN > 0 ? capacityN / loadN : Infinity]];

  if (def.pressure && (s.kind === 'tube' || s.kind === 'cone')) {
    const hoopMPa = (def.pressure * (s.d / 2)) / s.wall;
    modes.push(['pressure', (eff * (1 - m.anisotropy)) / hoopMPa]);
  }
  if (def.aero && s.kind === 'plate') {
    const moment = MAX_Q * s.area * (s.span / 2);
    const z = (s.rootChord * s.thickness ** 2) / 6;
    modes.push(['bending', (eff * (1 - 0.5 * m.anisotropy) * 1e6) / (moment / z)]);
  }
  let [mode, safetyFactor] = modes.reduce((a, b) => (b[1] < a[1] ? b : a));
  if (eff <= 0) { mode = 'heat'; safetyFactor = 0; }
  else if (heatFactor < 0.8 && safetyFactor < 1) mode = 'heat';
  return { safetyFactor, mode, temperature, heatFactor, capacityN };
}

/* ================================================================
 * Node helpers
 * ================================================================ */

const top = (h: number, size: NodeSize): AttachNode => ({ id: 'top', x: 0, y: h / 2, nx: 0, ny: 1, size });
const bottom = (h: number, size: NodeSize): AttachNode => ({ id: 'bottom', x: 0, y: -h / 2, nx: 0, ny: -1, size });
const sides = (w: number, y = 0, tag = ''): AttachNode[] => [
  { id: `left${tag}`, x: -w / 2, y, nx: -1, ny: 0, size: 'radial' },
  { id: `right${tag}`, x: w / 2, y, nx: 1, ny: 0, size: 'radial' },
];
/**
 * Lantern tethers (v0.22.1, the "Up!" chair). A lantern's crown has a string loop TETHER m above
 * the paper: the next lantern's ring ties on there, so lanterns stack into columns with room
 * for a heater on a side hook in between. Rings tie to each other sideways (rows), and to the
 * chair's side mounts. Every tether is a 'tiny' node, so the usual size + facing rules apply.
 */
export const TETHER = 0.22;
const tethers = (w: number): AttachNode[] => [
  { id: 'tether-l', x: -w / 2, y: 0, nx: -1, ny: 0, size: 'tiny' },
  { id: 'tether-r', x: w / 2, y: 0, nx: 1, ny: 0, size: 'tiny' },
];
const root = (w: number, y = 0): AttachNode => ({ id: 'root', x: -w / 2, y, nx: -1, ny: 0, size: 'radial' });

const ALL = [...CORE_MATERIALS] as string[];
const tankVol = (d: number, l: number) => Math.PI * (d / 2) ** 2 * l * 0.92;

/* ================================================================
 * Catalogue
 * ================================================================ */

export const CATALOG: FactoryPartDef[] = [
  /* ---------- Tier 0: Lantern factory (hot air, no thrust) ---------- */
  ...([
    ['envelope-s', 'Paper lantern, small', 'โคมลอยเล็ก', 0.45, 0.75, 0.12, 1.22, 0.022, 'paper', 233,
      'A 0.12 m³ sa-paper shade. Light and cheap — and too small for a full fuel cell: it will overheat and catch fire.'],
    ['envelope-m', 'Khom loi (sky lantern)', 'โคมลอย', 0.6, 1.06, 0.30, 2.28, 0.045, 'paper', 233,
      'The classic 0.3 m³ sky lantern. With one wax fuel cell it settles ~140 °C above the air outside and floats away for about 12 minutes.'],
    ['envelope-l', 'Festival lantern, large', 'โคมไฟยักษ์', 0.9, 1.57, 1.0, 4.08, 0.11, 'paper', 233,
      'One cubic metre of paper. Gentle on a single fuel cell; carries a little extra.'],
    ['envelope-cloth', 'Cotton hot-air balloon', 'บอลลูนผ้าฝ้าย', 1.4, 1.95, 3.0, 10.1, 0.6, 'paper', 255,
      'Three cubic metres of cotton. Heavy, slow, and harder to set alight. Needs more than one heat source.'],
  ] as const).map(([id, name, nameTh, w, h, volume, area, mass, mat, igniteC, description]): FactoryPartDef => ({
    id, name, nameTh, category: 'lantern', tier: 0, shape: 'envelope', w, h,
    nodes: [bottom(h, 'tiny'), { id: 'crown', x: 0, y: h / 2 + TETHER, nx: 0, ny: 1, size: 'tiny' }],
    structure: { kind: 'solid', volume: 1e-7, loadArea: 1e-4 }, materials: null, material: mat, fixedMass: mass, fixedCost: Math.round(mass * 2000),
    envelope: { volume, area, igniteC }, description,
  })),
  {
    id: 'bamboo-ring', name: 'Bamboo mouth ring', nameTh: 'ห่วงไม้ไผ่', category: 'lantern', tier: 0, shape: 'lantern-ring',
    w: 0.6, h: 0.05, nodes: [top(0.05, 'tiny'), bottom(0.05, 'tiny'),
      // side hooks for the heater free the bottom to tie onto the crown of the lantern below
      { id: 'burner-l', x: -0.18, y: -0.025, nx: 0, ny: -1, size: 'tiny' }, { id: 'burner-r', x: 0.18, y: -0.025, nx: 0, ny: -1, size: 'tiny' },
      // string loops 15 cm out each side: lanterns up to 0.9 m wide tie side by side without touching
      ...tethers(0.9)],
    structure: { kind: 'solid', volume: 1e-7, loadArea: 1e-4 }, materials: null, material: 'bamboo', fixedMass: 0.012, fixedCost: 5,
    description: 'The split-bamboo hoop that holds a lantern open, with two crossed wires for the heat source.',
  },
  {
    id: 'bamboo-frame', name: 'Bamboo hoop, large', nameTh: 'โครงไม้ไผ่ใหญ่', category: 'lantern', tier: 0, shape: 'lantern-ring',
    w: 1.1, h: 0.08, nodes: [top(0.08, 'tiny'), bottom(0.08, 'tiny'),
      { id: 'burner-l', x: -0.3, y: -0.04, nx: 0, ny: -1, size: 'tiny' }, { id: 'burner-r', x: 0.3, y: -0.04, nx: 0, ny: -1, size: 'tiny' },
      ...tethers(1.1)],
    structure: { kind: 'solid', volume: 1e-7, loadArea: 1e-4 }, materials: null, material: 'bamboo', fixedMass: 0.05, fixedCost: 12,
    description: 'A sturdier hoop for big lanterns and cloth balloons. Room for two burners.',
  },
  ...([
    ['tealight', 'Tea-light candle', 'เทียน', 'candle', 80, 4 * 3600, 0.012, 0.02, 0.0,
      'About 80 W. Lovely on a table; it cannot lift even the smallest lantern. Try it.'],
    ['fuel-cell', 'Wax fuel cell', 'ก้อนเชื้อเพลิงโคม', 'fuel-cell', 1800, 720, 0.032, 0.008, 0.05,
      'Wax-soaked paper: ~1.8 kW for 12 minutes. The standard khom loi burner.'],
    ['smoke-flare', 'Smoke flare', 'พลุควัน', 'flare', 3200, 120, 0.06, 0.03, 0.8,
      '3.2 kW and a thick trail of smoke — for two minutes. Overheats a small lantern into a fireball.'],
  ] as const).map(([id, name, nameTh, kind, power, burnTime, fuel, shell, smoke, description]): FactoryPartDef => ({
    id, name, nameTh, category: 'lantern', tier: 0, shape: 'heater', w: kind === 'flare' ? 0.06 : 0.1, h: kind === 'flare' ? 0.18 : 0.05,
    nodes: [top(kind === 'flare' ? 0.18 : 0.05, 'tiny')],
    structure: { kind: 'solid', volume: 1e-7, loadArea: 1e-4 }, materials: null, material: 'paper', fixedMass: shell, fixedCost: 3,
    heater: { kind, power, burnTime, fuel, smoke }, description,
  })),

  /* ---------- Command ---------- */
  {
    id: 'wooden-chair', name: 'Wooden chair', nameTh: 'เก้าอี้', category: 'command', tier: 1, shape: 'chair',
    w: 0.8, h: 1.3,
    nodes: [
      ...[-0.24, -0.08, 0.08, 0.24].map((x, i) => ({ id: `seat${i}`, x, y: -0.2, nx: 0, ny: -1, size: 'tiny' as NodeSize })),
      ...sides(0.8, -0.05, '-low'), ...sides(0.8, 0.45, '-high'),
      { id: 'kite-l', x: -0.34, y: 0.65, nx: 0, ny: 1, size: 'tiny' },
      { id: 'kite-r', x: 0.34, y: 0.65, nx: 0, ny: 1, size: 'tiny' },
      // a lantern cord on top of the backrest: the ring ties on TETHER m up, leaving room for its heater
      { id: 'lantern-top', x: 0, y: 0.65 + TETHER, nx: 0, ny: 1, size: 'tiny' },
    ],
    hull: [{ x: 0, y: -0.15, w: 0.8, h: 0.1 }, { x: 0, y: 0.25, w: 0.8, h: 0.8 }, { x: -0.36, y: -0.425, w: 0.08, h: 0.45 }, { x: 0.36, y: -0.425, w: 0.08, h: 0.45 }],
    structure: { kind: 'solid', volume: 0.029, loadArea: 0.0064 },
    materials: ['wood', ...ALL], material: 'wood', crew: true,
    description: 'One seat for one zombie. Mounts under the seat and down both sides; lanterns and kites tie on top. Wan Hu’s launch vehicle.',
  },
  {
    id: 'pod-mk1', name: 'Mk1 command pod', nameTh: 'ห้องโดยสาร Mk1', category: 'command', tier: 3, shape: 'pod',
    w: 1.25, h: 1.25, nodes: [top(1.25, 'large'), bottom(1.25, 'large')],
    structure: { kind: 'cone', d: 1.25, l: 1.25, wall: 0.012 },
    materials: ['aluminium', 'titanium', 'carbon', 'steel'], material: 'aluminium', fixedMass: 550, fixedCost: 2_000_000, crew: true, rcs: { torque: 3000, mono: 30 },
    description: 'Pressure shell around one zombie couch, with RCS thrusters (30 kg of monopropellant) to steer in vacuum. Remember the heat shield this time.',
  },

  /* ---------- Payloads (3D models) ---------- */
  {
    id: 'zomsat', name: 'ZomSat-1', nameTh: 'ดาวเทียมซอมบี้', category: 'payload', tier: 3, shape: 'payload',
    w: 0.9, h: 1.1, nodes: [bottom(1.1, 'medium')],
    structure: { kind: 'solid', volume: 0.02, loadArea: 0.01 }, materials: null, material: 'aluminium', fixedMass: 220, fixedCost: 1_500_000,
    crew: true, rcs: { torque: 400, mono: 8 },
    payload3d: { model: 'models/zomsat.glb', placeholder: 'sputnik', orbital: true },
    description: 'A polished sphere, four whip antennas and a porthole with one zombie behind it. Our answer to 1957 — nobody furry gets hurt this time.',
  },
  {
    id: 'sat-comm', name: 'Communications satellite', nameTh: 'ดาวเทียมสื่อสาร', category: 'payload', tier: 3, shape: 'payload',
    w: 1.2, h: 1.0, nodes: [bottom(1.0, 'medium')],
    structure: { kind: 'solid', volume: 0.03, loadArea: 0.01 }, materials: null, material: 'aluminium', fixedMass: 380, fixedCost: 5_000_000,
    payload3d: { model: 'models/satellite.glb', placeholder: 'satellite', orbital: true },
    description: 'Box bus, folded solar wings, a dish. Swap in a NASA model by dropping models/satellite.glb.',
  },
  {
    id: 'telescope', name: 'Space telescope', nameTh: 'กล้องโทรทรรศน์อวกาศ', category: 'payload', tier: 4, shape: 'payload',
    w: 1.25, h: 3.4, nodes: [bottom(3.4, 'large')],
    structure: { kind: 'solid', volume: 0.12, loadArea: 0.04 }, materials: null, material: 'aluminium', fixedMass: 1900, fixedCost: 40_000_000,
    payload3d: { model: 'models/hubble.glb', placeholder: 'telescope', upAxis: 'y', credit: 'NASA', orbital: true },
    description: 'Hubble-style tube with an aperture door and solar arrays. Heavy — needs a big stack to reach orbit.',
  },

  /* ---------- Aerodynamics ---------- */
  {
    id: 'nose-s', name: 'Nose cone, 12 cm', nameTh: 'หัวกรวย 12 ซม.', category: 'aero', tier: 1, shape: 'nose',
    w: 0.12, h: 0.3, nodes: [bottom(0.3, 'small')],
    structure: { kind: 'cone', d: 0.12, l: 0.3, wall: 0.003 }, materials: ['paper', ...ALL], material: 'paper',
    description: 'Caps a Bang Fai or a small booster.',
  },
  {
    id: 'nose-m', name: 'Nose cone, 0.625 m', nameTh: 'หัวกรวย 0.625 ม.', category: 'aero', tier: 2, shape: 'nose',
    w: 0.625, h: 0.7, nodes: [bottom(0.7, 'medium')],
    structure: { kind: 'cone', d: 0.625, l: 0.7, wall: 0.004 }, materials: ALL, material: 'aluminium',
    description: 'Blunt cap for 0.625 m stacks.',
  },
  {
    id: 'nose-l', name: 'Nose cone, 1.25 m', nameTh: 'หัวกรวย 1.25 ม.', category: 'aero', tier: 2, shape: 'nose',
    w: 1.25, h: 1.0, nodes: [bottom(1.0, 'large')],
    structure: { kind: 'cone', d: 1.25, l: 1.0, wall: 0.005 }, materials: ALL, material: 'aluminium',
    description: 'Short, blunt cap for 1.25 m stacks.',
  },
  {
    id: 'nose-ogive', name: 'Ogive nose, 1.25 m', nameTh: 'หัวกรวยโค้ง 1.25 ม.', category: 'aero', tier: 3, shape: 'nose-ogive',
    w: 1.25, h: 2.0, nodes: [bottom(2.0, 'large')],
    structure: { kind: 'cone', d: 1.25, l: 2.0, wall: 0.005 }, materials: ALL, material: 'aluminium',
    description: 'Long tangent-ogive: less drag through the sound barrier, more mass.',
  },
  {
    id: 'fin-s', name: 'Small fin', nameTh: 'ครีบเล็ก', category: 'aero', tier: 1, shape: 'fin',
    w: 0.3, h: 0.45, nodes: [root(0.3)], structure: { kind: 'plate', area: 0.07, thickness: 0.008, rootChord: 0.45, span: 0.3 },
    materials: ['paper', ...ALL], material: 'bamboo', aero: true, asymmetric: true,
    description: 'Trapezoid fin for small rockets. Flip it to mount on the other side.',
  },
  {
    id: 'fin-canted', name: 'Canted fin', nameTh: 'ครีบเอียง', category: 'aero', tier: 1, shape: 'fin',
    w: 0.3, h: 0.45, nodes: [root(0.3)], structure: { kind: 'plate', area: 0.07, thickness: 0.008, rootChord: 0.45, span: 0.3 },
    materials: ['paper', ...ALL], material: 'bamboo', aero: true, asymmetric: true, cantDeg: 4,
    description: 'Small fin set 4° off the axis: the airflow spins the rocket like a Talai, and spin resists tumbling.',
  },
  {
    id: 'fin-swept', name: 'Swept fin', nameTh: 'ครีบลู่', category: 'aero', tier: 2, shape: 'fin-swept',
    w: 0.6, h: 0.9, nodes: [root(0.6, 0.1)], structure: { kind: 'plate', area: 0.3, thickness: 0.015, rootChord: 0.9, span: 0.6 },
    materials: ALL, material: 'aluminium', aero: true, asymmetric: true,
    description: 'Swept-back fin: moves the centre of pressure well aft.',
  },
  {
    id: 'fin-delta', name: 'Large delta fin', nameTh: 'ครีบสามเหลี่ยมใหญ่', category: 'aero', tier: 2, shape: 'fin-delta',
    w: 0.9, h: 1.6, nodes: [root(0.9, 0.2)], structure: { kind: 'plate', area: 0.7, thickness: 0.02, rootChord: 1.6, span: 0.9 },
    materials: ALL, material: 'aluminium', aero: true, asymmetric: true,
    description: 'Big stabiliser for 1.25 m vehicles. Heavy if you make it from steel.',
  },
  {
    id: 'wing-seg', name: 'Wing segment', nameTh: 'ท่อนปีก', category: 'aero', tier: 3, shape: 'wing',
    w: 1.0, h: 0.5, nodes: [root(1.0), { id: 'tip', x: 0.5, y: 0, nx: 1, ny: 0, size: 'radial' }],
    structure: { kind: 'plate', area: 0.5, thickness: 0.03, rootChord: 0.5, span: 1.0 },
    materials: ALL, material: 'aluminium', aero: true, asymmetric: true,
    description: 'Structural wing panel; chain several end to end.',
  },
  {
    id: 'wing-delta', name: 'Delta wing', nameTh: 'ปีกสามเหลี่ยม', category: 'aero', tier: 3, shape: 'wing-delta',
    w: 1.5, h: 1.8, nodes: [root(1.5, -0.1)], structure: { kind: 'plate', area: 1.35, thickness: 0.03, rootChord: 1.8, span: 1.5 },
    materials: ALL, material: 'aluminium', aero: true, asymmetric: true,
    description: 'Lifting delta for winged vehicles and gliders.',
  },

  /* ---------- Fuel tanks (kerosene / liquid oxygen) ---------- */
  ...([
    ['tank-xs', 'Tank, tiny', 'ถังจิ๋ว', 0.625, 0.5, 'medium', 0.003, 2],
    ['tank-s', 'Tank, small', 'ถังเล็ก', 0.625, 1.0, 'medium', 0.003, 2],
    ['tank-m', 'Tank, medium', 'ถังกลาง', 1.25, 1.25, 'large', 0.004, 2],
    ['tank-l', 'Tank, large', 'ถังใหญ่', 1.25, 2.5, 'large', 0.004, 2],
    ['tank-xl', 'Tank, extra large', 'ถังใหญ่พิเศษ', 1.25, 4.0, 'large', 0.005, 3],
  ] as const).map(([id, name, nameTh, d, l, size, wall, tier]): FactoryPartDef => ({
    id, name, nameTh, category: 'tanks', tier, shape: 'tank', w: d, h: l,
    nodes: [top(l, size), bottom(l, size), ...sides(d)],
    structure: { kind: 'tube', d, l, wall, caps: true },
    materials: ALL, material: 'aluminium', tank: { volume: tankVol(d, l) }, pressure: 0.3,
    description: `${d} m kerosene / liquid-oxygen tank. Pressurised to 0.3 MPa — watch materials that split under pressure.`,
  })),
  {
    id: 'tank-radial', name: 'Radial tank', nameTh: 'ถังติดข้าง', category: 'tanks', tier: 2, shape: 'tank-radial',
    w: 0.5, h: 1.2, nodes: [root(0.5)],
    structure: { kind: 'tube', d: 0.5, l: 1.2, wall: 0.003, caps: true },
    materials: ALL, material: 'aluminium', tank: { volume: tankVol(0.5, 1.0) }, pressure: 0.3, asymmetric: true,
    description: 'Strap-on tank for the side of a stack. Flip to mount on the left.',
  },
  {
    id: 'tank-adapter', name: 'Adapter tank 1.25→0.625', nameTh: 'ถังลดขนาด', category: 'tanks', tier: 2, shape: 'tank-adapter',
    w: 1.25, h: 1.0, nodes: [top(1.0, 'medium'), bottom(1.0, 'large')],
    structure: { kind: 'cone', d: 1.25, l: 1.0, wall: 0.004 },
    materials: ALL, material: 'aluminium', tank: { volume: (Math.PI * 1.0 * (0.39 + 0.195 + 0.098)) / 3 }, pressure: 0.3,
    description: 'Tapers a 1.25 m stack to 0.625 m while still carrying propellant.',
  },

  /* ---------- Propulsion ---------- */
  {
    id: 'gunpowder-tube', name: 'Wan Hu rocket tube', nameTh: 'กระบอกจรวดว่านหู่', category: 'propulsion', tier: 1, shape: 'tube',
    w: 0.05, h: 0.45, nodes: [top(0.45, 'tiny'), ...sides(0.05, 0.05)],
    structure: { kind: 'tube', d: 0.05, l: 0.45, wall: 0.004 }, materials: ['paper', 'bamboo', 'aluminium', 'steel', 'carbon'], material: 'paper',
    engine: { kind: 'solid', grade: 'fast-powder', propellant: 0.15, baseBurn: 2.6 }, pressure: 0.6,
    description: 'Hand-rolled tube. Clip under a seat or side by side to build a cluster.',
  },
  {
    id: 'bang-fai', name: 'Bang Fai tube', nameTh: 'บั้งไฟ', category: 'propulsion', tier: 1, shape: 'bangfai',
    w: 0.12, h: 2.0, nodes: [top(2.0, 'small'), ...sides(0.12, -0.6)],
    structure: { kind: 'tube', d: 0.12, l: 2.0, wall: 0.012 }, materials: ALL, material: 'bamboo',
    engine: { kind: 'solid', grade: 'slow-powder', propellant: 18, baseBurn: 48 }, pressure: 2.0, thrustTrim: true,
    description: 'Long, slow-burning motor — TWR only just above 1 in bamboo. Its nozzle is carved off-centre (as village builders do) so the thrust line runs through the centre of mass even with a tail stick lashed on one side.',
  },
  {
    id: 'cast-motor', name: 'Cast-grain motor', nameTh: 'มอเตอร์เชื้อเพลิงหล่อ', category: 'propulsion', tier: 1, shape: 'cast-motor',
    w: 0.06, h: 0.5, nodes: [top(0.5, 'tiny'), ...sides(0.06, 0.05)],
    structure: { kind: 'tube', d: 0.06, l: 0.5, wall: 0.003 }, materials: ['paper', ...ALL], material: 'paper',
    engine: { kind: 'solid', grade: 'cast-grain', propellant: 1.2, baseBurn: 3 }, pressure: 3,
    description: 'Solid cast grain in a stiff case. Efficient and punchy for its size.',
  },
  {
    id: 'srb-s', name: 'Solid booster, small', nameTh: 'บูสเตอร์แข็งเล็ก', category: 'propulsion', tier: 3, shape: 'srb',
    w: 0.3, h: 1.5, nodes: [top(1.5, 'small'), ...sides(0.3)],
    structure: { kind: 'tube', d: 0.3, l: 1.5, wall: 0.004 }, materials: ['steel', 'aluminium', 'titanium', 'carbon'], material: 'steel',
    engine: { kind: 'srb', propellant: 170, burnTime: 20 }, pressure: 5, fixedCost: 150_000,
    description: 'Composite solid booster. Once lit, it burns to the end.',
  },
  {
    id: 'srb-l', name: 'Solid booster, large', nameTh: 'บูสเตอร์แข็งใหญ่', category: 'propulsion', tier: 3, shape: 'srb',
    w: 0.625, h: 3.2, nodes: [top(3.2, 'medium'), ...sides(0.625)],
    structure: { kind: 'tube', d: 0.625, l: 3.2, wall: 0.008 }, materials: ['steel', 'aluminium', 'titanium', 'carbon'], material: 'steel',
    engine: { kind: 'srb', propellant: 1600, burnTime: 35 }, pressure: 5, fixedCost: 900_000,
    description: 'Strap-on booster for a 1.25 m core. Use radial decouplers and mirror it.',
  },
  {
    id: 'engine-pf', name: 'Pressure-fed engine', nameTh: 'เครื่องยนต์ป้อนด้วยแรงดัน', category: 'propulsion', tier: 2, shape: 'engine-small',
    w: 0.625, h: 0.6, nodes: [top(0.6, 'medium')],
    structure: { kind: 'solid', volume: 0, loadArea: 0.004 }, materials: null, material: 'steel',
    engine: { kind: 'liquid', thrustSL: 12_000, thrustVac: 15_000, ispSL: 230, ispVac: 280 , gimbalDeg: 8 }, fixedMass: 120, fixedCost: 400_000,
    description: 'Goddard-era simplicity: tank pressure pushes the propellant. Small and forgiving.',
  },
  {
    id: 'engine-lv45', name: 'LV-45 liquid engine', nameTh: 'เครื่องยนต์เหลว LV-45', category: 'propulsion', tier: 2, shape: 'engine',
    w: 1.25, h: 1.25, nodes: [top(1.25, 'large'), bottom(1.25, 'large'), ...sides(1.25, 0.1, '-skirt')],
    structure: { kind: 'solid', volume: 0, loadArea: 0.02 }, materials: null, material: 'steel',
    engine: { kind: 'liquid', thrustSL: 168_000, thrustVac: 215_000, ispSL: 250, ispVac: 320, gimbalDeg: 6 }, fixedMass: 1500, fixedCost: 3_000_000,
    description: 'Gimballed workhorse. Draws from the tanks above it.',
  },
  {
    id: 'engine-tp', name: 'Turbopump engine', nameTh: 'เครื่องยนต์เทอร์โบปั๊ม', category: 'propulsion', tier: 2, shape: 'engine-turbo',
    w: 1.25, h: 1.6, nodes: [top(1.6, 'large'), bottom(1.6, 'large'), ...sides(1.25, 0.45, '-skirt')],
    structure: { kind: 'solid', volume: 0, loadArea: 0.025 }, materials: null, material: 'steel',
    engine: { kind: 'liquid', thrustSL: 260_000, thrustVac: 300_000, ispSL: 265, ispVac: 300 , gimbalDeg: 5 }, fixedMass: 1900, fixedCost: 4_500_000,
    description: 'Turbopumps force propellant in at high pressure — the 1940s leap that made big rockets possible.',
  },
  {
    id: 'engine-modern', name: 'Modern kerolox engine', nameTh: 'เครื่องยนต์เหลวรุ่นใหม่', category: 'propulsion', tier: 4, shape: 'engine-turbo',
    w: 1.25, h: 1.5, nodes: [top(1.5, 'large'), bottom(1.5, 'large'), ...sides(1.25, 0.4, '-skirt')],
    structure: { kind: 'solid', volume: 0, loadArea: 0.03 }, materials: null, material: 'steel',
    engine: { kind: 'liquid', thrustSL: 620_000, thrustVac: 690_000, ispSL: 282, ispVac: 311, gimbalDeg: 5 }, fixedMass: 470, fixedCost: 9_000_000,
    description: 'Gas-generator engine with a modern thrust-to-weight of ~130:1 (the old LV-45 manages 11:1). This is what makes a real-size orbit possible.',
  },
  {
    id: 'engine-vac-modern', name: 'Modern vacuum engine', nameTh: 'เครื่องยนต์สุญญากาศรุ่นใหม่', category: 'propulsion', tier: 4, shape: 'engine-vac',
    w: 1.25, h: 1.9, nodes: [top(1.9, 'large'), bottom(1.9, 'large')],
    structure: { kind: 'solid', volume: 0, loadArea: 0.02 }, materials: null, material: 'steel',
    engine: { kind: 'liquid', thrustSL: 90_000, thrustVac: 260_000, ispSL: 120, ispVac: 345, gimbalDeg: 4 }, fixedMass: 480, fixedCost: 8_000_000,
    description: 'Huge nozzle for vacuum: weak at sea level, 260 kN and Isp 345 s in space. Upper stages only.',
  },
  {
    id: 'engine-vac', name: 'Vacuum engine', nameTh: 'เครื่องยนต์สุญญากาศ', category: 'propulsion', tier: 3, shape: 'engine-vac',
    w: 0.625, h: 1.0, nodes: [top(1.0, 'medium'), bottom(1.0, 'medium')],
    structure: { kind: 'solid', volume: 0, loadArea: 0.004 }, materials: null, material: 'steel',
    engine: { kind: 'liquid', thrustSL: 20_000, thrustVac: 60_000, ispSL: 120, ispVac: 345 , gimbalDeg: 4 }, fixedMass: 400, fixedCost: 2_500_000,
    description: 'Huge bell for upper stages. Terrible at sea level, superb in space.',
  },

  /* ---------- Structural ---------- */
  {
    id: 'truss', name: 'Scaffold truss', nameTh: 'โครงนั่งร้าน', category: 'structural', tier: 1, shape: 'truss',
    w: 0.2, h: 1.0, nodes: [top(1.0, 'small'), bottom(1.0, 'small'), ...sides(0.2)],
    structure: { kind: 'frame', members: 4, memberArea: 0.0002, length: 1.1 }, materials: ALL, material: 'aluminium',
    description: 'Open frame to space parts apart or build a launch-tower-style spine.',
  },
  {
    id: 'decoupler-m', name: 'Decoupler, 0.625 m', nameTh: 'ตัวแยกชั้น 0.625 ม.', category: 'structural', tier: 2, shape: 'decoupler',
    w: 0.625, h: 0.15, nodes: [top(0.15, 'medium'), bottom(0.15, 'medium')],
    structure: { kind: 'ring', d: 0.625, h: 0.15, wall: 0.01 }, materials: ALL, material: 'aluminium', fixedCost: 50_000,
    description: 'Separates stages. Everything below it drops away when fired.',
  },
  {
    id: 'decoupler-l', name: 'Decoupler, 1.25 m', nameTh: 'ตัวแยกชั้น 1.25 ม.', category: 'structural', tier: 2, shape: 'decoupler',
    w: 1.25, h: 0.2, nodes: [top(0.2, 'large'), bottom(0.2, 'large')],
    structure: { kind: 'ring', d: 1.25, h: 0.2, wall: 0.012 }, materials: ALL, material: 'aluminium', fixedCost: 80_000,
    description: 'Separates 1.25 m stages.',
  },
  {
    id: 'decoupler-radial', name: 'Radial decoupler', nameTh: 'ตัวแยกด้านข้าง', category: 'structural', tier: 3, shape: 'decoupler-radial',
    w: 0.15, h: 0.4, nodes: [root(0.15), { id: 'out', x: 0.075, y: 0, nx: 1, ny: 0, size: 'radial' }],
    structure: { kind: 'solid', volume: 0.004, loadArea: 0.003 }, materials: ALL, material: 'steel', fixedCost: 40_000, asymmetric: true,
    description: 'Holds a side booster or tank, then lets go.',
  },
  {
    id: 'fairing-l', name: 'Payload fairing, 1.25 m', nameTh: 'ครอบส่วนบรรทุก', category: 'structural', tier: 3, shape: 'fairing',
    w: 1.25, h: 2.4, nodes: [bottom(2.4, 'large')],
    structure: { kind: 'cone', d: 1.25, l: 2.4, wall: 0.003 }, materials: ALL, material: 'aluminium',
    description: 'Empty aerodynamic shell to protect a payload on the way up.',
  },
  {
    id: 'adapter', name: 'Adapter 1.25→0.625', nameTh: 'ข้อต่อลดขนาด', category: 'structural', tier: 2, shape: 'adapter',
    w: 1.25, h: 0.5, nodes: [top(0.5, 'medium'), bottom(0.5, 'large')],
    structure: { kind: 'cone', d: 1.25, l: 0.5, wall: 0.006 }, materials: ALL, material: 'aluminium',
    description: 'Structural taper between stack sizes.',
  },
  {
    id: 'tail-stick', name: 'Tail stick', nameTh: 'หางบั้งไฟ', category: 'structural', tier: 1, shape: 'stick',
    w: 0.04, h: 4.0, nodes: sides(0.04, 1.7),
    structure: { kind: 'tube', d: 0.04, l: 4.0, wall: 0.004 }, materials: ['bamboo', 'aluminium', 'carbon', 'steel'], material: 'bamboo',
    description: 'Lashed alongside a Bang Fai: drags the centre of pressure behind the centre of mass.',
  },
  {
    id: 'heat-shield', name: 'Heat shield', nameTh: 'โล่กันความร้อน', category: 'structural', tier: 3, shape: 'shield',
    w: 1.25, h: 0.2, nodes: [top(0.2, 'large'), bottom(0.2, 'large')],
    structure: { kind: 'ring', d: 1.25, h: 0.2, wall: 0.02 }, materials: ['carbon', 'titanium', 'steel'], material: 'carbon', fixedMass: 60, heatShield: true,
    description: 'The part the 1957 team forgot. Goes under the pod.',
  },
  /* ---------- Recovery ---------- */
  {
    id: 'chute-s', name: 'Parachute, small', nameTh: 'ร่มชูชีพเล็ก', category: 'recovery', tier: 1, shape: 'chute',
    w: 0.22, h: 0.22, nodes: [bottom(0.22, 'tiny')],
    structure: { kind: 'solid', volume: 0.0005, loadArea: 0.001 }, materials: null, material: 'aluminium', fixedMass: 4, fixedCost: 8_000,
    chute: { diameter: 6, maxSpeed: 180 },
    description: 'Six-metre canopy on a tiny mount — fits the chair’s kite posts. Brings a chair and one zombie down at about 7 m/s.',
  },
  {
    id: 'chute-m', name: 'Parachute, 0.625 m', nameTh: 'ร่มชูชีพกลาง', category: 'recovery', tier: 2, shape: 'chute',
    w: 0.5, h: 0.35, nodes: [bottom(0.35, 'medium')],
    structure: { kind: 'solid', volume: 0.002, loadArea: 0.004 }, materials: null, material: 'aluminium', fixedMass: 15, fixedCost: 40_000,
    chute: { diameter: 10, maxSpeed: 250 },
    description: 'Ten-metre canopy for 0.625 m stacks. Opens below about 250 m/s.',
  },
  {
    id: 'chute-l', name: 'Parachute, 1.25 m', nameTh: 'ร่มชูชีพใหญ่', category: 'recovery', tier: 3, shape: 'chute',
    w: 0.9, h: 0.4, nodes: [bottom(0.4, 'large')],
    structure: { kind: 'solid', volume: 0.004, loadArea: 0.01 }, materials: null, material: 'aluminium', fixedMass: 45, fixedCost: 120_000,
    chute: { diameter: 18, maxSpeed: 250 },
    description: 'Eighteen-metre main for the Mk1 pod. Open it too fast and it shreds.',
  },
  {
    id: 'chute-r', name: 'Radial parachute', nameTh: 'ร่มชูชีพข้าง', category: 'recovery', tier: 2, shape: 'chute-radial',
    w: 0.15, h: 0.45, nodes: [root(0.15)],
    structure: { kind: 'solid', volume: 0.001, loadArea: 0.002 }, materials: null, material: 'aluminium', fixedMass: 8, fixedCost: 30_000,
    chute: { diameter: 7, maxSpeed: 220 }, asymmetric: true,
    description: 'Side-mounted seven-metre canopy. Use a mirrored pair so it hangs straight.',
  },
  {
    id: 'kite', name: 'Kite', nameTh: 'ว่าว', category: 'structural', tier: 1, shape: 'kite',
    w: 0.6, h: 0.7, nodes: [bottom(0.7, 'tiny')], hull: [{ x: 0, y: 0, w: 0.4, h: 0.6 }],
    structure: { kind: 'plate', area: 0.2, thickness: 0.003, rootChord: 0.3, span: 0.6 }, materials: ['paper', 'bamboo'], material: 'paper',
    description: 'Wan Hu’s descent plan. Mounts on top of the chair back. Optimistic.',
  },
];

export const PART = Object.fromEntries(CATALOG.map((p) => [p.id, p])) as Record<string, FactoryPartDef>;

export const CATEGORY_LABEL: Record<Category, { en: string; th: string }> = {
  lantern: { en: 'Lantern factory · Tier 0', th: 'โรงงานโคมลอย' },
  command: { en: 'Command', th: 'ห้องโดยสาร' },
  payload: { en: 'Payloads (3D)', th: 'สัมภาระ 3 มิติ' },
  aero: { en: 'Aerodynamics', th: 'อากาศพลศาสตร์' },
  tanks: { en: 'Fuel tanks', th: 'ถังเชื้อเพลิง' },
  propulsion: { en: 'Propulsion', th: 'ระบบขับเคลื่อน' },
  structural: { en: 'Structural', th: 'โครงสร้าง' },
  recovery: { en: 'Recovery', th: 'ระบบกู้คืน' },
};

/**
 * Can two facing nodes join? Same size always; a radial (surface) mount only
 * on the side of a part — never on a top/bottom stack node — so fins and
 * boosters can't end up standing on top of a tank.
 */
export function nodesCompatible(a: NodeSize, b: NodeSize, normalY = 0) {
  if (a === b) return true;
  return (a === 'radial' || b === 'radial') && Math.abs(normalY) < 0.1;
}

/** Melting / burning point of each material (°C) — re-entry heating destroys a part past this */
export const MELT_C: Record<string, number> = {
  paper: 230, bamboo: 300, wood: 300, aluminium: 660, steel: 1450, titanium: 1650, carbon: 450,
};
export const meltPoint = (def: FactoryPartDef, mat?: string) =>
  def.heatShield ? 3000 : def.chute ? 1200 /* canister under a cork-insulated cover */ : MELT_C[materialFor(def, mat).id] ?? 800;

/** Firework salts a solid motor can carry (flame-test colours from the chemistry lab) */
export const SALTS = ['Sr', 'Ba', 'Cu', 'Na', 'Li'] as const;
export type Salt = (typeof SALTS)[number];
