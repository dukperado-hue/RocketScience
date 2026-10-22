/**
 * Discoveries — small badges for things a player finds out by flying, not only for hitting the mission target.
 * A badge is earned from the facts of one flight (flightFacts.ts) and what is remembered of the last one (debrief.ts).
 * They live in the Logbook on the Missions tab and pop up on the flight debrief the first time they are earned.
 */
import type { FlightFacts } from './flightFacts';
import type { Digest } from './debrief';
import { safeKV } from '@/core/safeStorage';

export interface Badge { id: string; icon: string; title: string; titleTh: string; text: string; textTh: string }

export const BADGES: Badge[] = [
  { id: 'first-flight', icon: '🛫', title: 'First flight', titleTh: 'เที่ยวบินแรก', text: 'You lit something and watched what it did. That is how every space programme starts.', textTh: 'คุณจุดไฟแล้วดูว่ามันทำอะไร โครงการอวกาศทุกโครงการเริ่มแบบนี้' },
  { id: 'clean-lantern', icon: '🏮', title: 'Clean release', titleTh: 'ปล่อยโคมอย่างปลอดภัย', text: 'A lantern flew its whole flight without entering Samui airspace. Samui Tower noticed nothing — the best kind of report.', textTh: 'โคมบินตลอดเที่ยวโดยไม่เข้าน่านฟ้าสมุย หอบังคับการบินไม่รู้สึกอะไรเลย ซึ่งคือรายงานที่ดีที่สุด' },
  { id: 'learned-hard-way', icon: '⚠️', title: 'Learned it the hard way', titleTh: 'เรียนรู้จากของจริง', text: 'You found out where the approach path is by flying into it. Now you will check the radar first.', textTh: 'คุณรู้ว่าแนวร่อนอยู่ตรงไหนเพราะบินเข้าไปเอง คราวหน้าคุณจะดูเรดาร์ก่อน' },
  { id: 'calm-night', icon: '🌙', title: 'Calm night', titleTh: 'คืนลมสงบ', text: 'A lantern went above 1 km. Still air lets hot-air lanterns climb straight up.', textTh: 'โคมลอยสูงเกิน 1 กม. อากาศนิ่งทำให้โคมลมร้อนไต่ขึ้นตรงๆ' },
  { id: 'first-flip', icon: '🌀', title: 'Cartwheel', titleTh: 'ตีลังกา', text: 'A rocket tumbled. Every rocketeer has done it once — the debrief says why.', textTh: 'จรวดตีลังกา นักจรวดทุกคนเคยเจอ สรุปหลังบินบอกสาเหตุให้' },
  { id: 'dawn-launch', icon: '🌅', title: 'Dawn launch', titleTh: 'ปล่อยตอนรุ่งเช้า', text: 'A rocket reached 1 km in dead-calm air without tumbling. Wait for the calm morning.', textTh: 'จรวดขึ้นถึง 1 กม. ในอากาศนิ่งสนิทโดยไม่ตีลังกา จงรอเช้าวันลมสงบ' },
  { id: 'five-km', icon: '🚀', title: 'Five kilometres', titleTh: 'ห้ากิโลเมตร', text: 'A Bang Fai-class rocket passed 5 km. The village will remember it until the next festival.', textTh: 'จรวดระดับบั้งไฟขึ้นผ่าน 5 กม. ชาวบ้านจะจำไปจนถึงงานบุญปีหน้า' },
  { id: 'learning-curve', icon: '📈', title: 'Learning curve', titleTh: 'เส้นโค้งการเรียนรู้', text: 'Your flight went at least 50% higher than the last one. Changing one thing at a time works.', textTh: 'เที่ยวนี้สูงกว่าเที่ยวที่แล้วอย่างน้อย 50% การเปลี่ยนทีละอย่างได้ผล' },
  { id: 'same-same', icon: '🔁', title: 'Same settings, same flight', titleTh: 'ตั้งค่าเดิม ผลเดิม', text: 'You flew identical settings twice and got the identical flight. The simulation is not random — that is what makes experiments possible.', textTh: 'คุณบินด้วยการตั้งค่าเดิมสองครั้งและได้ผลเหมือนเดิมทุกอย่าง การจำลองไม่สุ่ม จึงทดลองเปรียบเทียบได้' },
  { id: 'soft-landing', icon: '🪂', title: 'Soft landing', titleTh: 'ลงจอดนุ่มนวล', text: 'A rocket came back under a parachute and touched down gently.', textTh: 'จรวดกลับลงมาด้วยร่มชูชีพและแตะพื้นอย่างนุ่มนวล' },
  { id: 'new-crater', icon: '🕳️', title: 'New crater', titleTh: 'หลุมใหม่', text: 'It came down hard enough to dig a crater. The ground always wins — and the crater stays at the site.', textTh: 'ตกแรงจนเกิดหลุม พื้นดินชนะเสมอ และหลุมจะอยู่ที่ลานปล่อยต่อไป' },
  { id: 'space', icon: '🌌', title: 'Passport stamped', titleTh: 'ประทับตราอวกาศ', text: 'You crossed the Kármán line, 100 km up.', textTh: 'คุณข้ามเส้นคาร์มานที่ความสูง 100 กม.' },
];
export const BADGE: Record<string, Badge> = Object.fromEntries(BADGES.map((b) => [b.id, b]));

export interface BadgeContext {
  facts: FlightFacts;
  prev: Digest | null;
  /** Same site, parts and settings as the previous flight */
  repeated: boolean;
}

/** Badge ids this flight earns (whether or not they were already earned) */
export function earnedBy(c: BadgeContext): string[] {
  const f = c.facts, out = ['first-flight'];
  const alerts = f.alerts.filter((a) => a !== 'fine');
  if (f.kind === 'lantern') {
    if (!alerts.length && (f.outcome === 'landed' || f.outcome === 'timeout') && f.apogeeM > 20) out.push('clean-lantern');
    if (alerts.length) out.push('learned-hard-way');
    if (f.apogeeM >= 1000) out.push('calm-night');
  } else {
    if (f.tumbleAtS !== null) out.push('first-flip');
    if (f.windMs <= 0.5 && f.apogeeM >= 1000 && f.tumbleAtS === null) out.push('dawn-launch');
    if (f.apogeeM >= 5000) out.push('five-km');
    if (f.outcome === 'landed' && f.chuteOpened && f.impactMs < 6) out.push('soft-landing');
    if (f.outcome === 'impact' && f.impactMs >= 30) out.push('new-crater');
    if (f.apogeeM >= 100_000) out.push('space');
  }
  if (c.prev && c.prev.apogeeM > 50 && f.apogeeM >= c.prev.apogeeM * 1.5 && f.apogeeM - c.prev.apogeeM >= 200) out.push('learning-curve');
  if (c.repeated) out.push('same-same');
  return out;
}

/* ---------- the Logbook (saved) ---------- */

export interface Logbook { v: 1; badges: Record<string, number>; flights: number; best: { rocket: number; lantern: number } }
const KEY = 'rs.logbook.v1';
const fresh = (): Logbook => ({ v: 1, badges: {}, flights: 0, best: { rocket: 0, lantern: 0 } });

export function loadLogbook(): Logbook {
  try {
    const j = JSON.parse(safeKV.getItem(KEY) ?? 'null') as Logbook | null;
    if (j && j.v === 1 && j.badges && typeof j.flights === 'number') return { ...fresh(), ...j, best: { ...fresh().best, ...(j.best ?? {}) } };
  } catch { /* fall through */ }
  return fresh();
}
function saveLogbook(l: Logbook) { try { safeKV.setItem(KEY, JSON.stringify(l)); } catch { /* session only */ } }

/** Record a flight: returns the badges earned for the first time */
export function recordFlight(c: BadgeContext, now = Date.now()): Badge[] {
  const lb = loadLogbook();
  lb.flights++;
  lb.best[c.facts.kind] = Math.max(lb.best[c.facts.kind], c.facts.apogeeM);
  const fresh: Badge[] = [];
  for (const id of earnedBy(c)) if (!lb.badges[id] && BADGE[id]) { lb.badges[id] = now; fresh.push(BADGE[id]); }
  saveLogbook(lb);
  return fresh;
}
