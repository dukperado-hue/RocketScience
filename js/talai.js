// js/talai.js — Phase 5.1 · ตะไล (Talai) แบบดั้งเดิม บ้านตาลิน อ.หนองบัว จ.นครสวรรค์
//   อ้างอิง: ผศ.ดร.วิรัตน์ คำศรีจันทร์ "วิธีทำตะไลของชาวบ้าน บ้านตาลิน" (gotoknow.org/posts/488613)
//   ภูมิปัญญาของ น้าบุญช่วย มีแสง แห่งบ้านตาลิน
//
//   ตะไล ≠ จรวดยิงตรงจากแท่น — เป็นพลุจานหมุน จุดแล้ว "สะบัดมือขว้างแบบจานบิน"
//   พุ่งขึ้นเป็น "เกลียวสว่าน" จากรูประทุที่เจาะเฉียง ~15° ใต้จุดสมดุล
//
//   window.Talai.chem(state)      → เคมีดินตะไล (ดินบาท มาดเฟื้อง ถ่านสลึง)
//   window.Talai.geometry(state)  → สัดส่วนโครงสร้าง (เชือกวัดรอบวง ×2 รอบ)
//   window.Talai.derived(rocket)  → พารามิเตอร์ให้ physics.js
//   window.Talai.render(host, ctx, onChange)   → แผง VAB

(function () {
  "use strict";

  // ---- สูตรดินตะไลดั้งเดิม: "ดินบาท มาดเฟื้อง ถ่านสลึง" (หน่วยชั่งไทย) ----
  //   1 บาท = 4 สลึง = 8 เฟื้อง   →   ดินประสิว 8 : ถ่าน 2 : กำมะถัน 1  (เฟื้อง)
  //   ⇒ ดินประสิว 72.7% · ถ่าน 18.2% · กำมะถัน(มาด) 9.1%  โดยมวล
  const IDEAL = { saltpeter: 8 / 11, charcoal: 2 / 11, sulfur: 1 / 11 };
  const GRAM = { baht: 15.0, salung: 3.75, fueang: 1.875 };
  const CHARCOAL_WOOD = {
    teak:     { th: "ไม้สัก",        good: 1.00 },
    raintree: { th: "ไม้ฉำฉา",       good: 1.00 },
    light:    { th: "ไม้เบา (ระกำ/เพกา)", good: 0.9 },
    hardwood: { th: "ไม้เนื้อแข็งทั่วไป", good: 0.45 }
  };

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const clamp01 = (x) => clamp(x, 0, 1);
  const smoothstep = (a, b, x) => { x = clamp01((x - a) / (b - a)); return x * x * (3 - 2 * x); };

  const state = {
    // เคมีดินตะไล (สไลเดอร์ 0..100 → normalize)
    mix: { saltpeter: 72, charcoal: 18, sulfur: 10 },
    grindSeparate: true,      // ตำแยกทีละอย่างจนละเอียด
    sunDried: true,           // ตากแดดไล่ความชื้นก่อนชั่ง
    waterSprinkle: 0.35,      // พรมน้ำระหว่างตำ (0..1) ลดแรงเสียดทาน/ความไว
    charcoalWood: "teak",
    // โครงสร้าง (เชือกวัดรอบวงรูบ้อง วน 2 รอบ = ความยาวมาตรฐาน)
    casing: "raak_sod",       // ไม้รวกสด (บังคับ) — อย่างอื่น = CATO
    boreCircum: 12,           // ซม. เส้นรอบวงรูบ้องไม้รวก
    wingDiaPct: 100,          // % ของ (2×รอบวง) — เป้า 100
    coreLenPct: 100,          // % ของ (2×รอบวง)
    holeAngle: 15,            // องศา เฉียงของรูประทุ (จากแนวขนานพื้น)
    balanceOffsetThumb: 2,    // นิ้วหัวแม่มือ จากจุดสมดุล
    tampForce: 0.5            // แรงตำอัดดินปืน (0..1) — แรงไป = ไม้ปริ, หลวมไป = ระเบิดตอนจุด
  };

  const CASING = {
    raak_sod:  { th: "ไม้รวกสด (Thyrsostachys siamensis)", ok: true,  hint: "ถูกต้อง — เนื้อสด ยืดหยุ่น รับแรงอัดได้" },
    raak_haeng:{ th: "ไม้รวกแห้ง",  ok: false, hint: "ไม้แห้งเปราะ — แตกทันทีที่จุด (CATO)" },
    pvc:       { th: "ท่อ PVC",     ok: false, hint: "พลาสติกไม่ใช่ภูมิปัญญาตะไล — ความร้อนละลาย/ระเบิด" },
    mai_teng:  { th: "ไม้ไผ่ตง",    ok: false, hint: "ไผ่ตงหนาไปทำแกน (ใช้ทำ 'ปีก' เท่านั้น) — สมดุลเพี้ยน แตก" }
  };

  // ---------- เคมี ----------
  function chem(s) {
    s = s || state;
    const m = s.mix;
    const tot = (m.saltpeter + m.charcoal + m.sulfur) || 1;
    const S = m.saltpeter / tot, C = m.charcoal / tot, U = m.sulfur / tot;
    const err = Math.abs(S - IDEAL.saltpeter) + Math.abs(C - IDEAL.charcoal) + Math.abs(U - IDEAL.sulfur);

    // ความชื้น: ตากแดด = แห้ง; พรมน้ำมาก = ชื้น
    const moisture = clamp01((s.sunDried ? 0.05 : 0.4) + s.waterSprinkle * 0.35);
    // ก้อนดินไม่ไหม้ (unburnt lumps): ตำไม่แยก / ชื้น / ถ่านไม่ดี / สัดส่วนเพี้ยน
    const wood = CHARCOAL_WOOD[s.charcoalWood] || CHARCOAL_WOOD.teak;
    let lumps = 0;
    if (!s.grindSeparate) lumps += 0.5;
    lumps += Math.max(0, moisture - 0.25) * 1.4;
    lumps += (1 - wood.good) * 0.8;
    lumps += Math.max(0, err - 0.12) * 1.5;
    lumps = clamp01(lumps);

    // ความไว (volatility): ดินประสิว "มากผิดปกติ" + แห้งจัด + ตำละเอียด + พรมน้ำน้อยเกิน
    let volatility = Math.max(0, (S - 0.80) * 2.6)
      + (s.grindSeparate ? 0.08 : 0)
      + Math.max(0, 0.14 - moisture) * 1.6
      - s.waterSprinkle * 0.25;
    volatility = clamp01(volatility);

    // การทดสอบ "หยิบวางพื้นเรียบแล้วจุด"
    let burnTest;
    if (volatility > 0.42) burnTest = "proximity";     // ติดไฟก่อนไฟแตะ = แรงไป ระเบิดง่าย
    else if (lumps > 0.32) burnTest = "lumps";         // เหลือก้อนดิน = สปัตเตอร์ ขึ้นไม่สูง
    else if (err < 0.11 && lumps < 0.16) burnTest = "flash";  // ลุกพรึ่บเดียว เหลือแต่เขม่า ✓
    else burnTest = "weak";

    const thrustMul = clamp(0.45 + S * 1.05 - lumps * 0.5, 0.2, 1.6);
    const burnRate = clamp(0.35 + S * 1.7 - Math.max(0, C - 0.24) * 1.6, 0.25, 2.1);
    const altitudeMul = clamp(1 - Math.max(0, C - 0.24) * 2.3 - lumps * 0.7, 0.25, 1.05);

    let catoRisk = clamp(Math.max(0, (volatility - 0.34) * 3.6), 0, 2);   // ไวเกิน → ระเบิดคามือ

    let quality, note;
    if (burnTest === "proximity") { quality = "ไวเกินไป"; note = "ติดไฟตั้งแต่ไฟยังไม่แตะ — ตะไลจะแรงและระเบิดคามือ (เพิ่มพรมน้ำ / ลดดินประสิว)"; }
    else if (burnTest === "lumps") { quality = "เหลือก้อนดิน"; note = "ยังมีผงดินปืนเป็นก้อน — ต้องตำแยกทีละอย่างให้ละเอียด ตากแดดไล่ชื้น"; }
    else if (burnTest === "weak") { quality = "อ่อน"; note = "สัดส่วนเพี้ยนจาก ดินบาท-มาดเฟื้อง-ถ่านสลึง — ลุกไม่พรึ่บ"; }
    else { quality = "ลุกพรึ่บเดียว"; note = "ถูกต้องตามสูตร — จุดแล้วลุกพรึ่บเดียวเหลือแต่เขม่า"; }

    return {
      norm: { saltpeter: S, charcoal: C, sulfur: U }, err: +err.toFixed(3),
      moisture: +moisture.toFixed(2), lumps: +lumps.toFixed(2), volatility: +volatility.toFixed(2),
      burnTest, thrustMul: +thrustMul.toFixed(3), burnRate: +burnRate.toFixed(3),
      altitudeMul: +altitudeMul.toFixed(3), catoRisk: +catoRisk.toFixed(3), quality, note
    };
  }

  // ---------- โครงสร้าง (เชือกวัดรอบวงรูบ้อง วน 2 รอบ) ----------
  function geometry(s) {
    s = s || state;
    const twoCirc = 2 * s.boreCircum;               // ความยาวเชือกวัด = 2× เส้นรอบวง
    const wingDia = twoCirc * (s.wingDiaPct / 100);
    const coreLen = twoCirc * (s.coreLenPct / 100);
    const wingRatio = wingDia / twoCirc;             // เป้า = 1.00
    const coreRatio = coreLen / twoCirc;             // เป้า = 1.00

    // เสถียรภาพไจโรสโคปิก: ปีกต้อง = 2×รอบวง พอดี, แกนต้องได้สัดส่วน
    const wingErr = Math.abs(wingRatio - 1);
    const coreErr = Math.abs(coreRatio - 1);
    const stabilityRatio = clamp01(1 - wingErr * 2.2 - coreErr * 1.4);

    // มุมรูประทุ: เจาะ 2 นิ้วหัวแม่มือจากจุดสมดุล แล้วต่ำลง 1 นิ้ว ≈ 15° (ประมาณโดยผู้เขียนต้นฉบับ)
    const idealAngle = 15;
    const angleErr = Math.abs(s.holeAngle - idealAngle);
    // มุมตื้น (<10°) → สปินอ่อน ส่าย; มุมชัน (>20°) → แรงรั่วออกข้าง ขึ้นไม่สูง หมุนคว้าง
    const spinTorqueFactor = clamp(Math.sin(s.holeAngle * Math.PI / 180) / Math.sin(idealAngle * Math.PI / 180), 0.2, 2.2);
    const climbBase = clamp(Math.cos((s.holeAngle - idealAngle) * Math.PI / 180) - angleErr * 0.012, 0.3, 1);

    // แรงตำอัดดินปืน: แรงไป ไม้รวกปริแตก / หลวมไป ระเบิดตอนจุด
    let tampCato = 0;
    if (s.tampForce > 0.70) tampCato = (s.tampForce - 0.70) * 5.2;      // ตำแรง → บ้องปริแตก
    else if (s.tampForce < 0.26) tampCato = (0.26 - s.tampForce) * 5.6; // หลวม → ระเบิดขณะจุด
    tampCato = clamp(tampCato, 0, 2);

    // ปลอกผิด (ไม่ใช่ไม้รวกสด) → โครงสร้างพังทันที
    const casingOK = !!(CASING[s.casing] && CASING[s.casing].ok);
    const casingCato = casingOK ? 0 : 1.5;

    let note;
    if (!casingOK) note = "ต้องใช้ไม้รวกสดทำแกนเท่านั้น — " + (CASING[s.casing] || {}).hint;
    else if (tampCato >= 1) note = s.tampForce > 0.7 ? "ตำอัดแรงเกินไป — ไม้รวกสดจะปริแตกตอนจุด (CATO)" : "อัดดินหลวมเกินไป — จะระเบิดขณะจุด";
    else if (wingErr > 0.12) note = "เส้นผ่าศูนย์กลางปีกไม่เท่ากับ 2×รอบวง — ตะไลส่ายแล้วร่วงในแนวราบ";
    else if (angleErr > 6) note = s.holeAngle < 15 ? "มุมรูประทุตื้นไป — สปินอ่อน เกลียวสว่านไม่ติด" : "มุมรูประทุชันไป — แรงรั่วออกข้าง ขึ้นไม่สูง หมุนคว้าง";
    else note = "สัดส่วนได้ตามภูมิปัญญาบ้านตาลิน";

    return {
      twoCirc: +twoCirc.toFixed(1), wingDia: +wingDia.toFixed(1), coreLen: +coreLen.toFixed(1),
      wingRatio: +wingRatio.toFixed(3), coreRatio: +coreRatio.toFixed(3),
      stabilityRatio: +stabilityRatio.toFixed(3),
      holeAngleDeg: s.holeAngle, spinTorqueFactor: +spinTorqueFactor.toFixed(3),
      climbBase: +climbBase.toFixed(3),
      catoRisk: +clamp(tampCato + casingCato, 0, 2.5).toFixed(3),
      casingOK, note
    };
  }

  // ---------- รวมพารามิเตอร์ให้ physics ----------
  function derived(rocket) {
    const ch = chem(state), ge = geometry(state);
    return {
      talai: true,
      chem: ch, geometry: ge,
      thrustMul: ch.thrustMul,
      burnRate: ch.burnRate,
      altitudeMul: ch.altitudeMul,
      spinTorqueFactor: ge.spinTorqueFactor,
      climbBase: ge.climbBase * ch.altitudeMul,
      stabilityRatio: ge.stabilityRatio,
      wingRatio: ge.wingRatio,
      wingDia: ge.wingDia,
      holeAngleDeg: ge.holeAngleDeg,
      catoRisk: Math.max(ch.catoRisk, ge.catoRisk),
      throwSpeed: 9 + state.boreCircum * 0.25,      // แรงสะบัดมือ (ขว้างจานบิน)
      quality: ge.casingOK ? ch.quality : "ปลอกผิด"
    };
  }

  // ---------- UI ----------
  function bar(v, max, cls) {
    const pct = clamp01(v / max) * 100;
    return `<span class="vx-bar"><span class="vx-bar-fill ${cls || ""}" style="width:${pct.toFixed(0)}%"></span></span>`;
  }
  let _host = null, _onChange = null;

  function render(host, ctx, onChange) {
    _host = host; _onChange = onChange || null;
    if (!host) return;
    host.hidden = false;
    const ch = chem(state), ge = geometry(state);
    const btLabel = { flash: "ลุกพรึ่บเดียว ✓", lumps: "เหลือก้อนดิน", proximity: "ติดไฟก่อนไฟแตะ ⚠", weak: "อ่อน" }[ch.burnTest];
    const btCls = ch.burnTest === "flash" ? "vx-q-good" : ch.burnTest === "proximity" ? "vx-q-bad" : "vx-q-warn";

    host.innerHTML = `
      <div class="vx-title">ตะไล — ภูมิปัญญาบ้านตาลิน <span class="vx-tag">น้าบุญช่วย มีแสง</span></div>

      <div class="vx-group">
        <div class="vx-label">แกนตะไล (Casing) — ต้องเป็น <b>ไม้รวกสด</b> เท่านั้น</div>
        <div class="vx-seg tl-casing">
          ${Object.keys(CASING).map(k => `<button type="button" class="vx-seg-btn${state.casing === k ? " on" : ""}${CASING[k].ok ? "" : " tl-bad"}" data-casing="${k}">${CASING[k].th.split(" ")[0]}</button>`).join("")}
        </div>
        <div class="vx-hint">${(CASING[state.casing] || {}).hint || ""}</div>
      </div>

      <div class="vx-group">
        <div class="vx-label">เส้นรอบวงรูบ้อง <b>${state.boreCircum}</b> ซม. · เชือกวัดวน 2 รอบ = <b>${ge.twoCirc}</b> ซม.</div>
        <input type="range" class="vx-range" data-tl="boreCircum" min="6" max="20" step="0.5" value="${state.boreCircum}">
        <div class="vx-hint">ความยาวเชือกนี้ = ความยาวแกน = เส้นผ่าศูนย์กลางปีกวงกลม (2 ส่วน)</div>
      </div>

      <div class="vx-slider"><span class="vx-sl-name">Ø ปีกวงกลม (ไม้ไผ่ตง)</span>
        <input type="range" class="vx-range" data-tl="wingDiaPct" min="55" max="150" step="1" value="${state.wingDiaPct}">
        <span class="vx-sl-val">${ge.wingDia} ซม.</span></div>
      <div class="vx-hint" style="margin-top:-2px">เป้า ${ge.twoCirc} ซม. (2×รอบวง) · ตอนนี้ ${(ge.wingRatio * 100).toFixed(0)}%</div>

      <div class="vx-slider"><span class="vx-sl-name">มุมรูประทุเฉียง</span>
        <input type="range" class="vx-range" data-tl="holeAngle" min="5" max="30" step="1" value="${state.holeAngle}">
        <span class="vx-sl-val">${state.holeAngle}°</span></div>
      <div class="vx-hint" style="margin-top:-2px">เจาะ 2 นิ้วหัวแม่มือใต้จุดสมดุล แล้วต่ำลง 1 นิ้ว ≈ 15° → เกลียวสว่าน</div>

      <div class="vx-slider"><span class="vx-sl-name">แรงตำอัดดินปืน</span>
        <input type="range" class="vx-range" data-tl="tampForce" min="0" max="1" step="0.02" value="${state.tampForce}">
        <span class="vx-sl-val">${(state.tampForce * 100).toFixed(0)}%</span></div>
      <div class="vx-hint" style="margin-top:-2px">แรงไป = ไม้รวกปริแตก · หลวมไป = ระเบิดขณะจุด (พอดี ~35–60%)</div>

      <div class="vx-group vx-chem">
        <div class="vx-label">ดินตะไล — <b>ดินบาท มาดเฟื้อง ถ่านสลึง</b> (72.7 / 18.2 / 9.1)</div>
        ${[["saltpeter", "ดินประสิว (บาท)"], ["charcoal", "ถ่าน (สลึง)"], ["sulfur", "มาด/กำมะถัน (เฟื้อง)"]].map(([k, th]) => `
          <div class="vx-slider"><span class="vx-sl-name">${th}</span>
            <input type="range" class="vx-range" data-mix="${k}" min="0" max="100" step="1" value="${state.mix[k]}">
            <span class="vx-sl-val">${Math.round(ch.norm[k] * 100)}%</span></div>`).join("")}
        <div class="tl-toggles">
          <label><input type="checkbox" data-tlck="grindSeparate" ${state.grindSeparate ? "checked" : ""}> ตำแยกทีละอย่าง</label>
          <label><input type="checkbox" data-tlck="sunDried" ${state.sunDried ? "checked" : ""}> ตากแดดไล่ชื้น</label>
        </div>
        <div class="vx-slider"><span class="vx-sl-name">พรมน้ำระหว่างตำ</span>
          <input type="range" class="vx-range" data-tl="waterSprinkle" min="0" max="1" step="0.05" value="${state.waterSprinkle}">
          <span class="vx-sl-val">${(state.waterSprinkle * 100).toFixed(0)}%</span></div>
        <div class="vx-slider"><span class="vx-sl-name">ถ่านจากไม้</span>
          <select class="vx-range" data-tlsel="charcoalWood" style="padding:3px">
            ${Object.keys(CHARCOAL_WOOD).map(k => `<option value="${k}" ${state.charcoalWood === k ? "selected" : ""}>${CHARCOAL_WOOD[k].th}</option>`).join("")}
          </select><span class="vx-sl-val"></span></div>

        <div class="vx-readout">
          <div class="vx-quality ${btCls}">ทดสอบจุด: ${btLabel}</div>
          <div class="vx-note">${ge.casingOK ? ch.note : ge.note}</div>
          <div class="vx-metrics">
            <div>แรงขับ ${bar(ch.thrustMul, 1.6, "")}</div>
            <div>เพดานสูง ${bar(ch.altitudeMul, 1.05, ch.altitudeMul < 0.6 ? "warn" : "")}</div>
            <div>เสถียร (ไจโร) ${bar(ge.stabilityRatio, 1, ge.stabilityRatio < 0.55 ? "warn" : "")}</div>
            <div>เสี่ยง CATO ${bar(Math.max(ch.catoRisk, ge.catoRisk), 2, Math.max(ch.catoRisk, ge.catoRisk) >= 1 ? "bad" : Math.max(ch.catoRisk, ge.catoRisk) > 0.4 ? "warn" : "")}</div>
          </div>
        </div>
      </div>`;
    wire(host);
  }

  function wire(host) {
    host.querySelectorAll("[data-casing]").forEach(b => b.addEventListener("click", () => { state.casing = b.dataset.casing; refresh(); }));
    host.querySelectorAll("[data-tl]").forEach(sl => sl.addEventListener("input", () => { state[sl.dataset.tl] = +sl.value; refresh(); }));
    host.querySelectorAll("[data-mix]").forEach(sl => sl.addEventListener("input", () => { state.mix[sl.dataset.mix] = +sl.value; refresh(); }));
    host.querySelectorAll("[data-tlck]").forEach(ck => ck.addEventListener("change", () => { state[ck.dataset.tlck] = ck.checked; refresh(); }));
    host.querySelectorAll("[data-tlsel]").forEach(se => se.addEventListener("change", () => { state[se.dataset.tlsel] = se.value; refresh(); }));
  }
  function refresh() {
    render(_host, null, _onChange);
    if (_onChange) { try { _onChange(); } catch (e) { console.warn("[Talai] onChange", e); } }
  }

  window.Talai = { chem, geometry, derived, render, state, IDEAL, GRAM, CASING };
})();
