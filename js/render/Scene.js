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

    // opt-in soft shadows — lets a bamboo skeleton silhouette against its paper
    if (opts.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(opts.fov || 45, 1, 0.02, opts.far || 5000);
    this.camera.position.set(2.4, 1.8, 3.4);
    this.camera.lookAt(0, 0.6, 0);

    var hemi = new THREE.HemisphereLight(0xbfd4ff, 0x25324a, 0.95);
    this.scene.add(hemi);
    var key = new THREE.DirectionalLight(0xfff2dd, 1.05);
    key.position.set(3, 5, 2);
    if (opts.shadows) {
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.near = 0.5;
      key.shadow.camera.far = 24;
      key.shadow.camera.left = key.shadow.camera.bottom = -4;
      key.shadow.camera.right = key.shadow.camera.top = 4;
      key.shadow.bias = -0.0006;
      key.shadow.radius = 3;
    }
    this.scene.add(key);
    var rim = new THREE.DirectionalLight(0x88aaff, 0.35);
    rim.position.set(-3, 2, -3);
    this.scene.add(rim);
    this.lights = { hemi: hemi, key: key, rim: rim };   // callers may re-tune (e.g. night)

    if (opts.ground !== false) {
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

  global.RS = global.RS || {};
  global.RS.render = global.RS.render || {};
  global.RS.render.Scene = Scene;

})(typeof window !== 'undefined' ? window : this);
