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
        burnTime: 200,        // ~3.5 min of usable flame
        specificImpulse: 0,   // buoyancy: no exhaust
        propellantMass: 0.012,// 12 g of wax burns off
        spoolTime: 20         // s to heat the air column to full lift
      },
      // the wax cradle hangs UNDER the bamboo hoop, so its live node points up
      attachNodes: [
        { id: 'top', dx: 0.5, dy: 0, type: NODE.STACK, accepts: ['Structural'] }
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
    }
  ];

  RS.PartsCatalog.registerAll(ERA0);

  // handy for tools / data browsers
  RS.data = RS.data || {};
  RS.data.parts = { '0-khomloy': ERA0 };

})(typeof window !== 'undefined' ? window : this);
