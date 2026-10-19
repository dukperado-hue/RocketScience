import { describe, it, expect } from 'vitest';
import { shouldCoachM1 } from './firstRun';

const fresh = { sandbox: false, currentMissionId: 'm1-lantern', partCount: 0, coached: false };

describe('first-run coach for Mission 1', () => {
  it('a brand-new campaign with an empty Factory gets it', () => expect(shouldCoachM1(fresh)).toBe(true));
  it('never replaces a saved build', () => expect(shouldCoachM1({ ...fresh, partCount: 3 })).toBe(false));
  it('only once', () => expect(shouldCoachM1({ ...fresh, coached: true })).toBe(false));
  it('not in Sandbox, and not once M1 is behind the player', () => {
    expect(shouldCoachM1({ ...fresh, sandbox: true })).toBe(false);
    expect(shouldCoachM1({ ...fresh, currentMissionId: 'm2-ballistics' })).toBe(false);
    expect(shouldCoachM1({ ...fresh, currentMissionId: null })).toBe(false);
  });
});
