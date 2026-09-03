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
    this.max = opts.max || 520;          // headroom for a dirty หมื่อ plume
    this.available = !!THREE;
    if (!this.available) return;

    this.group = new THREE.Group();

    this._pos = new Float32Array(this.max * 3);
    for (var i = 0; i < this.max; i++) this._pos[i * 3 + 1] = -99999;

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this._pos, 3));

    // a soft radial-gradient sprite so each particle reads as a smoke PUFF,
    // not a hard square — turns the pooled Points into a billowing volume
    var sc = document.createElement('canvas');
    sc.width = sc.height = 64;
    var sx = sc.getContext('2d');
    var sg = sx.createRadialGradient(32, 32, 0, 32, 32, 32);
    sg.addColorStop(0, 'rgba(255,255,255,0.95)');
    sg.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    sx.fillStyle = sg; sx.beginPath(); sx.arc(32, 32, 32, 0, 7); sx.fill();
    var puff = new THREE.CanvasTexture(sc);

    this.material = new THREE.PointsMaterial({
      color: 0xcdcdd4, size: 2.4, sizeAttenuation: true, map: puff,
      transparent: true, opacity: 0.5, depthWrite: false
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    this.group.add(this.points);

    // ---- the flame JET — a bright additive flare driving through the smoke
    //  right at the nozzle base (used only for a "dirty" หมื่อ engine)
    this.jet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.42, 1, 14, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffc766, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false
      }));
    this.jet.frustumCulled = false;
    this.jet.renderOrder = 3;
    this.jet.visible = false;
    this.jetLight = new THREE.PointLight(0xffcf6a, 0, 26, 2);
    this.group.add(this.jet);
    this.group.add(this.jetLight);

    this._p = [];
    for (var k = 0; k < this.max; k++) {
      this._p.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
    }
    this._cursor = 0;
    this._emitAcc = 0;
  }

  ExhaustFX.prototype.object3d = function () { return this.group; };

  /** Wipe every live particle (call on open / restart). */
  ExhaustFX.prototype.reset = function () {
    if (!this.available) return;
    for (var i = 0; i < this.max; i++) {
      this._p[i].life = 0;
      this._pos[i * 3 + 1] = -99999;
    }
    this._emitAcc = 0;
    this.material.color.setHex(0xcdcdd4);
    this.material.size = 2.4;
    this.material.opacity = 0.5;
    if (this.jet) { this.jet.visible = false; this.jet.material.opacity = 0; }
    if (this.jetLight) this.jetLight.intensity = 0;
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
   * @param {boolean} st.bigPlume    a dirty solid หมื่อ — huge white cloud + a nozzle jet
   * @param {number} st.exhaustY     motor exhaust offset below the vehicle origin
   */
  ExhaustFX.prototype.update = function (dt, st) {
    if (!this.available || !st) return;
    dt = Math.min(dt || 0, 0.05);

    var GROUND = 0.06;
    var ex = st.x || 0;
    var onPad = !!st.padLocked || (st.y || 0) <= 0.03;
    var exhaustBase = (st.y || 0) + (st.exhaustY != null ? st.exhaustY : -0.3);

    // ---- the flame jet (dirty หมื่อ only) ---------------------------------
    var jetOn = !!(st.powered && st.bigPlume);
    if (this.jet) {
      this.jet.visible = jetOn;
      if (jetOn) {
        var jl = 2.0 + Math.random() * 1.4;
        this.jet.scale.set(1 + Math.random() * 0.3, jl, 1 + Math.random() * 0.3);
        this.jet.position.set(ex, exhaustBase - jl * 0.5 + 0.25, 0);
        this.jet.material.opacity = 0.5 + Math.random() * 0.22;
        this.jetLight.position.set(ex, exhaustBase - 0.4, 0);
        this.jetLight.intensity = 3.0 + Math.random() * 2.0;
      } else {
        this.jet.material.opacity = 0;
        this.jetLight.intensity = 0;
      }
    }

    // ---- emit -----------------------------------------------------------
    if (st.powered && st.bigPlume) {
      // a hand-rammed black-powder หมื่อ burns filthy — a dense, fast-expanding
      // white/grey cloud that dwarfs the rocket. On the rail it piles into a
      // wall of smoke; climbing, it unspools into a fat billowing trail.
      var pr = onPad ? 460 : 300;
      this._emitAcc += pr * dt;
      var pn = this._emitAcc | 0;
      this._emitAcc -= pn;
      for (var pi = 0; pi < pn; pi++) {
        var pa = Math.random() * Math.PI * 2;
        var pk = onPad ? (2.2 + Math.random() * 6.5) : (1.4 + Math.random() * 3.4);
        this._spawn({
          x: ex + Math.cos(pa) * (0.2 + Math.random() * 0.7),
          y: (onPad ? GROUND + Math.random() * 0.6 : exhaustBase - Math.random() * 1.4),
          z: Math.sin(pa) * (0.2 + Math.random() * 0.7),
          vx: Math.cos(pa) * pk,
          vy: onPad ? (0.5 + Math.random() * 2.0) : (-2.0 - Math.random() * 3.5 - Math.abs(st.v || 0) * 0.04),
          vz: Math.sin(pa) * pk,
          max: 2.6 + Math.random() * 3.0
        });
      }
      this.material.size = onPad ? 5.5 : 3.6;
      this.material.opacity = onPad ? 0.72 : 0.5;
      this.material.color.setHex(0xe6e6ea);
    } else if (st.powered && st.wisp) {
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
      this.material.color.setHex(0xcdcdd4);
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
