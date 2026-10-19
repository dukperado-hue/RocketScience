/**
 * The Capybara Palate Cleanser — after a total catastrophic crash, zombie slime hits
 * the "camera lens" (an overlay canvas on top of the whole flight view), then a
 * completely serene Capybara in a hi-vis vest strolls across the screen and mops it
 * clean before the next launch.
 *
 *   splat   0.0 – 0.7 s   6–9 cel-shaded slime blobs slap onto the glass, drips start
 *   mop     0.9 – 5.2 s   capybara walks left → right; the mop head swings in a
 *                         figure-of-eight and erases slime (destination-out) where it passes
 *   rinse   5.2 – 5.8 s   whatever is left fades, the overlay goes away
 *
 * Click / Space / Esc skips. Respects prefers-reduced-motion (no splat animation, a short
 * fade). Art: a 4-frame sheet `assets/capcom/capybara_mop_sheet.png` if present, else the
 * procedural CapybaraRig (src/rig/capybaraRig.ts) — legs walking, arms pushing a springy mop.
 *
 * Pure presentation: it reads nothing from the flight and changes nothing.
 */
import { CEL, shade } from './celStyle';
import { loadSheet } from './spriteSheet';
import { CapybaraRig } from '@/rig/capybaraRig';

export interface CleanserOptions {
  slime?: string;
  /** called when the capybara starts mopping (e.g. to queue a CAPCOM line) */
  onMop?: () => void;
  seed?: number;
}

interface Blob { x: number; y: number; r: number; lobes: number[]; drips: { dx: number; len: number; speed: number; w: number }[]; at: number }

/**
 * The painted janitor: 4 frames in one row (300 × 298 each, transparent), the capybara walking
 * LEFT, mop head low in front of it. Absent → the procedural CapybaraRig.
 */
const SHEET_SRC = 'assets/capcom/capybara_mop_sheet.png', SHEET_FRAMES = 4, SHEET_FPS = 7;
const SHEET_FACES = -1 as 1 | -1;
/** Where the mop head sits inside one sheet frame (fraction of frame w/h from the top-left) */
const SHEET_MOP = { x: 0.2, y: 0.86 };

export function playPalateCleanser(host: HTMLElement, opts: CleanserOptions = {}): Promise<void> {
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const slime = opts.slime ?? CEL.slime;
  let seed = opts.seed ?? 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  const wrap = document.createElement('div');
  wrap.className = 'rs-cleanser';
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', 'Zombie slime on the lens. Capybara mops it off.');
  const goo = document.createElement('canvas');      // the slime layer (erased by the mop)
  const fg = document.createElement('canvas');       // capybara + mop, redrawn each frame
  const skip = document.createElement('button');
  skip.type = 'button'; skip.className = 'cl-skip'; skip.textContent = 'Skip ▸';
  wrap.append(goo, fg, skip);
  host.appendChild(wrap);

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(1, host.clientWidth), H = Math.max(1, host.clientHeight);
  for (const c of [goo, fg]) { c.width = W * dpr; c.height = H * dpr; }
  const g = goo.getContext('2d')!, f = fg.getContext('2d')!;
  g.scale(dpr, dpr); f.scale(dpr, dpr);

  // ---- the splats ----
  const blobs: Blob[] = [];
  const n = 6 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const r = Math.min(W, H) * (0.06 + rnd() * 0.11);
    blobs.push({
      x: W * (0.08 + rnd() * 0.84), y: H * (0.08 + rnd() * 0.7), r,
      lobes: Array.from({ length: 9 }, () => 0.75 + rnd() * 0.5),
      drips: Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => ({ dx: (rnd() - 0.5) * r * 1.2, len: 0, speed: 18 + rnd() * 40, w: r * (0.12 + rnd() * 0.12) })),
      at: reduce ? 0 : i * 0.07,
    });
  }
  /** Smooth wobbly splat (closed curve through midpoints) + rounded drips; cel outline, one highlight */
  const drawBlob = (b: Blob, k: number) => {
    const r = b.r * (k < 1 ? 0.55 + 0.45 * k + 0.25 * Math.sin(k * Math.PI) : 1);     // slap: overshoot then settle
    const n = b.lobes.length * 2;
    const pts = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2, l = i % 2 ? (b.lobes[i >> 1] + b.lobes[((i >> 1) + 1) % b.lobes.length]) / 2 * 0.9 : b.lobes[i >> 1];
      return [b.x + Math.cos(a) * r * l, b.y + Math.sin(a) * r * l] as const;
    });
    const p = new Path2D();
    const mid = (i: number) => { const p0 = pts[i % n], p1 = pts[(i + 1) % n]; return [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2] as const; };
    let m = mid(n - 1); p.moveTo(m[0], m[1]);
    for (let i = 0; i < n; i++) { m = mid(i); p.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]); }
    p.closePath();
    const dp = new Path2D();
    for (const d of b.drips) if (d.len > 2) {
      const x = b.x + d.dx, top = b.y + r * 0.3, bot = b.y + r * 0.55 + d.len;
      dp.moveTo(x - d.w / 2, top);
      dp.lineTo(x - d.w / 2, bot);
      dp.arc(x, bot, d.w / 2, Math.PI, 0, true);
      dp.lineTo(x + d.w / 2, top);
      dp.closePath();
    }
    // outlines first (thick), then the fills on top: blob + drips merge into one silhouette
    g.lineJoin = 'round'; g.strokeStyle = shade(slime, 0.5); g.lineWidth = 6; g.stroke(p); g.stroke(dp);
    g.fillStyle = slime; g.fill(p); g.fill(dp);
    g.fillStyle = shade(slime, 0.18);
    g.beginPath(); g.ellipse(b.x + r * 0.25, b.y + r * 0.3, r * 0.55, r * 0.35, 0.4, 0, Math.PI * 2); g.fill();   // cel shadow band
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.beginPath(); g.ellipse(b.x - r * 0.32, b.y - r * 0.32, r * 0.2, r * 0.1, -0.6, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(b.x - r * 0.05, b.y - r * 0.45, r * 0.05, 0, Math.PI * 2); g.fill();
  };

  // ---- the walk ----
  return loadSheet(SHEET_SRC, SHEET_FRAMES, SHEET_FPS).then((sheet) => new Promise<void>((resolve) => {
    const T_MOP0 = reduce ? 0.2 : 0.9, T_MOP1 = reduce ? 0.2 : 5.2, T_END = reduce ? 0.9 : 5.8;
    const PASSES = 3, band = H / PASSES;
    const rig = sheet ? null : new CapybaraRig();
    let t0 = performance.now(), last = t0, mopping = false, raf = 0, done = false;
    let prevPts: Record<string, { x: number; y: number }> = {};
    let lastPass = -1;

    const finish = () => {
      if (done) return; done = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey, true);
      wrap.classList.add('out');
      setTimeout(() => { wrap.remove(); resolve(); }, 300);
    };
    const onKey = (e: KeyboardEvent) => { if (['Escape', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); finish(); } };
    window.addEventListener('keydown', onKey, true);
    wrap.addEventListener('click', finish);
    /** destination-out stroke from the last point of this wiper to (x, y): no gaps at any frame rate */
    const wipe = (key: string, x: number, y: number, r: number) => {
      const p0 = prevPts[key] ?? { x, y };
      g.save(); g.globalCompositeOperation = 'destination-out'; g.lineCap = 'round'; g.lineWidth = r * 2;
      g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(x, y); g.stroke(); g.restore();
      // wet sheen where the mop just passed
      if (key === 'mop') { f.strokeStyle = 'rgba(220,245,255,0.16)'; f.lineWidth = r * 1.6; f.lineCap = 'round'; f.beginPath(); f.moveTo(p0.x, p0.y); f.lineTo(x, y); f.stroke(); }
      prevPts[key] = { x, y };
    };

    /** Erase a full-height strip from the last x of this pass to x (the sheet janitor's row) */
    let swathX: number | null = null, swathPass = -1;
    const swath = (x: number, top: number, bottom: number) => {
      if (swathPass !== lastPass) { swathX = null; swathPass = lastPass; }
      const xa = Math.min(swathX ?? x, x), xb = Math.max(swathX ?? x, x);
      g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
      g.fillRect(xa - 30, Math.max(0, top), xb - xa + 60, bottom - Math.max(0, top)); g.restore();
      swathX = x;
    };

    const frame = (now: number) => {
      const t = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // slime: grows in, drips crawl down (only before the mop arrives at them)
      if (t < T_MOP0 + 0.1) {
        g.clearRect(0, 0, W, H);
        for (const b of blobs) {
          const k = Math.max(0, Math.min(1, (t - b.at) / 0.18));
          if (k <= 0) continue;
          for (const d of b.drips) d.len = Math.min(H * 0.25, d.len + d.speed * dt);
          drawBlob(b, k);
        }
      }
      f.clearRect(0, 0, W, H);
      if (t >= T_MOP0 && t < T_MOP1) {
        // Window-cleaner run: three passes across the lens, top → bottom, turning at each end.
        if (!mopping) { mopping = true; opts.onMop?.(); }
        const u = (t - T_MOP0) / (T_MOP1 - T_MOP0);
        const k = Math.min(PASSES - 1e-9, u * PASSES), pass = Math.floor(k), q = k - pass;
        const dir = pass % 2 === 0 ? 1 : -1;                      // 1 = walking right (mop leads)
        if (pass !== lastPass) { prevPts = {}; lastPass = pass; }  // new pass: no streak across the turn
        const ground = band * (pass + 1) - 4;
        if (sheet) {
          // ---- painted sheet: frame from time, a waddle bob, the mop head at a fixed spot per frame ----
          const sh = Math.min(band * 1.08, 440), sw = sh * sheet.aspect;
          const travel = W + sw * 1.6, cx = dir > 0 ? -sw * 0.8 + q * travel : W + sw * 0.8 - q * travel;
          const bob = Math.abs(Math.sin(t * SHEET_FPS * Math.PI / 2)) * sh * 0.015;
          const x0 = cx - sw / 2, y0 = ground - sh + sh * 0.06 - bob;
          const flip = dir !== SHEET_FACES;                         // mirror so the mop always leads
          const mu = flip ? 1 - SHEET_MOP.x : SHEET_MOP.x;
          // the painted frames can't say where every strand goes, so the janitor cleans its whole
          // row as it passes: a swath from the mop back to its tail, band top to band bottom
          const mx = x0 + sw * mu, my = y0 + sh * SHEET_MOP.y;
          swath(mx, ground - band, ground + 4);
          wipe('mop', mx, my, Math.max(band * 0.3, 40));
          sheet.draw(f, t, x0, y0, sw, sh, flip);
          sheet.draw(f, t, x0, y0, sw, sh, flip);
        } else if (rig) {
          // ---- procedural bone rig: waddling legs, arms pushing the mop, springy mop head ----
          const S = Math.min(band * 0.9, 320);                     // px per capybara height
          const travel = W + S * 3.2;                                // mop reaches ~2 heights ahead
          const cx = dir > 0 ? -S * 2.4 + q * travel : W + S * 2.4 - q * travel;
          rig.update(t, dt, 2.4, 3, 0.3, 0.55);                     // brisk scrub, serene face
          const toScreen = (x: number, y: number) => ({ x: cx + dir * S * x, y: ground - S * y });
          const [mxr, myr] = rig.mopPoint(), m = toScreen(mxr, myr);
          wipe('mop', m.x, m.y, Math.max(S * 0.58, 60));
          const bdy = toScreen(0.15, 0.4); wipe('body', bdy.x, bdy.y, S * 0.5);
          f.save();
          f.translate(cx, ground); f.scale(dir * S, -S);             // rig units, y up, mirrored on the way back
          rig.draw(f, 1.4 / S);
          f.restore();
        }
      }
      if (t >= T_MOP1 && !reduce) goo.style.opacity = String(Math.max(0, 1 - (t - T_MOP1) / 0.25));
      if (t >= T_MOP1) wrap.style.opacity = String(Math.max(0, 1 - (t - T_MOP1) / (T_END - T_MOP1)));
      if (t >= T_END) { finish(); return; }
      raf = requestAnimationFrame(frame);
    };
    t0 = last = performance.now();
    raf = requestAnimationFrame(frame);
  }));
}
