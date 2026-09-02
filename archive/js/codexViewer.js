// js/codexViewer.js — Phase 9 · โชว์รูม 3 มิติของหอจดหมายเหตุ
//   ใช้สถาปัตยกรรมเดียวกับ js/vab3d.js: WebGLRenderer ของตัวเอง + กล้องวงโคจร
//   + ปลด GL context จริง ๆ ตอน unmount (forceContextLoss) กัน memory leak
//   เพิ่ม "แสงพิพิธภัณฑ์": แท่นเรืองแสง + สปอตไลต์ + พื้นกริด
//
//   window.CodexViewer.mount(hostEl)   -> bool  (false ถ้า WebGL ใช้ไม่ได้)
//   window.CodexViewer.show(entry)     -> สร้าง/เปลี่ยนวัตถุที่โชว์
//   window.CodexViewer.unmount()       -> คืนทรัพยากร GL (เรียกตอนปิดโมดัล/เปลี่ยนหน้า)

(function () {
  "use strict";
  const T = () => window.THREE;

  let renderer = null, scene = null, camera = null, raf = 0, host = null, canvas = null;
  let root = null, pedestal = null, ringMesh = null;
  let mounted = false, started = false, alive = false, webglFailed = false;
  let curId = "", spin = true, glowT = 0;

  const cam = { theta: 0.85, phi: 1.05, dist: 8, tgt: null, distGoal: 8 };
  let drag = 0, lastX = 0, lastY = 0;

  const V3 = (x, y, z) => new (T().Vector3)(x, y || 0, z || 0);
  function M(hex, o) {
    o = o || {};
    return new (T().MeshStandardMaterial)({
      color: hex, roughness: o.rough != null ? o.rough : 0.7, metalness: o.metal != null ? o.metal : 0.08,
      emissive: o.emis != null ? o.emis : 0x000000, emissiveIntensity: o.emisI != null ? o.emisI : 1,
      transparent: !!o.transparent, opacity: o.opacity != null ? o.opacity : 1,
      side: o.side || T().FrontSide
    });
  }
  function Basic(hex, o) {
    o = o || {};
    return new (T().MeshBasicMaterial)({ color: hex, toneMapped: false,
      transparent: !!o.transparent, opacity: o.opacity != null ? o.opacity : 1 });
  }

  // ---------- scene ----------
  function ensureScene() {
    if (started) return;
    started = true;
    const THREE = T();
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
      if (!renderer.getContext()) throw new Error("no gl context");
    } catch (e) {
      console.warn("[CodexViewer] WebGL unavailable", e);
      webglFailed = true; started = false; renderer = null;
      return;
    }
    alive = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05060b, 0.028);

    camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    cam.tgt = new THREE.Vector3(0, 1.2, 0);

    // ---- museum lighting (นุ่ม ๆ ไม่ให้วัตถุขาวโพลน) ----
    scene.add(new THREE.HemisphereLight(0x2c3a58, 0x05060b, 0.3));
    const key = new THREE.SpotLight(0xfff2df, 1.9, 44, Math.PI / 7, 0.55, 1.5);
    key.position.set(6, 10, 6); scene.add(key); scene.add(key.target);
    const fill = new THREE.SpotLight(0x9fc0ff, 0.85, 44, Math.PI / 6, 0.6, 1.5);
    fill.position.set(-7, 6, -4); scene.add(fill); scene.add(fill.target);
    const back = new THREE.PointLight(0x6aa8ff, 0.6, 26); back.position.set(0, 4, -9); scene.add(back);

    // ---- glowing pedestal ----
    pedestal = new THREE.Group();
    const colM = M(0x141620, { rough: 0.5, metal: 0.4 });
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.7, 0.55, 44), colM);
    col.position.y = -0.28; pedestal.add(col);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.08, 44), M(0x0c0d14, { rough: 0.3, metal: 0.6 }));
    top.position.y = 0.04; pedestal.add(top);
    ringMesh = new THREE.Mesh(new THREE.TorusGeometry(1.46, 0.028, 10, 64), Basic(0x5cc8ff, { transparent: true }));
    ringMesh.rotation.x = Math.PI / 2; ringMesh.position.y = 0.09; pedestal.add(ringMesh);
    const pGlow = new THREE.PointLight(0x4fc3ff, 1.7, 9, 2); pGlow.position.y = 0.35; pedestal.add(pGlow);
    const grid = new THREE.GridHelper(30, 30, 0x24304a, 0x151d2c);
    grid.material.transparent = true; grid.material.opacity = 0.4; grid.position.y = -0.55;
    pedestal.add(grid);
    scene.add(pedestal);

    root = new THREE.Group();
    root.position.y = 0.12;                 // วางบนผิวแท่น
    scene.add(root);

    bindPointer();
    resize();
    window.addEventListener("resize", resize);
    loop();
  }

  function resize() {
    if (!renderer || !host || !canvas || !canvas.parentElement) return;
    const w = host.clientWidth || 480, h = host.clientHeight || 360;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function bindPointer() {
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", e => {
      canvas.setPointerCapture(e.pointerId);
      drag = (e.button === 2 || e.shiftKey || e.button === 1) ? 2 : 1;
      lastX = e.clientX; lastY = e.clientY; spin = false;
    });
    canvas.addEventListener("pointermove", e => {
      if (!drag) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      if (drag === 1) {
        cam.theta -= dx * 0.008;
        cam.phi = Math.max(0.2, Math.min(Math.PI - 0.15, cam.phi - dy * 0.008));
      } else {
        const s = cam.dist * 0.0016;
        const right = V3(Math.cos(cam.theta), 0, -Math.sin(cam.theta));
        cam.tgt.addScaledVector(right, -dx * s);
        cam.tgt.y = Math.max(0.2, Math.min(5, cam.tgt.y + dy * s));
      }
    });
    const end = e => { drag = 0; try { canvas.releasePointerCapture(e.pointerId); } catch (x) {} };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("wheel", e => {
      e.preventDefault();
      cam.distGoal = Math.max(2.5, Math.min(26, cam.distGoal * (1 + Math.sign(e.deltaY) * 0.12)));
    }, { passive: false });
    canvas.addEventListener("contextmenu", e => e.preventDefault());
    canvas.addEventListener("dblclick", () => { spin = true; cam.theta = 0.85; cam.phi = 1.05; frameArtifact(); });
  }

  let lastW = 0, lastH = 0;
  function loop() {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    if (!renderer || !scene || !camera) return;
    if (!host || !host.offsetParent) return;    // แผงรายละเอียดถูกซ่อน — พักการเรนเดอร์ (คง context ไว้)
    const cw = host ? host.clientWidth : 0, ch = host ? host.clientHeight : 0;
    if (cw && ch && (Math.abs(cw - lastW) > 1 || Math.abs(ch - lastH) > 1)) { lastW = cw; lastH = ch; resize(); }
    cam.dist += (cam.distGoal - cam.dist) * 0.16;
    const st = Math.sin(cam.phi), ct = Math.cos(cam.phi);
    camera.position.set(
      cam.tgt.x + cam.dist * st * Math.sin(cam.theta),
      cam.tgt.y + cam.dist * ct,
      cam.tgt.z + cam.dist * st * Math.cos(cam.theta)
    );
    camera.lookAt(cam.tgt);
    if (spin && root) root.rotation.y += 0.005;
    glowT += 0.03;
    if (ringMesh) ringMesh.material.opacity = 0.75 + Math.sin(glowT) * 0.25;
    renderer.render(scene, camera);
  }

  // ---------- artifact ----------
  function clearArtifact() {
    if (!root) return;
    root.traverse(o => {
      if (o.geometry) { try { o.geometry.dispose(); } catch (e) {} }
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { try { m.dispose && m.dispose(); } catch (e) {} });
    });
    root.clear();
    root.rotation.set(0, 0, 0);
  }

  function frameArtifact() {
    if (!root || !camera) return;
    const THREE = T();
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 2;
    cam.tgt.set(0, Math.max(0.6, c.y), 0);
    cam.distGoal = maxDim * 2.0 + 1.6;
    cam.dist = cam.distGoal * 1.15;
  }

  // ===== procedural builders (ภาษาภาพเดียวกับ vab3d.js) =====
  const BUILD = {
    khom() {
      const THREE = T(), g = new THREE.Group();
      const KR = 1.1, KH = 2.7;
      const paper = M(0xf3dcae, { rough: 0.95, transparent: true, opacity: 0.72, side: THREE.DoubleSide, emis: 0xff7b2e, emisI: 0.85 });
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(KR * 1.04, KR, KH, 30, 1, true), paper);
      shell.position.y = 0.28 + KH / 2; g.add(shell);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(KR * 1.04, 26, 10, 0, 6.2832, 0, Math.PI / 2), paper.clone());
      dome.position.y = 0.28 + KH; dome.scale.y = 0.44; g.add(dome);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(KR * 1.03, 0.04, 8, 30), M(0x8a6a3a, { metal: 0.3 }));
      rim.rotation.x = Math.PI / 2; rim.position.y = 0.28; g.add(rim);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), Basic(0xffaa00));
      core.material.color.setRGB(3, 1.4, 0.4); core.position.y = 0.5; g.add(core);
      const lamp = new THREE.PointLight(0xff8a3a, 3, 8, 2); lamp.position.y = 0.55; g.add(lamp);
      return g;
    },
    firework() {
      const THREE = T(), g = new THREE.Group();
      const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 26, 20), M(0x8a3a2c, { rough: 0.85 }));
      shell.scale.y = 1.14; shell.position.y = 1.1; g.add(shell);
      const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 8, 26), M(0xcaa24a, { rough: 0.7 }));
      band.rotation.x = Math.PI / 2; band.position.y = 1.1; g.add(band);
      const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), M(0x2b2b2b, { rough: 1 }));
      fuse.position.set(0.18, 2.4, 0); fuse.rotation.z = 0.35; g.add(fuse);
      // ประกายสี (แสดงหลักการ flame-test)
      [[1.4, -0.2, 2, 2.6, 0.4], [-1.5, 1.5, 0.5, 0.5, 2.6], [0.3, 1.9, -1.4, 2.4, 2.4]].forEach(v => {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), Basic(0xffffff));
        s.material.color.setRGB(v[3], v[4], 0.5); s.position.set(v[0], 1.1 + v[1], v[2]); g.add(s);
      });
      return g;
    },
    bangfai() {
      const THREE = T(), g = new THREE.Group();
      const BR = 0.28, BH = 3.4;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(BR, BR, BH, 22), M(0xb98f57, { rough: 0.8 }));
      body.position.y = 0.3 + BH / 2; g.add(body);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(BR * 1.03, BR * 2, 20), M(0x6b4f2e, { rough: 0.85 }));
      cap.position.y = 0.3 + BH + BR * 0.9; g.add(cap);
      for (let i = 0; i < 4; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(BR + 0.03, 0.045, 6, 18), M(0x3a2c1c, { rough: 1 }));
        ring.rotation.x = Math.PI / 2; ring.position.y = 0.6 + i * (BH - 1) / 3; g.add(ring);
      }
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 5.4, 8), M(0xb08a4e, { rough: 0.8 }));
      tail.position.set(BR + 0.14, 0.3 + 1.0 - 5.4 * 0.4, 0.05); tail.rotation.x = 0.12; g.add(tail);
      return g;
    },
    talai(scale) {
      const THREE = T(), g = new THREE.Group();
      const wd = 1.5 * (scale || 1), HUB = 1.0;
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.32 * (scale || 1), 0.32 * (scale || 1), 1.4, 18), M(0xb98f57, { rough: 0.8 }));
      hub.position.y = HUB; g.add(hub);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.32 * (scale || 1), 0.5, 16), M(0x6b4f2e, { rough: 0.85 }));
      cap.position.y = HUB + 0.95; g.add(cap);
      const rimM = M(0x8a6a3a, { rough: 0.85 });
      const rim = new THREE.Mesh(new THREE.TorusGeometry(wd, 0.12, 14, 60), rimM);
      rim.rotation.x = Math.PI / 2; rim.position.y = HUB; g.add(rim);
      const rin = new THREE.Mesh(new THREE.TorusGeometry(wd * 0.56, 0.05, 10, 44), rimM.clone());
      rin.rotation.x = Math.PI / 2; rin.position.y = HUB; g.add(rin);
      for (let k = 0; k < 4; k++) {
        const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, wd * 2, 8), M(0x7a5a34, { rough: 0.9 }));
        sp.rotation.z = Math.PI / 2; sp.rotation.y = k * Math.PI / 2; sp.position.y = HUB; g.add(sp);
      }
      return g;
    },
    talai_giant() { return BUILD.talai(2.1); },
    asteroid() {
      const THREE = T(), g = new THREE.Group();
      const geo = new THREE.IcosahedronGeometry(1.6, 4);
      const pos = geo.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const n = 1
          + 0.22 * Math.sin(v.x * 2.7) * Math.cos(v.y * 2.1)
          + 0.16 * Math.sin(v.y * 4.3 + 1.0) * Math.sin(v.z * 3.1)
          + 0.10 * Math.cos(v.z * 6.0 + v.x * 2.0);
        v.multiplyScalar(Math.max(0.65, n));
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();
      const rock = new THREE.Mesh(geo, M(0x5a534a, { rough: 0.99, metal: 0.02 }));
      rock.position.y = 1.7; g.add(rock);
      // หลุมอุกกาบาตเล็ก ๆ (ก้อนหินเข้ม)
      for (let i = 0; i < 7; i++) {
        const a = i * 2.399, r = 1.55;
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.12 + Math.random() * 0.18, 10, 8), M(0x3c372f, { rough: 1 }));
        b.position.set(Math.cos(a) * r * 0.7, 1.7 + Math.sin(a * 1.7) * 1.0, Math.sin(a) * r * 0.7);
        g.add(b);
      }
      return g;
    },
    wanhu() {
      const THREE = T(), g = new THREE.Group();
      const woodM = M(0x8a5a2e, { rough: 0.85 });
      // เก้าอี้ไม้
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 1.5), woodM);
      seat.position.y = 1.0; g.add(seat);
      const backR = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 0.14), woodM.clone());
      backR.position.set(0, 1.7, -0.68); g.add(backR);
      [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]].forEach(p => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.0, 0.16), woodM.clone());
        leg.position.set(p[0], 0.5, p[1]); g.add(leg);
      });
      // บั้งไฟผูกใต้เก้าอี้ (ตัวแทน 47 อัน — เอา 12 พอเห็น)
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2, r = 0.55;
        const bf = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 8), M(0xb98f57, { rough: 0.8 }));
        bf.position.set(Math.cos(a) * r, 0.35, Math.sin(a) * r); g.add(bf);
        const spark = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.4, 8), Basic(0xffffff));
        spark.material.color.setRGB(2.4, 1.3, 0.4);
        spark.position.set(Math.cos(a) * r, -0.35, Math.sin(a) * r); spark.rotation.x = Math.PI; g.add(spark);
      }
      const lamp = new THREE.PointLight(0xff7b2e, 2.4, 7, 2); lamp.position.y = -0.1; g.add(lamp);
      return g;
    }
  };

  function buildProcedural(ref) {
    const b = BUILD[ref] || BUILD.firework;
    const obj = b();
    root.add(obj);
    frameArtifact();
  }

  function buildGlb(entry) {
    const thisId = entry.id;
    if (!window.ModelManager) { buildProcedural(entry.fallbackKind || "firework"); return; }
    window.ModelManager.load(entry.modelRef, {
      kind: entry.fallbackKind || "probe", size: 2.6, anchor: "bottom",
      envMapIntensity: 0.7
    }).then(m => {
      if (!m || curId !== thisId || !root) return;
      // ดาวเคราะห์น้อย = ผิวหินเข้ม (โมเดล NASA มักไม่มีเทกซ์เจอร์ → ขาวโพลน)
      if (entry.fallbackKind === "asteroid") {
        m.traverse(o => {
          if (o.isMesh && o.material) {
            (Array.isArray(o.material) ? o.material : [o.material]).forEach(mm => {
              mm.color && mm.color.setHex(0x585049); mm.roughness = 0.98; mm.metalness = 0.02;
              if (mm.map) { mm.map = null; }
              mm.needsUpdate = true;
            });
          }
        });
      }
      root.add(m);
      frameArtifact();
    }).catch(e => {
      console.warn("[CodexViewer] glb load", e);
      if (curId === thisId) buildProcedural(entry.fallbackKind || "probe");
    });
  }

  // ---------- public ----------
  function mount(hostEl) {
    if (!T()) return false;
    host = hostEl;
    canvas = host.querySelector("#codex-canvas");
    if (!canvas) return false;
    ensureScene();
    if (webglFailed || !renderer) { mounted = false; return false; }
    mounted = true;
    resize();
    return true;
  }

  function show(entry) {
    if (!mounted || webglFailed || !entry) return;
    resize();
    curId = entry.id;
    spin = true;
    cam.theta = 0.85; cam.phi = 1.05;
    clearArtifact();
    if (entry.modelType === "glb") buildGlb(entry);
    else buildProcedural(entry.modelRef);
  }

  function unmount() {
    alive = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    window.removeEventListener("resize", resize);
    if (renderer) {
      try {
        scene && scene.traverse(o => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose && m.dispose());
        });
        renderer.dispose();
        renderer.forceContextLoss && renderer.forceContextLoss();
      } catch (e) {}
    }
    renderer = scene = camera = root = pedestal = ringMesh = null;
    mounted = false; started = false; curId = "";
  }

  window.CodexViewer = { mount, show, unmount };
})();
