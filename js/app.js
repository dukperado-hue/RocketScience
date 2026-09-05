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
  var lastSimOpts = null;   // wind / NOTAM opts — reused for FlightScreen "launch next"

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
      updateVabDeck(stats);           // Phase 21 — Telemetry Deck (Mass/Thrust/TWR)
    }
  });

  var flightScreen = RS.render.FlightScreen ? new RS.render.FlightScreen() : null;
  var flight = new RS.render.FlightRenderer();   // legacy console handle

  watchBtn.addEventListener('click', function () {
    if (lastSim && lastSim.ok && flightScreen && flightScreen.available) {
      ensureModels(vehicle).then(function () {
        flightScreen.open(lastSim, vehicle, activeMission, {
          simOpts: lastSimOpts,
          daylight: !!(lastSimOpts && lastSimOpts.target)
        });  // re-watch: no cinematic
      });
    }
  });

  // ---- 3D ASSEMBLY VIEW — a floating "VAB studio", lazily built, spins on open
  var preview = null, previewOrbit = null, previewGroup = null;
  var previewModal = document.getElementById('preview-modal');
  var previewIids = new Set();          // to detect which parts are newly placed

  function ensurePreview() {
    if (preview) return preview;
    preview = new RS.render.Scene(document.getElementById('preview-canvas'),
      { ground: false, studio: true, background: 0x05060c });
    if (preview.available) {
      previewOrbit = new RS.render.CameraController(preview.camera, preview.canvas, {
        target: [0, 0.5, 0], radius: 3.2, minRadius: 1.1, maxRadius: 22, autoRotate: true
      });
      // the VAB room: moody radial backdrop + glowing blueprint floor
      if (RS.render.makeStudioBackdrop) preview.add(RS.render.makeStudioBackdrop());
      if (RS.render.makeBlueprintFloor) preview.add(RS.render.makeBlueprintFloor());
    }
    return preview;
  }

  function refreshPreview() {
    if (!preview || !preview.available) return;
    var curIids = vehicle.instances.map(function (i) { return i.iid; });
    var freshIids = curIids.filter(function (id) { return !previewIids.has(id); });

    if (previewGroup) { RS.render.VehicleRenderer.disposeGroup(previewGroup); previewGroup = null; }
    var empty = document.getElementById('preview-empty');
    var legend = document.getElementById('preview-legend');
    if (!vehicle.instances.length) {
      empty.hidden = false; if (legend) legend.hidden = true;
      previewIids = new Set(); return;
    }
    empty.hidden = true;
    if (legend) legend.hidden = false;
    previewGroup = RS.render.VehicleRenderer.build(vehicle, { markers: true });
    preview.add(previewGroup);

    // tactile: the parts that just changed spring into place
    freshIids.forEach(function (id) { RS.render.VehicleRenderer.pulsePart(previewGroup, id); });
    previewIids = new Set(curIids);

    var b = previewGroup.userData.bounds;
    previewOrbit.frame(b.center, b.radius);
    previewOrbit.radius *= 1.4;         // a little breathing room in the panel
    previewOrbit.update(0);
  }

  function openPreview() {
    ensurePreview();
    buildVabRail();                 // Phase 21 — glass catalog for this era
    previewModal.hidden = false;
    if (!preview.available) {
      document.getElementById('preview-empty').hidden = false;
      document.getElementById('preview-empty').textContent = '3D preview ต้องใช้ WebGL';
      return;
    }
    refreshPreview();
    updateVabDeck(vehicle.computeStats());
    preview.resize();
    preview.startLoop(function (dt) {
      previewOrbit.update(dt);
      if (previewGroup) {
        RS.render.VehicleRenderer.flicker(previewGroup, true);
        RS.render.VehicleRenderer.updateMarkers(previewGroup, dt);
        RS.render.VehicleRenderer.updatePulses(previewGroup, dt);
      }
      if (placing) updatePlacementVisual(dt);
    });
  }
  function closePreview() {
    cancelPlacement();
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
    if (e.key !== 'Escape' || previewModal.hidden) return;
    if (placing) { cancelPlacement(); return; }   // Esc cancels an armed part first
    closePreview();
  });

  // =====================================================================
  //  PHASE 21 — THE NEXT-GEN 3D VAB
  //  A glassmorphism parts catalog + point-and-place construction directly
  //  in the Assembly Bay: click a part → it flies in as a translucent ghost →
  //  every legal attach node lights up with a glowing cyan ring → move the
  //  mouse to aim (nearest ring wins, screen-space) → click to snap it home.
  //  Same `vehicle` the 2D board writes to — both views stay in lock-step.
  // =====================================================================
  var vabRailEl = document.getElementById('vab3d-cat-list');
  var vabHintEl = document.getElementById('vab3d-place-hint');
  var vabHintNameEl = document.getElementById('vab3d-place-name');
  var vabMassEl = document.getElementById('vab3d-mass');
  var vabThrustEl = document.getElementById('vab3d-thrust');
  var vabTwrEl = document.getElementById('vab3d-twr');
  var previewCanvasEl = document.getElementById('preview-canvas');

  var placing = null;   // { part, ghost, candidates[], ringGroup, hoverIdx, ringR, rowEl, t }
  var _vabAudioCtx = null;

  /** A short synthesised "tock" — the magnetic-snap sound cue. No audio asset needed. */
  function snapBlip() {
    try {
      _vabAudioCtx = _vabAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var ctx = _vabAudioCtx, t0 = ctx.currentTime;
      var osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, t0);
      osc.frequency.exponentialRampToValueAtTime(1500, t0 + 0.05);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.24, t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t0); osc.stop(t0 + 0.17);
    } catch (e) {}
  }

  function updateVabDeck(stats) {
    if (!vabMassEl) return;
    stats = stats || vehicle.computeStats();
    vabMassEl.textContent = fmtMass(stats.totalMass || 0);
    var lift = Math.max(stats.totalThrust || 0, stats.totalBuoyancy || 0);
    vabThrustEl.textContent = Math.round(lift).toLocaleString() + ' N';
    var twr = stats.twr || 0;
    vabTwrEl.textContent = twr.toFixed(2);
    vabTwrEl.classList.remove('bad', 'warn', 'good');
    if (lift > 0) vabTwrEl.classList.add(twr < 1.0 ? 'bad' : (twr > 1.2 ? 'good' : 'warn'));
  }

  function buildVabRail() {
    if (!vabRailEl) return;
    cancelPlacement();
    var parts = RS.PartsCatalog.byEra(currentEra);
    var CAT_COLOR = RS.render.VehicleRenderer.CAT_COLOR;
    vabRailEl.innerHTML = '';
    parts.forEach(function (part) {
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'vab3d-part';
      row.dataset.partId = part.id;
      var hex = '#' + ((CAT_COLOR[part.category] != null ? CAT_COLOR[part.category] : 0x9aa7b4)
        .toString(16).padStart(6, '0'));
      row.style.setProperty('--cat', hex);
      row.innerHTML =
        '<span class="vab3d-part-ic">' + part.icon + '</span>' +
        '<span class="vab3d-part-tx">' +
          '<span class="vab3d-part-nm">' + esc(part.name) + '</span>' +
          '<span class="vab3d-part-mt">' + fmtMass(part.mass) + ' · ฿' + part.cost + '</span>' +
        '</span>';
      row.title = part.blurb || part.name;
      row.addEventListener('click', function () {
        if (placing && placing.part.id === part.id) { cancelPlacement(); return; }
        armPlacement(part, row);
      });
      vabRailEl.appendChild(row);
    });
  }

  /** Click a catalog part: it flies in as a ghost and every legal node lights up. */
  function armPlacement(part, rowEl) {
    if (!preview || !preview.available) return;
    cancelPlacement();
    var VR = RS.render.VehicleRenderer;
    var candidates = VR.findSnapCandidates(vehicle, part);
    if (!candidates.length) {
      if (builder && builder._setStatus) {
        builder._setStatus('ไม่มีจุดต่อที่เข้ากันกับ "' + part.name + '" ในตอนนี้');
      }
      return;
    }
    var ghost = VR.buildSinglePart(part);
    if (!ghost) return;
    ghost.traverse(function (o) {
      if (!o.material) return;
      var mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(function (m) {
        m.transparent = true;
        m.opacity = (m.opacity != null ? m.opacity : 1) * 0.5;
        m.depthWrite = false;
      });
    });
    ghost.renderOrder = 995;
    preview.add(ghost);

    var baseR = previewGroup ? previewGroup.userData.bounds.radius : 0.7;
    var ringR = Math.max(0.07, Math.min(0.26, baseR * 0.13));
    var ringGroup = new THREE.Group();
    candidates.forEach(function (c) {
      var ring = VR.makeSnapRing(ringR);
      ring.position.set(c.world.x, c.world.y, c.world.z);
      ringGroup.add(ring);
    });
    preview.add(ringGroup);

    if (rowEl) rowEl.classList.add('armed');
    vabHintEl.hidden = false;
    vabHintNameEl.textContent = part.name;

    placing = {
      part: part, ghost: ghost, candidates: candidates, ringGroup: ringGroup,
      hoverIdx: 0, ringR: ringR, rowEl: rowEl, t: 0
    };
  }

  /** Ghosts may share cached .glb geometry (instantiateModel clones by
   *  reference) — never call disposeGroup() on one, just detach it. */
  function disposeGhost(obj) {
    if (obj && obj.parent) obj.parent.remove(obj);
  }

  function cancelPlacement() {
    if (!placing) return;
    disposeGhost(placing.ghost);
    if (preview) preview.remove(placing.ringGroup);
    RS.render.VehicleRenderer.disposeGroup(placing.ringGroup);
    if (placing.rowEl) placing.rowEl.classList.remove('armed');
    vabHintEl.hidden = true;
    placing = null;
  }

  function confirmPlacement() {
    if (!placing) return;
    var cand = placing.candidates[placing.hoverIdx];
    var part = placing.part;
    vehicle.addInstance(part, cand.gx, cand.gy, cand.links);
    snapBlip();
    cancelPlacement();
    // vehicle.markDirty() + the 2D board's recentre/telemetry/preview refresh —
    // the exact same path buildSample() already uses for programmatic edits.
    builder._afterEdit('ต่อ "' + part.name + '" เข้ากับยานใน 3D Assembly Bay แล้ว');
  }

  /** Nearest candidate to the pointer, in SCREEN space — works at any camera angle. */
  function pickNearestCandidateScreen(clientX, clientY) {
    var rect = previewCanvasEl.getBoundingClientRect();
    var mx = clientX - rect.left, my = clientY - rect.top;
    var best = 0, bestD = Infinity;
    placing.candidates.forEach(function (c, i) {
      var v = new THREE.Vector3(c.world.x, c.world.y, c.world.z).project(preview.camera);
      var sx = (v.x * 0.5 + 0.5) * rect.width;
      var sy = (-v.y * 0.5 + 0.5) * rect.height;
      var d = Math.hypot(sx - mx, sy - my);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  /** Per-frame: ease the ghost toward the hovered node, pulse its ring, keep
   *  the camera framing both the existing stack AND the part about to join it. */
  function updatePlacementVisual(dt) {
    var cand = placing.candidates[placing.hoverIdx];
    if (!cand) return;
    var g = placing.ghost, k = Math.min(1, dt * 10);
    g.position.x += (cand.world.x - g.position.x) * k;
    g.position.y += (cand.world.y - g.position.y) * k;
    g.position.z += (cand.world.z - g.position.z) * k;

    placing.t += dt;
    placing.ringGroup.children.forEach(function (ring, i) {
      var on = i === placing.hoverIdx;
      ring.scale.setScalar(on ? (1.15 + 0.08 * Math.sin(placing.t * 7)) : 0.85);
      ring.material.opacity = on ? 0.95 : 0.32;
    });

    if (previewOrbit) {
      var centerY = previewGroup ? previewGroup.userData.bounds.center.y : cand.world.y;
      var baseR = previewGroup ? previewGroup.userData.bounds.radius : 0.6;
      var reach = Math.max(baseR, Math.abs(cand.world.y - centerY) + placing.ringR * 3, 0.8);
      previewOrbit.frame({ x: 0, y: (centerY + cand.world.y) / 2, z: 0 }, reach * 1.15);
    }
  }

  previewCanvasEl.addEventListener('pointermove', function (e) {
    if (!placing) return;
    placing.hoverIdx = pickNearestCandidateScreen(e.clientX, e.clientY);
  });
  // Confirm on a true click (down+up within a few px) — tracked explicitly
  // rather than relying on the browser's synthesized `click`, which can be
  // unreliable once CameraController's orbit-drag calls setPointerCapture
  // on the same canvas. `click` is kept too as a harmless defensive fallback.
  var _vabDownAt = null;
  previewCanvasEl.addEventListener('pointerdown', function (e) {
    if (placing) _vabDownAt = { x: e.clientX, y: e.clientY };
  });
  previewCanvasEl.addEventListener('pointerup', function (e) {
    if (!placing || !_vabDownAt) { _vabDownAt = null; return; }
    var moved = Math.hypot(e.clientX - _vabDownAt.x, e.clientY - _vabDownAt.y);
    _vabDownAt = null;
    if (moved < 6) confirmPlacement();
  });
  previewCanvasEl.addEventListener('click', function () {
    if (placing) confirmPlacement();
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
    if (flightScreen && flightScreen.root && !flightScreen.root.hidden) flightScreen.close();
    var m = activeMission || RS.MissionEngine.firstUnfinished(currentEra);
    if (openFireworkFlow(currentEra)) return;
    openBriefing(m);
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
    // BUGFIX (Phase 22 course-correction): switching eras never closed a
    // still-open flight screen. A rapid-fire era (Bang Fai's "launch next",
    // a manual V-2 countdown, …) kept running its rAF loop + timers
    // UNDERNEATH whatever screen opened next — so entering, say, a firework
    // mission right after watching a different era's flight could show that
    // OLD flight's own mission-fail/verdict state re-surfacing once the new
    // screen was dismissed, looking exactly like "the new mission
    // auto-launched and instantly failed." Always close it first.
    if (flightScreen && flightScreen.root && !flightScreen.root.hidden) flightScreen.close();
    if (!previewModal.hidden) closePreview();   // same leak risk for the 3D Assembly Bay
    RS.EraManager.unlock(eraId);
    RS.EraManager.setCurrent(eraId);
    currentEra = eraId;
    builder.setEra(eraId);
    setEraTag(eraId);
    syncEraLabels(eraId);
    if (!previewModal.hidden) buildVabRail();   // Phase 21 — keep the glass catalog in sync
    Array.prototype.forEach.call(this.children, function (c) {
      c.classList.toggle('is-on', c === btn);
    });
    document.getElementById('bp-watch').disabled = true;
    var m = RS.MissionEngine.firstUnfinished(eraId);
    setActiveMission(m);
    // the Fireworks era opens THE SKY ATLAS instead of the plain briefing
    if (!openFireworkFlow(eraId, m)) openBriefing(m);
  });

  // ---- LAUNCH — the cinematic transition from drafting board to launch pad
  var transEl = document.getElementById('launch-transition');
  var launching = false;

  /**
   * The shared launch pipeline: hold the "CALCULATING…" transition, run the
   * sim, render the analysis, score the mission, open the flight screen.
   * @param {Object} [extra]  { simOpts:Object, flightOpts:Object }  merged in
   */
  function doLaunch(extra) {
    if (launching) return;
    launching = true;
    extra = extra || {};
    var model = vehicle.toPhysicsModel();

    transEl.hidden = false;
    void transEl.offsetWidth;             // flush so the fade-in actually plays
    transEl.classList.add('show');

    var holdDone = new Promise(function (r) { setTimeout(r, 650); });
    Promise.all([holdDone, ensureModels(vehicle)]).then(function () {
      try {
        var simOpts = { dt: 0.02, sampleEvery: 0.25 };
        if (activeMission) {
          if (activeMission.wind != null) simOpts.wind = activeMission.wind;
          var szr = activeMission.constraints && activeMission.constraints.safeZoneRadius;
          if (szr != null) simOpts.safeZoneRadius = szr;
        }
        // ---- Era 3 · V-2 : ballistic gyro-guidance to a sea target
        var isV2 = !!(model && model.gravityTurn && !model.staged);
        if (isV2) simOpts.target = { range: 2500, gyroDrift: 0.5 };
        // ---- caller-supplied opts (e.g. the Firework Design Desk's fuse)
        for (var k in (extra.simOpts || {})) simOpts[k] = extra.simOpts[k];

        var result = RS.Physics.simulate(model, simOpts);
        lastSim = result;
        lastSimOpts = simOpts;

        renderSummary(result);
        renderEvents(result.events);
        renderDiagnostics(result.diagnostics);
        drawTrace(result.trajectory);

        var cinematic = !!(result.ok && result.summary && result.summary.liftedOff &&
          flightScreen && flightScreen.available);
        watchBtn.disabled = !cinematic;

        if (activeMission) {
          var mres = RS.MissionEngine.evaluate(activeMission, result, vehicle, extra.evalContext);
          renderMissionResult(mres);
          if (mres.passed && !RS.MissionEngine.isDone(activeMission.id)) {
            RS.MissionEngine.markComplete(activeMission.id);
            RS.EraManager.refreshUnlocks(RS.MissionEngine.completedCountByEra());
          }
          console.log('[FIRE→ORBIT] mission "' + activeMission.title + '"', mres);
        }
        console.log('[FIRE→ORBIT] SimulationResult v' + result.contractVersion, result);

        if (cinematic) {
          var fo = { cinematic: true, simOpts: simOpts, daylight: isV2 };
          for (var f in (extra.flightOpts || {})) fo[f] = extra.flightOpts[f];
          flightScreen.open(lastSim, vehicle, activeMission, fo);
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
  }
  document.getElementById('bp-run').addEventListener('click', function () { doLaunch(); });

  // ======================================================================
  //  THE SKY ATLAS — the Fireworks campaign front-end (Phase 16)
  // ======================================================================
  var FW_ERA = '1p5-fireworks';
  function isAtlasMission(m) { return !!(m && m.atlas); }
  function eraHasAtlas(eraId) {
    return !!(RS.render.UI && RS.data.missions.forEra(eraId).some(isAtlasMission));
  }

  if (RS.render.UI) {
    RS.render.UI.init({
      missions: RS.data.missions,
      missionEngine: RS.MissionEngine,
      onLaunchFirework: function (mission, design) {
        // assemble the abstract firework: one lift charge + the shell
        builder.reset();
        var C = RS.PartsCatalog;
        var atl = mission.atlas || {};
        var obj = mission.objectives || {};
        // THE SEQUENCER — M03 (3 tubes, colour only, staggered) / M04 CARNIVAL
        // (5 tubes, colour + fuse, all fire at t0=0). Colour has zero trajectory
        // effect; when the fuses/pitches match, ONE sim drives every shell, else
        // FlightScreen re-sims per tube.
        var seqMode = !!(atl.sequence && design.sequence && design.sequence.length);
        var simultaneous = !!atl.simultaneous;
        var burstDesk = !!(atl.burstDesk && design.shape);   // M05 · Hanabi

        if (seqMode) {
          var nT = design.sequence.length;
          var spread = +atl.fanSpreadDeg || 0;   // a gentle peacock fan for M04
          design.sequence.forEach(function (t, i) {
            t.fuse = +t.fuse || 3.0;
            t.pitch = spread ? Math.round(90 + (i - (nT - 1) / 2) * spread) : 90;
          });
        }

        var ch = vehicle.addInstance(C.get(design.lift || 'fw_lift_m'), 0, 1, []);
        vehicle.addInstance(C.get('fw_shell_atlas'), 0, 0,
          [{ node: 'bottom', toIid: ch.iid, toNode: 'top' }]);
        builder._afterEdit(seqMode
          ? ('พลุ ' + design.sequence.length + ' หลอด · ' +
             design.sequence.map(function (s) { return s.color; }).join(simultaneous ? ' + ' : ' → '))
          : burstDesk
            ? ('ฮานาบิ · ' + design.shape + ' + ' + design.decay)
            : ('พลุ ' + design.color + ' · ชนวน ' + design.fuse + ' วิ'));
        setActiveMission(mission);

        var box = obj.burstAltitudeBox || null;
        var xbox = obj.burstXBox || null;
        // M02+ : the rising khom loy stream — the SAME list feeds Physics
        // (collision check) and the flight scene (rendered lanterns)
        var lanterns = atl.lanterns || null;
        var primaryFuse = seqMode ? design.sequence[0].fuse : design.fuse;
        var simOpts = { fuse: { time: primaryFuse, box: box } };
        if (seqMode && design.sequence[0].pitch && design.sequence[0].pitch !== 90) {
          simOpts.launchPitchDeg = design.sequence[0].pitch;
        } else if (atl.angles && design.angle) {
          simOpts.launchPitchDeg = design.angle;
        }
        if (lanterns) simOpts.obstacles = lanterns;

        doLaunch({
          simOpts: simOpts,
          evalContext: seqMode
            ? { sequenceColors: design.sequence.map(function (s) { return s.color; }),
                sequenceFuses: design.sequence.map(function (s) { return s.fuse; }) }
            : burstDesk
              ? { burstShape: design.shape, decayEffect: design.decay }
              : null,
          flightOpts: {
            firework: {
              color: design.color, colorHex: design.colorHex,
              box: box, xbox: xbox, lift: design.lift, fuse: design.fuse,
              angle: design.angle, lanterns: lanterns,
              sequence: seqMode ? design.sequence : null,
              sequenceGap: simultaneous ? 0 : 1.0,
              shape: burstDesk ? design.shape : null,
              decay: burstDesk ? design.decay : null
            },
            onRetry: function () { RS.render.UI.openDesignDesk(mission); }
          }
        });
      }
    });
  }
  function openFireworkFlow(eraId, mission) {
    if (eraId === FW_ERA && eraHasAtlas(eraId)) {
      if (RS.MissionBriefing && RS.MissionBriefing.hide) RS.MissionBriefing.hide();
      if (mission && isAtlasMission(mission)) setActiveMission(mission);
      RS.render.UI.openSkyAtlas();       // the mission-select constellation
      return true;
    }
    return false;
  }

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
    if (openFireworkFlow(currentEra, m)) return;
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
  console.log('%cFROM FIRE TO ORBIT — Reboot Phase 11.5 ready', 'color:#5fe0a8;font-weight:bold');
  console.log('contract v' + RS.Physics.CONTRACT_VERSION +
    ' · try FIRE_TO_ORBIT.simulate()');
})();
