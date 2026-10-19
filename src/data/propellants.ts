/**
 * Propellant types as the game sees them: performance numbers only.
 * Compositions are deliberately not modelled — the gameplay depends on
 * Isp, density and reliability, not on recipes.
 */
import type { TechTier } from './parts';

export type PropellantKind = 'solid' | 'liquid' | 'electric';

export interface Propellant {
  id: string;
  name: string;
  nameTh: string;
  kind: PropellantKind;
  tier: TechTier;
  /** Specific impulse, seconds */
  ispSL: number;
  ispVac: number;
  /** Bulk density, kg/m³ — decides how big the tank or casing must be */
  density: number;
  /** Base chance per ignition that the motor works as intended (before quality & material) */
  baseReliability: number;
  /** Solid motors can't be throttled or shut down once lit */
  throttleable: boolean;
  restartable: boolean;
  note: string;
}

export const PROPELLANTS: Record<string, Propellant> = {
  'black-powder': {
    id: 'black-powder', name: 'Black powder', nameTh: 'ดินดำ', kind: 'solid', tier: 1,
    ispSL: 80, ispVac: 90, density: 1000, baseReliability: 0.85,
    throttleable: false, restartable: false,
    note: 'The original rocket propellant. Low performance, inconsistent burn — hence the history of glorious failures.',
  },
  'composite-solid': {
    id: 'composite-solid', name: 'Composite solid', nameTh: 'เชื้อเพลิงแข็งคอมโพสิต', kind: 'solid', tier: 3,
    ispSL: 240, ispVac: 265, density: 1750, baseReliability: 0.985,
    throttleable: false, restartable: false,
    note: 'Modern boosters (e.g. Space Shuttle SRBs). Dense and simple, but once lit it burns to the end.',
  },
  kerolox: {
    id: 'kerolox', name: 'Kerosene / LOX', nameTh: 'เคโรซีน / ออกซิเจนเหลว', kind: 'liquid', tier: 2,
    ispSL: 290, ispVac: 330, density: 1030, baseReliability: 0.97,
    throttleable: true, restartable: true,
    note: 'Saturn V first stage, Soyuz, Falcon 9. Dense, storable fuel side.',
  },
  hydrolox: {
    id: 'hydrolox', name: 'Hydrogen / LOX', nameTh: 'ไฮโดรเจน / ออกซิเจนเหลว', kind: 'liquid', tier: 3,
    ispSL: 360, ispVac: 450, density: 360, baseReliability: 0.96,
    throttleable: true, restartable: true,
    note: 'Highest chemical Isp, but hydrogen is so light the tanks become huge.',
  },
  'hypergolic': {
    id: 'hypergolic', name: 'Hypergolic', nameTh: 'เชื้อเพลิงไฮเปอร์โกลิก', kind: 'liquid', tier: 3,
    ispSL: 285, ispVac: 320, density: 1200, baseReliability: 0.995,
    throttleable: true, restartable: true,
    note: 'Ignites on contact — no igniter to fail. Used for the Apollo lunar ascent engine. Toxic.',
  },
  xenon: {
    id: 'xenon', name: 'Xenon (ion drive)', nameTh: 'ซีนอน (เครื่องยนต์ไอออน)', kind: 'electric', tier: 4,
    ispSL: 0, ispVac: 3000, density: 1600, baseReliability: 0.99,
    throttleable: true, restartable: true,
    note: 'Tiny thrust, enormous Isp. Useless in atmosphere, brilliant for asteroid orbiters.',
  },
};
