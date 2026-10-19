/**
 * Water vs land under the flight track — pure data, no drawing.
 *
 * The flight is 2D: the view's x axis is ground distance along one bearing from the pad
 * (east for rockets, downwind for lanterns). We sample that line against the island
 * coastlines (Natural Earth, law/samui.ts) and return the stretches that are land.
 * Everything else is the Gulf of Thailand.
 *
 *   islands    Ko Samui and Ko Pha-ngan polygons, padded by a small "beach" radius so a
 *              coarse 1:10m coastline never leaves the pad standing in the sea
 *   mainland   Yasothon (Isan) is ~500 km from any sea: hard-coded land out to 600 km
 *              east / 400 km west, sea beyond (the South China Sea / Andaman side)
 */
import { offsetGeo, type GeoPoint } from '@/law/zones';
import { COASTS } from '@/law/samui';

export interface SurfaceTrack {
  /** Land stretches along the view's x axis (m), sorted, non-overlapping */
  land: [number, number][];
  /** True when the whole map is land (inland site) */
  inland: boolean;
}

/** Point in polygon (lat/lon, ray casting) */
export function inPolygon(p: GeoPoint, pts: readonly [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [yi, xi] = pts[i], [yj, xj] = pts[j];
    if ((yi > p.lat) !== (yj > p.lat) && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Is this point on one of the islands? */
export const onIsland = (p: GeoPoint) => COASTS.some((c) => inPolygon(p, c.pts));

/** Gulf-of-Thailand island sites are near lat 9–10°; anything north of 13° in this game is inland Isan */
const isInlandSite = (site: GeoPoint) => site.lat > 13;

/**
 * Sample the track from `site` along `bearingDeg` (0 = north, 90 = east) between `fromM`
 * and `toM` metres, every `stepM`. The pad itself is always on a `beachM`-wide strip of land.
 */
export function surfaceTrack(site: GeoPoint, bearingDeg: number, fromM = -30_000, toM = 80_000, stepM = 50, beachM = 120): SurfaceTrack {
  if (isInlandSite(site)) return { land: [[-400_000, 600_000]], inland: true };
  const b = (bearingDeg * Math.PI) / 180, sx = Math.sin(b), sy = Math.cos(b);
  const land: [number, number][] = [];
  let start: number | null = null;
  for (let x = fromM; x <= toM; x += stepM) {
    const on = Math.abs(x) <= beachM || onIsland(offsetGeo(site, x * sx, x * sy));
    if (on && start === null) start = x;
    if (!on && start !== null) { land.push([start, x - stepM]); start = null; }
  }
  if (start !== null) land.push([start, toM]);
  return { land, inland: false };
}

/** Sea at ground distance x? (outside the sampled window is open sea for island sites) */
export function isSea(t: SurfaceTrack, x: number): boolean {
  if (t.inland) return !(x >= t.land[0][0] && x <= t.land[0][1]);
  for (const [a, c] of t.land) if (x >= a && x <= c) return false;
  return true;
}
