import { describe, it, expect } from 'vitest';
import { phoneFit } from './phoneFit';

describe('phone camera fit', () => {
  it('puts the vehicle in the middle of the free sky above the dock', () => {
    const view = 728, free = 330;
    const { shiftPx, scale } = phoneFit(view, free);
    const vehicleY = view / 2 - shiftPx;               // where the vehicle's centre ends up
    expect(vehicleY).toBeCloseTo(free / 2, 5);
    expect(scale).toBeCloseTo(free / view, 5);
  });
  it('a screen with nothing docked changes nothing (desktop / after the cards fold)', () => {
    expect(phoneFit(728, 728)).toEqual({ shiftPx: 0, scale: 1 });
    expect(phoneFit(728, 900)).toEqual({ shiftPx: 0, scale: 1 });
  });
  it('never shrinks below a quarter or lifts into the top bar', () => {
    const { shiftPx, scale } = phoneFit(728, 10);
    expect(scale).toBe(0.25);
    expect(728 / 2 - shiftPx).toBeGreaterThanOrEqual(60);
  });
});
