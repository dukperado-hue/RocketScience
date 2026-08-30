// js/law.js
// โครงสร้างข้อมูลจัดการกฎหมายและเงื่อนไขก่อนปล่อยจรวด
// Phase 1 — ต่อยอดจากสคริปต์ต้นฉบับของผู้ใช้ (คง id / desc / penalty เดิมไว้ครบ)

const LegalFramework = {
  tier1_lantern: {
    id: "lantern",
    name: "โคมลอย / พลุ",
    lawRefs: ["พ.ร.บ. การเดินอากาศ พ.ศ. 2497 ม.24", "ข้อบัญญัติท้องถิ่น"],
    requirements: [
      { id: "check_airport", desc: "ตรวจสอบรัศมี 9 กม. จากสนามบิน (พ.ร.บ. การเดินอากาศ)", isChecked: false, isRequired: true, minigame: "airport" },
      { id: "local_announce", desc: "แจ้งผู้นำชุมชนล่วงหน้า", isChecked: false, isRequired: false, bonus: 300 } // ถ้าทำจะได้แต้มพิเศษ
    ],
    penalty: "โดนปรับสูงสุด 20,000 บาท ฐานรบกวนการบิน (-500 Points)",
    penaltyPoints: 500,
    gameOver: false
  },

  tier2_bangfai: {
    id: "bangfai",
    name: "บั้งไฟ / ตะไล",
    lawRefs: ["ระเบียบจังหวัดว่าด้วยการจุดบั้งไฟ", "เกณฑ์คณะทำงาน Sky Hazard"],
    requirements: [
      { id: "provincial_permit", desc: "ขออนุญาตนายอำเภอ/ผู้ว่าราชการจังหวัด", isChecked: false, isRequired: true, minigame: "permit" },
      { id: "sky_hazard", desc: "ยื่นแผนประเมินความเสี่ยงต่อคณะทำงาน Sky Hazard", isChecked: false, isRequired: true, minigame: "permit" },
      { id: "insurance_local", desc: "ทำประกันภัยความรับผิดต่อบุคคลที่สาม", isChecked: false, isRequired: false, bonus: 500 }
    ],
    penalty: "จรวดตกใส่หลังคาชาวบ้าน จ่ายค่าเสียหายและโดนยึดใบอนุญาต (-1000 Points)",
    penaltyPoints: 1000,
    gameOver: false
  },

  tier3_sounding_rocket: {
    id: "sounding",
    name: "จรวดหยั่งอากาศ (Amateur/Experimental)",
    lawRefs: ["ข้อกำหนด CAAT ว่าด้วยการปล่อยจรวด", "Annex 15 – NOTAM"],
    requirements: [
      { id: "caat_permit", desc: "ขออนุญาตสำนักงานการบินพลเรือนแห่งประเทศไทย (CAAT)", isChecked: false, isRequired: true, minigame: "permit" },
      { id: "notam_request", desc: "ออกประกาศ NOTAM เตือนอากาศยาน", isChecked: false, isRequired: true, minigame: "notam" },
      { id: "safety_officer", desc: "มีเจ้าหน้าที่ความปลอดภัย (RSO) คุมจุดปล่อย", isChecked: false, isRequired: true },
      { id: "airspace_closure", desc: "ขอปิดห้วงอากาศชั่วคราวเหนือพื้นที่ปล่อย", isChecked: false, isRequired: false, bonus: 800 }
    ],
    penalty: "เที่ยวบินพาณิชย์ต้องดีเลย์ฉุกเฉิน บริษัทโดนฟ้องล้มละลาย (Game Over)",
    penaltyPoints: 8000,
    gameOver: true
  },

  tier4_ballistic: {
    id: "ballistic",
    name: "จรวดวิถีโค้ง / ขีปนาวุธ (Sub-Orbital & Military)",
    lawRefs: ["พ.ร.บ. ความมั่นคงฯ", "ข้อกำหนดห้วงอากาศหวงห้าม (Prohibited/Restricted Area)"],
    requirements: [
      { id: "security_clearance", desc: "ขอการรับรองด้านความมั่นคงแห่งชาติ (สมช.)", isChecked: false, isRequired: true, minigame: "permit" },
      { id: "controlled_airspace", desc: "ประกาศเขตห้วงอากาศหวงห้าม + NOTAM ระดับชาติ", isChecked: false, isRequired: true, minigame: "notam" },
      { id: "impact_assessment", desc: "จัดทำรายงานประเมินความเสี่ยงจุดตกกระทบภาคพื้น (Ground Impact / Range Safety)", isChecked: false, isRequired: true, minigame: "impact" },
      { id: "intl_notify", desc: "แจ้งเตือนประเทศเพื่อนบ้านตามธรรมเนียมปฏิบัติระหว่างประเทศ", isChecked: false, isRequired: false, bonus: 1500 }
    ],
    penalty: "ระบบป้องกันภัยทางอากาศเข้าใจผิดว่าเป็นภัยคุกคาม ยิงสกัดกลางอากาศ (Game Over)",
    penaltyPoints: 20000,
    gameOver: true
  },

  tier5_orbital: {
    id: "orbital",
    name: "ดาวเทียมวงโคจร (Orbital Payload)",
    lawRefs: ["Outer Space Treaty 1967 (Art. VI, VII)", "Liability Convention 1972", "ITU Radio Regulations"],
    requirements: [
      { id: "state_sponsor", desc: "รัฐบาลรับรองสถานะการยิง (Outer Space Treaty 1967 - Art. VI)", isChecked: false, isRequired: true, minigame: "permit" },
      { id: "liability_insurance", desc: "ซื้อประกันความเสียหายระหว่างประเทศ (Liability Convention 1972)", isChecked: false, isRequired: true, minigame: "insurance" },
      { id: "itu_frequency", desc: "จดทะเบียนคลื่นความถี่ดาวเทียมกับ ITU", isChecked: false, isRequired: true, minigame: "permit" },
      { id: "debris_mitigation", desc: "แผนจัดการขยะอวกาศ (Space Debris Mitigation)", isChecked: false, isRequired: true },
      { id: "un_register", desc: "แจ้งขึ้นทะเบียนวัตถุอวกาศต่อสำนักงาน UNOOSA", isChecked: false, isRequired: false, bonus: 3000 }
    ],
    penalty: "ชิ้นส่วนบูสเตอร์ตกใส่ประเทศเพื่อนบ้าน เกิดข้อพิพาทระหว่างประเทศระดับ UN (-50,000 Points)",
    penaltyPoints: 50000,
    gameOver: false
  }
};

// ฟังก์ชันจำลองการตรวจสอบก่อนปล่อย
// รักษา signature เดิม: checkClearance(rocketTier, playerChecks)
// playerChecks = array ของ requirement id ที่ผู้เล่นติ๊ก/ทำสำเร็จ
function checkClearance(rocketTier, playerChecks) {
  const tierData = LegalFramework[rocketTier];
  if (!tierData) {
    return { status: "UNKNOWN", message: "ไม่พบข้อมูลกฎหมายของจรวดระดับนี้", penaltyPoints: 0, bonusEarned: 0, gameOver: false, missingReqs: [] };
  }

  let passed = true;
  const missingReqs = [];
  let bonusEarned = 0;

  tierData.requirements.forEach(req => {
    const done = playerChecks.includes(req.id);
    if (req.isRequired && !done) {
      passed = false;
      missingReqs.push(req.desc);
    }
    if (!req.isRequired && done) {
      bonusEarned += req.bonus || 0;
    }
  });

  if (passed) {
    return {
      status: "CLEARED",
      message: "เอกสารครบถ้วน! อนุญาตให้ทำการปล่อยจรวดได้",
      penaltyPoints: 0,
      bonusEarned,
      gameOver: false,
      missingReqs: []
    };
  }

  return {
    status: "VIOLATION",
    message: `ลักลอบปล่อย! คุณละเมิดกฎหมาย: ${missingReqs.join(", ")}\nบทลงโทษ: ${tierData.penalty}`,
    penaltyPoints: tierData.penaltyPoints || 0,
    bonusEarned, // ยังได้โบนัสจากข้อ optional ที่ทำ แม้จะละเมิดข้อบังคับ
    gameOver: !!tierData.gameOver,
    missingReqs
  };
}

// global-style ให้โหลดก่อน main.js
window.LegalFramework = LegalFramework;
window.checkClearance = checkClearance;
