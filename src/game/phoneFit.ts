/**
 * Phones: the launch HUD fills the lower part of the screen (site card, radar, CAPCOM, controls). The camera
 * lifts and shrinks the picture so the vehicle sits in the free sky above it instead of behind the cards.
 * `freePx` = height of the free area measured from the top of the flight view.
 */
export function phoneFit(viewH: number, freePx: number): { shiftPx: number; scale: number } {
  const free = Math.max(120, freePx);
  return { shiftPx: Math.max(0, viewH / 2 - free / 2), scale: Math.min(1, Math.max(0.25, free / viewH)) };
}
