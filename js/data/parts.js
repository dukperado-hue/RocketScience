/* =============================================================================
 * FROM FIRE TO ORBIT
 * js/data/parts.js  ·  part DEFINITIONS (content, not engine)
 *
 * Pure data. Registers itself into RS.PartsCatalog at load. Every future era
 * appends its parts here under the same schema — no engine change required.
 * ===========================================================================*/
(function (global) {
  'use strict';

  var RS = global.RS;
  if (!RS || !RS.PartsCatalog) throw new Error('parts.js: load PartsCatalog.js first');
  var C = RS.PartsCatalog.CATEGORY;
  var NODE = RS.PartsCatalog.NODE;

  // ---------------------------------------------------------------------------
  //  ERA 0 · Khom Loy — the proof that a lantern and a Falcon 9 share a schema.
  //  Numbers are real-ish: a party lantern is ~25 g of paper+wire+wax and lofts
  //  on a few newtons of hot-air buoyancy.
  // ---------------------------------------------------------------------------
  var ERA0 = [
    {
      id: 'fuel_wax',
      name: 'เชื้อเพลิงขี้ผึ้ง',
      category: C.PROPULSION,
      icon: '🔥',
      era: '0-khomloy',
      blurb: 'ก้อนขี้ผึ้งชุบกระดาษ จุดแล้วให้ความร้อน — พยุงตัวโคมขึ้นช้า ๆ',
      mass: 0.010,
      cost: 5,
      size: { w: 1, h: 1 },
      aerodynamics: { dragCoefficient: 0.9, crossSectionArea: 0.002 },
      structural: { maxDynamicPressure: 400 },   // Pa — the wire cradle is tough
      propulsion: {
        mode: 'buoyancy',
        thrust: 3.6,          // N peak hot-air buoyancy once the envelope is hot
        burnTime: 55,         // s of usable flame before it cools & descends
        specificImpulse: 0,   // buoyancy: no exhaust
        propellantMass: 0.008,
        spoolTime: 10         // s to heat the air column to full lift
      },
      // the wax cradle hangs UNDER the bamboo hoop; live node up (frame or a
      // second wax for more heat) and a live node down (a wish-tag / ballast)
      attachNodes: [
        { id: 'top',    dx: 0.5, dy: 0, type: NODE.STACK, accepts: ['Structural', 'Propulsion'] },
        { id: 'bottom', dx: 0.5, dy: 1, type: NODE.STACK, accepts: ['Payload', 'Propulsion'] }
      ]
    },
    {
      id: 'frame_bamboo',
      name: 'โครงไม้ไผ่',
      category: C.STRUCTURAL,
      icon: '🎋',
      era: '0-khomloy',
      blurb: 'วงแหวนไม้ไผ่เหลาบาง เบาแต่ให้รูปทรง — จุดยึดเชื้อเพลิงและเปลือก',
      mass: 0.008,
      cost: 8,
      size: { w: 1, h: 1 },
      aerodynamics: { dragCoefficient: 0.6, crossSectionArea: 0.004 },
      structural: { maxDynamicPressure: 220 },
      attachNodes: [
        { id: 'top', dx: 0.5, dy: 0, type: NODE.STACK, accepts: ['Aerodynamics'] },
        { id: 'bottom', dx: 0.5, dy: 1, type: NODE.STACK, accepts: ['Propulsion'] }
      ]
    },
    {
      id: 'cover_paper',
      name: 'เปลือกกระดาษสา',
      category: C.AERODYNAMICS,
      icon: '🏮',
      era: '0-khomloy',
      blurb: 'ซองกระดาษสาบางเบา กักอากาศร้อนไว้ — ยิ่งใหญ่ยิ่งลอย แต่ก็ยิ่งต้านลม',
      mass: 0.006,
      cost: 12,
      size: { w: 1, h: 2 },
      aerodynamics: { dragCoefficient: 1.1, crossSectionArea: 0.28 }, // big soft envelope
      structural: { maxDynamicPressure: 45 },    // Pa — thin sa paper tears easily
      attachNodes: [
        { id: 'bottom', dx: 0.5, dy: 2, type: NODE.STACK, accepts: ['Structural'] }
      ]
    },
    {
      id: 'payload_tag',
      name: 'ป้ายอธิษฐาน',
      category: C.PAYLOAD,
      icon: '🏷️',
      era: '0-khomloy',
      blurb: 'ป้ายกระดาษเขียนคำอธิษฐาน ผูกใต้โคม — ถ่วงน้ำหนักให้โคมลอยช้าลง เตี้ยลง ลงเร็วขึ้น ไม่หลุดเขต',
      mass: 0.026,
      cost: 4,
      size: { w: 1, h: 1 },
      aerodynamics: { dragCoefficient: 0.5, crossSectionArea: 0.004 },
      structural: { maxDynamicPressure: 300 },
      attachNodes: [
        { id: 'top', dx: 0.5, dy: 0, type: NODE.STACK, accepts: ['Propulsion', 'Payload'] },
        { id: 'bottom', dx: 0.5, dy: 1, type: NODE.STACK, accepts: ['Payload'] }
      ]
    }
  ];

  RS.PartsCatalog.registerAll(ERA0);

  // ---------------------------------------------------------------------------
  //  ERA 1 · Bang Fai — the first REAL thrust. A solid black-powder charge in a
  //  bamboo tube. Same schema; now `propulsion.mode === 'rocket'`, mass drops as
  //  the grain burns, and — crucially — a bare tube is aerodynamically UNSTABLE:
  //  the Center of Pressure sits ahead of the Center of Mass and it tumbles.
  //  Fins drag the CoP aft and tame it. That lesson is the whole era.
  // ---------------------------------------------------------------------------
  var ERA1 = [
    {
      id: 'nose_cone_wood',
      name: 'หัวจรวดไม้',
      category: C.AERODYNAMICS,
      icon: '🔺',
      era: '1-bangfai',
      blurb: 'หัวไม้กลึงเรียว ลดแรงต้านด้านหน้า — แต่พื้นที่หน้าตัดของมันดึง CoP ไปข้างหน้า',
      mass: 0.10,
      cost: 20,
      size: { w: 1, h: 1 },
      aerodynamics: { dragCoefficient: 0.32, crossSectionArea: 0.010 },
      structural: { maxDynamicPressure: 9000 },
      attachNodes: [
        { id: 'bottom', dx: 0.5, dy: 1, type: NODE.STACK, accepts: ['Structural', 'Propulsion'] }
      ]
    },
    {
      id: 'body_tube_bamboo',
      name: 'ลำตัวไม้ไผ่',
      category: C.STRUCTURAL,
      icon: '🪈',
      era: '1-bangfai',
      blurb: 'ปล้องไม้ไผ่ตรง เป็นลำตัวหลัก — ต่อซ้อนได้ และมีจุดยึดครีบด้านข้าง',
      mass: 0.12,
      cost: 15,
      size: { w: 1, h: 2 },
      aerodynamics: { dragCoefficient: 0.45, crossSectionArea: 0.018 },
      structural: { maxDynamicPressure: 7000 },
      attachNodes: [
        { id: 'top',    dx: 0.5, dy: 0, type: NODE.STACK,  accepts: ['Aerodynamics', 'Payload'] },
        { id: 'bottom', dx: 0.5, dy: 2, type: NODE.STACK,  accepts: ['Propulsion', 'Structural'] },
        { id: 'finL',   dx: 0,   dy: 1.7, type: NODE.RADIAL, accepts: ['Aerodynamics'] },
        { id: 'finR',   dx: 1,   dy: 1.7, type: NODE.RADIAL, accepts: ['Aerodynamics'] }
      ]
    },
    {
      id: 'motor_blackpowder',
      name: 'มอเตอร์ดินปืน',
      category: C.PROPULSION,
      icon: '🧨',
      era: '1-bangfai',
      blurb: 'กระบอกดินปืนอัดแน่น จุดครั้งเดียวเผาหมดใน 3–4 วิ — แรงขับสูง มวลลดเร็ว',
      mass: 0.30,
      cost: 40,
      size: { w: 1, h: 2 },
      aerodynamics: { dragCoefficient: 0.42, crossSectionArea: 0.020 },
      structural: { maxDynamicPressure: 7000 },
      propulsion: {
        mode: 'rocket',
        thrust: 125,            // N steady
        burnTime: 4.8,          // s — short, violent
        specificImpulse: 80,    // s — crude compressed black powder
        propellantMass: 0.52,   // kg of grain burned off
        spoolTime: 0.2          // near-instant
      },
      attachNodes: [
        { id: 'top',  dx: 0.5, dy: 0, type: NODE.STACK,  accepts: ['Structural'] },
        { id: 'finL', dx: 0,   dy: 1.6, type: NODE.RADIAL, accepts: ['Aerodynamics'] },
        { id: 'finR', dx: 1,   dy: 1.6, type: NODE.RADIAL, accepts: ['Aerodynamics'] }
      ]
    },
    {
      id: 'fin_wood',
      name: 'ครีบหางไม้ (ชุด)',
      category: C.AERODYNAMICS,
      icon: '🪶',
      era: '1-bangfai',
      blurb: 'ชุดครีบไม้บางลูบ ลากศูนย์แรงดัน (CoP) ไปท้ายจรวด — ไม่มีมันจรวดจะตีลังกา',
      mass: 0.14,
      cost: 18,
      size: { w: 1, h: 1 },
      // Large SIDE area drags the CoP aft (the whole point) but the blades are
      // edge-on to the airstream, so their frontal Cd is tiny — big A, small Cd.
      aerodynamics: { dragCoefficient: 0.08, crossSectionArea: 0.11 },
      structural: { maxDynamicPressure: 6000 },
      // two mount nodes (one per edge) so the snap solver can seat the set on
      // either the left or the right radial node without a footprint clash
      attachNodes: [
        { id: 'mountR', dx: 0, dy: 0.5, type: NODE.RADIAL, accepts: ['Structural', 'Propulsion'] },
        { id: 'mountL', dx: 1, dy: 0.5, type: NODE.RADIAL, accepts: ['Structural', 'Propulsion'] }
      ]
    }
  ];

  RS.PartsCatalog.registerAll(ERA1);

  // handy for tools / data browsers
  RS.data = RS.data || {};
  RS.data.parts = { '0-khomloy': ERA0, '1-bangfai': ERA1 };

})(typeof window !== 'undefined' ? window : this);
