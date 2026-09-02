// js/vabEditor.js — Phase 15 · Node-Based Drag & Drop VAB (Juno/KSP style)
//
//   ทดลองสถาปัตยกรรมใหม่บนการประกอบ "พลุ" ก่อน (เปลือก → สารเคมี → ชนวน)
//   ใช้ window.VehicleTree เป็นโครงข้อมูล + ผูก THREE.Group ของแต่ละ node เข้ากับ
//   Group ของ parent จริง ๆ (Three scene graph) — ย้าย/ถอด parent แล้วลูกขยับตามฟรี
//
//   ปฏิสัมพันธ์:
//     • ลากไอคอนจากพาเลทด้านขวา → วาง node ใหม่ในฉาก (สร้างจริงทันที แล้วลากตามเมาส์)
//     • ลากชิ้นส่วนที่วางแล้ว → ย้าย/ถอด (detach) ออกจาก parent
//     • เข้าใกล้จุดยึดที่รองรับ (ทรงกลมเรืองเขียว) ในรัศมี snap → ปล่อยแล้วจะสแนปเข้าที่อัตโนมัติ
//     • ปุ่ม X-Ray แยกชิ้นส่วนตามแกน Y ตามลำดับชั้นของ tree
//
//   window.VABEditor.mount(hostEl)   — สร้างฉาก + พาเลท (เรียกครั้งเดียวต่อการเข้าหน้า VAB)
//   window.VABEditor.show()          — เริ่ม/แสดงผล (เคลียร์ต้นไม้เดิม เริ่มห้องว่าง)
//   window.VABEditor.setExploded(v)
//   window.VABEditor.unmount()

(function () {
  "use strict";
  const T = () => window.THREE;
  const VT = () => window.VehicleTree;

  let renderer = null, scene = null, camera = null, raf = 0, host = null, canvas = null;
  let tipEl = null, paletteEl = null, statusEl = null, explodeBtn = null;
  let mounted = false, started = false, alive = false, webglFailed = false;
  let root3d = null;                                // THREE.Group = "ห้องประกอบ" (world space สำหรับ node ที่ไม่มี parent)
  let tree = null;                                   // VehicleTree instance (root = เปลือกพลุ / เชื้อเพลิงโคม หรือ null ถ้ายังไม่วาง)
  let exploded = false, explodeT = 0;

  // Phase 17.5 · โหมดการประกอบ: "firework" (เปลือก→เคมี→ชนวน) | "khom" (เชื้อเพลิง→โครงไผ่→กระดาษสา)
  let currentMode = "firework";
  const MODE_PARTS = {
    firework: ["shell", "chemical", "fuse"],
    khom: ["fuel_ring", "bamboo_frame", "sa_paper"]
  };
  const ROOT_TYPE = { firework: "shell", khom: "fuel_ring" };

  const recs = new Map();                            // nodeId -> { node, wrap, mesh, markers:{slotName:mesh} }
  const disposables = [];
  const SNAP_R = 0.85;

  const cam = { theta: 0.55, phi: 1.1, dist: 8.5, tgt: null, distGoal: 8.5 };
  let camDrag = 0, lastX = 0, lastY = 0, lastW = 0, lastH = 0;
  const ray = { rc: null, ndc: null, plane: null, hit: null };

  let drag = null;                                   // { node, wrap, fromParent, fromSlot, snapTarget:{owner,slot} }
  let hovered = null;

  // ---------- helpers ----------
  const V3 = (x, y, z) => new (T().Vector3)(x, y || 0, z || 0);
  function mat(hex, o) {
    o = o || {};
    const m = new (T().MeshStandardMaterial)({
      color: hex, roughness: o.rough != null ? o.rough : 0.7, metalness: o.metal || 0,
      transparent: !!o.transparent, opacity: o.opacity != null ? o.opacity : 1,
      emissive: o.emis != null ? o.emis : 0x000000, emissiveIntensity: o.emisI != null ? o.emisI : 1,
      side: o.side || T().FrontSide
    });
    if (o.depthWrite != null) m.depthWrite = o.depthWrite;
    disposables.push(m);
    return m;
  }
  function geo(g) { disposables.push(g); return g; }

  // ---------- scene setup ----------
  function ensureScene() {
    if (started) return;
    started = true;
    const THREE = T();
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
      if (!renderer.getContext()) throw new Error("no gl context");
    } catch (e) {
      console.warn("[VABEditor] WebGL unavailable", e);
      webglFailed = true; started = false; renderer = null;
      return;
    }
    alive = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(44, 1, 0.1, 200);
    cam.tgt = new THREE.Vector3(0, 2.6, 0);

    scene.add(new THREE.HemisphereLight(0xbcd0f0, 0x232c40, 0.6));
    const key = new THREE.DirectionalLight(0xfff3e2, 1.0); key.position.set(5, 10, 7); scene.add(key);
    const fill = new THREE.DirectionalLight(0x9fb8e8, 0.4); fill.position.set(-7, 4, -5); scene.add(fill);

    const disc = new THREE.Mesh(new THREE.CircleGeometry(7, 40),
      new THREE.MeshBasicMaterial({ color: 0x1a3a66, transparent: true, opacity: 0.22 }));
    disc.rotation.x = -Math.PI / 2; scene.add(disc);
    const gridH = new THREE.GridHelper(14, 14, 0x3a6ca3, 0x24507f);
    gridH.material.transparent = true; gridH.material.opacity = 0.3; scene.add(gridH);

    root3d = new THREE.Group();
    scene.add(root3d);

    ray.rc = new THREE.Raycaster();
    ray.ndc = new THREE.Vector2();
    ray.plane = new THREE.Plane();

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

  // ---------- pointer: camera orbit / node grab / palette spawn ----------
  function ndcFromEvent(e) {
    const r = canvas.getBoundingClientRect();
    ray.ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ray.ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }

  function isAncestorOf(anc, obj) {
    let p = obj;
    while (p) { if (p === anc) return true; p = p.parent; }
    return false;
  }
  function pickNodeMesh(e) {
    ndcFromEvent(e);
    ray.rc.setFromCamera(ray.ndc, camera);
    const meshes = [];
    recs.forEach(rec => { if (rec.mesh && rec.mesh.visible) meshes.push(rec.mesh); });
    // recursive:true — บาง node (เช่นชนวน) เป็น THREE.Group ห่อหลาย mesh, ต้องเช็กลูกด้วย
    const hits = ray.rc.intersectObjects(meshes, true);
    // ชิ้นลูก (เช่น ชนวน/สารเคมี) ต้องชนะ parent (เปลือกพลุโปร่งแสง) แม้ผิวเปลือกจะอยู่ใกล้กล้องกว่าตามระยะจริง
    // — ผู้เล่นเล็งไปที่ชิ้นที่ "เห็นโผล่" ผ่านความโปร่งแสง ไม่ใช่เปลือกที่บังอยู่
    let best = null, bestDepth = -1;
    for (const hit of hits) {
      for (const rec of recs.values()) {
        if (isAncestorOf(rec.mesh, hit.object)) {
          const d = VT().depth(rec.node);
          if (d > bestDepth) { bestDepth = d; best = rec; }
          break;
        }
      }
    }
    return best;
  }

  // จุดตัดกับระนาบตั้งฉากกล้อง ผ่าน cam.tgt — ใช้แปลงเมาส์ 2 มิติ → พิกัด 3 มิติแบบลากอิสระในอากาศ
  function dragPlanePoint(e, aroundY) {
    ndcFromEvent(e);
    ray.rc.setFromCamera(ray.ndc, camera);
    const normal = camera.getWorldDirection(V3(0, 0, 0)).negate();
    const p = aroundY != null ? V3(cam.tgt.x, aroundY, cam.tgt.z) : cam.tgt;
    ray.plane.setFromNormalAndCoplanarPoint(normal, p);
    const out = V3(0, 0, 0);
    ray.rc.ray.intersectPlane(ray.plane, out);
    return out;
  }

  function bindPointer() {
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", e => {
      if (drag) return;                              // กำลังลากจากพาเลทอยู่ (capture อยู่ที่ปุ่มพาเลท)
      const rec = pickNodeMesh(e);
      try { canvas.setPointerCapture(e.pointerId); } catch (x) {}
      if (rec) {
        beginMoveDrag(rec, e);
      } else {
        camDrag = (e.button === 2 || e.shiftKey || e.button === 1) ? 2 : 1;
        lastX = e.clientX; lastY = e.clientY;
        hideTip();
      }
    });
    canvas.addEventListener("pointermove", e => {
      if (drag) { updateDrag(e); return; }
      if (camDrag) {
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        if (camDrag === 1) {
          cam.theta -= dx * 0.008;
          cam.phi = Math.max(0.18, Math.min(Math.PI - 0.14, cam.phi - dy * 0.008));
        } else {
          const s = cam.dist * 0.0016;
          const right = V3(Math.cos(cam.theta), 0, -Math.sin(cam.theta));
          cam.tgt.addScaledVector(right, -dx * s);
          cam.tgt.y = Math.max(0.4, Math.min(7, cam.tgt.y + dy * s));
        }
      } else {
        hoverAt(e);
      }
    });
    const end = e => {
      if (drag) { endDrag(); }
      camDrag = 0;
      try { canvas.releasePointerCapture(e.pointerId); } catch (x) {}
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("pointerleave", () => { if (!camDrag && !drag) { clearHover(); hideTip(); } });
    canvas.addEventListener("wheel", e => {
      e.preventDefault();
      cam.distGoal = Math.max(3.5, Math.min(24, cam.distGoal * (1 + Math.sign(e.deltaY) * 0.12)));
    }, { passive: false });
    canvas.addEventListener("contextmenu", e => e.preventDefault());
    canvas.addEventListener("dblclick", () => { cam.theta = 0.55; cam.phi = 1.1; cam.distGoal = 8.5; });
  }

  function hoverAt(e) {
    const rec = pickNodeMesh(e);
    if (rec) {
      if (hovered !== rec.mesh) { clearHover(); setHover(rec); }
      showTip(e.clientX, e.clientY, rec.node);
    } else { clearHover(); hideTip(); }
  }
  function setHover(rec) {
    hovered = rec.mesh;
    if (rec.mesh.material && rec.mesh.material.emissive) {
      rec.baseEmis = rec.mesh.material.emissive.getHex();
      rec.mesh.material.emissive.setHex(0x2f6bff);
    }
    canvas.style.cursor = "grab";
  }
  function clearHover() {
    if (hovered) {
      for (const rec of recs.values()) {
        if (rec.mesh === hovered && rec.mesh.material && rec.mesh.material.emissive && rec.baseEmis != null) {
          rec.mesh.material.emissive.setHex(rec.baseEmis);
        }
      }
    }
    hovered = null;
    canvas.style.cursor = "grab";
  }
  function showTip(x, y, node) {
    if (!tipEl) return;
    const def = node.def;
    const floating = !node.parent && !node.def.isRoot;
    tipEl.innerHTML = `<b>${def.icon} ${def.nameTh}</b><span>${def.nameSub} · ${node.mass.toFixed(2)} kg${floating ? " · ลอยอิสระ (ยังไม่ยึด)" : ""}</span>`;
    tipEl.hidden = false;
    const hr = host.getBoundingClientRect();
    let px = x - hr.left + 14, py = y - hr.top + 12;
    if (px + tipEl.offsetWidth > hr.width - 6) px = x - hr.left - tipEl.offsetWidth - 12;
    if (py + tipEl.offsetHeight > hr.height - 6) py = hr.height - tipEl.offsetHeight - 6;
    tipEl.style.left = Math.max(4, px) + "px";
    tipEl.style.top = Math.max(4, py) + "px";
  }
  function hideTip() { if (tipEl) tipEl.hidden = true; }

  // ---------- node <-> 3D building ----------
  function fireworkColor() {
    const FW = window.Fireworks;
    if (FW && FW.derived) { const d = FW.derived(); if (d && d.color != null) return d.color; }
    return 0xff2d2d;
  }

  // Phase 17.5 · ลายกระดาษสาจาก window.Skins (โคมลอย) — ทึบเสมอ
  function khomPaperTexture() {
    try {
      const id = window.Skins && window.Skins.state ? window.Skins.state.khom : null;
      if (window.Skins && id && id !== "plain") {
        const tex = window.Skins.texture(T(), id);
        disposables.push(tex);
        return tex;
      }
    } catch (e) { console.warn("[VABEditor] khom skin", e); }
    return null;
  }

  function buildMeshFor(node) {
    const THREE = T();

    // ───── โคมลอย ─────
    if (node.type === "fuel_ring") {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(geo(new THREE.TorusGeometry(1.15, 0.16, 10, 30)),
        mat(0xe9dcc0, { rough: 0.85 }));
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      // ก้อนขี้ผึ้ง 4 จุดบนวงแหวน
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        const w = new THREE.Mesh(geo(new THREE.BoxGeometry(0.34, 0.2, 0.5)), mat(0xd8c690, { rough: 0.7 }));
        w.position.set(Math.cos(a) * 1.15, 0, Math.sin(a) * 1.15);
        g.add(w);
      }
      // เป้า raycast ครอบ (วงแหวนบางเล็งยาก)
      const hit = new THREE.Mesh(geo(new THREE.CylinderGeometry(1.35, 1.35, 0.5, 12)),
        mat(0x000000, { transparent: true, opacity: 0.001 }));
      g.add(hit);
      return g;
    }
    if (node.type === "bamboo_frame") {
      const g = new THREE.Group();
      const R = 1.18, H = 0.55;
      const bmat = mat(0xb8863f, { rough: 0.75 });
      // วงแหวนไผ่ บน–ล่าง
      [-H / 2, H / 2].forEach(y => {
        const rr = new THREE.Mesh(geo(new THREE.TorusGeometry(R, 0.045, 8, 28)), bmat);
        rr.rotation.x = Math.PI / 2; rr.position.y = y; g.add(rr);
      });
      // ซี่ตั้ง
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        const st = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.035, 0.035, H, 6)), bmat);
        st.position.set(Math.cos(a) * R, 0, Math.sin(a) * R);
        g.add(st);
      }
      // กากบาทลวดยึดเชื้อเพลิงใต้โครง
      const wmat = mat(0x8a6a3a, { rough: 0.9, metal: 0.3 });
      [0, Math.PI / 2].forEach(a => {
        const w = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.028, 0.028, R * 2.05, 5)), wmat);
        w.rotation.z = Math.PI / 2; w.rotation.y = a; w.position.y = -H / 2; g.add(w);
      });
      const hit = new THREE.Mesh(geo(new THREE.CylinderGeometry(R * 1.06, R * 1.06, H + 0.1, 12)),
        mat(0x000000, { transparent: true, opacity: 0.001 }));
      g.add(hit);
      return g;
    }
    if (node.type === "sa_paper") {
      const g = new THREE.Group();
      const R = 1.24, H = 3.6;
      // Phase 17.5 · กระดาษสาทึบสนิท — transparent:false · depthWrite:true · opacity:1
      const paper = mat(0xf3dcae, { rough: 0.95, side: THREE.DoubleSide, emis: 0xd9531e, emisI: 0.28, depthWrite: true });
      const tex = khomPaperTexture();
      if (tex) { paper.map = tex; paper.color.setHex(0xffffff); paper.needsUpdate = true; }
      const shell = new THREE.Mesh(geo(new THREE.CylinderGeometry(R * 1.02, R * 1.06, H, 28, 1, true)), paper);
      shell.position.y = H / 2;
      g.add(shell);
      const domeMat = mat(0xecd0a0, { rough: 0.95, side: THREE.DoubleSide, depthWrite: true });
      if (tex) { domeMat.map = tex; domeMat.color.setHex(0xffffff); domeMat.needsUpdate = true; }
      const dome = new THREE.Mesh(geo(new THREE.SphereGeometry(R * 1.02, 26, 10, 0, Math.PI * 2, 0, Math.PI / 2)), domeMat);
      dome.position.y = H; dome.scale.y = 0.44;
      g.add(dome);
      g.userData.paperMat = paper;
      g.userData.domeMat = domeMat;
      return g;
    }

    if (node.type === "shell") {
      const m = new THREE.Mesh(geo(new THREE.SphereGeometry(1.05, 26, 18)),
        mat(0x8a3a2c, { rough: 0.9, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
      return m;
    }
    if (node.type === "chemical") {
      const c = new THREE.Color(fireworkColor());
      const N = 220;
      const g = geo(new THREE.BufferGeometry());
      const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, rr = Math.cbrt(Math.random()) * 0.68;
        const s = Math.sqrt(1 - u * u);
        pos[i * 3] = s * Math.cos(a) * rr; pos[i * 3 + 1] = u * rr; pos[i * 3 + 2] = s * Math.sin(a) * rr;
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const pm = new THREE.PointsMaterial({
        size: 0.15, vertexColors: true, transparent: true, opacity: 0.95,
        depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
      });
      disposables.push(pm);
      const pts = new THREE.Points(g, pm);
      // จุดกลาง (ให้ raycast จับได้ง่าย — Points เล็งยาก + threshold เริ่มต้นกว้างเกินจริง) ใช้ทรงกลมโปร่งครอบ
      pts.raycast = function () {};   // ปิด raycast ของตัว Points เอง กันโดนจับนอกทรงกลม hit
      const hit = new THREE.Mesh(geo(new THREE.SphereGeometry(0.7, 14, 10)),
        mat(c.getHex(), { transparent: true, opacity: 0.001, emis: c.getHex(), emisI: 0 }));
      hit.add(pts);
      return hit;
    }
    // fuse — ลำชนวนบางมาก (r 0.055) เล็งยาก จึงครอบด้วยทรงกระบอกโปร่งใส เป็นเป้าจับ raycast แทน
    const grp = new THREE.Group();
    const body = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.055, 0.055, 0.9, 8)), mat(0x2b2b2b, { rough: 1 }));
    grp.add(body);
    const ferrule = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.085, 0.085, 0.2, 8)), mat(0xb5342c, { rough: 0.6 }));
    ferrule.position.y = 0.55; grp.add(ferrule);
    const hitProxy = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.2, 0.2, 1.1, 8)),
      mat(0x000000, { transparent: true, opacity: 0.001 }));
    grp.add(hitProxy);
    return grp;
  }

  function markerMesh() {
    const THREE = T();
    const m = new THREE.Mesh(geo(new THREE.SphereGeometry(0.1, 14, 10)),
      mat(0x37ff8a, { emis: 0x37ff8a, emisI: 1.4 }));
    m.userData.isMarker = true;
    m.renderOrder = 8;
    return m;
  }

  function makeRec(node) {
    const THREE = T();
    const wrap = new THREE.Group();
    wrap.position.set(node.position.x, node.position.y, node.position.z);
    const mesh = buildMeshFor(node);
    wrap.add(mesh);
    const rec = { node, wrap, mesh, markers: {}, home: { x: node.position.x, y: node.position.y, z: node.position.z } };
    recs.set(node.id, rec);
    // จุดยึดของ node นี้เอง (เช่น เปลือกพลุมี center/bottom) — สร้างไว้ล่วงหน้า ซ่อนไว้ก่อน
    Object.keys(node.attachmentPoints).forEach(slotName => {
      const ap = node.attachmentPoints[slotName];
      const mk = markerMesh();
      mk.position.set(ap.x, ap.y, ap.z);
      mk.visible = false;
      mk.scale.setScalar(0.01);
      wrap.add(mk);
      rec.markers[slotName] = mk;
    });
    return rec;
  }

  function destroyRec(rec) {
    if (rec.wrap.parent) rec.wrap.parent.remove(rec.wrap);
    recs.delete(rec.node.id);
  }

  // ---------- palette (spawn drag) ----------
  function renderPalette() {
    if (!paletteEl) return;
    const order = MODE_PARTS[currentMode] || MODE_PARTS.firework;
    paletteEl.innerHTML = order.map(type => {
      const def = VT().PART_DEFS[type];
      return `<button type="button" class="vabe-item" data-part="${type}" title="${def.nameSub}">
        <span class="vabe-item-icon">${def.icon}</span>
        <span class="vabe-item-name">${def.nameTh}</span>
      </button>`;
    }).join("");
    paletteEl.querySelectorAll("[data-part]").forEach(btn => {
      btn.addEventListener("pointerdown", e => {
        e.preventDefault();
        try { btn.setPointerCapture(e.pointerId); } catch (x) {}
        startSpawn(btn.dataset.part, e, btn);
      });
    });
  }

  function startSpawn(type, e, btnEl) {
    if (!mounted || webglFailed) return;
    const def = VT().PART_DEFS[type];
    const rootLabel = currentMode === "khom" ? "เชื้อเพลิง (วงแหวนขี้ผึ้ง)" : "เปลือกพลุ";
    if (def && def.isRoot && tree && tree.root) { toast("มี" + rootLabel + "อยู่แล้ว — ถอด/ย้ายอันเดิมก่อน"); return; }
    if (def && !def.isRoot && (!tree || !tree.root)) { toast("ต้องวาง" + rootLabel + "ก่อน"); return; }
    const node = VT().createNode(type);
    const rec = makeRec(node);
    root3d.add(rec.wrap);
    const p = dragPlanePoint(e, cam.tgt.y);
    rec.wrap.position.copy(p);
    setExploded(false);
    drag = {
      spawn: true, node, rec, btnEl,
      pointerId: e.pointerId, snap: null
    };
    updateSnapTargets(node.type);
    updateDrag(e);
    const move = ev => { if (ev.pointerId !== e.pointerId) return; updateDrag(ev); };
    const up = ev => {
      if (ev.pointerId !== e.pointerId) return;
      btnEl.removeEventListener("pointermove", move);
      btnEl.removeEventListener("pointerup", up);
      btnEl.removeEventListener("pointercancel", up);
      endDrag();
    };
    btnEl.addEventListener("pointermove", move);
    btnEl.addEventListener("pointerup", up);
    btnEl.addEventListener("pointercancel", up);
  }

  // ---------- move drag (existing node) ----------
  function beginMoveDrag(rec, e) {
    hideTip(); clearHover();
    const node = rec.node;
    const worldPos = V3(0, 0, 0);
    rec.wrap.getWorldPosition(worldPos);
    const fromParent = node.parent, fromSlot = node.parentSlot;
    root3d.add(rec.wrap);                             // "ยกออก" มาไว้ที่ world space ชั่วคราวระหว่างลาก
    rec.wrap.position.copy(worldPos);
    setExploded(false);
    drag = { spawn: false, node, rec, fromParent, fromSlot, snap: null, dropY: worldPos.y };
    updateSnapTargets(node.type, node);
    updateDrag(e);
  }

  function updateSnapTargets(type, excludeNode) {
    // เก็บรายชื่อจุดยึดที่ "เปิดรับ" ชนิดนี้ ไว้ค้นหาระยะใกล้สุดตอนลาก
    const list = [];
    recs.forEach(rec => {
      if (excludeNode && (rec.node === excludeNode || isDescendant(excludeNode, rec.node))) return;
      Object.keys(rec.node.attachmentPoints).forEach(slotName => {
        const ap = rec.node.attachmentPoints[slotName];
        if (ap.accepts.indexOf(type) === -1) return;
        if (VT().slotOccupant(rec.node, slotName)) return;
        list.push({ owner: rec, slotName });
      });
    });
    drag ? (drag._candidates = list) : null;
    return list;
  }
  function isDescendant(anc, n) {
    let p = n;
    while (p) { if (p === anc) return true; p = p.parent; }
    return false;
  }

  function updateDrag(e) {
    if (!drag) return;
    const candidates = drag._candidates || updateSnapTargets(drag.node.type, drag.spawn ? null : drag.node);
    drag._candidates = candidates;

    // แสดง marker ของทุกจุดที่รองรับ
    candidates.forEach(c => { c.owner.markers[c.slotName].visible = true; });

    const p = dragPlanePoint(e, cam.tgt.y);
    // หาจุดยึดใกล้สุดในรัศมี snap
    let best = null, bestD = SNAP_R;
    candidates.forEach(c => {
      const wp = V3(0, 0, 0);
      c.owner.markers[c.slotName].getWorldPosition(wp);
      const d = wp.distanceTo(p);
      if (d < bestD) { bestD = d; best = { c, wp }; }
    });
    drag.snap = best;

    candidates.forEach(c => {
      const mk = c.owner.markers[c.slotName];
      const isBest = best && best.c === c;
      mk.material.emissiveIntensity = isBest ? 2.4 : 1.2;
      mk.scale.setScalar(isBest ? 0.032 : 0.018);
    });

    if (best) drag.rec.wrap.position.copy(best.wp);
    else drag.rec.wrap.position.copy(p);
  }

  function clearMarkers() {
    recs.forEach(rec => Object.keys(rec.markers).forEach(k => { rec.markers[k].visible = false; rec.markers[k].scale.setScalar(0.01); }));
  }

  function endDrag() {
    if (!drag) return;
    const { node, rec, spawn, fromParent, fromSlot } = drag;
    const snap = drag.snap;
    clearMarkers();

    if (spawn && node.def.isRoot) {
      tree = VT().createTree(node.type, { position: { x: rec.wrap.position.x, y: rec.wrap.position.y, z: rec.wrap.position.z } });
      // แทน node ชั่วคราวด้วย root ของ tree จริง (คงตำแหน่ง 3D เดิมไว้)
      destroyRec(rec);
      const rootRec = makeRec(tree.root);
      root3d.add(rootRec.wrap);
      rootRec.wrap.position.set(tree.root.position.x, tree.root.position.y, tree.root.position.z);
      rootRec.home = { x: tree.root.position.x, y: tree.root.position.y, z: tree.root.position.z };
      updateStatus();
      drag = null;
      return;
    }

    if (snap) {
      VT().attach(tree, node, snap.c.owner.node, snap.c.slotName);
      snap.c.owner.wrap.add(rec.wrap);
      rec.wrap.position.set(node.position.x, node.position.y, node.position.z);
      rec.home = { x: node.position.x, y: node.position.y, z: node.position.z };
      const ap = snap.c.owner.node.attachmentPoints[snap.c.slotName];
      rec.ex = ap.explode;
    } else if (!spawn) {
      // ปล่อยกลางอากาศ ไม่มีจุดยึดใกล้พอ → ถอด (detach) ลอยอิสระตรงตำแหน่งที่ปล่อย
      VT().detach(tree, node);
      const wp = V3(0, 0, 0);
      rec.wrap.getWorldPosition(wp);
      node.position = { x: wp.x, y: wp.y, z: wp.z };
      rec.home = { x: wp.x, y: wp.y, z: wp.z };
      rec.ex = { x: 0, y: 0, z: 0 };
    } else {
      // spawn (chemical/fuse) ไม่เจอจุดยึด → ยกเลิกการวาง
      destroyRec(rec);
    }
    updateStatus();
    drag = null;
  }

  // ---------- status / toast ----------
  function updateStatus() {
    if (!statusEl) return;
    if (currentMode === "khom") {
      if (!tree || !tree.root) { statusEl.textContent = "ลาก 🕯️ เชื้อเพลิง (วงแหวนขี้ผึ้ง) มาวางเป็นฐาน แล้วต่อขึ้นบน"; VABEditorSync(); return; }
      const hasFrame = VT().allNodes(tree).some(n => n.type === "bamboo_frame" && n.parent);
      const hasCover = VT().allNodes(tree).some(n => n.type === "sa_paper" && n.parent);
      let m = 0; VT().allNodes(tree).forEach(n => m += n.mass);
      statusEl.textContent = `เชื้อเพลิง ✓ · โครงไม้ไผ่ ${hasFrame ? "✓" : "—"} · กระดาษสา ${hasCover ? "✓" : "—"} · น้ำหนักรวม ${m.toFixed(2)} kg`;
      VABEditorSync();
      return;
    }
    if (!tree || !tree.root) { statusEl.textContent = "ลากเปลือกพลุจากพาเลทมาวางกลางห้องก่อน"; return; }
    const hasChem = VT().allNodes(tree).some(n => n.type === "chemical" && n.parent);
    const hasFuse = VT().allNodes(tree).some(n => n.type === "fuse" && n.parent);
    let totalMass = 0; VT().allNodes(tree).forEach(n => totalMass += n.mass);
    statusEl.textContent = `เปลือก ✓ · สารเคมี ${hasChem ? "✓" : "—"} · ชนวน ${hasFuse ? "✓" : "—"} · น้ำหนักรวม ${totalMass.toFixed(2)} kg`;
  }

  // แจ้ง main.js ให้คำนวณสถิติโคมใหม่ (เปิด/ปิดปุ่ม "ไปขั้นตอนขออนุญาต")
  function VABEditorSync() {
    if (currentMode === "khom" && window.VAB && typeof window.VAB.computeStats === "function") {
      try { window.VAB.computeStats(); } catch (e) {}
    }
  }
  function toast(msg) { if (window.toast) { try { window.toast(msg); return; } catch (e) {} } if (statusEl) statusEl.textContent = msg; }

  // ---------- loop ----------
  function loop() {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    if (!renderer || !scene || !camera) return;
    // auto-resize (คอนเทนเนอร์เพิ่งถูก unhide เป็นเลย์เอาต์เต็มจอ หรือจอเปลี่ยน) — CSS reflow ไม่ยิง window resize event
    const cw = host ? host.clientWidth : 0, ch = host ? host.clientHeight : 0;
    if (cw && ch && (Math.abs(cw - lastW) > 1 || Math.abs(ch - lastH) > 1)) { lastW = cw; lastH = ch; resize(); }
    cam.dist += (cam.distGoal - cam.dist) * 0.18;
    const st = Math.sin(cam.phi), ct = Math.cos(cam.phi);
    camera.position.set(
      cam.tgt.x + cam.dist * st * Math.sin(cam.theta),
      cam.tgt.y + cam.dist * ct,
      cam.tgt.z + cam.dist * st * Math.cos(cam.theta)
    );
    camera.lookAt(cam.tgt);

    const goal = exploded ? 1 : 0;
    explodeT += (goal - explodeT) * 0.14;
    const e = explodeT < 0.5 ? 2 * explodeT * explodeT : 1 - Math.pow(-2 * explodeT + 2, 2) / 2;
    recs.forEach(rec => {
      if (drag && drag.rec === rec) return;            // กำลังลากอยู่ — ปล่อยให้ตำแหน่งมาจาก updateDrag
      const ex = rec.ex || { x: 0, y: 0, z: 0 };
      rec.wrap.position.set(rec.home.x + ex.x * e, rec.home.y + ex.y * e, rec.home.z + ex.z * e);
      // marker pulse เฉพาะตอนแสดงผล (visible ถูกคุมตอนลากอยู่แล้ว)
      Object.values(rec.markers).forEach(mk => {
        if (mk.visible) mk.rotation.y += 0.05;
      });
    });

    renderer.render(scene, camera);
  }

  function setExploded(v) {
    exploded = !!v;
    if (explodeBtn) {
      explodeBtn.classList.toggle("on", exploded);
      explodeBtn.innerHTML = exploded ? "🔽 ประกอบกลับ" : "🔍 แยกชิ้นส่วน (X-Ray)";
    }
  }
  function toggleExploded() { setExploded(!exploded); }

  // ---------- public ----------
  function mount(hostEl) {
    if (!T() || !VT()) return false;
    host = hostEl;
    canvas = host.querySelector("#vabeditor-canvas");
    tipEl = host.querySelector("#vabeditor-tip");
    paletteEl = host.querySelector("#vabeditor-palette");
    statusEl = host.querySelector("#vabeditor-status");
    explodeBtn = document.getElementById("vabeditor-explode");
    if (explodeBtn && !explodeBtn._wired) { explodeBtn._wired = true; explodeBtn.addEventListener("click", toggleExploded); }
    if (!canvas) return false;
    ensureScene();
    if (webglFailed || !renderer) { mounted = false; return false; }
    mounted = true;
    resize();
    renderPalette();
    return true;
  }

  function show(mode) {
    if (!mounted || webglFailed) return;
    currentMode = mode === "khom" ? "khom" : "firework";
    resize();
    renderPalette();
    // เริ่มห้องว่างใหม่ทุกครั้งที่เข้าโหมดนี้
    recs.forEach(rec => destroyRec(rec));
    recs.clear();
    tree = null;
    drag = null;
    setExploded(false);
    if (currentMode === "khom") {
      cam.theta = 0.6; cam.phi = 1.0; cam.dist = cam.distGoal = 10.5; cam.tgt.set(0, 3.2, 0);
    } else {
      cam.theta = 0.55; cam.phi = 1.1; cam.dist = cam.distGoal = 8.5; cam.tgt.set(0, 2.6, 0);
    }
    updateStatus();
  }

  // Phase 17.5 · เรียกใหม่ลายกระดาษสาเมื่อผู้เล่นเปลี่ยนแพตเทิร์นจากแผง Skins
  function applyKhomSkin() {
    if (currentMode !== "khom") return;
    const tex = khomPaperTexture();
    recs.forEach(rec => {
      if (rec.node.type !== "sa_paper") return;
      const pm = rec.mesh.userData.paperMat, dm = rec.mesh.userData.domeMat;
      [pm, dm].forEach(m => {
        if (!m) return;
        m.map = tex || null;
        m.color.setHex(tex ? 0xffffff : (m === dm ? 0xecd0a0 : 0xf3dcae));
        m.needsUpdate = true;
      });
    });
  }

  // Phase 17.5 · สถิติโคมลอยจากต้นไม้ที่ประกอบ — ป้อนให้ main.js (computeKhom)
  function getBuild() {
    if (currentMode !== "khom" || !tree || !tree.root) {
      return { mode: "khom", complete: false, hasRing: false, hasFrame: false, hasCover: false,
        thrust: 0, fuelMass: 0, extraDryMass: 0, dragCoef: 0.09, paperRisk: 0, pattern: "plain", totalMass: 0 };
    }
    const nodes = VT().allNodes(tree);
    const hasRing = true;
    const hasFrame = nodes.some(n => n.type === "bamboo_frame" && n.parent);
    const hasCover = nodes.some(n => n.type === "sa_paper" && n.parent);
    let totalMass = 0; nodes.forEach(n => totalMass += n.mass);
    const pattern = (window.Skins && window.Skins.state) ? (window.Skins.state.khom || "plain") : "plain";
    // ลายที่ลงหมึกหนา (phi_ta_khon/naga/kranok_fai) → กระดาษหนักกว่าเล็กน้อย + ทนไฟกว่านิด
    const inked = pattern && pattern !== "plain" && pattern !== "lai_thai";
    return {
      mode: "khom",
      complete: hasRing && hasFrame && hasCover,
      hasRing, hasFrame, hasCover,
      thrust: 46,                 // ความร้อนวงแหวนขี้ผึ้ง (แทน "แรงขับ" ในฟิสิกส์โคม)
      fuelMass: 0.9,
      extraDryMass: totalMass,    // มวลชิ้นส่วนโคม (ไผ่+กระดาษ+ขี้ผึ้ง)
      dragCoef: 0.085 + (hasCover ? 0.02 : 0),
      paperRisk: hasCover ? (inked ? 0.34 : 0.42) : 0.9,   // ยังไม่หุ้มกระดาษ = เปลวโดนโครงตรง ๆ เสี่ยง
      pattern,
      totalMass
    };
  }

  function unmount() {
    alive = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    window.removeEventListener("resize", resize);
    hideTip();
    recs.forEach(rec => destroyRec(rec));
    recs.clear();
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
    renderer = scene = camera = root3d = null;
    disposables.length = 0;
    mounted = false; started = false; tree = null; drag = null;
    exploded = false; explodeT = 0;
  }

  // Phase 17: ส่งต้นไม้ยานที่ประกอบเสร็จให้ STATE_TESTING (อาจเป็น null ถ้ายังไม่ได้วางเปลือก)
  function getTree() { return tree; }

  window.VABEditor = { mount, show, setExploded, toggleExploded, unmount, getTree, getBuild, applyKhomSkin, get mode() { return currentMode; } };
})();
