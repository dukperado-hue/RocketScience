// js/fireworks.js — Phase 12/13 · หัวพลุเฉลิมฉลอง (Ultimate Pyrotechnics)
//
//   การประกอบลูกพลุ (พลุ / Firework Shell) — 3 ขั้น:
//     Step 1 · เปลือกพลุ (shell)      — เล็ก/กลาง/ใหญ่ → ขนาดดอก + เพดานสูง
//     Step 2 · สารเคมีเม็ดดาว (chems) — สเปกโทรสโกปีการเปล่งแสงเชิงอะตอม, ผสมได้ถึง 3 สี
//                                       (บางภารกิจบังคับ 3 สีธงชาติ) + รูปแบบการแตก
//     Step 3 · ชนวนหน่วงเวลา (fuse)   — สั้น/กลาง/ยาว → หน่วงจุดหลังถึง apogee
//
//   เมื่อลูกพลุถึงจุดสูงสุด (Time Fuse ถึง Bursting Charge) → js/launch3d.js เรียก Fireworks.detonate()
//   จุดระเบิดหลายชั้น (multi-break) ด้วย THREE.Points หลายพันอนุภาค กระจายทรงกลม 3 มิติ
//   (ดันออกทางแกน Z เข้าหากล้อง/ผู้ชมด้วย) + แรงต้านอากาศ + แรงโน้มถ่วง + emissive สูงติด bloom
//
//   window.Fireworks.render(hostEl, onChange, ctx)  — แผงประกอบใน VAB (ctx = { maxChems, requiredChems, missionTitle })
//   window.Fireworks.derived()                      — { enabled, shell, chems, colors, pattern, fuse, spec, ... }
//   window.Fireworks.state                          — { enabled, shell, chems, colorant, pattern, fuse }
//   window.Fireworks.detonate(THREE, scene, posVec3, opts) -> { update(dt), dispose() }

(function () {
  "use strict";

  const SCORE_BONUS = 250;

  // สเปกตรัมสารให้สี — มาจาก chemistry.js (มี fallback กันพัง)
  function SPEC() {
    return (window.Chemistry && window.Chemistry.SPECTRUM) || {
      strontium: { el: "Sr", th: "สตรอนเชียม", hex: 0xff0000, nm: 641, spark: false, flame: "แดง", reaction: "" }
    };
  }
  function chemOf(k) { const s = SPEC(); return s[k] || s.strontium; }

  // เปลือกพลุ (hollow shell) — ยิ่งใหญ่ ยิ่งขึ้นสูง ดอกยิ่งบาน
  const SHELLS = {
    small:  { th: "ลูกเล็ก 3\"",  burstScale: 0.78, altMul: 0.78, apogee: 240, desc: "ดอกเล็กกะทัดรัด ขึ้นเร็ว ~240 ม." },
    medium: { th: "ลูกกลาง 6\"", burstScale: 1.00, altMul: 1.00, apogee: 360, desc: "มาตรฐานงานเทศกาล ~360 ม." },
    large:  { th: "ลูกใหญ่ 10\"", burstScale: 1.35, altMul: 1.28, apogee: 520, desc: "ดอกใหญ่เต็มฟ้า ต้องอัดดินหนัก ~520 ม." }
  };

  // ชนวนหน่วงเวลา (time fuse) — หน่วงการจุดหลังถึง apogee
  //   Phase 20 · ทำให้ต่างกันจริง: สั้น = จุดที่ apogee เป๊ะ · กลาง = หน่วงนิด · ยาว = ร่วงลงมาชัด ๆ ลากหางยาว
  const FUSES = {
    short:  { th: "ชนวนสั้น",  delay: 0.0, tail: 0,    desc: "จุดทันทีที่ถึงจุดสูงสุด — ดอกกางกลางฟ้า" },
    medium: { th: "ชนวนกลาง", delay: 0.9, tail: 0.4,  desc: "หน่วงเล็กน้อย เริ่มร่วงแล้วค่อยแตก" },
    long:   { th: "ชนวนยาว",  delay: 2.4, tail: 1.0,  desc: "ร่วงลงมาชัด ๆ ลากหางยาวก่อนระเบิด" }
  };

  // รูปแบบการแตกของลูกพลุ (shell break)
  //   Phase 20 · NO MORE SLOW-MO — ดอกไม้ไฟกระชับ ปัง ๆ ตกไว จบใน ~4–7 วิ
  //   grav สูงขึ้นมาก + life สั้นลง → เม็ดดาวพุ่ง ร่วง ดับ เร็ว รู้สึกมีน้ำหนักและพลัง
  const PATTERNS = {
    peony:      { th: "ลูกพุด", en: "Peony",         grav: 3.6, life: 4.6, spread: 1.10, trailFrac: 0.00, breaks: false,
                  desc: "ทรงกลมเม็ดดาวกระจายแล้วหรี่ดับพร้อมกัน" },
    chrysanth:  { th: "เบญจมาศ", en: "Chrysanthemum", grav: 3.1, life: 5.2, spread: 1.10, trailFrac: 0.55, breaks: false,
                  desc: "เม็ดดาวลากหางประกายยาวเป็นทรงพัด" },
    willow:     { th: "ต้นหลิว", en: "Willow",        grav: 2.2, life: 6.6, spread: 0.80, trailFrac: 0.80, breaks: false, gold: true,
                  desc: "หางทองยาวลู่ลงช้า ๆ ค้างฟ้านานสุด" },
    multibreak: { th: "มัลติเบรก", en: "Multi-Break", grav: 3.5, life: 4.8, spread: 1.10, trailFrac: 0.30, breaks: true,
                  desc: "เม็ดดาวชั้นแรกจุดระเบิดซ้ำเป็นพวงเล็ก (ใช้กับพลุหลายสี)" },
    crossette:  { th: "ครอสเซ็ตต์", en: "Crossette", grav: 3.5, life: 4.4, spread: 1.00, trailFrac: 0.25, breaks: true, cross: true,
                  desc: "เม็ดดาวแตกออกเป็นกากบาท 4 แฉก" }
  };

  const state = {
    enabled: false,
    shell: "medium",
    chems: ["strontium"],
    pattern: "peony",
    fuse: "medium",
    get colorant() { return this.chems[0] || "strontium"; }   // ชื่อเดิม (vab3d.js อ้างอิงตรง ๆ)
  };
  let _onChange = null, _ctx = { maxChems: 1, requiredChems: null, missionTitle: "" };
  function notify() { if (_onChange) { try { _onChange(); } catch (e) { console.warn("[Fireworks] onChange", e); } } }

  function clampChems() {
    const max = Math.max(1, _ctx.maxChems || 1);
    if (state.chems.length > max) state.chems = state.chems.slice(0, max);
    if (!state.chems.length) state.chems = ["strontium"];
    // มัลติเบรกเหมาะกับหลายสี — สลับให้อัตโนมัติเมื่อเลือก >1 สี
    if (state.chems.length > 1 && !PATTERNS[state.pattern].breaks) state.pattern = "multibreak";
  }

  function derived() {
    clampChems();
    const specs = state.chems.map(chemOf);
    const colors = specs.map(s => s.hex);
    const sh = SHELLS[state.shell] || SHELLS.medium;
    const fs = FUSES[state.fuse] || FUSES.medium;
    const p = PATTERNS[state.pattern] || PATTERNS.peony;
    const reqOK = !_ctx.requiredChems || _ctx.requiredChems.every(k => state.chems.includes(k));
    return {
      enabled: state.enabled,
      shell: state.shell, chems: state.chems.slice(), colors,
      pattern: state.pattern, fuse: state.fuse, fuseDelay: fs.delay, fuseTail: fs.tail || 0,
      burstScale: sh.burstScale, altMul: sh.altMul, apogeeM: sh.apogee,
      spec: specs[0], specs, colorant: state.chems[0],
      color: colors[0], nm: specs[0].nm, spark: specs.some(s => s.spark),
      flame: specs.map(s => s.flame).join(" + "),
      patName: p.th + " (" + p.en + ")",
      requiredMet: reqOK,
      scoreBonus: state.enabled ? SCORE_BONUS : 0,   // โบนัสครบสีธีม +400 ให้ที่ showReport
      massAdd: 0
    };
  }

  // -------- UI (VAB) --------
  function hx(n) { return "#" + (n >>> 0).toString(16).padStart(6, "0"); }
  const CHK = '<span class="fw-step-ok">✓</span>';

  function render(host, onChange, ctx) {
    _onChange = onChange || _onChange;
    if (ctx) _ctx = Object.assign({ maxChems: 1, requiredChems: null, missionTitle: "" }, ctx);
    if (!host) return;
    host.hidden = false;
    clampChems();

    const spec = SPEC();
    const sh = SHELLS[state.shell], fs = FUSES[state.fuse];
    const specs = state.chems.map(chemOf);
    const multi = (_ctx.maxChems || 1) > 1;
    const req = _ctx.requiredChems;
    const reqOK = !req || req.every(k => state.chems.includes(k));

    host.innerHTML = `
      <div class="vx-title">ประกอบลูกพลุ <span class="vx-tag">PYROTECHNICS</span></div>
      <label class="fw-toggle">
        <input type="checkbox" id="fw-on" ${state.enabled ? "checked" : ""}>
        บรรจุลูกพลุลงท่อครก — ยิงขึ้นสูง แตกที่จุดสูงสุด (ปล่อยตอนกลางคืน)
      </label>
      <div class="fw-body" ${state.enabled ? "" : "hidden"}>

        <div class="fw-step">
          <div class="fw-step-h">1 · เปลือกพลุ (shell) ${CHK}</div>
          <div class="fw-pats fw-shells">
            ${Object.keys(SHELLS).map(k => {
              const o = SHELLS[k];
              return `<button type="button" class="fw-pat${state.shell === k ? " on" : ""}" data-fws="${k}">
                <b>${o.th}</b><small>${o.desc}</small></button>`;
            }).join("")}
          </div>
        </div>

        <div class="fw-step">
          <div class="fw-step-h">2 · สารเคมีเม็ดดาว (Atomic Emission) ${state.chems.length ? CHK : ""}</div>
          ${req ? `<div class="vx-hint" style="margin:0 0 5px">ภารกิจนี้ต้องครบ ${req.length} สี:
            ${req.map(k => `<b style="color:${hx(chemOf(k).hex)}">${chemOf(k).th}</b>`).join(" · ")}
            ${reqOK ? " ✓" : ""}</div>` : ""}
          ${multi ? `<div class="vx-hint" style="margin:0 0 5px">ผสมได้ถึง ${_ctx.maxChems} สี — แตะเพื่อเลือก/เอาออก
            (เลือกแล้ว ${state.chems.length}/${_ctx.maxChems})</div>` : ""}
          <div class="fw-swatches">
            ${Object.keys(spec).map(k => {
              const o = spec[k], on = state.chems.includes(k);
              return `<button type="button" class="fw-sw${on ? " on" : ""}" data-fw="${k}">
                <span class="fw-dot" style="background:${hx(o.hex)}"></span>
                <span class="fw-sw-th">${o.th} <em>${o.el}</em></span>
                <small>${o.flame}${o.nm ? " · " + o.nm + " nm" : ""}</small></button>`;
            }).join("")}
          </div>
          <div class="vx-label" style="margin-top:8px">รูปแบบการแตกของลูกพลุ</div>
          <div class="fw-pats">
            ${Object.keys(PATTERNS).map(k => {
              const o = PATTERNS[k];
              return `<button type="button" class="fw-pat${state.pattern === k ? " on" : ""}" data-fwp="${k}">
                <b>${o.th} <span style="opacity:.6;font-weight:400">${o.en}</span></b>
                <small>${o.desc}</small></button>`;
            }).join("")}
          </div>
        </div>

        <div class="fw-step">
          <div class="fw-step-h">3 · ชนวนหน่วงเวลา (Time Fuse) ${CHK}</div>
          <div class="fw-pats fw-fuses">
            ${Object.keys(FUSES).map(k => {
              const o = FUSES[k];
              return `<button type="button" class="fw-pat${state.fuse === k ? " on" : ""}" data-fwf="${k}">
                <b>${o.th}</b><small>${o.desc}</small></button>`;
            }).join("")}
          </div>
        </div>

        <div class="vx-hint">${specs.map(s => `${s.el} → เปลว${s.flame}`).join(" · ")}. ${specs[0].reaction || ""}</div>
      </div>`;

    const on = host.querySelector("#fw-on");
    if (on) on.addEventListener("change", e => { state.enabled = e.target.checked; render(host); notify(); });

    host.querySelectorAll("[data-fws]").forEach(b =>
      b.addEventListener("click", () => { state.shell = b.dataset.fws; render(host); notify(); }));

    host.querySelectorAll("[data-fw]").forEach(b =>
      b.addEventListener("click", () => {
        const k = b.dataset.fw, max = Math.max(1, _ctx.maxChems || 1);
        if (max === 1) { state.chems = [k]; }
        else if (state.chems.includes(k)) { state.chems = state.chems.filter(x => x !== k); if (!state.chems.length) state.chems = [k]; }
        else if (state.chems.length < max) { state.chems.push(k); }
        else { state.chems = [...state.chems.slice(1), k]; }
        render(host); notify();
      }));

    host.querySelectorAll("[data-fwp]").forEach(b =>
      b.addEventListener("click", () => { state.pattern = b.dataset.fwp; render(host); notify(); }));

    host.querySelectorAll("[data-fwf]").forEach(b =>
      b.addEventListener("click", () => { state.fuse = b.dataset.fwf; render(host); notify(); }));
  }

  // -------- soft radial sprite --------
  let _sprite = null;
  function sprite(THREE) {
    if (_sprite) return _sprite;
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,.6)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    _sprite = new THREE.CanvasTexture(c);
    return _sprite;
  }

  // -------- multi-break particle shell (ฉากปล่อย 3 มิติ) --------
  function detonate(THREE, scene, pos, opts) {
    opts = opts || {};
    const pat = PATTERNS[opts.pattern] || PATTERNS.peony;
    const scale = opts.burstScale || 1;
    // Phase 20 · ชนวนยาว → หางประกายเยอะ+ยาวขึ้น
    const tailBoost = opts.fuseTail || 0;
    const trailFrac = Math.min(1, (pat.trailFrac || 0) + tailBoost * 0.55);
    const lifeMul = opts.lifeMul || 1;

    // รายการสี (1–3 สี) — ดันความสว่างสีมืด (เช่น Cu 0x0044ff) ให้ติด bloom
    const colorHexes = (opts.colors && opts.colors.length) ? opts.colors
      : [opts.color != null ? opts.color : (opts.spec ? opts.spec.hex : 0xff0000)];
    const emitList = colorHexes.map(hex => {
      const c = new THREE.Color(hex);
      const peak = Math.max(c.r, c.g, c.b) || 1;
      return c.multiplyScalar(Math.min(2.4, (1 / peak) * 1.5));
    });
    const specs = opts.specs || (opts.spec ? [opts.spec] : []);
    const spark = specs.some(s => s && s.spark);

    const MAX = 7600;   // Phase 17.2 · pool bigger — long-lived nebula + more trails
    const posArr = new Float32Array(MAX * 3);
    const colArr = new Float32Array(MAX * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
    geo.setDrawRange(0, 0);
    const mat = new THREE.PointsMaterial({
      size: 0.6, map: sprite(THREE), vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
      opacity: 1, toneMapped: false
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.renderOrder = 6;
    scene.add(points);

    const P = new Array(MAX);
    for (let i = 0; i < MAX; i++) P[i] = { life: 0 };
    let cur = 0;
    function alloc() {
      for (let k = 0; k < MAX; k++) {
        const idx = (cur + k) % MAX;
        if (P[idx].life <= 0) { cur = (idx + 1) % MAX; return P[idx]; }
      }
      return null;
    }
    function makeStar(x, y, z, vx, vy, vz, r, g, b, life, drag, grav, o) {
      const p = alloc(); if (!p) return null;
      o = o || {};
      p.life = life; p.max = life;
      p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
      p.r = r; p.g = g; p.b = b;
      p.drag = drag; p.grav = grav;
      p.kind = o.kind || "star";
      p.trail = !!o.trail; p.tacc = 0;
      p.breakIn = o.breakIn || 0; p.cross = !!o.cross;
      return p;
    }

    // แสงวาบเดียว ใช้ซ้ำ
    const burstLight = new THREE.PointLight(colorHexes[0], 0, 160, 2);
    burstLight.position.set(pos.x, pos.y, pos.z);
    scene.add(burstLight);
    let lightHold = 0, lightGlow = 0;
    function flash(intensity, hex) {
      if (hex != null) burstLight.color.setHex(hex);
      lightHold = Math.max(lightHold, intensity);
      lightGlow = Math.max(lightGlow, intensity * 0.42);
    }

    // ---- primary burst — ทรงกลม 3 มิติ + เอียงเวกเตอร์เข้าหากล้อง (Z บวก) ----
    function burst(cx, cy, cz, s, colIdx) {
      const emit = emitList[colIdx % emitList.length];
      const N = Math.round((spark ? 380 : 320) * s);
      const v0 = (spark ? 16 : 21) * (pat.spread || 1) * s;
      for (let i = 0; i < N; i++) {
        const u = Math.random() * 2 - 1, ang = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(1 - u * u);
        const sp = v0 * (0.5 + Math.pow(Math.random(), 0.5) * 0.62);
        let r = emit.r, g = emit.g, b = emit.b;
        if (spark && Math.random() < 0.28) { r = 1.6; g = 1.4; b = 0.8; }
        else { const t = 0.82 + Math.random() * 0.32; r *= t; g *= t; b *= t; }
        // Phase 17.2 · แกน Z คูณ 1.7 + ดันหน้า (bias +Z) → ดอกป่องทะลุจอเข้าหาผู้ชม
        makeStar(
          cx, cy, cz,
          rr * Math.cos(ang) * sp, u * sp, rr * Math.sin(ang) * sp * 1.7 + sp * 0.42,
          r, g, b,
          pat.life * lifeMul * (0.82 + Math.random() * 0.36),
          spark ? 0.09 : 0.07, pat.grav,
          {
            trail: trailFrac > 0 && Math.random() < trailFrac,
            breakIn: pat.breaks ? 0.45 + Math.random() * 0.3 : 0,
            cross: pat.cross
          }
        );
      }
      if (s >= 1) burstLight.position.set(cx, cy, cz);
      flash(spark ? 15 : 11, spark ? 0xffffff : colorHexes[colIdx % colorHexes.length]);
    }

    // ---- multi-shell schedule ----
    function defaultShells() {
      const nC = emitList.length;
      // หลายสี → ระเบิดดอกละสี เหลื่อมกันนิดหน่อย
      if (nC > 1) {
        return [{ t: 0, s: 1.15 * scale, c: 0 }].concat(
          Array.from({ length: nC - 1 }, (_, i) => ({
            t: 0.28 * (i + 1), dx: (i % 2 ? 6 : -6) * scale, dz: (i % 2 ? -4 : 4) * scale,
            s: 0.95 * scale, c: i + 1
          }))
        );
      }
      const main = { t: 0, s: 1.15 * scale, c: 0 };
      if (spark) return [main, { t: 0.55, dx: -6 * scale, dz: 4 * scale, s: 0.5 * scale, c: 0 }];
      if (pat.breaks) return [main, { t: 0.4, dx: 6 * scale, dz: -3 * scale, s: 0.42 * scale, c: 0 }, { t: 0.85, dx: -7 * scale, dz: 4 * scale, s: 0.42 * scale, c: 0 }];
      return [main, { t: 0.5, dx: -7 * scale, dz: 5 * scale, s: 0.5 * scale, c: 0 }, { t: 0.95, dx: 7 * scale, dz: -4 * scale, s: 0.45 * scale, c: 0 }];
    }
    const shells = opts.shells || defaultShells();

    let elapsed = 0, shellIdx = 0, aliveCount = 1;

    return {
      update(dt) {
        dt = Math.min(dt, 0.05);
        elapsed += dt;

        while (shellIdx < shells.length && elapsed >= shells[shellIdx].t) {
          const sh = shells[shellIdx++];
          burst(pos.x + (sh.dx || 0), pos.y + (sh.dy || 0), pos.z + (sh.dz || 0), sh.s || 1, sh.c || 0);
        }

        let n = 0; aliveCount = 0;
        for (let i = 0; i < MAX; i++) {
          const p = P[i];
          if (p.life <= 0) continue;
          p.life -= dt;
          if (p.life <= 0) continue;
          aliveCount++;

          const d = Math.pow(p.drag, dt);
          p.vx *= d; p.vz *= d;
          p.vy = p.vy * d - p.grav * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;

          if (p.breakIn > 0) {
            p.breakIn -= dt;
            if (p.breakIn <= 0) {
              p.breakIn = 0;
              const kids = p.cross ? 4 : 5 + (Math.random() * 6 | 0);
              for (let j = 0; j < kids; j++) {
                let dx, dy, dz;
                if (p.cross) {
                  const a = j * Math.PI / 2 + 0.25;
                  dx = Math.cos(a) * 8; dy = (Math.random() - 0.5) * 2.4; dz = Math.sin(a) * 8;
                } else {
                  const uu = Math.random() * 2 - 1, aa = Math.random() * Math.PI * 2, r2 = Math.sqrt(1 - uu * uu);
                  const s2 = 4 + Math.random() * 5;
                  dx = r2 * Math.cos(aa) * s2; dy = uu * s2; dz = r2 * Math.sin(aa) * s2 * 1.6 + s2 * 0.4;
                }
                makeStar(p.x, p.y, p.z,
                  p.vx * 0.35 + dx, p.vy * 0.35 + dy, p.vz * 0.35 + dz,
                  p.r, p.g, p.b, 9 + Math.random() * 6, 0.06, p.grav * 1.1,
                  { kind: "spark", trail: Math.random() < 0.4 });
              }
            }
          }

          if (p.trail && p.kind === "star") {
            p.tacc += dt;
            const iv = 0.14;   // Phase 17.2 · หางถี่น้อยลง (เม็ดดาวอยู่นาน 20+ วิ) กัน pool ล้น
            while (p.tacc >= iv) {
              p.tacc -= iv;
              const tp = alloc();
              if (tp) {
                tp.life = (pat.gold ? 2.4 : 1.6) * (1 + tailBoost * 1.4); tp.max = tp.life;
                tp.x = p.x; tp.y = p.y; tp.z = p.z;
                tp.vx = p.vx * 0.12; tp.vy = p.vy * 0.12 - 0.4; tp.vz = p.vz * 0.12;
                if (pat.gold) { tp.r = 1.7; tp.g = 1.15; tp.b = 0.35; }
                else { tp.r = p.r * 0.7 + 0.25; tp.g = p.g * 0.6 + 0.18; tp.b = p.b * 0.5; }
                tp.drag = 0.06; tp.grav = p.grav * 0.55;
                tp.kind = "trail"; tp.trail = false; tp.breakIn = 0; tp.tacc = 0; tp.cross = false;
              }
            }
          }

          const k = p.life / p.max;
          const br = p.kind === "trail" ? k * k : Math.pow(k, 0.55);
          posArr[n * 3] = p.x; posArr[n * 3 + 1] = p.y; posArr[n * 3 + 2] = p.z;
          colArr[n * 3] = p.r * br; colArr[n * 3 + 1] = p.g * br; colArr[n * 3 + 2] = p.b * br;
          n++;
        }
        geo.setDrawRange(0, n);
        geo.attributes.position.needsUpdate = true;
        geo.attributes.color.needsUpdate = true;
        // Phase 20 · เม็ดใหญ่ตอนแตกแล้วยุบไว — ปัง ไม่อืด
        mat.size = (0.40 + 0.75 * Math.max(0, 1 - elapsed * 0.5)) * (0.95 + 0.3 * scale);

        lightHold *= Math.pow(0.02, dt);
        lightGlow *= Math.pow(0.25, dt);
        burstLight.intensity = lightHold + lightGlow;

        return (aliveCount > 0 || shellIdx < shells.length) && elapsed < 10;
      },
      dispose() {
        scene.remove(points);
        geo.dispose(); mat.dispose();
        scene.remove(burstLight);
      }
    };
  }

  window.Fireworks = {
    render, derived, detonate, state, PATTERNS, SHELLS, FUSES,
    get SPECTRUM() { return SPEC(); },
    get COLORANTS() { return SPEC(); }
  };
})();
