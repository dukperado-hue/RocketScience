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
   * @param {import('../core/Vehicle').Vehicle} vehicle
   * @returns {THREE.Group|null}  null if THREE is unavailable
   */
  function build(vehicle) {
    if (!THREE) { console.warn('[render/VehicleRenderer] THREE missing'); return null; }
    var lo = layout(vehicle);
    var group = new THREE.Group();
    var meshes = {};
    var exhaustY = null;
    lo.parts.forEach(function (entry) {
      var m = makeMesh(entry);
      meshes[entry.iid] = m;
      group.add(m);
      if (m.userData && m.userData.isMotor) {
        var ey = m.position.y + (m.userData.exhaustLocalY || 0);
        if (exhaustY == null || ey < exhaustY) exhaustY = ey;   // lowest motor
      }
    });
    group.userData = {
      partMeshes: meshes, bounds: lo.bounds, isVehicle: true,
      exhaustY: exhaustY != null ? exhaustY : (lo.bounds ? -lo.bounds.height * 0.1 : -0.3)
    };
    return group;
  }

  function disposeGroup(group) {
    if (!group) return;
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
    layout: layout,        // pure
    build: build,          // THREE
    disposeGroup: disposeGroup
  };

})(typeof window !== 'undefined' ? window : this);
