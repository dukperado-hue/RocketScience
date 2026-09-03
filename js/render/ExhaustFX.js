/* =============================================================================
 * FROM FIRE TO ORBIT — Render layer
 * js/render/ExhaustFX.js  ·  the launch-pad exhaust / smoke particle field
 *
 * A dumb, pooled Points cloud. It performs ZERO physics — every frame the
 * FlightScreen hands it the current trajectory sample's state (position, powered
 * flag, padLocked flag) and it renders the appropriate exhaust:
 *
 *   · padLocked / on the pad + burning → a HEAVY buildup of smoke that pools
 *     and billows outward along the ground (the vehicle is fighting inertia)
 *   · off the pad + burning            → a tight downward exhaust column that
 *     becomes the flight trail
 *   · not burning                      → nothing new; existing puffs dissipate
 *
 * If THREE is missing, `available` is false and every method is a safe no-op.
 * ===========================================================================*/
(function (global) {
  'use strict';

  var THREE = global.THREE;

  function ExhaustFX(opts) {
    opts = opts || {};
    this.max = opts.max || 320;
    this.available = !!THREE;
    if (!this.available) return;

    this._pos = new Float32Array(this.max * 3);
    for (var i = 0; i < this.max; i++) this._pos[i * 3 + 1] = -99999;

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this._pos, 3));

    this.material = new THREE.PointsMaterial({
      color: 0xcdcdd4, size: 2.4, sizeAttenuation: true,
      transparent: true, opacity: 0.5, depthWrite: false
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;

    this._p = [];
    for (var k = 0; k < this.max; k++) {
      this._p.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
    }
    this._cursor = 0;
    this._emitAcc = 0;
  }

  ExhaustFX.prototype.object3d = function () { return this.points; };

  /** Wipe every live particle (call on open / restart). */
  ExhaustFX.prototype.reset = function () {
    if (!this.available) return;
    for (var i = 0; i < this.max; i++) {
      this._p[i].life = 0;
      this._pos[i * 3 + 1] = -99999;
    }
    this._emitAcc = 0;
    this.points.geometry.attributes.position.needsUpdate = true;
  };

  ExhaustFX.prototype._spawn = function (o) {
    var p = this._p[this._cursor];
    this._cursor = (this._cursor + 1) % this.max;
    p.life = o.max; p.max = o.max;
    p.x = o.x; p.y = o.y; p.z = o.z;
    p.vx = o.vx; p.vy = o.vy; p.vz = o.vz;
  };

  /**
   * @param {number} dt   wall-clock seconds since last frame
   * @param {Object} st
   * @param {number} st.x            vehicle horizontal position (m)
   * @param {number} st.y            vehicle altitude (m)
   * @param {number} st.v            vehicle vertical velocity (m/s)
   * @param {boolean} st.powered     an engine is producing force this frame
   * @param {boolean} st.padLocked   welded to the pad, fighting inertia
   * @param {boolean} st.buoyant     hot-air lantern (no hard exhaust)
   * @param {boolean} st.wisp        a lantern warming on the pad — thin heat-haze only
   * @param {number} st.exhaustY     motor exhaust offset below the vehicle origin
   */
  ExhaustFX.prototype.update = function (dt, st) {
    if (!this.available || !st) return;
    dt = Math.min(dt || 0, 0.05);

    var GROUND = 0.06;
    var ex = st.x || 0;
    var onPad = !!st.padLocked || (st.y || 0) <= 0.03;
    var exhaustBase = (st.y || 0) + (st.exhaustY != null ? st.exhaustY : -0.3);

    // ---- emit -----------------------------------------------------------
    if (st.powered && st.wisp) {
      // a khom loy being held on the pad while the wax catches: no roaring
      // exhaust, just a slow thread of warm smoke rising off the flame
      this._emitAcc += 15 * dt;
      var wn = this._emitAcc | 0;
      this._emitAcc -= wn;
      for (var w = 0; w < wn; w++) {
        this._spawn({
          x: ex + (Math.random() - 0.5) * 0.32,
          y: GROUND + Math.random() * 0.5,
          z: (Math.random() - 0.5) * 0.32,
          vx: (Math.random() - 0.5) * 0.4,
          vy: 0.45 + Math.random() * 0.75,
          vz: (Math.random() - 0.5) * 0.4,
          max: 1.4 + Math.random() * 1.9
        });
      }
      this.material.size = 2.4;
      this.material.opacity = 0.26;
    } else if (st.powered && !st.buoyant) {
      var rate = onPad ? 260 : 110;             // heavy pool on the pad
      this._emitAcc += rate * dt;
      var n = this._emitAcc | 0;
      this._emitAcc -= n;

      for (var e = 0; e < n; e++) {
        if (onPad) {
          // billowing ground cloud — bursts sideways and rolls outward
          var ang = Math.random() * Math.PI * 2;
          var kick = 1.6 + Math.random() * 4.4;
          this._spawn({
            x: ex + Math.cos(ang) * (0.15 + Math.random() * 0.5),
            y: GROUND + Math.random() * 0.35,
            z: Math.sin(ang) * (0.15 + Math.random() * 0.5),
            vx: Math.cos(ang) * kick,
            vy: 0.4 + Math.random() * 1.4,
            vz: Math.sin(ang) * kick,
            max: 1.8 + Math.random() * 2.2
          });
        } else {
          // tight exhaust column trailing straight down behind the climb
          this._spawn({
            x: ex + (Math.random() - 0.5) * 0.5,
            y: exhaustBase - Math.random() * 0.7,
            z: (Math.random() - 0.5) * 0.5,
            vx: (Math.random() - 0.5) * 1.4,
            vy: -3.0 - Math.random() * 4.0 - Math.abs(st.v || 0) * 0.05,
            vz: (Math.random() - 0.5) * 1.4,
            max: 0.6 + Math.random() * 0.8
          });
        }
      }
      // fatter, denser smoke while it is stuck fighting its own weight
      this.material.size = onPad ? 3.6 : 1.9;
      this.material.opacity = onPad ? 0.62 : 0.4;
    }

    // ---- integrate + write buffer -------------------------------------
    var pos = this._pos;
    for (var i = 0; i < this.max; i++) {
      var p = this._p[i];
      if (p.life <= 0) { pos[i * 3 + 1] = -99999; continue; }
      p.life -= dt;
      p.vy += 2.4 * dt;                          // hot smoke lifts as it ages
      var damp = 1 - Math.min(1, 1.6 * dt);
      p.vx *= damp; p.vz *= damp;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < GROUND) { p.y = GROUND; p.vy *= -0.18; p.vx *= 0.7; p.vz *= 0.7; }
      pos[i * 3]     = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  };

  global.RS = global.RS || {};
  global.RS.render = global.RS.render || {};
  global.RS.render.ExhaustFX = ExhaustFX;

})(typeof window !== 'undefined' ? window : this);
