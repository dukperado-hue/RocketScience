/* =============================================================================
 * FROM FIRE TO ORBIT — Unified Architecture
 * js/core/PartsCatalog.js
 *
 * ONE schema for every flying thing the game will ever build:
 *   a Khom Loy lantern, a Bang Fai bamboo rocket, a liquid orbital stack.
 *
 * There are NO special cases. A lantern's wax fuel and a Merlin engine are
 * both just `Part`s with a `propulsion` block. The Assembly Engine (Vehicle),
 * the Blueprint builder (Blueprint2D) and the Physics loop (PhysicsEngine)
 * never branch on "what kind of vehicle is this" — they only read this schema.
 * ===========================================================================*/
(function (global) {
  'use strict';

  /** Canonical part categories. Everything belongs to exactly one. */
  var CATEGORY = {
    STRUCTURAL: 'Structural',
    PROPULSION: 'Propulsion',
    AERODYNAMICS: 'Aerodynamics',
    PAYLOAD: 'Payload'
  };

  /** Attach-node kinds. `stack` = axial (top/bottom), `radial` = side-mounted. */
  var NODE = {
    STACK: 'stack',
    RADIAL: 'radial'
  };

  /**
   * A single attach point on a part, expressed in the part's LOCAL frame.
   * Units are grid cells; origin is the part's own origin (top-left of its
   * bounding box). `dx`/`dy` therefore range over [0..size.w] / [0..size.h].
   *
   * @typedef {Object} AttachNodeDef
   * @property {string} id        - unique within the part, e.g. "top","bottom","radialL"
   * @property {number} dx        - x offset from part origin, in grid cells
   * @property {number} dy        - y offset from part origin, in grid cells
   * @property {'stack'|'radial'} type
   * @property {string[]} [accepts] - category whitelist; ['*'] = anything (default)
   */

  /**
   * The universal Part definition.
   *
   * @param {Object} def
   * @param {string} def.id
   * @param {string} def.name
   * @param {string} def.category         - one of CATEGORY.*
   * @param {string} [def.icon]           - single glyph for the catalog rail
   * @param {string} [def.era]            - unlock era tag, e.g. "0-khomloy"
   * @param {string} [def.blurb]          - one-line tooltip
   * @param {number} def.mass             - DRY mass, kg
   * @param {number} def.cost             - Baht
   * @param {{w:number,h:number}} [def.size] - footprint in grid cells (default 1x1)
   * @param {Object} [def.aerodynamics]
   * @param {number} [def.aerodynamics.dragCoefficient]  - Cd, dimensionless
   * @param {number} [def.aerodynamics.crossSectionArea] - m^2, frontal area contribution
   * @param {Object} [def.propulsion]     - omit for inert parts
   * @param {number} [def.propulsion.thrust]          - N (steady). For buoyancy mode this
   *                                                    is the peak lift force in N.
   * @param {number} [def.propulsion.burnTime]        - s of useful output
   * @param {number} [def.propulsion.specificImpulse] - Isp, s (0 for buoyancy)
   * @param {number} [def.propulsion.propellantMass]  - kg consumed across burnTime
   * @param {number} [def.propulsion.spoolTime]       - s to ramp from 0 to full output
   * @param {'rocket'|'buoyancy'} [def.propulsion.mode] - default "rocket"
   * @param {AttachNodeDef[]} def.attachNodes
   */
  function Part(def) {
    if (!def || !def.id) throw new Error('Part: definition needs an id');
    if (CATEGORY_VALUES.indexOf(def.category) === -1) {
      throw new Error('Part ' + def.id + ': unknown category "' + def.category + '"');
    }

    this.id = def.id;
    this.name = def.name || def.id;
    this.category = def.category;
    this.icon = def.icon || '▧';
    this.era = def.era || '0-khomloy';
    this.blurb = def.blurb || '';

    this.mass = num(def.mass, 0);          // kg, dry
    this.cost = num(def.cost, 0);          // Baht
    this.size = {
      w: num(def.size && def.size.w, 1),
      h: num(def.size && def.size.h, 1)
    };

    var aero = def.aerodynamics || {};
    this.aerodynamics = {
      dragCoefficient: num(aero.dragCoefficient, 0.5),
      crossSectionArea: num(aero.crossSectionArea, 0.01)  // m^2
    };

    if (def.propulsion) {
      var p = def.propulsion;
      this.propulsion = {
        mode: p.mode === 'buoyancy' ? 'buoyancy' : 'rocket',
        thrust: num(p.thrust, 0),                    // N (peak, or steady)
        burnTime: num(p.burnTime, 0),                // s
        specificImpulse: num(p.specificImpulse, 0),  // s
        propellantMass: num(p.propellantMass, 0),    // kg
        spoolTime: num(p.spoolTime, 0)               // s
      };
    } else {
      this.propulsion = null;
    }

    this.attachNodes = (def.attachNodes || []).map(function (n) {
      return {
        id: n.id,
        dx: num(n.dx, 0),
        dy: num(n.dy, 0),
        type: n.type === NODE.RADIAL ? NODE.RADIAL : NODE.STACK,
        accepts: n.accepts && n.accepts.length ? n.accepts.slice() : ['*']
      };
    });
  }

  /** Does this part produce any propulsive/buoyant force? */
  Part.prototype.isMotor = function () {
    return !!this.propulsion && this.propulsion.thrust > 0;
  };

  /** Wet mass = dry mass + whatever propellant it carries. */
  Part.prototype.wetMass = function () {
    return this.mass + (this.propulsion ? this.propulsion.propellantMass : 0);
  };

  /** A node accepts a part of `category` if its whitelist says so. */
  Part.prototype.nodeAccepts = function (nodeId, category) {
    var node = this.attachNodes.filter(function (n) { return n.id === nodeId; })[0];
    if (!node) return false;
    return node.accepts.indexOf('*') !== -1 || node.accepts.indexOf(category) !== -1;
  };

  // ---------------------------------------------------------------------------

  var CATEGORY_VALUES = ['Structural', 'Propulsion', 'Aerodynamics', 'Payload'];

  function num(v, d) {
    v = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(v) ? v : d;
  }

  // ===========================================================================
  //  THE CATALOG
  //  A flat registry keyed by id. Populated per-era. Task 4 seeds Era 0.
  // ===========================================================================
  var _parts = {};

  var PartsCatalog = {
    CATEGORY: CATEGORY,
    NODE: NODE,
    Part: Part,

    /** Register a raw definition (wrapped in Part). Returns the Part. */
    register: function (def) {
      var part = def instanceof Part ? def : new Part(def);
      if (_parts[part.id]) console.warn('PartsCatalog: overwriting part "' + part.id + '"');
      _parts[part.id] = part;
      return part;
    },

    /** Register many. */
    registerAll: function (defs) {
      return (defs || []).map(this.register, this);
    },

    /** @returns {Part|undefined} */
    get: function (id) { return _parts[id]; },

    /** @returns {Part[]} every registered part */
    all: function () {
      return Object.keys(_parts).map(function (k) { return _parts[k]; });
    },

    /** @returns {Part[]} parts unlocked in a given era tag */
    byEra: function (era) {
      return this.all().filter(function (p) { return p.era === era; });
    },

    /** @returns {Part[]} parts in a category */
    byCategory: function (cat) {
      return this.all().filter(function (p) { return p.category === cat; });
    },

    /** Wipe the registry (tests / hot-reload). */
    _reset: function () { _parts = {}; }
  };

  // ===========================================================================
  //  TASK 4 — Era 0 · Khom Loy (proof of concept)
  //  Three parts that assemble into a working sky lantern under the SAME schema
  //  a Falcon 9 will use. Numbers are deliberately real-ish (a party lantern is
  //  ~30 g of paper+wire and lofts on a few newtons of hot-air buoyancy).
  // ===========================================================================
  PartsCatalog.registerAll([
    {
      id: 'fuel_wax',
      name: 'เชื้อเพลิงขี้ผึ้ง',
      category: CATEGORY.PROPULSION,
      icon: '🔥',
      era: '0-khomloy',
      blurb: 'ก้อนขี้ผึ้งชุบกระดาษ จุดแล้วให้ความร้อน — พยุงตัวโคมขึ้นช้า ๆ',
      mass: 0.010,            // 10 g holder, dry
      cost: 5,
      size: { w: 1, h: 1 },
      aerodynamics: { dragCoefficient: 0.9, crossSectionArea: 0.002 },
      propulsion: {
        mode: 'buoyancy',
        thrust: 3.6,          // N peak hot-air buoyancy once the envelope is hot
        burnTime: 200,        // ~3.5 min of usable flame
        specificImpulse: 0,   // buoyancy: no exhaust
        propellantMass: 0.012,// 12 g of wax burns off
        spoolTime: 20         // seconds to heat the air column to full lift
      },
      attachNodes: [
        // the wax cradle hangs UNDER the bamboo hoop, so its live node points up
        { id: 'top', dx: 0.5, dy: 0, type: NODE.STACK, accepts: ['Structural'] }
      ]
    },
    {
      id: 'frame_bamboo',
      name: 'โครงไม้ไผ่',
      category: CATEGORY.STRUCTURAL,
      icon: '🎋',
      era: '0-khomloy',
      blurb: 'วงแหวนไม้ไผ่เหลาบาง เบาแต่ให้รูปทรง — จุดยึดเชื้อเพลิงและเปลือก',
      mass: 0.008,            // 8 g split-bamboo hoop + cross wires
      cost: 8,
      size: { w: 1, h: 1 },
      aerodynamics: { dragCoefficient: 0.6, crossSectionArea: 0.004 },
      attachNodes: [
        { id: 'top', dx: 0.5, dy: 0, type: NODE.STACK, accepts: ['Aerodynamics'] },
        { id: 'bottom', dx: 0.5, dy: 1, type: NODE.STACK, accepts: ['Propulsion'] }
      ]
    },
    {
      id: 'cover_paper',
      name: 'เปลือกกระดาษสา',
      category: CATEGORY.AERODYNAMICS,
      icon: '🏮',
      era: '0-khomloy',
      blurb: 'ซองกระดาษสาบางเบา กักอากาศร้อนไว้ — ยิ่งใหญ่ยิ่งลอย แต่ก็ยิ่งต้านลม',
      mass: 0.006,            // 6 g of sa paper
      cost: 12,
      size: { w: 1, h: 2 },
      aerodynamics: { dragCoefficient: 1.1, crossSectionArea: 0.28 }, // big soft envelope
      attachNodes: [
        { id: 'bottom', dx: 0.5, dy: 2, type: NODE.STACK, accepts: ['Structural'] }
      ]
    }
  ]);

  global.RS = global.RS || {};
  global.RS.PartsCatalog = PartsCatalog;
  global.RS.Part = Part;

})(typeof window !== 'undefined' ? window : this);
