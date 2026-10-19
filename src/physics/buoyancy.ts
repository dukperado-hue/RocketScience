/**
 * Tier 0 — hot-air buoyancy (sky lanterns, โคมลอย). Pure maths; flight2d calls it.
 *
 *   Archimedes      F_b = (ρ_out − ρ_in) · g · V          ρ_in = ρ_out · T_out / T_in   (same pressure)
 *   Air inside      lumped heat balance of the envelope's air:
 *                     m_air·c_p · dT_in/dt = P_heater − UA · (T_in − T_out)
 *                   with UA = U · A_envelope. Solved EXACTLY for constant P over the step:
 *                     T_in(t+dt) = T_ss + (T_in − T_ss) · e^(−dt/τ),   T_ss = T_out + P/UA,  τ = ρ_in·V·c_p / UA
 *   Inertia         the hot air inside (ρ_in·V) moves with the lantern, plus the "added mass" of
 *                   the air it shoves aside (½ ρ_out V for a roughly spherical body) — so
 *                   M_eff = M_struct + ρ_in V + ½ ρ_out V,  and only M_struct has weight
 *                   (the hot air's weight is already inside F_b).
 *   Fire            paper ignites around 233 °C (yes, 451 °F); cotton around 255 °C
 *
 * Calibration: a standard 0.3 m³ paper lantern (≈90 g all-up) on a 1.8 kW wax fuel cell
 * settles about 140 K above ambient, climbs at ~1 m/s, and burns ~12 minutes. A tea-light
 * (≈80 W) cannot lift anything; a 3 kW smoke flare in a small lantern sets it on fire.
 */

export const CP_AIR = 1005;          // J/(kg·K)
/** Envelope heat-loss coefficient (convection + radiation through thin paper, mouth losses), W/(m²·K) */
export const U_ENVELOPE = 5.5;
export const G0 = 9.80665;

/** ISA troposphere temperature (K) — used for T_out; the sim's density profile is exponential */
export const airTemp = (alt: number) => Math.max(216.65, 288.15 - 0.0065 * Math.max(0, alt));

export interface EnvelopeSpec { volume: number; area: number; igniteC: number }
export interface HeaterSpec { kind: 'candle' | 'fuel-cell' | 'flare'; power: number; burnTime: number; smoke: number }

/** Steady-state inside temperature for a heater power (K) */
export const steadyTin = (P: number, UA: number, Tout: number) => Tout + P / Math.max(1e-9, UA);

/** Exact one-step update of the inside temperature for constant heater power over dt */
export function heatStep(Tin: number, Tout: number, P: number, UA: number, V: number, rhoOut: number, dt: number): number {
  if (V <= 0 || UA <= 0) return Tout;
  const rhoIn = rhoOut * Tout / Tin;
  const tau = (rhoIn * V * CP_AIR) / UA;
  const Tss = steadyTin(P, UA, Tout);
  return Tss + (Tin - Tss) * Math.exp(-dt / Math.max(1e-6, tau));
}

/** Net buoyant lift of the hot air (N): (ρ_out − ρ_in) g V — positive = up */
export const buoyantLift = (V: number, rhoOut: number, Tin: number, Tout: number, g = G0) => rhoOut * (1 - Tout / Tin) * V * g;

/** Mass that moves with the lantern but has no weight of its own in the sum (kg) */
export const carriedAirMass = (V: number, rhoOut: number, Tin: number, Tout: number) => rhoOut * (Tout / Tin) * V + 0.5 * rhoOut * V;

/** Minimum inside temperature (K) to float a structure of mass m in volume V */
export const floatTin = (m: number, V: number, rhoOut: number, Tout: number) => {
  const k = m / (rhoOut * V);
  return k >= 1 ? Infinity : Tout / (1 - k);
};
