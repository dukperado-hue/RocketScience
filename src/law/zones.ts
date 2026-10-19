/**
 * Airspace zones for Tier 1 launches.
 *
 * ⚠ PLACEHOLDER GEOMETRY. Airport coordinates are real; the radii, corridor
 * sizes and ceilings are illustrative game values, NOT the legal limits.
 * Replace them with the figures from the current CAAT announcements / AIP
 * Thailand before presenting this as regulatory teaching material.
 * The radar UI draws whatever numbers are here, so editing this file is all
 * it takes.
 */

export interface GeoPoint { lat: number; lon: number }

export type ZoneKind = 'airport' | 'approach' | 'populated' | 'launch-site';

interface ZoneBase {
  id: string;
  name: string;
  nameTh: string;
  kind: ZoneKind;
  centre: GeoPoint;
  /** Zone applies from the ground up to this altitude (m). 0 = ground-level area (e.g. town) */
  ceilingM: number;
  /** True until someone checks the numbers against the real rules */
  placeholder: boolean;
}

export interface CircleZone extends ZoneBase { shape?: 'circle'; radiusM: number }

/** Rectangle centred on `centre`, long axis along the runway heading */
export interface CorridorZone extends ZoneBase {
  shape: 'corridor';
  headingDeg: number;   // runway true heading
  lengthM: number;      // total length, both approach directions
  widthM: number;
  radiusM: number;      // bounding radius = lengthM / 2, for quick checks
}

export type AirspaceZone = CircleZone | CorridorZone;

const ATZ_RADIUS = 9_000;     // placeholder — set to the figure in the current rules
const ATZ_CEILING = 3_000;    // placeholder
const APPROACH_LEN = 30_000;  // placeholder: 15 km each side of the field
const APPROACH_WIDTH = 3_000; // placeholder
const APPROACH_CEILING = 1_500;

const airport = (id: string, name: string, nameTh: string, lat: number, lon: number): CircleZone => ({
  id, name, nameTh, kind: 'airport', centre: { lat, lon }, radiusM: ATZ_RADIUS, ceilingM: ATZ_CEILING, placeholder: true,
});

const approach = (id: string, name: string, nameTh: string, lat: number, lon: number, headingDeg: number): CorridorZone => ({
  id, name, nameTh, kind: 'approach', shape: 'corridor', centre: { lat, lon }, headingDeg,
  lengthM: APPROACH_LEN, widthM: APPROACH_WIDTH, radiusM: APPROACH_LEN / 2, ceilingM: APPROACH_CEILING, placeholder: true,
});

export const THAI_ZONES: AirspaceZone[] = [
  airport('vtbs', 'Suvarnabhumi Airport', 'ท่าอากาศยานสุวรรณภูมิ', 13.690, 100.750),
  airport('vtbd', 'Don Mueang Airport', 'ท่าอากาศยานดอนเมือง', 13.913, 100.607),
  airport('vtcc', 'Chiang Mai Airport', 'ท่าอากาศยานเชียงใหม่', 18.767, 98.963),
  airport('vtud', 'Udon Thani Airport', 'ท่าอากาศยานอุดรธานี', 17.386, 102.788),
  airport('vtuu', 'Ubon Ratchathani Airport', 'ท่าอากาศยานอุบลราชธานี', 15.251, 104.870),
  // Runway headings approximate — placeholder
  approach('vtuu-app', 'Ubon approach path', 'แนวร่อนลงอุบลราชธานี', 15.251, 104.870, 50),
  { id: 'yasothon-field', name: 'Yasothon Bang Fai festival field', nameTh: 'ลานจุดบั้งไฟ ยโสธร', kind: 'launch-site',
    centre: { lat: 15.792, lon: 104.145 }, radiusM: 1_500, ceilingM: 10_000, placeholder: true },
  { id: 'yasothon-town', name: 'Yasothon town', nameTh: 'ตัวเมืองยโสธร', kind: 'populated',
    centre: { lat: 15.794, lon: 104.146 }, radiusM: 3_000, ceilingM: 0, placeholder: true },
];

const R_EARTH = 6_371_000;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance (haversine), metres */
export function distanceM(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(h));
}

/** Point offset from a start by east/north metres (flat-earth, fine for tens of km) */
export function offsetGeo(p: GeoPoint, eastM: number, northM: number): GeoPoint {
  return {
    lat: p.lat + (northM / R_EARTH) * (180 / Math.PI),
    lon: p.lon + (eastM / (R_EARTH * Math.cos(toRad(p.lat)))) * (180 / Math.PI),
  };
}

/** East/north metres of `p` relative to `origin` (inverse of offsetGeo) */
export function localEN(origin: GeoPoint, p: GeoPoint): { e: number; n: number } {
  return {
    e: toRad(p.lon - origin.lon) * R_EARTH * Math.cos(toRad(origin.lat)),
    n: toRad(p.lat - origin.lat) * R_EARTH,
  };
}

export function insideZone(p: GeoPoint, altM: number, z: AirspaceZone): boolean {
  if (z.ceilingM !== 0 && altM > z.ceilingM) return false;
  if (z.shape === 'corridor') {
    const { e, n } = localEN(z.centre, p);
    const h = toRad(z.headingDeg);        // compass: 0 = north, clockwise
    const along = e * Math.sin(h) + n * Math.cos(h);
    const cross = e * Math.cos(h) - n * Math.sin(h);
    return Math.abs(along) <= z.lengthM / 2 && Math.abs(cross) <= z.widthM / 2;
  }
  return distanceM(p, z.centre) <= z.radiusM;
}

/** Named launch sites the player can choose in the Bang Fai lab */
export const LAUNCH_SITES: { id: string; name: string; nameTh: string; pos: GeoPoint; permitted: boolean; note: string }[] = [
  { id: 'yasothon', name: 'Yasothon festival field', nameTh: 'ลานบั้งไฟยโสธร', pos: { lat: 15.792, lon: 104.145 }, permitted: true,
    note: 'Official festival site, permit on file.' },
  { id: 'ubon-village', name: 'Rice field near Ubon', nameTh: 'ทุ่งนาใกล้อุบลฯ', pos: offsetGeo({ lat: 15.251, lon: 104.870 }, -11_000, -6_000), permitted: false,
    note: 'Convenient… about 12.5 km from Ubon Ratchathani Airport, just beside its approach path.' },
];
