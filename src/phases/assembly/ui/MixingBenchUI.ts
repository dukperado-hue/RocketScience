/**
 * Mixing Bench UI — lives inside the inventory's Chemistry section.
 *   1. put up to three ingredient classes in the bowl
 *   2. the bench says what they make (or why they won't burn)
 *   3. stir 12 times on the beat → batch quality → the motor part unlocks
 */
import {
  INGREDIENTS, GRADES, combine, stirQuality, STIR_BEAT_MS, STIR_STROKES,
  type IngredientId, type BenchState, type GradeId,
} from '@/chemistry/mixingBench';
import { CATALOG, requiredGrade } from '../model/catalog';
import { IMPULSE_LOSS_MAX } from '@/physics/flight2d';

const ORDER: IngredientId[] = ['oxidiser', 'fuel', 'moderator', 'binder', 'filler'];

export class MixingBenchUI {
  private bowl: IngredientId[] = [];
  private taps: number[] = [];
  private beatTimer = 0;
  private stirring: GradeId | null = null;
  private keyHandler = (e: KeyboardEvent) => {
    if (this.stirring && e.code === 'Space' && !e.repeat) { e.preventDefault(); this.stir(); }
  };

  constructor(private el: HTMLElement, private state: () => BenchState, private onCrafted: (g: GradeId, quality: number) => void) {
    el.innerHTML = `
      <p class="bench-lede">Every solid propellant needs something to burn and something to supply oxygen. Put up to three ingredients in the bowl. <span lang="th">ใส่ส่วนผสมได้สูงสุดสามอย่าง</span></p>
      <details class="bench-help"><summary>What do these do? · ส่วนผสมแต่ละอย่างทำอะไร</summary>
        <ul>${ORDER.map((id) => `<li><b>${INGREDIENTS[id].glyph} · ${INGREDIENTS[id].name}</b> <span>${INGREDIENTS[id].role}</span></li>`).join('')}</ul>
        <p class="bench-recipes"><b>Recipes (classes, not chemicals):</b> Ox + Fu = fast powder · Ox + Fu + Mo = slow powder (Bang Fai) · Ox + Fu + Bi = cast grain. Then <b>stir on the beat</b>: the steadier you stir, the more of the powder burns — the quality you get is used in every flight.</p>
      </details>
      <div class="ingredients">
        ${ORDER.map((id) => { const i = INGREDIENTS[id]; return `
          <button type="button" class="ingredient" data-ing="${id}" aria-pressed="false" title="${i.role}">
            <span class="ing-glyph">${i.glyph}</span><span class="ing-name">${i.name}</span><span class="ing-th">${i.nameTh}</span>
          </button>`; }).join('')}
      </div>
      <div class="bowl" aria-label="Mixing bowl"><span class="bowl-slots"></span><button type="button" class="link" data-act="empty">Empty</button></div>
      <p class="mix-result" aria-live="polite"></p>
      <div class="grade-card" hidden>
        <div class="gc-head"><b class="gc-name"></b><small class="gc-th"></small></div>
        <dl class="gc-stats"></dl>
        <p class="gc-lesson"></p>
        <button type="button" class="btn fire" data-act="start">Stir the batch</button>
      </div>
      <div class="stir" hidden>
        <div class="beat" aria-hidden="true"></div>
        <p>Stir on the beat — steady strokes make consistent motors. Tap the button or press Space.</p>
        <div class="stir-dots" aria-label="Strokes"></div>
        <button type="button" class="btn fire" data-act="stir">Stir</button>
      </div>
      <ul class="crafted"></ul>`;

    el.querySelectorAll<HTMLButtonElement>('.ingredient').forEach((b) => b.addEventListener('click', () => this.toggle(b.dataset.ing as IngredientId)));
    el.querySelector('[data-act="empty"]')!.addEventListener('click', () => { this.bowl = []; this.update(); });
    el.querySelector('[data-act="start"]')!.addEventListener('click', () => this.startStir());
    el.querySelector('[data-act="stir"]')!.addEventListener('click', () => this.stir());
    window.addEventListener('keydown', this.keyHandler);
    this.update();
    this.renderCrafted();
  }

  dispose() { window.removeEventListener('keydown', this.keyHandler); clearInterval(this.beatTimer); }

  private toggle(id: IngredientId) {
    if (this.stirring) return;
    if (this.bowl.includes(id)) this.bowl = this.bowl.filter((x) => x !== id);
    else if (this.bowl.length < 3) this.bowl.push(id);
    this.update();
  }

  private update() {
    this.el.querySelectorAll<HTMLButtonElement>('.ingredient').forEach((b) => b.setAttribute('aria-pressed', String(this.bowl.includes(b.dataset.ing as IngredientId))));
    const slots = this.el.querySelector('.bowl-slots')!;
    slots.innerHTML = [0, 1, 2].map((i) => {
      const id = this.bowl[i];
      return id ? `<span class="chip">${INGREDIENTS[id].name}</span>` : '<span class="chip empty">+</span>';
    }).join('');
    const res = combine(this.bowl);
    const out = this.el.querySelector('.mix-result')!;
    const card = this.el.querySelector('.grade-card') as HTMLElement;
    if (this.bowl.length === 0) { out.textContent = ''; card.hidden = true; return; }
    if (!res.ok) { out.textContent = res.reason; out.className = 'mix-result bad'; card.hidden = true; return; }
    const g = res.grade;
    out.textContent = `That makes ${g.name.toLowerCase()}.`;
    out.className = 'mix-result good';
    card.hidden = false;
    card.querySelector('.gc-name')!.textContent = g.name;
    card.querySelector('.gc-th')!.textContent = g.nameTh;
    const unlocks = CATALOG.filter((p) => requiredGrade(p) === g.id).map((p) => p.name).join(', ');
    card.querySelector('.gc-stats')!.innerHTML = `
      <div><dt>Isp</dt><dd>${g.ispSL} s</dd></div>
      <div><dt>Burn</dt><dd>${g.id === 'slow-powder' ? 'very long' : g.id === 'cast-grain' ? 'medium' : 'short'}</dd></div>
      <div><dt>Smoke</dt><dd><span class="smoke-dots">${dots(g.smokeDensity)}</span></dd></div>
      <div class="wide"><dt>Unlocks</dt><dd>${unlocks}</dd></div>`;
    card.querySelector('.gc-lesson')!.textContent = g.lesson;
    this.pendingGrade = g.id;
  }

  private pendingGrade: GradeId | null = null;

  private startStir() {
    if (!this.pendingGrade) return;
    this.stirring = this.pendingGrade;
    this.taps = [];
    (this.el.querySelector('.grade-card') as HTMLElement).hidden = true;
    const stir = this.el.querySelector('.stir') as HTMLElement;
    stir.hidden = false;
    this.renderDots();
    const beat = stir.querySelector('.beat') as HTMLElement;
    clearInterval(this.beatTimer);
    this.beatTimer = window.setInterval(() => { beat.classList.remove('on'); void beat.offsetWidth; beat.classList.add('on'); }, STIR_BEAT_MS);
    (stir.querySelector('[data-act="stir"]') as HTMLButtonElement).focus();
  }

  private stir() {
    if (!this.stirring) return;
    this.taps.push(performance.now());
    this.renderDots();
    if (this.taps.length >= STIR_STROKES) {
      const grade = this.stirring;
      const q = stirQuality(this.taps);
      this.stirring = null;
      clearInterval(this.beatTimer);
      (this.el.querySelector('.stir') as HTMLElement).hidden = true;
      this.bowl = [];
      this.update();
      const out = this.el.querySelector('.mix-result')!;
      out.className = 'mix-result good';
      const loss = Math.round((1 - q) * IMPULSE_LOSS_MAX * 100);
      out.textContent = `Batch of ${GRADES[grade].name.toLowerCase()} done — quality ${Math.round(q * 100)}%. ${q > 0.8 ? 'Very even.' : q > 0.5 ? 'Some lumps.' : 'Uneven.'} ${loss > 0 ? `Motors filled with it give about ${loss}% less impulse than a perfect batch — stir again to beat it.` : 'A perfect batch.'}`;
      this.onCrafted(grade, q);
      this.renderCrafted();
    }
  }

  private renderDots() {
    this.el.querySelector('.stir-dots')!.innerHTML = Array.from({ length: STIR_STROKES }, (_, i) => `<i class="${i < this.taps.length ? 'done' : ''}"></i>`).join('');
  }

  renderCrafted() {
    const s = this.state();
    const entries = Object.entries(s.crafted) as [GradeId, number][];
    this.el.querySelector('.crafted')!.innerHTML = entries.length
      ? entries.map(([g, q]) => `<li><b>${GRADES[g].name}</b><span>quality ${Math.round(q * 100)}% · −${Math.round((1 - q) * IMPULSE_LOSS_MAX * 100)}% impulse</span></li>`).join('')
      : '<li class="none">No propellant crafted yet.</li>';
  }
}

const dots = (v: number) => '●'.repeat(Math.round(v * 5)) + '○'.repeat(5 - Math.round(v * 5));
