// js/modelManager.js — Phase 8 · ตัวโหลด/แคชโมเดล .glb (NASA 3D Resources) สำหรับเพย์โหลด Tier 4–5
//
//   • ใช้ THREE.GLTFLoader (vendor/three/loaders/GLTFLoader.js — UMD r147)
//   • โหลดแบบอะซิงก์ + แคชตามชื่อไฟล์ (โหลดครั้งเดียว, clone ให้ผู้เรียกทุกครั้ง)
//   • ถ้าไฟล์ .glb ยังไม่มีในโฟลเดอร์ → คืนรูปทรง procedural สำรอง (เกมไม่พัง)
//   • ปรับสเกล/จัดกึ่งกลางอัตโนมัติจาก bounding box + ตั้ง envMapIntensity/emissive
//     ให้เข้ากับไฟ + UnrealBloomPass ของฉากเดิม
//
//   window.ModelManager.forPayload(payloadId, opts) -> Promise<THREE.Group|null>
//   window.ModelManager.load(name, opts)           -> Promise<THREE.Group>
//   window.ModelManager.isModelPayload(payloadId)  -> bool
//   window.ModelManager.preload(names)             — อุ่นแคชล่วงหน้า

(function () {
  "use strict";
  const T = () => window.THREE;
  const BASE = "assets/models/";

  // payload id (data.js) -> ไฟล์โมเดล + ชนิดรูปทรงสำรอง + ขนาดเป้าหมาย (หน่วยฉาก)
  const MODEL_FOR = {
    pl_test_mass:        { name: "probe",           kind: "probe",   size: 1.7 },
    pl_reentry_cap:      { name: "capsule",         kind: "capsule", size: 1.9 },
    pl_cubesat:          { name: "cubesat",         kind: "cubesat", size: 1.6 },
    pl_cubesat_cluster:  { name: "cubesat_cluster", kind: "cubesat", size: 2.2 },
    pl_comsat_small:     { name: "comsat",          kind: "comsat",  size: 2.4 },
    pl_comsat_geo:       { name: "comsat_geo",      kind: "comsat",  size: 2.8 }
  };

  const cache = new Map();   // name -> { promise, status:'ok'|'fail', template:Object3D }

  function gltf() {
    const THREE = T();
    if (!THREE || !THREE.GLTFLoader) return null;
    if (!gltf._i) gltf._i = new THREE.GLTFLoader();
    return gltf._i;
  }

  // ---------- procedural fallbacks (ภาษาภาพเดียวกับ vab3d.js) ----------
  function std(hex, o) {
    o = o || {};
    return new (T().MeshStandardMaterial)({
      color: hex, roughness: o.rough != null ? o.rough : 0.45, metalness: o.metal != null ? o.metal : 0.45,
      emissive: o.emis != null ? o.emis : 0x000000, emissiveIntensity: o.emisI != null ? o.emisI : 0.5,
      side: o.side || T().FrontSide
    });
  }

  function fallback(kind) {
    const THREE = T();
    const g = new THREE.Group();
    if (kind === "cubesat") {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1.7), std(0x1b1b22, { metal: 0.7, rough: 0.35 })));
      const gold = new THREE.Mesh(new THREE.BoxGeometry(1.03, 1.03, 0.28), std(0xc8a24a, { metal: 0.8, rough: 0.28 }));
      gold.position.z = 0.9; g.add(gold);
      [-1, 1].forEach(s => {
        const p = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.05, 1.35),
          std(0x3b6bb0, { emis: 0x10254f, emisI: 0.7, metal: 0.3 }));
        p.position.x = s * 1.8; g.add(p);
      });
    } else if (kind === "comsat") {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.5, 1.3), std(0xd6d6dc, { metal: 0.5 })));
      [-1, 1].forEach(s => {
        const w = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.05, 1.2), std(0x123167, { emis: 0x0c2350, emisI: 0.6 }));
        w.position.x = s * 2.4; g.add(w);
      });
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 9, 0, 6.2832, 0, Math.PI / 2.3),
        std(0xecedf2, { side: THREE.DoubleSide, metal: 0.2 }));
      dish.rotation.x = Math.PI; dish.position.z = 0.95; g.add(dish);
    } else if (kind === "capsule") {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.92, 1.3, 26), std(0x27272e, { rough: 0.8, metal: 0.2 }));
      cone.position.y = 0.45; g.add(cone);
      const heat = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.66, 0.55, 26), std(0x8a5a3a, { rough: 0.9, emis: 0x3a1206, emisI: 0.3 }));
      heat.position.y = -0.35; g.add(heat);
    } else if (kind === "probe") {
      g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.8), std(0xc8a24a, { metal: 0.7, rough: 0.3 })));
      const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.2, 6), std(0x777, { metal: 0.6 }));
      boom.rotation.z = Math.PI / 2; g.add(boom);
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 8, 0, 6.2832, 0, Math.PI / 2.4),
        std(0xecedf2, { side: THREE.DoubleSide }));
      dish.position.x = 1.7; dish.rotation.z = -Math.PI / 2; g.add(dish);
    } else {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), std(0xccccd4)));
    }
    g.userData.isFallback = true;
    return g;
  }

  // ---------- normalize: สเกล/กึ่งกลาง/วัสดุ ----------
  function prep(src, opts, isFallback) {
    const THREE = T();
    const obj = src.clone(true);
    obj.traverse(o => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      o.castShadow = o.receiveShadow = false;
      if (o.material) {
        o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
          if ("envMapIntensity" in m) m.envMapIntensity = opts.envMapIntensity != null ? opts.envMapIntensity : 0.9;
          if (opts.emissive != null && m.emissive) {
            m.emissive.setHex(opts.emissive);
            m.emissiveIntensity = opts.emissiveIntensity != null ? opts.emissiveIntensity : 0.35;
          }
          m.needsUpdate = true;
        });
      }
    });

    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = (opts.size || 2.0) / maxDim;
    obj.scale.setScalar(scale);
    const center = box.getCenter(new THREE.Vector3()).multiplyScalar(scale);
    obj.position.sub(center);
    if (opts.anchor === "bottom") obj.position.y += (size.y * scale) / 2;

    const wrap = new THREE.Group();
    wrap.add(obj);
    wrap.userData.isFallback = !!isFallback;
    wrap.userData.modelName = opts._name || "";
    return wrap;
  }

  // ---------- public ----------
  function load(name, opts) {
    opts = Object.assign({ _name: name }, opts || {});
    const THREE = T();
    if (!THREE) return Promise.reject(new Error("THREE not ready"));

    let rec = cache.get(name);
    if (!rec) {
      rec = {};
      cache.set(name, rec);
      const ld = gltf();
      rec.promise = new Promise(resolve => {
        if (!ld) { rec.status = "fail"; rec.template = fallback(opts.kind || name); return resolve(rec); }
        ld.load(
          BASE + name + ".glb",
          g => { rec.status = "ok"; rec.template = g.scene || g.scenes[0]; resolve(rec); },
          undefined,
          err => {
            console.warn("[ModelManager] " + name + ".glb ยังไม่มี → ใช้รูปทรงสำรอง",
              (err && (err.message || err.type)) || err);
            rec.status = "fail"; rec.template = fallback(opts.kind || name); resolve(rec);
          }
        );
      });
    }
    return rec.promise.then(r => prep(r.template, opts, r.status !== "ok"));
  }

  function isModelPayload(id) { return !!MODEL_FOR[id]; }

  function forPayload(id, opts) {
    const spec = MODEL_FOR[id];
    if (!spec) return Promise.resolve(null);
    return load(spec.name, Object.assign({ kind: spec.kind, size: spec.size }, opts || {}));
  }

  function preload(names) {
    (names || Object.values(MODEL_FOR).map(s => s.name)).forEach(n => {
      try { load(n, { kind: (Object.values(MODEL_FOR).find(s => s.name === n) || {}).kind }); } catch (e) {}
    });
  }

  window.ModelManager = { load, forPayload, isModelPayload, preload, MODEL_FOR };
})();
