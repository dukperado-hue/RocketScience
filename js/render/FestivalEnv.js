/* =============================================================================
 * FROM FIRE TO ORBIT — Render layer
 * js/render/FestivalEnv.js  ·  Phase 7.7 · "The Lantern Festival"
 *
 * A stylized, poetic night environment for the Era-0 (khom loy) flight scene:
 *
 *   · WAYFINDER GROUND  — InstancedMesh grass tufts that sway, scattered fallen
 *     leaves, a few low-poly rocks and one solitary artistic tree, plus drifting
 *     firefly particles, so a downward glance lands on something lush, not a
 *     barren plane.
 *   · WAT PHAN TAO LIGHT — warm, low oil-lamp PointLights scattered on the
 *     ground; the ground + foliage (Lambert) react to them, a tranquil temple
 *     glow.
 *   · RAPUNZEL SKY       — hundreds of InstancedMesh glowing lanterns high in the
 *     background that drift up, wobble and shimmer. ZERO physics — pure
 *     atmosphere.
 *
 * Built once, kept alive, toggled by FlightScreen.setVisible() (night only).
 * update(dt) animates everything; call it every rendered frame while visible.
 * Degrades to a no-op without THREE.
 * ===========================================================================*/
(function (global) {
  'use strict';

  var THREE = global.THREE;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function FestivalEnv(scene) {
    this.available = !!THREE && !!scene && !!scene.scene;
    this.scene = scene;                 // an RS.render.Scene
    this.group = null;                  // ground content + oil-lamp lights (vis-toggled)
    this.sky = null;                    // InstancedMesh — sky lanterns
    this.skyGlow = null;                // InstancedMesh — additive haloes
    this._t = 0;
    this._frame = 0;

    this._blades = null;  this._bladeData = [];
    this._flies = null;   this._flyData = [];
    this._candles = [];
    this._skyData = [];

    if (this.available) {
      this._m4 = new THREE.Matrix4();
      this._q  = new THREE.Quaternion();
      this._qi = new THREE.Quaternion();
      this._e  = new THREE.Euler();
      this._s  = new THREE.Vector3();
      this._p  = new THREE.Vector3();
      this._col = new THREE.Color();
    }
  }

  // ---------------------------------------------------------------------------
  //  BUILD
  // ---------------------------------------------------------------------------
  FestivalEnv.prototype.build = function () {
    if (!this.available || this.group) return;
    var g = new THREE.Group();
    g.visible = false;
    this.group = g;

    this._buildGrass(g);
    this._buildLeaves(g);
    this._buildRocks(g);
    this._buildTree(g);
    this._buildFireflies(g);
    this._buildLamps(g);
    this.scene.scene.add(g);

    this._buildSky(this.scene.scene);
  };

  // --- stylized grass — one InstancedMesh, blades that sway in the wind -----
  FestivalEnv.prototype._buildGrass = function (parent) {
    var N = 760;
    var blade = new THREE.PlaneGeometry(0.09, 0.5, 1, 2);
    var pos = blade.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      if (pos.getY(i) > 0.15) pos.setX(i, pos.getX(i) * 0.22);   // taper to a point
    }
    blade.translate(0, 0.25, 0);                                  // root at y=0
    var mat = new THREE.MeshLambertMaterial({
      color: 0x1d3c2d, side: THREE.DoubleSide
    });
    var mesh = new THREE.InstancedMesh(blade, mat, N);
    mesh.castShadow = false; mesh.receiveShadow = false;

    var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(),
        e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (var k = 0; k < N; k++) {
      var ang = Math.random() * Math.PI * 2;
      var radr = Math.sqrt(Math.random()) * 44 + 1.4;            // area-uniform, 1.4–45 m
      if (radr < 2.4) radr = 2.4 + Math.random() * 2.5;          // clear ring round the pad
      p.set(Math.cos(ang) * radr, 0, Math.sin(ang) * radr);
      var yaw = Math.random() * Math.PI * 2;
      var lean = rand(-0.22, 0.22);
      var sc = rand(0.55, 1.55);
      e.set(0, yaw, lean); q.setFromEuler(e); s.set(1, sc, 1);
      m4.compose(p, q, s); mesh.setMatrixAt(k, m4);
      this._bladeData.push({
        p: p.clone(), yaw: yaw, lean: lean, s: sc,
        ph: Math.random() * 6.283, amp: rand(0.03, 0.11)
      });
    }
    mesh.instanceMatrix.needsUpdate = true;
    this._blades = mesh;
    parent.add(mesh);
  };

  // --- fallen leaves — flat quads on the ground, warm autumn tones ---------
  FestivalEnv.prototype._buildLeaves = function (parent) {
    var N = 150;
    var mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.32, 0.19),
      new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
      N);
    var cols = [0x8a4a25, 0xb5702f, 0x6d3b1f, 0xc98a3c, 0x7a5230, 0x9c4f22];
    var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(),
        e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(),
        col = new THREE.Color();
    for (var k = 0; k < N; k++) {
      var ang = Math.random() * Math.PI * 2;
      var radr = Math.sqrt(Math.random()) * 32 + 1.5;
      p.set(Math.cos(ang) * radr, 0.015 + Math.random() * 0.02, Math.sin(ang) * radr);
      e.set(-Math.PI / 2 + rand(-0.35, 0.35), Math.random() * Math.PI * 2, rand(-0.3, 0.3));
      q.setFromEuler(e);
      var sc = rand(0.7, 1.5);
      s.set(sc, sc, sc);
      m4.compose(p, q, s); mesh.setMatrixAt(k, m4);
      col.setHex(cols[(Math.random() * cols.length) | 0]);
      mesh.setColorAt(k, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    parent.add(mesh);
  };

  // --- a few low-poly rocks to anchor the scene --------------------------
  FestivalEnv.prototype._buildRocks = function (parent) {
    var geo = new THREE.IcosahedronGeometry(1, 0);
    var mat = new THREE.MeshLambertMaterial({ color: 0x2b303c, flatShading: true });
    var specs = [
      [5.2, -6, 1.15], [8.6, 4.4, 0.7], [-6.4, 7.2, 0.95],
      [-9.5, -4.1, 1.5], [3.1, 9.4, 0.55], [11.5, -2, 0.85]
    ];
    for (var i = 0; i < specs.length; i++) {
      var r = specs[i][2];
      var m = new THREE.Mesh(geo, mat);
      m.scale.set(r * rand(0.9, 1.4), r * rand(0.55, 0.9), r * rand(0.9, 1.4));
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      m.position.set(specs[i][0], r * 0.28, specs[i][1]);
      parent.add(m);
    }
  };

  // --- one solitary, artistic tree — a silhouette against the sky --------
  FestivalEnv.prototype._buildTree = function (parent) {
    var t = new THREE.Group();
    var trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.32, 4.6, 6),
      new THREE.MeshLambertMaterial({ color: 0x2a1d13, flatShading: true }));
    trunk.position.y = 2.3;
    trunk.rotation.z = 0.05;
    t.add(trunk);
    var canopyMat = new THREE.MeshLambertMaterial({ color: 0x16241b, flatShading: true });
    var blobs = [[0, 4.7, 0, 1.75], [1.0, 4.15, 0.4, 1.15],
                 [-0.8, 4.4, -0.5, 1.3], [0.25, 5.55, 0.15, 0.95]];
    for (var i = 0; i < blobs.length; i++) {
      var b = new THREE.Mesh(new THREE.IcosahedronGeometry(blobs[i][3], 0), canopyMat);
      b.position.set(blobs[i][0], blobs[i][1], blobs[i][2]);
      b.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      t.add(b);
    }
    t.position.set(-13.5, 0, -9);
    parent.add(t);
  };

  // --- firefly / drifting-pollen particles near the ground --------------
  FestivalEnv.prototype._buildFireflies = function (parent) {
    var N = 95;
    var geo = new THREE.BufferGeometry();
    var arr = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      var ang = Math.random() * Math.PI * 2;
      var radr = Math.sqrt(Math.random()) * 26 + 1.5;
      var home = new THREE.Vector3(
        Math.cos(ang) * radr, rand(0.4, 3.8), Math.sin(ang) * radr);
      arr[i * 3] = home.x; arr[i * 3 + 1] = home.y; arr[i * 3 + 2] = home.z;
      this._flyData.push({
        home: home, ph: Math.random() * 6.283,
        spd: rand(0.18, 0.5), r: rand(0.4, 1.6)
      });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    var mat = new THREE.PointsMaterial({
      color: 0xffe39a, size: 0.14, sizeAttenuation: true,
      transparent: true, opacity: 0.85, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false
    });
    this._flies = new THREE.Points(geo, mat);
    this._flies.frustumCulled = false;
    parent.add(this._flies);
  };

  // --- Wat Phan Tao oil lamps — warm ground PointLights + visible flames --
  FestivalEnv.prototype._buildLamps = function (parent) {
    // a dim warm ambient so the whole grove reads at night, temple-serene
    // (one cheap hemisphere light does most of the work; the lamps are accents)
    var fill = new THREE.HemisphereLight(0x6b4a2a, 0x0c0e14, 0.78);
    parent.add(fill);

    var bowlMat = new THREE.MeshLambertMaterial({ color: 0x241708, flatShading: true });
    var specs = [
      [3.6, -3.2, 1], [-4.4, 2.4, 1], [6.8, 5.2, 1.1],
      [-6.6, -5.6, 1.05], [1.2, 8.4, 1.1], [10.4, -1.2, 1.15]
    ];
    for (var i = 0; i < specs.length; i++) {
      var cg = new THREE.Group();
      var bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.1, 0.15, 7), bowlMat);
      bowl.position.y = 0.075;
      var flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.055, 0.22, 6),
        new THREE.MeshBasicMaterial({
          color: 0xffdca0, transparent: true, opacity: 0.95,
          depthWrite: false, blending: THREE.AdditiveBlending, fog: false
        }));
      flame.position.y = 0.24;
      var light = new THREE.PointLight(0xffab55, 0.0, 26 * specs[i][2], 2);
      light.position.y = 0.26;
      cg.add(bowl); cg.add(flame); cg.add(light);
      cg.position.set(specs[i][0], 0, specs[i][1]);
      parent.add(cg);
      this._candles.push({
        light: light, flame: flame, base: rand(1.3, 2.0), ph: Math.random() * 6.283
      });
    }
  };

  // --- RAPUNZEL SKY — the illusion of thousands of lanterns aloft --------
  FestivalEnv.prototype._buildSky = function (sc) {
    var N = 540;
    var lantern = new THREE.CylinderGeometry(0.55, 0.42, 1.15, 6, 1, true);
    // one shared vertical gradient — bright hot at the mouth, dark at the crown —
    // so every instance reads as a LIT lantern, not a flat orange tile
    var gc = document.createElement('canvas');
    gc.width = 4; gc.height = 64;
    var gx = gc.getContext('2d');
    var gr = gx.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0.00, '#3a1c08');   // crown
    gr.addColorStop(0.55, '#ff7a1e');
    gr.addColorStop(1.00, '#ffe0a0');   // mouth — hot
    gx.fillStyle = gr; gx.fillRect(0, 0, 4, 64);
    var lanternTex = new THREE.CanvasTexture(gc);
    var mesh = new THREE.InstancedMesh(lantern, new THREE.MeshBasicMaterial({
      color: 0xffffff, map: lanternTex,
      transparent: true, opacity: 0.95, depthWrite: false, fog: false
    }), N);
    mesh.frustumCulled = false;
    mesh.renderOrder = -2;

    var glow = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 6, 4),
      new THREE.MeshBasicMaterial({
        color: 0xff7526, transparent: true, opacity: 0.06, depthWrite: false,
        blending: THREE.AdditiveBlending, fog: false
      }), N);
    glow.frustumCulled = false;
    glow.renderOrder = -3;

    var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(),
        e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(),
        col = new THREE.Color();
    for (var k = 0; k < N; k++) {
      var ang = Math.random() * Math.PI * 2;
      // far background: no lantern closer than ~160 m, spread to ~2.4 km, and
      // higher up — so they read as a distant drift, not a swarm in your face
      var radr = 240 + Math.pow(Math.random(), 0.7) * 2400;
      var scl = rand(1.15, 2.1) * (1 + radr / 520);              // farther → bigger, still small on screen
      var y = rand(130, 780);
      var hue = 0.045 + Math.random() * 0.03;
      var baseL = rand(0.5, 0.74);
      p.set(Math.cos(ang) * radr, y, Math.sin(ang) * radr);
      e.set(rand(-0.13, 0.13), Math.random() * 6.283, rand(-0.13, 0.13));
      q.setFromEuler(e);
      s.set(scl, scl * rand(1.35, 1.9), scl);
      m4.compose(p, q, s); mesh.setMatrixAt(k, m4);
      col.setHSL(hue, 0.95, baseL); mesh.setColorAt(k, col);
      s.set(scl * 2.3, scl * 2.3, scl * 2.3);
      m4.compose(p, this._qi, s); glow.setMatrixAt(k, m4);
      this._skyData.push({
        ang: ang, rad: radr, y: y, scl: scl, hue: hue, baseL: baseL,
        rise: rand(0.6, 2.2), wob: rand(0.2, 0.7), wph: Math.random() * 6.283,
        lph: Math.random() * 6.283
      });
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    glow.instanceMatrix.needsUpdate = true;

    this.sky = mesh; this.skyGlow = glow;
    sc.add(glow); sc.add(mesh);
  };

  // ---------------------------------------------------------------------------
  //  VISIBILITY  (night only)
  // ---------------------------------------------------------------------------
  FestivalEnv.prototype.setVisible = function (on) {
    if (!this.group) return;
    on = !!on;
    this.group.visible = on;
    if (this.sky) this.sky.visible = on;
    if (this.skyGlow) this.skyGlow.visible = on;
    if (!on) {
      for (var i = 0; i < this._candles.length; i++) this._candles[i].light.intensity = 0;
    }
  };

  // ---------------------------------------------------------------------------
  //  ANIMATE  — call every rendered frame while visible
  // ---------------------------------------------------------------------------
  FestivalEnv.prototype.update = function (dt) {
    if (!this.available || !this.group || !this.group.visible) return;
    dt = Math.min(Math.max(dt || 0.016, 0), 0.05);
    this._t += dt;
    this._frame++;

    this._animGrass();
    this._animFireflies();
    this._animLamps();
    this._animSky(dt);
  };

  FestivalEnv.prototype._animGrass = function () {
    var mesh = this._blades; if (!mesh) return;
    var w = this._t, m4 = this._m4, q = this._q, e = this._e, s = this._s;
    for (var i = 0; i < this._bladeData.length; i++) {
      var b = this._bladeData[i];
      var sway = Math.sin(w * 1.3 + b.ph) * b.amp + Math.sin(w * 0.57 + b.ph * 1.7) * b.amp * 0.5;
      e.set(0, b.yaw, b.lean + sway); q.setFromEuler(e); s.set(1, b.s, 1);
      m4.compose(b.p, q, s); mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };

  FestivalEnv.prototype._animFireflies = function () {
    var f = this._flies; if (!f) return;
    var arr = f.geometry.attributes.position.array, w = this._t;
    for (var i = 0; i < this._flyData.length; i++) {
      var d = this._flyData[i], k = i * 3;
      arr[k]     = d.home.x + Math.sin(w * d.spd + d.ph) * d.r;
      arr[k + 1] = d.home.y + Math.sin(w * d.spd * 0.7 + d.ph * 2.0) * d.r * 0.55;
      arr[k + 2] = d.home.z + Math.cos(w * d.spd * 0.83 + d.ph) * d.r;
    }
    f.geometry.attributes.position.needsUpdate = true;
    f.material.opacity = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(w * 1.9));
  };

  FestivalEnv.prototype._animLamps = function () {
    var w = this._t;
    for (var i = 0; i < this._candles.length; i++) {
      var c = this._candles[i];
      var k = 0.78 + 0.18 * Math.sin(w * 7 + c.ph) + Math.random() * 0.16;
      c.light.intensity = Math.max(0.1, c.base * k);
      c.flame.scale.set(1, 0.82 + Math.random() * 0.32, 1);
    }
  };

  FestivalEnv.prototype._animSky = function (dt) {
    var mesh = this.sky, glow = this.skyGlow; if (!mesh) return;
    var w = this._t, m4 = this._m4, q = this._q, e = this._e, s = this._s,
        p = this._p, col = this._col, D = this._skyData;
    for (var i = 0; i < D.length; i++) {
      var d = D[i];
      d.y += d.rise * dt;
      if (d.y > 820) { d.y = rand(120, 170); d.ang += rand(-0.25, 0.25); }
      var wob = Math.sin(w * d.wob + d.wph);
      p.set(
        Math.cos(d.ang) * d.rad + wob * 3.0,
        d.y,
        Math.sin(d.ang) * d.rad + Math.cos(w * d.wob * 0.8 + d.wph) * 3.0
      );
      e.set(wob * 0.06, d.wph + w * 0.05, wob * 0.05);
      q.setFromEuler(e);
      s.set(d.scl, d.scl * 1.6, d.scl);
      m4.compose(p, q, s); mesh.setMatrixAt(i, m4);
      s.set(d.scl * 1.8, d.scl * 1.8, d.scl * 1.8);
      m4.compose(p, this._qi, s); glow.setMatrixAt(i, m4);
      // shimmer the emissive orange on a rolling subset (cheap)
      if ((i + this._frame) % 9 === 0) {
        col.setHSL(d.hue, 0.95,
          d.baseL + Math.sin(w * 3 + d.lph) * 0.09 + Math.random() * 0.04);
        mesh.setColorAt(i, col);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    glow.instanceMatrix.needsUpdate = true;
  };

  global.RS = global.RS || {};
  global.RS.render = global.RS.render || {};
  global.RS.render.FestivalEnv = FestivalEnv;

})(typeof window !== 'undefined' ? window : this);
