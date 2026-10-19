/**
 * Part catalogue. Units are SI throughout: kg, N, s.
 * Numbers are simplified but in realistic ranges so the maths "feels" right.
 *
 * Grid units: 1 cell = 0.625 m (so a 2-cell-wide part ≈ 1.25 m diameter).
 */

export type PartCategory = 'command' | 'fuel' | 'engine';
export type TechTier = 1 | 2 | 3 | 4;

export interface PartDef {
  id: string;
  name: string;
  nameTh: string;
  category: PartCategory;
  tier: TechTier;
  /** Footprint in grid cells */
  w: number;
  h: number;
  /** Mass with no propellant (kg) */
  dryMass: number;
  /** Propellant capacity (kg). 0 for parts that hold none. */
  propellant: number;
  /** Engine-only fields */
  thrustSL?: number;   // N at sea level
  thrustVac?: number;  // N in vacuum
  ispSL?: number;      // s
  ispVac?: number;     // s
  color: string;
  description: string;
}

export const CELL_METERS = 0.625;
export const G0 = 9.80665; // standard gravity, m/s²

export const PARTS: Record<string, PartDef> = {
  'pod-mk1': {
    id: 'pod-mk1',
    name: 'Mk1 Command Pod',
    nameTh: 'ห้องโดยสาร Mk1',
    category: 'command',
    tier: 3,
    w: 2, h: 2,
    dryMass: 840,
    propellant: 0,
    color: '#d9dee7',
    description: 'One seat, one window, zero legroom. Remember the heat shield this time.',
  },
  'tank-t400': {
    id: 'tank-t400',
    name: 'T-400 Fuel Tank',
    nameTh: 'ถังเชื้อเพลิง T-400',
    category: 'fuel',
    tier: 2,
    w: 2, h: 3,
    dryMass: 250,
    propellant: 2000,
    color: '#e8e2d4',
    description: 'Kerosene + liquid oxygen. Stack several for more Δv (with diminishing returns).',
  },
  'engine-lv45': {
    id: 'engine-lv45',
    name: 'LV-45 Liquid Engine',
    nameTh: 'เครื่องยนต์เหลว LV-45',
    category: 'engine',
    tier: 2,
    w: 2, h: 2,
    dryMass: 1500,
    propellant: 0,
    thrustSL: 168_000,
    thrustVac: 215_000,
    ispSL: 250,
    ispVac: 320,
    color: '#8a929e',
    description: 'Reliable, gimballed, slightly temperamental on humid Bangkok mornings.',
  },
};

export const STARTER_PARTS = ['pod-mk1', 'tank-t400', 'engine-lv45'] as const;
