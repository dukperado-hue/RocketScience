/**
 * Clustered-engine physics — built for Wan Hu’s 47 rockets, reused later for
 * strap-on boosters and Saturn V / N1-style clusters.
 *
 * Each engine is simulated individually: its own ignition delay, thrust scatter,
 * misalignment and failure roll. The cluster then reports net force, the
 * instantaneous centre of thrust (CoT) and the torque about the centre of mass.
 * Wan Hu fails for the same reason the Soviet N1 struggled: many independent
 * engines ⇒ the CoT wanders, and one bad engine can take out its neighbours.
 */
import type { Rng } from '@/core/rng';
import { PROPELLANTS } from '@/data/propellants';
import type { PartV2 } from '@/data/schema';

export type EngineStatus = 'waiting' | 'burning' | 'spent' | 'dud' | 'burst';

export interface Vec2 { x: number; y: number }

export interface ClusterEngine {
  index: number;
  /** Mount point relative to the vehicle CoM, body frame (m). +y = up. */
  pos: Vec2;
  /** Thrust direction in body frame (radians from +y). Small random misalignment. */
  angle: number;
  thrust: number;     // N (this unit's actual thrust after scatter)
  burnTime: number;   // s
  igniteAt: number;   // s after the countdown ends
  /** Pre-rolled fate so replays are deterministic */
  fate: 'ok' | 'dud' | 'burst';
  /** If fate is burst, when during the burn it happens */
  burstAt: number;
  status: EngineStatus;
  elapsed: number;
}

export interface ClusterConfig {
  part: PartV2;              // the motor type used for every mount
  mounts: Vec2[];            // where each motor sits
  /** How ignition happens. Wan Hu: 47 servants with torches. */
  ignition: { mode: 'manual'; meanDelay: number; sd: number } | { mode: 'electric'; sd: number };
  /** 0–1 from the Powder Mill minigame. Higher = less scatter, fewer failures. */
  propellantQuality: number;
  /** Chance that a burst ignites or wrecks an adjacent motor */
  chainReaction: number;
}

/** Wan Hu’s layout: 47 motors in rows behind and under the chair. */
export function wanHuMounts(): Vec2[] {
  const mounts: Vec2[] = [];
  const rows = [9, 10, 10, 10, 8];          // = 47
  rows.forEach((n, r) => {
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 0.065;  // 6.5 cm pitch
      mounts.push({ x, y: -0.35 - r * 0.07 });
    }
  });
  return mounts;
}

export function createCluster(cfg: ClusterConfig, rng: Rng): ClusterEngine[] {
  const eng = cfg.part.engine!;
  const prop = PROPELLANTS[eng.propellantId];
  const q = Math.min(1, Math.max(0, cfg.propellantQuality));
  // Quality narrows the scatter: 0 quality ≈ ±30% thrust, 1 ≈ ±5%.
  const thrustSd = 0.3 - 0.25 * q;
  // Craftsmanship sets the baseline failure rate; good milling cuts it by up to ~75%.
  const baseFail = 1 - prop.baseReliability * eng.craftsmanship;
  const reliability = 1 - baseFail * (1.6 - 1.2 * q);
  const pBurst = (1 - reliability) * 0.25;  // a quarter of failures are bursts, the rest duds

  return cfg.mounts.map((pos, index) => {
    const delay = cfg.ignition.mode === 'manual'
      ? Math.max(0, rng.normal(cfg.ignition.meanDelay, cfg.ignition.sd))
      : Math.max(0, rng.normal(0, cfg.ignition.sd));
    const roll = rng.next();
    const fate: ClusterEngine['fate'] = roll < pBurst ? 'burst' : roll < 1 - reliability ? 'dud' : 'ok';
    const burnTime = (eng.burnTimeS ?? 3) * Math.max(0.4, rng.normal(1, thrustSd * 0.6));
    return {
      index, pos,
      angle: rng.normal(0, (4 - 3 * q) * Math.PI / 180), // a few degrees off-axis
      thrust: eng.thrustSL * Math.max(0.2, rng.normal(1, thrustSd)),
      burnTime,
      igniteAt: delay,
      fate,
      burstAt: rng.range(0.05, 0.6) * burnTime,
      status: 'waiting' as EngineStatus,
      elapsed: 0,
    };
  });
}

export interface ClusterEvent { t: number; engine: number; kind: 'ignite' | 'dud' | 'burst' | 'chain' | 'burnout' }

export interface ClusterOutput {
  /** Net force in body frame (N) */
  force: Vec2;
  /** Torque about CoM (N·m), +ve = counter-clockwise */
  torque: number;
  /** Centre of thrust in body frame, null if nothing is burning */
  cot: Vec2 | null;
  burning: number;
  events: ClusterEvent[];
  /** Total burst energy this step, for structural damage to the chair */
  burstCount: number;
}

/**
 * Advance every motor by dt.
 *   F_net = Σ Fᵢ (sin θᵢ, cos θᵢ)
 *   τ     = Σ (rᵢ × Fᵢ)_z = Σ (xᵢ·Fyᵢ − yᵢ·Fxᵢ)
 *   CoT   = Σ |Fᵢ|·rᵢ / Σ |Fᵢ|
 */
export function stepCluster(engines: ClusterEngine[], t: number, dt: number, cfg: ClusterConfig, rng: Rng): ClusterOutput {
  const events: ClusterEvent[] = [];
  let fx = 0, fy = 0, torque = 0, sumF = 0, cx = 0, cy = 0, burning = 0, bursts = 0;

  for (const e of engines) {
    if (e.status === 'waiting' && t >= e.igniteAt) {
      if (e.fate === 'dud') { e.status = 'dud'; events.push({ t, engine: e.index, kind: 'dud' }); continue; }
      e.status = 'burning';
      events.push({ t, engine: e.index, kind: 'ignite' });
    }
    if (e.status !== 'burning') continue;

    e.elapsed += dt;
    if (e.fate === 'burst' && e.elapsed >= e.burstAt) {
      e.status = 'burst';
      bursts++;
      events.push({ t, engine: e.index, kind: 'burst' });
      // A burst can light or wreck its neighbours (within ~1 pitch).
      for (const n of engines) {
        if (n === e || (n.status !== 'waiting' && n.status !== 'burning')) continue;
        const d = Math.hypot(n.pos.x - e.pos.x, n.pos.y - e.pos.y);
        if (d < 0.1 && rng.chance(cfg.chainReaction)) {
          if (n.status === 'waiting') { n.igniteAt = t; }       // premature ignition
          else { n.status = 'burst'; bursts++; }                // sympathetic failure
          events.push({ t, engine: n.index, kind: 'chain' });
        }
      }
      continue;
    }
    if (e.elapsed >= e.burnTime) {
      e.status = 'spent';
      events.push({ t, engine: e.index, kind: 'burnout' });
      continue;
    }

    // Simple thrust curve: quick rise, plateau, tail-off.
    const k = e.elapsed / e.burnTime;
    const shape = k < 0.08 ? k / 0.08 : k > 0.85 ? (1 - k) / 0.15 : 1;
    const F = e.thrust * shape;
    const efx = F * Math.sin(e.angle);
    const efy = F * Math.cos(e.angle);
    fx += efx; fy += efy;
    torque += e.pos.x * efy - e.pos.y * efx;
    sumF += F; cx += F * e.pos.x; cy += F * e.pos.y;
    burning++;
  }

  return {
    force: { x: fx, y: fy },
    torque,
    cot: sumF > 0 ? { x: cx / sumF, y: cy / sumF } : null,
    burning,
    events,
    burstCount: bursts,
  };
}

/** Propellant mass each burning motor loses per step is handled by the caller via structure.consume(). */
