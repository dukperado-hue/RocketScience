// js/fireworks.js — Phase 8 · หัวพลุเฉลิมฉลอง (Firework Payload) + เคมีการทดสอบเปลวไฟ
//
//   Tier 1–3 ติด "หัวพลุ" เสริมได้ 1 หัว แล้วเลือกสารให้สี (flame test):
//     Sr แดง · Ba เขียว · Cu น้ำเงิน · Na เหลือง · Mg ขาว/ประกาย
//   เมื่อจรวดถึงจุดสูงสุด (vy ≤ 0) หัวพลุจุดระเบิดเป็นอนุภาค THREE.Points ในฉากปล่อย
//   สี THREE.Color ตรงกับสารที่เลือก และเรืองผ่าน UnrealBloomPass ของฉากเดิม
//
//   window.Fireworks.render(hostEl, onChange)   — แผงเลือกใน VAB
//   window.Fireworks.derived()                  — { enabled, colorant, color, spark, scoreBonus }
//   window.Fireworks.state                      — { enabled, colorant }
//   window.Fireworks.detonate(THREE, scene, posVec3, opts) -> { update(dt), dispose() }

(function () {
  "use strict";

  // สเปกตรัมการทดสอบเปลวไฟ (flame test) — โลหะ → สีเปลว
  const COLORANTS = {
    strontium: { th: "สตรอนเชียม", el: "Sr", hex: 0xff2d2d, flame: "แดงเข้ม",
      note: "Sr²⁺ เปล่งแสงช่วงแดง 605–682 nm — สีพลุคลาสสิก" },
    barium:    { th: "แบเรียม",    el: "Ba", hex: 0x37e06a, flame: "เขียว",
      note: "BaCl เปล่งเขียว ~515 nm ต้องคุมให้เป็นคลอไรด์" },
    copper:    { th: "ทองแดง",     el: "Cu", hex: 0x2fa8ff, flame: "น้ำเงิน–เขียว",
      note: "CuCl ให้ฟ้า ~450 nm ทำยากสุด ร้อนไปสีเพี้ยน" },
    sodium:    { th: "โซเดียม",    el: "Na", hex: 0xffd23b, flame: "เหลืองสว่าง",
      note: "เส้น D ของ Na 589 nm สว่างจัดจนกลบสีอื่น" },
    magnesium: { th: "แมกนีเซียม", el: "Mg", hex: 0xf4f7ff, flame: "ขาว + ประกาย",
      note: "เผาไหม้ร้อนจัด เปล่งแสงขาวเต็มสเปกตรัม + สะเก็ดไฟ", spark: true }
  };

  const SCORE_BONUS = 250;

  const state = { enabled: false, colorant: "strontium" };
  let _onChange = null;

  function notify() { if (_onChange) { try { _onChange(); } catch (e) { console.warn("[Fireworks] onChange", e); } } }

  function derived() {
    const c = COLORANTS[state.colorant] || COLORANTS.strontium;
    return {
      enabled: state.enabled, colorant: state.colorant,
      color: c.hex, spark: !!c.spark, flame: c.flame,
      scoreBonus: state.enabled ? SCORE_BONUS : 0, massAdd: 0
    };
  }

  // -------- UI (VAB) --------
  function hx(n) { return "#" + (n >>> 0).toString(16).padStart(6, "0"); }

  function render(host, onChange) {
    _onChange = onChange || _onChange;
    if (!host) return;
    host.hidden = false;
    const c = COLORANTS[state.colorant] || COLORANTS.strontium;
    host.innerHTML = `
      <div class="vx-title">หัวพลุเฉลิมฉลอง <span class="vx-tag">FLAME TEST</span></div>
      <label class="fw-toggle">
        <input type="checkbox" id="fw-on" ${state.enabled ? "checked" : ""}>
        ติดหัวพลุ — จุดระเบิดสีตอนถึงจุดสูงสุด (apogee)
      </label>
      <div class="fw-body" ${state.enabled ? "" : "hidden"}>
        <div class="vx-label">สารให้สี (โลหะทดสอบเปลวไฟ)</div>
        <div class="fw-swatches">
          ${Object.keys(COLORANTS).map(k => {
            const o = COLORANTS[k];
            return `<button type="button" class="fw-sw${state.colorant === k ? " on" : ""}" data-fw="${k}">
              <span class="fw-dot" style="background:${hx(o.hex)}"></span>
              <span class="fw-sw-th">${o.th} <em>${o.el}</em></span>
              <small>${o.flame}</small></button>`;
          }).join("")}
        </div>
        <div class="vx-hint">${c.el} → เปลว${c.flame}. ${c.note}</div>
      </div>`;

    const on = host.querySelector("#fw-on");
    if (on) on.addEventListener("change", e => { state.enabled = e.target.checked; render(host); notify(); });
    host.querySelectorAll("[data-fw]").forEach(b =>
      b.addEventListener("click", () => { state.colorant = b.dataset.fw; render(host); notify(); }));
  }

  // -------- particle burst (ฉากปล่อย 3 มิติ) --------
  let _sprite = null;
  function sprite(THREE) {
    if (_sprite) return _sprite;
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    _sprite = new THREE.CanvasTexture(c);
    return _sprite;
  }

  function detonate(THREE, scene, pos, opts) {
    opts = opts || {};
    const col = new THREE.Color(opts.color != null ? opts.color : 0xff2d2d);
    const spark = !!opts.spark;
    const N = spark ? 720 : 540;
    const base = spark ? 11 : 15;         // ความเร็วกระจายฐาน (หน่วยฉาก/วิ)

    const geo = new THREE.BufferGeometry();
    const posArr = new Float32Array(N * 3);
    const colArr = new Float32Array(N * 3);
    const vel = new Array(N);
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1, ang = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(1 - u * u);
      const sp = base * (0.3 + Math.pow(Math.random(), 0.6) * 0.9);
      vel[i] = new THREE.Vector3(rr * Math.cos(ang) * sp, u * sp, rr * Math.sin(ang) * sp);
      posArr[i * 3] = pos.x; posArr[i * 3 + 1] = pos.y; posArr[i * 3 + 2] = pos.z;
      // แต้มสีให้แต่ละเม็ดเหลื่อมกันนิดหน่อย (Mg = ขาวอมสีสุ่ม)
      const tint = 0.75 + Math.random() * 0.25;
      if (spark && Math.random() < 0.25) {
        colArr[i * 3] = 1; colArr[i * 3 + 1] = 0.85 + Math.random() * 0.15; colArr[i * 3 + 2] = 0.6;
      } else {
        colArr[i * 3] = col.r * tint; colArr[i * 3 + 1] = col.g * tint; colArr[i * 3 + 2] = col.b * tint;
      }
    }
    geo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colArr, 3));

    const mat = new THREE.PointsMaterial({
      size: spark ? 0.55 : 0.75, map: sprite(THREE), vertexColors: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      opacity: 1, sizeAttenuation: true
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    scene.add(pts);

    // แสงวาบให้ bloom จับ
    const light = new THREE.PointLight(col.getHex(), 7, 70, 2);
    light.position.copy(pos);
    scene.add(light);

    let life = 0;
    const MAX = spark ? 2.7 : 2.2;
    const size0 = mat.size;

    return {
      update(dt) {
        life += dt;
        if (life >= MAX) return false;
        const k = life / MAX;
        const drag = Math.pow(spark ? 0.16 : 0.1, dt);   // แรงต้านอากาศสูง — เม็ดพลุชะลอเร็ว
        for (let i = 0; i < N; i++) {
          const v = vel[i];
          v.multiplyScalar(drag);
          v.y -= 8.5 * dt;
          posArr[i * 3] += v.x * dt;
          posArr[i * 3 + 1] += v.y * dt;
          posArr[i * 3 + 2] += v.z * dt;
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = Math.max(0, 1 - k * k);
        mat.size = size0 * (1 + k * (spark ? 1.8 : 0.9)) * (spark ? (0.55 + Math.random() * 0.8) : 1);
        light.intensity = 7 * (1 - k) * (1 - k);
        return true;
      },
      dispose() {
        scene.remove(pts); scene.remove(light);
        geo.dispose(); mat.dispose();
      }
    };
  }

  window.Fireworks = { render, derived, detonate, state, COLORANTS };
})();
