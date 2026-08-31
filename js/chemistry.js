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

  window.Chemistry = { evaluate, IDEAL, DEFAULT: Object.assign({}, IDEAL) };
})();
