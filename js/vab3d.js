// js/vab3d.js — Phase 7 · โรงประกอบจรวดแบบ 3 มิติ อินเทอร์แอกทีฟ
//   แรงบันดาลใจ: "Rocket 3D Explorer" — พิพิธภัณฑ์ยานอวกาศแบบโต้ตอบได้
//
//   • ฉาก Three.js เฉพาะหน้า VAB + กล้องวงโคจร (ลากหมุน / สกรอลล์ซูม / ลากสองนิ้วแพน)
//   • โมเดลอัปเดตสด: เปลี่ยนสไลเดอร์ในแผงข้าง ๆ แล้วโมเดล 3 มิติเปลี่ยนตาม
//   • โหมด "แยกชิ้นส่วน" (Exploded / X-Ray) — ลำโปร่งแสง เห็นดินขับ 3 ชั้น + รูประทุทรงกรวยที่ผู้เล่นออกแบบ
//   • ชี้เมาส์ที่ชิ้นส่วน → ไฮไลต์ (emissive) + ทูลทิป HTML บอกสเปกภาษาไทย
//
//   window.VAB3D.mount(hostEl)          — สร้างฉาก (เรียกครั้งเดียว)
//   window.VAB3D.show(rocket)           — สร้าง/อัปเดตโมเดลตามจรวด (โครงสร้างเปลี่ยน = rebuild)
//   window.VAB3D.refresh(rocket)        — อัปเดตพารามิเตอร์สด (สไลเดอร์)
//   window.VAB3D.toggleExploded() / setExploded(bool)
//   window.VAB3D.unmount()              — คืนทรัพยากร GL (เรียกก่อนออกจากหน้า VAB)

(function () {
  "use strict";
  const T = () => window.THREE;

  let renderer = null, scene = null, camera = null, raf = 0, host = null, canvas = null, tipEl = null, btnEl = null;
  let root = null, internals = null;
  let mounted = false, started = false, alive = false;
  let exploded = false, explodeT = 0;             // 0..1 (eased)
  let curKey = "", curRocket = null;

  const parts = [];                                // { mesh, name, stat, home:Vec3, ex:Vec3, mat, baseEmis, ghost }
  const disposables = [];

  // กล้องวงโคจร (พิกัดทรงกลมรอบ target)
  const cam = { theta: 0.7, phi: 1.12, dist: 15, tgt: null, distGoal: 15 };
  let dragMode = 0;                                 // 0 none, 1 orbit, 2 pan
  let lastX = 0, lastY = 0, lastW = 0, lastH = 0;
  const ray = { rc: null, ndc: null };
  let hovered = null;

  // ---------- helpers ----------
  function mat(hex, o) {
    o = o || {};
    const m = new (T().MeshStandardMaterial)({
      color: hex, roughness: o.rough != null ? o.rough : 0.72, metalness: o.metal || 0,
      transparent: !!o.transparent, opacity: o.opacity != null ? o.opacity : 1,
      side: o.side || T().FrontSide, emissive: o.emis != null ? o.emis : 0x000000,
      emissiveIntensity: o.emisI != null ? o.emisI : 1
    });
    disposables.push(m);
    return m;
  }
  function geo(g) { disposables.push(g); return g; }
  const V3 = (x, y, z) => new (T().Vector3)(x, y || 0, z || 0);

  // ผูกชิ้นส่วนเข้าระบบไฮไลต์ + ทูลทิป + แยกชิ้นส่วน
  function tag(mesh, name, stat, exOff, opt) {
    opt = opt || {};
    mesh.userData.tip = { name, stat };
    const rec = {
      mesh, name, stat,
      home: mesh.position.clone(),
      ex: exOff ? exOff.clone() : V3(0, 0, 0),
      mat: mesh.material,
      baseEmis: mesh.material.emissive ? mesh.material.emissive.getHex() : 0,
      baseOpacity: mesh.material.opacity,
      ghost: !!opt.ghost                            // ลำ/เปลือก — โปร่งแสงตอนแยกชิ้นส่วน
    };
    parts.push(rec);
    return mesh;
  }

  function clearModel() {
    parts.length = 0;
    hovered = null;
    while (disposables.length) { const d = disposables.pop(); try { d.dispose && d.dispose(); } catch (e) {} }
    if (root) {
      root.traverse(o => {
        if (o.geometry) { try { o.geometry.dispose(); } catch (e) {} }
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { try { m.dispose && m.dispose(); } catch (e) {} });
      });
      scene.remove(root);
    }
    root = new (T().Group)();
    internals = new (T().Group)();
    internals.visible = false;
    root.add(internals);
    scene.add(root);
  }

  // ---------- scene ----------
  let webglFailed = false;
  function ensureScene() {
    if (started) return;
    started = true;
    const THREE = T();
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
      if (!renderer.getContext()) throw new Error("no gl context");
    } catch (e) {
      console.warn("[VAB3D] WebGL unavailable — ใช้มุมมองกริดแทน", e);
      webglFailed = true; started = false; renderer = null;
      return;
    }
    alive = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.98;

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    cam.tgt = new THREE.Vector3(0, 3.2, 0);

    scene.add(new THREE.HemisphereLight(0xbcd0f0, 0x232c40, 0.55));
    const key = new THREE.DirectionalLight(0xfff3e2, 0.95); key.position.set(6, 12, 8); scene.add(key);
    const fill = new THREE.DirectionalLight(0x9fb8e8, 0.35); fill.position.set(-8, 4, -6); scene.add(fill);
    const rim = new THREE.PointLight(0x66aaff, 0.35, 60); rim.position.set(0, 6, -10); scene.add(rim);

    // จานหมุนพื้น (grid disc) — ให้อ้างอิงการหมุน
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(9, 48),
      new THREE.MeshBasicMaterial({ color: 0x1a3a66, transparent: true, opacity: 0.28 })
    );
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0; scene.add(disc);
    const gridH = new THREE.GridHelper(18, 18, 0x3a6ca3, 0x24507f);
    gridH.material.transparent = true; gridH.material.opacity = 0.35; scene.add(gridH);

    ray.rc = new THREE.Raycaster();
    ray.ndc = new THREE.Vector2();

    bindPointer();
    resize();
    window.addEventListener("resize", resize);
    loop();
  }

  function resize() {
    if (!renderer || !host) return;
    const w = host.clientWidth || 480, h = host.clientHeight || 340;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // ---------- orbit + raycast pointer ----------
  function bindPointer() {
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", e => {
      canvas.setPointerCapture(e.pointerId);
      dragMode = (e.button === 2 || e.shiftKey || e.button === 1) ? 2 : 1;
      lastX = e.clientX; lastY = e.clientY;
      hideTip();
    });
    canvas.addEventListener("pointermove", e => {
      if (dragMode) {
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        if (dragMode === 1) {
          cam.theta -= dx * 0.008;
          cam.phi = Math.max(0.18, Math.min(Math.PI - 0.12, cam.phi - dy * 0.008));
        } else {
          const s = cam.dist * 0.0016;
          const right = V3(Math.cos(cam.theta), 0, -Math.sin(cam.theta));
          cam.tgt.addScaledVector(right, -dx * s);
          cam.tgt.y = Math.max(0.5, Math.min(9, cam.tgt.y + dy * s));
        }
      } else {
        pickAt(e);
      }
    });
    const end = e => { dragMode = 0; try { canvas.releasePointerCapture(e.pointerId); } catch (x) {} };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("pointerleave", () => { if (!dragMode) { clearHover(); hideTip(); } });
    canvas.addEventListener("wheel", e => {
      e.preventDefault();
      cam.distGoal = Math.max(5, Math.min(40, cam.distGoal * (1 + Math.sign(e.deltaY) * 0.12)));
    }, { passive: false });
    canvas.addEventListener("contextmenu", e => e.preventDefault());
    canvas.addEventListener("dblclick", () => { cam.theta = 0.7; cam.phi = 1.12; cam.distGoal = curRocket ? fitDist(curRocket) : 15; });
  }

  function pickAt(e) {
    const r = canvas.getBoundingClientRect();
    ray.ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ray.ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.rc.setFromCamera(ray.ndc, camera);
    const vis = parts.filter(p => p.mesh.visible && p.mesh.parent && p.mesh.parent.visible);
    // โหมดแยกชิ้นส่วน: ให้ชิ้นส่วนภายใน/ชิ้นแข็งชนะลำที่โปร่งแสง (ghost)
    const solid = vis.filter(p => !p.ghost).map(p => p.mesh);
    const ghosts = vis.filter(p => p.ghost).map(p => p.mesh);
    let hit = ray.rc.intersectObjects(solid, false)[0];
    if (!hit) hit = ray.rc.intersectObjects(ghosts, false)[0];
    if (hit && hit.object.userData.tip) {
      if (hovered !== hit.object) { clearHover(); setHover(hit.object); }
      showTip(e.clientX, e.clientY, hit.object.userData.tip);
    } else {
      clearHover(); hideTip();
    }
  }
  function setHover(obj) {
    hovered = obj;
    const m = obj.material;
    if (m && m.emissive) { m.emissive.setHex(0x2f6bff); m.emissiveIntensity = 0.75; }
    canvas.style.cursor = "pointer";
  }
  function clearHover() {
    if (hovered) {
      const rec = parts.find(p => p.mesh === hovered);
      if (rec && rec.mat && rec.mat.emissive) { rec.mat.emissive.setHex(rec.baseEmis); rec.mat.emissiveIntensity = 1; }
    }
    hovered = null;
    canvas.style.cursor = "grab";
  }
  function showTip(x, y, t) {
    if (!tipEl) return;
    tipEl.innerHTML = `<b>${t.name}</b>${t.stat ? `<span>${t.stat}</span>` : ""}`;
    tipEl.hidden = false;
    const hr = host.getBoundingClientRect();
    let px = x - hr.left + 14, py = y - hr.top + 12;
    if (px + tipEl.offsetWidth > hr.width - 6) px = x - hr.left - tipEl.offsetWidth - 12;
    if (py + tipEl.offsetHeight > hr.height - 6) py = hr.height - tipEl.offsetHeight - 6;
    tipEl.style.left = Math.max(4, px) + "px";
    tipEl.style.top = Math.max(4, py) + "px";
  }
  function hideTip() { if (tipEl) tipEl.hidden = true; }

  // ---------- loop ----------
  function loop() {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    if (!renderer || !scene || !camera) return;
    // auto-resize (คอนเทนเนอร์เพิ่งถูก unhide หรือจอเปลี่ยน)
    const cw = host ? host.clientWidth : 0, chh = host ? host.clientHeight : 0;
    if (cw && chh && (Math.abs(cw - lastW) > 1 || Math.abs(chh - lastH) > 1)) { lastW = cw; lastH = chh; resize(); }
    // camera easing
    cam.dist += (cam.distGoal - cam.dist) * 0.16;
    const st = Math.sin(cam.phi), ct = Math.cos(cam.phi);
    camera.position.set(
      cam.tgt.x + cam.dist * st * Math.sin(cam.theta),
      cam.tgt.y + cam.dist * ct,
      cam.tgt.z + cam.dist * st * Math.cos(cam.theta)
    );
    camera.lookAt(cam.tgt);
    if (!dragMode && !hovered && curRocket) cam.theta += 0.0011;   // ลอยหมุนช้า ๆ (หยุดเมื่อชี้ชิ้นส่วน)

    // explode easing
    const goal = exploded ? 1 : 0;
    explodeT += (goal - explodeT) * 0.14;
    const e = explodeT < 0.5 ? 2 * explodeT * explodeT : 1 - Math.pow(-2 * explodeT + 2, 2) / 2;  // easeInOut
    if (internals) internals.visible = explodeT > 0.02;
    parts.forEach(p => {
      p.mesh.position.set(
        p.home.x + p.ex.x * e, p.home.y + p.ex.y * e, p.home.z + p.ex.z * e
      );
      if (p.ghost && p.mat) {
        p.mat.transparent = true;
        p.mat.opacity = p.baseOpacity + (0.14 - p.baseOpacity) * e;
      }
    });

    if (scene && camera) renderer.render(scene, camera);
  }

  // ---------- model builders ----------
  const khidWt = kg => (kg * 10).toFixed(1) + " ขีด";

  function fitDist(r) {
    if (!r) return 15;
    if (r.id === "bangfai") return 20;
    if (r.id === "talai") return 12;
    if (r.lantern || r.tierKey === "tier1") return 12;
    return 17;
  }

  function build(r) {
    clearModel();
    curRocket = r;
    cam.tgt.set(0, 3.2, 0);
    cam.distGoal = fitDist(r);
    if (r.id === "bangfai") buildBangfai(r);
    else if (r.id === "talai") buildTalai(r);
    else if (r.lantern) buildKhom(r);
    else if (r.tierKey === "tier1") buildFirework(r);
    else buildStaged(r);
    applyParams(r);
  }

  // ===== บั้งไฟ =====
  function buildBangfai(r) {
    const S = window.Bangfai ? window.Bangfai.state : {};
    const a = window.Bangfai ? window.Bangfai.analyse(S) : {};
    const isPVC = S.body === "pvc";
    const BR = 0.55, BH = 5.2, baseY = 1.0;

    // ---- ลำบั้งไฟ (โปร่งแสงตอนแยกชิ้นส่วน) ----
    const bodyMat = mat(isPVC ? 0xdadbd4 : 0xb98f57, { rough: isPVC ? 0.45 : 0.8, transparent: true });
    const body = new (T().Mesh)(geo(new (T().CylinderGeometry)(BR, BR, BH, 32)), bodyMat);
    body.position.y = baseY + BH / 2;
    root.add(body);
    tag(body, isPVC ? "ลำบั้งไฟ · ท่อ PVC" : "ลำบั้งไฟ · ไม้ไผ่",
      `พิกัดดัชนีความดัน ${(a.bodyCapThresh || (isPVC ? 1.25 : 1.8)).toFixed(2)} · อัด ${S.pressPSI} PSI`,
      V3(0, 0, 0), { ghost: true });

    // ปลอกวงแหวนรัด (มัดเชือก/ลวด) — จำนวนตามความยาวหาง/มัดเข้าบั้ง
    const ringMat = mat(0x3a2c1c, { rough: 1 });
    for (let i = 0; i < 4; i++) {
      const ring = new (T().Mesh)(geo(new (T().TorusGeometry)(BR + 0.03, 0.05, 6, 20)), ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = baseY + 0.5 + i * (BH - 1) / 3;
      root.add(ring);
    }

    // หัวไม้อุด
    const cap = new (T().Mesh)(geo(new (T().ConeGeometry)(BR * 1.02, BR * 2, 24)), mat(0x6b4f2e, { rough: 0.85 }));
    cap.position.y = baseY + BH + BR * 0.9;
    root.add(cap);
    tag(cap, "หัวไม้อุด (nose plug)", "ปิดปลายลำ กันแรงดันรั่วด้านหน้า", V3(0, 3.4, 0));

    // ---- หาง (ยืด-หดตามสไลเดอร์) ----
    const tailMat = mat(0xb08a4e, { rough: 0.8 });
    const tail = new (T().Mesh)(geo(new (T().CylinderGeometry)(0.09, 0.14, 1, 10)), tailMat);   // height=1 → ใช้ scale.y
    tail.name = "bf-tail";
    root.add(tail);
    tag(tail, "หางไม้ไผ่ (ตัวรักษาเสถียรภาพ)", "", V3(2.6, -1.2, 0));

    // มัดหาง 3 จุด
    const lashMat = mat(0x2e2214, { rough: 1 });
    for (let i = 0; i < 3; i++) {
      const l = new (T().Mesh)(geo(new (T().TorusGeometry)(BR + 0.05, 0.04, 6, 16)), lashMat);
      l.rotation.y = Math.PI / 2;
      l.name = "bf-lash" + i;
      root.add(l);
      tag(l, "จุดมัดหางเข้าบั้ง", "", V3(0.5 + i * 0.15, 0, 0));
    }

    // ---- ร้านยิงบั้งไฟ ----
    const railMat = mat(0x8a6a3a, { rough: 0.9 });
    [-1.35, 1.35].forEach(x => {
      const p = new (T().Mesh)(geo(new (T().CylinderGeometry)(0.08, 0.1, 9, 8)), railMat);
      p.position.set(x, 4.4, -0.15);
      root.add(p);
      tag(p, "ร้านยิงบั้งไฟ (bamboo scaffold)", "ยกบั้งไฟให้หางยาวห้อยได้อิสระ", V3(x > 0 ? 1.6 : -1.6, 1.2, 0));
    });

    // ---- ภายใน: ดินขับ 3 ชั้น + รูประทุทรงกรวย (แสดงเฉพาะโหมดแยกชิ้นส่วน) ----
    root.userData.bf = { BR, BH, baseY };
    buildBangfaiInternals(r);
  }

  function buildBangfaiInternals(r) {
    // ลบของเก่า
    while (internals.children.length) {
      const c = internals.children.pop();
      if (c.geometry) c.geometry.dispose();
      internals.remove(c);
    }
    // ลบ tag ของ internals เดิม
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].mesh.userData.isInternal) parts.splice(i, 1);

    const S = window.Bangfai ? window.Bangfai.state : {};
    const bf = root.userData.bf || { BR: 0.55, BH: 5.2, baseY: 1.0 };
    const PR = bf.BR * 0.9;                           // ดินอัดเกือบเต็มลำ
    const hHead = S.headMass || 0.8, hThroat = S.throatMass || 1.2, hBody = S.bodyMass || 7;
    const totKg = hHead + hThroat + hBody;
    const packH = bf.BH * 0.84;                       // ความสูงดินอัดในลำ
    const yBot = bf.baseY + 0.3;

    const segs = [
      { kg: hBody, col: 0x33333b, th: "ดินลำตัว", role: "แรงขับหลัก" },
      { kg: hThroat, col: 0x9c7a44, th: "ดินคอ", role: "ดินเชื่อม เผาปานกลาง" },
      { kg: hHead, col: 0x6a4322, th: "ดินหัว", role: "ดินเลี้ยง — ค้างฟ้านาน" }
    ];
    let y = yBot;
    segs.forEach((sg, i) => {
      const h = Math.max(0.18, packH * sg.kg / totKg);
      const m = new (T().Mesh)(
        new (T().CylinderGeometry)(PR, PR, h, 28),
        new (T().MeshStandardMaterial)({ color: sg.col, roughness: 0.94 })
      );
      m.position.y = y + h / 2;
      m.userData.isInternal = true;
      internals.add(m);
      tag(m, sg.th + " (" + khidWt(sg.kg) + ")", sg.role, V3(0, (i - 1) * 0.8, 0));
      y += h;
    });

    // รูประทุทรงกรวยกลับ (LatheGeometry จากโปรไฟล์ ยอด/ไฟกิน/ตูด/เฟื่อง — สเกล มม.→ฉาก)
    const mm = v => Math.max(0.05, (v || 4) * 0.019);
    const tip = mm(S.coreTip), burn = mm(S.coreBurn), base = mm(S.coreBase), noz = mm(S.coreNozzle);
    const core = packH * 0.66;
    const pts = [
      new (T().Vector2)(noz, 0),
      new (T().Vector2)(base, core * 0.18),
      new (T().Vector2)(burn, core * 0.60),
      new (T().Vector2)(tip, core * 0.97),
      new (T().Vector2)(0.03, core)
    ];
    const lathe = new (T().LatheGeometry)(pts, 30);
    const coreMesh = new (T().Mesh)(lathe, new (T().MeshStandardMaterial)({
      color: 0x2a1608, roughness: 0.5, emissive: 0xff6a22, emissiveIntensity: 0.32, metalness: 0.1
    }));
    coreMesh.position.y = yBot + packH * 0.12;
    coreMesh.userData.isInternal = true;
    internals.add(coreMesh);
    tag(coreMesh, "รูประทุ (ห้องเผาไหม้ทรงกรวยกลับ)",
      `ยอด ${S.coreTip} · ไฟกิน ${S.coreBurn} · ตูด ${S.coreBase} · เฟื่อง ${S.coreNozzle} มม. — ตูดกว้าง = ออกตัวแรง, เฟื่องแคบ = CATO`,
      V3(0, 0, 1.6));
  }

  // ===== ตะไล =====
  function buildTalai(r) {
    const S = window.Talai ? window.Talai.state : {};
    const g = window.Talai ? window.Talai.geometry(S) : {};
    const casing = (window.Talai && window.Talai.CASING[S.casing]) || {};
    const CR = 0.34, CH = 2.6, baseY = 1.4;

    const okCase = !!casing.ok;
    const coreMat = mat(okCase ? 0x9c7b45 : 0xb5544a, { rough: 0.82, transparent: true });
    const core = new (T().Mesh)(geo(new (T().CylinderGeometry)(CR, CR, CH, 24)), coreMat);
    core.position.y = baseY + CH / 2;
    core.name = "tl-core";
    root.add(core);
    tag(core, "แกนตะไล — " + (casing.th || "?").split(" ")[0],
      casing.hint || "แกนต้องเป็นไม้รวกสดเท่านั้น", V3(0, 0, 0), { ghost: true });

    // ปีกวงกลม (ไผ่ตง) — Ø ตามสไลเดอร์
    const wingMat = mat(0x8a6a3a, { rough: 0.85 });
    const wing = new (T().Mesh)(geo(new (T().TorusGeometry)(1, 0.07, 8, 44)), wingMat);
    wing.rotation.x = Math.PI / 2;
    wing.position.y = baseY + CH * 0.55;
    wing.name = "tl-wing";
    root.add(wing);
    tag(wing, "ปีกวงกลม (ไผ่ตง)", "", V3(0, 1.5, 0));

    for (let k = 0; k < 3; k++) {
      const sp = new (T().Mesh)(geo(new (T().BoxGeometry)(2, 0.045, 0.07)), mat(0x7a5a34, { rough: 0.9 }));
      sp.rotation.y = k * Math.PI / 3;
      sp.position.y = baseY + CH * 0.55;
      sp.name = "tl-spoke" + k;
      root.add(sp);
      tag(sp, "ซี่ยึดปีก", "", V3(0, 1.5, 0));
    }

    const cap = new (T().Mesh)(geo(new (T().ConeGeometry)(CR, 0.5, 16)), mat(0x6b4f2e, { rough: 0.85 }));
    cap.position.y = baseY + CH + 0.25;
    root.add(cap);
    tag(cap, "จุกปิดยอดแกน", "", V3(0, 2.4, 0));

    root.userData.tl = { CR, CH, baseY };
    buildTalaiInternals(r);
  }

  function buildTalaiInternals(r) {
    while (internals.children.length) {
      const c = internals.children.pop();
      if (c.geometry) c.geometry.dispose();
      internals.remove(c);
    }
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].mesh.userData.isInternal) parts.splice(i, 1);

    const S = window.Talai ? window.Talai.state : {};
    const tl = root.userData.tl || { CR: 0.34, CH: 2.6, baseY: 1.4 };

    // ดินตะไลอัดในแกน
    const powder = new (T().Mesh)(
      new (T().CylinderGeometry)(tl.CR * 0.8, tl.CR * 0.8, tl.CH * 0.7, 20),
      new (T().MeshStandardMaterial)({ color: 0x3f3a30, roughness: 0.95 })
    );
    powder.position.y = tl.baseY + tl.CH * 0.42;
    powder.userData.isInternal = true;
    internals.add(powder);
    tag(powder, "ดินตะไล (ดินบาท-มาดเฟื้อง-ถ่านสลึง)",
      `ดินประสิว ${Math.round((S.mix ? S.mix.saltpeter : 72))} : ถ่าน ${Math.round((S.mix ? S.mix.charcoal : 18))} : กำมะถัน ${Math.round((S.mix ? S.mix.sulfur : 10))}`,
      V3(0, 0.4, 0));

    // รูประทุเฉียง
    const ang = (S.holeAngle || 15) * Math.PI / 180;
    const hole = new (T().Mesh)(
      new (T().CylinderGeometry)(0.05, 0.05, tl.CR * 2.6, 10),
      new (T().MeshStandardMaterial)({ color: 0x120d08, roughness: 0.5, emissive: 0xff5a1e, emissiveIntensity: 0.3 })
    );
    hole.position.set(0, tl.baseY + tl.CH * 0.3, 0);
    hole.rotation.z = Math.PI / 2 - ang;
    hole.userData.isInternal = true;
    internals.add(hole);
    tag(hole, "รูประทุเฉียง", `${S.holeAngle || 15}° ใต้จุดสมดุล → เกลียวสว่าน`, V3(0.6, 0, 0));
  }

  // ===== โคมลอย =====
  function buildKhom(r) {
    const CY = 3.6, KH = 3.4;
    const paper = mat(0xf3dcae, { rough: 0.95, transparent: true, opacity: 0.82, side: T().DoubleSide, emis: 0xff9a3c, emisI: 0.6 });
    const shell = new (T().Mesh)(geo(new (T().CylinderGeometry)(1.36, 1.5, KH, 26, 1, true)), paper);
    shell.position.y = CY;
    root.add(shell);
    tag(shell, "โครงกระดาษสา", "ติดไฟที่ ~233°C — คุมความร้อนอย่าให้เกิน", V3(0, 1.4, 0), { ghost: true });

    const top = new (T().Mesh)(geo(new (T().SphereGeometry)(1.36, 22, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
      mat(0xecd0a0, { rough: 0.95, transparent: true, opacity: 0.85 }));
    top.position.y = CY + KH / 2; top.scale.y = 0.42;
    root.add(top);
    tag(top, "ยอดโคม", "", V3(0, 1.6, 0), { ghost: true });

    const rim = new (T().Mesh)(geo(new (T().TorusGeometry)(1.5, 0.045, 6, 24)), mat(0x8a6a3a, { rough: 0.9, metal: 0.3 }));
    rim.rotation.x = Math.PI / 2; rim.position.y = CY - KH / 2;
    root.add(rim);
    tag(rim, "โครงลวดปากโคม", "", V3(0, -0.6, 0));

    // เชื้อเพลิง + เปลว (ภายใน)
    const fuel = new (T().Mesh)(new (T().CylinderGeometry)(0.35, 0.35, 0.4, 12),
      new (T().MeshStandardMaterial)({ color: 0xd9c07a, roughness: 0.8 }));
    fuel.position.y = CY - KH / 2 + 0.2; fuel.userData.isInternal = true;
    internals.add(fuel);
    tag(fuel, "เชื้อเพลิง (ก้อนขี้ผึ้ง/พาราฟิน)", "เผาไล่อากาศให้ร้อน → แรงลอยตัว", V3(0, -0.5, 0));

    const flame = new (T().Mesh)(new (T().ConeGeometry)(0.24, 0.8, 10),
      new (T().MeshBasicMaterial)({ color: 0xffe7a8 }));
    flame.position.y = CY - KH / 2 + 0.7; flame.userData.isInternal = true;
    internals.add(flame);
    tag(flame, "เปลวไฟ", "อากาศร้อนเบากว่าอากาศเย็น (อาร์คิมิดีส)", V3(0, 0, 0));

    const lamp = new (T().PointLight)(0xffb45a, 2.2, 12, 2);
    lamp.position.y = CY - 0.8; root.add(lamp);
  }

  // ===== พลุ =====
  function buildFirework(r) {
    const shMat = mat(0x8a3a2c, { rough: 0.9, transparent: true });
    const shell = new (T().Mesh)(geo(new (T().SphereGeometry)(1.1, 24, 18)), shMat);
    shell.position.y = 3.0; shell.scale.y = 1.12;
    root.add(shell);
    tag(shell, "ลูกพลุ (shell)", "ดินขับเผาเร็ว วิถีตรง คุมเพดานยาก", V3(0, 1.4, 0), { ghost: true });

    const band = new (T().Mesh)(geo(new (T().TorusGeometry)(1.1, 0.07, 6, 22)), mat(0xcaa24a, { rough: 0.8 }));
    band.rotation.x = Math.PI / 2; band.position.y = 3.0;
    root.add(band);
    tag(band, "แถบกระดาษรัด", "", V3(0, 0, 1.4));

    const fuse = new (T().Mesh)(geo(new (T().CylinderGeometry)(0.05, 0.05, 0.9, 6)), mat(0x2b2b2b, { rough: 1 }));
    fuse.position.set(0.2, 4.4, 0); fuse.rotation.z = 0.35;
    root.add(fuse);
    tag(fuse, "ชนวน", "", V3(0.3, 1, 0));

    const powder = new (T().Mesh)(new (T().SphereGeometry)(0.8, 18, 14),
      new (T().MeshStandardMaterial)({ color: 0x3f3a30, roughness: 0.95 }));
    powder.position.y = 3.0; powder.userData.isInternal = true;
    internals.add(powder);
    tag(powder, "ดินขับพลุ", "เผาไหม้เร็วมาก แรงเยอะช่วงสั้น ๆ", V3(0, 0, 0));
  }

  // ===== จรวดหลายท่อน (Tier 3–5) =====
  function buildStaged(r) {
    const eff = (window.__vabStages || r.stages || []).slice();
    const plMass = window.__vabPayloadMass || r.defaultPayload || 0;
    let y = 1.0;
    const baseRad = r.tierKey === "tier3" ? 0.7 : r.tierKey === "tier4" ? 1.05 : 1.3;
    eff.forEach((st, i) => {
      const rad = baseRad * (1 - i * 0.12);
      const h = i === 0 ? 4.4 : 3.2;
      const liquid = st.propType === "liquid";
      const m = new (T().Mesh)(geo(new (T().CylinderGeometry)(rad, baseRad * (1 - Math.max(0, i - 1) * 0.12), h, 28)),
        mat(i % 2 ? 0xcdd3dc : 0xe8eaef, { rough: 0.5, metal: 0.35, transparent: true }));
      m.position.y = y + h / 2;
      root.add(m);
      tag(m, `ท่อนที่ ${i + 1} (${liquid ? "เชื้อเพลิงเหลว" : "เชื้อเพลิงแข็ง"})`,
        `แรงขับ ${Math.round(st.thrust)} N · Isp ${st.isp}s · เชื้อเพลิง ${Math.round(st.propMass)} kg`,
        V3(0, i * 1.6 + 0.6, 0), { ghost: true });

      // เชื้อเพลิงภายใน
      const fm = new (T().Mesh)(new (T().CylinderGeometry)(rad * 0.82, rad * 0.82, h * 0.82, 20),
        new (T().MeshStandardMaterial)({ color: liquid ? 0x3f6db0 : 0x5a4632, roughness: 0.9, emissive: liquid ? 0x0a1f44 : 0x1a0f06, emissiveIntensity: 0.4 }));
      fm.position.y = y + h / 2; fm.userData.isInternal = true;
      internals.add(fm);
      tag(fm, `เชื้อเพลิงท่อน ${i + 1}`, `${Math.round(st.propMass)} kg · ${liquid ? "เหลว" : "แข็ง"}`, V3(0, i * 1.6 + 0.6, 0));

      // หัวฉีด
      const noz = new (T().Mesh)(geo(new (T().ConeGeometry)(rad * 0.45, 0.7, 16, 1, true)),
        mat(0x2c2c33, { rough: 0.4, metal: 0.7 }));
      noz.position.y = y - 0.2; noz.rotation.x = Math.PI;
      root.add(noz);
      tag(noz, `หัวฉีดท่อน ${i + 1}`, "", V3(0, i * 1.6 + 0.4, 0));
      y += h + 0.15;
    });
    const topRad = baseRad * (1 - (eff.length - 1) * 0.12);
    const nose = new (T().Mesh)(geo(new (T().ConeGeometry)(topRad, topRad * 2.6, 24)),
      mat(r.orbital ? 0x2e5fae : 0xe8eaef, { rough: 0.5, metal: 0.3, transparent: true }));
    nose.position.y = y + topRad * 1.3;
    root.add(nose);
    tag(nose, r.orbital ? "แฟริ่ง + ดาวเทียม" : "จมูกจรวด (fairing)",
      plMass ? `เพย์โหลด ${Math.round(plMass)} kg` : "", V3(0, eff.length * 1.6 + 1.4, 0), { ghost: true });

    // Phase 8: เพย์โหลด Tier 4–5 = โมเดล .glb จริง (โผล่ตอนแยกชิ้นส่วน)
    const plId = window.__vabPayloadId || null;
    if (window.ModelManager && plId && window.ModelManager.isModelPayload(plId)) {
      const holder = new (T().Group)();
      holder.position.set(0, y + topRad * 0.4, 0);
      holder.userData.isInternal = true;
      internals.add(holder);
      const buildKey = curKey;
      window.ModelManager.forPayload(plId, { size: topRad * 1.8, emissive: 0x2f5fae, emissiveIntensity: 0.3 })
        .then(m => {
          if (!m || curKey !== buildKey || !holder.parent) return;
          holder.add(m);
          tagModel(m, "เพย์โหลด (โมเดล 3 มิติ)",
            plMass ? `${Math.round(plMass)} kg` : "", V3(0, 3.2, 0));
        })
        .catch(e => console.warn("[VAB3D] payload model", e));
    }

    cam.tgt.set(0, y * 0.45, 0);
    cam.distGoal = y * 2.2;
  }

  // ผูกทุก mesh ในโมเดล .glb เข้าระบบไฮไลต์/ทูลทิป/แยกชิ้นส่วน
  function tagModel(wrap, name, stat, exOff) {
    let first = true;
    wrap.traverse(o => {
      if (!o.isMesh || !o.material) return;
      o.userData.tip = { name, stat };
      parts.push({
        mesh: o, name, stat,
        home: o.position.clone(),
        ex: exOff && first ? exOff.clone() : V3(0, 0, 0),
        mat: o.material,
        baseEmis: o.material.emissive ? o.material.emissive.getHex() : 0,
        baseOpacity: o.material.opacity != null ? o.material.opacity : 1,
        ghost: false
      });
      first = false;
    });
  }

  // ---------- parametric refresh ----------
  function applyParams(r) {
    if (!r) return;
    if (r.id === "bangfai") {
      const S = window.Bangfai ? window.Bangfai.state : {};
      const a = window.Bangfai ? window.Bangfai.analyse(S) : {};
      const bf = root.userData.bf || {};
      // หาง — ยืด/หด + ตำแหน่งมัด
      const tail = root.getObjectByName("bf-tail");
      if (tail) {
        const TL = Math.max(3.5, Math.min(10, (S.tailLength || 270) / 100 * 2.7));
        const bindY = 1.0 + Math.min(1.9, (S.tailAttach || 37) / 100 * 2.7);
        tail.scale.y = TL;
        tail.position.set(bf.BR + 0.16, bindY + 0.3 - TL / 2, 0.06);
        tail.rotation.x = 0.12;
        const rec = parts.find(p => p.mesh === tail);
        if (rec) {
          rec.home.copy(tail.position);
          rec.stat = `${S.tailLength} ซม. · มัดเข้าบั้ง ${S.tailAttach} ซม. · ${khidWt(a.tailKg || 1.7)}${S.boilTail ? " · ต้มหางแล้ว" : ""} · สมดุล ${Math.round((a.tailBalance || .8) * 100)}%`;
          tail.userData.tip.stat = rec.stat;
        }
        for (let i = 0; i < 3; i++) {
          const l = root.getObjectByName("bf-lash" + i);
          if (l) { l.position.set(bf.BR * 0.4, bindY - 0.05 - i * 0.34, 0); parts.find(p => p.mesh === l).home.copy(l.position); }
        }
      }
      // ลำ — วัสดุ/สี ตามชนิด (ถ้าเปลี่ยนชนิดจะ rebuild อยู่แล้ว) + อัปเดตสเปกทูลทิป
      const bodyRec = parts.find(p => p.mesh.userData.tip && /ลำบั้งไฟ/.test(p.mesh.userData.tip.name));
      if (bodyRec) {
        bodyRec.stat = `พิกัดดัชนีความดัน ${(a.bodyCapThresh || 1.25).toFixed(2)} · ปัจจุบัน ${(a.pressureIndex || 0).toFixed(2)} · อัด ${S.pressPSI} PSI`;
        bodyRec.mesh.userData.tip.stat = bodyRec.stat;
      }
      buildBangfaiInternals(r);
    } else if (r.id === "talai") {
      const S = window.Talai ? window.Talai.state : {};
      const g = window.Talai ? window.Talai.geometry(S) : {};
      const tl = root.userData.tl || {};
      const wing = root.getObjectByName("tl-wing");
      if (wing) {
        const wd = Math.max(0.8, Math.min(2.6, (g.wingDia || 24) / 22 * 1.5));
        wing.scale.set(wd, wd, 1);
        const rec = parts.find(p => p.mesh === wing);
        if (rec) { rec.stat = `Ø ${g.wingDia} ซม. / เป้า ${g.twoCirc} ซม. (${Math.round((g.wingRatio || 1) * 100)}%)`; wing.userData.tip.stat = rec.stat; }
        for (let k = 0; k < 3; k++) { const sp = root.getObjectByName("tl-spoke" + k); if (sp) sp.scale.x = wd; }
      }
      buildTalaiInternals(r);
    }
  }

  // ---------- public ----------
  function mount(hostEl) {
    if (!T()) return;
    host = hostEl;
    canvas = host.querySelector("#vab3d-canvas");
    tipEl = host.querySelector("#vab3d-tip");
    btnEl = document.getElementById("vab3d-explode");
    if (btnEl && !btnEl._wired) {
      btnEl._wired = true;
      btnEl.addEventListener("click", toggleExploded);
    }
    if (!canvas) return false;
    ensureScene();
    if (webglFailed || !renderer) { mounted = false; return false; }
    mounted = true;
    resize();
    return true;
  }

  function show(r) {
    if (!mounted || webglFailed || !T()) return;
    resize();
    const key = r.id + "|" + (r.id === "bangfai" && window.Bangfai ? window.Bangfai.state.body : "")
      + "|" + (r.id === "talai" && window.Talai ? window.Talai.state.casing : "")
      + "|" + (window.__vabPayloadId || "");
    if (key !== curKey) { curKey = key; build(r); }
    else applyParams(r);
  }
  function refresh(r) {
    if (!mounted || !curRocket) return;
    show(r || curRocket);
  }
  function setExploded(v) {
    exploded = !!v;
    if (btnEl) {
      btnEl.classList.toggle("on", exploded);
      btnEl.innerHTML = exploded ? "🔽 ประกอบกลับ" : "🔍 แยกชิ้นส่วน (X-Ray)";
    }
  }
  function toggleExploded() { setExploded(!exploded); }

  function unmount() {
    alive = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    window.removeEventListener("resize", resize);
    hideTip();
    if (renderer) {
      try {
        scene && scene.traverse(o => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose && m.dispose());
        });
        renderer.dispose();
        renderer.forceContextLoss && renderer.forceContextLoss();   // ปล่อย GL context จริง ๆ (r147 dispose ไม่ปล่อยเอง)
      } catch (e) {}
    }
    renderer = scene = camera = root = internals = null;
    parts.length = 0; disposables.length = 0;
    mounted = false; started = false; curKey = ""; curRocket = null;
    exploded = false; explodeT = 0;
  }

  window.VAB3D = { mount, show, refresh, setExploded, toggleExploded, unmount };
})();
