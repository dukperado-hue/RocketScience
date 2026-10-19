/**
 * The game's one QuickRetry. The "assembly" is the payload the Factory hands to the launch phase
 * (active parts + telemetry + bench grades), so a retry re-enters the launch phase with a fresh
 * deep copy of it: the Factory UI is skipped and every piece of flight state is rebuilt.
 */
import { bus, type LaunchPayload } from '@/core/EventBus';
import { sfx } from '@/juice/proceduralAudio';
import { QuickRetry } from './quickRetry';

let loaded: LaunchPayload | null = null;
let captured: LaunchPayload | null = null;

export const quickRetry = new QuickRetry<LaunchPayload>({
  serializeAssembly: () => captured!,
  loadAssembly: (d) => { loaded = d; },
  startFlight: () => { bus.emit('phase:request', { phase: 'launch', payload: loaded }); },
  // the launch phase's exit() disposes the view, FX, ImpactDirector, Capcom and summary card
  cleanupAfterFlight: () => { sfx.quiet(); document.querySelector('.rs-milestone')?.remove(); },
});

/** LAUNCH pressed in the Factory: snapshot the design, then the caller goes to the pad. */
export function captureForRetry(payload: LaunchPayload, ctx: Parameters<QuickRetry<LaunchPayload>['captureAtLaunch']>[0]) {
  captured = payload;
  quickRetry.captureAtLaunch(ctx);
  captured = null;
}
