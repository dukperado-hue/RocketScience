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
      if (!locked) card.addEventListener("click", () => {
        newRun(m); goRocket();
        if (window.Narrative) Narrative.missionIntro(m);
      });
      grid.appendChild(card);
    });
  }

  // ---------------- ROCKET SELECT ----------------
  function rocketMetaTags(r) {
    if (isStaged(r)) {
      const nS = (r.stages || []).length;
      const thr = (r.stages || [])[0] ? fmt(r.stages[0].thrust) + " N" : "";
      return `<span class="pc-tag">${nS} ท่อน (staging)</span>`
        + `<span class="pc-tag">แรงขับท่อน 1 ${thr}</span>`
        + (r.orbital ? `<span class="pc-tag">orbital</span>` : `<span class="pc-tag">sub-orbital</span>`);
    }
    return `<span class="pc-tag">แรงขับฐาน ${fmt(r.baseThrust)} N</span>`
      + `<span class="pc-tag">${r.spinStabilized ? "หมุนนิ่ง (spin-stab)" : "ไม่หมุน"}</span>`;
  }

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
          ${rocketMetaTags(r)}
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
  const isStaged = r => !!(TIERS[r.tierKey] && TIERS[r.tierKey].staged);

  const VAB = {
    slots: [],            // Tier 1–2: array of part ids
    payloadId: null,      // Tier 3–5: chosen payload part id
    upgrades: [],         // Tier 3–5: chosen upgrade part ids

    render() {
      const r = G.run.rocket;
      isStaged(r) ? VAB.renderStaged() : VAB.renderClassic();
    },

    // ===== Tier 1–2 (โมเดลท่อนเดียว) =====
    renderClassic() {
      const r = G.run.rocket;
      const list = $("#vab-parts");
      list.innerHTML = "";
      PARTS.filter(p => p.tierMin <= tierN(r.tierKey) && ["engine", "propellant", "fin", "nosecone", "payload"].includes(p.type) && p.tierMin <= 2).forEach(p => {
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
        el.addEventListener("dragstart", e => { e.dataTransfer.setData("text/plain", p.id); el.classList.add("dragging"); });
        el.addEventListener("dragend", () => el.classList.remove("dragging"));
        el.addEventListener("click", () => VAB.add(p.id));
        list.appendChild(el);
      });
      VAB.renderGridClassic();
    },
    renderGridClassic() {
      const grid = $("#vab-grid");
      grid.querySelectorAll(".vab-slot, .vab-stage").forEach(n => n.remove());
      $("#vab-grid-empty").hidden = VAB.slots.length > 0;
      VAB.slots.forEach((pid, idx) => {
        const p = partById(pid);
        const slot = document.createElement("div");
        slot.className = "vab-slot " + p.type;
        slot.innerHTML = `<span class="vs-icon">${p.icon}</span><span class="vs-name">${p.nameTh}</span>
          <button class="vs-x" title="เอาออก">✕</button>`;
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
    update() { isStaged(G.run.rocket) ? VAB.renderStaged() : VAB.renderGridClassic(); },
    reset() {
      if (isStaged(G.run.rocket)) { VAB.payloadId = null; VAB.upgrades = []; }
      else VAB.slots = [];
      VAB.update();
    },

    // ===== Tier 3–5 (จรวดมีท่อนสำเร็จ + เลือก payload/upgrade) =====
    renderStaged() {
      const r = G.run.rocket;
      const list = $("#vab-parts");
      list.innerHTML = "";

      const hd1 = document.createElement("div");
      hd1.className = "vab-sub-hd"; hd1.textContent = "เพย์โหลด (เลือก 1)";
      list.appendChild(hd1);
      (r.payloads || []).map(partById).forEach(p => {
        const sel = VAB.payloadId === p.id;
        const el = document.createElement("div");
        el.className = "vab-part" + (sel ? " picked" : "");
        el.innerHTML = `<span class="vp-icon">${p.icon}</span>
          <span class="vp-name">${p.nameTh}</span>
          <span class="vp-stat">${fmt(p.mass, p.mass < 10 ? 1 : 0)} kg<br>+${fmt(p.scoreBonus)} แต้ม</span>`;
        el.addEventListener("click", () => { VAB.payloadId = p.id; VAB.update(); });
        list.appendChild(el);
      });

      const hd2 = document.createElement("div");
      hd2.className = "vab-sub-hd"; hd2.textContent = "อัปเกรด (เลือกได้)";
      list.appendChild(hd2);
      (r.upgrades || []).map(partById).forEach(p => {
        const on = VAB.upgrades.includes(p.id);
        const el = document.createElement("div");
        el.className = "vab-part" + (on ? " picked" : "");
        el.innerHTML = `<span class="vp-icon">${p.icon}</span>
          <span class="vp-name">${p.nameTh}</span>
          <span class="vp-stat">${p.desc || ""}</span>`;
        el.addEventListener("click", () => {
          const i = VAB.upgrades.indexOf(p.id);
          if (i > -1) VAB.upgrades.splice(i, 1); else VAB.upgrades.push(p.id);
          VAB.update();
        });
        list.appendChild(el);
      });

      // grid = read-only stage stack + payload
      const grid = $("#vab-grid");
      grid.querySelectorAll(".vab-slot, .vab-stage").forEach(n => n.remove());
      $("#vab-grid-empty").hidden = true;
      const eff = effectiveStages(r);
      const pl = VAB.payloadId ? partById(VAB.payloadId) : null;
      if (pl) {
        const s = document.createElement("div");
        s.className = "vab-slot payload";
        s.innerHTML = `<span class="vs-icon">${pl.icon}</span><span class="vs-name">${pl.nameTh} · ${fmt(pl.mass, pl.mass < 10 ? 1 : 0)} kg</span>`;
        grid.appendChild(s);
      }
      eff.forEach((st, i) => {
        const d = document.createElement("div");
        d.className = "vab-stage";
        d.innerHTML = `<b>ท่อนที่ ${i + 1}</b> · ${fmt(st.thrust)} N · Isp ${st.isp}s
          <br><span class="vst-sub">เชื้อเพลิง ${fmt(st.propMass)} kg · โครงสร้าง ${fmt(st.dryMass)} kg · ${st.propType === "liquid" ? "เหลว" : "แข็ง"}</span>`;
        grid.appendChild(d);
      });
      VAB.computeStats();
    },

    computeStats() {
      const r = G.run.rocket;
      isStaged(r) ? VAB.computeStaged() : VAB.computeClassic();
      return G.run.stats;
    },

    computeClassic() {
      const r = G.run.rocket;
      const parts = VAB.slots.map(partById);
      const engineThrust = parts.filter(p => p.type === "engine").reduce((s, p) => s + p.thrust, 0);
      const fuelMass = parts.filter(p => p.type === "propellant").reduce((s, p) => s + p.fuel, 0);
      const nonFuelMass = parts.filter(p => p.type !== "propellant").reduce((s, p) => s + p.mass, 0);
      const dryMass = r.dryMass + nonFuelMass;
      const wetMass = dryMass + fuelMass;
      let dragCoef = Math.max(0.02, r.dragCoef + parts.reduce((s, p) => s + (p.dragMod || 0), 0));
      const spin = r.spinStabilized || parts.some(p => p.addsSpin);
      const burnTime = Math.max(0.8, Math.min(20, parts.filter(p => p.type === "propellant").reduce((s, p) => s + p.burn, 0) || 1.2));
      const thrust = engineThrust;
      const twr = wetMass > 0 && thrust > 0 ? thrust / (wetMass * 9.81) : 0;
      const deltaV = fuelMass > 0 ? r.isp * 9.81 * Math.log(wetMass / dryMass) : 0;
      const scoreBonusParts = parts.reduce((s, p) => s + (p.scoreBonus || 0), 0);
      let wobble = r.thrustWobble || 0;
      if (spin && !r.spinStabilized) wobble *= 0.5;

      // Phase 3: ความเสี่ยงความร้อนของโคมกระดาษ (ดินขับพลุ + ดินหนัก) — >1 = ไหม้กลางอากาศ
      const chargeThrust = parts.filter(p => p.type === "engine" && /^charge/.test(p.id))
        .reduce((s, p) => s + p.thrust, 0);
      const paperRisk = r.lantern ? (chargeThrust * 1.4 + fuelMass * 8) / (dryMass * 130) : 0;

      G.run.stats = {
        staged: false, thrust, fuelMass, dryMass, wetMass, dragCoef, spin, burnTime, twr, deltaV,
        scoreBonusParts, wobble, paperRisk, partCount: parts.length, hasEngine: engineThrust > 0, hasFuel: fuelMass > 0
      };

      renderTelem([
        ["มวลรวม", fmt(wetMass, 2) + " kg"],
        ["แรงขับรวม", fmt(thrust) + " N"],
        ["อัตราส่วนแรงขับ/น้ำหนัก (TWR)", fmt(twr, 2), twr >= 1.2 ? "ok" : twr >= 1 ? "warn" : "bad"],
        ["Δv โดยประมาณ", fmt(deltaV) + " m/s"],
        ["เวลาเผาไหม้", fmt(burnTime, 1) + " s"]
      ]);

      const s = G.run.stats;
      const ok = s.hasEngine && s.hasFuel && twr > 1 && s.partCount <= r.maxParts;

      // ลางบอกเหตุฟิสิกส์เฉพาะถิ่น (Phase 3) — เตือน ไม่บล็อก ให้ผู้เล่นได้เรียนรู้จากผล
      let riskHint = null;
      if (r.lantern && paperRisk > 1)
        riskHint = "⚠️ ความร้อนเกินพิกัดกระดาษสา — โคมจะติดไฟกลางอากาศ (ใช้หัวเผา ไม่ใช่ดินขับพลุ)";
      else if (r.lantern && paperRisk > 0.7)
        riskHint = "⚠️ ความร้อนใกล้พิกัดกระดาษสา — เสี่ยงไหม้";
      else if (r.blackPowder) {
        const load = fuelMass / Math.max(0.5, thrust / 100);
        if (load > 1.0) riskHint = "⚠️ ดินปืนเกินพิกัดปลอกลำ — เสี่ยงระเบิดคาแท่น (CATO)";
        else if (load > 0.72) riskHint = "⚠️ ดินปืนมาก ศูนย์ถ่วงจะเลื่อนไปท้าย — บั้งไฟอาจส่ายเสียความสูง";
      }

      setVerdict(!s.hasEngine ? ["ยังไม่มีเครื่องยนต์", "bad"]
        : !s.hasFuel ? ["ยังไม่มีเชื้อเพลิง (ดินขับ)", "bad"]
        : twr <= 1 ? ["TWR ≤ 1 — จรวดหนักเกินกว่าจะลอยขึ้น", "bad"]
        : riskHint ? [riskHint, ""]
        : ["พร้อมปล่อย ✓ TWR > 1", "ok"]);
      $("#vab-proceed").disabled = !ok;
    },

    computeStaged() {
      const r = G.run.rocket, m = G.run.mission;
      const eff = effectiveStages(r);
      const pl = VAB.payloadId ? partById(VAB.payloadId) : null;
      const payloadMass = pl ? pl.mass : (r.defaultPayload || 0);

      const cfg = {
        stages: eff, payloadMass, dragCoef: r.dragCoef,
        orbital: !!r.orbital, targetAltitude: m.targetAltitude,
        targetOrbitVelocity: m.targetOrbit || 0, launchAngleDeg: r.launchAngleDeg || 0
      };
      const f = window.Physics.createFlight(cfg);
      const glow = f.glow, dvB = f.deltaVBudget, dvR = f.deltaVRequired;
      const twr1 = eff[0].thrust / (glow * 9.80665);
      const payloadFrac = glow > 0 ? payloadMass / glow : 0;
      const orbitOK = !r.orbital || dvB >= dvR;

      G.run.stats = {
        staged: true, stages: eff, payloadMass, dragCoef: r.dragCoef,
        orbital: !!r.orbital, launchAngleDeg: r.launchAngleDeg || 0,
        deltaVBudget: dvB, deltaVRequired: dvR, deltaVMargin: dvB - dvR,
        glow, twr1, payloadFrac,
        scoreBonusParts: pl ? pl.scoreBonus : 0,
        stageDeltaV: f.stageDeltaV, orbitOK,
        payloadName: pl ? pl.nameTh : "—"
      };

      const rows = [
        ["มวลรวมตอนปล่อย (GLOW)", fmt(glow) + " kg"],
        ["เพย์โหลด / payload fraction", (pl ? fmt(payloadMass) + " kg" : "—") + " (" + (payloadFrac * 100).toFixed(2) + "%)"],
        ["แรงขับท่อน 1 / TWR", fmt(eff[0].thrust) + " N · " + fmt(twr1, 2), twr1 >= 1.15 ? "ok" : twr1 >= 1.02 ? "warn" : "bad"],
        ["Δv รวม (Tsiolkovsky)", fmt(dvB) + " m/s"],
        [r.orbital ? "Δv ที่ต้องใช้ (วงโคจร + loss)" : "Δv ที่ต้องใช้ (โดยประมาณ)", fmt(dvR) + " m/s",
          dvB >= dvR ? "ok" : "bad"]
      ];
      renderTelem(rows);

      if (!pl) setVerdict(["เลือกเพย์โหลดก่อน", "bad"]);
      else if (twr1 < 1.02) setVerdict(["TWR ท่อน 1 ต่ำเกินไป — ยกตัวไม่ขึ้น", "bad"]);
      else if (r.orbital && !orbitOK) setVerdict([`Δv ขาดอีก ${fmt(dvR - dvB)} m/s — จะขึ้นได้แต่ไม่ถึงวงโคจร`, "bad"]);
      else if (r.orbital) setVerdict([`Δv พอถึงวงโคจร เหลือ margin ${fmt(dvB - dvR)} m/s ✓`, "ok"]);
      else setVerdict(["พร้อมปล่อย ✓", "ok"]);

      $("#vab-proceed").disabled = !pl || twr1 < 1.02;
    }
  };

  // clone rocket.stages and apply chosen upgrade mods
  function effectiveStages(r) {
    const base = (r.stages || []).map(s => Object.assign({}, s));
    VAB.upgrades.forEach(uid => {
      const u = partById(uid); if (!u || !u.mod) return;
      const idx = u.mod.stage === "last" ? base.length - 1 : (u.mod.stage | 0);
      const st = base[idx]; if (!st) return;
      if (u.mod.thrustMul) st.thrust = Math.round(st.thrust * u.mod.thrustMul);
      if (u.mod.propMassMul) st.propMass = +(st.propMass * u.mod.propMassMul).toFixed(1);
      if (u.mod.dryMassMul) st.dryMass = +(st.dryMass * u.mod.dryMassMul).toFixed(1);
      if (u.mod.ispAdd) st.isp = st.isp + u.mod.ispAdd;
    });
    return base;
  }

  function renderTelem(rows) {
    $("#vab-telem").innerHTML = rows.map(([dt, dd, cls]) =>
      `<div><dt>${dt}</dt><dd${cls ? ` class="${cls}"` : ""}>${dd}</dd></div>`).join("");
  }
  function setVerdict([text, cls]) {
    const v = $("#t-verdict");
    v.textContent = text;
    v.className = "telem-verdict " + cls;
  }

  function goVab() {
    G.run.name = $("#rocket-name-input").value.trim() || (G.run.rocket.nameTh + " I");
    const r = G.run.rocket;
    VAB.slots = []; VAB.payloadId = null; VAB.upgrades = [];
    if (isStaged(r)) {
      VAB.payloadId = (r.payloads && r.payloads[0]) || null;   // เพย์โหลดเบาสุดเป็นค่าเริ่มต้น
    } else if (r.tierKey === "tier1") {
      VAB.slots = ["burner_l", "prop_s"];
    } else {
      VAB.slots = [r.id === "talai" ? "motor_ring" : "motor_pvc", "prop_l", "fin_light"];
    }
    $("#vab-mode-tag").textContent = isStaged(r) ? "STAGED VEHICLE" : "SINGLE STAGE";
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
    const common = { rocketId: r.id, name: G.run.name, tier: tierN(r.tierKey), legalTier: TIERS[r.tierKey].legalTier };
    if (s.staged) {
      return Object.assign(common, {
        staged: true,
        payload: { id: VAB.payloadId, name: s.payloadName, mass: s.payloadMass },
        upgrades: VAB.upgrades.slice(),
        stages: s.stages.map((st, i) => ({ n: i + 1, thrust: st.thrust, isp: st.isp, propMass: st.propMass, dryMass: st.dryMass, propType: st.propType })),
        stats: {
          glow: Math.round(s.glow),
          payloadFraction: +(s.payloadFrac).toFixed(4),
          twrStage1: +s.twr1.toFixed(3),
          deltaVBudget: Math.round(s.deltaVBudget),
          deltaVRequired: Math.round(s.deltaVRequired),
          deltaVMargin: Math.round(s.deltaVMargin),
          orbital: s.orbital,
          predictedOutcome: s.orbital ? (s.orbitOK ? "REACH_ORBIT" : "SUBORBITAL_SHORTFALL") : "SUBORBITAL"
        }
      });
    }
    return Object.assign(common, {
      staged: false,
      parts: VAB.slots.map(pid => { const p = partById(pid); return { id: p.id, name: p.name, type: p.type, mass: p.mass, thrust: p.thrust || 0, tier: p.tier }; }),
      stats: {
        totalMass: +s.wetMass.toFixed(2), totalThrust: s.thrust,
        twr: +s.twr.toFixed(3), deltaV: Math.round(s.deltaV), burnTime: +s.burnTime.toFixed(1)
      }
    });
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
        { textContent: "Liability Convention 1972 (Art. II) ให้รัฐผู้ปล่อยรับผิด “เต็มจำนวนโดยเด็ดขาด” (absolute liability) หากวัตถุอวกาศสร้างความเสียหายบนพื้นโลกหรือต่ออากาศยาน" }));
      opt("กันงบประกันความรับผิดต่อบุคคลที่สามวงเงินสูงก่อนปล่อย", true);
      opt("เอางบไปเพิ่มเชื้อเพลิงให้ขึ้นสูงกว่าเดิม", false);
      opt("ไม่ต้องทำ ประเทศเราไม่ได้เซ็นอนุสัญญา", false);
    } else if (req.minigame === "treaty") {
      title.textContent = "ขอการรับรองสถานะการยิงจากรัฐ";
      body.appendChild(Object.assign(document.createElement("p"),
        { textContent: "Outer Space Treaty 1967 Art. VI: รัฐภาคีต้อง “รับผิดชอบระหว่างประเทศ” ต่อกิจกรรมอวกาศของเอกชนในสังกัด และต้องกำกับดูแล/อนุญาตอย่างต่อเนื่อง" }));
      opt("ยื่นขอใบอนุญาตจากหน่วยงานกำกับอวกาศของรัฐ + รัฐรับเป็นผู้ค้ำประกันสถานะการยิง", true);
      opt("บริษัทเอกชนประกาศเป็น “รัฐอวกาศอิสระ” ของตัวเอง", false);
      opt("ไปจดทะเบียนบริษัทในประเทศที่ไม่มีกฎหมายอวกาศแล้วยิงจากตรงนั้น", false);
    } else { cb(true); return; }

    modal.hidden = false;
  }

  // ---------------- LAUNCH ----------------
  function doLaunch() {
    const r = G.run.rocket, s = G.run.stats, m = G.run.mission;
    G.run.legalResult = checkClearance(TIERS[r.tierKey].legalTier, G.run.legalChecks);
    closeLegal();

    G.run.weather = window.Physics.makeWeather({
      // จรวดเล็ก (tier ต่ำ) เจอพายุบ่อยกว่าเล็กน้อย เพื่อสอนเรื่องเขตปลอดภัย/หน้าต่างปล่อย
      stormChance: 0.12 + (4 - Math.min(4, tierN(r.tierKey))) * 0.02
    });
    // ลมกระโชกวันพายุแรงกว่า
    G.run.wind = +((Math.random() * 2 - 1) *
      (2 + Math.min(3, tierN(r.tierKey)) * 1.5) * (1 + G.run.weather.windGust * 0.8)).toFixed(1);
    const wxCommon = { windSpeed: G.run.wind, weather: G.run.weather };

    let cfg;
    if (s.staged) {
      cfg = Object.assign({
        stages: s.stages, payloadMass: s.payloadMass, dragCoef: s.dragCoef,
        orbital: s.orbital, targetAltitude: m.targetAltitude, tier: tierN(r.tierKey),
        targetOrbitVelocity: m.targetOrbit || 0, launchAngleDeg: s.launchAngleDeg || 0,
        windSensitivity: 0.35, spinStabilized: true,
        rocketMeta: { icon: r.icon, tier: tierN(r.tierKey), orbital: s.orbital, stageCount: s.stages.length }
      }, wxCommon);
    } else {
      cfg = Object.assign({
        thrust: s.thrust, burnTime: s.burnTime, wetMass: s.wetMass, dryMass: s.dryMass,
        dragCoef: s.dragCoef, windSensitivity: r.windSensitivity,
        spinStabilized: s.spin, thrustWobble: s.wobble, targetAltitude: m.targetAltitude,
        tier: tierN(r.tierKey), fuelMass: s.fuelMass, paperRisk: s.paperRisk,
        structure: r.lantern ? "paper" : (r.blackPowder ? "blackpowder" : null),
        rocketMeta: { icon: r.icon, tier: tierN(r.tierKey), spinStabilized: s.spin }
      }, wxCommon);
    }

    show("launch");
    const use3d = !!(window.Launch3D && window.THREE);
    const WX_TH = { clear: "ฟ้าใส ☀️", cloudy: "เมฆมาก ⛅", rain: "ฝนตก 🌧️", thunderstorm: "พายุฝนฟ้าคะนอง ⛈️" };
    $("#launch-caption").textContent =
      `${G.run.name} · ${use3d ? "3D cinematic" : "2D"} · ลม ${G.run.wind >= 0 ? "→" : "←"} ${Math.abs(G.run.wind)} m/s · ${WX_TH[G.run.weather.type] || ""}`;

    const hooks = { onComplete: summary => { G.run.flightSummary = summary; showReport(summary); } };
    try {
      G.launchInstance = (use3d ? window.Launch3D.run : window.Launch2D.run)(freshCanvas(), cfg, hooks);
    } catch (e) {
      console.warn("[RocketScience] 3D launch failed → fallback 2D", e);
      G.launchInstance = window.Launch2D.run(freshCanvas(), cfg, hooks);
    }
  }

  // canvas ใหม่ทุกครั้ง กัน context ค้าง (WebGL ↔ 2D)
  function freshCanvas() {
    const old = $("#launch-canvas");
    const fresh = old.cloneNode(false);
    old.replaceWith(fresh);
    return fresh;
  }

  // ---------------- REPORT + SCORING ----------------
  function showReport(sum) {
    const m = G.run.mission, r = G.run.rocket, s = G.run.stats, lr = G.run.legalResult;
    const rows = [];
    const bp = m.basePoints;
    const orbital = !!sum.orbital;
    const tier = tierN(r.tierKey);
    const expendable = tier >= 3;          // Tier 3–4 จรวดตกกลับเป็นเรื่องปกติ (เพย์โหลดทำงานที่จุดสูงสุดแล้ว)
    let missionGoalMet = false;

    if (orbital) {
      // ---- Tier 5: วงโคจร ----
      const velRatio = Math.max(0, Math.min(1, (sum.cutoffSpeed || 0) / (sum.orbitalVelocityTarget || 1)));
      const insPts = Math.round(bp * (sum.reachedOrbit ? 1 : velRatio * 0.5));
      rows.push([sum.reachedOrbit
        ? `เข้าวงโคจร ${fmt(sum.apoapsis / 1000)}×${fmt(sum.periapsis / 1000)} km`
        : `ดับเครื่องที่ ${fmt(sum.cutoffSpeed)} / ต้องการ ${fmt(sum.orbitalVelocityTarget)} m/s`, insPts, insPts >= 0]);
      if (sum.reachedOrbit) {
        missionGoalMet = true;
        const orbBonus = Math.round(bp * 0.6); rows.push(["เข้าวงโคจรสำเร็จ", orbBonus, true]);
        // ประสิทธิภาพ Δv: margin แคบ = ออกแบบเก่ง
        if (sum.deltaVMargin < 400) { const e = Math.round(bp * 0.25); rows.push(["ออกแบบ Δv คุ้มค่า (margin แคบ)", e, true]); }
        const pf = Math.round(bp * Math.min(0.4, (s.payloadFrac || 0) * 12));
        if (pf) rows.push([`payload fraction ${(s.payloadFrac * 100).toFixed(2)}%`, pf, true]);
      } else {
        const shortPen = Math.round(bp * 0.8);
        rows.push([`Δv ไม่พอ (ขาด ${fmt(Math.max(0, sum.deltaVRequired - sum.deltaVBudget))} m/s)`, -shortPen, false]);
      }
    } else {
      // ---- Tier 1–4: sub-orbital / altitude ----
      const ratio = Math.max(0, Math.min(1.5, sum.apogee / m.targetAltitude));
      const altPts = Math.round(bp * ratio);
      const altU = tier >= 3 ? fmt(sum.apogee / 1000) + " km" : fmt(sum.apogee) + " m";
      const tgtU = tier >= 3 ? fmt(m.targetAltitude / 1000) + " km" : fmt(m.targetAltitude) + " m";
      rows.push([`ความสูงที่ทำได้ ${altU} / เป้า ${tgtU}`, altPts, altPts >= 0]);

      const reachedTarget = sum.apogee >= m.targetAltitude * 0.95;
      if (reachedTarget) { missionGoalMet = true; const g = Math.round(bp * 0.5); rows.push(["โบนัสถึงเป้าหมาย", g, true]); }

      if (!expendable && Math.abs(sum.horizontalDrift) < m.targetAltitude * 0.15 && !sum.crashed) {
        const a = Math.round(bp * 0.2);
        rows.push([`วิถีตรง (ลอยเฉ ${fmt(Math.abs(sum.horizontalDrift))} m)`, a, true]);
      }
      if (tier === 4 && sum.reentry && !sum.burnedUp) {
        const rb = Math.round(bp * 0.15);
        rows.push(["ผ่านช่วง re-entry มาได้", rb, true]);
      }
    }

    // เพย์โหลด
    let payloadBonus = s.scoreBonusParts || 0;
    const payloadOK = orbital ? sum.reachedOrbit : (expendable ? !sum.burnedUp : !sum.crashed);
    if (payloadBonus && payloadOK) rows.push([orbital ? "เพย์โหลดเข้าประจำวงโคจร" : "เพย์โหลดทำงาน", payloadBonus, true]);
    else payloadBonus = 0;

    // ความเสียหายของยาน
    let damagePen = 0;
    if (sum.failReason === "LANTERN_BURNUP") { damagePen = Math.round(bp * 0.7); rows.push(["โคมไหม้กลางอากาศ (ความร้อนเกินพิกัดกระดาษสา)", -damagePen, false]); }
    else if (sum.failReason === "PAD_CATO") { damagePen = Math.round(bp * 0.8); rows.push(["ระเบิดคาแท่นปล่อย (CATO — อัดดินปืนเกิน)", -damagePen, false]); }
    else if (sum.burnedUp) { damagePen = Math.round(bp * 0.7); rows.push(["ยานไหม้จากความร้อน re-entry", -damagePen, false]); }
    else if (!expendable && !orbital && sum.crashed) { damagePen = Math.round(bp * 0.6); rows.push([sum.unstable ? "บั้งไฟส่ายตกเสียหาย (CG เพี้ยน)" : "จรวดตกกระแทกเสียหาย", -damagePen, false]); }

    // กฎหมาย
    const legalBonus = lr.bonusEarned || 0;
    if (legalBonus) rows.push(["ทำเอกสารเสริมครบ", legalBonus, true]);
    let legalPen = 0;
    if (lr.status === "VIOLATION") { legalPen = lr.penaltyPoints || 0; rows.push(["ละเมิดกฎหมาย (ลักลอบปล่อย)", -legalPen, false]); }

    let total = rows.reduce((a, [, v]) => a + v, 0);
    if (lr.gameOver && lr.status === "VIOLATION") total = -legalPen;

    const tbody = $("#report-rows");
    tbody.innerHTML = rows.map(([label, val]) =>
      `<tr><td>${label}</td><td class="${val >= 0 ? "pos" : "neg"}">${val >= 0 ? "+" : ""}${fmt(val)}</td></tr>`).join("");
    $("#report-total").textContent = fmt(total);

    const cleared = lr.status === "CLEARED";
    const success = cleared && missionGoalMet && !sum.burnedUp && (orbital ? sum.reachedOrbit : (expendable || !sum.crashed));
    const vEl = $("#report-verdict");
    vEl.className = "report-verdict " + (success ? "ok" : "bad");
    vEl.textContent = success ? "ภารกิจสำเร็จ 🎉"
      : lr.gameOver && !cleared ? "จบเกม — ผลจากการละเมิดกฎหมาย"
      : !cleared ? "ปล่อยได้ แต่ผิดกฎหมาย"
      : sum.failReason === "LANTERN_BURNUP" ? "โคมลอยไหม้กลางอากาศ 🔥"
      : sum.failReason === "PAD_CATO" ? "จรวดระเบิดคาแท่นปล่อย 💥"
      : sum.failReason === "UNSTABLE_COM" ? "บั้งไฟเสียการทรงตัว — ศูนย์ถ่วงเพี้ยน"
      : sum.burnedUp ? "ยานไหม้ตอนกลับเข้าชั้นบรรยากาศ"
      : orbital && !sum.reachedOrbit ? "ไม่ถึงความเร็ววงโคจร"
      : !expendable && sum.crashed ? "จรวดตก — ภารกิจไม่ผ่าน"
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

    if (window.Narrative) Narrative.debrief(sum, G.run);
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
