// js/narrative.js — Phase 3
// "ลี" (Lee) — แมวสยามสไตล์โยไค หัวหน้าวิศวกร & ที่ปรึกษากฎหมายของทีม
//   - พูดด้วยเอฟเฟกต์พิมพ์ดีด (typewriter) แบบ RPG ก่อน/หลังภารกิจ และเมื่อผู้เล่นล้มเหลว
//   - อธิบาย "ทำไม" ด้วยทฤษฎีจริง (Newton, Tsiolkovsky, TWR, q̇∝ρv³) ผูกกับข้อกฎหมายที่เกี่ยว
//
// window.Narrative.missionIntro(mission)
// window.Narrative.debrief(summary, run)
// window.Narrative.play(lines, { mood, onDone })

(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const SPEED = 16;   // ms ต่อตัวอักษร

  let box, txt, cont, queue = [], idx = 0, typing = false, timer = null, doneCb = null, full = "";

  function ensure() {
    box = $("lee-dialogue"); txt = $("lee-text"); cont = $("lee-cont");
    const x = $("lee-x");
    if (x && !x._wired) { x._wired = true; x.addEventListener("click", (e) => { e.stopPropagation(); end(); }); }
    return !!box;
  }

  function play(lines, opts) {
    if (!ensure()) { opts && opts.onDone && opts.onDone(); return; }
    opts = opts || {};
    queue = (lines || []).filter(Boolean).map((l) => (typeof l === "string" ? { text: l, mood: opts.mood || "" } : l));
    if (!queue.length) { opts.onDone && opts.onDone(); return; }
    idx = 0; doneCb = opts.onDone || null;
    box.hidden = false;
    box.onclick = advance;
    step();
  }

  function setMood(m) { box.className = "lee" + (m ? " mood-" + m : ""); }

  function step() {
    if (idx >= queue.length) { end(); return; }
    const line = queue[idx];
    setMood(line.mood);
    full = line.text; txt.textContent = ""; cont.classList.remove("show");
    typing = true;
    let k = 0;
    clearInterval(timer);
    timer = setInterval(() => {
      txt.textContent = full.slice(0, ++k);
      if (k >= full.length) { clearInterval(timer); typing = false; cont.classList.add("show"); }
    }, SPEED);
  }

  function advance() {
    if (typing) { clearInterval(timer); txt.textContent = full; typing = false; cont.classList.add("show"); return; }
    idx++; step();
  }

  function end() {
    clearInterval(timer); typing = false;
    if (box) { box.hidden = true; box.onclick = null; }
    const cb = doneCb; doneCb = null;
    cb && cb();
  }

  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  // ---------------- เนื้อหา ----------------
  function missionIntro(m) {
    const map = {
      tier1: [
        "เมี้ยว... ภารกิจแรก โคมลอยกับพลุ ฟังดูง่าย แต่ 9 กิโลเมตรจากสนามบินคือเส้นตายตาม พ.ร.บ. การเดินอากาศ",
        "เทคโนโลยีไม่ใช่ปัญหา—กฎหมายต่างหาก จำไว้ให้ขึ้นใจ"
      ],
      tier2: [
        "บุญบั้งไฟ! สนุก แต่มีระเบียบจังหวัดกับคณะทำงาน Sky Hazard คุมอยู่",
        "และดินปืนดำเยอะ ๆ ไม่ได้แปลว่าขึ้นสูงนะ เดี๋ยวได้เห็น F = ma กับตา"
      ],
      tier3: [
        "จรวดหยั่งอากาศแล้วสิ ต้องขออนุญาต CAAT และออก NOTAM ปิดห้วงอากาศชั่วคราว",
        "ที่ความสูงระดับนี้ เครื่องบินพาณิชย์บินอยู่จริง ๆ พลาดไม่ได้"
      ],
      tier4: [
        "วิถีโค้ง sub-orbital — ชิ้นส่วนตกกลับพื้นโลกได้ ต้องคำนวณ ellipse จุดตกและปิดห้วงอากาศหวงห้าม",
        "ระบบป้องกันภัยทางอากาศก็จ้องอยู่ อย่าให้เขาเข้าใจผิดว่าเป็นภัยคุกคาม"
      ],
      tier5: [
        "วงโคจร! Δv คือทุกสิ่ง สมการ Tsiolkovsky จะเป็นเพื่อนหรือศัตรูก็ตรงนี้",
        "Outer Space Treaty 1967 ข้อ VI: รัฐต้องรับผิดชอบการยิงของเอกชนในสังกัด และซื้อประกันตาม Liability Convention 1972"
      ]
    };
    const lines = (map[m.tierKey] || ["เมี้ยว ไปกันเลย"]).slice();
    lines.push("เดี๋ยวดั๊ก (CAPCOM) กับคาปิบาราดูหน้างานตอนปล่อยให้ — ฉันเจอนายอีกทีตอนสรุปผล");
    play(lines, { mood: "" });
  }

  function lawNugget(run) {
    const t = run.rocket && window.TIERS && window.TIERS[run.rocket.tierKey];
    const key = t && t.legalTier;
    return {
      tier1_lantern: "ข้อกฎหมาย: พ.ร.บ. การเดินอากาศ ม.24 ห้ามปล่อยวัตถุรบกวนการบิน + ข้อบัญญัติท้องถิ่นเรื่องโคมลอย",
      tier2_bangfai: "ข้อกฎหมาย: ต้องขออนุญาตนายอำเภอ/ผู้ว่าฯ และผ่านแผนประเมินความเสี่ยงของคณะทำงาน Sky Hazard",
      tier3_sounding_rocket: "ข้อกฎหมาย: ข้อกำหนด CAAT + NOTAM (ICAO Annex 15) + ต้องมี RSO คุมจุดปล่อย",
      tier4_ballistic: "ข้อกฎหมาย: ต้องได้รับการรับรองความมั่นคงแห่งชาติ + ประกาศเขตห้วงอากาศหวงห้าม + รายงานจุดตกกระทบ",
      tier5_orbital: "ข้อกฎหมาย: OST 1967 ข้อ VI (รัฐรับรอง), Liability Convention 1972 (absolute liability), จดคลื่น ITU"
    }[key] || "";
  }

  function successNugget(sum, run) {
    if (sum.orbital) {
      return "ทฤษฎี: Δv = Isp·g₀·ln(m₀/m_f) — นายจัดอัตราส่วนมวลได้พอดี เหลือ margin " +
        Math.round(sum.deltaVMargin) + " m/s. เกิน Kármán line (100 กม.) และแตะความเร็ววงโคจรแล้ว";
    }
    const tier = run.rocket && window.TIERS && window.TIERS[run.rocket.tierKey].n;
    if (tier >= 4) return "ทฤษฎี: วิถีกระสุนโค้ง — องค์ประกอบแนวดิ่งกำหนดเพดาน, แนวราบกำหนดระยะ; guidance ตัดเครื่องตอน projected apogee ถึงเป้าพอดี";
    if (tier === 3) return "ทฤษฎี: เหนือ Max-Q ไปแล้ว แรงต้านอากาศ q = ½ρv² ลดลงเรื่อย ๆ ตามความหนาแน่นอากาศที่บางลง";
    return "ทฤษฎี: TWR > 1 ยานถึงยกตัว; ยิ่งออกตัวเร็ว ลมขวางยิ่งเบนวิถีได้น้อย (แรงลม ∝ ρv²)";
  }

  function debrief(sum, run) {
    const lr = (run && run.legalResult) || {};
    const fr = sum.failReason;
    const lines = [];
    let mood = "ok";

    if (lr.status === "VIOLATION") {
      mood = "bad";
      lines.push("เมี้ยว... นายกด IGNITION ทั้งที่เอกสารยังไม่ครบ");
      lines.push("การปล่อยโดยไม่ได้รับอนุญาตคือ “ลักลอบปล่อย” — ขาด: " + (lr.missingReqs || []).slice(0, 2).join(" / "));
      const ln = lawNugget(run); if (ln) lines.push(ln);
    }

    if (fr === "LANTERN_BURNUP") {
      mood = "bad";
      lines.push("เมี้ยว!! โคมไหม้กลางอากาศ 🔥 (ผิวแตะ ~" + (sum.skinTempPeak || 233) + "°C)");
      lines.push("กระดาษสาติดไฟราว 233°C — ที่ Bradbury เรียก Fahrenheit 451 พอดี นายเอาดินขับแรงไปไว้ในโคม");
      lines.push("ความร้อนสะสม ∝ แรงขับ ÷ มวลโครงสร้าง ใช้หัวเผาเบา ๆ กับดินน้อย ๆ ก็พอ — แล้วอย่าลืมข้อบัญญัติท้องถิ่นเรื่องโคมลอยช่วงเทศกาลด้วย");
    } else if (fr === "PAD_CATO") {
      mood = "bad";
      lines.push("เมี้ยว! ระเบิดคาแท่นปล่อย — CATO (Catastrophe At Take-Off)");
      lines.push("นายอัดดินปืนดำเกินปริมาตรที่ปลอกลำรับไหว ความดันในห้องเผาไหม้พุ่งเกินกำลังของวัสดุ ผนังเลยฉีก");
      lines.push("นิวตันข้อ 3: แรงกิริยา = แรงปฏิกิริยา แต่ถ้าโครงรับไม่อยู่ พลังงานจะระบายออกทุกทิศ ลดดินปืนหรืออัปเกรดปลอก — แล้วนายยังไม่ผ่านคณะทำงาน Sky Hazard ของจังหวัดนะ");
    } else if (fr === "UNSTABLE_COM") {
      mood = "bad";
      lines.push("เมี้ยว... บั้งไฟส่ายเป็นงูเลย");
      lines.push("ดินปืนหนักเกินจนศูนย์ถ่วง (CG) เลื่อนไปท้าย พอ CG อยู่ “หลัง” ศูนย์แรงกดอากาศ (CP) จรวดจะไม่เสถียร—มันอยากสลับหัวกับท้าย");
      lines.push("จำนิวตันข้อ 2 ไว้ F = ma: มวล m โตเร็วกว่าแรงขับ F ความเร่ง a เลยตก เพิ่มครีบ (ดึง CP ไปท้าย) หรือลดดินปืนลง แล้วก็—ยังละเมิดระเบียบจังหวัดอยู่ดี");
    } else if (sum.orbital && !sum.reachedOrbit) {
      mood = "bad";
      lines.push("เมี้ยว เกือบแล้ว แต่ Δv ไม่พอ ขาดอีก " + Math.round(Math.max(0, sum.deltaVRequired - sum.deltaVBudget)) + " m/s");
      lines.push("สมการ Tsiolkovsky: Δv = Isp·g₀·ln(m₀/m_f) — อยากได้ Δv เพิ่ม ต้องเพิ่ม Isp หรืออัตราส่วนมวล: เติมดินขับ ลดมวลเปล่า หรือใช้เครื่องยนต์ Isp สูงที่ท่อนบน");
    } else if (sum.burnedUp) {
      mood = "bad";
      lines.push("เมี้ยว ยานไหม้ตอนกลับเข้าชั้นบรรยากาศ");
      lines.push("ฟลักซ์ความร้อนที่ผิวยาน q̇ ∝ ρ·v³ — เร็วเกินไปตอนชนอากาศหนา ๆ ความร้อนเลยท่วม ต้องมีเกราะกันความร้อนหรือกดความเร็ว/มุมปะทะให้เหมาะ");
    } else if (!sum.orbital && sum.crashed) {
      mood = "warn";
      lines.push("เมี้ยว จรวดลงไม่สวย");
      lines.push(run.rocket && run.rocket.spinStabilized
        ? "ตะไลใช้การหมุนช่วยทรงตัว (spin-stabilization) — โมเมนตัมเชิงมุมต้านการส่าย ลองเพิ่มรอบหมุน"
        : "ลมขวางเบนวิถี เพิ่มครีบหรือความเร็วออกตัวช่วยได้ (จรวดยิ่งช้ายิ่งโดนลมง่าย เพราะแรงลม ∝ ρv²)");
    } else if (sum.apogee < sum.targetAltitude * 0.95) {
      mood = "warn";
      lines.push("เมี้ยว ยังไม่ถึงเป้า ทำได้ " + fmtAlt(sum.apogee) + " / " + fmtAlt(sum.targetAltitude));
      lines.push("TWR ตอนออกตัวต่ำ หรือ Δv ไม่พอ — เพิ่มแรงขับ/ลดมวล แล้วเล็ง projected apogee ให้แตะเส้นเป้าหมาย");
      if (sum.guidanceCutoff) lines.push("(guidance ตัดเครื่องเพราะวิถีจะเลยเป้า—ลองมุม pitch ที่ชันขึ้นหรือลดเชื้อเพลิงท่อนล่าง)");
    } else {
      mood = "ok";
      lines.push(pick(["เมี้ยว~ สวยงาม", "ทำได้ดีมาก มนุษย์", "เป้าหมายสำเร็จ ✓ เมี้ยว"]));
      lines.push(successNugget(sum, run));
      if (lr.status === "CLEARED") lines.push("และเอกสารครบทุกใบ — ถูกกฎหมาย 100% นั่นแหละวิศวกรที่ดี");
    }

    play(lines, { mood });
  }

  function fmtAlt(a) { return a >= 1000 ? (a / 1000).toFixed(1) + " km" : Math.round(a) + " m"; }

  window.Narrative = { play, missionIntro, debrief, skip: end };
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
    applyMuteClass();
    if (muteBtn && !muteBtn._wired) {
      muteBtn._wired = true;
      muteBtn.addEventListener("click", toggleMute);
    }
    say("T‑3 · 2 · 1 · เตรียมปล่อย — CAPCOM ออนไลน์");
  }
  function applyMuteClass() {
    if (!box) return;
    box.classList.toggle("muted", muted);
    if (muteBtn) muteBtn.title = muted ? "เปิดเสียงดั๊ก (CAPCOM)" : "ปิดเสียงดั๊ก (CAPCOM)";
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
    _fade = setTimeout(() => { if (lineEl) { lineEl.textContent = "🦆 " + text; lineEl.style.opacity = "1"; } }, 110);
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
        say(`รับช่วงต่อจากน้องลี — 3·2·1 จุดระเบิด • TWR ${twr(flight)} ไต่ขึ้น`); break;
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
        say(`ยานส่าย! CG เลื่อนไปท้าย — คาปิบาราเริ่มเหงื่อแตกแล้ว`); break;
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
    set("idle");
  }
  function set(m) {
    if (!el || !EMOJI[m]) return;
    el.dataset.mood = m;
    if (face) face.textContent = EMOJI[m];
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
    else if (k === "maxq" || k === "unstable" || k === "guidance-cutoff" || k === "reentry") setMood("sweat");
    else if (k === "burnup" || k === "lantern-burnup" || k === "pad-explosion" || k === "crash") { set("dead"); locked = true; }
    else if (k === "orbit" || k === "landing") { set("chill"); locked = true; }
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
