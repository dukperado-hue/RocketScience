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
  const defaultProgress = () => ({ unlockedTiers: ["tier1"], totalScore: 0, missionsPassed: [], achievements: [] });

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
  function awardAchievement(id, name) {
    if (!G.progress.achievements) G.progress.achievements = [];
    if (G.progress.achievements.includes(id)) return false;
    G.progress.achievements.push(id);
    toast("🏅 " + name);
    return true;
  }

  const G = {
    progress: loadProgress(),
    run: null,
    launchInstance: null,
    wanHu: { unlocked: false }   // ปลดล็อกเก้าอี้หวันหู่ด้วยการพิมพ์ "wanhu"
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
      windDirDeg: 0,
      weather: null,         // ประจำวันภารกิจ — สุ่มตอนเลือกภารกิจ, ใช้ในบรีฟ + ตอนปล่อย
      flightSummary: null,
      wanHu: false
    };
  }

  // สุ่ม "สภาพอากาศประจำวัน" ของภารกิจ (ใช้ทั้งบรีฟก่อนภารกิจ และตอนปล่อยจริง)
  function rollMissionWeather() {
    const tn = tierN(G.run.mission.tierKey);
    G.run.weather = window.Physics.makeWeather({ stormChance: 0.12 + (4 - Math.min(4, tn)) * 0.02 });
    G.run.wind = +((Math.random() * 2 - 1) *
      (2 + Math.min(3, tn) * 1.5) * (1 + G.run.weather.windGust * 0.8)).toFixed(1);
    G.run.windDirDeg = Math.floor(Math.random() * 360);
  }

  // ---------------- screen routing ----------------
  function show(name) {
    if (name !== "vab" && window.VAB3D) window.VAB3D.unmount();   // คืน GL context ก่อนออกจากโรงประกอบ
    closeCodex();                                                 // ปิดหอจดหมายเหตุ + คืน GL context
    if (window.VN && window.VN.skip) window.VN.skip();            // ปิดบทสนทนาค้างจากหน้าก่อน (ไม่ให้ลอยทับปุ่ม)
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
    // สลับทั้งหน้าจอ — เด้งขึ้นบนสุดทันที (smooth ทำให้หน้าใหม่ค้างอยู่กลาง/ล่างชั่วขณะ)
    window.scrollTo(0, 0);
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 2600);
  }
  window.__toast = toast;   // codex.js ใช้แจ้งเตือนตอนปลดล็อก

  // ---------------- Aerospace Codex (Phase 9) ----------------
  function updateCodexButton() {
    const b = $("#btn-codex");
    if (!b || !window.Codex) return;
    const c = window.Codex.counts();
    b.textContent = `🏛️ หอจดหมายเหตุ ${c.got}/${c.total}`;
  }

  function renderCodexGrid() {
    if (!window.Codex) return;
    const grid = $("#codex-grid");
    const c = window.Codex.counts();
    $("#codex-count").textContent = `${c.got} / ${c.total}`;
    $("#codex-detail").hidden = true;
    grid.hidden = false;
    grid.innerHTML = "";
    window.Codex.all().forEach(e => {
      const card = document.createElement(e.unlocked ? "button" : "div");
      card.className = "codex-card" + (e.unlocked ? "" : " codex-card--locked");
      if (e.unlocked) card.type = "button";
      card.innerHTML = `
        ${e.unlocked ? "" : `<span class="codex-card-lock">🔒</span>`}
        <div class="codex-card-cat">${(window.Codex.CATS[e.cat] || e.cat)}</div>
        <div class="codex-card-icon">${e.unlocked ? e.icon : "❔"}</div>
        <div class="codex-card-title">${e.unlocked ? e.title : "ยังไม่ปลดล็อก"}</div>
        <div class="codex-card-era">${e.unlocked ? e.era : "เล่นภารกิจต่อเพื่อค้นพบ"}</div>`;
      if (e.unlocked) card.addEventListener("click", () => openCodexDetail(e.id));
      grid.appendChild(card);
    });
  }

  function openCodexDetail(id) {
    const e = window.Codex && window.Codex.get(id);
    if (!e || !e.unlocked) return;
    $("#codex-grid").hidden = true;
    $("#codex-detail").hidden = false;
    $("#codex-info-era").textContent = e.era;
    $("#codex-info-title").textContent = e.title;
    $("#codex-info-sub").textContent = e.sub || "";
    $("#codex-info-desc").textContent = e.desc;
    const wrap = $("#codex-detail .codex-viewer");
    // เมานต์เพียงครั้งเดียวต่อการเปิดโมดัล — สลับรายการใช้ show() ซ้ำ (ไม่สร้าง GL context ใหม่)
    const ok = window.CodexViewer && window.CodexViewer.mount(wrap);
    wrap.classList.toggle("codex-viewer--nogl", !ok);
    if (ok) window.CodexViewer.show(e);
  }

  function openCodex() {
    if (!window.Codex) return;
    renderCodexGrid();
    $("#codex-modal").hidden = false;
  }
  function closeCodex() {
    if (window.CodexViewer) window.CodexViewer.unmount();
    const m = $("#codex-modal");
    if (m) m.hidden = true;
  }
  function codexBackToGrid() {
    // เก็บ GL context ไว้ (viewer พักเรนเดอร์เองเมื่อแผงถูกซ่อน) — คืน context ตอนปิดโมดัลเท่านั้น
    renderCodexGrid();
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

  // Phase 8: หัวพลุเฉลิมฉลอง (Tier 1–3) — โบนัสแต้มเมื่อจุดพลุกลางอากาศ
  function fwActive() {
    return !!(window.Fireworks && window.Fireworks.state.enabled
      && G.run && G.run.rocket && tierN(G.run.rocket.tierKey) <= 3);
  }
  function fwBonus() {
    try { return fwActive() ? (window.Fireworks.derived().scoreBonus || 0) : 0; }
    catch (e) { return 0; }
  }
  function fireworkMeta() {
    if (!fwActive()) return null;
    const d = window.Fireworks.derived();
    return { color: d.color, spark: d.spark, flame: d.flame, colorant: d.colorant };
  }

  function tierUnlocked(k) { return G.progress.unlockedTiers.includes(k); }

  // ---------------- HOME ----------------
  function renderScoreBadge() { $("#score-badge b").textContent = fmt(G.progress.totalScore); }

  function renderHome() {
    renderScoreBadge();
    updateCodexButton();
    const hasProgress = G.progress.totalScore > 0 || G.progress.unlockedTiers.length > 1;
    $("#btn-reset-progress").hidden = !hasProgress;

    const ladder = $("#tier-ladder");
    ladder.innerHTML = "";
    Object.values(TIERS).forEach(t => {
      const unlocked = tierUnlocked(t.key);
      const canPlay = unlocked && t.playable;
      const missionCount = MISSIONS.filter(m => m.tierKey === t.key && !m.locked).length;
      const row = document.createElement(canPlay ? "button" : "div");
      row.className = "tier-row" + (canPlay ? " tier-row--go" : " locked");
      if (canPlay) row.type = "button";
      row.innerHTML = `
        <span class="tn">TIER ${t.n}</span>
        <span class="tier-row-mid">
          <span class="tt">${t.nameTh}</span>
          <span class="ts">${t.sub}</span>
        </span>
        <span class="tlock">${canPlay
          ? `<span class="tier-cta">▶ เล่น (${missionCount} ภารกิจ)</span>`
          : unlocked
            ? "Phase 2 · เร็ว ๆ นี้"
            : `<span class="tier-locked-badge">🔒</span> ต้องมี ${fmt(t.unlockScore)} แต้ม`}</span>`;
      if (canPlay) row.addEventListener("click", () => {
        renderMissions();
        show("mission");
        const first = $$("#mission-grid .pick-card").find(c => c.dataset.tier === String(t.n));
        if (first) { first.scrollIntoView({ block: "center", behavior: "smooth" }); first.classList.add("pick-card--flash"); setTimeout(() => first.classList.remove("pick-card--flash"), 1200); }
      });
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
      card.className = "pick-card" + (locked ? " pick-card--locked" : "");
      card.disabled = locked;
      card.dataset.tier = String(t.n);
      const lockReason = m.locked ? "Phase 2 · เร็ว ๆ นี้"
        : !t.playable ? "Phase 2 · เร็ว ๆ นี้"
          : `ปลดล็อกที่ ${fmt(TIERS[m.tierKey].unlockScore)} แต้ม`;
      card.innerHTML = `
        ${locked ? `<span class="pc-lock">🔒</span>` : ""}
        <div class="pc-sub">TIER ${t.n} · ${t.nameTh}</div>
        <div class="pc-title">${m.titleTh}</div>
        <div class="pc-desc">${m.briefTh}</div>
        <div class="pc-meta">
          <span class="pc-tag">เป้าหมาย ${fmt(m.targetAltitude)} m</span>
          ${m.timeAloftTarget ? `<span class="pc-tag">จับเวลา ${m.timeAloftTarget} วิ</span>` : ""}
          <span class="pc-tag">งบ ${fmt(m.budget)} ฿</span>
          <span class="pc-tag">ฐาน ${fmt(m.basePoints)} แต้ม</span>
          ${(m.hazards || []).map(h => `<span class="pc-hazard">${h}</span>`).join("")}
        </div>
        ${locked
          ? `<div class="pc-cta pc-cta--locked">🔒 ${lockReason}</div>`
          : `<div class="pc-cta">▶ เลือกภารกิจนี้</div>`}`;
      if (!locked) card.addEventListener("click", () => {
        newRun(m);
        rollMissionWeather();
        goRocket();
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
      card.className = "pick-card" + (usable ? "" : " pick-card--locked");
      card.disabled = !usable;
      card.innerHTML = `
        ${usable ? "" : `<span class="pc-lock">🔒</span>`}
        <div class="pc-icon">${r.icon}</div>
        <div class="pc-sub">TIER ${rt.n}</div>
        <div class="pc-title">${r.nameTh} <span style="font-weight:400;color:var(--ink-faint);font-size:12px">${r.nameEn}</span></div>
        <div class="pc-desc">${r.blurb}</div>
        <div class="pc-meta">
          ${rocketMetaTags(r)}
        </div>
        ${usable
          ? `<div class="pc-cta">▶ ประกอบจรวดนี้</div>`
          : `<div class="pc-cta pc-cta--locked">🔒 ปลดล็อก Tier ${rt.n} ก่อน</div>`}`;
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
      const talai = r.id === "talai";
      const bangfai = r.id === "bangfai";
      PARTS.filter(p => p.tierMin <= tierN(r.tierKey) && ["engine", "propellant", "fin", "nosecone", "payload"].includes(p.type) && p.tierMin <= 2
        && (!p.secret || (p.wanhu && G.wanHu.unlocked))
        && (bangfai ? (p.type === "payload" && !p.talaiOnly)
          : talai ? (p.talaiOnly || p.type === "propellant") : !p.talaiOnly)).forEach(p => {
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
      VAB.renderExtras();
      VAB.renderRecovery();
      VAB.renderGridClassic();
    },

    // Phase 5: แผงโครงสร้าง (PVC/ไม้ไผ่) + พันลวด + ผสมเคมีดินขับ · ตะไล = แผงเฉพาะ
    renderExtras() {
      const r = G.run.rocket;
      if (isStaged(r)) return;
      let host = $("#vab-extras");
      if (!host) {
        host = document.createElement("div");
        host.id = "vab-extras";
        host.className = "vab-extras";
        const anchor = $("#vab-parts");
        anchor.parentElement.insertBefore(host, anchor.nextSibling);
      }
      if (r.id === "talai" && window.Talai) {
        window.Talai.render(host, null, () => VAB.computeStats());
        return;
      }
      if (r.id === "bangfai" && window.Bangfai) {
        window.Bangfai.render(host, null, () => VAB.computeStats());
        return;
      }
      if (!window.VabExtras) return;
      const t = tierN(r.tierKey);
      const showBody = t === 2;
      const showChem = !!r.blackPowder || t === 2 || VAB.slots.some(id => /^charge/.test(id));
      window.VabExtras.render(host, { showBody, showChem, rocket: r }, () => VAB.computeStats());
    },

    // Phase 5: แผงระบบกู้คืน / ลงจอด (ทุก tier ยกเว้น orbital-only ใช้เป็นการกู้บูสเตอร์)
    renderRecovery() {
      const r = G.run.rocket;
      if (!window.Recovery || r.id === "talai" || r.id === "bangfai" || r.lantern) { const h = $("#vab-recovery"); if (h) { h.hidden = true; h.innerHTML = ""; } return; }
      let host = $("#vab-recovery");
      if (!host) {
        host = document.createElement("div");
        host.id = "vab-recovery";
        host.className = "vab-extras";
        const anchor = $("#vab-extras") || $("#vab-parts");
        anchor.parentElement.insertBefore(host, anchor.nextSibling);
      }
      window.Recovery.render(host, { rocket: r, tier: tierN(r.tierKey), ascent: recoveryAscent(r) },
        () => VAB.computeStats());
    },

    // Phase 8: แผงหัวพลุ (Tier 1–3) — เลือกสารให้สี flame test
    renderFirework() {
      const r = G.run.rocket;
      let host = $("#vab-firework");
      if (!window.Fireworks || !r || tierN(r.tierKey) > 3) {
        if (host) { host.hidden = true; host.innerHTML = ""; }
        return;
      }
      if (!host) {
        host = document.createElement("div");
        host.id = "vab-firework";
        host.className = "vab-extras";
        const anchor = $("#vab-recovery") || $("#vab-extras") || $("#vab-parts");
        anchor.parentElement.insertBefore(host, anchor.nextSibling);
      }
      window.Fireworks.render(host, () => VAB.computeStats());
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
      VAB.renderExtras();
      VAB.renderRecovery();
      VAB.renderFirework();
      VAB.computeStats();
      VAB.sync3d();
    },

    // Phase 7: ซิงก์โมเดล 3 มิติ + สลับการแสดง grid ↔ 3D
    sync3d() {
      const r = G.run.rocket;
      if (!window.VAB3D || !r) return;
      window.__vabSlots = VAB.slots.slice();
      window.__vabPayloadId = VAB.payloadId || null;
      if (isStaged(r)) {
        window.__vabStages = effectiveStages(r);
        window.__vabPayloadMass = VAB.payloadId ? (partById(VAB.payloadId).mass || 0) : (r.defaultPayload || 0);
      }
      const wrap = $("#vab3d-wrap"), grid = $("#vab-grid");
      const ok = window.VAB3D.mount(wrap);
      // WebGL ใช้ไม่ได้ → ถอยไปมุมมองกริดเดิม
      const keepGrid = !ok || r.tierKey === "tier1";
      if (wrap) wrap.hidden = !ok;
      if (grid) grid.hidden = !keepGrid;
      const eh = $("#vab-grid-empty"); if (eh && !keepGrid) eh.hidden = true;
      if (ok) window.VAB3D.show(r);
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
      VAB.renderRecovery();
      VAB.renderFirework();
      VAB.computeStats();
      VAB.sync3d();
    },

    computeStats() {
      const r = G.run.rocket;
      isStaged(r) ? VAB.computeStaged() : VAB.computeClassic();
      if (window.VAB3D && !$("#screen-vab").hidden) window.VAB3D.refresh(r);   // โมเดล 3 มิติตามสไลเดอร์
      return G.run.stats;
    },

    computeClassic() {
      const r = G.run.rocket;
      if (r.id === "talai" && window.Talai) return VAB.computeTalai();
      if (r.id === "bangfai" && window.Bangfai) return VAB.computeBangfai();
      const parts = VAB.slots.map(partById);
      const engineThrust = parts.filter(p => p.type === "engine").reduce((s, p) => s + p.thrust, 0);
      let fuelMass = parts.filter(p => p.type === "propellant").reduce((s, p) => s + p.fuel, 0);
      const nonFuelMass = parts.filter(p => p.type !== "propellant").reduce((s, p) => s + p.mass, 0);
      const spin = r.spinStabilized || parts.some(p => p.addsSpin);
      let dragCoef = Math.max(0.02, r.dragCoef + parts.reduce((s, p) => s + (p.dragMod || 0), 0));
      let baseBurn = Math.max(0.8, Math.min(20, parts.filter(p => p.type === "propellant").reduce((s, p) => s + p.burn, 0) || 1.2));
      let scoreBonusParts = parts.reduce((s, p) => s + (p.scoreBonus || 0), 0) + fwBonus();
      let wobble = r.thrustWobble || 0;
      if (spin && !r.spinStabilized) wobble *= 0.5;

      // ---- Phase 5: โครงสร้าง (PVC/ไม้ไผ่) + พันลวด + เคมีดินขับ ----
      const ex = window.VabExtras ? window.VabExtras.derived(r) : null;
      let baseThrust = engineThrust;
      let extraDryMass = 0, casingCapMul = 1, catoRisk = 0, chemIgnitionRisk = 0, chemInfo = null;
      if (ex) {
        if (ex.showBody) { extraDryMass = ex.wireMass; casingCapMul = ex.casingCapMul; }
        if (ex.showChem) {
          const ch = ex.chem; chemInfo = ch;
          baseThrust *= ch.thrustMul;
          // total impulse ∝ ispMul·altitudeMul ; แรงขับ ∝ thrustMul  ⇒  ปรับเวลาเผาไหม้ให้สอดคล้อง
          baseBurn = Math.max(0.5, baseBurn * (ch.ispMul * ch.altitudeMul) / Math.max(0.3, ch.thrustMul));
          catoRisk = ch.catoRisk;
          chemIgnitionRisk = ch.ignitionRisk;
        }
      }

      // ---- Phase 5: ระบบกู้คืน ----
      const rec = window.Recovery ? window.Recovery.derived(r, recoveryAscent(r)) : null;
      const recMass = rec ? rec.massAdd : 0;
      const recFuel = rec ? Math.min(fuelMass * 0.6, rec.recFuel || 0) : 0;   // กันเชื้อเพลิงขาขึ้น
      fuelMass = Math.max(0.05, fuelMass - recFuel);

      const dryMass = (r.dryMass + nonFuelMass) * (ex && ex.showBody ? ex.dryMassMul : 1) + extraDryMass + recMass;
      const wetMass = dryMass + fuelMass;
      const thrust = baseThrust;
      const burnTime = baseBurn;
      const twr = wetMass > 0 && thrust > 0 ? thrust / (wetMass * 9.81) : 0;
      const ispEff = r.isp * (chemInfo ? chemInfo.ispMul : 1);
      const deltaV = fuelMass > 0 ? ispEff * 9.81 * Math.log(wetMass / dryMass) : 0;

      // Phase 3: ความเสี่ยงความร้อนของโคมกระดาษ (ดินขับพลุ + ดินหนัก) — >1 = ไหม้กลางอากาศ
      const chargeThrust = parts.filter(p => p.type === "engine" && /^charge/.test(p.id))
        .reduce((s, p) => s + p.thrust, 0) * (chemInfo ? chemInfo.thrustMul : 1);
      const paperRisk = r.lantern ? (chargeThrust * 1.4 + fuelMass * 8) / (dryMass * 130) : 0;

      G.run.stats = {
        staged: false, thrust, fuelMass, dryMass, wetMass, dragCoef, spin, burnTime, twr, deltaV,
        scoreBonusParts, wobble, paperRisk, partCount: parts.length, hasEngine: engineThrust > 0,
        hasFuel: (fuelMass + recFuel) > 0.06,
        casingCapMul, catoRisk, chemIgnitionRisk, chem: chemInfo, body: ex ? ex.body : null,
        recovery: rec ? { kind: rec.kind, massAdd: recMass, dragAdd: rec.dragAdd, dvReserve: rec.dvReserve, recFuel, deployAlt: rec.deployAlt, aMax: rec.aMax } : null
      };

      const telem = [
        ["มวลรวม", fmt(wetMass, 2) + " kg"],
        ["แรงขับรวม", fmt(thrust) + " N"],
        ["อัตราส่วนแรงขับ/น้ำหนัก (TWR)", fmt(twr, 2), twr >= 1.2 ? "ok" : twr >= 1 ? "warn" : "bad"],
        ["Δv โดยประมาณ", fmt(deltaV) + " m/s"],
        ["เวลาเผาไหม้", fmt(burnTime, 1) + " s"]
      ];
      if (chemInfo) telem.push(["ดินขับ", chemInfo.quality, catoRisk >= 1 ? "bad" : chemInfo.altitudeMul < 0.6 || chemIgnitionRisk > 0.5 ? "warn" : "ok"]);
      if (ex && ex.showBody) telem.push(["พิกัดความดันปลอก", "×" + (casingCapMul).toFixed(2), casingCapMul < 0.85 ? "warn" : "ok"]);
      if (rec && rec.kind !== "freefall") {
        const rn = ((window.Recovery.SYSTEMS[rec.kind] || {}).th || rec.kind) +
          (recFuel > 0.05 ? " · −" + fmt(recFuel, 1) + " kg" : "");
        telem.push(["ระบบกู้คืน", rn, "ok"]);
      }
      renderTelem(telem);

      const s = G.run.stats;
      const ok = s.hasEngine && s.hasFuel && twr > 1 && s.partCount <= r.maxParts;

      // ลางบอกเหตุฟิสิกส์เฉพาะถิ่น (Phase 3/5) — เตือน ไม่บล็อก ให้ผู้เล่นได้เรียนรู้จากผล
      let riskHint = null;
      if (r.lantern && paperRisk > 1)
        riskHint = "⚠️ ความร้อนเกินพิกัดกระดาษสา — โคมจะติดไฟกลางอากาศ (ใช้หัวเผา ไม่ใช่ดินขับพลุ)";
      else if (r.lantern && paperRisk > 0.7)
        riskHint = "⚠️ ความร้อนใกล้พิกัดกระดาษสา — เสี่ยงไหม้";
      else if (catoRisk >= 1)
        riskHint = "⚠️ ดินประสิวเยอะไป — เสี่ยงระเบิดคาแท่น (CATO) ลดดินประสิว เปลี่ยนเป็นไม้ไผ่ หรือพันลวดเพิ่ม";
      else if (chemInfo && chemInfo.altitudeMul < 0.6)
        riskHint = "⚠️ ถ่านเยอะไป — ดินขับเผาช้า แรงขับตก จะขึ้นไม่ถึงเป้า";
      else if (chemIgnitionRisk > 0.5)
        riskHint = "⚠️ กำมะถัน/ดินประสิวน้อยไป — ดินขับอาจจุดไม่ติด";
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

    // ===== ตะไล (Talai) — ภูมิปัญญาบ้านตาลิน =====
    computeTalai() {
      const r = G.run.rocket;
      const parts = VAB.slots.map(partById);
      const fuelMass = parts.filter(p => p.type === "propellant").reduce((s, p) => s + p.fuel, 0) || 5;
      const nonFuel = parts.filter(p => p.type !== "propellant").reduce((s, p) => s + p.mass, 0);
      const d = window.Talai.derived(r);
      const g = d.geometry, ch = d.chem;

      const dryMass = (r.dryMass || 3) + nonFuel;         // แกนไม้รวกสด + ปีกไผ่ตง
      const wetMass = dryMass + fuelMass;
      const baseThrust = 620 * d.thrustMul;               // มอเตอร์วงตะไล × แรงจากเคมี
      const burnTime = Math.max(0.9, 5 / Math.max(0.3, d.burnRate));
      const twr = baseThrust / (wetMass * 9.81);
      const cato = d.catoRisk;
      const catoNote = g.catoRisk >= ch.catoRisk ? g.note : ch.note;

      G.run.stats = {
        staged: false, talai: d, thrust: baseThrust, fuelMass, dryMass, wetMass,
        dragCoef: r.dragCoef, spin: true, burnTime, twr,
        deltaV: r.isp * 9.81 * Math.log(wetMass / dryMass),
        scoreBonusParts: parts.reduce((s, p) => s + (p.scoreBonus || 0), 0) + fwBonus(),
        wobble: 0, paperRisk: 0, partCount: parts.length,
        hasEngine: true, hasFuel: fuelMass > 0,
        casingCapMul: 1, catoRisk: cato, chemIgnitionRisk: 0, chem: null, body: null, recovery: null
      };

      renderTelem([
        ["มวลรวม (แกนไม้รวก + ปีก + ดิน)", fmt(wetMass, 2) + " kg"],
        ["เชือกวัดรอบวง ×2 รอบ", g.twoCirc + " ซม."],
        ["Ø ปีกวงกลม / เป้า", fmt(g.wingDia) + " / " + fmt(g.twoCirc) + " ซม.",
          (g.wingRatio > 0.88 && g.wingRatio < 1.12) ? "ok" : "warn"],
        ["มุมรูประทุเฉียง", g.holeAngleDeg + "°", Math.abs(g.holeAngleDeg - 15) <= 5 ? "ok" : "warn"],
        ["เสถียรภาพไจโรสโคปิก", (g.stabilityRatio * 100).toFixed(0) + "%",
          g.stabilityRatio < 0.55 ? "bad" : g.stabilityRatio < 0.75 ? "warn" : "ok"],
        ["ทดสอบจุดดินตะไล", ch.quality, cato >= 1 ? "bad" : ch.burnTest === "flash" ? "ok" : "warn"],
        ["เสี่ยง CATO (บ้องปริ/คามือ)", cato >= 1 ? "สูงมาก" : cato > 0.4 ? "ปานกลาง" : "ต่ำ",
          cato >= 1 ? "bad" : cato > 0.4 ? "warn" : "ok"]
      ]);

      const ok = g.casingOK && cato < 1;
      setVerdict(!g.casingOK ? [g.note, "bad"]
        : cato >= 1 ? ["⚠️ " + catoNote, "bad"]
        : g.stabilityRatio < 0.5 ? ["⚠️ ปีก/แกนไม่ได้สัดส่วน 2×รอบวง — ตะไลจะส่ายแล้วร่วงแนวราบ (โดนค่าเสียหาย)", ""]
        : ch.burnTest !== "flash" ? ["⚠️ " + ch.note, ""]
        : ["พร้อมจุด — คว่ำมือขวาจับปีก สะบัดขว้างแบบจานบิน ✓", "ok"]);
      $("#vab-proceed").disabled = !ok;
      return G.run.stats;
    },

    // ===== บั้งไฟ (Master Craftsman) — ดินขับ 3 ชั้น + แรงอัด + รูแกน + หาง =====
    computeBangfai() {
      const r = G.run.rocket;
      const parts = VAB.slots.map(partById);
      const payloadMass = parts.reduce((s, p) => s + (p.mass || 0), 0);
      const scoreBonusParts = parts.reduce((s, p) => s + (p.scoreBonus || 0), 0) + fwBonus();
      const d = window.Bangfai.derived(r);
      const a = d.analysis;

      const fuelMass = d.fuelMass;
      const dryMass = d.structKg + payloadMass;
      const wetMass = dryMass + fuelMass;
      const thrust = d.thrust;
      const burnTime = d.burnTime;
      const twr = thrust / (wetMass * 9.81);
      const deltaV = d.isp * 9.81 * Math.log(wetMass / dryMass);
      const cato = d.catoRisk;

      G.run.stats = {
        staged: false, bangfai: d, thrust, fuelMass, dryMass, wetMass,
        dragCoef: r.dragCoef, spin: false, burnTime, twr, deltaV,
        scoreBonusParts, wobble: 0.12, paperRisk: 0, partCount: parts.length,
        hasEngine: true, hasFuel: fuelMass > 0.5,
        casingCapMul: d.casingCapMul, catoRisk: cato, chemIgnitionRisk: d.ignitionRisk,
        chem: null, body: d.body, recovery: null,
        isp: d.isp
      };

      renderTelem([
        ["มวลรวมตอนปล่อย", fmt(wetMass, 2) + " kg"],
        ["ดินขับ 3 ชั้น (หัว/คอ/ลำตัว)", fmt(fuelMass, 2) + " kg"],
        ["แรงขับพีค / TWR", fmt(thrust) + " N · " + fmt(twr, 2), twr >= 1.4 ? "ok" : twr >= 1.05 ? "warn" : "bad"],
        ["เวลาเผาไหม้ (ลำตัว + ดินหัวเลี้ยง)", fmt(a.mainBurn, 1) + " + " + fmt(a.sustainSec, 1) + " s"],
        ["แรงอัด", a.psiOK ? window.Bangfai.state.pressPSI + " PSI ✓" : window.Bangfai.state.pressPSI + " PSI ⚠",
          a.psiOK ? "ok" : "warn"],
        ["ดัชนีความดันห้องเผาไหม้", fmt(a.pressureIndex, 2) + " / พิกัด " + fmt(a.bodyCapThresh, 2),
          a.pressureIndex > a.bodyCapThresh ? "bad" : a.pressureIndex < 0.52 ? "warn" : "ok"],
        ["หางสมดุล", Math.round(a.tailBalance * 100) + "%",
          a.tailBalance < 0.6 ? "bad" : a.tailBalance < 0.8 ? "warn" : "ok"],
        ["เสี่ยง CATO (ลำระเบิด)", cato >= 1 ? "สูงมาก" : cato > 0.4 ? "ปานกลาง" : "ต่ำ",
          cato >= 1 ? "bad" : cato > 0.4 ? "warn" : "ok"]
      ]);

      const ok = twr > 1.05 && cato < 1;
      setVerdict(cato >= 1 ? ["⚠️ " + a.pchang, "bad"]
        : twr <= 1.05 ? ["TWR " + fmt(twr, 2) + " ต่ำไป — ดินขับ/เพย์โหลดหนักเกินแรงขับพีค", "bad"]
        : a.tailBalance < 0.6 ? ["⚠️ " + a.pchang, ""]
        : !a.psiOK || a.quality !== "ได้ตำราช่างบั้งไฟ" ? ["⚠️ " + a.pchang, ""]
        : ["พร้อมจุด — " + a.pchang, "ok"]);
      $("#vab-proceed").disabled = !ok;
      return G.run.stats;
    },

    computeStaged() {
      const r = G.run.rocket, m = G.run.mission;
      const eff = effectiveStages(r);
      const pl = VAB.payloadId ? partById(VAB.payloadId) : null;
      let payloadMass = pl ? pl.mass : (r.defaultPayload || 0);

      // ---- Phase 5: ระบบกู้คืน (บวกมวล; propulsive กัน Δv จาก margin) ----
      const rec = window.Recovery ? window.Recovery.derived(r, recoveryAscent(r)) : null;
      if (rec) payloadMass += rec.massAdd;

      const cfg0 = {
        stages: eff, payloadMass, dragCoef: r.dragCoef,
        orbital: !!r.orbital, targetAltitude: m.targetAltitude,
        targetOrbitVelocity: m.targetOrbit || 0, launchAngleDeg: r.launchAngleDeg || 0
      };
      const f = window.Physics.createFlight(cfg0);
      const glow = f.glow, dvB = f.deltaVBudget, dvR = f.deltaVRequired;
      const twr1 = eff[0].thrust / (glow * 9.80665);
      const payloadFrac = glow > 0 ? payloadMass / glow : 0;
      const orbitOK = !r.orbital || dvB >= dvR;
      const recOK = !rec || rec.kind !== "propulsive" || dvB - dvR >= rec.dvReserve;

      G.run.stats = {
        staged: true, stages: eff, payloadMass, dragCoef: r.dragCoef,
        orbital: !!r.orbital, launchAngleDeg: r.launchAngleDeg || 0,
        deltaVBudget: dvB, deltaVRequired: dvR, deltaVMargin: dvB - dvR,
        glow, twr1, payloadFrac,
        scoreBonusParts: (pl ? pl.scoreBonus : 0) + fwBonus(),
        stageDeltaV: f.stageDeltaV, orbitOK,
        payloadName: pl ? pl.nameTh : "—",
        recovery: rec ? { kind: rec.kind, massAdd: rec.massAdd, dragAdd: rec.dragAdd, dvReserve: rec.dvReserve, recFuel: rec.recFuel, deployAlt: rec.deployAlt, aMax: rec.aMax } : null,
        recOK
      };

      const rows = [
        ["มวลรวมตอนปล่อย (GLOW)", fmt(glow) + " kg"],
        ["เพย์โหลด / payload fraction", (pl ? fmt(payloadMass) + " kg" : "—") + " (" + (payloadFrac * 100).toFixed(2) + "%)"],
        ["แรงขับท่อน 1 / TWR", fmt(eff[0].thrust) + " N · " + fmt(twr1, 2), twr1 >= 1.15 ? "ok" : twr1 >= 1.02 ? "warn" : "bad"],
        ["Δv รวม (Tsiolkovsky)", fmt(dvB) + " m/s"],
        [r.orbital ? "Δv ที่ต้องใช้ (วงโคจร + loss)" : "Δv ที่ต้องใช้ (โดยประมาณ)", fmt(dvR) + " m/s",
          dvB >= dvR ? "ok" : "bad"]
      ];
      if (rec && rec.kind !== "freefall") {
        rows.push(["ระบบกู้คืน", (window.Recovery.SYSTEMS[rec.kind] || {}).th || rec.kind, "ok"]);
        if (rec.kind === "propulsive")
          rows.push(["Δv สำรองลงจอด", fmt(rec.dvReserve) + " m/s · เหลือ " + fmt(dvB - dvR - rec.dvReserve) + " m/s", recOK ? "ok" : "bad"]);
      }
      renderTelem(rows);

      const recWarn = rec && rec.kind === "propulsive" && !recOK
        ? (r.orbital ? "Δv สำรองไม่พอ — บูสเตอร์จะตก (ภารกิจหลักยังไปได้)"
                     : "Δv สำรองไม่พอ — ยานจะตกกระแทกตอนลงจอด (กะปิซวย)")
        : null;

      if (!pl) setVerdict(["เลือกเพย์โหลดก่อน", "bad"]);
      else if (twr1 < 1.02) setVerdict(["TWR ท่อน 1 ต่ำเกินไป — ยกตัวไม่ขึ้น", "bad"]);
      else if (r.orbital && !orbitOK) setVerdict([`Δv ขาดอีก ${fmt(dvR - dvB)} m/s — จะขึ้นได้แต่ไม่ถึงวงโคจร`, "bad"]);
      else if (recWarn && !r.orbital) setVerdict(["⚠️ " + recWarn, ""]);
      else if (r.orbital) setVerdict([`Δv พอถึงวงโคจร เหลือ margin ${fmt(dvB - dvR)} m/s ✓` + (recWarn ? " · " + recWarn : ""), recWarn ? "warn" : "ok"]);
      else setVerdict(["พร้อมปล่อย ✓", "ok"]);

      $("#vab-proceed").disabled = !pl || twr1 < 1.02;
    }
  };

  // Easter egg: ตรวจว่านี่คือจรวด "หวันหู่" ไหม
  function isWanHu(r, s) {
    if (!r || isStaged(r) || !s) return false;
    if (VAB.slots.includes("payload_chair")) return true;
    const hasFin = VAB.slots.some(id => { const p = partById(id); return p && p.type === "fin"; });
    const powder = !!r.blackPowder || VAB.slots.some(id => /^charge/.test(id));
    return (s.twr || 0) > 15 && !hasFin && powder;
  }

  // ประมาณมวล/Isp ตอนลงจอด สำหรับ Recovery.derived (คำนวณเชื้อเพลิงสำรอง propulsive)
  function recoveryAscent(r) {
    if (!isStaged(r)) {
      const parts = VAB.slots.map(partById);
      const nonFuel = parts.filter(p => p.type !== "propellant").reduce((s, p) => s + p.mass, 0);
      return { landMass: (r.dryMass || 0.6) + nonFuel, isp: r.isp || 110 };
    }
    const eff = effectiveStages(r);
    const pl = VAB.payloadId ? partById(VAB.payloadId) : null;
    const plMass = pl ? pl.mass : (r.defaultPayload || 0);
    if (r.orbital) return { landMass: eff[0].dryMass, isp: eff[0].isp };   // กู้บูสเตอร์ท่อน 1
    const last = eff[eff.length - 1];
    return { landMass: last.dryMass + plMass, isp: last.isp };
  }

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
    } else if (r.id === "talai") {
      VAB.slots = ["motor_ring", "prop_l"];   // แกน + ดินตะไล (รายละเอียดในแผงตะไล)
    } else if (r.id === "bangfai") {
      VAB.slots = [];                          // ดิน/ลำ/หาง อยู่ในแผงช่างบั้งไฟ · เพย์โหลดเลือกเพิ่มได้
    } else {
      VAB.slots = ["motor_pvc", "prop_l", "fin_light"];
    }
    $("#vab-mode-tag").textContent = isStaged(r) ? "STAGED VEHICLE"
      : r.id === "talai" ? "TALAI · จานหมุน"
      : r.id === "bangfai" ? "บั้งไฟ · ช่างบั้งไฟ" : "SINGLE STAGE";
    VAB.render();
    setupVabDnD();
    show("vab");
    // บรีฟ 4 ส่วนของพี่ช่าง — ยิงหลังจอเปลี่ยนเข้าโรงประกอบแล้ว
    if (window.VN && window.VN.brief) setTimeout(() => VN.brief(G.run), 260);
    else if (window.VN) VN.atVab(r);
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
  function doLaunch(opts) {
    opts = opts || {};
    const r = G.run.rocket, s = G.run.stats, m = G.run.mission;
    if (!opts.skipIntro) {
      G.run.legalResult = checkClearance(TIERS[r.tierKey].legalTier, G.run.legalChecks);
      closeLegal();
      if (isWanHu(r, s) && window.VN) {
        G.run.wanHu = true;
        window.VN.wanHu(() => doLaunch({ skipIntro: true }));
        return;
      }
    }

    // สภาพอากาศสุ่มตอนเลือกภารกิจแล้ว (บรีฟ) — ใช้ค่าเดิม; สำรองไว้เผื่อยังไม่มี
    if (!G.run.weather) rollMissionWeather();
    const wxCommon = { windSpeed: G.run.wind, weather: G.run.weather };

    // ระบบกู้คืนสำหรับฟิสิกส์ (staged propulsive: Δv สำรองจริง = ไม่เกิน margin ที่มี → ถ้าน้อยไปยานจะตก)
    let recPhys = s.recovery ? Object.assign({}, s.recovery) : null;
    if (recPhys && recPhys.kind === "propulsive" && s.staged) {
      recPhys.dvReserve = Math.max(0, Math.min(recPhys.dvReserve || 0, (s.deltaVMargin || 0)));
    }

    let cfg;
    if (s.staged) {
      cfg = Object.assign({
        stages: s.stages, payloadMass: s.payloadMass, dragCoef: s.dragCoef,
        orbital: s.orbital, targetAltitude: m.targetAltitude, tier: tierN(r.tierKey),
        targetOrbitVelocity: m.targetOrbit || 0, launchAngleDeg: s.launchAngleDeg || 0,
        windSensitivity: 0.35, spinStabilized: true, recovery: recPhys, wanHu: !!G.run.wanHu,
        rocketMeta: { icon: r.icon, tier: tierN(r.tierKey), orbital: s.orbital, stageCount: s.stages.length,
          payloadId: VAB.payloadId || null, firework: fireworkMeta() }
      }, wxCommon);
    } else {
      const isTalai = r.id === "talai" && s.talai;
      const isBangfai = r.id === "bangfai" && s.bangfai;
      const isLantern = r.lantern === true;
      cfg = Object.assign({
        thrust: s.thrust, burnTime: s.burnTime, wetMass: s.wetMass, dryMass: s.dryMass,
        dragCoef: s.dragCoef, windSensitivity: r.windSensitivity,
        spinStabilized: s.spin, thrustWobble: s.wobble, targetAltitude: m.targetAltitude,
        tier: tierN(r.tierKey), fuelMass: s.fuelMass, paperRisk: s.paperRisk,
        structure: (isTalai || isBangfai) ? null : (r.lantern ? "paper"
          : (r.blackPowder || tierN(r.tierKey) === 2 ? "blackpowder" : null)),
        // โคมลอย: ลอยด้วยแรงลอยตัวความร้อน (ไม่ใช่แรงขับจรวด) + ลอยตามลมง่ายมาก
        lantern: isLantern,
        lanternBurnSec: isLantern ? (7 + s.fuelMass * 8 + s.thrust * 0.06) : 0,
        buoyPower: isLantern ? Math.max(0, Math.min(1.5, (s.thrust - 25) / 55)) : 0,
        casingCapMul: s.casingCapMul || 1, catoRisk: isTalai ? 0 : (s.catoRisk || 0), chemIgnitionRisk: s.chemIgnitionRisk || 0,
        talai: isTalai ? s.talai : null,
        bangfai: isBangfai ? { curve: s.bangfai.curve, tailBalance: s.bangfai.tailBalance,
          catoRisk: s.bangfai.catoRisk, ignitionRisk: s.bangfai.ignitionRisk } : null,
        recovery: (isTalai || isBangfai || isLantern) ? null : recPhys, wanHu: !!G.run.wanHu,
        rocketMeta: { icon: r.icon, tier: tierN(r.tierKey), spinStabilized: s.spin, body: s.body || null,
          talai: isTalai, bangfai: isBangfai, lantern: isLantern, firework: fireworkMeta(),
          payloadId: VAB.payloadId || null,
          tailLengthCm: isBangfai ? s.bangfai.tailLengthCm : null,
          tailAttachCm: isBangfai ? s.bangfai.tailAttachCm : null,
          boilTail: isBangfai ? s.bangfai.boilTail : null,
          talaiWingDia: isTalai ? (s.talai.wingDia || null) : null }
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
    const expendable = tier >= 3 || r.id === "bangfai";   // Tier 3–4 + บั้งไฟ: ลำตกกลับเป็นเรื่องปกติ (บุญบั้งไฟตัดสินที่ความสูง/เวลาอยู่ฟ้า)
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
    else if (sum.failReason === "TALAI_CATO") { damagePen = Math.round(bp * 0.8); rows.push(["บ้องไม้รวกปริแตกคามือ (ดินไวเกิน / ตำอัดแรง / ปลอกผิด)", -damagePen, false]); }
    else if (sum.failReason === "TALAI_WOBBLE") {
      damagePen = Math.round(bp * 0.5); rows.push(["ตะไลส่ายเสียการทรงตัว — ปีก/แกนไม่ได้สัดส่วน 2×รอบวง", -damagePen, false]);
      const liab = Math.round(Math.min(bp * 0.45, bp * 0.08 + Math.abs(sum.recoveryDrift || sum.horizontalDrift) * 0.6));
      if (liab > 0) rows.push([`ร่วงแนวราบใส่ทรัพย์สิน ${fmt(Math.abs(sum.recoveryDrift || sum.horizontalDrift))} m — ค่าเสียหาย (Liability)`, -liab, false]);
    }
    else if (sum.failReason === "BANGFAI_CATO") { damagePen = Math.round(bp * 0.8); rows.push(["ลำบั้งไฟระเบิดคาแท่น (CATO — ดินร้อน/อัดผิด/รูแกน/เฟื่องแคบ)", -damagePen, false]); }
    else if (sum.failReason === "BANGFAI_WOBBLE") {
      damagePen = Math.round(bp * 0.5); rows.push(["บั้งไฟ 'รำดาบ' — หางไม่สมดุล ส่ายเป็นเกลียวเสียความสูง", -damagePen, false]);
      const dr = Math.abs(sum.recoveryDrift != null ? sum.recoveryDrift : sum.horizontalDrift);
      const liab = Math.round(Math.min(bp * 0.4, bp * 0.06 + dr * 0.5));
      if (liab > 0) rows.push([`ควงออกนอกวิถีตกใส่พื้นที่ชุมชน ${fmt(dr)} m — ค่าเสียหาย (Liability)`, -liab, false]);
    }
    else if (sum.burnedUp) { damagePen = Math.round(bp * 0.7); rows.push(["ยานไหม้จากความร้อน re-entry", -damagePen, false]); }
    else if (!expendable && !orbital && sum.crashed) { damagePen = Math.round(bp * 0.6); rows.push([sum.unstable ? "บั้งไฟส่ายตกเสียหาย (CG เพี้ยน)" : "จรวดตกกระแทกเสียหาย", -damagePen, false]); }
    else if (sum.talai && sum.landed && !sum.crashed) { const b = Math.round(bp * 0.15); rows.push(["ตะไลเกลียวสว่านสวย ร่อนลงนิ่ม", b, true]); }

    // ---- บั้งไฟ: การแข่งบุญบั้งไฟตัดสินที่ "เวลาอยู่กลางอากาศ" (จับเวลา) ----
    if (r.id === "bangfai" && !sum.padExplosion) {
      const tgt = m.timeAloftTarget || 42;
      const tRatio = Math.max(0, Math.min(1.4, (sum.flightTime || 0) / tgt));
      const tPts = Math.round(bp * 0.4 * tRatio);
      rows.push([`จับเวลาอยู่กลางอากาศ ${fmt(sum.flightTime || 0, 1)} s / เป้า ${tgt} s`, tPts, tPts >= 0]);
      if ((sum.flightTime || 0) >= tgt * 1.15 && !sum.crashed) {
        const hb = Math.round(bp * 0.2);
        rows.push(["ดินหัวเลี้ยงดี — บั้งไฟค้างฟ้านานเป็นพิเศษ", hb, true]);
      }
    }

    // ---- Phase 5: ระบบกู้คืน / ลงจอด ----
    const recv = (s.recovery && s.recovery.kind) || sum.recovery || "freefall";
    const drift = Math.abs(sum.recoveryDrift != null ? sum.recoveryDrift : sum.horizontalDrift);
    // ---- โคมลอย: ลอยตามลม — ลอยเฉไกลเกินเขตปลอดภัยจึงจะมีค่าเสียหาย ----
    if (r.lantern && !sum.burnedUp && sum.landed) {
      if (drift > 300) {
        const dmg = Math.round(Math.min(bp * 0.45, (drift - 300) * 0.35));
        rows.push([`โคมลอยเฉ ${fmt(drift)} m ออกนอกเขตปลอดภัย — เสี่ยงรบกวนการบิน/ไฟไหม้ (พ.ร.บ.การเดินอากาศ)`, -dmg, false]);
      } else {
        rows.push([`โคมลอยเฉ ${fmt(drift)} m — อยู่ในเขตควบคุม`, 0, true]);
      }
    }
    if (!orbital && sum.failReason == null && !sum.burnedUp && !sum.talai && !sum.bangfai && !sum.lantern) {
      if (recv === "propulsive" && sum.recovered) {
        rows.push(["ลงจอดด้วยแรงขับสำเร็จ — กู้ยานคืน (คืนงบ)", Math.round(bp * 0.35), true]);
      } else if (recv === "parachute" && sum.recovered) {
        rows.push(["ร่มชูชีพ — กู้ชิ้นส่วนกลับมาใช้ได้ (คืนงบ + ผ่านมาตรฐานความปลอดภัย)", Math.round(bp * 0.28), true]);
      } else if (recv === "gps" && sum.landed && !sum.crashed) {
        const sp = Math.round(Math.min(bp * 0.1, drift * 0.35));
        if (sp) rows.push([`ค้นหาด้วย GPS (ลอยเฉ ${fmt(drift)} m) — ค่าค้นหา`, -sp, false]);
      } else if (recv === "freefall" && sum.landed && !sum.crashed) {
        const dmg = Math.round(Math.min(bp * 0.5, bp * 0.05 + drift * 0.55));
        if (dmg > 0) rows.push([`ตกแบบไม่นำวิถี ${fmt(drift)} m — ค่าเสียหายทรัพย์สิน (Liability Convention)`, -dmg, false]);
      }
    }
    if (!orbital && sum.failReason === "LANDING_BURN_FAIL") {
      rows.push(["ลงจอดด้วยแรงขับล้มเหลว — Δv สำรองไม่พอ ยานตกกระแทก (กะปิซวย)", -Math.round(bp * 0.5), false]);
    }
    if (orbital && recv === "propulsive") {
      if (s.recOK) rows.push(["กู้บูสเตอร์ท่อน 1 คืน (สไตล์ Falcon 9 — คืนงบ)", Math.round(bp * 0.3), true]);
      else rows.push(["บูสเตอร์ท่อน 1 ตกทะเล — Δv สำรองไม่พอ", -Math.round(bp * 0.12), false]);
    }

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
      : sum.failReason === "TALAI_CATO" ? "บ้องไม้รวกปริแตกคามือ 💥"
      : sum.failReason === "TALAI_WOBBLE" ? "ตะไลส่ายแล้วร่วงแนวราบ — ปีกไม่ได้สัดส่วน"
      : sum.failReason === "BANGFAI_CATO" ? "ลำบั้งไฟระเบิดคาแท่นปล่อย 💥"
      : sum.failReason === "BANGFAI_WOBBLE" ? "บั้งไฟ 'รำดาบ' — หางไม่สมดุล ส่ายเสียความสูง"
      : sum.failReason === "LANDING_BURN_FAIL" ? "ลงจอดด้วยแรงขับล้มเหลว — ยานตกกระแทก 💥"
      : sum.failReason === "WAN_HU" ? "อนุสรณ์ Wan Hu — ระเบิดคาแท่นตามตำนาน 🪑💥"
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
    const notes = [];

    // Easter egg: เหรียญอนุสรณ์หวันหู่
    if (sum.failReason === "WAN_HU") {
      if (awardAchievement("wan_hu", "Wan Hu Memorial Award"))
        notes.push("🏅 ปลดล็อกเหรียญลับ: <b>Wan Hu Memorial Award</b> — ผูกบั้งไฟกับเก้าอี้แล้วจุด เหมือนตำนานเป๊ะ");
    }

    const newlyUnlocked = tryUnlockTiers();
    if (newlyUnlocked.length)
      notes.push("🔓 ปลดล็อก " + newlyUnlocked.map(k => "Tier " + TIERS[k].n + " · " + TIERS[k].nameTh).join(", "));
    newlyUnlocked.forEach(k => toast("ปลดล็อก Tier " + TIERS[k].n + "!"));

    // Aerospace Codex — ปลดล็อกรายการตามบริบทเที่ยวบิน
    if (window.Codex) {
      const newCodex = window.Codex.unlockFromFlight({
        rocket: r, mission: m, tier, summary: sum,
        missionPassed: success && missionGoalMet,
        payloadId: VAB.payloadId || null,
        firework: !!(window.Fireworks && window.Fireworks.state.enabled),
        totalScore: G.progress.totalScore
      });
      if (newCodex.length)
        notes.push("🏛️ หอจดหมายเหตุ: " + newCodex.map(e => e.title).join(", "));
      updateCodexButton();
    }

    if (notes.length) { unlockBox.hidden = false; unlockBox.innerHTML = notes.join("<br>"); }
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

    // Easter egg: พิมพ์ "wanhu" ที่ไหนก็ได้เพื่อปลดล็อกเก้าอี้หวันหู่
    let _seq = "";
    document.addEventListener("keydown", (e) => {
      if (e.key && e.key.length === 1) {
        _seq = (_seq + e.key.toLowerCase()).slice(-5);
        if (_seq === "wanhu" && !G.wanHu.unlocked) {
          G.wanHu.unlocked = true;
          toast("🪑 ปลดล็อก: เก้าอี้สำนักงานหวันหู่ (อยู่ในคลังชิ้นส่วน Tier 1–2)");
          if (window.Codex) window.Codex.unlock("wanhu");
          if (G.run && G.run.rocket && !isStaged(G.run.rocket)) VAB.render();
        }
      }
    });

    $("#btn-start").addEventListener("click", () => { renderMissions(); show("mission"); });
    $("#btn-reset-progress").addEventListener("click", () => {
      if (!confirm("ล้างความคืบหน้าทั้งหมด?")) return;
      G.progress = defaultProgress();
      if (window.Codex) window.Codex.reset();
      saveProgress();
      renderHome();
      toast("ล้างความคืบหน้าแล้ว");
    });

    // Aerospace Codex
    $("#btn-codex").addEventListener("click", openCodex);
    $("#codex-close").addEventListener("click", closeCodex);
    $("#codex-back").addEventListener("click", codexBackToGrid);
    $("#codex-modal").addEventListener("click", (e) => { if (e.target.id === "codex-modal") closeCodex(); });
    document.addEventListener("codex:unlock", () => {
      updateCodexButton();
      if (!$("#codex-modal").hidden && !$("#codex-grid").hidden) renderCodexGrid();
    });
    updateCodexButton();

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
