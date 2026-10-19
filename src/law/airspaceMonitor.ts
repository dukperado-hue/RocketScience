/**
 * Live airspace monitor for Tier 0–1 flights (lanterns, Bang Fai, chairs).
 *
 * The flight sim is planar: its downrange axis is laid on the map along the WIND (the
 * direction it blows toward), so position = launch site + downrange × wind unit vector.
 * A lantern has no thrust; its only horizontal motion is drift, so this is exact for the
 * mean wind (crosswind gusts are not modelled).
 *
 * Emits one-shot alerts when the payload enters the Samui control zone (Class D, SFC–2000 ft
 * AGL) or comes below the RWY 17 / 35 approach path inside the approach funnel.
 */
import { offsetGeo, type GeoPoint } from './zones';
import { FUNNELS, FUNNEL, VTSM, funnelCoords, glidePathMSL, inCTR, inFunnelPlan, type LanternSite } from './samui';

export interface AirspaceAlert {
  id: string; t: number; severity: 'warning' | 'violation';
  title: string; titleTh: string; detail: string; basis: string; fineTHB: number;
}

export interface TrackPoint { t: number; pos: GeoPoint; alt: number }

export class AirspaceMonitor {
  readonly track: TrackPoint[] = [];
  readonly alerts: AirspaceAlert[] = [];
  /** Zones the payload is inside right now (for the radar's red flash) */
  inside = new Set<string>();
  fines = 0;
  private fired = new Set<string>();

  constructor(readonly site: LanternSite, public windFrom: number, readonly permitted = false) {}

  /** Bearing the wind blows toward (deg) = the map direction of the sim's +x axis */
  get windTo() { return (this.windFrom + 180) % 360; }

  posFor(downrange: number): GeoPoint {
    const b = (this.windTo * Math.PI) / 180;
    return offsetGeo(this.site.pos, downrange * Math.sin(b), downrange * Math.cos(b));
  }

  /** Feed the payload's downrange (m) and altitude above ground (m). Returns new alerts. */
  update(t: number, downrange: number, altAGL: number, airborne: boolean): AirspaceAlert[] {
    const pos = this.posFor(downrange);
    const last = this.track[this.track.length - 1];
    if (!last || t - last.t >= 1) this.track.push({ t, pos, alt: altAGL });
    const fresh: AirspaceAlert[] = [];
    this.inside.clear();
    // a lantern still warming up on the beach (resting contact, a few cm up) is not in anyone's airspace yet
    if (!airborne || altAGL < 2) return fresh;
    if (inCTR(pos, altAGL)) {
      this.inside.add('ctr');
      fresh.push(...this.once('ctr', t, 'violation', 'Unauthorised object in the Samui control zone',
        'วัตถุล้ำเข้าเขตควบคุมจราจรทางอากาศสมุย',
        `At ${altAGL.toFixed(0)} m, ${(this.distNdb(pos) / 1000).toFixed(1)} km from the Samui NDB — inside the 5 NM Class D zone (SFC–2,000 ft).`,
        'AIP Thailand AD 2 VTSM, AD 2.17 (ATS airspace)', 0));
    }
    for (const f of FUNNELS) {
      if (!inFunnelPlan(f, pos)) continue;
      const { along } = funnelCoords(f, pos);
      const gp = glidePathMSL(f, along - FUNNEL.offset) - VTSM.elev;   // path height above the ground here (approx.)
      if (altAGL <= gp + FUNNEL.band) {
        this.inside.add(`app-${f.rwy}`);
        fresh.push(...this.once(`app-${f.rwy}`, t, 'violation', `In the RWY ${f.rwy} final approach path`,
          `ล้ำเข้าแนวร่อนลงทางวิ่ง ${f.rwy}`,
          `${(along / 1000).toFixed(1)} km out on the extended centreline at ${altAGL.toFixed(0)} m — aircraft on a 3° approach pass here at about ${gp.toFixed(0)} m.`,
          'Game model of an ICAO Annex 14 approach surface (not a published zone)', 0));
      }
    }
    if (fresh.length && !this.permitted && !this.fired.has('fine')) {
      this.fired.add('fine');
      const fine = 60_000;
      this.fines += fine;
      fresh.push({ id: 'fine', t, severity: 'violation', title: 'No permit, no ATC notification', titleTh: 'ไม่ได้รับอนุญาต / ไม่ได้แจ้งหอบังคับการบิน',
        detail: 'Sky lanterns need district approval and advance notice to the airport or ATC (date, time, place, number). Maximum penalty: 3 years and/or 60,000 THB.',
        basis: 'CAAT public guidance on sky lanterns (NCPO Section 44 order) — verify current rules', fineTHB: fine });
    }
    this.alerts.push(...fresh);
    return fresh;
  }

  private distNdb(p: GeoPoint) { const dx = (p.lon - VTSM.ndb.lon) * 111_320 * Math.cos((p.lat * Math.PI) / 180), dy = (p.lat - VTSM.ndb.lat) * 110_574; return Math.hypot(dx, dy); }

  private once(id: string, t: number, severity: AirspaceAlert['severity'], title: string, titleTh: string, detail: string, basis: string, fineTHB: number): AirspaceAlert[] {
    if (this.fired.has(id)) return [];
    this.fired.add(id);
    return [{ id, t, severity, title, titleTh, detail, basis, fineTHB }];
  }
}
