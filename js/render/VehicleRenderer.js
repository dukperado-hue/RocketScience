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
      }
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

    // ---- ERA 3 · V-2 (liquid) ------------------------------------------
    if (entry.partId === 'v2_nose') {
      geo = new THREE.ConeGeometry(d.w * 0.44, d.h * 1.1, 22);
      mat = new THREE.MeshStandardMaterial({ color: 0xd7dce3, roughness: 0.4, metalness: 0.35 });
      mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(entry.world.x, entry.world.y, entry.world.z);
      mesh.userData.iid = entry.iid;
      return mesh;
    }
    if (entry.partId === 'v2_tank') {
      geo = new THREE.CylinderGeometry(d.w * 0.42, d.w * 0.42, d.h * 0.98, 24);
      mat = new THREE.MeshStandardMaterial({ color: 0x9fa6b0, roughness: 0.45, metalness: 0.4 });
      mesh = new THREE.Mesh(geo, mat);
      var seam = new THREE.Mesh(
        new THREE.TorusGeometry(d.w * 0.42, d.w * 0.03, 6, 24),
        new THREE.MeshStandardMaterial({ color: 0x6a7076, roughness: 0.6 }));
      seam.rotation.x = Math.PI / 2;
      mesh.add(seam);
      mesh.position.set(entry.world.x, entry.world.y, entry.world.z);
      mesh.userData.iid = entry.iid;
      return mesh;
    }
    if (entry.partId === 'v2_engine') {
      var eg = new THREE.Group();
      var body = new THREE.Mesh(
        new THREE.CylinderGeometry(d.w * 0.40, d.w * 0.44, d.h * 0.60, 22),
        new THREE.MeshStandardMaterial({ color: 0x3d4148, roughness: 0.5, metalness: 0.5 }));
      body.position.y = d.h * 0.15;
      var bell = new THREE.Mesh(
        new THREE.CylinderGeometry(d.w * 0.18, d.w * 0.40, d.h * 0.42, 22, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x26262c, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide }));
      bell.position.y = -d.h * 0.34;
      eg.add(body); eg.add(bell);
      // four V-2 fins — the big aft reference area that keeps it stable
      var finMat = new THREE.MeshStandardMaterial({ color: 0x53575e, roughness: 0.7, side: THREE.DoubleSide });
      for (var fn = 0; fn < 4; fn++) {
        var blade = new THREE.Mesh(new THREE.BoxGeometry(d.w * 0.5, d.h * 0.5, d.w * 0.05), finMat);
        var hold = new THREE.Group();
        blade.position.x = d.w * 0.42;
        hold.add(blade);
        hold.rotation.y = fn * Math.PI / 2;
        hold.position.y = -d.h * 0.22;
        eg.add(hold);
      }
      var flame = new THREE.Mesh(
        new THREE.ConeGeometry(d.w * 0.22, d.h * 0.9, 16),
        new THREE.MeshBasicMaterial({ color: 0xffd07a }));
      flame.position.y = -d.h * 0.85;
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
    //  A real khom loy: an octagonal mulberry-paper envelope on a thin
    //  bamboo skeleton with a wax core burning at its mouth. We build it
    //  to look exactly like that — MeshPhysicalMaterial paper that lets the
    //  interior flame bleed through (bright at the base, dark amber at the
    //  crown), an EdgesGeometry bamboo skeleton, and a flickering PointLight
    //  + glowing flame at the core (driven by RS.render.VehicleRenderer.flicker).
    if (entry.partId === 'cover_paper') {
      // The envelope IS the lantern — it drapes DOWN over the bamboo frame and
      // the wax core so the skeleton + flame silhouette through the glowing
      // translucent paper, exactly like the real thing.
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
        emissiveMap: paperGradientTex() // …hot at the mouth, dark amber at the crown
      });
      var pg = new THREE.Group();
      // octagonal envelope — flared skirt · barrel body · domed crown
      var pskirt = new THREE.Mesh(
        new THREE.CylinderGeometry(pr * 1.0, pr * 0.74, ph * 0.26, 8, 1, true), paperMat);
      pskirt.position.y = -ph * 0.34;
      var pbody = new THREE.Mesh(
        new THREE.CylinderGeometry(pr * 0.8, pr * 1.0, ph * 0.5, 8, 1, true), paperMat);
      pbody.position.y = -ph * 0.05;
      // the crown catches little of the flame — its own dimmer amber material
      var crownMat = new THREE.MeshPhysicalMaterial({
        color: 0xe9caa6, roughness: 0.55, metalness: 0.0,
        transmission: 0.3, thickness: 0.4, ior: 1.35,
        side: THREE.DoubleSide, transparent: true, opacity: 0.9,
        emissive: 0x2c1506, emissiveIntensity: 0.4
      });
      var pcrown = new THREE.Mesh(
        new THREE.ConeGeometry(pr * 0.8, ph * 0.3, 8, 1, true), crownMat);
      pcrown.position.y = ph * 0.34;
      [pskirt, pbody, pcrown].forEach(function (m) {
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
        light: flameLight, base: 2.5, flame: flame, flameCore: flameCore
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
   * @returns {THREE.Group|null}  null if THREE is unavailable
   */
  function build(vehicle) {
    if (!THREE) { console.warn('[render/VehicleRenderer] THREE missing'); return null; }
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
    group.userData.isVehicle = true;
    recomputeExhaustY(group, meshes);
    group.userData.modelsReady = pending.length ? Promise.all(pending) : Promise.resolve();
    return group;
  }

  function recomputeExhaustY(group, meshes) {
    var exhaustY = null;
    Object.keys(meshes).forEach(function (k) {
      var m = meshes[k];
      if (m && m.userData && m.userData.isMotor) {
        var ey = m.position.y + (m.userData.exhaustLocalY || 0);
        if (exhaustY == null || ey < exhaustY) exhaustY = ey;
      }
    });
    var b = group.userData && group.userData.bounds;
    group.userData.exhaustY = exhaustY != null ? exhaustY : (b ? -b.height * 0.1 : -0.3);
  }

  /**
   * Drive every khom-loy flame in a built vehicle group: flickers the interior
   * PointLight and jitters the flame meshes. Call once per rendered frame.
   * `active === false` snuffs them all (the flame has died). A pure per-frame
   * side effect — no allocation, safe to call on any group (no-op without flames).
   */
  function flicker(group, active) {
    var fl = group && group.userData && group.userData.flicker;
    if (!fl || !fl.length) return;
    var now = Date.now();
    for (var i = 0; i < fl.length; i++) {
      var f = fl[i];
      if (active === false) {
        if (f.light) f.light.intensity = 0;
        if (f.flame) f.flame.visible = false;
        if (f.flameCore) f.flameCore.visible = false;
        continue;
      }
      // the brief's flicker signal: sin(t·0.015) + random·0.2, folded so the
      // PointLight stays lively but always positive
      var jitter = Math.sin(now * 0.015) + Math.random() * 0.2;
      if (f.light) {
        f.light.intensity = Math.max(0.15, (f.base || 2.5) * (0.78 + 0.16 * jitter));
      }
      if (f.flame) {
        f.flame.visible = true;
        f.flame.scale.set(1,
          0.86 + 0.26 * (0.5 + 0.5 * Math.sin(now * 0.023)) + Math.random() * 0.12, 1);
      }
      if (f.flameCore) {
        f.flameCore.visible = true;
        f.flameCore.scale.setScalar(0.85 + Math.random() * 0.22);
      }
    }
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
    flicker: flicker,        // per-frame khom-loy flame driver
    loadModel: loadModel,    // Promise<Object3D|null>, cached
    preload: preload,        // Promise.all over every catalog meshUrl
    ensureFor: ensureFor     // Promise.all over one vehicle's meshUrls
  };

})(typeof window !== 'undefined' ? window : this);
