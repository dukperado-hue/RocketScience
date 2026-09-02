/* =============================================================================
 * FROM FIRE TO ORBIT — Unified Architecture
 * js/core/Physics.js
 *
 * The PURE 1-D flight integrator + the SIMULATION CONTRACT.
 *
 * Input : Vehicle.toPhysicsModel()  (plain data)
 * Output: a locked `SimulationResult` — see @typedef below. Three.js NEVER
 *         computes flight; it only plays this object back. That is the whole
 *         architecture: Core produces data, Render consumes it.
 *
 * NO Three.js. NO DOM. NO game state. Runs unmodified in Node.
 *
 * Force model (vertical axis only, for now):
 *   F_net = thrust(t) + buoyancy(t)  −  m(t)·g(y)  −  drag(y, v)
 *   drag  = 0.5 · ρ(y) · (Σ Cd·A) · v·|v|
 *   ρ(y)  = ρ0 · exp(−y / H)            (isothermal approximation)
 *   g(y)  = g0 · (Re / (Re + y))²
 * ===========================================================================*/
(function (global) {
  'use strict';

  var G0 = 9.80665;        // m/s^2 at sea level
  var RE = 6371000;        // m, Earth radius
  var RHO0 = 1.225;        // kg/m^3 at sea level
  var SCALE_H = 8500;      // m, density scale height

  var CONTRACT_VERSION = '1.2.0';

  // --- dynamic aero-instability ("the tumble") ---------------------------------
  var TUMBLE_SPEED_MIN = 12;      // m/s — below this, too slow to weathercock
  var TUMBLE_DRAG_MULT = 3.5;     // broadside Cd·A blow-up once tumbling
  var TUMBLE_THRUST_FRAC = 0.30;  // thrust still fires but points every which way
  var TUMBLE_CLIMB_BLEED = 2.6;   // per-second bleed applied to UPWARD velocity only

  /**
   * @typedef {Object} TrajectoryState
   * @property {number} time                       seconds since ignition
   * @property {{x:number,y:number,z:number}} position   metres (y = altitude, up)
   * @property {number} velocity                   signed vertical velocity, m/s
   * @property {number} speed                      |velocity|, m/s
   * @property {number} acceleration               m/s^2
   * @property {number} mass                       kg (drops as propellant burns)
   * @property {{pitch:number,yaw:number,roll:number}} orientation  degrees
   * @property {number} altitude                   metres (== position.y)
   * @property {number} q                          dynamic pressure, Pa
   * @property {number} thrust                     N (rocket-mode motors)
   * @property {number} buoyancy                   N (buoyancy-mode motors)
   * @property {number} drag                       N
   * @property {number} propRemaining              kg
   * @property {boolean} tumbling                  true once the stack departs controlled flight
   *
   * @typedef {Object} FlightEvent
   * @property {number} time
   * @property {'IGNITION'|'LIFTOFF'|'MAX_Q'|'APOGEE'|'BURNOUT'|'LOSS_OF_CONTROL'|'IMPACT'} type
   * @property {string} message
   * @property {number} altitude
   * @property {number} velocity
   *
   * @typedef {Object} SimulationResult
   * @property {boolean} ok
   * @property {string}  reason
   * @property {string}  contractVersion
   * @property {TrajectoryState[]} trajectory
   * @property {FlightEvent[]}     events
   * @property {{apogee:number,maxVelocity:number,maxQ:number,flightTime:number,
   *            apogeeTime:number,burnoutMass:number,liftedOff:boolean}} summary
   * @property {{id:string,status:'OK'|'WARN'|'FAIL',message:string,detail:string}[]} diagnostics
   * @property {{dt:number,maxTime:number,sampleEvery:number}} meta
   */

  // ---------------------------------------------------------------------------
  //  Environment
  // ---------------------------------------------------------------------------
  function gravity(y) {
    var r = RE / (RE + Math.max(y, 0));
    return G0 * r * r;
  }
  function airDensity(y) {
    return RHO0 * Math.exp(-Math.max(y, 0) / SCALE_H);
  }

  /**
   * Instantaneous propulsive/buoyant force + mass-flow for one motor.
   * @returns {{force:number, mdot:number}}
   */
  function motorOutput(motor, t) {
    var bt = motor.burnTime || 0;
    var spool = motor.spoolTime || 0;

    if (motor.mode === 'buoyancy') {
      var lift;
      if (t < spool) {
        lift = motor.thrust * (t / Math.max(spool, 1e-6));
      } else if (t <= bt) {
        lift = motor.thrust;
      } else if (t <= bt + spool) {
        lift = motor.thrust * (1 - (t - bt) / Math.max(spool, 1e-6));
      } else {
        lift = 0;
      }
      var mdot = (t <= bt && bt > 0 && motor.propellantMass > 0)
        ? motor.propellantMass / bt : 0;
      return { force: Math.max(lift, 0), mdot: mdot };
    }

    // rocket mode: near-instant spool, flat thrust, hard cutoff at burnTime
    if (t > bt || bt <= 0) return { force: 0, mdot: 0 };
    var f = spool > 0 && t < spool ? motor.thrust * (t / spool) : motor.thrust;
    var flow = motor.propellantMass > 0 ? motor.propellantMass / bt : 0;
    return { force: f, mdot: flow };
  }

  /**
   * One integration step (semi-implicit Euler).
   * @param {{t:number,y:number,v:number,propRemaining:number}} state
   * @param {Object} model  Vehicle.toPhysicsModel() output
   * @param {number} dt
   */
  function step(state, model, dt) {
    var g = gravity(state.y);
    var rho = airDensity(state.y);

    var thrust = 0, buoyancy = 0, mdotTotal = 0;
    for (var i = 0; i < model.motors.length; i++) {
      var out = motorOutput(model.motors[i], state.t);
      if (model.motors[i].mode === 'buoyancy') buoyancy += out.force;
      else thrust += out.force;
      mdotTotal += out.mdot;
    }

    var burned = Math.min(mdotTotal * dt, state.propRemaining);
    var propRemaining = state.propRemaining - burned;
    var mass = Math.max(model.dryMass + propRemaining, 1e-6);

    // Hot-air buoyancy scales with ambient density: thinner air aloft = less
    // lift for the same temperature delta, so a lantern naturally levels off.
    buoyancy *= rho / RHO0;

    var v, y, a, drag, onPad = false;

    if (state.tumbling) {
      // ---- AERODYNAMICALLY OUT OF CONTROL --------------------------------
      // The stack has pitched broadside to the airstream: reference area and
      // Cd balloon, the nozzle no longer points along the velocity vector, and
      // whatever thrust is left just spins it. Model it as a hard velocity
      // bleed under gravity + a fraction of misdirected thrust. Deterministic,
      // never stiff — a tumble should always arc over and come down.
      drag = 0.5 * rho * model.dragArea * TUMBLE_DRAG_MULT * state.v * Math.abs(state.v);
      var aThr = (thrust * TUMBLE_THRUST_FRAC) / mass;
      a = aThr - g - drag / mass;
      v = state.v + a * dt;
      // energy poured into the tumble comes out of the climb — bleed only while
      // still going up, so a falling wreck still settles at a drag terminal.
      if (v > 2) v *= (1 - Math.min(0.4, TUMBLE_CLIMB_BLEED * dt));
      y = state.y + v * dt;
      if (y <= 0) { y = 0; if (v < 0) { v = 0; onPad = true; } }
      return {
        t: state.t + dt, y: y, v: v, propRemaining: propRemaining,
        a: clampA(a), mass: mass, thrust: thrust, buoyancy: buoyancy, drag: drag,
        q: 0.5 * rho * v * v, g: g, rho: rho, onPad: onPad, tumbling: true
      };
    }

    drag = 0.5 * rho * model.dragArea * state.v * Math.abs(state.v);
    var fNet = thrust + buoyancy - mass * g - drag;
    a = clampA(fNet / mass);

    v = state.v + a * dt;
    y = state.y + v * dt;

    if (y <= 0) { y = 0; if (v < 0) { v = 0; onPad = true; } }

    return {
      t: state.t + dt, y: y, v: v, propRemaining: propRemaining,
      a: a, mass: mass, thrust: thrust, buoyancy: buoyancy, drag: drag,
      q: 0.5 * rho * v * v, g: g, rho: rho, onPad: onPad, tumbling: false
    };
  }

  // A crash never needs 40-g fidelity; clamp keeps the integrator well-behaved.
  function clampA(a) { return a < -400 ? -400 : (a > 400 ? 400 : a); }

  // ---------------------------------------------------------------------------
  //  simulate() — produces the locked SimulationResult
  // ---------------------------------------------------------------------------

  /**
   * @param {Object} model  Vehicle.toPhysicsModel() output
   * @param {Object} [opts]
   * @param {number} [opts.dt=0.02]
   * @param {number} [opts.maxTime=1800]
   * @param {number} [opts.sampleEvery=0.1]
   * @returns {SimulationResult}
   */
  function simulate(model, opts) {
    opts = opts || {};
    var dt = opts.dt || 0.02;
    var maxTime = opts.maxTime || 1800;
    var sampleEvery = opts.sampleEvery || 0.1;
    var meta = { dt: dt, maxTime: maxTime, sampleEvery: sampleEvery };

    if (!model || !model.valid) {
      var reason = model
        ? 'ยานยังประกอบไม่ครบ (ไม่มีแรงขับ/แรงพยุง หรือชิ้นส่วนไม่ต่อกัน)'
        : 'ไม่มีโมเดลยาน';
      return finalize({
        ok: false, reason: reason, trajectory: [], events: [],
        summary: emptySummary(), meta: meta
      }, model);
    }

    var state = { t: 0, y: 0, v: 0, propRemaining: model.propellantMass, tumbling: false };
    var trajectory = [];
    var apogee = 0, apogeeTime = 0, maxV = 0, maxQ = 0;
    var liftedOff = false, nextSample = 0;
    var tumbleT = Infinity;                    // time the tumble started
    var canTumble = !!model.rocketDominant && isFinite(model.copAxisM);
    var reason = 'สิ้นสุดการบิน';

    // seed t=0 state so playback starts exactly on the pad
    trajectory.push(toState({ t: 0, y: 0, v: 0, a: 0, mass: model.totalMass,
      thrust: 0, buoyancy: 0, drag: 0, q: 0, propRemaining: model.propellantMass }, tumbleT));
    nextSample += sampleEvery;

    while (state.t < maxTime) {
      var d = step(state, model, dt);

      if (d.y > 0.02) liftedOff = true;
      if (d.y > apogee) { apogee = d.y; apogeeTime = d.t; }
      if (Math.abs(d.v) > maxV) maxV = Math.abs(d.v);
      if (d.q > maxQ) maxQ = d.q;

      // --- dynamic aero-stability: CoM slides forward as propellant burns.
      //     Once moving fast, if the (interpolated) CoM passes the CoP, the
      //     stack weathercocks the wrong way and departs controlled flight.
      var wasTumbling = state.tumbling;
      if (canTumble && !state.tumbling && liftedOff &&
          Math.abs(d.v) > TUMBLE_SPEED_MIN) {
        var pf = model.propellantMass > 0
          ? d.propRemaining / model.propellantMass : 1;
        var comAxis = model.comDryAxisM +
          (model.comWetAxisM - model.comDryAxisM) * pf;
        if (model.copAxisM - comAxis <= 0) {
          state.tumbling = true;
          d.tumbling = true;
          tumbleT = d.t;
        }
      }

      if (d.t >= nextSample || (state.tumbling && !wasTumbling)) {
        trajectory.push(toState(d, tumbleT));
        if (d.t >= nextSample) nextSample += sampleEvery;
      }

      state = {
        t: d.t, y: d.y, v: d.v, propRemaining: d.propRemaining,
        tumbling: state.tumbling
      };

      if (liftedOff && d.onPad) {
        reason = state.tumbling ? 'จรวดเสียการควบคุมแล้วตกกระแทกพื้น' : 'ยานแตะพื้นแล้ว';
        trajectory.push(toState(d, tumbleT));  // guarantee the impact sample
        break;
      }
      if (!liftedOff && state.t > 30 &&
          d.thrust + d.buoyancy < model.dryMass * gravity(0) * 0.999) {
        reason = 'แรงยกไม่พอ — ยานไม่ลอยขึ้นจากพื้น';
        break;
      }
    }
    if (state.t >= maxTime) reason = 'ถึงเวลาจำกัดการจำลอง';

    var summary = {
      apogee: round(apogee, 2),
      maxVelocity: round(maxV, 2),
      maxQ: round(maxQ, 2),
      flightTime: round(state.t, 2),
      apogeeTime: round(apogeeTime, 2),
      burnoutMass: round(model.dryMass + state.propRemaining, 4),
      liftedOff: liftedOff
    };

    return finalize({
      ok: true, reason: reason, trajectory: trajectory, events: [],
      summary: summary, meta: meta
    }, model);
  }

  /** Attach events + diagnostics + contract version. */
  function finalize(sim, model) {
    sim.contractVersion = CONTRACT_VERSION;
    sim.events = global.RS && global.RS.SimulationEvents
      ? global.RS.SimulationEvents.derive(sim.trajectory, model || {})
      : [];
    sim.diagnostics = global.RS && global.RS.Diagnostics
      ? global.RS.Diagnostics.run(model || {}, sim)
      : [];
    return sim;
  }

  /** Raw step output -> contract TrajectoryState. */
  function toState(d, tumbleT) {
    // Straight up until the vehicle departs controlled flight; then it pitches
    // over and spins — a wild, escalating attitude the replay can show literally.
    var o = { pitch: 90, yaw: 0, roll: 0 };
    if (d.tumbling && isFinite(tumbleT)) {
      var tt = Math.max(0, d.t - tumbleT);
      o.pitch = 90 - (tt * 130 + Math.sin(tt * 9) * 55);
      o.yaw = Math.sin(tt * 5.5) * 45 + tt * 70;
      o.roll = tt * 260;
    }
    return {
      time: round(d.t, 3),
      position: { x: 0, y: round(d.y, 3), z: 0 },
      velocity: round(d.v, 3),
      speed: round(Math.abs(d.v), 3),
      acceleration: round(d.a, 3),
      mass: round(d.mass, 4),
      orientation: { pitch: round(o.pitch, 2), yaw: round(o.yaw, 2), roll: round(o.roll, 2) },
      altitude: round(d.y, 3),
      q: round(d.q, 2),
      thrust: round(d.thrust, 3),
      buoyancy: round(d.buoyancy, 3),
      drag: round(d.drag, 3),
      propRemaining: round(d.propRemaining, 4),
      tumbling: !!d.tumbling
    };
  }

  function emptySummary() {
    return {
      apogee: 0, maxVelocity: 0, maxQ: 0, flightTime: 0,
      apogeeTime: 0, burnoutMass: 0, liftedOff: false
    };
  }

  function round(v, p) { var m = Math.pow(10, p); return Math.round(v * m) / m; }

  global.RS = global.RS || {};
  global.RS.Physics = {
    G0: G0, RE: RE, RHO0: RHO0, SCALE_H: SCALE_H,
    CONTRACT_VERSION: CONTRACT_VERSION,
    gravity: gravity,
    airDensity: airDensity,
    motorOutput: motorOutput,
    step: step,
    simulate: simulate
  };

})(typeof window !== 'undefined' ? window : this);
