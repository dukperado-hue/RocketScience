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
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

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

    // ---- INTIMATE COMPANIONS — fully-realized khom loys that drift past ----
    //  the player mid-flight, close enough to give a sense of scale, community
    //  and fleeting encounter. Pooled; FlightScreen feeds update() the player
    //  position and listens on `onEncounter` for the poetry trigger.
    this._companions = [];
    this._compTimer = 0;
    this._compVec = null;
    this.onEncounter = null;

    // ---- THE RARE COMET — a reward for looking up -------------------------
    this._cometHead = null;
    this._cometTrail = null;
    this._cometHist = [];
    this._comet = null;
    this._cometTimer = 0;

    if (this.available) {
      this._m4 = new THREE.Matrix4();
      this._q  = new THREE.Quaternion();
      this._qi = new THREE.Quaternion();
      this._e  = new THREE.Euler();
      this._s  = new THREE.Vector3();
      this._p  = new THREE.Vector3();
      this._col = new THREE.Color();
      this._compVec = new THREE.Vector3();
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
    this._buildCompanions(g);
    this.scene.scene.add(g);

    this._buildSky(this.scene.scene);
    this._buildComet(this.scene.scene);
  };

  // --- THE RARE COMET — bright head + additive fading tail --------------
  FestivalEnv.prototype._buildComet = function (sc) {
    // WebGL lines are always 1 px, which vanishes against the lantern field —
    // so the tail is a dense string of additive POINTS whose size + colour
    // taper to the tail. Reads as a proper glowing streak.
    var N = 46;
    var tp = new Float32Array(N * 3);
    var tc = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      var f = i / (N - 1);                       // 0 = tail, 1 = head
      var e = f * f;                             // ease so the glow hugs the head
      // additive: near-black at the tail → bright blue-white at the head
      tc[i * 3] = e * 1.35; tc[i * 3 + 1] = e * 1.45 + 0.04; tc[i * 3 + 2] = e * 1.6 + 0.08;
    }
    var tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(tp, 3));
    tg.setAttribute('color', new THREE.BufferAttribute(tc, 3));
    var trail = new THREE.Points(tg, new THREE.PointsMaterial({
      vertexColors: true, size: 4, sizeAttenuation: false,
      transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false
    }));
    trail.frustumCulled = false; trail.renderOrder = -1;

    // the head: a crisp bright point plus a soft halo behind it
    var hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    var head = new THREE.Points(hg, new THREE.PointsMaterial({
      color: 0xf4f9ff, size: 10, sizeAttenuation: false,
      transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false
    }));
    head.frustumCulled = false; head.renderOrder = -1;
    var halo = new THREE.Points(hg, new THREE.PointsMaterial({
      color: 0x9fc6ff, size: 30, sizeAttenuation: false,
      transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false
    }));
    halo.frustumCulled = false; halo.renderOrder = -1;

    sc.add(trail); sc.add(halo); sc.add(head);
    this._cometTrail = trail;
    this._cometHead = head;
    this._cometHalo = halo;
    this._cometHist = [];
    for (var k = 0; k < N; k++) this._cometHist.push(new THREE.Vector3());
    this._comet = {
      active: false, age: 0, life: 0,
      pos: new THREE.Vector3(), vel: new THREE.Vector3()
    };
    this._cometTimer = rand(25, 60);             // first one within the first minute
  };

  // --- INTIMATE COMPANIONS — a small pool of hero khom loys ---------------
  FestivalEnv.prototype._buildCompanions = function (parent) {
    var POOL = 3;
    // shared geometry — cheap; materials are per-instance so each can tint +
    // fade on its own
    var envGeo = new THREE.CylinderGeometry(0.55, 0.72, 1.7, 8, 1, true);
    var lidGeo = new THREE.CircleGeometry(0.55, 8);
    var rimGeo = new THREE.TorusGeometry(0.72, 0.045, 5, 8);
    var flameGeo = new THREE.ConeGeometry(0.13, 0.44, 6);

    for (var i = 0; i < POOL; i++) {
      var grp = new THREE.Group();
      grp.visible = false;

      var hue = 0.055 + Math.random() * 0.03;
      var envMat = new THREE.MeshStandardMaterial({
        color: 0xffe1bd, roughness: 0.72, metalness: 0,
        emissive: new THREE.Color().setHSL(hue, 0.9, 0.42),
        emissiveIntensity: 0.9,
        transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: true
      });
      var env = new THREE.Mesh(envGeo, envMat);
      grp.add(env);

      var lid = new THREE.Mesh(lidGeo, new THREE.MeshStandardMaterial({
        color: 0x2a1a0c, roughness: 1, transparent: true, opacity: 0,
        side: THREE.DoubleSide
      }));
      lid.rotation.x = -Math.PI / 2;
      lid.position.y = 0.85;
      grp.add(lid);

      var rim = new THREE.Mesh(rimGeo, new THREE.MeshStandardMaterial({
        color: 0x6b4a2a, roughness: 1, transparent: true, opacity: 0
      }));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = -0.85;
      grp.add(rim);

      var flame = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({
        color: 0xffce8a, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending, fog: false
      }));
      flame.position.y = -0.5;
      grp.add(flame);

      var light = new THREE.PointLight(0xff8a3a, 0, 7.5, 2);
      light.position.y = -0.2;
      grp.add(light);

      parent.add(grp);
      this._companions.push({
        group: grp, env: env, lid: lid, rim: rim, flame: flame, light: light,
        active: false, age: 0, ttl: 0,
        pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        ph: Math.random() * 6.283, lightBase: 2.0 + Math.random() * 0.9,
        prevDist: 1e9, encountered: false
      });
    }
  };

  /** Deactivate every companion + arm the first spawn. Call on each flight open. */
  FestivalEnv.prototype.resetCompanions = function () {
    for (var i = 0; i < this._companions.length; i++) {
      var c = this._companions[i];
      c.active = false; c.encountered = false; c.prevDist = 1e9;
      c.group.visible = false; c.light.intensity = 0;
    }
    this._compTimer = rand(5, 9);   // first encounter comes fairly soon
    if (this._comet) {
      this._comet.active = false;
      if (this._cometHead) {
        this._cometHead.visible = false; this._cometTrail.visible = false;
        if (this._cometHalo) this._cometHalo.visible = false;
      }
      this._cometTimer = rand(20, 55);   // a shooting star sometime in the first minute
    }
  };

  FestivalEnv.prototype._spawnCompanion = function (px, py, pz) {
    for (var i = 0; i < this._companions.length; i++) {
      var c = this._companions[i];
      if (c.active) continue;
      var side = Math.random() < 0.5 ? -1 : 1;
      c.pos.set(
        px + side * rand(10, 20),        // enters from one side
        py + rand(-11, 15),              // near the player's altitude, a touch above
        (pz || 0) + rand(4, 16)          // in the foreground, toward the camera
      );
      c.vel.set(
        -side * rand(0.75, 1.7),         // drifts across the view and out the far side
        rand(0.22, 0.68),                // gentle, contemplative rise
        rand(-0.3, 0.18)
      );
      var sc = rand(0.8, 1.25);
      c.group.scale.setScalar(sc);
      c.age = 0; c.ttl = rand(20, 28);
      c.encountered = false; c.prevDist = 1e9;
      c.active = true; c.group.visible = true;
      return c;
    }
    return null;
  };

  FestivalEnv.prototype._animCompanions = function (dt, player) {
    if (!this._companions.length) return;
    var hasPlayer = player && typeof player.y === 'number';

    if (hasPlayer && player.y > 8) {
      this._compTimer -= dt;
      if (this._compTimer <= 0) {
        this._compTimer = rand(15, 20);
        var many = Math.random() < 0.45 ? 2 : 1;
        for (var s = 0; s < many; s++) this._spawnCompanion(player.x || 0, player.y, player.z || 0);
      }
    }

    var pv = this._compVec;
    if (hasPlayer) pv.set(player.x || 0, player.y, player.z || 0);
    var w = this._t;

    for (var i = 0; i < this._companions.length; i++) {
      var c = this._companions[i];
      if (!c.active) continue;
      c.age += dt;
      c.pos.addScaledVector(c.vel, dt);

      var swx = Math.sin(w * 0.7 + c.ph) * 0.32;
      var swz = Math.cos(w * 0.58 + c.ph) * 0.32;
      c.group.position.set(c.pos.x + swx, c.pos.y, c.pos.z + swz);
      c.group.rotation.z = Math.sin(w * 0.7 + c.ph) * 0.09;
      c.group.rotation.y += dt * 0.16;

      // slow fade in, long linger, slow fade out — nothing pops
      var fin = clamp(c.age / 3.5, 0, 1);
      var fout = clamp((c.ttl - c.age) / 4.5, 0, 1);
      var a = Math.min(fin, fout);
      c.env.material.opacity = 0.94 * a;
      c.lid.material.opacity = 0.9 * a;
      c.rim.material.opacity = 0.9 * a;
      c.flame.material.opacity = 0.85 * a * (0.7 + 0.3 * Math.sin(w * 9 + c.ph));
      c.flame.scale.y = 0.8 + 0.3 * (0.5 + 0.5 * Math.sin(w * 11 + c.ph));
      c.light.intensity = c.lightBase * a * (0.75 + 0.25 * Math.sin(w * 8 + c.ph * 1.7));

      // ENCOUNTER — fire once, at the moment it has passed closest approach
      if (hasPlayer && !c.encountered) {
        var d = c.pos.distanceTo(pv);
        if (d > c.prevDist && c.prevDist < 24) {
          c.encountered = true;
          if (typeof this.onEncounter === 'function') {
            try { this.onEncounter(c); } catch (e) {}
          }
        }
        c.prevDist = d;
      }

      if (c.age >= c.ttl) {
        c.active = false; c.group.visible = false; c.light.intensity = 0;
      }
    }
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
    if (this._cometHead && !on) {
      this._cometHead.visible = false; this._cometTrail.visible = false;
      if (this._cometHalo) this._cometHalo.visible = false;
    }
    if (!on) {
      for (var i = 0; i < this._candles.length; i++) this._candles[i].light.intensity = 0;
      for (var j = 0; j < this._companions.length; j++) {
        var c = this._companions[j];
        c.active = false; c.group.visible = false; c.light.intensity = 0;
      }
      if (this._comet) this._comet.active = false;
    }
  };

  // ---------------------------------------------------------------------------
  //  ANIMATE  — call every rendered frame while visible
  // ---------------------------------------------------------------------------
  FestivalEnv.prototype.update = function (dt, player) {
    if (!this.available || !this.group || !this.group.visible) return;
    dt = Math.min(Math.max(dt || 0.016, 0), 0.05);
    this._t += dt;
    this._frame++;

    this._animGrass();
    this._animFireflies();
    this._animLamps();
    this._animSky(dt);
    this._animCompanions(dt, player);
    this._animComet(dt);
  };

  FestivalEnv.prototype._animComet = function (dt) {
    var c = this._comet;
    if (!c || !this._cometHead) return;

    if (!c.active) {
      this._cometTimer -= dt;
      if (this._cometTimer > 0) return;
      this._cometTimer = rand(60, 120);          // once every 1–2 min of flight
      // start high on the sky dome, well beyond the drifting lanterns
      var ang = rand(0, Math.PI * 2);
      var R = rand(2900, 3800);
      c.pos.set(Math.cos(ang) * R, rand(560, 1050), Math.sin(ang) * R);
      // streak roughly tangential (across the sky) + a little inward + downward
      var inward = this._p.set(-c.pos.x, 0, -c.pos.z).normalize();
      var tang = this._s.set(-inward.z, 0, inward.x);
      var dir = c.vel.set(0, 0, 0)
        .addScaledVector(tang, rand(620, 940) * (Math.random() < 0.5 ? -1 : 1))
        .addScaledVector(inward, rand(120, 280));
      dir.y = rand(-170, -50);
      c.age = 0; c.life = rand(2.8, 4.4);
      c.active = true;
      for (var i = 0; i < this._cometHist.length; i++) this._cometHist[i].copy(c.pos);
      this._cometHead.visible = true;
      this._cometTrail.visible = true;
      if (this._cometHalo) this._cometHalo.visible = true;
      return;
    }

    c.age += dt;
    c.pos.addScaledVector(c.vel, dt);

    var H = this._cometHist;
    for (var j = 0; j < H.length - 1; j++) H[j].copy(H[j + 1]);
    H[H.length - 1].copy(c.pos);

    var tpos = this._cometTrail.geometry.attributes.position.array;
    for (var m = 0; m < H.length; m++) {
      tpos[m * 3] = H[m].x; tpos[m * 3 + 1] = H[m].y; tpos[m * 3 + 2] = H[m].z;
    }
    this._cometTrail.geometry.attributes.position.needsUpdate = true;

    var hpos = this._cometHead.geometry.attributes.position.array;
    hpos[0] = c.pos.x; hpos[1] = c.pos.y; hpos[2] = c.pos.z;
    this._cometHead.geometry.attributes.position.needsUpdate = true;

    // fade in fast, burn, fade out
    var a = Math.min(1, c.age / 0.3) * clamp((c.life - c.age) / 0.9, 0, 1);
    var twinkle = 0.85 + 0.15 * Math.sin(c.age * 34);
    this._cometHead.material.opacity = a * twinkle;
    this._cometTrail.material.opacity = a;
    if (this._cometHalo) this._cometHalo.material.opacity = a * 0.4 * twinkle;

    if (c.age >= c.life) {
      c.active = false;
      this._cometHead.visible = false;
      this._cometTrail.visible = false;
      if (this._cometHalo) this._cometHalo.visible = false;
    }
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
