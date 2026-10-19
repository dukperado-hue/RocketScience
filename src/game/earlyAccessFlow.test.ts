import { describe, it, expect } from 'vitest';
import { eaDismissChoice, eaNext } from './earlyAccessFlow';

describe('End of Early Access card flow', () => {
  it('"Keep flying" hides the card and brings it back at the end of the flight', () => {
    expect(eaNext('keep')).toEqual({ again: true, settled: false, resume: true });
  });
  it('every other choice is final: no second card, Retry stays hidden', () => {
    for (const c of ['sandbox', 'factory', 'story'] as const) expect(eaNext(c)).toEqual({ again: false, settled: true, resume: false });
  });
  it('Esc / click-outside keeps flying mid-flight and goes to the Factory at the end', () => {
    expect(eaDismissChoice(true)).toBe('keep');
    expect(eaDismissChoice(false)).toBe('factory');
  });
});
