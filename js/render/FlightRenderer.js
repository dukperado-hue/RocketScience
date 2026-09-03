/* =============================================================================
 * FROM FIRE TO ORBIT — Render layer
 * js/render/FlightRenderer.js  ·  the "Dumb Visualizer"
 *
 * Plays back a SimulationResult. It performs ZERO physics — it interpolates the
 * pre-computed trajectory[] and drives a vehicle Group's transform, and it
 * fires the pre-computed events[] as playback time crosses them. This is what
 * unlocks replays, scrubbing and frame-accurate diagnostics.
 *
 * Phase 1.1 scaffold: load / seek / play / pause / event hooks. Not yet wired
 * to a flight screen — that's Phase 2. The contract binding is the deliverable.
 * ===========================================================================*/
(function (global) {
  'use strict';

  /**
   * @param {Object} [opts]
   * @param {number} [opts.playbackRate=1]
   * @param {THREE.Object3D} [opts.group]   the vehicle group to move
   */
  function FlightRenderer(opts) {
    opts = opts || {};
    this.group = opts.group || null;
    this.playbackRate = opts.playbackRate || 1;

    this.sim = null;
    this.trajectory = [];
    this.events = [];
    this.duration = 0;
    this.time = 0;
    this.playing = false;
    this._firedIdx = 0;
    this._listeners = {};   // type -> [cb]
    this._anyListeners = [];
  }

  /** @param {Object} simResult  from RS.Physics.simulate() */
  FlightRenderer.prototype.load = function (simResult) {
    this.sim = simResult || null;
    // a hot-air lantern "dances" — add a procedural sway on top of the trajectory
    this.buoyant = !!(simResult && simResult.mode === 'buoyancy');
    this.trajectory = (simResult && simResult.trajectory) || [];
    // peak hot-air lift this flight ever produced — the reference the visual
    // flame + interior light are scaled against, so they track the REAL
    // buoyancy (and its exp cool-down), never just burnTime
    this._peakBuoy = 0;
    for (var pi = 0; pi < this.trajectory.length; pi++) {
      var pb = this.trajectory[pi].buoyancy || 0;
      if (pb > this._peakBuoy) this._peakBuoy = pb;
    }
    this.events = ((simResult && simResult.events) || []).slice()
      .sort(function (a, b) { return a.time - b.time; });
    this.duration = this.trajectory.length
      ? this.trajectory[this.trajectory.length - 1].time : 0;
    this.time = 0;
    this._firedIdx = 0;
    this.playing = false;
    if (this.trajectory.length) this._apply(this.trajectory[0]);
    return this;
  };

  FlightRenderer.prototype.attach = function (group) {
    this.group = group;
    if (this.trajectory.length) this.seek(this.time);
  };

  /** Absolute seek, seconds. Refires no events; just repositions + resyncs pointer. */
  FlightRenderer.prototype.seek = function (t) {
    t = clamp(t, 0, this.duration);
    this.time = t;
    this._apply(this.sampleAt(t));
    // move the event pointer to match, without firing
    this._firedIdx = 0;
    while (this._firedIdx < this.events.length && this.events[this._firedIdx].time <= t) {
      this._firedIdx++;
    }
    return this;
  };

  FlightRenderer.prototype.play = function () { if (this.duration > 0) this.playing = true; return this; };
  FlightRenderer.prototype.pause = function () { this.playing = false; return this; };
  FlightRenderer.prototype.togglePlay = function () { return this.playing ? this.pause() : this.play(); };
  FlightRenderer.prototype.setRate = function (r) { this.playbackRate = r || 1; return this; };

  /** Call every frame from a Scene loop. `dt` seconds (wall clock). */
  FlightRenderer.prototype.update = function (dt) {
    if (!this.playing || !this.trajectory.length) return;
    var next = this.time + dt * this.playbackRate;
    if (next >= this.duration) { next = this.duration; this.playing = false; }

    // fire any events we passed
    while (this._firedIdx < this.events.length && this.events[this._firedIdx].time <= next) {
      this._emit(this.events[this._firedIdx]);
      this._firedIdx++;
    }
    this.time = next;
    this._apply(this.sampleAt(next));
  };

  /** Linear-interpolated TrajectoryState at time t. */
  FlightRenderer.prototype.sampleAt = function (t) {
    var tr = this.trajectory;
    if (!tr.length) return null;
    if (t <= tr[0].time) return tr[0];
    if (t >= tr[tr.length - 1].time) return tr[tr.length - 1];

    // binary search for the bracketing pair
    var lo = 0, hi = tr.length - 1;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (tr[mid].time <= t) lo = mid; else hi = mid;
    }
    var a = tr[lo], b = tr[hi];
    var f = (t - a.time) / Math.max(b.time - a.time, 1e-6);
    return {
      time: t,
      position: {
        x: lerp(a.position.x, b.position.x, f),
        y: lerp(a.position.y, b.position.y, f),
        z: lerp(a.position.z, b.position.z, f)
      },
      velocity: lerp(a.velocity, b.velocity, f),
      vx: lerp(a.vx || 0, b.vx || 0, f),
      speed: lerp(a.speed, b.speed, f),
      acceleration: lerp(a.acceleration, b.acceleration, f),
      mass: lerp(a.mass, b.mass, f),
      orientation: {
        pitch: lerp(a.orientation.pitch, b.orientation.pitch, f),
        yaw: lerp(a.orientation.yaw, b.orientation.yaw, f),
        roll: lerp(a.orientation.roll, b.orientation.roll, f)
      },
      altitude: lerp(a.altitude, b.altitude, f),
      q: lerp(a.q, b.q, f),
      // step-like fields: no interpolation, take the sample we're leaving
      thrust: a.thrust || 0,
      buoyancy: a.buoyancy || 0,
      tumbling: !!a.tumbling,
      burning: !!a.burning,
      padLocked: !!a.padLocked
    };
  };

  FlightRenderer.prototype._apply = function (state) {
    if (!state || !this.group) return;
    this.group.position.set(state.position.x, state.position.y, state.position.z);
    if (this.group.rotation && state.orientation) {
      var deg = Math.PI / 180;
      var pitch = state.orientation.pitch,
          yaw = state.orientation.yaw,
          roll = state.orientation.roll;

      // hot-air lantern: a slow, layered sinusoidal sway — it drifts and dances
      // (not while tumbling or once the envelope is ablaze — then the
      // pre-computed attitude already has it pitching over and swinging)
      if (this.buoyant && !state.tumbling && !state.burning) {
        var t = state.time || 0;
        pitch += Math.sin(t * 0.63) * 4.5 + Math.sin(t * 1.9 + 1.1) * 1.8;
        roll  += Math.sin(t * 0.47 + 0.6) * 6.0 + Math.sin(t * 2.3) * 2.2;
        yaw   += Math.sin(t * 0.31) * 9.0;

        // DEAD LEAF — once it is sinking, the gentle dance becomes a chaotic
        // flutter that grows with descent rate: a falling paper bag, tumbling
        // and swaying, never a dropped stone. (Physics already sets a slow
        // base wander in the trajectory; this is the fast render-side shimmer.)
        if (state.velocity < -0.05) {
          var fall = Math.min(2.0, 0.4 + (-state.velocity) / 1.2);
          pitch += (Math.sin(t * 4.1 + 0.4) * 11 + Math.sin(t * 9.3) * 5) * fall;
          roll  += (Math.sin(t * 3.6 + 1.7) * 19 + Math.sin(t * 7.9 + 0.5) * 8) * fall;
          yaw   += (Math.sin(t * 2.7) * 13 + Math.sin(t * 6.1) * 6) * fall;
        }
      }

      // pitch 90° == nose up (our authoring default) -> zero rotation about X
      this.group.rotation.set(
        (90 - pitch) * deg, yaw * deg, roll * deg
      );
    }

    // khom-loy flame: flicker the interior PointLight + flame meshes while the
    // wax is doing work; if the whole envelope caught fire, BLAZE it; snuff
    // only once it is cold and dead.
    var ud = this.group.userData;
    if (ud && ud.flicker && ud.flicker.length &&
        global.RS && global.RS.render && global.RS.render.VehicleRenderer) {
      // NONG KAPI'S FIX — the visual flame is synced to the NET BUOYANT FORCE,
      // not burnTime. Hot air is light: while the lantern is still rising or
      // hovering the flame burns proportional to its lift; the instant lift
      // drops below weight (it is falling) the flame collapses to a microscopic
      // ember. The light + the flame follow the SAME exp cool-down curve.
      var heat;
      if (state.burning) {
        heat = 1;                                   // envelope ablaze — blaze pumps it
      } else if (this.buoyant) {
        var buoyN = state.buoyancy || 0;
        var ref = this._peakBuoy || Math.max(buoyN, 1e-3);
        heat = clamp(buoyN / ref, 0, 1);
        var weightN = (state.mass || 1) * 9.80665;
        if (buoyN <= weightN) {                     // lift <= weight → it is falling
          heat = Math.min(heat, 0.035);             // a glowing ember, nothing more
        }
      } else {
        heat = (state.thrust || 0) > 0.01 ? 1 : 0;  // rockets keep the binary look
      }
      var lit = heat > 0.006 || state.burning;
      global.RS.render.VehicleRenderer.flicker(this.group, lit, !!state.burning, heat);
    }
  };

  // --- event hooks --------------------------------------------------------
  FlightRenderer.prototype.on = function (type, cb) {
    if (type === '*') { this._anyListeners.push(cb); return this; }
    (this._listeners[type] = this._listeners[type] || []).push(cb);
    return this;
  };
  FlightRenderer.prototype._emit = function (evt) {
    (this._listeners[evt.type] || []).forEach(function (cb) { safe(cb, evt); });
    this._anyListeners.forEach(function (cb) { safe(cb, evt); });
  };

  function safe(fn, a) { try { fn(a); } catch (e) { console.error(e); } }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function lerp(a, b, f) { return a + (b - a) * f; }

  global.RS = global.RS || {};
  global.RS.render = global.RS.render || {};
  global.RS.render.FlightRenderer = FlightRenderer;

})(typeof window !== 'undefined' ? window : this);
