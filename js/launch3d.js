// js/launch3d.js — เฟสปล่อยจรวดแบบภาพยนตร์ 3 มิติ (Phase 2)
// Three.js r147 (UMD global THREE) + EffectComposer (Bloom + FilmPass)
//  - ระบบอนุภาค: ควันปริมาตร + ไอพ่นไฟ (สี/ความยาวตามชนิดเชื้อเพลิง)
//  - post-processing: UnrealBloomPass (แสงเครื่องยนต์เรืองแสง) + FilmPass (ฟิล์มเกรน/สแกนไลน์)
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
    unstable: "เสียการทรงตัว — CG เพี้ยน"
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

  function run(canvas, cfg, hooks) {
    const THREE = T();
    if (!THREE) throw new Error("THREE not available");

    const flight = window.Physics.createFlight(cfg);
    const meta = cfg.rocketMeta || {};
    const tier = meta.tier || 1;
    const propType = (cfg.stages && cfg.stages[0] && cfg.stages[0].propType) || "solid";
    const liquid = propType === "liquid";
    const stageCount = (cfg.stages && cfg.stages.length) || 1;

    // ---------- renderer / scene ----------
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a1830);
    scene.fog = new THREE.FogExp2(0x0a1830, 0.0016);

    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 6000);
    camera.position.set(10, 6, 18);
    const lookTarget = new THREE.Vector3(0, 4, 0);

    // ---------- lights ----------
    const hemi = new THREE.HemisphereLight(0x9ec8ff, 0x2a2016, 0.5);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.15);
    sun.position.set(-30, 40, 20);
    scene.add(sun);
    const exhaustLight = new THREE.PointLight(liquid ? 0x8ec4ff : 0xff8a3a, 0, 60, 2);
    scene.add(exhaustLight);

    // ---------- ground + pad (worldGroup sinks as altitude rises) ----------
    const worldGroup = new THREE.Group();
    scene.add(worldGroup);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(600, 48),
      new THREE.MeshStandardMaterial({ color: 0x5a4b32, roughness: 1, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    worldGroup.add(ground);
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

    // stars
    const starGeo = new THREE.BufferGeometry();
    const starN = 900, sp = new Float32Array(starN * 3);
    for (let i = 0; i < starN; i++) {
      const r = 2200 + Math.random() * 1500;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      sp[i * 3] = r * Math.sin(ph) * Math.cos(th);
      sp[i * 3 + 1] = Math.abs(r * Math.cos(ph)) * 0.6;
      sp[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 3, sizeAttenuation: false, transparent: true, opacity: 0 }));
    scene.add(stars);

    // curved earth for orbital view
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(900, 48, 32),
      new THREE.MeshStandardMaterial({ color: 0x1b4a86, emissive: 0x0a1f3a, roughness: 1 })
    );
    earth.position.set(0, -960, 0);
    earth.visible = false;
    scene.add(earth);

    // ---------- rocket ----------
    const rocket = new THREE.Group();
    scene.add(rocket);
    const rParts = [];
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe8e9ee, roughness: 0.5, metalness: 0.3 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x2e4a7a, roughness: 0.6 });

    if (tier === 1) {
      const lant = new THREE.Mesh(new THREE.SphereGeometry(1.6, 20, 16),
        new THREE.MeshStandardMaterial({ color: 0xff5a3c, emissive: 0xff4020, emissiveIntensity: 0.8, roughness: 0.7 }));
      lant.position.y = 3.6; lant.scale.y = 1.35;
      rocket.add(lant); rParts.push({ mesh: lant, stage: 1 });
    } else {
      const rad = tier <= 2 ? 0.5 : tier === 3 ? 0.7 : tier === 4 ? 1.0 : 1.25;
      const nStack = Math.max(1, stageCount);
      let y = 1.0;
      for (let i = 0; i < nStack; i++) {                // stage 1 (i=0) = ท่อนล่างสุด
        const h = tier <= 2 ? 4.5 : (nStack === 1 ? 5.5 : (i === 0 ? 5.2 : 3.4));
        const segRad = rad * (1 - i * 0.13);
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(segRad, rad * (1 - Math.max(0, i - 1) * 0.13), h, 24),
          i % 2 ? trimMat.clone() : bodyMat.clone());
        seg.position.y = y + h / 2;
        rocket.add(seg);
        rParts.push({ mesh: seg, stage: i + 1, baseY: seg.position.y, h });
        y += h;
      }
      const topRad = rad * (1 - (nStack - 1) * 0.13);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(topRad, topRad * 2.6, 24), bodyMat.clone());
      nose.position.y = y + topRad * 1.3;
      rocket.add(nose); rParts.push({ mesh: nose, stage: nStack, baseY: nose.position.y });
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

    // ---------- composer ----------
    let composer = null;
    try {
      composer = new THREE.EffectComposer(renderer);
      composer.addPass(new THREE.RenderPass(scene, camera));
      const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 1.15, 0.5, 0.82);
      composer.addPass(bloom);
      const film = new THREE.FilmPass(0.28, 0.28, 648, false);
      film.renderToScreen = true;
      composer.addPass(film);
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
    const hudOn = !!window.FlightHUD;
    if (hudOn) {
      window.FlightHUD.mount({
        initialPitch: (flight.control && flight.control.pitchDeg) || 0,
        onPitch: (d) => flight.setControl && flight.setControl(d, null),
        onYaw: (dir) => { flight.setControl && flight.setControl(0, dir); shake = Math.max(shake, 0.12); },
        onStage: () => flight.requestStage && flight.requestStage()
      });
    }
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
    function vehicleMidY() {
      let sum = 0, n = 0;
      rParts.forEach(rp => { if (!rp.detached) { sum += rp.mesh.position.y; n++; } });
      return n ? sum / n : 4;
    }
    function updateCameraGoal(alt) {
      const ry = vehicleMidY();
      if (alt < 12 && flight.state.t < 2.2) camState = "pad";
      else if (alt < 1600) camState = "ground";
      else if (alt < 70000) camState = "chase";
      else camState = "orbital";
      if (camTag) camTag.textContent = { pad: "PAD", ground: "GROUND", chase: "CHASE", orbital: "ORBITAL" }[camState];

      if (camState === "pad") { camGoalPos.set(7, 2.5, 11); camGoalLook.set(0, 5, 0); }
      else if (camState === "ground") { camGoalPos.set(16, 8 + ry * 0.15, 24); camGoalLook.set(0, ry + 4, 0); }
      else if (camState === "chase") { camGoalPos.set(5.5, ry + 5, 15); camGoalLook.set(0, ry + 3, 0); }
      else { camGoalPos.set(2, ry + 14, 46); camGoalLook.set(0, ry + 2, 0); }
    }

    // ---------- shake ----------
    let shake = 0;

    // ---------- loop ----------
    let raf = 0, last = performance.now(), canceled = false, done = false, holdF = 0, simSpeed = 1.5;

    function frame(now) {
      if (canceled) return;
      let dt = (now - last) / 1000; last = now;
      dt = Math.min(dt, 0.1);

      // sim-speed ramp
      const alt = flight.state.y;
      const targetSpeed = flight.state.phase === "insertion" || flight.state.phase === "orbit" ? 34
        : alt < 2500 ? 2.2 : alt < 30000 ? 7 : 16;
      simSpeed += (targetSpeed - simSpeed) * Math.min(1, dt * 1.5);

      // step physics
      if (flight.state.phase !== "done") {
        const simDt = dt * simSpeed;
        const steps = Math.max(2, Math.ceil(simDt / 0.02));
        for (let i = 0; i < steps; i++) flight.step(simDt / steps);
      } else {
        holdF++;
        if (holdF > 42) { finish(); return; }
      }
      const s = flight.state;

      // events
      while (seenEvents < s.events.length) {
        const e = s.events[seenEvents++];
        const lbl = EV_LABEL[e.k];
        if (lbl) showEvent(e.k === "staging" ? `แยกท่อนที่ ${e.stage}${e.manual ? " (มือ)" : ""}` : lbl);
        if (e.k === "ignition") shake = Math.max(shake, 0.55);
        if (e.k === "maxq") shake = Math.max(shake, 0.4);
        if (e.k === "staging") { shake = Math.max(shake, 0.28); detachStage(e.stage - 1); }
        if (e.k === "burnup" || e.k === "lantern-burnup") shake = Math.max(shake, 0.7);
        if (e.k === "pad-explosion") shake = Math.max(shake, 0.9);
        if (e.k === "crash") shake = Math.max(shake, 0.5);
      }

      if (hudOn) window.FlightHUD.update(s, flight);

      // world sink
      const u = altU(alt);
      worldGroup.position.y = -u;

      // rocket subtle drift with wind / spin
      rocket.position.x = Math.max(-3, Math.min(3, s.x * 0.0006));
      rocket.rotation.z = -rocket.position.x * 0.04;
      if (tier >= 2 && s.phase === "boost") rocket.rotation.y += dt * 2.5;

      // จุดปลายท่อ (nozzle) = ใต้ท่อนล่างสุดที่ยังติดอยู่
      let nozY = NOZZLE_Y;
      rParts.forEach(rp => { if (!rp.detached && rp.stage) nozY = Math.min(nozY, rp.mesh.position.y - (rp.h ? rp.h / 2 : 0)); });
      exhaustLight.position.set(rocket.position.x, nozY, 0);

      // exhaust / smoke
      const burning = s.thrustNow > 0;
      const inAtmo = alt < 45000;
      if (burning) {
        const stThr = (cfg.stages && cfg.stages[Math.min(s.stage, stageCount - 1)] && cfg.stages[Math.min(s.stage, stageCount - 1)].thrust) || cfg.thrust || 100;
        const power = Math.min(1.6, s.thrustNow / stThr + 0.4);
        emitFlame(rocket.position.x, nozY, 0, power);
        if (inAtmo) emitSmoke(rocket.position.x, nozY + 0.2, 0, alt < 400, !liquid && alt < 6000);
        exhaustLight.color.setHex(liquid ? 0x8ec4ff : 0xff8a3a);
        exhaustLight.intensity = 2.2 + Math.random() * 2.6 + (alt < 300 ? 2 : 0);
        exhaustLight.distance = 55;
      } else {
        exhaustLight.intensity *= 0.86;
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

      // sky / space blend
      const spaceT = Math.min(1, alt / 75000);
      scene.background.setRGB(
        0.04 + (0.02 - 0.04) * spaceT, 0.09 + (0.02 - 0.09) * spaceT, 0.19 + (0.05 - 0.19) * spaceT);
      scene.fog.density = 0.0016 * (1 - spaceT);
      stars.material.opacity = Math.max(0, spaceT * 1.4 - 0.15);
      hemi.intensity = 0.5 * (1 - spaceT * 0.7);
      const orbitalView = alt > 60000;
      earth.visible = orbitalView;
      ground.material.opacity = 1;
      worldGroup.visible = alt < 120000;
      if (orbitalView) earth.position.y = -960 - u * 0.02;

      // camera
      updateCameraGoal(alt);
      const kc = Math.min(1, dt * (camState === "pad" ? 4 : 2.4));
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

      if (s.phase === "done" && !done) done = true;
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
      window.removeEventListener("resize", resize);
      if (hudOn) window.FlightHUD.unmount();
      if (hud) hud.hidden = true;
      if (camTag) camTag.hidden = true;
      if (evEl) evEl.hidden = true;
      try {
        scene.traverse(o => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
        });
        sprite.dispose();
        renderer.dispose();
      } catch (e) {}
    }

    raf = requestAnimationFrame(frame);
    return { cancel: cleanup };
  }

  window.Launch3D = { run };
})();
