// js/vab.js — Phase 5 · การประกอบจรวดพื้นบ้าน Tier 1–2 (โครงสร้าง + พันลวด + เคมีดินขับ)
//   ต่อยอด VAB โหมด classic ใน main.js — เพิ่มแผงตัวเลือก:
//     • ลำ (Body): ท่อ PVC (เบา ทนความดันต่ำ) หรือ ไม้ไผ่ (หนัก แข็งแรง)
//     • พันลวดเสริม (มัดลวด 0–1000 รอบ): เพิ่มพิกัดความดัน แต่เพิ่มมวล
//     • ผสมดินขับแข็ง: ดินประสิว / ถ่าน / กำมะถัน (ผ่าน js/chemistry.js)
//
//  main.js เรียก:
//    VabExtras.render(hostEl, { showBody, showChem, rocket }, onChange)
//    VabExtras.derived(rocket)  →  { showBody, showChem, casingCapMul, dryMassMul, wireMass, chem }
//    VabExtras.state            →  { body, wire, chem:{saltpeter,charcoal,sulfur} }

(function () {
  "use strict";

  const BODY = {
    pvc: { th: "ท่อ PVC", capMul: 0.78, dryMassMul: 0.86, hint: "เบา · ทนความดันต่ำ" },
    bamboo: { th: "ไม้ไผ่", capMul: 1.42, dryMassMul: 1.28, hint: "หนัก · แข็งแรงกว่า" }
  };
  const WIRE_MAX = 1000;
  const WIRE_MASS_PER_100 = 0.35;     // kg ต่อ 100 รอบ
  const WIRE_CAP_AT_MAX = 0.9;        // +90% พิกัดความดันที่ 1000 รอบ

  const state = {
    body: "pvc",
    wire: 0,
    chem: { saltpeter: 75, charcoal: 15, sulfur: 10 }
  };
  let _host = null, _onChange = null, _ctx = { showBody: false, showChem: false, rocket: null };

  function wireMass() { return (state.wire / 100) * WIRE_MASS_PER_100; }
  function wireCapMul() { return 1 + (state.wire / WIRE_MAX) * WIRE_CAP_AT_MAX; }

  function chemEval() {
    const c = state.chem;
    return window.Chemistry
      ? window.Chemistry.evaluate({ saltpeter: c.saltpeter, charcoal: c.charcoal, sulfur: c.sulfur })
      : { thrustMul: 1, ispMul: 1, burnRateMul: 1, altitudeMul: 1, catoRisk: 0, ignitionRisk: 0, quality: "—", note: "", mix: { saltpeter: .75, charcoal: .15, sulfur: .10 } };
  }

  function derived(rocket) {
    const showBody = _ctx.showBody, showChem = _ctx.showChem;
    const b = BODY[state.body] || BODY.pvc;
    return {
      showBody, showChem,
      body: state.body,
      casingCapMul: showBody ? b.capMul * wireCapMul() : 1,
      dryMassMul: showBody ? b.dryMassMul : 1,
      wireMass: showBody ? wireMass() : 0,
      chem: chemEval()
    };
  }

  // -------- UI --------
  function bar(v, max, cls) {
    const pct = Math.max(0, Math.min(1, v / max)) * 100;
    return `<span class="vx-bar"><span class="vx-bar-fill ${cls || ""}" style="width:${pct.toFixed(0)}%"></span></span>`;
  }

  function render(host, ctx, onChange) {
    _host = host; _onChange = onChange || null;
    _ctx = Object.assign({ showBody: false, showChem: false, rocket: null }, ctx || {});
    if (!host) return;
    if (!_ctx.showBody && !_ctx.showChem) { host.innerHTML = ""; host.hidden = true; return; }
    host.hidden = false;

    const b = BODY[state.body] || BODY.pvc;
    const ch = chemEval();
    const norm = ch.mix;

    let html = `<div class="vx-title">โครงสร้าง &amp; เคมีดินขับ <span class="vx-tag">พื้นบ้าน</span></div>`;

    if (_ctx.showBody) {
      html += `<div class="vx-group">
        <div class="vx-label">ลำจรวด (Body)</div>
        <div class="vx-seg">
          ${Object.keys(BODY).map(k => `<button type="button" class="vx-seg-btn${state.body === k ? " on" : ""}" data-body="${k}">${BODY[k].th}</button>`).join("")}
        </div>
        <div class="vx-hint">${b.hint} · พิกัดความดัน ×${b.capMul.toFixed(2)} · มวลโครง ×${b.dryMassMul.toFixed(2)}</div>
      </div>
      <div class="vx-group">
        <div class="vx-label">พันลวดเสริม (มัดลวด) <b>${state.wire}</b> รอบ</div>
        <input type="range" class="vx-range" id="vx-wire" min="0" max="${WIRE_MAX}" step="50" value="${state.wire}">
        <div class="vx-hint">+พิกัดความดัน ${((wireCapMul() - 1) * 100).toFixed(0)}% · +มวล ${wireMass().toFixed(2)} kg</div>
      </div>`;
    }

    if (_ctx.showChem) {
      const rows = [
        ["saltpeter", "ดินประสิว (มูลค้างคาว)", "#C9A24B"],
        ["charcoal", "ถ่าน", "#5A5A5A"],
        ["sulfur", "กำมะถัน", "#D8C24A"]
      ];
      html += `<div class="vx-group vx-chem">
        <div class="vx-label">ผสมดินขับแข็ง · สูตรมาตรฐาน 75 / 15 / 10</div>
        ${rows.map(([k, th]) => `
          <div class="vx-slider">
            <span class="vx-sl-name">${th}</span>
            <input type="range" class="vx-range" data-chem="${k}" min="0" max="100" step="1" value="${state.chem[k]}">
            <span class="vx-sl-val">${Math.round(norm[k] * 100)}%</span>
          </div>`).join("")}
        <button type="button" class="vx-reset" id="vx-chem-reset">คืนสูตรมาตรฐาน</button>
        <div class="vx-readout">
          <div class="vx-quality vx-q-${qClass(ch.quality)}">${ch.quality}</div>
          <div class="vx-note">${ch.note}</div>
          <div class="vx-metrics">
            <div>แรงขับ ${bar(ch.thrustMul, 1.8, "")}</div>
            <div>อัตราเผา ${bar(ch.burnRateMul, 2.2, "")}</div>
            <div>เพดานสูง ${bar(ch.altitudeMul, 1, ch.altitudeMul < 0.6 ? "warn" : "")}</div>
            <div>เสี่ยง CATO ${bar(ch.catoRisk, 2, ch.catoRisk >= 1 ? "bad" : ch.catoRisk > 0.5 ? "warn" : "")}</div>
          </div>
        </div>
      </div>`;
    }

    host.innerHTML = html;
    wire(host);
  }

  function qClass(q) {
    return q === "ดีเยี่ยม" ? "good" : q === "ใช้ได้" ? "ok"
      : q === "อันตราย" ? "bad" : q === "อ่อน" || q === "จุดยาก" ? "warn" : "meh";
  }

  function wire(host) {
    // structural = full re-render (ปุ่ม body / ปุ่มรีเซ็ต)
    host.querySelectorAll("[data-body]").forEach(btn =>
      btn.addEventListener("click", () => { state.body = btn.dataset.body; rebuild(); }));
    const rst = host.querySelector("#vx-chem-reset");
    if (rst) rst.addEventListener("click", () => {
      state.chem = { saltpeter: 75, charcoal: 15, sulfur: 10 }; rebuild();
    });
    // live = อัปเดตค่าที่อ่านในที่ ไม่สร้าง DOM ใหม่ (สไลเดอร์ไม่หลุดโฟกัสตอนลาก)
    const w = host.querySelector("#vx-wire");
    if (w) w.addEventListener("input", () => { state.wire = +w.value; liveUpdate(host); notify(); });
    host.querySelectorAll("[data-chem]").forEach(sl =>
      sl.addEventListener("input", () => { state.chem[sl.dataset.chem] = +sl.value; liveUpdate(host); notify(); }));
  }

  function liveUpdate(host) {
    const ch = chemEval(), norm = ch.mix;
    host.querySelectorAll(".vx-slider").forEach(row => {
      const sl = row.querySelector("[data-chem]"), val = row.querySelector(".vx-sl-val");
      if (sl && val) val.textContent = Math.round(norm[sl.dataset.chem] * 100) + "%";
    });
    const wHint = host.querySelector("#vx-wire") && host.querySelector("#vx-wire").closest(".vx-group");
    if (wHint) {
      const lbl = wHint.querySelector(".vx-label b"); if (lbl) lbl.textContent = state.wire;
      const h = wHint.querySelector(".vx-hint");
      if (h) h.textContent = `+พิกัดความดัน ${((wireCapMul() - 1) * 100).toFixed(0)}% · +มวล ${wireMass().toFixed(2)} kg`;
    }
    const ro = host.querySelector(".vx-readout");
    if (ro) {
      ro.innerHTML = `
        <div class="vx-quality vx-q-${qClass(ch.quality)}">${ch.quality}</div>
        <div class="vx-note">${ch.note}</div>
        <div class="vx-metrics">
          <div>แรงขับ ${bar(ch.thrustMul, 1.8, "")}</div>
          <div>อัตราเผา ${bar(ch.burnRateMul, 2.2, "")}</div>
          <div>เพดานสูง ${bar(ch.altitudeMul, 1, ch.altitudeMul < 0.6 ? "warn" : "")}</div>
          <div>เสี่ยง CATO ${bar(ch.catoRisk, 2, ch.catoRisk >= 1 ? "bad" : ch.catoRisk > 0.5 ? "warn" : "")}</div>
        </div>`;
    }
  }

  function notify() { if (_onChange) { try { _onChange(); } catch (e) { console.warn("[VabExtras] onChange", e); } } }
  function rebuild() { render(_host, _ctx, _onChange); notify(); }

  window.VabExtras = { render, derived, state, BODY };
})();
