/**
 * Structural materials. Values are representative textbook figures, rounded —
 * good enough to make bamboo behave like bamboo and titanium like titanium.
 *
 * The factory's core formulas:
 *   dry mass  = shape volume × density
 *   cost      = shape volume × pricePerM3
 *   capacity  = shape load area × strength (derated by heat, and by grain direction for pressure)
 */
import type { TechTier } from './parts';

export interface Material {
  id: string;
  name: string;
  nameTh: string;
  short: string;          // 2-letter tag for compact UI
  tier: TechTier;
  /** kg/m³ */
  density: number;
  /** MPa, along the grain / fibre / rolling direction */
  strength: number;
  /**
   * 0 = isotropic (metals). 0.9 = across-grain strength is only 10% of
   * along-grain (bamboo splits lengthwise under internal pressure).
   */
  anisotropy: number;
  /** °C where strength starts dropping fast (charring, softening, resin glass transition) */
  maxServiceTemp: number;
  /** Weibull modulus: scatter in strength between individual parts (low = unpredictable) */
  weibullModulus: number;
  /** 0–1: how much humidity weakens it (Bangkok in August matters for bamboo) */
  moistureSensitivity: number;
  /** Relative cost per kg (legacy) */
  costPerKg: number;
  /** Game price in baht per cubic metre of material — cost = volume × this */
  pricePerM3: number;
  color: string;
  colorDark: string;
  note: string;
}

export const MATERIALS: Record<string, Material> = {
  paper: {
    id: 'paper', name: 'Laminated paper', nameTh: 'กระดาษอัด', short: 'Pa', tier: 1,
    density: 700, strength: 30, anisotropy: 0.3, maxServiceTemp: 180,
    weibullModulus: 5, moistureSensitivity: 0.8, costPerKg: 1, pricePerM3: 14_000,
    color: '#e6d3a8', colorDark: '#b89c63',
    note: 'Cheap and light; chars quickly and goes soft when damp.',
  },
  bamboo: {
    id: 'bamboo', name: 'Bamboo', nameTh: 'ไม้ไผ่', short: 'Ba', tier: 1,
    density: 700, strength: 150, anisotropy: 0.9, maxServiceTemp: 200,
    weibullModulus: 6, moistureSensitivity: 0.6, costPerKg: 1, pricePerM3: 7_000,
    color: '#d9c27e', colorDark: '#a28a45',
    note: 'Steel-like along the fibres, weak across them — splits under internal pressure. Almost free.',
  },
  wood: {
    id: 'wood', name: 'Hardwood', nameTh: 'ไม้เนื้อแข็ง', short: 'Wd', tier: 1,
    density: 750, strength: 90, anisotropy: 0.8, maxServiceTemp: 250,
    weibullModulus: 8, moistureSensitivity: 0.5, costPerKg: 2, pricePerM3: 30_000,
    color: '#a8743f', colorDark: '#76502a',
    note: 'Wan Hu’s chair. Heavy for its strength, and it burns.',
  },
  steel: {
    id: 'steel', name: 'Steel', nameTh: 'เหล็กกล้า', short: 'St', tier: 2,
    density: 7850, strength: 460, anisotropy: 0, maxServiceTemp: 500,
    weibullModulus: 30, moistureSensitivity: 0, costPerKg: 4, pricePerM3: 240_000,
    color: '#8e98a4', colorDark: '#5d6670',
    note: 'Strong and heat-tolerant — and nearly three times heavier than aluminium. Ruins thrust-to-weight.',
  },
  aluminium: {
    id: 'aluminium', name: 'Aluminium', nameTh: 'อะลูมิเนียม', short: 'Al', tier: 2,
    density: 2800, strength: 280, anisotropy: 0, maxServiceTemp: 150,
    weibullModulus: 25, moistureSensitivity: 0, costPerKg: 6, pricePerM3: 300_000,
    color: '#d4d9df', colorDark: '#9aa2ab',
    note: 'The aerospace default: light, reasonably strong, affordable. Weakens above ~150 °C.',
  },
  titanium: {
    id: 'titanium', name: 'Titanium', nameTh: 'ไทเทเนียม', short: 'Ti', tier: 3,
    density: 4430, strength: 880, anisotropy: 0, maxServiceTemp: 400,
    weibullModulus: 30, moistureSensitivity: 0, costPerKg: 40, pricePerM3: 6_600_000,
    color: '#8f93b0', colorDark: '#5e6283',
    note: 'Exceptional strength and heat resistance. Expensive and slow to machine.',
  },
  carbon: {
    id: 'carbon', name: 'Carbon fibre', nameTh: 'คาร์บอนไฟเบอร์', short: 'CF', tier: 4,
    density: 1600, strength: 600, anisotropy: 0.5, maxServiceTemp: 120,
    weibullModulus: 15, moistureSensitivity: 0.05, costPerKg: 60, pricePerM3: 11_000_000,
    color: '#3a3f47', colorDark: '#1f2328',
    note: 'Lightest for its strength by far — at an astronomical price. The resin is the weak point when hot.',
  },
};

/** The five materials the player can pick for structures and tanks */
export const CORE_MATERIALS = ['bamboo', 'steel', 'aluminium', 'titanium', 'carbon'] as const;
