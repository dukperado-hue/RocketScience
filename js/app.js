/* =============================================================================
 * FROM FIRE TO ORBIT — Reboot Phase 1
 * js/app.js  ·  thin bootstrap. Wires the four core modules to the DOM.
 *
 * Everything real lives in js/core/*. This file only:
 *   1. builds a Vehicle + Blueprint2D,
 *   2. hooks the toolbar,
 *   3. runs the decoupled PhysicsEngine on demand and draws its output.
 * ===========================================================================*/
(function () {
  'use strict';

  var RS = window.RS;
  if (!RS || !RS.Blueprint2D) { console.error('core modules failed to load'); return; }

  var vehicle = new RS.Vehicle();
  var lastStats = null;

  var builder = new RS.Blueprint2D({
    canvas: document.getElementById('bp-canvas'),
    catalogEl: document.getElementById('bp-catalog'),
    telemetryEl: document.getElementById('bp-telemetry'),
    statusEl: document.getElementById('bp-status'),
    vehicle: vehicle,
    catalog: RS.PartsCatalog,
    era: '0-khomloy',
    onChange: function (stats) {
      lastStats = stats;
      document.getElementById('bp-run').disabled = !stats.valid;
    }
  });

  // toolbar
  document.getElementById('bp-reset').addEventListener('click', function () { builder.reset(); });
  document.getElementById('bp-zoom-in').addEventListener('click', function () { builder.zoom(1); });
  document.getElementById('bp-zoom-out').addEventListener('click', function () { builder.zoom(-1); });

  // one-tap sample lantern so the physics stub is easy to try
  document.getElementById('bp-sample').addEventListener('click', function () {
    builder.reset();
    var C = RS.PartsCatalog;
    var paper = vehicle.addInstance(C.get('cover_paper'), 0, 0, []);
    var frame = vehicle.addInstance(C.get('frame_bamboo'), 0, 2,
      [{ node: 'top', toIid: paper.iid, toNode: 'bottom' }]);
    vehicle.addInstance(C.get('fuel_wax'), 0, 3,
      [{ node: 'top', toIid: frame.iid, toNode: 'bottom' }]);
    builder._afterEdit('วางโคมลอยตัวอย่างให้แล้ว — กด ▶ จำลองการบิน');
  });

  // ---- decoupled physics run ----------------------------------------------
  document.getElementById('bp-run').addEventListener('click', function () {
    var model = vehicle.toPhysicsModel();
    var result = RS.PhysicsEngine.simulate(model, { dt: 0.02, sampleEvery: 0.25 });
    renderSim(result);
    // also dump the raw numbers for inspection
    console.log('[FIRE→ORBIT] physics model', model);
    console.log('[FIRE→ORBIT] result', result);
    if (result.samples.length) console.table(result.samples.filter(function (_, i) { return i % 4 === 0; }));
  });

  function renderSim(r) {
    var out = document.getElementById('bp-sim-out');
    if (!r.ok) {
      out.innerHTML = '<div class="bp-stat" style="grid-column:1/-1">' +
        '<span>สถานะ</span><b style="font-size:13px;color:var(--bp-no)">' + r.reason + '</b></div>';
      clearTrace();
      return;
    }
    var cells = [
      ['ยอดสูง (apogee)', fmt(r.apogee) + ' m'],
      ['เวลาถึงยอด', r.apogeeTime + ' s'],
      ['ความเร็วสูงสุด', r.maxV + ' m/s'],
      ['MaxQ', r.maxQ + ' Pa'],
      ['เวลาบินรวม', r.flightTime + ' s'],
      ['มวลตอนเชื้อเพลิงหมด', (r.burnoutMass * 1000).toFixed(0) + ' g']
    ];
    out.innerHTML = cells.map(function (c) {
      return '<div class="bp-stat"><span>' + c[0] + '</span><b>' + c[1] + '</b></div>';
    }).join('') +
    '<div class="bp-stat" style="grid-column:1/-1"><span>ผลการบิน</span><b style="font-size:13px">' +
      (r.liftedOff ? '🛫 ' : '🛑 ') + r.reason + '</b></div>';
    drawTrace(r.samples);
  }

  function drawTrace(samples) {
    var cv = document.getElementById('bp-trace');
    var ctx = cv.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var w = cv.clientWidth, h = cv.clientHeight, pad = 8;
    ctx.clearRect(0, 0, w, h);
    if (!samples.length) return;

    var tMax = samples[samples.length - 1].t || 1;
    var yMax = Math.max.apply(null, samples.map(function (s) { return s.y; })) || 1;

    // altitude curve
    ctx.strokeStyle = '#5fe0a8'; ctx.lineWidth = 2; ctx.beginPath();
    samples.forEach(function (s, i) {
      var px = pad + (s.t / tMax) * (w - 2 * pad);
      var py = h - pad - (s.y / yMax) * (h - 2 * pad);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.stroke();

    // velocity curve (scaled independently, faint)
    var vMax = Math.max.apply(null, samples.map(function (s) { return Math.abs(s.v); })) || 1;
    ctx.strokeStyle = 'rgba(91,214,255,0.6)'; ctx.lineWidth = 1; ctx.beginPath();
    samples.forEach(function (s, i) {
      var px = pad + (s.t / tMax) * (w - 2 * pad);
      var py = h - pad - (Math.abs(s.v) / vMax) * (h - 2 * pad);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.stroke();

    ctx.fillStyle = 'rgba(157,180,216,0.9)';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillText('alt ' + fmt(yMax) + ' m', pad, pad + 8);
    ctx.fillText('t ' + tMax.toFixed(0) + ' s', w - pad - 44, h - pad + 4);
  }

  function clearTrace() {
    var cv = document.getElementById('bp-trace');
    cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
  }

  function fmt(n) {
    if (n >= 1000) return (n / 1000).toFixed(2) + ' k';
    return n.toFixed(n < 10 ? 2 : 0);
  }

  // expose for console tinkering
  window.FIRE_TO_ORBIT = { vehicle: vehicle, builder: builder, RS: RS };
  console.log('%cFROM FIRE TO ORBIT — Reboot Phase 1 ready',
    'color:#5fe0a8;font-weight:bold');
  console.log('try: FIRE_TO_ORBIT.RS.PhysicsEngine.simulate(FIRE_TO_ORBIT.vehicle.toPhysicsModel())');
})();
