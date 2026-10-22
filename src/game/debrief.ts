/**
 * Flight debrief and forecast text — why the flight went the way it did, in plain words (English + Thai).
 *
 * Every sentence is computed from FlightFacts, which come straight out of the simulation (see flightFacts.ts):
 * the tumble time and altitude, the speed it left the ramp, the crosswind, the vehicle's own centre-of-pressure
 * number. Nothing here invents a cause; where the simulation does not say, the debrief stays quiet.
 */
import { forecastFlight, type FlightFacts, type ForecastInput } from './flightFacts';
import { safeKV } from '@/core/safeStorage';
import { IMPULSE_LOSS_MAX } from '@/physics/flight2d';

export type Tone = 'good' | 'warn' | 'bad' | 'info';
export interface Note { en: string; th: string; tone: Tone }

/** What is remembered of the previous flight, to compare the next one against */
export interface Digest {
  v: 1;
  kind: 'lantern' | 'rocket';
  apogeeM: number; outcome: string;
  windMs: number; railAngleDeg: number; railM: number;
  massKg: number; twr: number; parts: string;
  alerts: number; siteId: string | null; windFrom: number | null;
}

export interface Alternative { label: Note; apogeeM: number; wind: number; railAngleDeg: number }

export interface Debrief {
  headline: Note;
  causes: Note[];
  next: Note[];
  compare: Note[];
  /** Goal the current mission asks for (m), for the track plot */
  goalM: number | null;
}

const km = (m: number) => `${(m / 1000).toFixed(m >= 10_000 ? 1 : 2)} km`;
const alt = (m: number) => (m >= 1000 ? km(m) : `${Math.round(m)} m`);
const fixed = (n: number, d = 0) => n.toFixed(d);
const min = (s: number) => `${fixed(s / 60, 1)} min`;

const ALERT_NAME: Record<string, { en: string; th: string }> = {
  ctr: { en: 'the Samui control zone', th: 'เขตควบคุมการบินสมุย' },
  'app-17': { en: 'the RWY 17 final approach', th: 'แนวร่อนลงทางวิ่ง 17' },
  'app-35': { en: 'the RWY 35 final approach', th: 'แนวร่อนลงทางวิ่ง 35' },
};

/* ---------------------------------------------------------------------------------------------------------------- */

export function buildDebrief(f: FlightFacts, opts: { goalM?: number | null; prev?: Digest | null; alternatives?: Alternative[] } = {}): Debrief {
  const goalM = opts.goalM ?? null;
  const causes: Note[] = [];
  const next: Note[] = [];
  const L = (tone: Tone, en: string, th: string): Note => ({ tone, en, th });
  let headline: Note;

  if (f.kind === 'lantern') {
    const alerts = f.alerts.filter((a) => a !== 'fine');
    if (f.outcome === 'no-liftoff') {
      headline = L('bad', 'The lantern never floated.', 'โคมไม่ลอยขึ้น');
      causes.push(L('info', 'The air inside never got hot enough for its weight, or the wind was too strong for it to rise — check the pre-flight lines on the Factory screen.', 'อากาศในโคมร้อนไม่พอเทียบกับน้ำหนัก หรือลมแรงเกินไปจนลอยขึ้นไม่ได้ ดูข้อความก่อนบินในหน้า Factory'));
    } else if (alerts.length) {
      const first = ALERT_NAME[alerts[0]] ?? ALERT_NAME.ctr;
      headline = L('bad', `Airspace alert: it entered ${first.en}.`, `แจ้งเตือนน่านฟ้า: โคมเข้า${first.th}`);
      causes.push(L('bad', `The first alert came at T+${fixed(f.firstAlertS ?? 0)} s${f.liftoffS !== null && (f.firstAlertS ?? 0) - f.liftoffS < 5 ? ', almost the moment it lifted off' : ''}.`, `การแจ้งเตือนแรกเกิดที่ T+${fixed(f.firstAlertS ?? 0)} วินาที${f.liftoffS !== null && (f.firstAlertS ?? 0) - f.liftoffS < 5 ? ' แทบจะทันทีที่โคมลอยขึ้น' : ''}`));
      if (f.lanternSiteId === 'haad-rin') causes.push(L('info', 'Haad Rin lies right under the final approach to Samui RWY 17: a lantern released there climbs through the path aircraft use, whichever way the wind blows.', 'หาดริ้นอยู่ใต้แนวร่อนลงทางวิ่ง 17 ของสมุยพอดี โคมที่ปล่อยจากที่นี่จะลอยขึ้นผ่านเส้นทางที่เครื่องบินใช้ ไม่ว่าลมจะพัดไปทางไหน'));
      else causes.push(L('info', `The wind came from ${fixed(f.windFrom ?? 0)}°, so the lantern drifted toward the airport side. A different wind direction, or a different beach, keeps it away.`, `ลมพัดมาจากทิศ ${fixed(f.windFrom ?? 0)}° โคมจึงลอยไปทางสนามบิน ลองเปลี่ยนทิศลมหรือเปลี่ยนชายหาด`));
      next.push(L('info', 'Press “Risk check” before you release: it flies the lantern in the simulation first and says whether it stays clear.', 'กด “Risk check” ก่อนปล่อย: เกมจะบินโคมในการจำลองให้ก่อนและบอกว่าจะอยู่นอกเขตหรือไม่'));
    } else if (f.outcome === 'landed' || f.outcome === 'timeout') {
      headline = L('good', `Clean flight: ${alt(f.apogeeM)} up, landed ${km(f.rangeM)} away, no airspace alerts.`, `บินสะอาด: สูง ${alt(f.apogeeM)} ลงห่างไป ${km(f.rangeM)} ไม่มีการแจ้งเตือนน่านฟ้า`);
    } else headline = L('info', `The lantern came down ${km(f.rangeM)} away.`, `โคมตกห่างออกไป ${km(f.rangeM)}`);
    if (f.liftoffS !== null) causes.push(L('info', `Lift-off at T+${fixed(f.liftoffS)} s — that is how long the flame needed to warm the air inside.`, `ลอยขึ้นที่ T+${fixed(f.liftoffS)} วินาที ซึ่งเป็นเวลาที่เปลวไฟใช้อุ่นอากาศในโคม`));
    if (f.apogeeM > 1 && f.outcome !== 'no-liftoff') causes.push(L('info', `It climbed to ${alt(f.apogeeM)}, stayed up about ${min(f.endS - (f.liftoffS ?? 0))} and drifted ${km(f.rangeM)} downwind.`, `ลอยสูงสุด ${alt(f.apogeeM)} อยู่บนฟ้าราว ${min(f.endS - (f.liftoffS ?? 0))} และถูกลมพัดไป ${km(f.rangeM)}`));
    if (f.lanternFire) causes.push(L('bad', 'The paper caught fire in the air: it got hotter than paper can take (about 233 °C inside).', 'กระดาษติดไฟกลางอากาศ เพราะร้อนเกินที่กระดาษจะทนได้ (ราว 233 °C ข้างใน)'));
    if (f.lanternGroundFire) causes.push(L('bad', 'It came down with the flame still burning — this is exactly how lantern fires start on roofs and in fields.', 'โคมตกลงมาทั้งที่ไฟยังติด นี่คือสาเหตุที่โคมลอยทำให้เกิดไฟไหม้หลังคาและทุ่งนา'));
  } else {
    // ----- rockets -----
    const reached = goalM !== null && f.apogeeM >= goalM;
    const pitched = f.tumbleAtS !== null || f.maxTiltDeg > 60;
    if (f.outcome === 'no-liftoff') {
      headline = L('bad', 'It never left the pad.', 'ไม่ได้ออกจากแท่น');
      causes.push(L('warn', `Thrust-to-weight was ${fixed(f.twr, 2)}: below 1.0 the motor cannot even lift its own weight.`, `อัตราแรงขับต่อน้ำหนักได้ ${fixed(f.twr, 2)} ต่ำกว่า 1.0 มอเตอร์จึงยกน้ำหนักตัวเองไม่ไหว`));
    } else if (reached) {
      headline = L('good', `Reached ${alt(f.apogeeM)} — the goal was ${alt(goalM!)}.`, `ขึ้นถึง ${alt(f.apogeeM)} เป้าหมายคือ ${alt(goalM!)}`);
    } else if (pitched) {
      headline = f.tumbleAtS !== null
        ? L('warn', `It tumbled at T+${fixed(f.tumbleAtS)} s and only reached ${alt(f.apogeeM)}${goalM !== null ? ` of ${alt(goalM)}` : ''}.`, `ตีลังกาที่ T+${fixed(f.tumbleAtS)} วินาที และขึ้นได้เพียง ${alt(f.apogeeM)}${goalM !== null ? ` จาก ${alt(goalM)}` : ''}`)
        : L('warn', `It pitched over (tilt ${fixed(f.maxTiltDeg)}°) and only reached ${alt(f.apogeeM)}${goalM !== null ? ` of ${alt(goalM)}` : ''}.`, `จรวดเอียงล้ม (เอียง ${fixed(f.maxTiltDeg)}°) และขึ้นได้เพียง ${alt(f.apogeeM)}${goalM !== null ? ` จาก ${alt(goalM)}` : ''}`);
    } else {
      headline = L(goalM !== null ? 'warn' : 'info', `Apogee ${alt(f.apogeeM)}${goalM !== null ? ` — ${alt(Math.max(0, goalM - f.apogeeM))} short of the ${alt(goalM)} goal` : ''}.`, `จุดสูงสุด ${alt(f.apogeeM)}${goalM !== null ? ` ขาดอีก ${alt(Math.max(0, goalM - f.apogeeM))} จากเป้า ${alt(goalM)}` : ''}`);
    }

    if (pitched) {
      causes.push(f.tumbleAtS !== null
        ? L('warn', `Tumble: the nose swung past 90° at T+${fixed(f.tumbleAtS)} s${f.tumbleAltM !== null ? `, ${alt(f.tumbleAltM)} up` : ''} (tilt reached ${fixed(f.maxTiltDeg)}°).`, `ตีลังกา: หัวจรวดเอียงเกิน 90° ที่ T+${fixed(f.tumbleAtS)} วินาที${f.tumbleAltM !== null ? ` ที่ความสูง ${alt(f.tumbleAltM)}` : ''} (เอียงสูงสุด ${fixed(f.maxTiltDeg)}°)`)
        : L('warn', `The nose tipped over to ${fixed(f.maxTiltDeg)}° from vertical. A rocket pointing sideways or down spends its thrust going nowhere near straight up.`, `หัวจรวดเอียงไปถึง ${fixed(f.maxTiltDeg)}° จากแนวดิ่ง จรวดที่หัวชี้ไปด้านข้างหรือลงล่างใช้แรงขับไปในทิศที่ไม่ใช่ขึ้นตรง`));
      if (f.railM > 0 && f.windMs > 0 && f.railExitMs !== null) {
        const a = (Math.atan2(f.windMs, Math.max(0.5, f.railExitMs)) * 180) / Math.PI;
        causes.push(L('info', `It left the ${fixed(f.railM)} m ramp at only ${fixed(f.railExitMs, 1)} m/s into a ${fixed(f.windMs, 1)} m/s crosswind — about ${fixed(a)}° across the airflow, before the tail had enough speed to steady it.`, `ออกจากแรมป์ ${fixed(f.railM)} ม. ด้วยความเร็วเพียง ${fixed(f.railExitMs, 1)} ม./วิ ขณะมีลมขวาง ${fixed(f.windMs, 1)} ม./วิ จึงเอียงจากแนวลมราว ${fixed(a)}° ก่อนที่หางจะมีความเร็วพอพยุงให้ตรง`));
      } else if (f.railAngleDeg > 0 && f.windMs <= 0.5) {
        causes.push(L('info', `The ramp leaned ${fixed(f.railAngleDeg)}° from vertical, so it started off line; slow and top-heavy in the air, that small lean grew into a flip.`, `แรมป์เอียง ${fixed(f.railAngleDeg)}° จากแนวดิ่ง จรวดจึงเริ่มต้นเอียง และเมื่อบินช้าอยู่ ความเอียงเล็กน้อยนั้นก็ขยายเป็นการพลิกคว่ำ`));
      }
      if (f.cpAboveComM > 0.02) causes.push(L('info', `Its centre of pressure sits ${fixed(f.cpAboveComM * 100)} cm above its centre of mass, so the air pushes the nose further round instead of straightening it.`, `จุดศูนย์กลางแรงกดอากาศอยู่สูงกว่าจุดศูนย์กลางมวล ${fixed(f.cpAboveComM * 100)} ซม. อากาศจึงดันหัวให้หมุนต่อแทนที่จะดึงกลับให้ตรง`));
      else if (f.cpAboveComM < -0.02) causes.push(L('info', `Its centre of pressure is ${fixed(-f.cpAboveComM * 100)} cm below the centre of mass (stable) — but at this low speed the air cannot act on the fins yet. Speed off the ramp is what saves it.`, `จุดศูนย์กลางแรงกดอยู่ต่ำกว่าจุดศูนย์กลางมวล ${fixed(-f.cpAboveComM * 100)} ซม. (เสถียร) แต่ที่ความเร็วต่ำเช่นนี้ อากาศยังไม่ช่วยครีบ จึงต้องมีความเร็วตอนออกจากแรมป์`));
    }
    if (f.quality < 0.95 && f.outcome !== 'no-liftoff') {
      const loss = Math.round((1 - f.quality) * IMPULSE_LOSS_MAX * 100);
      causes.push(L(reached ? 'info' : 'warn', `Your powder batch was ${fixed(f.quality * 100)}% even: the lumps left unburnt grains, so the motor gave about ${loss}% less impulse than a perfect batch. Stir on the beat at the Mixing bench to raise it.`, `ผงดินขับของคุณสม่ำเสมอ ${fixed(f.quality * 100)}% เม็ดที่จับเป็นก้อนไหม้ไม่หมด มอเตอร์จึงให้แรงดันรวมน้อยกว่าชุดที่สมบูรณ์ราว ${loss}% กวนตามจังหวะที่โต๊ะผสมเพื่อเพิ่มคุณภาพ`));
    }
    if (f.twr > 0 && f.twr < 1.3 && f.railExitMs !== null && f.railExitMs < 15 && f.outcome !== 'no-liftoff') {
      causes.push(L('info', `Thrust-to-weight is only ${fixed(f.twr, 2)}, so it crawls off the ramp (${fixed(f.railExitMs, 1)} m/s). A slow rocket has no air flowing past its tail to keep it straight — that is why wind matters so much here.`, `อัตราแรงขับต่อน้ำหนักเพียง ${fixed(f.twr, 2)} จรวดจึงคลานออกจากแรมป์ (${fixed(f.railExitMs, 1)} ม./วิ) จรวดที่ช้าไม่มีลมไหลผ่านหางให้พยุงตัว จึงเสี่ยงต่อลมมาก`));
    }
    if (f.deltaV > 0 && f.apogeeM > 0 && !reached && pitched) {
      causes.push(L('info', `Δv on the Factory screen (${fixed(f.deltaV)} m/s) is the speed the propellant could add in empty space and flying straight up. Gravity and drag take a big bite, and pitching over wastes the rest — this build reached ${alt(f.apogeeM)}.`, `ค่า Δv ในหน้า Factory (${fixed(f.deltaV)} ม./วิ) คือความเร็วที่เชื้อเพลิงเพิ่มได้ในอวกาศว่างเมื่อบินขึ้นตรง แรงโน้มถ่วงและแรงต้านอากาศกินไปมาก และการเอียงล้มทำให้พลังที่เหลือสูญเปล่า จรวดนี้จึงขึ้นได้ ${alt(f.apogeeM)}`));
    }
    if (f.outcome === 'impact' && f.burnoutAtS === null && f.burnPlannedS > 0 && pitched) {
      causes.push(L('info', `The pre-flight panel said ${fixed(f.burnPlannedS)} s of burn. The rocket hit the ground at T+${fixed(f.endS)} s with the motor still burning — a tumbling rocket pushes itself sideways and down instead of up.`, `แผงก่อนบินบอกเวลาเผาไหม้ ${fixed(f.burnPlannedS)} วินาที แต่จรวดชนพื้นที่ T+${fixed(f.endS)} วินาทีขณะมอเตอร์ยังติดอยู่ จรวดที่ตีลังกาจะผลักตัวเองไปด้านข้างและลงล่างแทนที่จะขึ้น`));
    } else if (f.burnoutAtS !== null && f.burnPlannedS > 0 && Math.abs(f.burnoutAtS - f.burnPlannedS) / f.burnPlannedS > 0.2) {
      causes.push(L('info', `Burnout came at T+${fixed(f.burnoutAtS)} s; the panel had said ${fixed(f.burnPlannedS)} s.`, `มอเตอร์ดับที่ T+${fixed(f.burnoutAtS)} วินาที แผงก่อนบินบอกไว้ ${fixed(f.burnPlannedS)} วินาที`));
    }
    if (reached && f.stayedUpright) causes.push(L('good', `What worked: it never pitched over${f.windMs <= 0.5 ? ' — dead-calm air' : ''}${f.railAngleDeg === 0 ? ' and a vertical ramp' : ''} kept it pointing straight up while it burned.`, `สิ่งที่ได้ผล: จรวดไม่เอียงเลย${f.windMs <= 0.5 ? ' เพราะอากาศนิ่งสนิท' : ''}${f.railAngleDeg === 0 ? ' และแรมป์ตั้งตรง' : ''} จึงพุ่งขึ้นตรงตลอดช่วงที่เผาไหม้`));
    if (f.outcome === 'impact' && f.impactMs > 15) {
      if (!f.hasChute) causes.push(L('info', `No parachute on this build (they arrive with Tier 2), so it came down at ${fixed(f.impactMs)} m/s.`, `บิ้วด์นี้ไม่มีร่มชูชีพ (ร่มมากับ Tier 2) จึงตกด้วยความเร็ว ${fixed(f.impactMs)} ม./วิ`));
      else if (!f.chuteOpened) causes.push(L('warn', `The parachute never opened (hit at ${fixed(f.impactMs)} m/s). Press P to open it, or leave auto-deploy on.`, `ร่มชูชีพไม่ได้กาง (ชนที่ ${fixed(f.impactMs)} ม./วิ) กด P เพื่อกางร่ม หรือเปิดกางอัตโนมัติไว้`));
    }

    // what to try — only things the simulation can back up
    const alts = (opts.alternatives ?? []).filter((a) => a.apogeeM > f.apogeeM * 1.15 + 50);
    if (!reached) for (const a of alts.slice(0, 2)) next.push({ ...a.label, tone: a.apogeeM >= (goalM ?? Infinity) ? 'good' : 'info' });
    if (!reached && pitched && !alts.length) next.push(L('info', 'Change one thing at a time — wind, ramp angle, tail, mass — and compare the flights below.', 'เปลี่ยนทีละอย่าง — ลม มุมแรมป์ หาง น้ำหนัก — แล้วเทียบเที่ยวบินด้านล่าง'));
    if (!reached && f.windMs > 0 && f.railM > 0) next.push(L('info', 'In the launch settings, “Dawn · calm” sets the wind to 0: the one launch window with no crosswind.', 'ในการตั้งค่าลานปล่อย “รุ่งเช้า · ลมสงบ” จะตั้งลมเป็น 0 ซึ่งเป็นช่วงเวลาเดียวที่ไม่มีลมขวาง'));
  }

  causes.sort((a, b) => (a.tone === 'good' ? 0 : 1) - (b.tone === 'good' ? 0 : 1));      // what worked first
  const compare = opts.prev ? compareWith(f, opts.prev) : [];
  return { headline, causes, next, compare, goalM };
}

/** Differences from the previous flight, in words */
export function compareWith(f: FlightFacts, prev: Digest): Note[] {
  const out: Note[] = [];
  if (prev.kind !== f.kind) return out;
  const changes: { en: string; th: string }[] = [];
  const num = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) > tol;
  if (num(prev.windMs, f.windMs)) changes.push({ en: `wind ${fixed(prev.windMs, 1)} → ${fixed(f.windMs, 1)} m/s`, th: `ลม ${fixed(prev.windMs, 1)} → ${fixed(f.windMs, 1)} ม./วิ` });
  if (num(prev.railAngleDeg, f.railAngleDeg)) changes.push({ en: `ramp angle ${fixed(prev.railAngleDeg)}° → ${fixed(f.railAngleDeg)}°`, th: `มุมแรมป์ ${fixed(prev.railAngleDeg)}° → ${fixed(f.railAngleDeg)}°` });
  if (num(prev.railM, f.railM)) changes.push({ en: `guide length ${fixed(prev.railM)} → ${fixed(f.railM)} m`, th: `ความยาวราง ${fixed(prev.railM)} → ${fixed(f.railM)} ม.` });
  if (prev.massKg > 0 && Math.abs(prev.massKg - f.massKg) / prev.massKg > 0.02) changes.push({ en: `mass ${fixed(prev.massKg, 1)} → ${fixed(f.massKg, 1)} kg`, th: `มวล ${fixed(prev.massKg, 1)} → ${fixed(f.massKg, 1)} กก.` });
  if (prev.siteId !== f.lanternSiteId) changes.push({ en: 'launch site', th: 'สถานที่ปล่อย' });
  if (prev.windFrom !== f.windFrom && f.windFrom !== null) changes.push({ en: `wind direction ${prev.windFrom ?? '—'}° → ${f.windFrom}°`, th: `ทิศลม ${prev.windFrom ?? '—'}° → ${f.windFrom}°` });
  const dA = f.apogeeM - prev.apogeeM;
  if (f.kind === 'rocket' || Math.abs(dA) > 5) {
    const sign = dA >= 0 ? '+' : '−';
    out.push({ tone: Math.abs(dA) < 1 ? 'info' : dA > 0 ? 'good' : 'warn', en: `Apogee ${alt(prev.apogeeM)} → ${alt(f.apogeeM)} (${sign}${alt(Math.abs(dA))}) compared with the last flight.`, th: `จุดสูงสุด ${alt(prev.apogeeM)} → ${alt(f.apogeeM)} (${sign}${alt(Math.abs(dA))}) เทียบกับเที่ยวที่แล้ว` });
  }
  if (changes.length) out.push({ tone: 'info', en: `What you changed: ${changes.map((c) => c.en).join(', ')}.`, th: `สิ่งที่คุณเปลี่ยน: ${changes.map((c) => c.th).join(', ')}` });
  else out.push({ tone: 'info', en: 'Same settings as the last flight, so the same flight: the simulation is not random. Change one thing and fly again.', th: 'ตั้งค่าเดิมกับเที่ยวที่แล้ว จึงได้ผลเดิมทุกอย่าง: การจำลองไม่ได้สุ่ม ลองเปลี่ยนทีละอย่างแล้วบินใหม่' });
  return out;
}

/* ---------- memory of the last flight ---------- */

const KEY = 'rs.flight.last';

export function digestOf(f: FlightFacts, parts: string): Digest {
  return { v: 1, kind: f.kind, apogeeM: f.apogeeM, outcome: f.outcome, windMs: f.windMs, railAngleDeg: f.railAngleDeg, railM: f.railM, massKg: f.massKg, twr: f.twr, parts, alerts: f.alerts.length, siteId: f.lanternSiteId, windFrom: f.windFrom };
}
export function readDigest(): Digest | null {
  try { const j = JSON.parse(safeKV.getItem(KEY) ?? 'null') as Digest | null; return j && j.v === 1 ? j : null; } catch { return null; }
}
export function writeDigest(d: Digest) { try { safeKV.setItem(KEY, JSON.stringify(d)); } catch { /* session only */ } }

/* ---------- forecast text (before the flight) ---------- */

export interface ForecastText { tone: Tone; head: Note; detail: Note[] }

/** One short paragraph for the launch screen: what the simulation says will happen with the current settings */
export function describeForecast(f: FlightFacts, goalM: number | null): ForecastText {
  const L = (tone: Tone, en: string, th: string): Note => ({ tone, en, th });
  if (f.kind === 'lantern') {
    const alerts = f.alerts.filter((a) => a !== 'fine');
    if (f.outcome === 'no-liftoff' || f.apogeeM < 5) return { tone: 'warn', head: L('warn', 'It will not rise with these settings.', 'ด้วยการตั้งค่านี้โคมจะไม่ลอยขึ้น'), detail: [L('info', 'Too much wind, or too little lift. Lower the wind or build a bigger lantern.', 'ลมแรงเกินไปหรือแรงยกน้อยเกินไป ลดลมหรือใช้โคมใหญ่ขึ้น')] };
    if (alerts.length) {
      const n = ALERT_NAME[alerts[0]] ?? ALERT_NAME.ctr;
      const when = f.firstAlertS !== null && f.liftoffS !== null && f.firstAlertS - f.liftoffS < 5 ? 'the moment it lifts off' : `T+${fixed((f.firstAlertS ?? 0) / 60, 1)} min`;
      return { tone: 'bad', head: L('bad', `Not safe: it enters ${n.en} (${when}).`, `ไม่ปลอดภัย: โคมจะเข้า${n.th} (${when === 'the moment it lifts off' ? 'ทันทีที่ลอยขึ้น' : when})`),
        detail: [L('info', 'Do not release here, or change the beach or the wind direction and check again.', 'อย่าปล่อยที่นี่ หรือเปลี่ยนชายหาดหรือทิศลมแล้วตรวจอีกครั้ง')] };
    }
    return { tone: 'good', head: L('good', `Clear: stays out of Samui airspace, ${alt(f.apogeeM)} up, lands ${km(f.rangeM)} away.`, `ปลอดภัย: ไม่เข้าน่านฟ้าสมุย ลอยสูง ${alt(f.apogeeM)} ตกห่างไป ${km(f.rangeM)}`),
      detail: [L('info', `About ${min(f.endS)} in the air. This is a simulation of these exact settings.`, `อยู่บนฟ้าราว ${min(f.endS)} นี่คือการจำลองจากการตั้งค่านี้พอดี`)] };
  }
  const detail: Note[] = [];
  let tone: Tone = 'info';
  let head: Note;
  if (f.outcome === 'no-liftoff') { head = L('bad', 'It will not leave the pad.', 'จรวดจะไม่ออกจากแท่น'); tone = 'bad'; }
  else if (f.tumbleAtS !== null) {
    head = L('warn', `Forecast: tumbles at T+${fixed(f.tumbleAtS)} s, apogee ${alt(f.apogeeM)}${goalM !== null ? ` (goal ${alt(goalM)})` : ''}.`, `พยากรณ์: ตีลังกาที่ T+${fixed(f.tumbleAtS)} วินาที จุดสูงสุด ${alt(f.apogeeM)}${goalM !== null ? ` (เป้า ${alt(goalM)})` : ''}`);
    tone = 'warn';
    if (f.railM > 0 && f.windMs > 0 && f.railExitMs !== null) detail.push(L('info', `${fixed(f.windMs, 1)} m/s of crosswind against ${fixed(f.railExitMs, 1)} m/s off the ramp tips it over.`, `ลมขวาง ${fixed(f.windMs, 1)} ม./วิ ขณะออกจากแรมป์ด้วย ${fixed(f.railExitMs, 1)} ม./วิ ทำให้พลิกคว่ำ`));
  } else if (goalM !== null && f.apogeeM >= goalM) { head = L('good', `Forecast: ${alt(f.apogeeM)} — past the ${alt(goalM)} goal.`, `พยากรณ์: ${alt(f.apogeeM)} เกินเป้า ${alt(goalM)}`); tone = 'good'; }
  else head = L('info', `Forecast: apogee ${alt(f.apogeeM)}${goalM !== null ? ` (goal ${alt(goalM)})` : ''}.`, `พยากรณ์: จุดสูงสุด ${alt(f.apogeeM)}${goalM !== null ? ` (เป้า ${alt(goalM)})` : ''}`);
  detail.push(L('info', 'Same physics as the flight: change a setting and the forecast changes.', 'ฟิสิกส์เดียวกับการบินจริง: เปลี่ยนค่าใดๆ แล้วพยากรณ์จะเปลี่ยนตาม'));
  return { tone, head, detail };
}

/**
 * Other launch settings, flown in the simulation, that would have done better. Only for guided rocket launches
 * (ramp or rail) — the sliders are the only thing this changes, and every number comes from a real headless flight.
 */
export function alternativesFor(input: ForecastInput, now: FlightFacts): Alternative[] {
  if (now.kind !== 'rocket' || input.site.rail <= 0) return [];
  const seen = new Set<string>([`${now.windMs}|${now.railAngleDeg}`]);
  const out: Alternative[] = [];
  const cands = [{ wind: 0, ang: 0 }, { wind: 0, ang: now.railAngleDeg }, { wind: now.windMs, ang: 0 }];
  for (const c of cands) {
    const key = `${c.wind}|${c.ang}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const r = forecastFlight({ ...input, site: { ...input.site, wind: c.wind, railAngleDeg: c.ang }, terrain: null, maxTimeS: 900 });
    const what = [c.wind !== now.windMs ? { en: `wind ${fixed(c.wind, 1)} m/s`, th: `ลม ${fixed(c.wind, 1)} ม./วิ` } : null, c.ang !== now.railAngleDeg ? { en: `ramp angle ${fixed(c.ang)}°`, th: `มุมแรมป์ ${fixed(c.ang)}°` } : null].filter((x): x is { en: string; th: string } => !!x);
    out.push({ wind: c.wind, railAngleDeg: c.ang, apogeeM: r.apogeeM, label: { tone: 'info', en: `Simulated alternative — ${what.map((w) => w.en).join(' + ')}: ${alt(r.apogeeM)}${r.tumbleAtS === null ? ', no tumble' : ''}.`, th: `ทดลองจำลองแล้ว — ${what.map((w) => w.th).join(' + ')}: ${alt(r.apogeeM)}${r.tumbleAtS === null ? ' ไม่ตีลังกา' : ''}` } });
  }
  return out.sort((a, b) => b.apogeeM - a.apogeeM);
}
