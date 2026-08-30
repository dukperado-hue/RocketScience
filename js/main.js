// js/main.js
// สเตตแมชชีนหลัก: เลือกภารกิจ → เลือกจรวด → ตั้งชื่อ → ประกอบ (VAB) → ขออนุญาต → ปล่อย → รายงาน → ปลดล็อก
// โหลดหลัง data.js / law.js / physics.js / launch2d.js

(function () {
  "use strict";
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const PROGRESS_KEY = "rocketscience-progress";
  const SCREENS = ["home", "mission", "rocket", "name", "vab", "launch", "report"];

  // ---------------- progress / state ----------------
  const defaultProgress = () => ({ unlockedTiers: ["tier1"], totalScore: 0, missionsPassed: [] });

  function loadProgress() {
    try {
      const p = JSON.parse(localStorage.getItem(PROGRESS_KEY));
      if (p && Array.isArray(p.unlockedTiers)) return Object.assign(defaultProgress(), p);
    } catch (e) {}
    return defaultProgress();
  }
  function saveProgress() {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(G.progress)); } catch (e) {}
    renderScoreBadge();
  }

  const G = {
    progress: loadProgress(),
    run: null,
    launchInstance: null
  };

  function newRun(mission) {
    G.run = {
      mission,
      rocket: null,
      name: "",
      assembly: [],          // array of part ids (bottom → top)
      stats: null,
      legalChecks: [],       // requirement ids completed
      legalResult: null,
      wind: 0,
      flightSummary: null
    };
  }

  // ---------------- screen routing ----------------
  function show(name) {
    SCREENS.forEach(s => { const el = $("#screen-" + s); if (el) el.hidden = (s !== name); });
    const bar = $("#stepbar");
    if (name === "home") { bar.hidden = true; }
    else {
      bar.hidden = false;
      const order = ["mission", "rocket", "name", "vab", "legal", "launch", "report"];
      const stepName = name === "launch" || name === "report" ? name : name;
      const idx = order.indexOf(name);
      $$("#stepbar span").forEach(sp => {
        const i = order.indexOf(sp.dataset.step);
        sp.classList.toggle("active", sp.dataset.step === name);
        sp.classList.toggle("done", i > -1 && idx > -1 && i < idx);
      });
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // ---------------- theme (shared with lab via codex-theme) ----------------
  window.setTheme = function (theme) {
    if (theme === "light") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("codex-theme", theme); } catch (e) {}
    syncThemeButtons();
  };
  function syncThemeButtons() {
    const cur = document.documentElement.getAttribute("data-theme") || "light";
    $$(".theme-toggle button").forEach(b => b.classList.toggle("active", b.dataset.themeBtn === cur));
  }

  // ---------------- helpers ----------------
  const tierN = k => (TIERS[k] ? TIERS[k].n : 0);
  const rocketById = id => ROCKETS.find(r => r.id === id);
  const missionById = id => MISSIONS.find(m => m.id === id);
  function partById(id) {
    const p = PARTS.find(x => x.id === id);
    if (!p) return null;
    // normalize to the shape the user's spec asked for
    return Object.assign({ name: p.nameTh, thrust: p.thrust || 0, tier: p.tierMin }, p);
  }
  const fmt = (n, d = 0) => Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

  function tierUnlocked(k) { return G.progress.unlockedTiers.includes(k); }

  // ---------------- HOME ----------------
  function renderScoreBadge() { $("#score-badge b").textContent = fmt(G.progress.totalScore); }

  function renderHome() {
    renderScoreBadge();
    const hasProgress = G.progress.totalScore > 0 || G.progress.unlockedTiers.length > 1;
    $("#btn-continue").hidden = !hasProgress;
    $("#btn-reset-progress").hidden = !hasProgress;

    const ladder = $("#tier-ladder");
    ladder.innerHTML = "";
    Object.values(TIERS).forEach(t => {
      const unlocked = tierUnlocked(t.key);
      const row = document.createElement("div");
      row.className = "tier-row" + (unlocked ? "" : " locked");
      row.innerHTML = `
        <span class="tn">TIER ${t.n}</span>
        <span>
          <span class="tt">${t.nameTh}</span><br>
          <span class="ts">${t.sub}</span>
        </span>
        <span class="tlock">${unlocked
          ? (t.playable ? "ปลดล็อกแล้ว" : "Phase 2 · เร็ว ๆ นี้")
          : "🔒 ต้องมี " + fmt(t.unlockScore) + " แต้ม"}</span>`;
      ladder.appendChild(row);
    });
  }

  // ---------------- MISSION ----------------
  function renderMissions() {
    const grid = $("#mission-grid");
    grid.innerHTML = "";
    MISSIONS.forEach(m => {
      const t = TIERS[m.tierKey];
      const locked = m.locked || !tierUnlocked(m.tierKey) || !t.playable;
      const card = document.createElement("button");
      card.className = "pick-card";
      card.disabled = locked;
      card.innerHTML = `
        <div class="pc-sub">TIER ${t.n} · ${t.nameTh}</div>
        <div class="pc-title">${m.titleTh}</div>
        <div class="pc-desc">${m.briefTh}</div>
        <div class="pc-meta">
          <span class="pc-tag">เป้าหมาย ${fmt(m.targetAltitude)} m</span>
          <span class="pc-tag">งบ ${fmt(m.budget)} ฿</span>
          <span class="pc-tag">ฐาน ${fmt(m.basePoints)} แต้ม</span>
          ${(m.hazards || []).map(h => `<span class="pc-hazard">${h}</span>`).join("")}
          ${locked ? `<span class="pc-hazard">🔒 ${m.locked ? "Phase 2" : "ยังไม่ปลดล็อก"}</span>` : ""}
        </div>`;
      if (!locked) card.addEventListener("click", () => { newRun(m); goRocket(); });
      grid.appendChild(card);
    });
  }

  // ---------------- ROCKET SELECT ----------------
  function goRocket() {
    const m = G.run.mission;
    $("#rocket-hint").textContent =
      `ภารกิจ “${m.titleTh}” — จรวดที่เลือกได้ในระดับนี้ (Tier ${TIERS[m.tierKey].n})`;
    const grid = $("#rocket-grid");
    grid.innerHTML = "";
    ROCKETS.forEach(r => {
      const rt = TIERS[r.tierKey];
      // อนุญาตจรวดที่ tier <= tier ภารกิจ และ tier นั้นปลดล็อก+เล่นได้
      const usable = tierN(r.tierKey) <= tierN(m.tierKey) && tierUnlocked(r.tierKey) && rt.playable;
      const card = document.createElement("button");
      card.className = "pick-card";
      card.disabled = !usable;
      card.innerHTML = `
        <div class="pc-icon">${r.icon}</div>
        <div class="pc-sub">TIER ${rt.n}</div>
        <div class="pc-title">${r.nameTh} <span style="font-weight:400;color:var(--ink-faint);font-size:12px">${r.nameEn}</span></div>
        <div class="pc-desc">${r.blurb}</div>
        <div class="pc-meta">
          <span class="pc-tag">แรงขับฐาน ${fmt(r.baseThrust)} N</span>
          <span class="pc-tag">${r.spinStabilized ? "หมุนนิ่ง (spin-stab)" : "ไม่หมุน"}</span>
          ${usable ? "" : `<span class="pc-hazard">🔒</span>`}
        </div>`;
      if (usable) card.addEventListener("click", () => { G.run.rocket = r; goName(); });
      grid.appendChild(card);
    });
    show("rocket");
  }

  // ---------------- NAME ----------------
  const NAME_IDEAS = ["ผไทเดโช 1", "นาคราช", "ท้าวสุระ", "โคจรฝัน", "สยามสเปซ", "อีสานบูรพา", "จันทราวิถี", "เหินหาว"];
  function goName() {
    const r = G.run.rocket;
    $("#name-icon").textContent = r.icon;
    const input = $("#rocket-name-input");
    input.value = G.run.name || "";
    const sug = $("#name-suggest");
    sug.innerHTML = "";
    NAME_IDEAS.slice().sort(() => Math.random() - .5).slice(0, 4).forEach(n => {
      const b = document.createElement("button");
      b.textContent = n;
      b.addEventListener("click", () => { input.value = n; });
      sug.appendChild(b);
    });
    show("name");
  }

  // ---------------- VAB ----------------
  const VAB = {
    slots: [],           // array of part ids
    render() {
      const r = G.run.rocket;
      // inventory
      const list = $("#vab-parts");
      list.innerHTML = "";
      PARTS.filter(p => p.tierMin <= tierN(r.tierKey)).forEach(p => {
        const el = document.createElement("div");
        el.className = "vab-part";
        el.draggable = true;
        el.dataset.partId = p.id;
        const stat = p.type === "engine" ? `แรงขับ ${fmt(p.thrust)} N`
          : p.type === "propellant" ? `+${fmt(p.fuel)} kg เชื้อเพลิง`
          : p.type === "nosecone" ? "ลดแรงต้านอากาศ"
          : p.type === "fin" ? `เพิ่มเสถียรภาพ +${Math.round((p.stability || 0) * 100)}%`
          : p.scoreBonus ? `+${fmt(p.scoreBonus)} แต้มเมื่อสำเร็จ` : "";
        el.innerHTML = `
          <span class="vp-icon">${p.icon}</span>
          <span class="vp-name"><span class="vab-part-type">${p.type}</span>${p.nameTh}</span>
          <span class="vp-stat">${fmt(p.mass, p.mass < 10 ? 2 : 0)} kg<br>${stat}</span>`;
        el.addEventListener("dragstart", e => {
          e.dataTransfer.setData("text/plain", p.id);
          el.classList.add("dragging");
        });
        el.addEventListener("dragend", () => el.classList.remove("dragging"));
        el.addEventListener("click", () => VAB.add(p.id));  // touch / click fallback
        list.appendChild(el);
      });
      VAB.renderGrid();
    },
    renderGrid() {
      const grid = $("#vab-grid");
      grid.querySelectorAll(".vab-slot").forEach(n => n.remove());
      const empty = $("#vab-grid-empty");
      empty.hidden = VAB.slots.length > 0;
      VAB.slots.forEach((pid, idx) => {
        const p = partById(pid);
        const slot = document.createElement("div");
        slot.className = "vab-slot " + p.type;
        slot.innerHTML = `
          <span class="vs-icon">${p.icon}</span>
          <span class="vs-name">${p.nameTh}</span>
          <button class="vs-x" title="เอาออก" data-idx="${idx}">✕</button>`;
        slot.querySelector(".vs-x").addEventListener("click", () => { VAB.slots.splice(idx, 1); VAB.update(); });
        grid.appendChild(slot);
      });
      VAB.computeStats();
    },
    add(pid) {
      const r = G.run.rocket;
      if (VAB.slots.length >= r.maxParts) { toast(`จรวดนี้ใส่ได้สูงสุด ${r.maxParts} ชิ้น`); return; }
      VAB.slots.push(pid);
      VAB.update();
    },
    update() { VAB.renderGrid(); },
    reset() { VAB.slots = []; VAB.update(); },

    computeStats() {
      const r = G.run.rocket;
      const parts = VAB.slots.map(partById);
      const engineThrust = parts.filter(p => p.type === "engine").reduce((s, p) => s + p.thrust, 0);
      const fuelMass = parts.filter(p => p.type === "propellant").reduce((s, p) => s + p.fuel, 0);
      const nonFuelMass = parts.filter(p => p.type !== "propellant").reduce((s, p) => s + p.mass, 0);
      const dryMass = r.dryMass + nonFuelMass;
      const wetMass = dryMass + fuelMass;
      let dragCoef = r.dragCoef + parts.reduce((s, p) => s + (p.dragMod || 0), 0);
      dragCoef = Math.max(0.02, dragCoef);
      const spin = r.spinStabilized || parts.some(p => p.addsSpin);
      const burnTime = Math.max(0.8, Math.min(20, parts.filter(p => p.type === "propellant").reduce((s, p) => s + p.burn, 0) || 1.2));
      const thrust = engineThrust || r.baseThrust * 0; // ต้องมีเครื่องยนต์จริง
      const twr = wetMass > 0 && thrust > 0 ? thrust / (wetMass * 9.81) : 0;
      const deltaV = fuelMass > 0 && dryMass > 0 ? r.isp * 9.81 * Math.log(wetMass / dryMass) : 0;
      const scoreBonusParts = parts.reduce((s, p) => s + (p.scoreBonus || 0), 0);
      let wobble = r.thrustWobble || 0;
      if (spin && !r.spinStabilized) wobble *= 0.5;

      const stats = {
        thrust, engineThrust, fuelMass, dryMass, wetMass, dragCoef, spin, burnTime, twr, deltaV,
        scoreBonusParts, wobble, partCount: parts.length,
        hasEngine: engineThrust > 0, hasFuel: fuelMass > 0
      };
      G.run.stats = stats;

      // paint telemetry
      $("#t-mass").textContent = fmt(wetMass, 2) + " kg";
      $("#t-thrust").textContent = fmt(thrust) + " N";
      const twrEl = $("#t-twr");
      twrEl.textContent = fmt(twr, 2);
      twrEl.className = twr >= 1.2 ? "ok" : twr >= 1 ? "warn" : "bad";
      $("#t-dv").textContent = fmt(deltaV) + " m/s";
      $("#t-burn").textContent = fmt(burnTime, 1) + " s";
      $("#t-tier").textContent = estTier(thrust);

      const ok = stats.hasEngine && stats.hasFuel && twr > 1 && stats.partCount <= r.maxParts;
      const v = $("#t-verdict");
      if (!stats.hasEngine) { v.textContent = "ยังไม่มีเครื่องยนต์"; v.className = "telem-verdict bad"; }
      else if (!stats.hasFuel) { v.textContent = "ยังไม่มีเชื้อเพลิง (ดินขับ)"; v.className = "telem-verdict bad"; }
      else if (twr <= 1) { v.textContent = "TWR ≤ 1 — จรวดหนักเกินกว่าจะลอยขึ้น"; v.className = "telem-verdict bad"; }
      else { v.textContent = "พร้อมปล่อย ✓ TWR > 1"; v.className = "telem-verdict ok"; }

      $("#vab-proceed").disabled = !ok;
      return stats;
    }
  };

  function estTier(thrust) {
    if (thrust <= 0) return "—";
    if (thrust < 300) return "Tier 1 (วัตถุลอยระดับต่ำ)";
    if (thrust < 2000) return "Tier 2 (จรวดพื้นบ้าน)";
    if (thrust < 10000) return "Tier 3 (สมัครเล่น)";
    if (thrust < 200000) return "Tier 4 (วิถีโค้ง)";
    return "Tier 5 (วงโคจร)";
  }

  function goVab() {
    G.run.name = $("#rocket-name-input").value.trim() || (G.run.rocket.nameTh + " I");
    VAB.slots = [];
    // เติมชิ้นส่วนพื้นฐานให้เริ่มต้นง่าย
    const r = G.run.rocket;
    if (r.tierKey === "tier1") VAB.slots = ["burner_l", "prop_s"];
    else VAB.slots = [r.id === "talai" ? "motor_ring" : "motor_pvc", "prop_l", "fin_light"];
    VAB.render();
    setupVabDnD();
    show("vab");
  }

  let vabDnDReady = false;
  function setupVabDnD() {
    if (vabDnDReady) return;
    vabDnDReady = true;
    const grid = $("#vab-grid");
    grid.addEventListener("dragover", e => { e.preventDefault(); grid.classList.add("drag-over"); });
    grid.addEventListener("dragleave", () => grid.classList.remove("drag-over"));
    grid.addEventListener("drop", e => {
      e.preventDefault();
      grid.classList.remove("drag-over");
      const pid = e.dataTransfer.getData("text/plain");
      if (pid) VAB.add(pid);
    });
    $("#vab-reset").addEventListener("click", () => VAB.reset());
    $("#vab-proceed").addEventListener("click", proceedToLegal);
  }

  // ---------------- assembled-rocket JSON (passed to law.js) ----------------
  function buildAssembledRocket() {
    const r = G.run.rocket, s = G.run.stats;
    return {
      rocketId: r.id,
      name: G.run.name,
      tier: tierN(r.tierKey),
      legalTier: TIERS[r.tierKey].legalTier,
      parts: VAB.slots.map(pid => {
        const p = partById(pid);
        return { id: p.id, name: p.name, type: p.type, mass: p.mass, thrust: p.thrust || 0, tier: p.tier };
      }),
      stats: {
        totalMass: +s.wetMass.toFixed(2),
        totalThrust: s.thrust,
        twr: +s.twr.toFixed(3),
        deltaV: Math.round(s.deltaV),
        burnTime: +s.burnTime.toFixed(1)
      }
    };
  }

  function proceedToLegal() {
    G.run.stats = VAB.computeStats();
    const assembled = buildAssembledRocket();
    G.run.assembly = assembled;
    console.log("[RocketScience] Assembled rocket → law.js:", JSON.stringify(assembled, null, 2));
    openLegalModal();
  }

  // ---------------- LEGAL CLEARANCE MODAL ----------------
  function openLegalModal() {
    const r = G.run.rocket;
    const tierKey = TIERS[r.tierKey].legalTier;
    const law = LegalFramework[tierKey];
    G.run.legalChecks = [];
    $("#legal-tier-name").textContent = law.name;
    $("#legal-lawrefs").textContent = "อ้างอิง: " + (law.lawRefs || []).join("  ·  ");
    $("#legal-warn").hidden = true;
    const ig = $("#legal-ignite");
    ig.textContent = "🔥 IGNITION";
    delete ig.dataset.armed;

    const list = $("#legal-list");
    list.innerHTML = "";
    law.requirements.forEach(req => {
      const li = document.createElement("li");
      li.className = "legal-item";
      li.dataset.reqId = req.id;
      li.innerHTML = `
        <input type="checkbox" ${req.minigame ? "disabled" : ""}>
        <div class="li-main">
          <div class="li-desc">${req.desc}</div>
          <div class="li-req ${req.isRequired ? "req" : "opt"}">${req.isRequired ? "บังคับ" : "ทำได้แต้มพิเศษ +" + (req.bonus || 0)}</div>
          ${req.minigame ? `<button class="li-action">ดำเนินการ</button>` : ""}
        </div>`;
      const cb = li.querySelector("input");
      const setChecked = on => {
        li.classList.toggle("checked", on);
        cb.checked = on;
        const i = G.run.legalChecks.indexOf(req.id);
        if (on && i < 0) G.run.legalChecks.push(req.id);
        if (!on && i > -1) G.run.legalChecks.splice(i, 1);
      };
      if (req.minigame) {
        li.querySelector(".li-action").addEventListener("click", () =>
          runMiniGame(req, ok => { if (ok) setChecked(true); }));
      } else {
        cb.addEventListener("change", () => setChecked(cb.checked));
      }
      list.appendChild(li);
    });

    $("#legal-modal").hidden = false;
    $$("#stepbar span").forEach(sp => sp.classList.toggle("active", sp.dataset.step === "legal"));
  }

  function closeLegal() { $("#legal-modal").hidden = true; }

  // mini-games — ผลลัพธ์เรียก cb(true/false)
  function runMiniGame(req, cb) {
    const modal = $("#mini-modal");
    const title = $("#mini-title");
    const body = $("#mini-body");
    body.innerHTML = "";
    const close = () => { modal.hidden = true; };
    const opt = (label, good) => {
      const b = document.createElement("button");
      b.className = "mini-opt";
      b.textContent = label;
      b.addEventListener("click", () => {
        close();
        if (good) toast("ดำเนินการสำเร็จ ✓"); else toast("ผิดขั้นตอน — ลองใหม่ได้");
        cb(good);
      });
      body.appendChild(b);
    };

    if (req.minigame === "airport") {
      title.textContent = "ตรวจเขตปลอดภัยสนามบิน";
      const p = document.createElement("p");
      p.textContent = "พ.ร.บ.การเดินอากาศ ห้ามปล่อยวัตถุรบกวนการบินใกล้สนามบิน จุดปล่อยของคุณควรอยู่ห่างเท่าไร?";
      body.appendChild(p);
      opt("ปล่อยห่างจากสนามบินมากกว่า 9 กม. และแจ้งหอบังคับการบิน", true);
      opt("ปล่อยห่าง 3 กม. ช่วงเครื่องบินพักเที่ยง", false);
      opt("ไม่ต้องเช็ก ลมพัดออกทะเลอยู่แล้ว", false);
    } else if (req.minigame === "notam") {
      title.textContent = "ออกประกาศ NOTAM";
      body.appendChild(Object.assign(document.createElement("p"),
        { textContent: "NOTAM (Notice to Airmen) แจ้งเตือนนักบินถึงกิจกรรมในห้วงอากาศ ต้องระบุอะไรบ้าง?" }));
      opt("พิกัด ความสูงสูงสุด ช่วงเวลาเริ่ม–สิ้นสุด และหน่วยงานผู้รับผิดชอบ", true);
      opt("แค่ชื่อทีมและเบอร์โทรก็พอ", false);
      opt("โพสต์ลงเฟซบุ๊กกลุ่มจรวดสมัครเล่น", false);
    } else if (req.minigame === "permit") {
      title.textContent = "ยื่นคำร้องขออนุญาต";
      body.appendChild(Object.assign(document.createElement("p"),
        { textContent: "ยื่นคำร้องต่อหน่วยงานที่กำกับดูแล พร้อมเอกสารประกอบ" }));
      opt("ยื่นแบบคำขอ + แผนความปลอดภัย + ประกันภัย ล่วงหน้าตามกำหนด", true);
      opt("โทรบอกปากเปล่ากับเจ้าหน้าที่คนรู้จัก", false);
    } else if (req.minigame === "impact") {
      title.textContent = "ประเมินจุดตกกระทบภาคพื้น";
      body.appendChild(Object.assign(document.createElement("p"),
        { textContent: "จรวดวิถีโค้งมีชิ้นส่วนตกกลับสู่พื้น ต้องกำหนดพื้นที่อย่างไร?" }));
      opt("คำนวณ ellipse จุดตก เผื่อความคลาดเคลื่อน กันพื้นที่ชุมชนออกทั้งหมด", true);
      opt("เล็งไปกลางป่า น่าจะไม่โดนใคร", false);
    } else if (req.minigame === "insurance") {
      title.textContent = "จัดสรรงบประกันภัยระหว่างประเทศ";
      body.appendChild(Object.assign(document.createElement("p"),
        { textContent: "Liability Convention 1972 ให้รัฐผู้ปล่อยรับผิดเต็มจำนวนหากบูสเตอร์ตกใส่ประเทศอื่น" }));
      opt("กันงบประกันความรับผิดต่อบุคคลที่สามวงเงินสูงก่อนปล่อย", true);
      opt("เอางบไปเพิ่มเชื้อเพลิงให้ขึ้นสูงกว่าเดิม", false);
    } else { cb(true); return; }

    modal.hidden = false;
  }

  // ---------------- LAUNCH ----------------
  function doLaunch() {
    const r = G.run.rocket, s = G.run.stats, m = G.run.mission;
    // legal verdict (คำนวณตอนกด IGNITION)
    G.run.legalResult = checkClearance(TIERS[r.tierKey].legalTier, G.run.legalChecks);
    closeLegal();

    // ลมสุ่มต่อการปล่อย
    G.run.wind = +( (Math.random() * 2 - 1) * (2 + tierN(r.tierKey) * 1.5) ).toFixed(1);

    show("launch");
    $("#launch-caption").textContent =
      `${G.run.name} · ลม ${G.run.wind >= 0 ? "→" : "←"} ${Math.abs(G.run.wind)} m/s` +
      (s.spin ? " · หมุนนิ่ง" : "");

    const cfg = {
      thrust: s.thrust,
      burnTime: s.burnTime,
      wetMass: s.wetMass,
      dryMass: s.dryMass,
      dragCoef: s.dragCoef,
      windSpeed: G.run.wind,
      windSensitivity: r.windSensitivity,
      spinStabilized: s.spin,
      thrustWobble: s.wobble,
      targetAltitude: m.targetAltitude,
      rocketMeta: { icon: r.icon, spinStabilized: s.spin }
    };

    G.launchInstance = window.Launch2D.run($("#launch-canvas"), cfg, {
      onComplete: summary => { G.run.flightSummary = summary; showReport(summary); }
    });
  }

  // ---------------- REPORT + SCORING ----------------
  function showReport(sum) {
    const m = G.run.mission, r = G.run.rocket, s = G.run.stats, lr = G.run.legalResult;
    const rows = [];
    const ratio = Math.max(0, Math.min(1.5, sum.apogee / m.targetAltitude));
    const altPts = Math.round(m.basePoints * ratio);
    rows.push(["ความสูงที่ทำได้ " + fmt(sum.apogee) + " m / เป้า " + fmt(m.targetAltitude) + " m", altPts, altPts >= 0]);

    let goalBonus = 0;
    const reachedTarget = sum.apogee >= m.targetAltitude * 0.98;
    if (reachedTarget) { goalBonus = Math.round(m.basePoints * 0.5); rows.push(["โบนัสถึงเป้าหมาย", goalBonus, true]); }

    let accBonus = 0;
    if (Math.abs(sum.horizontalDrift) < m.targetAltitude * 0.15 && !sum.crashed) {
      accBonus = Math.round(m.basePoints * 0.2);
      rows.push(["วิถีตรง (ลอยเฉ " + fmt(Math.abs(sum.horizontalDrift)) + " m)", accBonus, true]);
    }

    let payloadBonus = s.scoreBonusParts || 0;
    if (payloadBonus && !sum.crashed) rows.push(["เพย์โหลดทำงาน", payloadBonus, true]);
    else payloadBonus = 0;

    let crashPen = 0;
    if (sum.crashed) { crashPen = Math.round(m.basePoints * 0.6); rows.push(["จรวดตกกระแทกเสียหาย", -crashPen, false]); }

    const legalBonus = lr.bonusEarned || 0;
    if (legalBonus) rows.push(["ทำเอกสารเสริมครบ", legalBonus, true]);

    let legalPen = 0;
    if (lr.status === "VIOLATION") { legalPen = lr.penaltyPoints || 0; rows.push(["ละเมิดกฎหมาย (ลักลอบปล่อย)", -legalPen, false]); }

    let total = altPts + goalBonus + accBonus + payloadBonus + legalBonus - crashPen - legalPen;
    if (lr.gameOver && lr.status === "VIOLATION") { total = -(legalPen); }

    // paint
    const tbody = $("#report-rows");
    tbody.innerHTML = rows.map(([label, val, pos]) =>
      `<tr><td>${label}</td><td class="${val >= 0 ? "pos" : "neg"}">${val >= 0 ? "+" : ""}${fmt(val)}</td></tr>`).join("");
    $("#report-total").textContent = fmt(total);

    const cleared = lr.status === "CLEARED";
    const success = cleared && reachedTarget && !sum.crashed;
    const vEl = $("#report-verdict");
    vEl.className = "report-verdict " + (success ? "ok" : "bad");
    vEl.textContent = success ? "ภารกิจสำเร็จ 🎉"
      : lr.gameOver && !cleared ? "จบเกม — ผลจากการละเมิดกฎหมาย"
      : !cleared ? "ปล่อยได้ แต่ผิดกฎหมาย"
      : sum.crashed ? "จรวดตก — ภารกิจไม่ผ่าน"
      : "ยังไม่ถึงเป้าหมาย";

    $("#report-legal").textContent = "⚖️ " + lr.message;

    // ---- persist score + unlock ----
    G.progress.totalScore = Math.max(0, G.progress.totalScore + total);
    if (success && !G.progress.missionsPassed.includes(m.id)) G.progress.missionsPassed.push(m.id);

    const unlockBox = $("#report-unlock");
    unlockBox.hidden = true;
    const newlyUnlocked = tryUnlockTiers();
    if (newlyUnlocked.length) {
      unlockBox.hidden = false;
      unlockBox.textContent = "🔓 ปลดล็อก " + newlyUnlocked.map(k => "Tier " + TIERS[k].n + " · " + TIERS[k].nameTh).join(", ");
      newlyUnlocked.forEach(k => toast("ปลดล็อก Tier " + TIERS[k].n + "!"));
    }
    saveProgress();

    // next-mission button target
    $("#btn-report-next").onclick = () => { renderMissions(); show("mission"); };
    show("report");
  }

  function tryUnlockTiers() {
    const newly = [];
    const ordered = Object.values(TIERS).sort((a, b) => a.n - b.n);
    ordered.forEach((t, i) => {
      if (tierUnlocked(t.key)) return;
      const prev = ordered[i - 1];
      const prevPassed = prev && MISSIONS.some(m => m.tierKey === prev.key && G.progress.missionsPassed.includes(m.id));
      if (prevPassed && G.progress.totalScore >= t.unlockScore) {
        G.progress.unlockedTiers.push(t.key);
        newly.push(t.key);
      }
    });
    return newly;
  }

  // ---------------- wire up ----------------
  function init() {
    syncThemeButtons();
    renderHome();

    $("#btn-start").addEventListener("click", () => { renderMissions(); show("mission"); });
    $("#btn-continue").addEventListener("click", () => { renderMissions(); show("mission"); });
    $("#btn-reset-progress").addEventListener("click", () => {
      if (!confirm("ล้างความคืบหน้าทั้งหมด?")) return;
      G.progress = defaultProgress();
      saveProgress();
      renderHome();
      toast("ล้างความคืบหน้าแล้ว");
    });

    $$("[data-back]").forEach(b => b.addEventListener("click", () => {
      const t = b.dataset.back;
      if (t === "mission") { renderMissions(); show("mission"); }
      else if (t === "rocket") goRocket();
      else if (t === "name") goName();
    }));

    $("#btn-to-vab").addEventListener("click", goVab);
    $("#legal-cancel").addEventListener("click", () => { closeLegal(); show("vab"); });
    $("#legal-ignite").addEventListener("click", () => {
      const btn = $("#legal-ignite");
      const law = LegalFramework[TIERS[G.run.rocket.tierKey].legalTier];
      const missing = law.requirements.filter(rq => rq.isRequired && !G.run.legalChecks.includes(rq.id));
      if (!missing.length || btn.dataset.armed === "1") { doLaunch(); return; }
      const w = $("#legal-warn");
      w.hidden = false;
      w.textContent = "⚠️ ยังขาดเอกสารบังคับ " + missing.length + " รายการ — ถ้ายืนยันปล่อย ถือเป็นการ “ลักลอบปล่อย” และจะโดนบทลงโทษตามระดับจรวด กด IGNITION อีกครั้งเพื่อยืนยัน";
      btn.textContent = "🔥 ยืนยันลักลอบปล่อย";
      btn.dataset.armed = "1";
    });

    $("#btn-report-home").addEventListener("click", () => { renderHome(); show("home"); });

    show("home");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
