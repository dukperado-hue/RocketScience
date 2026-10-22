/**
 * Small screens: the launch HUD covers the top (a row of cards on phones) and the bottom (site card, radar, CAPCOM,
 * controls). The camera lifts and shrinks the picture so the vehicle sits in the free sky between them.
 * `floorPx` = where the free area ends, measured from the top of the flight view; `topPx` = where it starts.
 */
export function phoneFit(viewH: number, floorPx: number, topPx = 0): { shiftPx: number; scale: number } {
  const top = Math.max(0, topPx);
  const free = Math.max(120, Math.min(floorPx, viewH) - top);
  return { shiftPx: viewH / 2 - (top + free / 2), scale: Math.min(1, Math.max(0.25, free / viewH)) };
}
