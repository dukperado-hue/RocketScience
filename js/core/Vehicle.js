/* =============================================================================
 * FROM FIRE TO ORBIT — Unified Architecture
 * js/core/Vehicle.js
 *
 * The Assembly Engine. A Vehicle is an ordered set of placed Part instances
 * plus the graph of node-to-node connections between them. It knows nothing
 * about lanterns vs rockets — it just sums the schema.
 *
 * Grid model: integer cell coordinates, +x right, +y DOWN (screen space).
 * The first part placed is the ROOT; its bottom sits on the pad.
 * METERS_PER_CELL maps the blueprint grid to physical space for CoM / CoP.
 * ===========================================================================*/
(function (global) {
  'use strict';

  var METERS_PER_CELL = 0.5;   // one blueprint cell = 0.5 m
  var G0 = 9.80665;            // m/s^2, used only for weight-based readouts

  var _nextIid = 1;

  /**
   * @param {Object} [opts]
   * @param {number} [opts.metersPerCell]
   */
  function Vehicle(opts) {
    opts = opts || {};
    this.metersPerCell = opts.metersPerCell || METERS_PER_CELL;
    /** @type {PlacedPart[]} */
    this.instances = [];
    this.rootIid = null;
    this._statsDirty = true;
    this._stats = null;
  }

  /**
   * @typedef {Object} PlacedPart
   * @property {number} iid           - instance id (unique in this vehicle)
   * @property {import('./PartsCatalog').Part} part
   * @property {number} gx            - grid x of the part origin (cells)
   * @property {number} gy            - grid y of the part origin (cells)
   * @property {Link[]} links
   */
  /**
   * @typedef {Object} Link
   * @property {string} node   - this instance's node id
   * @property {number} toIid  - other instance
   * @property {string} toNode - other instance's node id
   */

  // ---------------------------------------------------------------------------
  //  Mutation
  // ---------------------------------------------------------------------------

  /**
   * Place a part. No snapping logic here — Blueprint2D resolves the grid cell
   * and the link set, then calls this with the final placement.
   * @param {import('./PartsCatalog').Part} part
   * @param {number} gx
   * @param {number} gy
   * @param {Link[]} [links]
   * @returns {PlacedPart}
   */
  Vehicle.prototype.addInstance = function (part, gx, gy, links) {
    var inst = {
      iid: _nextIid++,
      part: part,
      gx: Math.round(gx),
      gy: Math.round(gy),
      links: (links || []).slice()
    };
    this.instances.push(inst);
    if (this.rootIid == null) this.rootIid = inst.iid;

    // mirror the link on the far side so the graph is undirected
    inst.links.forEach(function (lk) {
      var other = this.byIid(lk.toIid);
      if (other && !other.links.some(function (o) {
        return o.toIid === inst.iid && o.node === lk.toNode;
      })) {
        other.links.push({ node: lk.toNode, toIid: inst.iid, toNode: lk.node });
      }
    }, this);

    this._statsDirty = true;
    return inst;
  };

  /** Remove an instance and every link that referenced it. */
  Vehicle.prototype.removeInstance = function (iid) {
    this.instances = this.instances.filter(function (i) { return i.iid !== iid; });
    this.instances.forEach(function (i) {
      i.links = i.links.filter(function (lk) { return lk.toIid !== iid; });
    });
    if (this.rootIid === iid) {
      this.rootIid = this.instances.length ? this.instances[0].iid : null;
    }
    this._statsDirty = true;
  };

  Vehicle.prototype.clear = function () {
    this.instances = [];
    this.rootIid = null;
    this._statsDirty = true;
  };

  Vehicle.prototype.byIid = function (iid) {
    return this.instances.filter(function (i) { return i.iid === iid; })[0] || null;
  };

  // ---------------------------------------------------------------------------
  //  Queries used by the builder
  // ---------------------------------------------------------------------------

  /** Is a grid cell occupied by any part's footprint? */
  Vehicle.prototype.cellOccupied = function (cx, cy, ignoreIid) {
    return this.instances.some(function (i) {
      if (i.iid === ignoreIid) return false;
      return cx >= i.gx && cx < i.gx + i.part.size.w &&
             cy >= i.gy && cy < i.gy + i.part.size.h;
    });
  };

  /**
   * World-space (cell) positions of every OPEN attach node across the vehicle.
   * Blueprint2D uses this to find snap targets for a dragged part.
   * @returns {{iid:number, nodeId:string, type:string, accepts:string[], x:number, y:number}[]}
   */
  Vehicle.prototype.openNodes = function () {
    var out = [];
    this.instances.forEach(function (inst) {
      inst.part.attachNodes.forEach(function (node) {
        var used = inst.links.some(function (lk) { return lk.node === node.id; });
        if (used) return;
        out.push({
          iid: inst.iid,
          nodeId: node.id,
          type: node.type,
          accepts: node.accepts,
          x: inst.gx + node.dx,
          y: inst.gy + node.dy
        });
      });
    });
    return out;
  };

  /** Is every instance reachable from the root through links? */
  Vehicle.prototype.isConnected = function () {
    if (!this.instances.length) return false;
    var seen = {};
    var stack = [this.rootIid];
    while (stack.length) {
      var iid = stack.pop();
      if (seen[iid]) continue;
      seen[iid] = true;
      var inst = this.byIid(iid);
      if (!inst) continue;
      inst.links.forEach(function (lk) {
        if (!seen[lk.toIid]) stack.push(lk.toIid);
      });
    }
    return this.instances.every(function (i) { return seen[i.iid]; });
  };

  // ---------------------------------------------------------------------------
  //  Aggregate physics properties  (Task 2 core deliverable)
  // ---------------------------------------------------------------------------

  /** Local centre of a placed part, in cell coordinates. */
  function partCenterCell(inst) {
    return {
      x: inst.gx + inst.part.size.w / 2,
      y: inst.gy + inst.part.size.h / 2
    };
  }

  /**
   * Compute (and cache) every aggregate the rest of the engine needs.
   *
   * @returns {{
   *   partCount:number, valid:boolean, connected:boolean,
   *   dryMass:number, propellantMass:number, totalMass:number, cost:number,
   *   com:{x:number,y:number}, cop:{x:number,y:number},
   *   comM:{x:number,y:number}, copM:{x:number,y:number},
   *   totalThrust:number, totalBuoyancy:number, motorMode:string,
   *   dragArea:number, refArea:number, avgCd:number, structuralLimitPa:number,
   *   burnTime:number, length:{w:number,h:number},
   *   stabilityMarginM:number, stable:boolean, weightN:number, twr:number
   * }}
   */
  Vehicle.prototype.computeStats = function () {
    if (!this._statsDirty && this._stats) return this._stats;

    var mpc = this.metersPerCell;
    var s = {
      partCount: this.instances.length,
      connected: this.isConnected(),
      dryMass: 0, propellantMass: 0, totalMass: 0, cost: 0,
      com: { x: 0, y: 0 }, cop: { x: 0, y: 0 },
      totalThrust: 0, totalBuoyancy: 0, motorMode: 'none',
      dragArea: 0, refArea: 0,
      burnTime: 0, structuralLimitPa: Infinity,
      minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity
    };

    var massMomentX = 0, massMomentY = 0;   // Σ m·r  (uses WET mass)
    var dryMomentY = 0;                      // Σ m·y  (DRY mass only — for burnout CoM)
    var areaMomentX = 0, areaMomentY = 0;   // Σ A·r  (aerodynamic reference area)

    this.instances.forEach(function (inst) {
      var p = inst.part;
      var c = partCenterCell(inst);
      var wet = p.wetMass();

      s.dryMass += p.mass;
      s.propellantMass += p.propulsion ? p.propulsion.propellantMass : 0;
      s.cost += p.cost;

      massMomentX += wet * c.x;
      massMomentY += wet * c.y;
      dryMomentY += p.mass * c.y;

      var A = p.aerodynamics.crossSectionArea;
      s.dragArea += p.aerodynamics.dragCoefficient * A;
      s.refArea += A;
      areaMomentX += A * c.x;
      areaMomentY += A * c.y;

      if (p.propulsion && p.propulsion.thrust > 0) {
        if (p.propulsion.mode === 'buoyancy') {
          s.totalBuoyancy += p.propulsion.thrust;
          s.motorMode = s.motorMode === 'rocket' ? 'mixed' : 'buoyancy';
        } else {
          s.totalThrust += p.propulsion.thrust;
          s.motorMode = s.motorMode === 'buoyancy' ? 'mixed' : 'rocket';
        }
        s.burnTime = Math.max(s.burnTime, p.propulsion.burnTime);
      }

      if (p.structural && isFinite(p.structural.maxDynamicPressure)) {
        s.structuralLimitPa = Math.min(s.structuralLimitPa, p.structural.maxDynamicPressure);
      }

      s.minX = Math.min(s.minX, inst.gx);
      s.minY = Math.min(s.minY, inst.gy);
      s.maxX = Math.max(s.maxX, inst.gx + p.size.w);
      s.maxY = Math.max(s.maxY, inst.gy + p.size.h);
    });

    s.totalMass = s.dryMass + s.propellantMass;

    if (s.totalMass > 0) {
      s.com.x = massMomentX / s.totalMass;
      s.com.y = massMomentY / s.totalMass;
    }
    if (s.refArea > 0) {
      s.cop.x = areaMomentX / s.refArea;
      s.cop.y = areaMomentY / s.refArea;
    }

    // metre-space copies (origin = vehicle bounding-box top-left)
    s.comM = { x: s.com.x * mpc, y: s.com.y * mpc };
    s.copM = { x: s.cop.x * mpc, y: s.cop.y * mpc };

    // flight-axis (grid +y = aft) scalars for the dynamic-stability check.
    // As propellant burns, the true CoM slides from comWet toward comDry; a
    // bottom-heavy solid motor means that slide is FORWARD (toward the nose),
    // which is exactly what erodes the fin margin mid-boost.
    s.comWetAxisM = s.com.y * mpc;
    s.comDryAxisM = (s.dryMass > 0 ? dryMomentY / s.dryMass : s.com.y) * mpc;
    s.copAxisM = s.refArea > 0 ? s.cop.y * mpc : NaN;
    s.length = {
      w: isFinite(s.maxX - s.minX) ? (s.maxX - s.minX) * mpc : 0,
      h: isFinite(s.maxY - s.minY) ? (s.maxY - s.minY) * mpc : 0
    };
    s.avgCd = s.refArea > 0 ? s.dragArea / s.refArea : 0;

    // Static stability along the flight axis (vertical, +y = down).
    //  · rocket/ballistic: stable when CoP sits BEHIND the CoM, i.e. below it
    //    (larger y) so airflow restores the nose. margin = cop.y − com.y.
    //  · buoyancy (lantern): it hangs like a pendulum — stable when the CoM
    //    sits BELOW the centre of lift, i.e. com.y − cop.y.
    var buoyDominant = s.totalBuoyancy > s.totalThrust;
    s.stabilityMarginM = (buoyDominant ? (s.com.y - s.cop.y) : (s.cop.y - s.com.y)) * mpc;
    s.stable = s.partCount > 1 ? s.stabilityMarginM > 0.01 : true;

    s.weightN = s.totalMass * G0;
    var lift = Math.max(s.totalThrust, s.totalBuoyancy);
    s.twr = s.weightN > 0 ? lift / s.weightN : 0;

    // "valid" == something the physics loop can actually fly
    s.valid = s.partCount > 0 && s.connected &&
              (s.totalThrust > 0 || s.totalBuoyancy > 0) &&
              s.totalMass > 0;

    delete s.minX; delete s.minY; delete s.maxX; delete s.maxY;

    this._stats = s;
    this._statsDirty = false;
    return s;
  };

  /** Force a recompute on next read (Blueprint2D calls after any edit). */
  Vehicle.prototype.markDirty = function () { this._statsDirty = true; };

  // ---------------------------------------------------------------------------
  //  Hand-off to the physics engine (pure data, no Vehicle methods)
  // ---------------------------------------------------------------------------

  /**
   * Flatten to the minimal model PhysicsEngine consumes. Motors are kept
   * individually so the loop can stage / stagger burns later.
   */
  Vehicle.prototype.toPhysicsModel = function () {
    var s = this.computeStats();
    var motors = this.instances
      .filter(function (i) { return i.part.propulsion && i.part.propulsion.thrust > 0; })
      .map(function (i) {
        var p = i.part.propulsion;
        return {
          id: i.part.id,
          mode: p.mode,
          thrust: p.thrust,
          burnTime: p.burnTime,
          spoolTime: p.spoolTime,
          specificImpulse: p.specificImpulse,
          propellantMass: p.propellantMass
        };
      });
    return {
      dryMass: s.dryMass,
      propellantMass: s.propellantMass,
      totalMass: s.totalMass,
      dragArea: s.dragArea,          // Σ Cd·A  (m^2)
      refArea: s.refArea,            // Σ A     (m^2)
      structuralLimitPa: s.structuralLimitPa,
      motors: motors,
      valid: s.valid,
      stable: s.stable,
      // dynamic aero-stability inputs (flight axis, metres; +y = aft)
      rocketDominant: s.totalThrust > s.totalBuoyancy && s.totalThrust > 0,
      buoyancyDominant: s.totalBuoyancy > s.totalThrust && s.totalBuoyancy > 0,
      comWetAxisM: s.comWetAxisM,
      comDryAxisM: s.comDryAxisM,
      copAxisM: s.copAxisM,
      // full stats snapshot so Diagnostics needs only the model, never the graph
      stats: s
    };
  };

  // ---------------------------------------------------------------------------

  Vehicle.METERS_PER_CELL = METERS_PER_CELL;
  Vehicle.G0 = G0;

  global.RS = global.RS || {};
  global.RS.Vehicle = Vehicle;

})(typeof window !== 'undefined' ? window : this);
