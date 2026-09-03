/* =============================================================================
 * FROM FIRE TO ORBIT
 * js/data/missions.js  ·  mission + story content (not engine)
 *
 * Mission schema (Phase 4):
 *   id, era, title, description        — identity + one-line story hook
 *   npc, npc_dialogue[]                — who briefs you, and what they say
 *   objectives { targetAltitude?, surviveFlight? }
 *   constraints { maxCost?, maxMass?, requiredParts?[] }
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
      title: 'สูงเทียมดาว',
      description: 'คืนยี่เป็ง ทั้งหมู่บ้านปล่อยโคม — น้องกะปิอยากให้โคมของเราขึ้นสูงที่สุด',
      npc: 'kapi',
      npc_dialogue: [
        'คืนนี้ยี่เป็งแล้วพี่! เขาปล่อยโคมกันทั้งหมู่บ้านเลย',
        'หนูอยากให้โคมเราขึ้นไปสูง ๆ ให้คนทั้งอำเภอเห็น',
        'ซองใหญ่ขึ้น = ลอยดีขึ้น แต่ก็หนักและต้านลมมากขึ้นนะ ลองปรับดู'
      ],
      objectives: { targetAltitude: 250, surviveFlight: true },
      constraints: { maxCost: 220 },
      reward: { score: 700 }
    },

    // ---- ERA 1 · Bang Fai --------------------------------------------
    {
      id: 'e1-straight-and-narrow',
      era: '1-bangfai',
      title: 'ตรงและนิ่ง',
      description: 'พี่ช่างอยากลองมอเตอร์ดินปืนลูกใหม่ — แต่เตือนว่าแรงขับที่ไม่มีเสถียรภาพคือหายนะ',
      npc: 'pchang',
      npc_dialogue: [
        'เอ้า! มอเตอร์ดินปืนลูกใหม่มาแล้ว แรงกว่าเดิมเยอะ',
        'แต่ฟังนะ — แรงขับเยอะแค่ไหนก็ไร้ค่า ถ้าจรวดมันตีลังกากลางอากาศ',
        'กฎเหล็ก: ศูนย์แรงดัน (CoP) ต้องอยู่ "ท้าย" ศูนย์ถ่วง (CoM) — ใส่ครีบหางซะ',
        'เอาให้ขึ้นตรง ๆ เกิน 200 เมตร โดยไม่เสียการควบคุม'
      ],
      objectives: { targetAltitude: 200, surviveFlight: true },
      constraints: { requiredParts: ['motor_blackpowder'] },
      reward: { score: 800 }
    },
    {
      id: 'e1-reach-for-sky',
      era: '1-bangfai',
      title: 'บั้งไฟงานบุญ',
      description: 'งานบุญบั้งไฟ พี่ช่างท้าให้ส่งบั้งไฟขึ้นเกิน 380 เมตร โดยงบไม่บานปลายและกระบอกไม่ฉีก',
      npc: 'pchang',
      npc_dialogue: [
        'งานบุญบั้งไฟปีนี้ เราส่งลูกใหญ่',
        'เกิน 380 เมตรถึงจะได้หน้าหมู่บ้าน — แต่ไม้ไผ่รับแรงดันอากาศได้จำกัดนะ',
        'อย่าเร่งเครื่องจนกระบอกฉีก และงบก็มีจำกัด — วิศวกรที่ดีทำได้ด้วยของน้อย'
      ],
      objectives: { targetAltitude: 380, surviveFlight: true },
      constraints: { maxCost: 260, requiredParts: ['motor_blackpowder', 'fin_wood'] },
      reward: { score: 1100 }
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
