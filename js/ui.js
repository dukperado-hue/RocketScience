// js/ui.js — Phase 3
// FlightHUD: แถบ HUD ล่างจอระหว่างปล่อย (แรงบันดาลใจจาก Spaceflight Simulator)
//   ซ้าย  : มาตรวัดความเร็ว (m/s)
//   ขวา   : มาตรวัดความสูง (m / km) + แถบเชื้อเพลิงไดนามิก
//   กลาง  : ปุ่ม Pitch (เชิด/กดหัว) · Yaw (ซ้าย/ขวา) สำหรับ gravity turn + ปุ่ม STAGE สลัดท่อน
//   คีย์บอร์ด: W/↑ = เชิดหัว, S/↓ = กดหัว, A/← = หันซ้าย, D/→ = หันขวา, Space = STAGE
//
// ใช้ผ่าน  window.FlightHUD.mount({ initialPitch, onPitch, onYaw, onStage })
//          window.FlightHUD.update(state, flight)   ทุกเฟรม
//          window.FlightHUD.unmount()               ตอนจบเที่ยวบิน

(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const PITCH_STEP = 4;          // องศาต่อการกด 1 ครั้ง / ต่อ tick ค้าง
  const HOLD_MS = 110;           // อัตราซ้ำเมื่อกดค้าง

  let el, hooks = {}, pitchDeg = 0;
  let holdTimer = null, keyDown = null, keyUp = null, mounted = false;

  const nf = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

  function press(ctl, srcBtn) {
    if (!mounted) return;
    if (srcBtn) { srcBtn.classList.add("pressed"); setTimeout(() => srcBtn && srcBtn.classList.remove("pressed"), 90); }
    switch (ctl) {
      case "pitch-up":                                   // เชิดหัวกลับสู่แนวดิ่ง
        pitchDeg = clamp(pitchDeg - PITCH_STEP);
        hooks.onPitch && hooks.onPitch(-PITCH_STEP, pitchDeg); break;
      case "pitch-down":                                 // กดหัวเอียงตาม gravity turn
        pitchDeg = clamp(pitchDeg + PITCH_STEP);
        hooks.onPitch && hooks.onPitch(+PITCH_STEP, pitchDeg); break;
      case "yaw-left":  hooks.onYaw && hooks.onYaw(-1); break;
      case "yaw-right": hooks.onYaw && hooks.onYaw(1); break;
      case "stage":     hooks.onStage && hooks.onStage(); break;
    }
  }
  function clamp(d) { return Math.max(-85, Math.min(85, d)); }

  function startHold(ctl, btn) {
    stopHold();
    press(ctl, btn);
    if (ctl === "stage") return;                         // STAGE ไม่ต้องซ้ำ
    holdTimer = setInterval(() => press(ctl, btn), HOLD_MS);
  }
  function stopHold() { if (holdTimer) { clearInterval(holdTimer); holdTimer = null; } }

  function bindButtons() {
    el.querySelectorAll(".fhud-btn").forEach((btn) => {
      const ctl = btn.dataset.ctl;
      btn.addEventListener("pointerdown", (e) => { e.preventDefault(); startHold(ctl, btn); });
      btn.addEventListener("pointerup", stopHold);
      btn.addEventListener("pointerleave", stopHold);
      btn.addEventListener("pointercancel", stopHold);
    });
  }

  const KEYMAP = {
    KeyW: "pitch-up", ArrowUp: "pitch-up",
    KeyS: "pitch-down", ArrowDown: "pitch-down",
    KeyA: "yaw-left", ArrowLeft: "yaw-left",
    KeyD: "yaw-right", ArrowRight: "yaw-right",
    Space: "stage"
  };
  function bindKeys() {
    keyDown = (e) => {
      const ctl = KEYMAP[e.code];
      if (!ctl) return;
      e.preventDefault();
      if (ctl === "stage") { if (!e.repeat) press("stage", btnFor("stage")); return; }
      if (!e.repeat) { press(ctl, btnFor(ctl)); }
      else press(ctl, btnFor(ctl));                       // ปล่อยให้ auto-repeat ของ OS ขับ
    };
    keyUp = () => {};
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
  }
  function btnFor(ctl) { return el ? el.querySelector('.fhud-btn[data-ctl="' + ctl + '"]') : null; }

  function mount(h) {
    el = $("flight-hud");
    if (!el) return;
    hooks = h || {};
    pitchDeg = (hooks.initialPitch | 0) || 0;
    el.hidden = false;
    if (!mounted) { bindButtons(); bindKeys(); mounted = true; }
    update({ vx: 0, vy: 0, y: 0, fuelFrac: 1, stage: 0, stageCount: 1, phase: "pad" });
  }

  function update(s, flight) {
    if (!el || el.hidden) return;
    const spd = Math.hypot(s.vx || 0, s.vy || 0);
    setText("fhud-speed", nf(spd));

    const y = s.y || 0, km = y >= 1000;
    setText("fhud-alt", km ? (y / 1000).toFixed(1) : nf(y));
    setText("fhud-alt-unit", km ? "km" : "m");

    const f = Math.max(0, Math.min(1, s.fuelFrac == null ? 1 : s.fuelFrac));
    const fill = $("fhud-fuel");
    if (fill) {
      fill.style.width = (f * 100).toFixed(1) + "%";
      fill.style.background = f > 0.35 ? "var(--fhud-ok)" : f > 0.12 ? "var(--fhud-warn)" : "var(--fhud-low)";
    }

    const pd = flight && flight.control ? Math.round(flight.control.pitchDeg) : Math.round(pitchDeg);
    setText("fhud-pitch", "PITCH " + pd + "°");

    const stageBtn = btnFor("stage");
    if (stageBtn) {
      const canStage = (s.stage || 0) < ((s.stageCount || 1) - 1) &&
        (s.phase === "boost" || s.phase === "coast");
      stageBtn.classList.toggle("ready", !!canStage);
    }
  }

  function setText(id, v) { const n = $(id); if (n) n.textContent = v; }

  function unmount() {
    stopHold();
    if (el) el.hidden = true;
    hooks = {};
  }

  window.FlightHUD = { mount, update, unmount };
})();
