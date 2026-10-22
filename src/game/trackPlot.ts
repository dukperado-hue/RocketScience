/**
 * A small flight-path plot for the debrief: altitude against ground distance, the mission goal as a dashed line,
 * the apogee marked. Drawn straight from the simulation's own samples.
 */
import type { TrackPoint } from './flightFacts';

const nice = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1)} km` : `${Math.round(m)} m`);

export function drawTrack(cv: HTMLCanvasElement, track: TrackPoint[], o: { apogeeM: number; goalM?: number | null }) {
  const g = cv.getContext('2d');
  if (!g) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(160, cv.clientWidth || 420), H = Math.max(90, cv.clientHeight || 130);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const L = 44, R = 12, T = 12, B = 20;
  const pts = track.length ? track : [{ x: 0, alt: 0 }];
  const xs = pts.map((p) => Math.abs(p.x));
  const xmax = Math.max(20, ...xs);
  const ymax = Math.max(20, o.apogeeM * 1.08, (o.goalM ?? 0) * 1.1);
  const X = (x: number) => L + (Math.abs(x) / xmax) * (W - L - R);
  const Y = (a: number) => H - B - (Math.max(0, a) / ymax) * (H - T - B);
  g.font = '11px Inter, system-ui, sans-serif';
  g.textBaseline = 'middle';
  // ground
  g.strokeStyle = '#c9d0da'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(L, H - B); g.lineTo(W - R, H - B); g.stroke();
  g.fillStyle = '#667085'; g.textAlign = 'right'; g.fillText('0', L - 6, H - B);
  g.fillText(nice(ymax / 1.08), L - 6, T + 2);
  g.textAlign = 'right'; g.fillText(`${nice(xmax)} →`, W - R, H - 6);
  // goal
  if (o.goalM) {
    g.setLineDash([5, 4]); g.strokeStyle = '#1f9d5a'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(L, Y(o.goalM)); g.lineTo(W - R, Y(o.goalM)); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#1f9d5a'; g.textAlign = 'left'; g.fillText(`goal ${nice(o.goalM)}`, L + 4, Y(o.goalM) - 7);
  }
  // path
  g.strokeStyle = '#1f5fd1'; g.lineWidth = 2.2; g.lineJoin = 'round';
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.alt)) : g.moveTo(X(p.x), Y(p.alt))));
  g.stroke();
  // apogee
  const top = pts.reduce((m, p) => (p.alt > m.alt ? p : m), pts[0]);
  g.fillStyle = '#f08c2e'; g.beginPath(); g.arc(X(top.x), Y(top.alt), 4, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#161b24'; g.textAlign = top.x > xmax * 0.6 ? 'right' : 'left';
  g.fillText(nice(o.apogeeM), X(top.x) + (top.x > xmax * 0.6 ? -8 : 8), Math.max(T + 6, Y(top.alt) - 4));
}
