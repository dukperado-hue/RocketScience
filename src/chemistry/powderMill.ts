/**
 * Powder Mill — a craftsmanship minigame, not a recipe.
 *
 * Historically, the big leap in early rocketry wasn't a new ingredient but
 * consistency: finely ground, evenly mixed, dry propellant burns predictably.
 * The player keeps a steady rhythm on the mill (tap/click on the beat).
 * Steadiness and patience → quality 0–1, which feeds createCluster():
 * less thrust scatter, fewer duds, fewer bursts.
 *
 * Inputs are only timing and weather — nothing about what goes into the mill.
 */

export interface MillSession {
  /** Timestamps (ms) of the player's taps */
  taps: number[];
  /** The beat the mill wants, ms between taps */
  targetIntervalMs: number;
  /** 0–1 relative humidity on festival day */
  humidity: number;
  /** Seconds the player let the batch dry in the sun (0–60 in game time) */
  dryingTime: number;
}

export interface MillResult {
  quality: number;      // 0–1
  consistency: number;  // 0–1, from rhythm steadiness
  fineness: number;     // 0–1, from how many good strokes
  dryness: number;      // 0–1
  feedback: string;
}

export function scoreMill(s: MillSession): MillResult {
  const intervals = s.taps.slice(1).map((t, i) => t - s.taps[i]);
  if (intervals.length < 3) {
    return { quality: 0.1, consistency: 0, fineness: 0, dryness: 0, feedback: 'Barely milled. Expect lumps, sputters and surprises.' };
  }
  // Steadiness: coefficient of variation of the intervals, plus distance from the beat
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const sd = Math.sqrt(intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length);
  const cv = sd / mean;
  const offBeat = Math.abs(mean - s.targetIntervalMs) / s.targetIntervalMs;
  const consistency = clamp01(1 - 2.5 * cv - offBeat);

  // Patience: good strokes (within 15% of the beat) saturate at 40
  const good = intervals.filter((iv) => Math.abs(iv - s.targetIntervalMs) / s.targetIntervalMs < 0.15).length;
  const fineness = clamp01(good / 40);

  // Damp batches burn unevenly; sun-drying helps up to a point
  const dryness = clamp01(1 - s.humidity * 0.7 + Math.min(s.dryingTime, 60) / 120);

  const quality = clamp01(0.45 * consistency + 0.35 * fineness + 0.2 * dryness);
  const feedback =
    quality > 0.85 ? 'Master craftsman. Your rockets will burn almost identically.' :
    quality > 0.6 ? 'Solid batch. Some scatter between rockets, but mostly predictable.' :
    quality > 0.35 ? 'Uneven. Expect a few fizzles and some rockets far stronger than others.' :
    'Lumpy and damp. Wan Hu would recognise this batch.';
  return { quality, consistency, fineness, dryness, feedback };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
