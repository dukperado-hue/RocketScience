/**
 * Phase 1 — the Assembly Factory.
 *
 *   ┌────────────┬─────────────────────────────┬──────────────┐
 *   │ Build-with │  Build area (pan / zoom)    │  Telemetry   │
 *   │ material   │  drag · snap · flip · mirror│  mass, cost, │
 *   │ Parts      │  CoM / CoT / stress view    │  TWR, Δv,    │
 *   │ Mixing     │                             │  integrity,  │
 *   │ Bench      │                             │  inspector   │
 *   └────────────┴─────────────────────────────┴──────────────┘
 */
import type { Phase } from '@/core/PhaseManager';
import { bus } from '@/core/EventBus';
import { GRADES, loadBench, recordCraft, saveBench, type BenchState } from '@/chemistry/mixingBench';
import { MATERIALS } from '@/data/materials';
import { VehicleStore } from './store';
import { analyse, autoAttach } from './model/vehicle';
import { PRESETS } from './model/presets';
import { campaign } from '@/campaign/missionManager';
import { CATALOG, PART, requiredGrade } from './model/catalog';
import { FactoryCanvas } from './ui/FactoryCanvas';
import { Inventory } from './ui/Inventory';
import { MixingBenchUI } from './ui/MixingBenchUI';
import { TelemetryPanel } from './ui/TelemetryPanel';
import { Inspector, type InspectorAction } from './ui/Inspector';
import { ZOMBIES, type ZombieId } from '@/payload/zombies';
import { captureForRetry, quickRetry } from '@/game/retrySession';
import { safeKV } from '@/core/safeStorage';
import { COACH_KEY, FIRSTRUN_KEY, shouldCoachM1 } from '@/game/firstRun';
import './factory.css';

export class FactoryPhase implements Phase {
  private root!: HTMLElement;
  private store = new VehicleStore();
  private bench: BenchState = loadBench();
  private canvas!: FactoryCanvas;
  private inventory!: Inventory;
  private benchUI!: MixingBenchUI;
  private panel!: TelemetryPanel;
  private inspector!: Inspector;
  private cleanup: (() => void)[] = [];
  private toastTimer = 0;

  enter(root: HTMLElement) {
    this.root = root;
    root.innerHTML = TEMPLATE;
    const q = <T extends HTMLElement>(s: string) => root.querySelector(s) as T;

    const invEl = q('.inventory');
    this.inventory = new Inventory(invEl, {
      bench: () => this.bench,
      onGrab: (id, e) => this.canvas.beginNewDrag(id, e),
      onTap: (id) => this.tapAdd(id),
      onLocked: (g) => { this.inventory.openChemistry(); this.toast(`Craft ${GRADES[g].name.toLowerCase()} at the Mixing Bench to unlock this part.`); },
      onPreset: (id) => this.loadPreset(id),
      onMissionLocked: (why) => this.toast(`${why} Open Missions to see how — or switch to Sandbox.`),
      onRider: (id) => this.seatZombie(id),
    });
    this.benchUI = new MixingBenchUI(this.inventory.benchMount, () => this.bench, (g, quality) => {
      this.bench = recordCraft(this.bench, g, quality);
      saveBench(this.bench);
      bus.emit('bench:crafted', { grade: g, quality });
      this.inventory.render();
      this.toast(`Unlocked: ${CATALOG.filter((p) => requiredGrade(p) === g).map((p) => p.name).join(', ')}`);
    });
    this.canvas = new FactoryCanvas(q('.build-canvas'), this.store, invEl);
    this.panel = new TelemetryPanel(q('.telemetry'), this.store, () => this.launch());
    this.inspector = new Inspector(q('.build'), this.store, (a) => this.inspectorAction(a));

    const act = (name: string, fn: () => void) => q(`[data-tool="${name}"]`).addEventListener('click', fn);
    act('undo', () => this.store.undo());
    act('redo', () => this.store.redo());
    act('mirror', () => this.toggleMirror());
    act('fit', () => this.canvas.frame());
    act('zoom-in', () => this.canvas.zoomBy(1.25));
    act('zoom-out', () => this.canvas.zoomBy(0.8));
    act('clear', () => { if (this.store.parts.length) { this.store.replaceAll([]); this.toast('Cleared. Undo brings it back.'); } });
    const sync = () => {
      q<HTMLButtonElement>('[data-tool="undo"]').disabled = !this.store.canUndo;
      q<HTMLButtonElement>('[data-tool="redo"]').disabled = !this.store.canRedo;
    };
    this.cleanup.push(this.store.on(sync));
    // any edit makes the pad snapshot stale (selection also notifies the store, so compare the parts)
    let lastParts = this.store.parts;
    this.cleanup.push(this.store.on(() => { if (this.store.parts !== lastParts) { lastParts = this.store.parts; quickRetry.invalidate(); } }));
    this.cleanup.push(bus.on('campaign:changed', () => this.inventory.render()));
    sync();
    // first run: Khom loi is loaded and "Roll out" is pointed at (see game/firstRun.ts)
    this.cleanup.push(bus.on('firstrun:start', () => this.firstRun()));
    if (safeKV.getItem(FIRSTRUN_KEY) === '1') this.firstRun();

    const onKey = (e: KeyboardEvent) => this.onKey(e);
    window.addEventListener('keydown', onKey);
    this.cleanup.push(() => window.removeEventListener('keydown', onKey));
  }

  exit() {
    this.cleanup.forEach((f) => f());
    this.canvas.dispose();
    this.benchUI.dispose();
    this.panel.dispose();
    this.inspector.dispose();
    clearTimeout(this.toastTimer);
    this.root.innerHTML = '';
  }

  /* ---------- First-run coach ---------- */

  private firstRun() {
    safeKV.removeItem(FIRSTRUN_KEY);
    if (!shouldCoachM1({ sandbox: campaign.sandbox, currentMissionId: campaign.current()?.id ?? null, partCount: this.store.parts.length, coached: safeKV.getItem(COACH_KEY) === '1' })) return;
    this.loadPreset('khom-loi');
    const card = document.createElement('aside');
    card.className = 'coach';
    card.setAttribute('role', 'note');
    card.innerHTML = `<button type="button" class="coach-x" aria-label="Close">✕</button>
      <b>ภารกิจที่ 1 · Mission 1</b>
      <p lang="th">ปล่อยโคมลอยจากเกาะพะงัน (ในเกมเท่านั้น) เราโหลดแบบ “Khom loi” ให้แล้ว</p>
      <p lang="en">Launch a sky lantern from Koh Phangan. The Khom loi blueprint is already loaded.</p>
      <p class="coach-go"><span lang="th">กด “Roll out to the pad” ได้เลย</span> <span lang="en">Press “Roll out to the pad”.</span></p>`;
    card.querySelector('.coach-x')!.addEventListener('click', () => this.endCoach());
    this.root.querySelector('.build')!.appendChild(card);
    this.root.querySelector('.launch')?.classList.add('coach-pulse');
  }

  private endCoach() {
    safeKV.setItem(COACH_KEY, '1');
    this.root.querySelector('.coach')?.remove();
    this.root.querySelector('.launch')?.classList.remove('coach-pulse');
  }

  /* ---------- Actions ---------- */

  private tapAdd(defId: string) {
    const spot = autoAttach(this.store.parts, defId);
    if (!spot) { this.toast(`No free attachment point fits the ${PART[defId].name.toLowerCase()}. Drag it to place it yourself.`); return; }
    const [p] = this.store.add(spot);
    this.store.select(p.uid);
    if (this.store.parts.length <= 2) this.canvas.frame();
  }

  private inspectorAction(a: InspectorAction) {
    if (a === 'stress') { this.toggleStress(); return; }
    if (a === 'close') { this.store.select(null); return; }
    const s = this.store.selected;
    if (s === null) return;
    if (a === 'rotate') this.store.rotate(s);
    else if (a === 'flip-x') this.store.flip(s, 'x');
    else if (a === 'flip-y') this.store.flip(s, 'y');
    else if (a === 'delete') this.store.remove(s);
    else if ('rider' in a) this.store.setRider(s, a.rider);
    else if ('salt' in a) this.store.setSalt(s, a.salt);
    else if ('mat' in a) this.store.setMaterial(s, a.mat);
    else if ('matAll' in a) {
      const p = this.store.get(s)!;
      this.store.setMaterialForType(p.defId, a.matAll);
      this.toast(`All ${PART[p.defId].name.toLowerCase()} parts are now ${MATERIALS[a.matAll].name.toLowerCase()}.`);
    }
  }

  private seatZombie(id: ZombieId) {
    const sel = this.store.selected !== null ? this.store.get(this.store.selected) : undefined;
    const seat = sel && PART[sel.defId].crew ? sel : this.store.parts.find((p) => PART[p.defId].crew);
    if (!seat) { this.toast('No seat yet — add the wooden chair or a command pod first.'); return; }
    this.store.setRider(seat.uid, id);
    this.store.select(seat.uid);
    this.toast(`${ZOMBIES[id].name} strapped in. ${ZOMBIES[id].description}`);
  }

  private loadPreset(id: string) {
    const pre = PRESETS.find((p) => p.id === id);
    if (!pre) return;
    this.store.replaceAll(pre.build());
    this.canvas.frame();
    this.toast(`Loaded ${pre.name}. Undo to go back.`);
  }

  private rotate() {
    if (this.canvas.rotateHeld()) return;
    if (this.store.selected !== null) this.store.rotate(this.store.selected);
  }

  private flip(axis: 'x' | 'y') {
    if (this.canvas.flipHeld(axis)) return;
    if (this.store.selected !== null) this.store.flip(this.store.selected, axis);
  }

  private toggleMirror() {
    this.canvas.mirror = !this.canvas.mirror;
    this.root.querySelector('[data-tool="mirror"]')!.setAttribute('aria-pressed', String(this.canvas.mirror));
    this.toast(this.canvas.mirror ? 'Mirror on: new parts get a mirror-image twin on the other side.' : 'Mirror off.');
  }

  private toggleStress() {
    this.canvas.stress = !this.canvas.stress;
    this.inspector.stressOn = this.canvas.stress;
    this.inspector.render();
    this.canvas.invalidate();
    this.toast(this.canvas.stress ? 'Stress map on: green is safe, amber is marginal, red will fail.' : 'Stress map off.');
  }

  private launch() {
    const st = analyse(this.store.parts);
    const locked = campaign.lockedIn(st.active.map((p) => p.defId));
    if (locked.length) {
      const soon = locked.filter((id) => campaign.comingSoon(id));
      if (soon.length) {
        this.toast(`${soon.map((id) => PART[id].name).join(', ')}: ${campaign.cap!.label}. This Early Access build flies Tier 0–2 — remove ${soon.length > 1 ? 'them' : 'it'} to launch.`);
        return;
      }
      const m = campaign.unlockedBy(locked[0])!;
      this.toast(`Campaign: ${locked.map((id) => PART[id].name).join(', ')} ${locked.length > 1 ? 'are' : 'is'} locked until Mission ${m.label} · ${m.title}. Remove ${locked.length > 1 ? 'them' : 'it'}, or switch to Sandbox in Missions.`);
      return;
    }
    this.endCoach();
    const payload = { parts: st.active, telemetry: this.store.telemetry, bench: this.bench };
    // lanterns start on bare ground, everything else on a rail/ramp (LaunchPhase.defaultSite picks the exact site)
    const lantern = st.active.some((p) => PART[p.defId].envelope);
    captureForRetry(payload, { missionId: campaign.sandbox ? null : campaign.current()?.id ?? null, siteId: 'default', useRail: !lantern });
    bus.emit('phase:request', { phase: 'launch', payload });
  }

  private onKey(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) this.store.redo(); else this.store.undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); this.store.redo(); return; }
    if (mod) return;
    switch (e.key.toLowerCase()) {
      case 'r': this.rotate(); break;
      case 'h': this.flip('x'); break;
      case 'v': this.flip('y'); break;
      case 'm': this.toggleMirror(); break;
      case 's': this.toggleStress(); break;
      case 'f': this.canvas.frame(); break;
      case 'delete': case 'backspace':
        if (this.store.selected !== null) { e.preventDefault(); this.store.remove(this.store.selected); }
        break;
      case 'escape':
        if (this.canvas.dragging) this.canvas.cancelDrag(); else this.store.select(null);
        break;
      case '+': case '=': this.canvas.zoomBy(1.25); break;
      case '-': this.canvas.zoomBy(0.8); break;
    }
  }

  private toast(msg: string) {
    const t = this.root.querySelector('.toast') as HTMLElement;
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove('on'), 3200);
  }
}

const TEMPLATE = /* html */ `
<div class="factory2">
  <aside class="inventory" aria-label="Parts inventory"></aside>
  <main class="build">
    <div class="build-canvas"></div>
    <div class="toolbar" role="toolbar" aria-label="Build tools">
      <button type="button" data-tool="undo" title="Undo (Ctrl+Z)">Undo</button>
      <button type="button" data-tool="redo" title="Redo (Ctrl+Shift+Z)">Redo</button>
      <span class="sep"></span>
      <button type="button" data-tool="mirror" aria-pressed="false" title="Mirror new parts across the vehicle (M)">Mirror</button>
      <span class="sep"></span>
      <button type="button" data-tool="zoom-out" aria-label="Zoom out" title="Zoom out (−)">−</button>
      <button type="button" data-tool="fit" title="Fit the vehicle in view (F)">Fit</button>
      <button type="button" data-tool="zoom-in" aria-label="Zoom in" title="Zoom in (+)">+</button>
      <span class="sep"></span>
      <button type="button" data-tool="clear" title="Remove everything (undoable)">Clear</button>
    </div>
    <p class="build-hint">Click a part to inspect it · R rotate · H/V flip · M mirror</p>
    <div class="toast" role="status" aria-live="polite"></div>
  </main>
  <aside class="telemetry" aria-label="Vehicle telemetry"></aside>
</div>`;
