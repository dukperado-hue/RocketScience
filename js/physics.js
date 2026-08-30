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
    targetAltitude: 100, orbital: false, targetOrbitVelocity: 0, launchAngleDeg: 0
  }, config);

  const stages = buildStages(c);
  const stageCount = stages.length;
  const payload = c.payloadMass || 0;
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
    thrustNow: 0, mach: 0,
    q: 0, maxQ: 0, maxQAlt: 0, maxQReached: false, peakHeatFlux: 0,
    apogee: 0,
    phase: "pad",   // pad | boost | coast | insertion | orbit | descent | reentry | done
    crashed: false, landed: false, burnedUp: false, reachedOrbit: false, reentryFlag: false,
    apoapsis: 0, periapsis: -R_EARTH, cutoff: null, insT: 0,
    _stagedTo: 1, _mq: false,
    events: []
  };

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
    let m = payload;
    for (let i = si; i < stageCount; i++) m += stages[i].dryMass + (i === si ? stages[i].propMass * (1 - fb) : stages[i].propMass);
    state.mass = m;
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
    return (c.launchAngleDeg || 0) * Math.PI / 180;
  }

  function stepForce(dt) {
    state.t += dt;

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
    const burning = state.stageProp > 0 && (state.phase === "pad" || state.phase === "boost");

    let thr = 0;
    if (burning) {
      const w = (c.thrustWobble > 0 && st.propType === "solid") ? 1 + c.thrustWobble * wobbleNoise(seed + state.stage, state.t) : 1;
      const vacBoost = 1 + 0.12 * (1 - Math.min(1, rho / RHO0));
      thr = st.thrust * vacBoost * Math.max(0.15, w);
      const burn = Math.min(state.stageProp, st.mdot * dt);
      state.stageProp -= burn; state.mass -= burn;
      if (state.phase === "pad") { state.phase = "boost"; state.events.push({ t: state.t, k: "ignition", stage: 1 }); }
    } else if (state.phase === "boost" && state.stageProp <= 0) {
      if (state.stage < stageCount - 1) {
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

    const speed = Math.hypot(state.vx, state.vy) || 1e-6;
    state.mach = speed / 300;
    const cd = c.dragCoef * transonicFactor(state.mach);
    const dragMag = 0.5 * rho * speed * speed * cd;
    let dragX = -dragMag * (state.vx / speed), dragY = -dragMag * (state.vy / speed);

    let windForce = 0;
    if (rho > 1e-4) {
      const spinFactor = c.spinStabilized ? 0.3 : 1;
      const lowSpeedVuln = 1 + Math.max(0, (40 - speed) / 40) * 1.5;
      const relWind = c.windSpeed - state.vx;
      windForce = 0.5 * rho * relWind * Math.abs(relWind) * cd * 1.4 * c.windSensitivity * spinFactor * lowSpeedVuln;
    }

    let thrX = 0, thrY = thr;
    if (thr > 0) { const phi = pitchFromVertical(); thrX = thr * Math.sin(phi); thrY = thr * Math.cos(phi); }

    const ax = (thrX + dragX + windForce) / state.mass;
    const ay = (thrY + dragY) / state.mass - g;
    state.vx += ax * dt; state.vy += ay * dt;
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

    if (state.y <= 0 && state.phase !== "pad" && state.phase !== "boost") {
      state.y = 0; state.landed = true;
      state.crashed = speed > 65 || state.reentryFlag;
      state.phase = "done";
      state.events.push({ t: state.t, k: state.crashed ? "crash" : "landing" });
    }
    return state;
  }

  function step(dt) {
    if (state.phase === "done") return state;
    dt = Math.min(dt, 0.05);
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
      apoapsis: state.apoapsis, periapsis: state.periapsis,
      peakHeatFlux: state.peakHeatFlux,
      cutoffAltitude: co ? co.alt : 0, cutoffSpeed: co ? co.speed : 0,
      orbitalVelocityTarget: vOrbTarget,
      deltaVBudget, deltaVRequired, deltaVMargin: deltaVBudget - deltaVRequired,
      payloadMass: payload, glow, payloadFraction: glow > 0 ? payload / glow : 0,
      twr0, stagesUsed: state.stage + 1, stageCount
    };
  }

  return { state, step, runToEnd, summary, config: c, stages, deltaVBudget, deltaVRequired, glow, stageDeltaV: dv.per, tCutoff, stageEnd };
}

window.Physics = {
  createFlight, airDensity, gravity, orbitalVelocity, stackDeltaV,
  G: G0, MU, R_EARTH, KARMAN,
  deltaV(stages, payloadMass) { return stackDeltaV(stages, payloadMass).total; }
};
