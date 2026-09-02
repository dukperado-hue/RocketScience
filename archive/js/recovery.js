// js/recovery.js — Phase 5 · ระบบกู้คืน / ลงจอด (Recovery & Landing)
//   เลือกใน VAB — มีผลตอนจรวดตกกลับหลัง apogee / re-entry
//     freefall   : มวล 0 · ลมพัดเป๋ → โซนตกกว้าง · ถ้าลงเองแบบไม่นำวิถี = ค่าเสียหายทรัพย์สิน (Liability)
//     gps        : +0.5 kg · ลดพื้นที่ค้นหา ลดค่าปรับ · พี่ช่างบอกความน่าจะเป็นการกู้คืน
//     parachute  : +มวล +แรงต้านมหาศาลตอนร่อนลง → ความเร็วแตะพื้นต่ำ → กู้คืนปลอดภัย (คืนงบ + โบนัส)
//     propulsive : Tier 4–5 เท่านั้น · กันงบ Δv ไว้จุดเครื่องเบรกก่อนแตะพื้น
//                  ถ้า Δv ที่กันไว้ไม่พอ → ยานตก (Tier 4) / บูสเตอร์หาย (Tier 5)
//
//  window.Recovery.render(host, { rocket, tier }, onChange)
//  window.Recovery.derived(rocket, ascent)  → { kind, massAdd, dragAdd, dvReserve, recFuel, deployAlt, note }
//  window.Recovery.state = { kind }

(function () {
  "use strict";
  const G0 = 9.80665;

  const SYSTEMS = {
    freefall: {
      th: "ตกอิสระ", sub: "มวล 0 · ไม่นำวิถี", massAdd: 0, dragAdd: 0, dvReserve: 0,
      hint: "ถูกที่สุด แต่ลมพัดเป๋ ถ้าตกใส่ทรัพย์สิน = รับผิดตาม Liability Convention"
    },
    gps: {
      th: "เครื่องส่งพิกัด GPS", sub: "+0.5 kg", massAdd: 0.5, dragAdd: 0, dvReserve: 0,
      hint: "ยังตกอิสระ แต่รู้พิกัดจุดตก ลดพื้นที่ค้นหา ลดค่าปรับความเสียหาย"
    },
    parachute: {
      th: "ร่มชูชีพ", sub: "+มวล +แรงต้าน", massAdd: 1.5, dragAdd: 16, dvReserve: 0,
      hint: "กางที่ ~1.2 กม. ลดความเร็วแตะพื้น กู้ชิ้นส่วนกลับมาใช้ได้ (คืนงบ) ตามมาตรฐานความปลอดภัย"
    },
    propulsive: {
      th: "ลงจอดด้วยแรงขับ (สไตล์ Elon)", sub: "Tier 4–5 · กัน Δv", massAdd: 0.8, dragAdd: 0, dvReserve: 600,
      hint: "กัน Δv ไว้ทั้ง entry-burn (ลดความเร็วก่อนชนอากาศ) และ landing-burn ก่อนแตะพื้น ยานที่กลับจากที่สูงมากต้องกันเยอะ ถ้าไม่พอ = ตกกระแทก (กะปิซวย)"
    }
  };
  const DV_MIN = 200, DV_MAX = 3000;

  const state = { kind: "freefall", dvReserve: SYSTEMS.propulsive.dvReserve };
  let _host = null, _onChange = null, _ctx = { rocket: null, tier: 1 };

  function applicableKinds(tier) {
    return Object.keys(SYSTEMS).filter(k => k !== "propulsive" || tier >= 4);
  }

  // ascent = { landMass, isp, deltaVMargin? }  (จาก main.js)
  function derived(rocket, ascent) {
    ascent = ascent || {};
    let kind = state.kind;
    const tier = (window.TIERS && rocket && window.TIERS[rocket.tierKey] && window.TIERS[rocket.tierKey].n) || _ctx.tier || 1;
    if (kind === "propulsive" && tier < 4) kind = "freefall";
    const s = SYSTEMS[kind];

    const deployAlt = kind === "parachute"
      ? (tier <= 2 ? 700 : tier === 3 ? 3500 : 6000)
      : 0;

    let recFuel = 0;
    if (kind === "propulsive") {
      const isp = ascent.isp || 260;
      const mLand = Math.max(1, ascent.landMass || 50);
      // Δv สำรอง → มวลเชื้อเพลิงที่ต้องกันไว้ (Tsiolkovsky ย้อน)
      recFuel = mLand * (Math.exp(state.dvReserve / (isp * G0)) - 1) * 1.08;
    }

    return {
      kind,
      massAdd: s.massAdd,
      dragAdd: s.dragAdd,
      dvReserve: kind === "propulsive" ? state.dvReserve : 0,
      recFuel,
      deployAlt,
      aMax: 55,
      note: s.hint
    };
  }

  // ---- UI ----
  function render(host, ctx, onChange) {
    _host = host; _onChange = onChange || null;
    _ctx = Object.assign({ rocket: null, tier: 1 }, ctx || {});
    if (!host) return;
    host.hidden = false;
    const tier = _ctx.tier;
    const kinds = applicableKinds(tier);
    if (!kinds.includes(state.kind)) state.kind = "freefall";
    const d = derived(_ctx.rocket, _ctx.ascent || {});
    const cur = SYSTEMS[state.kind];

    let html = `<div class="vx-title">ระบบกู้คืน / ลงจอด <span class="vx-tag">Recovery</span></div>
      <div class="rc-grid">
        ${kinds.map(k => {
          const s = SYSTEMS[k];
          return `<button type="button" class="rc-opt${state.kind === k ? " on" : ""}" data-rec="${k}">
            <b>${s.th}</b><span>${s.sub}</span></button>`;
        }).join("")}
      </div>
      <div class="vx-note">${cur.hint}</div>`;

    if (state.kind === "propulsive") {
      html += `<div class="vx-group">
        <div class="vx-label">Δv ที่กันไว้สำหรับลงจอด <b>${state.dvReserve}</b> m/s</div>
        <input type="range" class="vx-range" id="rc-dv" min="${DV_MIN}" max="${DV_MAX}" step="50" value="${state.dvReserve}">
        <div class="vx-hint">กัน Δv ขาขึ้นไว้ ${state.dvReserve} m/s (~${(d.recFuel || 0).toFixed(1)} kg เชื้อเพลิง) · ยานที่กลับจากที่สูงต้องกัน 1500–2500+</div>
      </div>`;
    } else if (state.kind === "parachute") {
      html += `<div class="vx-hint">กางร่มที่ ~${d.deployAlt} m · +${SYSTEMS.parachute.massAdd} kg</div>`;
    } else if (state.kind === "gps") {
      html += `<div class="vx-hint">+${SYSTEMS.gps.massAdd} kg · ความน่าจะเป็นการกู้คืนขึ้นกับระยะลมพัดเป๋</div>`;
    }

    host.innerHTML = html;
    host.querySelectorAll("[data-rec]").forEach(b =>
      b.addEventListener("click", () => { state.kind = b.dataset.rec; rebuild(); }));
    const dv = host.querySelector("#rc-dv");
    if (dv) dv.addEventListener("input", () => {
      state.dvReserve = +dv.value;
      const lbl = host.querySelector(".vx-label b"); if (lbl) lbl.textContent = state.dvReserve;
      const dd = derived(_ctx.rocket, _ctx.ascent || {});
      const h = host.querySelector(".vx-hint");
      if (h) h.textContent = `กัน Δv ขาขึ้นไว้ ${state.dvReserve} m/s (~${(dd.recFuel || 0).toFixed(1)} kg เชื้อเพลิง) · ยานที่กลับจากที่สูงต้องกัน 1500–2500+`;
      notify();
    });
  }

  function notify() { if (_onChange) { try { _onChange(); } catch (e) { console.warn("[Recovery] onChange", e); } } }
  function rebuild() { render(_host, _ctx, _onChange); notify(); }

  window.Recovery = { render, derived, state, SYSTEMS, applicableKinds };
})();
