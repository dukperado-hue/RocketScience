// js/data.js
// ข้อมูลหลักของเกม: Tier, จรวด 10 ชนิด, ภารกิจ, ชิ้นส่วน VAB
// Phase 2: Tier 1–5 เล่นได้ทั้งหมด
//   Tier 1–2 : engine + propellant + fin/nosecone/payload (โมเดลท่อนเดียว)
//   Tier 3–5 : จรวดมาพร้อม "ท่อน" (stages) สำเร็จ — ผู้เล่นเลือก payload + อัปเกรด
//              แล้วดู Δv budget (Tsiolkovsky) เทียบ Δv ที่ต้องใช้

const TIERS = {
  tier1: { key: "tier1", n: 1, nameTh: "วัตถุลอยระดับต่ำ", sub: "โคมลอย · พลุ", legalTier: "tier1_lantern", unlockScore: 0,    playable: true, staged: false },
  tier2: { key: "tier2", n: 2, nameTh: "จรวดพื้นบ้าน",     sub: "บั้งไฟ · ตะไล", legalTier: "tier2_bangfai", unlockScore: 800,  playable: true, staged: false },
  tier3: { key: "tier3", n: 3, nameTh: "จรวดสมัครเล่น",     sub: "Sugar Rocket · จรวดหยั่งอากาศ", legalTier: "tier3_sounding_rocket", unlockScore: 4000,  playable: true, staged: true },
  tier4: { key: "tier4", n: 4, nameTh: "จรวดวิถีโค้ง",       sub: "จรวดวิถีโค้ง · ขีปนาวุธ", legalTier: "tier4_ballistic", unlockScore: 16000, playable: true, staged: true },
  tier5: { key: "tier5", n: 5, nameTh: "ดาวเทียมวงโคจร",    sub: "ดาวเทียมดวงเล็ก · ดวงใหญ่", legalTier: "tier5_orbital", unlockScore: 55000, playable: true, staged: true }
};

// thrust (N), mass (kg), isp (s). ค่าปรับจูนเพื่อเกม
const ROCKETS = [
  // ---------- Tier 1 ----------
  {
    id: "khom_loy", tierKey: "tier1", nameTh: "โคมลอย", nameEn: "Sky Lantern", icon: "🏮",
    baseThrust: 45, dryMass: 0.35, baseFuel: 0.15, isp: 55, dragCoef: 0.09,
    spinStabilized: false, maxParts: 3, windSensitivity: 1.8,
    lantern: true,   // โครงกระดาษสา — มีขีดจำกัดความร้อน (thermal burn-up)
    blurb: "ลูกโป่งอากาศร้อนกระดาษสา แรงยกต่ำ ลอยตามลมง่ายมาก เหมาะเริ่มต้นเรียนรู้เขตปลอดภัยสนามบิน"
  },
  {
    id: "phu", tierKey: "tier1", nameTh: "พลุ", nameEn: "Firework Shell", icon: "🎆",
    baseThrust: 220, dryMass: 0.5, baseFuel: 0.35, isp: 70, dragCoef: 0.05,
    spinStabilized: false, maxParts: 4, windSensitivity: 1.0,
    blurb: "ดินขับเผาไหม้เร็ว พุ่งขึ้นสูงในไม่กี่วินาที วิถีค่อนข้างตรงแต่ควบคุมความสูงยาก"
  },
  // ---------- Tier 2 ----------
  {
    id: "bangfai", tierKey: "tier2", nameTh: "บั้งไฟ", nameEn: "Bang Fai", icon: "🚀",
    baseThrust: 900, dryMass: 6, baseFuel: 9, isp: 95, dragCoef: 0.045,
    spinStabilized: false, maxParts: 6, windSensitivity: 1.3, thrustWobble: 0.28,
    blackPowder: true,   // ดินปืนดำอัดลำ — ปลอกมีพิกัดรับความดัน + ดินมากทำ CG เพี้ยน
    blurb: "จรวดดินปืนอัดลำไม้ไผ่/ท่อ PVC แรงขับสูง เผาไหม้ยาว วิถีเดายาก—แรงขับไม่สม่ำเสมอ"
  },
  {
    id: "talai", tierKey: "tier2", nameTh: "ตะไล", nameEn: "Talai (spin rocket)", icon: "💫",
    baseThrust: 500, dryMass: 3, baseFuel: 5, isp: 90, dragCoef: 0.04,
    spinStabilized: true, maxParts: 6, windSensitivity: 1.3, thrustWobble: 0.12,
    blurb: "จรวดวงกลมหมุนรอบตัวเอง การหมุนช่วยรักษาทิศทาง (spin-stabilization) ต้านลมได้ดีกว่าบั้งไฟ"
  },

  // ---------- Tier 3 : จรวดสมัครเล่น (ท่อนเดียว ยิงตรงขึ้น) ----------
  {
    id: "sugar_rocket", tierKey: "tier3", nameTh: "Sugar Rocket", nameEn: "Sugar Rocket", icon: "🍬",
    dragCoef: 0.02, launchAngleDeg: 0, defaultPayload: 0.4,
    stages: [{ thrust: 1900, isp: 130, propMass: 7, dryMass: 3.4, propType: "solid" }],
    blurb: "เชื้อเพลิงน้ำตาล+โพแทสเซียมไนเทรต ทำเองได้ ต้องออกแบบครีบและจุด CP/CG ให้ดี",
    payloads: ["pl_altimeter", "pl_gopro"], upgrades: ["up_prop_s", "up_fins_hi"]
  },
  {
    id: "sounding_rocket", tierKey: "tier3", nameTh: "จรวดหยั่งอากาศ", nameEn: "Sounding Rocket", icon: "📡",
    dragCoef: 0.009, launchAngleDeg: 0, defaultPayload: 5,
    stages: [{ thrust: 5200, isp: 222, propMass: 46, dryMass: 20, propType: "solid" }],
    blurb: "จรวดตรวจอากาศชั้นบรรยากาศ ต้องขออนุญาต CAAT + ออก NOTAM + มีเจ้าหน้าที่ความปลอดภัยทุกครั้ง",
    payloads: ["pl_weather", "pl_uv_spec"], upgrades: ["up_prop_s", "up_light_nose"]
  },

  // ---------- Tier 4 : วิถีโค้ง sub-orbital (2 ท่อน + มุมเอียง) ----------
  {
    id: "ballistic_arc", tierKey: "tier4", nameTh: "จรวดวิถีโค้ง", nameEn: "Ballistic Rocket", icon: "🌈",
    dragCoef: 0.02, launchAngleDeg: 24, defaultPayload: 120,
    stages: [
      { thrust: 50000, isp: 236, propMass: 1500, dryMass: 460, propType: "solid" },
      { thrust: 16000, isp: 258, propMass: 380, dryMass: 150, propType: "liquid" }
    ],
    blurb: "วิถีกระสุนโค้ง ออกนอกชั้นบรรยากาศแล้วตกกลับ ต้องประเมิน ellipse จุดตกและปิดห้วงอากาศ",
    payloads: ["pl_test_mass", "pl_reentry_cap"], upgrades: ["up_booster", "up_hi_isp"]
  },
  {
    id: "missile", tierKey: "tier4", nameTh: "ขีปนาวุธ", nameEn: "Missile (multi-stage)", icon: "🛰️",
    dragCoef: 0.018, launchAngleDeg: 24, defaultPayload: 300,
    stages: [
      { thrust: 120000, isp: 252, propMass: 3200, dryMass: 1150, propType: "solid" },
      { thrust: 36000, isp: 288, propMass: 900, dryMass: 320, propType: "liquid" }
    ],
    blurb: "จรวดหลายท่อน เพดานบินสูงมาก ต้องได้รับการรับรองความมั่นคงแห่งชาติ (สมช.) ก่อนปล่อย",
    payloads: ["pl_test_mass", "pl_reentry_cap"], upgrades: ["up_booster", "up_hi_isp"]
  },

  // ---------- Tier 5 : ปล่อยดาวเทียม (orbital) ----------
  {
    id: "smallsat_launcher", tierKey: "tier5", nameTh: "ปล่อยดาวเทียมดวงเล็ก", nameEn: "Small-Sat Launcher", icon: "🛸",
    dragCoef: 0.02, orbital: true, defaultPayload: 150,
    stages: [
      { thrust: 320000, isp: 285, propMass: 20000, dryMass: 1900, propType: "liquid" },
      { thrust: 42000, isp: 342, propMass: 3800, dryMass: 470, propType: "liquid" }
    ],
    blurb: "ส่ง CubeSat เข้าวงโคจรต่ำ ต้องมีรัฐรับรอง (OST 1967) ประกัน (Liability Convention 1972) และจดคลื่น ITU",
    payloads: ["pl_cubesat", "pl_cubesat_cluster", "pl_comsat_small"], upgrades: ["up_booster", "up_hi_isp", "up_light_nose"]
  },
  {
    id: "heavysat_launcher", tierKey: "tier5", nameTh: "ปล่อยดาวเทียมดวงใหญ่", nameEn: "Heavy-Sat Launcher", icon: "🌌",
    dragCoef: 0.028, orbital: true, defaultPayload: 1200,
    stages: [
      { thrust: 1100000, isp: 291, propMass: 70000, dryMass: 5400, propType: "liquid" },
      { thrust: 200000, isp: 331, propMass: 15000, dryMass: 1550, propType: "liquid" },
      { thrust: 32000, isp: 346, propMass: 2800, dryMass: 370, propType: "liquid" }
    ],
    blurb: "จรวดส่งดาวเทียมสื่อสารขนาดใหญ่เข้าวงโคจรสูง ความรับผิดระหว่างประเทศสูงสุด",
    payloads: ["pl_comsat_small", "pl_comsat_geo"], upgrades: ["up_booster", "up_hi_isp", "up_light_nose"]
  }
];

const MISSIONS = [
  { id: "m1_festival",  tierKey: "tier1", titleTh: "งานวัดประจำปี",        targetAltitude: 60,   budget: 3000,   basePoints: 600,
    briefTh: "ปล่อยโคมลอยในงานวัด แต่สนามบินอยู่ไม่ไกล ต้องเช็กระยะให้ดีก่อนจุด", hazards: ["ลมแรงพัดเข้าหารันเวย์", "เขตปลอดภัย 9 กม."] },
  { id: "m2_newyear",   tierKey: "tier1", titleTh: "เคาต์ดาวน์ปีใหม่",     targetAltitude: 250,  budget: 5000,   basePoints: 900,
    briefTh: "จุดพลุฉลองปีใหม่ให้ขึ้นสูงพอโดยไม่รบกวนน่านฟ้า", hazards: ["ทัศนวิสัยกลางคืน", "เขตปลอดภัย 9 กม."] },
  { id: "m3_rocketfest",tierKey: "tier2", titleTh: "ประเพณีบุญบั้งไฟ",      targetAltitude: 1200, budget: 12000,  basePoints: 2200,
    briefTh: "แข่งบั้งไฟขึ้นสูง ต้องผ่านการอนุญาตจากจังหวัดและคณะทำงาน Sky Hazard", hazards: ["แรงขับไม่สม่ำเสมอ", "ใบอนุญาตจังหวัด"] },
  { id: "m4_talai",     tierKey: "tier2", titleTh: "ชิงแชมป์ตะไล",          targetAltitude: 650,  budget: 9000,   basePoints: 1800,
    briefTh: "ตะไลต้องหมุนนิ่งและต้านลมให้ได้ วิถีตรงจะได้แต้มสูง", hazards: ["ลมขวาง", "ใบอนุญาตจังหวัด"] },

  { id: "m5_sounding",  tierKey: "tier3", titleTh: "ตรวจชั้นบรรยากาศชั้นสตราโตสเฟียร์", targetAltitude: 45000, budget: 60000, basePoints: 9000,
    briefTh: "ส่งเครื่องมือขึ้นไปเก็บข้อมูลชั้นบรรยากาศที่ ~45 กม. ต้องขออนุญาต CAAT และออก NOTAM ปิดห้วงอากาศชั่วคราว",
    hazards: ["ต้องมี RSO คุมจุดปล่อย", "NOTAM ก่อนปล่อย"] },
  { id: "m6_ballistic", tierKey: "tier4", titleTh: "ทดสอบวิถีโค้ง Sub-Orbital", targetAltitude: 250000, budget: 400000, basePoints: 30000,
    briefTh: "ยิงจรวดวิถีโค้งให้ถึง ~250 กม. แล้วตกกลับในพื้นที่ปลอดภัย ต้องประกาศเขตห้วงอากาศหวงห้ามและประเมิน ellipse จุดตก",
    hazards: ["ชิ้นส่วนตกกลับภาคพื้น", "ความร้อน re-entry", "รับรองความมั่นคงแห่งชาติ"] },
  { id: "m7_orbit",     tierKey: "tier5", titleTh: "ส่ง CubeSat เข้าวงโคจรต่ำ", targetAltitude: 300000, targetOrbit: 7730, budget: 2000000, basePoints: 90000,
    briefTh: "ส่งดาวเทียมเล็กเข้าวงโคจร LEO ที่ 300 กม. ต้องมี Δv พอถึงความเร็ววงโคจร (~7.73 กม./วินาที) รัฐต้องรับรองสถานะการยิงและซื้อประกันตาม Liability Convention",
    hazards: ["Δv margin", "รัฐรับรอง (OST Art.VI)", "ประกันความรับผิด (LC 1972)", "ขยะอวกาศ"] },
  { id: "m8_geo",       tierKey: "tier5", titleTh: "ส่งดาวเทียมสื่อสารวงโคจรสูง", targetAltitude: 500000, targetOrbit: 7620, budget: 6000000, basePoints: 160000,
    briefTh: "เพย์โหลดหนักขึ้นวงโคจรสูงขึ้น — payload fraction ต่ำมาก ต้องบริหาร Δv และงบประกันอย่างระวัง",
    hazards: ["payload fraction ต่ำ", "Δv margin", "ประกันวงเงินสูง", "ขยะอวกาศ"] }
];

// ---- ชิ้นส่วน VAB ----
// Tier 1–2: engine / propellant / fin / nosecone / payload  (โมเดลท่อนเดียว)
// Tier 3–5: payload (บังคับเลือก 1) / upgrade (เลือกได้)  — ปรับ stages ที่มีอยู่แล้ว
const PARTS = [
  // ===== Tier 1–2 =====
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
  { id: "payload_sensor", type: "payload", nameTh: "เซนเซอร์วัดอากาศ",   icon: "🌡️", mass: 0.8,  scoreBonus: 400, tierMin: 2 },
  // ความลับ: พิมพ์ "wanhu" ในหน้าประกอบเพื่อปลดล็อก (ตำนานหวันหู่ ผูกบั้งไฟ 47 อันกับเก้าอี้)
  { id: "payload_chair", type: "payload", nameTh: "เก้าอี้สำนักงาน (นั่งเอง)", icon: "🪑", mass: 14, scoreBonus: 0, tierMin: 1, secret: true, wanhu: true },

  // ===== Tier 3–5 payloads (มวลจริงมีผลต่อ Δv) =====
  { id: "pl_altimeter",  type: "payload", nameTh: "อัลติมิเตอร์ + ร่ม",      icon: "📏", mass: 0.4,  scoreBonus: 1200, tierMin: 3 },
  { id: "pl_gopro",      type: "payload", nameTh: "กล้องแอ็กชัน 4K",        icon: "🎥", mass: 1.2,  scoreBonus: 2200, tierMin: 3 },
  { id: "pl_weather",    type: "payload", nameTh: "ชุดตรวจอากาศชั้นบน",     icon: "🌦️", mass: 4,    scoreBonus: 3500, tierMin: 3 },
  { id: "pl_uv_spec",    type: "payload", nameTh: "สเปกโตรมิเตอร์ UV",      icon: "🔬", mass: 9,    scoreBonus: 6000, tierMin: 3 },
  { id: "pl_test_mass",  type: "payload", nameTh: "มวลจำลอง (inert)",       icon: "⚙️", mass: 120,  scoreBonus: 4000, tierMin: 4 },
  { id: "pl_reentry_cap",type: "payload", nameTh: "แคปซูลทดสอบ re-entry",   icon: "🛡️", mass: 280,  scoreBonus: 9000, tierMin: 4 },
  { id: "pl_cubesat",    type: "payload", nameTh: "CubeSat 3U",             icon: "📦", mass: 6,    scoreBonus: 12000, tierMin: 5 },
  { id: "pl_cubesat_cluster", type: "payload", nameTh: "กลุ่ม CubeSat 12 ดวง", icon: "🛰️", mass: 150, scoreBonus: 30000, tierMin: 5 },
  { id: "pl_comsat_small", type: "payload", nameTh: "ดาวเทียมสื่อสารเล็ก",  icon: "📡", mass: 700,  scoreBonus: 60000, tierMin: 5 },
  { id: "pl_comsat_geo", type: "payload", nameTh: "ดาวเทียมสื่อสารวงโคจรสูง", icon: "🌐", mass: 1400, scoreBonus: 120000, tierMin: 5 },

  // ===== Tier 3–5 upgrades (ปรับ stages) =====
  { id: "up_prop_s",     type: "upgrade", nameTh: "ถังเชื้อเพลิงเสริม",    icon: "🛢️", desc: "+22% เชื้อเพลิงท่อนล่าง (แต่ +8% dry mass)", tierMin: 3,
    mod: { stage: 0, propMassMul: 1.22, dryMassMul: 1.08 } },
  { id: "up_fins_hi",    type: "upgrade", nameTh: "ครีบคาร์บอนไฟเบอร์",     icon: "🪶", desc: "เสถียรภาพดีขึ้น ลดการส่าย (−6% dry mass)", tierMin: 3,
    mod: { stage: 0, dryMassMul: 0.94 } },
  { id: "up_light_nose", type: "upgrade", nameTh: "fairing น้ำหนักเบา",    icon: "🪁", desc: "−12% dry mass ท่อนบนสุด", tierMin: 3,
    mod: { stage: "last", dryMassMul: 0.88 } },
  { id: "up_booster",    type: "upgrade", nameTh: "จรวดเสริมข้าง (strap-on)", icon: "🚀", desc: "+30% แรงขับ & เชื้อเพลิงท่อนล่าง (+12% dry mass)", tierMin: 4,
    mod: { stage: 0, thrustMul: 1.30, propMassMul: 1.30, dryMassMul: 1.12 } },
  { id: "up_hi_isp",     type: "upgrade", nameTh: "เครื่องยนต์ท่อนบน Isp สูง", icon: "⚗️", desc: "+22 วินาที Isp ท่อนบนสุด", tierMin: 4,
    mod: { stage: "last", ispAdd: 22 } }
];

window.TIERS = TIERS;
window.ROCKETS = ROCKETS;
window.MISSIONS = MISSIONS;
window.PARTS = PARTS;
