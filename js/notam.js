// js/notam.js
// Phase 14 — Airspace Management & NOTAM System
// ก่อนออกจากโรงประกอบ (VAB) ไปแท่นปล่อย ผู้เล่นต้องยื่นคำขอ NOTAM (Notice to Air Missions)
// ระบุ "เพดานความสูง" และ "รัศมีความปลอดภัย" ที่ขอสำรองไว้ในห้วงอากาศ
//  - ขอกว้าง = ปลอดภัยแน่ แต่เปลืองงบปฏิบัติการ (หักคะแนนฐาน)
//  - ขอกระชับ = ลุ้นโบนัสสูง แต่เสี่ยง "Sky Hazard Violation" ถ้าจรวดหลุดกรอบ
// เปิดเผย: window.NOTAM.open(run, onConfirm)  /  window.NOTAM.assess(summary, notam)  /  window.NOTAM.reset()

(function () {
  "use strict";

  const IMG = "assets/images/characters/";
  const fmt = (n, d = 0) => Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const mDisp = m => m >= 1000 ? fmt(m / 1000, m >= 10000 ? 0 : 1) + " กม." : fmt(Math.round(m / 10) * 10) + " ม.";

  // ค่าขั้น "สวย ๆ" สำหรับสไลเดอร์
  const NICE = [10, 25, 50, 100, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  function niceStep(raw) {
    for (const s of NICE) if (s >= raw) return s;
    return NICE[NICE.length - 1];
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // ---------- โมเดลตัวเลข ----------
  // สร้างช่วงสไลเดอร์จากเป้าหมายภารกิจ (~40 ก้าวต่อสไลเดอร์)
  function ranges(targetAlt) {
    const t = Math.max(60, targetAlt || 300);

    const cStep = Math.max(10, niceStep(t * 2 / 40));
    const cLo = Math.max(cStep, Math.floor(t * 0.4 / cStep) * cStep);
    const cHi = Math.ceil(t * 3 / cStep) * cStep;
    const cDef = clamp(Math.round(t * 1.2 / cStep) * cStep, cLo, cHi);

    const rSpan = Math.max(20000, t * 0.3);
    const rStep = Math.max(50, niceStep(rSpan / 40));
    const rLo = Math.max(rStep, 250);
    const rHi = Math.ceil(rSpan / rStep) * rStep;
    const rDef = clamp(Math.round(3000 / rStep) * rStep, rLo, rHi);

    return {
      ceil: { lo: cLo, hi: cHi, step: cStep, def: cDef },
      rad:  { lo: rLo, hi: rHi, step: rStep, def: rDef }
    };
  }

  // งบปฏิบัติการที่ต้องจ่ายเพื่อสำรองห้วงอากาศ (สัมพันธ์กับคะแนนฐานภารกิจ)
  function opsCost(ceil, radius, targetAlt, bp) {
    const t = Math.max(60, targetAlt || 300);
    const volFactor = (ceil / t) * (radius / 3000);
    return Math.round(bp * 0.045 * Math.sqrt(Math.max(0.25, volFactor)));
  }
  // โบนัสพิเศษถ้า "ขอกระชับ" แล้วยังทำได้จริง
  function tightBonus(ceil, radius, targetAlt, bp) {
    const t = Math.max(60, targetAlt || 300);
    const tight = clamp((2.2 - ceil / t) / 1.8, 0, 1) * clamp((12000 - radius) / 11000, 0, 1);
    return Math.round(bp * 0.22 * tight);
  }
  const flatBonus = bp => Math.max(1000, Math.round(bp * 0.3));
  const violationPen = bp => Math.max(2000, Math.round(bp * 0.55));

  // ประเมินเบื้องต้น (ฝ่ายวิศวกรรม) — อ้างอิงเป้าหมายภารกิจ + ลม
  // จงใจไม่แม่น: จรวดจริงอาจสูง/ต่ำ/เบี่ยงกว่านี้ ผู้เล่นต้องเผื่อกรอบเอง
  function engineerEstimate(run) {
    const g = 9.81;
    const apo = Math.max(40, (run.mission && run.mission.targetAltitude) || 300);
    const wind = Math.abs(run.wind || 0);
    const tFlight = 2 * Math.sqrt(2 * apo / g);
    const drift = wind * tFlight * 0.3 + apo * 0.04;
    return { apo, drift };
  }

  // ---------- DOM ----------
  let overlay = null, state = null;

  function build() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "modal-overlay notam-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="notam-doc" role="dialog" aria-modal="true" aria-labelledby="notam-h">
        <div class="notam-perf notam-perf-l"></div>
        <div class="notam-perf notam-perf-r"></div>

        <header class="notam-head">
          <div class="notam-stamp-hdr">FORM · ANS-14</div>
          <h3 id="notam-h">NOTAM REQUEST FORM<span>คำขอออกประกาศนักบิน · Notice to Air Missions</span></h3>
          <div class="notam-meta">
            <span>REF <b id="notam-ref">—</b></span>
            <span>ISSUING UNIT <b>RocketScience Range Ops</b></span>
          </div>
        </header>

        <div class="notam-brief">
          <img class="notam-brief-img" id="notam-brief-img" alt="พี่ช่าง">
          <div>
            <div class="notam-brief-who">พี่ช่าง · CAPCOM</div>
            <p class="notam-brief-text" id="notam-brief-text"></p>
          </div>
        </div>

        <div class="notam-field">
          <label>A · เพดานความสูงที่ขอ (Requested Altitude Ceiling)</label>
          <div class="notam-slider-row">
            <input type="range" id="notam-ceil" class="notam-range">
            <output id="notam-ceil-out">—</output>
          </div>
          <div class="notam-hint" id="notam-ceil-hint"></div>
        </div>

        <div class="notam-field">
          <label>B · รัศมีความปลอดภัยที่ขอ (Requested Safety Radius)</label>
          <div class="notam-slider-row">
            <input type="range" id="notam-rad" class="notam-range">
            <output id="notam-rad-out">—</output>
          </div>
          <div class="notam-hint" id="notam-rad-hint"></div>
        </div>

        <div class="notam-ledger">
          <div class="notam-ledger-row">
            <span>ประเมินฝ่ายวิศวกรรม (คลาดเคลื่อนได้ ±30%)</span>
            <b id="notam-est">—</b>
          </div>
          <div class="notam-ledger-row neg">
            <span>งบปฏิบัติการที่ต้องจ่าย (หักคะแนนฐาน)</span>
            <b id="notam-cost">—</b>
          </div>
          <div class="notam-ledger-row pos">
            <span>โบนัสหากปฏิบัติตาม NOTAM ได้ครบ</span>
            <b id="notam-bonus">—</b>
          </div>
          <div class="notam-ledger-row warn">
            <span>โทษหากจรวดหลุดกรอบ (Sky Hazard Violation)</span>
            <b id="notam-pen">—</b>
          </div>
        </div>

        <div class="notam-risk" id="notam-risk"></div>

        <footer class="notam-foot">
          <button class="btn btn-ghost" id="notam-cancel">← กลับไปแก้จรวด</button>
          <button class="btn btn-primary" id="notam-file">📄 ยื่นคำขอ NOTAM &amp; ไปขั้นตอนขออนุญาต →</button>
        </footer>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector("#notam-brief-img").src = IMG + "pchang.png";
    overlay.querySelector("#notam-brief-text").textContent =
      "เราต้องเตือนอากาศยานลำอื่นล่วงหน้า — ประเมิน “ความสูงสูงสุด (apogee)” กับ “ระยะที่ลมพัดจรวดเบี่ยง (drift)” ของคุณให้แม่น " +
      "แล้วขอห้วงอากาศให้ครอบคลุมพอดี ถ้าจรวดทะลุเพดานหรือหลุดรัศมีที่ขอไว้ เราโดน “Sky Hazard Violation” ตาม พ.ร.บ.การเดินอากาศทันที " +
      "ขอเผื่อไว้เยอะก็ปลอดภัย แต่เปลืองงบปฏิบัติการ ขอกระชับก็ได้โบนัสงาม—ถ้าคุณคำนวณแม่นพอ";

    const ceil = overlay.querySelector("#notam-ceil");
    const rad = overlay.querySelector("#notam-rad");
    ceil.addEventListener("input", refresh);
    rad.addEventListener("input", refresh);
    overlay.querySelector("#notam-cancel").addEventListener("click", () => { overlay.hidden = true; });
    overlay.querySelector("#notam-file").addEventListener("click", fileIt);
  }

  function refresh() {
    if (!state) return;
    const ceil = +overlay.querySelector("#notam-ceil").value;
    const rad = +overlay.querySelector("#notam-rad").value;
    const { targetAlt, bp } = state;

    const cost = opsCost(ceil, rad, targetAlt, bp);
    const tb = tightBonus(ceil, rad, targetAlt, bp);
    const fb = flatBonus(bp);
    const pen = violationPen(bp);

    state.live = { ceiling: ceil, radius: rad, cost, potentialBonus: tb, complianceBonus: fb, violationPenalty: pen };

    overlay.querySelector("#notam-ceil-out").textContent = mDisp(ceil);
    overlay.querySelector("#notam-rad-out").textContent = mDisp(rad);
    overlay.querySelector("#notam-cost").textContent = "−" + fmt(cost);
    overlay.querySelector("#notam-bonus").textContent = "+" + fmt(fb) + (tb ? "  (+" + fmt(tb) + " ขอกระชับ)" : "");
    overlay.querySelector("#notam-pen").textContent = "−" + fmt(pen);

    const est = state.est;
    overlay.querySelector("#notam-est").textContent =
      "เป้าหมาย ~" + mDisp(est.apo) + " · ลมพัดเบี่ยง ~" + mDisp(est.drift);

    const cMargin = ceil / Math.max(1, est.apo);
    const rMargin = rad / Math.max(1, est.drift);
    overlay.querySelector("#notam-ceil-hint").textContent =
      cMargin >= 1.25 ? "เผื่อเหนือเป้าหมายไว้ดี" : cMargin >= 1.0 ? "เฉียดเป้าหมาย — ถ้าจรวดแรงกว่าคาดจะทะลุ" : "⚠ ต่ำกว่าเป้าหมายภารกิจ";
    overlay.querySelector("#notam-rad-hint").textContent =
      rMargin >= 1.5 ? "เผื่อรัศมีไว้ดี" : rMargin >= 1.0 ? "เฉียด — ลมแรงกว่านี้อาจหลุด" : "⚠ แคบกว่าที่ลมน่าจะพัด";

    const risk = overlay.querySelector("#notam-risk");
    if (cMargin < 1 || rMargin < 1) {
      risk.className = "notam-risk hi";
      risk.textContent = "ความเสี่ยงสูง: การประเมินบอกว่าจรวดน่าจะหลุดกรอบที่ขอ — เพิ่มเพดาน/รัศมี หรือมั่นใจว่าออกแบบเบากว่าที่ประเมิน";
    } else if (cMargin < 1.15 || rMargin < 1.3) {
      risk.className = "notam-risk mid";
      risk.textContent = "ความเสี่ยงปานกลาง: กรอบพอดีตัว ถ้าคำนวณแม่นจะได้โบนัสงาม";
    } else {
      risk.className = "notam-risk lo";
      risk.textContent = "ความเสี่ยงต่ำ: กรอบกว้างพอ ปลอดภัยแต่จ่ายงบเยอะ";
    }
  }

  function fileIt() {
    if (!state || !state.live) return;
    const cb = state.onConfirm;
    state.commit(Object.assign({}, state.live));
    overlay.hidden = true;
    if (typeof cb === "function") cb();
  }

  // ---------- public ----------
  const NOTAM = {
    // run = G.run ; onConfirm เรียกเมื่อยื่นคำขอเสร็จ
    open(run, onConfirm) {
      build();
      const targetAlt = (run.mission && run.mission.targetAltitude) || 300;
      const bp = (run.mission && run.mission.basePoints) || 800;
      const rg = ranges(targetAlt);
      const prev = run.notam;

      const ceil = overlay.querySelector("#notam-ceil");
      const rad = overlay.querySelector("#notam-rad");
      ceil.min = rg.ceil.lo; ceil.max = rg.ceil.hi; ceil.step = rg.ceil.step;
      rad.min = rg.rad.lo; rad.max = rg.rad.hi; rad.step = rg.rad.step;
      ceil.value = prev ? clamp(prev.ceiling, rg.ceil.lo, rg.ceil.hi) : rg.ceil.def;
      rad.value = prev ? clamp(prev.radius, rg.rad.lo, rg.rad.hi) : rg.rad.def;

      const ref = "A" + String((targetAlt | 0) % 9000 + 1000) + "/" + (new Date().getFullYear() + 543).toString().slice(-2);
      overlay.querySelector("#notam-ref").textContent = ref;

      state = {
        targetAlt, bp,
        est: engineerEstimate(run),
        onConfirm,
        commit: n => { run.notam = Object.assign({ ref }, n); }
      };
      refresh();
      overlay.hidden = false;
    },

    // ประเมินผลหลังบิน — เรียกจาก main.showReport()
    // คืน { status, rows:[[label,val,pos]], breachCeil, breachRad, maxAlt, drift }
    assess(summary, notam) {
      const maxAlt = summary.maxAltitude != null ? summary.maxAltitude : (summary.apogee || 0);
      const drift = Math.abs(
        summary.maxDrift != null ? summary.maxDrift
        : summary.recoveryDrift != null ? summary.recoveryDrift
        : summary.horizontalDrift || 0
      );
      const breachCeil = maxAlt > notam.ceiling;
      const breachRad = drift > notam.radius;
      const rows = [];
      rows.push([
        `งบปฏิบัติการ NOTAM ${notam.ref || ""} — สำรองห้วงอากาศ (เพดาน ${mDisp(notam.ceiling)} · รัศมี ${mDisp(notam.radius)})`,
        -(notam.cost || 0), false
      ]);

      if (!breachCeil && !breachRad) {
        const b = (notam.complianceBonus || 1000) + (notam.potentialBonus || 0);
        rows.push([
          `NOTAM Compliance Bonus — จรวดอยู่ในห้วงอากาศที่แจ้งไว้ทุกมิติ (apogee ${mDisp(maxAlt)} · drift ${mDisp(drift)})`,
          b, true
        ]);
        return { status: "COMPLIANCE", rows, breachCeil, breachRad, maxAlt, drift };
      }

      const parts = [];
      if (breachCeil) parts.push(`ทะลุเพดาน (${mDisp(maxAlt)} > ${mDisp(notam.ceiling)})`);
      if (breachRad) parts.push(`หลุดรัศมี (${mDisp(drift)} > ${mDisp(notam.radius)})`);
      rows.push([
        `⚠ Sky Hazard Violation — ${parts.join(" · ")} เสี่ยงต่ออากาศยานอื่น (พ.ร.บ.การเดินอากาศ พ.ศ. 2497)`,
        -(notam.violationPenalty || 2000), false
      ]);
      return { status: "VIOLATION", rows, breachCeil, breachRad, maxAlt, drift };
    },

    reset() { /* run.notam ถูกล้างพร้อม newRun() ใน main.js */ }
  };

  window.NOTAM = NOTAM;
})();
