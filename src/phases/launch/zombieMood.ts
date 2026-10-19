/**
 * Live zombie portrait for the HUD: picks an expression from the telemetry and
 * shows the matching sprite (placeholder paths below). Until the art exists, it
 * draws a procedural cel-shaded version of each expression.
 *
 *   idle      ~1 g, nothing special
 *   zero-g    seat g < 0.25 — floating, confused, worms drifting out
 *   high-g    seat g > 4.5 — face squished flat
 *   spinning  pitch rate > 2.5 rad/s — spiral eyes, green with nausea
 *   reentry   seat skin > 120 °C while still in the air, or plasma around it — on fire, crispy
 *   pieces    nothing left in the seat
 */
import type { Flight } from '@/physics/flight2d';
import type { ZombieId } from '@/payload/zombies';
import { drawZombie, drawJar } from '@/vfx/zombieArt';
import { CEL } from '@/vfx/celStyle';

export type Mood = 'idle' | 'zero-g' | 'high-g' | 'spinning' | 'reentry' | 'pieces' | 'jarred';

export const MOOD_ART: Record<Mood, string> = {
  idle: 'assets/zombie/zombie_idle.png',
  'zero-g': 'assets/zombie/zombie_zero_g.png',
  'high-g': 'assets/zombie/zombie_high_g.png',
  spinning: 'assets/zombie/zombie_spinning.png',
  reentry: 'assets/zombie/zombie_reentry.png',
  pieces: 'assets/zombie/zombie_pieces.png',
  jarred: 'assets/zombie/zombie_jarred.png',
};

export const MOOD_TEXT: Record<Mood, string> = {
  idle: 'Unimpressed',
  'zero-g': 'Floating. Confused.',
  'high-g': 'Squished',
  spinning: 'Dizzy. Very dizzy.',
  reentry: 'On fire (extra crispy)',
  pieces: 'In pieces',
  jarred: 'In a jar. Blinking.',
};

export function moodOf(f: Flight): Mood {
  const z = f.zombie;
  if (!z || z.state === 'pieces') return 'pieces';
  if (z.state === 'jarred') return 'jarred';
  const v = f.vehicle;
  if (!f.airborne || v.landed) return 'idle';
  const hot = (z.seatTemp > 120 && v.q > 50) || (v.mach > 5 && v.vUp < 0 && v.alt < 90_000 && v.q > 2000);
  if (hot) return 'reentry';
  if (Math.abs(f.eva ? f.eva.body.om : v.om) > 2.5) return 'spinning';
  if (f.eva) return 'zero-g';
  if (f.seatG > 4.5) return 'high-g';
  if (f.seatG < 0.25) return 'zero-g';
  return 'idle';
}

/** Procedural stand-in for the sprite. ctx: y-up frame, origin at the seat, ~1 unit = 1 m. */
export function drawMood(ctx: CanvasRenderingContext2D, id: ZombieId, mood: Mood, limbs: ReadonlySet<any>, lw: number, t: number) {
  if (mood === 'jarred') { ctx.save(); ctx.translate(0, -0.4); drawJar(ctx, id, 1.05, lw, t); ctx.restore(); return; }
  if (mood === 'pieces') {
    ctx.fillStyle = CEL.slime; ctx.strokeStyle = CEL.ink; ctx.lineWidth = lw * 2.4;
    ctx.beginPath(); ctx.ellipse(0, -0.05, 0.36, 0.08, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    return;
  }
  ctx.save();
  if (mood === 'zero-g') { ctx.translate(0, 0.06 + Math.sin(t * 2) * 0.05); ctx.rotate(Math.sin(t * 0.9) * 0.35); }
  if (mood === 'high-g') ctx.scale(1.22, 0.74);
  if (mood === 'spinning') ctx.rotate(t * 6);
  drawZombie(ctx, id, lw, limbs);
  ctx.restore();

  const headY = 0.6;
  if (mood === 'spinning') {
    // spiral eyes + nauseous green wash
    for (const ex of [-0.045, 0.04]) {
      ctx.strokeStyle = CEL.ink; ctx.lineWidth = lw * 1.4; ctx.beginPath();
      for (let a = 0; a < Math.PI * 5; a += 0.3) { const r = 0.004 + a * 0.0028; const x = ex + Math.cos(a + t * 8) * r, y = headY + 0.02 + Math.sin(a + t * 8) * r; a ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(120,200,60,0.18)'; ctx.fillRect(-0.5, -0.5, 1, 1.3);
  }
  if (mood === 'zero-g') {
    // worms drifting out and a question mark
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const x = -0.3 + i * 0.3 + Math.sin(t * 1.3 + i) * 0.04, y = 0.85 + Math.cos(t * 1.1 + i) * 0.05;
      ctx.strokeStyle = CEL.wormDark; ctx.lineWidth = lw * 3; ctx.beginPath(); ctx.moveTo(x - 0.05, y); ctx.quadraticCurveTo(x, y + 0.04 * Math.sin(t * 6 + i), x + 0.05, y); ctx.stroke();
      ctx.strokeStyle = CEL.worm; ctx.lineWidth = lw * 1.6; ctx.stroke();
    }
    ctx.save(); ctx.scale(1, -1); ctx.fillStyle = CEL.ink; ctx.font = `bold ${0.22}px Inter, sans-serif`; ctx.fillText('?', 0.22, -0.72); ctx.restore();
  }
  if (mood === 'high-g') {
    ctx.strokeStyle = 'rgba(27,34,48,0.5)'; ctx.lineWidth = lw * 1.5;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 0.12, 0.95); ctx.lineTo(i * 0.12, 0.8); ctx.stroke(); }
  }
  if (mood === 'reentry') {
    // char tint + cel flames licking up
    ctx.fillStyle = 'rgba(60,30,10,0.28)'; ctx.fillRect(-0.5, -0.5, 1, 1.3);
    for (let i = 0; i < 5; i++) {
      const x = -0.32 + i * 0.16, hgt = 0.18 + 0.08 * Math.sin(t * 12 + i * 2);
      for (const [col, k] of [['#ff6a1a', 1], ['#ffc23d', 0.6]] as const) {
        ctx.fillStyle = col; ctx.beginPath();
        ctx.moveTo(x - 0.07 * k, 0.15); ctx.quadraticCurveTo(x, 0.15 + hgt * 2 * k, x + 0.07 * k, 0.15); ctx.closePath(); ctx.fill();
      }
    }
  }
}
