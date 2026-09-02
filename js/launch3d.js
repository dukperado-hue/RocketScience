// js/launch3d.js — เฟสปล่อยจรวดแบบภาพยนตร์ 3 มิติ (Phase 2)
// Three.js r147 (UMD global THREE) + EffectComposer (Bloom only — clean modern render)
//  - ระบบอนุภาค: ควันปริมาตร + ไอพ่นไฟ (สี/ความยาวตามชนิดเชื้อเพลิง)
//  - post-processing: UnrealBloomPass เท่านั้น (ไม่มีฟิล์มเกรน/สแกนไลน์ — ภาพคมสะอาด)
//  - แสงไดนามิก: ไอพ่นเป็นแหล่งกำเนิดแสงส่องตัวจรวด + แท่นปล่อย
//  - กล้อง: camera shake ตอนจุดระเบิด/Max-Q + สลับมุม Ground → Chase → Orbital ตามความสูง
// ถ้า THREE โหลดไม่สำเร็จ main.js จะ fallback ไป Launch2D

(function () {
  "use strict";
  const T = () => window.THREE;

  const EV_LABEL = {
    ignition: "จุดระเบิด! 🔥", maxq: "Max-Q — แรงดันอากาศสูงสุด",
    staging: "แยกท่อน", cutoff: "ดับเครื่องยนต์ท่อนสุดท้าย",
    "guidance-cutoff": "Guidance ตัดเครื่อง — วิถีถึงเป้าแล้ว",
    orbit: "เข้าสู่วงโคจร ✓", "orbit-fail": "Δv ไม่พอ — ไม่ถึงวงโคจร",
    apogee: "จุดสูงสุด (apogee)", reentry: "กลับเข้าชั้นบรรยากาศ 🔥",
    burnup: "ยานไหม้จากความร้อน!", crash: "ตกกระแทกพื้น", landing: "ลงจอดปลอดภัย",
    "lantern-burnup": "โคมไหม้! กระดาษสาติดไฟ 🔥", "pad-explosion": "ระเบิดคาแท่น (CATO) 💥",
    unstable: "เสียการทรงตัว — CG เพี้ยน",
    "bangfai-wobble": "บั้งไฟรำดาบ! หางไม่สมดุล ควงเสียความสูง",
    "chute-deploy": "กางร่มชูชีพ 🪂", "retro-burn": "จุดเครื่องเบรกลงจอด 🔥",
    "soft-landing": "ลงจอดนุ่มนวล ✓", "landing-burn-fail": "เบรกไม่ทัน — ตกกระแทก 💥"
  };
  const PHASE_TH = {
    pad: "บนแท่น", boost: "เครื่องยนต์ทำงาน", coast: "ไต่ระดับอิสระ",
    insertion: "เข้าสู่วงโคจร", orbit: "อยู่ในวงโคจร", descent: "ตกลง",
    reentry: "re-entry", done: "จบเที่ยวบิน"
  };

  // ความสูง (m) → หน่วยฉาก (บีบอัดช่วงสูง)
  function altU(a) {
    if (a <= 400) return a * 0.06;
    return 24 + 26 * Math.log10(a / 400);
  }

  function softSprite() {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const tex = new (T().CanvasTexture)(c);
    return tex;
  }

  // ก้อนเมฆฟู ๆ (soft puff) สำหรับชั้นเมฆ
  function cloudSprite() {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d");
    for (let i = 0; i < 26; i++) {
      const px = 64 + (Math.random() - 0.5) * 70;
      const py = 64 + (Math.random() - 0.5) * 50;
      const r = 12 + Math.random() * 34;
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, "rgba(255,255,255,0.5)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = g;
      x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
    }
    return new (T().CanvasTexture)(c);
  }

  // พื้นผิวโลกแบบ procedural: มหาสมุทร + ทวีป + น้ำแข็งขั้วโลก + เมฆบาง
  function earthSurfaceTexture() {
    const w = 1024, h = 512;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const x = c.getContext("2d");
    const oc = x.createLinearGradient(0, 0, 0, h);
    oc.addColorStop(0, "#0c3f7e"); oc.addColorStop(0.5, "#155ba8"); oc.addColorStop(1, "#0c3f7e");
    x.fillStyle = oc; x.fillRect(0, 0, w, h);
    // ทวีป — blob สุ่ม (เล็กลง เว้นมหาสมุทรให้เห็นน้ำเงินมากขึ้น)
    const land = ["#3f6b3a", "#57813f", "#7c8a4b", "#9a8a55"];
    for (let i = 0; i < 15; i++) {
      const cx = Math.random() * w, cy = 60 + Math.random() * (h - 120);
      const rad = 24 + Math.random() * 78;
      x.fillStyle = land[i % land.length];
      x.globalAlpha = 0.92;
      x.beginPath();
      for (let a = 0; a < Math.PI * 2; a += 0.3) {
        const rr = rad * (0.5 + Math.random() * 0.7);
        const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr * 0.66;
        a === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
      }
      x.closePath(); x.fill();
      // ชายฝั่งเขียวอ่อน
      x.strokeStyle = "rgba(120,150,90,0.5)"; x.lineWidth = 3; x.stroke();
    }
    x.globalAlpha = 1;
    // ขั้วโลก
    const cap = x.createLinearGradient(0, 0, 0, 60);
    x.fillStyle = "rgba(240,248,255,0.92)";
    x.fillRect(0, 0, w, 26 + Math.random() * 14);
    x.fillRect(0, h - (26 + Math.random() * 14), w, 40);
    // เมฆบาง
    x.fillStyle = "rgba(255,255,255,0.16)";
    for (let i = 0; i < 90; i++) {
      x.beginPath();
      x.ellipse(Math.random() * w, Math.random() * h, 20 + Math.random() * 90, 8 + Math.random() * 24, Math.random() * 3, 0, 7);
      x.fill();
    }
    return new (T().CanvasTexture)(c);
  }

  // Task 3: พื้นดินลานปล่อย — ดิน/หญ้าแห้ง + ตารางสำรวจ + คอนกรีตกลางลาน (ทำให้รู้สึกถึงสเกล)
  function groundTexture() {
    const S = 512;
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const x = c.getContext("2d");
    // ฐานดินอีสาน — น้ำตาลอมแดง ไล่เฉด
    x.fillStyle = "#5b4a30"; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) {
      const r = Math.random();
      x.fillStyle = r < 0.5 ? "rgba(74,60,38,0.5)" : r < 0.8 ? "rgba(108,92,58,0.4)" : "rgba(150,132,86,0.3)";
      const s = 1 + Math.random() * 4;
      x.fillRect(Math.random() * S, Math.random() * S, s, s);
    }
    // หย่อมหญ้าแห้ง
    for (let i = 0; i < 90; i++) {
      x.fillStyle = "rgba(120,124,68," + (0.12 + Math.random() * 0.16) + ")";
      x.beginPath();
      x.ellipse(Math.random() * S, Math.random() * S, 12 + Math.random() * 40, 8 + Math.random() * 26, Math.random() * 3, 0, 7);
      x.fill();
    }
    // ตารางสำรวจจาง ๆ
    x.strokeStyle = "rgba(255,255,255,0.05)"; x.lineWidth = 1;
    for (let i = 0; i <= S; i += 32) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i, S); x.stroke();
      x.beginPath(); x.moveTo(0, i); x.lineTo(S, i); x.stroke();
    }
    const tex = new (T().CanvasTexture)(c);
    tex.wrapS = tex.wrapT = T().RepeatWrapping;
    tex.repeat.set(26, 26);
    return tex;
  }

  function run(canvas, cfg, hooks) {
    const THREE = T();
    if (!THREE) throw new Error("THREE not available");

    const flight = window.Physics.createFlight(cfg);
    const meta = cfg.rocketMeta || {};
    const tier = meta.tier || 1;
    // Phase 12: หัวพลุ → บังคับฉากกลางคืน อากาศดีเสมอ + กล้องมุมผู้ชมบนพื้น
    const nightFW = !!meta.firework;
    const propType = (cfg.stages && cfg.stages[0] && cfg.stages[0].propType) || "solid";
    const liquid = propType === "liquid";
    const stageCount = (cfg.stages && cfg.stages.length) || 1;

    // ---------- Phase 4: สภาพอากาศ + ตัวจัดการพื้นผิว ----------
    const weather = nightFW
      // Phase 12: จุดพลุต้องเป็นกลางคืน "อากาศดีเสมอ" — ฟ้าโปร่ง ลมนิ่ง
      ? { type: "clear", cloudCover: 0.03, rainRate: 0, skyDark: 0, lightning: false, windGust: 0 }
      : (window.Physics && window.Physics.normalizeWeather)
        ? window.Physics.normalizeWeather(cfg.weather)
        : Object.assign({ type: "clear", cloudCover: 0.05, rainRate: 0, skyDark: 0, lightning: false, windGust: 0 }, cfg.weather || {});
    const TM = window.TextureManager ? window.TextureManager.init() : null;
    const tmReady = () => !!(TM && window.TextureManager.ready());
    const disposables = [];   // เทกซ์เจอร์ที่ต้อง dispose ตอนจบ
    function track(tex) { if (tex) disposables.push(tex); return tex; }

    // Phase 11: แปะลายข้างลำ (บั้งไฟ/โคม)
    function applySkinL(material, skinId, rough) {
      if (!window.Skins || !skinId || skinId === "plain" || !material) return;
      try {
        const tex = track(window.Skins.texture(THREE, skinId));
        material.map = tex;
        if (material.color) material.color.setHex(0xffffff);
        if (rough != null) material.roughness = rough;
        material.needsUpdate = true;
      } catch (e) { console.warn("[Launch3D] skin", e); }
    }

    // ---------- renderer / scene ----------
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = nightFW ? 1.18 : 1.05;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(nightFW ? 0x02030a : 0x0a1830);
    scene.fog = new THREE.FogExp2(nightFW ? 0x02030a : 0x0a1830, nightFW ? 0.0008 : 0.0016);

    const camera = new THREE.PerspectiveCamera(nightFW ? 68 : 52, 1, 0.1, 6000);
    camera.position.set(10, 6, 18);
    const lookTarget = new THREE.Vector3(0, 4, 0);

    // ---------- lights ----------
    const hemi = new THREE.HemisphereLight(nightFW ? 0x2a3a66 : 0x9ec8ff, 0x2a2016, nightFW ? 0.12 : 0.5);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d8, nightFW ? 0 : 1.15);
    sun.position.set(-30, 40, 20);
    scene.add(sun);
    // Phase 12: กลางคืน — ใช้แสงจันทร์นวล ๆ ผ่าน sun ที่มีอยู่แล้ว (ไม่เพิ่ม light ใหม่ = ไม่ recompile)
    if (nightFW) {
      sun.color.setHex(0xaec4ff);
      sun.position.set(24, 34, -18);
    }
    const exhaustLight = new THREE.PointLight(liquid ? 0x8ec4ff : 0xff8a3a, 0, 60, 2);
    scene.add(exhaustLight);

    // ---------- ground + pad (worldGroup sinks as altitude rises) ----------
    const worldGroup = new THREE.Group();
    scene.add(worldGroup);
    const groundTex = track(groundTexture());
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(600, 64),
      new THREE.MeshStandardMaterial({ map: groundTex, color: 0xffffff, roughness: 1, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    worldGroup.add(ground);
    // ลานปล่อยที่โล่งเตียน (ดินอัดแน่น) — จุดอ้างอิงสเกลใกล้จรวด
    const apron = new THREE.Mesh(
      new THREE.CircleGeometry(13, 44),
      new THREE.MeshStandardMaterial({ color: 0x6a5a42, roughness: 1, metalness: 0 })
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = 0.015;
    worldGroup.add(apron);
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(3.4, 3.8, 0.8, 20),
      new THREE.MeshStandardMaterial({ color: 0x3c3c44, roughness: 0.9 })
    );
    pad.position.y = 0.4;
    worldGroup.add(pad);
    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 12, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x2b2b33, roughness: 0.9 })
    );
    tower.position.set(-3.2, 6, 0);
    worldGroup.add(tower);
    // hazy horizon ring
    const horizon = new THREE.Mesh(
      new THREE.RingGeometry(560, 620, 64),
      new THREE.MeshBasicMaterial({ color: 0x101d33, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
    );
    horizon.rotation.x = -Math.PI / 2;
    worldGroup.add(horizon);

    // ---------- Phase 14: กริดเพดาน NOTAM (เรืองแสงจาง ๆ — worldGroup จมลงจนกริดมาถึงจรวดเมื่อถึงเพดาน) ----------
    let notamGrid = null;
    const NOTAM_CFG = cfg.notam && cfg.notam.ceiling ? cfg.notam : null;
    if (NOTAM_CFG && !nightFW) {
      notamGrid = new THREE.GridHelper(260, 22, 0xffffff, 0xffffff);
      notamGrid.material.transparent = true;
      notamGrid.material.opacity = 0.24;
      notamGrid.material.depthWrite = false;
      notamGrid.material.color.setHex(0x6fb4ff);
      notamGrid.position.y = altU(NOTAM_CFG.ceiling);
      worldGroup.add(notamGrid);
      const gp = new THREE.Mesh(
        new THREE.PlaneGeometry(260, 260),
        new THREE.MeshBasicMaterial({ color: 0x2f6fb8, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide })
      );
      gp.rotation.x = -Math.PI / 2;
      gp.position.y = notamGrid.position.y;
      worldGroup.add(gp);
      notamGrid.userData.glow = gp;
    }
    const notamHudEl = document.getElementById("notam-hud");
    const nhCeilEl = document.getElementById("nh-ceil");
    const nhRadEl = document.getElementById("nh-rad");
    if (notamHudEl) notamHudEl.hidden = !NOTAM_CFG;
    const mDispShort = m => m >= 1000 ? (m / 1000).toFixed(m >= 10000 ? 0 : 1) + "km" : Math.round(m) + "m";

    // ---------- Task 3: ชั้นเมฆอ้างอิงความสูง (มีเสมอ ไม่ใช่แค่ตอนอากาศแปรปรวน) ----------
    //   แผ่นเมฆกระจายที่ ~1.5 / 4 / 9 กม. — จรวดพุ่งผ่าน = รู้สึกถึงความเร็ว/ความสูงทันที
    const scaleCloudTex = track(cloudSprite());
    const cloudDecks = [];
    [[1400, 16, 0.34, 300], [4000, 13, 0.28, 460], [8500, 10, 0.22, 640]].forEach(([altM, n, op, spread]) => {
      const deck = new THREE.Group();
      deck.position.y = altU(altM);
      deck.userData.baseOp = op;
      deck.userData.altM = altM;
      worldGroup.add(deck);
      for (let i = 0; i < n; i++) {
        const m = new THREE.MeshBasicMaterial({
          map: scaleCloudTex, transparent: true, depthWrite: false, opacity: 0, side: THREE.DoubleSide
        });
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
        const sz = 16 + Math.random() * 34;                     // เล็กลง — เป็นปุยไม่ใช่กำแพง
        pl.scale.set(sz, sz * (0.4 + Math.random() * 0.28), 1);
        pl.position.set((Math.random() - 0.5) * spread, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * spread);
        pl.userData.drift = 1.2 + Math.random() * 2;
        pl.userData.op = op * (0.55 + Math.random() * 0.6);      // ทึบไม่เท่ากัน
        deck.add(pl);
      }
      cloudDecks.push(deck);
    });
    // Phase 13: พลุ — เอาเมฆออกให้หมด ท้องฟ้าเป็นผืนมืดสะอาด เห็นดอกพลุชัดทุกความสูง
    if (nightFW) cloudDecks.forEach(d => { d.visible = false; });
    function updateCloudDecks(dt, alt, spaceT) {
      if (nightFW) return;
      const wind = cfg.windSpeed || 0;
      const fade = Math.max(0, 1 - spaceT * 1.6);
      cloudDecks.forEach(deck => {
        // จางลงเมื่อกล้อง "อยู่ใน" ชั้นเมฆพอดี (ปุยที่วิ่งผ่าน = สื่อความเร็ว ไม่ใช่ผนังขาว)
        const passing = 1 - Math.min(1, Math.abs(alt - deck.userData.altM) / 550);
        const dist = Math.min(1, Math.abs(alt - deck.userData.altM) / 9000);   // ไกลเกินก็จาง
        const mul = fade * (1 - passing * 0.75) * (1 - dist * 0.6);
        deck.children.forEach(pl => {
          pl.lookAt(camera.position);
          pl.position.x += (pl.userData.drift + wind * 0.12) * dt;
          if (pl.position.x > 260) pl.position.x -= 520;
          pl.material.opacity += (pl.userData.op * mul - pl.material.opacity) * Math.min(1, dt * 2);
        });
      });
    }

    // ---------- Task 3: ฝุ่น/ละอองลมใกล้พื้น ----------
    const dustTex = track(softSprite());
    const DUSTN = 90;
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(DUSTN * 3);
    const dustVel = [];
    for (let i = 0; i < DUSTN; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 64;
      dustPos[i * 3 + 1] = 0.2 + Math.random() * 4.2;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 64;
      dustVel.push(0.4 + Math.random() * 1.2);
    }
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
      map: dustTex, color: 0xb09a78, size: 0.34, sizeAttenuation: true,
      transparent: true, opacity: 0, depthWrite: false
    }));
    dust.frustumCulled = false;
    worldGroup.add(dust);
    function updateDust(dt, alt) {
      const wind = cfg.windSpeed || 0;
      const near = Math.max(0, 1 - alt / 240);
      dust.material.opacity += (near * 0.38 - dust.material.opacity) * Math.min(1, dt * 2);
      if (dust.material.opacity < 0.01) return;
      const arr = dustGeo.attributes.position.array;
      for (let i = 0; i < DUSTN; i++) {
        arr[i * 3] += (dustVel[i] + wind * 0.35) * dt;
        arr[i * 3 + 1] += Math.sin(performance.now() * 0.001 + i) * 0.15 * dt;
        if (arr[i * 3] > 40) arr[i * 3] -= 80;
      }
      dustGeo.attributes.position.needsUpdate = true;
    }

    // ---------- starfield + ทางช้างเผือก (Phase 4) ----------
    const starPtsTex = track(softSprite());
    function starPoints(n, radius, sizeMul, opts) {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), sz = new Float32Array(n);
      const tint = new THREE.Color();
      // ทางช้างเผือก: ระนาบวงกลมใหญ่เอียง ~28° หนาแบบเกาส์เซียน
      const tilt = 0.48, ct = Math.cos(tilt), st = Math.sin(tilt);
      for (let i = 0; i < n; i++) {
        let dx, dy, dz;
        if (opts && opts.band) {
          const ang = Math.random() * Math.PI * 2;
          const thick = (Math.random() + Math.random() + Math.random() - 1.5) * (opts.bandThick || 0.16);
          dx = Math.cos(ang); dy = thick; dz = Math.sin(ang);
          const L = Math.hypot(dx, dy, dz); dx /= L; dy /= L; dz /= L;
          const ny = dy * ct - dz * st, nz = dy * st + dz * ct; dy = ny; dz = nz;
        } else {
          const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, sq = Math.sqrt(1 - u * u);
          dx = sq * Math.cos(th); dy = Math.abs(u) * 0.85 + 0.05; dz = sq * Math.sin(th);
        }
        const r = radius * (0.9 + Math.random() * 0.2);
        pos[i * 3] = dx * r; pos[i * 3 + 1] = dy * r; pos[i * 3 + 2] = dz * r;
        // สีดาว: ขาว-ฟ้า-ส้มอ่อน + dust lane มืดสำหรับแถบทางช้างเผือก
        const t = Math.random();
        if (opts && opts.band) {
          const dust = Math.random() < 0.22 ? 0.25 : 1;
          tint.setRGB(0.62 * dust, 0.66 * dust, 0.85 * dust);
        } else {
          tint.setHSL(0.55 + (t - 0.5) * 0.22, 0.55, 0.72 + Math.random() * 0.28);
        }
        col[i * 3] = tint.r; col[i * 3 + 1] = tint.g; col[i * 3 + 2] = tint.b;
        sz[i] = (opts && opts.band ? 1.4 : (Math.random() < 0.05 ? 3.2 : 1)) * sizeMul;
      }
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const mat = new THREE.PointsMaterial({
        map: starPtsTex, size: 3 * sizeMul, sizeAttenuation: false, vertexColors: true,
        transparent: true, opacity: 0, depthWrite: false,
        blending: opts && opts.band ? THREE.AdditiveBlending : THREE.NormalBlending
      });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      pts.renderOrder = -2;
      scene.add(pts);
      return pts;
    }
    const stars = starPoints(4200, 3400, 1);
    const milkyWay = starPoints(2600, 3200, 0.9, { band: true, bandThick: 0.14 });
    const starLayers = [stars, milkyWay];
    function setStarOpacity(v) {
      stars.material.opacity = Math.max(0, v);
      milkyWay.material.opacity = Math.max(0, v * 0.7);
    }

    // ---------- โลกโค้ง + ชั้นบรรยากาศเรืองแสง (Fresnel) สำหรับมุมวงโคจร ----------
    const earthGroup = new THREE.Group();
    earthGroup.position.set(0, -960, 0);
    earthGroup.visible = false;
    scene.add(earthGroup);
    const earthSurf = new THREE.Mesh(
      new THREE.SphereGeometry(900, 72, 48),
      new THREE.MeshStandardMaterial({
        map: track(earthSurfaceTexture()), roughness: 1, metalness: 0,
        emissive: 0x0a1830, emissiveIntensity: 0.22
      })
    );
    earthGroup.add(earthSurf);
    const atmoUniforms = {
      uDay: { value: new THREE.Color(0x2360d8) },
      uTerm: { value: new THREE.Color(0xff6a1e) },
      uSun: { value: new THREE.Vector3(-30, 40, 20).normalize() },
      uCenter: { value: new THREE.Vector3(0, -960, 0) }
    };
    const atmoMat = new THREE.ShaderMaterial({
      uniforms: atmoUniforms,
      transparent: true, depthWrite: false,
      side: THREE.BackSide, blending: THREE.AdditiveBlending,
      vertexShader:
        "varying vec3 vWorld;\n" +
        "void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }",
      fragmentShader:
        "precision highp float;\n" +
        "uniform vec3 uDay; uniform vec3 uTerm; uniform vec3 uSun; uniform vec3 uCenter;\n" +
        "varying vec3 vWorld;\n" +
        "void main(){\n" +
        "  vec3 radial = normalize(vWorld - uCenter);\n" +
        "  vec3 V = normalize(cameraPosition - vWorld);\n" +
        "  float rim = pow(1.0 - abs(dot(V, radial)), 3.4);\n" +
        "  float sd = dot(radial, normalize(uSun));\n" +
        "  float day = smoothstep(-0.1, 0.55, sd);\n" +
        "  float term = smoothstep(-0.5, -0.02, sd) * (1.0 - smoothstep(-0.02, 0.42, sd));\n" +
        "  vec3 col = mix(uDay, uTerm, term * 0.85);\n" +
        "  float a = rim * (0.12 + 0.5 * day) + term * rim * 0.55;\n" +
        "  gl_FragColor = vec4(col, clamp(a, 0.0, 0.8));\n" +
        "}"
    });
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(900 * 1.055, 72, 48), atmoMat);
    earthGroup.add(atmo);
    const earth = earthGroup;   // alias เดิม

    // ---------- ขยะอวกาศ + CubeSat (Phase 4) — โผล่เมื่อ alt > 100 km ----------
    const traffic = (function buildTraffic() {
      const g = new THREE.Group();
      g.visible = false;
      scene.add(g);
      const metalM = tmReady() ? window.TextureManager.clone("mat_metal")
        : new THREE.MeshStandardMaterial({ color: 0x9aa1ab, roughness: 0.5, metalness: 0.7 });
      const solarM = tmReady() ? window.TextureManager.clone("mat_solar")
        : new THREE.MeshStandardMaterial({ color: 0x1e49aa, roughness: 0.3, metalness: 0.5, emissive: 0x0a1a44 });
      if (metalM.emissive) { metalM.emissive.setHex(0x1c2330); metalM.emissiveIntensity = 0.35; }
      const bodyGeo = new THREE.BoxGeometry(1, 1, 1.4);
      const panelGeo = new THREE.PlaneGeometry(3.4, 1.15);
      const items = [];
      for (let i = 0; i < 32; i++) {
        const sat = new THREE.Group();
        const sz = 1.1 + Math.random() * 2.4;
        const body = new THREE.Mesh(bodyGeo, metalM); body.scale.setScalar(sz); sat.add(body);
        if (Math.random() > 0.22) {
          const p1 = new THREE.Mesh(panelGeo, solarM); p1.position.x = sz * 2.0; sat.add(p1);
          const p2 = new THREE.Mesh(panelGeo, solarM); p2.position.x = -sz * 2.0; sat.add(p2);
        }
        const a = Math.random() * Math.PI * 2, rr = 34 + Math.random() * 190;
        sat.position.set(Math.cos(a) * rr, 4 + (Math.random() - 0.5) * 150, Math.sin(a) * rr - 30);
        sat.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        g.add(sat);
        items.push({
          sat,
          drift: new THREE.Vector3((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 1.5),
          spin: new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6)
        });
      }
      // เศษชิ้นเล็ก
      const dN = 160, dp = new Float32Array(dN * 3);
      for (let i = 0; i < dN; i++) {
        const a = Math.random() * Math.PI * 2, rr = 36 + Math.random() * 300;
        dp[i * 3] = Math.cos(a) * rr; dp[i * 3 + 1] = (Math.random() - 0.5) * 260; dp[i * 3 + 2] = Math.sin(a) * rr - 26;
      }
      const dgeo = new THREE.BufferGeometry();
      dgeo.setAttribute("position", new THREE.BufferAttribute(dp, 3));
      const debris = new THREE.Points(dgeo, new THREE.PointsMaterial({
        map: track(softSprite()), color: 0xd6dce6, size: 1.4, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false
      }));
      debris.frustumCulled = false;
      g.add(debris);
      return { group: g, items, debris };
    })();
    function updateTraffic(dt, alt) {
      const on = alt > 100000;
      traffic.group.visible = on;
      if (!on) return;
      traffic.group.rotation.y += dt * 0.015;      // ล่องไปตามวงโคจรช้า ๆ
      traffic.debris.rotation.y -= dt * 0.008;
      const B = 320;
      traffic.items.forEach(it => {
        const p = it.sat.position;
        p.addScaledVector(it.drift, dt);
        if (p.x > B) p.x -= 2 * B; else if (p.x < -B) p.x += 2 * B;
        if (p.z > B - 26) p.z -= 2 * B; else if (p.z < -B - 26) p.z += 2 * B;
        if (p.y > 170) p.y -= 340; else if (p.y < -170) p.y += 340;
        it.sat.rotation.x += it.spin.x * dt;
        it.sat.rotation.y += it.spin.y * dt;
        it.sat.rotation.z += it.spin.z * dt;
      });
    }

    // ---------- rocket ----------
    const rocket = new THREE.Group();
    scene.add(rocket);
    const rParts = [];
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe8e9ee, roughness: 0.5, metalness: 0.3 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x2e4a7a, roughness: 0.6 });
    // Phase 4: เลือกวัสดุพื้นผิวตามชนิดจรวด (ไผ่ / กระดาษสา / โลหะ / โซลาร์)
    const pvcBody = meta.body === "pvc";
    const baseKind = tier === 1 ? "mat_paper"
      : (tier <= 2 || cfg.structure === "blackpowder") ? "mat_bamboo"
        : "mat_metal";
    function pmat(kind) {
      let m;
      if (tmReady()) m = window.TextureManager.clone(kind);
      else m = (kind === "mat_metal" || kind === "mat_solar" ? trimMat : bodyMat).clone();
      // Phase 5: ลำท่อ PVC = ผิวพลาสติกขาวเทา (จาก texture ไม้ไผ่ย้อมสีใหม่)
      if (pvcBody && kind === "mat_bamboo" && m.color) {
        m.color.setHex(0xdcddd6); m.roughness = 0.5; m.metalness = 0.05;
      }
      return m;
    }

    if (tier === 1) { tower.visible = false; }   // โคม/พลุ ไม่ได้ยิงจากร้านบั้งไฟ/เสาปล่อย

    // ─────────────────────────────────────────────────────────────────────────
    //  TODO (Phase 18 · "Yi Peng" / ยี่เป็ง) — spawnYiPengBackground()
    //  เติมท้องฟ้าด้วยโคมลอยพื้นหลังหลายร้อยดวงระหว่างปล่อย Khom เพื่อบรรยากาศงานยี่เป็ง
    //  แผน implementation:
    //   • สร้าง THREE.InstancedMesh (ทรงกระบอกกระดาษสาย่อ ~0.3 หน่วย) 200–400 อินสแตนซ์
    //     กระจายในโดม r≈80–260, y≈8–120, พร้อม emissive สีส้มอุ่น + ต่อ 1 PointLight รวม (แชร์)
    //   • ต่อเป็นลูกของ worldGroup? — ไม่: ต้องลอยขึ้นอิสระ ใช้ group แยก + ต่อ scene
    //   • อัปเดตต่อเฟรม: y += drift 0.15–0.5 u/s, ส่าย x/z เบา ๆ (sin), ดวงที่พ้น y>140 รีไซเคิลลงล่าง
    //   • ความสว่างหายใจต่อดวง: instanceColor *= (0.8 + 0.2·sin(t·rate + phase))
    //   • เรียกจาก run() เมื่อ meta.lantern (และอาจ meta.firework กลางคืน); dispose ใน cleanup()
    //   • ผูกจำนวนกับ performance budget / มี flag ปิดสำหรับเครื่องช้า
    //  function spawnYiPengBackground(count) { /* not yet implemented */ }
    // ─────────────────────────────────────────────────────────────────────────

    if (tier === 1 && meta.lantern) {
      // ---- โคมลอย: ทรงกระบอกกระดาษสา เปิดก้น มีไฟเรืองข้างใน ยืนใกล้พื้น ----
      pad.visible = false;                        // โคมลอยปล่อยจากมือ/พื้น ไม่มีแท่นเหล็ก
      const KR = 1.55, KH = 3.8;                  // รัศมี / ความสูงลำโคม (โตขึ้นให้เห็นชัดบนจอ)
      const CY = 0.35 + KH / 2;                   // ก้นโคมอยู่เหนือพื้นเล็กน้อย
      const paperMat = pmat("mat_paper");
      paperMat.color.setHex(0xf3dcae);
      paperMat.roughness = 0.95; paperMat.metalness = 0;
      paperMat.side = THREE.DoubleSide;
      // Phase 17.1 · โคมต้องเป็นกระดาษสาทึบ เห็นลาย/สีเต็ม ไม่ใช่ผี — เรืองแสงด้วย
      // emissive สีส้มอุ่น + PointLight ด้านในแทนความโปร่งแสง
      paperMat.transparent = false; paperMat.opacity = 1.0;
      applySkinL(paperMat, meta.skin, 0.92);                  // Phase 11: ลายข้างโคม
      if (paperMat.emissive) { paperMat.emissive.setHex(0xff7b2e); paperMat.emissiveIntensity = 0.55; }
      // ลำโคม — ทรงกระบอกเรียวเล็กน้อย เปิดก้น (openEnded)
      const shell = new THREE.Mesh(
        new THREE.CylinderGeometry(KR * 1.04, KR, KH, 28, 1, true), paperMat);
      shell.position.y = CY;
      rocket.add(shell); rParts.push({ mesh: shell, stage: 1, baseY: CY });
      // ยอดโคม — โดมตื้น ๆ ปิดด้านบน (ไม่ใช่ทรงไข่)
      const topMat = paperMat.clone(); topMat.color.setHex(0xecd0a0);
      const top = new THREE.Mesh(new THREE.SphereGeometry(KR * 1.04, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), topMat);
      top.position.y = CY + KH / 2; top.scale.y = 0.44;
      rocket.add(top); rParts.push({ mesh: top, stage: 1 });
      // โครงลวดปากโคม + กากบาทลวดยึดเชื้อเพลิง
      const wireMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.9, metalness: 0.3 });
      const rim = new THREE.Mesh(new THREE.TorusGeometry(KR * 1.03, 0.05, 6, 28), wireMat);
      rim.rotation.x = Math.PI / 2; rim.position.y = CY - KH / 2;
      rocket.add(rim);
      [0, Math.PI / 2].forEach(a => {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, KR * 2.1, 5), wireMat);
        w.rotation.z = Math.PI / 2; w.rotation.y = a; w.position.y = CY - KH / 2;
        rocket.add(w);
      });
      // ---- ไฟข้างใน: fire core (over-bright → ติด UnrealBloomPass แน่นอน) + PointLight + เปลว ----
      const coreY = CY - KH / 2 + 0.55;
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, toneMapped: false });
      coreMat.color.setRGB(3.0, 1.35, 0.32);       // ค่าทะลุ 1.0 = สว่างเกินขีด bloom (threshold 0.85)
      const fireCore = new THREE.Mesh(new THREE.SphereGeometry(0.30, 16, 12), coreMat);
      fireCore.position.y = coreY;
      rocket.add(fireCore);
      const flameMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.92, toneMapped: false });
      flameMat.color.setRGB(2.1, 1.1, 0.33);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.95, 12), flameMat);
      flame.position.y = coreY + 0.55;
      rocket.add(flame);
      const lamp = new THREE.PointLight(0xff7700, 4.5, 15, 2);
      lamp.position.y = coreY;
      rocket.add(lamp);
      // แสงเสริมกลางลำ ให้กระดาษสาทั้งใบเรืองอุ่น
      const glow = new THREE.PointLight(0xffb45a, 3.0, 17, 2);
      glow.position.y = CY;
      rocket.add(glow);
      rocket.userData.khomLamp = lamp;
      rocket.userData.khomGlow = glow;
      rocket.userData.khomFlame = flame;
      rocket.userData.khomCore = fireCore;
    } else if (tier === 1) {
      // ---- พลุ: ลูกพลุกลม + ชนวน (ไม่ใช่จรวด ไม่มีครีบ) — ยิงจากท่อครก (mortar) ----
      const shR = 0.62 * ((meta.firework && meta.firework.burstScale) || 1);
      const shMat = pmat("mat_bamboo"); if (shMat.color) shMat.color.setHex(0x8a3a2c);
      shMat.roughness = 0.9;
      const shell = new THREE.Mesh(new THREE.SphereGeometry(shR, 22, 16), shMat);
      shell.position.y = 2.5; shell.scale.y = 1.1;
      rocket.add(shell); rParts.push({ mesh: shell, stage: 1, baseY: 2.5 });
      const band = new THREE.Mesh(new THREE.TorusGeometry(shR, 0.05, 6, 22),
        new THREE.MeshStandardMaterial({ color: 0xcaa24a, roughness: 0.8 }));
      band.rotation.x = Math.PI / 2; band.position.y = 2.5;
      rocket.add(band);
      const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.7, 6),
        new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 1 }));
      fuse.position.set(0.14, 2.5 + shR + 0.5, 0); fuse.rotation.z = 0.35;
      rocket.add(fuse);

      if (meta.firework) {
        // แร็คท่อครก (mortar rack) แทนร้านบั้งไฟ — ท่อ HDPE เรียงกัน จมตามพื้น
        pad.visible = false; tower.visible = false;
        const rack = new THREE.Group();
        const tubeMat = new THREE.MeshStandardMaterial({ color: 0x24405c, roughness: 0.5, metalness: 0.15 });
        const capMat = new THREE.MeshStandardMaterial({ color: 0x0e1b28, roughness: 0.8 });
        const TUBES = 5, TH = 4.4, TR = 0.72;
        for (let i = 0; i < TUBES; i++) {
          const x = (i - (TUBES - 1) / 2) * (TR * 2.35);
          const tube = new THREE.Mesh(new THREE.CylinderGeometry(TR, TR, TH, 18, 1, true), tubeMat);
          tube.position.set(x, TH / 2, 0);
          rack.add(tube);
          const capB = new THREE.Mesh(new THREE.CylinderGeometry(TR * 1.05, TR * 1.05, 0.25, 18), capMat);
          capB.position.set(x, 0.12, 0);
          rack.add(capB);
        }
        // ฐานไม้ยึดท่อ
        const beam = new THREE.Mesh(new THREE.BoxGeometry(TUBES * TR * 2.35, 0.5, TR * 2.4),
          new THREE.MeshStandardMaterial({ color: 0x5a4327, roughness: 0.95 }));
        beam.position.y = 1.1;
        rack.add(beam);
        rack.position.y = 0.02;
        worldGroup.add(rack);
        rocket.userData.mortarTubeH = TH;   // ลูกพลุเริ่มจมอยู่ในท่อ
      }
    } else if (meta.bangfai) {
      // ---- บั้งไฟ: ลำสั้นเรียว (ไม้ไผ่/PVC) + หางไม้ไผ่ยาวกว่าลำมาก · ไม่มีครีบเลย ----
      const BR = 0.32, BH = 4.0;
      const bMat = pmat("mat_bamboo");                  // pmat จัดการ recolor PVC เป็นเทาพลาสติกเอง
      bMat.roughness = pvcBody ? 0.42 : 0.78;
      applySkinL(bMat, meta.skin, 0.6);                 // Phase 11: ลายบั้งไฟเอ้
      const body = new THREE.Mesh(new THREE.CylinderGeometry(BR, BR, BH, 20), bMat);
      body.position.y = 1.0 + BH / 2;
      rocket.add(body);
      rParts.push({ mesh: body, stage: 1, baseY: body.position.y, h: BH });
      // หัวไม้อุด (nose plug) — กรวยสั้นทู่
      const cap = new THREE.Mesh(new THREE.ConeGeometry(BR * 1.02, BR * 2.1, 20),
        new THREE.MeshStandardMaterial({ color: 0x6b4f2e, roughness: 0.85 }));
      cap.position.y = 1.0 + BH + BR * 0.95;
      rocket.add(cap); rParts.push({ mesh: cap, stage: 1, baseY: cap.position.y });
      // หาง (ไม้ไผ่ทั้งลำ ~240–290 ซม.) — กระบอกเรียว ยาวกว่าลำ ~1.8 เท่า ไม่มีครีบ
      const tailCm = meta.tailLengthCm || 270;
      const TL = Math.min(9.5, Math.max(5.0, tailCm / 100 * 2.7));
      const tailMat = new THREE.MeshStandardMaterial({ color: 0xb08a4e, roughness: 0.8 });
      if (tmReady()) { const tm = window.TextureManager.clone("mat_bamboo"); if (tm.map) tailMat.map = tm.map; }
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.15, TL, 8), tailMat);
      const bindY = 1.0 + (meta.tailAttachCm ? Math.min(1.8, meta.tailAttachCm / 100 * 2.7) : 1.0);
      tail.position.set(BR + 0.14, bindY - TL * 0.40, 0.05);
      tail.rotation.x = 0.13;                           // สะบัดไปด้านหลังนิด ๆ
      rocket.add(tail);
      // เชือกมัดหาง (มัดเข้าบั้ง) — วงแหวน 3 จุด
      const lashMat = new THREE.MeshStandardMaterial({ color: 0x3a2c1c, roughness: 1 });
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(BR + 0.06, 0.04, 6, 14), lashMat);
        ring.rotation.y = Math.PI / 2;
        ring.position.set(BR * 0.4, bindY - 0.1 - i * 0.42, 0);
        rocket.add(ring);
      }
      // ร้านยิงบั้งไฟ (bamboo scaffold) — ส่วนของพื้น จม-ตามเมื่อจรวดขึ้น
      const railMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.9 });
      [[-0.7, -0.5], [1.0, 0.55]].forEach(([xo, zo]) => {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 10, 8), railMat);
        pole.position.set(xo, 4.9, zo);
        worldGroup.add(pole);
      });
      for (let h = 1.8; h < 8; h += 2.2) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.9, 6), railMat);
        bar.rotation.z = Math.PI / 2; bar.position.set(0.15, h, 0.02);
        worldGroup.add(bar);
      }
      tower.visible = false;
    } else if (meta.talai) {
      // ---- ตะไล: ล้อไผ่กลม (ปีกวงกลม) + ดุมบ้องดินไม้รวก · หมุนควงพ่นไฟเป็นเกลียว ----
      tower.visible = false; pad.visible = false;
      const wd = Math.min(2.7, Math.max(1.25, (meta.talaiWingDia || 24) / 24 * 1.7));
      const HUB_Y = 1.5;
      const bamboo = pmat("mat_bamboo");

      // ดุมกลาง — บ้องดินไม้รวก (เตี้ย อ้วน) — เกือบเสมอปีก ไม่ใช่แท่งหอก
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.44, 0.6, 20), bamboo);
      hub.position.y = HUB_Y + 0.05;
      rocket.add(hub); rParts.push({ mesh: hub, stage: 1, baseY: hub.position.y, h: 0.6 });
      const capT = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.42, 0.12, 20),
        new THREE.MeshStandardMaterial({ color: 0x6b4f2e, roughness: 0.85 }));
      capT.position.y = HUB_Y + 0.05 + 0.36; rocket.add(capT); rParts.push({ mesh: capT, stage: 1, baseY: capT.position.y });

      // ปีกวงกลม — วงแหวนไผ่หนา วางแนวนอน + วงในเสริม
      const rimMat = pmat("mat_bamboo"); if (rimMat.color) rimMat.color.multiplyScalar(0.8);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(wd, 0.13, 14, 60), rimMat);
      rim.rotation.x = Math.PI / 2; rim.position.y = HUB_Y;
      rocket.add(rim); rParts.push({ mesh: rim, stage: 1, baseY: HUB_Y });
      const rimIn = new THREE.Mesh(new THREE.TorusGeometry(wd * 0.56, 0.055, 10, 44), rimMat);
      rimIn.rotation.x = Math.PI / 2; rimIn.position.y = HUB_Y;
      rocket.add(rimIn);

      // ซี่ล้อ — ทรงกระบอก 4 ซี่ นอนราบ
      const spokeMat = new THREE.MeshStandardMaterial({ color: 0x7a5a34, roughness: 0.9 });
      for (let k = 0; k < 4; k++) {
        const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, wd * 2, 8), spokeMat);
        sp.rotation.z = Math.PI / 2;
        sp.rotation.y = k * Math.PI / 2;
        sp.position.y = HUB_Y;
        rocket.add(sp);
      }

      // ตำแหน่งรูประทุ 3 รู (local offset) — ใช้พ่นไฟเฉียงลง+สัมผัสวง → หางควง
      rocket.userData.talaiJets = [
        { a: 0,               r: wd * 0.62, y: HUB_Y - 0.35 },
        { a: 2 * Math.PI / 3, r: wd * 0.62, y: HUB_Y - 0.35 },
        { a: 4 * Math.PI / 3, r: wd * 0.62, y: HUB_Y - 0.35 }
      ];
    } else {
      const rad = tier <= 2 ? 0.5 : tier === 3 ? 0.7 : tier === 4 ? 1.0 : 1.25;
      const nStack = Math.max(1, stageCount);
      let y = 1.0;
      for (let i = 0; i < nStack; i++) {                // stage 1 (i=0) = ท่อนล่างสุด
        const h = tier <= 2 ? 4.5 : (nStack === 1 ? 5.5 : (i === 0 ? 5.2 : 3.4));
        const segRad = rad * (1 - i * 0.13);
        let segKind = baseKind;
        if (cfg.orbital && i === nStack - 1) segKind = "mat_solar";
        const segMat = pmat(segKind);
        if (i % 2 && segKind !== "mat_solar") segMat.color.multiplyScalar(0.72);
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(segRad, rad * (1 - Math.max(0, i - 1) * 0.13), h, 24),
          segMat);
        seg.position.y = y + h / 2;
        rocket.add(seg);
        rParts.push({ mesh: seg, stage: i + 1, baseY: seg.position.y, h });
        y += h;
      }
      const topRad = rad * (1 - (nStack - 1) * 0.13);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(topRad, topRad * 2.6, 24), pmat(baseKind));
      nose.position.y = y + topRad * 1.3;
      rocket.add(nose); rParts.push({ mesh: nose, stage: nStack, baseY: nose.position.y });

      // Phase 8: เพย์โหลด Tier 4–5 เป็นโมเดล .glb จริง (NASA) แทนก้อนทึบ
      if (window.ModelManager && meta.payloadId && window.ModelManager.isModelPayload(meta.payloadId)) {
        const plHolder = new THREE.Group();
        plHolder.position.y = y + topRad * 0.5;
        rocket.add(plHolder);
        rParts.push({ mesh: plHolder, stage: nStack, baseY: plHolder.position.y });
        window.ModelManager.forPayload(meta.payloadId, { size: topRad * 1.7, emissive: 0x1b3a66, emissiveIntensity: 0.28 })
          .then(m => { if (m && !canceled) { plHolder.add(m); plHolder.userData.spin = 0.4; } })
          .catch(e => console.warn("[Launch3D] payload model", e));
      }
      // fins on stage 1 (บริเวณฐาน)
      const finMat = new THREE.MeshStandardMaterial({ color: 0xb23a3a, roughness: 0.6 });
      for (let k = 0; k < 4; k++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.8, 1.3), finMat);
        fin.position.set(Math.cos(k * Math.PI / 2) * rad, 1.6, Math.sin(k * Math.PI / 2) * rad);
        fin.lookAt(0, 1.6, 0);
        rocket.add(fin); rParts.push({ mesh: fin, stage: 1, baseY: 1.6 });
      }
    }
    const NOZZLE_Y = 0.9;

    // ---------- Task 5: ไอพ่นเรืองแสง (exhaust plume) — กรวยเรืองสว่างที่ปลายท่อ ----------
    //   ทุกจรวดที่มีเครื่องยนต์จริง (ยกเว้นโคม = ไม่มีไอพ่น, ตะไล = พ่นจากขอบล้อ)
    let plume = null, plumeCore = null;
    if (!meta.lantern && !meta.talai) {
      const pMat = new THREE.MeshBasicMaterial({
        color: liquid ? 0x8fc4ff : 0xffae5c, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide
      });
      pMat.color.multiplyScalar(1.7);   // over-bright → ติด bloom
      plume = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.6, 20, 1, true), pMat);
      plume.rotation.x = Math.PI;       // ชี้ลง
      plume.renderOrder = 3;
      rocket.add(plume);
      const cMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide
      });
      plumeCore = new THREE.Mesh(new THREE.ConeGeometry(0.24, 2.0, 16, 1, true), cMat);
      plumeCore.rotation.x = Math.PI;
      plumeCore.renderOrder = 4;
      rocket.add(plumeCore);
    }

    // ---------- particles ----------
    const sprite = softSprite();
    function makePoints(n, size, add) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const mat = new THREE.PointsMaterial({
        size, map: sprite, vertexColors: true, transparent: true, depthWrite: false,
        blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true, opacity: add ? 0.9 : 0.5
      });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      scene.add(pts);
      return { pts, geo, pool: Array.from({ length: n }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1, grow: 0 })) };
    }
    const flame = makePoints(260, 0.9, true);
    const smoke = makePoints(420, 2.6, false);

    // Phase 8/12/13: หัวพลุเฉลิมฉลอง — จุดระเบิดหลายชั้นตอนถึง apogee (vy ≤ 0)
    const fx = [];
    let fwFired = false, fwBurstY = null, fwChemTimer = 0, fwFuseT = 0, fwChemShown = false;
    const fwChemEl = document.getElementById("fw-chem");

    // Phase 13: ท่อครก — ลูกพลุค้างในท่อจนกดปุ่ม "จุดพลุ" (จรวดปกติเริ่มทันที)
    let fwArmed = !nightFW;
    const fwIgniteBtn = document.getElementById("fw-ignite");
    if (nightFW && fwIgniteBtn) {
      fwIgniteBtn.hidden = false;
      fwIgniteBtn.onclick = () => { fwArmed = true; fwIgniteBtn.hidden = true; };
    }
    if (nightFW && canvas.parentElement) canvas.parentElement.classList.add("fw-mode");

    // Phase 13: หางประกายขาขึ้น — ให้ตาผู้ชมตามลูกพลุในฟ้ามืด
    const fwTrail = nightFW ? makePoints(220, 0.5, true) : null;
    function emitFwTrail(px, py) {
      if (!fwTrail) return;
      let c = 0;
      for (const p of fwTrail.pool) {
        if (p.life > 0) continue;
        p.life = p.max = 0.5 + Math.random() * 0.55;
        p.x = px + (Math.random() - 0.5) * 0.28;
        p.y = py + (Math.random() - 0.5) * 0.25;
        p.z = (Math.random() - 0.5) * 0.28;
        p.vx = (Math.random() - 0.5) * 0.55;
        p.vy = -1.1 - Math.random() * 1.6;
        p.vz = (Math.random() - 0.5) * 0.55;
        p.grow = 0;
        p.r = 1; p.g = 0.72 + Math.random() * 0.22; p.b = 0.32 + Math.random() * 0.22;
        if (++c > 3) break;
      }
    }

    // ---------- ระบบสภาพอากาศ (Phase 4): เมฆ / ฝน / ฟ้าผ่า ----------
    const wxActive = weather.cloudCover > 0.12 || weather.rainRate > 0.02 || weather.skyDark > 0.05;
    const wx = (function buildWeather() {
      // --- ชั้นเมฆ: แผ่นบิลบอร์ดฟู ๆ อยู่ที่ระดับ ~2 กม. (จมไปกับ worldGroup) ---
      const cloudTex = track(cloudSprite());
      const cloudGrp = new THREE.Group();
      cloudGrp.position.y = 42;                 // ≈ altU(2000)
      worldGroup.add(cloudGrp);
      const clouds = [];
      const nC = Math.round(6 + weather.cloudCover * 20);
      for (let i = 0; i < nC; i++) {
        const m = new THREE.MeshBasicMaterial({
          map: cloudTex, transparent: true, depthWrite: false, opacity: 0, side: THREE.DoubleSide
        });
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
        const s = 26 + Math.random() * 60;
        pl.scale.set(s, s * (0.5 + Math.random() * 0.3), 1);
        pl.position.set((Math.random() - 0.5) * 260, (Math.random() - 0.5) * 26, (Math.random() - 0.5) * 260);
        pl.userData.spin = (Math.random() - 0.5) * 0.02;
        cloudGrp.add(pl); clouds.push(pl);
      }

      // --- ฝน: เส้นสายฝนตกลงแนวดิ่ง (LineSegments) ตามกล้อง ---
      const rainN = 1100;
      const rpos = new Float32Array(rainN * 6);
      const RBOX = 110, RH = 90;
      for (let i = 0; i < rainN; i++) {
        const x = (Math.random() - 0.5) * RBOX, yy = Math.random() * RH, z = (Math.random() - 0.5) * RBOX;
        const len = 1.4 + Math.random() * 2.2;
        rpos[i * 6] = x; rpos[i * 6 + 1] = yy; rpos[i * 6 + 2] = z;
        rpos[i * 6 + 3] = x; rpos[i * 6 + 4] = yy - len; rpos[i * 6 + 5] = z;
      }
      const rgeo = new THREE.BufferGeometry();
      rgeo.setAttribute("position", new THREE.BufferAttribute(rpos, 3));
      const rain = new THREE.LineSegments(rgeo, new THREE.LineBasicMaterial({
        color: 0xaec2de, transparent: true, opacity: 0, depthWrite: false
      }));
      rain.frustumCulled = false;
      scene.add(rain);

      // --- ฟ้าผ่า: PointLight กะพริบเหนือชั้นเมฆ ---
      const bolt1 = new THREE.PointLight(0xcfe0ff, 0, 500, 2);
      const bolt2 = new THREE.PointLight(0xe8f0ff, 0, 500, 2);
      scene.add(bolt1); scene.add(bolt2);

      return {
        cloudGrp, clouds, rain, RH, bolt1, bolt2,
        boltNext: 1.5 + Math.random() * 4, flash: 0
      };
    })();

    // เรียกทุกเฟรม — คืนค่าความสว่างแฟลชฟ้าผ่า (0..1) ให้โค้ดท้องฟ้าเอาไปใช้
    function updateWeather(dt, alt, spaceT) {
      if (!wxActive) return 0;
      const atmoFade = Math.max(0, 1 - spaceT * 1.4);
      const windSpd = cfg.windSpeed || 0;

      // เมฆ — บิลบอร์ดหันเข้ากล้อง, เลื่อนตามลม, มืดลงตาม skyDark
      const cloudTone = 0.85 - weather.skyDark * 0.62;
      const cloudOp = Math.min(0.92, (0.12 + weather.cloudCover * 0.8)) * atmoFade;
      wx.cloudGrp.children.forEach(pl => {
        pl.lookAt(camera.position);
        pl.position.x += (2.2 + windSpd * 0.15) * dt;
        pl.rotation.z += pl.userData.spin;
        if (pl.position.x > 150) pl.position.x -= 300;
        pl.material.opacity += (cloudOp - pl.material.opacity) * Math.min(1, dt * 2);
        pl.material.color.setRGB(cloudTone, cloudTone, cloudTone * 1.05);
      });

      // ฝน — กล่องฝนเกาะตามจรวด/กล้อง, ตกลงพร้อมความเอียงตามลม
      const rainOp = weather.rainRate * 0.5 * atmoFade;
      const rm = wx.rain;
      rm.material.opacity += (rainOp - rm.material.opacity) * Math.min(1, dt * 3);
      rm.visible = rm.material.opacity > 0.01;
      if (rm.visible) {
        rm.position.x = rocket.position.x;
        rm.position.y = lookTarget.y - wx.RH * 0.5 + 6;
        rm.rotation.z = Math.max(-0.5, Math.min(0.5, -windSpd * 0.03));
        const arr = rm.geometry.attributes.position.array;
        const vy = (52 + weather.rainRate * 40) * dt;
        for (let i = 0; i < arr.length; i += 6) {
          arr[i + 1] -= vy; arr[i + 4] -= vy;
          if (arr[i + 1] < 0) { arr[i + 1] += wx.RH; arr[i + 4] += wx.RH; }
        }
        rm.geometry.attributes.position.needsUpdate = true;
      }

      // ฟ้าผ่า
      wx.flash *= Math.pow(0.015, dt);
      if (weather.lightning && alt < 14000) {
        wx.boltNext -= dt;
        if (wx.boltNext <= 0) {
          wx.boltNext = 1.6 + Math.random() * 5.5;
          const L = Math.random() > 0.5 ? wx.bolt1 : wx.bolt2;
          L.position.set((Math.random() - 0.5) * 150, 50 + Math.random() * 46, (Math.random() - 0.5) * 150);
          L.intensity = 10 + Math.random() * 16;
          wx.flash = 0.55 + Math.random() * 0.45;
          shake = Math.max(shake, 0.05);
          if (window.Operator && Math.random() > 0.6) window.Operator.event && window.Operator.event("maxq");
        }
      }
      [wx.bolt1, wx.bolt2].forEach(L => {
        if (L.intensity > 0.02) {
          L.intensity *= Math.pow(0.0009, dt);
          if (L.intensity > 3 && Math.random() < dt * 14) L.intensity *= 2.1;   // re-strike flicker
        } else L.intensity = 0;
      });
      return wx.flash * atmoFade;
    }

    function emitFlame(px, py, pz, power) {
      let c = 0;
      for (const p of flame.pool) {
        if (p.life > 0) continue;
        p.life = p.max = 0.14 + Math.random() * 0.3;
        p.x = px + (Math.random() - 0.5) * 0.5;
        p.y = py; p.z = pz + (Math.random() - 0.5) * 0.5;
        const spread = 0.9;
        p.vx = (Math.random() - 0.5) * spread;
        p.vy = -6 - Math.random() * 10 * power;
        p.vz = (Math.random() - 0.5) * spread;
        p.grow = 0;
        if (liquid) { p.r = 0.55 + Math.random() * 0.4; p.g = 0.75; p.b = 1; }
        else { p.r = 1; p.g = 0.5 + Math.random() * 0.3; p.b = 0.15; }
        if (++c > 6) break;
      }
    }
    // ตะไล: พ่นไฟจากรูประทุที่ขอบล้อ — จุดพ่นหมุนตามล้อ → อนุภาคเรียงเป็นเกลียวสว่าน
    function emitTalaiSpiral(power) {
      const jets = rocket.userData.talaiJets || [];
      const spin = rocket.rotation.y;
      for (const j of jets) {
        const wa = j.a + spin;
        const ex = rocket.position.x + Math.cos(wa) * j.r;
        const ez = Math.sin(wa) * j.r;
        // แนวสัมผัสการหมุน (พ่นเฉียง ~15° ออกด้านข้าง) + องค์ประกอบลง
        const tx = -Math.sin(wa), tz = Math.cos(wa);
        const ox = Math.cos(wa), oz = Math.sin(wa);
        let c = 0;
        for (const p of flame.pool) {
          if (p.life > 0) continue;
          p.life = p.max = 0.16 + Math.random() * 0.26;
          p.x = ex + (Math.random() - 0.5) * 0.1;
          p.y = j.y + (Math.random() - 0.5) * 0.1;
          p.z = ez + (Math.random() - 0.5) * 0.1;
          const t = 3.4 + Math.random() * 1.6;
          p.vx = tx * t + ox * 0.9;
          p.vy = -2.2 - Math.random() * 2.4 * power;
          p.vz = tz * t + oz * 0.9;
          p.grow = 0;
          p.r = 1; p.g = 0.5 + Math.random() * 0.32; p.b = 0.14;
          if (++c > 3) break;
        }
        let sc = 0;
        for (const p of smoke.pool) {
          if (p.life > 0) continue;
          p.life = p.max = 1.1 + Math.random() * 1.7;
          p.x = ex; p.y = j.y - 0.08; p.z = ez;
          p.vx = tx * 2.0 + ox * 0.6;
          p.vy = -0.5 - Math.random() * 1.1;
          p.vz = tz * 2.0 + oz * 0.6;
          p.grow = 1.5 + Math.random() * 2;
          const g = 0.5 + Math.random() * 0.3;
          p.r = g; p.g = g * 0.95; p.b = g * 0.88;
          if (++sc > 2) break;
        }
      }
    }
    function emitSmoke(px, py, pz, dense, dark) {
      let c = 0;
      for (const p of smoke.pool) {
        if (p.life > 0) continue;
        p.life = p.max = 1.4 + Math.random() * 2.2;
        p.x = px + (Math.random() - 0.5) * 1.6;
        p.y = py + Math.random() * 0.6;
        p.z = pz + (Math.random() - 0.5) * 1.6;
        p.vx = (Math.random() - 0.5) * 3;
        p.vy = 1 + Math.random() * 3;
        p.vz = (Math.random() - 0.5) * 3;
        p.grow = 2 + Math.random() * 3;
        const g = dark ? 0.18 + Math.random() * 0.12 : 0.55 + Math.random() * 0.3;
        p.r = g * (dark ? 1.05 : 1); p.g = g; p.b = g * (dark ? 0.95 : 1.05);
        if (++c > (dense ? 5 : 2)) break;
      }
    }
    function updatePoints(pk, dt, gravity) {
      const pos = pk.geo.attributes.position.array;
      const col = pk.geo.attributes.color.array;
      let i = 0;
      for (const p of pk.pool) {
        if (p.life > 0) {
          p.life -= dt;
          p.vy += gravity * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          const k = Math.max(0, p.life / p.max);
          pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
          col[i * 3] = p.r * k; col[i * 3 + 1] = p.g * k; col[i * 3 + 2] = p.b * k;
        } else {
          pos[i * 3 + 1] = -99999;
        }
        i++;
      }
      pk.geo.attributes.position.needsUpdate = true;
      pk.geo.attributes.color.needsUpdate = true;
    }

    // ---------- composer (clean modern look — Bloom only, no film grain/scanlines) ----------
    let composer = null;
    try {
      composer = new THREE.EffectComposer(renderer);
      composer.addPass(new THREE.RenderPass(scene, camera));
      const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(512, 512),
        nightFW ? 1.0 : 0.85, nightFW ? 0.5 : 0.42, nightFW ? 0.7 : 0.85);
      bloom.renderToScreen = true;
      composer.addPass(bloom);
    } catch (e) {
      console.warn("[Launch3D] post-processing unavailable, plain render", e);
      composer = null;
    }

    // ---------- HUD ----------
    const hud = document.getElementById("launch-hud");
    const camTag = document.getElementById("launch-cam");
    const evEl = document.getElementById("launch-event");
    if (hud) hud.hidden = false;
    if (camTag) camTag.hidden = false;

    // ---------- FlightHUD (แถบล่าง + ปุ่มควบคุม gravity turn / STAGE) ----------
    //   โคมลอยบังคับทิศไม่ได้ (ลอยตามลม) — ซ่อนแผงควบคุมล่าง ไม่ให้บังตัวโคม
    const hudOn = !!window.FlightHUD && !meta.lantern && !meta.firework;   // พลุบังคับทิศไม่ได้ — ซ่อน D-pad
    if (hudOn) {
      window.FlightHUD.mount({
        initialPitch: (flight.control && flight.control.pitchDeg) || 0,
        onPitch: (d) => flight.setControl && flight.setControl(d, null),
        onYaw: (dir) => { flight.setControl && flight.setControl(0, dir); shake = Math.max(shake, 0.12); },
        onStage: () => flight.requestStage && flight.requestStage()
      });
    }

    // ---------- Character Trio (Phase 4): CAPCOM "ดั๊ก" + Operator "คาปิบารา" ----------
    if (window.Capcom) window.Capcom.mount();
    if (window.Operator) window.Operator.mount();
    const H = {
      alt: document.getElementById("lh-alt"), vel: document.getElementById("lh-vel"),
      q: document.getElementById("lh-q"), maxq: document.getElementById("lh-maxq"),
      stage: document.getElementById("lh-stage"), dv: document.getElementById("lh-dv"),
      phase: document.getElementById("lh-phase")
    };
    const fmt = (n, d = 0) => Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
    let evTimer = 0, seenEvents = 0;
    function showEvent(txt) {
      if (!evEl) return;
      evEl.textContent = txt; evEl.hidden = false; evTimer = 1.8;
    }

    // ---------- resize ----------
    function resize() {
      if (!canvas || !canvas.parentElement || !renderer) return;   // teardown/นำทางออก
      const w = canvas.clientWidth || canvas.parentElement.clientWidth || 800;
      const h = canvas.clientHeight || 480;
      renderer.setSize(w, h, false);
      if (composer) composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", resize);
    resize();

    // ---------- camera states ----------
    let camState = "pad";
    const camGoalPos = new THREE.Vector3();
    const camGoalLook = new THREE.Vector3();

    // Phase 16.5: cinematic firework camera (liftoff → ascent tracking → burst pull-back → free orbit)
    let fwCamPhase = "liftoff", fwBurstAge = 0, camFovGoal = camera.fov, camKcMul = 1;
    const fwOrbit = { yaw: 0, pitch: 0, dist: 1, drag: false, lx: 0, ly: 0 };
    // Phase 17.2 · manual pan/tilt/dolly — enabled for firework post-burst AND the Khom drift
    if ((nightFW || meta.lantern) && canvas) {
      canvas.style.touchAction = "none";
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      canvas.addEventListener("pointerdown", e => {
        fwOrbit.drag = true; fwOrbit.lx = e.clientX; fwOrbit.ly = e.clientY;
        try { canvas.setPointerCapture(e.pointerId); } catch (x) {}
      });
      const endOrbit = e => { fwOrbit.drag = false; try { canvas.releasePointerCapture(e.pointerId); } catch (x) {} };
      canvas.addEventListener("pointerup", endOrbit);
      canvas.addEventListener("pointercancel", endOrbit);
      canvas.addEventListener("pointermove", e => {
        if (!fwOrbit.drag) return;
        const dx = e.clientX - fwOrbit.lx, dy = e.clientY - fwOrbit.ly;
        fwOrbit.lx = e.clientX; fwOrbit.ly = e.clientY;
        // ก่อนพลุแตก = ขยับได้นิดเดียว (ไม่ให้หลุดช็อตซีเนแมติก) · หลังแตก / โคมลอย = อิสระเต็มที่
        const gain = (meta.lantern || fwCamPhase === "post") ? 1 : 0.32;
        fwOrbit.yaw = clamp(fwOrbit.yaw - dx * 0.005 * gain, -1.15, 1.15);
        fwOrbit.pitch = clamp(fwOrbit.pitch + dy * 0.004 * gain, -0.5, 0.72);
      });
      canvas.addEventListener("wheel", e => {
        e.preventDefault();
        fwOrbit.dist = clamp(fwOrbit.dist * (1 + Math.sign(e.deltaY) * 0.08), 0.6, 1.7);
      }, { passive: false });
    }

    function updateFireworkCam(dt) {
      const shellY = rocket.position.y;                       // scene units: ~-1.4 in mortar → ~40–46 at apogee
      const burstY = fwBurstY != null ? fwBurstY : shellY;
      const xJit = rocket.position.x;

      if (!fwFired) {
        fwCamPhase = (!fwArmed || shellY < 3.5) ? "liftoff" : "ascent";
      } else {
        fwBurstAge += dt;
        fwCamPhase = fwBurstAge < 2.6 ? "burst" : "post";
      }
      if (camTag) camTag.textContent =
        { liftoff: "SPECTATOR", ascent: "TRACKING ▲", burst: "◉ CLOSE-UP", post: "◉ DOLLY IN ⟲" }[fwCamPhase];

      const base = new THREE.Vector3(), look = new THREE.Vector3();
      if (fwCamPhase === "liftoff") {
        // มุมต่ำติดพื้น เงยหน้าขึ้นหาแร็คท่อครก
        base.set(6.2, 1.7, 27);
        look.set(xJit * 0.3, 7.5, 0);
        camFovGoal = 60; camKcMul = 1.05;
      } else if (fwCamPhase === "ascent") {
        // เครนกล้องขึ้นตามหางประกาย — กล้องอยู่ต่ำกว่าลูกพลุเสมอ เงยตาม
        const t = Math.min(1, shellY / 42);
        base.set(4.4 - t * 1.4, 1.7 + shellY * 0.44, 28 - t * 2.5);
        look.set(xJit * 0.5, shellY + 3.4, 0);
        camFovGoal = 58; camKcMul = 0.85;                     // ช้าลง = แพนนุ่ม
      } else if (fwCamPhase === "burst") {
        // Phase 17.2 · ไม่ถอยกล้อง — ดัน CLOSE-UP เข้าหาศูนย์กลางดอกตามแกน Z + หุบเลนส์เล็กน้อย
        const e = fwBurstAge / 2.6;
        const ease = e < 0.5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2;   // easeInOutCubic
        base.set(0.6, burstY * 0.62 + 2.2, 26 - ease * 8);   // 26 → 18 (ดันเข้า)
        look.set(0, burstY, 0);
        camFovGoal = 52 - ease * 6;                           // 52 → 46 (หุบเลนส์)
        camKcMul = 0.55 + ease * 0.3;
      } else {
        // Phase 17.2 · ดอลลี่-อินช้ามาก ตลอด ~28 วิ ที่เม็ดดาวค้างฟ้า — ชื่นชมเนบิวลาเรืองแสง
        const d = Math.min(1, (fwBurstAge - 2.6) / 26);      // 0 → 1 across the hang time
        const dd = 1 - Math.pow(1 - d, 2);                    // easeOut
        base.set(0.3, burstY * 0.66 + 1.4, 18 - dd * 10);    // 18 → 8 (นิ่ง ๆ เข้าไปเรื่อย ๆ)
        look.set(0, burstY * 0.99, 0);
        camFovGoal = 46 - dd * 5;                             // 46 → 41
        camKcMul = 0.16;                                      // ตามช้ามาก = นุ่มนวล
      }

      // manual orbit offset — หมุนเวกเตอร์กล้อง→เป้ารอบแกน Y + เอียง pitch + ดอลลี่
      const off = base.clone().sub(look);
      const cy = Math.cos(fwOrbit.yaw), sy = Math.sin(fwOrbit.yaw);
      const ox = off.x * cy - off.z * sy, oz = off.x * sy + off.z * cy;
      off.x = ox; off.z = oz;
      off.y += fwOrbit.pitch * off.length() * 0.55;
      off.multiplyScalar(fwOrbit.dist);
      camGoalPos.copy(look).add(off);
      camGoalLook.copy(look);

      camera.fov += (camFovGoal - camera.fov) * Math.min(1, dt * 2.2);
      camera.updateProjectionMatrix();
    }

    // Phase 17.2 · กล้องโคมลอย — worm's-eye: จุดกล้องตรึงต่ำติดพื้น (y≈1.0) ไม่ขยับตามโคมขึ้น
    //   เอียงหน้าเงยตามโคมที่ลอยสูง+ไกลออกไป · ผู้เล่นแพน/เงย/ซูมเองได้ (fwOrbit)
    function updateLanternCam(dt) {
      const lx = rocket.position.x, ly = rocket.position.y;
      if (camTag) camTag.textContent = "🏮 GROUND TRACK";

      // แกนหมุนของกล้อง = จุดปล่อยระดับพื้น (ไม่ใช่ตัวโคม) → กล้องอยู่ต่ำเสมอ
      const pivot = new THREE.Vector3(0, 1.0, 0);
      const off = new THREE.Vector3(1.6, 0, 15);        // เยื้องข้าง+ถอยหลังนิด ระดับพื้น
      const cy = Math.cos(fwOrbit.yaw), sy = Math.sin(fwOrbit.yaw);
      const ox = off.x * cy - off.z * sy, oz = off.x * sy + off.z * cy;
      off.x = ox; off.z = oz;
      off.y += fwOrbit.pitch * 7;                        // เงย/ก้มด้วยมือ
      off.multiplyScalar(fwOrbit.dist);
      camGoalPos.copy(pivot).add(off);
      camGoalPos.y = Math.max(0.7, camGoalPos.y);        // กล้องห้ามจมใต้พื้น
      camGoalLook.set(lx * 0.7, ly, 0);                  // มองเงยขึ้นหาโคม
      camFovGoal = 55;
      camera.fov += (camFovGoal - camera.fov) * Math.min(1, dt * 1.6);
      camera.updateProjectionMatrix();
    }

    function vehicleMidY() {
      let sum = 0, n = 0;
      rParts.forEach(rp => { if (!rp.detached) { sum += rp.mesh.position.y; n++; } });
      return n ? sum / n : 4;
    }
    function updateCameraGoal(alt, dt) {
      const ry = vehicleMidY();
      if (alt < 12 && flight.state.t < 2.2) camState = "pad";
      else if (alt < 1600) camState = "ground";
      else if (alt < 70000) camState = "chase";
      else camState = "orbital";
      if (camTag) camTag.textContent = { pad: "PAD", ground: "GROUND", chase: "CHASE", orbital: "ORBITAL" }[camState];

      // Phase 16.5: กล้องซีเนแมติกสำหรับพลุ (liftoff → tracking → burst pull-back → free orbit)
      if (nightFW) { updateFireworkCam(dt || 0.016); return; }

      // Phase 17.2 · โคมลอย = กล้อง worm's-eye ตรึงติดพื้น เงยหน้าตามโคมที่ลอยจากไป
      if (meta.lantern) { updateLanternCam(dt || 0.016); return; }

      // จรวดพื้นบ้านลำเล็ก (บั้งไฟ/ตะไล) — ดึงกล้องเข้าใกล้ให้เห็นลำ+หางชัด
      const sm = meta.bangfai || meta.talai || tier === 1;
      if (camState === "pad") {
        camGoalPos.set(meta.lantern ? 4.2 : sm ? 5 : 7, meta.lantern ? 2.4 : sm ? 3 : 2.5, meta.lantern ? 6.5 : sm ? 8 : 11);
        camGoalLook.set(0, meta.lantern ? 2.3 : sm ? 3.5 : 5, 0);
      }
      else if (camState === "ground") {
        camGoalPos.set(sm ? 8.5 : 16, (sm ? 4.5 : 8) + ry * 0.15, sm ? 13 : 24);
        camGoalLook.set(0, ry + (sm ? 1.5 : 4), 0);
      }
      else if (camState === "chase") { camGoalPos.set(sm ? 4 : 5.5, ry + (sm ? 3.5 : 5), sm ? 10 : 15); camGoalLook.set(0, ry + 3, 0); }
      else { camGoalPos.set(2, ry + 14, 46); camGoalLook.set(0, ry + 2, 0); }
    }

    // ---------- shake ----------
    let shake = 0;

    // ---------- loop ----------
    let raf = 0, last = performance.now(), canceled = false, done = false, holdF = 0, simSpeed = 1.5;
    let flightRealT = 0;   // Phase 17.2 · เวลาจริงที่ผ่านไปในฉากปล่อย (gate ความยาว Khom/พลุ)

    function frame(now) {
      if (canceled) return;
      let dt = (now - last) / 1000; last = now;
      dt = Math.min(dt, 0.1);
      flightRealT += dt;

      // sim-speed ramp
      const alt = flight.state.y;
      const targetSpeed = meta.lantern ? 1.0    // Phase 17.2 · โคมลอย = เรียลไทม์ ช้า สงบ
        : flight.state.phase === "insertion" || flight.state.phase === "orbit" ? 34
        : alt < 2500 ? 2.2 : alt < 30000 ? 7 : 16;
      simSpeed += (targetSpeed - simSpeed) * Math.min(1, dt * 1.5);

      // step physics — พอหัวพลุแตกที่ apogee ให้หยุดฟิสิกส์ ค้างจรวดไว้ ให้พลุเป็นไคลแม็กซ์
      if (!fwArmed) {
        // ลูกพลุรอในท่อครก — ยังไม่กด "จุดพลุ"
      } else if (fwFired) {
        if (!fx.length && ++holdF > 40) { finish(); return; }
      } else if (flight.state.phase !== "done") {
        const simDt = dt * simSpeed;
        const steps = Math.max(2, Math.ceil(simDt / 0.02));
        for (let i = 0; i < steps; i++) flight.step(simDt / steps);
      } else {
        holdF++;
        // Phase 17.2 · Khom "1-นาที": ห้ามจบก่อน ~56 วิจริง แม้ฟิสิกส์จะหยุดแล้ว
        if (holdF > 42 && !fx.length && (!meta.lantern || flightRealT > 56)) { finish(); return; }
      }
      const s = flight.state;

      // events
      while (seenEvents < s.events.length) {
        const e = s.events[seenEvents++];
        const lbl = EV_LABEL[e.k];
        if (lbl) showEvent(
          meta.lantern && e.k === "ignition" ? "จุดไฟ — โคมเริ่มลอย 🏮"
          : e.k === "staging" ? `แยกท่อนที่ ${e.stage}${e.manual ? " (มือ)" : ""}`
          : lbl);
        if (e.k === "ignition") shake = Math.max(shake, meta.lantern ? 0.04 : 0.55);
        if (e.k === "maxq") shake = Math.max(shake, 0.4);
        if (e.k === "bangfai-wobble") shake = Math.max(shake, 0.35);
        if (e.k === "staging") { shake = Math.max(shake, 0.28); detachStage(e.stage - 1); }
        if (e.k === "burnup" || e.k === "lantern-burnup") shake = Math.max(shake, 0.7);
        if (e.k === "pad-explosion") shake = Math.max(shake, 0.9);
        if (e.k === "crash" || e.k === "landing-burn-fail") shake = Math.max(shake, 0.55);
        if (e.k === "retro-burn") shake = Math.max(shake, 0.22);
        if (window.Capcom) window.Capcom.event(e, flight);
        if (window.Operator) window.Operator.event(e.k);
      }

      if (hudOn) window.FlightHUD.update(s, flight);
      if (window.Capcom) window.Capcom.feed(s, flight);

      // Phase 14 — ติดตามกรอบ NOTAM (เพดาน / รัศมี)
      if (NOTAM_CFG && notamHudEl && !notamHudEl.hidden) {
        const drNow = Math.abs(s.x);
        const bC = s.y > NOTAM_CFG.ceiling, bR = drNow > NOTAM_CFG.radius;
        if (nhCeilEl) {
          nhCeilEl.querySelector("b").textContent = mDispShort(Math.max(0, s.y)) + " / " + mDispShort(NOTAM_CFG.ceiling);
          nhCeilEl.classList.toggle("breach", bC);
        }
        if (nhRadEl) {
          nhRadEl.querySelector("b").textContent = mDispShort(drNow) + " / " + mDispShort(NOTAM_CFG.radius);
          nhRadEl.classList.toggle("breach", bR);
        }
        notamHudEl.classList.toggle("breach", bC || bR);
        if (notamGrid) {
          notamGrid.material.color.setHex(bC ? 0xff5b6b : 0x6fb4ff);
          notamGrid.material.opacity = 0.2 + (bC ? 0.28 : 0.08) + Math.sin(performance.now() * 0.004) * 0.05;
          if (notamGrid.userData.glow) notamGrid.userData.glow.material.opacity = bC ? 0.16 : 0.05;
        }
      }

      // หัวพลุ: Time Fuse ถึง Bursting Charge — จุดหลัง apogee ตามความยาวชนวนที่เลือก
      if (!fwFired && meta.firework && window.Fireworks && s.vy <= 0 && s.t > 1 && alt > 20
        && s.phase !== "pad" && !s.landed) {
        fwFuseT += dt;
        if (fwFuseT >= (meta.firework.fuseDelay || 0)) {
          fwFired = true;
          const my = (nightFW ? rocket.position.y : 0) + vehicleMidY() + 1.5;
          fwBurstY = my;
          try {
            fx.push(window.Fireworks.detonate(THREE, scene,
              new THREE.Vector3(rocket.position.x, my, 0), meta.firework));
            shake = Math.max(shake, 0.5);
            showEvent("หัวพลุแตก! เปลว" + (meta.firework.flame || "สี") + " 🎆");
          } catch (e) { console.warn("[Launch3D] firework", e); }
        }
      }
      if (fwFired && !fwChemShown) {
        fwChemShown = true;
        try {
          const sps = (meta.firework.specs && meta.firework.specs.length) ? meta.firework.specs
            : (meta.firework.spec ? [meta.firework.spec] : []);
          if (fwChemEl && sps.length) {
            const a = document.getElementById("fw-chem-el");
            const c = document.getElementById("fw-chem-chain");
            if (a) a.textContent = sps.map(sp => sp.th + " (" + sp.el + ")" + (sp.nm ? " " + sp.nm + "nm" : "")).join("  ·  ");
            if (c) c.textContent = sps.length > 1
              ? "การเปล่งแสงเชิงอะตอมหลายธาตุ → เปลว " + sps.map(sp => sp.flame).join(" + ")
              : (sps[0].reaction || "") + " → เปลว" + (sps[0].flame || "");
            fwChemEl.hidden = false; fwChemEl.classList.remove("fade");
            fwChemTimer = 6;
          }
        } catch (e) { console.warn("[Launch3D] firework", e); }
      }
      const fwDt = Math.min(dt * Math.min(simSpeed, 1.4), 0.04);
      for (let i = fx.length - 1; i >= 0; i--) {
        if (!fx[i].update(fwDt)) { fx[i].dispose(); fx.splice(i, 1); }
      }
      if (fwFired && fx.length) simSpeed += (1 - simSpeed) * Math.min(1, dt * 2.5);   // ชะลอเวลาให้ชมพลู
      if (fwChemTimer > 0) {
        fwChemTimer -= dt;
        if (fwChemTimer < 1.2 && fwChemEl) fwChemEl.classList.add("fade");
        if (fwChemTimer <= 0 && fwChemEl) fwChemEl.hidden = true;
      }

      // world sink
      const u = altU(alt);
      let yOff = 0;
      if (nightFW) {
        // Phase 13: พลุต้องขึ้นสูง — พื้นอยู่กับที่ ลูกพลุพุ่งขึ้นเหนือพื้นจริง ๆ
        worldGroup.position.y = 0;
        const riseU = alt <= 300 ? alt * 0.13 : 39 + (alt - 300) * 0.032;
        const tgt = !fwArmed ? -1.4 : (fwFired ? rocket.position.y : riseU);
        rocket.position.y += (tgt - rocket.position.y) * Math.min(1, dt * 6);
        yOff = rocket.position.y;
      } else if (meta.lantern) {
        // Phase 17.2 · พื้นตรึงอยู่กับที่ โคมลอยขึ้นจริงในซีน (worm's-eye tracking)
        worldGroup.position.y = 0;
        const riseU = alt * 0.24;                       // ~150 ม. ≈ 36 หน่วยฉาก
        rocket.position.y += (riseU - rocket.position.y) * Math.min(1, dt * 2.2);
        yOff = rocket.position.y;
      } else {
        worldGroup.position.y = -u;
      }

      // rocket subtle drift with wind / spin
      rocket.position.x = meta.lantern
        ? Math.max(-16, Math.min(16, s.x * 0.02))       // Phase 17.2 · โคมลอยพัดไปไกลให้เห็นชัด
        : Math.max(-3, Math.min(3, s.x * 0.0006));
      rocket.rotation.z = -rocket.position.x * 0.04;
      rocket.rotation.x = 0;
      if (meta.talai) {
        // ตะไลควงตลอดเที่ยวบิน (โมเมนตัมเชิงมุม) — เร็วช่วงเครื่องติด แล้วค่อย ๆ ช้าลง
        rocket.userData.talaiSpin = (rocket.userData.talaiSpin || 9);
        if (s.phase !== "boost") rocket.userData.talaiSpin *= (1 - dt * 0.25);
        rocket.rotation.y += dt * Math.max(1.5, rocket.userData.talaiSpin);
      } else if (s.phase === "boost") {
        if (tier >= 2 && !meta.bangfai) rocket.rotation.y += dt * 2.5;
      }
      // บั้งไฟ "รำดาบ" — ส่ายเห็นชัดตาม bangfaiWobble
      if (meta.bangfai) {
        const wob = s.bangfaiWobble || 0;
        rocket.rotation.z += Math.sin(s.t * 8.5) * wob * 0.09;
        rocket.rotation.x = Math.sin(s.t * 6.3 + 1) * wob * 0.30;
      }
      // โคมลอย — หมุนเอื่อย ๆ + แกว่งเบา ๆ ตามลม (ลอยไปกับมวลอากาศ)
      if (meta.lantern) {
        rocket.rotation.y += dt * 0.3;
        rocket.rotation.z = -rocket.position.x * 0.02 + Math.sin(s.t * 0.8) * 0.03;
        const lamp = rocket.userData.khomLamp, glowL = rocket.userData.khomGlow;
        const fl = rocket.userData.khomFlame, core = rocket.userData.khomCore;
        const litK = s.thrustNow > 0;
        // Phase 17.2 · ไฟในโคม "มีชีวิต" — หายใจด้วย sin หลายความถี่ + สั่นสุ่มบาง ๆ
        const tt = s.t;
        const breathe = 0.80 + 0.20 * Math.sin(tt * 2.7) + 0.07 * Math.sin(tt * 9.3 + 1.1);
        const flick = breathe + Math.random() * 0.10;
        if (lamp) lamp.intensity = litK ? 4.6 * flick + 0.7 : Math.max(0, lamp.intensity * 0.92);
        if (glowL) glowL.intensity = litK ? 3.1 * flick : Math.max(0, glowL.intensity * 0.93);
        if (fl) { fl.visible = litK; fl.scale.y = 1.2 + 0.35 * Math.sin(tt * 6.1) + Math.random() * 0.35; fl.scale.x = fl.scale.z = 0.82 + 0.12 * Math.sin(tt * 4.3) + Math.random() * 0.18; }
        if (core) { core.visible = litK; core.scale.setScalar(0.88 + 0.14 * Math.sin(tt * 7.7) + Math.random() * 0.22); }
      }

      // จุดปลายท่อ (nozzle) = ใต้ท่อนล่างสุดที่ยังติดอยู่ (+yOff = ลูกพลุยกตัวขึ้นในฉากกลางคืน)
      let nozY = NOZZLE_Y + yOff;
      rParts.forEach(rp => { if (!rp.detached && rp.stage) nozY = Math.min(nozY, rp.mesh.position.y + yOff - (rp.h ? rp.h / 2 : 0)); });
      exhaustLight.position.set(rocket.position.x, nozY, 0);

      // Phase 13: หางประกายขาขึ้น — ระหว่างพุ่งขึ้นก่อนแตก
      if (nightFW && fwArmed && !fwFired && s.thrustNow <= 0 && s.vy > -3) emitFwTrail(rocket.position.x, nozY);

      // exhaust / smoke  (โคมลอยไม่มีไอพ่น — ใช้ไฟในโคมแทน)
      const burning = s.thrustNow > 0 && !meta.lantern;
      const inAtmo = alt < 45000;
      if (burning) {
        const stThr = (cfg.stages && cfg.stages[Math.min(s.stage, stageCount - 1)] && cfg.stages[Math.min(s.stage, stageCount - 1)].thrust) || cfg.thrust || 100;
        const power = Math.min(1.6, s.thrustNow / stThr + 0.4);
        if (meta.talai) {
          emitTalaiSpiral(power);
          exhaustLight.position.set(rocket.position.x, (rocket.userData.talaiJets && rocket.userData.talaiJets[0].y) || 1, 0);
        } else {
          emitFlame(rocket.position.x, nozY, 0, power);
          if (nightFW) emitFwTrail(rocket.position.x, nozY + 0.3);
          if (inAtmo) emitSmoke(rocket.position.x, nozY + 0.2, 0, alt < 400, !liquid && alt < 6000);
        }
        exhaustLight.color.setHex(liquid ? 0x8ec4ff : 0xff8a3a);
        exhaustLight.intensity = 2.2 + Math.random() * 2.6 + (alt < 300 ? 2 : 0);
        exhaustLight.distance = 55;
        // Task 5: ไอพ่นเรืองแสง — ยืด/สั่นตามแรงขับ + จางลงในสุญญากาศ
        if (plume) {
          const pw = Math.max(0.35, Math.min(1.6, power));
          const vac = Math.max(0.35, 1 - alt / 60000);          // ไอพ่นบานกว้างเมื่ออากาศเบา แต่หรี่ลง
          const flk = 0.85 + Math.random() * 0.3;
          plume.position.y = nozY - 1.75 * pw;
          plume.scale.set((0.85 + pw * 0.5) * flk, pw * 1.2 * flk, (0.85 + pw * 0.5) * flk);
          plume.material.opacity += ((0.34 * vac) - plume.material.opacity) * Math.min(1, dt * 12);
          plumeCore.position.y = nozY - 0.95 * pw;
          plumeCore.scale.set((0.7 + pw * 0.28) * flk, pw * 1.05, (0.7 + pw * 0.28) * flk);
          plumeCore.material.opacity += ((0.55 * vac) - plumeCore.material.opacity) * Math.min(1, dt * 12);
        }
        // Task 5: liftoff rumble — สั่นต่อเนื่องช่วงเครื่องแรงเต็ม ใกล้พื้น
        if (s.phase === "boost" && alt < 1400) {
          shake = Math.max(shake, (0.05 + Math.random() * 0.055) * power * Math.max(0.25, 1 - alt / 1400));
        }
      } else {
        exhaustLight.intensity *= 0.86;
        if (plume) {
          plume.material.opacity *= 0.82;
          plumeCore.material.opacity *= 0.82;
        }
      }
      if (s.phase === "reentry") {
        const my = vehicleMidY();
        emitFlame(rocket.position.x, my, 0, 1.4);        // เปลวความร้อนหุ้มยาน
        exhaustLight.color.setHex(0xff5522);
        exhaustLight.position.set(rocket.position.x, my, 0);
        exhaustLight.intensity = 4 + Math.random() * 3;
      }
      updatePoints(flame, dt * Math.min(simSpeed, 4), 4);
      updatePoints(smoke, dt * Math.min(simSpeed, 3), 1.5);
      if (fwTrail) updatePoints(fwTrail, dt * Math.min(simSpeed, 3), 3.5);

      // weather (เมฆ/ฝน/ฟ้าผ่า) — คืนความสว่างแฟลชฟ้าผ่า
      const spaceT = Math.min(1, alt / 75000);
      const flash = updateWeather(dt * Math.min(simSpeed, 3), alt, spaceT);
      updateTraffic(dt * Math.min(simSpeed, 4), alt);
      updateCloudDecks(dt * Math.min(simSpeed, 3), alt, spaceT);   // Task 3
      updateDust(dt * Math.min(simSpeed, 3), alt);                 // Task 3

      // sky / space blend (พื้น → อวกาศ) + สภาพอากาศทำให้ฟ้ามืด
      const dark = weather.skyDark * (1 - spaceT);
      const gr = 0.04 + (0.011 - 0.04) * dark, gg = 0.09 + (0.016 - 0.09) * dark, gb = 0.19 + (0.03 - 0.19) * dark;
      scene.background.setRGB(
        gr + (0.02 - gr) * spaceT + flash * 0.5,
        gg + (0.02 - gg) * spaceT + flash * 0.55,
        gb + (0.05 - gb) * spaceT + flash * 0.6);
      scene.fog.density = (0.0016 + 0.0032 * weather.cloudCover * (1 - spaceT)) * (1 - spaceT);
      setStarOpacity(spaceT * 1.4 - 0.15);
      // โคมลอย: หรี่แสงกลางวันลงหน่อย ให้ไฟในโคมเรืองเด่น (เหมือนปล่อยตอนพลบค่ำ)
      const ambDim = meta.lantern ? 0.6 : 1;
      hemi.intensity = (0.5 * (1 - spaceT * 0.7) * (1 - 0.55 * dark)) * ambDim + flash * 2.2;
      sun.intensity = (1.15 * (1 - 0.6 * dark)) * (meta.lantern ? 0.72 : 1) + flash * 1.6;
      // Phase 12: หัวพลุ = กลางคืนตลอด ฟ้ามืดสนิท ดาวเต็มฟ้า พึ่ง bloom + point light ล้วน ๆ
      if (nightFW) {
        scene.background.setRGB(0.008, 0.012, 0.032);
        scene.fog.density = 0.0007;
        setStarOpacity(Math.max(0.9, spaceT * 1.4));
        hemi.intensity = 0.14;
        sun.intensity = 0.32;   // แสงจันทร์
      }
      const orbitalView = alt > 60000;
      earth.visible = orbitalView;
      ground.material.opacity = 1;
      worldGroup.visible = alt < 120000;
      if (orbitalView) {
        earthGroup.position.y = -960 - u * 0.02;
        atmoUniforms.uCenter.value.set(0, earthGroup.position.y, 0);
      }

      // camera
      updateCameraGoal(alt, dt);
      const kc = nightFW
        ? Math.min(1, dt * 2.6 * camKcMul)
        : meta.lantern
          ? Math.min(1, dt * 1.0)                 // Phase 17.2 · ตามโคมช้า ๆ สง่างาม
          : Math.min(1, dt * (camState === "pad" ? 4 : 2.4));
      camera.position.lerp(camGoalPos, kc);
      lookTarget.lerp(camGoalLook, kc);
      shake *= Math.exp(-dt * 3.2);
      if (shake > 0.002) {
        camera.position.x += (Math.random() - 0.5) * shake;
        camera.position.y += (Math.random() - 0.5) * shake;
        camera.position.z += (Math.random() - 0.5) * shake * 0.6;
      }
      camera.lookAt(lookTarget);

      // HUD
      if (H.alt) {
        H.alt.textContent = alt >= 1000 ? fmt(alt / 1000, 1) + " km" : fmt(alt) + " m";
        H.vel.textContent = fmt(Math.hypot(s.vx, s.vy)) + " m/s";
        H.q.textContent = s.q >= 1000 ? fmt(s.q / 1000, 1) + " kPa" : fmt(s.q) + " Pa";
        H.maxq.textContent = s.maxQ > 1 ? fmt(s.maxQ / 1000, 1) + " kPa @ " + fmt(s.maxQAlt / 1000, 1) + " km" : "—";
        H.stage.textContent = (s.stage + 1) + " / " + s.stageCount;
        H.dv.textContent = cfg.orbital ? fmt(flight.deltaVBudget) + " / " + fmt(flight.deltaVRequired) + " m/s" : "—";
        H.phase.textContent = PHASE_TH[s.phase] || s.phase;
      }
      if (evTimer > 0) { evTimer -= dt; if (evTimer <= 0 && evEl) evEl.hidden = true; }

      if (s.phase === "done" && !done) {
        done = true;
        if (window.Operator) window.Operator.result(flight.summary());
      }
      updateDetached(dt);

      composer ? composer.render(dt) : renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }

    let reseat = 0;   // ระยะเลื่อนสแตกที่เหลือลงมา (เชิงเป้าหมาย)
    function detachStage(stageNum) {
      let dropH = 0;
      rParts.filter(rp => rp.stage === stageNum && !rp.detached).forEach(rp => {
        rp.detached = true; rp._v = -3 - Math.random() * 3; rp._spin = (Math.random() - 0.5) * 5;
        rp._vx = (Math.random() - 0.5) * 2;
        if (rp.mesh.material) rp.mesh.material.transparent = true;
        dropH = Math.max(dropH, rp.h || 3);
      });
      reseat += dropH;   // ท่อนที่เหลือเลื่อนลงมาชิดพื้นแท่น
    }
    function updateDetached(dt) {
      // เลื่อนสแตกที่ยังติดอยู่ลงมาแบบนุ่ม
      if (reseat > 0.01) {
        const d = Math.min(reseat, reseat * Math.min(1, dt * 3));
        reseat -= d;
        rParts.forEach(rp => { if (!rp.detached) rp.mesh.position.y -= d; });
      }
      rParts.forEach(rp => {
        if (!rp.detached) return;
        rp.mesh.position.y += rp._v * dt;
        rp.mesh.position.x += (rp._vx || 0) * dt;
        rp.mesh.rotation.x += rp._spin * dt;
        if (rp.mesh.material) rp.mesh.material.opacity = Math.max(0, (rp.mesh.material.opacity == null ? 1 : rp.mesh.material.opacity) - dt * 0.5);
        if (rp.mesh.position.y < -40 && rp.mesh.parent) rp.mesh.parent.remove(rp.mesh);
      });
    }
    function finish() {
      cleanup();
      hooks && hooks.onComplete && hooks.onComplete(flight.summary());
    }
    function cleanup() {
      canceled = true;
      if (raf) cancelAnimationFrame(raf);
      fx.forEach(f => { try { f.dispose(); } catch (e) {} });
      fx.length = 0;
      window.removeEventListener("resize", resize);
      if (hudOn) window.FlightHUD.unmount();
      if (window.Capcom) window.Capcom.unmount();
      if (window.Operator) window.Operator.unmount();
      if (hud) hud.hidden = true;
      if (notamHudEl) { notamHudEl.hidden = true; notamHudEl.classList.remove("breach"); }
      if (camTag) camTag.hidden = true;
      if (evEl) evEl.hidden = true;
      if (fwChemEl) { fwChemEl.hidden = true; fwChemEl.classList.remove("fade"); }
      if (fwIgniteBtn) { fwIgniteBtn.hidden = true; fwIgniteBtn.onclick = null; }
      if (canvas && canvas.parentElement) canvas.parentElement.classList.remove("fw-mode");
      try {
        scene.traverse(o => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
        });
        sprite.dispose();
        disposables.forEach(t => { try { t.dispose(); } catch (e) {} });
        renderer.dispose();
      } catch (e) {}
    }

    raf = requestAnimationFrame(frame);
    return { cancel: cleanup };
  }

  window.Launch3D = { run };
})();
