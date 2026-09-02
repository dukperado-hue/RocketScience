// js/audio.js — Phase 18 · SoundStage
//   บรรยากาศเสียงฉากปล่อย (โคมลอย / พลุ) — สังเคราะห์ด้วย WebAudio ล้วน ไม่มีไฟล์เสียง
//
//   window.SoundStage.startNight({crickets,wind}) -> { setBurner(0..1), setWind(0..1), stop() }
//       เสียงกลางคืน: จิ้งหรีดแผ่ว · ลมพัดเบา ๆ · เสียงหึ่งของไฟคบในโคม (ปรับระดับได้)
//   window.SoundStage.thump()                     — เสียง "ตุ้บ" ปากท่อครกตอนยิงพลุ
//   window.SoundStage.hiss(dur) -> { stop() }     — เสียงลมหวีดตอนลูกพลุไต่ขึ้น
//   window.SoundStage.boom(distanceM,{size})      — เสียงระเบิดพลุ หน่วงตามระยะ (v เสียง ≈ 343 m/s)
//   window.SoundStage.crackle(dur,distanceM) -> { stop() }
//                                                — เสียงประกายกรอบแกรบค้างฟ้าช่วงเม็ดดาวลอย ค่อย ๆ จาง
//
//   ทุกฟังก์ชันกันพังเมื่อไม่มี WebAudio — คืน object เปล่าที่เรียกได้ปกติ

(function () {
  "use strict";

  const SPEED_OF_SOUND = 343;   // m/s
  const NULL_HANDLE = { setBurner() {}, setWind() {}, stop() {} };

  let AC = null;
  function ctx() {
    if (AC === null) {
      try { AC = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { AC = false; }
    }
    if (AC && AC.state === "suspended") { try { AC.resume(); } catch (e) {} }
    return AC || null;
  }
  // ปลดล็อกเสียงเมื่อผู้เล่นแตะจอครั้งแรก (นโยบาย autoplay)
  ["pointerdown", "keydown", "touchstart"].forEach(ev =>
    window.addEventListener(ev, () => ctx(), { passive: true }));

  function noiseBuffer(a, seconds) {
    const len = Math.max(1, Math.floor(a.sampleRate * seconds));
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const sndDelay = m => Math.min(6, Math.max(0, (m || 0) / SPEED_OF_SOUND));

  // ---------------- Task 4 · one-shots ----------------

  // มอร์ตาร์ "ตุ้บ" — ยิงลูกพลุออกจากท่อครก
  function thump() {
    const a = ctx(); if (!a) return;
    const t0 = a.currentTime;
    try {
      const o = a.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(150, t0);
      o.frequency.exponentialRampToValueAtTime(38, t0 + 0.28);
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.85, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
      o.connect(g); g.connect(a.destination);
      o.start(t0); o.stop(t0 + 0.5);

      const src = a.createBufferSource(); src.buffer = noiseBuffer(a, 0.3);
      const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 850;
      const ng = a.createGain();
      ng.gain.setValueAtTime(0.55, t0);
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      src.connect(lp); lp.connect(ng); ng.connect(a.destination);
      src.start(t0); src.stop(t0 + 0.3);
    } catch (e) {}
  }

  // เสียงลมหวีด/ฟู่ ตอนลูกพลุไต่ขึ้น — ไล่ความถี่สูงขึ้นตามความเร็ว
  function hiss(duration) {
    const a = ctx(); if (!a) return { stop() {} };
    const t0 = a.currentTime, dur = duration || 2.6;
    try {
      const src = a.createBufferSource(); src.buffer = noiseBuffer(a, 1.5); src.loop = true;
      const bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 0.8;
      bp.frequency.setValueAtTime(1200, t0);
      bp.frequency.exponentialRampToValueAtTime(3800, t0 + dur);
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.14, t0 + 0.14);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(bp); bp.connect(g); g.connect(a.destination);
      src.start(t0); src.stop(t0 + dur + 0.15);
      return {
        stop() {
          try {
            const n = a.currentTime;
            g.gain.cancelScheduledValues(n);
            g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), n);
            g.gain.exponentialRampToValueAtTime(0.0001, n + 0.3);
            src.stop(n + 0.4);
          } catch (e) {}
        }
      };
    } catch (e) { return { stop() {} }; }
  }

  // เสียงระเบิดพลุ — หน่วงตามระยะกล้อง→จุดแตก (แสงมาก่อนเสียง)
  function boom(distance, opts) {
    const a = ctx(); if (!a) return 0;
    opts = opts || {};
    const size = opts.size || 1;
    const delay = sndDelay(distance);
    const t0 = a.currentTime + delay;
    try {
      // ตัวกระแทกความถี่ต่ำ
      const src = a.createBufferSource(); src.buffer = noiseBuffer(a, 1.5);
      const lp = a.createBiquadFilter(); lp.type = "lowpass";
      lp.frequency.setValueAtTime(Math.max(120, 460 / size), t0);
      lp.frequency.exponentialRampToValueAtTime(55, t0 + 0.5);
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.min(1.1, 0.85 * size), t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7 + size * 0.3);
      src.connect(lp); lp.connect(g); g.connect(a.destination);
      src.start(t0); src.stop(t0 + 1.5);

      // ซับเบสดิ่งลง
      const o = a.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(95, t0);
      o.frequency.exponentialRampToValueAtTime(26, t0 + 0.55);
      const og = a.createGain();
      og.gain.setValueAtTime(0.0001, t0);
      og.gain.exponentialRampToValueAtTime(0.5 * Math.min(1.2, size), t0 + 0.03);
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.85);
      o.connect(og); og.connect(a.destination);
      o.start(t0); o.stop(t0 + 1);

      // หางสะท้อน (echo กลับจากทิวเขา/อาคาร) เมื่อระเบิดไกล
      if (delay > 0.25) {
        const eb = a.createBufferSource(); eb.buffer = noiseBuffer(a, 0.8);
        const elp = a.createBiquadFilter(); elp.type = "lowpass"; elp.frequency.value = 320;
        const eg = a.createGain();
        const te = t0 + 0.28 + delay * 0.5;
        eg.gain.setValueAtTime(0.0001, te);
        eg.gain.exponentialRampToValueAtTime(0.14 * size, te + 0.05);
        eg.gain.exponentialRampToValueAtTime(0.0001, te + 0.6);
        eb.connect(elp); elp.connect(eg); eg.connect(a.destination);
        eb.start(te); eb.stop(te + 0.8);
      }
    } catch (e) {}
    return delay;
  }

  // ประกายกรอบแกรบ — ค้างฟ้าตลอด hang time ของเม็ดดาว แล้วจางหาย
  function crackle(duration, distance) {
    const a = ctx(); if (!a) return { stop() {} };
    const delay = sndDelay(distance);
    const t0 = a.currentTime + delay;
    const dur = Math.max(2, duration || 12);
    let iv = null, dead = false;
    try {
      const src = a.createBufferSource(); src.buffer = noiseBuffer(a, 2.2); src.loop = true;
      const hp = a.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 2400;
      const bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 5200; bp.Q.value = 0.7;
      const pop = a.createGain(); pop.gain.value = 0.4;   // มอดูเลตแบบสุ่มให้ "เปาะแปะ"
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.085, t0 + 0.3);
      g.gain.setValueAtTime(0.085, t0 + dur * 0.45);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(hp); hp.connect(bp); bp.connect(pop); pop.connect(g); g.connect(a.destination);
      src.start(t0); src.stop(t0 + dur + 0.3);

      iv = setInterval(() => {
        if (dead || !a) return;
        const now = a.currentTime;
        if (now > t0 + dur) { clearInterval(iv); iv = null; return; }
        try {
          pop.gain.cancelScheduledValues(now);
          pop.gain.setValueAtTime(0.15 + Math.random() * 0.9, now);
          pop.gain.exponentialRampToValueAtTime(0.12, now + 0.04 + Math.random() * 0.13);
        } catch (e) {}
      }, 65);

      return {
        stop() {
          if (dead) return; dead = true;
          if (iv) { clearInterval(iv); iv = null; }
          try {
            const n = a.currentTime;
            g.gain.cancelScheduledValues(n);
            g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), n);
            g.gain.exponentialRampToValueAtTime(0.0001, n + 0.5);
            src.stop(n + 0.6);
          } catch (e) {}
        }
      };
    } catch (e) { if (iv) clearInterval(iv); return { stop() {} }; }
  }

  // ---------------- Task 3 · ambient night bed ----------------
  function startNight(opts) {
    const a = ctx();
    opts = opts || {};
    if (!a) return NULL_HANDLE;

    const t0 = a.currentTime;
    const nodes = [];
    let dead = false, cricketIv = null, windGain = null, burnerGain = null;

    let master;
    try {
      master = a.createGain();
      master.gain.setValueAtTime(0.0001, t0);
      master.gain.setTargetAtTime(1, t0, 1.4);
      master.connect(a.destination);
    } catch (e) { return NULL_HANDLE; }

    // --- ลมพัดเบา ๆ : noise ผ่าน low-pass ที่ถูก LFO กวาดช้า ๆ ---
    if (opts.wind !== false) {
      try {
        const src = a.createBufferSource(); src.buffer = noiseBuffer(a, 3); src.loop = true;
        const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 460;
        const g = a.createGain(); g.gain.value = 0.045;
        const lfo = a.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.08;
        const lfoG = a.createGain(); lfoG.gain.value = 240;
        lfo.connect(lfoG); lfoG.connect(lp.frequency);
        src.connect(lp); lp.connect(g); g.connect(master);
        src.start(t0); lfo.start(t0);
        windGain = g; nodes.push(src, lfo);
      } catch (e) {}
    }

    // --- จิ้งหรีด : noise แบนด์แคบ ~4.5kHz + สั่นเร็ว (tremolo) + สเวลล์เป็นจังหวะ ---
    if (opts.crickets !== false) {
      try {
        const src = a.createBufferSource(); src.buffer = noiseBuffer(a, 2); src.loop = true;
        const bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 4500; bp.Q.value = 18;
        const amp = a.createGain(); amp.gain.value = 0.005;
        const lfo = a.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 46;
        const lfoG = a.createGain(); lfoG.gain.value = 0.004;
        lfo.connect(lfoG); lfoG.connect(amp.gain);
        src.connect(bp); bp.connect(amp); amp.connect(master);
        src.start(t0); lfo.start(t0);
        nodes.push(src, lfo);
        cricketIv = setInterval(() => {
          if (dead || !a) return;
          const n = a.currentTime;
          try {
            amp.gain.cancelScheduledValues(n);
            amp.gain.setValueAtTime(0.0009, n);
            amp.gain.linearRampToValueAtTime(0.008, n + 0.16);
            amp.gain.linearRampToValueAtTime(0.0016, n + 0.85);
          } catch (e) {}
        }, 1400 + Math.random() * 900);
      } catch (e) {}
    }

    // --- ไฟคบในโคม : เสียงหึ่งความถี่ต่ำ + ลมไฟฟู่ (ปรับระดับผ่าน setBurner) ---
    try {
      burnerGain = a.createGain(); burnerGain.gain.value = 0; burnerGain.connect(master);
      const roar = a.createBufferSource(); roar.buffer = noiseBuffer(a, 2.5); roar.loop = true;
      const roarLP = a.createBiquadFilter(); roarLP.type = "lowpass"; roarLP.frequency.value = 240;
      const roarG = a.createGain(); roarG.gain.value = 0.55;
      roar.connect(roarLP); roarLP.connect(roarG); roarG.connect(burnerGain);
      const flame = a.createOscillator(); flame.type = "triangle"; flame.frequency.value = 56;
      const flameG = a.createGain(); flameG.gain.value = 0.16;
      flame.connect(flameG); flameG.connect(burnerGain);
      const air = a.createBufferSource(); air.buffer = noiseBuffer(a, 2); air.loop = true;
      const airHP = a.createBiquadFilter(); airHP.type = "highpass"; airHP.frequency.value = 1700;
      const airG = a.createGain(); airG.gain.value = 0.1;
      air.connect(airHP); airHP.connect(airG); airG.connect(burnerGain);
      roar.start(t0); flame.start(t0); air.start(t0);
      nodes.push(roar, flame, air);
    } catch (e) { burnerGain = null; }

    return {
      setBurner(level) {
        if (dead || !a || !burnerGain) return;
        try { burnerGain.gain.setTargetAtTime(clamp01(level) * 0.5, a.currentTime, 0.25); } catch (e) {}
      },
      setWind(level) {
        if (dead || !a || !windGain) return;
        try { windGain.gain.setTargetAtTime(0.02 + clamp01(level) * 0.09, a.currentTime, 0.6); } catch (e) {}
      },
      stop() {
        if (dead) return; dead = true;
        if (cricketIv) { clearInterval(cricketIv); cricketIv = null; }
        try {
          const n = a.currentTime;
          master.gain.cancelScheduledValues(n);
          master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), n);
          master.gain.exponentialRampToValueAtTime(0.0001, n + 0.5);
          nodes.forEach(s => { try { s.stop(n + 1.6); } catch (e) {} });
          setTimeout(() => { try { master.disconnect(); } catch (e) {} }, 2200);
        } catch (e) {}
      }
    };
  }

  // ---------------- Phase 18.5 · NPC typing blip ----------------
  let _lastBlip = 0;
  function blip() {
    const a = ctx(); if (!a) return;
    const now = a.currentTime;
    if (now - _lastBlip < 0.028) return;          // throttle — text reveals fast
    _lastBlip = now;
    try {
      const o = a.createOscillator();
      o.type = "square";
      o.frequency.setValueAtTime(430 + Math.random() * 90, now);
      const g = a.createGain();
      g.gain.setValueAtTime(0.028, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.028);
      o.connect(g); g.connect(a.destination);
      o.start(now); o.stop(now + 0.05);
    } catch (e) {}
  }

  // ---------------- Phase 18.5 · RPG background music (synth chiptune loop) ----------------
  let _bgm = null;
  function noteInto(a, dest, freq, t, dur, type, vol) {
    try {
      const o = a.createOscillator();
      o.type = type || "square"; o.frequency.value = freq;
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.04, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest);
      o.start(t); o.stop(t + dur + 0.05);
    } catch (e) {}
  }
  function startBGM(opts) {
    opts = opts || {};
    if (_bgm) return _bgm;                          // singleton — safe to call every screen
    const a = ctx();
    if (!a) return { stop() {} };
    let dead = false, loopTimer = null, step = 0, bar = 0;
    let master, lp, pads = [];
    try {
      master = a.createGain();
      master.gain.setValueAtTime(0.0001, a.currentTime);
      master.gain.setTargetAtTime(opts.volume != null ? opts.volume : 0.14, a.currentTime, 1.6);
      master.connect(a.destination);
      lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2400; lp.connect(master);
      // warm sustained pad (Am9-ish)
      [110.00, 164.81, 220.00, 329.63].forEach(f => {
        const o = a.createOscillator(); o.type = "triangle"; o.frequency.value = f;
        const g = a.createGain(); g.gain.value = 0.045;
        const det = a.createOscillator(); det.type = "sine"; det.frequency.value = 0.07;
        const detG = a.createGain(); detG.gain.value = 1.6;
        det.connect(detG); detG.connect(o.detune);
        o.connect(g); g.connect(lp); o.start(); det.start();
        pads.push(o, det);
      });
    } catch (e) { return { stop() {} }; }

    // gentle A-minor pentatonic arpeggio + walking bass
    const arp = [220.00, 261.63, 329.63, 392.00, 440.00, 392.00, 329.63, 261.63];
    const bass = [55.00, 65.41, 43.65, 49.00];      // A1 C2 F1 G1, one per bar
    const beat = 0.36;
    function tick() {
      if (dead || !a) return;
      const t = a.currentTime + 0.06;
      const oct = bar % 4 === 3 ? 2 : 1;
      noteInto(a, lp, arp[step % arp.length] * oct, t, beat * 0.85, "square", 0.03);
      if (step % 2 === 0) noteInto(a, lp, bass[bar % bass.length], t, beat * 1.9, "triangle", 0.075);
      if (step % 8 === 4) noteInto(a, lp, arp[(step + 2) % arp.length] * 2, t, beat * 0.5, "sine", 0.022);
      step++;
      if (step % 8 === 0) bar++;
      loopTimer = setTimeout(tick, beat * 1000);
    }
    tick();

    _bgm = {
      stop() {
        if (dead) return; dead = true;
        if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }
        try {
          const n = a.currentTime;
          master.gain.cancelScheduledValues(n);
          master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), n);
          master.gain.exponentialRampToValueAtTime(0.0001, n + 0.6);
          pads.forEach(o => { try { o.stop(n + 1.6); } catch (e) {} });
          setTimeout(() => { try { master.disconnect(); } catch (e) {} }, 2400);
        } catch (e) {}
        _bgm = null;
      }
    };
    return _bgm;
  }
  function stopBGM() { if (_bgm) _bgm.stop(); }

  window.SoundStage = {
    ctx, thump, hiss, boom, crackle, startNight, blip, startBGM, stopBGM, SPEED_OF_SOUND
  };
})();
