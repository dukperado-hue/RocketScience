/**
 * Koh Pha-ngan / Samui airspace for Tier 0–1 flights.
 *
 * SOURCED (AIP Thailand, AD 2 VTSM — Surat Thani / Samui, eAIP 2025-01-23 AIRAC):
 *   ARP 09°32'56"N 100°03'45"E, elevation 19.5 m
 *   RWY 17/35, true bearings 174.48° / 354.48°, 2100 × 45 m
 *   RWY 17 point 09°33'19.40"N 100°03'42.26"E · RWY 35 point 09°32'27.55"N 100°03'47.31"E
 *     (listed in the AIP table as runway centre-line points — used here as the thresholds)
 *   ATS airspace (AD 2.17): circle of 5 NM radius centred on SAMUI NDB 09°33'14.01"N 100°03'35.65"E,
 *     SFC – 2000 ft AGL, Class D, Samui Tower
 * GAME MODEL (not a published zone):
 *   Approach funnels use the planform of an ICAO Annex 14 approach surface for a non-precision
 *   code 3/4 runway — inner edge 280 m, 60 m before the threshold, 15 % divergence each side,
 *   15 km long — and treat anything below the 3° approach path + 150 m inside it as in conflict.
 * RULES SUMMARY (CAAT public guidance on sky lanterns, 2017): release only with district approval,
 *   notify the airport / ATC of date, time, place and number, keep two contacts reachable;
 *   penalty under the NCPO Section 44 order up to 3 years and/or 60,000 THB. Verify for currency.
 */
import { localEN, offsetGeo, distanceM, type GeoPoint } from './zones';

const dms = (d: number, m: number, s: number) => d + m / 60 + s / 3600;
export const NM = 1852;
export const FT = 0.3048;

export const VTSM = {
  icao: 'VTSM', name: 'Samui Airport', nameTh: 'ท่าอากาศยานสมุย',
  arp: { lat: dms(9, 32, 56), lon: dms(100, 3, 45) } as GeoPoint,
  elev: 19.5,
  ndb: { lat: dms(9, 33, 14.01), lon: dms(100, 3, 35.65) } as GeoPoint,
  ctr: { radius: 5 * NM, ceilingAGL: 2000 * FT, cls: 'D' as const },
  runways: [
    { id: '17', thr: { lat: dms(9, 33, 19.40), lon: dms(100, 3, 42.26) } as GeoPoint, bearing: 174.48, elev: 43 * FT },
    { id: '35', thr: { lat: dms(9, 32, 27.55), lon: dms(100, 3, 47.31) } as GeoPoint, bearing: 354.48, elev: 56 * FT },
  ],
};

/** Game-model approach funnel (Annex 14-style planform) */
export const FUNNEL = { innerHalf: 140, offset: 60, divergence: 0.15, length: 15_000, glideDeg: 3, band: 150 };

export interface Funnel { rwy: string; thr: GeoPoint; outBearing: number; thrElev: number }
/** Aircraft land on RWY 17 flying 174°: its approach funnel extends the other way (354°) from THR 17 */
export const FUNNELS: Funnel[] = VTSM.runways.map((r) => ({ rwy: r.id, thr: r.thr, outBearing: (r.bearing + 180) % 360, thrElev: r.elev }));

/** Distance along the extended centreline (out from the threshold) and across it, metres */
export function funnelCoords(f: Funnel, p: GeoPoint) {
  const { e, n } = localEN(f.thr, p);
  const b = (f.outBearing * Math.PI) / 180;
  return { along: e * Math.sin(b) + n * Math.cos(b), across: e * Math.cos(b) - n * Math.sin(b) };
}

export function inFunnelPlan(f: Funnel, p: GeoPoint): boolean {
  const { along, across } = funnelCoords(f, p);
  const d = along - FUNNEL.offset;
  return d >= 0 && d <= FUNNEL.length && Math.abs(across) <= FUNNEL.innerHalf + FUNNEL.divergence * d;
}

/** Height of the 3° approach path above mean sea level at a distance `along` from the threshold */
export const glidePathMSL = (f: Funnel, along: number) => f.thrElev + Math.max(0, along) * Math.tan((FUNNEL.glideDeg * Math.PI) / 180);

/** Funnel outline polygon (lat/lon) for drawing */
export function funnelPolygon(f: Funnel): GeoPoint[] {
  const b = (f.outBearing * Math.PI) / 180, ue = Math.sin(b), un = Math.cos(b), ce = Math.cos(b), cn = -Math.sin(b);
  const at = (along: number, across: number) => offsetGeo(f.thr, ue * along + ce * across, un * along + cn * across);
  const d0 = FUNNEL.offset, d1 = FUNNEL.offset + FUNNEL.length, h0 = FUNNEL.innerHalf, h1 = h0 + FUNNEL.divergence * FUNNEL.length;
  return [at(d0, -h0), at(d1, -h1), at(d1, h1), at(d0, h0)];
}

export const inCTR = (p: GeoPoint, altAGL: number) => distanceM(p, VTSM.ndb) <= VTSM.ctr.radius && altAGL <= VTSM.ctr.ceilingAGL;

/** Launch sites on Koh Pha-ngan / Samui (beach positions approximate, ±300 m) */
export interface LanternSite { id: string; name: string; nameTh: string; island: 'phangan' | 'samui'; pos: GeoPoint; windFrom: number; note: string }
export const LANTERN_SITES: LanternSite[] = [
  { id: 'haad-rin', name: 'Haad Rin (Full Moon beach)', nameTh: 'หาดริ้น เกาะพะงัน', island: 'phangan', pos: { lat: 9.6775, lon: 100.0652 }, windFrom: 15,
    note: 'Party central. Also: right under the extended centreline of Samui RWY 17, about 13.5 km out.' },
  { id: 'thong-sala', name: 'Thong Sala pier', nameTh: 'ท่าเรือท้องศาลา', island: 'phangan', pos: { lat: 9.7126, lon: 99.9876 }, windFrom: 45,
    note: 'West coast. The NE monsoon carries lanterns out over the sea — away from the runway.' },
  { id: 'chaweng', name: 'Chaweng beach, Samui', nameTh: 'หาดเฉวง เกาะสมุย', island: 'samui', pos: { lat: 9.5310, lon: 100.0610 }, windFrom: 90,
    note: 'Two kilometres from the runway, inside the Samui control zone. Do not.' },
];
/** Coastlines: Natural Earth 1:10m land (public domain), clipped to the Samui–Pha-ngan box. Coarse (~1 km). */
export const COASTS: { name: string; pts: [number, number][] }[] = [
  { name: 'Ko Samui', pts: [[9.5864, 100.0702], [9.585, 100.0759], [9.5745, 100.0859], [9.5609, 100.0907], [9.55, 100.0801], [9.5217, 100.0718], [9.4898, 100.0686], [9.4638, 100.0609], [9.4502, 100.032], [9.4435, 100.0296], [9.4357, 100.0288], [9.4291, 100.0259], [9.4257, 100.0193], [9.4255, 100.0116], [9.4262, 100.0036], [9.4216, 99.9563], [9.4182, 99.9466], [9.4375, 99.9408], [9.4746, 99.9367], [9.494, 99.9263], [9.5119, 99.9412], [9.5303, 99.9396], [9.5486, 99.9312], [9.566, 99.9263], [9.5777, 99.9363], [9.5808, 99.9595], [9.579, 99.9847], [9.5642, 100.0437], [9.5674, 100.0623], [9.5864, 100.0702]] },
  { name: 'Ko Pha-ngan', pts: [[9.7956, 100.0354], [9.7756, 100.0672], [9.7424, 100.0793], [9.6653, 100.0901], [9.6738, 100.0786], [9.6877, 100.054], [9.7104, 99.9992], [9.7199, 99.9876], [9.7317, 99.9933], [9.7429, 99.9899], [9.7646, 99.9706], [9.7712, 99.9707], [9.7919, 99.9836], [9.8018, 99.9876], [9.7973, 99.9979], [9.7964, 100.0078], [9.7978, 100.0261], [9.7956, 100.0354]] },
];
