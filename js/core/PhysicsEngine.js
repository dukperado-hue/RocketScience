/* =============================================================================
 * FROM FIRE TO ORBIT — Unified Architecture
 * js/core/PhysicsEngine.js
 *
 * A PURE 1-D flight integrator. Input: the plain model from
 * Vehicle.toPhysicsModel(). Output: altitude y (m) and velocity v (m/s) over
 * time, plus a trajectory log.
 *
 * NO Three.js. NO DOM. NO game state. This file could run in Node.
 * The 3D layer (Phase 2+) will drive its camera from these numbers; it will
 * never compute them.
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

  function gravity(y) {
    var r = RE / (RE + Math.max(y, 0));
    return G0 * r * r;
  }
  function airDensity(y) {
    return RHO0 * Math.exp(-Math.max(y, 0) / SCALE_H);
  }

  /**
   * Instantaneous propulsive + buoyant force and mass-flow for one motor.
   * @returns {{force:number, mdot:number}}
   */
  function motorOutput(motor, t) {
    var bt = motor.burnTime || 0;
    var spool = motor.spoolTime || 0;

    if (motor.mode === 'buoyancy') {
      // Ramp up over spool, hold while fuel lasts, decay over one spool-time after.
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
   * @param {Object} state  {t, y, v, propRemaining}
   * @param {Object} model   Vehicle.toPhysicsModel() output
   * @param {number} dt      seconds
   * @returns {Object} next state, with diagnostics attached
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

    // burn propellant (never below zero)
    var burned = Math.min(mdotTotal * dt, state.propRemaining);
    var propRemaining = state.propRemaining - burned;
    var mass = model.dryMass + propRemaining;
    if (mdotTotal > 0 && propRemaining <= 0) {
      // out of fuel: kill any thrust that assumed flow this step
    }
    mass = Math.max(mass, 1e-6);

    // Hot-air buoyancy scales with ambient density: thinner air aloft = less
    // lift for the same temperature delta, so a lantern naturally levels off.
    buoyancy *= rho / RHO0;

    var drag = 0.5 * rho * model.dragArea * state.v * Math.abs(state.v);

    var fNet = thrust + buoyancy - mass * g - drag;
    var a = fNet / mass;

    var v = state.v + a * dt;
    var y = state.y + v * dt;

    var onPad = false;
    if (y <= 0) {
      y = 0;
      if (v < 0) { v = 0; onPad = true; }
    }

    var q = 0.5 * rho * v * v;   // dynamic pressure, Pa

    return {
      t: state.t + dt,
      y: y,
      v: v,
      propRemaining: propRemaining,
      // diagnostics (not part of the integrator state, handy for HUD/logging)
      a: a,
      mass: mass,
      thrust: thrust,
      buoyancy: buoyancy,
      drag: drag,
      q: q,
      g: g,
      rho: rho,
      onPad: onPad
    };
  }

  /**
   * Run a full flight.
   * @param {Object} model  Vehicle.toPhysicsModel() output
   * @param {Object} [opts]
   * @param {number} [opts.dt=0.02]        integration step, s
   * @param {number} [opts.maxTime=1200]   safety cap, s
   * @param {number} [opts.sampleEvery=0.1] trajectory log interval, s
   * @returns {{
   *   ok:boolean, reason:string,
   *   samples:{t:number,y:number,v:number,a:number,mass:number,q:number,thrust:number,buoyancy:number,drag:number}[],
   *   apogee:number, apogeeTime:number, maxV:number, maxQ:number,
   *   flightTime:number, burnoutMass:number, liftedOff:boolean
   * }}
   */
  function simulate(model, opts) {
    opts = opts || {};
    var dt = opts.dt || 0.02;
    var maxTime = opts.maxTime || 1800;
    var sampleEvery = opts.sampleEvery || 0.1;

    if (!model || !model.valid) {
      return {
        ok: false,
        reason: model ? 'ยานยังประกอบไม่ครบ (ไม่มีแรงขับ/แรงพยุง หรือชิ้นส่วนไม่ต่อกัน)'
                      : 'ไม่มีโมเดลยาน',
        samples: [], apogee: 0, apogeeTime: 0, maxV: 0, maxQ: 0,
        flightTime: 0, burnoutMass: 0, liftedOff: false
      };
    }

    var state = { t: 0, y: 0, v: 0, propRemaining: model.propellantMass };
    var samples = [];
    var apogee = 0, apogeeTime = 0, maxV = 0, maxQ = 0;
    var liftedOff = false, nextSample = 0;
    var reason = 'สิ้นสุดการบิน';

    while (state.t < maxTime) {
      var d = step(state, model, dt);

      if (d.y > 0.02) liftedOff = true;
      if (d.y > apogee) { apogee = d.y; apogeeTime = d.t; }
      if (Math.abs(d.v) > maxV) maxV = Math.abs(d.v);
      if (d.q > maxQ) maxQ = d.q;

      if (d.t >= nextSample) {
        samples.push({
          t: round(d.t, 3), y: round(d.y, 3), v: round(d.v, 3), a: round(d.a, 3),
          mass: round(d.mass, 4), q: round(d.q, 2),
          thrust: round(d.thrust, 3), buoyancy: round(d.buoyancy, 3), drag: round(d.drag, 3)
        });
        nextSample += sampleEvery;
      }

      state = { t: d.t, y: d.y, v: d.v, propRemaining: d.propRemaining };

      // touchdown after a real flight
      if (liftedOff && d.onPad) { reason = 'ยานแตะพื้นแล้ว'; break; }
      // never left the pad and no force left to try
      if (!liftedOff && state.t > 5 && d.thrust + d.buoyancy < model.dryMass * gravity(0) * 0.999) {
        if (state.t > 30) { reason = 'แรงยกไม่พอ — ยานไม่ลอยขึ้นจากพื้น'; break; }
      }
    }
    if (state.t >= maxTime) reason = 'ถึงเวลาจำกัดการจำลอง';

    return {
      ok: true,
      reason: reason,
      samples: samples,
      apogee: round(apogee, 2),
      apogeeTime: round(apogeeTime, 2),
      maxV: round(maxV, 2),
      maxQ: round(maxQ, 1),
      flightTime: round(state.t, 2),
      burnoutMass: round(model.dryMass + state.propRemaining, 4),
      liftedOff: liftedOff
    };
  }

  function round(v, p) {
    var m = Math.pow(10, p);
    return Math.round(v * m) / m;
  }

  var PhysicsEngine = {
    G0: G0, RE: RE, RHO0: RHO0, SCALE_H: SCALE_H,
    gravity: gravity,
    airDensity: airDensity,
    motorOutput: motorOutput,
    step: step,
    simulate: simulate
  };

  global.RS = global.RS || {};
  global.RS.PhysicsEngine = PhysicsEngine;

})(typeof window !== 'undefined' ? window : this);
