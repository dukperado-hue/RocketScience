/* =============================================================================
 * FROM FIRE TO ORBIT
 * js/data/missions.js  ·  mission + story content (not engine)
 *
 * Mission schema (Phase 4 + 6):
 *   id, era, title, description        — identity + one-line story hook
 *   npc, npc_dialogue[]                — who briefs you, and what they say
 *   wind                              — ambient breeze, m/s (Phase 6)
 *   objectives  { targetAltitude?, flightTimeMin?, surviveFlight? }
 *   constraints { maxCost?, maxMass?, requiredParts?[], safeZoneRadius? }
 *   reward { score }
 *
 * MissionEngine.evaluate(mission, sim, vehicle) scores a finished flight +
 * the built vehicle against this. Nothing here touches render or Three.js.
 * ===========================================================================*/
(function (global) {
  'use strict';

  var MISSIONS = [
    // ---- ERA 0 · Khom Loy ---------------------------------------------
    {
      id: 'e0-first-light',
      era: '0-khomloy',
      title: 'แสงแรก',
      description: 'น้องกะปิสงสัยว่า — เราทำอะไรให้ลอยได้ด้วยความร้อนอย่างเดียวไหม?',
      npc: 'kapi',
      npc_dialogue: [
        'พี่... หนูอ่านเจอว่าอากาศร้อนมันเบากว่าอากาศเย็น',
        'ถ้าเราขังความร้อนไว้ในซองกระดาษ มันจะลอยขึ้นเองเลยเหรอ?',
        'ลองประกอบโคมลอยดูสิพี่ — ขอแค่ลอยพ้นหัวคนก็พอแล้ว'
      ],
      objectives: { targetAltitude: 50 },
      constraints: { maxCost: 100, requiredParts: ['fuel_wax'] },
      reward: { score: 400 }
    },
    {
      id: 'e0-festival-height',
      era: '0-khomloy',
      title: 'ลอยนาน',
      description: 'คืนยี่เป็ง น้องกะปิอยากให้โคมของเราลอยอยู่บนฟ้านานที่สุด — ยิ่งเบา ยิ่งอยู่นาน',
      npc: 'kapi',
      npc_dialogue: [
        'คืนนี้ยี่เป็งแล้วพี่! เขาปล่อยโคมกันทั้งหมู่บ้านเลย',
        'หนูอยากให้โคมเราลอยอยู่บนฟ้านาน ๆ ให้คนดูได้เยอะ ๆ',
        'เคล็ดลับคือ "เบา" — ถ่วงน้ำหนักมากไป มันจะร่วงเร็ว',
        'ขึ้นเกิน 80 เมตร แล้วลอยอยู่ให้ครบ 130 วินาที'
      ],
      objectives: { targetAltitude: 80, flightTimeMin: 130 },
      constraints: { maxCost: 120 },
      reward: { score: 700 }
    },
    {
      id: 'e0-the-drifter',
      era: '0-khomloy',
      title: 'ลอยตามลม',
      description: 'คืนลมแรง — มีเขตห้ามบิน (NOTAM) รอบลานบินเล็ก. ปล่อยโคมให้สูงพอ แต่ห้ามลอยหลุดเขต',
      npc: 'kapi',
      npc_dialogue: [
        'พี่ คืนนี้ลมแรงกว่าปกติ ~2 เมตรต่อวินาที',
        'แล้วก็... มีประกาศ NOTAM เขตห้ามบินรอบลานบินเล็ก รัศมี 230 เมตร',
        'ถ้าโคมเบาไป ลมจะพัดมันลอยหลุดเขต = ผิดกฎการบิน มิชชันล้มทันที',
        'ต้องถ่วงน้ำหนักด้วย "ป้ายอธิษฐาน" ให้พอดี — ขึ้นเกิน 50 ม. แต่ลงภายในรัศมี 230 ม.'
      ],
      wind: 2,
      objectives: { targetAltitude: 50, surviveFlight: true },
      constraints: { safeZoneRadius: 230, maxCost: 160 },
      reward: { score: 950 }
    },

    // ---- ERA 1 · Bang Fai (บั้งไฟอีสาน) -----------------------------
    {
      id: 'e1-the-tail',
      era: '1-bangfai',
      title: 'หางคือทุกอย่าง',
      description: 'พี่ช่างสอนทำบั้งไฟแบบโบราณ — ไม่มีครีบ นิ่งได้ด้วย "หาง" ไม้ไผ่ยาวอย่างเดียว',
      npc: 'pchang',
      npc_dialogue: [
        'บั้งไฟบ้านเราไม่ใส่ครีบนะ — ใส่ "หาง" ไม้ไผ่ลำยาว ๆ ผูกขนาบลำ',
        'หางยาวทำสองอย่าง: ลากศูนย์แรงดันไปท้ายสุด (หัวหันสู้ลมเอง) แล้วก็...',
        'มวลหางที่อยู่ปลายคานยาว ๆ ทำให้บั้งไฟ "หมุนยาก" — ลมกระโชกก็เขี่ยหัวไม่ไหว (I ∝ mL²)',
        'ลองถอดหางออกดูสิ แล้วจะเห็นว่ามันคว้างตกทันทีที่พ้นราง',
        'ประกอบ เลา + หมื่อ + หาง ยิงจากฐานเฉียง ให้ขึ้นเกิน 180 เมตร โดยไม่คว้าง'
      ],
      objectives: { targetAltitude: 180, surviveFlight: true },
      constraints: { requiredParts: ['propulsion_mue', 'frame_tailstick'] },
      reward: { score: 900 }
    },
    {
      id: 'e1-reach-for-sky',
      era: '1-bangfai',
      title: 'บั้งไฟงานบุญ',
      description: 'งานบุญบั้งไฟ พี่ช่างท้าให้ส่งบั้งไฟขึ้นเกิน 300 เมตร งบไม่บานปลาย และกระบอกต้องไม่ฉีก',
      npc: 'pchang',
      npc_dialogue: [
        'งานบุญบั้งไฟปีนี้ เราส่งลูกใหญ่ — ซ้อน "เลา" หลายลำได้ ยิ่งซ้อนยิ่งเป็นชั้นหมื่น–แสน–ล้าน',
        'เกิน 300 เมตรถึงจะได้หน้าหมู่บ้าน — แต่ไม้ไผ่รับแรงดันอากาศได้จำกัด อย่าให้ Max-Q เกิน',
        'หมื่อลูกนี้แรงพีคสูงแล้วค่อย ๆ อ่อนตอนท้าย — เผาสกปรก ควันเต็มลาน',
        'หางต้องยาวพอถ่วงลำที่หนักขึ้น ไม่งั้นคว้าง'
      ],
      objectives: { targetAltitude: 300, surviveFlight: true },
      constraints: { maxCost: 240, requiredParts: ['propulsion_mue', 'frame_tailstick'] },
      reward: { score: 1200 }
    },

    // ---- ERA 1.5 · Fireworks · THE SKY ATLAS (แผนที่นภากาศ) ----------
    //  A cultural story-campaign that teaches physics / chemistry / composition
    //  through festival fireworks. M01 is the tutorial: learn to match the fuse
    //  timing to the apogee of your lift charge (projectile motion).
    {
      id: 'sky-m01-songkran',
      era: '1p5-fireworks',
      title: 'M01 · สงกรานต์',
      description: 'พลุนัดแรกของคุณ — สร้างพลุเฉลิมฉลองสงกรานต์ให้แตกกระจายในกรอบเป้าหมายกลางฟ้าพอดี',
      npc: 'pchang',
      atlas: {
        code: 'M01',
        name: 'สงกรานต์',
        subtitle: 'Songkran · The Foundation',
        stamp: '💦',
        accent: '#7fd0ff',
        lesson: 'projectile-motion',
        culturalBrief: 'สร้างพลุเฉลิมฉลองสงกรานต์ เป้าหมาย: พลุต้องแตกกระจายเหนือพื้นที่จัดงานพอดี ' +
          '— ไม่เตี้ยเกินไป (อันตรายกับคนดู) ไม่สูงเกินไป (ดอกพลุจางหาย)',
        design: 'firework-desk',
        science: {
          tag: 'Physics Insight · Projectile Motion (การเคลื่อนที่แบบโพรเจกไทล์)',
          body: 'จังหวะที่ลูกพลุ "แตก" ต้องตรงกับ "จุดสูงสุด (apogee)" ของแรงส่ง — ' +
            'ตอนที่ความเร็วแนวดิ่งเป็นศูนย์พอดี ลูกพลุจะลอยนิ่งที่สุด ดอกพลุจึงกลมสวย. ' +
            'ถ้าตั้งชนวน "ยาวเกินไป" แรงโน้มถ่วงจะดึงลูกพลุตกลงมาก่อนชนวนจะไหม้ถึง — ' +
            'มันเลยแตกต่ำ หรือแตกกลางพื้น (ด้าน). ถ้าชนวน "สั้นเกินไป" ลูกยังพุ่งขึ้นไม่ถึงกรอบ.'
        }
      },
      npc_dialogue: [
        'ปีใหม่ไทยแล้ว! คืนสงกรานต์นี้เราจะจุดพลุเปิดงาน',
        'พลุลูกแรกของหนู — ไม่ต้องประกอบจรวดทีละชิ้นแล้ว ใช้ "โต๊ะออกแบบพลุ" เลย',
        'เลือก 3 อย่าง: แรงส่ง (ขึ้นสูงแค่ไหน) · สารให้สี (ดอกพลุสีอะไร) · ชนวนหน่วงเวลา (แตกเมื่อไหร่)',
        'เคล็ดลับ: ลูกพลุต้องแตกตอนที่มัน "ลอยนิ่งสุด" กลางฟ้า — จูนชนวนให้ตรงกับจังหวะนั้น',
        'เป้าหมาย: ให้ดอกพลุบานในกรอบเรืองแสงระหว่าง 70–110 เมตร'
      ],
      objectives: { burstAltitudeBox: [70, 110] },
      reward: { score: 500 }
    },
    {
      id: 'sky-m02-pimaimueang',
      era: '1p5-fireworks',
      title: 'M02 · ปี๋ใหม่เมือง',
      description: 'ปี๋ใหม่เมืองล้านนา — จุดพลุร่วมกับโคมลอย. ยิงให้ดอกพลุบานในกรอบ แต่ห้ามชนโคมลอยเด็ดขาด',
      npc: 'pchang',
      atlas: {
        code: 'M02',
        name: 'ปี๋ใหม่เมือง',
        subtitle: 'Pi Mai Mueang · Spatial Planning',
        stamp: '🏮',
        accent: '#ffb066',
        lesson: '2d-trajectory-safety',
        culturalBrief: 'เฉลิมฉลองประเพณีปี๋ใหม่เมือง (Northern Thai New Year) ด้วยพลุและโคมลอย. ' +
          'เป้าหมาย: ยิงพลุให้แตกสวยในกรอบที่กำหนด — แต่ SAFETY FIRST — ห้ามชนโคมลอยที่กำลังลอยขึ้นมา!',
        design: 'firework-desk',
        angles: true,
        // a rising stream of khom loy that blocks the straight-up path; the
        // target box sits off to the right — you must arc AROUND the stream
        lanterns: [
          { x: -5, y0: 18, z: 0,    vy: 1.10, r: 5.0 },
          { x: 0,  y0: 29, z: -2,   vy: 1.10, r: 5.5 },
          { x: 3,  y0: 43, z: 1.5,  vy: 1.05, r: 5.5 },
          { x: 6,  y0: 57, z: -1,   vy: 1.00, r: 5.5 }
        ],
        science: {
          tag: 'Physics Insight · 2D Trajectory (วิถีโพรเจกไทล์ 2 มิติ)',
          body: 'เมื่อยิงเป็น "มุม" ความเร็วต้นถูกแยกเป็น 2 เวกเตอร์ — แนวราบ (X) และแนวดิ่ง (Y). ' +
            'ลูกพลุจึงเดินทางเป็น "เส้นโค้งพาราโบลา" ไม่ใช่เส้นตรง: มุมกำหนดว่าโค้งไปทางไหน · ' +
            'แรงส่ง + ชนวน กำหนดว่าแตกที่จุดไหนบนเส้นโค้งนั้น. จูนทั้งสามอย่างให้ส่วนโค้งพาดอกพลุ ' +
            'เข้าไปแตกในกรอบพอดี.'
        },
        scienceCollision: {
          tag: 'Physics Insight · 2D Trajectory & Safety (วิถี 2 มิติ · ความปลอดภัย)',
          body: 'เมื่อยิงเป็นมุม ความเร็วต้นแยกเป็นเวกเตอร์แนวราบ (X) และแนวดิ่ง (Y) — ลูกพลุเดินทางเป็น ' +
            'เส้นโค้งพาราโบลา. คุณต้องคำนวณส่วนโค้งให้มี "อากาศว่าง" (clear airspace) ตลอดเส้นทาง! ' +
            'งานพลุจริงกำหนด "ระยะปลอดภัยเชิงพื้นที่" (spatial clearance) อย่างเคร่งครัด — ' +
            'ห้ามยิงผ่านแนวที่มีคน สิ่งของ หรือโคมลอยโดยเด็ดขาด.'
        }
      },
      npc_dialogue: [
        'ปี๋ใหม่เมืองบ้านเฮา เขาปล่อยโคมลอยกันเต็มฟ้า — คืนนี้เราจุดพลุคู่กับโคม',
        'ปัญหาคือ: โคมลอยมันลอยขึ้นมาเป็นสาย ขวางทางพลุที่ยิงตรง ๆ พอดี',
        'ต้องยิง "เป็นมุม" — เอียงซ้าย 75° หรือ เอียงขวา 75° ให้ลูกพลุโค้งอ้อมสายโคม',
        'กรอบเป้าหมายอยู่เยื้องไปทางขวา — จูนมุม + แรงส่ง + ชนวน ให้ส่วนโค้งพาลูกไปแตกในกรอบ',
        'กฎเหล็ก: ห้ามให้ลูกพลุหรือดอกพลุโดนโคมลอยเด็ดขาด — งานพลุจริงต้องเว้นระยะปลอดภัย'
      ],
      objectives: { burstAltitudeBox: [78, 118], burstXBox: [14, 34], noCollision: true },
      reward: { score: 700 }
    },
    {
      id: 'e1p5-the-pop',
      era: '1p5-fireworks',
      title: 'แรงกระแทกเดียว',
      description: 'พี่ช่างอยากให้น้องกะปิเห็นความต่าง — บั้งไฟค่อย ๆ ออกตัว แต่ครกดอกไม้ไฟ "ป็อก" ทีเดียวขึ้นเลย',
      npc: 'pchang',
      npc_dialogue: [
        'ดูบั้งไฟเมื่อกี้สิ — มันนั่งพ่นควันอยู่ตั้งวิกว่าจะขยับ',
        'ทีนี้ลองดินส่งของครกดอกไม้ไฟ: เผาหมดใน 0.1 วิ ไม่มีหน่วง',
        'ประกอบ ท่อครก + ดินส่ง + ลูกโบตั๋น แล้วยิงให้เกิน 150 เมตร',
        'มันจะกระชากขึ้นทันทีที่จุด — นั่นแหละ "อิมพัลส์"'
      ],
      objectives: { targetAltitude: 150, surviveFlight: true },
      constraints: { maxCost: 90, requiredParts: ['fw_lift_charge', 'fw_shell_peony'] },
      reward: { score: 900 }
    },
    {
      id: 'e1p5-festival-burst',
      era: '1p5-fireworks',
      title: 'ดอกโบตั๋นเหนือหมู่บ้าน',
      description: 'งานวัด — ต้องส่งลูกให้สูงพอที่ดอกจะบานเหนือยอดไม้ แต่ห้ามหลุดเขตงาน (NOTAM ชั่วคราว)',
      npc: 'pchang',
      npc_dialogue: [
        'คืนนี้ยิงเหนือลานวัด คนมุงเต็มไปหมด',
        'สูงเกิน 250 เมตรถึงจะสวย — แต่มีเขตปลอดภัยรัศมี 400 เมตร',
        'ดินส่งแรงไป ลูกลอยไกลหลุดเขต = อันตราย งานล่ม',
        'จูนน้ำหนักลูกกับดินส่งให้พอดี'
      ],
      objectives: { targetAltitude: 250, surviveFlight: true },
      constraints: { safeZoneRadius: 400, maxCost: 120,
        requiredParts: ['fw_mortar_tube', 'fw_shell_peony'] },
      reward: { score: 1250 }
    },

    // ---- ERA 3 · V-2 -----------------------------------------------
    {
      id: 'e3-the-arch',
      era: '3-v2',
      title: 'เส้นโค้ง',
      description: 'ศูนย์ควบคุมอยากพิสูจน์ว่าไจโรทำงาน — จรวดต้อง "เลี้ยว" ไปตามเส้นโค้ง ไม่ใช่พุ่งขึ้นตรง ๆ แล้วตกที่เดิม',
      npc: 'narr',
      npc_dialogue: [
        'V-2 ไม่ได้ออกแบบมาให้พุ่งขึ้นฟ้าแล้วตกกลับที่เดิม',
        'ไจโรกับครีบแกรไฟต์จะค่อย ๆ เอียงหัวจรวดหลังพ้น 500 เมตร — เรียกว่า Gravity Turn',
        'ความเร็วที่เคยพุ่งขึ้น จะกลายเป็นความเร็ว "แนวราบ" — นี่คือหลักการเดียวกับลูกกระสุนของนิวตัน',
        'เป้าหมาย: ความเร็วสูงสุดเกิน 250 m/s และตกไกลจากฐานเกิน 1,500 เมตร'
      ],
      objectives: { maxVelocityMin: 250, downrangeMin: 1500 },
      constraints: { requiredParts: ['v2_engine', 'v2_tank'] },
      reward: { score: 1600 }
    },

    // ---- ERA 4 · Orbit ------------------------------------------------
    {
      id: 'e4-newtons-cannonball',
      era: '4-orbit',
      title: 'ลูกกระสุนของนิวตัน',
      description: 'เป้าหมายสูงสุด: ส่งดาวเทียมเข้า "วงโคจร" — ยิงเร็วพอจนมันตกรอบดาวไปเรื่อย ๆ ไม่มีวันแตะพื้น',
      npc: 'narr',
      npc_dialogue: [
        'นิวตันคิดการทดลองในหัว: ยิงลูกปืนใหญ่จากยอดเขาสูง',
        'ยิงเบา ๆ มันตกใกล้ ๆ · ยิงแรงขึ้น มันตกไกลขึ้น เพราะโลกโค้งหนีไป',
        'ยิงแรง "พอดี" — มันจะตกด้วยอัตราเดียวกับที่พื้นโค้งหนี = ตกรอบโลกตลอดกาล นั่นคือวงโคจร',
        'ต้องใช้จรวด 2 ท่อน: ท่อนล่างแรง ๆ ฝ่าอากาศ แล้วสลัดทิ้ง ท่อนบน Isp สูงเร่งเข้าวงโคจร',
        'สำเร็จเมื่อ: จุดต่ำสุดของวงโคจร (periapsis) เกิน 60 กม. — พ้นชั้นบรรยากาศ ไม่มีวันตก'
      ],
      objectives: { orbitPeriapsisMin: 60000 },
      constraints: { requiredParts: ['orb_decoupler', 'orb_engine_vacuum'] },
      reward: { score: 3000 }
    }
  ];

  var byId = {};
  MISSIONS.forEach(function (m) { byId[m.id] = m; });

  global.RS = global.RS || {};
  global.RS.data = global.RS.data || {};
  global.RS.data.missions = {
    list: MISSIONS.slice(),
    get: function (id) { return byId[id]; },
    forEra: function (eraId) {
      return MISSIONS.filter(function (m) { return m.era === eraId; });
    }
  };

})(typeof window !== 'undefined' ? window : this);
