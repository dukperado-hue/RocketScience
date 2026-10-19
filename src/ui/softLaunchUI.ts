/**
 * Soft-launch UI pieces: the Retry button for the crash/summary screen, the
 * bilingual safety disclaimer, and a tiny "saves are session-only" notice.
 * Plain DOM so they drop into the existing HUD/overlay layer.
 */

import type { QuickRetry } from '../game/quickRetry';

export const DISCLAIMER = {
  en: 'Disclaimer: Releasing sky lanterns near airports is illegal and highly dangerous in real life. This is a physics simulation. Do not try this at home.',
  th: 'คำเตือน: การปล่อยโคมลอยใกล้สนามบินในชีวิตจริงเป็นเรื่องผิดกฎหมายและอันตรายมาก เกมนี้เป็นเพียงการจำลองทางฟิสิกส์เท่านั้น',
} as const;

/** Bottom-of-title-screen disclaimer. Also call with variant 'briefing' inside the M1 briefing card. */
export function mountDisclaimer(parent: HTMLElement, variant: 'title' | 'briefing' = 'title'): HTMLElement {
  const el = document.createElement('aside');
  el.className = `rs-disclaimer rs-disclaimer--${variant}`;
  el.setAttribute('role', 'note');
  el.innerHTML = `
    <span class="rs-disclaimer__icon" aria-hidden="true">⚠</span>
    <span class="rs-disclaimer__text">
      <span lang="en">${DISCLAIMER.en}</span>
      <span lang="th">${DISCLAIMER.th}</span>
    </span>`;
  parent.appendChild(el);
  return el;
}

/** Adds "Retry Flight / บินอีกครั้ง" as the PRIMARY button on the crash/summary screen. */
export function mountRetryButton(
  buttonRow: HTMLElement,
  retry: QuickRetry<unknown>,
  onFallbackToFactory: () => void,
): HTMLButtonElement | null {
  if (!retry.canRetry) return null;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'primary rs-btn rs-btn--primary rs-retry';
  btn.innerHTML = '<span lang="th">บินอีกครั้ง</span><span lang="en">Retry Flight</span><kbd>R</kbd>';

  const go = () => {
    btn.disabled = true;
    window.removeEventListener('keydown', onKey);
    if (!retry.retry()) onFallbackToFactory();
  };
  const onKey = (e: KeyboardEvent) => {
    if ((e.key === 'r' || e.key === 'R') && !e.repeat && !(e.target instanceof HTMLInputElement)) go();
  };
  btn.addEventListener('click', go, { once: true });
  window.addEventListener('keydown', onKey);
  // Clean up the key handler if the summary screen is removed some other way
  new MutationObserver((_, obs) => {
    if (!btn.isConnected) { window.removeEventListener('keydown', onKey); obs.disconnect(); }
  }).observe(document.body, { childList: true, subtree: true });

  buttonRow.prepend(btn);           // first = primary, left-most / top-most
  btn.focus({ preventScroll: true });
  return btn;
}

/** Small notice when localStorage is unavailable (Safari Private Mode etc.). */
export function mountSessionOnlyNotice(parent: HTMLElement): HTMLElement {
  const el = document.createElement('div');
  el.className = 'rs-session-only';
  el.textContent = 'โหมดส่วนตัว: ความคืบหน้าจะไม่ถูกบันทึกหลังปิดหน้านี้ · Private mode: progress won\'t be saved after you close this page';
  parent.appendChild(el);
  return el;
}

export const SOFT_LAUNCH_CSS = `
.rs-disclaimer{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);
  width:min(760px,calc(100% - 32px));display:flex;gap:10px;align-items:flex-start;
  padding:10px 14px;border-radius:10px;background:#fff6d6;border:2px solid #e0a800;
  color:#3a2a00;font:500 13px/1.45 system-ui,sans-serif;box-shadow:0 2px 0 #c99700}
.rs-disclaimer--briefing{position:static;transform:none;width:auto;margin-top:12px}
.rs-disclaimer__icon{font-size:20px;line-height:1}
.rs-disclaimer__text{display:flex;flex-direction:column;gap:2px}
.rs-retry{display:inline-flex;flex-direction:column;align-items:center;gap:0;min-width:160px;min-height:52px}
.rs-retry [lang=th]{font-size:18px;font-weight:700}
.rs-retry [lang=en]{font-size:12px;opacity:.85}
.rs-retry kbd{display:none}
@media (hover:hover){.rs-retry kbd{display:inline;font-size:10px;opacity:.6}}
.rs-session-only{position:fixed;top:8px;right:8px;z-index:50;max-width:320px;padding:6px 10px;
  border-radius:8px;background:rgba(29,42,58,.9);color:#fff;font:12px/1.4 system-ui,sans-serif}
`;
