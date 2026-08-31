// js/physics.js
// เครื่องจำลองการบิน 2 มิติในระนาบแนวดิ่ง (Phase 2)
//  - Tier 1–2: แรงโน้มถ่วง แรงขับ แรงต้านอากาศ ลมพัดเฉ spin-stabilization (เหมือน Phase 1)
//  - Tier 3–4: หลายท่อน (staging / jettison dry mass), Specific Impulse (Isp), วิถีกระสุนโค้ง,
//    Max-Q, ความร้อนตอนกลับเข้าชั้นบรรยากาศ (บูรณาการแรงจริง)
//  - Tier 5 (orbital): ตัดสิน "เข้าวงโคจรได้ไหม" จากงบ Δv (สมการ Tsiolkovsky) เทียบ Δv ที่ต้องใช้
//    (v_orbit + gravity/drag loss). วิถีขาขึ้นใช้โปรไฟล์แบบสคริปต์เพื่อภาพยนตร์
//    (เวลาเผาไหม้จาก Isp, staging ตามเวลา, Max-Q คำนวณจาก ρ·v²)
// อ้างอิงแนวคิด: Sutton "Rocket Propulsion Elements"; Bate/Mueller/White
//   "Fundamentals of Astrodynamics"; NASA Systems Engineering Handbook (payload fraction)

const G0 = 9.80665;
const MU = 3.986004418e14;
const R_EARTH = 6.371e6;
const RHO0 = 1.225;
const SCALE_HEIGHT = 8500;
const KARMAN = 100000;

function airDensity(alt) {
  if (alt < 0) alt = 0;
  if (alt > 140000) return 0;
  return RHO0 * Math.exp(-alt / SCALE_HEIGHT);
}
function gravity(alt) {
  const r = R_EARTH + Math.max(0, alt);
  return MU / (r * r);
}
function orbitalVelocity(alt) {
  return Math.sqrt(MU / (R_EARTH + Math.max(0, alt)));
}
function smoothstep(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

// ===== ระบบสภาพอากาศ (Phase 4) =====
//  ใช้ทั้งฝั่งฟิสิกส์ (แรงลมกระโชก) และฝั่งภาพ (ฝน/เมฆ/ฟ้าผ่า ใน launch3d.js)
//  type: "clear" | "cloudy" | "rain" | "thunderstorm"
const WEATHER_PRESETS = {
  clear:        { cloudCover: 0.05, rainRate: 0.00, skyDark: 0.00, lightning: false, windGust: 0.0 },
  cloudy:       { cloudCover: 0.55, rainRate: 0.00, skyDark: 0.22, lightning: false, windGust: 0.35 },
  rain:         { cloudCover: 0.82, rainRate: 0.55, skyDark: 0.50, lightning: false, windGust: 0.6 },
  thunderstorm: { cloudCover: 1.00, rainRate: 0.92, skyDark: 0.85, lightning: true,  windGust: 1.0 }
};
function normalizeWeather(w) {
  w = w || {};
  const type = WEATHER_PRESETS[w.type] ? w.type : "clear";
  const d = WEATHER_PRESETS[type];
  return {
    type,
    cloudCover: clamp01(w.cloudCover != null ? w.cloudCover : d.cloudCover),
    rainRate:   clamp01(w.rainRate   != null ? w.rainRate   : d.rainRate),
    skyDark:    clamp01(w.skyDark     != null ? w.skyDark    : d.skyDark),
    lightning:  w.lightning != null ? !!w.lightning : d.lightning,
    windGust:   Math.max(0, w.windGust != null ? w.windGust : d.windGust)
  };
}
function makeWeather(opts) {
  opts = opts || {};
  const r = typeof opts.rng === "function" ? opts.rng : Math.random;
  if (opts.type) return normalizeWeather({ type: opts.type });
  const roll = r();
  const storm = opts.stormChance != null ? opts.stormChance : 0.14;
  let type = "clear";
  if (roll < storm) type = "thunderstorm";
  else if (roll < storm + 0.20) type = "rain";
  else if (roll < storm + 0.46) type = "cloudy";
  return normalizeWeather({ type });
}

function wobbleNoise(seed, t) {
  return Math.sin(t * 6.1 + seed) * 0.6 + Math.sin(t * 13.7 + seed * 2.3) * 0.3 + Math.sin(t * 27.3 + seed * 4.7) * 0.1;
}
function transonicFactor(mach) {
  if (mach < 0.75 || mach > 1.8) return 1;
  return 1 + 0.9 * Math.exp(-Math.pow((mach - 1.1) / 0.28, 2));
}

// ---- Δv ของสแตกท่อนตามสมการ Tsiolkovsky ----
function stackDeltaV(stages, payloadMass) {
  let massAbove = payloadMass || 0, total = 0;
  const per = [];
  for (let i = stages.length - 1; i >= 0; i--) {
    const s = stages[i];
    const m0 = massAbove + s.dryMass + s.propMass;
    const mf = massAbove + s.dryMass;
    const d = (s.isp || 200) * G0 * Math.log(m0 / mf);
    per[i] = d; total += d; massAbove = m0;
  }
  return { total, per };
}

function buildStages(c) {
  if (Array.isArray(c.stages) && c.stages.length) return c.stages.map((s, i) => normalizeStage(s, i));
  const propMass = Math.max(0.0001, (c.wetMass || 1) - (c.dryMass || 0.6));
  return [normalizeStage({
    thrust: c.thrust || 100, burnTime: c.burnTime || 2, dryMass: c.dryMass || 0.6, propMass,
    isp: c.isp || (c.thrust && c.burnTime ? (c.thrust * c.burnTime) / (propMass * G0) : 60),
    propType: c.propType || "solid"
  }, 0)];
}
function normalizeStage(s, i) {
  const thrust = s.thrust || 1000;
  const propMass = Math.max(0.0001, s.propMass != null ? s.propMass : (s.fuel || 1));
  const isp = s.isp || 200;
  let mdot = thrust / (isp * G0);
  let burnTime = propMass / mdot;
  if (s.burnTime && !s.isp) { burnTime = s.burnTime; mdot = propMass / burnTime; }
  return { idx: i, thrust, isp, mdot, burnTime, propMass, dryMass: s.dryMass != null ? s.dryMass : 0.5, propType: s.propType || "solid" };
}

function createFlight(config) {
  const c = Object.assign({
    dragCoef: 0.5, payloadMass: 0,
    windSpeed: 0, windSensitivity: 1, spinStabilized: false, thrustWobble: 0,
    targetAltitude: 100, orbital: false, targetOrbitVelocity: 0, launchAngleDeg: 0,
    tier: 1, structure: null, fuelMass: 0, weather: null, recovery: null, wanHu: false, talai: null, bangfai: null,
    lantern: false, lanternBurnSec: 0, buoyPower: 0
  }, config);

  // กราฟแรงขับของบั้งไฟ (จากรูปทรงรูแกน + ดินหัวเลี้ยงท้าย) — f = ความคืบหน้าการเผาไหม้ 0..1
  function bfThrustMul(f) {
    const cv = c.bangfai && c.bangfai.curve;
    if (!cv) return 1;
    const tf = cv.tailFrac || 0, tl = cv.tailLevel != null ? cv.tailLevel : 0.35, fl = cv.frontLoad || 0;
    if (f >= 1 - tf) return tl;                          // ช่วงดินหัว: แรงขับต่ำ ยาว = ค้างฟ้า
    const g = tf < 1 ? f / (1 - tf) : 0;                 // ช่วงดินลำตัว: ตูดกว้าง = ออกตัวแรงแล้วค่อยลด
    return (1 + fl) * (1 - g) + (1 - fl * 0.35) * g;
  }

  const weather = normalizeWeather(c.weather);
  const stages = buildStages(c);
  const stageCount = stages.length;
  const payload = c.payloadMass || 0;
  const totalProp0 = Math.max(1e-6, stages.reduce((s, st) => s + st.propMass, 0));

  // ===== Phase 3 · ฟิสิกส์เฉพาะถิ่นของ Tier 1–2 (ประเมินก่อนบิน) =====
  //  - โคมลอย (paper): กระดาษสาติดไฟราว 233°C (Fahrenheit 451) — ความร้อนสะสม ∝ แรงขับ ÷ มวลโครง
  //  - บั้งไฟ (blackpowder): ดินปืนเกินปริมาตรปลอก → ความดันเกินกำลังวัสดุ → CATO;
  //    ดินปืนมากทำ CG เลื่อนไปท้ายจน "หลัง" CP → static instability (coning) เสียความสูง
  const preFuel = c.fuelMass || Math.max(0, (c.wetMass || 0) - (c.dryMass || 0)) ||
    (stages[0] ? stages[0].propMass : 0);
  //  paperRisk (0..N): ประเมินจาก main — ดินขับพลุ/ดินหนักในโคมกระดาษ; >1 = โครงรับความร้อนไม่ไหว
  const thermal = c.structure === "paper"
    ? { ignite: 233, ambient: 30, tau: 1.4, risk: c.paperRisk || 0 }  // 233°C ≈ Fahrenheit 451
    : null;
  let padCATO = false, comInstab = 0, dudFire = 0;
  if (c.structure === "blackpowder") {
    // Phase 5: ลำไม้ไผ่/พันลวด เพิ่มพิกัดความดัน (casingCapMul); เคมีดินขับให้ catoRisk มาโดยตรง
    const capMul = c.casingCapMul || 1;
    const casingCap = Math.max(0.5, (c.thrust || stages[0].thrust || 100) / 85) * capMul;
    const load = preFuel / casingCap;
    if (load > 1.0 || (c.catoRisk || 0) >= 1) padCATO = true;   // ความดันเกินกำลังปลอก / ดินประสิวเยอะไป → CATO
    else {
      if (load > 0.6) comInstab = Math.min(1, (load - 0.6) / 0.25); // CG เลื่อนไปท้าย → static instability
      if ((c.catoRisk || 0) > 0.5) comInstab = Math.max(comInstab, ((c.catoRisk || 0) - 0.5) * 1.4);
    }
    dudFire = Math.min(0.9, c.chemIgnitionRisk || 0);            // ดินขับจุดไม่ติดสม่ำเสมอ → แรงขับหาย
  }
  const glow = payload + stages.reduce((s, st) => s + st.dryMass + st.propMass, 0);
  const dv = stackDeltaV(stages, payload);
  const deltaVBudget = dv.total;

  const vOrbTarget = c.orbital ? (c.targetOrbitVelocity || orbitalVelocity(c.targetAltitude)) : 0;
  const twr0 = stages[0].thrust / (glow * G0);
  const gravityLoss = twr0 >= 1.3 ? 1500 : twr0 >= 1.15 ? 1800 : twr0 >= 1.0 ? 2400 : 3800;
  const deltaVRequired = c.orbital
    ? vOrbTarget + gravityLoss + 250
    : Math.sqrt(2 * G0 * c.targetAltitude) * 1.12;
  const reachedOrbit = c.orbital && deltaVBudget >= deltaVRequired;

  const seed = ((stages[0].thrust | 0) % 7) + 1;

  // ---- ไทม์ไลน์ท่อน (จาก Isp) ----
  const burnT = stages.map(s => s.burnTime);
  const stageEnd = []; let acc = 0;
  burnT.forEach(b => { acc += b; stageEnd.push(acc); });
  const tCutoff = acc;

  const state = {
    t: 0, x: 0, y: 0, vx: 0, vy: 0,
    mass: glow, stage: 0, stageCount, stageProp: stages[0].propMass,
    thrustNow: 0, mach: 0, fuelFrac: 1,
    q: 0, maxQ: 0, maxQAlt: 0, maxQReached: false, peakHeatFlux: 0,
    apogee: 0,
    skinTemp: thermal ? thermal.ambient : 0, skinTempPeak: 0,
    phase: "pad",   // pad | boost | coast | insertion | orbit | descent | reentry | done
    crashed: false, landed: false, burnedUp: false, reachedOrbit: false, reentryFlag: false,
    padExplosion: false, unstable: false, failReason: null,
    apoapsis: 0, periapsis: -R_EARTH, cutoff: null, insT: 0,
    _stagedTo: 1, _mq: false,
    weather,
    _recFuel: (c.recovery && c.recovery.recFuel) || 0,
    _recDv: (c.recovery && c.recovery.dvReserve) || 0,
    chuteDeployed: false, retroBurn: false, recovered: false,
    roll: 0, rollRate: c.talai ? 3 : 0, talaiWobble: 0, talaiHoriz: false,
    bangfaiWobble: 0, bangfaiHoriz: false,
    events: []
  };

  // ตะไล: ปล่อยด้วยการสะบัดมือขว้าง (ไม่ยิงตรงจากแท่น) → มีความเร็วเริ่มต้นเฉียง
  if (c.talai) {
    const tv = c.talai.throwSpeed || 10;
    state.vx = tv; state.vy = tv * 0.32;
    state.phase = "boost";
    state.events.push({ t: 0, k: "ignition", stage: 1 });
  }

  // ===== การควบคุมทิศ (gravity turn) + สลัดท่อนด้วยมือ — เชื่อมกับ FlightHUD =====
  const control = { pitchDeg: c.launchAngleDeg || 0, yaw: 0 };
  function setControl(dPitch, dir) {
    if (dPitch) control.pitchDeg = Math.max(-85, Math.min(85, control.pitchDeg + dPitch));
    if (dir) control.yaw = Math.max(-1, Math.min(1, control.yaw + dir * 0.5));
  }
  function requestStage() { state._manualStage = true; }

  // ============ วิถีแบบสคริปต์สำหรับ ORBITAL ============
  function orbitalProfile(t) {
    const t1 = stageEnd[0];
    const s1Ceiling = Math.min(95000, c.targetAltitude * 0.32 + 40000);
    // ถ้า Δv ไม่พอ เพดานสูงสุดก็ต่ำลงตามสัดส่วน
    const reach = reachedOrbit ? 1 : Math.max(0.35, Math.min(0.9, deltaVBudget / deltaVRequired));
    const apexAlt = s1Ceiling + (c.targetAltitude - s1Ceiling) * reach;
    let alt, vy;
    if (t <= t1) {
      const f = t / t1;
      alt = s1Ceiling * f * f;                      // เร่งขึ้น
      vy = s1Ceiling * 2 * f / t1;
    } else {
      const f = Math.min(1, (t - t1) / (tCutoff - t1));
      alt = s1Ceiling + (apexAlt - s1Ceiling) * (f * (2 - f)); // ชะลอการไต่
      vy = (apexAlt - s1Ceiling) * 2 * (1 - f) / (tCutoff - t1);
    }
    const vxEnd = reachedOrbit ? vOrbTarget
      : vOrbTarget * Math.max(0.15, Math.min(0.85, deltaVBudget / deltaVRequired));
    const pv = smoothstep((t / tCutoff - 0.12) / 0.85);
    const vx = vxEnd * pv;
    return { alt: Math.max(0, alt), vx, vy: Math.max(-50, vy) };
  }

  function stepOrbitalScripted(dt) {
    state.t += dt;
    if (state.phase === "pad") { state.phase = "boost"; state.events.push({ t: 0, k: "ignition", stage: 1 }); }

    // staging ตามเวลา
    while (state._stagedTo < stageCount && state.t >= stageEnd[state._stagedTo - 1]) {
      state.stage = state._stagedTo;              // ท่อนถัดไป
      state.events.push({ t: state.t, k: "staging", stage: state._stagedTo + 1, dropped: stages[state._stagedTo - 1].dryMass });
      state._stagedTo++;
    }

    const pr = orbitalProfile(state.t);
    state.y = pr.alt; state.vx = pr.vx; state.vy = pr.vy;
    state.x += state.vx * dt;
    state.apogee = Math.max(state.apogee, state.y);

    // มวลปัจจุบัน (โดยประมาณ) สำหรับ HUD
    const si = Math.min(stageCount - 1, state.stage);
    const stStart = si === 0 ? 0 : stageEnd[si - 1];
    const fb = Math.max(0, Math.min(1, (state.t - stStart) / burnT[si]));
    let m = payload, propLeft = 0;
    for (let i = si; i < stageCount; i++) {
      const pRemain = i === si ? stages[i].propMass * (1 - fb) : stages[i].propMass;
      m += stages[i].dryMass + pRemain;
      propLeft += pRemain;
    }
    state.mass = m;
    state.fuelFrac = state.t < tCutoff ? Math.max(0, propLeft / totalProp0) : 0;
    state.thrustNow = state.t < tCutoff ? stages[si].thrust : 0;

    // Max-Q จาก ρ·v²
    const rho = airDensity(state.y);
    const speed = Math.hypot(state.vx, state.vy);
    state.mach = speed / 300;
    state.q = 0.5 * rho * speed * speed;
    if (state.t < tCutoff && state.q > state.maxQ) { state.maxQ = state.q; state.maxQAlt = state.y; }
    else if (!state._mq && state.maxQ > 1 && state.q < state.maxQ * 0.85 && state.t > 4) {
      state._mq = true; state.events.push({ t: state.t, k: "maxq", alt: state.maxQAlt });
    }
    state.peakHeatFlux = Math.max(state.peakHeatFlux, rho * speed * speed * speed);

    if (state.t >= tCutoff) {
      state.cutoff = { t: state.t, alt: state.y, vx: state.vx, vy: state.vy, speed };
      state.events.push({ t: state.t, k: "cutoff", stage: stageCount });
      if (reachedOrbit) {
        state.reachedOrbit = true; state.phase = "insertion"; state.insT = state.t;
        state.apoapsis = c.targetAltitude; state.periapsis = c.targetAltitude;
        state.events.push({ t: state.t, k: "orbit", apoapsis: c.targetAltitude, periapsis: c.targetAltitude });
      } else {
        state.phase = "coast";
        state.events.push({ t: state.t, k: "orbit-fail", short: deltaVRequired - deltaVBudget });
      }
    }
    return state;
  }

  // ============ บูรณาการแรงจริงสำหรับ Tier 1–4 + การตกกลับ ============
  function pitchFromVertical() {
    if (c.orbital) return 0;
    return control.pitchDeg * Math.PI / 180;   // ปรับสดจาก FlightHUD (gravity turn)
  }

  function stepForce(dt) {
    state.t += dt;

    // ---- Easter egg: หวันหู่ — ระเบิดคาแท่นตามตำนานทันที ----
    if (c.wanHu) {
      if (!state._lit) { state._lit = true; state.events.push({ t: 0, k: "ignition", stage: 1 }); }
      if (state.t >= 0.35 && !state.padExplosion) {
        state.padExplosion = true; state.crashed = true; state.landed = true;
        state.failReason = "WAN_HU"; state.phase = "done";
        state.events.push({ t: state.t, k: "pad-explosion" });
      }
      return state;
    }

    // ---- ตะไล: ดินไวเกิน / ตำอัดแรง / ปลอกผิด → บ้องไม้รวกปริแตกคามือทันที ----
    if (c.talai && (c.talai.catoRisk || 0) >= 1) {
      if (state.t >= 0.3 && !state.padExplosion) {
        state.padExplosion = true; state.crashed = true; state.landed = true;
        state.failReason = "TALAI_CATO"; state.phase = "done";
        state.events.push({ t: state.t, k: "pad-explosion" });
      }
      return state;
    }

    // ---- บั้งไฟ (Master Craftsman): ดินร้อน/อัดผิด/รูแกนผิด/เฟื่องแคบ → ลำระเบิดคาแท่น ----
    if (c.bangfai && (c.bangfai.catoRisk || 0) >= 1) {
      if (!state._lit) { state._lit = true; state.events.push({ t: 0, k: "ignition", stage: 1 }); }
      if (state.t >= 0.4 && !state.padExplosion) {
        state.padExplosion = true; state.crashed = true; state.landed = true;
        state.failReason = "BANGFAI_CATO"; state.phase = "done";
        state.events.push({ t: state.t, k: "pad-explosion" });
      }
      return state;
    }

    // ---- Tier 2 บั้งไฟ: ดินปืนเกินพิกัดปลอก → ระเบิดคาแท่น (CATO) ----
    if (padCATO) {
      if (!state._lit) { state._lit = true; state.events.push({ t: 0, k: "ignition", stage: 1 }); }
      if (state.t >= 0.4 && !state.padExplosion) {
        state.padExplosion = true; state.crashed = true; state.landed = true;
        state.failReason = "PAD_CATO"; state.phase = "done";
        state.events.push({ t: state.t, k: "pad-explosion" });
      }
      return state;
    }

    // ---- สลัดท่อนด้วยมือ (ปุ่ม STAGE / Spacebar) ----
    if (state._manualStage) {
      state._manualStage = false;
      if (state.stage < stageCount - 1 && (state.phase === "boost" || state.phase === "coast")) {
        state.mass -= stages[state.stage].dryMass;
        const dropped = stages[state.stage].dryMass;
        state.stage++;
        state.stageProp = stages[state.stage].propMass;
        state.phase = "boost";
        state.events.push({ t: state.t, k: "staging", stage: state.stage + 1, dropped, manual: true });
      }
    }

    if (state.phase === "insertion") {
      const k = 1 - Math.exp(-dt / 2.2);
      state.y += (c.targetAltitude - state.y) * k;
      state.vx += (vOrbTarget - state.vx) * k;
      state.vy += (0 - state.vy) * k;
      state.x += state.vx * dt;
      state.apogee = Math.max(state.apogee, state.y);
      if (state.t - state.insT > 9) { state.phase = "orbit"; state.y = c.targetAltitude; state.vx = vOrbTarget; state.vy = 0; }
      return state;
    }
    if (state.phase === "orbit") {
      state.x += state.vx * dt;
      if (state.t - state.insT > 15) state.phase = "done";
      return state;
    }

    const rho = airDensity(state.y);
    const g = gravity(state.y);
    const st = stages[state.stage];
    const ascending = state.phase === "boost" || (state.phase === "coast" && state.vy > 0);

    // ---- Task 0: guidance / thrust-termination สำหรับวิถีโค้ง (Tier 4) ----
    // จรวดหยั่งอากาศ/ขีปนาวุธจริงตัดเครื่องเมื่อ "projected apogee" ถึงเป้า จะได้ไม่พุ่งเลย
    // เพดานแบบจำลอง แล้วตกกลับด้วยความเร็วเกินขอบเขตความร้อน
    if (!c.orbital && !state._guidanceCutoff && (state.phase === "pad" || state.phase === "boost")) {
      const proj = state.y + (state.vy > 0 ? (state.vy * state.vy) / (2 * g) : 0);
      const hardCeil = c.targetAltitude * 2.5;              // range-safety failsafe ทุก Tier
      if ((c.tier >= 4 && proj >= c.targetAltitude * 1.03) ||
          (c.targetAltitude > 5000 && state.y > hardCeil)) {
        state._guidanceCutoff = true;
        state.stageProp = 0;
        state.events.push({ t: state.t, k: "guidance-cutoff", alt: state.y });
      }
    }

    const burning = state.stageProp > 0 && !state._guidanceCutoff &&
      (state.phase === "pad" || state.phase === "boost");

    let thr = 0;
    if (burning) {
      let w = (c.thrustWobble > 0 && st.propType === "solid") ? 1 + c.thrustWobble * wobbleNoise(seed + state.stage, state.t) : 1;
      // Tier 2: CG เลื่อนไปท้าย → coning + สูญเสียแรงขับตามแกน
      let comLoss = 1;
      if (comInstab > 0) {
        w *= 1 + comInstab * 1.3 * wobbleNoise(seed + 9, state.t * 2.4);
        comLoss = 1 - 0.7 * comInstab;
        if (!state._unstEvt && state.t > 0.5) {
          state._unstEvt = true; state.unstable = true;
          state.events.push({ t: state.t, k: "unstable" });
        }
      }
      const vacBoost = 1 + 0.12 * (1 - Math.min(1, rho / RHO0));
      // Phase 5: ดินขับผสมไม่ดี → จุดติดไม่สม่ำเสมอ แรงขับกระตุกและตกเป็นช่วง ๆ
      let dud = 1;
      const dudAmt = Math.max(dudFire, c.bangfai ? Math.min(0.85, c.bangfai.ignitionRisk || 0) : 0);
      if (dudAmt > 0) {
        const flick = wobbleNoise(seed + 17, state.t * 3.1);
        dud = flick < (dudAmt - 0.5) * 2 ? 0.15 + Math.random() * 0.2 : 1 - dudAmt * 0.35;
      }
      // บั้งไฟ: กราฟแรงขับตามรูปทรงรูแกน + ดินหัวเลี้ยงท้าย
      const bfCurve = c.bangfai ? bfThrustMul(1 - state.stageProp / Math.max(1e-6, st.propMass)) : 1;
      thr = st.thrust * vacBoost * Math.max(0.15, w) * comLoss * dud * bfCurve;
      const burn = Math.min(state.stageProp, st.mdot * dt);
      state.stageProp -= burn; state.mass -= burn;
      if (state.phase === "pad") { state.phase = "boost"; state.events.push({ t: state.t, k: "ignition", stage: 1 }); }

      // ---- Tier 1 โคมลอย: อุณหพลศาสตร์ของกระดาษสา (ติดไฟที่ ~233°C) ----
      if (thermal) {
        const targetT = thermal.ambient + thermal.risk * 260;
        state.skinTemp += (targetT - state.skinTemp) * Math.min(1, dt / thermal.tau);
        state.skinTempPeak = Math.max(state.skinTempPeak, state.skinTemp);
        if (state.skinTemp > thermal.ignite && state.y > 2) {
          state.burnedUp = true; state.crashed = true; state.landed = true;
          state.failReason = "LANTERN_BURNUP"; state.phase = "done";
          state.events.push({ t: state.t, k: "lantern-burnup", alt: state.y });
          return state;
        }
      }
    } else if (state.phase === "boost" && state.stageProp <= 0) {
      if (state.stage < stageCount - 1 && !state._guidanceCutoff) {
        state.mass -= st.dryMass; state.stage++;
        state.stageProp = stages[state.stage].propMass;
        state.events.push({ t: state.t, k: "staging", stage: state.stage + 1, dropped: st.dryMass });
      } else {
        state.events.push({ t: state.t, k: "cutoff", stage: state.stage + 1 });
        state.cutoff = { t: state.t, alt: state.y, vx: state.vx, vy: state.vy, speed: Math.hypot(state.vx, state.vy) };
        state.phase = "coast";
      }
    }
    state.thrustNow = thr;

    // fuel bar สำหรับ FlightHUD
    let propLeft = state.stageProp;
    for (let i = state.stage + 1; i < stageCount; i++) propLeft += stages[i].propMass;
    state.fuelFrac = Math.max(0, propLeft / totalProp0);

    // RCS ด้านข้าง (ปุ่ม yaw) — nudge เล็ก ๆ ในระนาบ แล้วสลายตัว
    if (control.yaw && rho >= 0) {
      state.vx += control.yaw * 6 * dt;
      control.yaw *= Math.pow(0.12, dt);
    }

    const speed = Math.hypot(state.vx, state.vy) || 1e-6;
    state.mach = speed / 300;
    let cd = c.dragCoef * transonicFactor(state.mach);

    // ---- บั้งไฟ: หางไม่สมดุล → "รำดาบ" (static margin ผิด → ส่ายขยายตามแรงลมพลวัต) ----
    if (c.bangfai) {
      const bal = c.bangfai.tailBalance == null ? 0.8 : c.bangfai.tailBalance;
      const instab = Math.max(0, 0.75 - bal);           // เริ่มส่ายเมื่อหางสมดุล < 0.75
      if (instab > 0 && (state.phase === "boost" || state.phase === "coast")) {
        const q = Math.min(1.5, speed / 50);            // ยิ่งเร็ว แรงลมยิ่งขยายการส่าย (aerodynamically divergent)
        const growth = instab * (0.30 + q) * dt * 2.0;
        state.bangfaiWobble = Math.min(1.25, state.bangfaiWobble + growth - state.bangfaiWobble * dt * 0.30);
      } else {
        state.bangfaiWobble *= Math.max(0, 1 - dt * 0.5);
      }
      if (state.bangfaiWobble > 0.45 && !state._unstEvt && state.t > 0.35) {
        state._unstEvt = true; state.unstable = true;
        state.events.push({ t: state.t, k: "unstable" });
      }
      if (state.bangfaiWobble > 0.9 && !state.bangfaiHoriz && state.t > 0.5) {
        state.bangfaiHoriz = true;                       // รำดาบเต็มขั้น — ควงออกนอกวิถี
        state.events.push({ t: state.t, k: "bangfai-wobble" });
      }
      cd *= 1 + state.bangfaiWobble * 0.9;               // ส่ายมาก = แรงต้านเพิ่ม
    }

    // ---- Phase 5: ระบบกู้คืน ----
    const rec = c.recovery;
    const descend = state.vy < 0 && (state.phase === "descent" || state.phase === "coast" || state.phase === "reentry");
    if (rec && rec.kind === "parachute" && descend && state.y > 1 &&
        state.y < (rec.deployAlt || 1200) && speed < 400 && !state.burnedUp) {
      if (!state.chuteDeployed) {
        state.chuteDeployed = true;
        state.events.push({ t: state.t, k: "chute-deploy", alt: state.y });
      }
      cd *= 1 + (rec.dragAdd || 14);
    }
    // propulsive: กางครีบตาราง (grid fins) เบรกอากาศตอนร่อนลง ก่อน suicide burn
    if (rec && rec.kind === "propulsive" && descend && state.y < 48000) cd *= 11;

    const dragMag = 0.5 * rho * speed * speed * cd;
    let dragX = -dragMag * (state.vx / speed), dragY = -dragMag * (state.vy / speed);

    let windForce = 0;
    if (rho > 1e-4) {
      const spinFactor = c.spinStabilized ? 0.3 : 1;
      const lowSpeedVuln = 1 + Math.max(0, (40 - speed) / 40) * 1.5;
      // ลมกระโชกตามสภาพอากาศ (windGust=0 ในวันฟ้าใส → ไม่เปลี่ยนพฤติกรรมเดิม)
      const gust = weather.windGust
        ? 1 + weather.windGust * 0.6 * Math.sin(state.t * 1.7 + seed) * Math.sin(state.t * 0.5 + 1.3)
        : 1;
      const relWind = (c.windSpeed - state.vx) * gust;
      windForce = 0.5 * rho * relWind * Math.abs(relWind) * cd * 1.4 * c.windSensitivity * spinFactor * lowSpeedVuln;
    }

    let thrX = 0, thrY = thr;
    if (c.talai) {
      // ---- ตะไล: เกลียวสว่าน (torque จากรูประทุเฉียง + ปีกวงกลม) ----
      const T = c.talai;
      const angR = (T.holeAngleDeg || 15) * Math.PI / 180;
      if (thr > 0) {
        // สปิน-อัพจาก torque ของรูประทุเฉียง (ยิ่งมุมชัน/แรงขับสูง ยิ่งหมุนเร็ว)
        state.rollRate += (thr * Math.sin(angR) * (T.spinTorqueFactor || 1) * 0.11) / Math.max(3, state.mass) * dt * 6;
      }
      state.rollRate *= Math.exp(-dt * 0.04);
      state.rollRate = Math.min(state.rollRate, 200);
      state.roll += state.rollRate * dt;

      // เสถียรภาพไจโรสโคปิก
      const gyro = Math.max(0, Math.min(1, state.rollRate / 26));
      const stab = T.stabilityRatio == null ? 0.8 : T.stabilityRatio;
      const climbEff = Math.max(0, (T.climbBase || 0.8) * (0.35 + 0.65 * gyro) * (0.45 + 0.55 * stab));
      // ปีกผิดสัดส่วน / สปินไม่พอ → ส่าย
      const targetW = (1 - stab) * 0.85 + (1 - gyro) * 0.4;
      state.talaiWobble += (targetW - state.talaiWobble) * Math.min(1, dt * 2.4);
      if (state.talaiWobble > 0.45 && !state._unstEvt && state.t > 0.3) {
        state._unstEvt = true; state.unstable = true; state.talaiHoriz = true;
        state.events.push({ t: state.t, k: "unstable" });
      }

      if (thr > 0) {
        thrY = thr * Math.cos(angR) * climbEff;
        const leak = thr * (1 - climbEff * 0.9);
        // ส่วนที่ไม่ไต่ → หมุนควงรอบแกน (สปินนิ่ง = สุทธิ ~0) + ส่ายจาก wobble
        thrX = leak * 0.28 * Math.cos(state.roll)
             + thr * (0.12 + state.talaiWobble * 1.6) * Math.cos(state.t * 4.2 + seed);
      }
    } else if (thr > 0) {
      let phi = pitchFromVertical();
      if (comInstab > 0) phi += Math.sin(state.t * 7.3 + seed) * comInstab * 1.3;  // coning ของบั้งไฟ (ดินหนัก)
      if (c.bangfai && state.bangfaiWobble > 0)                                     // รำดาบจากหางไม่สมดุล
        phi += Math.sin(state.t * 5.1 + seed) * state.bangfaiWobble * 1.7 + (state.bangfaiHoriz ? 0.55 : 0);
      thrX = thr * Math.sin(phi); thrY = thr * Math.cos(phi);
    }

    // ลงจอดด้วยแรงขับ (propulsive) — suicide burn: จุดเครื่องครั้งเดียวใกล้พื้นให้พอดี
    if (rec && rec.kind === "propulsive" && descend && !c.orbital && thr <= 0 && !state.burnedUp && state._recDv > 0) {
      const aMax = rec.aMax || 55;
      const spd = Math.hypot(state.vx, state.vy) || 1e-6;
      // ระยะเบรก = ระยะที่ต้องใช้ชะลอจากความเร็วรวมปัจจุบันจนเกือบหยุด ด้วยความหน่วงสุทธิ (aMax−g)
      // (ครีบตารางเบรกอากาศช่วงบนแล้ว จุดเครื่องจริงเฉพาะช่วง ≤ ~12 กม.)
      const brakeAlt = Math.max(0, (spd * spd - 16)) / (2 * Math.max(1, aMax - g)) + 25;
      if (state.y <= brakeAlt && state.y <= 12000 && state.y > 0.2 && spd > 3.5) {
        if (!state.retroBurn) { state.retroBurn = true; state.events.push({ t: state.t, k: "retro-burn", alt: state.y }); }
        const dv = Math.min(state._recDv, aMax * dt);
        state._recDv -= dv;
        state.vx -= dv * (state.vx / spd);
        state.vy -= dv * (state.vy / spd);
      }
      // flare สุดท้าย: แตะพื้นช้าทั้งแนวดิ่ง/แนวราบ ถ้ายังมี Δv เหลือ
      if (state.y < 70 && state._recDv > 2) {
        if (-state.vy > 3) { const c1 = Math.min(state._recDv, -state.vy - 2); state._recDv -= c1; state.vy += c1; }
        if (Math.abs(state.vx) > 3) { const c2 = Math.min(state._recDv, Math.abs(state.vx) - 2); state._recDv -= c2; state.vx -= Math.sign(state.vx) * c2; }
      }
    }

    const ax = (thrX + dragX + windForce) / state.mass;
    const ay = (thrY + dragY) / state.mass - g;
    state.vx += ax * dt; state.vy += ay * dt;

    // ร่มชูชีพกาง: บังคับความเร็วร่อนเข้าสู่ terminal velocity ที่ปลอดภัย + ลอยตามลม
    if (state.chuteDeployed && state.vy < 0 && state.y > 0) {
      const vTerm = -6.5;
      state.vy += (vTerm - state.vy) * Math.min(1, dt * 2.6);
      state.vx += ((c.windSpeed || 0) - state.vx) * Math.min(1, dt * 0.7);
    }
    // ตะไล: สปินช่วยหน่วงการร่วง (autorotation คล้ายเมล็ดยางนา) ถ้าจานยังหมุนและไม่ส่าย
    if (c.talai && state.vy < 0 && state.y > 0 && state.rollRate > 5) {
      const vT = -5 - (1 - Math.min(1, state.rollRate / 40)) * 20 - state.talaiWobble * 25;
      state.vy += (vT - state.vy) * Math.min(1, dt * 1.8);
      if (!state.talaiHoriz) state.vx += (0 - state.vx) * Math.min(1, dt * 0.5);   // ควงลงตรง ๆ
    }
    state.x += state.vx * dt; state.y += state.vy * dt;

    state.q = 0.5 * rho * speed * speed;
    if (ascending && state.q > state.maxQ) { state.maxQ = state.q; state.maxQAlt = state.y; }
    else if (ascending && !state.maxQReached && state.q < state.maxQ * 0.9 && state.t > 0.6 && state.maxQ > 1) {
      state.maxQReached = true; state.events.push({ t: state.t, k: "maxq", alt: state.maxQAlt });
    }
    state.peakHeatFlux = Math.max(state.peakHeatFlux, rho * speed * speed * speed);
    if (state.y > state.apogee) state.apogee = state.y;

    if (state.phase === "coast" && state.vy < 0 && state.t > 1) {
      state.phase = "descent";
      state.events.push({ t: state.t, k: "apogee", alt: state.apogee });
    }
    // วัตถุลอยช้า (โคมลอย/พลุ) — ตัดจบเมื่อร่อนลงต่ำและช้ามากแล้ว
    if (state.phase === "descent" && state.y < state.apogee * 0.35 && Math.hypot(state.vx, state.vy) < 6 && state.apogee < 5000) {
      state.y = 0; state.landed = true; state.crashed = false; state.phase = "done";
      state.recoveryDrift = Math.abs(state.x);
      if (c.recovery && (c.recovery.kind === "parachute" || c.recovery.kind === "propulsive")) state.recovered = true;
      state.events.push({ t: state.t, k: "landing" });
      return state;
    }
    if ((state.phase === "descent" || state.phase === "coast") && state.vy < 0 &&
        state.y < 95000 && state.y > 28000 && speed > 2000 && !state.reentryFlag) {
      state.reentryFlag = true; state.phase = "reentry";
      state.events.push({ t: state.t, k: "reentry", speed });
      if (speed > 6800) { state.burnedUp = true; state.events.push({ t: state.t, k: "burnup" }); state.phase = "done"; return state; }
    }
    if (state.phase === "reentry" && state.y < 24000) state.phase = "descent";

    if (state.y <= 0 && state.phase !== "pad" && (state.phase !== "boost" || (c.talai && state.t > 1))) {
      state.y = 0; state.landed = true;
      state.recoveryDrift = Math.abs(state.x);
      const touch = Math.hypot(state.vx, state.vy);
      if (c.talai) {
        // ตะไลที่ส่ายจะร่วงแนวราบไปไกล; ที่หมุนนิ่งจะร่อนลงช้า
        state.crashed = state.talaiHoriz || touch > 34;
        state.events.push({ t: state.t, k: state.crashed ? "crash" : "landing" });
        state.phase = "done";
        return state;
      }
      if (rec && rec.kind === "propulsive" && !c.orbital) {
        // ลงจอดด้วยแรงขับ: สำเร็จถ้าเบรกจนแตะพื้นช้า (งบ Δv สำรองต้องพอ)
        if (state.retroBurn && touch <= 16 && !state.burnedUp) {
          state.crashed = false; state.recovered = true;
          state.events.push({ t: state.t, k: "soft-landing" });
        } else {
          state.crashed = true; state.failReason = state.failReason || "LANDING_BURN_FAIL";
          state.events.push({ t: state.t, k: "landing-burn-fail" });
        }
      } else if (rec && rec.kind === "parachute" && state.chuteDeployed && !state.reentryFlag) {
        state.crashed = touch > 24;
        if (!state.crashed) { state.recovered = true; state.events.push({ t: state.t, k: "landing" }); }
        else state.events.push({ t: state.t, k: "crash" });
      } else {
        state.crashed = touch > 65 || state.reentryFlag || state.bangfaiHoriz;
        state.events.push({ t: state.t, k: state.crashed ? "crash" : "landing" });
      }
      state.phase = "done";
    }
    return state;
  }

  // ============ โคมลอย — แรงลอยตัวความร้อน (ไม่ใช่แรงขับจรวด) ============
  //  ไต่ช้า นุ่ม จนถึงจุดลอยตัวสมดุล แล้วลอยไปกับมวลอากาศ (ลมพัดไปไหนไปนั่น)
  //  เปลวไฟดับ → เย็นลง → ค่อย ๆ ร่อนลง; กระดาษสายังติดไฟได้ที่ ~233°C
  function stepLantern(dt) {
    state.t += dt;
    if (state.phase === "pad") { state.phase = "boost"; state.events.push({ t: 0, k: "ignition", stage: 1 }); }

    const g = gravity(state.y);
    const rho = airDensity(state.y);
    const burnSec = c.lanternBurnSec || (tCutoff * 4) || 10;
    const lit = state.t < burnSec;

    // อุณหพลศาสตร์กระดาษสา (ติดไฟ ~233°C) — ใช้ค่าเดียวกับ thermal เดิม
    if (thermal) {
      const targetT = lit ? thermal.ambient + (thermal.risk || 0) * 260 : thermal.ambient;
      state.skinTemp += (targetT - state.skinTemp) * Math.min(1, dt / (lit ? thermal.tau : thermal.tau * 3));
      state.skinTempPeak = Math.max(state.skinTempPeak, state.skinTemp);
      if (lit && state.skinTemp > thermal.ignite && state.y > 2) {
        state.burnedUp = true; state.crashed = true; state.landed = true;
        state.failReason = "LANTERN_BURNUP"; state.phase = "done";
        state.events.push({ t: state.t, k: "lantern-burnup", alt: state.y });
        return state;
      }
    }

    // แรงลอยตัว: ขณะไฟติด อากาศร้อนเบากว่าอากาศเย็น (อาร์คิมิดีส)
    //   buoyRatio > 1 = ไต่ขึ้น, = 1 = ลอยตัวสมดุล, < 1 = ร่อนลง
    //   ยิ่งสูง อากาศเบาลง → แรงลอยลด → เข้าสู่จุดสมดุลเอง
    const rise = 0.075 + 0.06 * (c.buoyPower || 0);
    const buoyRatio = lit
      ? Math.max(0.97, Math.min(1.18, 1 + rise - state.y / 900))
      : 0.82;
    const aUp = g * (buoyRatio - 1);
    // แรงต้านอากาศแนวดิ่ง — โคมพื้นที่หน้าตัดใหญ่/มวลน้อย → ความเร็วอิ่มตัวเร็ว
    const areaDrag = (c.dragCoef || 0.09) * 2.1 / Math.max(0.3, state.mass);
    const vDragY = -Math.sign(state.vy || 1e-6) * 0.5 * rho * state.vy * state.vy * areaDrag;
    state.vy += (aUp + vDragY) * dt;
    state.vy = Math.max(-4.2, Math.min(6.0, state.vy));   // ไต่/ร่อนแบบ graceful

    // ลอยตามลม: vx เข้าหาความเร็วลม (× ความไวลมของโคม) อย่างรวดเร็ว
    const gust = weather.windGust
      ? 1 + weather.windGust * 0.7 * Math.sin(state.t * 1.2 + seed) * Math.sin(state.t * 0.4 + 1.1)
      : 1;
    const targetVx = (c.windSpeed || 0) * gust * (c.windSensitivity || 1.8);
    state.vx += (targetVx - state.vx) * Math.min(1, dt * 0.85);

    state.x += state.vx * dt;
    state.y += state.vy * dt;
    if (state.y < 0) state.y = 0;

    // เชื้อเพลิงลด (ให้ HUD มีอะไรแสดง)
    const md = (stages[0] && stages[0].propMass ? stages[0].propMass / burnSec : 0.02);
    state.stageProp = Math.max(0, state.stageProp - md * dt);
    state.mass = Math.max(0.15, state.mass - md * dt * 0.4);
    state.fuelFrac = lit ? Math.max(0, state.t < burnSec ? 1 - state.t / burnSec : 0) : 0;
    state.thrustNow = lit ? g * state.mass * buoyRatio : 0;

    state.apogee = Math.max(state.apogee, state.y);
    const spd = Math.hypot(state.vx, state.vy);
    state.mach = spd / 300;
    state.q = 0.5 * rho * spd * spd;

    if (!lit && state.vy < 0 && state.phase === "boost") {
      state.phase = "descent";
      state.events.push({ t: state.t, k: "apogee", alt: state.apogee });
    }

    // จบเที่ยวบิน: แตะพื้น (ร่อนลงเบา ๆ — ไม่ "ตก"), หรือลอยหาย/หมดเวลา
    const drifted = Math.abs(state.x) > 4500;
    if ((state.y <= 0 && state.t > 0.6) || state.t > 95 || drifted) {
      state.landed = true; state.crashed = false;
      state.recoveryDrift = Math.abs(state.x);
      state.events.push({ t: state.t, k: "landing" });
      state.phase = "done";
    }
    return state;
  }

  function step(dt) {
    if (state.phase === "done") return state;
    dt = Math.min(dt, 0.05);
    if (c.lantern) return stepLantern(dt);
    // orbital + ยังอยู่ในช่วงขาขึ้นสคริปต์
    if (c.orbital && state.t < tCutoff && state.phase !== "coast" && state.phase !== "descent" && state.phase !== "reentry") {
      return stepOrbitalScripted(dt);
    }
    return stepForce(dt);
  }

  function runToEnd() {
    let guard = 0;
    while (state.phase !== "done" && guard < 200000) { step(0.04); guard++; }
    return summary();
  }

  function summary() {
    const co = state.cutoff;
    return {
      apogee: state.apogee, flightTime: state.t,
      maxQ: state.maxQ, maxQAlt: state.maxQAlt,
      horizontalDrift: state.x, landingX: state.x,
      crashed: state.crashed, landed: state.landed,
      targetAltitude: c.targetAltitude,
      altitudeRatio: c.targetAltitude > 0 ? state.apogee / c.targetAltitude : 0,
      orbital: !!c.orbital, reachedOrbit: state.reachedOrbit,
      burnedUp: state.burnedUp, reentry: state.reentryFlag,
      padExplosion: !!state.padExplosion, unstable: !!state.unstable,
      skinTempPeak: Math.round(state.skinTempPeak),
      guidanceCutoff: !!state._guidanceCutoff,
      failReason: state.failReason ||
        (c.talai && state.talaiHoriz && state.crashed ? "TALAI_WOBBLE" : null) ||
        (c.bangfai && state.bangfaiHoriz && state.crashed ? "BANGFAI_WOBBLE" : null) ||
        (state.unstable && state.apogee < c.targetAltitude * 0.92 ? "UNSTABLE_COM" : null),
      apoapsis: state.apoapsis, periapsis: state.periapsis,
      peakHeatFlux: state.peakHeatFlux,
      cutoffAltitude: co ? co.alt : 0, cutoffSpeed: co ? co.speed : 0,
      orbitalVelocityTarget: vOrbTarget,
      deltaVBudget, deltaVRequired, deltaVMargin: deltaVBudget - deltaVRequired,
      payloadMass: payload, glow, payloadFraction: glow > 0 ? payload / glow : 0,
      twr0, stagesUsed: state.stage + 1, stageCount,
      recovery: c.recovery ? c.recovery.kind : "freefall",
      recovered: !!state.recovered,
      chuteDeployed: !!state.chuteDeployed,
      retroBurn: !!state.retroBurn,
      recoveryDrift: state.recoveryDrift != null ? state.recoveryDrift : Math.abs(state.x),
      recFuelLeft: state._recFuel,
      talai: !!c.talai,
      talaiWobble: +state.talaiWobble.toFixed(2),
      talaiHoriz: !!state.talaiHoriz,
      lantern: !!c.lantern,
      bangfai: !!c.bangfai,
      bangfaiWobble: +state.bangfaiWobble.toFixed(2),
      bangfaiHoriz: !!state.bangfaiHoriz,
      spinRate: Math.round(state.rollRate)
    };
  }

  return {
    state, step, runToEnd, summary, config: c, stages, weather,
    deltaVBudget, deltaVRequired, glow, stageDeltaV: dv.per, tCutoff, stageEnd,
    control, setControl, requestStage,
    preFlight: { padCATO, comInstab, paperStructure: !!thermal }
  };
}

window.Physics = {
  createFlight, airDensity, gravity, orbitalVelocity, stackDeltaV,
  normalizeWeather, makeWeather, WEATHER_PRESETS,
  G: G0, MU, R_EARTH, KARMAN,
  deltaV(stages, payloadMass) { return stackDeltaV(stages, payloadMass).total; }
};
