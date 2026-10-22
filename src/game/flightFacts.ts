/**
 * Flight facts — what happened (or, for a forecast, what WILL happen) in one flight, read from the real simulation.
 *
 *   factsFromFlight(f, ctx)   a finished (or running) Flight → facts, for the debrief
 *   forecastFlight(input)     run the same Flight headless, to the end, → facts, for the pre-launch forecast
 *
 * Nothing here has its own physics: a forecast is `new Flight(...)` stepped to the end with the same settings the player
 * has chosen, so it cannot disagree with the flight itself (the same seed, the same time step).
 */
import { Flight, type FlightOutcome, type LaunchSite } from '@/physics/flight2d';
import { PART } from '@/phases/assembly/model/catalog';
import { telemetry, type PlacedPart } from '@/phases/assembly/model/vehicle';
import { AirspaceMonitor } from '@/law/airspaceMonitor';
import type { LanternSite } from '@/law/samui';
import type { Heightfield } from '@/world/terrain';

export interface TrackPoint { x: number; alt: number }

export interface FlightFacts {
  /** True when this came from a headless forecast, not a flight the player watched */
  forecast: boolean;
  kind: 'lantern' | 'rocket';
  outcome: FlightOutcome;
  apogeeM: number;
  /** Flight time at the end (s) */
  endS: number;
  liftoffS: number | null;
  railM: number; railAngleDeg: number; windMs: number;
  /** Speed leaving the rail or ramp (m/s) */
  railExitMs: number | null;
  tumbleAtS: number | null; tumbleAltM: number | null;
  maxTiltDeg: number; maxAoaDeg: number;
  /** When the (main) motor stopped burning, and how long the pre-flight panel said it would */
  burnoutAtS: number | null; burnPlannedS: number;
  impactMs: number; rangeM: number; maxSpeedMs: number;
  twr: number; massKg: number; cpAboveComM: number; deltaV: number;
  /** Mixing Bench stir quality of the powder (0–1; 1 = no solid motor or a perfect batch) */
  quality: number;
  hasChute: boolean; chuteOpened: boolean;
  /** Airspace alert ids (zones, approach paths) and when the first one fired */
  alerts: string[]; firstAlertS: number | null;
  lanternSiteId: string | null; windFrom: number | null;
  lanternFire: boolean; lanternGroundFire: boolean;
  /** Hot-air flights: the longest the lantern stayed up and the lantern site's drift (km) */
  track: TrackPoint[];
  /** Rocket flights: nothing ever pitched over (tilt stayed under 60°) */
  stayedUpright: boolean;
}

export interface FactsContext {
  /** The vehicle's pre-flight numbers (burn time, TWR, mass, CP − CoM) */
  parts: PlacedPart[];
  site: LaunchSite;
  quality?: number;
  monitor?: AirspaceMonitor | null;
  /** Hot-air flights: the site (id) and the bearing the wind blows from */
  lantern?: { siteId: string; windFrom: number } | null;
}

const downsample = (pts: TrackPoint[], n = 90): TrackPoint[] => {
  if (pts.length <= n) return pts;
  const out: TrackPoint[] = [];
  for (let i = 0; i < n; i++) out.push(pts[Math.round((i * (pts.length - 1)) / (n - 1))]);
  return out;
};

export function factsFromFlight(f: Flight, ctx: FactsContext, forecast = false): FlightFacts {
  const r = f.result();
  const tel = telemetry(ctx.parts);
  const ev = (k: string) => r.events.find((e) => e.kind === k);
  const lantern = ctx.parts.some((p) => PART[p.defId].envelope);
  const tumble = ev('tumble') ?? ev('cartwheel');
  const burnouts = r.events.filter((e) => e.kind === 'burnout');
  const samples = r.samples;
  const tumbleSample = tumble ? samples.find((s) => s.t >= tumble.t) : undefined;
  const alerts = ctx.monitor ? ctx.monitor.alerts.map((a) => a.id) : [];
  const firstAlert = ctx.monitor?.alerts.find((a) => a.id !== 'fine');
  return {
    forecast, kind: lantern ? 'lantern' : 'rocket',
    outcome: r.outcome, apogeeM: r.maxAlt, endS: f.t,
    liftoffS: ev('liftoff')?.t ?? null,
    railM: ctx.site.rail, railAngleDeg: ctx.site.railAngleDeg, windMs: ctx.site.wind,
    railExitMs: f.railExitSpeed,
    tumbleAtS: tumble?.t ?? null, tumbleAltM: tumbleSample ? tumbleSample.alt : null,
    maxTiltDeg: r.maxTiltDeg, maxAoaDeg: r.maxAoaDeg,
    burnoutAtS: burnouts.length ? burnouts[burnouts.length - 1].t : null, burnPlannedS: tel.burnTime,
    impactMs: r.impactSpeed, rangeM: r.range, maxSpeedMs: r.maxSpeed,
    twr: tel.twr, massKg: tel.wetMass, cpAboveComM: tel.cpAboveCom, deltaV: tel.deltaV, quality: ctx.quality ?? 1,
    hasChute: ctx.parts.some((p) => !!PART[p.defId].chute), chuteOpened: r.events.some((e) => e.kind === 'chute' && /deployed/.test(e.text)),
    alerts, firstAlertS: firstAlert?.t ?? null,
    lanternSiteId: ctx.lantern?.siteId ?? null, windFrom: ctx.lantern?.windFrom ?? null,
    lanternFire: r.events.some((e) => e.kind === 'lantern-fire'), lanternGroundFire: r.events.some((e) => e.kind === 'lantern-ground-fire'),
    track: downsample(samples.map((s) => ({ x: s.x, alt: s.alt }))),
    stayedUpright: r.maxTiltDeg < 60,
  };
}

export interface ForecastInput {
  parts: PlacedPart[];
  site: LaunchSite;
  /** Hot-air flights: the lantern site, wind bearing and permit box, for the airspace monitor */
  lantern?: { site: LanternSite; windFrom: number; permitted: boolean } | null;
  terrain?: Heightfield | null;
  /** Mixing Bench stir quality of the powder (0–1), as the flight will use it */
  quality?: number;
  /** Simulated seconds to give up after (a lantern lives ~25 minutes) */
  maxTimeS?: number;
}

/** A forecast run as a generator: each `next()` advances a slice of the flight (so the UI can stay responsive) */
function* run(inp: ForecastInput): Generator<number, FlightFacts, void> {
  const f = new Flight(inp.parts, { site: { ...inp.site }, terrain: inp.terrain ?? undefined, propellantQuality: inp.quality });
  f.controls.sas = f.vehicle.gimbals.length > 0;
  const mon = inp.lantern ? new AirspaceMonitor(inp.lantern.site, inp.lantern.windFrom, inp.lantern.permitted) : null;
  f.ignite();
  const limit = inp.maxTimeS ?? 2700;
  let n = 0;
  while (!f.done && f.t < limit) {
    f.step();
    if (mon && n % 25 === 0) mon.update(f.t, f.vehicle.downrange, Math.max(0, f.vehicle.lowestAlt()), f.airborne && !f.vehicle.landed);
    if (++n % 4000 === 0) yield Math.min(0.99, f.t / limit);
  }
  return factsFromFlight(f, { parts: inp.parts, site: inp.site, quality: inp.quality, monitor: mon, lantern: inp.lantern ? { siteId: inp.lantern.site.id, windFrom: inp.lantern.windFrom } : null }, true);
}

/** Run a forecast to the end in one go (rockets take 5–40 ms; a 25-minute lantern 1–3 s) */
export function forecastFlight(inp: ForecastInput): FlightFacts {
  const g = run(inp);
  for (;;) { const r = g.next(); if (r.done) return r.value; }
}

/** The same forecast in slices of ~10 ms, so a phone keeps drawing; `onProgress` gets 0…1 */
export function forecastAsync(inp: ForecastInput, onProgress?: (p: number) => void, cancelled: () => boolean = () => false): Promise<FlightFacts | null> {
  return new Promise((resolve) => {
    const g = run(inp);
    const slice = () => {
      if (cancelled()) { resolve(null); return; }
      const t0 = performance.now();
      for (;;) {
        const r = g.next();
        if (r.done) { resolve(r.value); return; }
        onProgress?.(r.value);
        if (performance.now() - t0 > 10) break;
      }
      setTimeout(slice, 0);
    };
    slice();
  });
}
