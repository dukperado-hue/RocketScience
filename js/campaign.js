// js/campaign.js — Phase 16 · Campaign State Machine & Cinematic Launch
//
//   เปลี่ยนภารกิจ "พลุ" (fireworkMission) จาก sandbox → ลูปเล่าเรื่องแบบวิศวกรจำลอง
//   สเตตแมชชีน 6 สเตต (เรียงตายตัว):
//     STATE_BRIEFING       — พี่ช่าง (CAPCOM) บรีฟภารกิจอย่างเป็นทางการ
//     STATE_MATERIAL       — เลือกวัตถุดิบ 4 หมวด (พลังงาน/สี/จังหวะ/เปลือก) — น้องกะปิพาทำ
//     STATE_ASSEMBLY       — โรงประกอบ node 3 มิติ (ใช้ VABEditor จาก Phase 15) — น้องกะปิเป็นเพื่อน
//     STATE_TESTING        — System Check — น้องกะปิมักเป็นต้นเหตุของบั๊ก ผู้เล่นต้องแก้
//     STATE_LAUNCH_CONTROL — พี่ช่างกลับมาคุมเคาต์ดาวน์ซีเนแมติก (LAUNCH CONTROL terminal)
//     STATE_DEBRIEF        — สกอร์การ์ดละเอียด + อันดับ (ทั้งคู่รีแอกต์ตามผล)
//
//   NPC สองตัว (mentor–apprentice):
//     P_CHANG — เป็ดยาง CAPCOM จอมเข้ม
//     KAPI    — คาปิบาราผู้ช่วยฝึกงาน ซุ่มซ่ามแต่กระตือรือร้น
//
//   พึ่ง window.RS (main.js) สำหรับ progress/launch, window.Fireworks / VABEditor / Launch3D

(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const el = (id) => document.getElementById(id);
  const RS = () => window.RS;
  const FW = () => window.Fireworks;

  // ============================================================
  //  NPC · ระบบเพื่อนคู่ใจ (พี่ช่าง + น้องกะปิ) — persistent, typewriter
  // ============================================================
  const IMG = "assets/images/characters/";
  const CH = {
    pchang: { name: "พี่ช่าง", role: "CAPCOM · หัวหน้าวิศวกร", img: IMG + "pchang.png", accent: "#3B82C4", tone: "pchang", emoji: "🦆" },
    kapi:   { name: "น้องกะปิ", role: "ผู้ช่วยช่างฝึกงาน", img: IMG + "kapi.png", accent: "#8AA35C", tone: "kapi", emoji: "🦫" },
    // Phase 16.5: น้องชะอม — แมวสามสีจอมพลังในชุดอวกาศตัวโคร่ง · Payload Specialist / นักบินทดสอบ
    chaom:  { name: "น้องชะอม", role: "Payload Specialist · นักบินทดสอบ", img: IMG + "cha_om.png", accent: "#EE7A2D", tone: "chaom", emoji: "🐈" }
  };

  const NPC = (function () {
    let box, img, emojiEl, nameEl, roleEl, textEl, contEl;
    let queue = [], idx = 0, typing = false, timer = null, autoT = null, doneCb = null, full = "";
    const SPEED = 16;

    function ensure() {
      box = el("npc");
      if (!box) return false;
      img = el("npc-img"); emojiEl = el("npc-emoji"); nameEl = el("npc-name"); roleEl = el("npc-role");
      textEl = el("npc-text"); contEl = el("npc-cont");
      if (img && !img._wired) {
        img._wired = true;
        img.addEventListener("load", () => { img.style.visibility = "visible"; if (emojiEl) emojiEl.hidden = true; });
        img.addEventListener("error", () => { img.style.visibility = "hidden"; if (emojiEl) emojiEl.hidden = false; });
      }
      if (!box._wired) {
        box._wired = true;
        box.addEventListener("click", advance);
      }
      return true;
    }

    function setWho(who) {
      const c = CH[who] || CH.pchang;
      box.dataset.who = who in CH ? who : "pchang";
      box.style.setProperty("--npc-accent", c.accent);
      if (emojiEl) { emojiEl.textContent = c.emoji || "🙂"; emojiEl.hidden = true; }
      if (img) {
        img.style.visibility = "hidden";   // ซ่อนจนกว่าจะโหลดเสร็จ (กันไอคอนรูปแตก)
        img.src = c.img; img.alt = c.name;
        if (img.complete && img.naturalWidth > 0) { img.style.visibility = "visible"; }
        else if (img.complete) { if (emojiEl) emojiEl.hidden = false; }
      }
      nameEl.textContent = c.name;
      roleEl.textContent = c.role;
    }

    // lines: [{who, text}] | {who, text}
    function play(lines, opts) {
      opts = opts || {};
      if (!ensure()) { opts.onDone && opts.onDone(); return; }
      clearTimeout(autoT); clearInterval(timer);
      queue = (Array.isArray(lines) ? lines : [lines]).filter(l => l && l.text);
      idx = 0; doneCb = opts.onDone || null; box._auto = opts.auto || 0;
      box.hidden = false;
      box.classList.remove("npc-dim");
      document.body.classList.add("npc-open");
      if (!queue.length) { finish(); return; }
      step();
    }

    function step() {
      if (idx >= queue.length) { finish(); return; }
      const e = queue[idx];
      setWho(e.who || "pchang");
      full = e.text; textEl.textContent = ""; contEl.classList.remove("show");
      typing = true;
      let k = 0;
      clearInterval(timer);
      timer = setInterval(() => {
        textEl.textContent = full.slice(0, ++k);
        const ch = full[k - 1];
        if (window.SoundStage && ch && ch !== " " && ch !== "\n" && k % 2) window.SoundStage.blip();
        if (k >= full.length) { clearInterval(timer); typing = false; contEl.classList.add("show"); armAuto(); }
      }, SPEED);
    }

    function armAuto() {
      if (!box._auto) return;
      clearTimeout(autoT);
      autoT = setTimeout(() => { idx++; step(); }, box._auto);
    }

    function advance(ev) {
      if (ev) ev.stopPropagation();
      if (typing) { clearInterval(timer); textEl.textContent = full; typing = false; contEl.classList.add("show"); armAuto(); return; }
      clearTimeout(autoT);
      idx++;
      if (idx >= queue.length) { finish(); return; }
      step();
    }

    function finish() {
      typing = false; clearInterval(timer); clearTimeout(autoT);
      contEl && contEl.classList.remove("show");
      const cb = doneCb; doneCb = null;
      cb && cb();
    }

    // แทรกประโยคสั้น ๆ (ไม่รอคลิก) — ใช้ตอนเคาต์ดาวน์
    function flash(who, text, ms) {
      if (!ensure()) return;
      clearTimeout(autoT); clearInterval(timer); typing = false;
      box.hidden = false;
      document.body.classList.add("npc-open");
      setWho(who);
      textEl.textContent = text;
      contEl.classList.remove("show");
    }

    function hide() {
      clearInterval(timer); clearTimeout(autoT); typing = false;
      if (box) { box.hidden = true; box.classList.remove("npc-dim"); }
      document.body.classList.remove("npc-open");
    }
    function showPersist(who) {
      if (!ensure()) return;
      box.hidden = false;
      box.classList.remove("npc-dim");           // Phase 17.1 · โผล่เต็มตัวเสมอเวลาเรียกโชว์
      document.body.classList.add("npc-open");
      if (who) setWho(who);
    }
    // Phase 17.1 · หรี่กล่องบทสนทนาตอนปล่อย/บิน ไม่ให้บังฉาก (ยังอยู่ แค่จาง+ย่อ)
    function dim(on) {
      if (!ensure()) return;
      box.hidden = false;
      box.classList.toggle("npc-dim", on !== false);
    }

    return { play, flash, hide, dim, show: showPersist };
  })();

  // ============================================================
  //  STATE MACHINE
  // ============================================================
  const S = {
    BRIEFING: "STATE_BRIEFING",
    MATERIAL: "STATE_MATERIAL",
    ASSEMBLY: "STATE_ASSEMBLY",
    TESTING: "STATE_TESTING",
    LAUNCH_CONTROL: "STATE_LAUNCH_CONTROL",
    DEBRIEF: "STATE_DEBRIEF"
  };
  const STEP_ORDER = [S.BRIEFING, S.MATERIAL, S.ASSEMBLY, S.TESTING, S.LAUNCH_CONTROL, S.DEBRIEF];
  const STEP_TH = {
    [S.BRIEFING]: "บรีฟ", [S.MATERIAL]: "วัตถุดิบ", [S.ASSEMBLY]: "ประกอบ",
    [S.TESTING]: "ทดสอบ", [S.LAUNCH_CONTROL]: "ปล่อย", [S.DEBRIEF]: "สรุปผล"
  };

  let state = null, mission = null;
  let mats = { energy: null, color: null, timing: null, casing: null };
  let testing = { fixed: false };
  let lastSummary = null, lastScore = null;

  const fmt = (n) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

  function wants(m) { return !!(m && m.fireworkMission); }

  function begin(m) {
    if (!RS()) { console.warn("[Campaign] window.RS not ready"); return; }
    mission = m;
    mats = { energy: null, color: null, timing: null, casing: null };
    testing = { fixed: false };
    lastSummary = lastScore = null;
    RS().beginCampaign(m);
    buildStepbar();
    go(S.BRIEFING);
  }

  function go(next) {
    state = next;
    markStep();
    // Phase 18.5 · RPG BGM during prep phases; silence for the cinematic launch + debrief
    if (window.SoundStage) {
      if (next === S.BRIEFING || next === S.MATERIAL || next === S.ASSEMBLY || next === S.TESTING) {
        window.SoundStage.startBGM();
      } else {
        window.SoundStage.stopBGM();
      }
    }
    switch (next) {
      case S.BRIEFING: renderBriefing(); break;
      case S.MATERIAL: renderMaterial(); break;
      case S.ASSEMBLY: enterAssembly(); break;
      case S.TESTING: renderTesting(); break;
      case S.LAUNCH_CONTROL: enterLaunchControl(); break;
      case S.DEBRIEF: renderDebrief(); break;
    }
  }

  // ---------- screen helpers ----------
  function campHideAll() {
    document.querySelectorAll("main.wrap > section.screen").forEach(s => { s.hidden = true; });
  }
  function campShow(id) {
    campHideAll();
    const t = el(id); if (t) t.hidden = false;
    el("stepbar").hidden = true;
    const cb = el("campaign-stepbar"); if (cb) cb.hidden = false;
    window.scrollTo(0, 0);
  }
  function buildStepbar() {
    const cb = el("campaign-stepbar");
    if (!cb) return;
    cb.innerHTML = STEP_ORDER.map(s => `<span data-cs="${s}">${STEP_TH[s]}</span>`).join("");
    cb.hidden = false;
  }
  function markStep() {
    const cb = el("campaign-stepbar");
    if (!cb) return;
    const cur = STEP_ORDER.indexOf(state);
    Array.from(cb.children).forEach(sp => {
      const i = STEP_ORDER.indexOf(sp.dataset.cs);
      sp.classList.toggle("active", i === cur);
      sp.classList.toggle("done", i > -1 && i < cur);
    });
  }

  // ---------- universal Back — ถอยสเตตแมชชีนทีละก้าว (Phase 17.1) ----------
  function cancelLaunchInstance() {
    try {
      const G = RS() && RS().G;
      if (G && G.launchInstance && G.launchInstance.cancel) G.launchInstance.cancel();
      if (G) { G.launchInstance = null; G.__campaignOnDone = null; }
    } catch (e) {}
  }
  function restoreVabNav() {
    const nav = $("#screen-vab .screen-nav"); if (nav) nav.hidden = false;
    const nb = $('#screen-vab .screen-nav [data-back]'); if (nb) nb.hidden = false;
    const cb = el("vab-cmp-back"); if (cb) cb.hidden = true;
  }
  function campBack() {
    if (!state) return;
    const i = STEP_ORDER.indexOf(state);

    // เก็บกวาดทรัพยากรของสเตตปัจจุบันก่อนถอย
    if (state === S.TESTING && window.TestingGames) { try { window.TestingGames.unmount(); } catch (e) {} }
    if (state === S.ASSEMBLY) {
      if (window.VABEditor) { try { window.VABEditor.unmount(); } catch (e) {} }
      if (window.VAB3D) { try { window.VAB3D.unmount(); } catch (e) {} }
      restoreVabNav();
    }
    if (state === S.LAUNCH_CONTROL) {
      if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
      dropRoomTone();
      cancelLaunchInstance();
      const lc = el("launch-control"); if (lc) { lc.hidden = true; lc.className = "launch-control"; }
      const lb = $("#screen-launch .launch-back"); if (lb) lb.hidden = false;
    }

    if (i <= 0) {   // ถอยจาก BRIEFING = ออกจากแคมเปญ กลับไปหน้าเลือกภารกิจ
      teardown();
      try { RS().endCampaign(); RS().renderMissions(); RS().show("mission"); } catch (e) {}
      return;
    }
    go(STEP_ORDER[i - 1]);
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cmp-back]");
    if (!b || !state) return;
    e.preventDefault();
    campBack();
  });

  // ============================================================
  //  STATE_BRIEFING — พี่ช่าง
  // ============================================================
  function renderBriefing() {
    campShow("screen-briefing");
    NPC.show("pchang");
    const tgt = mission.targetAltitude >= 1000
      ? (mission.targetAltitude / 1000).toFixed(1) + " กม." : mission.targetAltitude + " ม.";
    const chemLine = mission.requiredChems && window.Chemistry
      ? mission.requiredChems.map(k => (window.Chemistry.starChem ? window.Chemistry.starChem(k).th : k)).join(" · ")
      : "อิสระ";
    el("briefing-body").innerHTML = `
      <div class="cmp-brief-card">
        <div class="cmp-brief-eyebrow">MISSION BRIEF · ${mission.id}</div>
        <h3>${mission.titleTh}</h3>
        <p class="cmp-brief-lede">${mission.briefTh}</p>
        <dl class="cmp-brief-dl">
          <div><dt>เพดานเป้าหมาย</dt><dd>${tgt}</dd></div>
          <div><dt>สีที่กรรมการสั่ง</dt><dd>${chemLine}</dd></div>
          <div><dt>งบประมาณ</dt><dd>${fmt(mission.budget)} ฿</dd></div>
          <div><dt>ฐานคะแนน</dt><dd>${fmt(mission.basePoints)}</dd></div>
        </dl>
        <div class="cmp-hazards">${(mission.hazards || []).map(h => `<span>${h}</span>`).join("")}</div>
      </div>`;

    const lines = [
      { who: "pchang", text: `พี่ช่าง CAPCOM — บรีฟภารกิจ "${mission.titleTh}" อย่างเป็นทางการ ฟังให้จบก่อนลงมือ` },
      { who: "pchang", text: `วัตถุประสงค์: จุดลูกพลุให้แตกที่เพดาน ${tgt} ${mission.requiredChems ? "และต้องได้ครบสีที่กรรมการสั่ง — " + chemLine : "โดยไม่รบกวนน่านฟ้า"}` },
      { who: "pchang", text: `นี่ไม่ใช่การเล่นดอกไม้ไฟหลังบ้าน — มีเขตปลอดภัยการบิน มีคนดูอยู่ข้างล่าง ทุกกรัมของดินขับมีผลต่อความปลอดภัย` },
      { who: "pchang", text: `เดี๋ยวน้องกะปิจะพาไปเลือกวัตถุดิบ ผมจะกลับมาอีกทีตอนเคาต์ดาวน์ — ลงมือได้` }
    ];
    NPC.play(lines);
    el("briefing-go").onclick = () => go(S.MATERIAL);
  }

  // ============================================================
  //  STATE_MATERIAL — น้องกะปิ (placeholder + ต่อกับ Fireworks.state จริง)
  // ============================================================
  function materialGroups() {
    const CHEM_TH = (k) => (window.Chemistry && window.Chemistry.starChem ? window.Chemistry.starChem(k).th : k);
    const color = mission.requiredChems
      ? [
          { id: "theme", ic: "🎆", th: "ชุดสีธีมงาน", sub: "แนะนำ · " + mission.requiredChems.map(CHEM_TH).join("/"), chems: mission.requiredChems.slice() },
          { id: "red", ic: "🔴", th: "แดงล้วน", sub: CHEM_TH("strontium"), chems: ["strontium"] },
          { id: "blue", ic: "🔵", th: "น้ำเงินล้วน", sub: CHEM_TH("copper"), chems: ["copper"] }
        ]
      : [
          { id: "red", ic: "🔴", th: "แดง", sub: "สตรอนเชียม", chems: ["strontium"] },
          { id: "green", ic: "🟢", th: "เขียว", sub: "แบเรียม", chems: ["barium"] },
          { id: "blue", ic: "🔵", th: "น้ำเงิน", sub: "ทองแดง", chems: ["copper"] },
          { id: "gold", ic: "🟡", th: "ทอง", sub: "โซเดียม", chems: ["sodium"] }
        ];
    return {
      energy: {
        label: "พลังงาน", icon: "🔋", key: "energy",
        opts: [
          { id: "small", ic: "🟩", th: "ดินน้อย", sub: "~240 ม. · ปลอดภัยกว่า", shell: "small" },
          { id: "medium", ic: "🟨", th: "ดินมาตรฐาน", sub: "~360 ม. · งานเทศกาล", shell: "medium" },
          { id: "large", ic: "🟥", th: "ดินอัดแน่น", sub: "~520 ม. · เสี่ยง CATO", shell: "large" }
        ]
      },
      color: { label: "สี", icon: "🎨", key: "color", opts: color },
      timing: {
        label: "จังหวะ", icon: "⏱️", key: "timing",
        opts: [
          { id: "short", ic: "⚡", th: "ชนวนสั้น", sub: "แตกทันทีที่ apogee", fuse: "short" },
          { id: "medium", ic: "🎇", th: "ชนวนกลาง", sub: "แตกหลัง apogee นิด — ดอกกางเต็ม", fuse: "medium" },
          { id: "long", ic: "🌠", th: "ชนวนยาว", sub: "หน่วงนาน เห็นหางยาว", fuse: "long" }
        ]
      },
      casing: {
        label: "เปลือก", icon: "🧨", key: "casing",
        opts: [
          { id: "peony", ic: "🌸", th: "ลูกพุด (Peony)", sub: "ทรงกลม หรี่ดับพร้อมกัน", pattern: "peony" },
          { id: "willow", ic: "🎋", th: "ต้นหลิว (Willow)", sub: "หางทองลู่ลง ค้างฟ้านานสุด", pattern: "willow" },
          { id: "multibreak", ic: "🎆", th: "มัลติเบรก", sub: "หลายสีในดอกเดียว", pattern: "multibreak" }
        ]
      }
    };
  }

  function renderMaterial() {
    campShow("screen-material");
    NPC.show("kapi");

    // ตั้ง context ให้ Fireworks (maxChems / requiredChems) โดยเรนเดอร์ลง sink ที่ซ่อนไว้
    const sink = el("campaign-fw-sink");
    if (FW() && sink) {
      try {
        FW().render(sink, function () {}, {
          maxChems: mission.maxChems || (mission.requiredChems ? mission.requiredChems.length : 1),
          requiredChems: mission.requiredChems || null,
          missionTitle: mission.titleTh || ""
        });
      } catch (e) { console.warn("[Campaign] Fireworks.render", e); }
    }

    const groups = materialGroups();
    const body = el("material-body");
    body.innerHTML = `<div class="cmp-mat-lab">` + Object.values(groups).map(g => `
      <div class="cmp-mat-group" data-group="${g.key}">
        <div class="cmp-mat-label"><span class="cmp-mat-gicon">${g.icon || "•"}</span>${g.label}</div>
        <div class="cmp-mat-chips">
          ${g.opts.map(o => `<button type="button" class="cmp-chip" data-opt="${o.id}">
            <span class="cmp-chip-ic">${o.ic || "▫"}</span>
            <b>${o.th}</b><small>${o.sub || ""}</small></button>`).join("")}
        </div>
      </div>`).join("") + `</div>`;

    body.querySelectorAll(".cmp-mat-group").forEach(grp => {
      const key = grp.dataset.group;
      const defs = groups[key].opts;
      grp.querySelectorAll(".cmp-chip").forEach(btn => {
        btn.addEventListener("click", () => {
          grp.querySelectorAll(".cmp-chip").forEach(b => b.classList.remove("on"));
          btn.classList.add("on");
          mats[key] = defs.find(d => d.id === btn.dataset.opt);
          refreshMaterialGate();
        });
      });
    });

    refreshMaterialGate();
    NPC.play([
      { who: "kapi", text: "พี่ครับ! ผมน้องกะปิ ช่างฝึกงาน — จากนี้ผมจะเป็นเพื่อนพี่เองนะครับ 🙌" },
      { who: "kapi", text: "วัตถุดิบมี 4 หมวด: พลังงาน = ดินขับกับเปลือก · สี = สารเคมีเม็ดดาว · จังหวะ = ชนวนหน่วงเวลา · เปลือก = รูปแบบตอนแตก" },
      { who: "kapi", text: mission.requiredChems
        ? "อันนี้กรรมการสั่งสีมาเป๊ะ ๆ เลือก 'ชุดสีธีมงาน' ไว้ก่อนน่าจะปลอดภัยครับ... เอ๊ะ หรือผมจำผิด? 💦"
        : "ดินเยอะขึ้นสูงกว่าแต่เสี่ยง CATO ครับ ผม... ผมก็ไม่ค่อยแน่ใจเหมือนกันว่าเยอะแค่ไหนถึงพอดี 😅" }
    ]);

    el("material-go").onclick = () => {
      applyMaterialsToFireworks();
      go(S.ASSEMBLY);
    };
  }

  function refreshMaterialGate() {
    const ok = mats.energy && mats.color && mats.timing && mats.casing;
    el("material-go").disabled = !ok;
  }

  function applyMaterialsToFireworks() {
    if (!FW() || !FW().state) return;
    const st = FW().state;
    st.enabled = true;
    if (mats.energy) st.shell = mats.energy.shell;
    if (mats.color) st.chems = mats.color.chems.slice();
    if (mats.timing) st.fuse = mats.timing.fuse;
    if (mats.casing) st.pattern = mats.casing.pattern;
  }

  // ============================================================
  //  STATE_ASSEMBLY — ใช้ #screen-vab + VABEditor (Phase 15)
  // ============================================================
  function enterAssembly() {
    const phu = (window.ROCKETS || []).find(r => r.id === "phu");
    if (!phu || !RS()) { go(S.TESTING); return; }
    const G = RS().G;
    G.run.rocket = phu;
    G.run.name = G.run.name || (mission.titleTh + " · พลุ");
    campHideAll();               // main.show("vab") ไม่ซ่อนจอแคมเปญให้ — ซ่อนเองก่อน
    RS().goVab();
    // ปรับ chrome ให้เป็นโหมดแคมเปญ
    el("stepbar").hidden = true;
    const cb = el("campaign-stepbar"); if (cb) cb.hidden = false;
    // Phase 17.1 · โชว์ปุ่ม "กลับ" ของแคมเปญบนจอประกอบ (แทนปุ่ม ← กลับ เดิมที่พาไปตั้งชื่อ)
    const nav = $("#screen-vab .screen-nav");
    if (nav) {
      nav.hidden = false;
      const nb = nav.querySelector("[data-back]"); if (nb) nb.hidden = true;
      const bk = el("vab-cmp-back"); if (bk) bk.hidden = false;
    }
    NPC.show("kapi");
    NPC.play([
      { who: "kapi", text: "โรงประกอบครับพี่! ลากไอคอนขวามือมาวาง — เปลือกพลุก่อน แล้วค่อยยัดสารเคมี แล้วเสียบชนวน" },
      { who: "chaom", text: "พี่กะปิ! ผูกหนูติดกับพลุเลย หนูอยากบิน! 🚀" },
      { who: "kapi", text: "ชะอม! เพย์โหลดคือเซนเซอร์ ไม่ใช่ตัวเธอ... พี่ครับ ชิ้นไหนวางผิดก็ลากออกมาลอย ๆ ได้ ไม่ต้องกลัว 👀" }
    ], { auto: 5200 });
  }

  // เรียกจาก main.js (ปุ่ม #vab-proceed ในโหมดแคมเปญ)
  function assemblyDone() {
    if (window.VABEditor) { try { window.VABEditor.unmount(); } catch (e) {} }
    if (window.VAB3D) { try { window.VAB3D.unmount(); } catch (e) {} }
    restoreVabNav();
    go(S.TESTING);
  }

  // ============================================================
  //  STATE_TESTING — Phase 17: Diagnostic console + mission mini-game
  // ============================================================
  const TEST_CHECKS = [
    { id: "energy", th: "ENERGY BUS", ok: "แรงขับ/มวล อยู่ในพิกัด" },
    { id: "color", th: "COLOR MIX", ok: "สเปกตรัมเม็ดดาวตรงธีม" },
    { id: "timing", th: "TIMING SYNC", ok: "ชนวนหน่วงเวลาซิงก์กับ apogee" },
    { id: "casing", th: "CASING SEAL", ok: "เปลือกพลุปิดผนึกสนิท" }
  ];

  function renderTesting() {
    campShow("screen-testing");
    NPC.show("kapi");
    testing.fixed = false;

    const goBtn = el("testing-go");
    goBtn.disabled = true;
    goBtn.textContent = "แก้ระบบให้เสร็จก่อน →";

    if (window.TestingGames) {
      window.TestingGames.mount(el("testing-body"), {
        missionId: mission.id,
        fw: (FW() && FW().derived) ? safeDerived() : null,
        mats: mats,
        tree: (window.VABEditor && window.VABEditor.getTree) ? window.VABEditor.getTree() : null,
        npc: NPC
      }, () => {
        testing.fixed = true;
        goBtn.disabled = false;
        goBtn.textContent = "ส่งต่อให้ LAUNCH CONTROL →";
      });
      goBtn.onclick = () => {
        try { window.TestingGames.unmount(); } catch (e) {}
        go(S.LAUNCH_CONTROL);
      };
      return;
    }

    // ---- fallback (js/testing.js ไม่โหลด): เช็กลิสต์ปุ่มเดียวแบบเดิม ----
    goBtn.disabled = false;
    goBtn.textContent = "ส่งต่อให้ LAUNCH CONTROL →";
    const body = el("testing-body");
    body.innerHTML = `
      <div class="cmp-test-card">
        <div class="cmp-test-eyebrow">SYSTEM CHECK · pre-launch diagnostics</div>
        <ul class="cmp-test-list" id="cmp-test-list">
          ${TEST_CHECKS.map(c => `
            <li data-check="${c.id}" class="${c.id === "timing" ? "err" : "ok"}">
              <span class="cmp-test-name">${c.th}</span>
              <span class="cmp-test-stat">${c.id === "timing" ? "✗ ERROR — กราฟ Timing เพี้ยน" : "✓ " + c.ok}</span>
            </li>`).join("")}
        </ul>
        <button type="button" class="btn btn-primary cmp-fix-btn" id="cmp-fix-btn">🔧 สลับสายชนวนกลับให้ถูก (ช่วยกะปิ)</button>
        <p class="cmp-test-note" id="cmp-test-note">พบ 1 รายการผิดปกติ — แก้ก่อนปล่อย</p>
      </div>`;
    el("cmp-fix-btn").onclick = () => {
      const li = $('#cmp-test-list li[data-check="timing"]');
      if (li) { li.classList.remove("err"); li.classList.add("ok"); li.querySelector(".cmp-test-stat").textContent = "✓ ชนวนหน่วงเวลาซิงก์กับ apogee"; }
      el("cmp-fix-btn").disabled = true;
      el("cmp-fix-btn").textContent = "✓ แก้เรียบร้อย";
      testing.fixed = true;
    };
    NPC.play([
      { who: "kapi", text: "พี่ครับ ผมเผลอเสียบสายสลับกัน กราฟ Timing เลยเพี้ยน ช่วยผมแก้หน่อย! 💦" },
      { who: "pchang", text: "อย่าเพิ่งรีบปล่อย ดู timing ให้ครบก่อน" }
    ]);
    goBtn.onclick = () => go(S.LAUNCH_CONTROL);
  }

  // ============================================================
  //  STATE_LAUNCH_CONTROL — เคาต์ดาวน์ซีเนแมติก (พี่ช่าง)
  // ============================================================
  let cdTimer = null, hum = null;

  function enterLaunchControl() {
    campHideAll();
    el("stepbar").hidden = true;
    const lc = el("launch-control");
    lc.hidden = false;
    lc.className = "launch-control";
    el("lc-count").textContent = "";
    el("lc-cut").hidden = true;
    el("lc-lights").classList.remove("on");
    el("lc-arm").hidden = false;
    el("lc-arm").disabled = false;
    const ig = el("lc-ignite"); if (ig) { ig.hidden = true; ig.disabled = false; }
    const bk = el("lc-back"); if (bk) bk.hidden = false;
    el("lc-status").innerHTML = `
      <div class="lc-stat"><span>SYSTEM</span><b class="good">READY</b></div>
      <div class="lc-stat"><span>WEATHER</span><b class="good">CLEAR</b></div>
      <div class="lc-stat"><span>TIMING</span><b class="${testing.fixed ? "good" : "warn"}">${testing.fixed ? "SYNCED" : "UNVERIFIED"}</b></div>`;

    NPC.show("pchang");
    NPC.play([
      { who: "pchang", text: "พี่ช่างรับช่วงต่อ — ระบบพร้อม สภาพอากาศฟ้าโปร่ง ทุกคนเข้าประจำที่" },
      { who: "kapi", text: "ตื่นเต้นจังเลยครับ!" },
      { who: "chaom", text: "ตื่นเต้นๆๆๆ จุดเลยๆๆ!" },
      { who: "pchang", text: "ชะอม เงียบ. กด ARM SIMULATION ให้ระบบติดไฟ แล้วค่อยกด “จุดพลุ” เมื่อพร้อม" }
    ], { auto: 3400 });

    startRoomTone();

    // ARM = พรีโหลดฉากปล่อยไว้หลังโอเวอร์เลย์ (ลูกพลุยังค้างในท่อครก) — ยังไม่นับถอยหลัง
    el("lc-arm").onclick = () => {
      el("lc-arm").hidden = true;
      el("lc-lights").classList.add("on");
      RS().startCampaignLaunch(sum => onFlightDone(sum));
      el("stepbar").hidden = true;   // main.show("launch") เปิดสเตปบาร์เดิมกลับมา — ซ่อนอีกที
      const cb = el("campaign-stepbar"); if (cb) cb.hidden = false;
      const lb = $("#screen-launch .launch-back"); if (lb) lb.hidden = true;
      if (ig) ig.hidden = false;
      NPC.flash("pchang", "ระบบติดไฟแล้ว — กด “จุดพลุ” เพื่อเริ่มนับถอยหลัง T‑3");
    };

    // จุดพลุ = ผู้เล่นสั่งเริ่มเคาต์ดาวน์เอง (เคาต์ดาวน์ไม่เริ่มก่อนกดปุ่มนี้)
    if (ig) ig.onclick = () => {
      ig.hidden = true;
      const b2 = el("lc-back"); if (b2) b2.hidden = true;   // เริ่มนับแล้ว — ถอยไม่ได้
      NPC.dim(true);                                        // หรี่บทสนทนา เปิดทางฉากซีเนแมติก
      runCountdown();
    };
  }

  function startRoomTone() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      hum = new AC();
      const o = hum.createOscillator(), g = hum.createGain();
      o.type = "sine"; o.frequency.value = 62;
      g.gain.value = 0.035;
      o.connect(g); g.connect(hum.destination); o.start();
      hum._o = o; hum._g = g;
    } catch (e) { hum = null; }
  }
  function dropRoomTone() {
    if (!hum) return;
    try {
      hum._g.gain.exponentialRampToValueAtTime(0.0001, hum.currentTime + 0.8);
      setTimeout(() => { try { hum.close(); } catch (e) {} hum = null; }, 1000);
    } catch (e) { try { hum.close(); } catch (x) {} hum = null; }
  }

  const CUTS = [
    { th: "CLOSE-UP · สายชนวนจุดระเบิด", tint: "cut-wire" },
    { th: "WIDE · ท้องฟ้ามืดเหนือลาน", tint: "cut-sky" },
    { th: "GROUND · ปากท่อครก", tint: "cut-tube" }
  ];

  // Phase 17.1 · เคาต์ดาวน์สั้น กระชับ: T‑3 → T‑2 → T‑1 → IGNITION
  function runCountdown() {
    const lc = el("launch-control");
    let t = 3;
    const cutEl = el("lc-cut");
    lc.classList.add("dim");
    dropRoomTone();
    el("lc-lights").classList.add("on");
    tick();
    cdTimer = setInterval(tick, 800);

    function tick() {
      el("lc-count").textContent = t > 0 ? "T‑" + t : "IGNITION";
      if (t >= 1 && t <= 3) {
        const c = CUTS[(3 - t) % CUTS.length];
        cutEl.hidden = false;
        cutEl.textContent = c.th;
        lc.classList.remove("cut-wire", "cut-sky", "cut-tube");
        lc.classList.add(c.tint);
        if (t === 3) NPC.flash("pchang", "T‑3 · ทุกระบบพร้อม");
        if (t === 2) NPC.flash("kapi", "กลั้นหายใจ...");
        if (t === 1) NPC.flash("chaom", "จุดดดดด!");
      }
      if (t === 0) {
        clearInterval(cdTimer); cdTimer = null;
        ignite();
        return;
      }
      t--;
    }
  }

  function ignite() {
    const lc = el("launch-control");
    lc.classList.add("clearing");
    NPC.flash("pchang", "IGNITION — จุด!");
    setTimeout(() => {
      lc.hidden = true;
      lc.className = "launch-control";
      const btn = el("fw-ignite");
      if (btn) btn.click();
      // Phase 17.1 · เก็บกล่องบทสนทนาให้ไวหลังจุด เพื่อไม่บังดอกพลุที่ค้างฟ้า 4–6 วิ
      setTimeout(() => NPC.hide(), 400);
    }, 480);
  }

  // ============================================================
  //  STATE_DEBRIEF — สกอร์การ์ดละเอียด + อันดับ
  // ============================================================
  const RANKS = [
    [85, "A", "MASTER TECHNICIAN"],
    [70, "B", "SENIOR TECHNICIAN"],
    [55, "C", "TECHNICIAN"],
    [40, "D", "APPRENTICE"],
    [0, "F", "TRAINEE"]
  ];

  function computeScorecard(sum) {
    const d = (FW() && FW().derived) ? safeDerived() : {};
    const tgt = mission.targetAltitude || 300;
    // เพดานที่ใช้ตัดสิน = สูงสุดระหว่างผลฟิสิกส์จริง กับเพดานแตกของลูกพลุ (shell apogee × altMul)
    const shellApogee = d.apogeeM ? d.apogeeM * (d.altMul || 1) : 0;
    const apo = Math.max(sum.apogee || 0, shellApogee);
    const fail = sum.failReason;
    const drift = Math.abs(sum.horizontalDrift || 0);

    let accuracy = Math.round(Math.max(0, Math.min(1.1, apo / tgt)) * 100);
    if (mission.requiredChems) accuracy = Math.round(accuracy * (d.requiredMet ? 1 : 0.5));
    accuracy = Math.min(100, accuracy);

    let timing = mats.timing ? ({ medium: 88, long: 78, short: 70 }[mats.timing.id] || 70) : 55;
    if (!testing.fixed) timing = Math.round(timing * 0.5);
    else timing = Math.min(100, timing + 8);

    let stability = fail ? 15 : (testing.fixed ? 92 : 66);
    if (mats.energy && mats.energy.id === "large" && !fail) stability -= 10;
    stability = Math.max(0, Math.min(100, stability));

    let safety = 100;
    if (drift > 200) safety -= Math.min(45, (drift - 200) / 10);
    if (fail === "PAD_CATO") safety -= 60;
    else if (fail) safety -= 30;
    safety = Math.max(0, Math.round(safety));

    let style = 38;
    if (mats.color) style += (mats.color.chems ? mats.color.chems.length : 1) * 11;
    if (mats.casing) style += mats.casing.id === "willow" ? 22 : mats.casing.id === "multibreak" ? 18 : 10;
    if (mats.energy) style += mats.energy.id === "large" ? 12 : mats.energy.id === "medium" ? 8 : 4;
    if (fail) style = Math.round(style * 0.4);
    style = Math.max(0, Math.min(100, style));

    const avg = Math.round((accuracy + timing + stability + safety + style) / 5);
    const rk = RANKS.find(r => avg >= r[0]);
    const success = avg >= 55 && !fail && apo >= tgt * 0.8;
    const awardedPoints = Math.round((mission.basePoints || 600) * (avg / 100) * (success ? 1 : 0.5));
    return {
      metrics: { accuracy, timing, stability, safety, style },
      avg, rank: rk[1], rankTitle: rk[2], rankIndex: RANKS.indexOf(rk),
      success, awardedPoints
    };
  }
  function safeDerived() { try { return FW().derived(); } catch (e) { return {}; } }

  function onFlightDone(sum) {
    if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
    dropRoomTone();
    const lc = el("launch-control"); if (lc) { lc.hidden = true; lc.className = "launch-control"; }
    lastSummary = sum;
    lastScore = computeScorecard(sum);
    let res = { notes: [] };
    try { res = RS().commitCampaignResult(sum, lastScore) || res; } catch (e) { console.warn("[Campaign] commit", e); }
    lastScore._notes = res.notes || [];
    go(S.DEBRIEF);
  }

  const MET_TH = {
    accuracy: "Mission Accuracy", timing: "Timing", stability: "System Stability",
    safety: "Safety", style: "Style"
  };

  function renderDebrief() {
    campShow("screen-debrief");
    const sc = lastScore, sum = lastSummary || {};
    if (!sc) { teardown(); RS().show("home"); RS().renderHome(); return; }

    const rows = Object.keys(MET_TH).map(k => {
      const v = sc.metrics[k];
      const cls = v >= 75 ? "good" : v >= 50 ? "mid" : "bad";
      return `<tr>
        <td>${MET_TH[k]}</td>
        <td class="cmp-bar-cell"><span class="cmp-bar ${cls}" style="width:${v}%"></span></td>
        <td class="cmp-score ${cls}">${v}</td></tr>`;
    }).join("");

    el("debrief-body").innerHTML = `
      <div class="cmp-rank cmp-rank-${sc.rank}">
        <div class="cmp-rank-badge">${sc.rank}</div>
        <div class="cmp-rank-text">
          <div class="cmp-rank-title">Rank: ${sc.rank} — ${sc.rankTitle}</div>
          <div class="cmp-rank-sub">คะแนนเฉลี่ย ${sc.avg}/100 · +${fmt(sc.awardedPoints)} แต้ม · ${sc.success ? "ภารกิจสำเร็จ 🎉" : "ยังไม่ผ่านเกณฑ์"}</div>
        </div>
      </div>
      <table class="cmp-scorecard"><tbody>${rows}</tbody></table>
      ${sc._notes && sc._notes.length ? `<div class="cmp-unlock">${sc._notes.join("<br>")}</div>` : ""}`;

    NPC.show("pchang");
    const pLine = sc.avg >= 85
      ? "งานระดับช่างใหญ่ — วิถีสวย จังหวะแม่น เอกสารครบ ไม่มีอะไรให้ติ"
      : sc.avg >= 70
        ? "ผ่านเกณฑ์อย่างมั่นคง จุดที่เสียคะแนนคือ" + (sc.metrics.timing < 60 ? " จังหวะชนวน" : sc.metrics.safety < 70 ? " ระยะปลอดภัย" : " สไตล์ดอกพลุ") + " — รอบหน้าปรับได้"
        : sc.success
          ? "ผ่านแบบเฉียดฉิว — กลับไปทบทวน System Check กับการเลือกดินขับ"
          : "ภารกิจไม่ผ่าน วิเคราะห์สาเหตุจากตาราง แล้วลองใหม่ นี่คือส่วนหนึ่งของการเป็นช่าง";
    const kLine = sc.avg >= 70
      ? "เย้! เราทำได้! ผมจะไปเล่าให้ที่บ้านฟัง 🎊"
      : sc.avg >= 55
        ? "ก็... ไม่แย่นะครับพี่ ครั้งหน้าผมจะไม่เสียบสายผิดแล้ว"
        : "ฮือ... ผมขอโทษครับพี่ 😢 ผมจะฝึกให้เก่งกว่านี้";
    const style = sc.metrics.style, acc = sc.metrics.accuracy;
    const cLine = sc.avg >= 85
      ? `ดอกใหญ่มากกก! ถ้าหนูอยู่บนนั้นคง ${Math.max(3, Math.round(acc / 12))}G เต็ม ๆ — ปีหน้าเอาหนูขึ้นนะ! 🚀`
      : sc.avg >= 55
        ? (style >= 80 ? "ระเบิดสวยเว่อร์! หนูดูจนคอเคล็ด 🤩" : "โอเคอยู่ ๆ แต่หนูว่าดอกน่าจะใหญ่กว่านี้ได้อีก!")
        : "ตูม... เล็กจัง 😿 หนูนั่งรอเก้อเลย คราวหน้าอัดดินเยอะ ๆ นะพี่";
    NPC.play([{ who: "pchang", text: pLine }, { who: "kapi", text: kLine }, { who: "chaom", text: cLine }]);

    el("debrief-home").onclick = () => { teardown(); RS().endCampaign(); RS().renderHome(); RS().show("home"); };
    el("debrief-next").onclick = () => { teardown(); RS().endCampaign(); RS().renderMissions(); RS().show("mission"); };
  }

  function teardown() {
    NPC.hide();
    if (window.TestingGames) { try { window.TestingGames.unmount(); } catch (e) {} }
    if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
    dropRoomTone();
    const lc = el("launch-control"); if (lc) { lc.hidden = true; lc.className = "launch-control"; }
    const lb = $("#screen-launch .launch-back"); if (lb) lb.hidden = false;
    restoreVabNav();
    const cb = el("campaign-stepbar"); if (cb) cb.hidden = true;
    ["screen-briefing", "screen-material", "screen-testing", "screen-debrief"].forEach(id => { const s = el(id); if (s) s.hidden = true; });
    state = null;
  }

  window.Campaign = { wants, begin, assemblyDone, get state() { return state; }, get mission() { return mission; } };
  window.NPC = NPC;   // Phase 17: js/testing.js ใช้เรียกบทสนทนาระหว่างมินิเกม
})();
