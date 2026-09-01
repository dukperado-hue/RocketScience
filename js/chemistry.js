// js/chemistry.js — Phase 5 · เคมีดินขับแข็ง (black powder)
//   ผู้เล่นผสม ดินประสิว (KNO₃ จากมูลค้างคาว) / ถ่าน / กำมะถัน ด้วยสไลเดอร์
//   สูตรมาตรฐาน 75 / 15 / 10 (โดยมวล)
//   - ดินประสิวมาก  → แรงขับสูง แต่เสี่ยงระเบิด (CATO) รุนแรง
//   - ถ่านมาก        → เผาไหม้ช้า แรงขับตก ขึ้นไม่ถึงเป้า
//   - กำมะถันช่วยจุดติดไฟ/ลดจุดติดไฟ; น้อยไป = จุดติดยาก, มากไป = เขม่า/สแลกเยอะ Isp ตก
//
//  window.Chemistry.evaluate({ saltpeter, charcoal, sulfur })  // สัดส่วน 0..1 รวม = 1
//    → { thrustMul, ispMul, burnRateMul, altitudeMul, catoRisk, ignitionRisk, quality, note }

(function () {
  "use strict";

  const IDEAL = { saltpeter: 0.75, charcoal: 0.15, sulfur: 0.10 };
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  function normalize(mix) {
    let s = (mix && mix.saltpeter) || 0, c = (mix && mix.charcoal) || 0, u = (mix && mix.sulfur) || 0;
    const t = s + c + u;
    if (t <= 0) return Object.assign({}, IDEAL);
    return { saltpeter: s / t, charcoal: c / t, sulfur: u / t };
  }

  function evaluate(mix) {
    const m = normalize(mix);
    const S = m.saltpeter, C = m.charcoal, U = m.sulfur;

    // ระยะห่างจากสูตรมาตรฐาน (Manhattan)
    const err = Math.abs(S - IDEAL.saltpeter) + Math.abs(C - IDEAL.charcoal) + Math.abs(U - IDEAL.sulfur);

    // แรงขับ: โตตามตัวออกซิไดเซอร์ (ดินประสิว)
    let thrustMul = 0.45 + S * 1.15;                       // S=0.75 → ~1.31

    // อัตราการเผาไหม้: ออกซิไดเซอร์เร่ง, ถ่านมากหน่วง
    let burnRateMul = 0.30 + S * 1.85;                     // S=0.75 → ~1.69
    const carbonExcess = Math.max(0, C - 0.24);
    burnRateMul *= (1 - carbonExcess * 1.7);
    thrustMul *= (1 - carbonExcess * 1.9);

    // Isp: ดีที่สุดใกล้สูตรมาตรฐาน
    let ispMul = clamp(1.06 - err * 0.85, 0.5, 1.06);
    ispMul *= (1 - Math.max(0, U - 0.20) * 1.2);           // กำมะถันมาก = สแลก Isp ตก

    // เพดานความสูง: ถ่านมาก = เผาช้า ดันไม่ขึ้น
    let altitudeMul = clamp(1 - carbonExcess * 2.4, 0.25, 1);

    // ความเสี่ยงระเบิด (CATO): ดินประสิวเกิน + พลังงานรวมสูง
    let catoRisk = Math.max(0, (S - 0.80) * 3.6);
    catoRisk += Math.max(0, thrustMul - 1.32) * 1.4;
    catoRisk += Math.max(0, burnRateMul - 1.75) * 0.9;
    catoRisk = clamp(catoRisk, 0, 2);

    // ความเสี่ยงจุดไม่ติด: กำมะถันน้อยเกิน หรือ ดินประสิวน้อยเกิน
    let ignitionRisk = Math.max(0, (0.05 - U) * 6) + Math.max(0, (0.55 - S) * 1.6);
    ignitionRisk = clamp(ignitionRisk, 0, 1);

    thrustMul = clamp(thrustMul, 0.15, 1.8);
    burnRateMul = clamp(burnRateMul, 0.2, 2.2);

    // ป้ายคุณภาพ + คำอธิบาย
    let quality, note;
    if (catoRisk >= 1) { quality = "อันตราย"; note = "ดินประสิวเยอะไป — เสี่ยงระเบิดคาแท่น (CATO)"; }
    else if (altitudeMul < 0.6) { quality = "อ่อน"; note = "ถ่านเยอะไป — เผาไหม้ช้า แรงขับตก ขึ้นไม่ถึงเป้า"; }
    else if (ignitionRisk > 0.5) { quality = "จุดยาก"; note = "กำมะถัน/ดินประสิวน้อยไป — อาจจุดไม่ติด"; }
    else if (err < 0.10) { quality = "ดีเยี่ยม"; note = "ใกล้สูตรมาตรฐาน 75/15/10 — เผาไหม้สม่ำเสมอ"; }
    else if (err < 0.22) { quality = "ใช้ได้"; note = "เบี่ยงจากสูตรมาตรฐานเล็กน้อย"; }
    else { quality = "หยาบ"; note = "สัดส่วนเพี้ยนจากสูตรมาตรฐานมาก"; }

    return {
      mix: m,
      thrustMul: +thrustMul.toFixed(3),
      ispMul: +ispMul.toFixed(3),
      burnRateMul: +burnRateMul.toFixed(3),
      altitudeMul: +altitudeMul.toFixed(3),
      catoRisk: +catoRisk.toFixed(3),
      ignitionRisk: +ignitionRisk.toFixed(3),
      err: +err.toFixed(3),
      quality, note
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Phase 12 · Atomic Emission Spectroscopy — สีเม็ดดาว (pyrotechnic stars)
  //  โลหะที่เผาไหม้ในเปลวจะถูกกระตุ้นอิเล็กตรอนขึ้นชั้นพลังงานสูง เมื่อตกกลับ
  //  จะคายโฟตอนที่ความยาวคลื่นเฉพาะตัว → สีพลุ (ยกเว้น Al/Mg = การแผ่รังสีความร้อน)
  //    hex ตรงตามสเปกโทรสโกปีจริงตามที่โจทย์กำหนด
  // ─────────────────────────────────────────────────────────────────────────
  const SPECTRUM = {
    strontium: {
      el: "Sr", th: "สตรอนเชียม", hex: 0xff0000, nm: 641, emitter: "SrCl", spark: false,
      flame: "แดง",
      reaction: "SrCl* คายพลังงาน → เปล่งแสงแดง 605–682 nm (สีพลุคลาสสิก)"
    },
    lithium: {
      el: "Li", th: "ลิเทียม", hex: 0xff0000, nm: 671, emitter: "Li", spark: false,
      flame: "แดงเข้ม",
      reaction: "เส้นเปล่งลิเทียม 670.8 nm → แดงเข้มอมชมพู"
    },
    barium: {
      el: "Ba", th: "แบเรียม", hex: 0x00ff00, nm: 515, emitter: "BaCl", spark: false,
      flame: "เขียว",
      reaction: "BaCl* คายพลังงาน → แถบเปล่งเขียว 505–535 nm (ต้องคุมให้เป็นคลอไรด์)"
    },
    copper: {
      el: "Cu", th: "ทองแดง", hex: 0x0044ff, nm: 450, emitter: "CuCl", spark: false,
      flame: "น้ำเงิน",
      reaction: "CuCl* คายพลังงาน → แถบเปล่งน้ำเงิน 420–460 nm (ร้อนไปสีเพี้ยน — ทำยากสุด)"
    },
    sodium: {
      el: "Na", th: "โซเดียม", hex: 0xffcc00, nm: 589, emitter: "Na", spark: false,
      flame: "เหลือง",
      reaction: "เส้น D ของโซเดียม 589 nm → เหลืองสว่างจัดจนกลบสีอื่น"
    },
    calcium: {
      el: "Ca", th: "แคลเซียม", hex: 0xff6600, nm: 622, emitter: "CaCl", spark: false,
      flame: "ส้ม",
      reaction: "CaCl* / CaOH* → เปล่งส้ม 590–630 nm"
    },
    aluminum: {
      el: "Al", th: "อะลูมิเนียม", hex: 0xffffff, nm: 0, emitter: "Al₂O₃(s)", spark: true,
      flame: "ขาว/เงิน",
      reaction: "ผงอะลูมิเนียมเผาไหม้ ~3000 °C → แสงขาว + สะเก็ดเงิน (การแผ่รังสีความร้อน)"
    },
    magnesium: {
      el: "Mg", th: "แมกนีเซียม", hex: 0xffffff, nm: 0, emitter: "MgO(s)", spark: true,
      flame: "ขาวจ้า",
      reaction: "แมกนีเซียมเผาไหม้ร้อนจัด → แสงขาวเต็มสเปกตรัม (blackbody) + ประกายไฟ"
    }
  };

  function starChem(key) { return SPECTRUM[key] || SPECTRUM.strontium; }

  window.Chemistry = {
    evaluate, IDEAL, DEFAULT: Object.assign({}, IDEAL),
    SPECTRUM, spectrum: SPECTRUM, starChem
  };
})();
