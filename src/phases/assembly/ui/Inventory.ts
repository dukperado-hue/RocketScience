/**
 * Part inventory (left panel) — deliberately simple: one scrolling list of
 * base shapes, each shown in its default / historical material (Bang Fai in
 * bamboo, tanks in aluminium…). Materials are changed later, per part, in the
 * inspector. The whole panel doubles as the trash: drop a placed part here.
 */
import { CATALOG, CATEGORY_LABEL, engineStats, requiredGrade, dryMass, propellantMass, materialFor, type Category, type FactoryPartDef } from '../model/catalog';
import { GRADES, type BenchState, type GradeId } from '@/chemistry/mixingBench';
import { PRESETS } from '../model/presets';
import { drawThumb, drawZombieThumb } from './drawParts';
import { modelSprites } from '@/assets/modelSprites';
import { ZOMBIES, ZOMBIE_IDS, type ZombieId } from '@/payload/zombies';
import { fmtForce, fmtMass } from './format';
import { campaign } from '@/campaign/missionManager';
import { PART } from '../model/catalog';
import { LANNA_MANUAL } from '../model/lannaManual';
import { bus } from '@/core/EventBus';

import { gradeLock, lockForPart, missionLock, spaceAgeLock, type LockInfo } from '@/game/lockInfo';

export interface InventoryHooks {
  bench: () => BenchState;
  onGrab: (defId: string, e: PointerEvent) => void;
  onTap: (defId: string) => void;
  /** A locked part or blueprint was tapped: explain where it unlocks and take the player there */
  onLock: (info: LockInfo) => void;
  onPreset: (id: string) => void;
  /** A part (or blueprint) the campaign has not unlocked yet */
  /** Seat a zombie (in the selected seat, or the first seat on the vehicle) */
  onRider: (id: ZombieId) => void;
}

const CATS: Category[] = ['lantern', 'command', 'payload', 'propulsion', 'tanks', 'aero', 'structural', 'recovery'];

/** The inventory is grouped by era, not by category: what a new player can build first comes first */
interface Era { id: string; tiers: number[]; title: string; th: string; blurb: string }
const ERAS: Era[] = [
  { id: 'lanna', tiers: [0], title: 'Tier 0 · Lanna Workshop', th: 'โรงงานล้านนา', blurb: 'Paper, bamboo and fire. Hot air only — no thrust, no excuses.' },
  { id: 'backyard', tiers: [1, 2], title: 'Tier 1–2 · Backyard Ballistics', th: 'ขีปนาวุธหลังบ้าน', blurb: 'Gunpowder, Bang Fai, a chair, then metal tanks and liquid fuel.' },
  { id: 'space', tiers: [3, 4], title: 'Tier 3–4 · Space Age', th: 'ยุคอวกาศ', blurb: 'Orbit, pods, satellites, the telescope.' },
];
const presetTier = (pre: (typeof PRESETS)[number]) => Math.max(0, ...pre.build().map((p) => PART[p.defId]?.tier ?? 0));
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export class Inventory {
  readonly benchMount: HTMLElement;
  private chemistry: HTMLDetailsElement;
  private tip!: HTMLElement;
  private tipFor: string | null = null;
  private tipCard: HTMLElement | null = null;
  private tipDef: FactoryPartDef | null = null;

  constructor(private el: HTMLElement, private hooks: InventoryHooks) {
    el.innerHTML = `
      <header class="inv-head"><h2>Parts</h2><p>Drag onto the grid — or tap to attach.</p>
        <button type="button" class="inv-campaign" data-goto-missions></button>
        <button type="button" class="inv-lockinfo" hidden></button></header>
      <div class="inv-scroll">
        <nav class="inv-jump" aria-label="Jump to">
          <button type="button" data-jump="quick">Blueprints<small>แบบสำเร็จรูป</small></button>
          <button type="button" data-jump="era">Parts<small>ชิ้นส่วน</small></button>
          <button type="button" data-jump="bench">Mixing bench<small>โต๊ะผสม</small></button>
          <button type="button" data-jump="payload">Payloads<small>ผู้โดยสาร</small></button>
        </nav>
        <div class="inv-quick" aria-label="Blueprints"></div>
        ${ERAS.map((era) => `
          <details class="inv-cat inv-era era-${era.id}" data-era="${era.id}" ${era.id === 'space' ? '' : 'open'}>
            <summary>${era.title}<small>${era.th}</small></summary>
            <p class="inv-note">${era.blurb}</p>
            <div class="era-body" data-era-body="${era.id}"></div>
          </details>`).join('')}
        <details class="inv-cat" data-cat="zombies" open>
          <summary>Test payloads<small>ผู้โดยสารทดสอบ</small></summary>
          <p class="inv-note">Already dead, so they can take it. Tap one to strap it into the seat.</p>
          <div class="inv-list" data-list="zombies"></div>
        </details>
        <details class="inv-cat" data-cat="chemistry">
          <summary>Mixing bench<small>โต๊ะผสมเชื้อเพลิง</small></summary>
          <div class="bench-mount"></div>
        </details>
      </div>
      <div class="trash-label" aria-hidden="true">Release to remove</div>
      <div class="lanna-tip" role="tooltip" hidden></div>`;
    this.benchMount = el.querySelector('.bench-mount')!;
    this.chemistry = el.querySelector('details[data-cat="chemistry"]')!;
    this.tip = el.querySelector('.lanna-tip')!;
    el.querySelector('.inv-scroll')!.addEventListener('scroll', () => { if (this.tipCard && this.tipDef) this.place(this.tipCard); });
    el.querySelector('[data-goto-missions]')!.addEventListener('click', () => bus.emit('phase:request', { phase: 'mission' }));
    for (const b of el.querySelectorAll<HTMLElement>('[data-jump]')) b.addEventListener('click', () => this.jump(b.dataset.jump!));
    this.render();
  }

  render() {
    const bench = this.hooks.bench();
    const cap = campaign.cap;
    for (const era of ERAS) {
      const body = this.el.querySelector<HTMLElement>(`[data-era-body="${era.id}"]`)!;
      body.innerHTML = '';
      const soon = !!cap && era.tiers.every((t) => t > cap.maxTier);
      const box = body.closest('details')!;
      box.classList.toggle('soon', soon);
      box.querySelector('summary')!.innerHTML = soon ? `${era.title}<small>${cap!.label}</small>` : `${era.title}<small>${era.th}</small>`;
      if (!soon) {
        const pres = PRESETS.filter((pre) => era.tiers.includes(presetTier(pre)));
        if (pres.length) {
          body.insertAdjacentHTML('beforeend', `<h4 class="inv-sub">Blueprints<small>แบบสำเร็จรูป · ready to fly</small></h4>`);
          const box = document.createElement('div'); box.className = 'presets'; box.dataset.presets = era.id;
          for (const pre of pres) box.appendChild(this.presetButton(pre, bench));
          body.appendChild(box);
        }
      }
      for (const c of CATS) {
        const defs = CATALOG.filter((p) => p.category === c && era.tiers.includes(p.tier));
        if (!defs.length) continue;
        if (era.id !== 'lanna') body.insertAdjacentHTML('beforeend', `<h4 class="inv-sub">${CATEGORY_LABEL[c].en}<small>${CATEGORY_LABEL[c].th}</small></h4>`);
        const list = document.createElement('div'); list.className = 'inv-list'; list.dataset.list = `${era.id}-${c}`;
        for (const def of defs) list.appendChild(this.card(def, bench));
        body.appendChild(list);
      }
      if (soon) {
        const pres = PRESETS.filter((pre) => presetTier(pre) > cap!.maxTier);
        if (pres.length) body.insertAdjacentHTML('beforeend', `<h4 class="inv-sub">Blueprints<small>แบบสำเร็จรูป</small></h4><div class="presets soon-presets">${pres.map((pre) => `<button type="button" class="preset mission-locked soon" data-soon="${esc(pre.name)}"><b>${esc(pre.name)}</b><small>🚀 ${cap!.label}</small></button>`).join('')}</div>`);
        body.querySelectorAll<HTMLElement>('[data-soon]').forEach((b) => b.addEventListener('click', () => this.hooks.onLock(spaceAgeLock(b.dataset.soon!, cap!.label, cap!.labelTh))));
      }
    }
    // phones: the ready-to-fly blueprints sit at the very top (the era lists are far down a long page)
    const quick = this.el.querySelector<HTMLElement>('.inv-quick')!;
    quick.innerHTML = '<h4 class="inv-sub">Blueprints<small>แบบสำเร็จรูป · ready to fly</small></h4>';
    const row = document.createElement('div'); row.className = 'presets';
    for (const pre of PRESETS.filter((p) => !cap || presetTier(p) <= cap.maxTier)) {
      const b = this.presetButton(pre, bench);
      delete b.dataset.preset; b.dataset.quickPreset = pre.id;   // the era list keeps data-preset (one per blueprint)
      row.appendChild(b);
    }
    quick.appendChild(row);
    const pay = this.el.querySelector('[data-list="zombies"]')!;
    pay.innerHTML = '';
    for (const id of ZOMBIE_IDS) pay.appendChild(this.zombieCard(id));
    // powder parts are locked by the Mixing bench in every mode, including Sandbox — say so, and go there on tap
    const need = new Set<GradeId>();
    for (const d of CATALOG) { const g = requiredGrade(d); if (g && !campaign.lockReason(d.id) && bench.crafted[g] === undefined) need.add(g); }
    const info = this.el.querySelector<HTMLButtonElement>('.inv-lockinfo')!;
    info.hidden = need.size === 0;
    info.innerHTML = need.size ? `<b>Still locked in every mode:</b><small>parts that burn powder — craft ${[...need].map((g) => GRADES[g].name.toLowerCase()).join(' / ')} at the Mixing bench ›</small>` : '';
    info.onclick = () => this.openChemistry();
    const strip = this.el.querySelector<HTMLElement>('.inv-campaign')!;
    const cur = campaign.current();
    strip.classList.toggle('sandbox', campaign.sandbox);
    strip.innerHTML = campaign.sandbox ? `<b>Sandbox · mission locks are off</b><small>${campaign.cap ? 'Tier 3–4 stay locked: Early Access cap.' : ''} Switch back in Missions ›</small>`
      : campaign.earlyAccessDone ? '<b>Early Access complete</b><small>Tier 0–2 unlocked · Space Age Update coming ›</small>'
      : campaign.complete ? '<b>Campaign complete</b><small>Every tier unlocked</small>'
      : `<b>Tier ${campaign.unlockedTier()} unlocked</b><small>Next: Mission ${cur!.label} · ${cur!.title} ›</small>`;
  }

  private presetButton(pre: (typeof PRESETS)[number], bench: BenchState): HTMLElement {
    const missing = pre.needs.filter((g) => bench.crafted[g] === undefined);
    const lockedBy = campaign.lockedIn(pre.build().map((p) => p.defId)).map((id) => campaign.unlockedBy(id)).filter((m) => !!m).sort((a, b2) => b2!.order - a!.order)[0];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `preset${lockedBy ? ' mission-locked' : ''}`;
    b.dataset.preset = pre.id;
    if (missing.length && !lockedBy) b.classList.add('grade-locked');
    b.innerHTML = `<b>${pre.name}</b><small>${lockedBy ? `🔒 Mission ${lockedBy.label} · ${lockedBy.title}` : missing.length ? `🔒 Craft ${missing.map((g) => GRADES[g].name.toLowerCase()).join(', ')} at the Mixing bench ›` : pre.nameTh}</small>`;
    b.addEventListener('click', () => lockedBy ? this.hooks.onLock(missionLock(pre.name, lockedBy.label, lockedBy.title)) : missing.length ? this.hooks.onLock(gradeLock(pre.name, missing[0])) : this.hooks.onPreset(pre.id));
    return b;
  }

  private showTip(card: HTMLElement, def: FactoryPartDef) {
    const m = LANNA_MANUAL[def.id]; if (!m) return;
    this.tipFor = def.id;
    this.tip.id = 'lanna-tip';
    this.tip.innerHTML = `<p class="lt-kicker">Lanna Instruction Manual · คู่มือช่างล้านนา</p>
      <b>${esc(m.title)}</b>
      <ol>${m.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
      <p class="lt-warn"><span aria-hidden="true">⚠</span> ${esc(m.warn)}</p>
      <p class="lt-th" lang="th">${esc(m.th)}</p>
      <p class="lt-spec">${esc(def.description)}</p>`;
    this.tip.hidden = false;
    this.tipCard = card; this.tipDef = def;
    this.place(card);
  }
  /** Beside the panel, level with the card (or under it on narrow screens) */
  private place(card: HTMLElement) {
    const r = card.getBoundingClientRect(), host = this.el.getBoundingClientRect();
    const tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
    const roomRight = window.innerWidth - host.right > tw + 12;
    const left = roomRight ? host.right + 8 : Math.max(8, Math.min(window.innerWidth - tw - 8, r.left));
    const top = roomRight ? Math.max(8, Math.min(window.innerHeight - th - 8, r.top - 6)) : Math.min(window.innerHeight - th - 8, r.bottom + 6);
    this.tip.style.left = `${left}px`; this.tip.style.top = `${top}px`;
  }
  private hideTip() { this.tip.hidden = true; this.tipFor = null; this.tipCard = null; this.tipDef = null; }

  /** Phones: the jump chips scroll the long page to a section (the bench also opens) */
  private jump(to: string) {
    if (to === 'bench') { this.openChemistry(); return; }
    const target = to === 'quick' ? this.el.querySelector<HTMLElement>('.inv-quick')
      : to === 'payload' ? this.el.querySelector<HTMLDetailsElement>('details[data-cat="zombies"]')
      : this.el.querySelector<HTMLDetailsElement>('details[data-era]');
    if (target instanceof HTMLDetailsElement) target.open = true;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  openChemistry() {
    this.chemistry.open = true;
    this.chemistry.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.chemistry.classList.remove('flash');
    void this.chemistry.offsetWidth;
    this.chemistry.classList.add('flash');
  }

  private zombieCard(id: ZombieId): HTMLElement {
    const z = ZOMBIES[id];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'part-card zombie-card';
    b.dataset.zombie = id;
    b.title = z.description;
    const c = document.createElement('canvas');
    drawZombieThumb(c, id, 44);
    b.appendChild(c);
    // The drawn zombie art replaces the vector thumb once it loads (fat / brittle are reshaped in CSS)
    const img = new Image();
    img.className = 'zombie-art'; img.alt = ''; img.dataset.zombie = id;
    img.onload = () => c.replaceWith(img);
    img.src = 'assets/zombie/zombie_standing.png';
    b.insertAdjacentHTML('beforeend', `<span class="pc-text"><b>${z.name}</b><small>${z.nameTh}</small><em>${fmtMass(z.mass)} · limbs go at ${z.limbG} g</em></span>`);
    b.addEventListener('click', () => this.hooks.onRider(id));
    return b;
  }

  private card(def: FactoryPartDef, bench: BenchState): HTMLElement {
    const grade = requiredGrade(def);
    const mission = campaign.lockReason(def.id);
    const soon = campaign.comingSoon(def.id);
    const locked = !mission && grade !== null && bench.crafted[grade] === undefined;
    const manual = LANNA_MANUAL[def.id];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `part-card${locked ? ' locked' : ''}${mission ? ' locked mission-locked' : ''}${soon ? ' soon' : ''}${manual ? ' has-manual' : ''}`;
    b.dataset.id = def.id;
    if (!manual) b.title = def.description;
    b.setAttribute('aria-label', `${def.name}${locked ? ` — locked, craft ${GRADES[grade!].name} first` : ''}`);
    const c = document.createElement('canvas');
    drawThumb(c, def, materialFor(def), 44);
    if (def.payload3d) { const off = modelSprites.onReady(() => { drawThumb(c, def, materialFor(def), 44); off(); }); }
    b.appendChild(c);
    const es = engineStats(def);
    const meta = soon ? `🚀 ${mission}` : mission ? `🔒 ${mission}`
      : locked
      ? `🔒 Mixing bench: craft ${GRADES[grade!].name.toLowerCase()} ›`
      : `${fmtMass(dryMass(def) + propellantMass(def))}${es && es.thrust > 0 ? ` · ${fmtForce(es.thrust)}` : ''}`;
    b.insertAdjacentHTML('beforeend', `<span class="pc-text"><b>${def.name}</b><small>${def.nameTh}</small><em>${meta}</em></span>`);
    if (manual && !soon) {
      // the Lanna Instruction Manual: on hover / keyboard focus, or the 📜 chip on touch
      const chip = document.createElement('span');
      chip.className = 'pc-manual'; chip.textContent = '📜'; chip.setAttribute('aria-hidden', 'true');
      // preventDefault keeps the tap from focusing the card (focus shows the tip; the click would then hide it again)
      chip.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
      chip.addEventListener('click', (e) => { e.stopPropagation(); this.tipFor === def.id ? this.hideTip() : this.showTip(b, def); });
      b.appendChild(chip);
      b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.showTip(b, def); });
      b.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.hideTip(); });
      b.addEventListener('focus', () => this.showTip(b, def));
      b.addEventListener('blur', () => this.hideTip());
      b.addEventListener('pointerdown', () => this.hideTip());
      b.setAttribute('aria-describedby', 'lanna-tip');
    }

    if (soon) {
      b.setAttribute('aria-label', `${def.name} — ${mission}`);
      b.addEventListener('click', () => this.hooks.onLock(lockForPart(def, campaign as never, bench.crafted)!));
    } else if (mission) {
      b.setAttribute('aria-label', `${def.name} — locked, complete ${mission}`);
      b.addEventListener('click', () => this.hooks.onLock(lockForPart(def, campaign as never, bench.crafted)!));
    } else if (locked) {
      b.addEventListener('click', () => this.hooks.onLock(gradeLock(def.name, grade!)));
    } else {
      b.addEventListener('pointerdown', (e) => { if (e.button === 0) { e.preventDefault(); this.hooks.onGrab(def.id, e); } });
      b.addEventListener('click', () => this.hooks.onTap(def.id));
    }
    return b;
  }
}
