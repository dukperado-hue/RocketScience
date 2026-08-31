// js/vn.js — Phase 5 · ระบบบทสนทนาแบบ Visual Novel
//   ป๊อปอัปบทสนทนาตัวละครระหว่าง VAB / ก่อนปล่อย / หลังบิน
//   ตัวละคร 4 ตัว:
//     kaitun  — "ไข่ตุ๋น" นาก นักข่าวมือใหม่ ตื่นตูม ตกใจง่าย ("เอ๊ะ?")
//     pchang  — "พี่ช่าง" เป็ดยาง วิศวกรจอมละเอียด พูดไม่หยุด อ้าง Feynman/Voyager/Apollo/Newton/เกาส์เซียน
//     samlee  — "สำลี" แมวสยาม หัวหน้าจอมโหด ชอบการทดลองอันตราย
//     kapi    — "กะปิ" คาปิบารา ผู้ช่วยใบ้ ทำงานเสี่ยงตายเอง โดนระเบิดประจำ (บทเป็น stage direction)
//
//  window.VN.play(entries, { onDone })   entries = [{ who, text }]
//  window.VN.atVab(rocket)   window.VN.atReport(summary, run)   window.VN.skip()

(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const SPEED = 15;  // ms/ตัวอักษร

  const IMG = "assets/images/characters/";
  const CAST = {
    kaitun: { name: "ไข่ตุ๋น", role: "นักข่าวสนามมือใหม่", img: IMG + "kaitun.png", accent: "#C6843E" },
    pchang: { name: "พี่ช่าง", role: "หัวหน้าวิศวกร · CAPCOM", img: IMG + "pchang.png", accent: "#2E6FB8" },
    samlee: { name: "สำลี", role: "ผู้บัญชาการ · เจ้าของการทดลอง", img: IMG + "samlee.png", accent: "#8A6D3B" },
    kapi: { name: "กะปิ", role: "ผู้ช่วยภาคสนาม (ไม่พูด)", img: IMG + "kapi.png", accent: "#6B7A55" }
  };

  let box, portrait, nameEl, roleEl, txt, cont, stage;
  let queue = [], idx = 0, typing = false, timer = null, doneCb = null, full = "";

  function ensure() {
    box = $("vn");
    if (!box) return false;
    portrait = $("vn-portrait-img");
    nameEl = $("vn-name"); roleEl = $("vn-role");
    txt = $("vn-text"); cont = $("vn-cont"); stage = $("vn-stagedir");
    const x = $("vn-x");
    if (x && !x._wired) { x._wired = true; x.addEventListener("click", (e) => { e.stopPropagation(); end(); }); }
    if (!box._wired) { box._wired = true; box.addEventListener("click", advance); }
    return true;
  }

  function play(entries, opts) {
    opts = opts || {};
    if (!ensure()) { opts.onDone && opts.onDone(); return; }
    queue = (entries || []).filter(e => e && e.text);
    if (!queue.length) { opts.onDone && opts.onDone(); return; }
    idx = 0; doneCb = opts.onDone || null;
    box.hidden = false;
    step();
  }

  function step() {
    if (idx >= queue.length) { end(); return; }
    const e = queue[idx];
    const c = CAST[e.who] || null;
    const mute = e.who === "kapi";

    // ตัวละคร
    if (c) {
      box.style.setProperty("--vn-accent", c.accent);
      if (portrait) {
        portrait.src = c.img;
        portrait.alt = c.name;
        portrait.parentElement.hidden = false;
      }
      nameEl.textContent = c.name;
      roleEl.textContent = c.role;
    } else {
      box.style.setProperty("--vn-accent", "var(--accent)");
      if (portrait) portrait.parentElement.hidden = true;
      nameEl.textContent = "";
      roleEl.textContent = "";
    }
    box.classList.toggle("vn-narrator", !c);
    box.classList.toggle("vn-mute", mute);

    // กะปิ = ไม่พูด → เป็น stage direction (จัดรูปแบบต่างออกไป ไม่มี typewriter เสียง)
    if (mute) {
      let t = e.text.trim();
      if (!/^[*(]/.test(t)) t = "( " + t + " )";
      stage.hidden = false; stage.textContent = t;
      txt.textContent = ""; txt.hidden = true;
      cont.classList.add("show");
      typing = false;
      return;
    }
    stage.hidden = true; txt.hidden = false;

    full = e.text; txt.textContent = ""; cont.classList.remove("show");
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
    if (box) box.hidden = true;
    const cb = doneCb; doneCb = null;
    cb && cb();
  }

  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const fmtAlt = (a) => (a >= 1000 ? (a / 1000).toFixed(1) + " กม." : Math.round(a) + " ม.");

  // ---------------- บทสนทนา: หน้าประกอบ (VAB) ----------------
  function atVab(rocket) {
    const tk = rocket && rocket.tierKey;
    if (rocket && rocket.id === "talai") {
      play([
        { who: "kaitun", text: "ตะไล! อันนี้พุ่งขึ้นแบบควงเป็นเกลียวเลยนะคะ เอ๊ะ ทำไมไม่ยิงตรง ๆ เหมือนบั้งไฟ?" },
        { who: "pchang", text: "เมี้ยว-ก้าบ... เลิกพูดเรื่อง O-ring ของ NASA ได้แล้ว! วิศวกรรมตะไลดั้งเดิมอยู่ที่สูตร ดินบาท-มาดเฟื้อง-ถ่านสลึง ถ้าตอกดินปืนอัดแน่นเกินไปในบ้องไม้รวกสด ความดันภายในจะกักความเครียดไว้ ทำให้บ้องปริแตกคามือทันที (CATO)!" },
        { who: "pchang", text: "ภูมิปัญญา น้าบุญช่วย มีแสง แห่งบ้านตาลิน: แกนต้องเป็น 'ไม้รวกสด' เท่านั้น ไม้แห้ง/PVC ห้าม; ใช้เชือกวัดเส้นรอบวงรูบ้อง 'วน 2 รอบ' ความยาวเท่านั้นคือทั้งความยาวแกน และเส้นผ่าศูนย์กลางของปีกวงกลมไม้ไผ่ตง; เจาะรูประทุเฉียง ~15° ใต้จุดสมดุล เพื่อบังคับให้ควงเป็นเกลียวสว่าน" },
        { who: "samlee", text: "แล้วก็ต้องสะบัดมือขว้างเหมือนขว้างจานบิน ฉันจะยืนดูตรงนี้ กะปิ นายขว้าง" },
        { who: "kapi", text: "กะปิพยักหน้าช้า ๆ มือหนึ่งถือแกนไม้รวก อีกมือถือเชือกวัด" }
      ], {});
      return;
    }
    const intro = {
      tier1: [
        { who: "kaitun", text: "เอ๊ะ? แค่โคมลอยกับพลุเนี่ยนะคะ ต้องมีวิศวกรด้วยเหรอ?" },
        { who: "pchang", text: "มีสิ ไข่ตุ๋น ทุกอย่างที่ลอยได้มีสมการหมด แรงยกของอากาศร้อนคือ ρ_เย็น − ρ_ร้อน คูณปริมาตรคูณ g เป๊ะตามอาร์คิมิดีส และกระดาษสาติดไฟที่ราว 233°C — เท่ากับ Fahrenheit 451 ของแบรดบิวรีพอดี บังเอิญมาก" },
        { who: "samlee", text: "พูดสั้น ๆ ช่าง ฉันอยากรู้แค่ว่ามันจะไหม้กลางอากาศสวย ๆ ไหม" },
        { who: "kapi", text: "กะปิถือไฟแช็กเตรียมไว้แล้ว มองสำลีอย่างระแวง" }
      ],
      tier2: [
        { who: "kaitun", text: "บั้งไฟ! อันนี้หนูเคยเห็นในงานบุญ มันเสียงดังมากเลยนะคะ เอ๊ะ แล้วมันระเบิดได้ด้วยเหรอ?" },
        { who: "pchang", text: "ได้ และมันเรียกว่า CATO — Catastrophe At Take-Off ปลอกลำมีพิกัดรับความดัน ถ้าดินปืนดำมากเกิน ความดันในห้องเผาไหม้พุ่งเกินกำลังวัสดุ ผนังฉีก เหมือน O-ring ของ Challenger ที่แข็งตัวเพราะอากาศเย็น Feynman จุ่มมันลงน้ำแข็งให้ดูต่อหน้ากรรมาธิการเลย" },
        { who: "pchang", text: "เพราะงั้นเลือกลำให้ดี: ท่อ PVC เบาแต่ทนความดันต่ำ ไม้ไผ่หนักแต่แข็งแรงกว่า และถ้าพันลวดเสริม (มัดลวด 1000 รอบ) จะเพิ่มพิกัดความดัน แต่มวลก็เพิ่มตาม" },
        { who: "samlee", text: "หรือจะอัดดินปืนให้เต็มแล้วดูว่าอะไรพังก่อนกัน กะปิยืนใกล้ ๆ หน่อย เดี๋ยวถ่ายไม่ทัน" },
        { who: "kapi", text: "กะปิถอยออกมาหนึ่งก้าว เงียบ ๆ" }
      ],
      tier3: [
        { who: "kaitun", text: "เอ๊ะ ระดับนี้เครื่องบินโดยสารบินอยู่จริง ๆ เหรอคะ?" },
        { who: "pchang", text: "จริง จรวดหยั่งอากาศต้องออก NOTAM ปิดห้วงอากาศ และมี RSO คุมจุดปล่อย เชื้อเพลิงน้ำตาล KNO₃ ให้ Isp ราว 130 วินาที Voyager ยังใช้ RTG แต่นายมีแค่ดินขับ ต้องบริหารให้ดี" },
        { who: "samlee", text: "ยิงให้สูงที่สุด กฎอ่านทีหลังได้" },
        { who: "kaitun", text: "หนูว่าอ่านก่อนดีกว่านะคะ..." }
      ],
      tier4: [
        { who: "pchang", text: "วิถีโค้ง sub-orbital — ชิ้นส่วนตกกลับพื้นโลกได้ ต้องคำนวณ ellipse จุดตก เผื่อความคลาดเคลื่อนแบบเกาส์เซียน 3σ แล้วกันพื้นที่ชุมชนออกทั้งหมด Apollo คำนวณ re-entry corridor แคบแค่ไม่กี่องศา พลาดคือไหม้หรือเด้งออก" },
        { who: "kaitun", text: "เอ๊ะ! ถ้ามันตกใส่บ้านคนล่ะคะ?" },
        { who: "samlee", text: "งั้นก็รับผิดตาม Liability Convention 1972 ไง — น่าตื่นเต้นดี" }
      ],
      tier5: [
        { who: "pchang", text: "วงโคจร! Δv = Isp·g₀·ln(m₀/m_f) — สมการ Tsiolkovsky จะเป็นเพื่อนหรือศัตรูก็ตรงนี้ ต้องแตะ ~7.7 กม./วินาที บวก gravity loss อีกเป็นพัน" },
        { who: "kaitun", text: "หนูจดไม่ทันค่ะพี่ช่าง..." },
        { who: "pchang", text: "ไม่เป็นไร จดต่อ: Outer Space Treaty 1967 ข้อ VI รัฐต้องรับผิดชอบการยิงของเอกชนในสังกัด ต้องจดคลื่นกับ ITU และหลบขยะอวกาศตามแนวทาง Space Debris Mitigation ด้วย" },
        { who: "samlee", text: "หรือชนมันเลยก็ได้ เพิ่มขยะอีกชิ้นสองชิ้นคงไม่มีใครสังเกต" },
        { who: "kapi", text: "กะปิส่ายหน้าช้า ๆ" }
      ]
    }[tk];
    if (intro) play(intro, {});
  }

  // ---------------- บทสนทนา: หลังบิน (รายงาน) ----------------
  function atReport(sum, run) {
    const lr = (run && run.legalResult) || {};
    const fr = sum.failReason;
    const lines = [];

    if (lr.status === "VIOLATION") {
      lines.push({ who: "kaitun", text: "เอ๊ะ?! เรายังไม่ได้ใบอนุญาตเลยนี่คะ!" });
      lines.push({ who: "pchang", text: "การปล่อยโดยไม่มีเอกสารครบคือ “ลักลอบปล่อย” ขาด: " + ((lr.missingReqs || []).slice(0, 2).join(" / ") || "เอกสารสำคัญ") });
      lines.push({ who: "samlee", text: "รายละเอียดปลีกย่อย ผลลัพธ์ต่างหากที่สำคัญ" });
    }

    if (fr === "LANTERN_BURNUP") {
      lines.push({ who: "kaitun", text: "โคมไหม้แล้ว! ไฟลุกกลางอากาศเลยค่ะ!" });
      lines.push({ who: "pchang", text: "ผิวแตะ ~" + (sum.skinTempPeak || 233) + "°C กระดาษสาติดไฟราว 233°C พอดี ความร้อนสะสม ∝ แรงขับ ÷ มวลโครงสร้าง — ใช้หัวเผาเบา ๆ กับดินน้อย ๆ ก็พอ" });
      lines.push({ who: "samlee", text: "สวยมาก ถ่ายไว้หรือเปล่า" });
      lines.push({ who: "kapi", text: "กะปิยกกล้องขึ้น พยักหน้า คิ้วขมวดเล็กน้อย" });
    } else if (fr === "PAD_CATO") {
      lines.push({ who: "kaitun", text: "เอ๊ะ! ระเบิดคาแท่นเลย!" });
      lines.push({ who: "pchang", text: "CATO — ดินปืนเกินพิกัดปลอกลำ ความดันพุ่งเกินกำลังวัสดุ นิวตันข้อ 3 แรงกิริยา = แรงปฏิกิริยา แต่ถ้าโครงรับไม่อยู่ พลังงานระบายออกทุกทิศ ลดดินปืน เปลี่ยนเป็นไม้ไผ่ หรือพันลวดเพิ่ม" });
      lines.push({ who: "samlee", text: "กะปิเป็นอะไรไหม... ไม่ต้องตอบก็ได้ ลุกไหวก็แปลว่าโอเค" });
      lines.push({ who: "kapi", text: "กะปิโผล่จากกลุ่มควัน หมวกนิรภัยดำเป็นเขม่า ยกนิ้วโป้งให้อย่างเหนื่อยหน่าย" });
    } else if (fr === "LANDING_BURN_FAIL") {
      lines.push({ who: "kaitun", text: "ยานลงมาเร็วมาก... เบรกไม่ทัน!" });
      lines.push({ who: "pchang", text: "Δv ที่กันไว้สำหรับ retro-burn ไม่พอ — เชื้อเพลิงหมดก่อนความเร็วเป็นศูนย์ เหมือน Falcon 9 เที่ยวแรก ๆ ที่ลงกระแทกโดรนชิป ต้องกัน margin ให้มากขึ้น หรือเบา payload ลง" });
      lines.push({ who: "samlee", text: "ฮ่า ๆ ๆ! ลงจอดสวยมาก — สวยเป็นหลุมเลย" });
      lines.push({ who: "kapi", text: "กะปิซึ่งยืนถือถังดับเพลิงอยู่ตรงจุดลงจอดพอดี ถูกแรงระเบิดสาดหายไปในกลุ่มควัน แล้วคลานกลับมาช้า ๆ" });
    } else if (fr === "WAN_HU") {
      lines.push({ who: "kaitun", text: "บอสสส! ไฟไหม้เก้าอี้ผมแล้ววว—" });
      lines.push({ who: "pchang", text: "แรงขับมหาศาลใต้จุดศูนย์ถ่วง ไม่มีครีบ = spin แบบสิ้นหวัง โอกาสรอดเป็น outlier ของเกาส์เซียนที่เข้าใกล้ศูนย์... ตามที่ผมบอกไว้เป๊ะ" });
      lines.push({ who: "samlee", text: "หวันหู่คือมนุษย์อวกาศคนแรก วันนี้เราได้สร้างประวัติศาสตร์ซ้ำ" });
      lines.push({ who: "kapi", text: "กะปิยืนตรงจุดปล่อย หน้านิ่ง จุดชนวนบั้งไฟทั้ง 47 อันพร้อมกัน" });
    } else if (fr === "UNSTABLE_COM") {
      lines.push({ who: "kaitun", text: "มันส่ายเป็นงูเลยค่ะ!" });
      lines.push({ who: "pchang", text: "ดินปืนหนักเกินจน CG เลื่อนไปท้าย พอ CG อยู่ “หลัง” CP จรวดจะไม่เสถียร มันอยากสลับหัวกับท้าย เพิ่มครีบดึง CP ไปท้าย หรือลดดินปืน" });
    } else if (fr === "TALAI_CATO") {
      lines.push({ who: "kaitun", text: "เอ๊ะ! บ้องไม้รวกแตกคามือเลย!" });
      lines.push({ who: "pchang", text: "เมี้ยว-ก้าบ... เลิกพูดเรื่อง O-ring ของ NASA ได้แล้ว! วิศวกรรมตะไลดั้งเดิมอยู่ที่สูตร ดินบาท-มาดเฟื้อง-ถ่านสลึง ถ้าตอกดินปืนอัดแน่นเกินไปในบ้องไม้รวกสด ความดันภายในจะกักความเครียดไว้ ทำให้บ้องปริแตกคามือทันที (CATO)!" });
      lines.push({ who: "pchang", text: "หรือดินไวเกิน — น้าบุญช่วยบอก ทดสอบจุดต้อง 'ลุกพรึ่บเดียว' เหลือแต่เขม่า ถ้าติดไฟตั้งแต่ไฟยังไม่แตะ = แรงเกินไป ระเบิดง่าย ต้องพรมน้ำระหว่างตำเพิ่ม หรือใช้ไม้รวกสดที่เนื้อยืดหยุ่นกว่านี้" });
      lines.push({ who: "kapi", text: "กะปิพยักหน้าช้า ๆ มือพันผ้าพันแผล อีกมือยังถือเชือกวัดอยู่" });
      lines.push({ who: "samlee", text: "หมอตะไลรุ่นเก่าหลายคนนิ้วกุด ตาบอดข้างหนึ่ง... กะปิยังครบดีนะ ถือว่าโชคดี" });
    } else if (fr === "TALAI_WOBBLE") {
      lines.push({ who: "kaitun", text: "มันไม่ควงขึ้นเลยค่ะ ส่าย ๆ แล้วก็ร่วงไปข้าง ๆ" });
      lines.push({ who: "pchang", text: "เส้นผ่าศูนย์กลางปีกวงกลมต้องเท่ากับความยาวเชือกที่วัดเส้นรอบวงรูบ้อง 'วน 2 รอบ' พอดี ถ้าพลาดสัดส่วนนี้ โมเมนต์ความเฉื่อยของจานผิด สปินไม่พอจะรักษาแกน (ไจโรสโคปิก) ตะไลเลยเสียการทรงตัวแล้วร่วงในแนวราบ" });
      lines.push({ who: "pchang", text: "และมุมรูประทุ 15° นั้นสำคัญ — ตื้นไปสปินอ่อน ชันไปแรงรั่วออกข้าง น้าบุญช่วยวัดด้วยนิ้วหัวแม่มือ 2 นิ้วใต้จุดสมดุล แล้วต่ำลงอีก 1 นิ้ว" });
      lines.push({ who: "kapi", text: "กะปิยกตะไลที่หักขึ้นดู แล้ววางเชือกวัดทาบเทียบปีกให้สำลีเห็น" });
    } else if (sum.orbital && !sum.reachedOrbit) {
      lines.push({ who: "pchang", text: "Δv ขาดอีก " + Math.round(Math.max(0, sum.deltaVRequired - sum.deltaVBudget)) + " m/s เติมดินขับ ลดมวลเปล่า หรือใช้เครื่องยนต์ Isp สูงที่ท่อนบน" });
      lines.push({ who: "kaitun", text: "เกือบแล้วนะคะ! นิดเดียวเอง" });
    } else if (sum.burnedUp) {
      lines.push({ who: "kaitun", text: "ยานไหม้ตอนกลับเข้าชั้นบรรยากาศ..." });
      lines.push({ who: "pchang", text: "ฟลักซ์ความร้อน q̇ ∝ ρ·v³ เร็วเกินตอนชนอากาศหนา ความร้อนท่วม ต้องมีเกราะกันความร้อนหรือกดความเร็ว/มุมปะทะ แบบแคปซูล Apollo" });
    } else if (!sum.orbital && sum.crashed) {
      lines.push({ who: "kaitun", text: "ลงไม่สวยเลยค่ะ..." });
      lines.push({ who: "pchang", text: "ลมขวางเบนวิถี (แรงลม ∝ ρv²) เพิ่มครีบหรือความเร็วออกตัว หรือใช้ร่ม/GPS ในโหมดกู้คืน" });
    } else if (sum.apogee < (sum.targetAltitude || 1) * 0.95) {
      lines.push({ who: "pchang", text: "ยังไม่ถึงเป้า ได้ " + fmtAlt(sum.apogee) + " / " + fmtAlt(sum.targetAltitude) + " — TWR ออกตัวต่ำ หรือ Δv ไม่พอ" });
      lines.push({ who: "kaitun", text: "เอ๊ะ ครั้งหน้าเพิ่มแรงขับได้ไหมคะ?" });
    } else {
      lines.push({ who: "kaitun", text: pick(["สำเร็จแล้ว! เยี่ยมไปเลยค่ะ!", "เอ๊ะ มันขึ้นจริง ๆ ด้วย! เก่งมากค่ะ!", "ภารกิจสำเร็จ! หนูจะเขียนข่าวนี้!"]) });
      lines.push({ who: "pchang", text: sum.orbital
        ? "Δv margin เหลือ " + Math.round(sum.deltaVMargin) + " m/s เกิน Kármán line 100 กม. และแตะความเร็ววงโคจรแล้ว การกระจายตัวของค่าอยู่ในช่วง 1σ พอดี"
        : "วิถีสวย TWR > 1 ตลอด องค์ประกอบแนวดิ่งกำหนดเพดาน แนวราบกำหนดระยะ ทำได้ตามตำรา" });
      if (lr.status === "CLEARED") lines.push({ who: "samlee", text: "เอกสารครบ ผลลัพธ์ดี... น่าเบื่อ แต่ก็ได้" });
      else lines.push({ who: "samlee", text: "ดีนี่ คราวหน้าเราลองเอาระเบิดผูกเก้าอี้ดูบ้าง" });
      lines.push({ who: "kapi", text: "กะปิพยักหน้าเบา ๆ แล้วหันไปเก็บอุปกรณ์เงียบ ๆ" });
    }

    if (lines.length) play(lines, {});
  }

  // ---------------- Easter egg: ตำนานหวันหู่ (Wan Hu) ----------------
  function wanHu(onDone) {
    play([
      { who: "samlee", text: "ประวัติศาสตร์บอกว่า หวันหู่คือมนุษย์อวกาศคนแรก วันนี้ เราจะสร้างประวัติศาสตร์ซ้ำอีกครั้ง — ไข่ตุ๋น นั่งนิ่ง ๆ" },
      { who: "kaitun", text: "เอ๊ะ!? บะ...บอสครับ! ทำไมต้องเอาบั้งไฟ 47 อันมาผูกกับเก้าอี้ทำงานผมด้วยยยย!" },
      { who: "pchang", text: "ตามหลักอากาศพลศาสตร์ การวางแรงขับมหาศาลไว้ใต้จุดศูนย์ถ่วงโดยไม่มีครีบเลย จะทำให้เกิด terminal spin โอกาสรอดชีวิตเป็น outlier ของการแจกแจงเกาส์เซียนที่เข้าใกล้ศูนย์..." },
      { who: "samlee", text: "กะปิ จุดไฟ" },
      { who: "kapi", text: "จุดชนวนด้วยสีหน้าเรียบเฉย" }
    ], { onDone: onDone });
  }

  window.VN = { play, atVab, atReport, wanHu, skip: end, CAST };
})();
