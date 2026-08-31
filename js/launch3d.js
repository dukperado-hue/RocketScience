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

  function run(canvas, cfg, hooks) {
    const THREE = T();
    if (!THREE) throw new Error("THREE not available");

    const flight = window.Physics.createFlight(cfg);
    const meta = cfg.rocketMeta || {};
    const tier = meta.tier || 1;
    const propType = (cfg.stages && cfg.stages[0] && cfg.stages[0].propType) || "solid";
    const liquid = propType === "liquid";
    const stageCount = (cfg.stages && cfg.stages.length) || 1;

    // ---------- Phase 4: สภาพอากาศ + ตัวจัดการพื้นผิว ----------
    const weather = (window.Physics && window.Physics.normalizeWeather)
      ? window.Physics.normalizeWeather(cfg.weather)
      : Object.assign({ type: "clear", cloudCover: 0.05, rainRate: 0, skyDark: 0, lightning: false, windGust: 0 }, cfg.weather || {});
    const TM = window.TextureManager ? window.TextureManager.init() : null;
    const tmReady = () => !!(TM && window.TextureManager.ready());
    const disposables = [];   // เทกซ์เจอร์ที่ต้อง dispose ตอนจบ
    function track(tex) { if (tex) disposables.push(tex); return tex; }

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

    if (tier === 1) {
      const lm = pmat("mat_paper");
      lm.color.setHex(0xff7a4c);
      if (lm.emissive) { lm.emissive.setHex(0xff4020); lm.emissiveIntensity = 0.85; }
      lm.roughness = 0.8;
      const lant = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 18), lm);
      lant.position.y = 3.6; lant.scale.y = 1.35;
      rocket.add(lant); rParts.push({ mesh: lant, stage: 1 });
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

      // weather (เมฆ/ฝน/ฟ้าผ่า) — คืนความสว่างแฟลชฟ้าผ่า
      const spaceT = Math.min(1, alt / 75000);
      const flash = updateWeather(dt * Math.min(simSpeed, 3), alt, spaceT);
      updateTraffic(dt * Math.min(simSpeed, 4), alt);

      // sky / space blend (พื้น → อวกาศ) + สภาพอากาศทำให้ฟ้ามืด
      const dark = weather.skyDark * (1 - spaceT);
      const gr = 0.04 + (0.011 - 0.04) * dark, gg = 0.09 + (0.016 - 0.09) * dark, gb = 0.19 + (0.03 - 0.19) * dark;
      scene.background.setRGB(
        gr + (0.02 - gr) * spaceT + flash * 0.5,
        gg + (0.02 - gg) * spaceT + flash * 0.55,
        gb + (0.05 - gb) * spaceT + flash * 0.6);
      scene.fog.density = (0.0016 + 0.0032 * weather.cloudCover * (1 - spaceT)) * (1 - spaceT);
      setStarOpacity(spaceT * 1.4 - 0.15);
      hemi.intensity = 0.5 * (1 - spaceT * 0.7) * (1 - 0.55 * dark) + flash * 2.2;
      sun.intensity = 1.15 * (1 - 0.6 * dark) + flash * 1.6;
      const orbitalView = alt > 60000;
      earth.visible = orbitalView;
      ground.material.opacity = 1;
      worldGroup.visible = alt < 120000;
      if (orbitalView) {
        earthGroup.position.y = -960 - u * 0.02;
        atmoUniforms.uCenter.value.set(0, earthGroup.position.y, 0);
      }

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
      window.removeEventListener("resize", resize);
      if (hudOn) window.FlightHUD.unmount();
      if (window.Capcom) window.Capcom.unmount();
      if (window.Operator) window.Operator.unmount();
      if (hud) hud.hidden = true;
      if (camTag) camTag.hidden = true;
      if (evEl) evEl.hidden = true;
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
