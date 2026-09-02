/* =============================================================================
 * FROM FIRE TO ORBIT — Unified Architecture
 * js/core/SimulationEvents.js
 *
 * Turns a finished trajectory into a sorted list of flight events. Physics.js
 * calls derive() once; the render layer replays the list, gameplay reads it.
 *
 * PURE. No THREE, no DOM. Reads only the trajectory samples Physics produced
 * (each carries time, altitude, velocity, q, thrust, buoyancy, propRemaining).
 * ===========================================================================*/
(function (global) {
  'use strict';

  var TYPES = {
    IGNITION: 'IGNITION',
    LIFTOFF:  'LIFTOFF',
    MAX_Q:    'MAX_Q',
    APOGEE:   'APOGEE',
    BURNOUT:  'BURNOUT',
    LOSS_OF_CONTROL: 'LOSS_OF_CONTROL',
    IMPACT:   'IMPACT'
  };

  var LABEL_TH = {
    IGNITION: 'จุดระเบิด / จุดไฟ',
    LIFTOFF:  'ทะยานพ้นพื้น',
    MAX_Q:    'แรงดันอากาศสูงสุด (Max-Q)',
    APOGEE:   'จุดสูงสุด',
    BURNOUT:  'เชื้อเพลิงหมด',
    LOSS_OF_CONTROL: 'เสียการควบคุม — ตีลังกา',
    IMPACT:   'แตะพื้น'
  };

  var LIFT_EPS = 0.05;   // m — altitude that counts as "off the pad"

  /**
   * @param {Array} traj  trajectory samples from Physics
   * @param {Object} model Vehicle.toPhysicsModel() output
   * @returns {{time:number,type:string,message:string,altitude:number,velocity:number}[]}
   */
  function derive(traj, model) {
    var events = [];
    if (!traj || !traj.length) return events;

    var hasMotor = model && model.motors && model.motors.length > 0;
    var push = function (time, type, msg, alt, vel) {
      events.push({
        time: round(time, 3),
        type: type,
        message: msg || LABEL_TH[type],
        altitude: round(alt || 0, 2),
        velocity: round(vel || 0, 2)
      });
    };

    // --- IGNITION : t0, if the stack has any motor ---------------------------
    if (hasMotor) {
      var m0 = traj[0];
      push(m0.time, TYPES.IGNITION,
        model.motors.length + ' มอเตอร์เริ่มทำงาน', m0.altitude, m0.velocity);
    }

    // --- single-pass scan for peaks & thresholds ---------------------------
    var liftoffIdx = -1, apogeeIdx = 0, maxQIdx = 0, impactIdx = -1, tumbleIdx = -1;
    var peakForce = 0, burnoutIdx = -1;

    for (var i = 0; i < traj.length; i++) {
      var s = traj[i];
      var force = (s.thrust || 0) + (s.buoyancy || 0);
      if (force > peakForce) peakForce = force;

      if (liftoffIdx === -1 && s.altitude > LIFT_EPS) liftoffIdx = i;
      if (s.altitude > traj[apogeeIdx].altitude) apogeeIdx = i;
      if ((s.q || 0) > (traj[maxQIdx].q || 0)) maxQIdx = i;
      if (tumbleIdx === -1 && s.tumbling) tumbleIdx = i;
    }

    var lifted = liftoffIdx !== -1;

    // burnout: first sample where force collapses to <5% of peak after having
    // been >50% of peak (covers hard cutoff AND the buoyancy decay tail)
    if (hasMotor && peakForce > 0) {
      var armed = false;
      for (var j = 0; j < traj.length; j++) {
        var f = (traj[j].thrust || 0) + (traj[j].buoyancy || 0);
        if (f > 0.5 * peakForce) armed = true;
        if (armed && f < 0.05 * peakForce) { burnoutIdx = j; break; }
      }
    }

    // impact: first ground contact AFTER apogee, only if it ever lifted
    if (lifted) {
      for (var k = apogeeIdx + 1; k < traj.length; k++) {
        if (traj[k].altitude <= LIFT_EPS) { impactIdx = k; break; }
      }
    }

    if (lifted) {
      var lo = traj[liftoffIdx];
      push(lo.time, TYPES.LIFTOFF, LABEL_TH.LIFTOFF, lo.altitude, lo.velocity);
    }
    if (burnoutIdx !== -1) {
      var bo = traj[burnoutIdx];
      push(bo.time, TYPES.BURNOUT, LABEL_TH.BURNOUT, bo.altitude, bo.velocity);
    }
    if (lifted && (traj[maxQIdx].q || 0) > 0) {
      var mq = traj[maxQIdx];
      push(mq.time, TYPES.MAX_Q,
        'Max-Q ' + Math.round(mq.q) + ' Pa', mq.altitude, mq.velocity);
    }
    if (tumbleIdx !== -1) {
      var tb = traj[tumbleIdx];
      push(tb.time, TYPES.LOSS_OF_CONTROL,
        'CoP อยู่หน้า CoM — จรวดตีลังกาที่ ' + fmtAlt(tb.altitude) +
        (hasMotor ? ' (ลองเพิ่มครีบหาง)' : ''),
        tb.altitude, tb.velocity);
    }
    if (lifted && traj[apogeeIdx].altitude > LIFT_EPS) {
      var ap = traj[apogeeIdx];
      push(ap.time, TYPES.APOGEE,
        'จุดสูงสุด ' + fmtAlt(ap.altitude), ap.altitude, ap.velocity);
    }
    if (impactIdx !== -1) {
      var im = traj[impactIdx];
      push(im.time, TYPES.IMPACT,
        'แตะพื้นที่ ' + Math.abs(im.velocity).toFixed(1) + ' m/s', 0, im.velocity);
    }

    events.sort(function (a, b) { return a.time - b.time; });
    return events;
  }

  function round(v, p) { var m = Math.pow(10, p); return Math.round(v * m) / m; }
  function fmtAlt(m) {
    return m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';
  }

  global.RS = global.RS || {};
  global.RS.SimulationEvents = {
    TYPES: TYPES,
    LABEL_TH: LABEL_TH,
    derive: derive
  };

})(typeof window !== 'undefined' ? window : this);
