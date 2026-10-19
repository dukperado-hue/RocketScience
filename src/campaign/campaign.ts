/**
 * The Zombie Space Program campaign — DATA ONLY (no logic, no DOM).
 *
 *   Mission 1    Full Moon Festival of the Dead   lantern → Samui airspace        → Tier 1 + Yasothon
 *   Mission 2    Viral Ballistics                 Bang Fai / chair to 5 km        → Tier 2
 *   Mission 2.5  Space Passport                   liquid engine past 100 km       → Tier 3
 *   Mission 3    Orbital Hijack                   zombie in orbit + spacewalk     → Tier 4, campaign complete
 *
 * Every mission was flown in the simulator with only the parts unlocked before it
 * (campaign.test.ts keeps it that way). MissionManager evaluates the checks; LaunchPhase
 * only reports what happened.
 */
import { CATALOG } from '@/phases/assembly/model/catalog';
import type { CrewId } from '@/phases/launch/capcom';

export type MissionId = 'm1-lantern' | 'm2-ballistics' | 'm2b-karman' | 'm3-orbit';
export type RangeId = 'yasothon' | 'phangan';
export type Tier = 0 | 1 | 2 | 3 | 4;

/** Each check is data; MissionManager evaluates it against a FlightReport */
export type ObjectiveCheck =
  | { kind: 'max-tier'; tier: Tier }                              // every part on the build is at most this tier
  | { kind: 'uses-any'; parts: string[] }                         // at least one of these parts is on the build
  | { kind: 'launch-island'; island: 'phangan' | 'samui' }        // lantern site (law/samui.ts)
  | { kind: 'launch-range'; range: RangeId }                      // where the pad is
  | { kind: 'airspace'; zones: ('ctr' | 'app-17' | 'app-35')[] }  // any one of these triggered
  | { kind: 'apogee'; m: number }
  | { kind: 'karman' }
  | { kind: 'orbit'; peM: number }
  | { kind: 'zombie-aboard' }                                     // a zombie rode along, in one piece
  | { kind: 'eva' };

export interface Objective { id: string; text: string; textTh: string; check: ObjectiveCheck }

export interface StoryEntry {
  id: string;
  title: string; titleTh: string;
  /** The log entry, in the voice of `crew` */
  text: string; textTh: string;
  crew: CrewId;
  image?: string;
}

export interface Mission {
  id: MissionId;
  order: number;
  /** "1", "2", "2.5", "3" — what the timeline prints */
  label: string;
  title: string; titleTh: string;
  codename: string;
  brief: string; briefTh: string;
  requires: MissionId[];
  /** All must be met in ONE flight */
  objectives: Objective[];
  rewards: { tier: Tier; parts: string[]; ranges?: RangeId[]; text: string; textTh: string };
  story: StoryEntry;
  hint?: string; hintTh?: string;
}

/** What LaunchPhase reports. Read-only, built from the Flight and the airspace monitor; "ever this flight" semantics */
export interface FlightReport {
  partIds: string[];
  maxTier: number;
  range: RangeId;
  lanternSite?: string;
  island?: 'phangan' | 'samui';
  apogeeM: number;
  karman: boolean;
  orbit: { stable: boolean; peM: number } | null;
  zombieAboard: boolean;
  eva: boolean;
  /** Airspace alert ids fired this flight: 'ctr', 'app-17', 'fine', … */
  airspace: string[];
}

/** localStorage 'rs.campaign.v1' */
export interface CampaignSave {
  v: 1;
  mode: 'campaign' | 'sandbox';
  completed: Partial<Record<MissionId, { at: number; flightT: number }>>;
  story: { id: string; at: number }[];
}

/** Part ids of exactly one tier, straight from the catalogue (so new parts join their tier automatically) */
export const partsOfTier = (t: Tier) => CATALOG.filter((p) => p.tier === t).map((p) => p.id);

/** Ranges and parts you start the campaign with */
export const START = { tier: 0 as Tier, ranges: ['phangan'] as RangeId[] };

/** Shown at the top of the Story log before anything else */
export const PROLOGUE: StoryEntry = {
  id: 'day-0', crew: 'lee', image: 'assets/story/prologue_fireworks.jpg',
  title: 'Day 0 — Hangar 4', titleTh: 'วันที่ 0 — โรงเก็บที่ 4',
  text: 'The zombies have taken Koh Phangan — Mission Control included. They wear our headsets backwards and answer the radio in grunts. The crew is locked in Hangar 4; I keep this log in secret, under the parachute pile. The zombies want to go to space. We are, apparently, helping. First step, by order of Zombie Control: anything that floats.',
  textTh: 'ซอมบี้ยึดเกาะพะงันไปแล้ว รวมถึงศูนย์ควบคุมภารกิจด้วย พวกมันใส่หูฟังกลับด้านและตอบวิทยุด้วยเสียงคราง ทีมงานถูกขังอยู่ในโรงเก็บที่ 4 ฉันแอบเขียนบันทึกนี้อยู่ใต้กองร่มชูชีพ ซอมบี้อยากไปอวกาศ และดูเหมือนว่าเรากำลังช่วยมันอยู่ ก้าวแรกตามคำสั่งศูนย์ควบคุมซอมบี้: อะไรก็ได้ที่ลอยได้',
};

export const MISSIONS: Mission[] = [
  {
    id: 'm1-lantern', order: 1, label: '1', codename: 'PAPER MOON',
    title: 'Full Moon Festival of the Dead', titleTh: 'เทศกาลพระจันทร์เต็มดวงแห่งความตาย',
    brief: 'Launch a sky lantern from Koh Phangan and drift it into Samui airspace. On purpose. For science. Then read the report.',
    briefTh: 'ปล่อยโคมลอยจากเกาะพะงัน แล้วปล่อยให้ลมพาเข้าน่านฟ้าสมุย โดยตั้งใจ เพื่อวิทยาศาสตร์ แล้วค่อยอ่านรายงาน',
    requires: [],
    objectives: [
      { id: 'tier0', text: 'Fly a Tier 0 build (paper, bamboo, fire — nothing else)', textTh: 'ใช้ชิ้นส่วน Tier 0 เท่านั้น (กระดาษ ไม้ไผ่ ไฟ)', check: { kind: 'max-tier', tier: 0 } },
      { id: 'phangan', text: 'Launch from Koh Phangan (Haad Rin or Thong Sala)', textTh: 'ปล่อยจากเกาะพะงัน (หาดริ้นหรือท้องศาลา)', check: { kind: 'launch-island', island: 'phangan' } },
      { id: 'violate', text: 'Trigger a Samui airspace alert (control zone or an approach path)', textTh: 'ทำให้เกิดการแจ้งเตือนน่านฟ้าสมุย (เขตควบคุมหรือแนวร่อนลง)', check: { kind: 'airspace', zones: ['ctr', 'app-17', 'app-35'] } },
    ],
    hint: 'Khom loi blueprint · Haad Rin · wind from 015° · leave the “pretend permission” box empty · 10× warp.',
    hintTh: 'แบบสำเร็จรูป Khom loi · หาดริ้น · ลมจาก 015° · ไม่ต้องติ๊กช่อง “สมมติว่าขออนุญาตแล้ว” · เร่งเวลา 10×',
    rewards: { tier: 1, parts: partsOfTier(1), ranges: ['yasothon'], text: 'Tier 1: gunpowder, Bang Fai tubes, the wooden chair · Yasothon range', textTh: 'Tier 1: ดินปืน บั้งไฟ เก้าอี้ไม้ · ลานปล่อยยโสธร' },
    story: {
      id: 'm1', crew: 'tortoise', image: 'assets/capcom/capcom_tortoise_clerk_full.png',
      title: 'Incident report, Haad Rin', titleTh: 'รายงานเหตุการณ์ หาดริ้น',
      text: 'Full Moon night. One paper lantern entered the Samui control zone without a flight plan. Samui Tower was not amused. I have written it all up. There is a form. There is always a form. Our colleagues suggest that rockets are "a separate matter", so we are now building rockets — in Yasothon, far from any tower that can see us.',
      textTh: 'คืนพระจันทร์เต็มดวง โคมกระดาษหนึ่งลูกหลุดเข้าเขตควบคุมสนามบินสมุยโดยไม่มีแผนการบิน หอบังคับการบินไม่ขำด้วย ข้าพเจ้าบันทึกเหตุการณ์ไว้ครบแล้ว มีแบบฟอร์มเสมอ เพื่อนร่วมงานแนะนำว่าจรวดเป็น "อีกเรื่องหนึ่ง" เราจึงหันมาสร้างจรวด ที่ยโสธร ไกลจากหอบังคับการบินทุกแห่งที่มองเห็นเราได้',
    },
  },
  {
    id: 'm2-ballistics', order: 2, label: '2', codename: 'BAMBOO FEVER',
    title: 'Viral Ballistics', titleTh: 'ขีปนวิถีไวรัล',
    brief: 'Take a Bang Fai (or the chair, if you are brave and wrong) to 5 km from the Yasothon range. Bamboo, gunpowder, no excuses.',
    briefTh: 'ส่งบั้งไฟ (หรือเก้าอี้ ถ้าคุณกล้าและคิดผิด) ขึ้นไปให้ถึง 5 กม. จากลานปล่อยยโสธร ไม้ไผ่ ดินปืน ไม่มีข้ออ้าง',
    requires: ['m1-lantern'],
    objectives: [
      { id: 'tier1', text: 'Tier 1 parts only', textTh: 'ใช้ชิ้นส่วนไม่เกิน Tier 1', check: { kind: 'max-tier', tier: 1 } },
      { id: 'bamboo', text: 'Fly a Bang Fai tube or the wooden chair', textTh: 'ใช้บั้งไฟหรือเก้าอี้ไม้', check: { kind: 'uses-any', parts: ['bang-fai', 'wooden-chair'] } },
      { id: 'yasothon', text: 'Launch from Yasothon', textTh: 'ปล่อยจากยโสธร', check: { kind: 'launch-range', range: 'yasothon' } },
      { id: '5km', text: 'Reach 5 km', textTh: 'ขึ้นให้ถึง 5 กม.', check: { kind: 'apogee', m: 5000 } },
    ],
    hint: 'A Bang Fai turns into the wind (weathercocking). Twin-tail blueprint, wind 0, ramp angle 0° — wait for the one calm morning of the year.',
    hintTh: 'บั้งไฟจะหันหัวเข้าหาลม (weathercocking) ใช้แบบหางคู่ ลม 0 มุมราง 0° แล้วรอเช้าที่ลมสงบที่สุดของปี',
    rewards: { tier: 2, parts: partsOfTier(2), text: 'Tier 2: LV-45 liquid engine, metal tanks, decouplers, bigger fins and chutes', textTh: 'Tier 2: เครื่องยนต์เหลว LV-45 ถังโลหะ ตัวแยกท่อน ครีบและร่มที่ใหญ่ขึ้น' },
    story: {
      id: 'm2', crew: 'otter', image: 'assets/story/bangfai_parade.jpg',
      title: 'The video went viral', titleTh: 'คลิปไวรัล',
      text: 'Five kilometres. The bamboo held. The launch video went viral; so, regrettably, did the zombie in the front row. Lesson learned: a Bang Fai does not fight the wind, it follows it, so we flew on the one calm morning of the year. Then Zombie Control lost interest in rockets and handed us the microphone back, only slightly chewed. Next: metal tanks and liquid fuel, which the village headman says are "absolutely not a festival item".',
      textTh: 'ห้ากิโลเมตร ไม้ไผ่ไม่แตก คลิปปล่อยบั้งไฟกลายเป็นไวรัล และน่าเสียดายที่ซอมบี้แถวหน้าก็ "ไวรัล" ไปด้วย บทเรียน: บั้งไฟไม่สู้ลม มันตามลม เราจึงปล่อยในเช้าเดียวของปีที่ลมสงบ จากนั้นศูนย์ควบคุมซอมบี้ก็เบื่อจรวด แล้วคืนไมโครโฟนให้เรา มีรอยกัดนิดหน่อย ต่อไป: ถังโลหะกับเชื้อเพลิงเหลว ซึ่งผู้ใหญ่บ้านบอกว่า "ไม่ใช่ของงานบุญแน่นอน"',
    },
  },
  {
    id: 'm2b-karman', order: 3, label: '2.5', codename: 'SPACE PASSPORT',
    title: 'Space Passport', titleTh: 'พาสปอร์ตอวกาศ',
    brief: 'Cross the Kármán line — 100 km, where the air gives up and the paperwork begins — on liquid-fuel engines.',
    briefTh: 'ข้ามเส้นคาร์มาน ที่ 100 กม. ซึ่งอากาศยอมแพ้และงานเอกสารเริ่มต้น ด้วยเครื่องยนต์เชื้อเพลิงเหลว',
    requires: ['m2-ballistics'],
    objectives: [
      { id: 'liquid', text: 'Fly a liquid-fuel engine (LV-45, pressure-fed or turbopump)', textTh: 'ใช้เครื่องยนต์เชื้อเพลิงเหลว (LV-45 ป้อนด้วยแรงดัน หรือเทอร์โบปั๊ม)', check: { kind: 'uses-any', parts: ['engine-lv45', 'engine-pf', 'engine-tp'] } },
      { id: 'karman', text: 'Cross the Kármán line (100 km)', textTh: 'ข้ามเส้นคาร์มาน (100 กม.)', check: { kind: 'karman' } },
    ],
    hint: 'Sounding-rocket blueprint: big nose, two tanks, LV-45, fins. SAS starts ON with this blueprint — leave it on (T switches it off and on) and go straight up.',
    hintTh: 'แบบสำเร็จรูปจรวดตรวจอากาศ: หัวใหญ่ ถังสองใบ LV-45 ครีบ SAS เปิดอยู่แล้วตั้งแต่เริ่ม ปล่อยให้เปิดไว้ (กด T = สลับเปิด/ปิด) แล้วขึ้นตรง ๆ',
    rewards: { tier: 3, parts: partsOfTier(3), text: 'Tier 3: vacuum engine, XL tanks, boosters, Mk1 pod, ZomSat-1, heat shield', textTh: 'Tier 3: เครื่องยนต์สุญญากาศ ถัง XL บูสเตอร์ ห้องโดยสาร Mk1 ดาวเทียมซอมบี้ โล่กันความร้อน' },
    story: {
      id: 'm2b', crew: 'owl', image: 'assets/capcom/capcom_owl_professor_full.png',
      title: 'Above the air', titleTh: 'เหนืออากาศ',
      text: 'Kármán line crossed. Technically we are astronauts; officially we are "a liquid-fuel incident". Above 100 km there is no air to steer with — only Newton, who does not take bribes. The sky up there is black at noon. Tortoise Clerk has asked for the form for leaving the atmosphere. There isn’t one. He is writing one.',
      textTh: 'ข้ามเส้นคาร์มานแล้ว ในทางเทคนิคเราคือนักบินอวกาศ ในทางเอกสารเราคือ "เหตุการณ์เกี่ยวกับเชื้อเพลิงเหลว" เหนือ 100 กม. ไม่มีอากาศให้บังคับเลี้ยว มีแต่นิวตัน ซึ่งไม่รับสินบน ท้องฟ้าข้างบนนั้นดำสนิทแม้ตอนเที่ยงวัน เสมียนเต่าขอแบบฟอร์มสำหรับ "ออกนอกชั้นบรรยากาศ" ซึ่งไม่มีอยู่จริง เขากำลังร่างขึ้นมาเอง',
    },
  },
  {
    id: 'm3-orbit', order: 4, label: '3', codename: 'ORBITAL HIJACK',
    title: 'Orbital Hijack', titleTh: 'ปล้นวงโคจร',
    brief: 'Put a zombie in a stable orbit (periapsis above 140 km) — then open the hatch and let it go for a walk.',
    briefTh: 'ส่งซอมบี้เข้าวงโคจรที่เสถียร (จุดใกล้โลกสูงกว่า 140 กม.) แล้วเปิดประตูให้มันออกไปเดินเล่น',
    requires: ['m2b-karman'],
    objectives: [
      { id: 'orbit', text: 'Stable orbit: periapsis above 140 km', textTh: 'วงโคจรเสถียร: จุดใกล้โลกสูงกว่า 140 กม.', check: { kind: 'orbit', peM: 140_000 } },
      { id: 'zombie', text: 'A zombie aboard, in one piece', textTh: 'มีซอมบี้อยู่บนยาน และยังครบชิ้น', check: { kind: 'zombie-aboard' } },
      { id: 'eva', text: 'Spacewalk: press E in orbit, engines off', textTh: 'เดินอวกาศ: กด E ในวงโคจร โดยดับเครื่องยนต์ก่อน', check: { kind: 'eva' } },
    ],
    hint: 'Tier 3 engines are weak at the top: climb steeply, let Ap reach ~200 km, coast to it, then Circularise with the Maneuver Node. The Phaya Naga Hijacker blueprint flies this with Assist: Auto.',
    hintTh: 'เครื่องยนต์ Tier 3 แรงขับน้อยตอนท่อนบน: ไต่ชันไว้ ให้ Ap ถึงราว 200 กม. ไหลไปถึง Ap แล้วกด Circularise ในเครื่องมือ Maneuver Node แบบสำเร็จรูป Phaya Naga Hijacker บินได้ด้วย Assist: Auto',
    rewards: { tier: 4, parts: partsOfTier(4), text: 'Tier 4: modern engines, the space telescope · campaign complete', textTh: 'Tier 4: เครื่องยนต์รุ่นใหม่ กล้องโทรทรรศน์อวกาศ · จบแคมเปญ' },
    story: {
      id: 'm3', crew: 'capybara', image: 'assets/story/crew_lineup_hangar4.jpg',
      title: 'Our buddy went outside', titleTh: 'เพื่อนเราออกไปข้างนอก',
      text: 'Our buddy is in orbit. He went outside. He spun around the fire extinguisher for forty minutes and looked happy, or at least less dead. Samui Tower called. Then the United Nations called. Tortoise Clerk answered both with the same stamp. Lee says the campaign is complete. I say he still owes us a postcard.',
      textTh: 'เพื่อนเราอยู่ในวงโคจรแล้ว เขาออกไปข้างนอก หมุนติ้วรอบถังดับเพลิงอยู่สี่สิบนาที และดูมีความสุข หรืออย่างน้อยก็ดูตายน้อยลง หอบังคับการบินสมุยโทรมา แล้วสหประชาชาติก็โทรมา เสมียนเต่ารับสายทั้งสองด้วยตราประทับอันเดียวกัน ลีบอกว่าแคมเปญจบแล้ว ส่วนเรายังคิดว่าเขาติดค้างโปสการ์ดเราอยู่หนึ่งใบ',
    },
  },
];

export const MISSION: Record<MissionId, Mission> = Object.fromEntries(MISSIONS.map((m) => [m.id, m])) as Record<MissionId, Mission>;
