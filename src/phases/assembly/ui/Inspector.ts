/**
 * Part inspector — a small floating card over the build area that appears
 * only when a placed part is selected.
 *
 *   header   name · minimise · close
 *   actions  rotate, flip ↔, flip ↕, remove
 *   material compact chips (the part's allowed materials)
 *   summary  one line: mass · cost · safety factor
 *   Details  (collapsed) cost, integrity, load/heat, material note,
 *            "apply to all", stress map
 */
import { PART, dryMass, partCost, materialFor, SALTS, type FailureMode, type Salt } from '../model/catalog';
import { flameColour, toCss, EMITTERS } from '@/chemistry/flameLab';
import { MATERIALS } from '@/data/materials';
import { ZOMBIES, ZOMBIE_IDS, type ZombieId } from '@/payload/zombies';
import { riderOf } from '../model/vehicle';
import type { VehicleStore } from '../store';
import { fmtForce, fmtMass, fmtMoney } from './format';

export type InspectorAction = 'rotate' | 'flip-x' | 'flip-y' | 'delete' | 'close' | 'stress' | { mat: string } | { matAll: string } | { rider: ZombieId | 'empty' } | { salt: Salt | null };

const MODE_TEXT: Record<FailureMode, string> = {
  load: 'buckles under the launch load',
  pressure: 'splits under internal pressure',
  bending: 'snaps at the root under air load',
  heat: 'is weakened by heat',
};

const KEY = 'rocketscience.inspector.v1';

export class Inspector {
  private el: HTMLElement;
  private off: () => void;
  private state = { minimised: false, details: false };
  stressOn = false;

  constructor(host: HTMLElement, private store: VehicleStore, private onAction: (a: InspectorAction) => void) {
    try { Object.assign(this.state, JSON.parse(localStorage.getItem(KEY) ?? '{}')); } catch { /* storage unavailable */ }
    this.el = document.createElement('section');
    this.el.className = 'inspector';
    this.el.hidden = true;
    this.el.setAttribute('aria-label', 'Part inspector');
    this.el.innerHTML = `
      <header class="insp-head">
        <i class="insp-dot" aria-hidden="true"></i>
        <div class="insp-title"><h3></h3><small></small></div>
        <button type="button" class="icon" data-act="min" aria-expanded="true" title="Minimise">–</button>
        <button type="button" class="icon" data-act="close" title="Close (Esc)">×</button>
      </header>
      <div class="insp-body">
        <div class="insp-actions">
          <button type="button" data-act="rotate" title="Rotate 90° (R)">⟳ Rotate</button>
          <button type="button" data-act="flip-x" title="Flip left↔right (H)">⇋ Flip</button>
          <button type="button" data-act="flip-y" title="Flip top↔bottom (V)">⇵ Flip</button>
          <button type="button" data-act="delete" class="danger" title="Remove (Del)">Remove</button>
        </div>
        <div class="insp-mats insp-riders" role="radiogroup" aria-label="Test payload" hidden></div>
        <div class="insp-mats insp-salts" role="radiogroup" aria-label="Firework charge" hidden></div>
        <div class="insp-mats" data-k="mats" role="radiogroup" aria-label="Material"></div>
        <p class="insp-sum"></p>
        <details class="insp-more">
          <summary>Details</summary>
          <dl class="insp-stats"></dl>
          <button type="button" class="link" data-act="mat-all" hidden></button>
          <label class="insp-toggle"><input type="checkbox" data-act="stress"> Show stress map (S)</label>
        </details>
      </div>`;
    host.appendChild(this.el);

    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const salt = t.closest('[data-salt]') as HTMLElement | null;
      if (salt) { this.onAction({ salt: (salt.dataset.salt || null) as Salt | null }); return; }
      const rider = t.closest('[data-rider]') as HTMLElement | null;
      if (rider) { this.onAction({ rider: rider.dataset.rider as ZombieId | 'empty' }); return; }
      const mat = t.closest('[data-mat]') as HTMLElement | null;
      if (mat) { this.onAction({ mat: mat.dataset.mat! }); return; }
      const act = (t.closest('[data-act]') as HTMLElement | null)?.dataset.act;
      if (!act) return;
      if (act === 'min') { this.state.minimised = !this.state.minimised; this.persist(); this.render(); }
      else if (act === 'mat-all') this.onAction({ matAll: (t.closest('[data-act]') as HTMLElement).dataset.mat! });
      else if (act === 'stress') this.onAction('stress');
      else this.onAction(act as InspectorAction);
    });
    const more = this.el.querySelector('.insp-more') as HTMLDetailsElement;
    more.open = this.state.details;
    more.addEventListener('toggle', () => { this.state.details = more.open; this.persist(); });
    this.off = store.on(() => this.render());
  }

  dispose() { this.off(); this.el.remove(); }

  private persist() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* storage unavailable */ } }

  render() {
    const sel = this.store.selected !== null ? this.store.get(this.store.selected) : undefined;
    this.el.hidden = !sel;
    if (!sel) return;
    const d = PART[sel.defId];
    const mat = materialFor(d, sel.mat);
    const integ = this.store.telemetry.integrity.get(sel.uid);
    const q = <T extends HTMLElement>(s: string) => this.el.querySelector(s) as T;

    this.el.classList.toggle('min', this.state.minimised);
    q('[data-act="min"]').setAttribute('aria-expanded', String(!this.state.minimised));
    q('[data-act="min"]').textContent = this.state.minimised ? '+' : '–';
    q('[data-act="min"]').title = this.state.minimised ? 'Expand' : 'Minimise';
    q('.insp-dot').style.background = mat.color;
    q('.insp-dot').style.borderColor = mat.colorDark;
    q('.insp-title h3').textContent = d.name;
    q('.insp-title small').textContent = d.materials ? `${mat.name} · ${d.nameTh}` : d.nameTh;

    // Zombie chips (seat parts)
    const riders = q('.insp-riders');
    riders.hidden = !d.crew;
    if (d.crew) {
      const cur = riderOf(sel) ?? 'empty';
      riders.innerHTML = [...ZOMBIE_IDS, 'empty' as const].map((id) => {
        const label = id === 'empty' ? 'Empty seat' : ZOMBIES[id].name.replace(' zombie', '');
        const tip = id === 'empty' ? 'Fly it empty.' : ZOMBIES[id].description;
        const dot = id === 'empty' ? 'transparent' : ZOMBIES[id].skin;
        return `<button type="button" role="radio" aria-checked="${id === cur}" data-rider="${id}" title="${tip}">
          <i style="background:${dot};border-color:#1b2230"></i><span>${label}</span></button>`;
      }).join('');
    }

    // Firework charge (solid motors): bursts in the salt's flame-test colour
    const salts = q('.insp-salts');
    const solid = d.engine && d.engine.kind !== 'liquid';
    salts.hidden = !solid;
    if (solid) {
      const cur = sel.salt ?? '';
      salts.innerHTML = `<span class="insp-label">Firework charge</span>` + ['', ...SALTS].map((id) => {
        const col = id ? toCss(flameColour({ amounts: { [id]: 1 }, contamination: 0 })) : 'transparent';
        const label = id ? `${id} · ${EMITTERS[id].perceived}` : 'None';
        return `<button type="button" role="radio" aria-checked="${id === cur}" data-salt="${id}" title="${id ? `${EMITTERS[id].name}: ${EMITTERS[id].fact}` : 'No charge'}"><i style="background:${col};border-color:#1b2230"></i><span>${label}</span></button>`;
      }).join('');
    }

    // Material chips
    const mats = q('[data-k="mats"]');
    if (d.materials) {
      mats.hidden = false;
      mats.innerHTML = d.materials.map((id) => {
        const m = MATERIALS[id];
        const delta = dryMass(d, id) - dryMass(d, mat.id);
        const hint = id === mat.id ? 'current' : `${delta > 0 ? '+' : '−'}${fmtMass(Math.abs(delta))}`;
        return `<button type="button" role="radio" aria-checked="${id === mat.id}" data-mat="${id}" title="${m.name}: ${hint}. ${m.note}">
          <i style="background:${m.color};border-color:${m.colorDark}"></i><span>${m.name}</span></button>`;
      }).join('');
    } else {
      mats.hidden = true;
    }

    // One-line summary
    const sf = integ?.safetyFactor;
    const sfCls = sf === undefined ? '' : sf < 1 ? 'bad' : sf < 1.5 ? 'warn' : 'good';
    const zm = d.crew && riderOf(sel) ? ZOMBIES[riderOf(sel)!].mass : 0;
    q('.insp-sum').innerHTML = `${fmtMass(dryMass(d, mat.id) + zm)} · ${fmtMoney(partCost(d, mat.id))}${sf !== undefined ? ` · strength <b class="sf ${sfCls}">${Number.isFinite(sf) ? `×${sf.toFixed(2)}` : 'no load'}</b>` : ''}`
      + (sf !== undefined && sf < 1 ? `<span class="insp-warn">This part ${MODE_TEXT[integ!.mode]}.</span>` : '');

    // Details
    q('.insp-stats').innerHTML = `
      <div><dt>Dry mass</dt><dd>${fmtMass(dryMass(d, mat.id))}</dd></div>
      <div><dt>Cost</dt><dd>${fmtMoney(partCost(d, mat.id))}</dd></div>
      ${integ ? `
        <div><dt>Safety factor</dt><dd class="sf ${sfCls}">${Number.isFinite(sf) ? `×${sf!.toFixed(2)}` : 'nothing presses on it'}</dd></div>
        <div><dt>Weak point</dt><dd>${integ.mode === 'load' ? 'launch load' : integ.mode}</dd></div>
        <div><dt>Load at liftoff</dt><dd>${fmtForce(integ.loadN)}</dd></div>
        <div><dt>Wall temperature</dt><dd>${integ.temperature} °C${integ.heatFactor < 0.95 ? ` · −${Math.round((1 - integ.heatFactor) * 100)}% strength` : ''}</dd></div>` : ''}
      <div class="wide"><dt>${d.materials ? mat.name : 'Construction'}</dt><dd class="note">${d.materials ? mat.note : 'Engines are bought, not built — fixed construction.'}</dd></div>`;
    const same = this.store.parts.filter((p) => p.defId === sel.defId).length;
    const all = q('[data-act="mat-all"]');
    all.hidden = !d.materials || same < 2;
    all.dataset.mat = mat.id;
    all.textContent = `Make all ${same} ${d.name.toLowerCase()} parts ${mat.name.toLowerCase()}`;
    (q('[data-act="stress"]') as unknown as HTMLInputElement).checked = this.stressOn;
  }
}
