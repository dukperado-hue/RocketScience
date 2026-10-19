/**
 * audioUnlock — make WebAudio work on iOS Safari / Chrome autoplay policy.
 *
 * Browsers create AudioContext in the "suspended" state until a user gesture.
 * iOS additionally needs a (silent) buffer to be *started inside* the gesture
 * handler, and re-suspends the context ("interrupted") after a phone call,
 * Siri, or switching apps. This module handles all three.
 *
 * Call once at boot, before the title screen renders:
 *
 *   installAudioUnlock(() => ProceduralAudio.ctx);   // or proceduralAudio.getContext()
 *
 * The getter may return null if ProceduralAudio creates its context lazily —
 * in that case pass `create` so the very first tap builds it.
 */

type CtxGetter = () => AudioContext | null | undefined;

const GESTURES = ['pointerdown', 'touchend', 'mousedown', 'keydown'] as const;

export interface AudioUnlockHandle {
  readonly unlocked: boolean;
  dispose(): void;
}

export function installAudioUnlock(
  getCtx: CtxGetter,
  opts: { create?: () => AudioContext; onUnlocked?: () => void; target?: EventTarget } = {},
): AudioUnlockHandle {
  const target: EventTarget = opts.target ?? (typeof window !== 'undefined' ? window : ({} as EventTarget));
  let unlocked = false;

  const ctxNow = (): AudioContext | null => {
    let ctx = getCtx() ?? null;
    if (!ctx && opts.create) { try { ctx = opts.create(); } catch { ctx = null; } }
    return ctx;
  };

  /** Must run synchronously inside the gesture handler (iOS requirement). */
  const kick = () => {
    const ctx = ctxNow();
    if (!ctx) return;
    try {
      // iOS: start a 1-sample silent buffer inside the gesture
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    } catch { /* harmless */ }
    if (ctx.state !== 'running') {
      ctx.resume().then(() => {
        if (ctx.state === 'running' && !unlocked) {
          unlocked = true;
          opts.onUnlocked?.();
        }
      }).catch(() => { /* will retry on next gesture */ });
    } else if (!unlocked) {
      unlocked = true;
      opts.onUnlocked?.();
    }
  };

  // Keep listening (passive, capture) even after unlock: iOS can re-suspend
  // the context after interruptions, and the next tap should revive it.
  const onGesture = () => {
    const ctx = getCtx();
    if (unlocked && ctx && ctx.state === 'running') return; // cheap path
    kick();
  };
  for (const ev of GESTURES) target.addEventListener(ev, onGesture, { capture: true, passive: true } as AddEventListenerOptions);

  // Returning to the tab: try to resume (works on desktop; iOS waits for next tap)
  const onVisible = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      const ctx = getCtx();
      if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
    }
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);

  return {
    get unlocked() { return unlocked; },
    dispose() {
      for (const ev of GESTURES) target.removeEventListener(ev, onGesture, { capture: true } as EventListenerOptions);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    },
  };
}

/**
 * Optional "Tap to Start" overlay for the title screen. Guarantees the first
 * interaction is a real gesture that unlocks audio before any sound plays.
 * Resolves when tapped. Skip it if the title screen already requires a tap.
 */
export function showTapToStart(parent: HTMLElement = document.body): Promise<void> {
  return new Promise((resolve) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'rs-tap-to-start';
    el.setAttribute('aria-label', 'Tap to start');
    el.innerHTML = '<span class="en">Tap to start</span><span class="th">แตะเพื่อเริ่ม</span>';
    Object.assign(el.style, {
      position: 'fixed', inset: '0', zIndex: '9999', border: '0', cursor: 'pointer',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px',
      background: 'rgba(250,248,240,.88)', color: '#1d2a3a', font: '600 22px/1.3 system-ui, sans-serif',
    } as CSSStyleDeclaration);
    const done = () => { el.remove(); resolve(); };
    el.addEventListener('click', done, { once: true });
    parent.appendChild(el);
    el.focus();
  });
}
