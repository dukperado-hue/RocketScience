import { describe, it, expect, vi } from 'vitest';
import { bus, type LaunchPayload } from '@/core/EventBus';
import { SITES } from '@/physics/flight2d';
import { captureForRetry, ensureRetrySnapshot, quickRetry, rememberLaunchChoice } from './retrySession';
import { siteFromChoice, type LaunchChoice } from './launchChoice';

const payload = (): LaunchPayload => ({ parts: [{ uid: 1, defId: 'bang-fai', x: 0, y: 0, rot: 0 }], telemetry: {} as LaunchPayload['telemetry'], bench: { crafted: {} } });
const ctx = { missionId: 'm2-ballistics', siteId: 'default', useRail: true };

function retryAndCatch(): LaunchPayload {
  let got: LaunchPayload | undefined;
  const off = bus.on('phase:request', (e) => { got = e.payload as LaunchPayload; });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  expect(quickRetry.retry()).toBe(true);
  off();
  return got!;
}

describe('quick retry remembers the launch site', () => {
  it('a retry gets the same site, ramp length and tilt, wind and lantern choices', () => {
    captureForRetry(payload(), ctx);
    const picked: LaunchChoice = { siteId: 'ramp', rail: 17, railAngleDeg: 11, wind: 6, atYasothon: true, lanternSiteId: 'x', windFrom: 200, permitted: true };
    rememberLaunchChoice(picked);
    const p = retryAndCatch();
    expect(p.site).toEqual(picked);
    expect(p.parts).toEqual(payload().parts);
    // and the launch phase turns it back into the ramp the player built, not SITES.ramp's 22 m
    const s = siteFromChoice(p.site!);
    expect(s.id).toBe('ramp');
    expect(s.site).toEqual({ rail: 17, railAngleDeg: 11, wind: 6 });
    expect(s.site.rail).not.toBe(SITES.ramp.rail);
  });

  it('a second retry keeps it too, and a fresh Factory launch forgets it', () => {
    captureForRetry(payload(), ctx);
    rememberLaunchChoice({ siteId: 'ground', rail: 0, railAngleDeg: 0, wind: 3, atYasothon: false, lanternSiteId: 'a', windFrom: 15, permitted: false });
    expect(retryAndCatch().site?.siteId).toBe('ground');
    expect(retryAndCatch().site?.siteId).toBe('ground');
    captureForRetry(payload(), ctx);
    expect(retryAndCatch().site).toBeUndefined();
  });
});

describe('quick retry covers every route to the pad', () => {
  const other = (): LaunchPayload => ({ ...payload(), parts: [{ uid: 1, defId: 'wooden-chair', x: 0, y: 0, rot: 0 }] });

  it('via the Factory Roll out button: the snapshot exists and ignition keeps it (attempt count carries on)', () => {
    quickRetry.invalidate();
    captureForRetry(payload(), ctx);
    expect(quickRetry.canRetry).toBe(true);
    expect(quickRetry.attempt).toBe(1);
    ensureRetrySnapshot(payload(), ctx);            // the launch phase igniting the same design
    expect(quickRetry.attempt).toBe(1);
    expect(retryAndCatch().parts).toEqual(payload().parts);
  });

  it('via the top Launch tab (no Roll out): ignition makes the snapshot, and Retry works', () => {
    quickRetry.invalidate();                          // fresh page / the design was edited: nothing captured
    expect(quickRetry.canRetry).toBe(false);
    ensureRetrySnapshot(payload(), ctx);
    expect(quickRetry.canRetry).toBe(true);
    const p = retryAndCatch();
    expect(p.parts).toEqual(payload().parts);
    expect(quickRetry.attempt).toBe(2);
  });

  it('a different design than the stored snapshot replaces it', () => {
    quickRetry.invalidate();
    captureForRetry(payload(), ctx);
    ensureRetrySnapshot(other(), ctx);               // went to the Launch tab with another build loaded
    expect(retryAndCatch().parts).toEqual(other().parts);
  });
});
