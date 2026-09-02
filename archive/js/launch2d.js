// js/launch2d.js
// ตัวเรนเดอร์เฟสปล่อยจรวดแบบ 2 มิติ + HUD ค่าการบิน (Phase 1)
// Phase 2 จะสลับไปใช้ Three.js (particle / bloom / camera shake)

const LaunchCtl = { raf: null, canceled: false };

function fmt(n, d = 0) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

// วาดจรวดแบบเวกเตอร์ (fallback 2 มิติ) — ไม่ใช้ตัวอักษร/อีโมจิ ให้ดูเป็นยานจริง
function drawRocket(ctx, meta, crashed) {
  if (crashed) {
    ctx.fillStyle = "#ff7b2e";
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2, r = 10 + (i % 3) * 7;
      ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#ffd23b";
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
    return;
  }
  const tier = meta.tier || 1;
  const stages = Math.max(1, meta.stageCount || 1);

  if (meta.lantern) {
    ctx.fillStyle = "rgba(243,220,174,.92)";
    ctx.strokeStyle = "#8a6a3a"; ctx.lineWidth = 1.5;
    ctx.fillRect(-11, -16, 22, 28); ctx.strokeRect(-11, -16, 22, 28);
    ctx.fillStyle = "#ffb347";
    ctx.beginPath(); ctx.ellipse(0, 12, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
    return;
  }
  if (meta.talai) {
    ctx.strokeStyle = "#8a6a3a"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2;
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 16, Math.sin(a) * 16); ctx.stroke();
    }
    ctx.fillStyle = "#7a5a34";
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    return;
  }

  // จรวดหลายท่อน — กระบอกซ้อน + จมูกกรวย + ครีบฐาน
  const w = tier <= 2 ? 8 : tier === 3 ? 10 : tier === 4 ? 13 : 15;
  const segH = 14;
  const totalH = segH * stages + 16;
  let y = totalH / 2;
  ctx.lineWidth = 1;
  for (let i = 0; i < stages; i++) {
    ctx.fillStyle = i % 2 ? "#c7ccd6" : "#e8eaef";
    ctx.fillRect(-w / 2, y - segH, w, segH);
    ctx.strokeStyle = "rgba(0,0,0,.25)";
    ctx.strokeRect(-w / 2, y - segH, w, segH);
    y -= segH;
  }
  ctx.fillStyle = tier >= 5 ? "#2e5fae" : "#e8eaef";
  ctx.beginPath();
  ctx.moveTo(-w / 2, y); ctx.lineTo(0, y - 16); ctx.lineTo(w / 2, y);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#b23a3a";
  const by = totalH / 2;
  ctx.beginPath(); ctx.moveTo(-w / 2, by - 8); ctx.lineTo(-w / 2 - 6, by); ctx.lineTo(-w / 2, by); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(w / 2, by - 8); ctx.lineTo(w / 2 + 6, by); ctx.lineTo(w / 2, by); ctx.closePath(); ctx.fill();
}

function run(canvas, flightConfig, hooks = {}) {
  cancel();
  LaunchCtl.canceled = false;

  const ctx = canvas.getContext("2d");
  const flight = window.Physics.createFlight(flightConfig);
  const rocket = flightConfig.rocketMeta || { icon: "🚀", spinStabilized: false };

  const hudOn = !!window.FlightHUD;
  if (hudOn) {
    window.FlightHUD.mount({
      initialPitch: (flight.control && flight.control.pitchDeg) || 0,
      onPitch: (d) => flight.setControl && flight.setControl(d, null),
      onYaw: (dir) => flight.setControl && flight.setControl(0, dir),
      onStage: () => flight.requestStage && flight.requestStage()
    });
  }

  // DPI
  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fit();
  window.addEventListener("resize", fit);

  const smoke = [];
  let last = performance.now();
  let simSpeed = 4;             // เร่งเวลาให้เที่ยวบินไม่ยืดเยื้อ
  let holdEndFrames = 0;
  let seenEv = 0, resultDone = false;   // Phase 4: drain physics events → Capcom/Operator
  const target = flightConfig.targetAltitude || 100;

  if (window.Capcom) window.Capcom.mount();
  if (window.Operator) window.Operator.mount();

  function spawnSmoke(px, py, hot) {
    smoke.push({
      x: px + (Math.random() - 0.5) * 10,
      y: py,
      r: 4 + Math.random() * 6,
      life: 1,
      vx: (Math.random() - 0.5) * 20,
      vy: 30 + Math.random() * 60,
      hot
    });
  }

  function frame(now) {
    if (LaunchCtl.canceled) return;
    let dt = (now - last) / 1000;
    last = now;
    // ทนต่อเฟรมตก / แท็บพักหลัง: จำกัดไม่เกิน 0.25s ต่อเฟรม แต่ยังเดินหน้าได้เร็ว
    dt = Math.min(dt, 0.25);

    // step physics (sub-steps ~10ms ต่อก้าว เพื่อความเสถียร)
    const simDt = dt * simSpeed;
    const steps = Math.max(4, Math.ceil(simDt / 0.01));
    for (let i = 0; i < steps; i++) {
      if (flight.state.phase !== "done") flight.step(simDt / steps);
    }
    const s = flight.state;

    // ---------- Phase 4: CAPCOM / Operator ----------
    if (window.Capcom || window.Operator) {
      while (seenEv < s.events.length) {
        const e = s.events[seenEv++];
        if (window.Capcom) window.Capcom.event(e, flight);
        if (window.Operator) window.Operator.event(e.k);
      }
      if (window.Capcom) window.Capcom.feed(s, flight);
      if (s.phase === "done" && !resultDone) {
        resultDone = true;
        if (window.Operator) window.Operator.result(flight.summary());
      }
    }

    // ---------- draw ----------
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const groundY = H - 60;

    // camera: keep rocket ~65% down the screen, scale so target altitude ~ visible
    const pxPerM = Math.min(2.2, (H * 0.6) / Math.max(target * 0.6, s.y + 40));
    const rocketScreenY = groundY - s.y * pxPerM;
    const camShift = Math.max(0, H * 0.35 - rocketScreenY);
    const gY = groundY + camShift;
    const rY = rocketScreenY + camShift;
    const cx = W * 0.5 + Math.max(-W * 0.35, Math.min(W * 0.35, s.x * pxPerM * 0.5));

    // sky gradient by altitude (blue -> dark -> black)
    const spaceT = Math.min(1, s.y / 90000);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    const topBlue = [
      Math.round(20 + (5 - 20) * spaceT),
      Math.round(90 + (7 - 90) * spaceT),
      Math.round(170 + (18 - 170) * spaceT)
    ];
    g.addColorStop(0, `rgb(${topBlue[0]},${topBlue[1]},${topBlue[2]})`);
    g.addColorStop(1, spaceT > 0.6 ? "#0a0a14" : "#bcd8f0");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // stars when high
    if (spaceT > 0.25) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, spaceT * 1.5)})`;
      for (let i = 0; i < 60; i++) {
        const sx = (i * 97.13) % W;
        const sy = (i * 53.7 + s.y * 0.02) % (H * 0.8);
        ctx.fillRect(sx, sy, 1.5, 1.5);
      }
    }

    // ground + pad
    ctx.fillStyle = "#6b5a3c";
    ctx.fillRect(0, gY, W, H - gY + 200);
    ctx.fillStyle = "#4c4c55";
    ctx.fillRect(cx - 26, gY - 8, 52, 12);
    ctx.fillStyle = "#33333b";
    ctx.fillRect(cx - 4, gY - 34, 8, 30);

    // target altitude line
    const tY = gY - target * pxPerM;
    if (tY > -20 && tY < H + 20) {
      ctx.strokeStyle = "rgba(176,138,60,.85)";
      ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(0, tY); ctx.lineTo(W, tY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(176,138,60,1)";
      ctx.font = "11px 'JetBrains Mono', monospace";
      ctx.fillText(`เป้าหมาย ${fmt(target)} m`, 8, tY - 5);
    }

    // smoke update/draw
    for (let i = smoke.length - 1; i >= 0; i--) {
      const p = smoke[i];
      p.life -= dt * simSpeed * 0.5;
      p.x += p.vx * dt;
      p.y += (p.vy - 10) * dt;
      p.r += dt * simSpeed * 8;
      if (p.life <= 0) { smoke.splice(i, 1); continue; }
      const a = Math.max(0, p.life) * 0.5;
      if (p.hot) ctx.fillStyle = `rgba(255,${120 + Math.random() * 80 | 0},40,${a})`;
      else ctx.fillStyle = `rgba(120,120,130,${a * 0.8})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // exhaust + smoke spawn while burning
    if (s.thrustNow > 0 && s.phase !== "done") {
      for (let i = 0; i < 3; i++) spawnSmoke(cx, rY + 16, i === 0);
      const flameLen = 14 + Math.min(40, s.thrustNow / 40);
      const grd = ctx.createLinearGradient(0, rY + 8, 0, rY + 8 + flameLen);
      grd.addColorStop(0, "#fff3c0");
      grd.addColorStop(0.5, "#ffae2b");
      grd.addColorStop(1, "rgba(226,58,58,0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(cx - 6, rY + 8);
      ctx.lineTo(cx + 6, rY + 8);
      ctx.lineTo(cx + (Math.random() - 0.5) * 6, rY + 8 + flameLen);
      ctx.closePath();
      ctx.fill();
    }

    // rocket body — วาดเป็นรูปจรวดจริง (ไม่ใช่ตัวอักษร/อีโมจิ)
    ctx.save();
    ctx.translate(cx, rY);
    if (rocket.spinStabilized && s.phase !== "done") ctx.rotate((s.t * 12) % (Math.PI * 2));
    drawRocket(ctx, rocket, s.phase === "done" && flight.state.crashed);
    ctx.restore();

    // ---------- HUD ----------
    drawHUD(ctx, W, s, flight, target);
    if (hudOn) window.FlightHUD.update(s, flight);

    // completion
    if (s.phase === "done") {
      holdEndFrames++;
      if (holdEndFrames > 45) {
        cleanup();
        hooks.onComplete && hooks.onComplete(flight.summary());
        return;
      }
    }
    LaunchCtl.raf = requestAnimationFrame(frame);
  }

  function cleanup() {
    window.removeEventListener("resize", fit);
    if (LaunchCtl.raf) cancelAnimationFrame(LaunchCtl.raf);
    LaunchCtl.raf = null;
    if (hudOn) window.FlightHUD.unmount();
    if (window.Capcom) window.Capcom.unmount();
    if (window.Operator) window.Operator.unmount();
  }

  LaunchCtl.raf = requestAnimationFrame(frame);
  return { cancel: () => { LaunchCtl.canceled = true; cleanup(); } };
}

function drawHUD(ctx, W, s, flight, target) {
  const pad = 12;
  ctx.font = "12px 'JetBrains Mono', monospace";
  const rows = [
    ["ALT",  `${fmt(s.y)} m`],
    ["VEL",  `${fmt(Math.hypot(s.vx, s.vy))} m/s`],
    ["Q",    `${fmt(s.q)} Pa`],
    ["MaxQ", `${fmt(s.maxQ)} Pa @ ${fmt(s.maxQAlt)} m`],
    ["DRIFT",`${fmt(s.x)} m`],
    ["PHASE", phaseLabel(s.phase)]
  ];
  const boxW = 210, boxH = rows.length * 18 + 14;
  ctx.fillStyle = "rgba(10,12,20,.72)";
  ctx.fillRect(pad, pad, boxW, boxH);
  ctx.strokeStyle = "rgba(176,138,60,.7)";
  ctx.strokeRect(pad, pad, boxW, boxH);
  rows.forEach((r, i) => {
    ctx.fillStyle = "#8aa6d8";
    ctx.fillText(r[0], pad + 8, pad + 20 + i * 18);
    ctx.fillStyle = "#e9e7e1";
    ctx.fillText(r[1], pad + 62, pad + 20 + i * 18);
  });

  // altitude progress bar (right)
  const bx = W - 26, by = pad, bh = 160;
  ctx.fillStyle = "rgba(10,12,20,.6)";
  ctx.fillRect(bx, by, 14, bh);
  const frac = Math.max(0, Math.min(1.2, s.apogee / target));
  ctx.fillStyle = frac >= 1 ? "#4FCB8D" : "#84A6E8";
  ctx.fillRect(bx, by + bh - Math.min(bh, frac * bh), 14, Math.min(bh, frac * bh));
  ctx.strokeStyle = "rgba(176,138,60,.8)";
  ctx.beginPath(); ctx.moveTo(bx - 4, by); ctx.lineTo(bx + 18, by); ctx.stroke();
}

function phaseLabel(p) {
  return { pad: "บนแท่น", boost: "เครื่องทำงาน", coast: "ไต่ระดับอิสระ", descent: "ตกลง", done: "จบเที่ยวบิน" }[p] || p;
}

function cancel() {
  LaunchCtl.canceled = true;
  if (LaunchCtl.raf) { cancelAnimationFrame(LaunchCtl.raf); LaunchCtl.raf = null; }
}

window.Launch2D = { run, cancel };
