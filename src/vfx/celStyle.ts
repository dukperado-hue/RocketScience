/**
 * "Zombie vs Physics" art direction — 2.5D cel-shaded vector.
 *
 *   - thick dark outline (≈2.5× the normal part stroke), round joins
 *   - flat base colour + ONE hard-edged shadow band (no gradients)
 *   - one small white highlight per shape
 *   - slime is a saturated lime, never red: slapstick, not horror
 *
 * Used by the zombie drawings, the gore/smoke particles and (later) the
 * Launch-phase HUD overlays, so everything shares one look.
 */
export const CEL = {
  ink: '#1b2230',
  outline: 2.6,            // × the caller's base line width
  highlight: 'rgba(255,255,255,0.75)',
  shadowAlpha: 0.28,       // how dark the single shadow band is
  slime: '#7bd34a',
  slimeDark: '#4f9a2a',
  worm: '#e58fa6',
  wormDark: '#b8607a',
  smoke: ['#f4f1ea', '#dcd7cc', '#b9b3a6'] as const,
  flame: ['#fff4b8', '#ffc23d', '#ff7a1a'] as const,
  hud: { panel: 'rgba(255,255,255,0.92)', accent: '#1f5fd1', danger: '#e2483d', slime: '#5cb82e' },
};

/** Darken a #rrggbb colour by k (0…1) — the cel shadow band */
export function shade(hex: string, k = CEL.shadowAlpha): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(c * (1 - k)).toString(16).padStart(2, '0');
  return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

/**
 * Fill a path cel-style: base colour, a hard shadow on the lower-right half
 * (clipped to the shape), a highlight dot, then the thick outline.
 */
export function celFill(
  ctx: CanvasRenderingContext2D, path: Path2D, base: string, lw: number,
  shadow: { x: number; y: number; r: number } | null = null, highlight: { x: number; y: number; r: number } | null = null,
) {
  ctx.fillStyle = base;
  ctx.fill(path);
  if (shadow) {
    ctx.save();
    ctx.clip(path);
    ctx.fillStyle = shade(base);
    ctx.beginPath();
    ctx.arc(shadow.x, shadow.y, shadow.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (highlight) {
    ctx.fillStyle = CEL.highlight;
    ctx.beginPath();
    ctx.arc(highlight.x, highlight.y, highlight.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineWidth = lw * CEL.outline;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = CEL.ink;
  ctx.stroke(path);
}
