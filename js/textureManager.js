// js/textureManager.js — ระบบจัดการพื้นผิว (Phase 4)
//  - สร้าง "พื้นผิวจำลอง" (procedural) ด้วย <canvas> สำหรับ color / normal / roughness
//    เพื่อให้ชิ้นส่วนจรวดมีรายละเอียดพื้นผิวจริงก่อนที่จะมีไฟล์เทกซ์เจอร์ของจริง
//  - เตรียมวัสดุ MeshStandardMaterial 4 แบบ:
//      mat_bamboo  → บั้งไฟ (ไผ่)
//      mat_paper   → โคมลอย (กระดาษสา)
//      mat_metal   → จรวดวงโคจร (อะลูมิเนียม)
//      mat_solar   → ดาวเทียม (แผงโซลาร์เซลล์)
//  - เมื่อได้ไฟล์เทกซ์เจอร์จริงแล้ว เรียก TextureManager.loadInto(name, {colorUrl, normalUrl, roughnessUrl})
//    วัสดุจะสลับไปใช้ภาพจริงทันทีโดยไม่ต้องแก้ launch3d.js
//
//  ใช้ THREE (UMD global) — ต้องโหลดหลัง vendor/three/three.min.js และก่อน launch3d.js

(function () {
  "use strict";
  const T = () => window.THREE;

  let inited = false;
  const _tex = {};          // เทกซ์เจอร์ที่สร้าง/โหลด (สำหรับ dispose)
  const _mat = {};          // วัสดุพื้นฐาน 4 ตัว
  const _loader = { ref: null };

  // ---------- helpers ----------
  function mkCanvas(size) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    return c;
  }
  function srgb(tex) {
    const THREE = T();
    if (THREE.SRGBColorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
    else if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
    return tex;
  }
  function wrap(tex, rx, ry) {
    const THREE = T();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(rx || 1, ry || 1);
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }
  function canvasTexture(canvas, key) {
    const tex = new (T().CanvasTexture)(canvas);
    if (key) _tex[key] = tex;
    return tex;
  }
  // แปลง grayscale height → normal map (Sobel)
  function heightToNormal(heightCanvas, strength) {
    const s = strength == null ? 2.2 : strength;
    const n = heightCanvas.width;
    const src = heightCanvas.getContext("2d").getImageData(0, 0, n, n).data;
    const out = mkCanvas(n);
    const octx = out.getContext("2d");
    const img = octx.createImageData(n, n);
    const H = (x, y) => {
      x = (x + n) % n; y = (y + n) % n;
      return src[(y * n + x) * 4] / 255;
    };
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const dx = (H(x - 1, y) - H(x + 1, y)) * s;
        const dy = (H(x, y - 1) - H(x, y + 1)) * s;
        const len = Math.hypot(dx, dy, 1);
        const i = (y * n + x) * 4;
        img.data[i] = ((dx / len) * 0.5 + 0.5) * 255;
        img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
        img.data[i + 2] = (1 / len) * 0.5 * 255 + 128;
        img.data[i + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    return out;
  }
  function noiseFill(ctx, n, base, amp, alpha) {
    const img = ctx.getImageData(0, 0, n, n);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = base + (Math.random() - 0.5) * amp;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = alpha == null ? 255 : alpha;
    }
    ctx.putImageData(img, 0, 0);
  }

  // ---------- procedural surfaces ----------
  function bambooMaps() {
    const n = 256, col = mkCanvas(n), h = mkCanvas(n), rgh = mkCanvas(n);
    const cx = col.getContext("2d");
    // ลำไผ่ผ่าซีก: ไล่โทนเขียวอมเหลือง + เส้นเสี้ยนแนวตั้ง
    const grad = cx.createLinearGradient(0, 0, n, 0);
    grad.addColorStop(0, "#7c8a3e"); grad.addColorStop(0.5, "#a9b45c");
    grad.addColorStop(0.75, "#8f9a49"); grad.addColorStop(1, "#6f7a37");
    cx.fillStyle = grad; cx.fillRect(0, 0, n, n);
    cx.globalAlpha = 0.25;
    for (let i = 0; i < 90; i++) {
      cx.strokeStyle = Math.random() > 0.5 ? "#5c6a2c" : "#c7cf8a";
      cx.lineWidth = Math.random() * 1.6 + 0.3;
      const x = Math.random() * n;
      cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x + (Math.random() - 0.5) * 8, n); cx.stroke();
    }
    cx.globalAlpha = 1;
    // ปล้องไผ่ (node) แถบขวางเข้ม
    const hx = h.getContext("2d");
    hx.fillStyle = "#808080"; hx.fillRect(0, 0, n, n);
    noiseFill(hx, n, 128, 26);
    [0.18, 0.62].forEach(fy => {
      const y = fy * n;
      cx.fillStyle = "rgba(70,78,40,0.55)"; cx.fillRect(0, y - 4, n, 8);
      cx.fillStyle = "rgba(210,214,150,0.35)"; cx.fillRect(0, y - 6, n, 2);
      hx.fillStyle = "#ffffff"; hx.fillRect(0, y - 5, n, 3);
      hx.fillStyle = "#3a3a3a"; hx.fillRect(0, y + 1, n, 4);
    });
    const rx = rgh.getContext("2d");
    rx.fillStyle = "#b9b9b9"; rx.fillRect(0, 0, n, n);
    noiseFill(rx, n, 180, 60);
    return { col, normal: heightToNormal(h, 1.6), rgh };
  }

  function paperMaps() {
    const n = 256, col = mkCanvas(n), h = mkCanvas(n), rgh = mkCanvas(n);
    const cx = col.getContext("2d");
    cx.fillStyle = "#f3e7cf"; cx.fillRect(0, 0, n, n);
    // เส้นใยกระดาษสา (mulberry fiber) แบบสุ่มทิศ
    for (let i = 0; i < 220; i++) {
      cx.strokeStyle = `rgba(${170 + Math.random() * 40 | 0},${150 + Math.random() * 40 | 0},${110 + Math.random() * 40 | 0},0.35)`;
      cx.lineWidth = Math.random() * 1.4 + 0.2;
      const x = Math.random() * n, y = Math.random() * n, a = Math.random() * Math.PI, L = 10 + Math.random() * 40;
      cx.beginPath(); cx.moveTo(x, y);
      cx.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); cx.stroke();
    }
    // รอยด่างบาง ๆ
    for (let i = 0; i < 20; i++) {
      cx.fillStyle = `rgba(150,120,80,${0.03 + Math.random() * 0.05})`;
      const r = 10 + Math.random() * 40;
      cx.beginPath(); cx.arc(Math.random() * n, Math.random() * n, r, 0, 7); cx.fill();
    }
    const hx = h.getContext("2d");
    hx.fillStyle = "#808080"; hx.fillRect(0, 0, n, n);
    noiseFill(hx, n, 128, 40);
    const rx = rgh.getContext("2d");
    rx.fillStyle = "#e6e6e6"; rx.fillRect(0, 0, n, n);   // กระดาษ = ด้านมาก
    noiseFill(rx, n, 225, 40);
    return { col, normal: heightToNormal(hx.canvas, 1.1), rgh };
  }

  function metalMaps() {
    const n = 256, col = mkCanvas(n), h = mkCanvas(n), rgh = mkCanvas(n);
    const cx = col.getContext("2d");
    cx.fillStyle = "#c9ced6"; cx.fillRect(0, 0, n, n);
    // เส้นขัดผิว (brushed) แนวนอน
    cx.globalAlpha = 0.18;
    for (let i = 0; i < 260; i++) {
      cx.strokeStyle = Math.random() > 0.5 ? "#eef2f7" : "#9aa1ab";
      cx.lineWidth = Math.random() * 1.2 + 0.2;
      const y = Math.random() * n;
      cx.beginPath(); cx.moveTo(0, y); cx.lineTo(n, y + (Math.random() - 0.5) * 3); cx.stroke();
    }
    cx.globalAlpha = 1;
    // แนวเชื่อม/หมุดย้ำ (panel lines + rivets)
    const hx = h.getContext("2d");
    hx.fillStyle = "#888"; hx.fillRect(0, 0, n, n);
    noiseFill(hx, n, 136, 12);
    for (let gx = 0; gx <= n; gx += 64) {
      cx.strokeStyle = "rgba(90,96,104,0.5)"; cx.lineWidth = 1.5;
      cx.beginPath(); cx.moveTo(gx, 0); cx.lineTo(gx, n); cx.stroke();
      hx.fillStyle = "#555"; hx.fillRect(gx - 1, 0, 2, n);
      for (let ry = 12; ry < n; ry += 26) {
        cx.fillStyle = "rgba(80,86,94,0.6)";
        cx.beginPath(); cx.arc(gx, ry, 1.6, 0, 7); cx.fill();
        hx.fillStyle = "#c8c8c8"; hx.beginPath(); hx.arc(gx, ry, 2, 0, 7); hx.fill();
      }
    }
    const rx = rgh.getContext("2d");
    rx.fillStyle = "#6f6f6f"; rx.fillRect(0, 0, n, n);   // โลหะขัด = มัน
    noiseFill(rx, n, 105, 44);
    return { col, normal: heightToNormal(hx.canvas, 2.4), rgh };
  }

  function solarMaps() {
    const n = 256, col = mkCanvas(n), h = mkCanvas(n), rgh = mkCanvas(n);
    const cx = col.getContext("2d");
    cx.fillStyle = "#0b1f4d"; cx.fillRect(0, 0, n, n);
    const hx = h.getContext("2d");
    hx.fillStyle = "#7a7a7a"; hx.fillRect(0, 0, n, n);
    const cell = 32, gap = 3;
    for (let y = 0; y < n; y += cell) {
      for (let x = 0; x < n; x += cell) {
        const g = cx.createLinearGradient(x, y, x + cell, y + cell);
        g.addColorStop(0, "#163a8a"); g.addColorStop(0.5, "#1e49aa"); g.addColorStop(1, "#0f2f74");
        cx.fillStyle = g;
        cx.fillRect(x + gap, y + gap, cell - gap * 2, cell - gap * 2);
        hx.fillStyle = "#cfcfcf"; hx.fillRect(x + gap, y + gap, cell - gap * 2, cell - gap * 2);
        // busbar เส้นเงิน
        cx.strokeStyle = "rgba(200,214,235,0.5)"; cx.lineWidth = 1;
        cx.beginPath();
        cx.moveTo(x + cell / 2, y + gap); cx.lineTo(x + cell / 2, y + cell - gap); cx.stroke();
      }
    }
    const rx = rgh.getContext("2d");
    rx.fillStyle = "#4a4a4a"; rx.fillRect(0, 0, n, n);   // กระจก = มันมาก
    for (let y = 0; y < n; y += cell) for (let x = 0; x < n; x += cell) {
      rx.fillStyle = "#2a2a2a"; rx.fillRect(x + gap, y + gap, cell - gap * 2, cell - gap * 2);
    }
    return { col, normal: heightToNormal(hx.canvas, 1.4), rgh };
  }

  // ---------- build materials ----------
  function buildMaterial(name, maps, params, repeat) {
    const THREE = T();
    const rx = repeat ? repeat[0] : 1, ry = repeat ? repeat[1] : 1;
    const map = wrap(srgb(canvasTexture(maps.col, name + "_col")), rx, ry);
    const normalMap = wrap(canvasTexture(maps.normal, name + "_nrm"), rx, ry);
    const roughnessMap = wrap(canvasTexture(maps.rgh, name + "_rgh"), rx, ry);
    const mat = new THREE.MeshStandardMaterial(Object.assign({
      map, normalMap, roughnessMap
    }, params));
    if (mat.normalScale) mat.normalScale.set(1, 1);
    mat.userData.tmName = name;
    _mat[name] = mat;
    return mat;
  }

  function init() {
    if (inited) return window.TextureManager;
    const THREE = T();
    if (!THREE) { console.warn("[TextureManager] THREE not loaded"); return null; }

    buildMaterial("mat_bamboo", bambooMaps(),
      { roughness: 0.72, metalness: 0.02, color: 0xffffff }, [1, 2]);
    buildMaterial("mat_paper", paperMaps(),
      { roughness: 0.92, metalness: 0.0, color: 0xfff3dd, emissive: 0x1a0e00, emissiveIntensity: 0.0 }, [1, 1]);
    buildMaterial("mat_metal", metalMaps(),
      { roughness: 0.38, metalness: 0.92, color: 0xd7dbe2, envMapIntensity: 1.1 }, [1, 3]);
    buildMaterial("mat_solar", solarMaps(),
      { roughness: 0.22, metalness: 0.55, color: 0x9fb4e6, emissive: 0x0a1a44, emissiveIntensity: 0.35 }, [2, 1]);

    inited = true;
    return window.TextureManager;
  }

  // ---------- API ----------
  function material(name) { return _mat[name] || _mat.mat_metal || null; }
  function clone(name) {
    const m = material(name);
    return m ? m.clone() : new (T().MeshStandardMaterial)({ color: 0xcccccc, roughness: 0.6 });
  }
  function apply(name, opts) {
    const m = _mat[name];
    if (!m || !opts) return;
    ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap"].forEach(k => {
      if (opts[k]) { m[k] = opts[k]; _tex[name + "_" + k] = opts[k]; }
    });
    m.needsUpdate = true;
  }
  // โหลดไฟล์เทกซ์เจอร์จริงเมื่อพร้อม (color/normal/roughness)
  function loadInto(name, urls, onDone) {
    const THREE = T();
    if (!THREE || !_mat[name]) return;
    if (!_loader.ref) _loader.ref = new THREE.TextureLoader();
    const L = _loader.ref;
    const jobs = [];
    const set = (slot, url, isColor) => {
      if (!url) return;
      jobs.push(new Promise(res => {
        L.load(url, tex => {
          wrap(tex, _mat[name].map ? _mat[name].map.repeat.x : 1, _mat[name].map ? _mat[name].map.repeat.y : 1);
          if (isColor) srgb(tex);
          _mat[name][slot] = tex;
          _tex[name + "_" + slot + "_real"] = tex;
          res();
        }, undefined, () => res());
      }));
    };
    set("map", urls.colorUrl, true);
    set("normalMap", urls.normalUrl, false);
    set("roughnessMap", urls.roughnessUrl, false);
    Promise.all(jobs).then(() => { _mat[name].needsUpdate = true; onDone && onDone(name); });
  }
  function dispose() {
    Object.values(_tex).forEach(t => t && t.dispose && t.dispose());
    Object.values(_mat).forEach(m => m && m.dispose && m.dispose());
    Object.keys(_tex).forEach(k => delete _tex[k]);
    Object.keys(_mat).forEach(k => delete _mat[k]);
    inited = false;
  }

  window.TextureManager = {
    init, dispose, material, get: material, clone, apply, loadInto,
    ready: () => inited,
    names: () => Object.keys(_mat)
  };
})();
