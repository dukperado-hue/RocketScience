/* =============================================================================
 * FROM FIRE TO ORBIT — Render layer
 * js/render/FlightScreen.js  ·  the flight / replay screen  (Phase 2B + 2C)
 *
 * Wires RS.render.FlightRenderer to a full-screen telemetry-review playback:
 *   · owns its own RS.render.Scene (sky, stars, ground, altitude rings)
 *   · builds the vehicle with RS.render.VehicleRenderer
 *   · 3 playback camera modes — Ground Track / Chase / Free
 *   · transport bar: play / pause / restart / rate / scrub + event tick markers
 *   · a live HUD driven purely off the SimulationResult contract
 *   · a Physics-Autopsy report card when playback ends
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
  //  Three lines each, fired on specific flight events. Slow fade in, linger,
  //  slow fade out — see _showHaiku / css .fs-haiku.
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
    this.btnIgnite = $('fs-ignite');   // Era-0: two-step 🔥 จุดไฟ → ปล่อยโคม
    this.elHaiku = $('fs-haiku');      // the poetry overlay

    // ---- manual ignition / release gate (khom loy only) ------------------
    this._gate = null;                 // null | 'prelaunch' | 'igniting' | 'held'
    this._ignT = 0;                    // trajectory time reached during the spool
    this._liftoffTime = 0;             // the tick physics says it breaks the pad
    this._igniteDur = 6;               // wall-clock seconds the spool is stretched over
    // ---- haiku queue ----------------------------------------------------
    this._haikuQueue = [];
    this._haikuActive = false;
    this._haikuFading = false;
    this._haikuTimer = 0;
    this._lastHaikuT = -1e9;

    this.flight = new RS.render.FlightRenderer({ playbackRate: 1 });

    this.scene = null;
    this.vehicleGroup = null;
    this._trail = null;
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
    // observer / launcher's-POV cam: a fixed eye-level stance near the pad,
    // plus scratch vectors + transient drag-to-look-around offsets
    this._obsEye  = new (THREE ? THREE.Vector3 : Object)();
    this._obsTmp  = new (THREE ? THREE.Vector3 : Object)();
    this._obsTmp2 = new (THREE ? THREE.Vector3 : Object)();
    if (THREE) this._obsEye.set(-8, 1.7, 33);   // a spectator ~34 m back from the pad
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

    // cinematic reveal: after a launch the HUD/transport start hidden and
    // fade in on the first real interaction (or a short auto-timeout).
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
      if (self._gate) { self._syncScrub(); return; }   // locked during the ignition ceremony
      self._scrubbing = true;
      self.flight.pause();
      var t = (self.scrub.value / 1000) * self.flight.duration;
      self.flight.seek(t);
      self._recomputePhase(t);
      if (t < self.flight.duration - 1e-3) { self._autopsyShown = false; self.autopsy.hidden = true; }
      self.scrub.style.setProperty('--fs-pos', (self.scrub.value / 10).toFixed(1) + '%');
      self._renderFrame(self.flight.sampleAt(t));
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

      // a real drag while a cinematic auto-cam is tracking → hand control to the
      // FREE rig, anchored where the vehicle is now, so the view isn't wrested back
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

    // event feed -> toast + phase label
    this.flight.on('*', function (evt) {
      self._phaseText = (LABEL_TH[evt.type] || evt.type);
      self._showToast((LABEL_TH[evt.type] || evt.type) + ' · ' + evt.message);
      if (self._glow && evt.type === 'IGNITION') self._glowPulse = 1;
      // the poetry of impermanence, keyed to what just happened
      if (evt.type === 'MIDAIR_BURN') self._maybeHaiku('burn', 5400);
      else if (evt.type === 'BURNOUT' && self.flight.buoyant) self._maybeHaiku('burnout', 5400);
      // reaching orbit → swing the camera out to the orbital map
      var mapIdx = CAM_MODES.indexOf('map');
      if (evt.type === 'ORBIT' && self._camIdx !== mapIdx) {
        self._camIdx = mapIdx; self._zoom = 1;
        self.btnCam.textContent = CAM_LABEL.map;
      }
    });
  };

  FlightScreen.prototype._cycleCam = function () {
    this._camIdx = (this._camIdx + 1) % CAM_MODES.length;
    var mode = CAM_MODES[this._camIdx];
    this.btnCam.textContent = CAM_LABEL[mode];
    this._zoom = 1;                 // every rig starts at a neutral zoom / FOV
    if (mode === 'free') {
      var st = this.flight.sampleAt(this.flight.time);
      this._freeTarget.set(
        (st && st.position) ? st.position.x : 0,
        (st && st.position) ? st.position.y + 2 : 2, 0);
    }
  };

  FlightScreen.prototype._restart = function () {
    this.flight.seek(0);
    this._vmax = 0;
    this._autopsyShown = false;
    this.autopsy.hidden = true;
    this._phaseText = 'อยู่บนแท่น';
    this._syncScrub();
    this.play();
  };

  // ---- scene (built lazily, kept alive between opens) -------------------
  FlightScreen.prototype._buildScene = function () {
    if (this._built) return;
    var RE = (RS.Physics && RS.Physics.RE) || 600000;
    this._RE = RE;
    this.scene = new RS.render.Scene(this.canvas, {
      ground: false, background: 0x05080f, fov: 50,
      logDepth: true, far: RE * 6,
      fog: { color: 0x060912, density: 0.0011 }   // dissolves the hard horizon
    });
    if (!this.scene.available) { this._built = true; return; }
    var sc = this.scene.scene;

    sc.add(makeStars(1400, RE * 4));

    // ---- THE PLANET — a real sphere centred at (0, -RE) --------------
    var planet = new THREE.Mesh(
      new THREE.SphereGeometry(RE, 96, 64),
      new THREE.MeshStandardMaterial({ color: 0x1f5133, roughness: 1, metalness: 0 })
    );
    planet.position.set(0, -RE, 0);
    sc.add(planet);
    // a thin translucent atmosphere shell
    var atmo = new THREE.Mesh(
      new THREE.SphereGeometry(RE + ((RS.Physics && RS.Physics.ATMOS_TOP) || 70000), 64, 48),
      new THREE.MeshBasicMaterial({ color: 0x5aa9ff, transparent: true, opacity: 0.10,
        side: THREE.BackSide, depthWrite: false })
    );
    atmo.position.set(0, -RE, 0);
    sc.add(atmo);
    this._planet = planet;
    this._atmo = atmo;

    // ---- near-pad ground : a soft radial-gradient disc that fades out into
    //  the haze so there is no hard terrain edge, just a pool of ground that
    //  dissolves into the night. Sits a hair under the grid + planet surface.
    var gtc = document.createElement('canvas');
    gtc.width = gtc.height = 256;
    var gg = gtc.getContext('2d');
    // white RGB, alpha fades out — a soft mask so the disc dissolves into haze;
    // colour + warm oil-lamp light come from the (lit) material, not the texture
    var grd = gg.createRadialGradient(128, 128, 8, 128, 128, 128);
    grd.addColorStop(0.00, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.7)');
    grd.addColorStop(1.00, 'rgba(255,255,255,0)');
    gg.fillStyle = grd; gg.fillRect(0, 0, 256, 256);
    var groundTex = new THREE.CanvasTexture(gtc);
    var nearGround = new THREE.Mesh(
      new THREE.CircleGeometry(3200, 64),
      new THREE.MeshLambertMaterial({          // Lambert → reacts to the oil lamps
        map: groundTex, color: 0x141a24,
        transparent: true, depthWrite: false, fog: true
      }));
    nearGround.rotation.x = -Math.PI / 2;
    nearGround.position.y = 0.005;
    sc.add(nearGround);
    this._nearGround = nearGround;

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
    // a traditional Bang Fai fires off an ANGLED wooden scaffold, not this pad —
    // built lazily in open() when meta.launchAngleDeg says so, and swapped in.
    this._launchRig = null;
    this._rigAngle = 0;

    // launch-pad exhaust / smoke field — fed the contract state every frame
    if (RS.render.ExhaustFX) {
      this._exhaust = new RS.render.ExhaustFX();
      if (this._exhaust.available) sc.add(this._exhaust.object3d());
    }

    // altitude reference rings (low-altitude only)
    for (var a = 100; a <= 2000; a += 100) {
      var ring = new THREE.Mesh(
        new THREE.TorusGeometry(7, 0.13, 6, 40),
        new THREE.MeshBasicMaterial({ color: 0x2f6f8f, transparent: true, opacity: 0.24 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = a;
      sc.add(ring);
    }

    // ---- the Lantern Festival environment (stylized ground + Rapunzel sky) --
    //  built once, kept hidden until a buoyancy-mode (khom loy) flight opens
    if (RS.render.FestivalEnv) {
      this._festival = new RS.render.FestivalEnv(this.scene);
      this._festival.build();
    }

    this._built = true;
  };

  FlightScreen.prototype._applyNightMode = function (on) {
    if (this._night === on) return;
    this._night = on;
    var L = this.scene && this.scene.lights;
    if (L) {
      L.hemi.intensity = on ? 0.38 : 0.95;
      L.key.intensity  = on ? 0.35 : 1.05;
      L.rim.intensity  = on ? 0.5  : 0.35;
      if (L.rim.color && L.rim.color.setHex) L.rim.color.setHex(on ? 0x3355aa : 0x88aaff);
    }
    if (this._planet && this._planet.material) {
      // night ground: dark, desaturated blue-grey terrain — not fluorescent grass
      this._planet.material.color.setHex(on ? 0x0d1119 : 0x1f5133);
    }
    if (this._padGrid && this._padGrid.material) {
      this._padGrid.material.opacity = on ? 0.10 : 0.42;
    }
    if (this._atmo && this._atmo.material) {
      this._atmo.material.opacity = on ? 0.05 : 0.10;
      this._atmo.material.color.setHex(on ? 0x2a4a80 : 0x5aa9ff);
    }
    // the soft ground pool is a night-scene device — the daytime planet is green
    if (this._nearGround) this._nearGround.visible = on;
    // the whole lantern-festival environment is night-only
    if (this._festival) this._festival.setVisible(on);
    if (this.scene && this.scene.fog) {
      // thicker, cooler haze at night so the horizon truly melts away
      this.scene.fog.density = on ? 0.0016 : 0.0011;
      this.scene.fog.color.setHex(on ? 0x080a12 : 0x060912);
    }
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
    if (this._gate) return;             // keep the frame clean during the ceremony
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
      // STEP 1 — light the wick. The lantern stays welded to the pad while the
      // wax spools; the flame + inner glow + a thread of smoke build.
      this._gate = 'igniting';
      this._ignT = 0;
      this.btnIgnite.disabled = true;
      this.btnIgnite.classList.remove('ready');
      this.btnIgnite.textContent = 'กำลังจุดไฟ…';
      this._phaseText = 'จุดไฟ — ประคองโคมไว้';
      this._showToast('จุดไฟ · ประคองโคมไว้จนอิ่มไอร้อน');
    } else if (this._gate === 'held') {
      // STEP 3 — let go. Playback resumes exactly at the tick physics says the
      // lantern breaks the pad, so it lifts off from a standstill, gracefully.
      this._gate = null;
      this.btnIgnite.hidden = true;
      this.btnIgnite.classList.remove('ready');
      this.btnIgnite.disabled = false;
      this.flight.seek(this._liftoffTime || 0);
      this._camTX = this._camTY = null;       // re-lock the camera onto the rising lantern
      this._phaseText = 'ปล่อยโคม';
      this._lastHaikuT = this.flight.time;    // let the launch breathe before the next poem
      this._showToast('ปล่อยโคม · โคมลอยขึ้นสู่ราตรี');
      this._showHaiku(HAIKU.release, 5200);
      this._revealChrome();
      this._last = perfNow();
      this.play();
    }
  };

  FlightScreen.prototype._enterHeld = function () {
    // STEP 2 — the wax is hot, buoyancy is positive: offer the string.
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

    // flame BUILD factor: 0 before ignite → ramps over the spool → full when held
    var s = (this._gate === 'prelaunch') ? 0
      : (this._gate === 'igniting') ? clamp(this._ignT / Math.max(lt, 1e-6), 0, 1)
      : 1;
    if (RS.render.VehicleRenderer && this.vehicleGroup) {
      RS.render.VehicleRenderer.flicker(this.vehicleGroup, s > 0.02, false, s);
    }
    if (this._glow) this._glow.intensity = s * (1.6 + Math.random() * 0.8);

    // a held lantern only breathes a thin heat-haze, never a roaring exhaust
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
    if (now - this._lastHaikuT < 13) return;    // never stack poems on each other
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
    void this.elHaiku.offsetWidth;               // flush so the fade-in plays from 0
    this.elHaiku.classList.add('show');
    this._haikuTimer = Math.max(2.5, h.linger);
  };

  FlightScreen.prototype._drainHaiku = function (dt) {
    if (!this._haikuActive) return;
    this._haikuTimer -= (dt || 0.016);
    if (this._haikuTimer > 0) return;
    if (!this._haikuFading) {
      this._haikuFading = true;
      this.elHaiku.classList.remove('show');     // slow CSS fade-out
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
    this._mission = mission || null;
    this._vehicle = vehicle || null;
    this.root.hidden = false;

    // cinematic entry: hide HUD + transport until the viewer interacts
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

    // NIGHT MODE — a khom loy is released after dark. Dim the world so the
    // lantern's own glow carries the frame, then restore it for rockets.
    this._applyNightMode((simResult && simResult.mode) === 'buoyancy');

    // fresh vehicle mesh (can't share an Object3D with the builder preview)
    if (this.vehicleGroup) RS.render.VehicleRenderer.disposeGroup(this.vehicleGroup);
    this.vehicleGroup = RS.render.VehicleRenderer.build(vehicle);
    this.scene.add(this.vehicleGroup);
    var b = this.vehicleGroup.userData.bounds;
    this._vehH = (b && b.height) || 1.4;
    // exhaust leaves from the base of the stack — never from above the origin
    var rawEY = (this.vehicleGroup.userData &&
      this.vehicleGroup.userData.exhaustY != null)
      ? this.vehicleGroup.userData.exhaustY : -0.3;
    this._exhaustY = Math.min(0, rawEY) - 0.1;
    if (this._exhaust) this._exhaust.reset();

    // ---- launch structure — angled scaffold for a Bang Fai, else the pad ----
    var meta = simResult.meta || {};
    this._dirtyExhaust = !!meta.dirtyExhaust;         // a หมื่อ → the big plume
    var la = +meta.launchAngleDeg || 0;
    var angled = la > 0 && la < 89;
    if (angled && RS.render.makeLaunchRig) {
      if (!this._launchRig || Math.abs(this._rigAngle - la) > 1) {
        if (this._launchRig) RS.render.VehicleRenderer.disposeGroup(this._launchRig);
        this._launchRig = RS.render.makeLaunchRig(la);
        this._rigAngle = la;
        if (this._launchRig) this.scene.add(this._launchRig);
      }
      if (this._launchRig) this._launchRig.visible = true;
      if (this._pad) this._pad.visible = false;
    } else {
      if (this._launchRig) this._launchRig.visible = false;
      if (this._pad) this._pad.visible = true;
    }

    if (!this._glow) {
      this._glow = new THREE.PointLight(0xff8a3a, 0, 140, 2);
    }
    this._glow.position.set(0, (this.vehicleGroup.userData &&
      this.vehicleGroup.userData.exhaustY != null)
      ? this.vehicleGroup.userData.exhaustY : -0.3, 0);
    this.vehicleGroup.add(this._glow);
    this._glowPulse = 0;

    // trajectory lines: a faint FULL predicted path (the orbital arc) plus a
    // bright progressive breadcrumb trail drawn up to the current playback time
    [this._trail, this._orbitLine].forEach(function (ln) {
      if (ln) { this.scene.remove(ln); ln.geometry.dispose(); ln.material.dispose(); }
    }, this);
    this._trail = this._orbitLine = null;

    var pts = (simResult.trajectory || []).map(function (s) {
      return new THREE.Vector3(s.position.x, s.position.y, s.position.z);
    });
    if (pts.length > 1) {
      var isOrbital = !!(simResult.summary && simResult.summary.orbit &&
        simResult.summary.orbit.achieved);

      var og = new THREE.BufferGeometry().setFromPoints(pts);
      this._orbitLine = new THREE.Line(og, new THREE.LineBasicMaterial({
        color: isOrbital ? 0x8fd4ff : 0x3a6f9a,
        transparent: true, opacity: isOrbital ? 0.32 : 0.16
      }));
      this.scene.add(this._orbitLine);

      var geo = new THREE.BufferGeometry().setFromPoints(pts);
      geo.setDrawRange(0, 1);
      this._trail = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: 0x5bd6ff, transparent: true, opacity: 0.7
      }));
      this._trailN = pts.length;
      this.scene.add(this._trail);
    }

    this.flight.load(simResult);
    this.flight.attach(this.vehicleGroup);
    this.flight.seek(0);
    this._sim = simResult;
    this._summary = simResult.summary || null;
    this._diagnostics = simResult.diagnostics || [];
    this._poweredUntil = poweredUntil(simResult.trajectory);
    var oev = (simResult.events || []).filter(function (e) { return e.type === 'ORBIT'; })[0];
    this._orbitEventTime = oev ? oev.time : Infinity;
    this._camTX = this._camTY = null;
    this._vmax = 0;
    this._autopsyShown = false;
    this.autopsy.hidden = true;
    if (this.elVerdict) this.elVerdict.hidden = true;
    this._rateIdx = 1; this.flight.setRate(1); this.btnRate.textContent = '1×';
    // a khom loy is watched from the ground — default to the launcher's POV;
    // anything with real thrust defaults to the chase cam.
    this._camIdx = ((simResult && simResult.mode) === 'buoyancy')
      ? CAM_MODES.indexOf('observer') : CAM_MODES.indexOf('chase');
    this.btnCam.textContent = CAM_LABEL[CAM_MODES[this._camIdx]];
    this._theta = 0.7; this._phi = 1.12; this._zoom = 1; this._camX = 0;
    this._obsYaw = 0; this._obsPitch = 0;   // transient look-around offsets (observer cam)
    this._phaseText = 'อยู่บนแท่น';
    this._hideToast();
    this._buildMarkers(simResult.events || [], this.flight.duration);

    // ---- THE RELEASE — manual two-step ignition for a khom loy -----------
    //  Physics has already pad-locked + spooled the lantern; we simply hold
    //  playback on the pad, let the player light the wick and feel the heat
    //  build, then hand them the string to let go.
    this._haikuQueue.length = 0;
    this._haikuActive = this._haikuFading = false;
    this._lastHaikuT = -1e9;
    if (this.elHaiku) { this.elHaiku.hidden = true; this.elHaiku.classList.remove('show'); }

    var holdT = (simResult.summary && simResult.summary.holdTime != null)
      ? simResult.summary.holdTime
      : ((simResult.events || []).filter(function (e) { return e.type === 'LIFTOFF'; })[0] || {}).time;
    var canGate = !!(opts.cinematic && this.btnIgnite &&
      (simResult && simResult.mode) === 'buoyancy' && holdT != null && holdT > 0.05);

    if (canGate) {
      this._gate = 'prelaunch';
      this._liftoffTime = holdT;
      this._igniteDur = clamp(holdT * 1.7, 5, 11);   // stretch the spool — slow, contemplative
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
      var self = this;
      this._festival.onEncounter = function () { self._maybeHaiku('encounter', 4800); };
    }

    this.scene.resize();
    this._renderFrame(this.flight.sampleAt(0));
    this._last = perfNow();
    if (!this._gate) this.play();
    if (!this._raf) this._loop();
  };

  FlightScreen.prototype.close = function () {
    this.flight.pause();
    if (this._raf) { global.cancelAnimationFrame(this._raf); this._raf = 0; }
    if (this._chromeTimer) { global.clearTimeout(this._chromeTimer); this._chromeTimer = 0; }
    this.root.classList.remove('fs-cinematic');
    this._chromeHidden = false;
    this._gate = null;
    if (this.btnIgnite) { this.btnIgnite.hidden = true; this.btnIgnite.classList.remove('ready'); }
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

  // ---- transport -------------------------------------------------------
  FlightScreen.prototype.play = function () {
    if (this.flight.time >= this.flight.duration - 1e-3) {
      this.flight.seek(0); this._vmax = 0; this._autopsyShown = false; this.autopsy.hidden = true;
    }
    this.flight.play(); this._reflectPlay();
  };
  FlightScreen.prototype.pauseIt = function () { this.flight.pause(); this._reflectPlay(); };
  FlightScreen.prototype.togglePlay = function () {
    if (this._gate) return;             // no scrubbing past the ignition ceremony
    this.flight.playing ? this.pauseIt() : this.play();
  };
  FlightScreen.prototype._reflectPlay = function () {
    this.btnPlay.textContent = this.flight.playing ? '⏸' : '▶';
  };

  // ---- main loop ------------------------------------------------------
  FlightScreen.prototype._loop = function () {
    var self = this;
    this._raf = global.requestAnimationFrame(function () { self._loop(); });
    var t = perfNow(), dt = Math.min((t - this._last) / 1000, 0.05);
    this._last = t;
    this._frameDt = dt;

    if (this._gate) { this._gateFrame(dt); return; }

    if (this.flight.playing && !this._scrubbing) this.flight.update(dt);
    var st = this.flight.sampleAt(this.flight.time);
    this._renderFrame(st);
    this._drainHaiku(dt);
    if (!this._scrubbing) this._syncScrub();
    if (!this.flight.playing) this._reflectPlay();

    if (!this._scrubbing && !this._autopsyShown && this.flight.duration > 0 &&
        this.flight.time >= this.flight.duration - 1e-3) {
      this._showAutopsy();
    }
  };

  FlightScreen.prototype._syncScrub = function () {
    var f = this.flight.duration > 0 ? this.flight.time / this.flight.duration : 0;
    this.scrub.value = String(Math.round(f * 1000));
    this.scrub.style.setProperty('--fs-pos', (f * 100).toFixed(1) + '%');
  };

  // ---- render one frame (camera + trail + glow + HUD) ---------------
  FlightScreen.prototype._renderFrame = function (st) {
    if (!st) return;
    var alt = st.altitude;

    if (this._trail && this._trailN) {
      var idx = Math.round((this.flight.time / (this.flight.duration || 1)) * (this._trailN - 1));
      this._trail.geometry.setDrawRange(0, clamp(idx + 1, 1, this._trailN));
    }

    var powered = this.flight.time <= this._poweredUntil + 0.01;

    if (this._glow) {
      var base = powered ? 2.4 + Math.random() * 1.3 : 0;
      if (this._glowPulse > 0) { base += this._glowPulse * 6; this._glowPulse *= 0.86; }
      this._glow.intensity = base;
    }

    // launch-pad exhaust: heavy ground smoke while stuck fighting inertia,
    // then a downward exhaust column once it breaks the pad.
    if (this._exhaust) {
      this._exhaust.update(this.flight.playing ? (this._frameDt || 0.016) : 0, {
        x: (st.position && st.position.x) || 0,
        y: (st.position && st.position.y) || 0,
        v: st.velocity,
        powered: powered && st.altitude < 45000,   // no visible plume up in vacuum
        padLocked: !!st.padLocked,
        buoyant: this.flight.buoyant,
        bigPlume: this._dirtyExhaust,               // a หมื่อ burns filthy
        exhaustY: this._exhaustY
      });
    }

    if (this._festival) {
      // feed the festival the player's position so it can spawn intimate
      // companion lanterns near the flight path and fire the encounter haiku
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

    // ground haze is for the near-pad views only — the orbital map needs to see
    // the whole planet, and by high altitude there's no atmosphere to haze
    var wantFog = this.scene.fog && mode !== 'map' && alt < 60000;
    this.scene.scene.fog = wantFog ? this.scene.fog : null;

    // FOV: the observer is PLANTED (it can't dolly), so the wheel drives its
    // field of view — scroll in for a telephoto close-up of the glowing paper
    // against the stars, scroll out for the whole festival sky. `_zoom` starts
    // at 1; the canvas wheel handler nudges it 0.88/1.14 per notch.
    var wantFov = (mode === 'observer') ? clamp(55 * this._zoom, 15, 75) : 50;
    if (Math.abs(cam.fov - wantFov) > 1e-3) { cam.fov = wantFov; cam.updateProjectionMatrix(); }

    // camera target = the vehicle's true FIXED-FRAME position (so it tracks
    // correctly all the way around the planet, not just near the pad)
    var vx = (st && st.position) ? st.position.x : 0;
    var vy = (st && st.position) ? st.position.y : 0;
    if (this._camTX == null) { this._camTX = vx; this._camTY = vy; }
    var k = this.flight.playing ? 0.08 : 0.5;
    this._camTX += (vx - this._camTX) * k;
    this._camTY += (vy - this._camTY) * k;
    var tx = this._camTX, ty = this._camTY;

    var sp = Math.sin(this._phi), cp = Math.cos(this._phi);
    var sth = Math.sin(this._theta), cth = Math.cos(this._theta);

    if (mode === 'map') {
      // ORBITAL MAP — the whole planet centred, orbit shell + vehicle around it
      var pcy = -RE;
      var dist = RE * 2.6 * clamp(this._zoom, 0.3, 6);
      cam.position.set(dist * sp * sth, pcy + dist * cp, dist * sp * cth);
      cam.lookAt(0, pcy, 0);
      return;
    }

    var focus = alt + Math.min(this._vehH * 0.5, 2.5);

    if (mode === 'observer') {
      // LAUNCHER'S POV — planted on the ground at eye level near the pad,
      // auto-tracking the vehicle as it climbs. Wide angle so the foreground
      // (grass, lamps, tree) is in frame while it is low; the gaze then tilts
      // up to follow it into the lantern-filled sky. The vehicle stays the
      // subject — a real drag hands you the FREE rig instead (pointermove).
      var eye = this._obsEye;
      var horiz = Math.hypot(tx - eye.x, 0 - eye.z) || 0.001;
      var aimY = eye.y + clamp((this._camTY - eye.y) * 0.55, -2, horiz * 1.6);
      var dir = this._obsTmp.set(tx - eye.x, aimY - eye.y, 0 - eye.z);
      cam.position.copy(eye);
      cam.lookAt(eye.x + dir.x, eye.y + dir.y, eye.z + dir.z);
      return;
    }

    if (mode === 'ground') {
      // pinned near the pad, tilts up + pans to track the vehicle
      var gd = clamp(10 + alt * 0.02, 10, 400) * clamp(this._zoom, 0.5, 3);
      cam.position.set(gd * sth, 1.3, gd * cth);
      cam.lookAt(tx, Math.max(vy, focus), 0);

    } else if (mode === 'free') {
      var fr = clamp(40 * this._zoom, 2.5, RE * 3);
      var tg = this._freeTarget;
      cam.position.set(
        tg.x + fr * sp * sth,
        tg.y + fr * cp,
        tg.z + fr * sp * cth
      );
      cam.lookAt(tg);

    } else {
      // chase: orbit the vehicle, distance grows with altitude so an orbital
      // flight naturally pulls back to show the curving trajectory
      var cr = clamp((14 + alt * 0.06) * this._zoom, 6, RE * 2);
      cam.position.set(
        tx + cr * sp * sth,
        vy + cr * cp,
        cr * sp * cth
      );
      cam.lookAt(tx, vy, 0);
    }
  };

  FlightScreen.prototype._updateHud = function (st) {
    if (st.speed > this._vmax) this._vmax = st.speed;
    this.elTime.textContent = this.flight.time.toFixed(1) + ' s';
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
    this._revealChrome();          // flight's over — bring the controls back
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
