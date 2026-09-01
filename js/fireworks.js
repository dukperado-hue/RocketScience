// js/fireworks.js — Phase 12 · หัวพลุเฉลิมฉลอง (Ultimate Pyrotechnics)
//
//   Tier 1–3 ติด "หัวพลุ" เสริม 1 หัว แล้วเลือก:
//     1) สารให้สีเม็ดดาว (Atomic Emission Spectroscopy — ดู js/chemistry.js SPECTRUM)
//        Sr/Li แดง · Ba เขียว · Cu น้ำเงิน · Na เหลือง · Ca ส้ม · Al/Mg ขาว-เงิน
//     2) รูปแบบการแตก (shell break pattern) — ลูกพุด / เบญจมาศ / ต้นหลิว / มัลติเบรก / ครอสเซ็ตต์
//
//   เมื่อจรวดถึงจุดสูงสุด (vy ≤ 0) → js/launch3d.js เรียก Fireworks.detonate()
//   จุดระเบิดหลายชั้น (multi-break) ด้วย THREE.Points หลายพัน อนุภาค:
//     - Primary burst: ทรงกลมเม็ดดาวพุ่งเร็ว + แรงต้านอากาศสูง → บานเร็วแล้วชะลอ
//     - Secondary burst: เม็ดดาวจุดซ้ำเป็นพวงเล็ก / ลากหางเรืองแสง (willow)
//     - แรงโน้มถ่วงทำให้อนุภาคโค้งตกสวยงามหลังบาน
//     - ค่า emissive สูง → เรืองผ่าน UnrealBloomPass ของฉากปล่อย
//
//   window.Fireworks.render(hostEl, onChange)   — แผงเลือกใน VAB
//   window.Fireworks.derived()                  — { enabled, colorant, pattern, color, spark, spec, ... }
//   window.Fireworks.state                      — { enabled, colorant, pattern }
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

  // รูปแบบการแตกของลูกพลุ (shell break)
  const PATTERNS = {
    peony:      { th: "ลูกพุด", en: "Peony",         grav: 9.0,  life: 2.2, spread: 1.00, trailFrac: 0.00, breaks: false,
                  desc: "ทรงกลมเม็ดดาวกระจายแล้วหรี่ดับพร้อมกัน — พลุพื้นฐานที่พบบ่อยสุด" },
    chrysanth:  { th: "เบญจมาศ", en: "Chrysanthemum", grav: 8.5,  life: 2.7, spread: 1.00, trailFrac: 0.55, breaks: false,
                  desc: "เหมือนลูกพุดแต่เม็ดดาวลากหางประกายยาวเป็นทรงพัด" },
    willow:     { th: "ต้นหลิว", en: "Willow",        grav: 5.0,  life: 3.6, spread: 0.74, trailFrac: 0.72, breaks: false, gold: true,
                  desc: "หางทองยาวลู่ลงช้า ๆ ตามแรงโน้มถ่วง ค้างฟ้านานที่สุด" },
    multibreak: { th: "มัลติเบรก", en: "Multi-Break", grav: 9.0,  life: 2.4, spread: 1.00, trailFrac: 0.30, breaks: true,
                  desc: "เม็ดดาวชั้นแรกจุดระเบิดซ้ำเป็นพวงเล็ก ~0.7 วิ ถัดมา" },
    crossette:  { th: "ครอสเซ็ตต์", en: "Crossette", grav: 9.0,  life: 2.3, spread: 0.92, trailFrac: 0.25, breaks: true, cross: true,
                  desc: "เม็ดดาวแตกออกเป็นกากบาท 4 แฉกพร้อมกันทั้งดอก" }
  };

  const state = { enabled: false, colorant: "strontium", pattern: "peony" };
  let _onChange = null;
  function notify() { if (_onChange) { try { _onChange(); } catch (e) { console.warn("[Fireworks] onChange", e); } } }

  function derived() {
    const c = chemOf(state.colorant);
    const p = PATTERNS[state.pattern] || PATTERNS.peony;
    return {
      enabled: state.enabled,
      colorant: state.colorant,
      pattern: state.pattern,
      color: c.hex, spark: !!c.spark, flame: c.flame, nm: c.nm,
      spec: c, patName: p.th + " (" + p.en + ")",
      scoreBonus: state.enabled ? SCORE_BONUS : 0, massAdd: 0
    };
  }

  // -------- UI (VAB) --------
  function hx(n) { return "#" + (n >>> 0).toString(16).padStart(6, "0"); }

  function render(host, onChange) {
    _onChange = onChange || _onChange;
    if (!host) return;
    host.hidden = false;
    const spec = SPEC();
    const c = chemOf(state.colorant);
    const p = PATTERNS[state.pattern] || PATTERNS.peony;

    host.innerHTML = `
      <div class="vx-title">หัวพลุเฉลิมฉลอง <span class="vx-tag">PYROTECHNICS</span></div>
      <label class="fw-toggle">
        <input type="checkbox" id="fw-on" ${state.enabled ? "checked" : ""}>
        ติดหัวพลุ — จุดระเบิดหลายชั้นตอนถึงจุดสูงสุด (apogee) · ปล่อยตอนกลางคืน
      </label>
      <div class="fw-body" ${state.enabled ? "" : "hidden"}>
        <div class="vx-label">สารให้สีเม็ดดาว — สเปกโทรสโกปีการเปล่งแสงเชิงอะตอม</div>
        <div class="fw-swatches">
          ${Object.keys(spec).map(k => {
            const o = spec[k];
            return `<button type="button" class="fw-sw${state.colorant === k ? " on" : ""}" data-fw="${k}">
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
        <div class="vx-hint">${c.el} → เปลว${c.flame}. ${c.reaction || ""}</div>
      </div>`;

    const on = host.querySelector("#fw-on");
    if (on) on.addEventListener("change", e => { state.enabled = e.target.checked; render(host); notify(); });
    host.querySelectorAll("[data-fw]").forEach(b =>
      b.addEventListener("click", () => { state.colorant = b.dataset.fw; render(host); notify(); }));
    host.querySelectorAll("[data-fwp]").forEach(b =>
      b.addEventListener("click", () => { state.pattern = b.dataset.fwp; render(host); notify(); }));
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
    const spec = opts.spec || chemOf(opts.colorant);
    const pat = PATTERNS[opts.pattern] || PATTERNS.peony;
    const spark = !!spec.spark;

    // สีฐาน + ดันความสว่างให้สีที่มืด (เช่น Cu 0x0044ff) ติด bloom แน่ ๆ
    const base = new THREE.Color(opts.color != null ? opts.color : spec.hex);
    const peak = Math.max(base.r, base.g, base.b) || 1;
    const emit = base.clone().multiplyScalar(Math.min(2.4, (1 / peak) * 1.5));

    const MAX = 3200;
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

    // particle pool
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

    // แสงวาบเดียว ใช้ซ้ำ (ห้ามสร้าง PointLight ใหม่ต่อเหตุการณ์ — ทำ shader recompile ทั้งฉาก)
    const burstLight = new THREE.PointLight(base.getHex(), 0, 140, 2);
    burstLight.position.set(pos.x, pos.y, pos.z);
    scene.add(burstLight);
    let lightHold = 0, lightGlow = 0;
    function flash(intensity, hex) {
      if (hex != null) burstLight.color.setHex(hex);
      lightHold = Math.max(lightHold, intensity);        // แฟลชสั้น
      lightGlow = Math.max(lightGlow, intensity * 0.42); // เรืองค้าง
    }

    // ---- one primary burst ----
    function burst(cx, cy, cz, scale) {
      const N = Math.round((spark ? 240 : 190) * scale);
      const v0 = (spark ? 15 : 20) * (pat.spread || 1) * scale;
      for (let i = 0; i < N; i++) {
        const u = Math.random() * 2 - 1, ang = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(1 - u * u);
        const sp = v0 * (0.55 + Math.pow(Math.random(), 0.5) * 0.6);
        let r = emit.r, g = emit.g, b = emit.b;
        if (spark && Math.random() < 0.30) { r = 1.6; g = 1.4; b = 0.8; }          // สะเก็ดเงิน-ทอง
        else { const t = 0.82 + Math.random() * 0.32; r *= t; g *= t; b *= t; }
        makeStar(
          cx, cy, cz,
          rr * Math.cos(ang) * sp, u * sp, rr * Math.sin(ang) * sp,
          r, g, b,
          pat.life * (0.8 + Math.random() * 0.4),
          spark ? 0.16 : 0.11,                                                     // แรงต้านอากาศสูง (ยิ่งน้อย = ต้านมาก)
          pat.grav,
          {
            trail: pat.trailFrac > 0 && Math.random() < pat.trailFrac,
            breakIn: pat.breaks ? 0.55 + Math.random() * 0.4 : 0,
            cross: pat.cross
          }
        );
      }
      if (scale >= 1) burstLight.position.set(cx, cy, cz);
      flash(spark ? 15 : 11, spark ? 0xffffff : base.getHex());
    }

    // ---- multi-shell schedule (multi-break show) ----
    function defaultShells() {
      const main = { t: 0, s: 1.15 };
      if (spark) return [main, { t: 0.55, dx: -6, dz: 4, s: 0.5 }];
      if (pat.breaks) return [main, { t: 0.4, dx: 6, dz: -3, s: 0.42 }, { t: 0.85, dx: -7, dz: 4, s: 0.42 }];
      return [main, { t: 0.5, dx: -7, dz: 5, s: 0.5 }, { t: 0.95, dx: 7, dz: -4, s: 0.45 }];
    }
    const shells = opts.shells || defaultShells();

    let elapsed = 0, shellIdx = 0, aliveCount = 1;

    return {
      update(dt) {
        dt = Math.min(dt, 0.05);
        elapsed += dt;

        while (shellIdx < shells.length && elapsed >= shells[shellIdx].t) {
          const sh = shells[shellIdx++];
          burst(pos.x + (sh.dx || 0), pos.y + (sh.dy || 0), pos.z + (sh.dz || 0), sh.s || 1);
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

          // secondary break — เม็ดดาวจุดซ้ำเป็นพวงเล็ก / กากบาท
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
                  dx = r2 * Math.cos(aa) * s2; dy = uu * s2; dz = r2 * Math.sin(aa) * s2;
                }
                makeStar(p.x, p.y, p.z,
                  p.vx * 0.35 + dx, p.vy * 0.35 + dy, p.vz * 0.35 + dz,
                  p.r, p.g, p.b, 0.85 + Math.random() * 0.5, 0.10, p.grav * 1.1,
                  { kind: "spark", trail: Math.random() < 0.4 });
              }
            }
          }

          // glowing trails (willow / chrysanthemum)
          if (p.trail && p.kind === "star") {
            p.tacc += dt;
            const iv = 0.05;
            while (p.tacc >= iv) {
              p.tacc -= iv;
              const tp = alloc();
              if (tp) {
                tp.life = pat.gold ? 0.9 : 0.5; tp.max = tp.life;
                tp.x = p.x; tp.y = p.y; tp.z = p.z;
                tp.vx = p.vx * 0.12; tp.vy = p.vy * 0.12 - 0.4; tp.vz = p.vz * 0.12;
                if (pat.gold) { tp.r = 1.7; tp.g = 1.15; tp.b = 0.35; }             // หางทอง (willow)
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
        mat.size = 0.42 + 0.34 * Math.max(0, 1 - elapsed * 0.7);

        lightHold *= Math.pow(0.02, dt);      // แฟลชดับเร็ว
        lightGlow *= Math.pow(0.25, dt);      // เรืองค้างนานกว่า
        burstLight.intensity = lightHold + lightGlow;

        return (aliveCount > 0 || shellIdx < shells.length) && elapsed < 9;
      },
      dispose() {
        scene.remove(points);
        geo.dispose(); mat.dispose();
        scene.remove(burstLight);
      }
    };
  }

  window.Fireworks = {
    render, derived, detonate, state, PATTERNS,
    get SPECTRUM() { return SPEC(); },
    get COLORANTS() { return SPEC(); }   // ชื่อเดิม (vab3d.js อ้างอิงตรง ๆ)
  };
})();
