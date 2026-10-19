/**
 * Early Access shell + the "End of Early Access" screen (v0.22).
 *
 *   applyEarlyAccessShell()   hides the Orbit tab, adds the Early Access badge to the top bar
 *   showEarlyAccessEnd()      full-screen card after the Mission 2.5 flight: Zombie Control's
 *                             gibberish types out, then its translation; three ways out
 */
import { EARLY_ACCESS } from '@/core/earlyAccess';
import { CREW, portrait, zombify } from '@/phases/launch/capcom';
import { sfx } from '@/juice/proceduralAudio';
import './earlyAccess.css';

export function applyEarlyAccessShell(doc: Document = document) {
  if (!EARLY_ACCESS.on) return;
  doc.querySelector('[data-goto="orbit"]')?.remove();
  const brand = doc.querySelector('.brand div');
  if (brand && !brand.querySelector('.ea-badge')) {
    const b = doc.createElement('span');
    b.className = 'ea-badge'; b.textContent = 'Early Access · Tier 0–2';
    b.title = 'Demo build: lanterns to suborbital rockets. Orbit arrives with the Space Age Update.';
    brand.querySelector('h1')?.appendChild(b);
  }
}

export type EarlyAccessExit = 'sandbox' | 'factory' | 'story';

const LINE = 'We have touched the void. Now we build bigger rockets. See you in the next update.';
const LINE_TH = 'เราได้แตะความว่างเปล่าแล้ว ต่อไปเราจะสร้างจรวดที่ใหญ่กว่านี้ แล้วพบกันในอัปเดตหน้า';

/** Resolves with the player's choice. Esc / the backdrop = 'factory'. */
export function showEarlyAccessEnd(stats: { apogeeKm: number; flights?: number } = { apogeeKm: 100 }): Promise<EarlyAccessExit> {
  return new Promise((resolve) => {
    const z = CREW.zombie;
    const wrap = document.createElement('div');
    wrap.className = 'rs-ea-end';
    wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-labelledby', 'ea-title');
    const gib = zombify(LINE);
    wrap.innerHTML = `
      <div class="ea-stars" aria-hidden="true"></div>
      <article class="ea-card">
        <p class="ea-kicker">Mission 2.5 · Space Passport · ${stats.apogeeKm.toFixed(0)} km</p>
        <h2 id="ea-title">End of Early Access</h2>
        <p class="ea-sub">You crossed the Kármán line. On bamboo-era paperwork. <span lang="th">จบช่วงทดลองเล่น</span></p>
        <div class="ea-msg">
          <img src="${portrait('zombie', 'happy')}" alt="" style="background:${z.color}">
          <div>
            <p class="ea-who">${z.name} <small>${z.role} · transmission</small></p>
            <p class="ea-gib" aria-hidden="true"></p>
            <p class="ea-tr" hidden>[Translation: ${LINE}]</p>
            <p class="ea-th" lang="th" hidden>[คำแปล: ${LINE_TH}]</p>
          </div>
        </div>
        <ul class="ea-done">
          <li>✓ Tier 0 · Lanna Workshop — a lantern into Samui airspace</li>
          <li>✓ Tier 1 · Bang Fai to 5 km over Yasothon</li>
          <li>✓ Tier 2 · liquid fuel, past 100 km</li>
          <li class="soon">🚀 Orbit, ZomSat-1 and the first zombie spacewalk — ${EARLY_ACCESS.label}</li>
        </ul>
        <div class="ea-actions">
          <button type="button" class="ea-btn primary" data-x="sandbox">Keep flying in Sandbox</button>
          <button type="button" class="ea-btn" data-x="factory">Back to the Factory</button>
          <button type="button" class="ea-btn ghost" data-x="story">Read the Story log</button>
        </div>
      </article>`;
    document.body.appendChild(wrap);
    const gibEl = wrap.querySelector<HTMLElement>('.ea-gib')!;
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let i = 0;
    const reveal = () => { gibEl.textContent = gib; wrap.querySelectorAll<HTMLElement>('.ea-tr, .ea-th').forEach((e) => (e.hidden = false)); };
    const typer = reduce ? (reveal(), 0) : window.setInterval(() => {
      gibEl.textContent = gib.slice(0, (i += 2));
      if (i >= gib.length) { clearInterval(typer); setTimeout(reveal, 450); }
    }, 28);
    try { sfx.pop(0.7, -0.4); setTimeout(() => sfx.pop(0.8, 0.4), 260); } catch { /* audio is optional */ }
    const done = (x: EarlyAccessExit) => {
      clearInterval(typer); window.removeEventListener('keydown', onKey, true);
      wrap.classList.add('out'); setTimeout(() => wrap.remove(), 250); resolve(x);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); done('factory'); } };
    window.addEventListener('keydown', onKey, true);
    wrap.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-x]');
      if (b) done(b.dataset.x as EarlyAccessExit);
      else if (!(e.target as HTMLElement).closest('.ea-card')) reveal();
    });
    wrap.querySelector<HTMLButtonElement>('.ea-btn.primary')!.focus();
  });
}
