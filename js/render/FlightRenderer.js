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
    this.trajectory = (simResult && simResult.trajectory) || [];
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
      speed: lerp(a.speed, b.speed, f),
      acceleration: lerp(a.acceleration, b.acceleration, f),
      mass: lerp(a.mass, b.mass, f),
      orientation: {
        pitch: lerp(a.orientation.pitch, b.orientation.pitch, f),
        yaw: lerp(a.orientation.yaw, b.orientation.yaw, f),
        roll: lerp(a.orientation.roll, b.orientation.roll, f)
      },
      altitude: lerp(a.altitude, b.altitude, f),
      q: lerp(a.q, b.q, f)
    };
  };

  FlightRenderer.prototype._apply = function (state) {
    if (!state || !this.group) return;
    this.group.position.set(state.position.x, state.position.y, state.position.z);
    if (this.group.rotation && state.orientation) {
      var deg = Math.PI / 180;
      // pitch 90° == nose up (our authoring default) -> zero rotation about X
      this.group.rotation.set(
        (90 - state.orientation.pitch) * deg,
        state.orientation.yaw * deg,
        state.orientation.roll * deg
      );
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
