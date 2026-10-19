/**
 * Mass that changes as propellant burns, and structural integrity that depends
 * on the material. All thin-walled-tube approximations (wall ≪ diameter).
 */
import { MATERIALS, type Material } from '@/data/materials';
import { PROPELLANTS } from '@/data/propellants';
import { G0 } from '@/data/parts';
import type { PartV2 } from '@/data/schema';
import type { Rng } from '@/core/rng';

/* ---------------- Mass ---------------- */

/** Tube wall + two end caps. */
export function shellMass(part: PartV2): number {
  const m = MATERIALS[part.materialId];
  const { diameterM: D, lengthM: L, wallM: t } = part.shell;
  const wall = Math.PI * D * L * t;
  const caps = 2 * Math.PI * (D / 2) ** 2 * t;
  return (wall + caps) * m.density;
}

export function dryMass(part: PartV2): number {
  return shellMass(part) + (part.fixedMass ?? 0);
}

export function propellantCapacity(part: PartV2): number {
  if (!part.tank) return 0;
  return part.tank.volumeM3 * PROPELLANTS[part.tank.propellantId].density;
}

/** Runtime state of one placed part during flight. */
export interface PartState {
  def: PartV2;
  propellant: number; // kg remaining
  /** Strength multiplier drawn once per part from the material's Weibull scatter */
  flaw: number;
  temperatureC: number;
  broken: boolean;
  burning: boolean;
  burnElapsed: number;
}

export function createPartState(def: PartV2, rng: Rng): PartState {
  const mat = MATERIALS[def.materialId];
  // Normalise so the median part has flaw ≈ 1.
  const median = Math.pow(Math.LN2, 1 / mat.weibullModulus);
  return {
    def,
    propellant: propellantCapacity(def),
    flaw: rng.weibull(mat.weibullModulus) / median,
    temperatureC: 30,
    broken: false,
    burning: false,
    burnElapsed: 0,
  };
}

export const currentMass = (s: PartState) => dryMass(s.def) + s.propellant;

/**
 * Burn propellant for dt seconds at the given thrust.
 * ṁ = F / (Isp · g₀). Returns kg consumed.
 */
export function consume(s: PartState, thrust: number, isp: number, dt: number): number {
  if (isp <= 0 || thrust <= 0) return 0;
  const used = Math.min(s.propellant, (thrust / (isp * G0)) * dt);
  s.propellant -= used;
  return used;
}

/* ---------------- Strength ---------------- */

export interface Environment {
  /** 0–1 relative humidity */
  humidity: number;
}

/**
 * Effective along-grain strength (MPa) after flaws, humidity and temperature.
 * Temperature: full strength up to 60% of max service temp, linear to zero at 120%.
 */
export function effectiveStrength(mat: Material, s: Pick<PartState, 'flaw' | 'temperatureC'>, env: Environment): number {
  const moisture = 1 - mat.moistureSensitivity * 0.5 * env.humidity;
  const T = s.temperatureC;
  const t0 = 0.6 * mat.maxServiceTemp;
  const t1 = 1.2 * mat.maxServiceTemp;
  const thermal = T <= t0 ? 1 : T >= t1 ? 0 : 1 - (T - t0) / (t1 - t0);
  return mat.strength * s.flaw * moisture * thermal;
}

/** σ = F / (π D t) — compression/tension along the tube */
export const axialStress = (forceN: number, D: number, t: number) => Math.abs(forceN) / (Math.PI * D * t) / 1e6;

/** σ = M·r / I with thin-wall I = π r³ t — from side loads / asymmetric thrust */
export const bendingStress = (momentNm: number, D: number, t: number) => {
  const r = D / 2;
  return (Math.abs(momentNm) * r) / (Math.PI * r ** 3 * t) / 1e6;
};

/** Hoop stress σ = P r / t — internal pressure trying to split the tube lengthwise */
export const hoopStress = (pressureMPa: number, D: number, t: number) => (pressureMPa * (D / 2)) / t;

export type FailureMode = 'axial' | 'bending' | 'hoop' | 'thermal';

export interface IntegrityReport {
  safetyFactor: number;   // < 1 ⇒ breaks
  limitingMode: FailureMode;
  detail: Record<FailureMode, number>; // safety factor per mode
}

/**
 * Check one part under its current loads.
 * Hoop stress uses ACROSS-grain strength — this is where bamboo and wood
 * fall apart while metals don't care (anisotropy 0).
 */
export function checkIntegrity(
  s: PartState,
  loads: { axialN: number; momentNm: number },
  env: Environment,
): IntegrityReport {
  const mat = MATERIALS[s.def.materialId];
  const { diameterM: D, wallM: t } = s.def.shell;
  const along = effectiveStrength(mat, s, env);
  const across = along * (1 - mat.anisotropy);

  const sigA = axialStress(loads.axialN, D, t);
  const sigB = bendingStress(loads.momentNm, D, t);
  const sigH = s.burning && s.def.engine?.casingPressureMPa ? hoopStress(s.def.engine.casingPressureMPa, D, t) : 0;

  const sf = (strength: number, stress: number) => (stress > 0 ? strength / stress : Infinity);
  const detail: Record<FailureMode, number> = {
    axial: sf(along, sigA),
    bending: sf(along, sigA + sigB), // combined on the outer fibre
    hoop: sf(across, sigH),
    thermal: along > 0 ? Infinity : 0,
  };
  const limitingMode = (Object.keys(detail) as FailureMode[]).reduce((a, b) => (detail[a] <= detail[b] ? a : b));
  return { safetyFactor: detail[limitingMode], limitingMode, detail };
}

/** Friendly explanation for the post-flight report. */
export function failureStory(mode: FailureMode, mat: Material): string {
  switch (mode) {
    case 'hoop': return `The ${mat.name.toLowerCase()} casing split along its length. Strong along the grain, weak across it.`;
    case 'bending': return `Uneven thrust bent the ${mat.name.toLowerCase()} until it snapped.`;
    case 'axial': return `The ${mat.name.toLowerCase()} buckled under the acceleration load.`;
    case 'thermal': return `${mat.name} got too hot and lost its strength.`;
  }
}
