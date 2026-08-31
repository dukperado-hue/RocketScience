// js/codex.js — Phase 9 · หอจดหมายเหตุอวกาศ (Aerospace Codex)
//   สารานุกรมในเกม: จรวด/ยาน/สิ่งประดิษฐ์ ทั้งภูมิปัญญาไทยและอวกาศสากล
//   ผู้เล่นปลดล็อกทีละรายการจากการเล่นภารกิจ / ทริกเกอร์ลับ — สถานะเก็บใน localStorage
//
//   window.Codex.all()                    -> [{...entry, unlocked}]
//   window.Codex.get(id) / isUnlocked(id) / counts()
//   window.Codex.unlock(tag | [tags])     -> entries ที่เพิ่งปลด (+ toast + event 'codex:unlock')
//   window.Codex.unlockFromFlight(ctx)    -> แปลงบริบทเที่ยวบินเป็น tags แล้ว unlock
//
//   modelType: "procedural" -> codexViewer สร้างรูปทรงเองจาก modelRef
//              "glb"        -> โหลด assets/models/<modelRef>.glb (fallbackKind = รูปสำรอง)

(function () {
  "use strict";
  const KEY = "rocketscience-codex";

  const ENTRIES = [
    // ===== ภูมิปัญญาไทย / ตำนาน =====
    {
      id: "khom_loy", icon: "🏮", cat: "thai", title: "โคมลอย", sub: "Sky Lantern", era: "ล้านนา · ประเพณียี่เป็ง",
      modelType: "procedural", modelRef: "khom",
      triggers: ["tier1_khom", "mission:m1_festival", "mission:m2_newyear"],
      desc: "บอลลูนอากาศร้อนกระดาษสา จุดไฟใต้ปากโคมไล่อากาศเย็นออก อากาศร้อนเบากว่า (หลักอาร์คิมิดีส) โคมจึงลอยขึ้น ต้องคุมความร้อนไม่ให้เกิน ~233°C มิฉะนั้นกระดาษสาติดไฟกลางอากาศ"
    },
    {
      id: "phu", icon: "🎆", cat: "thai", title: "พลุ", sub: "Firework Shell", era: "จีน → ไทย สมัยอยุธยา",
      modelType: "procedural", modelRef: "firework",
      triggers: ["tier1_phu", "firework"],
      desc: "ดินปืนดำอัดในลูกทรงกลม เผาไหม้เร็วมากให้แรงส่งสั้น ๆ พุ่งสูง เกลือของโลหะกำหนดสีเปลว — สตรอนเชียม=แดง แบเรียม=เขียว ทองแดง=น้ำเงิน โซเดียม=เหลือง แมกนีเซียม=ขาว/ประกาย"
    },
    {
      id: "bangfai", icon: "🚀", cat: "thai", title: "บั้งไฟ", sub: "Bang Fai", era: "อีสาน · บุญบั้งไฟ (เดือน ๖)",
      modelType: "procedural", modelRef: "bangfai",
      triggers: ["tier2_bangfai", "mission:m3_rocketfest"],
      desc: "จรวดดินปืนอัดลำไม้ไผ่หรือท่อ PVC ภูมิปัญญาช่างบั้งไฟอีสาน ดินขับ ๓ ชั้น (หัว–คอ–ลำตัว) อัดแน่นด้วยแม่แรง เจาะรูแกนเป็นทรงกรวย แล้วจูนหางยาวให้สมดุลไม่ให้ 'รำดาบ'"
    },
    {
      id: "talai", icon: "💫", cat: "thai", title: "ตะไล", sub: "Talai (spinning disc)", era: "บ้านตาลิน อ.หนองบัว",
      modelType: "procedural", modelRef: "talai",
      triggers: ["tier2_talai", "mission:m4_talai"],
      desc: "พลุจานหมุนภูมิปัญญาบ้านตาลิน แกนไม้รวกสด ปีกวงกลมไผ่ตง (เส้นผ่านศูนย์กลาง = ๒ เท่าเส้นรอบวงรูบ้อง) รูประทุเฉียง ๑๕° ทำให้ควงเป็นเกลียวสว่านพุ่งขึ้นฟ้า"
    },
    {
      id: "talai_10m", icon: "🌀", cat: "thai", title: "ตะไลล้าน", sub: "Talai 10 Million", era: "งานบุญบั้งไฟยักษ์",
      modelType: "procedural", modelRef: "talai_giant",
      triggers: ["mission_pass:m4_talai", "score:20000"],
      desc: "ตะไลขนาดยักษ์ ปีกวงกลมกว้างหลายเมตร บรรจุดินขับหน่วยโบราณระดับ 'หมื่น' หรือ 'ล้าน' ต้องใช้คนหลายสิบช่วยกันยกขึ้นราง จุดแล้วสะบัดพร้อมกัน — เสียงดังสนั่นทั้งอำเภอ"
    },
    {
      id: "wan_hu", icon: "🪑", cat: "legend", title: "เก้าอี้ของหวันหู่", sub: "Wan Hu's Chair", era: "ตำนานจีน · ราชวงศ์หมิง",
      modelType: "procedural", modelRef: "wanhu",
      triggers: ["wanhu"],
      desc: "ตำนานเล่าว่าขุนนางหวันหู่ผูกบั้งไฟ ๔๗ อันเข้ากับเก้าอี้ไม้ไผ่ ถือว่าวสองมือ แล้วสั่งให้บ่าวจุดพร้อมกัน เกิดควันมหึมา เมื่อควันจาง ไม่พบหวันหู่อีกเลย — หลุมบนดวงจันทร์ตั้งชื่อตามเขา"
    },

    // ===== อวกาศสากล (โมเดล NASA/NOAA — สาธารณสมบัติ) =====
    {
      id: "cubesat", icon: "📦", cat: "space", title: "คิวบ์แซต", sub: "CubeSat 3U", era: "ค.ศ. 1999 · Stanford / Cal Poly",
      modelType: "glb", modelRef: "cubesat", fallbackKind: "cubesat",
      triggers: ["tier5", "payload:pl_cubesat", "payload:pl_cubesat_cluster"],
      desc: "ดาวเทียมมาตรฐานหน่วย 'U' (10×10×10 ซม. ~1.33 กก./U) ต้นทุนต่ำ ปล่อยพ่วงไปกับจรวดใหญ่ นักศึกษาและสตาร์ตอัปสร้างเองได้ — โมเดลจากคลัง NASA 3D Resources"
    },
    {
      id: "gemini", icon: "🛰️", cat: "space", title: "แคปซูลเจมินี", sub: "Gemini Capsule", era: "ค.ศ. 1965–66 · NASA",
      modelType: "glb", modelRef: "capsule", fallbackKind: "capsule",
      triggers: ["tier4", "payload:pl_reentry_cap"],
      desc: "ยานลูกเรือ 2 คนของ NASA ฝึกเชื่อมต่อวงโคจรและเดินอวกาศ ปูทางสู่โครงการอะพอลโล เกราะกันความร้อนด้านล่างเป็นแบบเผาไหม้ทิ้ง (ablative) ระหว่างกลับเข้าชั้นบรรยากาศ"
    },
    {
      id: "voyager", icon: "📡", cat: "space", title: "ยานวอยเอเจอร์", sub: "Voyager Probe", era: "ค.ศ. 1977 · NASA / JPL",
      modelType: "glb", modelRef: "probe", fallbackKind: "probe",
      triggers: ["tier4", "space", "payload:pl_test_mass"],
      desc: "ยานสำรวจนอกระบบ จานสายอากาศ 3.7 ม. ใช้เครื่องกำเนิดไฟฟ้าไอโซโทป (RTG) พก 'Golden Record' แผ่นทองบันทึกเสียงและภาพของโลก ปัจจุบันออกนอกเฮลิโอสเฟียร์แล้ว"
    },
    {
      id: "tdrs", icon: "📶", cat: "space", title: "ดาวเทียมถ่ายทอด TDRS", sub: "Tracking & Data Relay Sat", era: "ค.ศ. 1983– · NASA",
      modelType: "glb", modelRef: "comsat", fallbackKind: "comsat",
      triggers: ["tier5", "payload:pl_comsat_small"],
      desc: "เครือข่ายดาวเทียมสื่อสารวงโคจรค้างฟ้า ทำหน้าที่ถ่ายทอดสัญญาณระหว่างยานในวงโคจรต่ำ (สถานีอวกาศ ISS, กล้องฮับเบิล) กับสถานีภาคพื้นโลก แทบตลอดเวลา"
    },
    {
      id: "goes", icon: "🌦️", cat: "space", title: "ดาวเทียมอุตุนิยม GOES", sub: "GOES Weather Sat", era: "ค.ศ. 1975– · NOAA / NASA",
      modelType: "glb", modelRef: "comsat_geo", fallbackKind: "comsat",
      triggers: ["tier5", "payload:pl_comsat_geo", "mission:m8_geo"],
      desc: "ดาวเทียมค้างฟ้าเฝ้าติดตามพายุ พยากรณ์อากาศ ตรวจจับฟ้าผ่าและลมสุริยะ ประจำที่เหนือเส้นศูนย์สูตรที่ระยะ ~35,786 กม. หมุนรอบโลกพอดีกับที่โลกหมุน จึงดู 'ลอยนิ่ง'"
    },
    {
      id: "bennu", icon: "☄️", cat: "space", title: "ดาวเคราะห์น้อยเบนนู", sub: "101955 Bennu", era: "ก่อตัว ~4.5 พันล้านปีก่อน",
      modelType: "procedural", modelRef: "asteroid", fallbackKind: "asteroid",
      triggers: ["space", "mission:m6_ballistic", "mission:m7_orbit", "tier5"],
      desc: "ดาวเคราะห์น้อยคาร์บอนเส้นผ่านศูนย์กลาง ~490 ม. เป็น 'กองเศษหิน' (rubble pile) ยึดกันด้วยแรงโน้มถ่วงอ่อน ๆ ยาน OSIRIS-REx เก็บตัวอย่างกลับถึงโลก ค.ศ. 2023 — โมเดลจากข้อมูลสำรวจจริงของ NASA"
    }
  ];

  const CATS = { thai: "ภูมิปัญญาไทย", legend: "ตำนาน", space: "อวกาศสากล" };

  let unlocked = load();

  function load() {
    try {
      const a = JSON.parse(localStorage.getItem(KEY));
      return new Set(Array.isArray(a) ? a : []);
    } catch (e) { return new Set(); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify([...unlocked])); } catch (e) {} }

  const withState = e => Object.assign({ unlocked: unlocked.has(e.id) }, e);

  function all() { return ENTRIES.map(withState); }
  function get(id) { const e = ENTRIES.find(x => x.id === id); return e ? withState(e) : null; }
  function isUnlocked(id) { return unlocked.has(id); }
  function counts() {
    const ids = new Set(ENTRIES.map(e => e.id));
    return { total: ENTRIES.length, got: [...unlocked].filter(id => ids.has(id)).length };
  }

  function unlock(tags) {
    const list = Array.isArray(tags) ? tags : [tags];
    const newly = [];
    ENTRIES.forEach(e => {
      if (unlocked.has(e.id)) return;
      if (e.triggers.some(t => list.includes(t))) { unlocked.add(e.id); newly.push(withState(e)); }
    });
    if (newly.length) {
      save();
      newly.forEach(e => { if (typeof window.__toast === "function") window.__toast(`🏛️ หอจดหมายเหตุ: ปลดล็อก “${e.title}”`); });
      document.dispatchEvent(new CustomEvent("codex:unlock", { detail: newly.map(e => e.id) }));
    }
    return newly;
  }

  function unlockFromFlight(ctx) {
    ctx = ctx || {};
    const r = ctx.rocket || {}, m = ctx.mission || {}, sum = ctx.summary || {};
    const tier = ctx.tier || 0;
    const t = [];
    if (r.lantern) t.push("tier1_khom");
    if (r.id === "phu") t.push("tier1_phu");
    if (r.id === "bangfai") t.push("tier2_bangfai");
    if (r.id === "talai") t.push("tier2_talai");
    if (m.id) t.push("mission:" + m.id);
    if (ctx.missionPassed && m.id) t.push("mission_pass:" + m.id);
    if (tier >= 4) t.push("tier4");
    if (tier >= 5) t.push("tier5");
    if ((sum.apogee || 0) >= 100000 || sum.reachedOrbit) t.push("space");
    if (ctx.payloadId) t.push("payload:" + ctx.payloadId);
    if (ctx.firework) t.push("firework");
    if (ctx.totalScore != null && ctx.totalScore >= 20000) t.push("score:20000");
    return unlock(t);
  }

  function reset() { unlocked = new Set(); save(); }

  window.Codex = { ENTRIES, CATS, all, get, isUnlocked, counts, unlock, unlockFromFlight, reset };
})();
