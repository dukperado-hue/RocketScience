// js/bangfai.js — "The Master Craftsman Update" · บั้งไฟ (Tier 2)
//   ภูมิปัญญาช่างบั้งไฟอีสาน (บุญบั้งไฟ) — วิศวกรรมเชิงลึกของการทำบั้งไฟจริง
//
//   Task 1 · ดินขับ 3 ชั้น (staged propellant):
//     • ดินหัว  (Head)   — เผาช้า เป็น "ดินหน่วง/ดินเลี้ยง" ให้บั้งไฟค้างฟ้านาน (hang time)
//     • ดินคอ  (Throat)  — ดินเชื่อม 1:1 ดินลำตัว+ดินเก่า (recycled) เผาปานกลาง
//     • ดินลำตัว (Body)   — แรงขับหลัก · ดินประสิว 1 กก. : ถ่านป่นละเอียด 2.3–2.5 ส่วน + พรมน้ำ
//   Task 1 · แรงอัดไฮดรอลิก (แม่แรงอัดดิน): โซนปลอดภัย 300–400 PSI
//   Task 1 · เจาะรูแกนเหล็ก (core): ยอด 4 / ไฟกิน 14 / ตูด 20 / เฟื่อง(คอคอด) 25 มม.
//            → กำหนดรูปทรงกราฟแรงขับ (thrust curve) ใน physics.js
//
//   Task 2 · หาง (หางบั้งไฟ = ตัวรักษาเสถียรภาพ):
//     • ต้มหาง (boil) — ไล่ยางไผ่ หางเบาลง แต่กินเวลา/ฟืน
//     • ปรับหาง: ความยาว (~290 ซม.) · จุดมัดเข้าบั้ง (~37 ซม.) · ถ่วงเสมอ (CG ที่ปลายนิ้ว)
//     หางไม่สมดุล → บั้งไฟ "รำดาบ" ส่ายเสียความสูง จับเวลาไม่ขึ้น
//
//   window.Bangfai.derived(rocket) → พารามิเตอร์ให้ physics.js + main.js
//   window.Bangfai.render(host, ctx, onChange) → แผง VAB

(function () {
  "use strict";

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const clamp01 = (x) => clamp(x, 0, 1);

  // ---------------- สูตรตำราช่างบั้งไฟ ----------------
  const IDEAL = {
    bodyCharcoalRatio: 2.4,   // ดินประสิว 1 กก. : ถ่านป่น 2.3–2.5 ส่วน
    bodyWater: 0.35,          // พรมน้ำระหว่างตำ
    throatRecycle: 0.5,       // ดินคอ = ดินลำตัว : ดินเก่า = 1 : 1
    pressPSI: 350,            // โซนปลอดภัย 300–400
    core: { tip: 4, burn: 14, base: 20, nozzle: 25 },  // มม.
    tailLength: 290,          // ซม.
    tailAttach: 37            // ซม. (มัดเข้าบั้ง)
  };

  const BODY = {
    pvc:    { th: "ท่อ PVC",  capThresh: 1.25, dryMul: 0.86, hint: "เบา · ทนความดันในลำได้น้อย" },
    bamboo: { th: "ลำไม้ไผ่", capThresh: 1.80, dryMul: 1.28, hint: "หนัก · เนื้อเหนียวรับความดันได้ดีกว่า" }
  };

  const state = {
    body: "pvc",
    // Task 1 — ดินขับ 3 ชั้น (มวลเป็น กก.)
    headMass: 0.8, throatMass: 1.2, bodyMass: 7.0,
    headGrade: 0.65,           // คุณภาพการเตรียมดินหัว (0..1) → hang time
    throatRecycle: 50,         // % ดินเก่า (เป้า 50 = 1:1)
    bodyCharcoalRatio: 2.4,    // ต่อดินประสิว 1 กก.
    bodyWater: 35,             // % ความชื้นที่พรม
    grindFine: true,           // ตำ/บดจนละเอียด
    // Task 1 — แรงอัด
    pressPSI: 350,
    // Task 1 — เจาะรูแกน (มม.)
    coreTip: 4, coreBurn: 14, coreBase: 20, coreNozzle: 25,
    // Task 2 — หาง
    boilTail: true,
    tailLength: 290,           // ซม.
    tailAttach: 37,            // ซม.
    cgTrim: 0                  // ถ่วงเสมอ -10..+10 (บวก = ถ่วงหัว)
  };

  // ---------------- คำนวณค่าทางวิศวกรรม ----------------
  function analyse(s) {
    s = s || state;
    const body = BODY[s.body] || BODY.pvc;

    // --- เคมีดินลำตัว ---
    const ratio = s.bodyCharcoalRatio;
    const ratioErr = Math.abs(ratio - IDEAL.bodyCharcoalRatio);
    const water = s.bodyWater / 100;
    const waterErr = water < 0.25 ? (0.25 - water) / 0.25
      : water > 0.45 ? (water - 0.45) / 0.40 : 0;
    // ถ่านมาก = เผาช้า/แรงตก · ถ่านน้อย = เผาเร็ว/ความดันพุ่ง
    let burnRateMul = clamp(1 + (IDEAL.bodyCharcoalRatio - ratio) * 0.55, 0.42, 1.95);

    // --- ดินคอ (transition) ---
    const throatErr = Math.abs(s.throatRecycle / 100 - IDEAL.throatRecycle) / 0.5;

    // --- ดินหัว (sustainer / hang) ---
    const headQ = clamp01(s.headGrade);

    // --- แรงอัด PSI ---
    const psiOK = s.pressPSI >= 300 && s.pressPSI <= 400;
    const under = s.pressPSI < 300 ? (300 - s.pressPSI) / 180 : 0;  // เม็ดดินพรุน แตกร้าว
    const over = s.pressPSI > 400 ? (s.pressPSI - 400) / 220 : 0;   // แน่นเกิน จุดไม่ทะลุ

    // --- เจาะรูแกน ---
    const mono = s.coreTip < s.coreBurn && s.coreBurn < s.coreBase && s.coreNozzle > s.coreBase;
    const coreFault = !mono ? (
      s.coreNozzle <= s.coreBase ? `เฟื่อง (คอคอด) ${s.coreNozzle} มม. แคบกว่าตูด ${s.coreBase} มม. — ความดันในลำระบายไม่ทัน`
        : s.coreTip >= s.coreBurn ? `ยอด ${s.coreTip} มม. ไม่แคบกว่าไฟกิน ${s.coreBurn} มม.`
          : `ไฟกิน ${s.coreBurn} มม. ไม่แคบกว่าตูด ${s.coreBase} มม.`
    ) : "";
    // ดัชนีความดันห้องเผาไหม้ ~ (พื้นที่เผา) / (พื้นที่คอคอด)
    const pressureIndex = (s.coreBase * s.coreBase + s.coreBurn * s.coreBurn) /
      (s.coreNozzle * s.coreNozzle);
    const overPressure = Math.max(0, pressureIndex - body.capThresh);
    const underExpand = Math.max(0, 0.52 - pressureIndex);   // เฟื่องกว้างไป แรงดันรั่ว
    const taper = (s.coreBase - s.coreTip) / Math.max(4, s.coreBurn);
    const frontLoad = clamp((taper - 0.75) * 0.42, 0, 0.6);
    const coreOK = mono && overPressure <= 0 && underExpand <= 0;

    // --- ประกอบความเสี่ยง ---
    let catoRisk = 0, ignitionRisk = 0, thrustMul = 1;
    catoRisk += under * 1.15;
    catoRisk += over * (water < 0.25 ? 1.4 : 0.45);
    catoRisk += overPressure * 1.35;
    catoRisk += Math.max(0, IDEAL.bodyCharcoalRatio - ratio - 0.35) * 0.9;   // ดินร้อนเกิน
    catoRisk += throatErr > 0.6 ? (throatErr - 0.6) * 0.8 : 0;
    if (!mono) { catoRisk += 0.55; thrustMul *= 0.80; }
    catoRisk = clamp(catoRisk, 0, 2);

    ignitionRisk += over * 0.55;
    ignitionRisk += water > 0.45 ? (water - 0.45) * 2.4 : 0;
    ignitionRisk += waterErr * 0.28;
    if (!s.grindFine) ignitionRisk += 0.25;
    ignitionRisk = clamp01(ignitionRisk);

    thrustMul *= (s.coreBase / IDEAL.core.base);                     // ตูดกว้าง = ออกตัวแรง
    thrustMul *= clamp(1 - underExpand * 0.55, 0.45, 1);
    thrustMul *= clamp(1 - under * 0.25, 0.6, 1);
    thrustMul *= clamp(1 - Math.max(0, ratio - IDEAL.bodyCharcoalRatio) * 0.55, 0.35, 1);
    thrustMul *= (s.grindFine ? 1 : 0.80);
    thrustMul *= clamp(1 - waterErr * 0.18, 0.7, 1);
    thrustMul = clamp(thrustMul, 0.22, 1.7);
    burnRateMul *= (1 + under * 0.5);

    // --- หาง (เสถียรภาพ) ---
    const L = s.tailLength, A = s.tailAttach;
    const lenErr = L < 270 ? (270 - L) / 90 : L > 305 ? (L - 305) / 110 : 0;
    const attErr = A < 32 ? (32 - A) / 22 : A > 44 ? (A - 44) / 24 : 0;
    const jointFail = A < 24 ? (24 - A) / 24 : 0;              // มัดสั้นไป = หางสะบัด/หลุด
    // หางยาว + ไม่ต้ม = ท้ายหนัก → ต้องถ่วงหัวมากขึ้น
    const tailHeavy = (s.boilTail ? 0 : 0.9) + Math.max(0, (L - 285) / 120);
    const cgSweet = clamp((L - 285) / 20 + tailHeavy * 1.6, -1.5, 6);
    const cgErr = Math.abs(s.cgTrim - cgSweet) / 7;
    let tailBalance = clamp01(1 - lenErr * 0.8 - attErr * 1.15 - cgErr * 0.7);
    tailBalance *= (1 - jointFail * 0.85);
    tailBalance = clamp01(tailBalance);

    // --- มวล ---
    const fuelMass = s.headMass + s.throatMass + s.bodyMass;
    const tailKg = L / 100 * (s.boilTail ? 0.55 : 0.92) + A / 100 * 0.3;
    const cgKg = Math.max(0, s.cgTrim) * 0.07;
    const tubeKg = s.body === "bamboo" ? 3.6 : 2.4;
    const structKg = tubeKg + tailKg + cgKg;

    // --- แรงขับ / เวลาเผาไหม้ / กราฟแรงขับ ---
    // อิมพัลส์รวม ∝ มวลดินลำตัว(+คอ) × คุณภาพเคมี ; แรงขับพีค ∝ มวลดิน × ปากรูตูด
    const mainImpulse = (s.bodyMass + s.throatMass * 0.8) * 520 * thrustMul;   // N·s
    const thrust = clamp(90 + s.bodyMass * 62 * thrustMul * (s.coreBase / IDEAL.core.base), 150, 2600);
    const burnStretch = clamp(1 / Math.sqrt(burnRateMul), 0.78, 1.35);
    const mainBurn = clamp(mainImpulse / thrust * burnStretch, 1.4, 26);
    const sustainSec = clamp(s.headMass * (2.4 + headQ * 5.2) * burnStretch, 0, 22);
    const burnTime = mainBurn + sustainSec;
    const tailFrac = burnTime > 0 ? clamp(sustainSec / burnTime, 0, 0.62) : 0;
    const tailLevel = 0.22 + headQ * 0.18;

    // Isp โดยประมาณ (สำหรับแสดง Δv)
    const isp = clamp(72 + thrustMul * 34 - Math.max(0, ratio - 2.4) * 18, 42, 128);

    // --- ป้ายคุณภาพ + คำเตือนพี่ช่าง (ตัวเลขจริง) ---
    let quality, note, pchang;
    const nz = (x, d) => Number(x).toFixed(d);
    if (catoRisk >= 1) {
      quality = "อันตราย (CATO)";
      if (!mono)
        note = coreFault + " · เผาไหม้กระโชก ความดันพุ่ง";
      else if (overPressure > 0)
        note = `ดัชนีความดัน ${nz(pressureIndex, 2)} เกินพิกัด${body.th} (${nz(body.capThresh, 2)})`;
      else if (under > 0)
        note = `อัดดินแค่ ${s.pressPSI} PSI — เม็ดดินพรุน แตกร้าว ลามเป็นระเบิด`;
      else if (over > 0)
        note = `อัด ${s.pressPSI} PSI + ดินแห้ง — เสียดสีตอนอัดจุดระเบิดเอง`;
      else
        note = `ดินประสิวต่อถ่าน ${nz(ratio, 1)} ส่วน — ร้อน/ไวเกิน ความดันในลำพุ่งเกินปลอก`;
      pchang = `🦆 พี่ช่าง: หยุด! ${note}. นี่คือ CATO เต็มขั้น เหมือน Challenger ที่ O-ring แข็งเพราะเย็น`;
    } else if (!psiOK) {
      quality = s.pressPSI < 300 ? "อัดหลวม" : "อัดแน่นเกิน";
      note = `แรงอัด ${s.pressPSI} PSI — โซนปลอดภัย 300–400 PSI`;
      pchang = `🦆 พี่ช่าง: ${note}. ` + (s.pressPSI < 300
        ? "เม็ดดินยังพรุน จะเผาลามไม่คุมทิศ แรงขับหาย"
        : "แน่นเกินไฟจะจุดไม่ทะลุแกน — จุดติดยาก และเสี่ยงเสียดสี");
    } else if (!mono) {
      quality = "รูแกนผิดทรง";
      note = coreFault;
      pchang = `🦆 พี่ช่าง: ${coreFault}. รูแกนต้องเรียงแคบไปกว้าง (ยอด < ไฟกิน < ตูด) และเฟื่องกว้างกว่าตูด — ผิดทรงแบบนี้ไฟกินไม่สม่ำเสมอ แรงขับกระโชกและความดันพุ่งเป็นจุด`;
    } else if (underExpand > 0) {
      quality = "เฟื่องกว้างไป";
      note = `ดัชนีความดัน ${nz(pressureIndex, 2)} ต่ำ — เฟื่อง ${s.coreNozzle} มม. กว้างเทียบตูด ${s.coreBase} มม.`;
      pchang = `🦆 พี่ช่าง: ${note}. คอคอดกว้างไปแรงดันในลำรั่วออกหมด แรงขับตกฮวบ ขึ้นไม่สุด`;
    } else if (tailBalance < 0.6) {
      quality = "หางไม่สมดุล";
      note = `หาง ${L} ซม. · มัดเข้าบั้ง ${A} ซม. · ถ่วงเสมอ ${s.cgTrim} (เป้า ~${IDEAL.tailLength} / ~${IDEAL.tailAttach} / ~${nz(cgSweet, 1)})`;
      pchang = `🦆 พี่ช่าง: ${note}. ` + (jointFail > 0
        ? "มัดเข้าบั้งสั้นไป รอยต่อจะสะบัด — หางหลุดกลางอากาศคือจบเลย"
        : "หางคือตัวรักษาแกน ถ้าไม่สมดุลบั้งไฟจะ 'รำดาบ' ส่ายเป็นเกลียวแล้วเสียความสูง จับเวลาไม่ขึ้น");
    } else if (ratioErr > 0.35) {
      quality = ratio > 2.4 ? "ดินอ้วน (เผาช้า)" : "ดินร้อน (เผาเร็ว)";
      note = `ดินลำตัว: ดินประสิว 1 กก. ต่อถ่านป่น ${nz(ratio, 1)} ส่วน — ตำราคือ 2.3–2.5`;
      pchang = `🦆 พี่ช่าง: ${note}. ` + (ratio > 2.4
        ? "ถ่านมากไป ดินเผาช้า แรงขับตก ขึ้นไม่สุด"
        : "ถ่านน้อยไป ดินเผาเร็ว ความดันพุ่ง เข้าใกล้ CATO");
    } else if (ignitionRisk > 0.45) {
      quality = "จุดติดยาก";
      note = `ความชื้นพรมน้ำ ${s.bodyWater}% ` + (!s.grindFine ? "· ยังตำไม่ละเอียด" : "");
      pchang = `🦆 พี่ช่าง: ${note}. ดินชื้น/หยาบเกินจะจุดไม่ติดสม่ำเสมอ แรงขับกระตุก`;
    } else if (throatErr > 0.5) {
      quality = "ดินคอไม่เข้าคู่";
      note = `ดินคอมีดินเก่า ${s.throatRecycle}% — ตำราคือ 1:1 (50%)`;
      pchang = `🦆 พี่ช่าง: ${note}. รอยต่อดินลำตัว→ดินหัวจะสะดุด แรงขับวูบตอนเปลี่ยนชั้น`;
    } else {
      quality = "ได้ตำราช่างบั้งไฟ";
      note = `ดัชนีความดัน ${nz(pressureIndex, 2)} · หางสมดุล ${Math.round(tailBalance * 100)}% · ดินหัวเลี้ยง ${nz(sustainSec, 1)} วิ`;
      pchang = `🦆 พี่ช่าง: ได้สัดส่วนตำราหมอบั้งไฟทุกจุด — ${note} ยิงได้เลย จับเวลาน่าจะสวย`;
    }

    return {
      body: s.body, bodyTh: body.th, bodyCapThresh: body.capThresh, bodyDryMul: body.dryMul,
      fuelMass: +fuelMass.toFixed(2), structKg: +structKg.toFixed(2), tailKg: +tailKg.toFixed(2),
      thrust: +thrust.toFixed(0), burnTime: +burnTime.toFixed(2),
      mainBurn: +mainBurn.toFixed(2), sustainSec: +sustainSec.toFixed(2),
      isp: +isp.toFixed(0), burnRateMul: +burnRateMul.toFixed(3), thrustMul: +thrustMul.toFixed(3),
      curve: { frontLoad: +frontLoad.toFixed(3), tailFrac: +tailFrac.toFixed(3), tailLevel: +tailLevel.toFixed(3) },
      pressureIndex: +pressureIndex.toFixed(3), psiOK, mono, coreOK,
      catoRisk: +catoRisk.toFixed(3), ignitionRisk: +ignitionRisk.toFixed(3),
      tailBalance: +tailBalance.toFixed(3), cgSweet: +cgSweet.toFixed(2), jointFail: +jointFail.toFixed(2),
      headQ: +headQ.toFixed(2),
      quality, note, pchang
    };
  }

  // ---------------- พารามิเตอร์ให้ physics ----------------
  function derived(rocket) {
    const a = analyse(state);
    return {
      bangfai: true, analysis: a,
      body: a.body,
      fuelMass: a.fuelMass, structKg: a.structKg,
      thrust: a.thrust, burnTime: a.burnTime, isp: a.isp,
      curve: a.curve,
      tailBalance: a.tailBalance,
      catoRisk: a.catoRisk, ignitionRisk: a.ignitionRisk,
      casingCapMul: a.body === "bamboo" ? 1.35 : 1,
      quality: a.quality, note: a.note, pchang: a.pchang
    };
  }

  // ---------------- UI ----------------
  function bar(v, max, cls) {
    const pct = clamp01(v / max) * 100;
    return `<span class="vx-bar"><span class="vx-bar-fill ${cls || ""}" style="width:${pct.toFixed(0)}%"></span></span>`;
  }
  let _host = null, _onChange = null;

  function render(host, ctx, onChange) {
    _host = host; _onChange = onChange || (_onChange);
    if (!host) return;
    host.hidden = false;
    const a = analyse(state);
    const catoCls = a.catoRisk >= 1 ? "vx-q-bad" : a.catoRisk > 0.4 ? "vx-q-warn" : "vx-q-good";

    host.innerHTML = `
      <div class="vx-title">บั้งไฟ — วิศวกรรมช่างบั้งไฟอีสาน <span class="vx-tag">บุญบั้งไฟ</span></div>

      <div class="vx-group">
        <div class="vx-label">ลำบั้งไฟ (ปลอก)</div>
        <div class="vx-seg">
          ${Object.keys(BODY).map(k => `<button type="button" class="vx-seg-btn${state.body === k ? " on" : ""}" data-bf-body="${k}">${BODY[k].th}</button>`).join("")}
        </div>
        <div class="vx-hint">${(BODY[state.body] || {}).hint} · พิกัดดัชนีความดัน ${a.bodyCapThresh.toFixed(2)}</div>
      </div>

      <div class="vx-group vx-chem">
        <div class="vx-label"><b>Task 1</b> · ดินขับ 3 ชั้น (ตอกทีละชั้น ล่าง→บน)</div>

        <div class="bf-sub">ดินลำตัว — แรงขับหลัก</div>
        <div class="vx-slider"><span class="vx-sl-name">มวลดินลำตัว</span>
          <input type="range" class="vx-range" data-bf="bodyMass" min="3" max="12" step="0.5" value="${state.bodyMass}">
          <span class="vx-sl-val" data-ro="bodyMass">${state.bodyMass} กก.</span></div>
        <div class="vx-slider"><span class="vx-sl-name">ถ่านป่น : ดินประสิว 1 กก.</span>
          <input type="range" class="vx-range" data-bf="bodyCharcoalRatio" min="1.4" max="3.4" step="0.05" value="${state.bodyCharcoalRatio}">
          <span class="vx-sl-val" data-ro="bodyCharcoalRatio">${state.bodyCharcoalRatio.toFixed(2)}</span></div>
        <div class="vx-hint" data-ro="ratioHint">ตำรา 2.3–2.5 ส่วน · ตอนนี้ ${state.bodyCharcoalRatio.toFixed(2)}</div>
        <div class="vx-slider"><span class="vx-sl-name">พรมน้ำระหว่างตำ</span>
          <input type="range" class="vx-range" data-bf="bodyWater" min="0" max="70" step="1" value="${state.bodyWater}">
          <span class="vx-sl-val" data-ro="bodyWater">${state.bodyWater}%</span></div>

        <div class="bf-sub">ดินคอ — ดินเชื่อม (ดินลำตัว : ดินเก่า)</div>
        <div class="vx-slider"><span class="vx-sl-name">มวลดินคอ</span>
          <input type="range" class="vx-range" data-bf="throatMass" min="0.4" max="3" step="0.1" value="${state.throatMass}">
          <span class="vx-sl-val" data-ro="throatMass">${state.throatMass} กก.</span></div>
        <div class="vx-slider"><span class="vx-sl-name">สัดส่วนดินเก่า (recycled)</span>
          <input type="range" class="vx-range" data-bf="throatRecycle" min="0" max="100" step="5" value="${state.throatRecycle}">
          <span class="vx-sl-val" data-ro="throatRecycle">${state.throatRecycle}%</span></div>
        <div class="vx-hint">ตำรา 1 : 1 (50%)</div>

        <div class="bf-sub">ดินหัว — ดินหน่วง/ดินเลี้ยง (ค้างฟ้านาน)</div>
        <div class="vx-slider"><span class="vx-sl-name">มวลดินหัว</span>
          <input type="range" class="vx-range" data-bf="headMass" min="0.2" max="2.5" step="0.1" value="${state.headMass}">
          <span class="vx-sl-val" data-ro="headMass">${state.headMass} กก.</span></div>
        <div class="vx-slider"><span class="vx-sl-name">คุณภาพการเตรียม</span>
          <input type="range" class="vx-range" data-bf="headGrade" min="0" max="1" step="0.05" value="${state.headGrade}">
          <span class="vx-sl-val" data-ro="headGrade">${Math.round(state.headGrade * 100)}%</span></div>

        <div class="tl-toggles">
          <label><input type="checkbox" data-bfck="grindFine" ${state.grindFine ? "checked" : ""}> ตำ/บดจนละเอียด</label>
        </div>
      </div>

      <div class="vx-group">
        <div class="vx-label"><b>Task 1</b> · แรงอัดไฮดรอลิก (แม่แรงอัดดิน) — โซนปลอดภัย <b>300–400 PSI</b></div>
        <input type="range" class="vx-range bf-psi" data-bf="pressPSI" min="150" max="600" step="10" value="${state.pressPSI}">
        <div class="vx-hint" data-ro="psiHint">${state.pressPSI} PSI · ${a.psiOK ? "อยู่ในโซนปลอดภัย ✓" : "นอกโซนปลอดภัย ⚠"}</div>
      </div>

      <div class="vx-group">
        <div class="vx-label"><b>Task 1</b> · เจาะรูแกนเหล็ก (มม.) — รูปทรงกำหนดกราฟแรงขับ</div>
        <div class="bf-core">
          ${[["coreTip", "ยอด", 2, 8], ["coreBurn", "ไฟกิน", 8, 22], ["coreBase", "ตูด", 12, 30], ["coreNozzle", "เฟื่อง (คอคอด)", 15, 40]]
        .map(([k, th, lo, hi]) => `
            <label class="bf-core-cell">
              <span>${th}</span>
              <input type="range" class="vx-range" data-bf="${k}" min="${lo}" max="${hi}" step="1" value="${state[k]}">
              <b data-ro="${k}">${state[k]}</b>
            </label>`).join("")}
        </div>
        <div class="vx-hint" data-ro="coreHint">ตำรา 4 / 14 / 20 / 25 · ต้องเรียงแคบ→กว้าง และเฟื่องกว้างกว่าตูด</div>
      </div>

      <div class="vx-group">
        <div class="vx-label"><b>Task 2</b> · หางบั้งไฟ (ตัวรักษาเสถียรภาพ)</div>
        <div class="tl-toggles">
          <label><input type="checkbox" data-bfck="boilTail" ${state.boilTail ? "checked" : ""}> ต้มหาง (ไล่ยางไผ่ · หางเบาลง · กินเวลา/ฟืน)</label>
        </div>
        <div class="vx-slider"><span class="vx-sl-name">ความยาวหาง</span>
          <input type="range" class="vx-range" data-bf="tailLength" min="180" max="380" step="5" value="${state.tailLength}">
          <span class="vx-sl-val" data-ro="tailLength">${state.tailLength} ซม.</span></div>
        <div class="vx-slider"><span class="vx-sl-name">จุดมัดเข้าบั้ง</span>
          <input type="range" class="vx-range" data-bf="tailAttach" min="15" max="60" step="1" value="${state.tailAttach}">
          <span class="vx-sl-val" data-ro="tailAttach">${state.tailAttach} ซม.</span></div>
        <div class="vx-slider"><span class="vx-sl-name">ถ่วงเสมอ (นน.หัว)</span>
          <input type="range" class="vx-range" data-bf="cgTrim" min="-10" max="10" step="1" value="${state.cgTrim}">
          <span class="vx-sl-val" data-ro="cgTrim">${state.cgTrim > 0 ? "+" : ""}${state.cgTrim}</span></div>
        <div class="vx-hint" data-ro="tailHint">ตำรา ~290 / ~37 ซม. · ถ่วงให้สมดุลที่ปลายนิ้ว (เป้า ~${a.cgSweet.toFixed(1)})</div>
      </div>

      <div class="vx-readout">
        <div class="vx-quality ${catoCls}" data-ro="quality">${a.quality}</div>
        <div class="vx-note bf-pchang" data-ro="pchang">${a.pchang}</div>
        <div class="vx-metrics" data-ro="metrics">${metricsHtml(a)}</div>
      </div>`;
    wire(host);
  }

  function metricsHtml(a) {
    return `
      <div>แรงขับพีค ${bar(a.thrust, 4200, "")}<span class="bf-m">${a.thrust} N</span></div>
      <div>เวลาเผาไหม้ ${bar(a.burnTime, 24, "")}<span class="bf-m">${a.burnTime.toFixed(1)} s</span></div>
      <div>ดัชนีความดัน ${bar(a.pressureIndex, 2, a.pressureIndex > a.bodyCapThresh ? "bad" : a.pressureIndex < 0.52 ? "warn" : "")}<span class="bf-m">${a.pressureIndex.toFixed(2)}</span></div>
      <div>หางสมดุล ${bar(a.tailBalance, 1, a.tailBalance < 0.6 ? "bad" : a.tailBalance < 0.8 ? "warn" : "")}<span class="bf-m">${Math.round(a.tailBalance * 100)}%</span></div>
      <div>ดินหัวเลี้ยง ${bar(a.sustainSec, 14, "")}<span class="bf-m">${a.sustainSec.toFixed(1)} s</span></div>
      <div>เสี่ยง CATO ${bar(a.catoRisk, 2, a.catoRisk >= 1 ? "bad" : a.catoRisk > 0.4 ? "warn" : "")}<span class="bf-m">${a.catoRisk >= 1 ? "สูงมาก" : a.catoRisk > 0.4 ? "กลาง" : "ต่ำ"}</span></div>`;
  }

  // live-patch เฉพาะค่าที่อ่าน — สไลเดอร์ไม่หลุดโฟกัสตอนลาก
  function patch(host) {
    const a = analyse(state);
    const set = (k, v) => { const el = host.querySelector(`[data-ro="${k}"]`); if (el) el.textContent = v; };
    set("bodyMass", state.bodyMass + " กก.");
    set("bodyCharcoalRatio", state.bodyCharcoalRatio.toFixed(2));
    set("ratioHint", `ตำรา 2.3–2.5 ส่วน · ตอนนี้ ${state.bodyCharcoalRatio.toFixed(2)}`);
    set("bodyWater", state.bodyWater + "%");
    set("throatMass", state.throatMass + " กก.");
    set("throatRecycle", state.throatRecycle + "%");
    set("headMass", state.headMass + " กก.");
    set("headGrade", Math.round(state.headGrade * 100) + "%");
    set("pressPSI", state.pressPSI);
    set("psiHint", `${state.pressPSI} PSI · ${a.psiOK ? "อยู่ในโซนปลอดภัย ✓" : "นอกโซนปลอดภัย ⚠"}`);
    ["coreTip", "coreBurn", "coreBase", "coreNozzle"].forEach(k => set(k, state[k]));
    set("coreHint", a.mono ? `ดัชนีความดัน ${a.pressureIndex.toFixed(2)} (พิกัด ${a.bodyCapThresh.toFixed(2)})`
      : "⚠ รูแกนต้องเรียงแคบ→กว้าง: ยอด < ไฟกิน < ตูด < เฟื่อง");
    set("tailLength", state.tailLength + " ซม.");
    set("tailAttach", state.tailAttach + " ซม.");
    set("cgTrim", (state.cgTrim > 0 ? "+" : "") + state.cgTrim);
    set("tailHint", `ตำรา ~290 / ~37 ซม. · ถ่วงให้สมดุลที่ปลายนิ้ว (เป้า ~${a.cgSweet.toFixed(1)})`);
    set("quality", a.quality);
    set("pchang", a.pchang);
    const q = host.querySelector('[data-ro="quality"]');
    if (q) q.className = "vx-quality " + (a.catoRisk >= 1 ? "vx-q-bad" : a.catoRisk > 0.4 ? "vx-q-warn" : "vx-q-good");
    const m = host.querySelector('[data-ro="metrics"]');
    if (m) m.innerHTML = metricsHtml(a);
  }

  function wire(host) {
    host.querySelectorAll("[data-bf-body]").forEach(b =>
      b.addEventListener("click", () => { state.body = b.dataset.bfBody; full(); }));
    host.querySelectorAll("[data-bfck]").forEach(ck =>
      ck.addEventListener("change", () => { state[ck.dataset.bfck] = ck.checked; full(); }));
    host.querySelectorAll("[data-bf]").forEach(sl => {
      sl.addEventListener("input", () => {
        state[sl.dataset.bf] = +sl.value;
        patch(host); notify();
      });
      sl.addEventListener("change", () => { state[sl.dataset.bf] = +sl.value; full(); });
    });
  }

  function notify() { if (_onChange) { try { _onChange(); } catch (e) { console.warn("[Bangfai] onChange", e); } } }
  function full() { render(_host, null, _onChange); notify(); }

  window.Bangfai = { analyse, derived, render, state, IDEAL, BODY };
})();
