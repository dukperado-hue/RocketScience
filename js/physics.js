// js/physics.js
// เครื่องจำลองการบิน 2 มิติ (Phase 1) — แรงโน้มถ่วง แรงขับ แรงต้านอากาศ ลมพัดเฉ และ spin-stabilization
// ใช้หน่วย SI (เมตร, วินาที, กิโลกรัม, นิวตัน) แต่ค่าถูกปรับจูนเพื่อความสนุก ไม่ใช่ค่าจริงเป๊ะ

const G = 9.81;
const RHO0 = 1.225;          // ความหนาแน่นอากาศระดับน้ำทะเล
const SCALE_HEIGHT = 8500;   // สเกลความสูงบรรยากาศ (m)

function airDensity(alt) {
  if (alt < 0) alt = 0;
  return RHO0 * Math.exp(-alt / SCALE_HEIGHT);
}

// pseudo-random noise ต่อเนื่อง สำหรับความไม่สม่ำเสมอของแรงขับ (บั้งไฟ)
function wobbleNoise(seed, t) {
  return (
    Math.sin(t * 6.1 + seed) * 0.6 +
    Math.sin(t * 13.7 + seed * 2.3) * 0.3 +
    Math.sin(t * 27.3 + seed * 4.7) * 0.1
  );
}

/**
 * config = {
 *   thrust,        // นิวตัน (แรงขับรวมตอนเครื่องทำงาน)
 *   burnTime,      // วินาที
 *   wetMass,       // มวลรวมตอนเต็มถัง (kg)
 *   dryMass,       // มวลหลังเชื้อเพลิงหมด (kg)
 *   dragCoef,      // สัมประสิทธิ์แรงต้าน (รวมพื้นที่หน้าตัดไว้แล้ว)
 *   windSpeed,     // m/s (บวก = พัดไปทางขวา)
 *   windSensitivity,
 *   spinStabilized,
 *   thrustWobble,  // 0..1 สัดส่วนความแกว่งของแรงขับ
 *   targetAltitude
 * }
 */
function createFlight(config) {
  const c = Object.assign({
    thrust: 100, burnTime: 2, wetMass: 1, dryMass: 0.6, dragCoef: 0.5,
    windSpeed: 0, windSensitivity: 1, spinStabilized: false, thrustWobble: 0,
    targetAltitude: 100
  }, config);

  const fuelMass = Math.max(0.0001, c.wetMass - c.dryMass);
  const mdot = fuelMass / c.burnTime;
  const seed = (c.thrust % 7) + 1;

  const state = {
    t: 0, x: 0, y: 0, vx: 0, vy: 0,
    mass: c.wetMass, fuel: fuelMass,
    thrustNow: 0, q: 0, maxQ: 0, maxQAlt: 0, apogee: 0,
    phase: "pad",           // pad | boost | coast | descent | done
    maxQReached: false,
    crashed: false, landed: false,
    events: []
  };

  function step(dt) {
    if (state.phase === "done") return state;
    // จำกัด dt กันระเบิดเชิงตัวเลข
    dt = Math.min(dt, 0.05);
    state.t += dt;

    const rho = airDensity(state.y);
    const burning = state.fuel > 0;

    // แรงขับ + ความแกว่ง
    let thr = 0;
    if (burning) {
      const w = c.thrustWobble > 0 ? 1 + c.thrustWobble * wobbleNoise(seed, state.t) : 1;
      thr = c.thrust * Math.max(0.15, w);
      const burn = Math.min(state.fuel, mdot * dt);
      state.fuel -= burn;
      state.mass -= burn;
      if (state.phase === "pad") { state.phase = "boost"; state.events.push({ t: state.t, k: "ignition" }); }
    } else if (state.phase === "boost") {
      state.phase = "coast";
      state.events.push({ t: state.t, k: "burnout" });
    }
    state.thrustNow = thr;

    const speed = Math.hypot(state.vx, state.vy);

    // แรงต้านอากาศ (ทิศตรงข้ามความเร็ว)
    const dragMag = 0.5 * rho * speed * speed * c.dragCoef;
    let dragX = 0, dragY = 0;
    if (speed > 0.001) {
      dragX = -dragMag * (state.vx / speed);
      dragY = -dragMag * (state.vy / speed);
    }

    // ลมพัดเฉ — แรงขึ้นกับความเร็วลมสัมพัทธ์และพื้นที่รับลม
    // spin-stabilization ลดผลของลมลงเหลือ ~30%
    const spinFactor = c.spinStabilized ? 0.3 : 1;
    // ตอนแรงขับต่ำ/ความเร็วต่ำ จรวดโดนลมพาไปง่ายกว่า
    const lowSpeedVuln = 1 + Math.max(0, (40 - speed) / 40) * 1.5;
    const relWind = c.windSpeed - state.vx;
    const windForce = 0.5 * rho * relWind * Math.abs(relWind) * c.dragCoef * 1.4 *
      c.windSensitivity * spinFactor * lowSpeedVuln;

    // แรงขับดันตามแกนตั้งเป็นหลัก (จรวดชี้ขึ้น) — โมเดลย่อ
    const ax = (dragX + windForce) / state.mass;
    const ay = (thr + dragY) / state.mass - G;

    state.vx += ax * dt;
    state.vy += ay * dt;
    state.x += state.vx * dt;
    state.y += state.vy * dt;

    if (state.y < 0) {
      state.y = 0;
      state.landed = true;
      state.crashed = speed > 65; // ตกกระแทกเร็วเกินไป = เสียหาย (Phase 1 ยังไม่มีร่มชูชีพ)
      state.phase = "done";
      state.events.push({ t: state.t, k: state.crashed ? "crash" : "landing" });
      return state;
    }

    // dynamic pressure
    state.q = 0.5 * rho * speed * speed;
    if (state.q > state.maxQ) {
      state.maxQ = state.q;
      state.maxQAlt = state.y;
    } else if (!state.maxQReached && state.q < state.maxQ * 0.92 && state.t > 0.4) {
      state.maxQReached = true;
      state.events.push({ t: state.t, k: "maxq", alt: state.maxQAlt });
    }

    if (state.y > state.apogee) state.apogee = state.y;
    if (state.phase === "coast" && state.vy < 0) {
      state.phase = "descent";
      state.events.push({ t: state.t, k: "apogee", alt: state.apogee });
    }

    return state;
  }

  // จำลองจนจบเที่ยวบิน (headless) — คืนสรุป
  function runToEnd() {
    let guard = 0;
    while (state.phase !== "done" && guard < 20000) {
      step(0.02);
      guard++;
    }
    return summary();
  }

  function summary() {
    return {
      apogee: state.apogee,
      flightTime: state.t,
      maxQ: state.maxQ,
      maxQAlt: state.maxQAlt,
      horizontalDrift: state.x,
      landingX: state.x,
      crashed: state.crashed,
      landed: state.landed,
      targetAltitude: c.targetAltitude,
      altitudeRatio: c.targetAltitude > 0 ? state.apogee / c.targetAltitude : 0
    };
  }

  return { state, step, runToEnd, summary, config: c };
}

window.Physics = { createFlight, airDensity, G };
