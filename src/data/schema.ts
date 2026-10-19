/**
 * Part schema v2 — parts are built from a material + geometry, so mass and
 * strength come out of the physics instead of being typed in by hand.
 * Swap bamboo for titanium on the same part and the numbers change on their own.
 *
 * (v1 `PartDef` in parts.ts stays until the factory is migrated in the next step.)
 */
import type { TechTier } from './parts';

export type PartCategoryV2 = 'command' | 'seat' | 'tank' | 'engine' | 'motor' | 'structure' | 'fin';
export type AttachSide = 'top' | 'bottom' | 'left' | 'right';
export type NodeSize = 'tiny' | 'small' | 'medium' | 'large';

/** Snap point. Two parts connect when sides face each other and sizes match. */
export interface AttachNode {
  side: AttachSide;
  /** Position along the side, in cells from its start */
  offset: number;
  size: NodeSize;
}

export interface ShellGeometry {
  diameterM: number;
  lengthM: number;
  /** Wall thickness of the tube/casing */
  wallM: number;
}

export interface TankSpec {
  propellantId: string;
  volumeM3: number;
}

export interface EngineSpec {
  propellantId: string;
  thrustSL: number;  // N
  thrustVac: number; // N
  /** Max gimbal angle, degrees (0 for early tech) */
  gimbalDeg: number;
  /** Solid motors: fixed burn duration once lit (s). Liquid engines: undefined. */
  burnTimeS?: number;
  /**
   * Illustrative casing pressure (MPa) used only to stress-test the casing
   * material. Not a design value.
   */
  casingPressureMPa?: number;
  /** Multiplies the propellant's base reliability (0–1); hand-made parts < 1 */
  craftsmanship: number;
}

export interface PartV2 {
  id: string;
  name: string;
  nameTh: string;
  category: PartCategoryV2;
  tier: TechTier;
  w: number;
  h: number;
  nodes: AttachNode[];
  materialId: string;
  shell: ShellGeometry;
  /** Mass not coming from the shell: crew, electronics, the chair's occupant… (kg) */
  fixedMass?: number;
  tank?: TankSpec;
  /** Solid motors carry both: a tank (the propellant grain) and an engine */
  engine?: EngineSpec;
  /** Side-on area for centre-of-pressure maths (m²). Defaults to diameter × length. */
  lateralAreaM2?: number;
  /** Fins / tail sticks: extra lateral area concentrated at this part */
  finAreaM2?: number;
  description: string;
}

/* ---------- Tier 1 catalogue ---------- */

export const TIER1_PARTS: Record<string, PartV2> = {
  'wan-hu-chair': {
    id: 'wan-hu-chair', name: 'Wan Hu’s Chair', nameTh: 'เก้าอี้ว่านหู่', category: 'seat', tier: 1,
    w: 4, h: 3,
    nodes: [
      { side: 'left', offset: 1, size: 'tiny' },
      { side: 'right', offset: 1, size: 'tiny' },
      { side: 'bottom', offset: 1, size: 'tiny' },
      { side: 'bottom', offset: 2, size: 'tiny' },
    ],
    materialId: 'wood',
    shell: { diameterM: 0.6, lengthM: 1.0, wallM: 0.012 },
    fixedMass: 70, // one ambitious official, plus two kites
    description: 'A sturdy wooden chair with 47 rocket mounts. Kites included for the descent. Theoretically.',
  },
  'gunpowder-rocket': {
    id: 'gunpowder-rocket', name: 'Black-powder Rocket', nameTh: 'จรวดดินดำ', category: 'motor', tier: 1,
    w: 1, h: 2,
    nodes: [{ side: 'top', offset: 0, size: 'tiny' }],
    materialId: 'paper',
    shell: { diameterM: 0.05, lengthM: 0.45, wallM: 0.004 },
    // 0.15 kg × Isp 80 s × g₀ / 45 N ≈ 2.6 s burn — matches burnTimeS
    tank: { propellantId: 'black-powder', volumeM3: 0.00015 },
    engine: {
      propellantId: 'black-powder', thrustSL: 45, thrustVac: 50, gimbalDeg: 0,
      burnTimeS: 2.5, casingPressureMPa: 0.6, craftsmanship: 0.9,
    },
    description: 'Hand-rolled, hand-lit, hand-wringing. Each one is a little different.',
  },
  'bang-fai-bamboo': {
    id: 'bang-fai-bamboo', name: 'Bang Fai (bamboo casing)', nameTh: 'บั้งไฟ (กระบอกไม้ไผ่)', category: 'motor', tier: 1,
    w: 1, h: 6,
    nodes: [{ side: 'top', offset: 0, size: 'small' }, { side: 'bottom', offset: 0, size: 'small' }],
    materialId: 'bamboo',
    shell: { diameterM: 0.12, lengthM: 2.0, wallM: 0.01 },
    tank: { propellantId: 'black-powder', volumeM3: 0.018 },
    engine: {
      propellantId: 'black-powder', thrustSL: 1500, thrustVac: 1650, gimbalDeg: 0,
      burnTimeS: 9, casingPressureMPa: 2.0, craftsmanship: 0.85,
    },
    description: 'The traditional build. Beautiful, light — and the casing may split along the grain.',
  },
  'bang-fai-steel': {
    id: 'bang-fai-steel', name: 'Bang Fai (steel casing)', nameTh: 'บั้งไฟ (ท่อเหล็ก)', category: 'motor', tier: 1,
    w: 1, h: 6,
    nodes: [{ side: 'top', offset: 0, size: 'small' }, { side: 'bottom', offset: 0, size: 'small' }],
    materialId: 'steel',
    shell: { diameterM: 0.12, lengthM: 2.0, wallM: 0.003 },
    tank: { propellantId: 'black-powder', volumeM3: 0.018 },
    engine: {
      propellantId: 'black-powder', thrustSL: 1500, thrustVac: 1650, gimbalDeg: 0,
      burnTimeS: 9, casingPressureMPa: 2.0, craftsmanship: 0.95,
    },
    description: 'Festival teams’ modern upgrade: the casing survives; the extra mass costs altitude.',
  },
  'tail-stick': {
    id: 'tail-stick', name: 'Bamboo Tail Stick', nameTh: 'หางบั้งไฟ', category: 'fin', tier: 1,
    w: 1, h: 10,
    nodes: [{ side: 'top', offset: 0, size: 'small' }],
    materialId: 'bamboo',
    shell: { diameterM: 0.04, lengthM: 4.0, wallM: 0.004 },
    finAreaM2: 0.05, // the stick plus its lashing/flag; scales with length in tailStick()
    description: 'Long tail that drags the centre of pressure far behind the centre of mass — like the stick on a firework.',
  },
};
