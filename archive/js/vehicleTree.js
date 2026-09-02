// js/vehicleTree.js — Phase 15 · โครงสร้างข้อมูล Node-Based VAB (Juno/KSP style)
//
//   ทุกชิ้นส่วน (เปลือกพลุ / สารเคมี / ชนวน / ท่อครก ฯลฯ) คือ "Node" หนึ่งชิ้นในต้นไม้:
//     Node = { id, type, mass, position (สัมพัทธ์กับ parent), rotation, attachmentPoints, parent, children }
//
//   ต้นไม้ (Tree) เก็บ root + map ของทุก node เพื่อค้นหาไว — ย้าย/ถอดชิ้นส่วนแม่ ลูกทุกตัวย้ายตาม
//   เพราะตำแหน่งเป็น "สัมพัทธ์กับ parent" เสมอ (world position ต้องไล่บวกไปตามสายโซ่ parent)
//
//   window.VehicleTree.PART_DEFS         — แคตตาล็อกชนิดชิ้นส่วน (เรขาคณิต + จุดยึด + ชนิดที่รับได้)
//   window.VehicleTree.createTree(type)  — สร้างต้นไม้ใหม่ มี root เป็นชิ้นส่วนชนิดนั้น
//   window.VehicleTree.createNode(type)  — สร้าง node ลอย ๆ (ยังไม่ผูกกับต้นไม้)
//   window.VehicleTree.attach/detach/removeNode/worldPosition/depth/allNodes

(function () {
  "use strict";

  let _uid = 0;
  function nextId(prefix) { return (prefix || "n") + "_" + (++_uid); }

  // ---------- แคตตาล็อกชนิดชิ้นส่วน ----------
  // attachmentPoints: ชื่อจุดยึด → { x,y,z (สัมพัทธ์กับศูนย์กลาง node นี้), accepts:[type...] }
  const PART_DEFS = {
    // ───── พลุ (firework) ─────
    shell: {
      type: "shell", family: "firework", nameTh: "เปลือกพลุ", nameSub: "Spherical Shell", icon: "🎆", mass: 0.5,
      geometry: { kind: "sphere", radius: 1.05 },
      isRoot: true,   // ไม่ต้องมี parent — วางลอยในห้องได้อิสระ
      attachmentPoints: {
        center: { x: 0, y: 0, z: 0, accepts: ["chemical"], explode: { x: 0, y: 0.95, z: 0 } },
        bottom: { x: 0, y: -1.05, z: 0, accepts: ["fuse"], explode: { x: 0, y: -1.15, z: 0 } }
      }
    },
    chemical: {
      type: "chemical", family: "firework", nameTh: "สารเคมีเม็ดดาว", nameSub: "Chemical Stars", icon: "✨", mass: 0.2,
      geometry: { kind: "points", radius: 0.72 },
      attachmentPoints: {}
    },
    fuse: {
      type: "fuse", family: "firework", nameTh: "ชนวนหน่วงเวลา", nameSub: "Time Fuse", icon: "🧵", mass: 0.05,
      geometry: { kind: "cylinder", radius: 0.055, height: 0.9 },
      attachmentPoints: {}
    },

    // ───── โคมลอย (Khom Loy) — ประกอบล่างขึ้นบนตามแกน Y ─────
    //   เชื้อเพลิง (วงแหวนขี้ผึ้ง) → โครงไม้ไผ่ → กระดาษสา   (ไม่มีดินขับ/หัวเผา)
    fuel_ring: {
      type: "fuel_ring", family: "khom", nameTh: "เชื้อเพลิง", nameSub: "วงแหวนขี้ผึ้ง/พาราฟิน", icon: "🕯️", mass: 0.18,
      geometry: { kind: "torus", radius: 1.15, tube: 0.16 },
      isRoot: true,
      attachmentPoints: {
        top: { x: 0, y: 0.2, z: 0, accepts: ["bamboo_frame"], explode: { x: 0, y: 1.3, z: 0 } }
      }
    },
    bamboo_frame: {
      type: "bamboo_frame", family: "khom", nameTh: "โครงไม้ไผ่", nameSub: "Bamboo Frame", icon: "🎋", mass: 0.12,
      geometry: { kind: "frame", radius: 1.18, height: 0.55 },
      attachmentPoints: {
        top: { x: 0, y: 0.62, z: 0, accepts: ["sa_paper"], explode: { x: 0, y: 2.6, z: 0 } }
      }
    },
    sa_paper: {
      type: "sa_paper", family: "khom", nameTh: "กระดาษสา", nameSub: "Sa Paper Cover", icon: "📜", mass: 0.09,
      geometry: { kind: "cover", radius: 1.24, height: 3.6 },
      attachmentPoints: {}
    }
  };

  function cloneAP(def) {
    const out = {};
    Object.keys(def.attachmentPoints || {}).forEach(k => {
      const a = def.attachmentPoints[k];
      out[k] = { x: a.x, y: a.y, z: a.z, accepts: a.accepts.slice(), explode: Object.assign({ x: 0, y: 0, z: 0 }, a.explode || {}) };
    });
    return out;
  }

  // ---------- Node ----------
  function createNode(type, opts) {
    opts = opts || {};
    const def = PART_DEFS[type];
    if (!def) throw new Error("[VehicleTree] unknown part type: " + type);
    return {
      id: opts.id || nextId(type),
      type,
      def,
      mass: opts.mass != null ? opts.mass : def.mass,
      position: opts.position ? { x: opts.position.x || 0, y: opts.position.y || 0, z: opts.position.z || 0 } : { x: 0, y: 0, z: 0 },
      rotation: opts.rotation ? { x: opts.rotation.x || 0, y: opts.rotation.y || 0, z: opts.rotation.z || 0 } : { x: 0, y: 0, z: 0 },
      attachmentPoints: cloneAP(def),
      parent: null,
      parentSlot: null,
      children: []
    };
  }

  // ---------- Tree ----------
  function createTree(rootType, rootOpts) {
    const root = createNode(rootType, rootOpts);
    return { root, nodes: { [root.id]: root } };
  }

  // ผูก node เข้ากับ parent ที่จุดยึด slotName (ย้ายจาก parent เดิมถ้ามี)
  function attach(tree, node, parent, slotName) {
    const slot = parent.attachmentPoints[slotName];
    if (!slot) throw new Error("[VehicleTree] no such attachment point: " + slotName);
    if (slot.accepts.indexOf(node.type) === -1) throw new Error("[VehicleTree] " + slotName + " does not accept " + node.type);
    detach(tree, node);
    node.parent = parent;
    node.parentSlot = slotName;
    node.position = { x: slot.x, y: slot.y, z: slot.z };
    parent.children.push(node);
    tree.nodes[node.id] = node;
    return node;
  }

  // ปลดออกจาก parent — node (และลูกของมัน ที่ยังผูกกับมันเอง) กลายเป็นลอยอิสระ ตำแหน่งคงที่ล่าสุด
  function detach(tree, node) {
    if (node.parent) {
      const idx = node.parent.children.indexOf(node);
      if (idx > -1) node.parent.children.splice(idx, 1);
      node.parent = null;
      node.parentSlot = null;
    }
    return node;
  }

  // ลบ node ทิ้งทั้งแขนง (รวมลูกหลาน)
  function removeNode(tree, node) {
    detach(tree, node);
    (function walk(n) {
      delete tree.nodes[n.id];
      n.children.slice().forEach(walk);
    })(node);
  }

  // หาว่า slot นี้มีลูกครองอยู่แล้วหรือไม่
  function slotOccupant(node, slotName) {
    return node.children.find(c => c.parentSlot === slotName) || null;
  }

  // world position = ไล่บวก position สัมพัทธ์ตามสายโซ่ parent (แม่ขยับ ลูกขยับตาม)
  function worldPosition(node) {
    let x = 0, y = 0, z = 0, n = node;
    const chain = [];
    while (n) { chain.unshift(n); n = n.parent; }
    chain.forEach(nn => { x += nn.position.x; y += nn.position.y; z += nn.position.z; });
    return { x, y, z };
  }

  function depth(node) {
    let d = 0, n = node;
    while (n.parent) { d++; n = n.parent; }
    return d;
  }

  function allNodes(tree) { return Object.keys(tree.nodes).map(k => tree.nodes[k]); }

  window.VehicleTree = {
    PART_DEFS, createNode, createTree, attach, detach, removeNode,
    slotOccupant, worldPosition, depth, allNodes, nextId
  };
})();
