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

  var G0 = 9.80665;        // m/s^2 at the surface
  // A SCALED planet — a 600 km radius world, not the real 6371 km. This drops
  // surface orbital velocity from ~7.9 km/s to ~2.4 km/s, which a two-stage
  // game rocket can actually reach. Gravity is RADIAL: it always points at the
  // planet centre, fixed at (0, -RE) in the flight frame.
  var RE = 600000;         // m, planet radius
  var MU = G0 * RE * RE;   // m^3/s^2, standard gravitational parameter (g = MU/r^2)
  var RHO0 = 1.225;        // kg/m^3 at the surface
  var SCALE_H = 6000;      // m, density scale height (thin — this is a small world)
  var ATMOS_TOP = 70000;   // m — above this, drag is numerically dead / "space"

  //  1.7.0 — adds simulateMany() : a multi-vehicle BUNDLE for a festival of
  //  rockets flying at once (sequential "launch next" + groundwork for true
  //  multi-staging). The single-vehicle SimulationResult shape is UNCHANGED —
  //  simulateMany() just composes N locked results and tags their events.
  //  1.8.0 — additive sample fields: `brokenUp`, `crashed`, `spinRate`,
  //  `spinStiff`; new integrator event `APOGEE_BREAKUP`. Engine force is forced
  //  to 0 once a flown vehicle is back on the ground. Crosswind side-force +
  //  canted-fin gyroscopic spin. All existing fields unchanged.
  var CONTRACT_VERSION = '1.8.0';

  // --- gravity turn / pitch program -----------------------------------------
  //  Straight up until (alt > 500 m AND speed > 50 m/s). A short pitch KICK
  //  eases the nose off vertical, then the commanded pitch bleeds down on a
  //  schedule — clamped so it never rotates PAST the velocity vector (that
  //  would be flying backwards). Thrust points where commanded, gravity does
  //  the rest of the bending. Enough Δv → the fall never catches the ground.
  var PITCH_UP = Math.PI / 2;          // straight up (radial, at the pad)
  var TURN_ALT = 500;                 // m — altitude the turn begins
  var TURN_SPEED = 50;                // m/s — …and speed
  var KICK_DEG = 14 * Math.PI / 180;  // rad — how far off vertical the initiating kick goes
  var KICK_BAND = 4000;             // m — altitude band over which the kick is applied
  var MAX_AOA = 15 * Math.PI / 180;   // rad — cap how far the nose leads the velocity
  var TURN_SPAN = 52000;             // m — altitude rise over which pitch goes 90° → 0°
  var TURN_EXP = 0.62;               // schedule shape (gentle early, steeper late)
  var TARGET_APO = 100000;          // m — ascent aims the orbit's high point here, then coasts
  var CUTOFF_ALT = 25000;            // m — below this in coast = the burn failed, abort
  //  circularisation hauls periapsis up to just above ATMOS_TOP (70 km) so the
  //  orbit is genuinely drag-free and does not decay
  var ORBIT_PERI_TARGET = 82000;    // m

  // --- dynamic aero-instability ("the tumble") ---------------------------------
  var TUMBLE_SPEED_MIN = 12;      // m/s — below this, too slow to weathercock
  var TUMBLE_DRAG_MULT = 3.5;     // broadside Cd·A blow-up once tumbling
  var TUMBLE_THRUST_FRAC = 0.30;  // thrust still fires but points every which way
  var TUMBLE_CLIMB_BLEED = 2.6;   // per-second bleed applied to UPWARD velocity only

  // --- unguided pitch dynamics — a 1-DOF weathercock oscillator ---------------
  //  An unguided rocket's nose is a pendulum in the airstream: the static
  //  margin (CoP behind CoM) is the spring, the tail sweeping air is the
  //  damper, and the whole thing is divided by the moment of inertia. A long
  //  Bang Fai tail stick makes I enormous → the oscillation is slow and shallow
  //  and a gust barely moves it. A finless / tail-less stack has a NEGATIVE
  //  margin → the "spring" pushes the wrong way → alpha diverges → it departs.
  var WEATHERCOCK_DAMP = 2.4;     // pitch-damping coefficient (× q·A·arm²/(v·I))
  var WEATHERCOCK_STIFF = 1.7;    // aero-stiffness coefficient (× q·A·margin/I)
  var GUST_TORQUE = 0.055;        // wind-gust disturbance torque scale (× q·A·wind/I)
  var DEPART_ALPHA = 1.35;        // rad (~77°) — |angle of attack| past this = tumbling
  var RAIL_LENGTH_M = 4.2;        // m — the guide-rail / scaffold holds the rocket
                                 //     rigid on the launch vector for this distance

  // --- crosswind + gyroscopic spin (Phase 12) --------------------------------
  //  CROSSWIND: a steady lateral aero force ∝ ½·ρ·(side area)·wind². A tall
  //  bamboo tail stick has a huge side profile → it gets shoved downwind hard.
  //  SPIN: canted fins deflect the airstream tangentially, spinning the rocket
  //  up over the flight. Above SPIN_REF the gyroscopic rigidity is near-total —
  //  the nose holds its heading and the rocket crabs straight through the wind.
  var SIDE_WIND_K = 0.65;        // steady lateral-force scale
  var ROLL_TORQUE_K = 1.4;      // canted-fin roll torque ∝ q·finArea·rollInduce / I_roll
  var ROLL_DAMP = 0.4;          // aerodynamic roll damping (1/s)
  var ROLL_RATE_MAX = 48;       // rad/s (~460 RPM) — fin-canted terminal spin
  var SPIN_REF = 20;            // rad/s (~190 RPM) — full gyroscopic rigidity above this
  var BREAKUP_DRAG_MULT = 6.5;  // Cd·A blow-up when a traditional Bang Fai breaks up at apogee

  // --- hot-air buoyancy: a lantern floats, it never "launches" ----------------
  var BUOY_RISE_MAX = 1.5;        // m/s — the graceful ceiling on rise rate
  var BUOY_SINK_MAX = 2.0;        // m/s — gentle descent as the flame dies
  var BUOY_ACCEL_UP = 0.85;       // m/s^2 — how briskly it may gain rise speed
  var BUOY_ACCEL_DOWN = 2.4;      // m/s^2

  // --- MIDAIR_BURN: a lantern carried hard sideways tilts until the flame
  //  licks the paper and the whole envelope goes up. Heat (lift) is lost at
  //  once, the envelope burns away and COLLAPSES (drag area craters), so the
  //  charred remains drop noticeably faster than a graceful cool-down — but
  //  still fluttering + spinning, not a dead stone.
  var BURN_DRIFT_AIRSPEED = 3.6;  // m/s — |vx| above this while lit = ignition
  var BURN_MIN_ALT = 22;         // m — let it have a real flight first
  var BURN_DRAG_MULT = 0.2;       // collapsed / burnt-away envelope = little area
  var BURN_FALL_MAX = 5.0;        // m/s — descent cap for the burning wreckage

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
   * @property {'IGNITION'|'LIFTOFF'|'PITCH_OVER'|'SEPARATE_STAGE'|'MAX_Q'|'APOGEE'|'BURNOUT'|'ORBIT'|'LOSS_OF_CONTROL'|'IMPACT'} type
   *   LIFTOFF / PITCH_OVER / SEPARATE_STAGE / ORBIT are emitted by the integrator.
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
   *            impactX:number,maxDrift:number,downrange:number,stagesFlown:number,
   *            orbit:{achieved:boolean,apoapsis:number,periapsis:number,
   *                   eccentricity:number,period:number},
   *            mode:string}} summary
   * @property {'rocket'|'buoyancy'|'mixed'|'none'} mode
   * @property {{id:string,status:'OK'|'WARN'|'FAIL',message:string,detail:string}[]} diagnostics
   * @property {{dt:number,maxTime:number,sampleEvery:number,wind:number,safeZoneRadius:(number|null)}} meta
   */

  // ---------------------------------------------------------------------------
  //  Environment — RADIAL gravity about a planet centred at (0, -RE)
  // ---------------------------------------------------------------------------

  /** True altitude = distance from the planet centre minus its radius. */
  function altitudeOf(x, y) {
    return Math.sqrt(x * x + (y + RE) * (y + RE)) - RE;
  }

  /** Scalar gravity magnitude at a given TRUE altitude (g = MU / r^2). */
  function gravity(alt) {
    var r = RE + Math.max(alt, 0);
    return MU / (r * r);
  }

  /**
   * Full gravity VECTOR at flight-frame position (x, y): magnitude MU/r^2,
   * pointing from the vehicle straight at the planet centre (0, -RE).
   * @returns {{gx:number, gy:number, mag:number, r:number}}
   */
  function gravityVec(x, y) {
    var rx = x, ry = y + RE;
    var r = Math.sqrt(rx * rx + ry * ry) || 1e-9;
    var mag = MU / (r * r);
    return { gx: -mag * rx / r, gy: -mag * ry / r, mag: mag, r: r };
  }

  function airDensity(alt) {
    return alt >= ATMOS_TOP ? 0 : RHO0 * Math.exp(-Math.max(alt, 0) / SCALE_H);
  }

  /**
   * Keplerian orbital elements for a state relative to the planet centre.
   * @returns {{energy,a,e,apoapsis,periapsis,bound,period}}
   */
  function orbitElements(x, y, vx, vy) {
    var rx = x, ry = y + RE;
    var r = Math.sqrt(rx * rx + ry * ry);
    var v2 = vx * vx + vy * vy;
    var energy = v2 / 2 - MU / r;
    var h = rx * vy - ry * vx;                    // specific angular momentum (z)
    var a = Math.abs(energy) > 1e-12 ? -MU / (2 * energy) : Infinity;
    var e = Math.sqrt(Math.max(0, 1 + 2 * energy * h * h / (MU * MU)));
    var bound = energy < 0 && isFinite(a);
    return {
      energy: energy, a: a, e: e, bound: bound,
      apoapsis: bound ? a * (1 + e) - RE : Infinity,
      periapsis: isFinite(a) ? a * (1 - e) - RE : -Infinity,
      period: bound ? 2 * Math.PI * Math.sqrt(a * a * a / MU) : Infinity
    };
  }

  /**
   * Instantaneous propulsive/buoyant force + mass-flow for one motor.
   * @returns {{force:number, mdot:number}}
   */
  function motorOutput(motor, t) {
    var bt = motor.burnTime || 0;
    var spool = motor.spoolTime || 0;

    if (motor.mode === 'buoyancy') {
      // warm-up ramp → steady hot → gentle EXPONENTIAL cool-down. The wax is
      // spent at burnTime but the envelope's trapped heat (and so its lift)
      // bleeds away on a `coolingTime` 1/e timescale — the lantern eases down
      // over ~30–50 s instead of dropping the instant the flame dies.
      var lift;
      if (t < spool) {
        lift = motor.thrust * (t / Math.max(spool, 1e-6));
      } else if (t <= bt) {
        lift = motor.thrust;
      } else {
        var coolTau = motor.coolingTime > 0 ? motor.coolingTime : 12;
        lift = motor.thrust * Math.exp(-(t - bt) / coolTau);
        if (lift < motor.thrust * 0.02) lift = 0;   // heat is gone
      }
      var mdot = (t <= bt && bt > 0 && motor.propellantMass > 0)
        ? motor.propellantMass / bt : 0;
      return { force: Math.max(lift, 0), mdot: mdot };
    }

    // rocket mode: spool ramp → flat peak → optional regressive TAPER → hard
    // cutoff at burnTime (a ceiling when the motor draws from a shared tank —
    // see the pool check in step()). A hand-rammed black-powder หมื่อ tails off
    // for its last `taperTime` seconds as the bore widens; a liquid engine
    // (taperTime 0) just holds flat until cutoff.
    if (t > bt || bt <= 0) return { force: 0, mdot: 0 };
    var f;
    var taper = motor.taperTime || 0;
    if (spool > 0 && t < spool) {
      f = motor.thrust * (t / spool);
    } else if (taper > 0 && t > bt - taper) {
      f = motor.thrust * Math.max(0, (bt - t) / taper);
    } else {
      f = motor.thrust;
    }
    var flow = motor.massFlow > 0
      ? motor.massFlow
      : (motor.propellantMass > 0 ? motor.propellantMass / bt : 0);
    return { force: f, mdot: flow };
  }

  /**
   * One integration step.
   *   · ROCKET/BALLISTIC : full 2-D vector — thrust resolved along `pitchCmd`
   *     (π/2 = radially up at the pad), gravity a RADIAL vector toward the
   *     planet centre, drag opposing the velocity vector relative to wind.
   *   · BUOYANCY / TUMBLE : near-surface vertical model + the shared implicit X.
   * @param {{t,y,v,x,vx,propRemaining,tumbling,liftedOff}} state
   * @param {Object} model  effective-stage model (see effectiveStage())
   * @param {number} dt
   * @param {number} wind   ambient horizontal wind, m/s (+x)
   * @param {number} [pitchCmd=π/2]  commanded thrust direction (radians)
   * @param {number} [motorT]  time since the CURRENT stage ignited (default state.t)
   * @param {boolean} [burnEnable=true]  false = engine commanded OFF (coast phase)
   */
  function step(state, model, dt, wind, pitchCmd, motorT, burnEnable) {
    wind = wind || 0;
    if (typeof pitchCmd !== 'number' || !isFinite(pitchCmd)) pitchCmd = PITCH_UP;
    if (typeof motorT !== 'number') motorT = state.t;
    if (burnEnable === undefined) burnEnable = true;

    var alt = altitudeOf(state.x, state.y);
    var gv = gravityVec(state.x, state.y);
    var g = gv.mag;
    var rho = airDensity(alt);

    var thrust = 0, buoyancy = 0, mdotTotal = 0;
    for (var i = 0; i < model.motors.length; i++) {
      var mtr = model.motors[i];
      var out = burnEnable ? motorOutput(mtr, motorT) : { force: 0, mdot: 0 };
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
    if (!state.liftedOff && alt <= 1e-6 && (thrust + buoyancy) <= weightN) {
      return {
        t: state.t + dt, y: state.y, v: 0, x: state.x, vx: 0, alt: 0,
        propRemaining: propRemaining, a: 0, mass: mass,
        thrust: thrust, buoyancy: buoyancy, drag: 0, gx: gv.gx, gy: gv.gy,
        q: 0, g: g, rho: rho, onPad: true, padLocked: true,
        pitchCmd: pitchCmd, vectored: false, buoyMode: !!model.buoyancyDominant,
        liftedOff: false, tumbling: false, burning: false
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
      // A structural break-up at apogee blows the drag area up even further.
      var tdm = state.brokenUp ? BREAKUP_DRAG_MULT : TUMBLE_DRAG_MULT;
      drag = 0.5 * rho * model.dragArea * tdm * state.v * Math.abs(state.v);
      a = (thrust * TUMBLE_THRUST_FRAC) / mass - g - drag / mass;
      v = state.v + a * dt;
      if (v > 2) v *= (1 - Math.min(0.4, TUMBLE_CLIMB_BLEED * dt));
      y = state.y + v * dt;

    } else if (buoyMode) {
      // ---- HOT-AIR BUOYANCY: it floats, it never launches ----------------
      // Net lift is a whisper above weight when hot, negative as it cools.
      // Cap both the acceleration and the rise/sink rate so a lantern eases
      // upward at ~1 m/s and drifts — it is poetry, not propulsion.
      // If the envelope caught fire (state.burning) the heat is gone, the
      // charred paper flaps broadside (drag ×BURN_DRAG_MULT) and it drops
      // faster — but capped, so it still flutters down rather than plummets.
      var dragMult = state.burning ? BURN_DRAG_MULT : 1;
      if (state.burning) buoyancy = 0;
      drag = 0.5 * rho * model.dragArea * dragMult * state.v * Math.abs(state.v);
      var netUp = buoyancy - mass * g;
      a = (netUp - drag) / mass;
      var accelDown = state.burning ? BUOY_ACCEL_DOWN * 2.2 : BUOY_ACCEL_DOWN;
      var sinkMax = state.burning ? BURN_FALL_MAX : BUOY_SINK_MAX;
      a = clamp(a, -accelDown, BUOY_ACCEL_UP);
      v = clamp(state.v + a * dt, -sinkMax, BUOY_RISE_MAX);
      y = state.y + v * dt;

    } else {
      // ---- ROCKET / BALLISTIC · 2-D VECTOR + RADIAL GRAVITY -----------
      //  thrust  = ( T·cos θ , T·sin θ )   θ = pitchCmd (π/2 = radially up)
      //  gravity = ( gx , gy )             always toward the planet centre
      //  drag    = −½·ρ·Cd·A·|u|·u         u = velocity − wind, both axes
      var thrustX = thrust * Math.cos(pitchCmd);
      var thrustY = thrust * Math.sin(pitchCmd);
      var ux = state.vx - wind;
      var uy = state.v;
      var spd = Math.sqrt(ux * ux + uy * uy);
      var kA = 0.5 * rho * model.dragArea * spd;   // N per (m/s) on a component
      drag = kA * spd;                              // |drag|, for telemetry

      // Y — explicit (reduces to the old 1-D path at θ = π/2, x ≈ 0)
      a = clampA((thrustY + buoyancy - kA * uy) / mass + gv.gy);
      v = state.v + a * dt;
      y = state.y + v * dt;

      // X — semi-implicit drag term; explicit thrust + radial gravity + a
      // STEADY crosswind push ∝ ½·ρ·(side area)·wind² (downwind). refArea is
      // the side profile: a bamboo tail stick's is enormous, an ogive+fins tiny.
      var windForce = wind
        ? SIDE_WIND_K * 0.5 * rho * (model.refArea || 0.01) * wind * Math.abs(wind)
        : 0;
      var rhsX = state.vx + dt * (thrustX / mass + gv.gx + (kA * wind + windForce) / mass);
      vx = rhsX / (1 + dt * kA / mass);
      x = state.x + vx * dt;
      vectorX = true;
    }

    if (!vectorX) {
      // ---- SHARED X-AXIS · crosswind drift (buoyancy / tumble) ---------
      // dvx/dt = -k·(vx-wind)·|vx-wind|.  Solved implicitly so it is stable
      // even for a lantern whose k is enormous — it just snaps vx toward wind.
      var grounded = altitudeOf(state.x, state.y) <= 1e-3 && y <= 1e-3;
      if (grounded) {
        vx = 0; x = state.x;
      } else {
        var airX = state.vx - wind;
        var kx = 0.5 * rho * model.dragArea * (state.tumbling ? TUMBLE_DRAG_MULT : 1) / mass;
        vx = wind + airX / (1 + kx * Math.abs(airX) * dt);
        x = state.x + vx * dt;
      }
    }

    // ---- radial ground contact (all of x, y, vx, v now set) -----------
    var onPad = false;
    var newAlt = altitudeOf(x, y);
    if (newAlt <= 0) {
      var rx = x, ry = y + RE, rr = Math.sqrt(rx * rx + ry * ry) || 1e-9;
      var f = RE / rr;
      x = rx * f; y = ry * f - RE;                 // snap onto the surface
      var radialV = (vx * rx + v * ry) / rr;       // outward radial speed
      if (radialV < 0) { vx -= radialV * rx / rr; v -= radialV * ry / rr; onPad = true; }
      newAlt = 0;
    }

    // ---- ENGINE CUTOFF ON IMPACT -------------------------------------
    //  Once the vehicle has flown and come back down to the ground, the motor
    //  is done — no fire keeps burning in the dirt. Force thrust/buoyancy to 0
    //  so the render layer (flame + smoke) strictly stops.
    var crashed = !!state.liftedOff && newAlt <= 1e-6;
    if (crashed) { thrust = 0; buoyancy = 0; }

    return {
      t: state.t + dt, y: y, v: v, x: x, vx: vx, alt: newAlt,
      propRemaining: propRemaining,
      a: clampA(a), mass: mass, thrust: thrust, buoyancy: buoyancy, drag: drag,
      gx: gv.gx, gy: gv.gy,
      q: 0.5 * rho * (v * v + vx * vx), g: g, rho: rho, onPad: onPad,
      pitchCmd: pitchCmd, vectored: vectorX, buoyMode: buoyMode,
      padLocked: false, liftedOff: !!state.liftedOff || newAlt > 1e-6,
      tumbling: !!state.tumbling, burning: !!state.burning,
      brokenUp: !!state.brokenUp, crashed: crashed
    };
  }

  // Clamp keeps the integrator well-behaved without starving a real impulse.
  // A firework lift charge genuinely pulls ~100–200 g for a tenth of a second,
  // so the UPWARD cap is generous; the downward cap (drag / crash) stays tight.
  function clampA(a) { return a < -400 ? -400 : (a > 2500 ? 2500 : a); }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  // ---------------------------------------------------------------------------
  //  Staging — the active vehicle is the CURRENT stage plus everything above it
  // ---------------------------------------------------------------------------

  /** Fold stages `s..N` into one flat model for step(). Upper-stage fuel is
   *  carried as dead structural mass until that stage becomes active. */
  function effectiveStage(model, stages, s) {
    var dry = 0, deadProp = 0, dragArea = 0, refArea = 0, structLimit = Infinity;
    for (var i = s; i < stages.length; i++) {
      dry += stages[i].dryMass || 0;
      dragArea += stages[i].dragArea || 0;
      refArea += stages[i].refArea || 0;
      if (isFinite(stages[i].structuralLimitPa)) {
        structLimit = Math.min(structLimit, stages[i].structuralLimitPa);
      }
      if (i > s) deadProp += stages[i].propellantMass || 0;
    }
    return {
      dryMass: dry + deadProp,
      propellantMass: stages[s].propellantMass || 0,
      dragArea: dragArea, refArea: refArea,
      structuralLimitPa: structLimit,
      motors: stages[s].motors || [],
      buoyancyDominant: model.buoyancyDominant,
      gravityTurn: model.gravityTurn,
      comWetAxisM: model.comWetAxisM, comDryAxisM: model.comDryAxisM,
      copAxisM: model.copAxisM
    };
  }

  /** Every model carries `stages`; synthesise a single stage for an old model. */
  function stagesOf(model) {
    if (model.stages && model.stages.length) return model.stages;
    return [{
      dryMass: model.dryMass, propellantMass: model.propellantMass,
      motors: model.motors, dragArea: model.dragArea, refArea: model.refArea,
      structuralLimitPa: model.structuralLimitPa
    }];
  }

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
      wind: wind, safeZoneRadius: safeZoneRadius,
      // an angled traditional launch rail (deg); 0 = a vertical pad
      launchAngleDeg: (model && isFinite(model.launchAngleDeg) && model.launchAngleDeg > 0)
        ? model.launchAngleDeg : 0,
      // a hand-rammed หมื่อ burns dirty — the render layer gives it the big plume
      dirtyExhaust: !!(model && model.motors && model.motors.some(function (m) {
        return m.id === 'propulsion_mue';
      }))
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

    var stages = stagesOf(model);
    var stageIdx = 0, stageT0 = 0;
    var eff = effectiveStage(model, stages, 0);

    var state = {
      t: 0, y: 0, v: 0, x: 0, vx: 0,
      propRemaining: eff.propellantMass, tumbling: false, burning: false,
      liftedOff: false
    };
    var trajectory = [];
    var apogee = 0, apogeeTime = 0, maxV = 0, maxQ = 0;
    var finalX = 0, maxDrift = 0;
    var liftedOff = false, nextSample = 0;
    var liftoffTime = null, liftoffAlt = 0, liftoffVel = 0;   // exact break-of-inertia
    var prevForce = 0;                          // to catch sub-sample burn edges
    var everFired = false, burnoutT = null, burnoutAlt = 0, burnoutVel = 0;
    var tumbleT = Infinity;                    // time the tumble started
    var burnT = Infinity;                      // time a lantern's envelope ignited
    var midairBurn = null;                     // {time,alt,vel} for the event
    // a guided vehicle follows a pitch program and never passively tumbles
    var canTumble = !!model.rocketDominant && isFinite(model.copAxisM) && !model.gravityTurn;
    var pitchCmd = PITCH_UP;                   // current commanded thrust attitude

    // --- UNGUIDED PITCH DYNAMICS (Bang Fai) --------------------------------
    //  An unguided rocket flies a passive weathercock — a 1-DOF pitch
    //  oscillator driven by the static margin, damped by the tail, ÷ I. It
    //  slides up an angled rail first (traditional บั้งไฟ scaffold).
    var launchAngle = (isFinite(model.launchAngleDeg) && model.launchAngleDeg > 0)
      ? clamp(model.launchAngleDeg * Math.PI / 180, Math.PI / 6, Math.PI / 2)
      : PITCH_UP;
    var weathercock = !model.gravityTurn && !!model.rocketDominant && isFinite(model.copAxisM);
    var Ipitch = (model.momentOfInertia > 0)
      ? model.momentOfInertia : Math.max(0.05, (model.totalMass || 1) * 0.25);
    var pitchDampArm = (model.aftArmM > 0) ? model.aftArmM : 0.5;
    var pitchRate = 0;                         // rad/s — nose pitch angular velocity
    var railCleared = !weathercock;            // guided / vertical stacks aren't railed
    var railClearTime = null;

    // --- GYROSCOPIC SPIN (canted fins) + APOGEE BREAKUP (traditional Bang Fai) ---
    var spinFins = (model.rollInduce || 0) > 0;
    var Iroll = Math.max(0.02, Ipitch * 0.06);     // roll inertia ≪ pitch inertia
    var rollRate = 0, rollAngle = 0;               // rad/s, rad — the spin
    var apogeeBreakup = weathercock && !!model.apogeeBreakup;
    var brokenUp = false, breakupT = null, breakupAlt = 0, breakupVel = 0;
    var prevVv = 0;                                // last vertical velocity (apogee detect)
    if (weathercock) pitchCmd = launchAngle;   // start pointed up the rail
    var turnT0 = null;                         // time the gravity turn began
    var pitchOverTime = null, pitchOverAlt = 0, pitchOverVel = 0;
    var stageEvents = [];                      // SEPARATE_STAGE, emitted live
    var orbit = null, orbitTime = null;
    var cutoff = false, cutoffTime = null;     // main engine cutoff (start of coast)
    var guidePhase = 'ascent';                 // ascent | coast | circ | done
    var coastStart = null, circStart = null;
    var softLimit = maxTime;
    var reason = 'สิ้นสุดการบิน';

    // seed t=0 state so playback starts exactly on the pad (angled, for a Bang Fai)
    trajectory.push(toState({ t: 0, y: 0, v: 0, x: 0, vx: 0, alt: 0, a: 0,
      mass: model.totalMass, thrust: 0, buoyancy: 0, drag: 0, q: 0,
      propRemaining: eff.propellantMass,
      pitchCmd: weathercock ? launchAngle : PITCH_UP,
      padLocked: true, onRail: weathercock }, tumbleT));
    nextSample += sampleEvery;

    while (state.t < softLimit) {
      // --- PITCH PROGRAM · the gravity turn (LOCAL frame) --------------
      //  Everything below works in the LOCAL vertical frame — "up" is the
      //  radial direction, "forward" is the local horizon in the direction
      //  of travel. On a round planet these rotate as you fly downrange, so
      //  the fixed-frame commands have to be rotated back through the
      //  position angle. Get that wrong and a "horizontal" burn 150 km
      //  downrange actually points at the ground.
      var curAlt = altitudeOf(state.x, state.y);
      var curSpeed = Math.sqrt(state.v * state.v + state.vx * state.vx);
      var rr = Math.sqrt(state.x * state.x + (state.y + RE) * (state.y + RE)) || 1e-9;
      var radialVel = (state.vx * state.x + state.v * (state.y + RE)) / rr;
      var horizVel = (state.vx * (state.y + RE) - state.v * state.x) / rr;
      var fpaLocal = Math.atan2(radialVel, horizVel);          // 0 = local horizontal
      var horizonAng = Math.atan2(state.y + RE, state.x) - Math.PI / 2;  // fixed-frame

      // --- GYROSCOPIC SPIN — canted fins spin the rocket up over the flight.
      //  rollAccel = k·q·(fin area)·(cant) / I_roll  −  aero roll damping.
      //  spinStiff (0..1) is how gyroscopically rigid it is — near 1 above
      //  SPIN_REF: the nose holds its heading and it crabs through a crosswind.
      var spinStiff = 0;
      if (spinFins && liftedOff && curSpeed > 1) {
        var qSpin = 0.5 * airDensity(curAlt) * curSpeed * curSpeed;
        var rollAcc = ROLL_TORQUE_K * qSpin * (model.rollFinArea || 0.02) *
          model.rollInduce / Iroll - ROLL_DAMP * rollRate;
        rollRate = clamp(rollRate + rollAcc * dt, -ROLL_RATE_MAX, ROLL_RATE_MAX);
        spinStiff = clamp(Math.abs(rollRate) / SPIN_REF, 0, 1);
      }
      rollAngle += rollRate * dt;

      var burnEnable = true;
      if (model.gravityTurn && liftedOff && !state.tumbling) {
        if (turnT0 === null && curAlt > TURN_ALT && curSpeed > TURN_SPEED) {
          turnT0 = state.t;
          pitchOverTime = state.t; pitchOverAlt = curAlt; pitchOverVel = curSpeed;
        }
        if (turnT0 !== null) {
          var oe = orbitElements(state.x, state.y, state.vx, state.v);
          var vEsc = Math.sqrt(2 * MU / rr);

          // ---- GUIDANCE STATE MACHINE ---------------------------------
          //  ascent : fly the pitch schedule until the current orbit's high
          //           point (apoapsis) reaches the target shell → cut, coast.
          //  coast  : engine off, arc up to apoapsis (radial velocity ≈ 0).
          //  circ   : re-light, burn along the local horizon (prograde) to
          //           haul the low point (periapsis) up = circularise.
          //  done   : orbit achieved (or gave up) — coast forever.
          if (guidePhase === 'ascent') {
            if ((oe.bound && oe.apoapsis >= TARGET_APO && curAlt > 20000 && fpaLocal < 0.6) ||
                (oe.bound && oe.periapsis >= ORBIT_PERI_TARGET) ||
                curSpeed >= 0.985 * vEsc) {
              guidePhase = (oe.bound && oe.periapsis >= ORBIT_PERI_TARGET) ? 'done' : 'coast';
            }
          } else if (guidePhase === 'coast') {
            if (radialVel <= 1.0) guidePhase = 'circ';            // at/past apoapsis
            else if (curAlt < CUTOFF_ALT) guidePhase = 'done';    // fell back — abort
          } else if (guidePhase === 'circ') {
            if (!oe.bound || curSpeed >= 0.99 * vEsc ||
                (oe.bound && oe.periapsis >= ORBIT_PERI_TARGET) ||
                (oe.bound && (oe.apoapsis - oe.periapsis) < 12000) ||
                state.propRemaining <= 1e-6) {
              guidePhase = 'done';
            }
          }
          burnEnable = (guidePhase === 'ascent' || guidePhase === 'circ');
          if (!burnEnable && !cutoff && guidePhase !== 'coast') {
            cutoff = true; cutoffTime = state.t;
          }

          // ---- commanded attitude -----------------------------------
          if (guidePhase === 'circ') {
            // burn along the local horizon (prograde), a touch nose-up if
            // still sinking so the periapsis climbs, not the reverse
            pitchCmd = horizonAng + clamp(fpaLocal + 0.02, 0, 0.15);
          } else if (guidePhase !== 'done' || burnEnable) {
            // ascent pitch schedule: 90° above local horizon at TURN_ALT →
            // 0° after climbing TURN_SPAN, gentle early. Kick breaks symmetry;
            // MAX_AOA caps how far the nose leads the velocity.
            var kickFrac = clamp((curAlt - TURN_ALT) / KICK_BAND, 0, 1);
            var frac = clamp((curAlt - TURN_ALT) / TURN_SPAN, 0, 1);
            var targetLocal = PITCH_UP * (1 - Math.pow(frac, TURN_EXP));
            if (kickFrac < 1) targetLocal = Math.min(targetLocal, PITCH_UP - KICK_DEG * kickFrac);
            pitchCmd = horizonAng + clamp(targetLocal, fpaLocal - MAX_AOA, PITCH_UP);
          }
        }
      }

      // --- UNGUIDED PITCH · rail hold, then the weathercock oscillator -----
      if (weathercock && !state.tumbling) {
        if (!railCleared) {
          // ON THE ANGLED RAIL — the scaffold holds the stack rigid on the
          // launch vector: thrust up the rail, no weathercock, no drift.
          pitchCmd = launchAngle;
          if (Math.hypot(state.x, state.y) >= RAIL_LENGTH_M) {
            railCleared = true; railClearTime = state.t;
          }
        } else if (liftedOff && curSpeed > 1) {
          // OFF THE RAIL — a 1-DOF damped pitch oscillator. The nose is a
          // pendulum in the airstream: aero STIFFNESS from the static margin
          // (CoP behind CoM), DAMPING from the tail sweeping air, a GUST
          // disturbance from the wind — every term ÷ the moment of inertia.
          // A long Bang Fai tail stick makes I huge, so the response is slow
          // and shallow and a gust barely moves it. Negative margin (no tail /
          // no fins) → the stiffness pushes the WRONG way → alpha diverges.
          var vAirX = state.vx - wind, vAirY = state.v;
          var fpaAir = Math.atan2(vAirY, vAirX);
          var alpha = pitchCmd - fpaAir;
          while (alpha > Math.PI) alpha -= 2 * Math.PI;
          while (alpha < -Math.PI) alpha += 2 * Math.PI;
          var spd2 = vAirX * vAirX + vAirY * vAirY;
          var qLoc = 0.5 * airDensity(curAlt) * spd2;
          var pfNow = eff.propellantMass > 0 ? state.propRemaining / eff.propellantMass : 1;
          var comNow = model.comDryAxisM + (model.comWetAxisM - model.comDryAxisM) * pfNow;
          var marginNow = model.copAxisM - comNow;          // static margin, m
          var qA = qLoc * (model.refArea || 0.01);
          var vMag = Math.max(2, Math.sqrt(spd2));
          // aero stiffness (rad/s²) and damping (1/s), both ÷ I. Damping carries
          // a 1/v (air-traversal time over the tail) and clamps so the
          // explicit-stiffness / implicit-damping integrator stays well-behaved.
          var kStiff = clamp(WEATHERCOCK_STIFF * qA * marginNow / Ipitch, -80, 80);
          var kDamp = Math.min(
            WEATHERCOCK_DAMP * qA * pitchDampArm * pitchDampArm / (vMag * Ipitch), 60);
          // a small ever-present disturbance (thrust misalignment, asymmetry) +
          // the wind gust — this is what a metastable finless stack rides into a
          // tumble, and what a high-I tail-stick rocket simply damps away.
          var disturb = (0.04 * Math.sin(state.t * 4.7 + 0.3) +
            (wind ? GUST_TORQUE * wind * Math.sin(state.t * 3.3 + 1.1) : 0)) * qA / Ipitch;
          // GYROSCOPIC RIGIDITY — a fast-spinning rocket resists any change to
          // its spin-axis attitude: the gust disturbance is largely rejected,
          // damping is stiffened, and the nose is held toward the launch
          // heading. It drills straight through the crosswind like a bullet.
          if (spinStiff > 0.03) {
            disturb *= (1 - 0.95 * spinStiff);
            kDamp = Math.min(kDamp * (1 + 6 * spinStiff), 200);
          }
          // explicit stiffness + disturbance, IMPLICIT damping (unconditionally
          // stable even when the tail makes kDamp huge)
          var pitchAcc0 = -kStiff * Math.sin(alpha) + disturb;
          pitchRate = (pitchRate + pitchAcc0 * dt) / (1 + kDamp * dt);
          if (spinStiff > 0.03) {
            pitchRate *= (1 - 0.9 * spinStiff);
            // ease the commanded attitude back toward the launch heading — rate
            // proportional to how rigid the spin is (frame-rate-independent)
            pitchCmd += (launchAngle - pitchCmd) * clamp(3.0 * spinStiff * dt, 0, 0.35);
          }
          pitchCmd += pitchRate * dt;
          if (pitchCmd > PITCH_UP + 0.9) { pitchCmd = PITCH_UP + 0.9; pitchRate = Math.min(pitchRate, 0); }
          if (pitchCmd < -PITCH_UP - 0.9) { pitchCmd = -PITCH_UP - 0.9; pitchRate = Math.max(pitchRate, 0); }
          // DEPARTURE = a real loss of control, and only judged while it still
          // matters: under thrust or still climbing. A spent stick arcing over
          // and falling nose-down past apogee is a normal Bang Fai, not a fail.
          var poweredOrClimbing = prevForce > 1e-6 || state.v > 1;
          if (Math.abs(alpha) > DEPART_ALPHA && spd2 > TUMBLE_SPEED_MIN * TUMBLE_SPEED_MIN &&
              poweredOrClimbing) {
            state.tumbling = true; tumbleT = state.t;
          }
        }
      }

      var d = step(state, eff, dt, wind, pitchCmd, state.t - stageT0, burnEnable);
      // carry the spin + breakup state onto this sample for the render layer
      d.rollRate = rollRate; d.rollAngle = rollAngle;
      d.spinStiff = spinStiff;
      d.brokenUp = brokenUp;

      // --- ANGLED-RAIL CONSTRAINT — while on the scaffold, motion is locked
      //  to the launch vector; the rail cancels the perpendicular component of
      //  gravity so it slides straight instead of arcing over at 2 m altitude.
      if (weathercock && !railCleared) {
        var rc = Math.cos(launchAngle), rs = Math.sin(launchAngle);
        var along = Math.max(0, d.vx * rc + d.v * rs);      // no sliding back down
        d.vx = along * rc; d.v = along * rs;
        d.x = state.x + d.vx * dt; d.y = state.y + d.v * dt;
        d.alt = altitudeOf(d.x, d.y);
        d.padLocked = along < 1e-6;
        d.onRail = true;
        d.liftedOff = along > 1e-6;
      }

      var force = d.thrust + d.buoyancy;
      if (force > 1e-6) everFired = true;

      // --- LIFTOFF : the exact tick the stack breaks inertia ------------
      if (liftoffTime === null && !state.liftedOff && d.alt > 1e-6) {
        state.liftedOff = true;
        liftoffTime = d.t; liftoffAlt = d.alt; liftoffVel = Math.hypot(d.v, d.vx);
        trajectory.push(toState(d, tumbleT, burnT));
      }
      var forceEdge = (prevForce <= 1e-6) !== (force <= 1e-6);
      // sample every tick through the powered opening seconds — and, for a
      // hot-air lantern, through the ENTIRE pad hold, so the buoyancy spool
      // (and the flame that tracks it) ramps up perfectly smoothly while the
      // player holds the lantern down under the manual-release gate.
      var densePhase = force > 1e-6 &&
        (d.t < 3.0 || (motorMode === 'buoyancy' && !state.liftedOff));
      prevForce = force;

      if (d.alt > 0.02) liftedOff = true;
      if (d.alt > apogee) { apogee = d.alt; apogeeTime = d.t; }
      var spdNow = Math.hypot(d.v, d.vx);

      // --- APOGEE BREAKUP (traditional Bang Fai) --------------------------
      //  At the top of the arc a folk-craft บั้งไฟ burns through the head and
      //  the stick snaps — it does NOT spear back down like a lawn dart, it
      //  tumbles. An ENGINEERED build (nose cone + fins / spin) holds together.
      if (apogeeBreakup && !brokenUp && !state.tumbling && liftedOff &&
          d.v <= 0 && prevVv > 0 && d.alt > 20) {
        brokenUp = true; breakupT = d.t; breakupAlt = d.alt; breakupVel = spdNow;
        state.brokenUp = true;
        state.tumbling = true; d.tumbling = true; d.brokenUp = true;
        tumbleT = d.t;
      }
      prevVv = d.v;
      if (spdNow > maxV) maxV = spdNow;
      if (d.q > maxQ) maxQ = d.q;
      finalX = d.x;
      if (Math.abs(d.x) > maxDrift) maxDrift = Math.abs(d.x);

      // --- STAGING : current stage burns dry → drop it, light the next --
      var wasStaged = false;
      if (!cutoff && stages.length > 1 && stageIdx < stages.length - 1 &&
          d.propRemaining <= 1e-6 && (stages[stageIdx].propellantMass || 0) > 0) {
        stageIdx++;
        stageT0 = d.t;
        eff = effectiveStage(model, stages, stageIdx);
        d.propRemaining = eff.propellantMass;         // full load of the new stage
        d.mass = eff.dryMass + d.propRemaining;
        stageEvents.push({
          time: round(d.t, 3), type: 'SEPARATE_STAGE',
          message: 'สลัดท่อนที่ ' + stageIdx + ' ทิ้ง — จุดเครื่องยนต์ท่อนถัดไป',
          altitude: round(d.alt, 2), velocity: round(spdNow, 2)
        });
        trajectory.push(toState(d, tumbleT, burnT));
        wasStaged = true;
      }

      // --- phase-transition events (guided vehicles) -------------------
      if (guidePhase === 'coast' && coastStart === null) {
        coastStart = d.t;
        stageEvents.push({
          time: round(d.t, 3), type: 'SEPARATE_STAGE',
          message: 'ดับเครื่องยนต์หลัก (MECO) — ลอยขึ้นสู่จุดสูงสุดของวงโคจร',
          altitude: round(d.alt, 2), velocity: round(spdNow, 2)
        });
      }
      if (guidePhase === 'circ' && circStart === null) {
        circStart = d.t;
        stageEvents.push({
          time: round(d.t, 3), type: 'PITCH_OVER',
          message: 'จุดเครื่องยนต์อีกครั้ง — เผาแนวราบเพื่อปรับวงโคจรให้กลม (Circularisation)',
          altitude: round(d.alt, 2), velocity: round(spdNow, 2)
        });
      }

      // --- BURNOUT + ORBIT --------------------------------------------
      //  For a guided vehicle burnout = the moment guidance is fully done;
      //  for everything else it is the first tick with no thrust after firing.
      var spent = model.gravityTurn
        ? (guidePhase === 'done' && force <= 1e-6)
        : (everFired && force <= 1e-6 && stageIdx >= stages.length - 1);
      if (burnoutT === null && spent) {
        burnoutT = d.t; burnoutAlt = d.alt; burnoutVel = spdNow;
      }
      if (burnoutT !== null && orbit === null && !state.tumbling) {
        var oe2 = orbitElements(d.x, d.y, d.vx, d.v);
        if (oe2.bound && oe2.periapsis > 8000) {
          orbit = oe2; orbitTime = d.t;
          // run ~1 orbit (capped) so the trail draws a full ellipse, then stop
          softLimit = Math.min(maxTime, d.t + Math.min(1.05 * oe2.period, 900));
        }
      }

      // --- dynamic aero-stability -------------------------------------
      //  Weathercock vehicles depart via the pitch oscillator above (which
      //  models I and damping); this static fallback only fires for any other
      //  unguided rocket that somehow isn't running the oscillator.
      var wasTumbling = state.tumbling;
      if (canTumble && !weathercock && !state.tumbling && liftedOff && spdNow > TUMBLE_SPEED_MIN) {
        var pf = eff.propellantMass > 0 ? d.propRemaining / eff.propellantMass : 1;
        var comAxis = model.comDryAxisM + (model.comWetAxisM - model.comDryAxisM) * pf;
        if (model.copAxisM - comAxis <= 0) {
          state.tumbling = true; d.tumbling = true; tumbleT = d.t;
        }
      }
      // the oscillator sets state.tumbling before step(); reflect it on d
      if (weathercock && state.tumbling && !d.tumbling) { d.tumbling = true; }

      // --- MIDAIR_BURN (lanterns only) : carried sideways fast enough by the
      //  wind that it tips over, the flame licks the paper, and the whole
      //  envelope goes up. |vx| (ground drift) — a lantern rides WITH the air,
      //  so its drift speed is the wind it is fighting. One-way latch, and only
      //  while the flame is actually lit and it is genuinely airborne.
      var wasBurning = state.burning;
      if (motorMode === 'buoyancy' && !state.burning && liftedOff &&
          d.alt > BURN_MIN_ALT && d.buoyancy > 1e-4 &&
          Math.abs(d.vx) > BURN_DRIFT_AIRSPEED) {
        state.burning = true; d.burning = true; burnT = d.t;
        midairBurn = { time: d.t, alt: d.alt, vel: spdNow };
      }

      if (!wasStaged &&
          (d.t >= nextSample || (state.tumbling && !wasTumbling) ||
           (state.burning && !wasBurning) || forceEdge || densePhase)) {
        trajectory.push(toState(d, tumbleT, burnT));
        if (d.t >= nextSample) nextSample += sampleEvery;
      }
      while (nextSample <= d.t) nextSample += sampleEvery;

      state = {
        t: d.t, y: d.y, v: d.v, x: d.x, vx: d.vx,
        propRemaining: d.propRemaining, tumbling: state.tumbling,
        burning: state.burning, brokenUp: brokenUp,
        liftedOff: state.liftedOff || d.liftedOff
      };

      if (liftedOff && d.onPad) {
        reason = state.burning ? 'โคมไฟไหม้กลางอากาศแล้วร่วงลงพื้น'
          : brokenUp ? 'บั้งไฟดั้งเดิมแตกที่จุดสูงสุด ตีลังกาตกลงพื้น'
          : state.tumbling ? 'จรวดเสียการควบคุมแล้วตกกระแทกพื้น'
          : (orbit ? 'กลับเข้าชั้นบรรยากาศแล้วแตะพื้น' : 'ยานแตะพื้นแล้ว');
        trajectory.push(toState(d, tumbleT, burnT));
        break;
      }
      if (!liftedOff && state.t > 30 &&
          force < eff.dryMass * gravity(0) * 0.999) {
        reason = 'แรงยกไม่พอ — ยานไม่ลอยขึ้นจากพื้น';
        break;
      }
    }
    if (state.t >= softLimit && softLimit >= maxTime) reason = 'ถึงเวลาจำกัดการจำลอง';
    else if (orbit && state.t >= softLimit) reason = 'เข้าสู่วงโคจรเสถียร';

    var summary = {
      apogee: round(apogee, 2),
      maxVelocity: round(maxV, 2),
      maxQ: round(maxQ, 2),
      flightTime: round(state.t, 2),
      apogeeTime: round(apogeeTime, 2),
      burnoutMass: round(eff.dryMass + state.propRemaining, 4),
      liftedOff: liftedOff,
      // the tick the stack first broke inertia — the render layer holds a
      // khom loy on the pad up to here while the flame spools, then RELEASES
      holdTime: liftoffTime != null ? round(liftoffTime, 3) : null,
      impactX: round(finalX, 2),
      maxDrift: round(maxDrift, 2),
      // ground-track angle × RE — only meaningful for a suborbital flight
      downrange: orbit ? 0 : round(Math.abs(RE * Math.atan2(finalX, state.y + RE)), 2),
      stagesFlown: stageIdx + 1,
      orbit: orbit ? {
        achieved: true,
        apoapsis: round(orbit.apoapsis, 1),
        periapsis: round(orbit.periapsis, 1),
        eccentricity: round(orbit.e, 4),
        period: round(orbit.period, 1)
      } : { achieved: false, apoapsis: 0, periapsis: 0, eccentricity: 0, period: 0 },
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
        message: 'เริ่มเลี้ยวโค้ง (Gravity Turn) — เอียงหัวตามเวกเตอร์ความเร็ว',
        altitude: round(pitchOverAlt, 2), velocity: round(pitchOverVel, 2)
      });
    }
    physicsEvents = physicsEvents.concat(stageEvents);
    if (breakupT !== null) {
      physicsEvents.push({
        time: round(breakupT, 3), type: 'APOGEE_BREAKUP',
        message: 'ถึงจุดสูงสุด — หัวโหวดไหม้ทะลุ โครงหัก บั้งไฟแตกแล้วตีลังกาลง (บั้งไฟหางแบบดั้งเดิม)',
        altitude: round(breakupAlt, 2), velocity: round(breakupVel, 2)
      });
    }
    if (midairBurn) {
      physicsEvents.push({
        time: round(midairBurn.time, 3), type: 'MIDAIR_BURN',
        message: 'โคมเอียงจนไฟลามเปลือกกระดาษ — เสียแรงพยุง ร่วงลงทั้งที่ยังลุกไหม้',
        altitude: round(midairBurn.alt, 2), velocity: round(midairBurn.vel, 2)
      });
    }
    if (burnoutT !== null) {
      physicsEvents.push({
        time: round(burnoutT, 3), type: 'BURNOUT', message: 'เชื้อเพลิงหมดทุกท่อน',
        altitude: round(burnoutAlt, 2), velocity: round(burnoutVel, 2)
      });
    }
    if (orbit) {
      physicsEvents.push({
        time: round(orbitTime, 3), type: 'ORBIT',
        message: 'เข้าสู่วงโคจร! จุดต่ำสุด ' + fmtKm(orbit.periapsis) +
          ' · จุดสูงสุด ' + fmtKm(orbit.apoapsis) + ' · คาบ ' + Math.round(orbit.period) + ' วิ',
        altitude: round(orbit.periapsis, 2), velocity: round(maxV, 2)
      });
    }

    return finalize({
      ok: true, reason: reason, trajectory: trajectory, events: [],
      summary: summary, meta: meta, mode: motorMode, _physicsEvents: physicsEvents
    }, model);
  }

  function fmtKm(m) {
    return Math.abs(m) >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m';
  }

  // ---------------------------------------------------------------------------
  //  simulateMany() — a BUNDLE of vehicles flying at once
  // ---------------------------------------------------------------------------

  /**
   * Run several vehicles as ONE flight. A Bang Fai festival is rapid-fire: the
   * next rocket is lit while the last is still climbing / arcing / smoking.
   *
   * The vehicles do not interact (shared sky + wind, no collisions), so
   * "stepping every active vehicle each dt in one interleaved loop" and
   * "integrating each vehicle independently" are bit-identical. simulateMany()
   * therefore loops the vehicle list and runs each through the LOCKED
   * single-vehicle simulate(), then composes the results into a bundle:
   *   · every trajectory sample + event time is shifted by that vehicle's `t0`
   *     (its wall-clock release offset — 0 for the first, = the master clock at
   *     the moment "launch next" was pressed for the rest)
   *   · every event is tagged with `vehicleId`
   *
   * @param {{id?:string, model:Object, t0?:number}[]} specs
   * @param {Object} [opts]  passed straight through to simulate() (dt, wind, …)
   * @returns {{ok:boolean, contractVersion:string, mode:string,
   *            masterDuration:number,
   *            vehicles:{id:string,t0:number,sim:SimulationResult}[],
   *            events:{vehicleId:string,localTime:number}[],
   *            meta:Object}}
   */
  function simulateMany(specs, opts) {
    specs = specs || [];
    var vehicles = [], events = [], anyOk = false, masterDur = 0;

    for (var i = 0; i < specs.length; i++) {
      var spec = specs[i] || {};
      var id = spec.id || ('v' + i);
      var t0 = (isFinite(spec.t0) && spec.t0 > 0) ? +spec.t0 : 0;
      var sim = simulate(spec.model, opts);
      anyOk = anyOk || !!sim.ok;

      (sim.events || []).forEach(function (e) {
        var tagged = {};
        for (var k in e) if (e.hasOwnProperty(k)) tagged[k] = e[k];
        tagged.localTime = e.time;
        tagged.time = round(e.time + t0, 3);
        tagged.vehicleId = id;
        events.push(tagged);
      });

      var localDur = sim.trajectory && sim.trajectory.length
        ? sim.trajectory[sim.trajectory.length - 1].time : 0;
      masterDur = Math.max(masterDur, t0 + localDur);
      vehicles.push({ id: id, t0: t0, sim: sim });
    }

    events.sort(function (a, b) { return a.time - b.time; });

    return {
      ok: anyOk,
      contractVersion: CONTRACT_VERSION,
      mode: (vehicles[0] && vehicles[0].sim) ? vehicles[0].sim.mode : 'none',
      masterDuration: round(masterDur, 3),
      vehicles: vehicles,
      events: events,
      meta: (vehicles[0] && vehicles[0].sim) ? vehicles[0].sim.meta : {}
    };
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
  function toState(d, tumbleT, burnT) {
    // Straight up until the vehicle departs controlled flight; then it pitches
    // over and spins — a wild, escalating attitude the replay can show literally.
    var o = { pitch: 90, yaw: 0, roll: 0 };
    var vx = d.vx || 0;
    if (d.tumbling && isFinite(tumbleT)) {
      var tt = Math.max(0, d.t - tumbleT);
      // a structural break-up at apogee tumbles gentler than a powered LOC
      var tk = d.brokenUp ? 0.55 : 1;
      o.pitch = 90 - (tt * 130 * tk + Math.sin(tt * (d.brokenUp ? 5 : 9)) * 55);
      o.yaw = Math.sin(tt * 5.5) * 45 + tt * 70 * tk;
      o.roll = tt * (d.brokenUp ? 150 : 260);
    } else if (d.burning && isFinite(burnT)) {
      // a burning lantern tips right over and swings as it falls — steep,
      // slower than a rocket tumble, and it keeps its wind-driven yaw drift
      var bt = Math.max(0, d.t - burnT);
      o.pitch = 90 - Math.min(150, bt * 55 + Math.sin(bt * 3.1) * 26);
      o.roll = Math.sin(bt * 2.3) * 40 + bt * 55;
      o.yaw = Math.sin(bt * 1.7) * 30;
    } else if (d.buoyMode && d.v < -0.05) {
      // A COOLING LANTERN IS A FALLING PAPER BAG — not a stone. Once it is
      // sinking, the trapped-air symmetry is gone: it tips and rocks on a
      // low-frequency wander whose amplitude grows with sink rate. The
      // renderer layers a faster flutter on top; this keeps a paused / scrubbed
      // frame honest (never bolt-upright while dropping).
      var fall = Math.min(1.3, 0.35 + (-d.v) / 1.4);
      var ft = d.t;
      o.pitch = 90 - (Math.sin(ft * 1.7 + 0.3) * 17 + Math.sin(ft * 0.83 + 1.1) * 9) * fall;
      o.roll = (Math.sin(ft * 1.31 + 0.7) * 30 + Math.sin(ft * 2.09) * 13) * fall;
      o.yaw = Math.sin(ft * 1.03) * 22 * fall;
    } else if ((d.vectored || d.onRail || (d.padLocked && isFinite(d.pitchCmd) && d.pitchCmd < Math.PI / 2 - 1e-3)) &&
               (Math.abs(vx) > 0.5 || (isFinite(d.pitchCmd) && Math.abs(d.pitchCmd - Math.PI / 2) > 1e-3))) {
      // point along the commanded thrust attitude while it has meaningful
      // thrust or is held on the rail; otherwise follow the velocity vector.
      // atan2(vertical, horizontal) is already the "90° = up" convention.
      var ang = (isFinite(d.pitchCmd) && (d.thrust > 1 || d.onRail || d.padLocked))
        ? d.pitchCmd
        : Math.atan2(d.v, vx);
      o.pitch = ang * 180 / Math.PI;
    }
    // canted fins → a real visible roll about the flight axis. Left UNWRAPPED
    // (monotonic) so the renderer's lerp between samples is a smooth spin, not
    // a jump every time it crosses 360°.
    if (isFinite(d.rollAngle) && Math.abs(d.rollRate || 0) > 0.4 && !d.tumbling) {
      o.roll = d.rollAngle * 180 / Math.PI;
    }
    var dx = round(d.x || 0, 3);
    var spd = Math.sqrt(d.v * d.v + vx * vx);
    var alt = d.alt != null ? d.alt : altitudeOf(d.x || 0, d.y || 0);
    return {
      time: round(d.t, 3),
      // position is the FIXED flight-frame coordinate (planet centre at (0,-RE))
      // so the renderer can draw the true orbital arc; `altitude` is height ASL.
      position: { x: dx, y: round(d.y, 3), z: 0 },
      drift: dx,
      velocity: round(d.v, 3),
      vx: round(vx, 3),
      speed: round(spd, 3),
      acceleration: round(d.a, 3),
      mass: round(d.mass, 4),
      orientation: { pitch: round(o.pitch, 2), yaw: round(o.yaw, 2), roll: round(o.roll, 2) },
      altitude: round(alt, 3),
      q: round(d.q, 2),
      thrust: round(d.thrust, 3),
      buoyancy: round(d.buoyancy, 3),
      drag: round(d.drag, 3),
      propRemaining: round(d.propRemaining, 4),
      tumbling: !!d.tumbling,
      burning: !!d.burning,
      brokenUp: !!d.brokenUp,
      crashed: !!d.crashed,
      spinRate: round(d.rollRate || 0, 3),        // rad/s about the flight axis
      spinStiff: round(d.spinStiff || 0, 3),      // 0..1 gyroscopic rigidity
      padLocked: !!d.padLocked
    };
  }

  function emptySummary() {
    return {
      apogee: 0, maxVelocity: 0, maxQ: 0, flightTime: 0,
      apogeeTime: 0, burnoutMass: 0, liftedOff: false, holdTime: null,
      impactX: 0, maxDrift: 0, downrange: 0, stagesFlown: 0,
      orbit: { achieved: false, apoapsis: 0, periapsis: 0, eccentricity: 0, period: 0 },
      mode: 'none'
    };
  }

  function round(v, p) { var m = Math.pow(10, p); return Math.round(v * m) / m; }

  global.RS = global.RS || {};
  global.RS.Physics = {
    G0: G0, RE: RE, MU: MU, RHO0: RHO0, SCALE_H: SCALE_H, ATMOS_TOP: ATMOS_TOP,
    CONTRACT_VERSION: CONTRACT_VERSION,
    gravity: gravity,
    gravityVec: gravityVec,
    altitudeOf: altitudeOf,
    airDensity: airDensity,
    orbitElements: orbitElements,
    motorOutput: motorOutput,
    step: step,
    simulate: simulate,
    simulateMany: simulateMany
  };

})(typeof window !== 'undefined' ? window : this);
