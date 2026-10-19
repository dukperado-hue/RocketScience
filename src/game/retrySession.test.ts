import { describe, it, expect, vi } from 'vitest';
import { bus, type LaunchPayload } from '@/core/EventBus';
import { SITES } from '@/physics/flight2d';
import { captureForRetry, quickRetry, rememberLaunchChoice } from './retrySession';
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
