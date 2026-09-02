/* =============================================================================
 * FROM FIRE TO ORBIT
 * js/data/missions.js  ·  mission content (not engine)
 *
 * An objective is { type, ...bounds, label }. MissionEngine.evaluate() checks
 * each against a SimulationResult.summary (+ events). Types:
 *   apogeeMin / apogeeMax   — summary.apogee (m)
 *   flightTimeMin           — summary.flightTime (s)
 *   maxVelocityMax          — summary.maxVelocity (m/s)
 *   softLanding             — IMPACT event exists and |velocity| <= value (m/s)
 *   diagnosticsClear        — no FAIL in diagnostics (value = worst allowed)
 * ===========================================================================*/
(function (global) {
  'use strict';

  var MISSIONS = [
    {
      id: 'khom-first-light',
      era: '0-khomloy',
      name: 'แสงแรก',
      brief: 'ปล่อยโคมให้ลอยพ้นยอดไม้ — สูงอย่างน้อย 60 เมตร แล้วลงอย่างปลอดภัย',
      objectives: [
        { type: 'apogeeMin', value: 60, label: 'ลอยสูงอย่างน้อย 60 ม.' },
        { type: 'softLanding', value: 8, label: 'ลงแตะพื้นไม่เกิน 8 m/s' },
        { type: 'diagnosticsClear', value: 'WARN', label: 'ไม่มีข้อบกพร่องร้ายแรง' }
      ],
      reward: { score: 500 }
    },
    {
      id: 'khom-festival-height',
      era: '0-khomloy',
      name: 'สูงเทียมดาว',
      brief: 'คืนยี่เป็ง — ส่งโคมขึ้นให้สูงเกิน 300 เมตร และลอยอยู่บนฟ้าอย่างน้อย 2 นาที',
      objectives: [
        { type: 'apogeeMin', value: 300, label: 'ลอยสูงเกิน 300 ม.' },
        { type: 'flightTimeMin', value: 120, label: 'อยู่บนฟ้า ≥ 120 วินาที' }
      ],
      reward: { score: 900 }
    },
    {
      id: 'bangfai-straight-up',
      era: '1-bangfai',
      name: 'พุ่งตรง',
      brief: 'บั้งไฟลูกแรก — ต้องพุ่งขึ้นตรง ไม่ตีลังกากลางอากาศ และขึ้นสูงเกิน 400 เมตร. ' +
        'เคล็ดลับ: ใส่ครีบหาง (fin) เพื่อดึงศูนย์แรงดันไปท้ายจรวด',
      objectives: [
        { type: 'apogeeMin', value: 320, label: 'ขึ้นสูงอย่างน้อย 320 ม.' },
        { type: 'diagnosticsClear', value: 'WARN', label: 'ไม่เสียการควบคุม / ไม่มีข้อบกพร่องร้ายแรง' }
      ],
      reward: { score: 800 }
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
