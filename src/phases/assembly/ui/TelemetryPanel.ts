/**
 * Telemetry panel (right) — the basics only: TWR, mass, thrust, Δv, burn
 * time, pre-flight checks and the launch button. Cost and structural detail
 * live in the part inspector, one click away.
 */
import { PART } from '../model/catalog';
import { ZOMBIES, zombieForecast } from '@/payload/zombies';
import type { Telemetry } from '../model/vehicle';
import type { VehicleStore } from '../store';
import { fmtForce, fmtMass } from './format';
import { U_ENVELOPE, airTemp, steadyTin, floatTin } from '@/physics/buoyancy';

type Sev = 'ok' | 'warn' | 'error';

/**
 * Hot-air builds (Tier 0) have no motor: check the heat balance instead of thrust-to-weight.
 * Same maths as the flight (physics/buoyancy.ts) at sea level, so the forecast matches the pad.
 */
function lanternChecks(defIds: string[], wetMass: number): { sev: Sev; msg: string }[] {
  const env = defIds.map((id) => PART[id]?.envelope).filter((e): e is NonNullable<typeof e> => !!e);
  const heat = defIds.map((id) => PART[id]?.heater).filter((h): h is NonNullable<typeof h> => !!h);
  if (!env.length) return [];
  if (!heat.length) return [{ sev: 'error', msg: 'No heat source under the envelope. Right now it is a paper bag.' }];
  const V = env.reduce((s, e) => s + e.volume, 0), A = env.reduce((s, e) => s + e.area, 0);
  const P = heat.reduce((s, h) => s + h.power, 0), ignite = Math.min(...env.map((e) => e.igniteC));
  const Tout = airTemp(0), rho = 1.225;
  const Tss = steadyTin(P, U_ENVELOPE * A, Tout), Tfl = floatTin(wetMass, V, rho, Tout);
  const c = (k: number) => `${Math.round(k - 273.15)} °C`;
  const out: { sev: Sev; msg: string }[] = [];
  if (!Number.isFinite(Tfl)) out.push({ sev: 'warn', msg: `Too heavy for this much hot air: ${fmtMass(wetMass)} needs more than ${V.toFixed(2)} m³ of envelope. It will not float at any temperature.` });
  else if (Tss <= Tfl) out.push({ sev: 'warn', msg: `Not enough heat: ${(P / 1000).toFixed(P < 1000 ? 2 : 1)} kW warms the air to about ${c(Tss)}, but it needs ${c(Tfl)} to float. A bigger flame or a lighter build.` });
  else out.push({ sev: 'ok', msg: `Hot air: about ${c(Tss)} inside, floats above ${c(Tfl)}. Give it a minute to warm up.` });
  if (Tss - 273.15 > ignite) out.push({ sev: 'warn', msg: `The air inside heads for ${c(Tss)} — this envelope catches fire at ${ignite} °C.` });
  return out;
}

export function checks(t: Telemetry, partCount: number, nameOf: (uid: number) => string, defIds: string[] = []): { sev: Sev; msg: string }[] {
  const out: { sev: Sev; msg: string }[] = [];
  if (partCount === 0) return [{ sev: 'warn', msg: 'Start with a seat or a pod, then add motors.' }];
  const hot = lanternChecks(defIds, t.wetMass);
  out.push(...hot);
  if (hot.length) { /* a lantern: no motor needed */ }
  else if (t.engines === 0) out.push({ sev: 'error', msg: 'No motor attached. It’s furniture.' });
  else if (t.twr < 1) out.push({ sev: 'error', msg: `Thrust-to-weight ${t.twr.toFixed(2)} — it won’t leave the pad. Lighter material, or more thrust.` });
  else if (t.twr < 1.3) out.push({ sev: 'warn', msg: `Thrust-to-weight ${t.twr.toFixed(2)} — it will lift off slowly.` });
  if (t.atRisk.length === 1) out.push({ sev: 'warn', msg: `${nameOf(t.atRisk[0])} is likely to fail. Click it to see why.` });
  else if (t.atRisk.length > 1) out.push({ sev: 'warn', msg: `${t.atRisk.length} parts are likely to fail. Click one to see why.` });
  if (t.engines > 0 && t.cpAboveCom > 0.02) out.push({ sev: 'warn', msg: `Centre of pressure is ${(t.cpAboveCom * 100).toFixed(0)} cm above the centre of mass — it will tumble once it’s moving fast. Add fins low down.` });
  else if (t.engines > 0 && t.cpAboveComLate > 0.02) out.push({ sev: 'warn', msg: `Stable now, but past Mach 3 with empty tanks the centre of pressure is ${(t.cpAboveComLate * 100).toFixed(0)} cm above the centre of mass — it will flip late in the climb. Bigger fins, lower down.` });
  if (t.rider && t.engines > 0) { const f = zombieForecast(t.rider.zombie, t.burnoutG); if (f) out.push({ sev: 'warn', msg: f }); }
  if (t.engines > 0 && t.thrustOffset > 0.03) out.push({ sev: 'warn', msg: `Thrust is ${(t.thrustOffset * 100).toFixed(0)} cm off the centre of mass — it will turn.` });
  if (t.blocked.length) out.push({ sev: 'warn', msg: `${t.blocked.length} motor${t.blocked.length > 1 ? 's fire' : ' fires'} into another part.` });
  if (t.loose.length) out.push({ sev: 'warn', msg: `${t.loose.length} part${t.loose.length > 1 ? 's are' : ' is'} not attached.` });
  if (t.overlapping.length) out.push({ sev: 'warn', msg: `${t.overlapping.length} overlapping part${t.overlapping.length > 1 ? 's' : ''} won’t launch.` });
  if (t.rider && t.engines > 0) { const z = ZOMBIES[t.rider.zombie]; out.push({ sev: 'ok', msg: `Payload: ${z.name.toLowerCase()} (${z.mass} kg). Already dead, so it’s fine.` }); }
  else if (t.engines > 0) out.push({ sev: 'ok', msg: 'No payload — an empty test flight.' });
  if (!out.some((c) => c.sev !== 'ok')) out.push({ sev: 'ok', msg: 'Ready to roll out.' });
  // ok lines last, so the warnings read first
  out.sort((a, b) => (a.sev === 'ok' ? 1 : 0) - (b.sev === 'ok' ? 1 : 0));
  return out;
}

export class TelemetryPanel {
  private off: () => void;

  constructor(private el: HTMLElement, private store: VehicleStore, private onLaunch: () => void) {
    el.innerHTML = `
      <h2>Vehicle</h2>
      <div class="twr">
        <span>Thrust ÷ weight</span><b data-k="twr">—</b>
        <div class="twr-meter"><i data-k="twr-bar"></i><em title="1.0 — just hovers"></em></div>
      </div>
      <dl class="stats">
        <div><dt>Total mass</dt><dd data-k="mass"></dd></div>
        <div><dt>Thrust</dt><dd data-k="thrust"></dd></div>
        <div><dt>Δv</dt><dd data-k="dv"></dd></div>
        <div><dt>Burn time</dt><dd data-k="burn"></dd></div>
      </dl>
      <h3>Pre-flight checks</h3>
      <ul class="checks" data-k="checks"></ul>
      <button type="button" class="btn primary launch" data-act="launch">Roll out to the pad</button>`;
    el.querySelector('[data-act="launch"]')!.addEventListener('click', () => this.onLaunch());
    this.off = store.on(() => this.render());
    this.render();
  }

  dispose() { this.off(); }

  private k(key: string) { return this.el.querySelector(`[data-k="${key}"]`) as HTMLElement; }

  render() {
    const t = this.store.telemetry;
    const parts = this.store.preview ?? this.store.parts;
    const nameOf = (uid: number) => { const p = parts.find((q) => q.uid === uid); return p ? PART[p.defId].name : 'A part'; };
    const cls = t.engines === 0 ? '' : t.twr < 1 ? 'bad' : t.twr < 1.3 ? 'warn' : 'good';
    this.k('twr').textContent = t.engines ? t.twr.toFixed(2) : '—';
    this.k('twr').className = cls;
    const bar = this.k('twr-bar');
    bar.style.width = `${Math.min(100, (t.twr / 3) * 100)}%`;
    bar.className = cls;
    this.k('mass').textContent = fmtMass(t.wetMass);
    this.k('thrust').textContent = fmtForce(t.thrust);
    this.k('dv').textContent = `${t.deltaV.toFixed(0)} m/s`;
    this.k('burn').textContent = `${t.burnTime.toFixed(1)} s`;
    const cs = checks(t, parts.length, nameOf, parts.map((q) => q.defId));
    this.k('checks').innerHTML = cs.map((c) => `<li class="${c.sev}">${c.msg}</li>`).join('');
    (this.el.querySelector('[data-act="launch"]') as HTMLButtonElement).disabled = cs.some((c) => c.sev === 'error');
  }
}
