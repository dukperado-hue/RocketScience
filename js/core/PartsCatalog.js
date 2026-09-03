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
   *                                                    (self-contained motors: bang fai, firework)
   * @param {number} [def.propulsion.massFlow]         - kg/s draw from the SHARED propellant pool
   *                                                    (liquid engines fed by separate v2_tank parts).
   *                                                    When set, mdot = massFlow and burnTime is just
   *                                                    a ceiling — real cutoff is pool depletion.
   * @param {number} [def.propulsion.spoolTime]       - s to ramp from 0 to full output
   * @param {boolean} [def.propulsion.guidance]       - true = the vehicle is actively guided; it
   *                                                    follows a pitch program (gravity turn) and
   *                                                    does NOT passively weathercock into a tumble
   * @param {'rocket'|'buoyancy'} [def.propulsion.mode] - default "rocket"
   * @param {number} [def.propellantMass]  - kg of propellant this part CARRIES for the shared pool
   *                                         (a tank). Adds to wet mass + the burn budget; no thrust.
   * @param {string} [def.meshUrl]         - optional .glb/.gltf model; procedural primitive if absent
   * @param {number} [def.meshScale]       - uniform scale applied to the loaded model (default 1)
   * @param {boolean} [def.decoupler]      - true = a staging separation ring. Everything on the
   *                                         engine side of it becomes a lower stage that fires
   *                                         first and is jettisoned when its tanks run dry.
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

    this.mass = num(def.mass, 0);              // kg, dry structure
    this.propellantMass = num(def.propellantMass, 0);  // kg, tank load for the shared pool
    this.cost = num(def.cost, 0);          // Baht
    this.meshUrl = def.meshUrl || null;    // optional .glb model
    this.meshScale = num(def.meshScale, 1);
    this.decoupler = !!def.decoupler;      // staging separation ring
    // a traditional Bang Fai is fired off an ANGLED scaffold, not a vertical
    // pad. A part (the tail stick) can declare the rail angle; 0 = vertical.
    this.launchAngleDeg = num(def.launchAngleDeg, 0);
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
        burnTime: num(p.burnTime, 0),                // s (ceiling when massFlow is set)
        specificImpulse: num(p.specificImpulse, 0),  // s
        propellantMass: num(p.propellantMass, 0),    // kg (self-contained motor)
        massFlow: num(p.massFlow, 0),                // kg/s draw from the shared pool
        spoolTime: num(p.spoolTime, 0),              // s
        taperTime: num(p.taperTime, 0),              // s — a regressive solid grain tails
                                                     //     thrust linearly to 0 over the LAST
                                                     //     taperTime seconds of the burn
        coolingTime: num(p.coolingTime, 0),          // s — buoyancy heat-loss 1/e time after burnout
        guidance: !!p.guidance                       // actively guided (pitch program, no tumble)
      };
    } else {
      this.propulsion = null;
    }

    // Structural envelope — the dynamic pressure (Pa) this part can take before
    // it tears / buckles. Diagnostics compares Σ-min against the flight's MaxQ.
    this.structural = {
      maxDynamicPressure: num(def.structural && def.structural.maxDynamicPressure, Infinity)
    };

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

  /** Wet mass = dry mass + self-contained motor grain + tank load. */
  Part.prototype.wetMass = function () {
    return this.mass + this.propellantMass +
      (this.propulsion ? this.propulsion.propellantMass : 0);
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
  //  A flat registry keyed by id. Part DEFINITIONS live in js/data/parts.js and
  //  register themselves at load time — this module owns only the schema + store.
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

  global.RS = global.RS || {};
  global.RS.PartsCatalog = PartsCatalog;
  global.RS.Part = Part;

})(typeof window !== 'undefined' ? window : this);
