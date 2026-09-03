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
      dryMass: 0, propellantMass: 0, totalMass: 0, cost: 0, guided: false,
      com: { x: 0, y: 0 }, cop: { x: 0, y: 0 },
      totalThrust: 0, totalBuoyancy: 0, motorMode: 'none',
      dragArea: 0, refArea: 0,
      burnTime: 0, structuralLimitPa: Infinity,
      minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity
    };

    var massMomentX = 0, massMomentY = 0;   // Σ m·r  (uses WET mass)
    var dryMomentY = 0;                      // Σ m·y  (DRY mass only — for burnout CoM)
    var areaMomentX = 0, areaMomentY = 0;   // Σ A·r  (aerodynamic reference area)
    var launchAngleDeg = 0;                  // an angled-rail part sets this
    var topGY = Infinity, noseCd = 0;        // the TOPMOST part sets drag character
    var rollInduce = 0, rollFinArea = 0;     // canted fins → gyroscopic spin

    this.instances.forEach(function (inst) {
      var p = inst.part;
      var c = partCenterCell(inst);
      var wet = p.wetMass();

      // the nose (smallest grid-y) dominates the vehicle's drag: attached vs
      // separated flow. A sharp cone vs a blunt whistle is a huge difference.
      if (inst.gy < topGY) { topGY = inst.gy; noseCd = p.aerodynamics.dragCoefficient; }
      if (p.aerodynamics.rollInduce > 0) {
        rollInduce += p.aerodynamics.rollInduce;
        rollFinArea += p.aerodynamics.crossSectionArea;
      }

      s.dryMass += p.mass;
      s.propellantMass += (p.propulsion ? p.propulsion.propellantMass : 0) +
                          (p.propellantMass || 0);   // + tank load for the shared pool
      if (p.propulsion && p.propulsion.guidance) s.guided = true;
      if (p.launchAngleDeg > 0) {
        launchAngleDeg = launchAngleDeg > 0
          ? Math.min(launchAngleDeg, p.launchAngleDeg) : p.launchAngleDeg;
      }
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

    // ---- MOMENT OF INERTIA about the CoM, pitch plane (flight axis) --------
    //  I = Σ mᵢ·(rᵢ² + Lᵢ²/12)   — parallel-axis (mass on a lever from the CoM)
    //  plus each part's own slender-rod self-inertia. This is the number that
    //  proves the Bang Fai tail stick: a light stick way out on a long lever
    //  contributes mᵢ·rᵢ² that dwarfs the compact body — the rocket becomes
    //  sluggish to rotate, so gusts can't flip it. (I ∝ m·L².)
    var I = 0;
    this.instances.forEach(function (inst) {
      var cyM = partCenterCell(inst).y * mpc;
      var rM = cyM - s.comM.y;
      var lenM = inst.part.size.h * mpc;
      I += inst.part.wetMass() * (rM * rM + lenM * lenM / 12);
    });
    s.momentOfInertia = I;                       // kg·m²
    // aft lever arm: CoM → the tail of the stack (m). The pitch-damping arm.
    s.aftArmM = isFinite(s.maxY) ? Math.max(0.2, (s.maxY * mpc) - s.comM.y) : 0.5;
    s.launchAngleDeg = launchAngleDeg;           // 0 = vertical pad, >0 = angled rail

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

    // ---- NOSE-DOMINATED DRAG -------------------------------------------
    //  The topmost part's Cd scales the whole vehicle's effective drag. A blunt
    //  โหวด whistle (Cd 0.55) → ~1.0×; a เพรียวลม nose cone (Cd 0.12) → ~0.5×.
    //  Same motor, roughly double the apogee. (Only meaningful for a real stack.)
    s.noseCd = s.partCount > 1 && isFinite(noseCd) ? noseCd : s.avgCd;
    s.noseDragMult = s.partCount > 1
      ? Math.max(0.42, Math.min(1.5, 0.38 + s.noseCd * 1.15))
      : 1;

    // ---- GYROSCOPIC SPIN (canted fins) --------------------------------
    s.rollInduce = rollInduce;            // 0 = no spin fins
    s.rollFinArea = rollFinArea;          // m² — the fin area doing the deflecting

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

  function motorData(p) {
    return {
      id: p.id, mode: p.propulsion.mode, thrust: p.propulsion.thrust,
      burnTime: p.propulsion.burnTime, spoolTime: p.propulsion.spoolTime,
      taperTime: p.propulsion.taperTime,
      specificImpulse: p.propulsion.specificImpulse,
      propellantMass: p.propulsion.propellantMass, massFlow: p.propulsion.massFlow,
      coolingTime: p.propulsion.coolingTime,
      guidance: !!p.propulsion.guidance
    };
  }

  /**
   * Split the stack into flight stages along the flight axis. Every `decoupler`
   * part is a boundary: it (and everything on its ENGINE side) becomes a lower
   * stage that fires first and is jettisoned when its tanks run dry.
   * @returns {Array<{dryMass,propellantMass,dragArea,refArea,structuralLimitPa,
   *                  cost,motors,partCount}>}  index 0 = bottom = fires first
   */
  Vehicle.prototype.computeStages = function () {
    var mpc = this.metersPerCell;
    var parts = this.instances.map(function (i) {
      return { p: i.part, axis: (i.gy + i.part.size.h / 2) * mpc, dec: i.part.decoupler };
    });
    if (!parts.length) return [];
    // decoupler flight-axis positions, most-aft (largest) first
    var decs = parts.filter(function (w) { return w.dec; })
      .map(function (w) { return w.axis; })
      .sort(function (a, b) { return b - a; });
    var n = decs.length + 1;
    var stages = [];
    for (var s = 0; s < n; s++) {
      stages.push({
        dryMass: 0, propellantMass: 0, dragArea: 0, refArea: 0,
        structuralLimitPa: Infinity, cost: 0, motors: [], partCount: 0
      });
    }
    parts.forEach(function (w) {
      // stage index = # of decouplers AFT of this part (a decoupler counts only
      // OTHER decouplers aft of it, so it rides with the stage it separates).
      var si = 0;
      for (var k = 0; k < decs.length; k++) {
        if (decs[k] > w.axis + (w.dec ? 1e-6 : 0)) si++;
      }
      var st = stages[si], pt = w.p;
      st.dryMass += pt.mass;
      st.propellantMass += (pt.propulsion ? pt.propulsion.propellantMass : 0) +
                           (pt.propellantMass || 0);
      st.dragArea += pt.aerodynamics.dragCoefficient * pt.aerodynamics.crossSectionArea;
      st.refArea += pt.aerodynamics.crossSectionArea;
      st.cost += pt.cost;
      st.partCount++;
      if (pt.structural && isFinite(pt.structural.maxDynamicPressure)) {
        st.structuralLimitPa = Math.min(st.structuralLimitPa, pt.structural.maxDynamicPressure);
      }
      if (pt.propulsion && pt.propulsion.thrust > 0) st.motors.push(motorData(pt));
    });
    return stages;
  };

  /**
   * Flatten to the minimal model PhysicsEngine consumes. `stages` drives the
   * multi-staging loop; the flat fields describe the whole stack (= stage 0).
   */
  Vehicle.prototype.toPhysicsModel = function () {
    var s = this.computeStats();
    var stages = this.computeStages();
    // the nose part's drag character scales every stage's Cd·A too (the
    // multi-stage integrator reads stages[].dragArea, not the flat field)
    var ndm = s.noseDragMult || 1;
    stages.forEach(function (st) { st.dragArea *= ndm; });
    var motors = this.instances
      .filter(function (i) { return i.part.propulsion && i.part.propulsion.thrust > 0; })
      .map(function (i) { return motorData(i.part); });
    return {
      stages: stages,
      staged: stages.length > 1,
      dryMass: s.dryMass,
      propellantMass: s.propellantMass,
      totalMass: s.totalMass,
      // effective drag = Σ Cd·A scaled by the NOSE part's character
      dragArea: s.dragArea * s.noseDragMult,
      dragAreaRaw: s.dragArea,       // Σ Cd·A  (m^2), before the nose factor
      refArea: s.refArea,            // Σ A     (m^2)
      noseCd: s.noseCd,
      noseDragMult: s.noseDragMult,
      // gyroscopic spin — canted fins spin the vehicle up for rigidity
      rollInduce: s.rollInduce,
      rollFinArea: s.rollFinArea,
      // a TRADITIONAL folk-craft Bang Fai (angled rail + blunt whistle nose,
      // no engineered fins/spin) burns through + snaps at apogee and tumbles.
      // Engineer the nose (low Cd) or add canted fins and it holds together.
      apogeeBreakup: s.launchAngleDeg > 0 && s.noseCd >= 0.4 && !(s.rollInduce > 0),
      structuralLimitPa: s.structuralLimitPa,
      motors: motors,
      valid: s.valid,
      stable: s.stable,
      // a guided vehicle flies a pitch program (gravity turn) and will not
      // passively weathercock into a tumble — its control system holds attitude
      gravityTurn: !!s.guided,
      // dynamic aero-stability inputs (flight axis, metres; +y = aft)
      rocketDominant: s.totalThrust > s.totalBuoyancy && s.totalThrust > 0,
      buoyancyDominant: s.totalBuoyancy > s.totalThrust && s.totalBuoyancy > 0,
      comWetAxisM: s.comWetAxisM,
      comDryAxisM: s.comDryAxisM,
      copAxisM: s.copAxisM,
      // rotational-stability inputs — a long tail stick makes I huge (I ∝ mL²)
      momentOfInertia: s.momentOfInertia,
      aftArmM: s.aftArmM,
      // an angled traditional-rocket launch rail (deg from horizontal); 0 = vertical
      launchAngleDeg: s.launchAngleDeg,
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
