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

  // warm the .glb cache for every part that has a model (safe if none / no loader)
  if (RS.render.VehicleRenderer && RS.render.VehicleRenderer.preload) {
    RS.render.VehicleRenderer.preload(RS.PartsCatalog).then(function () {
      if (previewModal && !previewModal.hidden) refreshPreview();
    });
  }
  function ensureModels(v) {
    return (RS.render.VehicleRenderer && RS.render.VehicleRenderer.ensureFor)
      ? RS.render.VehicleRenderer.ensureFor(v) : Promise.resolve();
  }

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
      renderMissionBar(stats);        // live-update budget / mass / parts chips
      schedulePreview();
    }
  });

  var flightScreen = RS.render.FlightScreen ? new RS.render.FlightScreen() : null;
  var flight = new RS.render.FlightRenderer();   // legacy console handle

  watchBtn.addEventListener('click', function () {
    if (lastSim && lastSim.ok && flightScreen && flightScreen.available) {
      ensureModels(vehicle).then(function () {
        flightScreen.open(lastSim, vehicle, activeMission);   // re-watch: no cinematic
      });
    }
  });

  // ---- 3D preview — a floating modal, lazily built, only spins while open
  var preview = null, previewOrbit = null, previewGroup = null;
  var previewModal = document.getElementById('preview-modal');

  function ensurePreview() {
    if (preview) return preview;
    preview = new RS.render.Scene(document.getElementById('preview-canvas'),
      { ground: true, background: 0x0a1830, shadows: true });
    if (preview.available) {
      previewOrbit = new RS.render.CameraController(preview.camera, preview.canvas, {
        target: [0, 0.4, 0], radius: 3, autoRotate: true
      });
      // a faint disc under the vehicle to catch the bamboo skeleton's shadow
      var THREE = window.THREE;
      var floor = new THREE.Mesh(
        new THREE.CircleGeometry(3.4, 48),
        new THREE.MeshStandardMaterial({ color: 0x0c1c34, roughness: 1, metalness: 0 }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.03;
      floor.receiveShadow = true;
      preview.add(floor);
    }
    return preview;
  }

  function refreshPreview() {
    if (!preview || !preview.available) return;
    if (previewGroup) { RS.render.VehicleRenderer.disposeGroup(previewGroup); previewGroup = null; }
    var empty = document.getElementById('preview-empty');
    if (!vehicle.instances.length) { empty.hidden = false; return; }
    empty.hidden = true;
    previewGroup = RS.render.VehicleRenderer.build(vehicle);
    preview.add(previewGroup);
    var b = previewGroup.userData.bounds;
    previewOrbit.frame(b.center, b.radius);
    previewOrbit.radius *= 1.35;        // a little breathing room in the panel
    previewOrbit.update(0);
  }

  function openPreview() {
    ensurePreview();
    previewModal.hidden = false;
    if (!preview.available) {
      document.getElementById('preview-empty').hidden = false;
      document.getElementById('preview-empty').textContent = '3D preview ต้องใช้ WebGL';
      return;
    }
    refreshPreview();
    preview.resize();
    preview.startLoop(function (dt) {
      previewOrbit.update(dt);
      if (previewGroup) RS.render.VehicleRenderer.flicker(previewGroup, true);
    });
  }
  function closePreview() {
    previewModal.hidden = true;
    if (preview) preview.stopLoop();
  }

  document.getElementById('bp-preview-open').addEventListener('click', openPreview);
  document.getElementById('preview-close').addEventListener('click', closePreview);
  previewModal.addEventListener('click', function (e) {
    if (e.target === previewModal) closePreview();
  });
  window.addEventListener('resize', function () {
    if (!previewModal.hidden && preview) preview.resize();
  });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !previewModal.hidden) closePreview();
  });

  // ---- mission state ------------------------------------------------
  var activeMission = null;
  var missionBtn = document.getElementById('bp-mission');
  var missionBar = document.getElementById('bp-mission-bar');
  var missionResultEl = document.getElementById('bp-mission-result');

  function setActiveMission(m) {
    activeMission = m || null;
    missionBtn.textContent = m ? '📋 ' + m.title : '📋 ภารกิจ';
    missionResultEl.hidden = true;
    renderMissionBar(vehicle.computeStats());
  }

  function renderMissionBar(stats) {
    if (!missionBar) return;                 // called once during builder init
    var m = activeMission;
    if (!m) { missionBar.hidden = true; return; }
    var o = m.objectives || {}, c = m.constraints || {};
    var partIds = vehicle.instances.map(function (i) { return i.part.id; });
    var chips = [];
    var chip = function (met, txt) {
      return '<span class="bp-mbar-chip' + (met ? ' met' : '') + '">' + txt + '</span>';
    };
    if (o.targetAltitude != null) chips.push(chip(false, '🎯 ≥ ' + o.targetAltitude + ' ม.'));
    if (o.flightTimeMin != null) chips.push(chip(false, '⏱️ ≥ ' + o.flightTimeMin + ' วิ'));
    if (o.maxVelocityMin != null) chips.push(chip(false, '💨 ≥ ' + o.maxVelocityMin + ' m/s'));
    if (o.downrangeMin != null) chips.push(chip(false, '➡️ ตกไกล ≥ ' + o.downrangeMin + ' ม.'));
    if (o.surviveFlight) chips.push(chip(false, '🛡️ ไม่เสียการควบคุม'));
    if (m.wind) chips.push(chip(true, '🌬️ ลม ' + m.wind + ' m/s'));
    if (c.safeZoneRadius != null) chips.push(chip(false, '🚫 NOTAM ' + c.safeZoneRadius + ' ม.'));
    if (c.maxCost != null) chips.push(chip(stats.cost <= c.maxCost, '💰 ' + stats.cost + ' / ' + c.maxCost + ' ฿'));
    if (c.maxMass != null) {
      var okM = stats.totalMass <= c.maxMass + 1e-9;
      chips.push(chip(okM, '⚖️ ' + fmtMass(stats.totalMass) + ' / ' + fmtMass(c.maxMass)));
    }
    (c.requiredParts || []).forEach(function (pid) {
      var got = partIds.indexOf(pid) !== -1;
      var p = RS.PartsCatalog.get(pid);
      chips.push(chip(got, '🔧 ' + ((p && p.name) || pid)));
    });
    missionBar.innerHTML = '<b>ภารกิจ: ' + esc(m.title) + '</b>' + chips.join('');
    missionBar.hidden = false;
  }

  function openBriefing(m) {
    if (!m || !RS.MissionBriefing) return;
    RS.MissionBriefing.show(m, { onAccept: function () { setActiveMission(m); } });
  }

  function fmtMass(kg) {
    return kg < 1 ? Math.round(kg * 1000) + ' g' : kg.toFixed(2) + ' kg';
  }

  missionBtn.addEventListener('click', function () {
    openBriefing(activeMission || RS.MissionEngine.firstUnfinished(currentEra));
  });

  // keep the preview in sync only while its modal is on screen
  function schedulePreview() {
    if (previewModal && !previewModal.hidden) refreshPreview();
  }

  // ---- toolbar ---------------------------------------------------------
  document.getElementById('bp-reset').addEventListener('click', function () { builder.reset(); });
  document.getElementById('bp-zoom-in').addEventListener('click', function () { builder.zoom(1); });
  document.getElementById('bp-zoom-out').addEventListener('click', function () { builder.zoom(-1); });

  var sampleBtn = document.getElementById('bp-sample');

  function buildSample(eraId) {
    builder.reset();
    var C = RS.PartsCatalog;
    if (eraId === '4-orbit') {
      // two-stage orbital stack, built top → down:
      //   payload · [upper: 2 tanks + vacuum engine] · decoupler ·
      //   [booster: 4 tanks + heavy engine]. Booster is jettisoned when dry.
      var pay = vehicle.addInstance(C.get('orb_payload'), 0, 0, []);
      var t2a = vehicle.addInstance(C.get('orb_tank_large'), 0, 1,
        [{ node: 'top', toIid: pay.iid, toNode: 'bottom' }]);
      var t2b = vehicle.addInstance(C.get('orb_tank_large'), 0, 4,
        [{ node: 'top', toIid: t2a.iid, toNode: 'bottom' }]);
      var vac = vehicle.addInstance(C.get('orb_engine_vacuum'), 0, 7,
        [{ node: 'top', toIid: t2b.iid, toNode: 'bottom' }]);
      var dec = vehicle.addInstance(C.get('orb_decoupler'), 0, 9,
        [{ node: 'top', toIid: vac.iid, toNode: 'bottom' }]);
      var prevT = dec, prevNode = 'bottom', gy = 10;
      for (var ti = 0; ti < 4; ti++) {
        var tk = vehicle.addInstance(C.get('orb_tank_large'), 0, gy,
          [{ node: 'top', toIid: prevT.iid, toNode: prevNode }]);
        prevT = tk; prevNode = 'bottom'; gy += 3;
      }
      vehicle.addInstance(C.get('orb_engine_heavy'), 0, gy,
        [{ node: 'top', toIid: prevT.iid, toNode: prevNode }]);
      builder._afterEdit('จรวดวงโคจร 2 ท่อน — กด ▶ ดูมันสลัดท่อนล่าง แล้วเลี้ยวโค้งเข้าวงโคจร (Newton’s Cannonball)');
      return;
    }
    if (eraId === '3-v2') {
      // nose · tank · engine — the classic liquid stack. It flies straight up,
      // then the gyro tilts it downrange (the gravity turn).
      var v2eng = vehicle.addInstance(C.get('v2_engine'), 0, 4, []);
      var v2tank = vehicle.addInstance(C.get('v2_tank'), 0, 1,
        [{ node: 'bottom', toIid: v2eng.iid, toNode: 'top' }]);
      vehicle.addInstance(C.get('v2_nose'), 0, 0,
        [{ node: 'bottom', toIid: v2tank.iid, toNode: 'top' }]);
      builder._afterEdit('V-2 ตัวอย่าง — กด ▶ แล้วดูมันเลี้ยวโค้งหลังพ้น 500 ม. (Gravity Turn)');
    } else if (eraId === '1p5-fireworks') {
      // tube on the pad · lift charge inside · shell on top. spoolTime 0 —
      // it will not creep, it will POP the instant it is lit.
      var tube = vehicle.addInstance(C.get('fw_mortar_tube'), 0, 2, []);
      var charge = vehicle.addInstance(C.get('fw_lift_charge'), 0, 1,
        [{ node: 'bottom', toIid: tube.iid, toNode: 'top' }]);
      vehicle.addInstance(C.get('fw_shell_peony'), 0, 0,
        [{ node: 'bottom', toIid: charge.iid, toNode: 'top' }]);
      builder._afterEdit('ครกดอกไม้ไฟตัวอย่าง — กด ▶ แล้วดูมันกระชากขึ้นทันทีที่จุด (อิมพัลส์เดียว)');
    } else if (eraId === '1-bangfai') {
      // a complete traditional บั้งไฟ: โหวด · เลา · หมื่อ · หาง — stable, fires
      // off the angled scaffold. Remove the หาง and it tumbles off the rail.
      var howot = vehicle.addInstance(C.get('payload_howot'), 0, 0, []);
      var lao = vehicle.addInstance(C.get('body_lao'), 0, 1,
        [{ node: 'top', toIid: howot.iid, toNode: 'bottom' }]);
      vehicle.addInstance(C.get('propulsion_mue'), 0, 4,
        [{ node: 'top', toIid: lao.iid, toNode: 'bottom' }]);
      vehicle.addInstance(C.get('frame_tailstick'), 1, 3,
        [{ node: 'mountR', toIid: lao.iid, toNode: 'tailL' }]);
      builder._afterEdit('บั้งไฟอีสานตัวอย่าง (โหวด·เลา·หมื่อ·หาง) — กด ▶ ยิงจากฐานเฉียง · ลองถอด "หาง" ออกแล้วจะเห็นมันคว้าง');
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
    syncEraLabels(eraId);
    Array.prototype.forEach.call(this.children, function (c) {
      c.classList.toggle('is-on', c === btn);
    });
    document.getElementById('bp-watch').disabled = true;
    var m = RS.MissionEngine.firstUnfinished(eraId);
    setActiveMission(m);
    openBriefing(m);
  });

  // ---- LAUNCH — the cinematic transition from drafting board to launch pad
  var transEl = document.getElementById('launch-transition');
  var launching = false;

  document.getElementById('bp-run').addEventListener('click', function () {
    if (launching) return;
    launching = true;
    var model = vehicle.toPhysicsModel();

    transEl.hidden = false;
    void transEl.offsetWidth;             // flush so the fade-in actually plays
    transEl.classList.add('show');

    // hold the "CALCULATING…" screen ~650ms; also wait for any .glb models this
    // vehicle needs so the flight scene shows them from frame one, not popping in
    var holdDone = new Promise(function (r) { setTimeout(r, 650); });
    Promise.all([holdDone, ensureModels(vehicle)]).then(function () {
      try {
        var simOpts = { dt: 0.02, sampleEvery: 0.25 };
        if (activeMission) {
          if (activeMission.wind != null) simOpts.wind = activeMission.wind;
          var szr = activeMission.constraints && activeMission.constraints.safeZoneRadius;
          if (szr != null) simOpts.safeZoneRadius = szr;
        }
        var result = RS.Physics.simulate(model, simOpts);
        lastSim = result;

        renderSummary(result);
        renderEvents(result.events);
        renderDiagnostics(result.diagnostics);
        drawTrace(result.trajectory);

        var cinematic = !!(result.ok && result.summary && result.summary.liftedOff &&
          flightScreen && flightScreen.available);
        watchBtn.disabled = !cinematic;

        if (activeMission) {
          var mres = RS.MissionEngine.evaluate(activeMission, result, vehicle);
          renderMissionResult(mres);
          if (mres.passed && !RS.MissionEngine.isDone(activeMission.id)) {
            RS.MissionEngine.markComplete(activeMission.id);
            RS.EraManager.refreshUnlocks(RS.MissionEngine.completedCountByEra());
          }
          console.log('[FIRE→ORBIT] mission "' + activeMission.title + '"', mres);
        }
        console.log('[FIRE→ORBIT] SimulationResult v' + result.contractVersion, result);

        if (cinematic) {
          flightScreen.open(lastSim, vehicle, activeMission, { cinematic: true });
        } else {
          document.querySelector('.bp-sim').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } catch (err) {
        console.error('[FIRE→ORBIT] launch failed', err);
      }
      transEl.classList.remove('show');
      setTimeout(function () { transEl.hidden = true; }, 360);
      launching = false;
    });
  });

  function renderMissionResult(r) {
    if (!r || !r.mission) { missionResultEl.hidden = true; return; }
    var why = '';
    if (r.passed) {
      why = '<span class="bp-mres-why">ปลดล็อกแล้ว · <b>+' + r.score + ' คะแนน</b></span>';
    } else {
      why = '<span class="bp-mres-why">' +
        r.failReasons.map(esc).join(' &nbsp;·&nbsp; ') + '</span>';
    }
    missionResultEl.className = 'bp-mres ' + (r.passed ? 'pass' : 'fail');
    missionResultEl.innerHTML =
      '<span class="bp-mres-tag">' + (r.passed ? 'MISSION ACCOMPLISHED' : 'MISSION FAILED') +
      '</span><span class="bp-mres-why"><b>' + esc(r.mission.title) + '</b></span>' + why;
    missionResultEl.hidden = false;
  }

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
      ['ความเร็วสูงสุด', s.maxVelocity + ' m/s'],
      ['ระยะลอยเบี่ยง', Math.round(Math.abs(s.impactX || 0)) + ' m'],
      ['ลอยไกลสุด', Math.round(s.maxDrift || 0) + ' m'],
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

  // ---- sync the era UI to the persisted era ----------------------
  var runBtn = document.getElementById('bp-run');
  function syncEraLabels(eraId) {
    if (eraId === '4-orbit') {
      sampleBtn.textContent = 'จรวดวงโคจรตัวอย่าง';
      runBtn.textContent = '🛰️ ส่งเข้าวงโคจร';
    } else if (eraId === '3-v2') {
      sampleBtn.textContent = 'V-2 ตัวอย่าง';
      runBtn.textContent = '🚀 ปล่อย V-2';
    } else if (eraId === '1p5-fireworks') {
      sampleBtn.textContent = 'ครกตัวอย่าง';
      runBtn.textContent = '🎆 จุดดอกไม้ไฟ';
    } else if (eraId === '1-bangfai') {
      sampleBtn.textContent = 'บั้งไฟตัวอย่าง';
      runBtn.textContent = '🚀 ปล่อยบั้งไฟ';
    } else {
      sampleBtn.textContent = 'โคมตัวอย่าง';
      runBtn.textContent = '🏮 ปล่อยโคม';
    }
  }
  Array.prototype.forEach.call(document.querySelectorAll('.bp-era-btn'), function (b) {
    b.classList.toggle('is-on', b.dataset.era === currentEra);
  });
  syncEraLabels(currentEra);

  // ---- open the game on a mission briefing -------------------------
  (function bootMission() {
    var m = RS.MissionEngine.firstUnfinished(currentEra);
    setActiveMission(m);
    missionBar.hidden = true;          // stays hidden behind the briefing
    openBriefing(m);
  })();

  // console handle
  window.FIRE_TO_ORBIT = {
    vehicle: vehicle, builder: builder, flight: flight,
    flightScreen: flightScreen, RS: RS,
    get preview() { return preview; },
    get mission() { return activeMission; },
    openPreview: openPreview,
    simulate: function () { return RS.Physics.simulate(vehicle.toPhysicsModel()); }
  };
  console.log('%cFROM FIRE TO ORBIT — Reboot Phase 9 ready', 'color:#5fe0a8;font-weight:bold');
  console.log('contract v' + RS.Physics.CONTRACT_VERSION +
    ' · try FIRE_TO_ORBIT.simulate()');
})();
