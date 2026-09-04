/* =============================================================================
 * FROM FIRE TO ORBIT — Render layer
 * js/render/EarthGlobe.js  ·  the Blue Marble
 *
 * A photoreal Earth ported from the standalone Three.js prototype:
 *   · base planet  — THREE.IcosahedronGeometry(1, 12), MeshStandardMaterial
 *     with an Albedo map, an INVERTED specular map used as the Roughness map
 *     (so oceans read glossy and land matte), a Normal map and a night-lights
 *     emissive map.
 *   · cloud shell  — a second mesh at 1.003×, transparent, AdditiveBlending,
 *     drifting slightly faster than the surface.
 *   · atmosphere   — a third mesh at 1.01× with a hand-written Fresnel shader
 *     for the blue limb glow.
 *
 * Textures stream from a robust CDN fallback chain: three.js's own example
 * textures first (rock-solid CORS), Bobby Roe's threejs-earth repo via jsDelivr
 * second. Every load also has an inline error handler, so a blocked host just
 * falls through — nothing blocks the scene.
 *
 * Consumes only window.THREE. If THREE is missing, build() returns null and the
 * caller keeps its flat-sphere fallback.
 * ===========================================================================*/
(function (global) {
  'use strict';

  var THREE = global.THREE;

  var TJS = 'https://threejs.org/examples/textures/planets/';
  var BOB = 'https://cdn.jsdelivr.net/gh/bobbyroe/threejs-earth@main/textures/';

  // This project renders with a LINEAR output pipeline (no tone-mapping, no
  // sRGB output encoding) and authors every other texture to look right in it.
  // Only tag colour textures sRGB when the renderer will decode+re-encode them
  // — otherwise they come out double-dark. `markSRGB` is applied conditionally
  // by the caller once it knows the renderer.
  function markSRGB(tex) {
    if (!tex) return tex;
    if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    else if ('encoding' in tex && THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  // A specular map is white where the surface is shiny (the oceans); a roughness
  // map wants the opposite. Flip it through a canvas so the water reads glossy
  // and the land matte. Falls back to the raw image if the canvas is tainted.
  function invertImage(img) {
    var cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    var ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0);
    var d = ctx.getImageData(0, 0, cv.width, cv.height);
    var p = d.data;
    for (var k = 0; k < p.length; k += 4) {
      p[k] = 255 - p[k]; p[k + 1] = 255 - p[k + 1]; p[k + 2] = 255 - p[k + 2];
    }
    ctx.putImageData(d, 0, 0);
    return cv;
  }

  var _loader = null;
  function loader() {
    if (_loader) return _loader;
    _loader = new THREE.TextureLoader();
    _loader.setCrossOrigin('anonymous');
    return _loader;
  }

  /**
   * Try each URL in `sources` in order; the returned THREE.Texture is mutated in
   * place on the first success and `onReady` is fired so the caller can flip
   * material.needsUpdate.
   */
  function loadWithFallback(sources, opts, onReady) {
    opts = opts || {};
    var tex = new THREE.Texture();
    if (opts.srgb) markSRGB(tex);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    if (opts.aniso && loader().manager) { /* aniso set per-renderer by caller */ }
    var i = 0;
    function attempt() {
      if (i >= sources.length) {
        console.warn('[render/EarthGlobe] every texture source failed:', sources);
        return;
      }
      var url = sources[i++];
      loader().load(url,
        function (loaded) {
          try { tex.image = opts.invert ? invertImage(loaded.image) : loaded.image; }
          catch (e) { tex.image = loaded.image; }   // tainted-canvas fallback
          tex.needsUpdate = true;
          if (onReady) onReady(tex);
        },
        undefined,
        function () {
          console.warn('[render/EarthGlobe] texture failed, trying next source:', url);
          attempt();
        });
    }
    attempt();
    return tex;
  }

  // lat / lon (deg) -> unit vector, matched to THREE.PolyhedronGeometry's UV
  // convention (azimuth = atan2(z, -x), latitude = asin(y)). This is the exact
  // maths the standalone prototype used to plant its POI pins on the right
  // coastline — NOT the SphereGeometry formula.
  function latLonToVector3(lat, lon, r) {
    r = (r == null) ? 1 : r;
    var la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
    return new THREE.Vector3(
      -r * Math.cos(la) * Math.cos(lo),
       r * Math.sin(la),
       r * Math.cos(la) * Math.sin(lo)
    );
  }

  // ---- the Fresnel atmosphere shader (verbatim from the prototype) ----------
  var FRESNEL_VS = [
    'uniform float fresnelBias;',
    'uniform float fresnelScale;',
    'uniform float fresnelPower;',
    'varying float vReflectionFactor;',
    'void main() {',
    '  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );',
    '  vec4 worldPosition = modelMatrix * vec4( position, 1.0 );',
    '  vec3 worldNormal = normalize( mat3( modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz ) * normal );',
    '  vec3 I = worldPosition.xyz - cameraPosition;',
    '  vReflectionFactor = fresnelBias + fresnelScale * pow( 1.0 + dot( normalize( I ), worldNormal ), fresnelPower );',
    '  gl_Position = projectionMatrix * mvPosition;',
    '}'
  ].join('\n');

  var FRESNEL_FS = [
    'uniform vec3 color1;',
    'uniform vec3 color2;',
    'varying float vReflectionFactor;',
    'void main() {',
    '  float f = clamp( vReflectionFactor, 0.0, 1.0 );',
    '  gl_FragColor = vec4( mix( color2, color1, vec3( f ) ), f );',
    '}'
  ].join('\n');

  function fresnelMat(rimHex) {
    return new THREE.ShaderMaterial({
      uniforms: {
        color1: { value: new THREE.Color(rimHex != null ? rimHex : 0x5aa9ff) },
        color2: { value: new THREE.Color(0x000000) },
        fresnelBias: { value: 0.1 },
        fresnelScale: { value: 1.0 },
        fresnelPower: { value: 4.0 }
      },
      vertexShader: FRESNEL_VS,
      fragmentShader: FRESNEL_FS,
      transparent: true,
      blending: THREE.AdditiveBlending
    });
  }

  /**
   * Build the Earth as a THREE.Group of unit-radius meshes scaled to `radius`.
   * @param {number} radius            world radius (e.g. RS.Physics.RE)
   * @param {Object} [opts]
   * @param {number} [opts.detail=12]  IcosahedronGeometry subdivision
   * @param {number} [opts.cloudSpin=0.004]  rad/s — a touch faster than earthSpin
   * @param {number} [opts.earthSpin=0]      rad/s — 0 keeps continents fixed
   *                                          under the (polar) launch site
   * @param {number} [opts.rimHex]     atmosphere glow colour
   * @returns {THREE.Group|null}
   */
  function build(radius, opts) {
    if (!THREE) return null;
    opts = opts || {};
    radius = radius || 1;
    var detail = opts.detail || 12;

    var wantSRGB = !!opts.srgb;   // default false — this project outputs linear

    var group = new THREE.Group();
    group.userData.isEarthGlobe = true;
    group.userData.textured = true;

    var geo = new THREE.IcosahedronGeometry(1, detail);

    // --- 1. base planet ---------------------------------------------------
    var mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 1.0, metalness: 0.0
    });
    var mats = [mat];
    function dirty() { for (var m = 0; m < mats.length; m++) mats[m].needsUpdate = true; }

    mat.map = loadWithFallback(
      [TJS + 'earth_atmos_2048.jpg', BOB + '00_earthmap1k.jpg'], { srgb: wantSRGB }, dirty);
    mat.roughnessMap = loadWithFallback(
      [TJS + 'earth_specular_2048.jpg', BOB + '02_earthspec1k.jpg'], { invert: true }, dirty);
    mat.normalMap = loadWithFallback(
      [TJS + 'earth_normal_2048.jpg', BOB + '01_earthbump1k.jpg'], {}, dirty);
    mat.emissiveMap = loadWithFallback(
      [TJS + 'earth_lights_2048.png', BOB + '03_earthlights1k.jpg'], { srgb: wantSRGB }, dirty);
    mat.emissive = new THREE.Color(0xffdca0);   // warm city-light glow, night side
    mat.emissiveIntensity = 0.9;
    if (mat.normalScale && mat.normalScale.set) mat.normalScale.set(0.8, 0.8);

    var earth = new THREE.Mesh(geo, mat);
    earth.scale.setScalar(radius);
    earth.userData.textured = true;
    group.add(earth);

    // --- 2. additive cloud shell ---------------------------------------
    var cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    mats.push(cloudMat);
    var cloudTex = loadWithFallback(
      [TJS + 'earth_clouds_1024.png', BOB + '05_earthcloudmaptrans.jpg'], { srgb: wantSRGB }, dirty);
    cloudMat.map = cloudTex;
    cloudMat.alphaMap = cloudTex;
    var clouds = new THREE.Mesh(geo, cloudMat);
    clouds.scale.setScalar(radius * 1.003);
    group.add(clouds);

    // --- 3. Fresnel atmosphere rim -----------------------------------
    var glow = new THREE.Mesh(geo, fresnelMat(opts.rimHex));
    glow.scale.setScalar(radius * 1.01);
    group.add(glow);

    group.userData.earth = earth;
    group.userData.clouds = clouds;
    group.userData.glow = glow;
    group.userData.cloudSpin = (opts.cloudSpin != null) ? opts.cloudSpin : 0.004;
    group.userData.earthSpin = opts.earthSpin || 0;
    return group;
  }

  // Rotate the whole globe so a chosen lat/lon sits at local +Y. In this game
  // the launch pad is the north pole of the sphere, so orienting a real place
  // (e.g. Thailand) to +Y puts that continent under the rocket AND lets the map
  // camera frame it as "the launch site".
  function orientTo(group, lat, lon) {
    if (!group || !THREE) return;
    var from = latLonToVector3(lat, lon, 1).normalize();
    group.quaternion.setFromUnitVectors(from, new THREE.Vector3(0, 1, 0));
    group.updateMatrixWorld(true);
  }

  // Per-frame drift. Call from the render loop with wall-clock dt (seconds).
  function update(group, dt) {
    if (!group || !group.userData) return;
    var ud = group.userData;
    dt = dt || 0;
    if (ud.clouds && ud.cloudSpin) ud.clouds.rotation.y += dt * ud.cloudSpin;
    if (ud.earth && ud.earthSpin) {
      ud.earth.rotation.y += dt * ud.earthSpin;
      if (ud.glow) ud.glow.rotation.y = ud.earth.rotation.y;
    }
  }

  global.RS = global.RS || {};
  global.RS.render = global.RS.render || {};
  global.RS.render.EarthGlobe = {
    build: build,
    orientTo: orientTo,
    update: update,
    latLonToVector3: latLonToVector3
  };

})(typeof window !== 'undefined' ? window : this);
