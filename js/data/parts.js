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
        spoolTime: 4.0,       // s — the envelope heats gradually before it has
                             //     any positive buoyancy at all; until then the
                             //     lantern just sits on the ground, warming up
        coolingTime: 6       // s — after the wax is spent the trapped heat bleeds
                             //     away on this 1/e timescale (~20 s full fade),
                             //     so the lantern eases down at ~1–2 m/s instead
                             //     of dropping the instant the flame dies
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
  //  ERA 1 · BANG FAI (บั้งไฟ) — the Isan traditional rocket, built the way the
  //  village สล่า builds it. Four parts: เลา (Lao, the body) · หมื่อ (Mue, the
  //  packed black-powder motor) · หาง (Hang, the long bamboo tail stick) ·
  //  โหวด (Howot, the whistle payload at the nose).
  //
  //  CRITICAL PHYSICS: a traditional Bang Fai has NO aerodynamic fins. It is
  //  stabilised entirely by the หาง — an exceedingly long, light bamboo stick
  //  lashed alongside the เลา that runs metres past the nozzle. It does two
  //  things: (1) its drag area sits so far behind the CoM that the Centre of
  //  Pressure is dragged way aft (nose weathercocks into the wind), and (2) its
  //  mass, out on a long lever, multiplies the vehicle's moment of inertia
  //  (I ∝ m·L²) — so the rocket is SLUGGISH to rotate and shrugs off gusts.
  //  Remove the หาง and the very same เลา + หมื่อ tumbles off the rail.
  //
  //  It is also NOT launched vertically — it slides up an angled wooden
  //  scaffold (ฐานปล่อยเฉียง) at ~80°, so it arcs downrange like a real one.
  // ---------------------------------------------------------------------------
  var ERA1 = [
    {
      id: 'payload_howot',
      name: 'โหวด (นกหวีดหัวบั้งไฟ)',
      category: C.PAYLOAD,
      icon: '🎐',
      era: '1-bangfai',
      blurb: 'พวงกระบอกไม้ไผ่ผ่าปากที่หัวบั้งไฟ ร้องหวีดตอนพุ่ง — หัวทู่ แรงต้านสูง (Cd 0.55): ลองเปลี่ยนเป็นหัวจรวดเพรียวลมดูว่าขึ้นสูงกว่ากันแค่ไหน',
      mass: 1.5,
      cost: 14,
      size: { w: 1, h: 1 },
      // a BLUNT, draggy cluster of split tubes at the very nose. The topmost
      // part sets the whole vehicle's drag character (attached vs separated
      // flow) — swap this for payload_nosecone and the same หมื่อ flies far higher.
      aerodynamics: { dragCoefficient: 0.55, crossSectionArea: 0.016 },
      // the split-tube whistle is the weak point: over-power the หมื่อ and the
      // slipstream shreds it first (Max-Q lesson)
      structural: { maxDynamicPressure: 32000 },
      attachNodes: [
        { id: 'bottom', dx: 0.5, dy: 1, type: NODE.STACK, accepts: ['Structural'] }
      ]
    },
    {
      id: 'body_lao',
      name: 'เลา (ลำตัวบั้งไฟแสน)',
      category: C.STRUCTURAL,
      icon: '🫙',
      era: '1-bangfai',
      blurb: 'ลำตัว "บั้งไฟแสน" — ท่อ PVC ลำใหญ่พันเชือกทั้งลำ หนักเอาการ (~8 กก.) ต่อซ้อนได้ (หมื่น → แสน → ล้าน) มีจุดผูก "หาง" ที่ข้างลำ',
      mass: 8.0,
      cost: 16,
      size: { w: 1, h: 3 },
      aerodynamics: { dragCoefficient: 0.42, crossSectionArea: 0.020 },
      structural: { maxDynamicPressure: 45000 },
      attachNodes: [
        { id: 'top',    dx: 0.5, dy: 0,   type: NODE.STACK,  accepts: ['Aerodynamics', 'Payload', 'Structural'] },
        { id: 'bottom', dx: 0.5, dy: 3,   type: NODE.STACK,  accepts: ['Propulsion', 'Structural'] },
        { id: 'tailL',  dx: 0,   dy: 2.6, type: NODE.RADIAL, accepts: ['Structural', 'Aerodynamics'] },
        { id: 'tailR',  dx: 1,   dy: 2.6, type: NODE.RADIAL, accepts: ['Structural', 'Aerodynamics'] }
      ]
    },
    {
      id: 'propulsion_mue',
      name: 'หมื่อ (ดินขับบั้งไฟแสน ~120 กก.)',
      category: C.PROPULSION,
      icon: '🧨',
      era: '1-bangfai',
      blurb: 'ดินปืนตำอัดแน่นเกือบ 90 กก. ในลำ! จุดชนวนแล้วอัดแรงดัน ~5 วิ (ควันท่วมฐาน) — บั้งไฟแสนหนัก ๆ ค่อย ๆ ยกตัวพ้นราง แล้วเร่งพุ่งอย่างรุนแรงขึ้นเป็นกิโลเมตร อันตรายมาก',
      mass: 12.0,               // kg — the clay-lined casing alone is heavy
      cost: 42,
      size: { w: 1, h: 3 },
      aerodynamics: { dragCoefficient: 0.42, crossSectionArea: 0.022 },
      structural: { maxDynamicPressure: 45000 },
      propulsion: {
        mode: 'rocket',
        thrust: 3200,           // N peak — it takes a lot to move 120 kg
        burnTime: 15.0,         // s — a long, hard burn
        specificImpulse: 76,    // s — hand-rammed compressed black powder, dirty
        propellantMass: 88.0,   // kg of packed grain — the bulk of the vehicle
        spoolTime: 5.0,         // s — the packed bore takes a full 5 s to build
                               //     pressure: it sits on the rail wreathed in
                               //     smoke, THEN heaves off as thrust finally
                               //     beats the 120 kg weight, accelerating hard
        taperTime: 5.0         // s — the bore widens as it burns: a long, slow
                               //     regressive tail from peak thrust down to 0
      },
      attachNodes: [
        { id: 'top',  dx: 0.5, dy: 0,   type: NODE.STACK,  accepts: ['Structural'] },
        // engineered fins bolt to the aft end of the motor — truly behind the CoM
        { id: 'finL', dx: 0,   dy: 2.7, type: NODE.RADIAL, accepts: ['Aerodynamics'] },
        { id: 'finR', dx: 1,   dy: 2.7, type: NODE.RADIAL, accepts: ['Aerodynamics'] }
      ]
    },
    {
      id: 'frame_tailstick',
      name: 'หาง (ไม้ไผ่ถ่วงท้าย)',
      category: C.STRUCTURAL,
      icon: '🎋',
      era: '1-bangfai',
      blurb: 'ไม้ไผ่ลำยาว 6–10 เมตร ผูกขนาบลำบั้งไฟ ยื่นเลยหางกระบอกไปไกล — ไม่ใช่ครีบ แต่คือหัวใจของความนิ่ง: ลาก CoP ไปท้ายสุด + เพิ่มโมเมนต์ความเฉื่อย (I ∝ mL²) มหาศาล · หน้าตัดข้างมโหฬาร = ลมขวางพัดเป๋หนัก',
      mass: 6.0,               // kg — a 6-10 m green-bamboo pole for a แสน is heavy
      cost: 12,
      size: { w: 1, h: 12 },   // 6 m in the grid; real ones run 6–10 m
      // thin bamboo, edge-on to the airflow: a HUGE side area for the CoP but a
      // tiny frontal drag coefficient (the same big-A / small-Cd trick fins use,
      // taken to its extreme). Its area centre sits far aft of everything else.
      // That giant side profile is also what a crosswind shoves around.
      aerodynamics: { dragCoefficient: 0.09, crossSectionArea: 0.10 },
      structural: { maxDynamicPressure: 40000 },
      // the tail stick is what declares the launch rig angle for the whole stack
      launchAngleDeg: 80,
      attachNodes: [
        { id: 'mountL', dx: 1, dy: 1, type: NODE.RADIAL, accepts: ['Structural'] },
        { id: 'mountR', dx: 0, dy: 1, type: NODE.RADIAL, accepts: ['Structural'] }
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
    // ---- ENGINEERED transitional parts — the leap from folk craft to rocketry.
    //  A traditional บั้งไฟ is stabilised by a 6 m bamboo pole: heavy, draggy in a
    //  crosswind, and it snaps off / tumbles at apogee. These three parts are the
    //  aerospace answer: a low-drag nose, light rear fins, and canted fins that
    //  spin the vehicle for gyroscopic rigidity. Same schema, same motor.
    {
      id: 'payload_nosecone',
      name: 'หัวจรวดเพรียวลม (Nose Cone)',
      category: C.PAYLOAD,
      icon: '🔺',
      era: '1p5-fireworks',
      blurb: 'หัวโค้งเพรียวลมแบบจรวดจริง — Cd ต่ำมาก (0.12 เทียบกับโหวดทู่ 0.55). ชิ้นบนสุดกำหนดบุคลิกแรงต้านของทั้งลำ → หมื่อตัวเดิมพุ่งได้สูงกว่ากันมาก',
      mass: 0.9,
      cost: 30,
      size: { w: 1, h: 1 },
      // an ogive nose: attached flow, tiny separated wake
      aerodynamics: { dragCoefficient: 0.12, crossSectionArea: 0.016 },
      structural: { maxDynamicPressure: 40000 },
      attachNodes: [
        { id: 'bottom', dx: 0.5, dy: 1, type: NODE.STACK, accepts: ['Structural'] }
      ]
    },
    {
      id: 'aero_fin_straight',
      name: 'ครีบตรง (Straight Fins)',
      category: C.AERODYNAMICS,
      icon: '🪽',
      era: '1p5-fireworks',
      blurb: 'ครีบท้าย 3 ใบ วางแนวขนานแกน — ลาก CoP ไปท้ายให้นิ่งเหมือนหางบั้งไฟ แต่หนักแค่เศษเดียว และหน้าตัดข้างเล็ก ลมขวางพัดน้อยกว่ามาก',
      mass: 0.9,
      cost: 22,
      size: { w: 1, h: 3 },   // tall fins that reach well past the nozzle
      // big side/reference area to pull CoP hard aft, tiny frontal Cd (edge-on)
      aerodynamics: { dragCoefficient: 0.10, crossSectionArea: 0.42 },
      structural: { maxDynamicPressure: 16000 },
      attachNodes: [
        { id: 'mountL', dx: 0, dy: 0.4, type: NODE.RADIAL, accepts: ['Structural', 'Propulsion'] },
        { id: 'mountR', dx: 1, dy: 0.4, type: NODE.RADIAL, accepts: ['Structural', 'Propulsion'] }
      ]
    },
    {
      id: 'aero_fin_canted',
      name: 'ครีบเฉียง (Canted Fins — สปิน)',
      category: C.AERODYNAMICS,
      icon: '🌀',
      era: '1p5-fireworks',
      blurb: 'ครีบท้ายบิดมุมเล็กน้อย — อากาศที่ไหลผ่านดันให้จรวดหมุนรอบแกนเร็วขึ้นเรื่อย ๆ ตามความเร็ว รอบสูงพอ = ไจโรสโคปิก จรวดแข็งทื่อ เจาะลมขวางตรงเป๊ะเหมือนกระสุน',
      mass: 0.95,
      cost: 28,
      size: { w: 1, h: 3 },
      aerodynamics: { dragCoefficient: 0.13, crossSectionArea: 0.42, rollInduce: 1.0 },
      structural: { maxDynamicPressure: 16000 },
      attachNodes: [
        { id: 'mountL', dx: 0, dy: 0.4, type: NODE.RADIAL, accepts: ['Structural', 'Propulsion'] },
        { id: 'mountR', dx: 1, dy: 0.4, type: NODE.RADIAL, accepts: ['Structural', 'Propulsion'] }
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

  // ---------------------------------------------------------------------------
  //  ERA 3 · V-2 — the first LIQUID rocket and the first GUIDED one. A regen-
  //  cooled alcohol/LOX motor fed from separate tanks (mass flow from a shared
  //  pool, not a self-contained grain), instant ignition, and — critically — a
  //  gyro + graphite vanes that fly a PITCH PROGRAM: straight up off the pad,
  //  then a slow tilt downrange (the gravity turn) that trades climb for
  //  horizontal speed. That tilt is the whole foundation of orbital flight —
  //  Newton's cannonball fired flat enough that the ground curves away.
  //
  //  Parts carry `meshUrl` where a real .glb exists; VehicleRenderer falls back
  //  to procedural primitives when a model is missing so nothing is blocked.
  // ---------------------------------------------------------------------------
  var ERA3 = [
    {
      id: 'v2_nose',
      name: 'หัวรบ / เพย์โหลด V-2',
      category: C.PAYLOAD,
      icon: '🛰️',
      era: '3-v2',
      blurb: 'ส่วนหัวเพรียวลม บรรจุเพย์โหลด — ผิวเรียบแรงต้านต่ำ นำหน้าตลอดการเลี้ยวโค้ง',
      mass: 1.4,
      cost: 60,
      size: { w: 1, h: 1 },
      meshUrl: 'assets/models/capsule.glb',   // NASA Gemini capsule stands in as the payload
      meshScale: 1.0,
      aerodynamics: { dragCoefficient: 0.22, crossSectionArea: 0.030 },
      structural: { maxDynamicPressure: 90000 },
      attachNodes: [
        { id: 'bottom', dx: 0.5, dy: 1, type: NODE.STACK, accepts: ['Structural', 'Propulsion'] }
      ]
    },
    {
      id: 'v2_tank',
      name: 'ถังเชื้อเพลิง (แอลกอฮอล์ + LOX)',
      category: C.STRUCTURAL,
      icon: '🛢️',
      era: '3-v2',
      blurb: 'ถังคู่บรรจุเชื้อเพลิงเหลวมหาศาล — ต่อซ้อนได้ ยิ่งหลายถัง ยิ่งเผาได้นาน ยิ่งไปไกล',
      mass: 2.6,
      cost: 55,
      size: { w: 1, h: 3 },
      propellantMass: 16,     // kg into the SHARED pool the engine draws from
      aerodynamics: { dragCoefficient: 0.30, crossSectionArea: 0.050 },
      structural: { maxDynamicPressure: 55000 },
      attachNodes: [
        { id: 'top',    dx: 0.5, dy: 0, type: NODE.STACK, accepts: ['Payload', 'Structural'] },
        { id: 'bottom', dx: 0.5, dy: 3, type: NODE.STACK, accepts: ['Propulsion', 'Structural'] }
      ]
    },
    {
      id: 'v2_engine',
      name: 'มอเตอร์เหลว V-2 (มีไจโร)',
      category: C.PROPULSION,
      icon: '🚀',
      era: '3-v2',
      blurb: 'มอเตอร์แอลกอฮอล์/LOX จุดติดทันที แรงคงที่ ~23 วิต่อถัง + ไจโรคุมทิศ บินโปรแกรมเลี้ยวโค้งเอง',
      mass: 4.5,
      cost: 140,
      size: { w: 1, h: 2 },
      // fat finned skirt: big REFERENCE area at the very aft keeps CoP behind CoM,
      // low drag COEFFICIENT so it doesn't brake the climb (the fin trick again)
      aerodynamics: { dragCoefficient: 0.10, crossSectionArea: 0.060 },
      structural: { maxDynamicPressure: 120000 },
      propulsion: {
        mode: 'rocket',
        thrust: 1400,           // N steady
        burnTime: 999,          // s — a ceiling; real cutoff is tank depletion
        specificImpulse: 215,   // s — early regen-cooled liquid bipropellant
        propellantMass: 0,      // the grain lives in the tanks, not here
        massFlow: 0.70,         // kg/s drawn from the shared pool
        spoolTime: 0,           // liquid ignition is effectively instant
        guidance: true          // gyro-guided → flies the pitch program, no tumble
      },
      attachNodes: [
        { id: 'top', dx: 0.5, dy: 0, type: NODE.STACK, accepts: ['Structural'] }
      ]
    }
  ];

  RS.PartsCatalog.registerAll(ERA3);

  // ---------------------------------------------------------------------------
  //  ERA 4 · ORBIT — multi-staging. A single stage can't carry enough fuel to
  //  reach orbital velocity: the tankage it needs to hold that fuel weighs too
  //  much to accelerate. The answer is to THROW AWAY the empty tanks. A heavy
  //  first stage claws off the pad and through the thick air, drops away when
  //  dry, and a light high-Isp vacuum stage finishes the job in near-vacuum.
  //  A `decoupler` marks where the stack splits.
  // ---------------------------------------------------------------------------
  var ERA4 = [
    {
      id: 'orb_payload',
      name: 'ดาวเทียม CubeSat',
      category: C.PAYLOAD,
      icon: '🛰️',
      era: '4-orbit',
      blurb: 'เพย์โหลดจริง — ดาวเทียมเล็กที่ต้องส่งเข้าวงโคจร ไม่ใช่แค่ยิงขึ้นแล้วตกกลับ',
      mass: 0.5,
      cost: 200,
      size: { w: 1, h: 1 },
      meshUrl: 'assets/models/cubesat.glb',
      meshScale: 1.0,
      aerodynamics: { dragCoefficient: 0.2, crossSectionArea: 0.010 },
      structural: { maxDynamicPressure: 70000 },
      attachNodes: [
        { id: 'bottom', dx: 0.5, dy: 1, type: NODE.STACK, accepts: ['Structural', 'Propulsion'] }
      ]
    },
    {
      id: 'orb_engine_vacuum',
      name: 'เครื่องยนต์สุญญากาศ (ท่อนบน)',
      category: C.PROPULSION,
      icon: '🌌',
      era: '4-orbit',
      blurb: 'หัวฉีดบานกว้าง Isp สูง ออกแบบให้ทำงานในอากาศเบาบาง — ท่อนที่ 2 ที่เร่งเข้าวงโคจร',
      mass: 4.5,
      cost: 260,
      size: { w: 1, h: 2 },
      aerodynamics: { dragCoefficient: 0.14, crossSectionArea: 0.045 },
      structural: { maxDynamicPressure: 90000 },
      propulsion: {
        mode: 'rocket',
        thrust: 1500, burnTime: 999, specificImpulse: 355,
        propellantMass: 0, massFlow: 0.431, spoolTime: 0, guidance: true
      },
      attachNodes: [
        { id: 'top', dx: 0.5, dy: 0, type: NODE.STACK, accepts: ['Structural'] }
      ]
    },
    {
      id: 'orb_tank_large',
      name: 'ถังเชื้อเพลิงใหญ่',
      category: C.STRUCTURAL,
      icon: '🛢️',
      era: '4-orbit',
      blurb: 'ถังใบใหญ่ ต่อซ้อนได้ — ท่อนล่างใส่หลายใบ ท่อนบนใส่ใบเดียวพอ',
      mass: 2.4,
      cost: 90,
      size: { w: 1, h: 3 },
      propellantMass: 30,
      aerodynamics: { dragCoefficient: 0.30, crossSectionArea: 0.070 },
      structural: { maxDynamicPressure: 60000 },
      attachNodes: [
        { id: 'top',    dx: 0.5, dy: 0, type: NODE.STACK, accepts: ['Payload', 'Structural'] },
        { id: 'bottom', dx: 0.5, dy: 3, type: NODE.STACK, accepts: ['Propulsion', 'Structural'] }
      ]
    },
    {
      id: 'orb_decoupler',
      name: 'วงแหวนสลัดท่อน (Decoupler)',
      category: C.STRUCTURAL,
      icon: '💥',
      era: '4-orbit',
      blurb: 'วงแหวนสลักระเบิด คั่นระหว่างท่อน — พอเชื้อเพลิงท่อนล่างหมด มันจะสลัดท่อนล่างทิ้ง',
      mass: 1.4,
      cost: 45,
      size: { w: 1, h: 1 },
      decoupler: true,
      aerodynamics: { dragCoefficient: 0.35, crossSectionArea: 0.015 },
      structural: { maxDynamicPressure: 150000 },
      attachNodes: [
        { id: 'top',    dx: 0.5, dy: 0, type: NODE.STACK, accepts: ['Propulsion', 'Structural'] },
        { id: 'bottom', dx: 0.5, dy: 1, type: NODE.STACK, accepts: ['Propulsion', 'Structural'] }
      ]
    },
    {
      id: 'orb_engine_heavy',
      name: 'เครื่องยนต์หนัก (ท่อนล่าง)',
      category: C.PROPULSION,
      icon: '🔥',
      era: '4-orbit',
      blurb: 'แรงขับมหาศาลสำหรับคว้าตัวพ้นพื้นและฝ่าอากาศหนา — เผาเร็ว สลัดทิ้งเมื่อหมด',
      mass: 11,
      cost: 360,
      size: { w: 1, h: 2 },
      // wide finned skirt: big reference area at the aft = self-stable, low Cd
      aerodynamics: { dragCoefficient: 0.10, crossSectionArea: 0.18 },
      structural: { maxDynamicPressure: 140000 },
      propulsion: {
        mode: 'rocket',
        thrust: 8500, burnTime: 999, specificImpulse: 255,
        propellantMass: 0, massFlow: 3.40, spoolTime: 0, guidance: true
      },
      attachNodes: [
        { id: 'top', dx: 0.5, dy: 0, type: NODE.STACK, accepts: ['Structural'] }
      ]
    }
  ];

  RS.PartsCatalog.registerAll(ERA4);

  // handy for tools / data browsers
  RS.data = RS.data || {};
  RS.data.parts = {
    '0-khomloy': ERA0, '1-bangfai': ERA1, '1p5-fireworks': ERA1_5,
    '3-v2': ERA3, '4-orbit': ERA4
  };

})(typeof window !== 'undefined' ? window : this);
