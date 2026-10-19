/**
 * The game's one QuickRetry. The "assembly" is the payload the Factory hands to the launch phase
 * (active parts + telemetry + bench grades), so a retry re-enters the launch phase with a fresh
 * deep copy of it: the Factory UI is skipped and every piece of flight state is rebuilt.
 */
import { bus, type LaunchPayload } from '@/core/EventBus';
import { sfx } from '@/juice/proceduralAudio';
import type { LaunchChoice } from './launchChoice';
import { QuickRetry } from './quickRetry';

let loaded: LaunchPayload | null = null;
let captured: LaunchPayload | null = null;
let lastChoice: LaunchChoice | null = null;
let snapshotKey: string | null = null;
const designKey = (p: LaunchPayload) => JSON.stringify(p.parts);

export const quickRetry = new QuickRetry<LaunchPayload>({
  serializeAssembly: () => captured!,
  loadAssembly: (d) => { loaded = { ...d, site: lastChoice ? { ...lastChoice } : undefined }; },
  startFlight: () => { bus.emit('phase:request', { phase: 'launch', payload: loaded }); },
  // the launch phase's exit() disposes the view, FX, ImpactDirector, Capcom and summary card
  cleanupAfterFlight: () => { sfx.quiet(); if (typeof document !== 'undefined') document.querySelector('.rs-milestone')?.remove(); },
});

/** LAUNCH pressed in the Factory: snapshot the design, then the caller goes to the pad. */
export function captureForRetry(payload: LaunchPayload, ctx: Parameters<QuickRetry<LaunchPayload>['captureAtLaunch']>[0]) {
  captured = payload;
  snapshotKey = designKey(payload);
  lastChoice = null;                 // a fresh LAUNCH from the Factory: default site until the player picks one
  quickRetry.captureAtLaunch(ctx);
  captured = null;
}

/** The launch screen's choices at ignition; the next retry restores them. */
export function rememberLaunchChoice(c: LaunchChoice) { lastChoice = { ...c }; }

/**
 * Called at ignition by the launch phase, so every way of reaching the pad (the Factory's Roll out
 * button, the top Launch tab, a retry) ends up with a snapshot of the design that actually flew.
 * Keeps the existing one when it is already this design (the attempt count carries on).
 */
export function ensureRetrySnapshot(payload: LaunchPayload, ctx: Parameters<QuickRetry<LaunchPayload>['captureAtLaunch']>[0]) {
  if (quickRetry.canRetry && snapshotKey === designKey(payload)) return;
  captureForRetry(payload, ctx);
}
