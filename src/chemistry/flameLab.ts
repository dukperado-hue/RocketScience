/**
 * Flame Test Lab — the chemistry of colour.
 *
 * The school-lab flame test: put a metal salt in a flame and each metal glows
 * its own colour, because its electrons drop between energy levels and emit
 * light at specific wavelengths (E = hc/λ). The player matches a target colour
 * for their festival rocket's trail/starburst; the result is a cosmetic colour.
 *
 * Teaching moments built in:
 *  - Each metal has a fingerprint spectrum (emission lines, not a single hue).
 *  - Sodium is so intense that a trace of contamination (salt from your
 *    fingers!) turns everything yellow — real pyrotechnicians fight this.
 *  - Additive light mixing: red + green light reads as yellow, not brown.
 */

export interface Emitter {
  id: string;
  symbol: string;
  name: string;
  nameTh: string;
  /** Visible emission lines/bands: wavelength (nm) and relative strength */
  lines: { nm: number; strength: number }[];
  /** How bright this metal is in a flame relative to the others */
  brightness: number;
  perceived: string; // what students write in their lab book
  fact: string;
}

export const EMITTERS: Record<string, Emitter> = {
  Li: { id: 'Li', symbol: 'Li', name: 'Lithium', nameTh: 'ลิเทียม', lines: [{ nm: 671, strength: 1 }, { nm: 610, strength: 0.15 }], brightness: 1.2, perceived: 'crimson', fact: 'The same element in your phone battery.' },
  Na: { id: 'Na', symbol: 'Na', name: 'Sodium', nameTh: 'โซเดียม', lines: [{ nm: 589, strength: 1 }], brightness: 10, perceived: 'intense yellow', fact: 'The orange-yellow of old street lamps. Overpowers every other colour.' },
  K:  { id: 'K', symbol: 'K', name: 'Potassium', nameTh: 'โพแทสเซียม', lines: [{ nm: 766, strength: 1 }, { nm: 404, strength: 0.5 }], brightness: 0.6, perceived: 'lilac', fact: 'Faint — chemists view it through blue cobalt glass to hide sodium.' },
  Ca: { id: 'Ca', symbol: 'Ca', name: 'Calcium', nameTh: 'แคลเซียม', lines: [{ nm: 622, strength: 1 }, { nm: 554, strength: 0.3 }], brightness: 1, perceived: 'orange-red', fact: 'Found in chalk, bones and seashells.' },
  Sr: { id: 'Sr', symbol: 'Sr', name: 'Strontium', nameTh: 'สตรอนเชียม', lines: [{ nm: 641, strength: 1 }, { nm: 606, strength: 0.3 }], brightness: 1.3, perceived: 'deep red', fact: 'The classic firework and road-flare red.' },
  Ba: { id: 'Ba', symbol: 'Ba', name: 'Barium', nameTh: 'แบเรียม', lines: [{ nm: 524, strength: 1 }, { nm: 513, strength: 0.7 }, { nm: 553, strength: 0.4 }], brightness: 1, perceived: 'apple green', fact: 'Firework green comes from barium.' },
  Cu: { id: 'Cu', symbol: 'Cu', name: 'Copper', nameTh: 'ทองแดง', lines: [{ nm: 435, strength: 1 }, { nm: 452, strength: 0.8 }, { nm: 520, strength: 0.35 }], brightness: 0.8, perceived: 'blue-green', fact: 'A good blue is the hardest firework colour — the molecules that make it break down if the flame is too hot.' },
};

export type RGB = [number, number, number];

/** Wavelength (nm) → linear-ish RGB, Dan Bruton's approximation, 380–780 nm. */
export function wavelengthToRgb(nm: number): RGB {
  let r = 0, g = 0, b = 0;
  if (nm >= 380 && nm < 440) { r = -(nm - 440) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
  else if (nm <= 780) { r = 1; }
  // Eye sensitivity falls off at the spectrum edges
  const f = nm < 420 ? 0.3 + (0.7 * (nm - 380)) / 40 : nm > 700 ? 0.3 + (0.7 * (780 - nm)) / 80 : 1;
  return [r * f, g * f, b * f];
}

export interface Mixture {
  /** Pinches of each salt dropped in the flame (0–5) */
  amounts: Partial<Record<keyof typeof EMITTERS, number>>;
  /** 0–1: accidental sodium from dirty tools or sweaty fingers */
  contamination: number;
}

/** Additive light mixing: sum every emission line, then normalise brightness. */
export function flameColour(mix: Mixture): RGB {
  const acc: RGB = [0, 0, 0];
  const add = (id: string, amount: number) => {
    const e = EMITTERS[id];
    for (const line of e.lines) {
      const [r, g, b] = wavelengthToRgb(line.nm);
      const w = amount * e.brightness * line.strength;
      acc[0] += r * w; acc[1] += g * w; acc[2] += b * w;
    }
  };
  for (const [id, amt] of Object.entries(mix.amounts)) if (amt) add(id, amt);
  if (mix.contamination > 0) add('Na', mix.contamination * 2);

  const max = Math.max(...acc);
  if (max === 0) return [1, 0.55, 0.15]; // plain flame: dim orange
  // Mild lift only — full display gamma washes reds into orange
  return acc.map((c) => Math.pow(c / max, 1 / 1.3)) as RGB;
}

export const toCss = ([r, g, b]: RGB) => `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

/**
 * 0–100: how close the flame is to the target colour. Uses distance in RGB so
 * that a washed-out, whitish flame does not count as a match for a saturated
 * one even when the hue is similar.
 */
export function matchScore(actual: RGB, target: RGB): number {
  const d = Math.hypot(actual[0] - target[0], actual[1] - target[1], actual[2] - target[2]) / Math.sqrt(3);
  return Math.round(Math.max(0, 1 - 2.2 * d) * 100);
}

/** Lab-book hint after an attempt. */
export function labHint(mix: Mixture, actual: RGB, target: RGB): string {
  if (mix.contamination > 0.2 && (mix.amounts.Na ?? 0) === 0) return 'Everything looks yellow? That’s sodium contamination — clean your tools.';
  const score = matchScore(actual, target);
  if (score > 90) return 'Spot on. Your festival trail will glow exactly that colour.';
  const [, sA, lA] = rgbToHsl(actual), [, sT, lT] = rgbToHsl(target);
  if (lA - lT > 0.15 || sT - sA > 0.25) return 'Too pale — extra salts are adding other colours and washing it out toward white.';
  const [h1] = rgbToHsl(actual), [h2] = rgbToHsl(target);
  const diff = ((h2 - h1 + 540) % 360) - 180;
  return diff > 0 ? 'Shift toward the green/blue end of the spectrum.' : 'Shift toward the red end of the spectrum.';
}
