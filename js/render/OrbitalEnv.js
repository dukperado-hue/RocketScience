/* =============================================================================
 * FROM FIRE TO ORBIT — Render layer
 * js/render/OrbitalEnv.js  ·  the Eastern-Sea target zone (Phase 15)
 *
 * A tiny helper module that dresses the flight scene with the V-2's ballistic
 * TARGET: a reticle + a patch of open water somewhere in the sea east of
 * Thailand (Gulf of Thailand / South China Sea). Everything is anchored in the
 * flight FIXED frame (planet centre at (0,-RE)); the caller just decides the
 * downrange distance and compass bearing.
 *
 *   makeTargetZone(RE)          → THREE.Group : water disc + pulsing reticle
 *   placeAtRange(g, RE, m, brg) → sit it on the surface `m` metres downrange
 *   makeAimMarker() / makeImpactMarker()   → small crosshair / burst markers
 *   update(g, dt)               → pulse the reticle
 *
 * Consumes only window.THREE. If THREE is missing every export is null / no-op.
 * ===========================================================================*/
(function (global) {
  'use strict';

  var THREE = global.THREE;

  function ringMesh(r0, r1, hex, opacity) {
    return new THREE.Mesh(
      new THREE.RingGeometry(r0, r1, 48),
      new THREE.MeshBasicMaterial({
        color: hex, transparent: true, opacity: opacity,
        side: THREE.DoubleSide, depthWrite: false
      }));
  }

  /**
   * @param {number} RE  planet radius (world units)
   * @param {Object} [opts]
   * @param {number} [opts.scale] visual size of the reticle in world units
   * @returns {THREE.Group|null}
   */
  function makeTargetZone(RE, opts) {
    if (!THREE) return null;
    opts = opts || {};
    // a real-world-ish size: the flight view watches the rocket arc onto this
    // from a chase cam scaled like the rocket, so ~24 m reads as a target zone,
    // not a continent. A separate tall thin beacon does the spot-from-afar job.
    // (On the full-planet orbital map it's just a speck by the pole — fine, the
    // POI pins carry that view.)
    var scale = opts.scale || 24;
    var g = new THREE.Group();
    g.userData.isTargetZone = true;

    // --- a patch of open sea: a slightly domed translucent blue disc ---
    var water = new THREE.Mesh(
      new THREE.CircleGeometry(scale * 2.4, 40),
      new THREE.MeshBasicMaterial({
        color: 0x1b6fa8, transparent: true, opacity: 0.34,
        side: THREE.DoubleSide, depthWrite: false
      }));
    water.rotation.x = -Math.PI / 2;
    g.add(water);
    var foam = ringMesh(scale * 2.2, scale * 2.4, 0x9fdcff, 0.5);
    foam.rotation.x = -Math.PI / 2;
    g.add(foam);

    // --- the reticle: two concentric rings + a crosshair ---
    var reticle = new THREE.Group();
    var r1 = ringMesh(scale * 0.9, scale * 1.05, 0xff5545, 0.95);
    var r2 = ringMesh(scale * 1.7, scale * 1.8, 0xff7a5a, 0.6);
    r1.rotation.x = r2.rotation.x = -Math.PI / 2;
    reticle.add(r1); reticle.add(r2);
    var barMat = new THREE.MeshBasicMaterial({ color: 0xff5545, transparent: true, opacity: 0.9, depthWrite: false });
    for (var i = 0; i < 4; i++) {
      var bar = new THREE.Mesh(new THREE.BoxGeometry(scale * 0.9, scale * 0.06, scale * 0.06), barMat);
      bar.position.set(Math.cos(i * Math.PI / 2) * scale * 1.35, scale * 0.04, Math.sin(i * Math.PI / 2) * scale * 1.35);
      bar.rotation.y = i * Math.PI / 2;
      reticle.add(bar);
    }
    // a tall thin pillar of light so the target is spottable from the pad
    var beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(scale * 0.12, scale * 0.12, 460, 6),
      new THREE.MeshBasicMaterial({
        color: 0xff7a52, transparent: true, opacity: 0.16,
        blending: THREE.AdditiveBlending, depthWrite: false }));
    beacon.position.y = 230;
    g.add(beacon);
    g.add(reticle);
    g.userData.reticle = reticle;
    g.userData.foam = foam;
    g.userData._t = 0;

    return g;
  }

  // unit surface position `m` metres downrange along compass bearing `brg`
  // (radians; 0 = +x = the flight downrange axis), planet centred at (0,-RE)
  function surfacePoint(RE, m, brg) {
    var a = m / RE;
    return new THREE.Vector3(
      RE * Math.sin(a) * Math.cos(brg || 0),
      -RE + RE * Math.cos(a),
      RE * Math.sin(a) * Math.sin(brg || 0)
    );
  }

  function placeAtRange(g, RE, m, brg) {
    if (!g || !THREE) return;
    var p = surfacePoint(RE, m, brg);
    g.position.copy(p);
    // orient the group so its local +y points away from the planet centre
    var up = p.clone().sub(new THREE.Vector3(0, -RE, 0)).normalize();
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
  }

  function crossMarker(hex, scale) {
    var m = new THREE.Group();
    var mat = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.95, depthWrite: false });
    for (var i = 0; i < 2; i++) {
      var bar = new THREE.Mesh(new THREE.BoxGeometry(scale * 2, scale * 0.14, scale * 0.14), mat);
      bar.rotation.y = i * Math.PI / 2;
      m.add(bar);
    }
    var post = new THREE.Mesh(
      new THREE.CylinderGeometry(scale * 0.045, scale * 0.045, scale * 2.4, 6),
      new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.16, depthWrite: false }));
    post.position.y = scale * 1.2;
    m.add(post);
    return m;
  }

  function makeAimMarker(scale) { return THREE ? crossMarker(0x7ad0ff, scale || 40) : null; }
  function makeImpactMarker(scale) { return THREE ? crossMarker(0xffd24a, scale || 40) : null; }

  function update(g, dt) {
    if (!g || !g.userData) return;
    g.userData._t = (g.userData._t || 0) + (dt || 0);
    var p = 1 + Math.sin(g.userData._t * 2.4) * 0.12;
    if (g.userData.reticle) g.userData.reticle.scale.setScalar(p);
    if (g.userData.foam) g.userData.foam.material.opacity = 0.35 + Math.sin(g.userData._t * 1.7) * 0.18;
  }

  global.RS = global.RS || {};
  global.RS.render = global.RS.render || {};
  global.RS.render.OrbitalEnv = {
    makeTargetZone: makeTargetZone,
    placeAtRange: placeAtRange,
    surfacePoint: surfacePoint,
    makeAimMarker: makeAimMarker,
    makeImpactMarker: makeImpactMarker,
    update: update
  };

})(typeof window !== 'undefined' ? window : this);
