/**
 * 2D radar (Tier 0–1): north-up map of Koh Pha-ngan and Samui with the Samui control
 * zone (5 NM, Class D), both approach funnels, the runway, the launch site, the wind and
 * the payload's track. Zones the payload is inside flash red.
 *
 * Pure drawing: reads the AirspaceMonitor (which reads the flight); changes nothing.
 */
import { localEN, type GeoPoint } from '@/law/zones';
import { COASTS, FUNNELS, VTSM, funnelPolygon } from '@/law/samui';
import type { AirspaceMonitor } from '@/law/airspaceMonitor';

export class RadarView {
  private ctx: CanvasRenderingContext2D;
  private dpr = Math.min(2, window.devicePixelRatio || 1);

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  frame(m: AirspaceMonitor, now: number) {
    const c = this.canvas, ctx = this.ctx;
    const W = c.clientWidth || 300, H = c.clientHeight || 300;
    if (c.width !== Math.round(W * this.dpr)) { c.width = Math.round(W * this.dpr); c.height = Math.round(H * this.dpr); }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Frame: midway between the launch site and the airport, wide enough for both + 6 km
    const origin = VTSM.arp;
    const site = localEN(origin, m.site.pos);
    const last = m.track[m.track.length - 1];
    const cur = last ? localEN(origin, last.pos) : site;
    const cx = (site.e + cur.e) / 2 * 0.5 + site.e * 0.25, cy = (site.n + 0) / 2;
    const span = Math.max(26_000, Math.hypot(site.e, site.n) + 14_000, Math.hypot(cur.e - cx, cur.n - cy) * 2 + 6_000);
    const k = Math.min(W, H) / span;
    const P = (p: GeoPoint): [number, number] => { const q = localEN(origin, p); return [W / 2 + (q.e - cx) * k, H / 2 - (q.n - cy) * k]; };

    // sea
    ctx.fillStyle = '#071a2b'; ctx.fillRect(0, 0, W, H);
    // range rings around the airport every 5 km
    const [ax, ay] = P(origin);
    ctx.strokeStyle = 'rgba(120,200,160,0.18)'; ctx.lineWidth = 1;
    for (let r = 5_000; r <= 40_000; r += 5_000) { ctx.beginPath(); ctx.arc(ax, ay, r * k, 0, Math.PI * 2); ctx.stroke(); }
    // islands
    for (const isl of COASTS) {
      ctx.beginPath();
      isl.pts.forEach(([lat, lon], i) => { const [x, y] = P({ lat, lon }); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath();
      ctx.fillStyle = '#1f3d2c'; ctx.fill();
      ctx.strokeStyle = '#5fae7d'; ctx.lineWidth = 1.2; ctx.stroke();
    }
    const flash = 0.5 + 0.5 * Math.sin(now / 120);
    // approach funnels
    for (const f of FUNNELS) {
      const hit = m.inside.has(`app-${f.rwy}`);
      ctx.beginPath();
      funnelPolygon(f).forEach((p, i) => { const [x, y] = P(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath();
      ctx.fillStyle = hit ? `rgba(255,60,60,${0.25 + 0.35 * flash})` : 'rgba(255,122,217,0.16)';
      ctx.fill();
      ctx.strokeStyle = hit ? '#ff4d4d' : 'rgba(255,122,217,0.8)'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.3; ctx.stroke(); ctx.setLineDash([]);
      // label at the far end
      const poly = funnelPolygon(f), mid = P({ lat: (poly[1].lat + poly[2].lat) / 2, lon: (poly[1].lon + poly[2].lon) / 2 });
      ctx.fillStyle = 'rgba(255,170,230,0.95)'; ctx.font = '600 10px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`RWY ${f.rwy} APP`, mid[0], mid[1] + (f.rwy === '17' ? -4 : 12));
    }
    // control zone
    const [nx, ny] = P(VTSM.ndb);
    const ctrHit = m.inside.has('ctr');
    ctx.beginPath(); ctx.arc(nx, ny, VTSM.ctr.radius * k, 0, Math.PI * 2);
    ctx.fillStyle = ctrHit ? `rgba(255,60,60,${0.18 + 0.3 * flash})` : 'rgba(80,160,255,0.12)'; ctx.fill();
    ctx.strokeStyle = ctrHit ? '#ff4d4d' : '#5aa9ff'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.fillStyle = '#9cc9ff'; ctx.font = '600 10px Inter, system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('SAMUI CTR · D · 5 NM · SFC–2000 ft', nx - VTSM.ctr.radius * k * 0.7, ny + VTSM.ctr.radius * k + 12);
    // runway
    const [t1x, t1y] = P(VTSM.runways[0].thr), [t2x, t2y] = P(VTSM.runways[1].thr);
    ctx.strokeStyle = '#f2f4f7'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(t1x, t1y); ctx.lineTo(t2x, t2y); ctx.stroke();
    ctx.fillStyle = '#f2f4f7'; ctx.fillText('VTSM', t2x + 6, t2y + 4);

    // launch site + wind arrow
    const [sx, sy] = P(m.site.pos);
    ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.moveTo(sx, sy - 7); ctx.lineTo(sx + 5, sy + 4); ctx.lineTo(sx - 5, sy + 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd59a'; ctx.fillText(m.site.name.split(' (')[0], sx + 8, sy - 4);
    const wb = (m.windTo * Math.PI) / 180, wl = 26;
    const wx = W - 34, wy = 34;
    ctx.strokeStyle = '#cfe8ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(wx, wy, 18, 0, Math.PI * 2); ctx.globalAlpha = 0.35; ctx.stroke(); ctx.globalAlpha = 1;
    const ex = wx + Math.sin(wb) * wl / 2, ey = wy - Math.cos(wb) * wl / 2, bx = wx - Math.sin(wb) * wl / 2, by = wy + Math.cos(wb) * wl / 2;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - Math.sin(wb - 0.5) * 7, ey + Math.cos(wb - 0.5) * 7); ctx.lineTo(ex - Math.sin(wb + 0.5) * 7, ey + Math.cos(wb + 0.5) * 7); ctx.closePath(); ctx.fillStyle = '#cfe8ff'; ctx.fill();
    ctx.textAlign = 'center'; ctx.fillStyle = '#cfe8ff'; ctx.font = '600 9px Inter, system-ui, sans-serif';
    ctx.fillText(`WIND ${String(Math.round(m.windFrom)).padStart(3, '0')}°`, wx, wy + 30);
    ctx.fillText('N', wx, wy - 21);

    // track
    if (m.track.length > 1) {
      ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 1.6; ctx.setLineDash([2, 3]);
      ctx.beginPath(); m.track.forEach((q, i) => { const [x, y] = P(q.pos); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); ctx.setLineDash([]);
    }
    if (last) {
      const [px, py] = P(last.pos);
      const bad = m.inside.size > 0;
      ctx.fillStyle = bad ? '#ff4d4d' : '#ffe066';
      ctx.beginPath(); ctx.arc(px, py, 4 + (bad ? 3 * flash : 0), 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = bad ? '#ff4d4d' : '#ffe066'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(px, py, 9 + 4 * ((now / 600) % 1) * 2, 0, Math.PI * 2); ctx.globalAlpha = 0.6 * (1 - ((now / 600) % 1)); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff'; ctx.font = '600 10px JetBrains Mono, monospace'; ctx.textAlign = 'left';
      const nearSite = Math.hypot(px - sx, py - sy) < 40;
      ctx.fillText(`${Math.round(last.alt)} m`, px + 9, nearSite ? py + 16 : py - 6);
    }
    // scale bar
    ctx.strokeStyle = '#9fb3c8'; ctx.lineWidth = 1.5;
    const L = 5_000 * k;
    ctx.beginPath(); ctx.moveTo(10, H - 12); ctx.lineTo(10 + L, H - 12); ctx.stroke();
    ctx.fillStyle = '#9fb3c8'; ctx.font = '9px Inter, system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('5 km', 12 + L, H - 9);
  }
}
