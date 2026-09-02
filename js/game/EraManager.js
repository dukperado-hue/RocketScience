/* =============================================================================
 * FROM FIRE TO ORBIT
 * js/game/EraManager.js
 *
 * Owns which era the player is in and which eras are unlocked. Pure state +
 * localStorage. Depends only on RS.data.eras (content) — no engine, no render.
 * ===========================================================================*/
(function (global) {
  'use strict';

  var KEY = 'fto-progress-eras';

  function load() {
    try { return JSON.parse(global.localStorage.getItem(KEY)) || {}; }
    catch (e) { return {}; }
  }
  function save(state) {
    try { global.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  var EraManager = {
    _state: null,

    init: function () {
      this._state = load();
      var eras = this._eras();
      if (!this._state.unlocked) this._state.unlocked = {};
      // default-unlock eras marked as such
      eras.list.forEach(function (e) {
        if (e.unlock && e.unlock.type === 'default') this._state.unlocked[e.id] = true;
      }, this);
      if (!this._state.current) {
        this._state.current = eras.first() ? eras.first().id : null;
      }
      save(this._state);
      return this;
    },

    _eras: function () {
      return (global.RS && global.RS.data && global.RS.data.eras) || { list: [], first: function () {} };
    },

    all: function () { return this._eras().list; },
    get: function (id) { return this._eras().get(id); },

    current: function () { return this.get(this._state.current); },
    currentId: function () { return this._state.current; },

    setCurrent: function (id) {
      if (this.isUnlocked(id)) { this._state.current = id; save(this._state); return true; }
      return false;
    },

    isUnlocked: function (id) { return !!(this._state.unlocked && this._state.unlocked[id]); },

    unlock: function (id) {
      this._state.unlocked[id] = true;
      save(this._state);
    },

    /**
     * Re-evaluate mission-gated eras. `completedCountByEra` = {eraId: n}.
     * Returns the list of era ids newly unlocked this call.
     */
    refreshUnlocks: function (completedCountByEra) {
      completedCountByEra = completedCountByEra || {};
      var newly = [];
      this.all().forEach(function (e) {
        if (this.isUnlocked(e.id)) return;
        var u = e.unlock || {};
        if (u.type === 'missions' &&
            (completedCountByEra[u.era] || 0) >= (u.count || 1)) {
          this.unlock(e.id);
          newly.push(e.id);
        }
      }, this);
      return newly;
    },

    /** Part instances for the current era, via the catalog. */
    partsForCurrent: function () {
      var era = this.current();
      var cat = global.RS && global.RS.PartsCatalog;
      if (!era || !cat) return [];
      return era.partIds.map(function (pid) { return cat.get(pid); })
        .filter(Boolean);
    },

    reset: function () { this._state = {}; save(this._state); this.init(); }
  };

  global.RS = global.RS || {};
  global.RS.EraManager = EraManager;

})(typeof window !== 'undefined' ? window : this);
