// js/testing.js — Phase 17 · The Testing Phase & Mini-Games
//
//   STATE_TESTING gets a retro-futuristic diagnostic console (oscilloscope + CRT + terminal log)
//   and loads one mini-game per campaign mission:
//     m2_newyear  → SIGNAL MATCH        — click CALIBRATE when the sweeping SYSTEM marker hits TARGET
//     m9_july4    → TIMING DRIFT        — «« ADJUST »» the phase to ~0, then HOLD TO LOCK for 2 s
//     m10_brazil  → DIAGNOSTIC MISMATCH — find the ⚠ node → pick the distorted trace → realign (dial)
//     default     → SIGNAL MATCH
//
//   NPCs: Kapi introduces the fault · Cha-om nags about the delay · P'Chang gives the "GO" on solve.
//
//   window.TestingGames.mount(hostEl, data, onSolved)   data = { missionId, fw, mats, tree, npc }
//   window.TestingGames.unmount()

(function () {
  "use strict";

  const LW = 700, LH = 260;
  let host = null, canvas = null, g = null, raf = 0;
  let game = null, npc = null, onSolvedCb = null, solvedFlag = false;
  let lastT = 0, clockT = 0, nagTimer = null, audio = null;

  // ---------- audio ----------
  function ensureAudio() {
    if (audio) return audio;
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; }
    return audio;
  }
  function blip(freq, dur, type, vol, slideTo) {
    const a = ensureAudio(); if (!a) return;
    try {
      const o = a.createOscillator(), gn = a.createGain();
      o.type = type || "square"; o.frequency.value = freq;
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), a.currentTime + dur);
      gn.gain.value = vol || 0.045;
      gn.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      o.connect(gn); gn.connect(a.destination);
      o.start(); o.stop(a.currentTime + dur + 0.03);
    } catch (e) {}
  }
  const sfx = {
    tick: () => blip(720, 0.04, "square", 0.03),
    adjust: () => blip(280 + Math.random() * 130, 0.03, "square", 0.022),
    good: () => { blip(560, 0.06, "sine", 0.05); setTimeout(() => blip(880, 0.09, "sine", 0.05), 55); },
    bad: () => blip(150, 0.22, "sawtooth", 0.05, 70),
    lock: () => { blip(440, 0.08, "sine", 0.05); setTimeout(() => blip(660, 0.08, "sine", 0.05), 70); setTimeout(() => blip(990, 0.18, "sine", 0.06), 150); }
  };

  // ---------- canvas draw helpers ----------
  function drawWave(c, fn, color, w, blur) {
    c.save();
    c.strokeStyle = color; c.lineWidth = w || 2;
    c.shadowBlur = blur || 6; c.shadowColor = color;
    c.beginPath();
    for (let x = 0; x <= LW; x += 2) { const y = fn(x); x === 0 ? c.moveTo(x, y) : c.lineTo(x, y); }
    c.stroke();
    c.restore();
  }
  function glowText(c, txt, x, y, color, size, align) {
    c.save();
    c.font = "700 " + (size || 12) + "px 'JetBrains Mono', monospace";
    c.fillStyle = color; c.shadowBlur = 8; c.shadowColor = color;
    c.textBaseline = "top"; c.textAlign = align || "left";
    c.fillText(txt, x, y);
    c.restore();
  }
  function bezelGrid(c) {
    c.save();
    c.strokeStyle = "rgba(77,255,155,.07)"; c.lineWidth = 1;
    for (let x = 0; x <= LW; x += 35) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, LH); c.stroke(); }
    for (let y = 0; y <= LH; y += 35) { c.beginPath(); c.moveTo(0, y); c.lineTo(LW, y); c.stroke(); }
    c.strokeStyle = "rgba(77,255,155,.16)";
    c.beginPath(); c.moveTo(0, LH / 2); c.lineTo(LW, LH / 2); c.stroke();
    c.restore();
  }

  // ---------- console shell ----------
  const MLABEL = { m2_newyear: "MISSION 01", m9_july4: "MISSION 02", m10_brazil: "MISSION 03" };
  function missionLabel(id) { return MLABEL[id] || "MISSION"; }

  function buildShell(mLabel, gLabel, tint) {
    host.innerHTML =
      '<div class="tc" id="tc-root" data-tint="' + tint + '">' +
        '<div class="tc-bezel">' +
          '<div class="tc-topbar">' +
            '<span class="tc-led" id="tc-led"></span>' +
            '<span class="tc-name">DIAGNOSTIC CONSOLE</span>' +
            '<span class="tc-mission">' + mLabel + ' · ' + gLabel + '</span>' +
            '<span class="tc-clock" id="tc-clock">T+00:00</span>' +
          '</div>' +
          '<div class="tc-scope" id="tc-scope">' +
            '<canvas id="tc-canvas"></canvas>' +
            '<div class="tc-readout" id="tc-readout"></div>' +
            '<div class="tc-crt" aria-hidden="true"></div>' +
            '<div class="tc-flash" id="tc-flash" aria-hidden="true"></div>' +
            '<div class="tc-big" id="tc-big" hidden></div>' +
          '</div>' +
          '<div class="tc-status" id="tc-status">● INITIALISING…</div>' +
          '<div class="tc-controls" id="tc-controls"></div>' +
          '<pre class="tc-log" id="tc-log"></pre>' +
        '</div>' +
      '</div>';
    canvas = host.querySelector("#tc-canvas");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = LW * dpr; canvas.height = LH * dpr;
    canvas.style.aspectRatio = LW + " / " + LH;
    g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function log(line, cls) {
    const el = host && host.querySelector("#tc-log"); if (!el) return;
    const s = document.createElement("span");
    s.className = "tc-logline" + (cls ? " " + cls : "");
    s.textContent = line + "\n";
    el.appendChild(s);
    el.scrollTop = el.scrollHeight;
    while (el.children.length > 36) el.removeChild(el.firstChild);
  }
  function status(txt, cls) {
    const el = host && host.querySelector("#tc-status"); if (!el) return;
    el.textContent = "● " + String(txt).replace(/^●\s*/, "");
    el.className = "tc-status" + (cls ? " " + cls : "");
  }
  function big(txt, cls) {
    const el = host && host.querySelector("#tc-big"); if (!el) return;
    if (!txt) { el.hidden = true; return; }
    el.textContent = txt;
    el.className = "tc-big" + (cls ? " " + cls : "");
    el.hidden = false;
  }
  function readout(html) { const el = host && host.querySelector("#tc-readout"); if (el) el.innerHTML = html; }
  function flash(kind) {
    const el = host && host.querySelector("#tc-flash"); if (!el) return;
    el.className = "tc-flash on-" + (kind === "good" ? "good" : "bad");
    setTimeout(() => { if (el) el.className = "tc-flash"; }, 240);
  }
  function shake() {
    const el = host && host.querySelector("#tc-scope"); if (!el) return;
    el.classList.remove("tc-shake"); void el.offsetWidth; el.classList.add("tc-shake");
  }

  // ---------- shared: rotary phase-lock mechanic ----------
  function PhaseLock(env, opts) {
    opts = opts || {};
    const TOL = 0.11;
    let phi = opts.startPhi != null ? opts.startPhi : (1.4 + Math.random() * 0.9) * (Math.random() < 0.5 ? -1 : 1);
    let driftT = Math.random() * 12;
    let holding = false, prog = 0, locked = false, done = false;
    let adjDir = 0, adjHold = 0, adjRepeat = null;
    const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
    const inTol = () => Math.abs(wrap(phi)) < TOL;

    function nudge() {
      if (locked) return;
      phi -= adjDir * (0.05 + Math.min(0.09, adjHold));
      sfx.adjust();
    }
    function renderControls() {
      env.setControls(
        '<button type="button" class="tc-btn tc-btn--adj" data-adj="-1">‹‹ ADJUST</button>' +
        '<div class="tc-holdwrap">' +
          '<button type="button" class="tc-btn tc-btn--hold" id="tc-hold" disabled>HOLD TO LOCK</button>' +
          '<div class="tc-holdbar"><span id="tc-holdfill"></span></div>' +
        '</div>' +
        '<button type="button" class="tc-btn tc-btn--adj" data-adj="1">ADJUST ››</button>');
      const c = env.controls();
      c.querySelectorAll("[data-adj]").forEach(b => {
        const dir = +b.dataset.adj;
        const start = e => { e.preventDefault(); adjDir = dir; adjHold = 0; nudge(); adjRepeat = setInterval(() => { adjHold += 0.05; nudge(); }, 55); b.classList.add("pressed"); };
        const end = () => { adjDir = 0; if (adjRepeat) { clearInterval(adjRepeat); adjRepeat = null; } b.classList.remove("pressed"); };
        b.addEventListener("pointerdown", start);
        b.addEventListener("pointerup", end);
        b.addEventListener("pointerleave", end);
        b.addEventListener("pointercancel", end);
      });
      const hb = c.querySelector("#tc-hold");
      const hstart = e => { e.preventDefault(); if (hb.disabled || locked) return; holding = true; hb.classList.add("pressed"); sfx.tick(); };
      const hend = () => {
        if (!holding || locked) return;
        holding = false; hb.classList.remove("pressed");
        if (prog < 1) { prog = 0; env.fail("BUFFER LOST — hold again"); if (env.npcSay) env.npcSay("kapi", "ปล่อยมือเร็วไปพี่! ต้องค้างจนเต็มหลอด"); }
      };
      hb.addEventListener("pointerdown", hstart);
      hb.addEventListener("pointerup", hend);
      hb.addEventListener("pointerleave", hend);
      hb.addEventListener("pointercancel", hend);
    }

    function update(dt) {
      if (done) return;
      if (!holding && !locked) {
        driftT += dt;
        const dmul = inTol() ? 0.3 : 1;
        phi += (Math.sin(driftT * 0.8) * 0.4 + 0.15) * dt * 0.035 * dmul;
      }
      const ok = inTol();
      const c = env.controls();
      const hb = c && c.querySelector("#tc-hold");
      if (hb) hb.disabled = !ok || locked;
      if (holding && ok) {
        prog = Math.min(1, prog + dt / 2.0);
        if (prog >= 1 && !locked) {
          locked = true; done = true;
          if (hb) hb.classList.remove("pressed");
          sfx.lock();
          if (opts.onLock) opts.onLock();
        }
      } else if (holding && !ok) {
        holding = false; prog = 0;
        if (hb) hb.classList.remove("pressed");
        env.fail("PHASE SLIPPED — realign");
      }
      const fill = c && c.querySelector("#tc-holdfill");
      if (fill) fill.style.width = (prog * 100).toFixed(0) + "%";
      const d = wrap(phi);
      readout("PHASE Δ <b class=\"" + (Math.abs(d) < TOL ? "ok" : Math.abs(d) < 0.4 ? "warn" : "bad") + "\">" +
        (d >= 0 ? "+" : "") + d.toFixed(3) + "</b> rad" +
        (locked ? " · <b class=\"ok\">LOCKED</b>" : holding ? " · SYNCING " + (prog * 100).toFixed(0) + "%" :
          ok ? " · <b class=\"ok\">IN WINDOW — HOLD</b>" : ""));
    }

    function draw() {
      const c = env.g, midY = LH * 0.5, amp = LH * 0.30, k = (Math.PI * 4) / LW, d = wrap(phi);
      drawWave(c, x => midY - amp * Math.sin(k * x), "#5be7ff", 2, 8);
      const shimmer = inTol() ? 1 + Math.sin(performance.now() * 0.02) * 0.05 : 1;
      drawWave(c, x => midY - amp * shimmer * Math.sin(k * x + d), locked ? "#4dff9b" : "#ffcf6b", locked ? 3 : 2.4, locked ? 16 : 6);
      // centre phase-delta indicator
      c.save();
      c.fillStyle = Math.abs(d) < TOL ? "#4dff9b" : "#ff5b6b";
      c.shadowBlur = 8; c.shadowColor = c.fillStyle; c.globalAlpha = 0.95;
      c.fillRect(LW / 2 - 1, LH - 26, 2, 14);
      const bw = d * 90;
      c.fillRect(LW / 2 + Math.min(0, bw), LH - 21, Math.max(2, Math.abs(bw)), 5);
      c.restore();
      glowText(c, "▬ TARGET", 12, LH - 42, "#5be7ff", 10);
      glowText(c, "▬ SYSTEM", 12, LH - 26, locked ? "#4dff9b" : "#ffcf6b", 10);
      if (opts.label) glowText(c, opts.label, LW - 12, 14, "#4dff9b", 10, "right");
    }
    function destroy() { if (adjRepeat) clearInterval(adjRepeat); }

    renderControls();
    return { update, draw, destroy, get locked() { return locked; } };
  }

  // ---------- game 1: SIGNAL MATCH ----------
  function SignalMatch(env) {
    let t = 0, omega = 1.9, solved = false, missLock = 0, flashT = 0;
    const TOL = 0.10;
    const x0 = 60, x1 = LW - 60, ty = LH * 0.56;
    const cx = (x0 + x1) / 2, half = (x1 - x0) / 2 - 16;
    const hist = [];
    const sysVal = () => Math.sin(t * omega);
    const markerX = () => cx + sysVal() * half;

    function calibrate() {
      if (solved || missLock > 0) return;
      const off = Math.abs(sysVal());
      if (off < TOL) {
        solved = true; flashT = 1;
        big("SYNC ESTABLISHED", "ok");
        status("SIGNAL LOCKED — cleared for launch", "ok");
        log("> CALIBRATION LOCKED · offset " + (off * 100).toFixed(1) + "%", "ok");
        sfx.lock(); flash("good");
        setTimeout(() => env.solve(), 950);
      } else {
        missLock = 0.55;
        omega = Math.min(2.9, omega + 0.11);
        env.fail("CALIBRATION MISSED · offset " + (off * 100).toFixed(0) + "%");
        env.npcSay("kapi", off < 0.28 ? "เกือบละพี่! อีกนิดเดียว 💦" : "ยังไม่เข้ากรอบเลยครับ ใจเย็น ๆ");
      }
    }

    env.setControls('<button type="button" class="tc-btn tc-btn--big tc-pulse" id="tc-cal">◎ CALIBRATE</button>');
    env.controls().querySelector("#tc-cal").addEventListener("click", calibrate);
    env.npcPlay([{ who: "kapi", text: "พี่ครับ ระบบยังไม่คาลิเบรต — ตัวชี้ SYSTEM มันแกว่งซ้ายขวา กด CALIBRATE จังหวะที่มันเข้ากรอบ TARGET พอดีนะครับ" }]);

    return {
      update(dt) {
        if (missLock > 0) missLock -= dt;
        if (!solved && missLock <= 0) t += dt;
        flashT = Math.max(0, flashT - dt);
        hist.push(markerX()); if (hist.length > 96) hist.shift();
        const off = Math.abs(sysVal());
        readout("SYNC OFFSET <b class=\"" + (off < TOL ? "ok" : off < 0.3 ? "warn" : "bad") + "\">" + (off * 100).toFixed(0) + "%</b>" +
          (solved ? " · <b class=\"ok\">LOCKED</b>" : missLock > 0 ? " · <span class=\"bad\">MISSED</span>" : ""));
      },
      draw() {
        const c = env.g;
        c.save(); c.strokeStyle = "rgba(91,231,255,.32)"; c.lineWidth = 2;
        c.beginPath(); c.moveTo(x0, ty); c.lineTo(x1, ty); c.stroke(); c.restore();
        // target band
        const bw = TOL * half;
        c.save();
        c.fillStyle = "rgba(91,231,255,.13)"; c.strokeStyle = "#5be7ff";
        c.shadowBlur = 10; c.shadowColor = "#5be7ff"; c.lineWidth = 1.5;
        c.fillRect(cx - bw, ty - 46, bw * 2, 92);
        c.strokeRect(cx - bw, ty - 46, bw * 2, 92);
        c.restore();
        glowText(c, "TARGET", cx, ty - 66, "#5be7ff", 11, "center");
        // oscilloscope history strip
        c.save(); c.strokeStyle = "rgba(77,255,155,.45)"; c.lineWidth = 1.5;
        c.shadowBlur = 4; c.shadowColor = "#4dff9b"; c.beginPath();
        hist.forEach((mx, i) => {
          const x = x0 + (i / 95) * (x1 - x0);
          const y = 42 + ((mx - x0) / (x1 - x0)) * 58;
          i ? c.lineTo(x, y) : c.moveTo(x, y);
        });
        c.stroke(); c.restore();
        // marker
        const mx = markerX();
        const col = (solved || Math.abs(sysVal()) < TOL) ? "#4dff9b" : "#ffcf6b";
        c.save();
        c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 3;
        c.shadowBlur = 16; c.shadowColor = col;
        c.beginPath(); c.moveTo(mx, ty - 54); c.lineTo(mx, ty + 54); c.stroke();
        c.beginPath(); c.arc(mx, ty, 6, 0, 7); c.fill();
        c.restore();
        glowText(c, "SYSTEM", mx, ty + 60, col, 11, "center");
        if (flashT > 0) { c.save(); c.fillStyle = "rgba(77,255,155," + (flashT * 0.22) + ")"; c.fillRect(0, 0, LW, LH); c.restore(); }
      },
      destroy() {}
    };
  }

  // ---------- game 2: TIMING DRIFT ----------
  function TimingDrift(env) {
    status("TIMING DESYNC — align phase, then HOLD TO LOCK", "warn");
    const core = PhaseLock(env, {
      label: "TIMING BUS",
      startPhi: (1.5 + Math.random() * 0.8) * (Math.random() < 0.5 ? -1 : 1),
      onLock: () => {
        big("PHASE LOCK ACQUIRED", "ok");
        status("TIMING BUS SYNCED — cleared for launch", "ok");
        log("> TIMING BUS SYNCED · Δφ < 0.11 rad", "ok");
        flash("good");
        setTimeout(() => env.solve(), 950);
      }
    });
    env.npcPlay([{ who: "kapi", text: "พี่ครับ ผมเสียบสายจับเวลาสลับขั้ว กราฟเลยเลื่อนเฟส 💦 หมุน «« ADJUST »» ให้คลื่นเขียวทับคลื่นฟ้า แล้วกดค้าง HOLD TO LOCK จนเต็มหลอดนะครับ" }]);
    return { update: dt => core.update(dt), draw: () => core.draw(), destroy: () => core.destroy() };
  }

  // ---------- game 3: DIAGNOSTIC MISMATCH ----------
  function DiagnosticMismatch(env) {
    const fw = (env.data && env.data.fw) || {};
    const colorPicked = env.data && env.data.mats && env.data.mats.color;
    const flagged = (colorPicked && fw.requiredMet === false) ? "color" : "timing";
    const NODES = [
      { id: "color", th: "COLOR CORE", sub: "spectral emitter" },
      { id: "timing", th: "TIMING CORE", sub: "fuse sequencer" },
      { id: "stability", th: "STABILITY", sub: "spin gyro" },
      { id: "casing", th: "CASING SEAL", sub: "pressure vessel" }
    ];
    const distorted = Math.floor(Math.random() * 3);
    let phase = "find", traceT = 0, dial = null;

    function renderFind() {
      phase = "find";
      status("FAULT DETECTED — locate the flagged subsystem", "bad");
      env.setControls(NODES.map(n =>
        '<button type="button" class="tc-node ' + (n.id === flagged ? "warn" : "") + '" data-node="' + n.id + '">' +
          '<b>' + n.th + '</b><small>' + n.sub + '</small>' +
          '<span class="tc-node-stat">' + (n.id === flagged ? "⚠ CHECK" : "◇ NOMINAL") + '</span>' +
        '</button>').join(""));
      env.controls().querySelectorAll("[data-node]").forEach(b => b.addEventListener("click", () => {
        if (b.dataset.node === flagged) {
          log("> " + NODES.find(n => n.id === flagged).th + " flagged — opening signal traces", "ok");
          sfx.good(); flash("good");
          renderTrace();
        } else {
          env.fail(b.querySelector("b").textContent + " — NOMINAL, check another");
        }
      }));
      env.npcPlay([{ who: "kapi", text: "พี่ครับ มีระบบนึงขึ้นเตือน ⚠ ผมหาไม่เจอว่าอันไหน ช่วยไล่เช็คหน่อย 💦" }]);
    }
    function renderTrace() {
      phase = "trace";
      status("3 SIGNAL TRACES — click the distorted one", "warn");
      env.setControls('<button type="button" class="tc-btn" data-tr="0">TRACE A</button>' +
        '<button type="button" class="tc-btn" data-tr="1">TRACE B</button>' +
        '<button type="button" class="tc-btn" data-tr="2">TRACE C</button>');
      env.controls().querySelectorAll("[data-tr]").forEach(b => b.addEventListener("click", () => {
        const i = +b.dataset.tr;
        if (i === distorted) {
          log("> TRACE " + "ABC"[i] + " — waveform integrity FAIL · signal desync isolated", "ok");
          sfx.good(); flash("good");
          renderRealign();
        } else {
          env.fail("TRACE " + "ABC"[i] + " — nominal");
        }
      }));
      env.npcSay("chaom", "อันไหนอ่ะ? อันที่มันหยึกหยักไง! 😾");
    }
    function renderRealign() {
      phase = "realign";
      big(null);
      status("SIGNAL DESYNC — realign the phase to lock", "warn");
      dial = PhaseLock(env, {
        label: "TRACE " + "ABC"[distorted] + " · REALIGN",
        onLock: () => {
          phase = "done";
          big("SYSTEM RESTORED", "ok");
          status("ALL SUBSYSTEMS NOMINAL — cleared for launch", "ok");
          log("> ALL SUBSYSTEMS NOMINAL", "ok");
          flash("good");
          setTimeout(() => env.solve(), 950);
        }
      });
      env.npcPlay([{ who: "kapi", text: "เจอแล้ว! สายมันเพี้ยนเฟส — หมุน ADJUST ให้คลื่นทับกัน แล้ว HOLD ค้างไว้เหมือนเดิมครับ" }]);
    }

    renderFind();

    return {
      update(dt) { traceT += dt; if (phase === "realign" && dial) dial.update(dt); },
      draw() {
        const c = env.g;
        if (phase === "find") {
          glowText(c, "SUBSYSTEM BUS · 4 NODES", 14, 14, "#4dff9b", 12);
          NODES.forEach((n, i) => {
            const x = 100 + i * ((LW - 200) / 3), y = LH * 0.56, warn = n.id === flagged;
            const p = warn ? 0.55 + Math.abs(Math.sin(traceT * 4)) * 0.45 : 0.4;
            c.save();
            c.strokeStyle = warn ? "#ffcf6b" : "#4dff9b"; c.fillStyle = c.strokeStyle;
            c.globalAlpha = p; c.shadowBlur = warn ? 18 : 6; c.shadowColor = c.strokeStyle; c.lineWidth = 2;
            c.beginPath(); c.arc(x, y, warn ? 22 : 16, 0, 7); c.stroke();
            c.globalAlpha = p * 0.5; c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill();
            c.restore();
            glowText(c, n.th, x, y + 34, warn ? "#ffcf6b" : "#4dff9b", 9, "center");
          });
        } else if (phase === "trace") {
          for (let i = 0; i < 3; i++) {
            const y0 = 44 + i * 68, dist = i === distorted;
            glowText(c, "TRACE " + "ABC"[i], 14, y0 - 24, dist ? "#ff8a3d" : "#5be7ff", 10);
            drawWave(c, x => {
              const base = Math.sin(x * 0.05 + traceT * 2 + i);
              let v = base;
              if (dist) {
                const nz = (Math.sin(x * 0.9 + traceT * 22) * 0.5 + (Math.random() - 0.5) * 0.6) * (0.4 + 0.6 * Math.abs(Math.sin(x * 0.13)));
                v = Math.max(-1.15, Math.min(1.15, (base + nz) * 1.3));
              }
              return y0 + v * 19;
            }, dist ? "#ff8a3d" : "#5be7ff", dist ? 2 : 1.6, dist ? 9 : 4);
          }
        } else if (phase === "realign" && dial) {
          dial.draw();
        }
      },
      destroy() { if (dial) dial.destroy(); }
    };
  }

  // ---------- registry ----------
  const GAMES = { signal_match: SignalMatch, timing_drift: TimingDrift, diagnostic_mismatch: DiagnosticMismatch };
  const MISSION_GAME = { m2_newyear: "signal_match", m9_july4: "timing_drift", m10_brazil: "diagnostic_mismatch" };
  const GAME_META = {
    signal_match: { label: "SIGNAL MATCH", status: "CALIBRATION REQUIRED — match SYSTEM to TARGET" },
    timing_drift: { label: "TIMING DRIFT", status: "TIMING DESYNC — align phase then HOLD TO LOCK" },
    diagnostic_mismatch: { label: "DIAGNOSTIC MISMATCH", status: "FAULT DETECTED — isolate & repair" }
  };

  const NAGS = [
    "น้าาา จะเสร็จยังคะ หนูอยากบินแล้ว 😤",
    "พี่ทำช้าจัง! พลุจะเย็นหมดแล้วนะ",
    "หนูนับดาวรอบที่สามแล้ว ⭐ รีบ ๆ หน่อยดิ",
    "อีกนานมั้ย! หนูใส่ชุดอวกาศรอตั้งนานแล้ว 🚀"
  ];
  function scheduleNag() {
    let i = 0, fired = 0;
    nagTimer = setInterval(() => {
      if (solvedFlag || fired >= 3 || !npc) { clearInterval(nagTimer); nagTimer = null; return; }
      if (npc.play) npc.play([
        { who: "chaom", text: NAGS[i % NAGS.length] },
        { who: "kapi", text: "ชะอมม ใจเย็น ๆ เดี๋ยวพี่เขาก็แก้ได้" }
      ], { auto: 2800 });
      i++; fired++;
    }, 15000);
  }

  function makeEnv(data) {
    return {
      get g() { return g; },
      W: LW, H: LH, data: data, npc: npc,
      log: log, status: status, big: big, hideBig: () => big(null), readout: readout,
      flash: flash, shake: shake, sfx: sfx,
      controls: () => host && host.querySelector("#tc-controls"),
      setControls: (h) => { const el = host && host.querySelector("#tc-controls"); if (el) el.innerHTML = h; },
      npcSay: (who, text) => { if (npc && npc.flash) npc.flash(who, text); },
      npcPlay: (lines, opts) => { if (npc && npc.play) npc.play(lines, opts || {}); },
      solve: winSequence,
      fail: (msg) => { flash("bad"); shake(); if (msg) { log("! " + msg, "bad"); status(msg, "bad"); } sfx.bad(); }
    };
  }

  function winSequence() {
    if (solvedFlag) return;
    solvedFlag = true;
    if (nagTimer) { clearInterval(nagTimer); nagTimer = null; }
    const led = host && host.querySelector("#tc-led"); if (led) led.classList.add("ok");
    status("SYSTEM NOMINAL — cleared for launch", "ok");
    if (npc && npc.play) {
      npc.play([
        { who: "kapi", text: "แก้ได้แล้ว! ขอบคุณครับพี่ 🙏" },
        { who: "pchang", text: "Diagnostic ผ่านทุกช่อง ระบบเคลียร์ — GO for launch. ส่งต่อให้ห้องคอนโทรลได้เลย" }
      ], { onDone: () => { if (onSolvedCb) onSolvedCb(); } });
    } else if (onSolvedCb) onSolvedCb();
  }

  // ---------- loop ----------
  function updateClock() {
    const el = host && host.querySelector("#tc-clock"); if (!el) return;
    const s = Math.floor(clockT);
    el.textContent = "T+" + String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    clockT += dt; updateClock();
    if (game && game.update) { try { game.update(dt); } catch (e) { console.warn("[Testing] update", e); } }
    if (g) {
      g.clearRect(0, 0, LW, LH);
      bezelGrid(g);
      if (game && game.draw) { try { game.draw(dt); } catch (e) { console.warn("[Testing] draw", e); } }
    }
  }

  // ---------- public ----------
  function mount(hostEl, data, onSolved) {
    unmount();
    host = hostEl; onSolvedCb = onSolved || null;
    npc = (data && data.npc) || window.NPC || null;
    solvedFlag = false; clockT = 0;
    const key = MISSION_GAME[data && data.missionId] || "signal_match";
    const meta = GAME_META[key];
    buildShell(missionLabel(data && data.missionId), meta.label, key);
    log("> DIAGNOSTIC CONSOLE v2.6 · link established", "");
    log("> module: " + meta.label, "");
    status(meta.status, "warn");
    try { game = GAMES[key](makeEnv(data || {})); }
    catch (e) { console.warn("[Testing] game init", e); if (onSolvedCb) onSolvedCb(); return; }
    scheduleNag();
    lastT = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function unmount() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (nagTimer) { clearInterval(nagTimer); nagTimer = null; }
    if (game && game.destroy) { try { game.destroy(); } catch (e) {} }
    game = null;
    if (host) host.innerHTML = "";
    canvas = null; g = null;
  }

  window.TestingGames = { mount, unmount };
})();
