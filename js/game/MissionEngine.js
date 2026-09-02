/* =============================================================================
 * FROM FIRE TO ORBIT
 * js/game/MissionEngine.js
 *
 * Scores a SimulationResult against a mission's objectives and tracks which
 * missions are complete. Depends on RS.data.missions (content) and consumes the
 * Physics contract — never touches render or Three.js.
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

  var RANK = { OK: 0, WARN: 1, FAIL: 2 };

  /** Evaluate ONE objective against a SimulationResult. */
  function checkObjective(obj, sim) {
    var sum = sim.summary || {};
    var events = sim.events || [];
    var diags = sim.diagnostics || [];
    var impact = events.filter(function (e) { return e.type === 'IMPACT'; })[0];

    switch (obj.type) {
      case 'apogeeMin':
        return { met: sum.apogee >= obj.value, actual: fmtM(sum.apogee) };
      case 'apogeeMax':
        return { met: sum.apogee <= obj.value, actual: fmtM(sum.apogee) };
      case 'flightTimeMin':
        return { met: sum.flightTime >= obj.value, actual: (sum.flightTime || 0).toFixed(0) + ' s' };
      case 'maxVelocityMax':
        return { met: (sum.maxVelocity || 0) <= obj.value, actual: (sum.maxVelocity || 0).toFixed(1) + ' m/s' };
      case 'softLanding':
        return impact
          ? { met: Math.abs(impact.velocity) <= obj.value, actual: Math.abs(impact.velocity).toFixed(1) + ' m/s' }
          : { met: false, actual: 'ยังไม่แตะพื้น' };
      case 'diagnosticsClear': {
        var worstAllowed = RANK[obj.value] != null ? RANK[obj.value] : RANK.WARN;
        var worst = diags_worst(diags);
        return { met: worst <= worstAllowed, actual: rankName(worst) };
      }
      default:
        return { met: false, actual: 'ไม่รู้จักเงื่อนไข "' + obj.type + '"' };
    }
  }

  function diags_worst(diags) {
    return diags.reduce(function (w, d) { return Math.max(w, RANK[d.status] || 0); }, 0);
  }
  function rankName(r) { return r === 2 ? 'FAIL' : r === 1 ? 'WARN' : 'OK'; }
  function fmtM(m) {
    m = m || 0;
    return m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';
  }

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

    /**
     * @param {Object} mission  from RS.data.missions
     * @param {Object} sim       SimulationResult
     * @returns {{passed:boolean, results:{label:string,met:boolean,actual:string}[], score:number}}
     */
    evaluate: function (mission, sim) {
      if (!mission || !sim) return { passed: false, results: [], score: 0 };
      var results = (mission.objectives || []).map(function (obj) {
        var r = checkObjective(obj, sim);
        return { label: obj.label, met: !!r.met, actual: r.actual };
      });
      var passed = sim.ok && results.every(function (r) { return r.met; });
      var score = passed ? ((mission.reward && mission.reward.score) || 0) : 0;
      return { passed: passed, results: results, score: score };
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
