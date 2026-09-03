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
    this.max = opts.max || 720;          // headroom for a dirty หมื่อ plume + a 5 s pad build
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
      new THREE.CylinderGeometry(0.1, 0.34, 1, 14, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xff9a3c, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false
      }));
    this.jet.frustumCulled = false;
    this.jet.renderOrder = 3;
    this.jet.visible = false;
    this.jetLight = new THREE.PointLight(0xffcf6a, 0, 26, 2);
    this.group.add(this.jet);
    this.group.add(this.jetLight);

    // ---- NATURAL FIRE — a chaotic additive-particle flame at the nozzle.
    //  Bright white-yellow core, orange edges. Short-lived, jittery, fluid —
    //  no rigid cone. Separate small pool so it can't be starved by the smoke.
    this.fireMax = 220;
    this._firePos = new Float32Array(this.fireMax * 3);
    this._fireCol = new Float32Array(this.fireMax * 3);
    for (var fi = 0; fi < this.fireMax; fi++) this._firePos[fi * 3 + 1] = -99999;
    var fgeo = new THREE.BufferGeometry();
    fgeo.setAttribute('position', new THREE.BufferAttribute(this._firePos, 3));
    fgeo.setAttribute('color', new THREE.BufferAttribute(this._fireCol, 3));
    this.fire = new THREE.Points(fgeo, new THREE.PointsMaterial({
      size: 2.6, vertexColors: true, sizeAttenuation: true, map: puff,
      transparent: true, opacity: 0.72, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false, fog: false
    }));
    this.fire.frustumCulled = false;
    this.fire.renderOrder = 4;
    this.group.add(this.fire);
    this._fp = [];
    for (var fk = 0; fk < this.fireMax; fk++) {
      this._fp.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, hot: 1 });
    }
    this._fireCursor = 0;
    this._fireAcc = 0;

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
    if (this.jet) { this.jet.visible = false; this.jet.material.opacity = 0; this.jet.rotation.set(0, 0, 0); }
    if (this.jetLight) this.jetLight.intensity = 0;
    this.points.geometry.attributes.position.needsUpdate = true;
    if (this.fire) {
      for (var f = 0; f < this.fireMax; f++) { this._fp[f].life = 0; this._firePos[f * 3 + 1] = -99999; }
      this._fireAcc = 0;
      this.fire.geometry.attributes.position.needsUpdate = true;
    }
  };

  ExhaustFX.prototype._spawn = function (o) {
    var p = this._p[this._cursor];
    this._cursor = (this._cursor + 1) % this.max;
    p.life = o.max; p.max = o.max;
    p.x = o.x; p.y = o.y; p.z = o.z;
    p.vx = o.vx; p.vy = o.vy; p.vz = o.vz;
  };

  ExhaustFX.prototype._fspawn = function (o) {
    var p = this._fp[this._fireCursor];
    this._fireCursor = (this._fireCursor + 1) % this.fireMax;
    p.life = o.max; p.max = o.max;
    p.x = o.x; p.y = o.y; p.z = o.z;
    p.vx = o.vx; p.vy = o.vy; p.vz = o.vz;
  };

  /** integrate + colour the natural-fire particles (white-hot core → orange). */
  ExhaustFX.prototype._integrateFire = function (dt) {
    var pos = this._firePos, col = this._fireCol;
    for (var i = 0; i < this.fireMax; i++) {
      var p = this._fp[i];
      if (p.life <= 0) { pos[i * 3 + 1] = -99999; continue; }
      p.life -= dt;
      var age = 1 - p.life / p.max;               // 0 fresh → 1 spent
      // slows fast + gets buffeted (turbulent), then rises a touch as it cools
      var damp = 1 - Math.min(1, 6 * dt);
      p.vx = p.vx * damp + (Math.random() - 0.5) * 22 * dt;
      p.vy = p.vy * damp + (Math.random() - 0.5) * 22 * dt + 4 * dt;
      p.vz = p.vz * damp + (Math.random() - 0.5) * 22 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      // white-yellow core → orange → dim red as it ages (additive, so this is
      // also the brightness). The tail end goes to near-black (invisible).
      var k = i * 3;
      if (age < 0.3) { col[k] = 1.15; col[k + 1] = 0.92; col[k + 2] = 0.42; }      // white-yellow core
      else if (age < 0.65) { col[k] = 0.95; col[k + 1] = 0.4; col[k + 2] = 0.08; } // orange
      else { var t = (1 - age) / 0.35; col[k] = 0.55 * t; col[k + 1] = 0.12 * t; col[k + 2] = 0.02 * t; } // dim red
    }
    this.fire.geometry.attributes.position.needsUpdate = true;
    this.fire.geometry.attributes.color.needsUpdate = true;
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
   * @param {boolean} st.crashed     flown + back on the ground — kill ALL emission
   * @param {number} st.exhaustY     motor exhaust offset below the vehicle origin
   * @param {number} [st.nozzleX/Y/Z] WORLD position of the nozzle throat (rotated
   *                                  with the vehicle) — overrides st.x + exhaustY
   * @param {{x:number,y:number}} [st.exhaustDir] unit vector OUT of the nozzle
   *                                  (world); default straight down
   */
  ExhaustFX.prototype.update = function (dt, st) {
    if (!this.available || !st) return;
    dt = Math.min(dt || 0, 0.05);

    var GROUND = 0.06;
    // emit from the ACTUAL nozzle centre (world, rotated with the vehicle) —
    // never from the bounding-box axis / the side of the tail stick
    var haveNoz = (typeof st.nozzleY === 'number');
    var nozX = haveNoz ? st.nozzleX : (st.x || 0);
    var nozY = haveNoz ? st.nozzleY : ((st.y || 0) + (st.exhaustY != null ? st.exhaustY : -0.3));
    var nozZ = haveNoz ? (st.nozzleZ || 0) : 0;
    var dir = st.exhaustDir || { x: 0, y: -1 };
    var dl = Math.hypot(dir.x, dir.y) || 1;
    var dx0 = dir.x / dl, dy0 = dir.y / dl;      // unit "out of the nozzle"
    var perpX = -dy0, perpY = dx0;               // perpendicular, for spread

    var ex = nozX;
    var onPad = !!st.padLocked || (st.y || 0) <= 0.03;
    var exhaustBase = nozY;

    // ---- CRASHED — a flown vehicle back on the ground: no fire in the dirt
    var dead = !!st.crashed;
    if (dead) {
      if (this.jet) { this.jet.visible = false; this.jet.material.opacity = 0; }
      if (this.jetLight) this.jetLight.intensity = 0;
    }

    // ---- the flame jet (dirty หมื่อ only) ---------------------------------
    var jetOn = !dead && !!(st.powered && st.bigPlume);
    if (this.jet) {
      this.jet.visible = jetOn;
      if (jetOn) {
        var jl = 1.7 + Math.random() * 1.2;
        this.jet.scale.set(0.6 + Math.random() * 0.22, jl, 0.6 + Math.random() * 0.22);
        this.jet.position.set(nozX + dx0 * jl * 0.5, nozY + dy0 * jl * 0.5, nozZ);
        // point the cone down the exhaust vector (cone's local +y is its tip)
        this.jet.rotation.z = Math.atan2(dy0, dx0) + Math.PI / 2;
        this.jet.material.opacity = 0.26 + Math.random() * 0.14;
        this.jetLight.position.set(nozX + dx0 * 0.4, nozY + dy0 * 0.4, nozZ);
        this.jetLight.intensity = 3.0 + Math.random() * 2.0;
      } else {
        this.jet.material.opacity = 0;
        this.jetLight.intensity = 0;
      }
    }

    // ---- NATURAL FIRE particles (dirty หมื่อ, powered, not crashed) --------
    if (this.fire) {
      var fireOn = !dead && !!(st.powered && st.bigPlume);
      if (fireOn) {
        this._fireAcc += 520 * dt;
        var fn = this._fireAcc | 0; this._fireAcc -= fn;
        for (var fpi = 0; fpi < fn; fpi++) {
          var spread = (Math.random() - 0.5) * 0.75;
          var back = Math.random() * 0.6;
          var fspd = 8 + Math.random() * 16;
          this._fspawn({
            x: nozX + perpX * spread + dx0 * back,
            y: nozY + perpY * spread + dy0 * back,
            z: nozZ + (Math.random() - 0.5) * 0.45,
            vx: dx0 * fspd + perpX * (Math.random() - 0.5) * 5 + (Math.random() - 0.5) * 2,
            vy: dy0 * fspd + perpY * (Math.random() - 0.5) * 5 + (Math.random() - 0.5) * 2,
            vz: (Math.random() - 0.5) * 4,
            max: 0.12 + Math.random() * 0.34
          });
        }
      }
      this._integrateFire(dt);
    }

    // ---- emit -----------------------------------------------------------
    // a 0..1 buildup factor the FlightScreen ignition gate ramps over its
    // ~5 s pressure hold — scales the emission so the ground cloud GROWS into a
    // dramatic wall of smoke instead of appearing all at once.
    var build = (typeof st.buildFactor === 'number')
      ? Math.max(0, Math.min(1, st.buildFactor)) : 1;
    var powered = !dead && !!st.powered;

    if (powered && st.bigPlume) {
      // a hand-rammed black-powder หมื่อ burns filthy — a dense, fast-expanding
      // white/grey cloud that dwarfs the rocket. On the rail (esp. during the
      // 5-second pressure build) it SLAMS into the ground and rolls outward in
      // a low, spreading carpet; climbing, it unspools into a fat billowing trail.
      var pr = onPad ? (260 + 460 * build) : 440;
      this._emitAcc += pr * dt;
      var pn = this._emitAcc | 0;
      this._emitAcc -= pn;
      for (var pi = 0; pi < pn; pi++) {
        var pa = Math.random() * Math.PI * 2;
        if (onPad) {
          // low, wide, fast — slams the ground and billows horizontally into a
          // spreading wall of smoke that grows over the pressure build
          var pk = 4 + Math.random() * (7 + 9 * build);
          this._spawn({
            x: ex + Math.cos(pa) * (0.15 + Math.random() * 0.6),
            y: GROUND + Math.random() * 0.5,
            z: Math.sin(pa) * (0.15 + Math.random() * 0.6),
            vx: Math.cos(pa) * pk,
            vy: 0.1 + Math.random() * (0.7 + 0.8 * build),   // barely rises — it spreads
            vz: Math.sin(pa) * pk,
            max: 3.8 + Math.random() * 5.0       // lingers, piling up
          });
        } else {
          // climbing: a fat billowing trail streaming OUT the nozzle vector —
          // spawned a little BELOW the throat so the bright flame reads clearly
          // at the nozzle and the smoke billows behind it
          var pk2 = 1.4 + Math.random() * 3.4;
          var col = 1.6 + Math.random() * 3.5 + Math.abs(st.v || 0) * 0.04;
          var along = 1.6 + Math.random() * 2.4;
          this._spawn({
            x: nozX + perpX * (Math.random() - 0.5) * 1.1 + dx0 * along,
            y: nozY + perpY * (Math.random() - 0.5) * 1.1 + dy0 * along,
            z: nozZ + (Math.random() - 0.5) * 1.0,
            vx: dx0 * col + perpX * Math.cos(pa) * pk2 * 0.5,
            vy: dy0 * col + perpY * Math.cos(pa) * pk2 * 0.5,
            vz: Math.sin(pa) * pk2,
            max: 2.6 + Math.random() * 3.0
          });
        }
      }
      this.material.size = onPad ? (5.5 + 3.5 * build) : 5.0;
      this.material.opacity = onPad ? (0.5 + 0.32 * build) : 0.44;
      this.material.color.setHex(0xe4e4ea);
    } else if (powered && st.wisp) {
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
    } else if (powered && !st.buoyant) {
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
      // low, ground-hugging smoke barely lifts (it rolls out as a carpet);
      // once it has drifted clear and thinned it starts to rise like hot smoke
      var lift = (p.y < 2.2) ? 0.55 : 2.4;
      p.vy += lift * dt;
      var damp = 1 - Math.min(1, 1.35 * dt);     // gentler damping = it rolls further
      p.vx *= damp; p.vz *= damp;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < GROUND) {
        // collide with the ground: kill the downward motion and convert it into
        // an outward horizontal surge — the billow spreads instead of bouncing
        p.y = GROUND;
        p.vy = Math.abs(p.vy) * 0.08 + 0.15;
        var hsp = Math.hypot(p.vx, p.vz);
        var surge = 1 + 0.7 * Math.min(1, hsp / 6);   // faster hit → wider spread
        p.vx *= surge; p.vz *= surge;
      }
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
