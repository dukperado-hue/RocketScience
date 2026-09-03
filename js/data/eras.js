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
      partIds: ['fuel_wax', 'frame_bamboo', 'cover_paper', 'payload_tag'],
      // how this era becomes available
      unlock: { type: 'default' },
      // simple physical envelope the era lives in (for UI hints)
      envelope: { apogee: 1200, note: 'ลอยตามลม ควบคุมทิศไม่ได้' }
    },
    {
      id: '1-bangfai',
      order: 1,
      name: 'ยุค 1 · บั้งไฟ',
      tagline: 'บั้งไฟแสน ~120 กก. — ดั้งเดิมนิ่งด้วย "หาง" ไม้ไผ่ยาว (I ∝ mL²) แต่หนัก ลมขวางพัดเป๋ แตกที่ยอด · หรือจะ "วิศวกรรม" ด้วยหัวเพรียวลม + ครีบ (ตรง/เฉียงสปิน)',
      partIds: ['payload_howot', 'body_lao', 'propulsion_mue', 'frame_tailstick',
                'payload_nosecone', 'aero_fin_straight', 'aero_fin_canted'],
      unlock: { type: 'default' },
      envelope: { apogee: 3000, note: 'พุ่งเฉียงตามราง หางยาวถ่วงให้นิ่ง แล้วโค้งลงตามแรงโน้มถ่วง' }
    },
    {
      id: '1p5-fireworks',
      order: 1.5,
      name: 'ยุค 1.5 · ดอกไม้ไฟ',
      tagline: 'จากภูมิปัญญาบ้าน ๆ สู่วิศวกรรม: ดินส่งอิมพัลส์ + หัวเพรียวลม + ครีบ (ตรง/เฉียงสปิน) — บทเรียนแรงต้าน ความเฉื่อย และไจโรสโคปิก',
      partIds: ['fw_shell_peony', 'fw_lift_charge', 'fw_mortar_tube',
                'payload_nosecone', 'aero_fin_straight', 'aero_fin_canted'],
      unlock: { type: 'default' },
      envelope: { apogee: 400, note: 'พุ่งด้วยแรงกระแทกเดียว แล้วลอยตามความเฉื่อย' }
    },
    {
      id: '3-v2',
      order: 3,
      name: 'ยุค 3 · V-2',
      tagline: 'จรวดเชื้อเพลิงเหลวลูกแรก + ไจโรคุมทิศ — โปรแกรมเลี้ยวโค้ง (Gravity Turn) คือรากฐานของวงโคจร',
      partIds: ['v2_nose', 'v2_tank', 'v2_engine'],
      unlock: { type: 'default' },
      envelope: { apogee: 60000, note: 'บินขึ้นตรงแล้วเอียงหัวทำความเร็วแนวราบ — ยิงไกลข้ามขอบฟ้า' }
    },
    {
      id: '4-orbit',
      order: 4,
      name: 'ยุค 4 · วงโคจร',
      tagline: 'จรวดหลายท่อน — สลัดถังเปล่าทิ้งเพื่อไปให้ถึงความเร็ววงโคจร คือลูกกระสุนของนิวตันที่ยิงแรงพอจนไม่มีวันตก',
      partIds: ['orb_payload', 'orb_engine_vacuum', 'orb_tank_large', 'orb_decoupler', 'orb_engine_heavy'],
      unlock: { type: 'default' },
      envelope: { apogee: 400000, note: 'สองท่อน + เลี้ยวโค้ง → เข้าวงโคจรรอบดาว' }
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
