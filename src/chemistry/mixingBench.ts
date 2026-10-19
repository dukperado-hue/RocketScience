/**
 * Mixing Bench — craft a propellant grade before its motor can be placed.
 *
 * Ingredients are deliberately abstract classes (oxidiser, fuel, moderator,
 * binder, inert filler) rather than real substances: the teaching point is the
 * *idea* behind solid propellants — something to burn, something that supplies
 * oxygen, and ways to tune how fast it burns — not a recipe that works off-screen.
 *
 * The grade you craft decides the motor's Isp, burn time and smoke density;
 * how steadily you stir decides its quality (consistency between motors).
 */
import { scoreMill } from './powderMill';
import { safeKV } from '@/core/safeStorage';

export type IngredientId = 'oxidiser' | 'fuel' | 'moderator' | 'binder' | 'filler';

export interface Ingredient {
  id: IngredientId;
  name: string;
  nameTh: string;
  role: string;
  glyph: string;   // short label drawn on the jar
}

export const INGREDIENTS: Record<IngredientId, Ingredient> = {
  oxidiser:  { id: 'oxidiser',  name: 'Oxidiser',  nameTh: 'สารออกซิไดเซอร์', glyph: 'Ox', role: 'Supplies oxygen, so the mix can burn inside a closed tube with no air.' },
  fuel:      { id: 'fuel',      name: 'Fuel',      nameTh: 'เชื้อเพลิง',       glyph: 'Fu', role: 'The part that actually burns and releases energy.' },
  moderator: { id: 'moderator', name: 'Moderator', nameTh: 'สารหน่วงการเผาไหม้', glyph: 'Mo', role: 'Slows the burn — less push, but for much longer.' },
  binder:    { id: 'binder',    name: 'Binder',    nameTh: 'สารยึดเกาะ',       glyph: 'Bi', role: 'Holds everything in one solid grain, so it burns evenly from one face.' },
  filler:    { id: 'filler',    name: 'Inert filler', nameTh: 'ตัวเติมเฉื่อย', glyph: 'In', role: 'Adds mass, adds nothing to the burn. A trap.' },
};

export type GradeId = 'fast-powder' | 'slow-powder' | 'cast-grain';

export interface PropellantGrade {
  id: GradeId;
  name: string;
  nameTh: string;
  ispSL: number;           // s
  /** Multiplies a motor's base burn time (longer burn ⇒ lower thrust for the same propellant) */
  burnMultiplier: number;
  /** 0–1: how thick the exhaust smoke is — the renderer and flight FX read this */
  smokeDensity: number;
  description: string;
  lesson: string;
}

export const GRADES: Record<GradeId, PropellantGrade> = {
  'fast-powder': {
    id: 'fast-powder', name: 'Fast powder', nameTh: 'ดินขับเร็ว', ispSL: 80, burnMultiplier: 1, smokeDensity: 0.9,
    description: 'Burns hot and quick. Short, sharp push — and a wall of smoke.',
    lesson: 'Oxidiser + fuel is the minimum: one supplies oxygen, the other burns.',
  },
  'slow-powder': {
    id: 'slow-powder', name: 'Slow powder', nameTh: 'ดินขับช้า', ispSL: 85, burnMultiplier: 1, smokeDensity: 1,
    description: 'Tuned to burn for most of a minute. Barely enough push to lift off — then it keeps going.',
    lesson: 'Slowing the burn trades thrust for burn time. The total impulse stays about the same.',
  },
  'cast-grain': {
    id: 'cast-grain', name: 'Cast grain', nameTh: 'เชื้อเพลิงหล่อแท่ง', ispSL: 120, burnMultiplier: 1, smokeDensity: 0.7,
    description: 'Bound into one solid grain. Burns evenly from its face — more efficient, a little cleaner.',
    lesson: 'A solid grain burns predictably, which is why modern solid boosters are cast, not packed.',
  },
};

/** Recipes are sets of ingredient classes (order doesn't matter). */
const RECIPES: { needs: IngredientId[]; grade: GradeId }[] = [
  { needs: ['oxidiser', 'fuel'], grade: 'fast-powder' },
  { needs: ['oxidiser', 'fuel', 'moderator'], grade: 'slow-powder' },
  { needs: ['oxidiser', 'fuel', 'binder'], grade: 'cast-grain' },
];

export type MixResult =
  | { ok: true; grade: PropellantGrade }
  | { ok: false; reason: string };

/** What happens when these ingredients go in the bowl. */
export function combine(items: IngredientId[]): MixResult {
  const set = [...new Set(items)].sort();
  if (set.length === 0) return { ok: false, reason: 'The bowl is empty.' };
  if (set.includes('filler')) return { ok: false, reason: 'Inert filler only adds weight. Take it out — mass without energy lowers thrust-to-weight.' };
  if (!set.includes('oxidiser')) return { ok: false, reason: 'No oxidiser: inside a sealed tube there is no air, so the fuel would only smoulder.' };
  if (!set.includes('fuel')) return { ok: false, reason: 'No fuel: an oxidiser on its own has nothing to burn.' };
  if (set.includes('moderator') && set.includes('binder')) return { ok: false, reason: 'Pick one: a moderator for a long burn, or a binder for a solid grain.' };
  const hit = RECIPES.find((r) => r.needs.length === set.length && r.needs.every((n) => set.includes(n)));
  return hit ? { ok: true, grade: GRADES[hit.grade] } : { ok: false, reason: 'That combination does nothing useful.' };
}

/* ---------- Stirring (quality) ---------- */

export const STIR_BEAT_MS = 520;
export const STIR_STROKES = 12;

/** Quality 0–1 from the player's stir timing (reuses the Powder Mill scorer). */
export function stirQuality(taps: number[], humidity = 0.5): number {
  const r = scoreMill({ taps, targetIntervalMs: STIR_BEAT_MS, humidity, dryingTime: 40 });
  // A session is only 12 strokes, so judge completeness against that, not the mill's 40
  const completeness = Math.min(1, Math.max(0, taps.length - 1) / (STIR_STROKES - 1));
  const q = (0.7 * r.consistency + 0.3 * completeness) * (0.8 + 0.2 * r.dryness);
  return Math.max(0.05, Math.min(1, q));
}

/* ---------- Persistent bench state ---------- */

export interface BenchState {
  /** Best quality crafted for each grade so far */
  crafted: Partial<Record<GradeId, number>>;
}

const KEY = 'rocketscience.bench.v1';

export function loadBench(): BenchState {
  try {
    const raw = safeKV.getItem(KEY);
    if (raw) return JSON.parse(raw) as BenchState;
  } catch { /* storage unavailable */ }
  return { crafted: {} };
}

export function saveBench(s: BenchState) {
  try { safeKV.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

export function recordCraft(s: BenchState, grade: GradeId, quality: number): BenchState {
  const prev = s.crafted[grade] ?? 0;
  return { crafted: { ...s.crafted, [grade]: Math.max(prev, quality) } };
}
