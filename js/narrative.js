// js/narrative.js — Phase 3 → Phase 5
//   บทบรรยาย/สรุปผล เปลี่ยนไปใช้ระบบ Visual Novel (js/vn.js) แล้ว —
//   ไฟล์นี้เหลือ (1) shim ให้ window.Narrative เดิม ชี้ไป window.VN
//                (2) "พี่ช่าง" (CAPCOM) + "กะปิ" (Operator) สำหรับบรรยายสด/สีหน้าระหว่างปล่อย

(function () {
  "use strict";
  // Narrative shim → VN
  window.Narrative = {
    missionIntro(m) { /* ย้ายไป VN.atVab(rocket) ตอนเข้าหน้าประกอบ */ },
    debrief(sum, run) { if (window.VN) window.VN.atReport(sum, run); },
    play(lines, opts) {
      if (!window.VN) { opts && opts.onDone && opts.onDone(); return; }
      const entries = (lines || []).map(l => typeof l === "string" ? { text: l } : { who: l.who, text: l.text });
      window.VN.play(entries, opts || {});
    },
    skip() { window.VN && window.VN.skip(); }
  };
})();


/* ============================================================
   Phase 4 · "ดั๊ก" (Rubber Duck) — CAPCOM / วิศวกรอวกาศ
   บรรยายสด rapid-fire ระหว่างปล่อย: countdown, KE, TWR, q, apogee, Δv
   มีปุ่ม mute (ไอคอนเป็ดขีดทับ) เก็บสถานะใน localStorage
   ============================================================ */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const MUTE_KEY = "rocketscience-capcom-muted";
  const GAP = 1600;   // ms ระหว่างการรายงานสด

  let box, lineEl, muteBtn, muted = false, lastAt = 0, done = false, rot = 0;

  const nf = (n) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const fmtAlt = (a) => (a >= 1000 ? (a / 1000).toFixed(1) + " km" : Math.round(a) + " m");
  const twr = (flight) => {
    try { return (flight.stages[0].thrust / (flight.glow * 9.80665)).toFixed(2); }
    catch (e) { return "—"; }
  };

  function readMuted() { try { return localStorage.getItem(MUTE_KEY) === "1"; } catch (e) { return false; } }
  function writeMuted(v) { try { localStorage.setItem(MUTE_KEY, v ? "1" : "0"); } catch (e) {} }

  function mount() {
    box = $("capcom"); lineEl = $("capcom-line"); muteBtn = $("capcom-mute");
    if (!box) return;
    muted = readMuted();
    done = false; lastAt = 0; rot = 0;
    box.hidden = false;
    const pt = $("capcom-portrait");
    if (pt && !pt.querySelector("img")) {
      pt.innerHTML = '<img src="assets/images/characters/pchang.png" alt="พี่ช่าง" style="width:100%;height:100%;object-fit:cover;object-position:50% 8%;border-radius:50%">';
    }
    applyMuteClass();
    if (muteBtn && !muteBtn._wired) {
      muteBtn._wired = true;
      muteBtn.addEventListener("click", toggleMute);
    }
    say("T‑3 · 2 · 1 · เตรียมปล่อย — พี่ช่าง (CAPCOM) ออนไลน์");
  }
  function applyMuteClass() {
    if (!box) return;
    box.classList.toggle("muted", muted);
    if (muteBtn) muteBtn.title = muted ? "เปิดเสียงพี่ช่าง (CAPCOM)" : "ปิดเสียงพี่ช่าง (CAPCOM)";
  }
  function toggleMute() {
    muted = !muted; writeMuted(muted); applyMuteClass();
    if (!muted) say("CAPCOM กลับมาแล้ว");
  }

  let _fade = null;
  function say(text) {
    if (!lineEl || muted) return;
    lineEl.style.opacity = "0";
    clearTimeout(_fade);
    _fade = setTimeout(() => { if (lineEl) { lineEl.textContent = text; lineEl.style.opacity = "1"; } }, 110);
  }

  // การรายงานสดตามเฟส (throttle)
  function feed(s, flight) {
    if (!box || done || muted) return;
    const now = performance.now();
    if (now - lastAt < GAP) return;
    lastAt = now;
    const v = Math.hypot(s.vx || 0, s.vy || 0);
    const orbital = flight && flight.config && flight.config.orbital;
    let line;
    if (s.phase === "boost") {
      const pool = [
        () => `V ${nf(v)} m/s · M ${(s.mach || 0).toFixed(1)}`,
        () => `KE ½mv² ≈ ${nf(0.5 * (s.mass || 1) * v * v / 1e6)} MJ`,
        () => `q ${(s.q / 1000).toFixed(1)} kPa · ALT ${fmtAlt(s.y)}`,
        () => `เชื้อเพลิง ${Math.round((s.fuelFrac == null ? 1 : s.fuelFrac) * 100)}% · ไต่ ${nf(s.vy)} m/s`,
        () => orbital
          ? `Δv budget ${nf(flight.deltaVBudget)} / ต้องใช้ ${nf(flight.deltaVRequired)} m/s`
          : `downrange ${(Math.abs(s.x) / 1000).toFixed(1)} km · TWR ${(s.thrustNow / Math.max(1, s.mass * 9.80665)).toFixed(2)}`
      ];
      line = pool[rot++ % pool.length]();
    } else if (s.phase === "coast" || s.phase === "descent") {
      line = `ร่อนอิสระ · ALT ${fmtAlt(s.y)} · V ${nf(v)} m/s`;
    } else if (s.phase === "insertion" || s.phase === "orbit") {
      line = `ในวงโคจร · V ${nf(v)} m/s`;
    } else if (s.phase === "reentry") {
      line = `re‑entry · V ${nf(v)} m/s · ความร้อนพลศาสตร์พีค q̇∝ρv³`;
    } else return;
    say(line);
  }

  // เหตุการณ์สำคัญ — รายงานทันที
  function event(e, flight) {
    if (!box || muted) return;
    const k = e.k;
    lastAt = performance.now();
    switch (k) {
      case "ignition":
        say(`รับช่วงต่อจากสำลี — 3·2·1 จุดระเบิด • TWR ${twr(flight)} ไต่ขึ้น`); break;
      case "maxq":
        say(`Max‑Q — ผ่านจุดแรงดันพลวัตสูงสุด, โครงยานรับภาระหนักสุดตรงนี้`); break;
      case "staging":
        say(`แยกท่อน${e.manual ? " (สั่งมือ)" : ""} — sep ยืนยัน • ท่อน ${e.stage} ติดไฟ`); break;
      case "guidance-cutoff":
        say(`guidance ตัดเครื่อง — projected apogee ถึงเป้าแล้ว ประหยัดเชื้อเพลิง`); break;
      case "cutoff":
        say(`MECO • ดับเครื่องท่อนสุดท้าย ร่อนอิสระสู่ apogee`); break;
      case "apogee":
        say(`apogee ${fmtAlt(e.alt || 0)} — เริ่มตกกลับ`); break;
      case "orbit":
        say(`เข้าวงโคจรยืนยัน • ${nf((e.apoapsis || 0) / 1000)}×${nf((e.periapsis || 0) / 1000)} km`); done = true; break;
      case "orbit-fail":
        say(`ความเร็วขาด ~${nf(e.short || 0)} m/s — รอบนี้ไม่เข้าวงโคจร`); break;
      case "unstable":
        say(`ยานส่าย! CG เลื่อนไปท้าย — กะปิเริ่มเหงื่อแตกแล้ว`); break;
      case "bangfai-wobble":
        say(`บั้งไฟรำดาบ! หางคุมแกนไม่อยู่ ควงเป็นเกลียวเสียความสูง`); break;
      case "reentry":
        say(`re‑entry interface — ความร้อนพีค`); break;
      case "burnup":
      case "lantern-burnup":
        say(`สูญเสียยาน — ความร้อน`); done = true; break;
      case "pad-explosion":
        say(`CATO — สูญเสียยานคาแท่นปล่อย`); done = true; break;
      case "crash":
        say(`กระแทกพื้น — ยานเสียหาย`); done = true; break;
      case "landing":
        say(`แตะพื้น — จบภารกิจ`); done = true; break;
      case "chute-deploy":
        say(`ร่มกาง! แรงต้านพุ่ง ความเร็วแตะพื้นลดฮวบ — terminal velocity ~½ρv²·Cd·A สมดุลกับน้ำหนัก`); break;
      case "retro-burn":
        say(`retro-burn! จุดเครื่องเบรก เผาเชื้อเพลิงสำรอง suicide burn แบบ Falcon 9`); break;
      case "soft-landing":
        say(`ลงจอดนุ่มนวล — กู้ยานคืนได้ กะปิรอดด้วย`); done = true; break;
      case "landing-burn-fail":
        say(`เชื้อเพลิงสำรองหมดก่อนแตะพื้น — ตกกระแทก กะปิยืนอยู่ตรงนั้นพอดี`); done = true; break;
    }
  }

  function unmount() { done = true; if (box) box.hidden = true; }

  window.Capcom = { mount, feed, event, toggleMute, unmount, get muted() { return muted; } };
})();


/* ============================================================
   Phase 4 · "คาปิบารา" (Capybara) — The Operator (เงียบ ไม่มีบทพูด)
   สื่ออารมณ์ผ่านการสลับสีหน้า/พื้นหลังตามสถานะการบินเท่านั้น
   idle 😐 · watch 👀 · sweat 😰 · chill 😎 · dead 😵
   (placeholder — สลับเป็นรูป capybara_sweat.png ฯลฯ ได้ภายหลังด้วย [data-mood])
   ============================================================ */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const EMOJI = { idle: "😐", watch: "👀", sweat: "😰", chill: "😎", dead: "😵" };
  const RANK = { idle: 0, watch: 1, chill: 2, sweat: 3, dead: 4 };
  let el, face, locked = false;

  function mount() {
    el = $("operator"); face = $("operator-face");
    if (!el) return;
    locked = false; el.hidden = false;
    if (face && !face.querySelector("img")) {
      face.innerHTML = '<img src="assets/images/characters/kapi.png" alt="กะปิ" class="operator-img">' +
        '<span class="operator-mood"></span>';
    }
    const lbl = el.querySelector(".operator-label");
    if (lbl) lbl.textContent = "กะปิ";
    set("idle");
  }
  function set(m) {
    if (!el || !EMOJI[m]) return;
    el.dataset.mood = m;
    if (face) {
      const badge = face.querySelector(".operator-mood");
      if (badge) badge.textContent = EMOJI[m];
      else face.textContent = EMOJI[m];
    }
  }
  // ระหว่างบิน: ยกระดับอารมณ์ได้ ไม่ลดกลับเอง (ตึงเครียดสะสม)
  function setMood(m) {
    if (locked) return;
    if (RANK[m] == null) return;
    if (el && el.dataset.mood && RANK[m] < RANK[el.dataset.mood] && el.dataset.mood !== "chill") return;
    set(m);
  }
  function event(k) {
    if (k === "ignition") setMood("watch");
    else if (k === "maxq" || k === "unstable" || k === "bangfai-wobble" || k === "guidance-cutoff" || k === "reentry" || k === "retro-burn") setMood("sweat");
    else if (k === "burnup" || k === "lantern-burnup" || k === "pad-explosion" || k === "crash" || k === "landing-burn-fail") { set("dead"); locked = true; }
    else if (k === "orbit" || k === "landing" || k === "soft-landing") { set("chill"); locked = true; }
  }
  function result(sum) {
    locked = false;
    const m = (sum.burnedUp || sum.padExplosion) ? "dead"
      : (sum.reachedOrbit || sum.apogee >= (sum.targetAltitude || 1) * 0.9) ? "chill"
      : sum.crashed ? "dead" : "watch";
    set(m); locked = true;
  }
  function unmount() { if (el) el.hidden = true; }

  window.Operator = { mount, setMood, event, result, unmount };
})();
