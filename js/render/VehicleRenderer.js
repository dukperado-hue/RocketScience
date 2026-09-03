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

    // ---- ERA 0 · Khom Loy + generic ------------------------------------
    if (entry.partId === 'cover_paper' || entry.category === 'Aerodynamics') {
      // translucent hot-air envelope: dome + short open skirt
      var r = Math.max(d.w, d.d) * 0.5;
      mat = new THREE.MeshStandardMaterial({
        color: 0xe9dcbf, roughness: 0.85, metalness: 0.0,
        transparent: true, opacity: 0.55, side: THREE.DoubleSide,
        emissive: 0x552a00, emissiveIntensity: 0.35
      });
      var g = new THREE.Group();
      var dome = new THREE.Mesh(
        new THREE.SphereGeometry(r, 22, 16, 0, TAU, 0, Math.PI * 0.55), mat);
      dome.scale.y = (d.h * 0.75) / r;
      dome.position.y = d.h * 0.12;
      var skirt = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.82, r * 0.62, d.h * 0.34, 22, 1, true), mat);
      skirt.position.y = -d.h * 0.32;
      g.add(dome); g.add(skirt);
      g.position.set(entry.world.x, entry.world.y, entry.world.z);
      g.userData.iid = entry.iid;
      return g;
    }

    if (entry.partId === 'fuel_wax' || entry.category === 'Propulsion') {
      geo = new THREE.CylinderGeometry(d.w * 0.30, d.w * 0.34, d.h * 0.60, 16);
      mat = new THREE.MeshStandardMaterial({
        color: 0xd8c9a0, roughness: 0.5, metalness: 0.05,
        emissive: 0xff6a1c, emissiveIntensity: 0.9
      });
      mesh = new THREE.Mesh(geo, mat);
      var flame = new THREE.Mesh(
        new THREE.ConeGeometry(d.w * 0.16, d.h * 0.5, 12),
        new THREE.MeshBasicMaterial({ color: 0xffb63a })
      );
      flame.position.y = d.h * 0.5;
      mesh.add(flame);
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

    group.userData.partMeshes = meshes;
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
    loadModel: loadModel,    // Promise<Object3D|null>, cached
    preload: preload,        // Promise.all over every catalog meshUrl
    ensureFor: ensureFor     // Promise.all over one vehicle's meshUrls
  };

})(typeof window !== 'undefined' ? window : this);
