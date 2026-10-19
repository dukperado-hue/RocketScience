/**
 * analytics — lightweight stub. Logs to the console and keeps an in-page
 * buffer (window.__rsEvents) so playtest sessions can be inspected. Wire a
 * real sink later via setAnalyticsSink(); call sites stay unchanged.
 */

export type AnalyticsEvent =
  | 'mission_complete'
  | 'mission_fail'
  | 'flight_retry'
  | 'session_start'
  | (string & {});

export interface TrackedEvent { name: AnalyticsEvent; data: Record<string, unknown>; t: number; }

type Sink = (e: TrackedEvent) => void;
let sink: Sink | null = null;
const buffer: TrackedEvent[] = [];
const MAX_BUFFER = 500;

export function setAnalyticsSink(fn: Sink | null) { sink = fn; }

export function trackEvent(eventName: AnalyticsEvent, data: Record<string, unknown> = {}): void {
  try {
    const e: TrackedEvent = { name: eventName, data, t: Date.now() };
    buffer.push(e);
    if (buffer.length > MAX_BUFFER) buffer.shift();
    console.log('[analytics]', eventName, data);
    sink?.(e);
  } catch { /* analytics must never break gameplay */ }
}

export function getTrackedEvents(): readonly TrackedEvent[] { return buffer; }

// Expose for playtest debugging: type __rsEvents in the console.
if (typeof window !== 'undefined') {
  (window as unknown as { __rsEvents: TrackedEvent[]; trackEvent: typeof trackEvent }).__rsEvents = buffer;
  (window as unknown as { trackEvent: typeof trackEvent }).trackEvent = trackEvent;
}

/** Early Access campaign missions whose completion we track. */
export const TRACKED_MISSIONS = new Set(['m1-lantern', 'm2-ballistics', 'm2b-karman']);

/**
 * Call from MissionManager's success path. Fires once per mission per session
 * (replays of an already-won mission are tagged `replay: true`).
 */
const firedThisSession = new Set<string>();
export function trackMissionComplete(missionId: string, extra: Record<string, unknown> = {}): void {
  if (!TRACKED_MISSIONS.has(missionId)) return;
  const replay = firedThisSession.has(missionId);
  firedThisSession.add(missionId);
  trackEvent('mission_complete', { mission: missionId, replay, ...extra });
}
