/* =============================================================================
 * FROM FIRE TO ORBIT — Render layer
 * js/render/SoundFX.js  ·  a tiny pooled sound-effect player (Phase 11.5)
 *
 * ZERO physics, ZERO Three.js. Preloads a handful of short clips and plays them
 * back on demand with per-call volume + pitch so repeated launches never sound
 * cloned. Browser autoplay policy needs a user gesture first — we arm on the
 * first pointerdown / keydown.
 *
 *   ignite  — the หมื่อ motor catching + spooling up on the rail
 *   liftoff — the bang fai breaking the rail and tearing into the sky
 *
 * If the Audio API is missing (or a file 404s) every method is a safe no-op.
 * ===========================================================================*/
(function (global) {
  'use strict';

  var RS = global.RS = global.RS || {};
  RS.render = RS.render || {};

  // relative to index.html
  var CLIPS = {
    ignite:  { url: 'assets/audio/bangfai-ignite.mp3',  volume: 0.5,  rate: 1.0 },
    liftoff: { url: 'assets/audio/bangfai-liftoff.mp3', volume: 0.7,  rate: 1.0 }
  };
  var POOL_SIZE = 4;   // simultaneous voices per clip (rapid-fire festival)

  function SoundFX() {
    this.available = (typeof global.Audio === 'function');
    this.enabled = true;
    this.master = 0.9;
    this._pools = {};
    this._armed = false;
    if (!this.available) return;

    var self = this;
    Object.keys(CLIPS).forEach(function (name) {
      var list = [];
      for (var i = 0; i < POOL_SIZE; i++) {
        var a = new global.Audio();
        a.preload = 'auto';
        a.src = CLIPS[name].url;
        a.volume = 0.0001;
        list.push(a);
      }
      self._pools[name] = { list: list, idx: 0 };
    });

    // autoplay unlock — a muted play/pause on the first real gesture
    this._arm = function () {
      if (self._armed || !self.available) return;
      self._armed = true;
      Object.keys(self._pools).forEach(function (name) {
        var a = self._pools[name].list[0];
        try {
          a.volume = 0.0001;
          var p = a.play();
          if (p && p.then) p.then(function () { a.pause(); a.currentTime = 0; }).catch(function () {});
        } catch (e) {}
      });
    };
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
      global.addEventListener(ev, self._arm, { passive: true });
    });
  }

  /**
   * @param {'ignite'|'liftoff'} name
   * @param {{volume?:number, rate?:number, detune?:number}} [opts]
   *        volume/rate override the clip default; detune adds ± jitter to rate
   *        (so consecutive bang fai don't sound identical — realism).
   */
  SoundFX.prototype.play = function (name, opts) {
    if (!this.available || !this.enabled) return null;
    var def = CLIPS[name];
    var pool = this._pools[name];
    if (!def || !pool) return null;
    opts = opts || {};

    var a = pool.list[pool.idx];
    pool.idx = (pool.idx + 1) % pool.list.length;

    var detune = (opts.detune != null) ? opts.detune : 0.04;
    var rate = (opts.rate != null ? opts.rate : def.rate) *
      (1 + (Math.random() * 2 - 1) * detune);
    var vol = (opts.volume != null ? opts.volume : def.volume) * this.master;

    try {
      a.pause();
      a.currentTime = 0;
      a.playbackRate = clamp(rate, 0.5, 2);
      a.volume = clamp(vol, 0, 1);
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
    return a;
  };

  /** Gentle linear fade of a playing voice (returned by play()). */
  SoundFX.prototype.fade = function (audio, toVol, ms) {
    if (!audio) return;
    var from = audio.volume, steps = Math.max(1, Math.round((ms || 600) / 40));
    var i = 0;
    var tick = function () {
      i++;
      audio.volume = clamp(from + (toVol - from) * (i / steps), 0, 1);
      if (i < steps) global.setTimeout(tick, 40);
      else if (toVol <= 0.001) { try { audio.pause(); audio.currentTime = 0; } catch (e) {} }
    };
    global.setTimeout(tick, 40);
  };

  SoundFX.prototype.stopAll = function () {
    if (!this.available) return;
    var pools = this._pools;
    Object.keys(pools).forEach(function (name) {
      pools[name].list.forEach(function (a) {
        try { a.pause(); a.currentTime = 0; } catch (e) {}
      });
    });
  };

  SoundFX.prototype.setEnabled = function (on) {
    this.enabled = !!on;
    if (!on) this.stopAll();
  };

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  RS.render.SoundFX = SoundFX;

})(typeof window !== 'undefined' ? window : this);
