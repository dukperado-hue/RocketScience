/* =============================================================================
 * FROM FIRE TO ORBIT — Render layer
 * js/render/VehicleRenderer.js  ·  Phase 2A prelude
 *
 * Translates a RS.Vehicle assembly graph into a Three.js Group of primitive
 * meshes — cylinders for wax/bamboo, a dome for the paper envelope — laid out
 * from the same grid coordinates and attachNodes the 2D Blueprint uses.
 *
 * NO flight logic. NO physics. It reads the graph, it builds geometry. That's all.
 *
 * `layout(vehicle)` is pure (no THREE) and returns plain placement data, so the
 * grid→world mapping is unit-testable in Node. `build()` just skins it.
 * ===========================================================================*/
(function (global) {
  'use strict';

  var THREE = global.THREE;
  var TAU = Math.PI * 2;

  var CAT_COLOR = {
    Structural:   0xc79a6a,
    Propulsion:   0xe0765a,
    Aerodynamics: 0x63b6e0,
    Payload:      0x7fc27e
  };

  function mpc() {
    return (global.RS && global.RS.Vehicle && global.RS.Vehicle.METERS_PER_CELL) || 0.5;
  }

  // Vertical heat gradient baked once and shared by every khom-loy envelope:
  // hot orange at the mouth (bottom), fading to dark amber at the crown (top).
  var _paperTex = null;
  function paperGradientTex() {
    if (_paperTex !== null) return _paperTex || undefined;
    if (!THREE || typeof document === 'undefined') { _paperTex = false; return undefined; }
    var c = document.createElement('canvas');
    c.width = 4; c.height = 128;
    var g = c.getContext('2d');
    // maps so the lantern MOUTH glows hot and the CROWN goes dark amber
    var grd = g.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0.00, '#25120a');   // crown — dark amber
    grd.addColorStop(0.40, '#7a2c08');
    grd.addColorStop(0.72, '#ff7118');
    grd.addColorStop(1.00, '#ff9a3c');   // mouth — hot
    g.fillStyle = grd; g.fillRect(0, 0, 4, 128);
    _paperTex = new THREE.CanvasTexture(c);
    if ('colorSpace' in _paperTex && THREE.SRGBColorSpace) {
      _paperTex.colorSpace = THREE.SRGBColorSpace;
    }
    return _paperTex;
  }

  // The A4 / V-2's signature roll-reference paint scheme: the airframe split
  // into four vertical quadrants, alternating matte white / near-black, with a
  // checker patch on one white quadrant — the Peenemünde photo-theodolite
  // pattern that let engineers read the rocket's spin from tracking film.
  // U wraps the circumference; shared by the nose ogive and the body tank.
  var _v2Tex = null;
  function v2SkinTex() {
    if (_v2Tex !== null) return _v2Tex || undefined;
    if (!THREE || typeof document === 'undefined') { _v2Tex = false; return undefined; }
    var c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    var g = c.getContext('2d');
    var WHITE = '#e9e7df', BLACK = '#1b1b1b';
    g.fillStyle = WHITE; g.fillRect(0, 0, 256, 256);
    g.fillStyle = BLACK;
    g.fillRect(0, 0, 64, 256);       // quadrant 1
    g.fillRect(128, 0, 64, 256);     // quadrant 3
    for (var i = 0; i < 4; i++) {    // checker across the top of a white quadrant
      for (var j = 0; j < 6; j++) {
        if ((i + j) % 2 === 0) { g.fillRect(64 + i * 16, j * 16, 16, 16); }
      }
    }
    _v2Tex = new THREE.CanvasTexture(c);
    _v2Tex.wrapS = THREE.RepeatWrapping;
    _v2Tex.wrapT = THREE.ClampToEdgeWrapping;
    _v2Tex.magFilter = THREE.NearestFilter;
    if ('colorSpace' in _v2Tex && THREE.SRGBColorSpace) _v2Tex.colorSpace = THREE.SRGBColorSpace;
    else if ('encoding' in _v2Tex && THREE.sRGBEncoding) _v2Tex.encoding = THREE.sRGBEncoding;
    return _v2Tex;
  }

  // ---------------------------------------------------------------------------
  //  ENGINEERING MARKERS — Centre of Mass / Centre of Pressure (Assembly view)
  //
  //  KSP's tell: a yellow-and-black checkered ball for the CoM, a blue-and-white
  //  one for the CoP. The golden rule — CoM must sit ABOVE the CoP — is shown
  //  live by a coloured spine between them (green = stable, red = it'll flip).
  // ---------------------------------------------------------------------------
  var _checkerTex = {};
  function checkerTex(aHex, bHex) {
    var kkey = aHex + '_' + bHex;
    if (_checkerTex[kkey] !== undefined) return _checkerTex[kkey] || undefined;
    if (!THREE || typeof document === 'undefined') { _checkerTex[kkey] = false; return undefined; }
    var n = 6, s = 96, cell = s / n;
    var c = document.createElement('canvas'); c.width = c.height = s;
    var g = c.getContext('2d');
    for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) {
      g.fillStyle = ((i + j) & 1) ? bHex : aHex;
      g.fillRect(i * cell, j * cell, cell, cell);
    }
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 1);
    tex.magFilter = THREE.NearestFilter;
    if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    else if ('encoding' in tex && THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    _checkerTex[kkey] = tex;
    return tex;
  }

  function markerBall(r, checker, tint) {
    var t = checkerTex(checker[0], checker[1]);
    var mat = new THREE.MeshStandardMaterial({
      map: t, color: t ? 0xffffff : tint,
      roughness: 0.45, metalness: 0.1,
      emissive: new THREE.Color(tint), emissiveIntensity: 0.35,
      transparent: true, opacity: 0.92,
      depthTest: false                     // always readable, even inside a tank
    });
    var m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 16), mat);
    m.renderOrder = 998;
    return m;
  }

  /**
   * Build the CoM + CoP marker group for a vehicle. Pure THREE.
   * @param {import('../core/Vehicle').Vehicle} vehicle
   * @param {ReturnType<typeof layout>} lo   the layout() result (for the grid map)
   * @returns {THREE.Group|null}
   */
  function buildMarkers(vehicle, lo) {
    if (!THREE || !vehicle || !vehicle.computeStats || !lo || !lo.grid) return null;
    var s = vehicle.computeStats();
    if (!s || !s.partCount) return null;

    var grp = new THREE.Group();
    grp.userData.isMarkerGroup = true;
    var r = Math.max(0.045, Math.min(0.16, (lo.bounds.radius || 1) * 0.085));

    var comW = cellToWorld(lo.grid, s.com.x, s.com.y);
    var com = markerBall(r, ['#ffcf3f', '#161616'], 0x1a1a1a);
    com.position.set(comW.x, comW.y, comW.z);
    com.userData.isCoM = true;
    grp.add(com);

    // Stability: computeStats already knows the rule for this vehicle kind —
    // a rocket wants CoP behind (below) the CoM; a lantern wants the CoM below
    // its centre of lift. `s.stable` folds that in. A single part is always ok.
    var stable = (s.partCount <= 1) ? true : (s.stable !== false);

    var cop = null;
    if (s.refArea > 0) {
      var copW = cellToWorld(lo.grid, s.cop.x, s.cop.y);
      cop = markerBall(r * 0.92, ['#5bb8ff', '#eef6ff'], 0x2f6f9f);
      cop.position.set(copW.x, copW.y, copW.z);
      cop.userData.isCoP = true;
      grp.add(cop);

      // the stability spine between the two markers — green = stable stack,
      // red = it will weathercock / flip
      var a = new THREE.Vector3(comW.x, comW.y, comW.z);
      var b = new THREE.Vector3(copW.x, copW.y, copW.z);
      var len = a.distanceTo(b);
      if (len > 1e-3) {
        var spine = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 0.16, r * 0.16, len, 8),
          new THREE.MeshBasicMaterial({
            color: stable ? 0x54e39a : 0xff4d4d,
            transparent: true, opacity: 0.75, depthTest: false
          }));
        spine.position.copy(a.clone().add(b).multiplyScalar(0.5));
        spine.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        spine.renderOrder = 997;
        grp.add(spine);
      }
    }

    grp.userData.marker = { com: com, cop: cop, stable: stable, baseR: r, pulse: 0 };
    return grp;
  }

  /** Per-frame marker life: a slow breathe; an urgent pulse when unstable. */
  function updateMarkers(group, dt) {
    var mg = group && group.userData && group.userData.partMarkers;
    if (!mg || !mg.userData || !mg.userData.marker) return;
    var mk = mg.userData.marker;
    mk.pulse += (dt || 0.016);
    var breathe = 1 + 0.05 * Math.sin(mk.pulse * 2.2);
    var warn = mk.stable ? 0 : (0.5 + 0.5 * Math.sin(mk.pulse * 7.0));
    [mk.com, mk.cop].forEach(function (m) {
      if (!m) return;
      m.scale.setScalar(breathe * (1 + warn * 0.18));
      if (m.material) m.material.emissiveIntensity = 0.35 + warn * 0.5;
    });
  }

  // ---------------------------------------------------------------------------
  //  GLTF / GLB model loader — cache + graceful fallback
  //
  //  Official space-agency models ship pre-separated into modular parts, which
  //  maps straight onto our attachNodes. A part with `meshUrl` gets its .glb
  //  loaded once, cached, and cloned per instance. If GLTFLoader is missing, a
  //  file 404s, or a load throws — `_tpl[url]` stays null and makeMesh falls
  //  back to the procedural primitive. Nothing blocks.
  // ---------------------------------------------------------------------------
  var _loadPromise = {};   // url -> Promise (settles to a template Object3D or null)
  var _tpl = {};           // url -> Object3D template (loaded)  |  null (failed)
  var _loader = null;

  function gltfLoader() {
    if (_loader) return _loader;
    if (THREE && typeof THREE.GLTFLoader === 'function') _loader = new THREE.GLTFLoader();
    return _loader;
  }

  /** Load (once) and cache a model template. Always resolves — null on failure. */
  function loadModel(url) {
    if (!url) return Promise.resolve(null);
    if (_loadPromise[url]) return _loadPromise[url];

    var ld = gltfLoader();
    if (!ld) {
      console.warn('[render/VehicleRenderer] GLTFLoader unavailable — "' + url + '" → procedural');
      _tpl[url] = null;
      return (_loadPromise[url] = Promise.resolve(null));
    }

    _loadPromise[url] = new Promise(function (resolve) {
      ld.load(url,
        function (gltf) {
          var scene = gltf && (gltf.scene || (gltf.scenes && gltf.scenes[0]));
          if (!scene) { _tpl[url] = null; resolve(null); return; }
          scene.traverse(function (o) {
            if (o.isMesh) {
              o.castShadow = false; o.receiveShadow = false;
              if (o.material && o.material.map == null && o.material.color &&
                  o.material.color.getHex() === 0xffffff) {
                o.material.color.setHex(0xcfd3da);   // untextured NASA models are stark white
              }
            }
          });
          _tpl[url] = scene;
          resolve(scene);
        },
        undefined,
        function (err) {
          console.warn('[render/VehicleRenderer] model load failed "' + url + '" → procedural', err);
          _tpl[url] = null;
          resolve(null);
        });
    });
    return _loadPromise[url];
  }

  /** Preload every meshUrl in the catalog. Returns Promise.all (never rejects). */
  function preload(catalog) {
    var urls = {};
    (catalog && catalog.all ? catalog.all() : []).forEach(function (p) {
      if (p.meshUrl) urls[p.meshUrl] = 1;
    });
    return Promise.all(Object.keys(urls).map(loadModel));
  }

  /** Ensure just the models THIS vehicle needs are loaded before it is displayed. */
  function ensureFor(vehicle) {
    var urls = {};
    ((vehicle && vehicle.instances) || []).forEach(function (i) {
      if (i.part && i.part.meshUrl) urls[i.part.meshUrl] = 1;
    });
    return Promise.all(Object.keys(urls).map(loadModel));
  }

  /** Clone a loaded template, scaled + recentred so its bbox centre sits at the node. */
  function instantiateModel(url, entry) {
    var tpl = _tpl[url];
    if (!tpl) return null;
    var m = tpl.clone(true);
    var s = (entry.meshScale || 1);
    m.scale.setScalar(s);
    m.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(m);
    if (box.isEmpty()) { m.position.set(entry.world.x, entry.world.y, entry.world.z); }
    else {
      var c = box.getCenter(new THREE.Vector3());
      m.position.set(entry.world.x - c.x, entry.world.y - c.y, entry.world.z - c.z);
    }
    m.userData.iid = entry.iid;
    return m;
  }

  // ---------------------------------------------------------------------------
  //  PURE — grid graph -> world placements (no THREE)
  // ---------------------------------------------------------------------------

  /**
   * @param {import('../core/Vehicle').Vehicle} vehicle
   * @returns {{
   *   parts:{iid:number,partId:string,category:string,
   *          world:{x:number,y:number,z:number},
   *          dims:{w:number,h:number,d:number}}[],
   *   bounds:{center:{x:number,y:number,z:number}, radius:number, height:number}
   * }}
   */
  function layout(vehicle) {
    var M = mpc();
    var insts = (vehicle && vehicle.instances) || [];
    if (!insts.length) {
      return { parts: [], bounds: { center: { x: 0, y: 0, z: 0 }, radius: 1, height: 0 } };
    }

    var minGX = Infinity, maxGX = -Infinity, minGY = Infinity, maxGY = -Infinity;
    insts.forEach(function (i) {
      minGX = Math.min(minGX, i.gx);
      maxGX = Math.max(maxGX, i.gx + i.part.size.w);
      minGY = Math.min(minGY, i.gy);
      maxGY = Math.max(maxGY, i.gy + i.part.size.h);
    });
    var hCenter = (minGX + maxGX) / 2;

    var parts = insts.map(function (i) {
      var w = i.part.size.w, h = i.part.size.h;
      var cx = i.gx + w / 2, cy = i.gy + h / 2;
      return {
        iid: i.iid,
        partId: i.part.id,
        category: i.part.category,
        meshUrl: i.part.meshUrl || null,
        meshScale: i.part.meshScale || 1,
        world: {
          x: (cx - hCenter) * M,
          y: (maxGY - cy) * M,        // grid +y is DOWN; world +y is UP
          z: 0
        },
        dims: { w: w * M, h: h * M, d: Math.min(w, h) * M }
      };
    });

    var height = (maxGY - minGY) * M;
    return {
      parts: parts,
      bounds: {
        center: { x: 0, y: height / 2, z: 0 },
        radius: Math.max(height, (maxGX - minGX) * M) * 0.62,
        height: height
      },
      // grid→world mapping constants, so CoM/CoP markers (which come from
      // Vehicle.computeStats in CELL coords) can be placed in the same frame:
      //   worldX = (cellX - hCenter) * M ;  worldY = (maxGY - cellY) * M
      grid: { hCenter: hCenter, maxGY: maxGY, minGY: minGY, M: M }
    };
  }

  /** Map a CoM/CoP point (Vehicle cell coords) into VehicleRenderer world space. */
  function cellToWorld(grid, cx, cy) {
    return {
      x: (cx - grid.hCenter) * grid.M,
      y: (grid.maxGY - cy) * grid.M,
      z: 0
    };
  }

  // ---------------------------------------------------------------------------
  //  THREE — skin the layout
  // ---------------------------------------------------------------------------

  function makeMesh(entry) {
    var d = entry.dims;
    var color = CAT_COLOR[entry.category] || 0x9aa7b4;
    var geo, mat, mesh;

    // ---- LOADED .glb MODEL (if cached) — else fall through to procedural ----
    if (entry.meshUrl && _tpl[entry.meshUrl]) {
      var loaded = instantiateModel(entry.meshUrl, entry);
      if (loaded) return loaded;
    }

    // ---- ERA 3 · V-2 / A4 — the authentic 1944 silhouette --------------
    //  thick cylindrical body · long pointed OGIVE nose · FOUR large swept
    //  aerodynamic fins running past the nozzle · black-and-white roll paint.
    //  No wings, no external tanks, no capsule — a piece of 1940s engineering.
    if (entry.partId === 'v2_nose') {
      // a tangent-ogive nose: full radius at the base, curving to a sharp tip
      var v2ncGeo = new THREE.ConeGeometry(d.w * 0.46, d.h * 1.35, 30);
      var vp = v2ncGeo.attributes.position;
      var vHalf = d.h * 0.675;
      for (var vi = 0; vi < vp.count; vi++) {
        var vny = (vp.getY(vi) + vHalf) / (d.h * 1.35);        // 0 base → 1 tip
        vny = vny < 0 ? 0 : (vny > 1 ? 1 : vny);
        var vcur = Math.sqrt(vp.getX(vi) * vp.getX(vi) + vp.getZ(vi) * vp.getZ(vi));
        if (vcur < 1e-6) continue;
        var vwant = (d.w * 0.46) * Math.pow(Math.cos(vny * Math.PI / 2), 0.62);
        var vsc = vwant / vcur;
        vp.setX(vi, vp.getX(vi) * vsc);
        vp.setZ(vi, vp.getZ(vi) * vsc);
      }
      v2ncGeo.computeVertexNormals();
      var v2skin = v2SkinTex();
      mesh = new THREE.Mesh(v2ncGeo, new THREE.MeshStandardMaterial({
        map: v2skin, color: v2skin ? 0xffffff : 0xe9e7df,
        roughness: 0.62, metalness: 0.12
      }));
      mesh.castShadow = true;
      mesh.position.set(entry.world.x, entry.world.y, entry.world.z);
      mesh.userData.iid = entry.iid;
      return mesh;
    }
    if (entry.partId === 'v2_tank') {
      var v2body = v2SkinTex();
      geo = new THREE.CylinderGeometry(d.w * 0.46, d.w * 0.46, d.h * 0.99, 30);
      mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        map: v2body, color: v2body ? 0xffffff : 0xe9e7df,
        roughness: 0.6, metalness: 0.14
      }));
      mesh.castShadow = true;
      var seam = new THREE.Mesh(
        new THREE.TorusGeometry(d.w * 0.462, d.w * 0.02, 6, 28),
        new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.7 }));
      seam.rotation.x = Math.PI / 2;
      mesh.add(seam);
      mesh.position.set(entry.world.x, entry.world.y, entry.world.z);
      mesh.userData.iid = entry.iid;
      return mesh;
    }
    if (entry.partId === 'v2_engine') {
      var eg = new THREE.Group();
      // tapered aft body / boat-tail — brushed steel, not painted
      var body = new THREE.Mesh(
        new THREE.CylinderGeometry(d.w * 0.46, d.w * 0.40, d.h * 0.66, 28),
        new THREE.MeshStandardMaterial({ color: 0x6c6f76, roughness: 0.55, metalness: 0.45 }));
      body.position.y = d.h * 0.14;
      body.castShadow = true;
      var bell = new THREE.Mesh(
        new THREE.CylinderGeometry(d.w * 0.17, d.w * 0.40, d.h * 0.46, 24, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x1f1f24, roughness: 0.42, metalness: 0.6, side: THREE.DoubleSide }));
      bell.position.y = -d.h * 0.34;
      eg.add(body); eg.add(bell);

      // ---- FOUR large swept trapezoidal fins — the A4's defining feature.
      //  A full body-diameter of span per side, root chord running past the
      //  nozzle exit. Alternating white / black to carry the roll pattern aft.
      var finWhite = new THREE.MeshStandardMaterial({
        color: 0xe9e7df, roughness: 0.62, metalness: 0.08, side: THREE.DoubleSide });
      var finBlack = new THREE.MeshStandardMaterial({
        color: 0x1b1b1b, roughness: 0.7, metalness: 0.08, side: THREE.DoubleSide });
      var fSpan = d.w * 1.15, fRoot = d.h * 1.05, fTip = d.h * 0.42;
      var fThick = d.w * 0.06, fSweep = d.h * 0.5;
      var finShape = new THREE.Shape();
      finShape.moveTo(0, fRoot * 0.5);
      finShape.lineTo(fSpan, fRoot * 0.5 - fSweep);
      finShape.lineTo(fSpan, fRoot * 0.5 - fSweep - fTip);
      finShape.lineTo(0, -fRoot * 0.5);
      finShape.closePath();
      var finGeo = new THREE.ExtrudeGeometry(finShape, { depth: fThick, bevelEnabled: false });
      finGeo.translate(0, 0, -fThick / 2);
      for (var fn = 0; fn < 4; fn++) {
        var blade = new THREE.Mesh(finGeo, fn % 2 ? finBlack : finWhite);
        blade.castShadow = true;
        blade.position.x = d.w * 0.42;
        var hold = new THREE.Group();
        hold.add(blade);
        hold.rotation.y = fn * Math.PI / 2;
        hold.position.y = -d.h * 0.30;   // low — the fin roots straddle the bell
        eg.add(hold);
      }
      // a light tail ring bracing the four fin roots
      var tailRing = new THREE.Mesh(
        new THREE.TorusGeometry(d.w * 0.44, d.w * 0.03, 6, 24),
        new THREE.MeshStandardMaterial({ color: 0x33343a, roughness: 0.6 }));
      tailRing.rotation.x = Math.PI / 2;
      tailRing.position.y = -d.h * 0.55;
      eg.add(tailRing);

      var flame = new THREE.Mesh(
        new THREE.ConeGeometry(d.w * 0.20, d.h * 0.9, 16),
        new THREE.MeshBasicMaterial({ color: 0xffd07a }));
      flame.position.y = -d.h * 0.9;
      flame.rotation.x = Math.PI;
      eg.add(flame);
      eg.position.set(entry.world.x, entry.world.y, entry.world.z);
      eg.userData.iid = entry.iid;
      eg.userData.isMotor = true;
      eg.userData.exhaustLocalY = -d.h * 0.6;
      return eg;
    }

    // ---- ERA 1 · Bang Fai ------------------------------------------------
    if (entry.partId === 'nose_cone_wood') {
      geo = new THREE.ConeGeometry(d.w * 0.42, d.h * 0.95, 20);
      mat = new THREE.MeshStandardMaterial({ color: 0xbf9057, roughness: 0.7, metalness: 0.05 });
      mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(entry.world.x, entry.world.y, entry.world.z);
      mesh.userData.iid = entry.iid;
      return mesh;
    }

    if (entry.partId === 'body_tube_bamboo') {
      geo = new THREE.CylinderGeometry(d.w * 0.40, d.w * 0.40, d.h * 0.96, 18);
      mat = new THREE.MeshStandardMaterial({ color: 0xa7ad5f, roughness: 0.72, metalness: 0.0 });
      mesh = new THREE.Mesh(geo, mat);
      // a couple of bamboo nodes for silhouette
      var ring = new THREE.Mesh(
        new THREE.TorusGeometry(d.w * 0.41, d.w * 0.05, 6, 18),
        new THREE.MeshStandardMaterial({ color: 0x7f8443, roughness: 0.8 }));
      ring.rotation.x = Math.PI / 2;
      mesh.add(ring);
      mesh.position.set(entry.world.x, entry.world.y, entry.world.z);
      mesh.userData.iid = entry.iid;
      return mesh;
    }

    if (entry.partId === 'motor_blackpowder') {
      var g = new THREE.Group();
      var casing = new THREE.Mesh(
        new THREE.CylinderGeometry(d.w * 0.34, d.w * 0.36, d.h * 0.80, 18),
        new THREE.MeshStandardMaterial({ color: 0x3b3b44, roughness: 0.55, metalness: 0.15 }));
      var nozzle = new THREE.Mesh(
        new THREE.CylinderGeometry(d.w * 0.16, d.w * 0.30, d.h * 0.16, 16),
        new THREE.MeshStandardMaterial({ color: 0x26262c, roughness: 0.5, metalness: 0.3 }));
      nozzle.position.y = -d.h * 0.46;
      var flame = new THREE.Mesh(
        new THREE.ConeGeometry(d.w * 0.20, d.h * 0.7, 14),
        new THREE.MeshBasicMaterial({ color: 0xffb63a }));
      flame.position.y = -d.h * 0.78;
      flame.rotation.x = Math.PI;
      g.add(casing); g.add(nozzle); g.add(flame);
      g.position.set(entry.world.x, entry.world.y, entry.world.z);
      g.userData.iid = entry.iid;
      g.userData.isMotor = true;
      g.userData.exhaustLocalY = -d.h * 0.55;
      return g;
    }

    // ---- ERA 1 · Bang Fai (traditional Isan rocket) ------------------
    if (entry.partId === 'payload_howot') {
      // โหวด — a cluster of split bamboo whistle tubes lashed at the nose
      var hg2 = new THREE.Group();
      var tubeMat = new THREE.MeshStandardMaterial({ color: 0x9a7b45, roughness: 0.85 });
      var nT = 6;
      for (var ht = 0; ht < nT; ht++) {
        var ang2 = ht / nT * Math.PI * 2;
        var tube = new THREE.Mesh(
          new THREE.CylinderGeometry(d.w * 0.09, d.w * 0.09, d.h * 0.9, 7),
          tubeMat);
        tube.position.set(Math.cos(ang2) * d.w * 0.16, 0, Math.sin(ang2) * d.w * 0.16);
        tube.rotation.x = 0.08 * Math.cos(ang2);
        tube.rotation.z = 0.08 * Math.sin(ang2);
        hg2.add(tube);
      }
      var band = new THREE.Mesh(
        new THREE.TorusGeometry(d.w * 0.26, d.w * 0.04, 6, 16),
        new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.9 }));
      band.rotation.x = Math.PI / 2;
      band.position.y = -d.h * 0.15;
      hg2.add(band);
      hg2.position.set(entry.world.x, entry.world.y, entry.world.z);
      hg2.userData.iid = entry.iid;
      hg2.userData.isNoseWhistle = true;   // burns through + blows off at apogee breakup
      return hg2;
    }

    if (entry.partId === 'body_lao') {
      // เลา — a fat bamboo / rope-wound PVC tube
      var lg2 = new THREE.Group();
      var laoMat = new THREE.MeshStandardMaterial({ color: 0xc9b487, roughness: 0.78 });
      var body2 = new THREE.Mesh(
        new THREE.CylinderGeometry(d.w * 0.40, d.w * 0.40, d.h * 0.98, 20), laoMat);
      lg2.add(body2);
      // lashings of cord every ~0.4 m
      var lashMat = new THREE.MeshStandardMaterial({ color: 0x6b4a28, roughness: 0.95 });
      var nL = Math.max(2, Math.round(d.h / 0.4));
      for (var li = 0; li < nL; li++) {
        var lash = new THREE.Mesh(
          new THREE.TorusGeometry(d.w * 0.41, d.w * 0.045, 5, 18), lashMat);
        lash.rotation.x = Math.PI / 2;
        lash.position.y = -d.h * 0.46 + (li + 0.5) * (d.h * 0.92 / nL);
        lg2.add(lash);
      }
      lg2.position.set(entry.world.x, entry.world.y, entry.world.z);
      lg2.userData.iid = entry.iid;
      return lg2;
    }

    if (entry.partId === 'propulsion_mue') {
      // หมื่อ — a heavy hand-rammed black-powder cartridge, wide clay nozzle
      var mg = new THREE.Group();
      var casing2 = new THREE.Mesh(
        new THREE.CylinderGeometry(d.w * 0.38, d.w * 0.40, d.h * 0.82, 20),
        new THREE.MeshStandardMaterial({ color: 0x2e2620, roughness: 0.7, metalness: 0.05 }));
      var wrap = new THREE.Mesh(
        new THREE.CylinderGeometry(d.w * 0.41, d.w * 0.41, d.h * 0.5, 20, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.95, side: THREE.DoubleSide }));
      wrap.position.y = d.h * 0.1;
      var nozzle2 = new THREE.Mesh(
        new THREE.CylinderGeometry(d.w * 0.14, d.w * 0.42, d.h * 0.22, 20, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x4a2f1c, roughness: 0.9, side: THREE.DoubleSide }));
      nozzle2.position.y = -d.h * 0.5;
      // NO rigid flame cone here — the fire is a live additive particle plume
      // driven by ExhaustFX, emitted from the exact centre of this nozzle.
      mg.add(casing2); mg.add(wrap); mg.add(nozzle2);
      mg.position.set(entry.world.x, entry.world.y, entry.world.z);
      mg.userData.iid = entry.iid;
      mg.userData.isMotor = true;
      // the flame/plume leaves from the throat, dead-centre of the nozzle
      mg.userData.exhaustLocalY = -d.h * 0.62;
      return mg;
    }

    if (entry.partId === 'frame_tailstick') {
      // หาง — a very long, thin bamboo stick lashed alongside the เลา, running
      // metres past the nozzle. The whole reason the rocket flies straight.
      var tg2 = new THREE.Group();
      var stickMat = new THREE.MeshStandardMaterial({ color: 0xbfa25f, roughness: 0.82 });
      var stick = new THREE.Mesh(
        new THREE.CylinderGeometry(d.w * 0.06, d.w * 0.085, d.h * 0.99, 8), stickMat);
      tg2.add(stick);
      // a few bamboo nodes + the lashings that tie it to the body
      var nodeMat = new THREE.MeshStandardMaterial({ color: 0x8a7038, roughness: 0.9 });
      var segs = Math.max(3, Math.round(d.h / 0.8));
      for (var si = 0; si < segs; si++) {
        var kn = new THREE.Mesh(
          new THREE.TorusGeometry(d.w * 0.08, d.w * 0.02, 4, 10), nodeMat);
        kn.rotation.x = Math.PI / 2;
        kn.position.y = -d.h * 0.49 + (si + 0.5) * (d.h * 0.98 / segs);
        tg2.add(kn);
      }
      tg2.position.set(entry.world.x, entry.world.y, entry.world.z);
      tg2.userData.iid = entry.iid;
      return tg2;
    }

    // ---- ENGINEERED transitional parts (nose cone + fins) ------------
    if (entry.partId === 'payload_nosecone') {
      // a smooth ogive nose — glossy, aerospace, a world away from the whistle
      var ncGeo = new THREE.ConeGeometry(d.w * 0.4, d.h * 1.3, 28);
      var ncPos = ncGeo.attributes.position;
      for (var nci = 0; nci < ncPos.count; nci++) {   // pinch to an ogive curve
        var ny = (ncPos.getY(nci) + d.h * 0.65) / (d.h * 1.3);   // 0 base → 1 tip
        var f = Math.sqrt(Math.max(0, 1 - (1 - ny) * (1 - ny)));
        ncPos.setX(nci, ncPos.getX(nci) * f);
        ncPos.setZ(nci, ncPos.getZ(nci) * f);
      }
      ncGeo.computeVertexNormals();
      var nc = new THREE.Mesh(ncGeo, new THREE.MeshStandardMaterial({
        color: 0xe6e9ee, roughness: 0.28, metalness: 0.45 }));
      nc.castShadow = true;
      nc.position.set(entry.world.x, entry.world.y + d.h * 0.1, entry.world.z);
      nc.userData.iid = entry.iid;
      return nc;
    }

    if (entry.partId === 'aero_fin_straight' || entry.partId === 'aero_fin_canted') {
      var canted = entry.partId === 'aero_fin_canted';
      var fgrp = new THREE.Group();
      var finMat = new THREE.MeshStandardMaterial({
        color: canted ? 0x8a5cc0 : 0x53606e, roughness: 0.5, metalness: 0.25,
        side: THREE.DoubleSide });
      // 3 swept trapezoidal blades on the airframe axis
      var span = d.w * 0.95, root = d.h * 0.86, tip = d.h * 0.4, thick = d.w * 0.05;
      var shape = new THREE.Shape();
      shape.moveTo(0, root * 0.5);
      shape.lineTo(span, tip * 0.5 - root * 0.15);
      shape.lineTo(span, -tip * 0.5 - root * 0.15);
      shape.lineTo(0, -root * 0.5);
      shape.closePath();
      var bladeGeo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
      bladeGeo.translate(0, 0, -thick / 2);
      for (var fb = 0; fb < 3; fb++) {
        var blade = new THREE.Mesh(bladeGeo, finMat);
        blade.castShadow = true;
        var holder = new THREE.Group();
        holder.add(blade);
        holder.rotation.y = fb * (Math.PI * 2 / 3);
        if (canted) blade.rotation.y = 0.16;   // the cant that induces spin
        fgrp.add(holder);
      }
      // a small tail ring tying the fins together
      var ring = new THREE.Mesh(
        new THREE.TorusGeometry(d.w * 0.16, d.w * 0.03, 6, 20),
        new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.6 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -root * 0.42;
      fgrp.add(ring);
      // fins ride the airframe axis (x≈0) at the aft Y the layout gave this part
      fgrp.position.set(0, entry.world.y, 0);
      fgrp.userData.iid = entry.iid;
      fgrp.userData.isFin = true;
      return fgrp;
    }

    // ---- ERA 1.5 · Fireworks ------------------------------------------
    if (entry.partId === 'fw_mortar_tube') {
      geo = new THREE.CylinderGeometry(d.w * 0.44, d.w * 0.46, d.h * 0.94, 22);
      mat = new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.85, metalness: 0.1 });
      mesh = new THREE.Mesh(geo, mat);
      var lip = new THREE.Mesh(
        new THREE.TorusGeometry(d.w * 0.44, d.w * 0.05, 8, 22),
        new THREE.MeshStandardMaterial({ color: 0x1a1d26, roughness: 0.8 }));
      lip.rotation.x = Math.PI / 2;
      lip.position.y = d.h * 0.46;
      mesh.add(lip);
      mesh.position.set(entry.world.x, entry.world.y, entry.world.z);
      mesh.userData.iid = entry.iid;
      return mesh;
    }

    if (entry.partId === 'fw_lift_charge') {
      var lg = new THREE.Group();
      var wad = new THREE.Mesh(
        new THREE.CylinderGeometry(d.w * 0.30, d.w * 0.34, d.h * 0.5, 16),
        new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.9,
          emissive: 0xff5a1c, emissiveIntensity: 0.7 }));
      var flash = new THREE.Mesh(
        new THREE.ConeGeometry(d.w * 0.24, d.h * 0.6, 14),
        new THREE.MeshBasicMaterial({ color: 0xffd66a }));
      flash.position.y = -d.h * 0.5;
      flash.rotation.x = Math.PI;
      lg.add(wad); lg.add(flash);
      lg.position.set(entry.world.x, entry.world.y, entry.world.z);
      lg.userData.iid = entry.iid;
      lg.userData.isMotor = true;
      lg.userData.exhaustLocalY = -d.h * 0.5;
      return lg;
    }

    if (entry.partId === 'fw_shell_peony') {
      geo = new THREE.SphereGeometry(Math.min(d.w, d.h) * 0.42, 20, 16);
      mat = new THREE.MeshStandardMaterial({ color: 0x8a3d6b, roughness: 0.5, metalness: 0.15,
        emissive: 0x2a0f22, emissiveIntensity: 0.6 });
      mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(entry.world.x, entry.world.y, entry.world.z);
      mesh.userData.iid = entry.iid;
      return mesh;
    }

    if (entry.partId === 'fin_wood') {
      // a set of 3 thin blades around the airframe axis (x≈0), aft-swept
      var fg = new THREE.Group();
      var bladeMat = new THREE.MeshStandardMaterial({
        color: 0x8a5a33, roughness: 0.8, metalness: 0.0, side: THREE.DoubleSide });
      var span = d.w * 0.85, chord = d.h * 0.9, thick = d.w * 0.06;
      for (var f = 0; f < 3; f++) {
        var blade = new THREE.Mesh(new THREE.BoxGeometry(span, chord, thick), bladeMat);
        blade.position.x = span * 0.5;
        var holder = new THREE.Group();
        holder.add(blade);
        holder.rotation.y = f * (Math.PI * 2 / 3);
        fg.add(holder);
      }
      // fins sit on the airframe axis, at the aft Y the layout gave this part
      fg.position.set(0, entry.world.y, 0);
      fg.userData.iid = entry.iid;
      return fg;
    }

    // ---- ERA 0 · Khom Loy — the renderer's showpiece -----------------
    //  A real khom loy: an octagonal mulberry-paper TUBE, open at the mouth,
    //  gathered to a FLAT (slightly folded) top — like a paper bag. NO point.
    //  It drapes over a thin bamboo skeleton with a wax core burning at its
    //  mouth. MeshPhysicalMaterial paper lets the flame + skeleton read
    //  through it; a flickering PointLight + glowing flame live at the core
    //  (driven by RS.render.VehicleRenderer.flicker).
    if (entry.partId === 'cover_paper') {
      var pr = Math.max(d.w, d.d) * 1.0;      // ~1 m across — a real big khom loy
      var ph = d.h * 1.85;
      var paperMat = new THREE.MeshPhysicalMaterial({
        color: 0xffe9cf,               // warm off-white mulberry paper
        roughness: 0.5,
        metalness: 0.0,
        transmission: 0.7,             // the flame + skeleton read through it
        thickness: 0.4,
        ior: 1.35,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
        emissive: 0xffffff,
        emissiveIntensity: 0.85,       // the paper itself glows…
        emissiveMap: paperGradientTex() // …hot at the mouth, dark amber up top
      });
      // the gathered top catches little of the flame — a dimmer amber material
      var topMat = new THREE.MeshPhysicalMaterial({
        color: 0xe9caa6, roughness: 0.55, metalness: 0.0,
        transmission: 0.3, thickness: 0.4, ior: 1.35,
        side: THREE.DoubleSide, transparent: true, opacity: 0.92,
        emissive: 0x24110a, emissiveIntensity: 0.35
      });
      var pg = new THREE.Group();
      // slightly flared mouth · near-straight octagonal barrel · short gathered
      // shoulder · flat octagonal lid — a paper bag, not a circus tent.
      var pskirt = new THREE.Mesh(
        new THREE.CylinderGeometry(pr * 0.98, pr * 0.72, ph * 0.20, 8, 1, true), paperMat);
      pskirt.position.y = -ph * 0.37;
      var pbody = new THREE.Mesh(
        new THREE.CylinderGeometry(pr * 0.95, pr * 1.0, ph * 0.56, 8, 1, true), paperMat);
      pbody.position.y = -ph * 0.03;
      var pshoulder = new THREE.Mesh(
        new THREE.CylinderGeometry(pr * 0.5, pr * 0.95, ph * 0.13, 8, 1, true), topMat);
      pshoulder.position.y = ph * 0.315;
      var plid = new THREE.Mesh(new THREE.CircleGeometry(pr * 0.5, 8), topMat);
      plid.rotation.x = -Math.PI / 2;
      plid.position.y = ph * 0.38;
      [pskirt, pbody, pshoulder, plid].forEach(function (m) {
        m.castShadow = true; m.receiveShadow = true; pg.add(m);
      });
      // drop the whole envelope so its mouth wraps the frame + wax below it
      pg.position.set(entry.world.x, entry.world.y - d.h * 0.9, entry.world.z);
      pg.userData.iid = entry.iid;
      return pg;
    }

    if (entry.partId === 'frame_bamboo') {
      var fr = d.w * 0.44;
      var fbh = d.h * 0.86;
      var fg = new THREE.Group();
      // crisp bamboo skeleton — EdgesGeometry of an 8-gon prism, as line segments
      var cage = new THREE.CylinderGeometry(fr, fr, fbh, 8, 1, true);
      fg.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(cage),
        new THREE.LineBasicMaterial({ color: 0x9c6b3a })));
      cage.dispose();
      // thin real struts co-located with the lines: lines never cast shadows,
      // so these are what silhouette the frame against the glowing paper
      var strutMat = new THREE.MeshStandardMaterial({ color: 0x7c4f28, roughness: 0.85 });
      var ribGeo = new THREE.CylinderGeometry(fbh * 0.012, fbh * 0.012, fbh, 5);
      for (var fi = 0; fi < 8; fi++) {
        var rib = new THREE.Mesh(ribGeo, strutMat);
        var fa = fi / 8 * TAU + Math.PI / 8;
        rib.position.set(Math.cos(fa) * fr, 0, Math.sin(fa) * fr);
        rib.castShadow = true;
        fg.add(rib);
      }
      var ringGeo = new THREE.TorusGeometry(fr, fbh * 0.016, 5, 8);
      [fbh * 0.5, -fbh * 0.5].forEach(function (yy) {
        var ring = new THREE.Mesh(ringGeo, strutMat);
        ring.rotation.x = Math.PI / 2;
        ring.rotation.z = Math.PI / 8;
        ring.position.y = yy;
        ring.castShadow = true;
        fg.add(ring);
      });
      // two cross struts spanning the mouth — this is what the wax hangs from
      var barGeo = new THREE.CylinderGeometry(fbh * 0.01, fbh * 0.01, fr * 2, 5);
      for (var bi = 0; bi < 2; bi++) {
        var bar = new THREE.Mesh(barGeo, strutMat);
        bar.rotation.z = Math.PI / 2;
        bar.rotation.y = bi * Math.PI / 2;
        bar.position.y = -fbh * 0.5;
        bar.castShadow = true;
        fg.add(bar);
      }
      fg.position.set(entry.world.x, entry.world.y, entry.world.z);
      fg.userData.iid = entry.iid;
      return fg;
    }

    if (entry.partId === 'fuel_wax') {
      var wg = new THREE.Group();
      // the paraffin-soaked cloth core — a dark, barely-lit lump
      var wax = new THREE.Mesh(
        new THREE.SphereGeometry(d.w * 0.17, 14, 12),
        new THREE.MeshStandardMaterial({
          color: 0x241812, roughness: 0.95, metalness: 0.0,
          emissive: 0xff3c00, emissiveIntensity: 0.55
        }));
      wax.scale.y = 0.68;
      wg.add(wax);
      // flame — two additive cones: a teardrop amber body and a white heart
      var flame = new THREE.Mesh(
        new THREE.ConeGeometry(d.w * 0.19, d.h * 0.74, 14),
        new THREE.MeshBasicMaterial({
          color: 0xffb347, transparent: true, opacity: 0.85,
          blending: THREE.AdditiveBlending, depthWrite: false
        }));
      flame.position.y = d.h * 0.3;
      var flameCore = new THREE.Mesh(
        new THREE.ConeGeometry(d.w * 0.09, d.h * 0.44, 12),
        new THREE.MeshBasicMaterial({
          color: 0xfff2d0, transparent: true, opacity: 0.95,
          blending: THREE.AdditiveBlending, depthWrite: false
        }));
      flameCore.position.y = d.h * 0.2;
      wg.add(flame); wg.add(flameCore);
      // THE LIGHT — at the core, low inside the envelope. Its r² falloff is
      // what paints the paper: bright glowing orange at the base, fading to
      // dark warm amber at the crown.
      var flameLight = new THREE.PointLight(0xff6600, 2.5, 10, 2);
      flameLight.position.y = d.h * 0.12;
      wg.add(flameLight);
      wg.userData.flicker = {
        light: flameLight, base: 2.5, flame: flame, flameCore: flameCore,
        // hot amber → deep-red ember; the flame material is lerped between
        // these as `scale` (net-heat) drops, so a dying flame reddens + shrinks
        hotCol: new THREE.Color(0xffb347), emberCol: new THREE.Color(0x5a1400),
        lightHot: new THREE.Color(0xff6600), lightEmber: new THREE.Color(0x40140a)
      };
      wg.position.set(entry.world.x, entry.world.y, entry.world.z);
      wg.userData.iid = entry.iid;
      return wg;
    }

    // generic Propulsion fallback (any motor without its own model/branch)
    if (entry.category === 'Propulsion') {
      geo = new THREE.CylinderGeometry(d.w * 0.30, d.w * 0.34, d.h * 0.60, 16);
      mat = new THREE.MeshStandardMaterial({
        color: 0xd8c9a0, roughness: 0.5, metalness: 0.05,
        emissive: 0xff6a1c, emissiveIntensity: 0.9
      });
      mesh = new THREE.Mesh(geo, mat);
      var gflame = new THREE.Mesh(
        new THREE.ConeGeometry(d.w * 0.16, d.h * 0.5, 12),
        new THREE.MeshBasicMaterial({ color: 0xffb63a })
      );
      gflame.position.y = d.h * 0.5;
      mesh.add(gflame);
      mesh.position.set(entry.world.x, entry.world.y, entry.world.z);
      mesh.userData.iid = entry.iid;
      return mesh;
    }

    // Structural (bamboo hoop) + generic fallback: a cylinder
    if (entry.partId === 'frame_bamboo' || entry.category === 'Structural') {
      geo = new THREE.CylinderGeometry(d.w * 0.46, d.w * 0.46, d.h * 0.42, 20, 1, true);
      mat = new THREE.MeshStandardMaterial({
        color: color, roughness: 0.7, metalness: 0.0, side: THREE.DoubleSide
      });
    } else if (entry.category === 'Payload') {
      geo = new THREE.BoxGeometry(d.w * 0.7, d.h * 0.7, d.d * 0.7);
      mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.4, metalness: 0.3 });
    } else {
      geo = new THREE.CylinderGeometry(d.w * 0.4, d.w * 0.4, d.h * 0.8, 16);
      mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.6 });
    }
    mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(entry.world.x, entry.world.y, entry.world.z);
    mesh.userData.iid = entry.iid;
    return mesh;
  }

  /**
   * Build a vehicle Group. SYNCHRONOUS — parts whose .glb is already cached use
   * it; the rest use procedural primitives. If a model is still loading, the
   * placeholder is swapped for the real mesh when it arrives, and
   * `group.userData.modelsReady` resolves once every swap is done.
   *
   * @param {import('../core/Vehicle').Vehicle} vehicle
   * @param {{markers?:boolean}} [opts]  markers → attach live CoM/CoP spheres
   * @returns {THREE.Group|null}  null if THREE is unavailable
   */
  function build(vehicle, opts) {
    if (!THREE) { console.warn('[render/VehicleRenderer] THREE missing'); return null; }
    opts = opts || {};
    var lo = layout(vehicle);
    var group = new THREE.Group();
    var meshes = {};
    var pending = [];

    lo.parts.forEach(function (entry) {
      var m = makeMesh(entry);
      meshes[entry.iid] = m;
      group.add(m);

      // model requested but not cached yet → load, then swap the placeholder
      if (entry.meshUrl && !_tpl[entry.meshUrl]) {
        pending.push(loadModel(entry.meshUrl).then(function (tpl) {
          if (!tpl || group.userData.disposed) return;
          var real = instantiateModel(entry.meshUrl, entry);
          if (!real) return;
          var old = meshes[entry.iid];
          if (old && old.parent === group) group.remove(old);
          meshes[entry.iid] = real;
          group.add(real);
          recomputeExhaustY(group, meshes);
        }));
      }
    });

    var flickers = [];
    Object.keys(meshes).forEach(function (k) {
      var m = meshes[k];
      if (m && m.userData && m.userData.flicker) flickers.push(m.userData.flicker);
    });

    group.userData.partMeshes = meshes;
    group.userData.flicker = flickers;   // khom-loy flames — see flicker()
    group.userData.bounds = lo.bounds;
    group.userData.grid = lo.grid;
    group.userData.isVehicle = true;
    recomputeExhaustY(group, meshes);
    group.userData.modelsReady = pending.length ? Promise.all(pending) : Promise.resolve();

    // Assembly-view engineering feedback: the CoM / CoP checkered markers
    if (opts.markers) {
      var mg = buildMarkers(vehicle, lo);
      if (mg) { group.add(mg); group.userData.partMarkers = mg; }
    }
    return group;
  }

  // ---------------------------------------------------------------------------
  //  TACTILE PLACEMENT BOUNCE — a newly-placed part springs into shape
  // ---------------------------------------------------------------------------

  /** Flag a part's mesh to play a scale-overshoot + tiny spin on the next frames. */
  function pulsePart(group, iid) {
    var meshes = group && group.userData && group.userData.partMeshes;
    var m = meshes && meshes[iid];
    if (!m) return;
    m.userData._pulse = { t: 0, dur: 0.46, baseRotY: m.rotation.y };
  }

  /** Advance every active placement bounce. Call once per rendered frame. */
  function updatePulses(group, dt) {
    var meshes = group && group.userData && group.userData.partMeshes;
    if (!meshes) return;
    Object.keys(meshes).forEach(function (k) {
      var m = meshes[k];
      var p = m && m.userData && m.userData._pulse;
      if (!p) return;
      p.t += (dt || 0.016);
      var x = Math.min(1, p.t / p.dur);
      // easeOutBack overshoot settling to 1
      var c1 = 1.70158, c3 = c1 + 1;
      var back = 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
      var s = 0.62 + 0.38 * back;                 // starts small, overshoots, settles
      m.scale.setScalar(s);
      m.rotation.y = p.baseRotY + Math.sin(x * Math.PI) * 0.22 * (1 - x);
      if (x >= 1) { m.scale.setScalar(1); m.rotation.y = p.baseRotY; delete m.userData._pulse; }
    });
  }

  function recomputeExhaustY(group, meshes) {
    var exhaustY = null, exhaustX = 0, exhaustZ = 0;
    Object.keys(meshes).forEach(function (k) {
      var m = meshes[k];
      if (m && m.userData && m.userData.isMotor) {
        var ey = m.position.y + (m.userData.exhaustLocalY || 0);
        if (exhaustY == null || ey < exhaustY) {
          exhaustY = ey;
          // the flame + smoke must leave from the CENTRE of THIS nozzle, not
          // the stack's bounding-box axis — a Bang Fai's box is offset by the
          // radial tail stick, so the motor sits noticeably off-centre.
          exhaustX = m.position.x + (m.userData.exhaustLocalX || 0);
          exhaustZ = m.position.z + (m.userData.exhaustLocalZ || 0);
        }
      }
    });
    var b = group.userData && group.userData.bounds;
    group.userData.exhaustY = exhaustY != null ? exhaustY : (b ? -b.height * 0.1 : -0.3);
    group.userData.exhaustX = exhaustX;
    group.userData.exhaustZ = exhaustZ;
  }

  /**
   * Drive every khom-loy flame in a built vehicle group: flickers the interior
   * PointLight and jitters the flame meshes. Call once per rendered frame.
   * `active === false` snuffs them all (the flame has died). `blaze` truthy =
   * the whole envelope is on fire — pump the light + swell the flame. A pure
   * per-frame side effect — no allocation, safe on any group (no-op w/o flames).
   */
  function flicker(group, active, blaze, scale) {
    var fl = group && group.userData && group.userData.flicker;
    if (!fl || !fl.length) return;
    var now = Date.now();
    var b = blaze ? 1 : 0;
    // optional 0..1 build factor — the manual-ignition gate ramps this from 0
    // to 1 over the spool so the wick catches and grows instead of snapping on
    var s = (typeof scale === 'number' && isFinite(scale)) ? clamp01(scale) : 1;
    for (var i = 0; i < fl.length; i++) {
      var f = fl[i];
      if (active === false || s <= 0.001) {
        if (f.light) f.light.intensity = 0;
        if (f.flame) f.flame.visible = false;
        if (f.flameCore) f.flameCore.visible = false;
        continue;
      }
      // the brief's flicker signal: sin(t·0.015) + random·0.2, folded so the
      // PointLight stays lively but always positive
      var jitter = Math.sin(now * 0.015) + Math.random() * 0.2;
      // how "alive" the flame is — near 0 = a dying ember, 1 = full heat / blaze
      var vigour = Math.min(1, s + b);
      if (f.light) {
        f.light.intensity = Math.max(0.05 * s,
          (f.base || 2.5) * (0.78 + 0.16 * jitter) * (1 + b * (2.0 + Math.random())) * s);
        if (f.light.color && f.lightHot && f.lightEmber) {
          f.light.color.copy(f.lightEmber).lerp(f.lightHot, vigour);
        }
      }
      if (f.flame) {
        f.flame.visible = true;
        var sy = 0.86 + 0.26 * (0.5 + 0.5 * Math.sin(now * 0.023)) + Math.random() * 0.12;
        f.flame.scale.set((1 + b * 1.6) * s, sy * (1 + b * 1.4) * s, (1 + b * 1.6) * s);
        if (f.flame.material && f.flame.material.color && f.hotCol && f.emberCol) {
          f.flame.material.color.copy(f.emberCol).lerp(f.hotCol, vigour);
          f.flame.material.opacity = 0.42 + 0.43 * vigour;
        }
      }
      if (f.flameCore) {
        // the white-hot heart only exists when there is real heat — a dwindling
        // ember has no bright centre, just a dull amber coal
        f.flameCore.visible = vigour > 0.14;
        f.flameCore.scale.setScalar((0.85 + Math.random() * 0.22) * (1 + b * 1.2) * s);
      }
    }
  }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  /**
   * APOGEE BREAKUP — a traditional Bang Fai burns through its head + the frame
   * snaps at the top of the arc. Hide the whistle nose and let the rest tumble.
   * @returns {{x:number,y:number,z:number}|null} the whistle's world position,
   *   so the caller can spawn a few falling debris bits there.
   */
  function breakup(group) {
    if (!group || (group.userData && group.userData.brokenUp)) return null;
    group.userData.brokenUp = true;
    var meshes = (group.userData && group.userData.partMeshes) || {};
    var where = null;
    Object.keys(meshes).forEach(function (k) {
      var m = meshes[k];
      if (m && m.userData && m.userData.isNoseWhistle) {
        if (THREE && m.getWorldPosition) {
          where = m.getWorldPosition(new THREE.Vector3());
        }
        m.visible = false;
      }
    });
    return where;
  }

  function disposeGroup(group) {
    if (!group) return;
    if (group.userData) group.userData.disposed = true;
    group.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.dispose(); });
      }
    });
    if (group.parent) group.parent.remove(group);
  }

  global.RS = global.RS || {};
  global.RS.render = global.RS.render || {};
  global.RS.render.VehicleRenderer = {
    CAT_COLOR: CAT_COLOR,
    layout: layout,          // pure
    build: build,            // THREE (sync; models swap in + userData.modelsReady)
    disposeGroup: disposeGroup,
    breakup: breakup,        // apogee break-up: hide the whistle nose
    flicker: flicker,        // per-frame khom-loy flame driver
    updateMarkers: updateMarkers,  // per-frame CoM/CoP marker life (Assembly view)
    pulsePart: pulsePart,          // flag a freshly-placed part to bounce
    updatePulses: updatePulses,    // per-frame placement-bounce driver
    loadModel: loadModel,    // Promise<Object3D|null>, cached
    preload: preload,        // Promise.all over every catalog meshUrl
    ensureFor: ensureFor     // Promise.all over one vehicle's meshUrls
  };

})(typeof window !== 'undefined' ? window : this);
