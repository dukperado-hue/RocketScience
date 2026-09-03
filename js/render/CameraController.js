/* =============================================================================
 * FROM FIRE TO ORBIT — Render layer
 * js/render/CameraController.js
 *
 * Camera rigs for the 3D views:
 *   · 'orbit'    — drag to rotate, wheel to zoom, gentle idle spin (default).
 *   · 'observer' — the LAUNCHER'S POV: planted on the ground at eye level,
 *                  auto-tracking `target`; drag nudges the gaze and it eases
 *                  back so the vehicle stays the subject.
 * Pure Three.js maths on a camera + a DOM element. No core/ dependency.
 * ===========================================================================*/
(function (global) {
  'use strict';

  var THREE = global.THREE;
  var TAU = Math.PI * 2;
  var UP = THREE ? new THREE.Vector3(0, 1, 0) : null;

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

    // 'orbit' (default) | 'observer'
    this.mode = opts.mode === 'observer' ? 'observer' : 'orbit';
    this.eye = new (THREE ? THREE.Vector3 : Object)();
    var e = opts.eye || [-2.4, 1.7, 7.2];
    if (THREE) this.eye.set(e[0], e[1], e[2]);
    this._lookYaw = 0;             // transient drag-to-look-around (observer)
    this._lookPitch = 0;
    this._tmp = new (THREE ? THREE.Vector3 : Object)();
    this._tmp2 = new (THREE ? THREE.Vector3 : Object)();

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
      if (self.mode === 'observer') {
        self._lookYaw = clamp(self._lookYaw - dx * 0.006, -1.1, 1.1);
        self._lookPitch = clamp(self._lookPitch + dy * 0.006, -0.55, 0.8);
      } else {
        self.theta -= dx * 0.01;
        self.phi = clamp(self.phi - dy * 0.01, 0.12, Math.PI - 0.12);
      }
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

    if (this.mode === 'observer') {
      var eye = this.eye;
      var horiz = Math.hypot(this.target.x - eye.x, this.target.z - eye.z) || 0.001;
      // mostly track the target (it stays the subject) with a slight downward
      // bias so the foreground is in frame while the subject is still low
      var aimY = eye.y + clamp((this.target.y - eye.y) * 0.35, -3, horiz * 2.6);
      var dir = this._tmp.set(this.target.x - eye.x, aimY - eye.y, this.target.z - eye.z);
      if (Math.abs(this._lookYaw) > 1e-4) dir.applyAxisAngle(UP, this._lookYaw);
      if (Math.abs(this._lookPitch) > 1e-4) {
        var right = this._tmp2.copy(dir).cross(UP);
        if (right.lengthSq() > 1e-6) dir.applyAxisAngle(right.normalize(), this._lookPitch);
      }
      this.camera.position.copy(eye);
      this.camera.lookAt(eye.x + dir.x, eye.y + dir.y, eye.z + dir.z);
      var k = Math.pow(0.12, Math.max(dt || 0, 1e-3));  // frame-rate-independent ease
      this._lookYaw *= k;
      this._lookPitch *= k;
      return;
    }

    if (this.autoRotate) this.theta += (dt || 0) * 0.25;
    var sp = Math.sin(this.phi), cp = Math.cos(this.phi);
    this.camera.position.set(
      this.target.x + this.radius * sp * Math.sin(this.theta),
      this.target.y + this.radius * cp,
      this.target.z + this.radius * sp * Math.cos(this.theta)
    );
    this.camera.lookAt(this.target);
  };

  /** Switch rigs at runtime ('orbit' | 'observer'). */
  CameraController.prototype.setMode = function (m) {
    this.mode = m === 'observer' ? 'observer' : 'orbit';
    this._lookYaw = this._lookPitch = 0;
    this.update(0);
  };

  /** Toggle between the auto orbit rig and the observer rig (e.g. a hotkey). */
  CameraController.prototype.cycleMode = function () {
    this.setMode(this.mode === 'observer' ? 'orbit' : 'observer');
    return this.mode;
  };

  /**
   * A drag already drops `autoRotate` (see _onDown), so the orbit rig hands
   * control to the user the instant they pan — the caller only needs to make
   * sure it does not force `autoRotate` back on while the user is steering.
   */

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
