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
 * Force model — two vertical regimes + a shared crosswind axis:
 *   ROCKET/BALLISTIC : F_net = thrust(t) − m(t)·g(y) − drag(y, v)
 *   HOT-AIR BUOYANCY : rises on a whisper of excess lift, hard-capped rise rate;
 *                      it FLOATS, it does not accelerate like a motor.
 *   STATIC INERTIA   : nothing leaves the pad (y=0, v=0) until net UPWARD force
 *                      strictly beats weight. `spoolTime` ramps a motor 0→100%%,
 *                      so a Bang Fai sits smoking, building thrust, then breaks
 *                      inertia — a Firework's spoolTime is 0 and it pops at once.
 *   CROSSWIND (X)    : drag on airspeed (vx − wind); a lantern (huge A / tiny m)
 *                      is swept to wind speed almost instantly and just drifts.
 *   drag  = 0.5 · ρ(y) · (Σ Cd·A) · u·|u|
 *   ρ(y)  = ρ0 · exp(−y / H) ;  g(y) = g0 · (Re / (Re + y))²
 * ===========================================================================*/
(function (global) {
  'use strict';

  var G0 = 9.80665;        // m/s^2 at sea level
  var RE = 6371000;        // m, Earth radius
  var RHO0 = 1.225;        // kg/m^3 at sea level
  var SCALE_H = 8500;      // m, density scale height

  var CONTRACT_VERSION = '1.5.0';

  // --- gravity turn / pitch program -------------------------------------------
  var PITCH_UP = Math.PI / 2;         // straight up
  var PITCH_MIN = Math.PI / 4;        // 45° — the target downrange attitude
  var TURN_ALT = 500;                // m — begin the turn above this altitude
  var TURN_SPEED = 50;               // m/s — …and above this speed
  var TURN_RATE = 0.030;             // rad/s — how fast pitch bleeds toward 45°

  // --- dynamic aero-instability ("the tumble") ---------------------------------
  var TUMBLE_SPEED_MIN = 12;      // m/s — below this, too slow to weathercock
  var TUMBLE_DRAG_MULT = 3.5;     // broadside Cd·A blow-up once tumbling
  var TUMBLE_THRUST_FRAC = 0.30;  // thrust still fires but points every which way
  var TUMBLE_CLIMB_BLEED = 2.6;   // per-second bleed applied to UPWARD velocity only

  // --- hot-air buoyancy: a lantern floats, it never "launches" ----------------
  var BUOY_RISE_MAX = 1.5;        // m/s — the graceful ceiling on rise rate
  var BUOY_SINK_MAX = 2.4;        // m/s — gentle descent as the flame dies
  var BUOY_ACCEL_UP = 0.85;       // m/s^2 — how briskly it may gain rise speed
  var BUOY_ACCEL_DOWN = 3.2;      // m/s^2

  /**
   * @typedef {Object} TrajectoryState
   * @property {number} time                       seconds since ignition
   * @property {{x:number,y:number,z:number}} position   metres (y = altitude, up)
   * @property {number} velocity                   signed vertical velocity, m/s
   * @property {number} vx                         signed horizontal (downrange) velocity, m/s
   * @property {number} speed                      |velocity vector| = hypot(velocity, vx), m/s
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
   * @property {boolean} padLocked                 true while welded to the pad (F ≤ mg, pre-liftoff)
   * @property {number} drift                      == position.x, signed horizontal drift (m)
   *
   * @typedef {Object} FlightEvent
   * @property {number} time
   * @property {'IGNITION'|'LIFTOFF'|'PITCH_OVER'|'MAX_Q'|'APOGEE'|'BURNOUT'|'LOSS_OF_CONTROL'|'IMPACT'} type
   *   LIFTOFF and PITCH_OVER (gravity-turn start) are emitted by the integrator.
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
   *            apogeeTime:number,burnoutMass:number,liftedOff:boolean,
   *            impactX:number,maxDrift:number,mode:string}} summary
   * @property {'rocket'|'buoyancy'|'mixed'|'none'} mode
   * @property {{id:string,status:'OK'|'WARN'|'FAIL',message:string,detail:string}[]} diagnostics
   * @property {{dt:number,maxTime:number,sampleEvery:number,wind:number,safeZoneRadius:(number|null)}} meta
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

    // rocket mode: spool ramp, flat thrust, hard cutoff at burnTime (a ceiling
    // when the motor draws from a shared tank — see the pool check in step()).
    if (t > bt || bt <= 0) return { force: 0, mdot: 0 };
    var f = spool > 0 && t < spool ? motor.thrust * (t / spool) : motor.thrust;
    var flow = motor.massFlow > 0
      ? motor.massFlow
      : (motor.propellantMass > 0 ? motor.propellantMass / bt : 0);
    return { force: f, mdot: flow };
  }

  /**
   * One integration step.
   *   · ROCKET/BALLISTIC : full 2-D vector — thrust resolved along `pitchCmd`
   *     (π/2 = straight up), gravity on Y only, drag opposing the velocity
   *     vector relative to wind. Y explicit (identical to the old 1-D path when
   *     pitch = π/2); X semi-implicit so a stiff crosswind can't blow up.
   *   · BUOYANCY / TUMBLE : unchanged vertical model + the shared implicit X.
   * @param {{t,y,v,x,vx,propRemaining,tumbling,liftedOff}} state
   * @param {Object} model  Vehicle.toPhysicsModel() output
   * @param {number} dt
   * @param {number} wind   ambient horizontal wind, m/s (+x)
   * @param {number} [pitchCmd=π/2]  commanded thrust direction (radians)
   */
  function step(state, model, dt, wind, pitchCmd) {
    wind = wind || 0;
    if (typeof pitchCmd !== 'number' || !isFinite(pitchCmd)) pitchCmd = PITCH_UP;
    var g = gravity(state.y);
    var rho = airDensity(state.y);

    var thrust = 0, buoyancy = 0, mdotTotal = 0;
    for (var i = 0; i < model.motors.length; i++) {
      var mtr = model.motors[i];
      var out = motorOutput(mtr, state.t);
      // a liquid engine fed by separate tanks cuts the instant the pool is dry
      if (mtr.massFlow > 0 && state.propRemaining <= 1e-9) { out.force = 0; out.mdot = 0; }
      if (mtr.mode === 'buoyancy') buoyancy += out.force;
      else thrust += out.force;
      mdotTotal += out.mdot;
    }

    var burned = Math.min(mdotTotal * dt, state.propRemaining);
    var propRemaining = state.propRemaining - burned;
    var mass = Math.max(model.dryMass + propRemaining, 1e-6);

    // Hot-air buoyancy scales with ambient density: thinner air aloft = less
    // lift for the same temperature delta, so a lantern naturally levels off.
    buoyancy *= rho / RHO0;

    // ---- STATIC INERTIA · THE PAD LOCK --------------------------------
    // A vehicle is welded to y=0 with v=0 until its net UPWARD force
    // (thrust + buoyancy) strictly exceeds its weight m·g. Until it does,
    // the motor still burns — mass drops, exhaust pours — but the stack
    // does not move at all, and there is no horizontal drift either.
    // Once it has ever left the pad this lock never re-engages (a spent
    // stack must still be free to arc over and fall back down).
    var weightN = mass * g;
    if (!state.liftedOff && state.y <= 1e-6 && (thrust + buoyancy) <= weightN) {
      return {
        t: state.t + dt, y: 0, v: 0, x: state.x, vx: 0,
        propRemaining: propRemaining, a: 0, mass: mass,
        thrust: thrust, buoyancy: buoyancy, drag: 0,
        q: 0, g: g, rho: rho, onPad: true, padLocked: true,
        pitchCmd: pitchCmd, vectored: false,
        liftedOff: false, tumbling: false
      };
    }

    var v, y, a, drag, vx, x;
    var vectorX = false;                 // did the rocket branch already solve X?
    var buoyMode = !!model.buoyancyDominant;

    if (state.tumbling) {
      // ---- AERODYNAMICALLY OUT OF CONTROL --------------------------------
      // Broadside to the airstream: Cd·A balloons, the nozzle points every
      // which way. A hard velocity bleed under gravity + misdirected thrust —
      // deterministic, never stiff. A tumble always arcs over and comes down.
      drag = 0.5 * rho * model.dragArea * TUMBLE_DRAG_MULT * state.v * Math.abs(state.v);
      a = (thrust * TUMBLE_THRUST_FRAC) / mass - g - drag / mass;
      v = state.v + a * dt;
      if (v > 2) v *= (1 - Math.min(0.4, TUMBLE_CLIMB_BLEED * dt));
      y = state.y + v * dt;

    } else if (buoyMode) {
      // ---- HOT-AIR BUOYANCY: it floats, it never launches ----------------
      // Net lift is a whisper above weight when hot, negative as it cools.
      // Cap both the acceleration and the rise/sink rate so a lantern eases
      // upward at ~1 m/s and drifts — it is poetry, not propulsion.
      drag = 0.5 * rho * model.dragArea * state.v * Math.abs(state.v);
      var netUp = buoyancy - mass * g;
      a = (netUp - drag) / mass;
      a = clamp(a, -BUOY_ACCEL_DOWN, BUOY_ACCEL_UP);
      v = clamp(state.v + a * dt, -BUOY_SINK_MAX, BUOY_RISE_MAX);
      y = state.y + v * dt;

    } else {
      // ---- ROCKET / BALLISTIC · 2-D VECTOR ---------------------------
      //  thrust  = ( T·cos θ ,  T·sin θ )   θ = pitchCmd, π/2 = straight up
      //  gravity = ( 0 , −m·g )
      //  drag    = −½·ρ·Cd·A·|u|·u   with  u = velocity − wind   (both axes)
      var thrustX = thrust * Math.cos(pitchCmd);
      var thrustY = thrust * Math.sin(pitchCmd);
      var ux = state.vx - wind;
      var uy = state.v;
      var spd = Math.sqrt(ux * ux + uy * uy);
      var kA = 0.5 * rho * model.dragArea * spd;   // N per (m/s) on a component
      drag = kA * spd;                              // |drag|, for telemetry

      // Y — explicit (reduces EXACTLY to the old 1-D rocket path at θ = π/2)
      a = clampA((thrustY + buoyancy - mass * g - kA * uy) / mass);
      v = state.v + a * dt;
      y = state.y + v * dt;

      // X — semi-implicit in vx: vx' = vx + dt·(Tx − kA·(vx' − wind))/m
      var rhsX = state.vx + dt * (thrustX / mass + kA * wind / mass);
      vx = rhsX / (1 + dt * kA / mass);
      x = state.x + vx * dt;
      vectorX = true;
    }

    var onPad = false;
    if (y <= 0) { y = 0; if (v < 0) { v = 0; onPad = true; } }

    if (!vectorX) {
      // ---- SHARED X-AXIS · crosswind drift (buoyancy / tumble) ---------
      // dvx/dt = -k·(vx-wind)·|vx-wind|.  Solved implicitly so it is stable
      // even for a lantern whose k is enormous — it just snaps vx toward wind.
      var grounded = state.y <= 1e-3 && y <= 1e-3;
      if (grounded) {
        vx = 0; x = state.x;
      } else {
        var airX = state.vx - wind;
        var kx = 0.5 * rho * model.dragArea * (state.tumbling ? TUMBLE_DRAG_MULT : 1) / mass;
        vx = wind + airX / (1 + kx * Math.abs(airX) * dt);
        x = state.x + vx * dt;
      }
    }

    return {
      t: state.t + dt, y: y, v: v, x: x, vx: vx, propRemaining: propRemaining,
      a: clampA(a), mass: mass, thrust: thrust, buoyancy: buoyancy, drag: drag,
      q: 0.5 * rho * (v * v + vx * vx), g: g, rho: rho, onPad: onPad,
      pitchCmd: pitchCmd, vectored: vectorX,
      padLocked: false, liftedOff: !!state.liftedOff || y > 1e-6,
      tumbling: !!state.tumbling
    };
  }

  // Clamp keeps the integrator well-behaved without starving a real impulse.
  // A firework lift charge genuinely pulls ~100–200 g for a tenth of a second,
  // so the UPWARD cap is generous; the downward cap (drag / crash) stays tight.
  function clampA(a) { return a < -400 ? -400 : (a > 2500 ? 2500 : a); }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // ---------------------------------------------------------------------------
  //  simulate() — produces the locked SimulationResult
  // ---------------------------------------------------------------------------

  /**
   * @param {Object} model  Vehicle.toPhysicsModel() output
   * @param {Object} [opts]
   * @param {number} [opts.dt=0.02]
   * @param {number} [opts.maxTime=1800]
   * @param {number} [opts.sampleEvery=0.1]
   * @param {number} [opts.wind=0]            ambient horizontal breeze, m/s
   * @param {number} [opts.safeZoneRadius]    NOTAM radius (m); drift past it = LEGAL VIOLATION
   * @returns {SimulationResult}
   */
  function simulate(model, opts) {
    opts = opts || {};
    var dt = opts.dt || 0.02;
    var maxTime = opts.maxTime || 1800;
    var sampleEvery = opts.sampleEvery || 0.1;
    var wind = +opts.wind || 0;
    var safeZoneRadius = (opts.safeZoneRadius != null && isFinite(opts.safeZoneRadius))
      ? +opts.safeZoneRadius : null;
    var meta = {
      dt: dt, maxTime: maxTime, sampleEvery: sampleEvery,
      wind: wind, safeZoneRadius: safeZoneRadius
    };
    var motorMode = (model && model.stats && model.stats.motorMode) || 'none';

    if (!model || !model.valid) {
      var reason = model
        ? 'ยานยังประกอบไม่ครบ (ไม่มีแรงขับ/แรงพยุง หรือชิ้นส่วนไม่ต่อกัน)'
        : 'ไม่มีโมเดลยาน';
      return finalize({
        ok: false, reason: reason, trajectory: [], events: [],
        summary: emptySummary(), meta: meta, mode: motorMode
      }, model);
    }

    var state = {
      t: 0, y: 0, v: 0, x: 0, vx: 0,
      propRemaining: model.propellantMass, tumbling: false, liftedOff: false
    };
    var trajectory = [];
    var apogee = 0, apogeeTime = 0, maxV = 0, maxQ = 0;
    var finalX = 0, maxDrift = 0;
    var liftedOff = false, nextSample = 0;
    var liftoffTime = null, liftoffAlt = 0, liftoffVel = 0;   // exact break-of-inertia
    var prevForce = 0;                          // to catch sub-sample burn edges
    var tumbleT = Infinity;                    // time the tumble started
    // a guided vehicle follows a pitch program and never passively tumbles
    var canTumble = !!model.rocketDominant && isFinite(model.copAxisM) && !model.gravityTurn;
    var pitchCmd = PITCH_UP;                   // current commanded thrust attitude
    var turnT0 = null;                         // time the gravity turn began
    var pitchOverTime = null, pitchOverAlt = 0, pitchOverVel = 0;
    var reason = 'สิ้นสุดการบิน';

    // seed t=0 state so playback starts exactly on the pad
    trajectory.push(toState({ t: 0, y: 0, v: 0, x: 0, vx: 0, a: 0, mass: model.totalMass,
      thrust: 0, buoyancy: 0, drag: 0, q: 0, propRemaining: model.propellantMass }, tumbleT));
    nextSample += sampleEvery;

    while (state.t < maxTime) {
      // --- PITCH PROGRAM · the gravity turn ------------------------------
      //  Straight up until (alt > 500 m AND speed > 50 m/s), then bleed the
      //  commanded pitch from 90° toward 45° at TURN_RATE, converting the
      //  climb into downrange (X) velocity. This is Newton's-cannonball 101.
      if (model.gravityTurn && liftedOff && !state.tumbling) {
        if (turnT0 === null &&
            state.y > TURN_ALT && Math.abs(state.v) > TURN_SPEED) {
          turnT0 = state.t;
          pitchOverTime = state.t;
          pitchOverAlt = state.y;
          pitchOverVel = Math.sqrt(state.v * state.v + state.vx * state.vx);
        }
        if (turnT0 !== null) {
          pitchCmd = Math.max(PITCH_MIN, PITCH_UP - (state.t - turnT0) * TURN_RATE);
        }
      }

      var d = step(state, model, dt, wind, pitchCmd);

      // --- LIFTOFF : the exact integration tick the stack breaks inertia.
      //     Physics owns this event; it is not left to sample interpolation.
      var force = d.thrust + d.buoyancy;
      if (liftoffTime === null && !state.liftedOff && d.y > 1e-6) {
        state.liftedOff = true;
        liftoffTime = d.t; liftoffAlt = d.y; liftoffVel = d.v;
        trajectory.push(toState(d, tumbleT));   // pin the break-of-inertia frame
      }
      // a burn shorter than one sample interval (a firework mortar) must still
      // leave its powered phase in the trajectory — sample on any thrust edge,
      // and sample EVERY tick while the motor is lit for the first few seconds
      // so the powered phase, Max-Q and burnout all land on real samples.
      var forceEdge = (prevForce <= 1e-6) !== (force <= 1e-6);
      var densePhase = force > 1e-6 && d.t < 3.0;
      prevForce = force;

      if (d.y > 0.02) liftedOff = true;
      if (d.y > apogee) { apogee = d.y; apogeeTime = d.t; }
      var spdNow = Math.sqrt(d.v * d.v + d.vx * d.vx);   // true speed, both axes
      if (spdNow > maxV) maxV = spdNow;
      if (d.q > maxQ) maxQ = d.q;
      finalX = d.x;
      if (Math.abs(d.x) > maxDrift) maxDrift = Math.abs(d.x);

      // --- dynamic aero-stability: CoM slides forward as propellant burns.
      //     Once moving fast, if the (interpolated) CoM passes the CoP, the
      //     stack weathercocks the wrong way and departs controlled flight.
      var wasTumbling = state.tumbling;
      if (canTumble && !state.tumbling && liftedOff &&
          spdNow > TUMBLE_SPEED_MIN) {
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

      if (d.t >= nextSample || (state.tumbling && !wasTumbling) || forceEdge || densePhase) {
        trajectory.push(toState(d, tumbleT));
        if (d.t >= nextSample) nextSample += sampleEvery;
      }

      state = {
        t: d.t, y: d.y, v: d.v, x: d.x, vx: d.vx,
        propRemaining: d.propRemaining, tumbling: state.tumbling,
        liftedOff: state.liftedOff || d.liftedOff
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
      liftedOff: liftedOff,
      impactX: round(finalX, 2),
      maxDrift: round(maxDrift, 2),
      mode: motorMode
    };

    var physicsEvents = [];
    if (liftoffTime !== null) {
      physicsEvents.push({
        time: round(liftoffTime, 3), type: 'LIFTOFF', message: 'ทะยานพ้นพื้น',
        altitude: round(liftoffAlt, 2), velocity: round(liftoffVel, 2)
      });
    }
    if (pitchOverTime !== null) {
      physicsEvents.push({
        time: round(pitchOverTime, 3), type: 'PITCH_OVER',
        message: 'เริ่มเลี้ยวโค้ง (Gravity Turn) — เอียงหัวทำความเร็วแนวราบ',
        altitude: round(pitchOverAlt, 2), velocity: round(pitchOverVel, 2)
      });
    }

    return finalize({
      ok: true, reason: reason, trajectory: trajectory, events: [],
      summary: summary, meta: meta, mode: motorMode, _physicsEvents: physicsEvents
    }, model);
  }

  /** Attach events + diagnostics + contract version. */
  function finalize(sim, model) {
    sim.contractVersion = CONTRACT_VERSION;
    var derived = global.RS && global.RS.SimulationEvents
      ? global.RS.SimulationEvents.derive(sim.trajectory, model || {})
      : [];
    // Events the integrator emitted itself (LIFTOFF) are authoritative — drop
    // any derived event of the same type and splice the precise one back in.
    var pe = sim._physicsEvents || [];
    var owned = {};
    pe.forEach(function (e) { owned[e.type] = true; });
    sim.events = derived.filter(function (e) { return !owned[e.type]; })
      .concat(pe)
      .sort(function (a, b) { return a.time - b.time; });
    delete sim._physicsEvents;
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
    var vx = d.vx || 0;
    if (d.tumbling && isFinite(tumbleT)) {
      var tt = Math.max(0, d.t - tumbleT);
      o.pitch = 90 - (tt * 130 + Math.sin(tt * 9) * 55);
      o.yaw = Math.sin(tt * 5.5) * 45 + tt * 70;
      o.roll = tt * 260;
    } else if (d.vectored && (Math.abs(vx) > 0.5 || (isFinite(d.pitchCmd) && d.pitchCmd < Math.PI / 2 - 1e-3))) {
      // point along the thrust vector while burning, else along the velocity
      // vector — atan2(vertical, horizontal) is already the "90° = up" convention
      var ang = (d.thrust > 1 && isFinite(d.pitchCmd))
        ? d.pitchCmd
        : Math.atan2(d.v, vx);
      o.pitch = ang * 180 / Math.PI;
    }
    var dx = round(d.x || 0, 3);
    var spd = Math.sqrt(d.v * d.v + vx * vx);
    return {
      time: round(d.t, 3),
      position: { x: dx, y: round(d.y, 3), z: 0 },
      drift: dx,
      velocity: round(d.v, 3),
      vx: round(vx, 3),
      speed: round(spd, 3),
      acceleration: round(d.a, 3),
      mass: round(d.mass, 4),
      orientation: { pitch: round(o.pitch, 2), yaw: round(o.yaw, 2), roll: round(o.roll, 2) },
      altitude: round(d.y, 3),
      q: round(d.q, 2),
      thrust: round(d.thrust, 3),
      buoyancy: round(d.buoyancy, 3),
      drag: round(d.drag, 3),
      propRemaining: round(d.propRemaining, 4),
      tumbling: !!d.tumbling,
      padLocked: !!d.padLocked
    };
  }

  function emptySummary() {
    return {
      apogee: 0, maxVelocity: 0, maxQ: 0, flightTime: 0,
      apogeeTime: 0, burnoutMass: 0, liftedOff: false,
      impactX: 0, maxDrift: 0, mode: 'none'
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
