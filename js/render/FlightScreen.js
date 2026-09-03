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
    MAX_Q:    'แรงดันอากาศสูงสุด',
    APOGEE:   'จุดสูงสุด',
    BURNOUT:  'เชื้อเพลิงหมด',
    LOSS_OF_CONTROL: 'เสียการควบคุม',
    IMPACT:   'แตะพื้น'
  };
  var EVENT_COLOR = {
    IGNITION: '#e9f1ff', LIFTOFF: '#5fe0a8', MAX_Q: '#5bd6ff',
    BURNOUT: '#ffb63a', APOGEE: '#ffce40', LOSS_OF_CONTROL: '#ff3b3b', IMPACT: '#ff6a5a'
  };
  var RATES = [0.5, 1, 2, 4];
  var CAM_MODES = ['ground', 'chase', 'free'];
  var CAM_LABEL = { ground: 'มุมแหงนพื้น', chase: 'ลอยตาม', free: 'อิสระ' };

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
    this.elAcc   = $('fs-acc');
    this.elToast = $('fs-toast');
    this.elVerdict = $('fs-autopsy-verdict');
    this.btnPlay = $('fs-play');
    this.btnRate = $('fs-rate');
    this.btnCam  = $('fs-cam');
    this.scrub   = $('fs-scrub');
    this.marks   = $('fs-marks');
    this.autopsy = $('fs-autopsy');

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
    $('fs-close-x').addEventListener('click', function () { self.close(); });
    $('fs-close').addEventListener('click', function () { self.close(); });
    $('fs-replay').addEventListener('click', function () { self._restart(); });
    $('fs-autopsy-close').addEventListener('click', function () {
      self.autopsy.hidden = true;
    });

    this.scrub.addEventListener('input', function () {
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
      if (self.canvas.setPointerCapture && e.pointerId != null) {
        try { self.canvas.setPointerCapture(e.pointerId); } catch (x) {}
      }
    });
    global.addEventListener('pointermove', function (e) {
      if (!self._drag) return;
      var dx = e.clientX - self._drag.x, dy = e.clientY - self._drag.y;
      self._drag.x = e.clientX; self._drag.y = e.clientY;
      self._theta -= dx * 0.008;
      self._phi = clamp(self._phi - dy * 0.008, 0.16, 1.5);
    });
    global.addEventListener('pointerup', function () { self._drag = null; });
    this.canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      self._zoom = clamp(self._zoom * (e.deltaY < 0 ? 0.9 : 1.1), 0.3, 5);
    }, { passive: false });

    // event feed -> toast + phase label
    this.flight.on('*', function (evt) {
      self._phaseText = (LABEL_TH[evt.type] || evt.type);
      self._showToast((LABEL_TH[evt.type] || evt.type) + ' · ' + evt.message);
      if (self._glow && evt.type === 'IGNITION') self._glowPulse = 1;
    });
  };

  FlightScreen.prototype._cycleCam = function () {
    this._camIdx = (this._camIdx + 1) % CAM_MODES.length;
    var mode = CAM_MODES[this._camIdx];
    this.btnCam.textContent = CAM_LABEL[mode];
    if (mode === 'free') {
      var st = this.flight.sampleAt(this.flight.time);
      this._freeTarget.set(0, (st ? st.altitude : 0) + 2, 0);
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
    this.scene = new RS.render.Scene(this.canvas, { ground: false, background: 0x081226, fov: 50 });
    if (!this.scene.available) { this._built = true; return; }
    var sc = this.scene.scene;

    sc.add(new THREE.Mesh(
      new THREE.SphereGeometry(4000, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0x0c1c3a, side: THREE.BackSide, fog: false })
    ));
    sc.add(makeStars(800, 3600));

    var ground = new THREE.Mesh(
      new THREE.CircleGeometry(3000, 56),
      new THREE.MeshStandardMaterial({ color: 0x14301d, roughness: 1, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    sc.add(ground);

    var grid = new THREE.GridHelper(2400, 96, 0x356b41, 0x1d3a27);
    grid.material.transparent = true; grid.material.opacity = 0.42;
    sc.add(grid);

    var pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.15, 0.18, 20),
      new THREE.MeshStandardMaterial({ color: 0x1c2436, roughness: 0.9 })
    );
    pad.position.y = 0.09;
    sc.add(pad);

    // altitude reference rings + numeric-ish scale marks
    for (var a = 100; a <= 2000; a += 100) {
      var ring = new THREE.Mesh(
        new THREE.TorusGeometry(7, 0.13, 6, 40),
        new THREE.MeshBasicMaterial({ color: 0x2f6f8f, transparent: true, opacity: 0.24 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = a;
      sc.add(ring);
    }

    sc.fog = new THREE.Fog(0x081226, 280, 3200);
    this._built = true;
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

  // ---- per-open setup --------------------------------------------------
  FlightScreen.prototype.open = function (simResult, vehicle, mission) {
    if (!this.available) return;
    this._mission = mission || null;
    this._vehicle = vehicle || null;
    this.root.hidden = false;
    this._buildScene();
    if (!this.scene.available) { this.root.hidden = true; return; }

    // fresh vehicle mesh (can't share an Object3D with the builder preview)
    if (this.vehicleGroup) RS.render.VehicleRenderer.disposeGroup(this.vehicleGroup);
    this.vehicleGroup = RS.render.VehicleRenderer.build(vehicle);
    this.scene.add(this.vehicleGroup);
    var b = this.vehicleGroup.userData.bounds;
    this._vehH = (b && b.height) || 1.4;

    if (!this._glow) {
      this._glow = new THREE.PointLight(0xff8a3a, 0, 140, 2);
    }
    this._glow.position.set(0, (this.vehicleGroup.userData &&
      this.vehicleGroup.userData.exhaustY != null)
      ? this.vehicleGroup.userData.exhaustY : -0.3, 0);
    this.vehicleGroup.add(this._glow);
    this._glowPulse = 0;

    // progressive breadcrumb trail
    if (this._trail) {
      this.scene.remove(this._trail);
      this._trail.geometry.dispose(); this._trail.material.dispose();
      this._trail = null;
    }
    var pts = (simResult.trajectory || []).map(function (s) {
      return new THREE.Vector3(s.position.x, s.position.y, s.position.z);
    });
    if (pts.length > 1) {
      var geo = new THREE.BufferGeometry().setFromPoints(pts);
      geo.setDrawRange(0, 1);
      this._trail = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: 0x5bd6ff, transparent: true, opacity: 0.55
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
    this._vmax = 0;
    this._autopsyShown = false;
    this.autopsy.hidden = true;
    if (this.elVerdict) this.elVerdict.hidden = true;
    this._rateIdx = 1; this.flight.setRate(1); this.btnRate.textContent = '1×';
    this._camIdx = 1; this.btnCam.textContent = CAM_LABEL.chase;
    this._theta = 0.7; this._phi = 1.12; this._zoom = 1;
    this._phaseText = 'อยู่บนแท่น';
    this._hideToast();
    this._buildMarkers(simResult.events || [], this.flight.duration);

    this.scene.resize();
    this._renderFrame(this.flight.sampleAt(0));
    this._last = perfNow();
    this.play();
    if (!this._raf) this._loop();
  };

  FlightScreen.prototype.close = function () {
    this.flight.pause();
    if (this._raf) { global.cancelAnimationFrame(this._raf); this._raf = 0; }
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

    if (this.flight.playing && !this._scrubbing) this.flight.update(dt);
    var st = this.flight.sampleAt(this.flight.time);
    this._renderFrame(st);
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

    if (this._glow) {
      var on = this.flight.time <= this._poweredUntil + 0.01;
      var base = on ? 2.4 + Math.random() * 1.3 : 0;
      if (this._glowPulse > 0) { base += this._glowPulse * 6; this._glowPulse *= 0.86; }
      this._glow.intensity = base;
    }

    this._updateCamera(alt, st);
    this._recomputePhase(this.flight.time);
    this._updateHud(st);
    this.scene.renderOnce();
  };

  FlightScreen.prototype._updateCamera = function (alt, st) {
    var cam = this.scene.camera;
    var mode = CAM_MODES[this._camIdx];
    var focus = alt + Math.min(this._vehH * 0.5, 2.5);

    if (mode === 'ground') {
      // pinned near the pad, tilts up to track the vehicle as it shrinks away
      var gd = clamp(10 + alt * 0.02, 10, 70) * clamp(this._zoom, 0.6, 2);
      cam.position.set(
        gd * Math.sin(this._theta), 1.3, gd * Math.cos(this._theta)
      );
      cam.lookAt(0, focus, 0);

    } else if (mode === 'free') {
      var r = clamp(40 * this._zoom, 4, 1800);
      var sp = Math.sin(this._phi), cp = Math.cos(this._phi);
      var tg = this._freeTarget;
      cam.position.set(
        tg.x + r * sp * Math.sin(this._theta),
        Math.max(tg.y + r * cp, 1),
        tg.z + r * sp * Math.cos(this._theta)
      );
      cam.lookAt(tg);

    } else {
      // chase: orbit the vehicle CoM, following it up (stays close so the
      // vehicle keeps a readable on-screen size — the trail shows the climb)
      var cr = clamp((14 + alt * 0.015) * this._zoom, 6, 140);
      var csp = Math.sin(this._phi), ccp = Math.cos(this._phi);
      cam.position.set(
        cr * csp * Math.sin(this._theta),
        Math.max(focus + cr * ccp, 1.5),
        cr * csp * Math.cos(this._theta)
      );
      cam.lookAt(0, focus, 0);
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
    if (this.elAcc) this.elAcc.textContent = (st.acceleration >= 0 ? '+' : '') + st.acceleration.toFixed(1) + ' m/s²';
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
    this._renderVerdict();
    var s = this._summary || {};
    var cells = [
      ['ยอดสูง (Apogee)', fmtAlt(s.apogee || 0)],
      ['ความเร็วสูงสุด', (s.maxVelocity || 0).toFixed(1) + ' m/s'],
      ['Max-Q', Math.round(s.maxQ || 0) + ' Pa'],
      ['เวลาบินรวม', (s.flightTime || 0).toFixed(1) + ' s'],
      ['เวลาถึงยอด', (s.apogeeTime || 0).toFixed(1) + ' s'],
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
