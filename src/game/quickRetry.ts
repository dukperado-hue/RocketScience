/**
 * quickRetry — "Retry Flight / บินอีกครั้ง".
 *
 * Idea: at the instant the player presses LAUNCH we snapshot the *assembly*
 * (the factory's serialized vehicle: parts, materials, attachments, fuel
 * fills) plus the launch context (mission, site, rail). The crash/summary
 * screen's Retry button restores that snapshot and goes straight to the pad,
 * skipping the Assembly Factory. Physics state is NOT reused — the vehicle is
 * rebuilt from the snapshot, so the retry is bit-identical to a fresh launch
 * of the same design (same seed rules as the original).
 *
 * The game only has to implement RetryHost (4 small adapters, see INTEGRATION.md).
 */

import { trackEvent } from '../core/analytics';

export interface LaunchContext {
  missionId: string | null;   // null = Sandbox
  siteId: string;             // e.g. 'samui-beach', 'yasothon', 'pad-rail-6m'
  useRail: boolean;
  windSeed?: number;          // keep identical wind for a fair retry; omit for fresh weather
}

export interface RetryHost<Design> {
  /** Serialize the current factory assembly (what Save Blueprint already does). */
  serializeAssembly(): Design;
  /** Load a serialized assembly into the factory model without opening the Factory UI. */
  loadAssembly(design: Design): void;
  /** Build physics bodies from the loaded assembly and place them on the pad. */
  startFlight(ctx: LaunchContext): void;
  /** Tear down crash FX, gibs, capybara overlay, summary screen, queued chatter. */
  cleanupAfterFlight(): void;
}

interface Snapshot<Design> { design: Design; ctx: LaunchContext; takenAt: number; attempt: number; }

function deepClone<T>(v: T): T {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(v); } catch { /* functions etc. → JSON path */ }
  }
  return JSON.parse(JSON.stringify(v)) as T;
}

export class QuickRetry<Design> {
  private snap: Snapshot<Design> | null = null;
  private busy = false;

  constructor(private host: RetryHost<Design>) {}

  /** Call immediately BEFORE startFlight in the normal LAUNCH handler. */
  captureAtLaunch(ctx: LaunchContext): void {
    const prevAttempt = this.snap && sameCtx(this.snap.ctx, ctx) ? this.snap.attempt : 0;
    this.snap = {
      design: deepClone(this.host.serializeAssembly()),
      ctx: { ...ctx },
      takenAt: Date.now(),
      attempt: prevAttempt + 1,
    };
  }

  get canRetry(): boolean { return this.snap !== null && !this.busy; }
  get attempt(): number { return this.snap?.attempt ?? 0; }

  /** Wire to the "Retry Flight / บินอีกครั้ง" button. */
  retry(): boolean {
    if (!this.snap || this.busy) return false;
    this.busy = true;
    try {
      const s = this.snap;
      this.host.cleanupAfterFlight();
      this.host.loadAssembly(deepClone(s.design)); // clone: the flight must not mutate the snapshot
      s.attempt += 1;
      trackEvent('flight_retry', { mission: s.ctx.missionId, attempt: s.attempt });
      this.host.startFlight({ ...s.ctx });
      return true;
    } catch (e) {
      console.error('[quickRetry] retry failed — falling back to Factory', e);
      return false;
    } finally {
      this.busy = false;
    }
  }

  /** Call when the player edits the vehicle in the Factory (new design = new attempt count). */
  invalidate(): void { this.snap = null; }
}

function sameCtx(a: LaunchContext, b: LaunchContext) {
  return a.missionId === b.missionId && a.siteId === b.siteId && a.useRail === b.useRail;
}
