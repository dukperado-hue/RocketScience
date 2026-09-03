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
        spoolTime: 4.0        // s — the envelope heats gradually before it has
                             //     any positive buoyancy at all; until then the
                             //     lantern just sits on the ground, warming up
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
      blurb: 'กระบอกดินปืนอัดแน่น จุดแล้วต้องสร้างแรงดันในกระบอกก่อน ~1.5 วิ ค่อย ๆ ดันจนพ้นความเฉื่อย แล้วจึงพุ่ง',
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
        spoolTime: 1.5          // s — pressure builds in the bamboo tube; the
                               //     rocket sits smoking on the pad, thrust
                               //     ramping, until it finally beats its weight
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

  // ---------------------------------------------------------------------------
  //  ERA 1.5 · Fireworks — the OTHER kind of energy release. Where a Bang Fai
  //  builds pressure over a second and eases off the pad, a mortar shell is
  //  pure IMPULSE: a lift charge of coarse black powder deflagrates in ~0.1 s
  //  and throws the shell out of the tube at ~100 m/s. spoolTime is 0 — there
  //  is no ramp, the whole thrust curve is a single violent spike. After that
  //  the shell coasts on nothing but inertia, arcs over, and bursts.
  //  Same schema. Only the numbers changed.
  // ---------------------------------------------------------------------------
  var ERA1_5 = [
    {
      id: 'fw_mortar_tube',
      name: 'ท่อครก (Mortar)',
      category: C.STRUCTURAL,
      icon: '🛢️',
      era: '1p5-fireworks',
      blurb: 'ท่อกระดาษ/HDPE ผนังหนา ตั้งกับพื้น รับแรงอัดจากดินส่งที่ก้นท่อ — ฐานหนักที่ทุกอย่างวางอยู่บน',
      mass: 1.2,
      cost: 30,
      size: { w: 1, h: 2 },
      // a fat tube at the very aft of the stack: its large REFERENCE area drags
      // the Center of Pressure behind the CoM (so the shell flies nose-first),
      // but its drag COEFFICIENT is tiny — the shell mostly coasts, it isn't
      // braked to a stop. Same big-A / small-Cd trick the tail fins use.
      aerodynamics: { dragCoefficient: 0.06, crossSectionArea: 0.045 },
      structural: { maxDynamicPressure: 250000 },   // Pa — basically indestructible
      attachNodes: [
        { id: 'top', dx: 0.5, dy: 0, type: NODE.STACK, accepts: ['Propulsion'] }
      ]
    },
    {
      id: 'fw_lift_charge',
      name: 'ดินส่ง (Lift Charge)',
      category: C.PROPULSION,
      icon: '💥',
      era: '1p5-fireworks',
      blurb: 'ดินดำเม็ดหยาบห่อกระดาษที่ก้นลูก จุดแล้วเปลี่ยนเป็นแก๊สแทบทันที — แรงมหาศาลใน 0.1 วิ ไม่มีการหน่วง',
      mass: 0.05,
      cost: 12,
      size: { w: 1, h: 1 },
      aerodynamics: { dragCoefficient: 0.6, crossSectionArea: 0.004 },
      structural: { maxDynamicPressure: 250000 },
      propulsion: {
        mode: 'rocket',
        thrust: 1800,          // N — enormous for its size, but only for a blink
        burnTime: 0.1,         // s — the entire impulse
        specificImpulse: 55,   // crude coarse black powder
        propellantMass: 0.045, // kg gone in one flash
        spoolTime: 0           // INSTANT — no ramp, the whole curve is a spike
      },
      attachNodes: [
        { id: 'top',    dx: 0.5, dy: 0, type: NODE.STACK, accepts: ['Payload'] },
        { id: 'bottom', dx: 0.5, dy: 1, type: NODE.STACK, accepts: ['Structural'] }
      ]
    },
    {
      id: 'fw_shell_peony',
      name: 'ลูกดอกไม้ไฟ “โบตั๋น”',
      category: C.PAYLOAD,
      icon: '🎆',
      era: '1p5-fireworks',
      blurb: 'ลูกทรงกลมบรรจุดาวไฟ + ชนวนหน่วงเวลา ผิวเรียบแรงต้านต่ำ พุ่งขึ้นด้วยความเฉื่อยล้วนแล้วแตกเป็นดอกโบตั๋น',
      mass: 0.30,
      cost: 25,
      size: { w: 1, h: 1 },
      aerodynamics: { dragCoefficient: 0.28, crossSectionArea: 0.004 }, // smooth sphere, minimal drag
      structural: { maxDynamicPressure: 60000 },
      attachNodes: [
        { id: 'bottom', dx: 0.5, dy: 1, type: NODE.STACK, accepts: ['Propulsion'] }
      ]
    }
  ];

  RS.PartsCatalog.registerAll(ERA1_5);

  // handy for tools / data browsers
  RS.data = RS.data || {};
  RS.data.parts = { '0-khomloy': ERA0, '1-bangfai': ERA1, '1p5-fireworks': ERA1_5 };

})(typeof window !== 'undefined' ? window : this);
