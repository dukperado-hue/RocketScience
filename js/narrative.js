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
    play(map[m.tierKey] || ["เมี้ยว ไปกันเลย"], { mood: "" });
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
