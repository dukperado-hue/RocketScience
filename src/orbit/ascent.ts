/**
 * Ascent Assist — a teaching tool for the gravity turn.
 *
 *   guide  shows the target attitude (HUD + a ghost marker on the rocket) and a hint;
 *          the player still flies
 *   auto   flies it: SAS target, throttle (g-limit), staging, insertion, engine cut-off
 *
 * Profile: elevation above the horizon vs altitude, from waypoints. The default curve
 * is the one that put the Tier-4 Naga into orbit in testing — it leans over gently and
 * is horizontal only around 100 km, because pitching flat low down means flying fast in
 * thick air: more drag and a cooked zombie.
 *
 *   vertical       0 → 0.5 km      straight up, clear the tower
 *   gravity turn   0.5 → ~100 km   follow the profile
 *   insertion      Ap ≥ target     nose near the horizon, feedback on vertical speed to
 *                                  hold the target altitude while sideways speed builds
 *   cut-off        Pe > 150 km     MECO — stable orbit (see orbit/state.ts)
 */
import type { Flight } from '@/physics/flight2d';
import { R_EARTH } from '@/physics/flight2d';
import { PE_STABLE } from './state';

export type AssistMode = 'off' | 'guide' | 'auto';
export type AssistPhase = 'idle' | 'vertical' | 'gravity-turn' | 'coast' | 'insertion' | 'cutoff';

export interface AscentProfile {
  name: string;
  /** [altitude m, elevation above the horizon °], ascending in altitude */
  points: [number, number][];
  /** Apoapsis to aim for before insertion takes over (m) */
  targetAlt: number;
  /** Engine cut-off once periapsis is above this (m) */
  cutPe: number;
  gLimit: number;
  /**
   * Low-thrust upper stages: once Ap reaches targetAlt above the air, cut the engine, coast up
   * to apoapsis and do the insertion burn there (a two-burn ascent) instead of burning through.
   */
  coastToAp?: boolean;
}

/** 90°·(1 − (h/100 km)^0.6) — sampled; 45° near 32 km, 20° near 64 km */
export const PROFILE_TIER4: AscentProfile = {
  name: 'Tier-4 orbital',
  points: [0, 0.5, 2, 5, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((km) => [km * 1000, km < 0.5 ? 90 : 90 * (1 - Math.pow((km - 0.5) / 99.5, 0.6))] as [number, number]),
  targetAlt: 200_000,
  cutPe: PE_STABLE + 10_000,
  gLimit: 3.5,
};

/**
 * Tier 3 (vacuum engine ≈ 60 kN on a 10 t upper stage): a lofted climb, then coast to Ap and
 * circularise there. Burning straight through — the Tier-4 way — leaves this stage accelerating
 * sideways while it falls back into the air. Flown in campaign.test.ts (Orbital Hijack).
 */
export const PROFILE_TIER3: AscentProfile = {
  name: 'Tier-3 lofted, coast to Ap',
  points: [[0, 90], [500, 90], [10_000, 62], [30_000, 42], [60_000, 30], [100_000, 25], [180_000, 10], [260_000, 0]],
  targetAlt: 200_000,
  cutPe: PE_STABLE + 10_000,
  gLimit: 3.5,
  coastToAp: true,
};

/** The "45° at 10 km, flat at 50 km" rule of thumb — kept for comparison; too flat in this sim's air */
export const PROFILE_STEEP_TURN: AscentProfile = {
  name: 'Aggressive (45° @ 10 km, 0° @ 50 km)',
  points: [[0, 90], [500, 90], [10_000, 45], [50_000, 0], [100_000, 0]],
  targetAlt: 200_000, cutPe: PE_STABLE + 10_000, gLimit: 3.5,
};

/** Target elevation (°) at an altitude, linear between waypoints */
export function profileElevation(p: AscentProfile, alt: number): number {
  const pts = p.points;
  if (alt <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (alt <= pts[i][0]) {
      const [a0, e0] = pts[i - 1], [a1, e1] = pts[i];
      return e0 + ((e1 - e0) * (alt - a0)) / (a1 - a0);
    }
  }
  return pts[pts.length - 1][1];
}

export interface AssistOutput {
  phase: AssistPhase;
  /** Target pitch from the local vertical (rad) — the game's SAS convention */
  targetPitch: number;
  /** Target elevation above the horizon (°) — what the HUD shows */
  elevation: number;
  /** Short coaching hint for the HUD */
  hint: string;
  /** Set once when the phase changes: a CAPCOM teaching line */
  note?: string;
}

const NOTES: Record<AssistPhase, string> = {
  idle: '',
  vertical: 'Straight up first — clear the tower before leaning anywhere.',
  'gravity-turn': 'Gravity turn: lean a little at a time and let gravity bend the path. Too flat too low and the air cooks us.',
  coast: 'Apoapsis is high enough and we are above the air. Engine off — coast up to apoapsis, then burn sideways there.',
  insertion: 'Apoapsis is high enough. Nose to the horizon now — orbit is about going sideways fast, not up.',
  cutoff: 'Periapsis above 140 km. Engine cut-off — we are in a stable orbit.',
};

export class AscentAssist {
  mode: AssistMode = 'off';
  phase: AssistPhase = 'idle';

  constructor(public profile: AscentProfile = PROFILE_TIER4) {}

  reset() { this.phase = 'idle'; }

  /** Call every physics step (auto) or every frame (guide). Returns null when off. */
  update(f: Flight): AssistOutput | null {
    if (this.mode === 'off') return null;
    const v = f.vehicle, c = f.controls, P = this.profile;
    const o = f.orbit;
    const ap = o.bound ? o.rA - R_EARTH : Infinity, pe = o.rP - R_EARTH;
    let phase: AssistPhase = this.phase;
    if (!f.ignited || !f.airborne) phase = f.ignited ? 'vertical' : 'idle';
    else if (phase === 'cutoff') { /* stays */ }
    else if (pe > P.cutPe) phase = 'cutoff';
    else if (P.coastToAp) {
      if (phase === 'insertion') { /* burn until Pe is up */ }
      else if (phase === 'coast' || (ap >= P.targetAlt && v.alt > 70_000)) phase = v.vUp < 15 ? 'insertion' : 'coast';
      else phase = v.alt < 500 ? 'vertical' : 'gravity-turn';
    }
    else if (phase === 'insertion' || ap >= P.targetAlt) phase = 'insertion';
    else phase = v.alt < 500 ? 'vertical' : 'gravity-turn';

    let elev: number;
    if (phase === 'coast') elev = 0;                                 // nose on the horizon, ready for the burn
    else if (phase === 'insertion' && P.coastToAp) {
      // at apoapsis: push sideways, tipping up a little if we start to sink
      elev = Math.max(-17, Math.min(17, (-v.vUp / 400) * 180 / Math.PI));
    } else if (phase === 'insertion') {
      // hold the target altitude: wanted vertical speed from the altitude error, elevation from the speed error
      const vUpT = Math.max(-150, Math.min(150, (P.targetAlt - v.alt) / 40));
      elev = Math.max(-10, Math.min(25, (vUpT - v.vUp) / 20));
    } else if (phase === 'cutoff') {
      elev = (Math.atan2(v.vUp, v.vEast) * 180) / Math.PI;          // follow prograde
    } else elev = profileElevation(P, v.alt);
    const targetPitch = ((90 - elev) * Math.PI) / 180;

    const note = phase !== this.phase && NOTES[phase] ? NOTES[phase] : undefined;
    this.phase = phase;

    if (this.mode === 'auto' && f.ignited) {
      c.sas = true; c.sasMode = 'hold'; c.turnRate = 0;
      c.target = targetPitch;
      if (phase === 'cutoff' || phase === 'coast') c.throttle = 0;
      else if (v.gLoad > P.gLimit) c.throttle = Math.max(0.2, c.throttle - 0.02);
      else if (v.gLoad < P.gLimit * 0.9) c.throttle = Math.min(1, c.throttle + 0.01);
      if (phase !== 'cutoff' && phase !== 'coast') this.autoStage(f);
    }

    const errDeg = ((v.pitch - targetPitch) * 180) / Math.PI;
    const hint = phase === 'cutoff' ? 'MECO — coast. Open the map (Tab).'
      : phase === 'vertical' ? 'Hold vertical'
      : phase === 'coast' ? `Coast to Ap · ${Math.max(0, Math.round(v.vUp / 9.8))} s`
      : Math.abs(errDeg) < 3 ? 'On profile'
      : errDeg < 0 ? `Lean ${Math.abs(errDeg).toFixed(0)}° toward the horizon` : `Pitch up ${errDeg.toFixed(0)}°`;
    return { phase, targetPitch, elevation: elev, hint, note };
  }

  /** Stage when the side boosters, or every lit engine, have burned out */
  private autoStage(f: Flight) {
    const v = f.vehicle;
    if (!f.airborne || !f.stages.length || f.stages[0] === 'chutes') return;
    const lit = v.engines.filter((q) => q.engine!.lit), side = lit.filter((q) => Math.abs(q.x) > 0.5);
    if ((side.length && side.every((q) => q.engine!.out)) || (lit.length && lit.every((q) => q.engine!.out))) f.stage();
  }
}
