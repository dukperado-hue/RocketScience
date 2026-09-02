/* =============================================================================
 * FROM FIRE TO ORBIT — Reboot Phase 1.1
 * js/app.js  ·  thin bootstrap. Wires core + data + game + render to the DOM.
 *
 *   core/  produces data   →   app.js   →   render/ consumes it
 *
 * app.js is the ONLY place those layers meet. core/ never sees render/.
 * ===========================================================================*/
(function () {
  'use strict';

  var RS = window.RS;
  if (!RS || !RS.Blueprint2D || !RS.Physics) { console.error('core modules failed to load'); return; }

  // ---- game state -------------------------------------------------------
  RS.EraManager.init();
  RS.MissionEngine.init();

  function setEraTag(eraId) {
    var e = RS.EraManager.get(eraId);
    if (!e) return;
    document.getElementById('bp-era-tag').textContent =
      'ERA ' + e.id.split('-')[0].toUpperCase() + ' · ' + e.name;
  }
  var currentEra = RS.EraManager.currentId() || '0-khomloy';
  setEraTag(currentEra);

  // ---- 2D blueprint builder ------------------------------------------
  var vehicle = new RS.Vehicle();
  var lastSim = null;

  var watchBtn = document.getElementById('bp-watch');

  var builder = new RS.Blueprint2D({
    canvas: document.getElementById('bp-canvas'),
    catalogEl: document.getElementById('bp-catalog'),
    telemetryEl: document.getElementById('bp-telemetry'),
    statusEl: document.getElementById('bp-status'),
    vehicle: vehicle,
    catalog: RS.PartsCatalog,
    era: currentEra,
    onChange: function (stats) {
      document.getElementById('bp-run').disabled = !stats.valid;
      watchBtn.disabled = true;      // any edit invalidates the last replay
      schedulePreview();
    }
  });

  // ---- 3D preview (Phase 2A prelude) --------------------------------
  var preview = new RS.render.Scene(document.getElementById('preview-canvas'), { ground: true });
  var orbit = null, vehicleGroup = null, previewRAF = 0;
  var flight = new RS.render.FlightRenderer();   // used by the builder preview binding
  var flightScreen = RS.render.FlightScreen ? new RS.render.FlightScreen() : null;

  watchBtn.addEventListener('click', function () {
    if (lastSim && lastSim.ok && flightScreen && flightScreen.available) {
      flightScreen.open(lastSim, vehicle);
    }
  });

  if (preview.available) {
    orbit = new RS.render.CameraController(preview.camera, preview.canvas, {
      target: [0, 0.4, 0], radius: 3, autoRotate: true
    });
    preview.startLoop(function (dt) { orbit.update(dt); });
    window.addEventListener('resize', function () { preview.resize(); });
    rebuildPreview();   // sync whatever the builder already holds
  } else {
    document.getElementById('preview-empty').textContent = '3D preview ต้องใช้ WebGL';
  }

  function schedulePreview() {
    if (!preview || !preview.available || !orbit || previewRAF) return;
    previewRAF = requestAnimationFrame(function () { previewRAF = 0; rebuildPreview(); });
  }

  function rebuildPreview() {
    if (vehicleGroup) { RS.render.VehicleRenderer.disposeGroup(vehicleGroup); vehicleGroup = null; }
    var empty = document.getElementById('preview-empty');
    if (!vehicle.instances.length) { empty.hidden = false; return; }
    empty.hidden = true;
    vehicleGroup = RS.render.VehicleRenderer.build(vehicle);
    preview.add(vehicleGroup);
    flight.attach(vehicleGroup);
    var b = vehicleGroup.userData.bounds;
    orbit.frame(b.center, b.radius);
  }

  // ---- toolbar ---------------------------------------------------------
  document.getElementById('bp-reset').addEventListener('click', function () { builder.reset(); });
  document.getElementById('bp-zoom-in').addEventListener('click', function () { builder.zoom(1); });
  document.getElementById('bp-zoom-out').addEventListener('click', function () { builder.zoom(-1); });

  var sampleBtn = document.getElementById('bp-sample');

  function buildSample(eraId) {
    builder.reset();
    var C = RS.PartsCatalog;
    if (eraId === '1-bangfai') {
      // a DELIBERATELY finless stack — the fastest way to see the tumble.
      // Add fin_wood on the motor's radial nodes to tame it.
      var motor = vehicle.addInstance(C.get('motor_blackpowder'), 0, 4, []);
      var tube = vehicle.addInstance(C.get('body_tube_bamboo'), 0, 2,
        [{ node: 'bottom', toIid: motor.iid, toNode: 'top' }]);
      vehicle.addInstance(C.get('nose_cone_wood'), 0, 1,
        [{ node: 'bottom', toIid: tube.iid, toNode: 'top' }]);
      builder._afterEdit('บั้งไฟตัวอย่าง (ยังไม่มีครีบ!) — ลองจำลองดู แล้วลากครีบหางมาติดที่มอเตอร์');
    } else {
      var paper = vehicle.addInstance(C.get('cover_paper'), 0, 0, []);
      var frame = vehicle.addInstance(C.get('frame_bamboo'), 0, 2,
        [{ node: 'top', toIid: paper.iid, toNode: 'bottom' }]);
      vehicle.addInstance(C.get('fuel_wax'), 0, 3,
        [{ node: 'top', toIid: frame.iid, toNode: 'bottom' }]);
      builder._afterEdit('วางโคมลอยตัวอย่างให้แล้ว — กด ▶ จำลองการบิน');
    }
  }
  sampleBtn.addEventListener('click', function () { buildSample(currentEra); });

  // ---- era switcher --------------------------------------------------
  document.getElementById('bp-eras').addEventListener('click', function (e) {
    var btn = e.target.closest('.bp-era-btn');
    if (!btn || btn.classList.contains('is-on')) return;
    var eraId = btn.dataset.era;
    RS.EraManager.unlock(eraId);
    RS.EraManager.setCurrent(eraId);
    currentEra = eraId;
    builder.setEra(eraId);
    setEraTag(eraId);
    sampleBtn.textContent = eraId === '1-bangfai' ? 'บั้งไฟตัวอย่าง' : 'โคมตัวอย่าง';
    Array.prototype.forEach.call(this.children, function (c) {
      c.classList.toggle('is-on', c === btn);
    });
    document.getElementById('bp-watch').disabled = true;
  });

  // ---- run the simulation contract ---------------------------------
  document.getElementById('bp-run').addEventListener('click', function () {
    var model = vehicle.toPhysicsModel();
    var result = RS.Physics.simulate(model, { dt: 0.02, sampleEvery: 0.25 });
    lastSim = result;
    flight.load(result);

    renderSummary(result);
    renderEvents(result.events);
    renderDiagnostics(result.diagnostics);
    drawTrace(result.trajectory);

    watchBtn.disabled = !(result.ok && result.summary && result.summary.liftedOff &&
      flightScreen && flightScreen.available);

    // optional mission check against the first era mission
    var missions = RS.MissionEngine.forEra(RS.EraManager.currentId());
    if (missions[0]) {
      var ev = RS.MissionEngine.evaluate(missions[0], result);
      console.log('[FIRE→ORBIT] mission "' + missions[0].name + '"', ev);
    }
    console.log('[FIRE→ORBIT] SimulationResult v' + result.contractVersion, result);
  });

  // ---- render helpers ------------------------------------------------
  function renderSummary(r) {
    var out = document.getElementById('bp-sim-out');
    if (!r.ok) {
      out.innerHTML = '<div class="bp-stat" style="grid-column:1/-1">' +
        '<span>สถานะ</span><b style="font-size:13px;color:var(--bp-no)">' + esc(r.reason) + '</b></div>';
      return;
    }
    var s = r.summary;
    var cells = [
      ['ยอดสูง (apogee)', fmt(s.apogee) + ' m'],
      ['เวลาถึงยอด', s.apogeeTime + ' s'],
      ['ความเร็วสูงสุด', s.maxVelocity + ' m/s'],
      ['MaxQ', s.maxQ + ' Pa'],
      ['เวลาบินรวม', s.flightTime + ' s'],
      ['มวลเชื้อเพลิงหมด', (s.burnoutMass * 1000).toFixed(0) + ' g']
    ];
    out.innerHTML = cells.map(function (c) {
      return '<div class="bp-stat"><span>' + c[0] + '</span><b>' + c[1] + '</b></div>';
    }).join('') +
    '<div class="bp-stat" style="grid-column:1/-1"><span>ผลการบิน</span><b style="font-size:13px">' +
      (s.liftedOff ? '🛫 ' : '🛑 ') + esc(r.reason) + '</b></div>';
  }

  function renderEvents(events) {
    var el = document.getElementById('bp-events');
    if (!events || !events.length) {
      el.innerHTML = '<li><span></span><span class="bp-ev-type">— ไม่มีเหตุการณ์ —</span></li>';
      return;
    }
    el.innerHTML = events.map(function (e) {
      return '<li><span class="bp-ev-t">' + e.time.toFixed(1) + 's</span><span>' +
        '<span class="bp-ev-type">' + e.type + '</span><br>' + esc(e.message) + '</span></li>';
    }).join('');
  }

  function renderDiagnostics(diags) {
    var el = document.getElementById('bp-diag');
    if (!diags || !diags.length) {
      el.innerHTML = '<li><span class="bp-chip">—</span><span>ไม่มีผลวินิจฉัย</span></li>';
      return;
    }
    el.innerHTML = diags.map(function (d) {
      return '<li><span class="bp-chip ' + d.status + '">' + d.status + '</span>' +
        '<span><span class="bp-diag-msg">' + esc(d.message) + '</span>' +
        (d.detail ? '<span class="bp-diag-detail">' + esc(d.detail) + '</span>' : '') +
        '</span></li>';
    }).join('');
  }

  function drawTrace(traj) {
    var cv = document.getElementById('bp-trace');
    var ctx = cv.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var w = cv.clientWidth, h = cv.clientHeight, pad = 8;
    ctx.clearRect(0, 0, w, h);
    if (!traj || !traj.length) return;

    var tMax = traj[traj.length - 1].time || 1;
    var yMax = Math.max.apply(null, traj.map(function (s) { return s.altitude; })) || 1;
    var vMax = Math.max.apply(null, traj.map(function (s) { return Math.abs(s.velocity); })) || 1;

    curve(ctx, traj, function (s) { return s.altitude / yMax; }, '#5fe0a8', 2, w, h, pad, tMax);
    curve(ctx, traj, function (s) { return Math.abs(s.velocity) / vMax; }, 'rgba(91,214,255,0.6)', 1, w, h, pad, tMax);

    // mark events on the timeline
    (lastSim && lastSim.events || []).forEach(function (e) {
      var px = pad + (e.time / tMax) * (w - 2 * pad);
      ctx.strokeStyle = 'rgba(255,206,64,0.5)';
      ctx.beginPath(); ctx.moveTo(px, pad); ctx.lineTo(px, h - pad); ctx.stroke();
    });

    ctx.fillStyle = 'rgba(157,180,216,0.9)';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillText('alt ' + fmt(yMax) + ' m', pad, pad + 8);
    ctx.fillText('t ' + tMax.toFixed(0) + ' s', w - pad - 44, h - pad + 4);
  }

  function curve(ctx, traj, valFn, color, lw, w, h, pad, tMax) {
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath();
    traj.forEach(function (s, i) {
      var px = pad + (s.time / tMax) * (w - 2 * pad);
      var py = h - pad - valFn(s) * (h - 2 * pad);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.stroke();
  }

  function fmt(n) { return n >= 1000 ? (n / 1000).toFixed(2) + ' k' : n.toFixed(n < 10 ? 2 : 0); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // console handle
  window.FIRE_TO_ORBIT = {
    vehicle: vehicle, builder: builder, preview: preview, flight: flight,
    flightScreen: flightScreen, RS: RS,
    simulate: function () { return RS.Physics.simulate(vehicle.toPhysicsModel()); }
  };
  console.log('%cFROM FIRE TO ORBIT — Reboot Phase 3 ready', 'color:#5fe0a8;font-weight:bold');
  console.log('contract v' + RS.Physics.CONTRACT_VERSION +
    ' · try FIRE_TO_ORBIT.simulate()');
})();
