/* =============================================================================
 * FROM FIRE TO ORBIT — Render layer
 * js/render/FlightScene2D.js  ·  the 2D side-scroll flight replay (Reboot Phase 23)
 *
 * A Spaceflight-Simulator-style 2D cinematic replay. Pure <canvas> 2D — NO
 * Three.js, NO WebGL, NO physics. It only plays back the pre-computed
 * SimulationResult.trajectory (same locked contract the 3D FlightScreen uses):
 *
 *   trajectory[i] = { time, altitude, drift(=position.x), velocity, vx, speed,
 *                     acceleration, mass, orientation:{pitch,yaw,roll},
 *                     thrust, buoyancy, q, propRemaining, tumbling, padLocked }
 *
 * Art (hand-drawn storybook, generated via Gemini + chroma-key die-cut):
 *   assets/images/scenes/era0_parallax/L1_sky … L6_space   (parallax bands)
 *   assets/images/fx/fx_flame_sheet | fx_smoke_sheet | fx_burst_sheet  (1×N sprite sheets)
 *   assets/images/props/prop_bangfai_rail.png                (world-locked pad prop)
 *
 * The rocket itself is drawn as a 2D vector stack straight from vehicle.instances
 * (part.size in cells · METERS_PER_CELL) so it always matches what was built.
 *
 * RS.render.FlightScene2D — open(simResult, vehicle, mission, opts) / close().
 * Degrades to a safe no-op only if the <canvas> 2D context is unavailable.
 * ===========================================================================*/
(function (global) {
  'use strict';

  var RS = global.RS = global.RS || {};
  RS.render = RS.render || {};

  var $ = function (id) { return document.getElementById(id); };
  var MPC = (RS.Vehicle && RS.Vehicle.METERS_PER_CELL) || 0.5;
  var TAU = Math.PI * 2;

  var CAT_FILL = {
    Structural: '#c79a6a', Propulsion: '#e0765a',
    Aerodynamics: '#63b6e0', Payload: '#7fc27e'
  };
  var CAT_INK = {
    Structural: '#6b4c2c', Propulsion: '#7a2f1c',
    Aerodynamics: '#255a78', Payload: '#356b3a'
  };

  var LABEL_TH = {
    IGNITION: 'จุดไฟ', LIFTOFF: 'ทะยานพ้นพื้น', PITCH_OVER: 'เลี้ยวโค้ง',
    SEPARATE_STAGE: 'สลัดท่อน', MECO: 'ดับเครื่องยนต์', MAX_Q: 'แรงดันอากาศสูงสุด',
    APOGEE: 'จุดสูงสุด', APOGEE_BREAKUP: 'แตกที่จุดสูงสุด', BURNOUT: 'เชื้อเพลิงหมด',
    BURST: 'ลูกพลุแตก!', DUD: 'ลูกพลุด้าน', COLLISION: 'ชนโคมลอย!',
    ORBIT: 'เข้าวงโคจร!', LOSS_OF_CONTROL: 'เสียการควบคุม', MIDAIR_BURN: 'โคมไฟไหม้กลางอากาศ',
    IMPACT: 'แตะพื้น'
  };
  var EVENT_COLOR = {
    IGNITION: '#e9f1ff', LIFTOFF: '#5fe0a8', PITCH_OVER: '#b98cff', MAX_Q: '#5bd6ff',
    SEPARATE_STAGE: '#ffd24a', MECO: '#ff9a5a', BURST: '#ffd24a', DUD: '#8891a5',
    COLLISION: '#ff3b3b', ORBIT: '#5fe0a8', BURNOUT: '#ffb63a', APOGEE: '#ffce40',
    APOGEE_BREAKUP: '#ff8a3a', LOSS_OF_CONTROL: '#ff3b3b', MIDAIR_BURN: '#ff7420',
    IMPACT: '#ff6a5a'
  };
  var PHASE_TH = {
    prelaunch: 'ก่อนปล่อย', ascent: 'ทะยานขึ้น', coast: 'ไต่ลอย',
    descent: 'ร่วงลง', space: 'พ้นชั้นบรรยากาศ', done: 'จบการบิน'
  };

  var IMG = {};
  var IMG_LOADED = false;
  function loadImages() {
    if (IMG_LOADED) return;
    IMG_LOADED = true;
    var base = 'assets/images/';
    var files = {
      sky:   'scenes/era0_parallax/L1_sky.jpg',
      hills: 'scenes/era0_parallax/L2_hills.png',
      town:  'scenes/era0_parallax/L3_village.png',
      fore:  'scenes/era0_parallax/L4_foreground.png',
      high:  'scenes/era0_parallax/L5_highsky.jpg',
      space: 'scenes/era0_parallax/L6_space.jpg',
      flame: 'fx/fx_flame_sheet.png',
      smoke: 'fx/fx_smoke_sheet.png',
      burst: 'fx/fx_burst_sheet.png',
      rail:  'props/prop_bangfai_rail.png'
    };
    Object.keys(files).forEach(function (k) {
      var im = new Image();
      im.onload = function () { im._ok = true; };
      im.onerror = function () { im._ok = false; };
      im.src = base + files[k];
      IMG[k] = im;
    });
  }
  function ok(im) { return im && im._ok && im.naturalWidth > 0; }

  // ------------------------------------------------------------------ helpers
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function fmtM(m) {
    m = m || 0;
    if (Math.abs(m) >= 1000) return (m / 1000).toFixed(m >= 100000 ? 0 : 2) + ' กม.';
    return Math.round(m) + ' ม.';
  }

  // ================================================================== class
  function FlightScene2D() {
    this.root = $('f2-overlay');
    this.canvas = $('f2-canvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.available = !!this.ctx;
    if (!this.available) return;

    this.sound = RS.render.SoundFX ? new RS.render.SoundFX() : null;

    this.playing = false;
    this.rate = 1;
    this.t = 0;
    this.dur = 1;
    this._raf = null;
    this._last = 0;
    this._open = false;

    this._bind();
    loadImages();
  }

  var P = FlightScene2D.prototype;

  P._bind = function () {
    var self = this;
    var b = function (id, fn) { var el = $(id); if (el) el.addEventListener('click', fn); };
    b('f2-play', function () { self._togglePlay(); });
    b('f2-restart', function () { self._restart(); });
    b('f2-rate', function () { self._cycleRate(); });
    b('f2-close', function () { self.close(); });
    b('f2-close-x', function () { self.close(); });
    b('f2-replay', function () { self._restart(); });
    b('f2-ap-close', function () { self.close(); });

    var scrub = $('f2-scrub');
    if (scrub) {
      scrub.addEventListener('input', function () {
        self.t = (scrub.value / 1000) * self.dur;
        self.playing = false;
        self._syncPlayBtn();
        self._hideAutopsy();
        self._step(0);          // dt 0 → re-sample + snap camera + re-arm events
        self._drawFrame();
      });
    }
    this._onKey = function (e) {
      if (!self._open) return;
      if (self._cutscene && self._cutscene.t > 1) { self._endCutscene(); return; }
      if (e.key === 'Escape') { self.close(); }
      else if (e.key === ' ') { e.preventDefault(); self._togglePlay(); }
      else if (e.key === 'r' || e.key === 'R') { self._restart(); }
    };
    document.addEventListener('keydown', this._onKey);
    if (this.canvas) this.canvas.addEventListener('click', function () {
      if (self._cutscene && self._cutscene.t > 1) self._endCutscene();
    });
    window.addEventListener('resize', function () { if (self._open) self._resize(); });
  };

  // ------------------------------------------------------------------- open
  P.open = function (sim, vehicle, mission, opts) {
    if (!this.available || !sim || !sim.trajectory || !sim.trajectory.length) return;
    opts = opts || {};
    this.sim = sim;
    this.traj = sim.trajectory;
    this.vehicle = vehicle;
    this.mission = mission || null;
    this.opts = opts;
    this.fw = opts.firework || null;
    this.dur = this.traj[this.traj.length - 1].time || 1;

    this._buildParts(vehicle);
    RS.render.__f2 = this;   // debug handle

    // an orbital coast runs for 15–20 min of trajectory with nothing to watch
    // once ORBIT is reached — end the replay a beat after the payoff event
    // (ORBIT for a launch, IMPACT for a lob) instead of playing the whole coast.
    (sim.events || []).forEach(function (e) {
      if (e.type === 'ORBIT') this.dur = Math.min(this.dur, e.time + 12);
      if (e.type === 'IMPACT') this.dur = Math.min(this.dur, e.time + 4);
    }, this);

    this._prepEvents(sim.events);
    this._prepTrail();

    // scene extents / tuning
    this.apogee = (sim.summary && sim.summary.apogee) || 100;
    this.apogeeTime = (sim.summary && sim.summary.apogeeTime) || this.dur * 0.4;
    this.toSpace = this.apogee > 20000;         // V-2 / orbit — climbs out of the sky band
    // is this a HOT-AIR LANTERN? (buoyancy carries it, not a motor). It gets its
    // own silhouette, its own hush, and a camera that doesn't chase it so the
    // slow drift reads against the fixed hills.
    var maxThr = 0, maxBuo = 0;
    for (var ti2 = 0; ti2 < this.traj.length; ti2++) {
      maxThr = Math.max(maxThr, this.traj[ti2].thrust || 0);
      maxBuo = Math.max(maxBuo, this.traj[ti2].buoyancy || 0);
    }
    this.buoy = maxBuo > maxThr;
    this.groundColor = this.toSpace ? '#4a3a2c' : '#3a2f26';

    // a lantern doesn't fly alone — the whole village lets theirs go together.
    // A drift of companion lanterns, varied in size / height / rise-rate, that
    // fills the sky as the player's climbs. World-positioned so the camera and
    // parallax carry them convincingly.
    this._companions = [];
    if (this.buoy) {
      // climb at roughly the HERO's pace so the whole drift stays coherent —
      // a few lag below, a few slip past above, none rocket off the top of frame
      var apo = this.apogee;
      var pace = apo / Math.max(20, this.dur * 0.45);   // ≈ the hero's ascent rate
      var N = 22;
      for (var ci = 0; ci < N; ci++) {
        var r0 = Math.random(), r1 = Math.random(), r2 = Math.random();
        this._companions.push({
          x: (r0 - 0.5) * Math.max(260, apo * 1.7),      // spread wide around the pad
          y0: r1 * r1 * apo * 0.55 - apo * 0.04,          // biased LOW — near the ground
          rise: pace * (0.45 + r2 * 0.8),                 // 0.45×–1.25× the hero's pace
          scale: 0.4 + Math.random() * Math.random() * 1.0,
          phase: Math.random() * TAU,
          swayA: 0.6 + Math.random() * 1.5,
          warm: 0.78 + Math.random() * 0.22
        });
      }
    }

    this.smoke = [];
    this.bursts = [];
    this._toastUntil = 0;
    this._lastEvIdx = -1;
    this._shake = 0;
    this._autopsyShown = false;
    this._flameT = 0;
    this._groundFire = null;      // a khom loy comes down with its candle lit → dry grass
    this._cutscene = null;
    this._cutsceneDone = false;
    // Did the lantern DRIFT OUT of a NOTAM no-fly zone? That airspace is a small
    // airfield's approach — a cutscene shows why the rule exists (it flies into
    // a plane) before the autopsy.
    var _sz = (this.mission && this.mission.constraints && this.mission.constraints.safeZoneRadius) || 0;
    var _md = (sim.summary && (sim.summary.maxDrift != null ? sim.summary.maxDrift
              : Math.abs(sim.summary.impactX || 0))) || 0;
    this._notamPending = !!(this.buoy && _sz > 0 && _md > _sz);
    this._notamRadius = _sz;
    // per-flight caches — the instance is reused across launches / era switches,
    // so a stale max-thrust or max-speed would bleed a V-2's numbers into a khom loy
    this._vmax = 0;
    this._mt = null;
    // launch zoom: frame ~34 m of world (rocket on the pad + tower + treeline).
    // From here the camera only ever zooms OUT — never in.
    this._mpp0 = clamp(34 / (this.H || 720), 0.03, 0.09);
    this._mpp = this._mpp0;
    this._camX = 0;
    this._camY = (this.bodyH || 3) * 0.5;
    this._camSeed = false;   // first buoy frame snaps the locked wide shot (no ease-in dip)

    this._mecoT = null;
    for (var ee = 0; ee < (sim.events || []).length; ee++) {
      var ety = sim.events[ee].type;
      if (ety === 'MECO' || ety === 'BURNOUT' || ety === 'ORBIT') { this._mecoT = sim.events[ee].time; break; }
    }

    // auto time-warp: powered ascent is the show — keep it near real time; a long
    // ballistic coast / a khom loy's 15-min drift gets wound forward hard (the
    // loop adds a further ×N once past apogee — see the rAF driver).
    this.rate = this.dur > 300 ? 12 : (this.dur > 120 ? 8 : (this.dur > 55 ? 4 : (this.dur > 24 ? 2 : 1)));
    var rb = $('f2-rate'); if (rb) rb.textContent = this.rate + '×';

    this.root.hidden = false;
    this._open = true;
    this.t = 0;
    this.playing = true;
    this._last = performance.now();
    this._syncPlayBtn();
    this._hideAutopsy();
    this._resize();

    // a V-2 / orbital shot is a BALLISTIC ARC over a curved world — a chase cam
    // loses it in seconds. Project the whole flight onto the globe as a trace.
    // (after _resize so this.W / this.H are set)
    this._stars = null;
    if (this.toSpace) this._prepMap(); else this._mapS = null;

    // a lantern doesn't ROAR — the bang-fai ignite/liftoff clips are wrong for it
    if (!this.buoy && this.sound && this.sound.play) { try { this.sound.play('ignite', 0.5); } catch (e) {} }

    var self = this;
    cancelAnimationFrame(this._raf);
    var loop = function (now) {
      if (!self._open) return;
      var dt = Math.min(0.05, (now - self._last) / 1000);
      self._last = now;
      if (self.playing) {
        // wind the dull part forward: once the rocket is past apogee and just
        // falling, there's nothing to study — fast-forward the descent so the
        // flight doesn't outstay its welcome (SFS-style auto-warp).
        var warp = 1;
        if (self.cur && self.t < self.dur - 3) {
          if (!self.toSpace && self.t > self.apogeeTime + 2 && (self.cur.velocity || 0) < -2) warp = 4;
          // on the arc map, wind the ballistic coast forward once the engine is out
          else if (self.toSpace && self._mecoT != null && self.t > self._mecoT + 3) warp = 5;
        }
        self.t += dt * self.rate * warp;
        if (self.t >= self.dur) { self.t = self.dur; self.playing = false; self._syncPlayBtn(); }
      }
      self._step(dt);
      if (self._cutscene) {
        self._advanceCutscene(dt);
      } else {
        self._drawFrame();
        if (self.t >= self.dur && !self._autopsyShown && self.bursts.length === 0) {
          if (self._notamPending && !self._cutsceneDone) self._startCutscene();
          else self._showAutopsy();
        }
      }
      self._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  };

  P.close = function () {
    this._open = false;
    this.playing = false;
    cancelAnimationFrame(this._raf);
    if (this.root) this.root.hidden = true;
    this._hideAutopsy();
    if (this.sound && this.sound.stopAll) { try { this.sound.stopAll(); } catch (e) {} }
  };

  // ---------------------------------------------------------- build rocket
  P._buildParts = function (vehicle) {
    var insts = (vehicle && vehicle.instances) || [];
    this.parts = [];
    if (!insts.length) { this.rocketH = 2; this.bodyH = 2; this.rocketBottom = 0; this.nozzleY = 0; return; }
    var minGX = Infinity, maxGX = -Infinity, minGY = Infinity, maxGY = -Infinity;
    insts.forEach(function (i) {
      minGX = Math.min(minGX, i.gx); maxGX = Math.max(maxGX, i.gx + i.part.size.w);
      minGY = Math.min(minGY, i.gy); maxGY = Math.max(maxGY, i.gy + i.part.size.h);
    });
    var cx = (minGX + maxGX) / 2;
    var self = this;
    // classify each part by HOW IT IS MOUNTED, not by what nodes it offers:
    //   · a part with at least one STACK joint is spine (body / nose / motor)
    //   · a part attached only through its own RADIAL nodes is a fin or,
    //     if it's a tall structural member, the Bang Fai tail stick — which
    //     must NOT drive the vehicle's on-screen size (a 6 m stick was
    //     inflating the whole render so the airframe drew as a spindly stalk).
    var bodyMinGY = Infinity, bodyMaxGY = -Infinity;
    insts.forEach(function (i) {
      var p = i.part;
      var radialIds = {};
      (p.attachNodes || []).forEach(function (n) {
        if (n.type === 'radial') radialIds[n.id] = 1;
      });
      var links = i.links || i.attachments || [];
      var hasStackJoint = links.some(function (l) { return !radialIds[l.node]; });
      var radialMounted = links.length > 0 && !hasStackJoint;
      var tall = p.size.h >= 4;
      var tail = radialMounted && p.category === 'Structural' && tall;
      var fin = radialMounted && !tail;
      var noseTop = !radialMounted && (i.gy <= minGY + 0.01) && p.category === 'Aerodynamics';
      if (!tail && !fin) {
        bodyMinGY = Math.min(bodyMinGY, i.gy);
        bodyMaxGY = Math.max(bodyMaxGY, i.gy + p.size.h);
      }
      self.parts.push({
        part: p,                 // the real part — drawn by the shared PartArt silhouettes
        id: p.id,
        // metres, rocket-local: origin = bottom-centre of the whole stack, +y up
        x: (i.gx + p.size.w / 2 - cx) * MPC,
        yBot: (maxGY - (i.gy + p.size.h)) * MPC,
        w: p.size.w * MPC,
        h: p.size.h * MPC,
        cat: p.category,
        motor: p.category === 'Propulsion',
        fin: fin,
        tail: tail,
        nose: noseTop
      });
    });
    if (!isFinite(bodyMinGY)) { bodyMinGY = minGY; bodyMaxGY = maxGY; }
    // widest spine part, metres — a lone Bang Fai tube is only 0.5 m across and
    // renders as a hair; the draw fattens the x-axis so it stays readable.
    this.bodyW = 0.5;
    this.parts.forEach(function (p) { if (!p.tail && !p.fin) self.bodyW = Math.max(self.bodyW, p.w); });
    // draw order: tail pole (behind) · body · fins · nose
    this.parts.sort(function (a, b) {
      var r = function (p) { return p.tail ? 0 : (p.fin ? 2 : (p.nose ? 3 : 1)); };
      return r(a) - r(b);
    });
    this.rocketH = (maxGY - minGY) * MPC;         // full extent incl. tail stick
    this.bodyH = (bodyMaxGY - bodyMinGY) * MPC;   // the visible airframe — flame + zoom scale
    this.rocketBottom = 0;
    // lowest motor nozzle, rocket-local (ignore the tail pole)
    var noz = 0;
    this.parts.forEach(function (p) { if (p.motor) noz = Math.min(noz, p.yBot); });
    this.nozzleY = noz;
  };

  P._prepEvents = function (events) {
    this.events = (events || []).slice().sort(function (a, b) { return a.time - b.time; });
    // timeline marks
    var marks = $('f2-marks');
    if (marks) {
      marks.innerHTML = '';
      var self = this;
      this.events.forEach(function (e) {
        var s = document.createElement('span');
        s.style.left = (100 * clamp(e.time / self.dur, 0, 1)) + '%';
        s.style.background = EVENT_COLOR[e.type] || '#9db4d8';
        marks.appendChild(s);
      });
    }
  };

  P._prepTrail = function () {
    // subsample the trajectory for a cheap fading breadcrumb
    this.trail = [];
    var step = Math.max(1, Math.floor(this.traj.length / 260));
    for (var i = 0; i < this.traj.length; i += step) {
      this.trail.push({ t: this.traj[i].time, x: this.traj[i].drift || 0, y: this.traj[i].altitude });
    }
  };

  // --------------------------------------------------- ballistic-arc map view
  P._prepMap = function () {
    var RE = (RS.Physics && RS.Physics.RE) || 600000;
    this._RE = RE;
    // arc extent from the trajectory itself
    var maxDr = 0, apo = 0;
    for (var i = 0; i < this.trail.length; i++) {
      maxDr = Math.max(maxDr, Math.abs(this.trail[i].x));
      apo = Math.max(apo, this.trail[i].y);
    }
    var thMax = maxDr / RE;
    this._mapThetaMid = thMax * 0.5;
    // bounding box of the mapped path in RE-centred metres, θ measured from mid
    var lo = { x: 1e18, y: 1e18 }, hi = { x: -1e18, y: -1e18 };
    var probe = function (th, alt) {
      var r = RE + alt, a = th - (thMax * 0.5);
      var px = r * Math.sin(a), py = -r * Math.cos(a);
      lo.x = Math.min(lo.x, px); hi.x = Math.max(hi.x, px);
      lo.y = Math.min(lo.y, py); hi.y = Math.max(hi.y, py);
    };
    for (var s = 0; s <= 40; s++) { probe((s / 40) * thMax, ((s / 40) < 0.5 ? (s / 20) : (2 - s / 20)) * apo); }
    probe(thMax * 0.5, apo * 1.12);
    probe(0, 0); probe(thMax, 0);
    // include a slice of planet below the launch/impact points for context
    lo.y -= (hi.y - lo.y) * 0.12;
    var bw = hi.x - lo.x, bh = hi.y - lo.y;
    var S = Math.min((this.W * 0.86) / bw, (this.H * 0.78) / bh);
    this._mapS = S;
    this._mapCx = this.W / 2 - ((lo.x + hi.x) / 2) * S;
    this._mapCy = this.H * 0.56 - ((lo.y + hi.y) / 2) * S;
    this._mapApo = apo; this._mapThMax = thMax;
  };

  P._mapPt = function (dr, alt) {
    var RE = this._RE, a = (dr / RE) - this._mapThetaMid, r = RE + alt;
    return {
      x: this._mapCx + r * Math.sin(a) * this._mapS,
      y: this._mapCy - r * Math.cos(a) * this._mapS
    };
  };

  P._drawMapFrame = function (ctx, st) {
    var W = this.W, H = this.H, RE = this._RE, S = this._mapS;
    var cx = this._mapCx, cy = this._mapCy, Rpx = RE * S;

    // ---- space
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#05060e'); g.addColorStop(1, '#0b1022');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (!this._stars) {
      this._stars = [];
      for (var si = 0; si < 140; si++) this._stars.push([Math.random(), Math.random(), 0.3 + Math.random() * 0.7]);
    }
    ctx.fillStyle = '#fff';
    for (var s2 = 0; s2 < this._stars.length; s2++) {
      var stx = this._stars[s2];
      ctx.globalAlpha = stx[2] * 0.7;
      ctx.fillRect(stx[0] * W, stx[1] * H, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;

    // ---- planet
    ctx.save();
    var atm = ctx.createRadialGradient(cx, cy, Rpx * 0.99, cx, cy, Rpx * 1.06);
    atm.addColorStop(0, 'rgba(90,170,255,0.5)');
    atm.addColorStop(1, 'rgba(90,170,255,0)');
    ctx.fillStyle = atm;
    ctx.beginPath(); ctx.arc(cx, cy, Rpx * 1.06, 0, TAU); ctx.fill();
    var pg = ctx.createRadialGradient(cx - Rpx * 0.35, cy - Rpx * 0.35, Rpx * 0.1, cx, cy, Rpx);
    pg.addColorStop(0, '#3a7bd0'); pg.addColorStop(0.6, '#1f4f8f'); pg.addColorStop(1, '#123056');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(cx, cy, Rpx, 0, TAU); ctx.fill();
    // a couple of land smudges near the launch arc
    ctx.fillStyle = 'rgba(70,120,80,0.5)';
    for (var li = 0; li < 5; li++) {
      var lp = this._mapPt(this._mapThMax * (li / 4), 0);
      ctx.beginPath(); ctx.ellipse(lp.x, lp.y + 6, 26 + li * 6, 10, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();

    // ---- the full trajectory: future faint, flown bright
    var tr = this.trail, now = this.t;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // future (dashed)
    ctx.save();
    ctx.setLineDash([5, 7]); ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(150,180,230,0.35)';
    ctx.beginPath();
    for (var f = 0; f < tr.length; f++) {
      var pf = this._mapPt(tr[f].x, tr[f].y);
      if (f === 0) ctx.moveTo(pf.x, pf.y); else ctx.lineTo(pf.x, pf.y);
    }
    ctx.stroke();
    ctx.restore();
    // flown (glow)
    ctx.save();
    ctx.shadowColor = 'rgba(255,180,90,0.9)'; ctx.shadowBlur = 8;
    ctx.strokeStyle = '#ffb45a'; ctx.lineWidth = 3;
    ctx.beginPath();
    var started = false;
    for (var fl2 = 0; fl2 < tr.length; fl2++) {
      if (tr[fl2].t > now) break;
      var pl = this._mapPt(tr[fl2].x, tr[fl2].y);
      if (!started) { ctx.moveTo(pl.x, pl.y); started = true; } else ctx.lineTo(pl.x, pl.y);
    }
    ctx.stroke();
    ctx.restore();

    // ---- markers
    var self = this;
    var pin = function (dr, alt, col, label) {
      var p = self._mapPt(dr, alt);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, TAU); ctx.stroke();
      if (label) {
        ctx.font = '12px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(230,238,255,0.9)';
        ctx.textAlign = 'center';
        ctx.fillText(label, p.x, p.y - 12);
      }
    };
    pin(0, 0, '#ff5a5a', 'ฐานยิง');
    var s = this.sim.summary || {};
    var tgt = s.targetRange || 0;
    if (tgt > 0) pin(tgt, 0, '#5bd6ff', 'เป้า');
    // apogee
    var apoPt = tr[0]; for (var ai = 0; ai < tr.length; ai++) if (tr[ai].y > apoPt.y) apoPt = tr[ai];
    pin(apoPt.x, apoPt.y, '#ffd24a', 'จุดสูงสุด ' + fmtM(apoPt.y));

    // ---- the rocket + exhaust
    var here = this._mapPt(st.drift || 0, st.altitude);
    // heading from a short step along the flown path (screen space)
    var ahead = this._mapPt((st.drift || 0) + (st.vx || 0), st.altitude + (st.velocity || 0));
    var ang = Math.atan2(ahead.y - here.y, ahead.x - here.x);
    var powered = this._mecoT != null ? (this.t < this._mecoT - 0.1) : (st.thrust > 1);
    ctx.save();
    ctx.translate(here.x, here.y);
    ctx.rotate(ang);
    if (powered) {
      var fl = 16 + 10 * Math.sin(this._flameT * 40);
      var eg = ctx.createLinearGradient(0, 0, -fl - 10, 0);
      eg.addColorStop(0, 'rgba(255,240,200,0.95)');
      eg.addColorStop(0.5, 'rgba(255,150,50,0.6)');
      eg.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.moveTo(-6, -4); ctx.lineTo(-fl - 10, 0); ctx.lineTo(-6, 4); ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#e8eef7';
    ctx.strokeStyle = '#243a5a'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(11, 0); ctx.lineTo(-6, -5); ctx.lineTo(-3, 0); ctx.lineTo(-6, 5);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // locator ring so it never gets lost
    ctx.strokeStyle = 'rgba(255,220,150,0.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(here.x, here.y, 15 + 3 * Math.sin(this.t * 4), 0, TAU); ctx.stroke();

    // ---- picture-in-picture chase during powered flight
    if (powered) this._drawMapPip(ctx, st);
  };

  P._drawMapPip = function (ctx, st) {
    var w = Math.min(230, this.W * 0.28), h = w * 0.62;
    var x = this.W - w - 16, y = 16;
    ctx.save();
    ctx.beginPath(); this._roundRect(ctx, x, y, w, h, 10); ctx.clip();
    // mini sky
    var g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#0a1226'); g.addColorStop(1, '#1a2f4a');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    // ground line rising away
    var horiz = y + h * clamp(1 - st.altitude / 40000, 0.12, 0.95);
    ctx.fillStyle = '#2a3f2c'; ctx.fillRect(x, horiz, w, y + h - horiz);
    // the rocket close up, tilted by pitch
    var cxp = x + w * 0.5, cyp = y + h * 0.55;
    var pitch = st.pitch != null ? st.pitch : 90;
    ctx.save();
    ctx.translate(cxp, cyp);
    ctx.rotate((90 - pitch) * Math.PI / 180);
    var L = h * 0.42;
    // plume
    var fl = L * (0.8 + 0.3 * Math.sin(this._flameT * 40));
    var eg = ctx.createLinearGradient(0, L * 0.5, 0, L * 0.5 + fl);
    eg.addColorStop(0, 'rgba(255,240,200,0.95)');
    eg.addColorStop(0.5, 'rgba(255,150,50,0.6)');
    eg.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.moveTo(-L * 0.13, L * 0.5); ctx.lineTo(0, L * 0.5 + fl); ctx.lineTo(L * 0.13, L * 0.5);
    ctx.closePath(); ctx.fill();
    // body
    ctx.fillStyle = '#e8eef7'; ctx.strokeStyle = '#243a5a'; ctx.lineWidth = 1.5;
    this._roundRect(ctx, -L * 0.13, -L * 0.5, L * 0.26, L, L * 0.06);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();                                  // nose
    ctx.moveTo(-L * 0.13, -L * 0.5); ctx.lineTo(L * 0.13, -L * 0.5); ctx.lineTo(0, -L * 0.72);
    ctx.closePath(); ctx.fillStyle = '#cfd9e6'; ctx.fill(); ctx.stroke();
    ctx.restore();
    // frame + label
    ctx.restore();
    ctx.strokeStyle = 'rgba(180,200,230,0.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); this._roundRect(ctx, x, y, w, h, 10); ctx.stroke();
    ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = 'rgba(220,230,245,0.85)';
    ctx.textAlign = 'left';
    ctx.fillText('เครื่องยนต์ทำงาน', x + 10, y + h - 9);
  };

  // ------------------------------------------------------------ interpolate
  P._sample = function (t) {
    var a = this.traj, n = a.length;
    if (t <= a[0].time) return a[0];
    if (t >= a[n - 1].time) return a[n - 1];
    // binary search
    var lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (a[mid].time <= t) lo = mid; else hi = mid;
    }
    var s0 = a[lo], s1 = a[hi];
    var f = (t - s0.time) / Math.max(1e-6, s1.time - s0.time);
    var o0 = s0.orientation || { pitch: 90, roll: 0 };
    var o1 = s1.orientation || { pitch: 90, roll: 0 };
    return {
      time: t,
      altitude: lerp(s0.altitude, s1.altitude, f),
      drift: lerp(s0.drift || 0, s1.drift || 0, f),
      velocity: lerp(s0.velocity, s1.velocity, f),
      vx: lerp(s0.vx || 0, s1.vx || 0, f),
      speed: lerp(s0.speed || Math.abs(s0.velocity), s1.speed || Math.abs(s1.velocity), f),
      mass: lerp(s0.mass, s1.mass, f),
      thrust: lerp(s0.thrust || 0, s1.thrust || 0, f),
      buoyancy: lerp(s0.buoyancy || 0, s1.buoyancy || 0, f),
      q: lerp(s0.q || 0, s1.q || 0, f),
      propRemaining: lerp(s0.propRemaining || 0, s1.propRemaining || 0, f),
      pitch: lerp(o0.pitch, o1.pitch, f),
      roll: lerp(o0.roll || 0, o1.roll || 0, f),
      tumbling: s1.tumbling || s0.tumbling,
      padLocked: s1.padLocked && s0.padLocked
    };
  };

  // ------------------------------------------------------------------ step
  P._step = function (dt) {
    var st = this._sample(this.t);
    this.cur = st;
    this._flameT += dt;

    // ---- events / toast / shake
    for (var i = this._lastEvIdx + 1; i < this.events.length; i++) {
      if (this.events[i].time <= this.t) {
        this._fireEvent(this.events[i]);
        this._lastEvIdx = i;
      } else break;
    }
    // scrubbed backwards? re-arm
    if (this._lastEvIdx >= 0 && this.events[this._lastEvIdx].time > this.t + 0.01) {
      this._lastEvIdx = -1;
      for (var j = 0; j < this.events.length && this.events[j].time <= this.t; j++) this._lastEvIdx = j;
    }
    this._shake *= Math.pow(0.0025, dt);
    if (this._shake < 0.05) this._shake = 0;

    // ---- pad smoke while the motor is spooling / just off the pad (a lantern
    //      lifts clean — no ground-hugging exhaust cloud)
    var lift = Math.max(st.thrust, st.buoyancy);
    if (!this.buoy && this.playing && lift > 1 && st.altitude < 60 && this.t < (this._liftoffT || 0) + 3.2 &&
        this.smoke.length < 90 && Math.random() < dt * 40) {
      this.smoke.push({
        x: (st.drift || 0) + (Math.random() - 0.5) * this.rocketH * 0.9,
        y: Math.max(0.2, st.altitude - this.rocketH * 0.4),
        vx: (Math.random() - 0.5) * 3, vy: 0.5 + Math.random() * 2.2,
        age: 0, life: 1.4 + Math.random() * 1.6, r0: this.rocketH * (0.5 + Math.random())
      });
    }
    for (var k = this.smoke.length - 1; k >= 0; k--) {
      var s = this.smoke[k];
      s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy *= (1 - dt * 0.4); s.vx *= (1 - dt * 0.6);
      if (s.age >= s.life) this.smoke.splice(k, 1);
    }
    for (var m = this.bursts.length - 1; m >= 0; m--) {
      this.bursts[m].age += dt;
      if (this.bursts[m].age >= 1.6) this.bursts.splice(m, 1);
    }
    if (this._groundFire) {
      if (st.altitude > 6) this._groundFire = null;   // scrubbed back before touchdown
      else {
        this._groundFire.t += dt;
        this._groundFire.peak = Math.min(1, this._groundFire.peak + dt * 0.7);
      }
    }

    // ---- camera : follow the rocket, zoom out as it climbs (SFS-style).
    // The zoom ceiling scales with THIS flight's apogee so the whole climb uses
    // the full zoom range — a 3 km Bang Fai ends up showing kilometres of air
    // below it, a 300 m khom loy barely zooms at all.
    var alt = st.altitude, drift = st.drift || 0;
    var m0 = this._mpp0 || 0.04;
    var ck = dt <= 0 ? 1 : (1 - Math.pow(0.02, dt));    // dt 0 (scrub) → snap; ~0.25 s TC

    if (this.buoy) {
      // A LANTERN. Frame the whole release as ONE locked wide shot: the ground
      // pinned near the bottom of the frame, ~1.35× the flight's apogee of air
      // above it. The lantern then climbs MONOTONICALLY up through the frame
      // against the fixed hills — no chase, no ease-in dip, no "the number
      // moves but nothing on screen does". Only pan up if it tops the ceiling.
      var span = Math.max(70, this.apogee * 1.35);
      var fixedMpp = clamp(span / (this.H * 0.80), m0, 30);
      var camYWant = 0.28 * this.H * fixedMpp;                // ground parked ~88% down
      var ceilWorld = camYWant + fixedMpp * this.H * 0.52;    // world-y just under frame top
      if (alt > ceilWorld) camYWant += (alt - ceilWorld);
      if (!this._camSeed) {
        this._mpp = fixedMpp; this._camY = camYWant; this._camX = drift * 0.32;
        this._camSeed = true;
      } else {
        this._mpp = lerp(this._mpp, fixedMpp, ck);
        this._camY = lerp(this._camY, camYWant, ck);
        this._camX = lerp(this._camX, drift * 0.32, ck);
      }
      return;
    }

    // ---- ROCKET camera (SFS-style): zoom-out ceiling scales with apogee so the
    // whole climb uses the full zoom range; a 3 km Bang Fai ends showing km of
    // air below it, a 300 m firework barely zooms.
    var ceil = this.toSpace ? 1600 : clamp(this.apogee / 240, m0 * 1.5, 60);
    var climb = clamp(alt / Math.max(120, this.apogee * 0.55), 0, 1);
    var targetMpp = clamp(m0 + (ceil - m0) * Math.pow(climb, 0.72), m0, ceil);
    this._mpp = lerp(this._mpp, targetMpp, ck);
    var wantY = alt + this.bodyH * 0.5 + this._mpp * this.H * 0.08;
    var lowCeil = this._mpp * this.H * 0.30;
    if (alt < lowCeil) wantY = Math.min(wantY, lowCeil);
    this._camY = lerp(this._camY, wantY, ck);
    this._camX = lerp(this._camX, drift, ck);
  };

  P._fireEvent = function (e) {
    if (e.type === 'LIFTOFF') {
      this._liftoffT = e.time;
      // a lantern lifts on a whisper — no rail-tearing whoosh, no camera kick
      this._shake = this.buoy ? 0 : 1;
      if (!this.buoy && this.sound && this.sound.play) { try { this.sound.play('liftoff', 0.7); } catch (x) {} }
    }
    if (e.type === 'IMPACT' || e.type === 'APOGEE_BREAKUP' || e.type === 'LOSS_OF_CONTROL') this._shake = Math.max(this._shake, 0.8);
    // a khom loy touches down with its wax candle still alight — on a thatch
    // roof or dry grass that is exactly how the festival starts a fire.
    if (e.type === 'IMPACT' && this.buoy && this.cur && !this._groundFire) {
      this._groundFire = { x: this.cur.drift || 0, t: 0, embers: [], peak: 0 };
      var tf = $('f2-toast');
      if (tf) {
        tf.textContent = 'โคมตกทั้งที่ไฟยังติด — ไฟไหม้พื้น!';
        tf.style.color = '#ff7a3a'; tf.hidden = false;
        this._toastUntil = this.t + 3.0;
      }
    }
    if (e.type === 'SEPARATE_STAGE') this._shake = Math.max(this._shake, 0.5);
    if (e.type === 'BURST' && this.cur) {
      this.bursts.push({ x: this.cur.drift || 0, y: this.cur.altitude, age: 0, dud: false });
    }
    if (e.type === 'DUD' && this.cur) this.bursts.push({ x: this.cur.drift || 0, y: this.cur.altitude, age: 0, dud: true });

    var lab = LABEL_TH[e.type] || e.type;
    var toast = $('f2-toast');
    if (toast) {
      toast.textContent = lab;
      toast.style.color = EVENT_COLOR[e.type] || '#fff';
      toast.hidden = false;
      this._toastUntil = this.t + 2.0;
    }
  };

  // ----------------------------------------------------------------- render
  P._resize = function () {
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = this.root.clientWidth || global.innerWidth;
    var h = this.root.clientHeight || global.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = w; this.H = h;
    if (this.toSpace && this._RE) this._prepMap();   // re-fit the arc projection
    this._drawFrame();
  };

  P._w2s = function (wx, wy) {
    return {
      x: this.W / 2 + (wx - this._camX) / this._mpp,
      y: this.H * 0.60 - (wy - this._camY) / this._mpp
    };
  };

  P._drawFrame = function () {
    if (!this.ctx || !this.cur) return;
    var ctx = this.ctx, W = this.W, H = this.H, st = this.cur;
    var alt = st.altitude;

    // V-2 / orbit → the ballistic-arc map (chase cam can't hold a 160 km lob)
    if (this.toSpace && this._mapS) {
      this._drawMapFrame(ctx, st);
      this._updateHud(st);
      var tst = $('f2-toast');
      if (tst && !tst.hidden && this.t > this._toastUntil) tst.hidden = true;
      return;
    }

    ctx.save();
    if (this._shake > 0) {
      var s = this._shake * 9;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }

    // ---- 1 · sky bands (cross-fade dusk → stars → space by altitude)
    this._drawSky(ctx, W, H, alt);

    // ---- 2 · far parallax : hills / village (the height cue — keep it a while)
    if (alt < 9000) this._drawParallax(ctx, W, H);

    // ---- 3 · ground + pad prop
    this._drawGround(ctx, W, H);

    // ---- 3.5 · companion lanterns (behind the hero, the whole village's khom loy)
    if (this._companions && this._companions.length) this._drawCompanions(ctx);

    // ---- 4 · flight trail
    this._drawTrail(ctx);

    // ---- 5 · pad smoke (behind rocket)
    this._drawSmoke(ctx);

    // ---- 6 · the rocket
    this._drawRocket(ctx, st);

    // ---- 6.5 · the fire a fallen khom loy started (in front of the dull husk)
    if (this._groundFire) this._drawGroundFire(ctx);

    // ---- 7 · firework bursts (in front)
    this._drawBursts(ctx);

    ctx.restore();

    // ---- HUD (DOM)
    this._updateHud(st);

    // toast auto-hide
    var toast = $('f2-toast');
    if (toast && !toast.hidden && this.t > this._toastUntil) toast.hidden = true;
  };

  P._drawSky = function (ctx, W, H, alt) {
    // The climb has to READ. The dusk band (L1 — clouds + horizon lanterns) owns
    // the first ~1.5 km, then cross-fades to the clean high star-field (L5, no
    // lanterns) so that by the time a bang fai nears its ~3 km apogee the sky has
    // visibly deepened and the festival lanterns are gone. Space (L6) is for the
    // V-2 / orbit climb far above.
    var duskA = 1 - 0.82 * smooth(clamp((alt - 500) / 2200, 0, 1));
    var starA = smooth(clamp((alt - 400) / 2400, 0, 1)) * (1 - smooth(clamp((alt - 34000) / 24000, 0, 1)));
    var spaceA = smooth(clamp((alt - 30000) / 30000, 0, 1));

    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, spaceA > 0.5 ? '#05060c' : '#241a44');
    g.addColorStop(1, spaceA > 0.5 ? '#0a0a16' : '#e88a5a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    function band(im, a, panFrac) {
      if (a <= 0.01 || !ok(im)) return;
      ctx.globalAlpha = clamp(a, 0, 1);
      var iw = im.naturalWidth, ih = im.naturalHeight;
      var sc = Math.max(W / iw, (H * 1.35) / ih);
      var dw = iw * sc, dh = ih * sc;
      // pan the image DOWN as we climb → the rocket rises through it toward the
      // darker top of the frame (past the painted clouds & horizon lanterns).
      var slack = Math.max(0, dh - H);
      // panFrac 0 = show image BOTTOM (horizon, lanterns), 1 = show image TOP (dark, stars)
      ctx.drawImage(im, (W - dw) / 2, -slack * (1 - clamp(panFrac, 0, 1)), dw, dh);
      ctx.globalAlpha = 1;
    }
    // the dusk band travels its whole height over the first ~1.8 km — the rocket
    // climbs up out of the clouds & lanterns; the high bands sit near their top.
    band(IMG.sky, duskA, clamp(alt / 1800, 0, 1));
    band(IMG.high, starA, 0.35 + clamp(alt / 120000, 0, 0.5));
    band(IMG.space, spaceA, 0.5);
  };

  P._tileLayer = function (ctx, im, factor, worldBottomY, worldHeightM, extra, phase) {
    if (!ok(im)) return;
    var W = this.W;
    var baseS = this._w2s(0, worldBottomY);
    var topS = this._w2s(0, worldBottomY + worldHeightM);
    var dh = baseS.y - topS.y;
    if (dh < 2 || topS.y > this.H || baseS.y < 0) return;
    var scale = dh / im.naturalHeight;
    var dw = im.naturalWidth * scale;
    // horizontal parallax; mirror alternate tiles so the organic art has no hard
    // seam. `phase` (0..1) shifts the tile grid so a full tile sits centred on
    // screen rather than a mirror-boundary straddling the pad (that dead-centre
    // mirror axis made the village look like a symmetric cut-out).
    var ox = (this.W / 2) - (this._camX * factor) / this._mpp + (phase || 0) * dw;
    var tile0 = Math.floor((ox - W) / dw);
    ox = ((ox % dw) + dw) % dw;
    ctx.globalAlpha = extra != null ? extra : 1;
    var ti = tile0;
    for (var x = ox - dw; x < W + dw; x += dw, ti++) {
      // mirror alternate tiles: every seam is then image-edge-meets-its-own-
      // mirror = continuous (no hard cut). `phase` above keeps the mirror axis
      // off screen-centre so it doesn't read as a symmetrical cut-out.
      if ((ti & 1) === 0) {
        ctx.drawImage(im, x, topS.y, dw, dh);
      } else {
        ctx.save();
        ctx.translate(x + dw, topS.y);
        ctx.scale(-1, 1);
        ctx.drawImage(im, 0, 0, dw, dh);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  };

  P._drawParallax = function (ctx, W, H) {
    var fade = 1 - smooth(clamp((this.cur.altitude - 2500) / 5500, 0, 1));
    if (fade <= 0.01) return;
    this._tileLayer(ctx, IMG.hills, 0.28, 2, 150, fade, 0.17);
    this._tileLayer(ctx, IMG.town, 0.55, -1, 15, fade, 0.36);
  };

  P._drawGround = function (ctx, W, H) {
    // the flat ground slab is a NEAR-field cue only. On a climb to space it must
    // fade right out (15→45 km) or you get a brown band sitting across the
    // planet limb at 90 km. Low flights (bang fai / khom loy) never reach the
    // fade so this is a no-op for them.
    var gAlpha = 1 - smooth(clamp((this.cur.altitude - 15000) / 30000, 0, 1));
    var g0 = this._w2s(0, 0);
    if (g0.y < H && gAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = gAlpha;
      ctx.fillStyle = this.groundColor;
      ctx.fillRect(0, g0.y, W, H - g0.y + 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, g0.y); ctx.lineTo(W, g0.y); ctx.stroke();
      ctx.restore();
    }
    // near foreground grass/fence — very close parallax, world-locked at pad.
    // Drops out fairly fast: once you're a few hundred metres up a near layer
    // just smears.
    var fade = 1 - smooth(clamp((this.cur.altitude - 220) / 500, 0, 1));
    if (fade > 0.01) this._tileLayer(ctx, IMG.fore, 0.92, -3, 9, fade, 0.61);

    // bang fai bamboo launch tower beside the pad (world-locked)
    if (ok(IMG.rail) && this.cur.altitude < 900) {
      var tellM = 9;                              // tower ~9 m tall
      var railBaseM = 1.6;                        // sits just right of pad centre
      var b = this._w2s(railBaseM, 0);
      var top = this._w2s(railBaseM, tellM);
      var hpx = b.y - top.y;
      if (hpx > 6 && hpx < H * 3) {
        var wpx = hpx * (IMG.rail.naturalWidth / IMG.rail.naturalHeight);
        ctx.globalAlpha = 1 - smooth(clamp((this.cur.altitude - 500) / 400, 0, 1));
        ctx.drawImage(IMG.rail, b.x - wpx * 0.5, top.y, wpx, hpx);
        ctx.globalAlpha = 1;
      }
    }
  };

  P._drawTrail = function (ctx) {
    var t = this.t, tr = this.trail;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    var started = false;
    for (var i = 0; i < tr.length; i++) {
      if (tr[i].t > t) break;
      var p = this._w2s(tr[i].x, tr[i].y);
      if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
    }
    if (started) {
      ctx.strokeStyle = 'rgba(255,240,210,0.35)';
      ctx.stroke();
    }
  };

  P._drawSmoke = function (ctx) {
    if (!ok(IMG.smoke)) return;
    var im = IMG.smoke, fw = im.naturalWidth / 4;
    for (var i = 0; i < this.smoke.length; i++) {
      var s = this.smoke[i];
      var k = s.age / s.life;
      var frame = Math.min(2, Math.floor(k * 3));      // frames 0..2 (frame 3 is broken art)
      var p = this._w2s(s.x, s.y);
      var rpx = (s.r0 * (0.4 + k * 1.4)) / this._mpp;
      if (rpx < 1 || rpx > this.W) continue;
      ctx.globalAlpha = clamp((1 - k) * 0.8, 0, 0.8);
      ctx.drawImage(im, frame * fw, 0, fw, im.naturalHeight, p.x - rpx, p.y - rpx, rpx * 2, rpx * 2);
    }
    ctx.globalAlpha = 1;
  };

  P._drawBursts = function (ctx) {
    if (!ok(IMG.burst)) return;
    var im = IMG.burst, n = 5, fw = im.naturalWidth / n;
    var hex = (this.fw && this.fw.colorHex) || '#ffd27a';
    for (var i = 0; i < this.bursts.length; i++) {
      var b = this.bursts[i];
      var k = b.age / 1.6;
      var frame = b.dud ? 0 : Math.min(n - 1, Math.floor(k * n));
      var p = this._w2s(b.x, b.y);
      var rpx = clamp((b.dud ? 6 : 26) / this._mpp, 24, this.W * 0.5);
      ctx.save();
      ctx.globalAlpha = clamp(1 - k * 0.7, 0, 1);
      ctx.globalCompositeOperation = 'lighter';
      // tint pass
      ctx.drawImage(im, frame * fw, 0, fw, im.naturalHeight, p.x - rpx, p.y - rpx, rpx * 2, rpx * 2);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = hex; ctx.globalAlpha *= 0.35;
      ctx.fillRect(p.x - rpx, p.y - rpx, rpx * 2, rpx * 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  P._drawRocket = function (ctx, st) {
    if (!this.parts || !this.parts.length) return;
    var base = this._w2s(st.drift || 0, st.altitude);

    // The khom loy now flies as the SAME picture you pick in the catalog and
    // assemble on the blueprint — RS.render.PartArt's glowing paper envelope,
    // composed in lantern proportions. (Rockets keep the tuned vector stack
    // below; their bang-fai / V-2 / orbit framing is already dialled in.)
    var PA = RS.render.PartArt;
    if (PA && this.buoy) { this._drawStackPA(ctx, st, base, PA); return; }

    // a hot-air lantern is not a rocket — draw the paper envelope glowing, not a
    // vector part stack
    if (this.buoy) { this._drawLantern(ctx, st, base); return; }

    // keep the rocket readable even when the camera is way out (SFS keeps the
    // craft a constant on-screen size once you're high enough)
    var MIN_PX = 54;
    var pxPerM = Math.max(1 / this._mpp, MIN_PX / Math.max(1, this.bodyH || this.rocketH));
    // a slender bang fai tube would still be a 1-px hair at that height scale —
    // stretch only the x-axis so the airframe reads without distorting altitude.
    var fatten = clamp(15 / Math.max(1e-3, (this.bodyW || 0.5) * pxPerM), 1, 4.5);
    // only halo the rocket when it's genuinely dwarfed by the zoom (deep coast /
    // orbit), and keep the glow tight — a big soft blob was reading as an object
    var tiny = pxPerM > (1 / this._mpp) * 2.2;
    if (tiny && st.thrust <= 0.5) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var gr = MIN_PX * 1.1;
      var gg = ctx.createRadialGradient(base.x, base.y, 0, base.x, base.y, gr);
      gg.addColorStop(0, 'rgba(255,225,170,0.28)');
      gg.addColorStop(1, 'rgba(255,225,170,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(base.x - gr, base.y - gr, gr * 2, gr * 2);
      ctx.restore();
    }
    // screen rotation: physics pitch 90° = straight up = 0 rad screen tilt.
    // <90 arcs downrange (+x) → clockwise on screen.
    var ang = (90 - (st.pitch != null ? st.pitch : 90)) * Math.PI / 180;
    if (st.tumbling) ang += Math.sin(this.t * 6) * 0.5 + (st.roll || 0) * Math.PI / 180;

    ctx.save();
    ctx.translate(base.x, base.y);
    ctx.rotate(ang);
    ctx.scale(pxPerM * fatten, -pxPerM); // metres → px, +y up (x fattened for slender stacks)

    // ink outline: a constant ~1.6 px on screen. The ctx is scaled by pxPerM,
    // so the world-space line width must be 1.6/pxPerM — NOT tied to _mpp, which
    // decouples from pxPerM once the MIN_PX size floor kicks in (that mismatch
    // was ballooning every part's outline into a 60 px smear).
    var lw = 1.8 / pxPerM;

    // exhaust flame first (under the stack) — procedural teardrop, additive
    var lift = Math.max(st.thrust, st.buoyancy);
    if (lift > 1 && !this._crashed(st) && st.thrust > 0.5) {
      var thr = clamp(lift / Math.max(1, this._maxThrust()), 0.22, 1.1);
      var flick = 0.86 + 0.14 * Math.sin(this._flameT * 47) + (Math.random() - 0.5) * 0.1;
      // scale off the airframe, not the full stack (a 6 m tail stick used to
      // inflate this into a screen-filling wedge)
      var fs = this.bodyH || this.rocketH || 2;
      var flH = Math.min(fs * 2.0, fs * (0.5 + thr * 1.3)) * flick;
      var flW = fs * (0.16 + thr * 0.12);
      var ny = this.nozzleY;                       // rocket-local nozzle (≈0)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // outer orange plume
      var go = ctx.createLinearGradient(0, ny, 0, ny - flH);
      go.addColorStop(0, 'rgba(255,180,60,0.9)');
      go.addColorStop(0.55, 'rgba(255,110,30,0.6)');
      go.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = go;
      ctx.beginPath();
      ctx.moveTo(-flW, ny);
      ctx.quadraticCurveTo(-flW * 0.5, ny - flH * 0.75, 0, ny - flH);
      ctx.quadraticCurveTo(flW * 0.5, ny - flH * 0.75, flW, ny);
      ctx.quadraticCurveTo(0, ny + flW * 0.5, -flW, ny);
      ctx.closePath(); ctx.fill();
      // inner white-hot core
      var gc = ctx.createLinearGradient(0, ny, 0, ny - flH * 0.6);
      gc.addColorStop(0, 'rgba(255,250,225,0.95)');
      gc.addColorStop(1, 'rgba(255,230,150,0)');
      ctx.fillStyle = gc;
      ctx.beginPath();
      ctx.moveTo(-flW * 0.5, ny);
      ctx.quadraticCurveTo(-flW * 0.25, ny - flH * 0.45, 0, ny - flH * 0.6);
      ctx.quadraticCurveTo(flW * 0.25, ny - flH * 0.45, flW * 0.5, ny);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    var self = this;
    this.parts.forEach(function (p) {
      ctx.lineWidth = lw;
      ctx.strokeStyle = CAT_INK[p.cat] || '#333';
      ctx.fillStyle = CAT_FILL[p.cat] || '#bbb';
      if (p.tail) {
        // the long bamboo หาง — a thin pole lashed alongside the body, running
        // far below the nozzle. Drawn slim so it reads as a stabiliser stick,
        // not a second airframe.
        var tw = Math.max(0.06, p.w * 0.16);
        ctx.fillStyle = '#b98d55';
        ctx.strokeStyle = '#6b4c2c';
        self._roundRect(ctx, p.x - tw / 2, p.yBot, tw, p.h, tw * 0.5);
        ctx.fill(); ctx.stroke();
        // rope lashings where it ties to the body
        ctx.strokeStyle = 'rgba(60,42,24,0.75)';
        for (var lt = 0.55; lt < 0.95; lt += 0.16) {
          var ly = p.yBot + p.h * lt;
          ctx.beginPath();
          ctx.moveTo(p.x - p.w * 0.5, ly); ctx.lineTo(p.x + tw, ly);
          ctx.stroke();
        }
        return;
      }
      if (p.fin) {
        // triangular fin, flush to body, pointing down-out
        var side = p.x >= 0 ? 1 : -1;
        var bx = p.x - side * p.w * 0.5;
        ctx.beginPath();
        ctx.moveTo(bx, p.yBot + p.h);
        ctx.lineTo(bx, p.yBot + p.h * 0.15);
        ctx.lineTo(bx + side * p.w * 1.1, p.yBot);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        return;
      }
      if (p.nose) {
        ctx.beginPath();
        ctx.moveTo(p.x - p.w / 2, p.yBot);
        ctx.lineTo(p.x + p.w / 2, p.yBot);
        ctx.lineTo(p.x, p.yBot + p.h);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        return;
      }
      self._roundRect(ctx, p.x - p.w / 2, p.yBot, p.w, p.h, Math.min(p.w, p.h) * 0.18);
      ctx.fill(); ctx.stroke();
    });
    ctx.restore();
  };

  // ---- the shared part-silhouette stack : catalog · blueprint · flight -------
  // Draws vehicle.instances via RS.render.PartArt so the flying craft is the
  // SAME picture set as the catalog thumbnails and the blueprint canvas.
  P._drawStackPA = function (ctx, st, base, PA) {
    var buoy = this.buoy;
    var crashed = this._crashed(st);
    var dead = buoy && this.t > 1.5 && !(st.buoyancy > 0.05);   // wax spent — dull, no flame
    var bH = this.bodyH || this.rocketH || 2;

    var ang, bobPx = 0;
    if (buoy) {
      ang = Math.sin(this.t * 1.15) * 0.05 + Math.sin(this.t * 0.55 + 1) * 0.025;
      bobPx = Math.sin(this.t * 0.9) * 3;
    } else {
      ang = (90 - (st.pitch != null ? st.pitch : 90)) * Math.PI / 180;
      if (st.tumbling) ang += Math.sin(this.t * 6) * 0.5 + (st.roll || 0) * Math.PI / 180;
    }

    // ============================ LANTERN =====================================
    // The build grid stacks a narrow envelope over a candle + tag. A real khom
    // loy is a big wide paper envelope with a short candle-cross tucked at the
    // mouth — so compose it from the SAME PartArt shapes, in lantern proportions.
    if (buoy) {
      var envPart = null, envPartH = 1, stem = [];
      this.parts.forEach(function (p) {
        var pp = p.part || { id: p.id, category: p.cat };
        if (PA.kindOf(pp) === 'envelope') { if (!envPart || p.h > envPartH) { envPart = pp; envPartH = p.h; } }
        else stem.push({ pp: pp, kind: PA.kindOf(pp) });
      });
      var eH = clamp(envPart ? envPartH : 1, 0.7, 2.4) * 150;   // px, ~150 for a 1 m envelope
      var eW = eH * 1.18;
      var hot = clamp((st.buoyancy || 0) / Math.max(1, this._maxThrust()), 0, 1);

      ctx.save();
      ctx.translate(base.x, base.y + bobPx);
      ctx.rotate(ang);

      // warm light it throws — a soft halo centred on the envelope
      if (!dead && !crashed) {
        var lr = eH * 1.0, lcy = -eH * 0.5;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        var lg = ctx.createRadialGradient(0, lcy, 0, 0, lcy, lr);
        lg.addColorStop(0, 'rgba(255,196,110,' + (0.16 + 0.12 * hot).toFixed(3) + ')');
        lg.addColorStop(0.5, 'rgba(255,178,86,' + (0.06 + 0.05 * hot).toFixed(3) + ')');
        lg.addColorStop(1, 'rgba(255,170,70,0)');
        ctx.fillStyle = lg;
        ctx.fillRect(-lr, lcy - lr, lr * 2, lr * 2);
        ctx.restore();
      }

      // the paper envelope (draws its own bamboo mouth ring + flame)
      PA.draw(ctx, envPart || { id: 'cover_paper', category: 'Aerodynamics' },
              -eW / 2, -eH, eW, eH, { dim: dead });

      // A khom loy is almost entirely paper. The fuel cell shows as a small
      // bright core right in the mouth; only the wish tag hangs free on a thread.
      var mouthY = -eH * 0.06;
      stem.forEach(function (s) {
        if (s.kind === 'tag') {
          ctx.strokeStyle = 'rgba(90,60,35,0.5)'; ctx.lineWidth = Math.max(1, eH * 0.012);
          ctx.beginPath();
          ctx.moveTo(0, mouthY);
          ctx.lineTo(eW * 0.03, mouthY + eH * 0.14);
          ctx.stroke();
          PA.draw(ctx, s.pp, -eW * 0.085, mouthY + eH * 0.12, eW * 0.19, eH * 0.16, { dim: dead });
        } else if (s.kind !== 'hoop') {             // fuel cell / candle — in the opening
          PA.draw(ctx, s.pp, -eW * 0.07, mouthY - eH * 0.05, eW * 0.14, eH * 0.1, { dim: dead });
        }
      });

      ctx.restore();
      return;
    }
    // ============================ ROCKET ======================================
    var MIN_PX = 54;
    var pxPerM = Math.max(1 / this._mpp, MIN_PX / Math.max(1, bH));
    var fatten = clamp(15 / Math.max(1e-3, (this.bodyW || 0.5) * pxPerM), 1, 4.5);

    // tracking glow when the rocket is genuinely dwarfed by the zoom
    var tiny = pxPerM > (1 / this._mpp) * 2.2;
    if (tiny && st.thrust <= 0.5) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var gr = MIN_PX * 1.1;
      var gg = ctx.createRadialGradient(base.x, base.y, 0, base.x, base.y, gr);
      gg.addColorStop(0, 'rgba(255,225,170,0.28)');
      gg.addColorStop(1, 'rgba(255,225,170,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(base.x - gr, base.y - gr, gr * 2, gr * 2);
      ctx.restore();
    }

    // NB: PartArt draws in PIXEL space (its stroke-width floors assume it), so
    // we translate + rotate but do NOT scale the ctx — every part is positioned
    // and sized in screen px, +y DOWN so the silhouettes come out upright.
    var sx = pxPerM * fatten, sy = pxPerM;   // px per metre, per axis
    ctx.save();
    ctx.translate(base.x, base.y + bobPx);
    ctx.rotate(ang);

    // exhaust flame first, under the stack — procedural teardrop
    var lift = Math.max(st.thrust, st.buoyancy);
    if (lift > 1 && !crashed && st.thrust > 0.5) {
      var thr = clamp(lift / Math.max(1, this._maxThrust()), 0.22, 1.1);
      var flick = 0.86 + 0.14 * Math.sin(this._flameT * 47) + (Math.random() - 0.5) * 0.1;
      var flH = Math.min(bH * 2.0, bH * (0.5 + thr * 1.3)) * flick * sy;
      var flW = bH * (0.16 + thr * 0.12) * sx;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var go = ctx.createLinearGradient(0, 0, 0, flH);
      go.addColorStop(0, 'rgba(255,180,60,0.9)');
      go.addColorStop(0.55, 'rgba(255,110,30,0.6)');
      go.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = go;
      ctx.beginPath();
      ctx.moveTo(-flW, 0);
      ctx.quadraticCurveTo(-flW * 0.5, flH * 0.75, 0, flH);
      ctx.quadraticCurveTo(flW * 0.5, flH * 0.75, flW, 0);
      ctx.quadraticCurveTo(0, -flW * 0.5, -flW, 0);
      ctx.closePath(); ctx.fill();
      var gc = ctx.createLinearGradient(0, 0, 0, flH * 0.6);
      gc.addColorStop(0, 'rgba(255,250,225,0.95)');
      gc.addColorStop(1, 'rgba(255,230,150,0)');
      ctx.fillStyle = gc;
      ctx.beginPath();
      ctx.moveTo(-flW * 0.5, 0);
      ctx.quadraticCurveTo(-flW * 0.25, flH * 0.45, 0, flH * 0.6);
      ctx.quadraticCurveTo(flW * 0.25, flH * 0.45, flW * 0.5, 0);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // the stack — one part → one silhouette (screen px, bottom-anchored)
    this.parts.forEach(function (p) {
      var part = p.part || { id: p.id, category: p.cat };
      PA.draw(ctx, part,
              p.x * sx - (p.w * sx) / 2, -(p.yBot + p.h) * sy, p.w * sx, p.h * sy,
              { dim: dead, alpha: dead ? 0.92 : 1 });
    });

    ctx.restore();
  };

  // ------------------------------------------- the rest of the village's khom loy
  // Same paper silhouette as the hero (RS.render.PartArt envelope), just small,
  // hazed by depth, and carrying its own warm glow + flame spark.
  P._drawCompanions = function (ctx) {
    var t = this.t, list = this._companions;
    var PA = RS.render.PartArt;
    var COMP_PART = { id: 'cover_paper', category: 'Aerodynamics' };
    ctx.save();
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      var wy = c.y0 + c.rise * t;
      if (wy < -20) continue;
      var sway = Math.sin(t * 0.5 + c.phase) * c.swayA;
      var p = this._w2s(c.x + sway, wy);
      var R = clamp((0.9 * c.scale) / this._mpp, 3, 30);
      if (p.x < -R * 4 || p.x > this.W + R * 4 || p.y < -R * 4 || p.y > this.H + R * 4) continue;
      // depth haze: the small/far ones are dimmer and cooler
      var far = clamp((1 - c.scale) * 0.55, 0, 0.5);
      // glow
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R * 2.8);
      g.addColorStop(0, 'rgba(255,' + (180 - far * 60 | 0) + ',90,' + (0.42 - far * 0.5).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,170,80,0)');
      ctx.fillStyle = g;
      ctx.fillRect(p.x - R * 2.8, p.y - R * 2.8, R * 5.6, R * 5.6);
      ctx.restore();
      // the paper — shared silhouette, tinted down for the far ones
      ctx.globalAlpha = 0.9 - far;
      if (PA) {
        PA.draw(ctx, COMP_PART, p.x - R, p.y - R * 1.25, R * 2, R * 2.5, { dim: true });
      } else {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - R * 1.3);
        ctx.bezierCurveTo(p.x + R * 1.05, p.y - R, p.x + R * 0.95, p.y + R * 0.5, p.x + R * 0.5, p.y + R * 1.05);
        ctx.lineTo(p.x - R * 0.5, p.y + R * 1.05);
        ctx.bezierCurveTo(p.x - R * 0.95, p.y + R * 0.5, p.x - R * 1.05, p.y - R, p.x, p.y - R * 1.3);
        ctx.closePath();
        var body = ctx.createLinearGradient(0, p.y - R * 1.3, 0, p.y + R * 1.1);
        body.addColorStop(0, 'rgba(255,228,168,' + c.warm.toFixed(2) + ')');
        body.addColorStop(1, 'rgba(255,150,80,' + (c.warm * 0.9).toFixed(2) + ')');
        ctx.fillStyle = body;
        ctx.fill();
      }
      // a spark of flame at the mouth
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.9 - far;
      ctx.fillStyle = 'rgba(255,240,200,0.9)';
      ctx.beginPath(); ctx.arc(p.x, p.y + R * 0.95, R * 0.26, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  };

  // ------------------------------------ the fire a fallen khom loy started
  P._drawGroundFire = function (ctx) {
    var gf = this._groundFire;
    var g0 = this._w2s(gf.x, 0);
    if (g0.x < -80 || g0.x > this.W + 80) return;
    var grow = smooth(clamp(gf.t / 2.2, 0, 1)) * (0.6 + 0.4 * gf.peak);
    // fixed screen size — the lantern camera zoom is very wide, so an
    // mpp-scaled fire would be a couple of pixels
    var baseW = 50 * (0.5 + grow);
    var flH = baseW * (1.9 + 0.5 * Math.sin(gf.t * 9));
    var fx = g0.x;
    var fy = Math.min(g0.y - baseW * 0.7, this.H - 12);   // sit at the resting lantern's base

    // scorched ground + glow pool
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var pool = ctx.createRadialGradient(fx, fy, 0, fx, fy, baseW * 2.4);
    pool.addColorStop(0, 'rgba(255,150,60,' + (0.32 * grow).toFixed(3) + ')');
    pool.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = pool;
    ctx.fillRect(fx - baseW * 2.4, fy - baseW * 2.4, baseW * 4.8, baseW * 4.8);
    ctx.restore();

    // a few flame tongues
    var tongues = 4;
    for (var i = 0; i < tongues; i++) {
      var off = (i - (tongues - 1) / 2) * baseW * 0.42;
      var wob = Math.sin(gf.t * (7 + i * 2) + i) * baseW * 0.16;
      var hh = flH * (0.6 + 0.5 * Math.abs(Math.sin(gf.t * 4 + i * 1.7)));
      var fg = ctx.createLinearGradient(0, fy, 0, fy - hh);
      fg.addColorStop(0, 'rgba(255,190,70,0.95)');
      fg.addColorStop(0.5, 'rgba(255,110,35,0.75)');
      fg.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(fx + off - baseW * 0.24, fy);
      ctx.quadraticCurveTo(fx + off + wob - baseW * 0.1, fy - hh * 0.6, fx + off + wob, fy - hh);
      ctx.quadraticCurveTo(fx + off + wob + baseW * 0.1, fy - hh * 0.6, fx + off + baseW * 0.24, fy);
      ctx.closePath();
      ctx.fill();
    }
    // white-hot base
    ctx.fillStyle = 'rgba(255,246,210,' + (0.8 * grow).toFixed(2) + ')';
    ctx.beginPath();
    ctx.ellipse(fx, fy, baseW * 0.5, baseW * 0.2, 0, 0, TAU);
    ctx.fill();

    // smoke column drifting with the wind
    var puffs = 5;
    for (var p2 = 0; p2 < puffs; p2++) {
      var age = ((gf.t * 0.5 + p2 / puffs) % 1);
      var sy2 = fy - age * baseW * 5.5 - flH;
      var sx2 = fx + age * baseW * 1.6 + Math.sin(gf.t + p2) * baseW * 0.3;
      var sr = baseW * (0.4 + age * 1.3);
      ctx.fillStyle = 'rgba(50,44,42,' + ((1 - age) * 0.28 * grow).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(sx2, sy2, sr, 0, TAU); ctx.fill();
    }
  };

  // ============================ NOTAM cutscene ==============================
  // The lantern drifted OUT of the no-fly zone. That airspace is a small
  // airfield's approach path — this watch-only beat shows a plane meeting the
  // festival's lanterns, then the LEGAL VIOLATION card, before the autopsy.
  P._startCutscene = function () {
    var lanterns = [];
    for (var i = 0; i < 20; i++) {
      lanterns.push({
        x: (Math.random() - 0.5) * this.W * 1.05,
        y0: this.H * (0.6 + Math.random() * 0.5),
        rise: this.H * (0.07 + Math.random() * 0.10),   // px/s
        s: 11 + Math.random() * Math.random() * 22,
        ph: Math.random() * TAU,
        hit: 0
      });
    }
    this._cutscene = { t: 0, lanterns: lanterns, planeY: this.H * 0.34, hits: 0, flash: 0 };
    // stow the flight HUD / toast / hint for the beat
    var root = this.root;
    this._hud = [root.querySelector('.f2-hud'), $('f2-toast'), root.querySelector('.f2-hint')];
    this._hud.forEach(function (el) { if (el) el.style.visibility = 'hidden'; });
    if (this.sound && this.sound.play) { try { this.sound.play('ignite', 0.4); } catch (e) {} }
  };

  P._advanceCutscene = function (dt) {
    var cs = this._cutscene;
    cs.t += dt;
    if (!this.cur) this.cur = this._sample(this.dur);
    var ctx = this.ctx, W = this.W, H = this.H, T = cs.t;
    // still the night sky behind it
    this._drawSky(ctx, W, H, 200);
    this._drawGround(ctx, W, H);

    // plane crosses left → right, entering at ~0.6 s, mid-screen at ~3.5 s
    var px = lerp(-W * 0.2, W * 1.2, clamp((T - 0.5) / 5.5, 0, 1));
    var bank = 0;

    // rising festival lanterns
    ctx.save();
    for (var i = 0; i < cs.lanterns.length; i++) {
      var L = cs.lanterns[i];
      var ly = L.y0 - L.rise * T;
      var lx = W / 2 + L.x + Math.sin(T * 0.8 + L.ph) * 10;
      // collision when the plane sweeps over a lantern near its altitude
      if (!L.hit && T > 1 && Math.abs(lx - px) < L.s * 2.4 && Math.abs(ly - cs.planeY) < H * 0.075) {
        L.hit = T; cs.hits++; cs.flash = 1; this._shake = 1.1;
        if (this.sound && this.sound.play) { try { this.sound.play('liftoff', 0.5); } catch (e) {} }
      }
      var hitK = L.hit ? clamp((T - L.hit) / 0.5, 0, 1) : 0;
      if (hitK >= 1) continue;
      var R = L.s * (1 + hitK * 1.8);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var g = ctx.createRadialGradient(lx, ly, 0, lx, ly, R * 2.6);
      g.addColorStop(0, 'rgba(255,' + (hitK ? 120 : 185) + ',90,' + (0.55 * (1 - hitK)).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,170,80,0)');
      ctx.fillStyle = g; ctx.fillRect(lx - R * 2.6, ly - R * 2.6, R * 5.2, R * 5.2);
      ctx.restore();
      var PA = RS.render.PartArt;
      ctx.globalAlpha = 1 - hitK;
      if (PA && !hitK) PA.draw(ctx, { id: 'cover_paper', category: 'Aerodynamics' },
        lx - R, ly - R * 1.2, R * 2, R * 2.4, {});
      else { ctx.fillStyle = 'rgba(255,150,80,' + (1 - hitK) + ')'; ctx.beginPath(); ctx.arc(lx, ly, R, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // shake
    ctx.save();
    if (this._shake > 0) { var s = this._shake * 8; ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s); this._shake *= Math.pow(0.02, dt); if (this._shake < 0.05) this._shake = 0; }
    bank = cs.hits ? Math.sin(T * 18) * 0.08 * clamp(1.5 - (T - 3), 0, 1) : 0;
    this._drawPlane(ctx, px, cs.planeY, Math.min(W, H) * 0.06, bank);
    ctx.restore();

    // red danger flash
    if (cs.flash > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,40,30,' + (cs.flash * 0.35).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      cs.flash = Math.max(0, cs.flash - dt * 1.6);
    }

    // label early, verdict card after the pass
    ctx.textAlign = 'center';
    if (T < 3.2) {
      ctx.globalAlpha = clamp(1.4 - Math.abs(T - 1.6), 0, 1);
      ctx.fillStyle = '#ffd24a';
      ctx.font = '600 ' + Math.round(H * 0.03) + 'px system-ui, sans-serif';
      ctx.fillText('เขตห้ามบิน · NOTAM — รัศมี ' + Math.round(this._notamRadius) + ' ม.', W / 2, H * 0.12);
      ctx.globalAlpha = 1;
    }
    if (T > 4.6) {
      var k = clamp((T - 4.6) / 0.7, 0, 1);
      ctx.fillStyle = 'rgba(6,8,16,' + (0.82 * k).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = k;
      ctx.fillStyle = '#ff5a4a';
      ctx.font = '800 ' + Math.round(H * 0.06) + 'px system-ui, sans-serif';
      ctx.fillText('⚠ LEGAL VIOLATION', W / 2, H * 0.4);
      ctx.fillStyle = '#e8eef7';
      ctx.font = '600 ' + Math.round(H * 0.032) + 'px system-ui, sans-serif';
      ctx.fillText('โคมลอยหลุดเขตห้ามบิน เข้าเส้นทางร่อนลงของสนามบิน', W / 2, H * 0.5);
      ctx.fillStyle = '#9db4d8';
      ctx.font = '400 ' + Math.round(H * 0.026) + 'px system-ui, sans-serif';
      ctx.fillText('ปล่อยโคมช่วงเทศกาลต้องยื่นขอ NOTAM ล่วงหน้า กำหนดพื้นที่และเพดานบิน', W / 2, H * 0.57);
      ctx.fillText('ถ่วงน้ำหนักโคมให้พอดี อย่าให้ลมพัดหลุดเขต', W / 2, H * 0.61);
      ctx.fillStyle = '#6f8099';
      ctx.font = '400 ' + Math.round(H * 0.022) + 'px system-ui, sans-serif';
      ctx.fillText('แตะเพื่อดูผลการบิน', W / 2, H * 0.72);
      ctx.globalAlpha = 1;
    }

    if (T > 8.5) this._endCutscene();
  };

  P._endCutscene = function () {
    this._cutscene = null;
    this._cutsceneDone = true;
    this._shake = 0;
    (this._hud || []).forEach(function (el) { if (el) el.style.visibility = ''; });
  };

  P._drawPlane = function (ctx, x, y, s, bank) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(bank || 0);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(2, s * 0.11);
    ctx.strokeStyle = '#1c2029';
    // tail fin
    ctx.beginPath();
    ctx.moveTo(-s * 1.15, -s * 0.05);
    ctx.lineTo(-s * 1.7, -s * 1.0);
    ctx.lineTo(-s * 0.95, -s * 0.35);
    ctx.closePath();
    ctx.fillStyle = '#f0b93e'; ctx.fill(); ctx.stroke();
    // far wing
    ctx.beginPath();
    ctx.moveTo(-s * 0.05, -s * 0.05);
    ctx.lineTo(-s * 0.7, -s * 1.05);
    ctx.lineTo(s * 0.55, -s * 0.8);
    ctx.closePath();
    ctx.fillStyle = '#d99a2f'; ctx.fill(); ctx.stroke();
    // fuselage
    ctx.fillStyle = '#e8534e';
    ctx.beginPath();
    ctx.moveTo(-s * 1.5, 0);
    ctx.quadraticCurveTo(-s * 1.5, -s * 0.44, -s * 0.15, -s * 0.5);
    ctx.lineTo(s * 1.1, -s * 0.3);
    ctx.quadraticCurveTo(s * 1.75, -s * 0.12, s * 1.75, 0);
    ctx.quadraticCurveTo(s * 1.75, s * 0.12, s * 1.1, s * 0.3);
    ctx.lineTo(-s * 0.15, s * 0.5);
    ctx.quadraticCurveTo(-s * 1.5, s * 0.44, -s * 1.5, 0);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // near wing
    ctx.beginPath();
    ctx.moveTo(-s * 0.05, s * 0.08);
    ctx.lineTo(-s * 0.75, s * 1.15);
    ctx.lineTo(s * 0.7, s * 0.95);
    ctx.closePath();
    ctx.fillStyle = '#f0b93e'; ctx.fill(); ctx.stroke();
    // windows
    ctx.fillStyle = '#8fd3f4';
    for (var i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.arc(-s * 0.55 + i * s * 0.42, -s * 0.04, s * 0.13, 0, TAU);
      ctx.fill(); ctx.stroke();
    }
    // nose + prop
    ctx.fillStyle = '#1c2029';
    ctx.beginPath(); ctx.arc(s * 1.5, 0, s * 0.22, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(28,32,41,0.45)'; ctx.lineWidth = s * 0.13;
    ctx.beginPath(); ctx.moveTo(s * 1.5, -s * 0.7); ctx.lineTo(s * 1.5, s * 0.7); ctx.stroke();
    ctx.restore();
  };

  // ------------------------------------------------------ the khom loy itself
  P._drawLantern = function (ctx, st, base) {
    // hot-air lantern: a glowing sa-paper onion, an open mouth with a flame,
    // a wish-tag swinging below. Drawn in screen space at a readable size that
    // does not depend on the (wide, near-fixed) lantern camera zoom.
    var hot = clamp((st.buoyancy || 0) / Math.max(1, this._maxThrust()), 0, 1);
    var alive = st.buoyancy > 0.05 && !this._crashed(st);
    var t = this.t;
    var sway = Math.sin(t * 1.3) * 0.12 + Math.sin(t * 0.6 + 1) * 0.06;   // gentle drift
    var bob = Math.sin(t * 0.9) * 0.5;
    var Rpx = clamp(1.1 / this._mpp, 26, 46);      // envelope radius on screen
    var cx = base.x + sway * Rpx * 0.6;
    var cy = base.y - Rpx * 0.7 + bob;             // envelope centre above the mouth

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(sway * 0.5);

    // warm light it casts
    if (alive) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var gl = ctx.createRadialGradient(0, Rpx * 0.2, 0, 0, Rpx * 0.2, Rpx * 3.4);
      gl.addColorStop(0, 'rgba(255,190,90,' + (0.22 + 0.16 * hot).toFixed(3) + ')');
      gl.addColorStop(1, 'rgba(255,170,70,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(-Rpx * 3.4, -Rpx * 3.4, Rpx * 6.8, Rpx * 6.8);
      ctx.restore();
    }

    // the paper onion — rounded dome, shoulders, tapering to the mouth
    var topY = -Rpx * 1.35, mouthY = Rpx * 1.15, mouthW = Rpx * 0.62;
    ctx.beginPath();
    ctx.moveTo(0, topY);
    ctx.bezierCurveTo(Rpx * 1.15, topY + Rpx * 0.15, Rpx * 1.05, Rpx * 0.35, mouthW, mouthY);
    ctx.lineTo(-mouthW, mouthY);
    ctx.bezierCurveTo(-Rpx * 1.05, Rpx * 0.35, -Rpx * 1.15, topY + Rpx * 0.15, 0, topY);
    ctx.closePath();
    var body = ctx.createLinearGradient(0, topY, 0, mouthY);
    if (alive) {
      body.addColorStop(0, '#ffe4a6');
      body.addColorStop(0.55, '#ffb765');
      body.addColorStop(1, '#ff8f43');
    } else {
      body.addColorStop(0, '#d9c9a8'); body.addColorStop(1, '#b59a72');   // cooled — dull
    }
    ctx.fillStyle = body;
    ctx.shadowColor = alive ? 'rgba(255,170,80,0.9)' : 'transparent';
    ctx.shadowBlur = alive ? Rpx * 0.9 : 0;
    ctx.fill();
    ctx.shadowBlur = 0;
    // paper ribs
    ctx.strokeStyle = 'rgba(150,90,40,0.35)';
    ctx.lineWidth = Math.max(1, Rpx * 0.05);
    for (var r = -1; r <= 1; r++) {
      ctx.beginPath();
      ctx.moveTo(r * Rpx * 0.5, topY + Rpx * 0.2);
      ctx.quadraticCurveTo(r * Rpx * 1.0, 0, r * mouthW * 0.8, mouthY);
      ctx.stroke();
    }
    // rim of the mouth
    ctx.strokeStyle = 'rgba(120,70,30,0.7)';
    ctx.lineWidth = Math.max(1, Rpx * 0.07);
    ctx.beginPath(); ctx.moveTo(-mouthW, mouthY); ctx.lineTo(mouthW, mouthY); ctx.stroke();

    // the flame at the mouth
    if (alive) {
      var fl = Rpx * (0.32 + 0.22 * hot) * (0.9 + 0.1 * Math.sin(t * 22));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var fg = ctx.createRadialGradient(0, mouthY + fl * 0.3, 0, 0, mouthY + fl * 0.3, fl * 1.6);
      fg.addColorStop(0, 'rgba(255,246,214,0.95)');
      fg.addColorStop(0.5, 'rgba(255,170,60,0.7)');
      fg.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.ellipse(0, mouthY + fl * 0.2, fl * 0.7, fl, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // wish-tag on a thread
    ctx.strokeStyle = 'rgba(90,60,35,0.6)';
    ctx.lineWidth = Math.max(1, Rpx * 0.04);
    var tagY = mouthY + Rpx * 0.9, tagX = sway * Rpx * 1.4;
    ctx.beginPath(); ctx.moveTo(0, mouthY); ctx.lineTo(tagX, tagY); ctx.stroke();
    ctx.fillStyle = alive ? '#fff2d8' : '#e8ddc8';
    ctx.save();
    ctx.translate(tagX, tagY); ctx.rotate(sway);
    ctx.fillRect(-Rpx * 0.16, 0, Rpx * 0.32, Rpx * 0.42);
    ctx.strokeStyle = 'rgba(160,40,40,0.5)';
    ctx.strokeRect(-Rpx * 0.16, 0, Rpx * 0.32, Rpx * 0.42);
    ctx.restore();

    ctx.restore();
  };

  P._crashed = function (st) {
    return st.altitude <= 0.05 && this.t > 0.5 && (this.sim.summary && this.t >= this.sim.summary.flightTime - 0.3);
  };
  P._maxThrust = function () {
    if (this._mt != null) return this._mt;
    var m = 1;
    for (var i = 0; i < this.traj.length; i++) m = Math.max(m, this.traj[i].thrust || 0, this.traj[i].buoyancy || 0);
    this._mt = m; return m;
  };

  P._roundRect = function (ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  // ------------------------------------------------------------------- HUD
  P._phase = function (st) {
    if (this.t >= this.dur - 0.05) return 'done';
    if (st.padLocked || (st.altitude < 2 && Math.abs(st.velocity) < 1.5)) return 'prelaunch';
    if (st.altitude > 45000) return 'space';
    if (st.velocity > 1) return 'ascent';
    if (st.velocity < -1) return 'descent';
    return 'coast';
  };

  P._updateHud = function (st) {
    var set = function (id, v) { var el = $(id); if (el) el.textContent = v; };
    set('f2-time', 'T+ ' + this.t.toFixed(1) + ' s');
    set('f2-alt', fmtM(st.altitude));
    // headline "speed" = VERTICAL rate with a direction arrow, so "is it
    // climbing?" is answered at a glance (total speed hid a stalled apogee
    // behind 50 m/s of sideways drift)
    var vv = st.velocity || 0;
    if (this.toSpace && st.altitude > 40000) {
      // above the atmosphere the number that matters is total (orbital) speed,
      // not the tiny radial rate — an ▲/▼ on a stable orbit just looks broken
      set('f2-vel', Math.round(st.speed || Math.abs(vv)) + ' m/s');
    } else {
      var arrow = vv > 1 ? ' ▲' : (vv < -1 ? ' ▼' : '');
      set('f2-vel', Math.round(Math.abs(vv)) + ' m/s' + arrow);
    }
    this._vmax = Math.max(this._vmax || 0, st.speed || Math.abs(st.velocity));
    set('f2-vmax', Math.round(this._vmax) + ' m/s');
    set('f2-drift', fmtM(Math.abs(st.drift || 0)));
    var mg = st.mass < 1 ? Math.round(st.mass * 1000) + ' g' : st.mass.toFixed(1) + ' kg';
    set('f2-mass', mg);

    var ph = this._phase(st);
    var pe = $('f2-phase');
    if (pe) { pe.textContent = PHASE_TH[ph] || ph; }

    // throttle bar
    var tb = $('f2-throttle-fill');
    if (tb) {
      var thr = clamp(Math.max(st.thrust, st.buoyancy) / this._maxThrust(), 0, 1);
      tb.style.width = (thr * 100).toFixed(0) + '%';
    }
    // scrub
    var sc = $('f2-scrub');
    if (sc && document.activeElement !== sc) sc.value = Math.round((this.t / this.dur) * 1000);
  };

  // ----------------------------------------------------------- transport
  P._togglePlay = function () {
    if (this.t >= this.dur) { this._restart(); return; }
    this.playing = !this.playing;
    this._last = performance.now();
    this._syncPlayBtn();
    this._hideAutopsy();
  };
  P._syncPlayBtn = function () {
    var b = $('f2-play');
    if (b) b.textContent = this.playing ? '❚❚' : '▶';
  };
  P._restart = function () {
    this.t = 0; this.playing = true; this._last = performance.now();
    this.smoke = []; this.bursts = []; this._lastEvIdx = -1; this._shake = 0;
    this._vmax = 0; this._autopsyShown = false;
    this._groundFire = null; this._cutscene = null; this._cutsceneDone = false;
    this._mpp = this._mpp0 || 0.04;
    this._camX = 0; this._camY = (this.bodyH || 3) * 0.5;
    this._camSeed = false;
    this._syncPlayBtn();
    this._hideAutopsy();
  };
  P._cycleRate = function () {
    var order = [0.5, 1, 2, 4, 8, 16];
    var idx = order.indexOf(this.rate);
    this.rate = order[(idx + 1) % order.length];
    var b = $('f2-rate'); if (b) b.textContent = this.rate + '×';
  };

  // ----------------------------------------------------------- autopsy
  P._hideAutopsy = function () { var a = $('f2-autopsy'); if (a) a.hidden = true; };
  P._showAutopsy = function () {
    this._autopsyShown = true;
    var a = $('f2-autopsy');
    if (!a) return;
    var s = this.sim.summary || {};
    var rows = [
      ['ยอดสูงสุด', fmtM(s.apogee)],
      ['ความเร็วสูงสุด', Math.round(s.maxVelocity || 0) + ' m/s'],
      ['เวลาบินรวม', (s.flightTime || 0).toFixed(1) + ' s'],
      ['ลอยไกลสุด', fmtM(s.maxDrift || s.downrange || 0)]
    ];
    if (this.fw && s.burst) rows.push(['ระดับที่พลุแตก', fmtM(s.burst.altitude || 0)]);
    var grid = $('f2-ap-stats');
    if (grid) grid.innerHTML = rows.map(function (r) {
      return '<div class="f2-ap-cell"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>';
    }).join('');

    var dl = $('f2-ap-diag');
    if (dl) {
      var extra = '';
      if (this._groundFire) extra += '<li><span class="f2-chip FAIL">FAIL</span><span>' +
        'โคมตกทั้งที่เปลวเทียนยังติด → ไฟไหม้พื้น — โคมลอยเป็นเหตุเพลิงไหม้ที่พบบ่อยในเทศกาล</span></li>';
      if (this._cutsceneDone) extra += '<li><span class="f2-chip FAIL">FAIL</span><span>' +
        'โคมหลุดเขต NOTAM เข้าห้วงอากาศสนามบิน — ต้องยื่นขออนุญาต/กำหนดเพดานก่อนปล่อย</span></li>';
      dl.innerHTML = extra + (this.sim.diagnostics || []).map(function (d) {
        return '<li><span class="f2-chip ' + d.status + '">' + d.status + '</span>' +
          '<span>' + esc(d.message) + (d.detail ? ' — ' + esc(d.detail) : '') + '</span></li>';
      }).join('');
    }

    var v = $('f2-ap-verdict');
    var mr = this.opts.missionResult;
    if (v) {
      if (mr && mr.mission) {
        v.hidden = false;
        v.className = 'f2-ap-verdict ' + (mr.passed ? 'pass' : 'fail');
        v.innerHTML = (mr.passed ? '✔ ภารกิจสำเร็จ · +' + mr.score + ' คะแนน'
          : '✕ ภารกิจล้มเหลว — ' + (mr.failReasons || []).map(esc).join(' · '));
      } else v.hidden = true;
    }
    a.hidden = false;
  };

  RS.render.FlightScene2D = FlightScene2D;

})(window);
