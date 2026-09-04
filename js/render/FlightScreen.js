/* =============================================================================
 * FROM FIRE TO ORBIT — Render layer
 * js/render/FlightScreen.js  ·  the flight / replay screen
 *
 * Wires RS.render.FlightRenderer to a full-screen telemetry-review playback:
 *   · owns its own RS.render.Scene (sky, stars, ground, altitude rings)
 *   · builds the vehicle(s) with RS.render.VehicleRenderer
 *   · 5 playback camera modes — Observer / Chase / Free / Ground / Map
 *   · transport bar: play / pause / restart / rate / scrub + event tick markers
 *   · a live HUD driven purely off the SimulationResult contract
 *   · a Physics-Autopsy report card when playback ends
 *
 * Phase 11.5 — MULTI-VEHICLE. The screen now owns a fleet `this._vehicles[]`,
 * each a {FlightRenderer, group, trail, glow, sim, t0}. ONE master clock drives
 * them all; each renderer is pulled to `masterT - t0`. "จุดบั้งต่อไป" (Launch
 * Next) instantiates a fresh Bang Fai on the rail mid-flight while the earlier
 * rockets keep climbing / arcing / smoking. Camera + HUD follow the FOCUSED
 * vehicle (newest by default; cycle with the 🎯 button or the V key).
 *
 * ZERO physics. It only interpolates + plays back what core/ already computed.
 * If THREE is missing, `available` is false and open() is a safe no-op.
 * ===========================================================================*/
(function (global) {
  'use strict';

  var THREE = global.THREE;
  var RS = global.RS = global.RS || {};
  RS.render = RS.render || {};

  var LABEL_TH = {
    IGNITION: 'จุดไฟ',
    LIFTOFF:  'ทะยานพ้นพื้น',
    PITCH_OVER: 'เลี้ยวโค้ง',
    MECO:     'ดับเครื่องยนต์ (MECO)',
    MAX_Q:    'แรงดันอากาศสูงสุด',
    APOGEE:   'จุดสูงสุด',
    APOGEE_BREAKUP: 'แตกที่จุดสูงสุด',
    BURST:    'ลูกพลุแตก',
    DUD:      'ลูกพลุด้าน',
    BURNOUT:  'เชื้อเพลิงหมด',
    LOSS_OF_CONTROL: 'เสียการควบคุม',
    MIDAIR_BURN: 'โคมไฟไหม้กลางอากาศ',
    IMPACT:   'แตะพื้น'
  };
  var EVENT_COLOR = {
    IGNITION: '#e9f1ff', LIFTOFF: '#5fe0a8', PITCH_OVER: '#b98cff', MAX_Q: '#5bd6ff',
    MECO: '#ff9a5a', BURST: '#ffd24a', DUD: '#8891a5',
    BURNOUT: '#ffb63a', APOGEE: '#ffce40', APOGEE_BREAKUP: '#ff8a3a',
    LOSS_OF_CONTROL: '#ff3b3b', MIDAIR_BURN: '#ff7420', IMPACT: '#ff6a5a'
  };
  var UP = THREE ? new THREE.Vector3(0, 1, 0) : null;
  var RATES = [0.5, 1, 2, 4];

  // The launch site — the north pole of the globe (the pad sits at the world
  // origin). Orienting a real place to +Y puts that continent under the rocket
  // and lets the orbital-map POI raycaster frame it as "the launch site".
  var LAUNCH_LAT = 13.7, LAUNCH_LON = 100.5;   // ~Bangkok, Thailand

  // a soft additive halo sprite for the map POI markers
  function makeHaloSprite(hex) {
    if (!THREE || typeof document === 'undefined') return null;
    var s = 128, cv = document.createElement('canvas');
    cv.width = cv.height = s;
    var g = cv.getContext('2d');
    var grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    var c = hex || '255,120,90';
    grd.addColorStop(0.0, 'rgba(' + c + ',0.95)');
    grd.addColorStop(0.3, 'rgba(' + c + ',0.45)');
    grd.addColorStop(1.0, 'rgba(' + c + ',0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    var tex = new THREE.CanvasTexture(cv);
    return new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
  }
  // C key / the 🎥 button cycles these in order; a drag while an auto-tracking
  // rig is running hands control straight to 'free' (see the pointermove below)
  var CAM_MODES = ['observer', 'chase', 'free', 'ground', 'map'];
  var CAM_LABEL = {
    observer: 'ผู้ชมภาคพื้น', chase: 'ลอยตาม', free: 'อิสระ (คุมเอง)',
    ground: 'มุมแหงนพื้น', map: 'แผนที่วงโคจร'
  };
  var AUTO_CAM = { observer: 1, chase: 1, ground: 1 };   // rigs a drag breaks out of

  // ---- THE POETRY — philosophical Thai haiku on อนิจจัง (impermanence) -------
  var HAIKU = {
    release: ['ปล่อยมือจากเชือก', 'ลมกลางคืนพากลืนหาย', 'เหลือแสงกับฟากฟ้า'],
    encounter: ['พบพานกลางนภา', 'ดั่งดาราเพียงชั่วครู่', 'ลอยล่องแล้วจากไป'],
    burnout: ['แสงเทียนเริ่มริบหรี่', 'ลมราตรีพัดแผ่วเบา', 'คืนกลับสู่ผืนดิน'],
    burn: ['ลุกโชนสว่างจ้า', 'เผาผลาญสิ้นในพริบตา', 'เถ้าถ่านปลิวตามลม']
  };

  function $(id) { return document.getElementById(id); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function perfNow() {
    return (global.performance && global.performance.now)
      ? global.performance.now() : Date.now();
  }
  function fmtAlt(m) {
    if (m >= 1000) return (m / 1000).toFixed(2) + ' km';
    return (m < 10 ? m.toFixed(1) : Math.round(m)) + ' m';
  }
  function fmtMass(kg) {
    return kg < 1 ? Math.round(kg * 1000) + ' g' : kg.toFixed(2) + ' kg';
  }

  function FlightScreen() {
    this.available = !!THREE;

    this.root    = $('fs-overlay');
    this.canvas  = $('fs-canvas');
    this.elPhase = $('fs-phase');
    this.elTime  = $('fs-time');
    this.elAlt   = $('fs-alt');
    this.elVel   = $('fs-vel');
    this.elVmax  = $('fs-vmax');
    this.elMass  = $('fs-mass');
    this.elQ     = $('fs-q');
    this.elDrift = $('fs-drift');
    this.elToast = $('fs-toast');
    this.elVerdict = $('fs-autopsy-verdict');
    this.btnPlay = $('fs-play');
    this.btnRate = $('fs-rate');
    this.btnCam  = $('fs-cam');
    this.scrub   = $('fs-scrub');
    this.marks   = $('fs-marks');
    this.autopsy = $('fs-autopsy');
    this.btnIgnite = $('fs-ignite');        // Era-0: two-step 🔥 จุดไฟ → ปล่อยโคม
    this.btnLaunchNext = $('fs-launch-next'); // Era-1: จุดบั้งต่อไป (multi-vehicle)
    this.btnFocus = $('fs-focus');          // Era-1: cycle camera focus between rockets
    this.elHaiku = $('fs-haiku');           // the poetry overlay
    this.elLaunchSeq = $('fs-launchseq');   // Era-3: azimuth aim panel
    this.elAim = $('fs-aim');
    this.elAimVal = $('fs-aim-val');
    this.elAimHint = $('fs-aim-hint');
    this.elCountdown = $('fs-countdown');   // Era-3: T-10 countdown numerals

    // ---- Era 3 · V-2 ballistic launch --------------------------------
    this._v2 = false;
    this._azimuth = 90;            // deg — player-set heading; 90 = due east = target
    this._targetBearing = 90;      // deg — where the sea target actually is
    this._cd = 0;                  // seconds left on the countdown
    this._cdShown = null;          // last whole-second numeral rendered
    this._blastFX = [];            // live impact-explosion effects
    this._blasted = {};            // vehicle id → already detonated
    this._actx = null;             // lazy WebAudio context for countdown beeps
    this._targetZone = null;
    this._aimMarker = null;
    this._impactMarker = null;
    this._firingTable = null;

    // ---- Sky Atlas · fireworks (Phase 16) ---------------------------
    this._fw = false;
    this._fwBox = null;
    this._fwTargetBox = null;      // the glowing altitude bounding box
    this._fwBursts = [];           // live burst particle effects
    this._fwBursted = false;
    this._fwRetry = null;
    this._lastVerdict = null;

    // ---- sound (pooled sfx — ignite bed + liftoff whoosh) ---------------
    this._sound = RS.render.SoundFX ? new RS.render.SoundFX() : null;

    // ---- the fleet + one master clock ----------------------------------
    this._vehicles = [];        // [{id, flight, group, sim, t0, trail, glow, …}]
    this._focusIdx = 0;         // which vehicle the camera + HUD follow
    this._masterT = 0;          // seconds since the FIRST vehicle was released
    this._masterDur = 0;        // max( t0 + duration ) across the fleet
    this._playing = false;
    this._bangfai = false;      // is this an angled-rail Era-1 flight?
    this._canLaunchNext = false;
    this._simOpts = null;       // wind / NOTAM opts, reused for "launch next"
    this._sky = null;           // 'day' | 'night' | 'dusk'

    // ---- manual ignition / release gate (khom loy only) ------------------
    this._gate = null;                 // null | 'prelaunch' | 'igniting' | 'held'
    this._ignT = 0;
    this._liftoffTime = 0;
    this._igniteDur = 6;
    // ---- haiku queue ----------------------------------------------------
    this._haikuQueue = [];
    this._haikuActive = false;
    this._haikuFading = false;
    this._haikuTimer = 0;
    this._lastHaikuT = -1e9;

    // primary FlightRenderer handle — reassigned to the focused vehicle each
    // open(); kept here so the console handle / legacy readers never see null
    this.flight = new RS.render.FlightRenderer({ playbackRate: 1 });

    this.scene = null;
    this.vehicleGroup = null;
    this._built = false;
    this._raf = 0;
    this._last = 0;

    this._rateIdx = 1;
    this._camIdx = 1;              // default: chase
    this._theta = 0.7;
    this._phi = 1.12;
    this._zoom = 1;
    this._drag = null;
    this._freeTarget = new (THREE ? THREE.Vector3 : Object)();
    this._obsEye  = new (THREE ? THREE.Vector3 : Object)();
    this._obsTmp  = new (THREE ? THREE.Vector3 : Object)();
    this._obsTmp2 = new (THREE ? THREE.Vector3 : Object)();
    if (THREE) this._obsEye.set(-8, 1.7, 33);
    this._obsYaw = 0;
    this._obsPitch = 0;
    this._scrubbing = false;
    this._vmax = 0;
    this._summary = null;
    this._diagnostics = [];
    this._poweredUntil = 0;
    this._phaseText = '';
    this._toastTimer = 0;
    this._autopsyShown = false;
    this._glow = null;
    this._glowPulse = 0;
    this._debris = [];            // apogee-breakup falling bamboo bits

    if (this.available) this._bindControls();
  }

  // ---- one-time DOM wiring ------------------------------------------------
  FlightScreen.prototype._bindControls = function () {
    var self = this;

    this.btnPlay.addEventListener('click', function () { self.togglePlay(); });
    $('fs-restart').addEventListener('click', function () { self._restart(); });
    this.btnRate.addEventListener('click', function () {
      self._rateIdx = (self._rateIdx + 1) % RATES.length;
      self.flight.setRate(RATES[self._rateIdx]);
      self.btnRate.textContent = RATES[self._rateIdx] + '×';
    });
    this.btnCam.addEventListener('click', function () { self._cycleCam(); });
    if (this.btnIgnite) {
      this.btnIgnite.addEventListener('click', function () { self._onIgnite(); });
    }
    if (this.btnLaunchNext) {
      this.btnLaunchNext.addEventListener('click', function () { self._launchNext(); });
    }
    if (this.btnFocus) {
      this.btnFocus.addEventListener('click', function () { self._cycleFocus(); });
    }
    if (this.elAim) {
      this.elAim.addEventListener('input', function () {
        self._azimuth = +self.elAim.value || 90;
        self._syncAim();
      });
    }

    var reveal = function () { self._revealChrome(); };
    ['pointerdown', 'pointermove', 'wheel', 'keydown'].forEach(function (ev) {
      self.root.addEventListener(ev, reveal, { passive: true });
    });

    $('fs-close-x').addEventListener('click', function () { self.close(); });
    $('fs-close').addEventListener('click', function () { self.close(); });
    $('fs-replay').addEventListener('click', function () { self._restart(); });
    $('fs-autopsy-close').addEventListener('click', function () {
      self.autopsy.hidden = true;
    });

    this.scrub.addEventListener('input', function () {
      if (self._gate) { self._syncScrub(); return; }
      self._scrubbing = true;
      self._playing = false;
      var t = (self.scrub.value / 1000) * self._masterDur;
      self._masterT = t;
      self._stepVehicles();
      self._syncAliases();
      var st = self.flight.sampleAt(self.flight.time);
      self._recomputePhase(self.flight.time);
      if (t < self._masterDur - 1e-3) { self._autopsyShown = false; self.autopsy.hidden = true; }
      self.scrub.style.setProperty('--fs-pos', (self.scrub.value / 10).toFixed(1) + '%');
      self._renderFrame(st);
      self._reflectPlay();
    });
    this.scrub.addEventListener('change', function () { self._scrubbing = false; });

    global.addEventListener('resize', function () {
      if (!self.root.hidden && self.scene) self.scene.resize();
    });
    global.addEventListener('keydown', function (e) {
      if (self.root.hidden) return;
      if (e.key === 'Escape') self.close();
      else if (e.key === ' ') { e.preventDefault(); self.togglePlay(); }
      else if (e.key === 'c' || e.key === 'C') self._cycleCam();
      else if (e.key === 'r' || e.key === 'R') self._restart();
      else if (e.key === 'v' || e.key === 'V') self._cycleFocus();
      else if (e.key === 'n' || e.key === 'N') self._launchNext();
    });

    // camera drag + wheel on the canvas
    this.canvas.addEventListener('pointerdown', function (e) {
      self._drag = { x: e.clientX, y: e.clientY };
      self._dragDist = 0;
      if (self.canvas.setPointerCapture && e.pointerId != null) {
        try { self.canvas.setPointerCapture(e.pointerId); } catch (x) {}
      }
    });
    global.addEventListener('pointermove', function (e) {
      if (!self._drag) return;
      var dx = e.clientX - self._drag.x, dy = e.clientY - self._drag.y;
      self._drag.x = e.clientX; self._drag.y = e.clientY;
      self._dragDist += Math.abs(dx) + Math.abs(dy);

      if (self._dragDist > 6 && AUTO_CAM[CAM_MODES[self._camIdx]]) {
        var st = self.flight.sampleAt(self.flight.time);
        self._freeTarget.set(
          (st && st.position) ? st.position.x : 0,
          (st && st.position) ? st.position.y + 2 : 2, 0);
        self._camIdx = CAM_MODES.indexOf('free');
        self.btnCam.textContent = CAM_LABEL.free;
        self._showToast('กล้อง: อิสระ (คุมเอง) — กด C เพื่อกลับโหมดอัตโนมัติ');
      }

      self._theta -= dx * 0.008;
      self._phi = clamp(self._phi - dy * 0.008, 0.16, 1.5);
    });
    global.addEventListener('pointerup', function () { self._drag = null; });
    // orbital-map POI pick — a click (not a drag) on a marker frames it
    this.canvas.addEventListener('pointerup', function (e) {
      if (CAM_MODES[self._camIdx] !== 'map') return;
      if ((self._dragDist || 0) > 6) return;
      self._pickMapPOI(e);
    });
    this.canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      self._zoom = clamp(self._zoom * (e.deltaY < 0 ? 0.88 : 1.14), 0.04, 60);
    }, { passive: false });
  };

  // ---- flight-event handler — registered on EVERY vehicle's renderer -----
  FlightScreen.prototype._onFlightEvent = function (evt, rec) {
    var focused = (rec === this._focusedRec());

    // sound plays for ANY vehicle (a festival is loud) — quieter if not focused
    if (evt.type === 'LIFTOFF' && this._sound) {
      this._sound.play('liftoff', { volume: focused ? 0.72 : 0.48, rate: 0.97 });
      // duck the ignition rumble under the whoosh but let it ride out — the
      // หมื่อ is still burning for a few seconds after it clears the rail
      if (rec && rec._igniteVoice) this._sound.fade(rec._igniteVoice, focused ? 0.22 : 0.12, 700);
    }
    if (evt.type === 'BURNOUT' && rec && rec._igniteVoice && this._sound) {
      this._sound.fade(rec._igniteVoice, 0, 1400);   // fuel's gone — kill the bed
      rec._igniteVoice = null;
    }

    if (!focused) return;   // HUD chrome only ever follows the focused rocket

    this._phaseText = (LABEL_TH[evt.type] || evt.type);
    this._showToast((LABEL_TH[evt.type] || evt.type) + ' · ' + evt.message);
    if (rec && rec.glow && evt.type === 'IGNITION') this._glowPulse = 1;
    if (evt.type === 'MIDAIR_BURN') this._maybeHaiku('burn', 5400);
    else if (evt.type === 'BURNOUT' && this.flight.buoyant) this._maybeHaiku('burnout', 5400);

    var mapIdx = CAM_MODES.indexOf('map');
    if (evt.type === 'ORBIT' && this._camIdx !== mapIdx) {
      this._camIdx = mapIdx;
      this._resetMapView();
      this.btnCam.textContent = CAM_LABEL.map;
    }
  };

  FlightScreen.prototype._cycleCam = function () {
    this._camIdx = (this._camIdx + 1) % CAM_MODES.length;
    var mode = CAM_MODES[this._camIdx];
    this.btnCam.textContent = CAM_LABEL[mode];
    this._zoom = 1;
    if (mode === 'map') { this._resetMapView(); this._showToast('แผนที่วงโคจร — แตะหมุดฐานปล่อย / ยาน เพื่อซูมเข้าไปดู'); }
    else if (this._mapEase || this._mapLook) { this._mapEase = null; }
    if (mode === 'free') {
      var st = this.flight.sampleAt(this.flight.time);
      this._freeTarget.set(
        (st && st.position) ? st.position.x : 0,
        (st && st.position) ? st.position.y + 2 : 2, 0);
    }
  };

  // ---- fleet helpers ---------------------------------------------------
  FlightScreen.prototype._focusedRec = function () {
    return this._vehicles[this._focusIdx] || this._vehicles[0] || null;
  };
  FlightScreen.prototype._syncAliases = function () {
    var rec = this._focusedRec();
    if (!rec) return;
    this.flight = rec.flight;
    this.vehicleGroup = rec.group;
    this._exhaustY = rec.exhaustY;
    this._dirtyExhaust = rec.dirtyExhaust;
    this._poweredUntil = rec._poweredUntil;
    this._glow = rec.glow;
  };
  FlightScreen.prototype._cycleFocus = function () {
    if (this._vehicles.length < 2) return;
    this._focusIdx = (this._focusIdx + 1) % this._vehicles.length;
    this._camTX = this._camTY = null;   // snap the camera to the new subject
    this._syncAliases();
    this._refreshFocusBtn();
    this._showToast('กล้องจับบั้งไฟลูกที่ ' + (this._focusIdx + 1));
  };
  FlightScreen.prototype._refreshFocusBtn = function () {
    if (!this.btnFocus) return;
    var multi = this._bangfai && this._vehicles.length > 1;
    this.btnFocus.hidden = !multi;
    if (multi) this.btnFocus.textContent = '🎯 ' + (this._focusIdx + 1) + '/' + this._vehicles.length;
  };
  FlightScreen.prototype._collectEvents = function () {
    var all = [];
    this._vehicles.forEach(function (rec) {
      (rec.sim.events || []).forEach(function (e) {
        all.push({ type: e.type, time: e.time + rec.t0, message: e.message });
      });
    });
    return all.sort(function (a, b) { return a.time - b.time; });
  };

  FlightScreen.prototype._disposeFleet = function () {
    var self = this;
    (this._vehicles || []).forEach(function (rec) {
      if (rec.group) RS.render.VehicleRenderer.disposeGroup(rec.group);
      [rec.pathLine, rec.trail].forEach(function (ln) {
        if (ln && self.scene) {
          self.scene.remove(ln);
          if (ln.geometry) ln.geometry.dispose();
          if (ln.material) ln.material.dispose();
        }
      });
    });
    this._vehicles = [];
  };

  /**
   * Add one vehicle to the fleet: build its mesh, load its sim into a fresh
   * FlightRenderer, cut its trail + path line, hang an exhaust glow on it.
   * @param {Object} sim  a SimulationResult
   * @param {{t0:number, primary?:boolean}} o
   */
  FlightScreen.prototype._addVehicle = function (sim, o) {
    o = o || {};
    var self = this;
    var fr = new RS.render.FlightRenderer({ playbackRate: 1 });
    var group = RS.render.VehicleRenderer.build(this._vehicle);
    group.traverse(function (m) { if (m.isMesh) m.castShadow = true; });
    this.scene.add(group);

    var rawEY = (group.userData && group.userData.exhaustY != null)
      ? group.userData.exhaustY : -0.3;
    var exhaustY = Math.min(0, rawEY) - 0.1;

    fr.load(sim);
    fr.attach(group);
    fr.seek(0);

    // faint full predicted path + bright progressive trail
    var pathLine = null, trail = null, trailN = 0;
    var pts = (sim.trajectory || []).map(function (s) {
      return new THREE.Vector3(s.position.x, s.position.y, s.position.z);
    });
    if (pts.length > 1) {
      var isOrbital = !!(sim.summary && sim.summary.orbit && sim.summary.orbit.achieved);
      var pg = new THREE.BufferGeometry().setFromPoints(pts);
      pathLine = new THREE.Line(pg, new THREE.LineBasicMaterial({
        color: isOrbital ? 0x8fd4ff : 0x9a6b3a,
        transparent: true, opacity: isOrbital ? 0.32 : 0.14
      }));
      this.scene.add(pathLine);

      var tg = new THREE.BufferGeometry().setFromPoints(pts);
      tg.setDrawRange(0, 1);
      trail = new THREE.Line(tg, new THREE.LineBasicMaterial({
        color: 0xffd7a6, transparent: true, opacity: 0.72
      }));
      trailN = pts.length;
      this.scene.add(trail);
    }

    var glow = new THREE.PointLight(0xff8a3a, 0, 140, 2);
    glow.position.set(0, rawEY, 0);
    group.add(glow);

    var rec = {
      id: o.primary ? 'bf1' : ('bf' + (this._vehicles.length + 1)),
      flight: fr, group: group, sim: sim,
      t0: o.t0 || 0,
      exhaustY: exhaustY,
      dirtyExhaust: !!(sim.meta && sim.meta.dirtyExhaust),
      pathLine: pathLine, trail: trail, trailN: trailN, glow: glow,
      _poweredUntil: poweredUntil(sim.trajectory),
      _igniteSfx: false, _igniteVoice: null
    };
    fr.on('*', function (evt) { self._onFlightEvent(evt, rec); });
    this._vehicles.push(rec);

    if (o.primary) {
      this.flight = fr;
      this.vehicleGroup = group;
      this._glow = glow;
      this._exhaustY = exhaustY;
      this._dirtyExhaust = rec.dirtyExhaust;
      this._sim = sim;
      this._summary = sim.summary || null;
      this._diagnostics = sim.diagnostics || [];
      this._poweredUntil = rec._poweredUntil;
      var b = group.userData.bounds;
      this._vehH = (b && b.height) || 1.4;
      var oev = (sim.events || []).filter(function (e) { return e.type === 'ORBIT'; })[0];
      this._orbitEventTime = oev ? oev.time : Infinity;
      if (this._exhaust) this._exhaust.reset();
    }
    return rec;
  };

  // ---- scene (built lazily, kept alive between opens) -------------------
  FlightScreen.prototype._buildScene = function () {
    if (this._built) return;
    var RE = (RS.Physics && RS.Physics.RE) || 600000;
    this._RE = RE;
    this.scene = new RS.render.Scene(this.canvas, {
      ground: false, background: 0x05080f, fov: 50,
      logDepth: true, far: RE * 6,
      fog: { color: 0x060912, density: 0.0011 }
    });
    if (!this.scene.available) { this._built = true; return; }
    var sc = this.scene.scene;

    this._stars = makeStars(1400, RE * 4);
    sc.add(this._stars);

    // ---- THE PLANET — the Blue Marble, centred at (0, -RE) so its north
    //  pole (the launch site) sits at the world origin / launch pad. -------
    var earthGlobe = RS.render.EarthGlobe
      ? RS.render.EarthGlobe.build(RE, { detail: 12, rimHex: 0x5aa9ff })
      : null;
    var planet;
    if (earthGlobe) {
      earthGlobe.position.set(0, -RE, 0);
      RS.render.EarthGlobe.orientTo(earthGlobe, LAUNCH_LAT, LAUNCH_LON);
      var maxAniso = (this.scene.renderer.capabilities &&
        this.scene.renderer.capabilities.getMaxAnisotropy)
        ? this.scene.renderer.capabilities.getMaxAnisotropy() : 1;
      earthGlobe.traverse(function (o) {
        if (o.isMesh) {
          o.receiveShadow = true;
          if (o.material && o.material.map) o.material.map.anisotropy = maxAniso;
        }
      });
      sc.add(earthGlobe);
      this._earth = earthGlobe;
      planet = earthGlobe.userData.earth;         // the MeshStandardMaterial mesh
      planet.userData.textured = true;
    } else {
      // fallback: the old flat sphere if EarthGlobe / textures are unavailable
      planet = new THREE.Mesh(
        new THREE.SphereGeometry(RE, 96, 64),
        new THREE.MeshStandardMaterial({ color: 0x1f5133, roughness: 1, metalness: 0 })
      );
      planet.position.set(0, -RE, 0);
      planet.receiveShadow = true;
      sc.add(planet);
    }
    var atmo = new THREE.Mesh(
      new THREE.SphereGeometry(RE + ((RS.Physics && RS.Physics.ATMOS_TOP) || 70000), 64, 48),
      new THREE.MeshBasicMaterial({ color: 0x5aa9ff, transparent: true, opacity: 0.10,
        side: THREE.BackSide, depthWrite: false })
    );
    atmo.position.set(0, -RE, 0);
    sc.add(atmo);
    this._planet = planet;
    this._atmo = atmo;

    // ---- ORBITAL-MAP POI MARKERS — only shown in the 'map' camera mode.
    //  A raycaster click on either one GSAP-pans the map camera to frame it.
    var lm = new THREE.Mesh(
      new THREE.SphereGeometry(RE * 0.022, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xff5a4a }));
    lm.position.set(0, RE * 0.006, 0);          // the north pole = the pad
    lm.userData.poi = 'launch';
    lm.visible = false;
    sc.add(lm);
    this._launchMarker = lm;
    var lh = makeHaloSprite('255,110,90');
    if (lh) {
      lh.scale.setScalar(RE * 0.12);
      lh.position.copy(lm.position);
      lh.userData.poi = 'launch';
      lh.visible = false;
      sc.add(lh);
      this._launchHalo = lh;
    }
    var vm = new THREE.Mesh(
      new THREE.SphereGeometry(RE * 0.014, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0x8fd6ff }));
    vm.userData.poi = 'vehicle';
    vm.visible = false;
    sc.add(vm);
    this._vehMarker = vm;
    var vh = makeHaloSprite('130,210,255');
    if (vh) {
      vh.scale.setScalar(RE * 0.07);
      vh.userData.poi = 'vehicle';
      vh.visible = false;
      sc.add(vh);
      this._vehHalo = vh;
    }
    this._mapLook = null;        // world point the map camera orbits (null = planet centre)
    this._mapEase = null;        // no-GSAP fallback tween target

    // ---- ERA 3 · V-2 — the Eastern-Sea target zone + aim / impact pins ----
    if (RS.render.OrbitalEnv) {
      var OE = RS.render.OrbitalEnv;
      this._targetZone = OE.makeTargetZone(RE);
      if (this._targetZone) { this._targetZone.visible = false; sc.add(this._targetZone); }
      var mkS = 34;
      this._aimMarker = OE.makeAimMarker(mkS);
      if (this._aimMarker) { this._aimMarker.visible = false; sc.add(this._aimMarker); }
      this._impactMarker = OE.makeImpactMarker(mkS);
      if (this._impactMarker) { this._impactMarker.visible = false; sc.add(this._impactMarker); }
    }

    // a dedicated "sun" for the Blue Marble — only lit in the orbital-map view
    // so it never over-brightens the near-pad scenes. Gives a clean terminator.
    this._earthSun = new THREE.DirectionalLight(0xfff4e8, 0);
    this._earthSun.position.set(-RE * 2.6, RE * 1.15, RE * 1.9);
    sc.add(this._earthSun);

    // ---- the DAYTIME GRADIENT SKY — a large inward sphere, warm horizon glow
    //  melting up into a deep azure zenith. NO sun geometry — the directional
    //  key light + hemisphere ambient carry "daytime". Hidden for night / dusk.
    if (RS.render.makeGradientSky) {
      this._skyDome = RS.render.makeGradientSky({
        top: 0x2f6fb2, horizon: 0xe4ebe4, ground: 0x9fae9c,
        exponent: 0.5, radius: RE * 3.5
      });
      this._skyDome.visible = false;
      sc.add(this._skyDome);
    }

    // ---- near-pad ground : soft radial-gradient disc (night only) ----
    var gtc = document.createElement('canvas');
    gtc.width = gtc.height = 256;
    var gg = gtc.getContext('2d');
    var grd = gg.createRadialGradient(128, 128, 8, 128, 128, 128);
    grd.addColorStop(0.00, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.7)');
    grd.addColorStop(1.00, 'rgba(255,255,255,0)');
    gg.fillStyle = grd; gg.fillRect(0, 0, 256, 256);
    var groundTex = new THREE.CanvasTexture(gtc);
    var nearGround = new THREE.Mesh(
      new THREE.CircleGeometry(3200, 64),
      new THREE.MeshLambertMaterial({
        map: groundTex, color: 0x141a24,
        transparent: true, depthWrite: false, fog: true
      }));
    nearGround.rotation.x = -Math.PI / 2;
    nearGround.position.y = 0.005;
    sc.add(nearGround);
    this._nearGround = nearGround;

    // (the lush daytime ground disc + grass live in FestivalEnv's dayGroup)

    // ---- near-pad detail (only visible when zoomed right in) --------
    var grid = new THREE.GridHelper(2400, 96, 0x356b41, 0x1d3a27);
    grid.material.transparent = true; grid.material.opacity = 0.42;
    grid.position.y = 0.02;
    sc.add(grid);
    this._padGrid = grid;

    var pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.15, 0.18, 20),
      new THREE.MeshStandardMaterial({ color: 0x1c2436, roughness: 0.9 })
    );
    pad.position.y = 0.09;
    sc.add(pad);
    this._pad = pad;
    this._launchRig = null;
    this._rigAngle = 0;

    if (RS.render.ExhaustFX) {
      this._exhaust = new RS.render.ExhaustFX();
      if (this._exhaust.available) sc.add(this._exhaust.object3d());
    }

    for (var a = 100; a <= 2000; a += 100) {
      var ring = new THREE.Mesh(
        new THREE.TorusGeometry(7, 0.13, 6, 40),
        new THREE.MeshBasicMaterial({ color: 0x2f6f8f, transparent: true, opacity: 0.24 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = a;
      sc.add(ring);
    }

    if (RS.render.FestivalEnv) {
      this._festival = new RS.render.FestivalEnv(this.scene);
      this._festival.build();
    }

    this._built = true;
  };

  // ---- sky mode — 'day' (Bang Fai) | 'night' (khom loy) | 'dusk' (rocket) ---
  FlightScreen.prototype._applySky = function (kind) {
    if (this._sky === kind) return;
    this._sky = kind;
    var night = kind === 'night', day = kind === 'day';
    var S = this.scene; if (!S || !S.available) return;
    var L = S.lights, R = S.renderer;

    if (R) R.setClearColor(day ? 0xdfe9e4 : 0x05080f, 1);
    if (this._stars) this._stars.visible = !day;
    if (this._skyDome) this._skyDome.visible = day;

    if (L) {
      // a clear Isan afternoon — bright but not blown out; the key still bites
      // hard enough for crisp shadows
      L.hemi.intensity = day ? 0.72 : night ? 0.38 : 0.95;
      if (L.hemi.color && L.hemi.color.setHex) L.hemi.color.setHex(day ? 0xbcd6f2 : 0xbfd4ff);
      if (L.hemi.groundColor && L.hemi.groundColor.setHex)
        L.hemi.groundColor.setHex(day ? 0x46512f : 0x25324a);
      L.key.intensity = day ? 1.55 : night ? 0.35 : 1.05;
      if (L.key.color && L.key.color.setHex) L.key.color.setHex(day ? 0xfff4df : 0xfff2dd);
      L.rim.intensity = day ? 0.42 : night ? 0.5 : 0.35;
      if (L.rim.color && L.rim.color.setHex)
        L.rim.color.setHex(night ? 0x3355aa : (day ? 0xaecbe8 : 0x88aaff));
    }
    if (this._planet && this._planet.material) {
      if (this._planet.userData && this._planet.userData.textured) {
        // the Blue Marble carries its own day/night via its dedicated map-view
        // sun + the emissive city-lights map — keep the glow subtle so it reads
        // as cities on the night side, not lava on the day side
        this._planet.material.emissiveIntensity = night ? 1.15 : day ? 0.22 : 0.6;
      } else {
        this._planet.material.color.setHex(day ? 0x496f36 : night ? 0x0d1119 : 0x1f5133);
      }
    }
    if (this._atmo && this._atmo.material) {
      this._atmo.material.opacity = day ? 0.0 : night ? 0.05 : 0.10;   // the sky dome does it now
      this._atmo.material.color.setHex(day ? 0x8fc4e8 : night ? 0x2a4a80 : 0x5aa9ff);
    }
    // no grid in daylight — the lush grass IS the ground
    if (this._padGrid && this._padGrid.material)
      this._padGrid.material.opacity = night ? 0.10 : day ? 0.0 : 0.42;
    if (this._padGrid) this._padGrid.visible = !day;
    if (this._nearGround) this._nearGround.visible = night;
    if (this._festival) this._festival.setMode(day ? 'day' : (night ? 'night' : 'off'));
    if (S.fog) {
      // a soft warm haze that melts the far grassland + treeline into the
      // horizon glow; the camera hugs the rocket so it stays crisp
      S.fog.density = day ? 0.0012 : night ? 0.0016 : 0.0011;
      S.fog.color.setHex(day ? 0xd7e4d6 : night ? 0x080a12 : 0x060912);
    }

    // crisp daytime shadows — the plume + rocket cast onto the day ground
    if (R) { R.shadowMap.enabled = day; if (day) R.shadowMap.type = THREE.PCFSoftShadowMap; }
    if (L && L.key) {
      L.key.castShadow = day;
      if (day && !this._shadowInit && L.key.shadow) {
        L.key.shadow.mapSize.set(2048, 2048);
        L.key.shadow.camera.near = 1; L.key.shadow.camera.far = 700;
        L.key.shadow.camera.left = L.key.shadow.camera.bottom = -80;
        L.key.shadow.camera.right = L.key.shadow.camera.top = 80;
        L.key.shadow.bias = -0.0005; L.key.shadow.radius = 2;
        if (L.key.shadow.camera.updateProjectionMatrix) L.key.shadow.camera.updateProjectionMatrix();
        this._shadowInit = true;
      }
    }
    this._night = night;
  };

  // legacy shim — some call paths still ask for night on/off
  FlightScreen.prototype._applyNightMode = function (on) {
    this._applySky(on ? 'night' : (this._bangfai ? 'day' : 'dusk'));
  };

  function makeStars(n, r) {
    var g = new THREE.BufferGeometry();
    var pos = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var u = Math.random(), v = Math.random();
      var th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1);
      pos[i * 3]     = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = Math.abs(r * Math.cos(ph)) * 0.9 + 40;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xbcd4ff, size: 6, sizeAttenuation: true, transparent: true, opacity: 0.8, fog: false
    }));
  }

  // ---- cinematic chrome reveal --------------------------------------
  FlightScreen.prototype._revealChrome = function () {
    if (this._gate) return;
    if (!this._chromeHidden) return;
    this._chromeHidden = false;
    if (this._chromeTimer) { global.clearTimeout(this._chromeTimer); this._chromeTimer = 0; }
    this.root.classList.remove('fs-cinematic');
  };

  // ======================================================================
  //  ERA 3 · V-2 — the manual launch sequence: aim → ready → T-10 → liftoff
  // ======================================================================

  // deg compass bearing → world Y-yaw (bearing 90° / east == flight +x axis)
  function bearingToYaw(bDeg) { return (bDeg - 90) * Math.PI / 180; }

  FlightScreen.prototype._syncAim = function () {
    var az = this._azimuth;
    if (this.elAim && +this.elAim.value !== az) this.elAim.value = String(az);
    if (this.elAimVal) this.elAimVal.textContent = (az < 100 ? '0' : '') + az + '°';
    if (this.elAimHint) {
      var off = az - this._targetBearing;
      this.elAimHint.textContent = Math.abs(off) <= 3
        ? '🎯 เล็งตรงเป้ากลางทะเลแล้ว'
        : (off > 0 ? 'เอียงไปทางใต้ ' : 'เอียงไปทางเหนือ ') + Math.abs(off) + '° จากเป้า';
    }
    this._positionTargetZone();
  };

  FlightScreen.prototype._positionTargetZone = function () {
    var RE = this._RE || 600000, OE = RS.render.OrbitalEnv;
    if (!OE) return;
    var tgtRange = (this._summary && this._summary.targetRange) || 2500;
    if (this._targetZone) OE.placeAtRange(this._targetZone, RE, tgtRange, 0);
    var yaw = bearingToYaw(this._azimuth);
    if (this._aimMarker) {
      OE.placeAtRange(this._aimMarker, RE, tgtRange, yaw);
      this._aimMarker.visible = Math.abs(this._azimuth - this._targetBearing) > 2;
    }
    if (this._impactMarker && this._summary) {
      var ix = Math.abs(this._summary.downrange || this._summary.impactX || 0);
      OE.placeAtRange(this._impactMarker, RE, ix, yaw);
    }
  };

  // a short WebAudio blip for the countdown (SoundFX only carries mp3 beds)
  FlightScreen.prototype._beep = function (freq, dur, kind) {
    try {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      if (!this._actx) this._actx = new AC();
      var ac = this._actx, t0 = ac.currentTime;
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = kind === 'go' ? 'sawtooth' : 'sine';
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(kind === 'go' ? 0.28 : 0.16, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + (dur || 0.12));
      o.connect(g); g.connect(ac.destination);
      o.start(t0); o.stop(t0 + (dur || 0.12) + 0.02);
    } catch (e) {}
  };

  FlightScreen.prototype._startCountdown = function () {
    this._gate = 'countdown';
    this._cd = 10.0;
    this._cdShown = null;
    if (this.elLaunchSeq) this.elLaunchSeq.hidden = true;
    if (this.btnIgnite) this.btnIgnite.hidden = true;
    if (this.elCountdown) { this.elCountdown.hidden = false; this.elCountdown.classList.remove('go'); }
    this._phaseText = 'นับถอยหลัง — T-10';
    this._showToast('ตั้งทิศยิง ' + this._azimuth + '° · เริ่มนับถอยหลัง T-10');
    this._camIdx = CAM_MODES.indexOf('observer');
    this.btnCam.textContent = CAM_LABEL.observer;
  };

  FlightScreen.prototype._countdownFrame = function (dt) {
    this._cd -= dt;
    var whole = Math.max(0, Math.ceil(this._cd));
    if (whole !== this._cdShown) {
      this._cdShown = whole;
      if (this.elCountdown) {
        this.elCountdown.textContent = whole > 0 ? String(whole) : 'IGNITION';
        this.elCountdown.classList.toggle('go', whole === 0);
        // retrigger the CSS pulse
        void this.elCountdown.offsetWidth;
        this.elCountdown.style.animation = 'none';
        void this.elCountdown.offsetWidth;
        this.elCountdown.style.animation = '';
      }
      if (whole > 0) this._beep(whole <= 3 ? 880 : 660, 0.12);
      else this._beep(180, 0.5, 'go');
    }
    // hold the rocket dead still on the table at t=0 during the count
    this.flight.seek(0);
    var st = this.flight.sampleAt(0);
    this._masterT = 0;
    if (this._exhaust) this._exhaust.reset();
    this._updateCamera(0, st);
    this._updateHud(st);
    this.scene.renderOnce();
    if (this._cd <= 0) this._releaseV2();
  };

  FlightScreen.prototype._releaseV2 = function () {
    this._gate = null;
    if (this.elCountdown) {
      var el = this.elCountdown;
      global.setTimeout(function () { el.hidden = true; }, 550);
    }
    this.flight.seek(this._liftoffTime || 0);
    this._masterT = this._liftoffTime || 0;
    this._camTX = this._camTY = null;
    this._camIdx = CAM_MODES.indexOf('chase');
    this.btnCam.textContent = CAM_LABEL.chase;
    this._phaseText = 'จุดเครื่องยนต์ — ทะยานขึ้น!';
    this._showToast('IGNITION — V-2 ทะยานพ้นฐานยิง');
    if (this._sound) this._sound.play('liftoff', { volume: 0.7, rate: 0.9 });
    this._beep(120, 0.7, 'go');
    this._revealChrome();
    this._last = perfNow();
    this.play();
  };

  // ---- IMPACT EXPLOSION ------------------------------------------------
  FlightScreen.prototype._spawnBlast = function (x, y, z, dmgR) {
    if (!THREE || !this.scene) return;
    var g = new THREE.Group();
    var fireMat = new THREE.MeshBasicMaterial({
      color: 0xffb257, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false });
    var ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), fireMat);
    g.add(ball);
    var coreMat = new THREE.MeshBasicMaterial({
      color: 0xfff2c8, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false });
    var core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), coreMat);
    g.add(core);
    var ringMat = new THREE.MeshBasicMaterial({
      color: 0xdcc7a0, transparent: true, opacity: 0.6,
      side: THREE.DoubleSide, depthWrite: false });
    var ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 1, 40), ringMat);
    ring.rotation.x = -Math.PI / 2;
    g.add(ring);
    // the persistent damage-radius footprint
    var scarMat = new THREE.MeshBasicMaterial({
      color: 0xff5a3a, transparent: true, opacity: 0.34,
      side: THREE.DoubleSide, depthWrite: false });
    var scar = new THREE.Mesh(new THREE.RingGeometry(Math.max(2, dmgR * 0.94), dmgR, 56), scarMat);
    scar.rotation.x = -Math.PI / 2;
    scar.position.set(x, 0.4, z);
    this.scene.add(scar);
    var flash = new THREE.PointLight(0xffd9a0, 8, Math.max(60, dmgR * 6), 2);
    flash.position.set(x, y + 2, z);
    this.scene.add(flash);
    g.position.set(x, Math.max(y, 1.5), z);
    this.scene.add(g);
    this._blastFX.push({
      grp: g, ball: ball, core: core, ring: ring, flash: flash, scar: scar,
      dmgR: dmgR, t: 0, life: 2.2
    });
    this._showToast('💥 กระทบเป้า! รัศมีความเสียหาย ~' + Math.round(dmgR) + ' ม.');
  };

  FlightScreen.prototype._updateBlast = function (dt) {
    if (!this._blastFX.length) return;
    for (var i = this._blastFX.length - 1; i >= 0; i--) {
      var b = this._blastFX[i];
      b.t += dt;
      var k = b.t / b.life;
      var ease = 1 - Math.pow(1 - Math.min(k, 1), 3);
      var R = b.dmgR;
      var fireR = Math.min(R * 0.2, 8);        // keep the fireball readable at chase range
      b.ball.scale.setScalar(2 + ease * fireR);
      b.ball.material.opacity = Math.max(0, 0.9 * (1 - k));
      b.core.scale.setScalar(1.2 + ease * Math.min(R * 0.09, 4));
      b.core.material.opacity = Math.max(0, 1 - k * 2.2);
      var rr = 2 + ease * Math.min(R * 1.1, 46);
      b.ring.scale.setScalar(rr);
      b.ring.material.opacity = Math.max(0, 0.6 * (1 - k));
      b.grp.position.y += dt * 6 * (1 - k);
      if (b.flash) b.flash.intensity = Math.max(0, 8 * (1 - k * 3));
      if (b.scar) b.scar.material.opacity = 0.34 * clamp(1 - (b.t - b.life) / 6, 0, 1);
      if (b.t >= b.life) {
        this.scene.remove(b.grp);
        b.grp.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        if (b.flash) this.scene.remove(b.flash);
        // leave the scar a few seconds, then clear
        var scar = b.scar, sc = this.scene;
        if (scar) global.setTimeout(function () {
          sc.remove(scar); scar.geometry.dispose(); scar.material.dispose();
        }, 6000);
        this._blastFX.splice(i, 1);
      }
    }
  };

  FlightScreen.prototype._clearBlasts = function () {
    var sc = this.scene;
    (this._blastFX || []).forEach(function (b) {
      if (sc) { sc.remove(b.grp); if (b.flash) sc.remove(b.flash); if (b.scar) sc.remove(b.scar); }
    });
    this._blastFX = [];
    this._blasted = {};
  };

  // ======================================================================
  //  SKY ATLAS · FIREWORKS — the target box + the burst (Phase 16)
  // ======================================================================

  // a glowing, semi-transparent altitude bounding box the shell must burst in
  FlightScreen.prototype._buildFwTargetBox = function () {
    if (!THREE || !this.scene) return;
    if (this._fwTargetBox) { this.scene.remove(this._fwTargetBox); this._fwTargetBox = null; }
    if (!this._fwBox) return;
    var lo = this._fwBox[0], hi = this._fwBox[1];
    var W = 64, D = 64, H = hi - lo, midY = (lo + hi) / 2;
    var g = new THREE.Group();
    g.userData.isFwTargetBox = true;

    var fill = new THREE.Mesh(
      new THREE.BoxGeometry(W, H, D),
      new THREE.MeshBasicMaterial({
        color: 0x5fe0c0, transparent: true, opacity: 0.06,
        depthWrite: false, blending: THREE.AdditiveBlending }));
    fill.position.y = midY;
    g.add(fill);

    var edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, D)),
      new THREE.LineBasicMaterial({ color: 0x8fffe4, transparent: true, opacity: 0.55 }));
    edges.position.y = midY;
    g.add(edges);

    // a bright square outline at the floor + ceiling of the box
    var hw = W / 2, hd = D / 2;
    [lo, hi].forEach(function (yy) {
      var lg = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-hw, yy, -hd), new THREE.Vector3(hw, yy, -hd),
        new THREE.Vector3(hw, yy, hd), new THREE.Vector3(-hw, yy, hd),
        new THREE.Vector3(-hw, yy, -hd)]);
      g.add(new THREE.Line(lg, new THREE.LineBasicMaterial({
        color: 0x9dffe8, transparent: true, opacity: 0.7 })));
    });

    this.scene.add(g);
    this._fwTargetBox = g;
    g.visible = false;
  };

  // the burst — an expanding shell of coloured sparks + a flash
  FlightScreen.prototype._spawnFwBurst = function (x, y, z, hex, dud) {
    if (!THREE || !this.scene) return;
    this._fwBursted = true;
    // consume the shell mesh
    if (this.vehicleGroup) this.vehicleGroup.visible = false;

    var col = new THREE.Color(hex || '#ffc247');
    var N = dud ? 26 : 150;
    var pos = new Float32Array(N * 3), colr = new Float32Array(N * 3);
    var vel = [];
    for (var i = 0; i < N; i++) {
      // random point on a sphere
      var u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
      var r = Math.sqrt(1 - u * u);
      var dx = r * Math.cos(th), dy = u, dz = r * Math.sin(th);
      var sp = dud ? (3 + Math.random() * 4) : (16 + Math.random() * 18);
      vel.push({ x: dx * sp, y: dy * sp * (dud ? 0.5 : 1) + (dud ? 1 : 3), z: dz * sp, life: dud ? 0.7 : 1.4 + Math.random() * 0.6 });
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      var tint = 0.7 + Math.random() * 0.5;
      colr[i * 3] = col.r * tint; colr[i * 3 + 1] = col.g * tint; colr[i * 3 + 2] = col.b * tint;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    var pts = new THREE.Points(geo, new THREE.PointsMaterial({
      size: dud ? 1.4 : 2.6, vertexColors: true, transparent: true, opacity: 1,
      depthWrite: false, blending: dud ? THREE.NormalBlending : THREE.AdditiveBlending,
      map: this._sparkTex(), toneMapped: false }));
    pts.frustumCulled = false;
    this.scene.add(pts);

    var flash = new THREE.PointLight(dud ? 0x9a9a9a : hex, dud ? 2 : 14, dud ? 40 : 220, 2);
    flash.position.set(x, y, z);
    this.scene.add(flash);

    this._fwBursts.push({ pts: pts, geo: geo, vel: vel, flash: flash, pos: pos,
      t: 0, life: dud ? 1.0 : 2.2, dud: !!dud });

    this._showToast(dud
      ? '💨 ลูกพลุด้าน — ตกถึงพื้นก่อนชนวนจะไหม้'
      : ('🎆 ดอกพลุบานที่ ' + Math.round(y) + ' ม.' +
         (this._fwBox && y >= this._fwBox[0] && y <= this._fwBox[1] ? ' — ในกรอบเป้าหมาย! 🎯' : ' — นอกกรอบ')));
    if (this._sound && !dud) this._sound.play('liftoff', { volume: 0.4, rate: 1.5 });
  };

  FlightScreen.prototype._sparkTex = function () {
    if (this._sparkT) return this._sparkT;
    var c = document.createElement('canvas'); c.width = c.height = 32;
    var x = c.getContext('2d');
    var grd = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = grd; x.fillRect(0, 0, 32, 32);
    this._sparkT = new THREE.CanvasTexture(c);
    return this._sparkT;
  };

  FlightScreen.prototype._updateFwBursts = function (dt) {
    if (!this._fwBursts.length) return;
    for (var i = this._fwBursts.length - 1; i >= 0; i--) {
      var b = this._fwBursts[i];
      b.t += dt;
      var k = b.t / b.life;
      var p = b.pos;
      for (var j = 0; j < b.vel.length; j++) {
        var v = b.vel[j];
        v.y -= 9.8 * dt * 0.6;                 // gravity on the sparks
        v.x *= (1 - 1.1 * dt); v.z *= (1 - 1.1 * dt);   // air drag
        p[j * 3] += v.x * dt; p[j * 3 + 1] += v.y * dt; p[j * 3 + 2] += v.z * dt;
      }
      b.geo.attributes.position.needsUpdate = true;
      b.pts.material.opacity = Math.max(0, 1 - k * (b.dud ? 1.6 : 1.05));
      if (b.flash) b.flash.intensity = Math.max(0, (b.dud ? 2 : 14) * (1 - k * 2.5));
      if (b.t >= b.life) {
        this.scene.remove(b.pts); this.scene.remove(b.flash);
        b.geo.dispose(); b.pts.material.dispose();
        this._fwBursts.splice(i, 1);
      }
    }
  };

  FlightScreen.prototype._clearFwBursts = function () {
    var sc = this.scene;
    (this._fwBursts || []).forEach(function (b) {
      if (sc) { sc.remove(b.pts); sc.remove(b.flash); }
      if (b.geo) b.geo.dispose();
      if (b.pts && b.pts.material) b.pts.material.dispose();
    });
    this._fwBursts = [];
    this._fwBursted = false;
  };

  // ======================================================================
  //  THE RELEASE — manual two-step ignition
  //    · Era 0 (khom loy)  : light the wick → heat builds → let go the string
  //    · Era 1 (Bang Fai)  : จุดชนวน → ~5 s packed-bore pressure build (a wall
  //      of ground smoke) → ปล่อยบั้งไฟ; it creeps off the rail, then roars up
  // ======================================================================
  FlightScreen.prototype._onIgnite = function () {
    if (this._v2) {
      if (this._gate === 'aim') this._startCountdown();
      return;
    }
    var bf = this._bangfai;
    if (this._gate === 'prelaunch') {
      this._gate = 'igniting';
      this._ignT = 0;
      this.btnIgnite.disabled = true;
      this.btnIgnite.classList.remove('ready');
      this.btnIgnite.textContent = bf ? 'กำลังอัดแรงดัน…' : 'กำลังจุดไฟ…';
      this._phaseText = bf ? 'จุดชนวนแล้ว — แรงดันกำลังก่อตัวในลำ' : 'จุดไฟ — ประคองโคมไว้';
      this._showToast(bf ? 'จุดชนวน · ดินขับกำลังอัดแรงดัน ควันท่วมฐาน'
                         : 'จุดไฟ · ประคองโคมไว้จนอิ่มไอร้อน');
      // the หมื่อ catches — a long, building rocket rumble under everything
      if (bf && this._sound) {
        var prm = this._focusedRec();
        var v = this._sound.play('ignite', { volume: 0.6, rate: 0.96 });
        if (prm) { prm._igniteVoice = v; prm._igniteSfx = true; }
      }
    } else if (this._gate === 'held') {
      this._gate = null;
      this.btnIgnite.hidden = true;
      this.btnIgnite.classList.remove('ready');
      this.btnIgnite.disabled = false;
      this.flight.seek(this._liftoffTime || 0);
      this._masterT = this._liftoffTime || 0;
      this._camTX = this._camTY = null;
      if (bf) {
        this._camIdx = CAM_MODES.indexOf('chase');   // follow it up the sky
        this.btnCam.textContent = CAM_LABEL.chase;
        this._phaseText = 'ปล่อยบั้งไฟ!';
        this._showToast('ปล่อยบั้งไฟ! — คลายรางแล้ว บั้งไฟค่อย ๆ พ้นราง');
        // the whoosh off the rail (the LIFTOFF event is seeked past on release)
        if (this._sound) {
          this._sound.play('liftoff', { volume: 0.75, rate: 0.97 });
          var pr0 = this._focusedRec();
          if (pr0 && pr0._igniteVoice) this._sound.fade(pr0._igniteVoice, 0.22, 800);
        }
      } else {
        this._phaseText = 'ปล่อยโคม';
        this._lastHaikuT = this.flight.time;
        this._showToast('ปล่อยโคม · โคมลอยขึ้นสู่ราตรี');
        this._showHaiku(HAIKU.release, 5200);
      }
      this._revealChrome();
      this._last = perfNow();
      this.play();
    }
  };

  FlightScreen.prototype._enterHeld = function () {
    var bf = this._bangfai;
    this._gate = 'held';
    this.btnIgnite.disabled = false;
    this.btnIgnite.classList.add('ready');
    this.btnIgnite.textContent = bf ? 'ปล่อยบั้งไฟ' : 'ปล่อยโคม';
    this._phaseText = bf ? 'แรงดันเต็มลำ — พร้อมปล่อย' : 'ไอร้อนเต็มลูก — พร้อมปล่อย';
    this._showToast(bf ? 'แรงดันเต็มลำแล้ว — แตะเพื่อคลายรางปล่อยบั้งไฟ'
                       : 'ไอร้อนเต็มลูกแล้ว — แตะเพื่อปล่อยโคม');
  };

  FlightScreen.prototype._gateFrame = function (dt) {
    // ---- Era 3 · V-2 : "aim" — hold on the firing table until Ready ----
    if (this._gate === 'aim') {
      this.flight.seek(0);
      var s0 = this.flight.sampleAt(0);
      this._masterT = 0;
      this._phaseText = 'ตั้งทิศยิง แล้วกด "พร้อมยิง"';
      if (this._exhaust) this._exhaust.reset();
      if (RS.render.OrbitalEnv && this._targetZone) RS.render.OrbitalEnv.update(this._targetZone, dt);
      this._updateCamera(0, s0);
      this._updateHud(s0);
      this.scene.renderOnce();
      return;
    }
    var bf = this._bangfai;
    var lt = this._liftoffTime || 0;
    if (this._gate === 'prelaunch') {
      this._phaseText = bf ? 'จ่อชนวน — รอจุด' : 'ประคองโคมไว้ · รอจุดไฟ';
    }
    if (this._gate === 'igniting') {
      var rate = this._igniteDur > 0 ? lt / this._igniteDur : lt;
      this._ignT += dt * rate;
      if (this._ignT >= lt) { this._ignT = lt; this._enterHeld(); }
      this.flight.seek(clamp(this._ignT, 0, lt));
    }
    var st = this.flight.sampleAt(this.flight.time) || this.flight.sampleAt(0);

    // 0 → 1 pressure / heat build factor over the ignition hold
    var s = (this._gate === 'prelaunch') ? 0
      : (this._gate === 'igniting') ? clamp(this._ignT / Math.max(lt, 1e-6), 0, 1)
      : 1;

    // khom-loy flame build (no-op for a Bang Fai — it has no flicker meshes)
    if (RS.render.VehicleRenderer && this.vehicleGroup) {
      RS.render.VehicleRenderer.flicker(this.vehicleGroup, s > 0.02, false, s);
    }
    if (this._glow) {
      this._glow.intensity = bf
        ? s * (2.4 + Math.random() * 1.8)      // the bore mouth glows hotter as it packs
        : s * (1.6 + Math.random() * 0.8);
    }

    if (this._exhaust) {
      if (bf) {
        // a WALL of ground smoke that grows over the 5 s pressure build,
        // emitted from the real (rail-tilted) nozzle centre
        var gnoz = this._nozzleWorld();
        this._exhaust.update(this._gate === 'prelaunch' ? 0 : dt, {
          x: 0, y: 0, v: 0,
          powered: this._gate !== 'prelaunch',
          padLocked: true, bigPlume: true, buoyant: false,
          buildFactor: s,
          exhaustY: this._exhaustY,
          nozzleX: gnoz && gnoz.x, nozzleY: gnoz && gnoz.y, nozzleZ: gnoz && gnoz.z,
          exhaustDir: gnoz && gnoz.dir
        });
      } else {
        this._exhaust.update(this._gate === 'prelaunch' ? 0 : dt, {
          x: 0, y: 0, v: 0,
          powered: this._gate !== 'prelaunch',
          wisp: true, buoyant: true, padLocked: true,
          exhaustY: this._exhaustY
        });
      }
    }

    if (this._festival) {
      this._festival.update(dt || 0.016, {
        x: (st.position && st.position.x) || 0, y: st.altitude || 0, z: 0
      });
    }

    this._masterT = this.flight.time;
    this._updateCamera(st.altitude || 0, st);
    this._updateHud(st);
    this._drainHaiku(dt);
    this.scene.renderOnce();
    this._syncScrub();
  };

  // ---- THE POETRY — haiku overlay -------------------------------------
  FlightScreen.prototype._maybeHaiku = function (key, linger) {
    if (!HAIKU[key]) return;
    var now = this.flight ? this.flight.time : 0;
    if (now - this._lastHaikuT < 13) return;
    this._lastHaikuT = now;
    this._showHaiku(HAIKU[key], linger);
  };

  FlightScreen.prototype._showHaiku = function (lines, linger) {
    if (!this.elHaiku || !lines) return;
    this._haikuQueue.push({ lines: lines, linger: (linger || 4600) / 1000 });
    if (!this._haikuActive) this._nextHaiku();
  };

  FlightScreen.prototype._nextHaiku = function () {
    var h = this._haikuQueue.shift();
    if (!h) { this._haikuActive = false; return; }
    this._haikuActive = true;
    this._haikuFading = false;
    this.elHaiku.innerHTML = h.lines.map(function (l) {
      return '<span>' + esc(l) + '</span>';
    }).join('');
    this.elHaiku.hidden = false;
    void this.elHaiku.offsetWidth;
    this.elHaiku.classList.add('show');
    this._haikuTimer = Math.max(2.5, h.linger);
  };

  FlightScreen.prototype._drainHaiku = function (dt) {
    if (!this._haikuActive) return;
    this._haikuTimer -= (dt || 0.016);
    if (this._haikuTimer > 0) return;
    if (!this._haikuFading) {
      this._haikuFading = true;
      this.elHaiku.classList.remove('show');
      this._haikuTimer = 2.8;
    } else {
      this.elHaiku.hidden = true;
      this._haikuActive = false;
      this._haikuFading = false;
      this._nextHaiku();
    }
  };

  // ---- per-open setup --------------------------------------------------
  FlightScreen.prototype.open = function (simResult, vehicle, mission, opts) {
    if (!this.available) return;
    opts = opts || {};
    var meta = (simResult && simResult.meta) || {};
    this._mission = mission || null;
    this._vehicle = vehicle || null;
    this._simOpts = opts.simOpts || null;
    this.root.hidden = false;

    if (this._chromeTimer) { global.clearTimeout(this._chromeTimer); this._chromeTimer = 0; }
    if (opts.cinematic) {
      this._chromeHidden = true;
      this.root.classList.add('fs-cinematic');
      var self = this;
      this._chromeTimer = global.setTimeout(function () { self._revealChrome(); }, 3000);
    } else {
      this._chromeHidden = false;
      this.root.classList.remove('fs-cinematic');
    }
    this._buildScene();
    if (!this.scene.available) { this.root.hidden = true; return; }

    // ---- SKY — a Bang Fai is launched in broad DAYLIGHT (you must see the
    //  plume); a khom loy is released after dark; every other rocket = dusk.
    var buoy = (simResult && simResult.mode) === 'buoyancy';
    this._bangfai = !!(meta.launchAngleDeg && +meta.launchAngleDeg > 0);
    // a V-2 flies a ballistic gyro-guidance program at a sea target
    this._v2 = !!(simResult && simResult.summary && simResult.summary.targeting);
    // a Sky-Atlas firework: watch it burst against a target box in a night sky
    this._fw = !!(opts.firework);
    this._fwOpts = opts.firework || null;
    this._fwBox = (opts.firework && opts.firework.box) || null;
    this._fwColorHex = (opts.firework && opts.firework.colorHex) || '#ffc247';
    this._fwRetry = opts.onRetry || null;
    this._fwBursted = false;
    this._lastVerdict = null;
    var wantDay = (!!opts.daylight || this._bangfai || this._v2) && !buoy;
    this._applySky(this._fw ? 'night' : buoy ? 'night' : (wantDay ? 'day' : 'dusk'));

    // ---- rebuild the fleet from scratch -------------------------------
    if (this._exhaust) this._exhaust.reset();
    this._clearDebris();
    this._disposeFleet();
    this._focusIdx = 0;
    this._addVehicle(simResult, { t0: 0, primary: true });
    this._masterT = 0;
    this._masterDur = this._vehicles[0].flight.duration;
    this._canLaunchNext = this._bangfai || this._v2;
    this._playing = false;
    this._clearBlasts();
    if (this._sound) this._sound.stopAll();

    // ---- launch structure — angled scaffold for a Bang Fai, else the pad ----
    var la = +meta.launchAngleDeg || 0;
    var angled = la > 0 && la < 89;
    if (angled && RS.render.makeLaunchRig) {
      if (!this._launchRig || Math.abs(this._rigAngle - la) > 1) {
        if (this._launchRig) RS.render.VehicleRenderer.disposeGroup(this._launchRig);
        this._launchRig = RS.render.makeLaunchRig(la);
        this._rigAngle = la;
        if (this._launchRig) {
          this._launchRig.traverse(function (m) {
            if (m.isMesh) { m.receiveShadow = true; m.castShadow = true; }
          });
          this.scene.add(this._launchRig);
        }
      }
      if (this._launchRig) this._launchRig.visible = true;
      if (this._pad) this._pad.visible = false;
      if (this._firingTable) this._firingTable.visible = false;
    } else if (this._v2 && RS.render.makeV2FiringTable) {
      // ---- a historically inspired V-2 firing table ----
      if (!this._firingTable) {
        this._firingTable = RS.render.makeV2FiringTable();
        if (this._firingTable) {
          this._firingTable.traverse(function (m) {
            if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
          });
          this.scene.add(this._firingTable);
        }
      }
      if (this._firingTable) this._firingTable.visible = true;
      if (this._launchRig) this._launchRig.visible = false;
      if (this._pad) this._pad.visible = false;
    } else {
      if (this._launchRig) this._launchRig.visible = false;
      if (this._firingTable) this._firingTable.visible = false;
      if (this._pad) this._pad.visible = true;
    }

    this.flight.seek(0);
    this._sim = simResult;
    this._camTX = this._camTY = null;
    this._vmax = 0;
    this._autopsyShown = false;
    this.autopsy.hidden = true;
    if (this.elVerdict) this.elVerdict.hidden = true;
    this._rateIdx = 1; this.flight.setRate(1); this.btnRate.textContent = '1×';
    this._camIdx = buoy ? CAM_MODES.indexOf('observer')
      : this._v2 ? CAM_MODES.indexOf('observer') : CAM_MODES.indexOf('chase');
    this.btnCam.textContent = CAM_LABEL[CAM_MODES[this._camIdx]];
    // a cinematic slightly-elevated 3/4 wide shot of the pad — not craned
    // straight up at the rocket (the raised observer eye does the "across")
    this._theta = this._v2 ? 0.62 : 0.7;
    this._phi = 1.12;
    this._zoom = 1; this._camX = 0;
    if (THREE) this._obsEye.set(this._v2 ? -16 : -8, this._v2 ? 5.5 : 1.7, this._v2 ? 44 : 33);
    this._mapLook = null; this._mapEase = null;
    if (global.gsap) global.gsap.killTweensOf(this);
    this._obsYaw = 0; this._obsPitch = 0;
    this._phaseText = 'อยู่บนแท่น';
    this._hideToast();
    this._buildMarkers(this._collectEvents(), this._masterDur);

    // Era-1 / Era-3 fleet controls
    if (this.btnLaunchNext) {
      this.btnLaunchNext.hidden = !(this._bangfai || this._v2);
      this.btnLaunchNext.textContent = this._v2 ? '🚀 ยิง V-2 ลูกต่อไป' : '🚀 จุดบั้งต่อไป';
    }
    this._refreshFocusBtn();

    // Era-3 · position the sea target from the sim's target range
    if (this._v2) { this._targetBearing = 90; this._azimuth = 90; this._syncAim(); }
    if (this.elLaunchSeq) this.elLaunchSeq.hidden = true;
    if (this.elCountdown) this.elCountdown.hidden = true;

    // Sky Atlas · fireworks — the glowing target box + a spectator camera
    this._clearFwBursts();
    if (this.vehicleGroup) this.vehicleGroup.visible = true;
    this._buildFwTargetBox();
    if (this._fw) {
      this._camIdx = CAM_MODES.indexOf('ground');
      this.btnCam.textContent = CAM_LABEL.ground;
      this._phaseText = 'พร้อมจุดพลุ';
    }

    // ---- THE RELEASE — manual two-step ignition for a khom loy -----------
    this._haikuQueue.length = 0;
    this._haikuActive = this._haikuFading = false;
    this._lastHaikuT = -1e9;
    if (this.elHaiku) { this.elHaiku.hidden = true; this.elHaiku.classList.remove('show'); }

    var holdT = (simResult.summary && simResult.summary.holdTime != null)
      ? simResult.summary.holdTime
      : ((simResult.events || []).filter(function (e) { return e.type === 'LIFTOFF'; })[0] || {}).time;
    // both a khom loy AND a Bang Fai get the manual two-step ignition gate
    var canGate = !!(opts.cinematic && this.btnIgnite && (buoy || this._bangfai) &&
      holdT != null && holdT > 0.02);

    if (this._v2 && opts.cinematic && this.btnIgnite) {
      // ---- Era 3 · V-2 manual launch sequence : aim → Ready → T-10 ----
      this._gate = 'aim';
      this._liftoffTime = (holdT != null && holdT > 0) ? holdT : 0.02;
      this.flight.seek(0);
      if (this.elLaunchSeq) this.elLaunchSeq.hidden = false;
      this.btnIgnite.hidden = false;
      this.btnIgnite.disabled = false;
      this.btnIgnite.classList.add('ready');
      this.btnIgnite.textContent = '🚀 พร้อมยิง (Ready)';
      this._phaseText = 'ตั้งทิศยิง แล้วกด "พร้อมยิง"';
      this._camIdx = CAM_MODES.indexOf('observer');
      this.btnCam.textContent = CAM_LABEL.observer;
    } else if (canGate) {
      this._gate = 'prelaunch';
      this._liftoffTime = holdT;
      // the Bang Fai needs a FULL ~5 s of packed-bore pressure build (huge
      // smoke) before it will creep off the rail
      this._igniteDur = this._bangfai ? 5.2 : clamp(holdT * 1.7, 5, 11);
      this._ignT = 0;
      this.flight.seek(0);
      this.btnIgnite.hidden = false;
      this.btnIgnite.disabled = false;
      this.btnIgnite.classList.remove('ready');
      this.btnIgnite.textContent = this._bangfai ? '🔥 จุดชนวน' : '🔥 จุดไฟ';
      this._phaseText = this._bangfai
        ? 'จ่อชนวนที่ก้นบั้งไฟ — พร้อมจุด' : 'ประคองโคมไว้ — รอจุดไฟ';
      // watch the rail + the billowing ground smoke from a planted low angle
      if (this._bangfai) this._camIdx = CAM_MODES.indexOf('observer');
    } else {
      this._gate = null;
      if (this.btnIgnite) {
        this.btnIgnite.hidden = true;
        this.btnIgnite.disabled = false;
        this.btnIgnite.classList.remove('ready');
      }
    }

    if (this._festival) {
      this._festival.resetCompanions();
      var self2 = this;
      this._festival.onEncounter = function () { self2._maybeHaiku('encounter', 4800); };
    }

    this._syncAliases();
    this.scene.resize();
    this._renderFrame(this.flight.sampleAt(0));
    this._last = perfNow();
    if (!this._gate) this.play();
    if (!this._raf) this._loop();
  };

  FlightScreen.prototype.close = function () {
    this._playing = false;
    if (this._raf) { global.cancelAnimationFrame(this._raf); this._raf = 0; }
    if (this._chromeTimer) { global.clearTimeout(this._chromeTimer); this._chromeTimer = 0; }
    this.root.classList.remove('fs-cinematic');
    this._chromeHidden = false;
    this._gate = null;
    if (this._sound) this._sound.stopAll();
    if (this.btnIgnite) { this.btnIgnite.hidden = true; this.btnIgnite.classList.remove('ready'); }
    if (this.btnLaunchNext) this.btnLaunchNext.hidden = true;
    if (this.btnFocus) this.btnFocus.hidden = true;
    if (this.elHaiku) { this.elHaiku.hidden = true; this.elHaiku.classList.remove('show'); }
    this._haikuActive = this._haikuFading = false;
    this._haikuQueue.length = 0;
    this._clearDebris();
    this._clearBlasts();
    this._clearFwBursts();
    if (this._fwTargetBox) this._fwTargetBox.visible = false;
    if (this.elLaunchSeq) this.elLaunchSeq.hidden = true;
    if (this.elCountdown) this.elCountdown.hidden = true;
    if (this._firingTable) this._firingTable.visible = false;
    if (this._targetZone) this._targetZone.visible = false;
    if (this._aimMarker) this._aimMarker.visible = false;
    if (this._impactMarker) this._impactMarker.visible = false;
    this.root.hidden = true;
  };

  FlightScreen.prototype._buildMarkers = function (events, duration) {
    if (!this.marks) return;
    this.marks.innerHTML = '';
    if (!duration) return;
    events.forEach(function (e) {
      var tick = document.createElement('span');
      tick.className = 'fs-mark';
      tick.style.left = clamp(e.time / duration * 100, 0, 100) + '%';
      tick.style.background = EVENT_COLOR[e.type] || '#9db4d8';
      tick.title = (LABEL_TH[e.type] || e.type) + ' · ' + e.time.toFixed(1) + 's';
      this.marks.appendChild(tick);
    }, this);
  };

  function poweredUntil(traj) {
    if (!traj || !traj.length) return 0;
    var peak = 0, t = 0;
    traj.forEach(function (s) { peak = Math.max(peak, (s.thrust || 0) + (s.buoyancy || 0)); });
    if (peak <= 0) return 0;
    traj.forEach(function (s) {
      if ((s.thrust || 0) + (s.buoyancy || 0) > 0.05 * peak) t = s.time;
    });
    return t;
  }

  // ---- LAUNCH NEXT — a fresh rocket on the pad / rail, mid-flight ------
  FlightScreen.prototype._launchNext = function () {
    if (!this._canLaunchNext || !this.scene || !this.scene.available || this._gate) return;
    if (this._vehicles.length >= 8) {
      this._showToast('บนฟ้าเยอะพอแล้ว! (สูงสุด 8 ลูก)');
      return;
    }
    if (!this._vehicle) return;
    var model = this._vehicle.toPhysicsModel();
    if (!model || !model.valid) return;
    // give each fresh V-2 its own analog-gyro drift so the dispersion varies
    var op = this._simOpts || {};
    if (op.target) {
      op = { dt: op.dt, sampleEvery: op.sampleEvery, wind: op.wind, safeZoneRadius: op.safeZoneRadius,
        target: { range: op.target.range, gyroDrift: op.target.gyroDrift,
          seed: (op.target.seed || 3.1) + this._vehicles.length * 17.3 } };
    }
    var sim = RS.Physics.simulate(model, op);
    var rec = this._addVehicle(sim, { t0: this._masterT });
    this._masterDur = Math.max(this._masterDur, rec.t0 + rec.flight.duration);
    this._focusIdx = this._vehicles.length - 1;
    this._camTX = this._camTY = null;
    this._syncAliases();
    this._refreshFocusBtn();
    this._buildMarkers(this._collectEvents(), this._masterDur);
    this._autopsyShown = false;
    this.autopsy.hidden = true;
    this._revealChrome();
    if (!this._playing) this.play();
    this._phaseText = this._v2 ? 'ยิง V-2 ลูกต่อไป' : 'จุดบั้งต่อไป';
    this._showToast(this._v2
      ? ('🚀 ยิง V-2 ลูกที่ ' + this._vehicles.length + ' จากฐานยิง!')
      : ('🚀 จุดบั้งไฟลูกที่ ' + this._vehicles.length + ' — ยิงจากราง!'));
  };

  // ---- transport -------------------------------------------------------
  FlightScreen.prototype.play = function () {
    if (this._masterDur > 0 && this._masterT >= this._masterDur - 1e-3) {
      this._masterT = 0; this._vmax = 0;
      this._autopsyShown = false; this.autopsy.hidden = true;
      this._vehicles.forEach(function (r) {
        r.flight.seek(0); r._igniteSfx = false; r._igniteVoice = null;
      });
    }
    this._playing = true;
    this._reflectPlay();
  };
  FlightScreen.prototype.pauseIt = function () { this._playing = false; this._reflectPlay(); };
  FlightScreen.prototype.togglePlay = function () {
    if (this._gate) return;
    this._playing ? this.pauseIt() : this.play();
  };
  FlightScreen.prototype._reflectPlay = function () {
    this.btnPlay.textContent = this._playing ? '⏸' : '▶';
  };

  FlightScreen.prototype._restart = function () {
    this._masterT = 0;
    this._vmax = 0;
    this._autopsyShown = false;
    this.autopsy.hidden = true;
    this._phaseText = 'อยู่บนแท่น';
    this._vehicles.forEach(function (r) {
      r.flight.seek(0); r._igniteSfx = false;
      if (r._igniteVoice) { try { r._igniteVoice.pause(); } catch (e) {} r._igniteVoice = null; }
      // un-break the vehicle: re-show the whistle nose, clear the flag
      if (r.group && r.group.userData) {
        r.group.userData.brokenUp = false;
        r.group.traverse(function (m) { if (m.userData && m.userData.isNoseWhistle) m.visible = true; });
      }
    });
    this._clearDebris();
    this._clearBlasts();
    this._clearFwBursts();
    if (this.vehicleGroup) this.vehicleGroup.visible = true;
    if (this._sound) this._sound.stopAll();
    this._syncScrub();
    this.play();
  };

  // ---- step every vehicle forward to (masterT - t0) -------------------
  FlightScreen.prototype._stepVehicles = function () {
    for (var i = 0; i < this._vehicles.length; i++) {
      var rec = this._vehicles[i];
      var lt = this._masterT - rec.t0;
      rec.flight.playing = this._playing;
      if (lt <= 0) { rec.flight.seek(0); rec._igniteSfx = false; continue; }
      if (this._scrubbing) rec.flight.seek(clamp(lt, 0, rec.flight.duration));
      else rec.flight.advanceTo(lt);

      // the หมื่อ catching on the rail — a rising bed of sound just before the
      // liftoff whoosh. Only the dirty hand-rammed motor gets it (the Bang Fai).
      if (rec.dirtyExhaust && !rec._igniteSfx && !this._scrubbing) {
        var s = rec.flight.sampleAt(rec.flight.time);
        if (s && s.thrust > 0.01 && rec.flight.time < 4) {
          rec._igniteSfx = true;
          rec._igniteVoice = this._sound
            ? this._sound.play('ignite', { volume: (i === this._focusIdx) ? 0.5 : 0.32 })
            : null;
        }
      }
    }
  };

  // ---- main loop ------------------------------------------------------
  FlightScreen.prototype._loop = function () {
    var self = this;
    this._raf = global.requestAnimationFrame(function () { self._loop(); });
    var t = perfNow(), dt = Math.min((t - this._last) / 1000, 0.05);
    this._last = t;
    this._frameDt = dt;

    if (this._gate === 'countdown') { this._countdownFrame(dt); return; }
    if (this._gate) { this._gateFrame(dt); return; }

    var rate = RATES[this._rateIdx] || 1;
    if (this._playing && !this._scrubbing) {
      this._masterT = Math.min(this._masterT + dt * rate, this._masterDur);
      if (this._masterT >= this._masterDur - 1e-3) this._playing = false;
    }

    this._stepVehicles();
    this._syncAliases();
    if (this._earth && RS.render.EarthGlobe) RS.render.EarthGlobe.update(this._earth, dt);

    var st = this.flight.sampleAt(this.flight.time);
    this._renderFrame(st);
    this._drainHaiku(dt);
    if (!this._scrubbing) this._syncScrub();
    this._reflectPlay();

    if (!this._scrubbing && !this._autopsyShown && this._masterDur > 0 &&
        this._masterT >= this._masterDur - 1e-3) {
      this._showAutopsy();
    }
  };

  FlightScreen.prototype._syncScrub = function () {
    var f = this._masterDur > 0 ? this._masterT / this._masterDur : 0;
    this.scrub.value = String(Math.round(f * 1000));
    this.scrub.style.setProperty('--fs-pos', (f * 100).toFixed(1) + '%');
  };

  // ---- render one frame (trails + glows + camera + exhaust + HUD) -----
  FlightScreen.prototype._renderFrame = function (st) {
    if (!st) return;
    var alt = st.altitude;

    // every vehicle: progressive trail + its own exhaust glow
    for (var i = 0; i < this._vehicles.length; i++) {
      var rec = this._vehicles[i];
      if (rec.trail && rec.trailN) {
        var dur = rec.flight.duration || 1;
        var idx = Math.round((rec.flight.time / dur) * (rec.trailN - 1));
        rec.trail.geometry.setDrawRange(0, clamp(idx + 1, 1, rec.trailN));
      }
      if (rec.glow) {
        var active = this._masterT >= rec.t0 &&
          rec.flight.time <= rec._poweredUntil + 0.01 && rec.flight.time > 1e-4;
        var gb = active ? 2.2 + Math.random() * 1.2 : 0;
        if (i === this._focusIdx && this._glowPulse > 0) {
          gb += this._glowPulse * 6; this._glowPulse *= 0.86;
        }
        rec.glow.intensity = gb;
      }
    }

    var fRec = this._focusedRec();
    var powered = !!fRec && fRec.flight.time <= fRec._poweredUntil + 0.01 &&
      this._masterT >= fRec.t0;

    // ---- EXTINGUISH — the instant it hits the ground, kill every engine FX
    if (st.crashed) {
      powered = false;
      if (this._glow) this._glow.intensity = 0;
      if (RS.render.VehicleRenderer && this.vehicleGroup) {
        RS.render.VehicleRenderer.flicker(this.vehicleGroup, false, false);
      }
      // ---- THE BOOM — one massive fireball + dust ring on impact --------
      if (fRec && !this._blasted[fRec.id]) {
        var s = this._summary || {};
        if ((s.impactSpeed || st.speed || 0) > 18 || (s.damageRadius || 0) > 6) {
          this._blasted[fRec.id] = true;
          this._spawnBlast((st.position && st.position.x) || 0, 0,
            (st.position && st.position.z) || 0, s.damageRadius || 12);
        }
      }
    }
    this._updateBlast(this._frameDt || 0.016);
    if (this._v2 && RS.render.OrbitalEnv && this._targetZone) {
      RS.render.OrbitalEnv.update(this._targetZone, this._frameDt || 0.016);
    }

    // ---- SKY ATLAS · the firework burst -----------------------------
    if (this._fwTargetBox) this._fwTargetBox.visible = this._fw;
    if (this._fw && !this._fwBursted && this._summary && this._summary.burst) {
      var bu = this._summary.burst;
      if ((bu.occurred || bu.dud) && this.flight.time >= (bu.time || 1e9) - 1e-3) {
        var bx2 = (st.position && st.position.x) || 0;
        var by2 = bu.dud ? 1.5 : (bu.altitude || st.altitude || 0);
        var bz2 = (st.position && st.position.z) || 0;
        this._spawnFwBurst(bx2, by2, bz2, this._fwColorHex, bu.dud);
      }
    }
    this._updateFwBursts(this._frameDt || 0.016);

    // APOGEE BREAKUP — hide the whistle nose + spawn falling debris, once
    if (st.brokenUp && this.vehicleGroup && !this.vehicleGroup.userData.brokenUp) {
      this._doBreakup(st);
    }
    this._updateDebris(this._frameDt || 0.016);

    if (this._exhaust) {
      var noz = this._nozzleWorld();
      this._exhaust.update(this._playing ? (this._frameDt || 0.016) : 0, {
        x: (st.position && st.position.x) || 0,
        y: (st.position && st.position.y) || 0,
        v: st.velocity,
        powered: powered && st.altitude < 45000,
        padLocked: !!st.padLocked,
        crashed: !!st.crashed,
        buoyant: this.flight.buoyant,
        bigPlume: this._dirtyExhaust,
        exhaustY: this._exhaustY,
        nozzleX: noz && noz.x, nozzleY: noz && noz.y, nozzleZ: noz && noz.z,
        exhaustDir: noz && noz.dir
      });
    }

    if (this._festival) {
      this._festival.update(this._frameDt || 0.016, {
        x: (st.position && st.position.x) || 0,
        y: st.altitude || 0,
        z: (st.position && st.position.z) || 0
      });
    }

    this._updateCamera(alt, st);
    this._recomputePhase(this.flight.time);
    this._updateHud(st);
    this.scene.renderOnce();
  };

  // the WORLD position + outward direction of the focused vehicle's nozzle
  // (rotated with the vehicle) — so exhaust never emits from the bounding-box
  // axis / the side of the tail stick
  FlightScreen.prototype._nozzleWorld = function () {
    var g = this.vehicleGroup;
    if (!g || !THREE) return null;
    if (!this._nozL) {
      this._nozL = new THREE.Vector3(); this._nozW = new THREE.Vector3();
      this._nozD = new THREE.Vector3();
    }
    var lx = (g.userData && g.userData.exhaustX) || 0;
    var lz = (g.userData && g.userData.exhaustZ) || 0;
    this._nozL.set(lx, this._exhaustY, lz);
    g.updateMatrixWorld();
    this._nozW.copy(this._nozL).applyMatrix4(g.matrixWorld);
    this._nozD.set(0, -1, 0).applyQuaternion(g.quaternion);
    return {
      x: this._nozW.x, y: this._nozW.y, z: this._nozW.z,
      dir: { x: this._nozD.x, y: this._nozD.y }
    };
  };

  // ---- APOGEE BREAKUP — hide the whistle + spawn tumbling debris ----------
  FlightScreen.prototype._doBreakup = function (st) {
    var where = RS.render.VehicleRenderer.breakup(this.vehicleGroup);
    var px = where ? where.x : ((st.position && st.position.x) || 0);
    var py = where ? where.y : ((st.position && st.position.y) || 0);
    var pz = where ? where.z : 0;
    var vx = st.vx || 0, vy = st.velocity || 0;
    for (var i = 0; i < 5; i++) {
      var m = new THREE.Mesh(
        new THREE.BoxGeometry(0.12 + Math.random() * 0.22, 0.5 + Math.random() * 1.4, 0.12),
        new THREE.MeshStandardMaterial({ color: i % 2 ? 0x9a7b45 : 0xc9b487, roughness: 0.9 })
      );
      m.position.set(px + (Math.random() - 0.5) * 1.2, py + (Math.random() - 0.5) * 1.2, pz);
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      this.scene.add(m);
      this._debris.push({
        mesh: m,
        vx: vx + (Math.random() - 0.5) * 9,
        vy: vy + (Math.random() - 0.5) * 9 + 2,
        spin: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8)
      });
    }
    this._showToast('แตกที่จุดสูงสุด! — หัวโหวดไหม้ทะลุ โครงหัก บั้งไฟตีลังกาลง');
    this._phaseText = 'แตกที่จุดสูงสุด — ตีลังกาลง';
  };

  FlightScreen.prototype._updateDebris = function (dt) {
    if (!this._debris || !this._debris.length) return;
    for (var i = this._debris.length - 1; i >= 0; i--) {
      var d = this._debris[i];
      d.vy -= 9.8 * dt;
      // a little air drag so the light bamboo bits flutter down, not plummet
      d.vx *= (1 - 0.6 * dt); d.vy *= (1 - 0.25 * dt);
      d.mesh.position.x += d.vx * dt;
      d.mesh.position.y += d.vy * dt;
      d.mesh.rotation.x += d.spin.x * dt;
      d.mesh.rotation.y += d.spin.y * dt;
      d.mesh.rotation.z += d.spin.z * dt;
      if (d.mesh.position.y <= 0.1) {
        this.scene.remove(d.mesh);
        d.mesh.geometry.dispose(); d.mesh.material.dispose();
        this._debris.splice(i, 1);
      }
    }
  };

  FlightScreen.prototype._clearDebris = function () {
    var self = this;
    (this._debris || []).forEach(function (d) {
      if (self.scene) self.scene.remove(d.mesh);
      d.mesh.geometry.dispose(); d.mesh.material.dispose();
    });
    this._debris = [];
  };

  FlightScreen.prototype._updateCamera = function (alt, st) {
    var cam = this.scene.camera;
    var mode = CAM_MODES[this._camIdx];
    var RE = this._RE || 600000;

    // fog hugs the near-pad views; drop it for the orbital map, up in vacuum,
    // and once a planted observer cam is far enough from a high rocket that the
    // haze would swallow it
    var wantFog = this.scene.fog && mode !== 'map' && alt < 60000 &&
      !(mode === 'observer' && alt > 260);
    this.scene.scene.fog = wantFog ? this.scene.fog : null;

    var wantFov = (mode === 'observer') ? clamp(55 * this._zoom, 15, 75) : 50;
    if (Math.abs(cam.fov - wantFov) > 1e-3) { cam.fov = wantFov; cam.updateProjectionMatrix(); }

    var vx = (st && st.position) ? st.position.x : 0;
    var vy = (st && st.position) ? st.position.y : 0;
    if (this._camTX == null) { this._camTX = vx; this._camTY = vy; }
    var k = this._playing ? 0.08 : 0.5;
    this._camTX += (vx - this._camTX) * k;
    this._camTY += (vy - this._camTY) * k;
    var tx = this._camTX, ty = this._camTY;

    // orbital-map POI markers only live in map mode; the vehicle marker rides
    // the focused rocket's world position
    var inMap = (mode === 'map');
    // the Fresnel atmosphere rim is a from-space effect — show it in the map
    // view or once the rocket is genuinely high, not down at the pad
    if (this._earth && this._earth.userData && this._earth.userData.glow) {
      this._earth.userData.glow.visible = inMap || alt > 80000;
    }
    // the Blue Marble's dedicated sun only burns in the map view
    if (this._earthSun) this._earthSun.intensity = (inMap || alt > 120000) ? 2.6 : 0;
    if (this._launchMarker) this._launchMarker.visible = inMap;
    if (this._launchHalo) this._launchHalo.visible = inMap;

    // ---- Era 3 · the sea target zone (near + map) + aim / impact pins (map) ----
    if (this._targetZone) this._targetZone.visible = this._v2 && (inMap || alt < 20000);
    if (this._aimMarker) {
      this._aimMarker.visible = this._v2 && inMap &&
        Math.abs(this._azimuth - this._targetBearing) > 2 && !this._autopsyShown;
    }
    if (this._impactMarker) this._impactMarker.visible = this._v2 && inMap && this._autopsyShown;
    var vpz = (st && st.position) ? st.position.z : 0;
    if (this._vehMarker) {
      var showVeh = inMap && (vy > RE * 0.0008);   // hide it while still on the pad
      this._vehMarker.visible = showVeh;
      if (this._vehHalo) this._vehHalo.visible = showVeh;
      if (showVeh) {
        this._vehMarker.position.set(vx, vy, vpz);
        if (this._vehHalo) this._vehHalo.position.set(vx, vy, vpz);
      }
    }

    var sp = Math.sin(this._phi), cp = Math.cos(this._phi);
    var sth = Math.sin(this._theta), cth = Math.cos(this._theta);

    if (mode === 'map') {
      var pcy = -RE;
      // no-GSAP fallback: ease theta / phi / zoom / look toward a stored POI
      if (this._mapEase) {
        var e = this._mapEase, ke = 0.10;
        this._theta += (e.theta - this._theta) * ke;
        this._phi   += (e.phi   - this._phi)   * ke;
        this._zoom  += (e.zoom  - this._zoom)  * ke;
        if (this._mapLook && e.look) this._mapLook.lerp(e.look, ke);
        if (Math.abs(e.theta - this._theta) < 0.003 &&
            Math.abs(e.zoom - this._zoom) < 0.01) this._mapEase = null;
        sp = Math.sin(this._phi); cp = Math.cos(this._phi);
        sth = Math.sin(this._theta); cth = Math.cos(this._theta);
      }
      var lookX = this._mapLook ? this._mapLook.x : 0;
      var lookY = this._mapLook ? this._mapLook.y : pcy;
      var lookZ = this._mapLook ? this._mapLook.z : 0;
      var dist = RE * 2.6 * clamp(this._zoom, 0.12, 6);
      cam.position.set(lookX + dist * sp * sth, lookY + dist * cp, lookZ + dist * sp * cth);
      cam.lookAt(lookX, lookY, lookZ);
      return;
    }

    var focus = alt + Math.min(this._vehH * 0.5, 2.5);

    if (mode === 'observer') {
      var eye = this._obsEye;
      var horiz = Math.hypot(tx - eye.x, 0 - eye.z) || 0.001;
      var aimY = eye.y + clamp((this._camTY - eye.y) * 0.55, -2, horiz * 1.6);
      var dir = this._obsTmp.set(tx - eye.x, aimY - eye.y, 0 - eye.z);
      cam.position.copy(eye);
      cam.lookAt(eye.x + dir.x, eye.y + dir.y, eye.z + dir.z);
      return;
    }

    if (mode === 'ground') {
      // a firework spectator sits well back so the whole arc + target box frame up
      var gd = (this._fw
        ? clamp(70 + alt * 0.55, 70, 220)
        : clamp(10 + alt * 0.02, 10, 400)) * clamp(this._zoom, 0.5, 3);
      cam.position.set(gd * sth, this._fw ? 6 : 1.3, gd * cth);
      cam.lookAt(tx, this._fw ? Math.max(vy, (this._fwBox ? (this._fwBox[0] + this._fwBox[1]) / 2 : 60))
        : Math.max(vy, focus), 0);

    } else if (mode === 'free') {
      var fr = clamp(40 * this._zoom, 2.5, RE * 3);
      var tg = this._freeTarget;
      cam.position.set(tg.x + fr * sp * sth, tg.y + fr * cp, tg.z + fr * sp * cth);
      cam.lookAt(tg);

    } else {
      var cr = clamp((14 + alt * 0.06) * this._zoom, 6, RE * 2);
      // on impact, pull back + lift so the fireball + dust ring read as a whole
      var crashLift = 0;
      if (st && st.crashed) { cr = Math.max(cr, 62); crashLift = 12; }
      cam.position.set(tx + cr * sp * sth, vy + cr * cp + crashLift, cr * sp * cth);
      cam.lookAt(tx, vy, 0);
    }
  };

  // ---- ORBITAL-MAP POI RAYCASTER ------------------------------------------
  //  Reset the map camera to its wide default framing (planet centre, 3/4 view).
  FlightScreen.prototype._resetMapView = function () {
    if (global.gsap) {
      global.gsap.killTweensOf(this);
      if (this._mapLook) global.gsap.killTweensOf(this._mapLook);
    }
    this._mapLook = null;
    this._mapEase = null;
    this._zoom = 1;
    this._theta = 0.7;
    this._phi = 1.12;
  };

  FlightScreen.prototype._pickMapPOI = function (e) {
    if (!THREE || !this.scene || !this.scene.camera) return;
    var rect = this.canvas.getBoundingClientRect();
    if (!this._ray) { this._ray = new THREE.Raycaster(); this._rayNdc = new THREE.Vector2(); }
    this._rayNdc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this._ray.setFromCamera(this._rayNdc, this.scene.camera);
    var targets = [];
    if (this._launchMarker) targets.push(this._launchMarker);
    if (this._launchHalo) targets.push(this._launchHalo);
    if (this._vehMarker && this._vehMarker.visible) targets.push(this._vehMarker);
    if (this._vehHalo && this._vehHalo.visible) targets.push(this._vehHalo);
    var hit = this._ray.intersectObjects(targets, false)[0];
    if (hit && hit.object && hit.object.userData) this._focusMapPOI(hit.object.userData.poi);
  };

  FlightScreen.prototype._focusMapPOI = function (which) {
    if (!THREE) return;
    var RE = this._RE || 600000;
    var centre = new THREE.Vector3(0, -RE, 0);
    var target, zoom;
    if (which === 'vehicle' && this._vehMarker && this._vehMarker.visible) {
      target = this._vehMarker.position.clone();
      zoom = 0.66;
    } else {
      which = 'launch';
      target = new THREE.Vector3(0, 0, 0);   // north pole of the globe = the pad
      zoom = 0.40;
    }
    var d = target.clone().sub(centre).normalize();
    var theta = Math.atan2(d.x, d.z);
    // shortest angular path from the current azimuth
    while (theta - this._theta > Math.PI) theta -= Math.PI * 2;
    while (theta - this._theta < -Math.PI) theta += Math.PI * 2;
    var phi = clamp(Math.acos(clamp(d.y, -1, 1)) - 0.12, 0.06, 1.45);
    var lookDest = centre.clone().lerp(target, which === 'launch' ? 0.82 : 0.68);

    this._mapLook = this._mapLook || centre.clone();
    if (global.gsap) {
      global.gsap.killTweensOf(this);
      global.gsap.to(this, {
        _theta: theta, _phi: phi, _zoom: zoom,
        duration: 1.5, ease: 'power3.inOut', overwrite: true
      });
      global.gsap.killTweensOf(this._mapLook);
      global.gsap.to(this._mapLook, {
        x: lookDest.x, y: lookDest.y, z: lookDest.z,
        duration: 1.5, ease: 'power3.inOut', overwrite: true
      });
      this._mapEase = null;
    } else {
      this._mapEase = { theta: theta, phi: phi, zoom: zoom, look: lookDest };
    }
    this._showToast(which === 'launch'
      ? 'โฟกัส: ฐานปล่อย (ประเทศไทย) — แตะยานเพื่อตามจรวด'
      : 'โฟกัส: ยานที่กำลังบิน — แตะหมุดฐานเพื่อกลับ');
  };

  FlightScreen.prototype._updateHud = function (st) {
    if (st.speed > this._vmax) this._vmax = st.speed;
    this.elTime.textContent = this._masterT.toFixed(1) + ' s';
    this.elAlt.textContent = fmtAlt(st.altitude);
    var arrow = st.velocity > 0.2 ? ' ▲' : (st.velocity < -0.2 ? ' ▼' : '');
    this.elVel.textContent = Math.abs(st.velocity).toFixed(1) + ' m/s' + arrow;
    this.elVmax.textContent = this._vmax.toFixed(1) + ' m/s';
    this.elMass.textContent = fmtMass(st.mass);
    this.elQ.textContent = Math.round(st.q) + ' Pa';
    if (this.elDrift) {
      var orb = this._summary && this._summary.orbit;
      if (orb && orb.achieved && this.flight.time > (this._orbitEventTime || 1e9) - 1) {
        this.elDrift.textContent = fmtAlt(orb.periapsis) + ' × ' + fmtAlt(orb.apoapsis);
      } else if (this._v2 && this._summary && this._summary.targeting) {
        this.elDrift.textContent = this._autopsyShown
          ? 'พลาด ' + fmtAlt(this._missTotal())
          : 'เป้า ' + fmtAlt(this._summary.targetRange) + ' · ทิศ ' + this._azimuth + '°';
      } else if (this._bangfai && this._vehicles.length > 1) {
        this.elDrift.textContent = 'บั้งไฟ ' + this._vehicles.length + ' ลูก';
      } else {
        var dx = (st.position && st.position.x) || 0;
        this.elDrift.textContent = fmtAlt(Math.abs(dx)) +
          (dx > 1 ? ' →' : (dx < -1 ? ' ←' : ''));
      }
    }
    this.elPhase.textContent = this._phaseText || '—';
  };

  FlightScreen.prototype._recomputePhase = function (t) {
    var evs = this.flight.events || [];
    var label = 'อยู่บนแท่น';
    for (var i = 0; i < evs.length; i++) {
      if (evs[i].time <= t) label = LABEL_TH[evs[i].type] || evs[i].type;
    }
    this._phaseText = label;
  };

  // total miss = physics range error ⊕ the cross-range from an azimuth that
  // wasn't pointed straight at the sea target (Phase 15)
  FlightScreen.prototype._missTotal = function () {
    var s = this._summary || {};
    var rangeMiss = s.missDistance || 0;
    var azErr = Math.abs((this._azimuth || 90) - (this._targetBearing || 90));
    var crossMiss = (s.targetRange || 0) * Math.sin(azErr * Math.PI / 180);
    return Math.sqrt(rangeMiss * rangeMiss + crossMiss * crossMiss);
  };

  // ---- Physics Autopsy report ------------------------------------
  FlightScreen.prototype._showAutopsy = function () {
    this._autopsyShown = true;
    this._revealChrome();
    this._renderVerdict();
    var s = this._summary || {};
    var orb = s.orbit || {};
    var cells = orb.achieved ? [
      ['วงโคจร (Peri × Apo)', fmtAlt(orb.periapsis) + ' × ' + fmtAlt(orb.apoapsis)],
      ['ความเยื้องศูนย์กลาง e', (orb.eccentricity || 0).toFixed(3)],
      ['คาบการโคจร', Math.round(orb.period || 0) + ' s'],
      ['ความเร็วสูงสุด', (s.maxVelocity || 0).toFixed(0) + ' m/s'],
      ['ท่อนที่สลัดทิ้ง', Math.max(0, (s.stagesFlown || 1) - 1) + ' ท่อน'],
      ['มวลเข้าวงโคจร', fmtMass(s.burnoutMass || 0)]
    ] : [
      ['ยอดสูง (Apogee)', fmtAlt(s.apogee || 0)],
      ['ความเร็วสูงสุด', (s.maxVelocity || 0).toFixed(1) + ' m/s'],
      ['ตกไกลจากฐาน', fmtAlt(Math.abs(s.downrange || s.impactX || 0))],
      ['ท่อนที่บิน', (s.stagesFlown || 1) + ' ท่อน'],
      ['เวลาบินรวม', (s.flightTime || 0).toFixed(1) + ' s'],
      ['มวลเมื่อเชื้อเพลิงหมด', fmtMass(s.burnoutMass || 0)]
    ];
    if (this._v2 && s.targeting) {
      cells = [
        ['ระยะยิงเป้า (กลางทะเล)', fmtAlt(s.targetRange || 0)],
        ['ตกจริง (Downrange)', fmtAlt(Math.abs(s.downrange || s.impactX || 0))],
        ['พลาดจากเป้า', fmtAlt(this._missTotal())],
        ['ความเร็วกระทบ', (s.impactSpeed || 0).toFixed(0) + ' m/s'],
        ['รัศมีความเสียหาย', fmtAlt(s.damageRadius || 0)],
        ['MECO', s.mecoTime != null ? s.mecoTime.toFixed(1) + ' s' : 'ไม่ถึงระยะ']
      ];
    }
    if (this._fw && s.burst) {
      var bu = s.burst, bx = this._fwBox || bu.box;
      cells = [
        ['ดอกพลุบานที่', bu.dud ? 'ด้าน (พื้น)' : fmtAlt(bu.altitude || 0)],
        ['กรอบเป้าหมาย', bx ? (bx[0] + '–' + bx[1] + ' ม.') : '—'],
        ['จุดสูงสุด (Apogee)', fmtAlt(s.apogee || 0) + ' @ ' + (s.apogeeTime || 0).toFixed(1) + ' s'],
        ['ชนวนหน่วงเวลา', (this._fwOpts ? this._fwOpts.fuse.toFixed(1) : (bu.time || 0).toFixed(1)) + ' s'],
        ['ผล', bu.dud ? '💨 ด้าน' : bu.inBox ? '🎯 ในกรอบ' : '✕ นอกกรอบ']
      ];
    }
    if (this._vehicles.length > 1) {
      cells.unshift([this._v2 ? 'V-2 ที่ยิงทั้งหมด' : 'บั้งไฟที่ปล่อยทั้งหมด',
        this._vehicles.length + ' ลูก']);
    }
    $('fs-autopsy-stats').innerHTML = cells.map(function (c) {
      return '<div class="fs-ap-stat"><span>' + c[0] + '</span><b>' + c[1] + '</b></div>';
    }).join('');

    var icon = { OK: '✓', WARN: '⚠', FAIL: '✕' };
    $('fs-autopsy-diag').innerHTML = (this._diagnostics.length
      ? this._diagnostics
      : [{ status: 'OK', message: 'ไม่มีผลวินิจฉัย' }]
    ).map(function (d) {
      return '<li class="fs-ap-diag ' + d.status + '"><span>' + (icon[d.status] || '•') + '</span>' +
        '<span><b>' + esc(d.message) + '</b>' +
        (d.detail ? '<i>' + esc(d.detail) + '</i>' : '') + '</span></li>';
    }).join('');

    this._renderWhyButton();
    this.autopsy.hidden = false;
  };

  // ---- the "WHY?" button — on a failed Sky Atlas mission, offer a Science Card
  FlightScreen.prototype._renderWhyButton = function () {
    var actions = $('fs-autopsy-actions') || (this.autopsy && this.autopsy.querySelector('.fs-ap-actions'));
    if (!actions) return;
    var old = $('fs-why-btn'); if (old) old.remove();
    var failed = this._lastVerdict && !this._lastVerdict.passed;
    var canWhy = failed && this._mission && this._mission.atlas &&
      RS.render.UI && RS.Diagnostics && RS.Diagnostics.scienceCard;
    if (!canWhy) return;
    var self = this;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'fs-why-btn';
    btn.className = 'fs-ap-btn fs-why';
    btn.textContent = '🤔 ทำไมถึงพลาด?';
    btn.addEventListener('click', function () {
      var card = RS.Diagnostics.scienceCard(self._mission, self._sim);
      RS.render.UI.openScienceCard(card, function () {
        self.close();
        if (self._fwRetry) self._fwRetry();
        else if (RS.render.UI.openDesignDesk) RS.render.UI.openDesignDesk(self._mission);
      });
    });
    actions.insertBefore(btn, actions.firstChild);
  };

  // ---- mission verdict banner ------------------------------------
  FlightScreen.prototype._renderVerdict = function () {
    var el = this.elVerdict; if (!el) return;
    var ME = RS.MissionEngine;
    if (!this._mission || !ME || !this._sim) { el.hidden = true; this._lastVerdict = null; return; }

    var r = ME.evaluate(this._mission, this._sim, this._vehicle);
    this._lastVerdict = r;
    var rows = [];
    r.objectives.concat(r.constraints).forEach(function (o) {
      rows.push('<li>' + (o.met ? '✓ ' : '✗ ') + esc(o.label) +
        ' <span style="color:#9db4d8">— ' + esc(o.actual) + '</span></li>');
    });
    if (r.passed) {
      rows.push('<li class="fs-ap-vscore">+' + r.score + ' คะแนน</li>');
    } else {
      r.failReasons.forEach(function (f) { rows.push('<li>' + esc(f) + '</li>'); });
    }

    el.className = 'fs-ap-verdict ' + (r.passed ? 'pass' : 'fail');
    el.innerHTML =
      '<h3>' + (r.passed ? 'MISSION ACCOMPLISHED' : 'MISSION FAILED') + '</h3>' +
      '<div class="fs-ap-vmission">' + esc(this._mission.title || this._mission.id) + '</div>' +
      '<ul>' + rows.join('') + '</ul>';
    el.hidden = false;
  };

  // ---- toast --------------------------------------------------------
  FlightScreen.prototype._showToast = function (msg) {
    var el = this.elToast; if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    el.classList.add('show');
    var self = this;
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(function () { self._hideToast(); }, 2600);
  };
  FlightScreen.prototype._hideToast = function () {
    if (!this.elToast) return;
    this.elToast.classList.remove('show');
    this.elToast.hidden = true;
  };

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  RS.render.FlightScreen = FlightScreen;

})(typeof window !== 'undefined' ? window : this);
