/**
 * Story layer — the Wan Hu legend and the crew, told with the user's art.
 *
 *   playCutscene(id)   full-screen video with Skip (button / Esc / click); resolves when done
 *   openGallery()      the Story room: the three Wan Hu takes, the story stills, the crew
 *   initStory()        "Story" button in the top bar + a one-time prologue card
 *   nextWanHuTake()    rotates the three chair-explosion takes between flights
 *
 * Every asset is optional: a missing file just hides its tile. Settings and "seen"
 * flags live in localStorage behind try/catch (private mode → session only).
 */
import { CREW, type CrewId } from '@/phases/launch/capcom';
import { mountDisclaimer } from '@/ui/softLaunchUI';
import { campaign } from '@/campaign/missionManager';

import './story.css';
import { safeKV } from '@/core/safeStorage';

export interface Cutscene { id: string; title: string; titleTh: string; src: string; poster: string; caption: string }

export const CUTSCENES: Cutscene[] = [
  { id: 'wanhu1', title: 'Wan Hu’s Chair — take 1', titleTh: 'เก้าอี้ว่านฮู่ เทค 1', src: 'assets/story/wanhu_take1.mp4', poster: 'assets/story/wanhu_take1.jpg', caption: 'Hangar 4. Otter volunteered. Nobody remembers Otter volunteering.' },
  { id: 'wanhu2', title: 'Wan Hu’s Chair — take 2', titleTh: 'เก้าอี้ว่านฮู่ เทค 2', src: 'assets/story/wanhu_take2.mp4', poster: 'assets/story/wanhu_take2.jpg', caption: 'The pad, the rockets, the chair. Forty-seven fireworks and one very short countdown.' },
  { id: 'wanhu3', title: 'Wan Hu’s Chair — take 3', titleTh: 'เก้าอี้ว่านฮู่ เทค 3', src: 'assets/story/wanhu_take3.mp4', poster: 'assets/story/wanhu_take3.jpg', caption: 'For the documentary. Otter is filming. Otter is also the payload.' },
];

export const STILLS = [
  { src: 'assets/story/prologue_fireworks.jpg', title: 'The Festival Protocol', text: 'Every great space programme starts with a chair, a crate of fireworks and someone holding a match.' },
  { src: 'assets/story/aftermath_soot.jpg', title: 'Post-flight review', text: 'Findings: gunpowder works. Chairs do not fly. Further study required.' },
  { src: 'assets/story/bangfai_parade.jpg', title: 'Bang Fai procession', text: 'The Naga rocket rides to the launch tower — the rocket festival way.' },
  { src: 'assets/story/crew_lineup_hangar4.jpg', title: 'The crew, suited up', text: 'From a soot-covered courtyard to Hangar 4.' },
];

const store = {
  get(k: string) { try { return safeKV.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { safeKV.setItem(k, v); } catch { /* session only */ } },
};

export const cutscenesEnabled = () => store.get('rs.cutscenes') !== 'off';
export function setCutscenes(on: boolean) { store.set('rs.cutscenes', on ? 'on' : 'off'); }

/** The next chair-explosion take, rotating 1 → 2 → 3 */
export function nextWanHuTake(): Cutscene {
  const n = (+(store.get('rs.wanhu.next') ?? '0') || 0) % CUTSCENES.length;
  store.set('rs.wanhu.next', String(n + 1));
  return CUTSCENES[n];
}

let open: HTMLElement | null = null;

/** Full-screen cutscene. Starts muted only if the browser refuses sound. */
export function playCutscene(c: Cutscene): Promise<void> {
  return new Promise((resolve) => {
    close();
    const el = document.createElement('div');
    el.className = 'rs-cutscene';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', c.title);
    el.innerHTML = `
      <video playsinline preload="auto" poster="${c.poster}"><source src="${c.src.replace(/\.mp4$/, '.webm')}" type="video/webm"><source src="${c.src}" type="video/mp4"></video>
      <div class="cs-bar"><div><b></b><small></small></div><button type="button" class="cs-skip">Skip ▸</button></div>`;
    el.querySelector('b')!.textContent = c.title;
    el.querySelector('small')!.textContent = c.caption;
    document.body.appendChild(el);
    open = el;
    const v = el.querySelector('video')!;
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      window.removeEventListener('keydown', onKey, true);
      el.classList.add('out');
      setTimeout(() => { el.remove(); if (open === el) open = null; resolve(); }, 250);
    };
    const onKey = (e: KeyboardEvent) => { if (['Escape', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); finish(); } };
    window.addEventListener('keydown', onKey, true);
    el.addEventListener('click', finish);
    v.addEventListener('ended', finish);
    v.querySelector('source:last-of-type')!.addEventListener('error', finish);   // both formats failed
    v.play().catch(() => { v.muted = true; v.play().catch(finish); });
  });
}

function close() { open?.remove(); open = null; }

type LogLang = 'en' | 'th' | 'both';
const logLang = (): LogLang => {
  const v = store.get('rs.story.lang');
  if (v === 'en' || v === 'th' || v === 'both') return v;
  try { return navigator.language?.startsWith('th') ? 'th' : 'en'; } catch { return 'en'; }
};
const escH = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** The campaign log: prologue + one entry per completed mission, then what is still to come */
function campaignLog(lang: LogLang): string {
  const entries = campaign.story().map(({ entry: e, at, mission }) => {
    const c = CREW[e.crew];
    const title = lang === 'th' ? e.titleTh : e.title;
    const body = lang === 'en' ? `<p>${escH(e.text)}</p>` : lang === 'th' ? `<p lang="th">${escH(e.textTh)}</p>` : `<p>${escH(e.text)}</p><p lang="th" class="th">${escH(e.textTh)}</p>`;
    const when = at ? new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
    return `<article class="st-entry">
      <img class="st-who" src="${c.img}" alt="" style="background:${c.color}">
      <div><div class="st-eh"><b>${escH(title)}</b><small>${escH(lang === 'th' ? c.nameTh : c.name)} · ${escH(c.role)}${mission ? ` · ${lang === 'th' ? 'ภารกิจ' : 'Mission'} ${mission.label}` : ''}${when ? ` · ${when}` : ''}</small></div>${body}</div>
    </article>`;
  });
  const next = campaign.missions.filter((m) => !campaign.isDone(m.id)).map((m) =>
    `<article class="st-entry locked"><span class="st-who" aria-hidden="true">?</span><div><div class="st-eh"><b>${lang === 'th' ? 'ภารกิจ' : 'Mission'} ${m.label} · ${escH(lang === 'th' ? m.titleTh : m.title)}</b><small>${lang === 'th' ? `${escH(CREW[m.story.crew].nameTh)} จะเป็นผู้บันทึก` : `${escH(CREW[m.story.crew].name)} will write this one`}</small></div></div></article>`);
  return entries.join('') + next.join('');
}

/** The Story room. `focus: 'log'` scrolls straight to the campaign log. */
export function openGallery(focus?: 'log') {
  close();
  const el = document.createElement('div');
  el.className = 'rs-story';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Story');
  const crew = (Object.keys(CREW) as CrewId[]).map((id) => {
    const c = CREW[id];
    return `<figure class="st-crew"><img src="${c.img}" alt="" style="background:${c.color}"><figcaption><b>${c.name}</b><small>${c.role}</small></figcaption></figure>`;
  }).join('');
  el.innerHTML = `
    <div class="st-panel">
      <header><h2>Story <small>เรื่องราว</small></h2>
        <label class="st-toggle"><input type="checkbox" ${cutscenesEnabled() ? 'checked' : ''}> Play cutscenes after Wan Hu chair flights</label>
        <button type="button" class="st-close" aria-label="Close">✕</button></header>
      <section class="st-log" id="st-log"><div class="st-loghead"><h3>Campaign log <small>บันทึกภารกิจ</small></h3>
        <div class="st-lang" role="radiogroup" aria-label="Log language">${(['en', 'th', 'both'] as LogLang[]).map((l) => `<button type="button" role="radio" data-lang="${l}" aria-checked="${logLang() === l}">${l === 'en' ? 'EN' : l === 'th' ? 'ไทย' : 'EN + ไทย'}</button>`).join('')}</div></div>
        ${campaign.sandbox ? '<p class="st-note">Sandbox mode — flights are not written into the log. Switch to Campaign in Missions.</p>' : ''}
        <div class="st-entries">${campaignLog(logLang())}</div></section>
      <section><h3>The legend of Wan Hu</h3>
        <p class="st-lede">Legend says a Ming-dynasty official strapped 47 rockets to a chair to reach the heavens. Our crew tested the theory. Three times.</p>
        <div class="st-videos">${CUTSCENES.map((c, i) => `<button type="button" class="st-video" data-cs="${i}"><img src="${c.poster}" alt=""><span>▶</span><b>${c.title}</b></button>`).join('')}</div>
      </section>
      <section><h3>Scenes</h3><div class="st-stills">${STILLS.map((s) => `<figure><img src="${s.src}" alt="" loading="lazy"><figcaption><b>${s.title}</b><small>${s.text}</small></figcaption></figure>`).join('')}</div></section>
      <section><h3>Mission Control</h3><div class="st-crews">${crew}</div></section>
    </div>`;
  document.body.appendChild(el);
  open = el;
  for (const img of el.querySelectorAll('img')) img.addEventListener('error', () => (img.closest('figure, .st-video') as HTMLElement | null)?.setAttribute('hidden', ''));
  el.querySelector('.st-close')!.addEventListener('click', close);
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  el.querySelector<HTMLInputElement>('.st-toggle input')!.addEventListener('change', (e) => setCutscenes((e.target as HTMLInputElement).checked));
  for (const b of el.querySelectorAll<HTMLElement>('[data-lang]')) b.addEventListener('click', () => {
    store.set('rs.story.lang', b.dataset.lang!);
    for (const o of el.querySelectorAll<HTMLElement>('[data-lang]')) o.setAttribute('aria-checked', String(o === b));
    el.querySelector('.st-entries')!.innerHTML = campaignLog(b.dataset.lang as LogLang);
  });
  if (focus === 'log') requestAnimationFrame(() => el.querySelector('#st-log')?.scrollIntoView({ block: 'start' }));
  for (const b of el.querySelectorAll<HTMLElement>('[data-cs]')) b.addEventListener('click', () => { void playCutscene(CUTSCENES[+b.dataset.cs!]).then(() => openGallery()); });
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && open === el) { e.stopPropagation(); close(); window.removeEventListener('keydown', onKey, true); } };
  window.addEventListener('keydown', onKey, true);
}

/** First visit: a dismissible prologue card (never autoplays sound) */
function prologue() {
  if (store.get('rs.prologue.seen')) return;
  const el = document.createElement('div');
  el.className = 'rs-prologue';
  el.innerHTML = `
    <figure><img src="assets/story/prologue_fireworks.jpg" alt=""></figure>
    <div><h2>From Wan Hu’s Chair to Outer Space</h2>
      <p>Five hundred years ago, Wan Hu tied rockets to a chair. Today, Mission Control would like to try that again — with physics this time.</p>
      <div class="pr-actions"><button type="button" class="primary" data-pr="watch">▶ Watch the legend (10 s)</button><button type="button" class="ghost" data-pr="skip">Start building</button></div></div>`;
  mountDisclaimer(el.querySelector<HTMLElement>(':scope > div')!, 'briefing');
  document.body.appendChild(el);
  const done = () => { store.set('rs.prologue.seen', '1'); el.remove(); };
  el.querySelector('img')!.addEventListener('error', () => el.querySelector('figure')!.remove());
  el.querySelector('[data-pr="skip"]')!.addEventListener('click', done);
  el.querySelector('[data-pr="watch"]')!.addEventListener('click', () => { done(); void playCutscene(CUTSCENES[1]); });
}

export function initStory() {
  const nav = document.querySelector('.topbar .phases');
  if (nav && !nav.querySelector('[data-story]')) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.story = ''; b.textContent = 'Story';
    b.addEventListener('click', () => openGallery());
    nav.appendChild(b);
  }
  prologue();
}
