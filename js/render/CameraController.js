/* =============================================================================
 * FROM FIRE TO ORBIT — Render layer
 * js/render/CameraController.js
 *
 * A compact orbit camera: drag to rotate, wheel to zoom, gentle idle spin.
 * Pure Three.js maths on a camera + a DOM element. No core/ dependency.
 * ===========================================================================*/
(function (global) {
  'use strict';

  var THREE = global.THREE;
  var TAU = Math.PI * 2;

  /**
   * @param {THREE.Camera} camera
   * @param {HTMLElement} dom      element to bind pointer/wheel on
   * @param {Object} [opts]
   * @param {number[]} [opts.target=[0,0.6,0]]
   * @param {number} [opts.radius=4]
   * @param {number} [opts.minRadius=1.2]
   * @param {number} [opts.maxRadius=18]
   * @param {boolean} [opts.autoRotate=true]
   */
  function CameraController(camera, dom, opts) {
    opts = opts || {};
    this.camera = camera;
    this.dom = dom;
    this.available = !!THREE && !!camera && !!dom;
    this.target = new (THREE ? THREE.Vector3 : Object)();
    var t = opts.target || [0, 0.6, 0];
    if (THREE) this.target.set(t[0], t[1], t[2]);

    this.radius = opts.radius || 4;
    this.minRadius = opts.minRadius || 1.2;
    this.maxRadius = opts.maxRadius || 18;
    this.theta = Math.PI * 0.25;   // azimuth
    this.phi = Math.PI * 0.36;     // polar from +y
    this.autoRotate = opts.autoRotate !== false;
    this._drag = null;

    if (this.available) this._bind();
    this.update(0);
  }

  CameraController.prototype._bind = function () {
    var self = this;
    var dom = this.dom;

    this._onDown = function (e) {
      self._drag = { x: e.clientX, y: e.clientY };
      self.autoRotate = false;
      if (dom.setPointerCapture && e.pointerId != null) {
        try { dom.setPointerCapture(e.pointerId); } catch (x) {}
      }
    };
    this._onMove = function (e) {
      if (!self._drag) return;
      var dx = e.clientX - self._drag.x, dy = e.clientY - self._drag.y;
      self._drag.x = e.clientX; self._drag.y = e.clientY;
      self.theta -= dx * 0.01;
      self.phi = clamp(self.phi - dy * 0.01, 0.12, Math.PI - 0.12);
      self.update(0);
    };
    this._onUp = function () { self._drag = null; };
    this._onWheel = function (e) {
      e.preventDefault();
      self.radius = clamp(self.radius * (e.deltaY < 0 ? 0.9 : 1.1), self.minRadius, self.maxRadius);
      self.update(0);
    };

    dom.addEventListener('pointerdown', this._onDown);
    global.addEventListener('pointermove', this._onMove);
    global.addEventListener('pointerup', this._onUp);
    dom.addEventListener('wheel', this._onWheel, { passive: false });
  };

  /** Call each frame. `dt` seconds. */
  CameraController.prototype.update = function (dt) {
    if (!this.available) return;
    if (this.autoRotate) this.theta += (dt || 0) * 0.25;
    var sp = Math.sin(this.phi), cp = Math.cos(this.phi);
    this.camera.position.set(
      this.target.x + this.radius * sp * Math.sin(this.theta),
      this.target.y + this.radius * cp,
      this.target.z + this.radius * sp * Math.cos(this.theta)
    );
    this.camera.lookAt(this.target);
  };

  CameraController.prototype.setTarget = function (x, y, z) {
    if (this.available) this.target.set(x, y, z);
  };

  /** Frame a bounding sphere (centre Vector3-like + radius). */
  CameraController.prototype.frame = function (center, radius) {
    if (!this.available) return;
    this.target.set(center.x, center.y, center.z);
    this.radius = clamp(radius * 2.6, this.minRadius, this.maxRadius);
    this.update(0);
  };

  CameraController.prototype.dispose = function () {
    if (!this.available) return;
    this.dom.removeEventListener('pointerdown', this._onDown);
    global.removeEventListener('pointermove', this._onMove);
    global.removeEventListener('pointerup', this._onUp);
    this.dom.removeEventListener('wheel', this._onWheel);
  };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  global.RS = global.RS || {};
  global.RS.render = global.RS.render || {};
  global.RS.render.CameraController = CameraController;

})(typeof window !== 'undefined' ? window : this);
