// js/data.js
// ข้อมูลหลักของเกม: Tier, จรวด 10 ชนิด, ภารกิจ, และชิ้นส่วนสำหรับโรงประกอบ (VAB)
// Phase 1: Tier 1–2 เล่นได้เต็มรูปแบบ / Tier 3–5 มีข้อมูลแต่ล็อกไว้ ("เร็ว ๆ นี้ — Phase 2")

const TIERS = {
  tier1: { key: "tier1", n: 1, nameTh: "วัตถุลอยระดับต่ำ", sub: "โคมลอย · พลุ", legalTier: "tier1_lantern", unlockScore: 0,    playable: true  },
  tier2: { key: "tier2", n: 2, nameTh: "จรวดพื้นบ้าน",     sub: "บั้งไฟ · ตะไล", legalTier: "tier2_bangfai", unlockScore: 800,  playable: true  },
  tier3: { key: "tier3", n: 3, nameTh: "จรวดสมัครเล่น",     sub: "Sugar Rocket · จรวดหยั่งอากาศ", legalTier: "tier3_sounding_rocket", unlockScore: 4000,  playable: false },
  tier4: { key: "tier4", n: 4, nameTh: "จรวดวิถีโค้ง",       sub: "จรวดวิถีโค้ง · ขีปนาวุธ", legalTier: "tier4_ballistic", unlockScore: 15000, playable: false },
  tier5: { key: "tier5", n: 5, nameTh: "ดาวเทียมวงโคจร",    sub: "ดาวเทียมดวงเล็ก · ดวงใหญ่", legalTier: "tier5_orbital", unlockScore: 45000, playable: false }
};

// thrust (N), mass (kg). ค่าปรับจูนเพื่อเกม ไม่ใช่ค่าจริงเป๊ะ
const ROCKETS = [
  {
    id: "khom_loy", tierKey: "tier1", nameTh: "โคมลอย", nameEn: "Sky Lantern", icon: "🏮",
    baseThrust: 45, dryMass: 0.35, baseFuel: 0.15, isp: 55, dragCoef: 0.09,
    spinStabilized: false, maxParts: 3, windSensitivity: 1.8,
    blurb: "ลูกโป่งอากาศร้อนกระดาษสา แรงยกต่ำ ลอยตามลมง่ายมาก เหมาะเริ่มต้นเรียนรู้เขตปลอดภัยสนามบิน"
  },
  {
    id: "phu", tierKey: "tier1", nameTh: "พลุ", nameEn: "Firework Shell", icon: "🎆",
    baseThrust: 220, dryMass: 0.5, baseFuel: 0.35, isp: 70, dragCoef: 0.05,
    spinStabilized: false, maxParts: 4, windSensitivity: 1.0,
    blurb: "ดินขับเผาไหม้เร็ว พุ่งขึ้นสูงในไม่กี่วินาที วิถีค่อนข้างตรงแต่ควบคุมความสูงยาก"
  },
  {
    id: "bangfai", tierKey: "tier2", nameTh: "บั้งไฟ", nameEn: "Bang Fai", icon: "🚀",
    baseThrust: 900, dryMass: 6, baseFuel: 9, isp: 95, dragCoef: 0.045,
    spinStabilized: false, maxParts: 6, windSensitivity: 1.3, thrustWobble: 0.28,
    blurb: "จรวดดินปืนอัดลำไม้ไผ่/ท่อ PVC แรงขับสูง เผาไหม้ยาว วิถีเดายาก—แรงขับไม่สม่ำเสมอ"
  },
  {
    id: "talai", tierKey: "tier2", nameTh: "ตะไล", nameEn: "Talai (spin rocket)", icon: "💫",
    baseThrust: 500, dryMass: 3, baseFuel: 5, isp: 90, dragCoef: 0.04,
    spinStabilized: true, maxParts: 6, windSensitivity: 1.3, thrustWobble: 0.12,
    blurb: "จรวดวงกลมหมุนรอบตัวเอง การหมุนช่วยรักษาทิศทาง (spin-stabilization) ต้านลมได้ดีกว่าบั้งไฟ"
  },
  // ---- Tier 3–5: ข้อมูลพร้อม แต่ Phase 1 ยังล็อก ----
  {
    id: "sugar_rocket", tierKey: "tier3", nameTh: "Sugar Rocket", nameEn: "Sugar Rocket", icon: "🍬",
    baseThrust: 1400, dryMass: 4, baseFuel: 6, isp: 120, dragCoef: 0.45,
    spinStabilized: false, maxParts: 7, windSensitivity: 0.8,
    blurb: "เชื้อเพลิงน้ำตาล+โพแทสเซียมไนเทรต ทำเองได้ ต้องออกแบบครีบและจุด CP/CG ให้ถูก"
  },
  {
    id: "sounding_rocket", tierKey: "tier3", nameTh: "จรวดหยั่งอากาศ", nameEn: "Sounding Rocket", icon: "📡",
    baseThrust: 6000, dryMass: 30, baseFuel: 45, isp: 210, dragCoef: 0.35,
    spinStabilized: true, maxParts: 8, windSensitivity: 0.6,
    blurb: "จรวดตรวจอากาศชั้นบรรยากาศ ต้องขออนุญาต CAAT และออก NOTAM ก่อนปล่อยทุกครั้ง"
  },
  {
    id: "ballistic_arc", tierKey: "tier4", nameTh: "จรวดวิถีโค้ง", nameEn: "Ballistic Rocket", icon: "🌈",
    baseThrust: 90000, dryMass: 900, baseFuel: 2600, isp: 250, dragCoef: 0.3,
    spinStabilized: true, maxParts: 10, windSensitivity: 0.3,
    blurb: "วิถีกระสุนโค้ง ออกนอกชั้นบรรยากาศแล้วตกกลับ ต้องประเมินจุดตกกระทบและปิดห้วงอากาศ"
  },
  {
    id: "missile", tierKey: "tier4", nameTh: "ขีปนาวุธ", nameEn: "Missile (multi-stage)", icon: "🛰️",
    baseThrust: 160000, dryMass: 1500, baseFuel: 6000, isp: 280, dragCoef: 0.28,
    spinStabilized: true, maxParts: 12, windSensitivity: 0.25, stages: 2,
    blurb: "จรวดหลายท่อน (staging) เพดานบินสูงมาก ต้องได้รับการรับรองความมั่นคงแห่งชาติ"
  },
  {
    id: "smallsat_launcher", tierKey: "tier5", nameTh: "ปล่อยดาวเทียมดวงเล็ก", nameEn: "Small-Sat Launcher", icon: "🛸",
    baseThrust: 300000, dryMass: 4000, baseFuel: 22000, isp: 300, dragCoef: 0.25,
    spinStabilized: true, maxParts: 14, windSensitivity: 0.2, stages: 2, orbital: true,
    blurb: "ส่ง CubeSat เข้าวงโคจรต่ำ ต้องมีรัฐรับรอง ประกันตาม Liability Convention และจดคลื่น ITU"
  },
  {
    id: "heavysat_launcher", tierKey: "tier5", nameTh: "ปล่อยดาวเทียมดวงใหญ่", nameEn: "Heavy-Sat Launcher", icon: "🌌",
    baseThrust: 900000, dryMass: 12000, baseFuel: 70000, isp: 330, dragCoef: 0.22,
    spinStabilized: true, maxParts: 16, windSensitivity: 0.15, stages: 3, orbital: true,
    blurb: "จรวดส่งดาวเทียมสื่อสารขนาดใหญ่เข้าวงโคจรค้างฟ้า ความรับผิดระหว่างประเทศสูงสุด"
  }
];

// ภารกิจ: Tier 1–2 เล่นได้ / Tier 3–5 ล็อก
const MISSIONS = [
  { id: "m1_festival",  tierKey: "tier1", titleTh: "งานวัดประจำปี",        targetAltitude: 60,   budget: 3000,   basePoints: 600,
    briefTh: "ปล่อยโคมลอยในงานวัด แต่สนามบินอยู่ไม่ไกล ต้องเช็กระยะให้ดีก่อนจุด", hazards: ["ลมแรงพัดเข้าหารันเวย์", "เขตปลอดภัย 9 กม."] },
  { id: "m2_newyear",   tierKey: "tier1", titleTh: "เคาต์ดาวน์ปีใหม่",     targetAltitude: 250,  budget: 5000,   basePoints: 900,
    briefTh: "จุดพลุฉลองปีใหม่ให้ขึ้นสูงพอโดยไม่รบกวนน่านฟ้า", hazards: ["ทัศนวิสัยกลางคืน", "เขตปลอดภัย 9 กม."] },
  { id: "m3_rocketfest",tierKey: "tier2", titleTh: "ประเพณีบุญบั้งไฟ",      targetAltitude: 1200, budget: 12000,  basePoints: 2200,
    briefTh: "แข่งบั้งไฟขึ้นสูง ต้องผ่านการอนุญาตจากจังหวัดและคณะทำงาน Sky Hazard", hazards: ["แรงขับไม่สม่ำเสมอ", "ต้องมีใบอนุญาตจังหวัด"] },
  { id: "m4_talai",     tierKey: "tier2", titleTh: "ชิงแชมป์ตะไล",          targetAltitude: 650,  budget: 9000,   basePoints: 1800,
    briefTh: "ตะไลต้องหมุนนิ่งและต้านลมให้ได้ วิถีตรงจะได้แต้มสูง", hazards: ["ลมขวาง", "ต้องมีใบอนุญาตจังหวัด"] },
  // ล็อก
  { id: "m5_sounding",  tierKey: "tier3", titleTh: "ตรวจชั้นบรรยากาศ",      targetAltitude: 25000, budget: 60000, basePoints: 9000, locked: true,
    briefTh: "Phase 2 — ต้องขออนุญาต CAAT + ออก NOTAM", hazards: [] },
  { id: "m6_ballistic", tierKey: "tier4", titleTh: "ทดสอบวิถีโค้ง",         targetAltitude: 120000, budget: 400000, basePoints: 30000, locked: true,
    briefTh: "Phase 2 — เขตห้วงอากาศหวงห้าม + ประเมินจุดตก", hazards: [] },
  { id: "m7_orbit",     tierKey: "tier5", titleTh: "ส่งดาวเทียมเข้าวงโคจร", targetAltitude: 300000, targetOrbit: 7800, budget: 2000000, basePoints: 90000, locked: true,
    briefTh: "Phase 2 — Outer Space Treaty + Liability Convention", hazards: [] }
];

// ชิ้นส่วนสำหรับ VAB — Phase 1 โฟกัส Tier 1–2 (engine/propellant/fin/nosecone/payload)
const PARTS = [
  { id: "burner_s",   type: "engine",    nameTh: "หัวเผาโคมเล็ก",       icon: "🔥", mass: 0.1,  thrust: 25,   tierMin: 1 },
  { id: "burner_l",   type: "engine",    nameTh: "หัวเผาโคมใหญ่",       icon: "🔥", mass: 0.2,  thrust: 55,   tierMin: 1 },
  { id: "charge_s",   type: "engine",    nameTh: "ดินขับพลุเล็ก",       icon: "✨", mass: 0.15, thrust: 120,  tierMin: 1 },
  { id: "charge_l",   type: "engine",    nameTh: "ดินขับพลุใหญ่",       icon: "✨", mass: 0.3,  thrust: 260,  tierMin: 1 },
  { id: "motor_bamboo", type: "engine",  nameTh: "มอเตอร์ลำไม้ไผ่",     icon: "🧨", mass: 2.5,  thrust: 700,  tierMin: 2 },
  { id: "motor_pvc",  type: "engine",    nameTh: "มอเตอร์ท่อ PVC",      icon: "🧨", mass: 3.5,  thrust: 1100, tierMin: 2 },
  { id: "motor_ring", type: "engine",    nameTh: "มอเตอร์วงตะไล",       icon: "💫", mass: 2.0,  thrust: 620,  tierMin: 2, addsSpin: true },

  { id: "prop_s",     type: "propellant", nameTh: "ดินขับ 1 หน่วย",     icon: "🟫", mass: 1.0,  fuel: 1.0,   burn: 2.6, tierMin: 1 },
  { id: "prop_m",     type: "propellant", nameTh: "ดินขับ 3 หน่วย",     icon: "🟫", mass: 3.0,  fuel: 3.0,   burn: 7.0, tierMin: 1 },
  { id: "prop_l",     type: "propellant", nameTh: "ดินขับ 6 หน่วย",     icon: "🟫", mass: 6.0,  fuel: 6.0,   burn: 8.0, tierMin: 2 },

  { id: "fin_light",  type: "fin",       nameTh: "ครีบเบา",             icon: "🔻", mass: 0.15, dragMod: 0.004,  stability: 0.15, tierMin: 1 },
  { id: "fin_heavy",  type: "fin",       nameTh: "ครีบใหญ่ 4 แฉก",      icon: "🔻", mass: 0.6,  dragMod: 0.010,  stability: 0.35, tierMin: 2 },
  { id: "nosecone",   type: "nosecone",  nameTh: "จมูกจรวดเพรียวลม",     icon: "🔺", mass: 0.4,  dragMod: -0.015, tierMin: 1 },
  { id: "payload_cam",type: "payload",   nameTh: "กล้องบันทึกภาพ",       icon: "📷", mass: 0.5,  scoreBonus: 200, tierMin: 1 },
  { id: "payload_sensor", type: "payload", nameTh: "เซนเซอร์วัดอากาศ",   icon: "🌡️", mass: 0.8,  scoreBonus: 400, tierMin: 2 }
];

window.TIERS = TIERS;
window.ROCKETS = ROCKETS;
window.MISSIONS = MISSIONS;
window.PARTS = PARTS;
