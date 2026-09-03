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
    MAX_Q:    'แรงดันอากาศสูงสุด',
    APOGEE:   'จุดสูงสุด',
    BURNOUT:  'เชื้อเพลิงหมด',
    LOSS_OF_CONTROL: 'เสียการควบคุม',
    MIDAIR_BURN: 'โคมไฟไหม้กลางอากาศ',
    IMPACT:   'แตะพื้น'
  };
  var EVENT_COLOR = {
    IGNITION: '#e9f1ff', LIFTOFF: '#5fe0a8', PITCH_OVER: '#b98cff', MAX_Q: '#5bd6ff',
    BURNOUT: '#ffb63a', APOGEE: '#ffce40', LOSS_OF_CONTROL: '#ff3b3b',
    MIDAIR_BURN: '#ff7420', IMPACT: '#ff6a5a'
  };
  var UP = THREE ? new THREE.Vector3(0, 1, 0) : null;
  var RATES = [0.5, 1, 2, 4];
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
      this._camIdx = mapIdx; this._zoom = 1;
      this.btnCam.textContent = CAM_LABEL.map;
    }
  };

  FlightScreen.prototype._cycleCam = function () {
    this._camIdx = (this._camIdx + 1) % CAM_MODES.length;
    var mode = CAM_MODES[this._camIdx];
    this.btnCam.textContent = CAM_LABEL[mode];
    this._zoom = 1;
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

    // ---- THE PLANET — a real sphere centred at (0, -RE) --------------
    var planet = new THREE.Mesh(
      new THREE.SphereGeometry(RE, 96, 64),
      new THREE.MeshStandardMaterial({ color: 0x1f5133, roughness: 1, metalness: 0 })
    );
    planet.position.set(0, -RE, 0);
    planet.receiveShadow = true;
    sc.add(planet);
    var atmo = new THREE.Mesh(
      new THREE.SphereGeometry(RE + ((RS.Physics && RS.Physics.ATMOS_TOP) || 70000), 64, 48),
      new THREE.MeshBasicMaterial({ color: 0x5aa9ff, transparent: true, opacity: 0.10,
        side: THREE.BackSide, depthWrite: false })
    );
    atmo.position.set(0, -RE, 0);
    sc.add(atmo);
    this._planet = planet;
    this._atmo = atmo;

    // ---- the DAYTIME SUN — a bright disc far along the key-light vector,
    //  shown only for Era-1 (Bang Fai) daylight, off for night / space
    var sun = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff4d6, fog: false, toneMapped: false })
    );
    sun.scale.setScalar(3200);
    sun.position.set(16000, 22000, 9000);
    sun.visible = false;
    var sunHalo = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffe6a8, transparent: true, opacity: 0.28,
        fog: false, depthWrite: false })
    );
    sunHalo.scale.setScalar(2.2);
    sun.add(sunHalo);
    sc.add(sun);
    this._sun = sun;

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

    // ---- near-pad ground that RECEIVES the sharp daytime shadow ------
    var dayGround = new THREE.Mesh(
      new THREE.CircleGeometry(900, 48),
      new THREE.MeshStandardMaterial({ color: 0x5f7245, roughness: 1, metalness: 0 })
    );
    dayGround.rotation.x = -Math.PI / 2;
    dayGround.position.y = 0.012;
    dayGround.receiveShadow = true;
    dayGround.visible = false;
    sc.add(dayGround);
    this._dayGround = dayGround;

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

    if (R) R.setClearColor(day ? 0x8fc4e8 : 0x05080f, 1);
    if (this._stars) this._stars.visible = !day;

    if (L) {
      L.hemi.intensity = day ? 0.95 : night ? 0.38 : 0.95;
      if (L.hemi.color && L.hemi.color.setHex) L.hemi.color.setHex(day ? 0xbfdcff : 0xbfd4ff);
      if (L.hemi.groundColor && L.hemi.groundColor.setHex)
        L.hemi.groundColor.setHex(day ? 0x7a8a63 : 0x25324a);
      L.key.intensity = day ? 1.95 : night ? 0.35 : 1.05;
      if (L.key.color && L.key.color.setHex) L.key.color.setHex(day ? 0xfff4e0 : 0xfff2dd);
      L.rim.intensity = day ? 0.55 : night ? 0.5 : 0.35;
      if (L.rim.color && L.rim.color.setHex)
        L.rim.color.setHex(night ? 0x3355aa : (day ? 0x9ec9ff : 0x88aaff));
    }
    if (this._planet && this._planet.material)
      this._planet.material.color.setHex(day ? 0x4c7a3c : night ? 0x0d1119 : 0x1f5133);
    if (this._atmo && this._atmo.material) {
      this._atmo.material.opacity = day ? 0.42 : night ? 0.05 : 0.10;
      this._atmo.material.color.setHex(day ? 0x8fc4e8 : night ? 0x2a4a80 : 0x5aa9ff);
    }
    if (this._padGrid && this._padGrid.material)
      this._padGrid.material.opacity = night ? 0.10 : day ? 0.18 : 0.42;
    if (this._nearGround) this._nearGround.visible = night;
    if (this._dayGround) this._dayGround.visible = day;
    if (this._sun) this._sun.visible = day;
    if (this._festival) this._festival.setVisible(night);
    if (S.fog) {
      S.fog.density = day ? 0.00019 : night ? 0.0016 : 0.0011;
      S.fog.color.setHex(day ? 0xa9cfe6 : night ? 0x080a12 : 0x060912);
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
  //  THE RELEASE — manual two-step ignition (Era 0 / khom loy)
  // ======================================================================
  FlightScreen.prototype._onIgnite = function () {
    if (this._gate === 'prelaunch') {
      this._gate = 'igniting';
      this._ignT = 0;
      this.btnIgnite.disabled = true;
      this.btnIgnite.classList.remove('ready');
      this.btnIgnite.textContent = 'กำลังจุดไฟ…';
      this._phaseText = 'จุดไฟ — ประคองโคมไว้';
      this._showToast('จุดไฟ · ประคองโคมไว้จนอิ่มไอร้อน');
    } else if (this._gate === 'held') {
      this._gate = null;
      this.btnIgnite.hidden = true;
      this.btnIgnite.classList.remove('ready');
      this.btnIgnite.disabled = false;
      this.flight.seek(this._liftoffTime || 0);
      this._masterT = this._liftoffTime || 0;
      this._camTX = this._camTY = null;
      this._phaseText = 'ปล่อยโคม';
      this._lastHaikuT = this.flight.time;
      this._showToast('ปล่อยโคม · โคมลอยขึ้นสู่ราตรี');
      this._showHaiku(HAIKU.release, 5200);
      this._revealChrome();
      this._last = perfNow();
      this.play();
    }
  };

  FlightScreen.prototype._enterHeld = function () {
    this._gate = 'held';
    this.btnIgnite.disabled = false;
    this.btnIgnite.classList.add('ready');
    this.btnIgnite.textContent = 'ปล่อยโคม';
    this._phaseText = 'ไอร้อนเต็มลูก — พร้อมปล่อย';
    this._showToast('ไอร้อนเต็มลูกแล้ว — แตะเพื่อปล่อยโคม');
  };

  FlightScreen.prototype._gateFrame = function (dt) {
    var lt = this._liftoffTime || 0;
    if (this._gate === 'prelaunch') this._phaseText = 'ประคองโคมไว้ · รอจุดไฟ';
    if (this._gate === 'igniting') {
      var rate = this._igniteDur > 0 ? lt / this._igniteDur : lt;
      this._ignT += dt * rate;
      if (this._ignT >= lt) { this._ignT = lt; this._enterHeld(); }
      this.flight.seek(clamp(this._ignT, 0, lt));
    }
    var st = this.flight.sampleAt(this.flight.time) || this.flight.sampleAt(0);

    var s = (this._gate === 'prelaunch') ? 0
      : (this._gate === 'igniting') ? clamp(this._ignT / Math.max(lt, 1e-6), 0, 1)
      : 1;
    if (RS.render.VehicleRenderer && this.vehicleGroup) {
      RS.render.VehicleRenderer.flicker(this.vehicleGroup, s > 0.02, false, s);
    }
    if (this._glow) this._glow.intensity = s * (1.6 + Math.random() * 0.8);

    if (this._exhaust) {
      this._exhaust.update(this._gate === 'prelaunch' ? 0 : dt, {
        x: 0, y: 0, v: 0,
        powered: this._gate !== 'prelaunch',
        wisp: true, buoyant: true, padLocked: true,
        exhaustY: this._exhaustY
      });
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
    var wantDay = (!!opts.daylight || this._bangfai) && !buoy;
    this._applySky(buoy ? 'night' : (wantDay ? 'day' : 'dusk'));

    // ---- rebuild the fleet from scratch -------------------------------
    if (this._exhaust) this._exhaust.reset();
    this._disposeFleet();
    this._focusIdx = 0;
    this._addVehicle(simResult, { t0: 0, primary: true });
    this._masterT = 0;
    this._masterDur = this._vehicles[0].flight.duration;
    this._canLaunchNext = this._bangfai;
    this._playing = false;
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
          this._launchRig.traverse(function (m) { if (m.isMesh) m.receiveShadow = true; });
          this.scene.add(this._launchRig);
        }
      }
      if (this._launchRig) this._launchRig.visible = true;
      if (this._pad) this._pad.visible = false;
    } else {
      if (this._launchRig) this._launchRig.visible = false;
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
    this._camIdx = buoy ? CAM_MODES.indexOf('observer') : CAM_MODES.indexOf('chase');
    this.btnCam.textContent = CAM_LABEL[CAM_MODES[this._camIdx]];
    this._theta = 0.7; this._phi = 1.12; this._zoom = 1; this._camX = 0;
    this._obsYaw = 0; this._obsPitch = 0;
    this._phaseText = 'อยู่บนแท่น';
    this._hideToast();
    this._buildMarkers(this._collectEvents(), this._masterDur);

    // Era-1 fleet controls
    if (this.btnLaunchNext) this.btnLaunchNext.hidden = !this._bangfai;
    this._refreshFocusBtn();

    // ---- THE RELEASE — manual two-step ignition for a khom loy -----------
    this._haikuQueue.length = 0;
    this._haikuActive = this._haikuFading = false;
    this._lastHaikuT = -1e9;
    if (this.elHaiku) { this.elHaiku.hidden = true; this.elHaiku.classList.remove('show'); }

    var holdT = (simResult.summary && simResult.summary.holdTime != null)
      ? simResult.summary.holdTime
      : ((simResult.events || []).filter(function (e) { return e.type === 'LIFTOFF'; })[0] || {}).time;
    var canGate = !!(opts.cinematic && this.btnIgnite && buoy && holdT != null && holdT > 0.05);

    if (canGate) {
      this._gate = 'prelaunch';
      this._liftoffTime = holdT;
      this._igniteDur = clamp(holdT * 1.7, 5, 11);
      this._ignT = 0;
      this.flight.seek(0);
      this.btnIgnite.hidden = false;
      this.btnIgnite.disabled = false;
      this.btnIgnite.classList.remove('ready');
      this.btnIgnite.textContent = '🔥 จุดไฟ';
      this._phaseText = 'ประคองโคมไว้ — รอจุดไฟ';
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

  // ---- LAUNCH NEXT — a fresh Bang Fai on the rail, mid-flight ----------
  FlightScreen.prototype._launchNext = function () {
    if (!this._canLaunchNext || !this.scene || !this.scene.available || this._gate) return;
    if (this._vehicles.length >= 8) {
      this._showToast('บั้งไฟบนฟ้าเยอะพอแล้ว! (สูงสุด 8 ลูก)');
      return;
    }
    if (!this._vehicle) return;
    var model = this._vehicle.toPhysicsModel();
    if (!model || !model.valid) return;
    var sim = RS.Physics.simulate(model, this._simOpts || {});
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
    this._phaseText = 'จุดบั้งต่อไป';
    this._showToast('🚀 จุดบั้งไฟลูกที่ ' + this._vehicles.length + ' — ยิงจากราง!');
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
    });
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

    if (this._gate) { this._gateFrame(dt); return; }

    var rate = RATES[this._rateIdx] || 1;
    if (this._playing && !this._scrubbing) {
      this._masterT = Math.min(this._masterT + dt * rate, this._masterDur);
      if (this._masterT >= this._masterDur - 1e-3) this._playing = false;
    }

    this._stepVehicles();
    this._syncAliases();

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

    if (this._exhaust) {
      this._exhaust.update(this._playing ? (this._frameDt || 0.016) : 0, {
        x: (st.position && st.position.x) || 0,
        y: (st.position && st.position.y) || 0,
        v: st.velocity,
        powered: powered && st.altitude < 45000,
        padLocked: !!st.padLocked,
        buoyant: this.flight.buoyant,
        bigPlume: this._dirtyExhaust,
        exhaustY: this._exhaustY
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

  FlightScreen.prototype._updateCamera = function (alt, st) {
    var cam = this.scene.camera;
    var mode = CAM_MODES[this._camIdx];
    var RE = this._RE || 600000;

    var wantFog = this.scene.fog && mode !== 'map' && alt < 60000;
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

    var sp = Math.sin(this._phi), cp = Math.cos(this._phi);
    var sth = Math.sin(this._theta), cth = Math.cos(this._theta);

    if (mode === 'map') {
      var pcy = -RE;
      var dist = RE * 2.6 * clamp(this._zoom, 0.3, 6);
      cam.position.set(dist * sp * sth, pcy + dist * cp, dist * sp * cth);
      cam.lookAt(0, pcy, 0);
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
      var gd = clamp(10 + alt * 0.02, 10, 400) * clamp(this._zoom, 0.5, 3);
      cam.position.set(gd * sth, 1.3, gd * cth);
      cam.lookAt(tx, Math.max(vy, focus), 0);

    } else if (mode === 'free') {
      var fr = clamp(40 * this._zoom, 2.5, RE * 3);
      var tg = this._freeTarget;
      cam.position.set(tg.x + fr * sp * sth, tg.y + fr * cp, tg.z + fr * sp * cth);
      cam.lookAt(tg);

    } else {
      var cr = clamp((14 + alt * 0.06) * this._zoom, 6, RE * 2);
      cam.position.set(tx + cr * sp * sth, vy + cr * cp, cr * sp * cth);
      cam.lookAt(tx, vy, 0);
    }
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
    if (this._vehicles.length > 1) {
      cells.unshift(['บั้งไฟที่ปล่อยทั้งหมด', this._vehicles.length + ' ลูก']);
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

    this.autopsy.hidden = false;
  };

  // ---- mission verdict banner ------------------------------------
  FlightScreen.prototype._renderVerdict = function () {
    var el = this.elVerdict; if (!el) return;
    var ME = RS.MissionEngine;
    if (!this._mission || !ME || !this._sim) { el.hidden = true; return; }

    var r = ME.evaluate(this._mission, this._sim, this._vehicle);
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
