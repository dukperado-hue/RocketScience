/* =============================================================================
 * FROM FIRE TO ORBIT
 * js/data/eras.js  ·  the progression spine (content, not engine)
 *
 * Each era gates a set of parts and (later) a legal regime. EraManager reads
 * this; nothing here depends on any engine module.
 * ===========================================================================*/
(function (global) {
  'use strict';

  var ERAS = [
    {
      id: '0-khomloy',
      order: 0,
      name: 'ยุค 0 · โคมลอย',
      tagline: 'อากาศร้อนเบากว่าอากาศเย็น — หลักการลอยที่เก่าแก่ที่สุด',
      partIds: ['fuel_wax', 'frame_bamboo', 'cover_paper'],
      // how this era becomes available
      unlock: { type: 'default' },
      // simple physical envelope the era lives in (for UI hints)
      envelope: { apogee: 1200, note: 'ลอยตามลม ควบคุมทิศไม่ได้' }
    },
    {
      id: '1-bangfai',
      order: 1,
      name: 'ยุค 1 · บั้งไฟ',
      tagline: 'ดินปืนอัดในกระบอกไม้ไผ่ — แรงขับจริงครั้งแรก · CoP ต้องอยู่ท้าย CoM',
      partIds: ['nose_cone_wood', 'body_tube_bamboo', 'motor_blackpowder', 'fin_wood'],
      // Phase 3: default-open so the aero-stability lesson is reachable now.
      // Campaign gating (2 khom missions) returns when the mission flow lands.
      unlock: { type: 'default' },
      envelope: { apogee: 3000, note: 'พุ่งขึ้นตรง หางถ่วงให้นิ่ง' }
    }
  ];

  var byId = {};
  ERAS.forEach(function (e) { byId[e.id] = e; });

  global.RS = global.RS || {};
  global.RS.data = global.RS.data || {};
  global.RS.data.eras = {
    list: ERAS.slice().sort(function (a, b) { return a.order - b.order; }),
    get: function (id) { return byId[id]; },
    first: function () { return this.list[0]; }
  };

})(typeof window !== 'undefined' ? window : this);
