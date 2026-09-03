/* =============================================================================
 * FROM FIRE TO ORBIT
 * js/game/MissionEngine.js
 *
 * Scores a finished flight + the built vehicle against a mission's objectives
 * and constraints, and tracks which missions are complete. Depends on
 * RS.data.missions (content) and consumes the Physics contract — never touches
 * render or Three.js.
 * ===========================================================================*/
(function (global) {
  'use strict';

  var KEY = 'fto-progress-missions';

  function load() {
    try { return JSON.parse(global.localStorage.getItem(KEY)) || {}; }
    catch (e) { return {}; }
  }
  function save(s) {
    try { global.localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  }

  function fmtM(m) {
    m = m || 0;
    return m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';
  }
  function fmtKg(kg) {
    kg = kg || 0;
    return kg < 1 ? Math.round(kg * 1000) + ' g' : kg.toFixed(2) + ' kg';
  }
  function partName(pid) {
    var cat = global.RS && global.RS.PartsCatalog;
    var p = cat && cat.get(pid);
    return (p && p.name) || pid;
  }

  /** who briefs a mission — label + avatar glyph + accent */
  var NPCS = {
    kapi:   { name: 'น้องกะปิ',  glyph: '🦫', accent: '#7fc27e', role: 'ผู้ช่วยวิศวกร' },
    pchang: { name: 'พี่ช่าง',   glyph: '🦆', accent: '#5bd6ff', role: 'หัวหน้าช่าง' },
    narr:   { name: 'ศูนย์ควบคุม', glyph: '🛰️', accent: '#9db4d8', role: '' }
  };

  var MissionEngine = {
    _state: null,

    init: function () { this._state = load(); if (!this._state.done) this._state.done = {}; return this; },

    _missions: function () {
      return (global.RS && global.RS.data && global.RS.data.missions) ||
        { list: [], get: function () {}, forEra: function () { return []; } };
    },

    get: function (id) { return this._missions().get(id); },
    forEra: function (eraId) { return this._missions().forEra(eraId); },
    isDone: function (id) { return !!(this._state.done && this._state.done[id]); },
    npc: function (key) { return NPCS[key] || NPCS.narr; },

    /** First not-yet-passed mission in an era (falls back to its first). */
    firstUnfinished: function (eraId) {
      var list = this.forEra(eraId);
      for (var i = 0; i < list.length; i++) {
        if (!this.isDone(list[i].id)) return list[i];
      }
      return list[0] || null;
    },

    /**
     * @param {Object} mission   from RS.data.missions
     * @param {Object} sim        SimulationResult
     * @param {Object} vehicle    RS.Vehicle (for cost / mass / required-parts)
     * @returns {{
     *   mission:Object, passed:boolean, score:number,
     *   objectives:{label:string,met:boolean,actual:string}[],
     *   constraints:{label:string,met:boolean,actual:string}[],
     *   failReasons:string[]
     * }}
     */
    evaluate: function (mission, sim, vehicle) {
      var res = { mission: mission || null, passed: false, score: 0,
        objectives: [], constraints: [], failReasons: [] };
      if (!mission || !sim) return res;

      var sum = sim.summary || {};
      var events = sim.events || [];
      var has = function (t) { return events.some(function (e) { return e.type === t; }); };

      var stats = (vehicle && vehicle.computeStats) ? vehicle.computeStats() : (vehicle || {});
      var partIds = (vehicle && vehicle.instances)
        ? vehicle.instances.map(function (i) { return i.part.id; }) : [];

      // ---- objectives ------------------------------------------------
      var o = mission.objectives || {};

      if (o.targetAltitude != null) {
        var hi = sum.apogee || 0;
        var metAlt = hi >= o.targetAltitude;
        res.objectives.push({ label: 'ขึ้นสูงเกิน ' + o.targetAltitude + ' ม.',
          met: metAlt, actual: fmtM(hi) });
        if (!metAlt) res.failReasons.push('ขึ้นได้แค่ ' + fmtM(hi) +
          ' — ต้องการ ' + o.targetAltitude + ' ม.');
      }

      if (o.maxVelocityMin != null) {
        var mv = sum.maxVelocity || 0;
        var metMv = mv >= o.maxVelocityMin;
        res.objectives.push({ label: 'ความเร็วสูงสุด ≥ ' + o.maxVelocityMin + ' m/s',
          met: metMv, actual: mv.toFixed(0) + ' m/s' });
        if (!metMv) res.failReasons.push('ความเร็วสูงสุดแค่ ' + mv.toFixed(0) +
          ' m/s — ต้องการ ' + o.maxVelocityMin);
      }

      if (o.orbitPeriapsisMin != null) {
        var orb = sum.orbit || {};
        var peri = orb.achieved ? orb.periapsis : -Infinity;
        var metOrb = !!orb.achieved && peri >= o.orbitPeriapsisMin;
        res.objectives.push({
          label: 'เข้าวงโคจร · periapsis ≥ ' + Math.round(o.orbitPeriapsisMin / 1000) + ' กม.',
          met: metOrb,
          actual: orb.achieved
            ? ('วงโคจร ' + fmtM(orb.periapsis) + ' × ' + fmtM(orb.apoapsis))
            : 'ยังไม่เข้าวงโคจร'
        });
        if (!metOrb) res.failReasons.push(orb.achieved
          ? ('วงโคจรต่ำไป (periapsis ' + fmtM(peri) + ') — เร่งความเร็วแนวราบให้มากขึ้น')
          : 'ยังไม่เข้าวงโคจร — Δv ไม่พอ หรือเลี้ยวโค้งไม่ทัน');
      }

      if (o.downrangeMin != null) {
        var dr = Math.abs(sum.impactX || 0);
        var metDr = dr >= o.downrangeMin;
        res.objectives.push({ label: 'ตกไกลจากฐาน ≥ ' + o.downrangeMin + ' ม.',
          met: metDr, actual: fmtM(dr) });
        if (!metDr) res.failReasons.push('ตกห่างจากฐานแค่ ' + fmtM(dr) +
          ' — ต้องบินแนวราบให้เกิน ' + fmtM(o.downrangeMin) + ' (ใช้ Gravity Turn)');
      }

      if (o.flightTimeMin != null) {
        var ft = sum.flightTime || 0;
        var metFt = ft >= o.flightTimeMin;
        res.objectives.push({ label: 'ลอยอยู่บนฟ้า ≥ ' + o.flightTimeMin + ' วิ',
          met: metFt, actual: ft.toFixed(0) + ' วิ' });
        if (!metFt) res.failReasons.push('ลอยอยู่แค่ ' + ft.toFixed(0) +
          ' วิ — ต้องการ ' + o.flightTimeMin + ' วิ');
      }

      if (o.surviveFlight) {
        var lost = has('LOSS_OF_CONTROL');
        var flew = !!sum.liftedOff && !!sim.ok;
        var structFail = (sim.diagnostics || []).some(function (d) {
          return d.id === 'structure' && d.status === 'FAIL';
        });
        var survived = flew && !lost && !structFail;
        res.objectives.push({ label: 'บินได้โดยไม่เสียการควบคุม', met: survived,
          actual: lost ? 'เสียการควบคุม' : structFail ? 'โครงสร้างพัง'
            : flew ? 'ควบคุมได้ตลอด' : 'ไม่ขึ้นจากพื้น' });
        if (lost) res.failReasons.push('จรวดเสียการควบคุม (ตีลังกากลางอากาศ)');
        else if (structFail) res.failReasons.push('โครงสร้างพังจากแรงดันอากาศ (Max-Q)');
        else if (!flew) res.failReasons.push('ยานไม่ขึ้นจากพื้น');
      }

      // ---- constraints ---------------------------------------------
      var c = mission.constraints || {};

      if (c.maxCost != null) {
        var cost = stats.cost || 0;
        var metCost = cost <= c.maxCost;
        res.constraints.push({ label: 'งบไม่เกิน ' + c.maxCost + ' ฿',
          met: metCost, actual: cost + ' ฿' });
        if (!metCost) res.failReasons.push('เกินงบ ' + (cost - c.maxCost) + ' ฿');
      }

      if (c.maxMass != null) {
        var m = stats.totalMass || 0;
        var metMass = m <= c.maxMass + 1e-9;
        res.constraints.push({ label: 'มวลไม่เกิน ' + fmtKg(c.maxMass),
          met: metMass, actual: fmtKg(m) });
        if (!metMass) res.failReasons.push('ยานหนักเกินมา ' + fmtKg(m - c.maxMass));
      }

      if (c.requiredParts && c.requiredParts.length) {
        c.requiredParts.forEach(function (pid) {
          var got = partIds.indexOf(pid) !== -1;
          var nm = partName(pid);
          res.constraints.push({ label: 'ใช้ “' + nm + '”', met: got,
            actual: got ? '✓ มี' : 'ยังไม่มี' });
          if (!got) res.failReasons.push('ต้องใช้ชิ้นส่วน “' + nm + '”');
        });
      }

      if (c.safeZoneRadius != null) {
        var far = (sum.maxDrift != null) ? sum.maxDrift : Math.abs(sum.impactX || 0);
        var within = far <= c.safeZoneRadius;
        res.constraints.push({
          label: 'อยู่ในเขต NOTAM (รัศมี ' + c.safeZoneRadius + ' ม.)',
          met: within, actual: 'ลอยไปไกลสุด ' + Math.round(far) + ' ม.'
        });
        if (!within) res.failReasons.push('LEGAL VIOLATION — ยานลอยหลุดเขตห้ามบิน (' +
          Math.round(far) + ' ม. > ' + c.safeZoneRadius + ' ม.)');
      }

      var allObj = res.objectives.every(function (r) { return r.met; });
      var allCon = res.constraints.every(function (r) { return r.met; });
      res.passed = !!sim.ok && allObj && allCon;
      res.score = res.passed ? ((mission.reward && mission.reward.score) || 0) : 0;
      return res;
    },

    /** Record a completion (call only when evaluate().passed). */
    markComplete: function (missionId) {
      this._state.done[missionId] = true;
      save(this._state);
    },

    /** {eraId: completedCount} — feeds EraManager.refreshUnlocks(). */
    completedCountByEra: function () {
      var out = {};
      var all = this._missions().list;
      var done = this._state.done || {};
      all.forEach(function (m) {
        if (done[m.id]) out[m.era] = (out[m.era] || 0) + 1;
      });
      return out;
    },

    reset: function () { this._state = { done: {} }; save(this._state); }
  };

  global.RS = global.RS || {};
  global.RS.MissionEngine = MissionEngine;

})(typeof window !== 'undefined' ? window : this);
