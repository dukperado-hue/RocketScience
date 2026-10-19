/**
 * The End of Early Access card appears the moment Mission 2.5 is met, while the rocket is still flying.
 * "Keep flying" hides it and brings it back when the flight ends; any other choice is final.
 */
export type EaChoice = 'sandbox' | 'factory' | 'story' | 'keep';

export interface EaNext {
  /** show the card again when this flight ends */
  again: boolean;
  /** the card is settled (Retry is not offered after the finale) */
  settled: boolean;
  /** the flight keeps running behind the card (it is paused while the card is open) */
  resume: boolean;
}

export function eaNext(choice: EaChoice): EaNext {
  return choice === 'keep' ? { again: true, settled: false, resume: true } : { again: false, settled: true, resume: false };
}

/** Esc and a click outside the card: mid-flight they mean "keep flying", at the end of the flight "back to the Factory" */
export const eaDismissChoice = (midFlight: boolean): EaChoice => (midFlight ? 'keep' : 'factory');
