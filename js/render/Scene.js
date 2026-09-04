/* =============================================================================
 * FROM FIRE TO ORBIT — Render layer
 * js/render/Scene.js
 *
 * A thin, reusable Three.js stage: renderer + camera + lights + optional
 * ground, wrapped around one <canvas>. The 2D-preview and the (future) flight
 * screen both build on this.
 *
 * CONSUMES the render contract only. It never imports core/ modules except to
 * read plain constants. If window.THREE is missing it degrades to `available:
 * false` and every method is a safe no-op, so the app still runs.
 * ===========================================================================*/
(function (global) {
  'use strict';

  var THREE = global.THREE;

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Object} [opts]
   * @param {number} [opts.fov=45]
   * @param {number[]} [opts.background=0x0a1830]
   * @param {boolean} [opts.ground=true]
   */
  function Scene(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.available = !!THREE;
    this._loopFn = null;
    this._raf = 0;
    this._last = 0;

    if (!this.available) {
      console.warn('[render/Scene] THREE not loaded — 3D preview disabled');
      return;
    }

    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas, antialias: true, alpha: true,
      // a scaled planet is ~600 km across but the vehicle is ~1 m — only a
      // logarithmic depth buffer keeps both crisp in one view (orbital map)
      logarithmicDepthBuffer: !!opts.logDepth
    });
    this.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(opts.background != null ? opts.background : 0x0a1830, 1);

    // STUDIO mode (the Assembly / VAB view): a moody 3-point rig + a dark
    // backdrop so hardware reads like a product shot. Kept on this project's
    // LINEAR pipeline (no tone-mapping / no output re-encode) so the existing
    // VehicleRenderer materials — the emissive khom-loy paper especially —
    // look the same here as in flight, just better lit.
    this.studio = !!opts.studio;

    // opt-in soft shadows — lets a bamboo skeleton silhouette against its paper
    if (opts.shadows || this.studio) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    this.scene = new THREE.Scene();

    // opt-in distance haze — dissolves a hard horizon line so the ground melts
    // into the sky. FogExp2 so near geometry (the vehicle) stays crisp while
    // the far terrain / planet limb washes out. Callers re-tune via `this.fog`.
    if (opts.fog) {
      var fc = (opts.fog.color != null) ? opts.fog.color
        : (opts.background != null ? opts.background : 0x05080f);
      this.fog = new THREE.FogExp2(fc, opts.fog.density || 0.0018);
      this.scene.fog = this.fog;
    }

    this.camera = new THREE.PerspectiveCamera(opts.fov || 45, 1, 0.02, opts.far || 5000);
    this.camera.position.set(2.4, 1.8, 3.4);
    this.camera.lookAt(0, 0.6, 0);

    if (this.studio) {
      // ---- 3-POINT STUDIO RIG — a cutting-edge aerospace lab -------------
      //  KEY   : bright warm-white from upper front-left, the shaping light,
      //          casts the shadow.
      //  FILL  : soft cool wash from front-right, lifts the shadow side.
      //  RIM   : a punchy cyan backlight, separates the vehicle from the
      //          dark backdrop with a bright edge highlight.
      var amb = new THREE.HemisphereLight(0x8fa4c8, 0x0a0c14, 0.34);
      this.scene.add(amb);

      var key = new THREE.DirectionalLight(0xfff4e6, 1.55);
      key.position.set(4.5, 6.0, 5.0);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.near = 0.5;
      key.shadow.camera.far = 30;
      key.shadow.camera.left = key.shadow.camera.bottom = -5;
      key.shadow.camera.right = key.shadow.camera.top = 5;
      key.shadow.bias = -0.0005;
      key.shadow.radius = 4;
      this.scene.add(key);

      var fill = new THREE.DirectionalLight(0xbcd2ff, 0.55);
      fill.position.set(-6.0, 2.5, 3.5);
      this.scene.add(fill);

      var rimL = new THREE.DirectionalLight(0x6fd0ff, 1.15);
      rimL.position.set(-3.0, 3.5, -6.0);
      this.scene.add(rimL);

      var rimW = new THREE.DirectionalLight(0xffe0bc, 0.45);
      rimW.position.set(3.0, 1.2, -5.0);
      this.scene.add(rimW);

      this.lights = { hemi: amb, key: key, fill: fill, rim: rimL, rimWarm: rimW };
    } else {
      var hemi = new THREE.HemisphereLight(0xbfd4ff, 0x25324a, 0.95);
      this.scene.add(hemi);
      var dkey = new THREE.DirectionalLight(0xfff2dd, 1.05);
      dkey.position.set(3, 5, 2);
      if (opts.shadows) {
        dkey.castShadow = true;
        dkey.shadow.mapSize.set(2048, 2048);
        dkey.shadow.camera.near = 0.5;
        dkey.shadow.camera.far = 24;
        dkey.shadow.camera.left = dkey.shadow.camera.bottom = -4;
        dkey.shadow.camera.right = dkey.shadow.camera.top = 4;
        dkey.shadow.bias = -0.0006;
        dkey.shadow.radius = 3;
      }
      this.scene.add(dkey);
      var rim = new THREE.DirectionalLight(0x88aaff, 0.35);
      rim.position.set(-3, 2, -3);
      this.scene.add(rim);
      this.lights = { hemi: hemi, key: dkey, rim: rim };   // callers may re-tune (e.g. night)
    }

    if (opts.ground !== false && !this.studio) {
      var grid = new THREE.GridHelper(20, 20, 0x3a6ea5, 0x22354f);
      grid.material.transparent = true;
      grid.material.opacity = 0.4;
      this.scene.add(grid);
      this._grid = grid;
    }

    this.resize();
  }

  Scene.prototype.add = function (obj) { if (this.available && obj) this.scene.add(obj); };
  Scene.prototype.remove = function (obj) { if (this.available && obj) this.scene.remove(obj); };

  Scene.prototype.resize = function () {
    if (!this.available) return;
    var w = this.canvas.clientWidth || 300;
    var h = this.canvas.clientHeight || 200;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderOnce();
  };

  Scene.prototype.renderOnce = function () {
    if (this.available) this.renderer.render(this.scene, this.camera);
  };

  /** Start a rAF loop; `fn(dt)` runs before each render. */
  Scene.prototype.startLoop = function (fn) {
    if (!this.available) return;
    this._loopFn = fn || null;
    if (this._raf) return;
    var self = this;
    this._last = now();
    var tick = function () {
      self._raf = global.requestAnimationFrame(tick);
      var t = now(), dt = Math.min((t - self._last) / 1000, 0.1);
      self._last = t;
      if (self._loopFn) self._loopFn(dt);
      self.renderer.render(self.scene, self.camera);
    };
    this._raf = global.requestAnimationFrame(tick);
  };

  Scene.prototype.stopLoop = function () {
    if (this._raf) { global.cancelAnimationFrame(this._raf); this._raf = 0; }
    this._loopFn = null;
  };

  Scene.prototype.dispose = function () {
    if (!this.available) return;
    this.stopLoop();
    this.scene.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    });
    this.renderer.dispose();
  };

  function now() {
    return (global.performance && global.performance.now) ? global.performance.now() : Date.now();
  }

  // ---------------------------------------------------------------------------
  //  A traditional Bang Fai launch rig — ฐานปล่อยเฉียง. A rough wooden
  //  scaffold with a guide rail leaning at `angleDeg` from horizontal, so the
  //  rocket slides up it and arcs downrange instead of going straight up.
  //  Returns a THREE.Group anchored at the origin (rail foot at ~ground).
  // ---------------------------------------------------------------------------
  function makeLaunchRig(angleDeg) {
    if (!THREE) return null;
    var a = ((angleDeg || 80) * Math.PI) / 180;
    var tilt = Math.PI / 2 - a;                 // lean off vertical
    var g = new THREE.Group();
    var woodDark = new THREE.MeshStandardMaterial({ color: 0x4a3625, roughness: 0.95 });
    var woodMid = new THREE.MeshStandardMaterial({ color: 0x6b4f36, roughness: 0.9 });
    var railMat = new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.8, metalness: 0.05 });

    // --- the guide rail: a long leaning beam the rocket rides ---
    var railLen = 9;
    var rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, railLen, 0.16), railMat);
    rail.geometry.translate(0, railLen / 2, 0);
    rail.rotation.z = tilt;
    rail.position.set(-Math.sin(tilt) * 0.35, 0.15, 0);
    g.add(rail);
    // a second rail bar, offset, so it reads as a channel/trough
    var rail2 = rail.clone();
    rail2.position.z = 0.42;
    g.add(rail2);
    // rungs across the two rails, stepping up ALONG the rail vector
    for (var r = 1; r < 6; r++) {
      var rung = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.62), woodMid);
      var up = r * 1.5;
      rung.position.set(
        -Math.sin(tilt) * 0.35 - Math.cos(a) * up,
        0.15 + Math.sin(a) * up,
        0.21);
      g.add(rung);
    }

    // --- the A-frame support legs ---
    function leg(x, z, len, lean) {
      var m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, len, 7), woodDark);
      m.geometry.translate(0, len / 2, 0);
      m.position.set(x, 0, z);
      m.rotation.z = lean;
      m.rotation.x = z > 0 ? -0.18 : 0.18;
      return m;
    }
    g.add(leg(0.4, -0.5, 3.4, 0.5));
    g.add(leg(0.4, 0.9, 3.4, 0.5));
    g.add(leg(-1.9, -0.5, 2.2, -0.32));
    g.add(leg(-1.9, 0.9, 2.2, -0.32));
    // cross-brace
    var brace = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.09, 0.09), woodMid);
    brace.position.set(-0.7, 1.5, 0.2);
    brace.rotation.z = -0.12;
    g.add(brace);

    // a scorched earth patch at the foot
    var scorch = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 20),
      new THREE.MeshStandardMaterial({ color: 0x1c1712, roughness: 1 }));
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.y = 0.02;
    g.add(scorch);

    g.userData.angleDeg = angleDeg;
    return g;
  }

  // ---------------------------------------------------------------------------
  //  A beautiful daytime gradient sky — a large inward-facing sphere with a
  //  vertical-gradient ShaderMaterial: a soft warm glow at the horizon melting
  //  up into a deep azure zenith. No sun geometry — the light does that. It is
  //  `fog:false` so the horizon line stays a clean gradient, and it renders
  //  first with depthWrite off so everything sits in front of it.
  //  @returns {THREE.Mesh|null}  centre it on the camera each frame for zero parallax
  // ---------------------------------------------------------------------------
  function makeGradientSky(opts) {
    if (!THREE) return null;
    opts = opts || {};
    var top = new THREE.Color(opts.top != null ? opts.top : 0x2f6db0);
    var horizon = new THREE.Color(opts.horizon != null ? opts.horizon : 0xdfe9e6);
    var ground = new THREE.Color(opts.ground != null ? opts.ground : 0xb9c6c0);
    var mat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: top },
        uHorizon: { value: horizon },
        uGround: { value: ground },
        uExp: { value: opts.exponent != null ? opts.exponent : 0.55 }
      },
      vertexShader:
        'varying vec3 vDir;' +
        'void main(){ vDir = normalize(position); ' +
        'gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGround; uniform float uExp;' +
        'varying vec3 vDir;' +
        'void main(){' +
        '  float h = vDir.y;' +
        '  vec3 c;' +
        '  if (h >= 0.0) { c = mix(uHorizon, uTop, pow(clamp(h,0.0,1.0), uExp)); }' +
        '  else { c = mix(uHorizon, uGround, pow(clamp(-h,0.0,1.0), 0.5)); }' +
        '  gl_FragColor = vec4(c, 1.0);' +
        '}',
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false
    });
    var mesh = new THREE.Mesh(new THREE.SphereGeometry(opts.radius || 40000, 32, 24), mat);
    mesh.renderOrder = -100;
    mesh.frustumCulled = false;
    mesh.userData.isGradientSky = true;
    return mesh;
  }

  // ---------------------------------------------------------------------------
  //  THE VAB — a moody studio backdrop + a glowing blueprint floor.
  //  Used by the Assembly (3D preview) scene so the vehicle is presented like
  //  hardware in an aerospace lab, not a toy on a lawn.
  // ---------------------------------------------------------------------------

  /**
   * A large inward sphere shaded as a soft radial vignette: a cool near-black
   * that lifts to a deep desaturated blue around the horizon, darkening again
   * toward the poles. Static — big enough that a preview orbit never clips it.
   * @returns {THREE.Mesh|null}
   */
  function makeStudioBackdrop(opts) {
    if (!THREE) return null;
    opts = opts || {};
    var core = new THREE.Color(opts.core != null ? opts.core : 0x1a2440);   // horizon band
    var edge = new THREE.Color(opts.edge != null ? opts.edge : 0x05060c);   // poles / far
    var mat = new THREE.ShaderMaterial({
      uniforms: { uCore: { value: core }, uEdge: { value: edge } },
      vertexShader:
        'varying vec3 vDir;' +
        'void main(){ vDir = normalize(position);' +
        'gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform vec3 uCore; uniform vec3 uEdge; varying vec3 vDir;' +
        // tiny ordered dither to kill gradient banding on a dark backdrop
        'float dither(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }' +
        'void main(){' +
        '  float b = 1.0 - abs(vDir.y);' +                 // 1 at horizon, 0 at poles
        '  b = pow(clamp(b, 0.0, 1.0), 1.7);' +
        '  vec3 c = mix(uEdge, uCore, b);' +
        // a faint cool spill high-back so it reads as a lit room, not a void
        '  float glow = smoothstep(0.62, 1.0, -vDir.z) * smoothstep(0.06, 0.6, vDir.y);' +
        '  c += vec3(0.016, 0.022, 0.034) * glow;' +
        '  c += (dither(gl_FragCoord.xy) - 0.5) * (1.5 / 255.0);' +
        '  gl_FragColor = vec4(c, 1.0);' +
        '}',
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false
    });
    var mesh = new THREE.Mesh(new THREE.SphereGeometry(opts.radius || 60, 32, 24), mat);
    mesh.renderOrder = -100;
    mesh.frustumCulled = false;
    mesh.userData.isStudioBackdrop = true;
    return mesh;
  }

  /**
   * A dark, faintly reflective floor with a glowing cyan blueprint grid, a soft
   * pool of light under the vehicle, and concentric alignment rings.
   * @returns {THREE.Group|null}
   */
  function makeBlueprintFloor(opts) {
    if (!THREE) return null;
    opts = opts || {};
    var g = new THREE.Group();
    g.userData.isBlueprintFloor = true;

    // the slab — brushed dark metal; the key light rakes across it
    var slab = new THREE.Mesh(
      new THREE.CircleGeometry(opts.radius || 22, 64),
      new THREE.MeshStandardMaterial({
        color: 0x0a1120, roughness: 0.52, metalness: 0.38
      }));
    slab.rotation.x = -Math.PI / 2;
    slab.position.y = -0.001;
    slab.receiveShadow = true;
    g.add(slab);

    // fine + coarse blueprint grids, glowing, just above the slab
    var fine = new THREE.GridHelper(24, 96, 0x2b6f9e, 0x14324c);
    fine.material.transparent = true; fine.material.opacity = 0.34;
    fine.material.depthWrite = false;
    fine.position.y = 0.004;
    g.add(fine);
    var coarse = new THREE.GridHelper(24, 12, 0x5bd6ff, 0x2f6f8f);
    coarse.material.transparent = true; coarse.material.opacity = 0.5;
    coarse.material.depthWrite = false;
    coarse.position.y = 0.006;
    g.add(coarse);

    // a soft pool of light directly under the vehicle (additive radial decal)
    if (typeof document !== 'undefined') {
      var c = document.createElement('canvas');
      c.width = c.height = 256;
      var ctx = c.getContext('2d');
      var grd = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      grd.addColorStop(0.0, 'rgba(150,205,255,0.55)');
      grd.addColorStop(0.35, 'rgba(90,150,220,0.22)');
      grd.addColorStop(1.0, 'rgba(90,150,220,0)');
      ctx.fillStyle = grd; ctx.fillRect(0, 0, 256, 256);
      var pool = new THREE.Mesh(
        new THREE.CircleGeometry(6.5, 48),
        new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(c), transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false
        }));
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = 0.009;
      g.add(pool);
    }

    // concentric alignment rings — launch-pad markings
    [2.4, 4.6, 7.0].forEach(function (r, i) {
      var ring = new THREE.Mesh(
        new THREE.RingGeometry(r - 0.02, r + 0.02, 96),
        new THREE.MeshBasicMaterial({
          color: 0x5bd6ff, transparent: true, opacity: i === 0 ? 0.5 : 0.24,
          side: THREE.DoubleSide, depthWrite: false
        }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.012;
      g.add(ring);
    });

    return g;
  }

  global.RS = global.RS || {};
  global.RS.render = global.RS.render || {};
  global.RS.render.Scene = Scene;
  global.RS.render.makeLaunchRig = makeLaunchRig;
  global.RS.render.makeGradientSky = makeGradientSky;
  global.RS.render.makeStudioBackdrop = makeStudioBackdrop;
  global.RS.render.makeBlueprintFloor = makeBlueprintFloor;

})(typeof window !== 'undefined' ? window : this);
