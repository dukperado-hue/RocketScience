/**
 * Missions tab — the Zombie Space Program campaign as a vertical timeline.
 *
 * Reads MissionManager only; writes nothing but the mode toggle and the (two-click) reset.
 * EVA/docking (the old stub plan for this tab) lives in the launch phase since v0.15.
 */
import type { Phase } from '@/core/PhaseManager';
import { bus } from '@/core/EventBus';
import { campaign } from '@/campaign/missionManager';
import { MISSIONS, type Mission } from '@/campaign/campaign';
import { CREW } from '@/phases/launch/capcom';
import { openGallery } from '@/story/story';
import './mission.css';

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const date = (at: number) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export class MissionPhase implements Phase {
  private root!: HTMLElement;
  private off: (() => void)[] = [];
  private resetArmed = 0;

  enter(root: HTMLElement) {
    this.root = root;
    this.render();
    this.off.push(bus.on('campaign:changed', () => this.render()));
    root.addEventListener('click', this.onClick);
  }

  exit() {
    this.off.forEach((f) => f()); this.off = [];
    this.root.removeEventListener('click', this.onClick);
    this.root.innerHTML = '';
  }

  private onClick = (e: Event) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!t) return;
    const act = t.dataset.act!;
    if (act === 'mode') campaign.setMode(t.dataset.mode as 'campaign' | 'sandbox');
    else if (act === 'build') bus.emit('phase:request', { phase: 'assembly' });
    else if (act === 'story') openGallery('log');
    else if (act === 'reset') {
      if (Date.now() < this.resetArmed) { this.resetArmed = 0; campaign.reset(); }
      else { this.resetArmed = Date.now() + 4000; t.textContent = 'Click again to wipe progress'; setTimeout(() => { if (this.root.isConnected) this.render(); }, 4000); }
    }
  };

  private render() {
    const MS = campaign.missions;
    const done = MS.filter((m) => campaign.isDone(m.id)).length;
    const sandbox = campaign.sandbox;
    this.root.innerHTML = `
      <div class="ms-page">
        <header class="ms-head">
          <div>
            <p class="ms-kicker">Zombie Space Program · โครงการอวกาศซอมบี้</p>
            <h2>Missions <small>ภารกิจ</small></h2>
            <p class="ms-sub">${sandbox ? 'Sandbox: every part and range unlocked; flights are not recorded. Your campaign progress is kept for when you switch back.'
              : campaign.earlyAccessDone ? 'Early Access complete: you touched the void. Tier 0–2 is yours; the Space Age Update brings orbit.'
              : campaign.complete ? 'Campaign complete. Every tier is unlocked.' : `${done} of ${MS.length} complete · Tier ${campaign.unlockedTier()} parts unlocked`}</p>
          </div>
          <div class="ms-tools">
            <div class="ms-seg" role="radiogroup" aria-label="Game mode">
              <button type="button" role="radio" data-act="mode" data-mode="campaign" aria-checked="${!sandbox}">Campaign</button>
              <button type="button" role="radio" data-act="mode" data-mode="sandbox" aria-checked="${sandbox}">Sandbox</button>
            </div>
            <button type="button" class="ms-link" data-act="story">Story log ›</button>
          </div>
        </header>
        <div class="ms-meter" aria-hidden="true"><i style="width:${(done / MS.length) * 100}%"></i></div>
        <ol class="ms-timeline ${sandbox ? 'is-sandbox' : ''}">${MS.map((m) => this.card(m)).join('')}${campaign.upcoming.map((m) => this.soonCard(m)).join('')}</ol>
        <footer class="ms-foot"><button type="button" class="ms-link danger" data-act="reset">Reset campaign progress</button></footer>
      </div>`;
  }

  /** A mission the Early Access build holds back */
  private soonCard(m: Mission): string {
    return `
      <li class="ms-item soon">
        <div class="ms-dot" aria-hidden="true">🚀</div>
        <article class="ms-card" aria-label="Mission ${m.label}: ${esc(m.title)} — coming soon">
          <header><p class="ms-code">Mission ${m.label} · ${m.codename}</p><span class="ms-pill soon">${esc(campaign.cap!.label)}</span></header>
          <h3>${esc(m.title)} <small>${esc(m.titleTh)}</small></h3>
          <p class="ms-brief">Orbit, a zombie satellite and the first spacewalk. Zombie Control is still drawing the rocket on a napkin.<small>${esc(campaign.cap!.labelTh)}</small></p>
        </article>
      </li>`;
  }

  private card(m: Mission): string {
    const st = campaign.status(m);
    const at = campaign.completedAt(m.id);
    const crew = CREW[m.story.crew];
    const obj = m.objectives.map((o) => `<li class="${st === 'done' ? 'ok' : ''}"><span aria-hidden="true">${st === 'done' ? '✓' : '○'}</span><div>${esc(o.text)}<small>${esc(o.textTh)}</small></div></li>`).join('');
    const prev = MISSIONS.find((x) => x.id === m.requires[0]);
    return `
      <li class="ms-item ${st}">
        <div class="ms-dot" aria-hidden="true">${st === 'done' ? '✓' : st === 'locked' ? '🔒' : m.label}</div>
        <article class="ms-card" aria-label="Mission ${m.label}: ${esc(m.title)} — ${st}">
          <header>
            <p class="ms-code">Mission ${m.label} · ${m.codename}</p>
            <span class="ms-pill ${st}">${st === 'done' ? `Complete · ${date(at!)}` : st === 'available' ? 'Available' : 'Locked'}</span>
          </header>
          <h3>${esc(m.title)} <small>${esc(m.titleTh)}</small></h3>
          ${st === 'locked'
            ? `<p class="ms-brief">Complete Mission ${prev!.label} · ${esc(prev!.title)} to open this one.</p>`
            : `<p class="ms-brief">${esc(m.brief)}<small>${esc(m.briefTh)}</small></p>
               <div class="ms-cols">
                 <section><h4>Objectives <small>· in one flight</small></h4><ul class="ms-obj">${obj}</ul></section>
                 <section><h4>Rewards</h4><p class="ms-reward">${campaign.cap?.finale === m.id ? 'The End of Early Access — and a message from Zombie Control. Tier 3 arrives with the Space Age Update.<small>จบช่วง Early Access พร้อมข้อความจากศูนย์ควบคุมซอมบี้</small>' : `${esc(m.rewards.text)}<small>${esc(m.rewards.textTh)}</small>`}</p></section>
               </div>
               ${st === 'available' && m.hint ? `<p class="ms-hint"><b>Hint</b> ${esc(m.hint)}<small>${esc(m.hintTh ?? '')}</small></p>` : ''}
               <div class="ms-actions">
                 ${st === 'available' ? `<button type="button" class="ms-btn" data-act="build">Build it in the Factory ›</button>` : ''}
                 ${st === 'done' ? `<button type="button" class="ms-btn ghost" data-act="story"><img src="${crew.img}" alt="">${esc(crew.name)}’s log entry ›</button>` : ''}
               </div>`}
        </article>
      </li>`;
  }
}
