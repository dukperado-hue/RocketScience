/* =============================================================================
 * FROM FIRE TO ORBIT — Unified Architecture
 * js/core/Diagnostics.js
 *
 * The "Physics Autopsy". After Physics.simulate() runs, this inspects the
 * vehicle model + the SimulationResult and answers plain-language questions:
 *   "Was there enough lift?"  "Was it stable?"  "Did MaxQ tear it apart?"
 *
 * Output: an ordered array of { id, status:'OK'|'WARN'|'FAIL', message, detail }.
 * This array is the backbone of the future "Why did this happen?" loop.
 *
 * PURE. No THREE, no DOM. Consumes data only.
 * ===========================================================================*/
(function (global) {
  'use strict';

  var OK = 'OK', WARN = 'WARN', FAIL = 'FAIL';

  /**
   * @param {Object} model  Vehicle.toPhysicsModel() output (carries .stats)
   * @param {Object} sim     { trajectory, events, summary }
   * @returns {{id:string,status:string,message:string,detail:string}[]}
   */
  function run(model, sim) {
    var out = [];
    var st = (model && model.stats) || {};
    var sum = (sim && sim.summary) || {};
    var events = (sim && sim.events) || [];
    var has = function (type) {
      return events.some(function (e) { return e.type === type; });
    };
    var add = function (id, status, message, detail) {
      out.push({ id: id, status: status, message: message, detail: detail || '' });
    };

    // --- 1 · connectivity --------------------------------------------------
    if (st.partCount === 0) {
      add('assembly', FAIL, 'ยังไม่ได้ประกอบยาน', 'วางชิ้นส่วนอย่างน้อย 1 ชิ้น');
    } else if (!st.connected) {
      add('assembly', FAIL, 'ชิ้นส่วนบางชิ้นไม่ได้เชื่อมกับยาน',
        'ทุกชิ้นต้องต่อถึงกันผ่าน attach-node');
    } else {
      add('assembly', OK, 'โครงสร้างต่อกันครบทุกชิ้น', st.partCount + ' ชิ้นส่วน');
    }

    // --- 2 · lift vs weight ----------------------------------------------
    var lift = Math.max(st.totalThrust || 0, st.totalBuoyancy || 0);
    var weight = st.weightN || 0;
    var twr = st.twr || 0;
    var liftDetail = 'แรงยก ' + lift.toFixed(1) + ' N · น้ำหนัก ' + weight.toFixed(1) +
      ' N · TWR ' + twr.toFixed(2);
    if (lift <= 0) {
      add('lift', FAIL, 'ไม่มีแรงขับหรือแรงพยุงเลย', liftDetail);
    } else if (twr < 1.0) {
      add('lift', FAIL, 'แรงยกน้อยกว่าน้ำหนัก — ยานไม่ลอยขึ้น', liftDetail);
    } else if (twr < 1.15) {
      add('lift', WARN, 'แรงยกเกินน้ำหนักแค่นิดเดียว — ไต่ช้ามาก', liftDetail);
    } else {
      add('lift', OK, 'แรงยกเพียงพอ', liftDetail);
    }

    // --- 3 · static stability ------------------------------------------
    //  Rocket (thrust-dominant): the Center of Pressure MUST sit aft of the
    //  Center of Mass, or the airstream flips the nose and it tumbles. Fins are
    //  how you get there. Lantern (buoyancy): it hangs like a pendulum instead.
    var margin = st.stabilityMarginM;
    var rocketMode = (st.totalThrust || 0) >= (st.totalBuoyancy || 0) && (st.totalThrust || 0) > 0;
    var mDetail = isFinite(margin)
      ? 'ระยะ CoM–CoP ' + margin.toFixed(2) + ' m (' + (rocketMode ? 'โหมดจรวด' : 'โหมดพยุง') + ')'
      : '—';
    if (st.partCount <= 1) {
      add('stability', OK, 'ชิ้นเดียว — ไม่มีปัญหาเสถียรภาพ', mDetail);
    } else if (!isFinite(margin)) {
      add('stability', WARN, 'ประเมินเสถียรภาพไม่ได้ (ไม่มีพื้นที่อ้างอิง)', mDetail);
    } else if (margin <= 0) {
      add('stability', FAIL,
        rocketMode ? 'ไม่เสถียร — CoP อยู่หน้า CoM จรวดจะตีลังกา ใส่ครีบหาง (fin) เพิ่ม'
                   : 'ไม่เสถียร — ยานจะส่ายหัว/พลิก',
        mDetail);
    } else if (margin < (rocketMode ? 0.08 : 0.05)) {
      add('stability', WARN,
        rocketMode ? 'เสถียรภาพเฉียดฉิว — ครีบเล็กไป เผื่อ CoM เลื่อนตอนเชื้อเพลิงหมด' : 'เสถียรภาพเฉียดฉิว',
        mDetail);
    } else {
      add('stability', OK, 'เสถียรตามแนวแกนบิน', mDetail);
    }

    // --- 4 · structural load (MaxQ) ----------------------------------
    var limit = st.structuralLimitPa;
    var maxQ = sum.maxQ || 0;
    if (!isFinite(limit)) {
      add('structure', OK, 'ไม่มีชิ้นส่วนที่จำกัดแรงดันอากาศ',
        'MaxQ ' + maxQ.toFixed(0) + ' Pa');
    } else {
      var ratio = maxQ / limit;
      var sDetail = 'MaxQ ' + maxQ.toFixed(0) + ' Pa · ขีดจำกัด ' + limit.toFixed(0) +
        ' Pa (' + Math.round(ratio * 100) + '%)';
      if (ratio >= 1) {
        add('structure', FAIL, 'แรงดันอากาศเกินขีดจำกัดโครงสร้าง — ยานฉีก/ยุบ', sDetail);
      } else if (ratio >= 0.7) {
        add('structure', WARN, 'แรงดันอากาศเข้าใกล้ขีดจำกัดโครงสร้าง', sDetail);
      } else {
        add('structure', OK, 'โครงสร้างรับแรงดันอากาศได้สบาย', sDetail);
      }
    }

    // --- 4b · departed controlled flight (the dynamic tumble) -------
    var loc = events.filter(function (e) { return e.type === 'LOSS_OF_CONTROL'; })[0];
    if (loc) {
      add('control', FAIL, 'เสียการควบคุมกลางอากาศ — จรวดตีลังกา',
        'ที่ ' + fmtAlt(loc.altitude) + ' · ' + Math.abs(loc.velocity).toFixed(0) +
        ' m/s — CoM เลื่อนไปหน้า CoP ตอนเชื้อเพลิงเผาไหม้');
    }

    // --- 4b″ · traditional Bang Fai broke up at apogee (expected!) --
    var brk = events.filter(function (e) { return e.type === 'APOGEE_BREAKUP'; })[0];
    if (brk) {
      add('breakup', OK, 'บั้งไฟหางแบบดั้งเดิมแตกที่จุดสูงสุดแล้วตีลังกาลง — เป็นเรื่องปกติ',
        'ที่ ' + fmtAlt(brk.altitude) + ' หัวโหวดไหม้ทะลุ + โครงหัก · ' +
        'เปลี่ยนไปใช้ "หัวจรวดเพรียวลม" + "ครีบ" แทน "หาง" แล้วมันจะร่อนลงนิ่ง ๆ ไม่แตก ' +
        'และขึ้นได้สูงกว่าเดิมมาก');
    }

    // --- 4b′ · lantern caught fire mid-air (blown over) -------------
    var mab = events.filter(function (e) { return e.type === 'MIDAIR_BURN'; })[0];
    if (mab) {
      add('control', FAIL, 'โคมไฟไหม้กลางอากาศ',
        'ที่ ' + fmtAlt(mab.altitude) + ' — ลมพัดจนโคมเอียง เปลวไฟเลียกระดาษสา ' +
        'ติดไฟทั้งลูก (ลดลม / เพิ่มป้ายถ่วง / โครงหนักขึ้น)');
    }

    // --- 4c · gravity turn + orbit (guided vehicles) --------------
    if (model && model.gravityTurn && sum.targeting) {
      // --- V-2 ballistic gyro-guidance : how close to the sea target? ---
      var meco = events.filter(function (e) { return e.type === 'MECO'; })[0];
      var miss = Math.abs(sum.missDistance || 0);
      var dmg = sum.damageRadius || 0;
      var st = miss <= Math.max(120, dmg * 0.6) ? OK : (miss <= 400 ? WARN : FAIL);
      add('guidance', st,
        meco ? ('ยิงเข้าเป้า — พลาดระยะ ' + fmtAlt(miss))
             : 'เชื้อเพลิงหมดก่อนถึงระยะยิง — ตกสั้นกว่าเป้า',
        'ระยะยิงเป้า ' + fmtAlt(sum.targetRange || 0) +
        ' · ตกจริง ' + fmtAlt(Math.abs(sum.downrange || sum.impactX || 0)) +
        (meco ? ' · MECO ที่ ' + (meco.time || 0).toFixed(1) + ' วิ / ' + fmtAlt(meco.altitude || 0) : '') +
        ' · รัศมีความเสียหาย ' + fmtAlt(dmg));
    } else if (model && model.gravityTurn) {
      var pv = events.filter(function (e) { return e.type === 'PITCH_OVER'; })[0];
      var orb = sum.orbit || {};
      var staged = (sum.stagesFlown || 1) > 1;
      if (orb.achieved) {
        add('orbit', OK, 'เข้าสู่วงโคจรสำเร็จ! 🛰️',
          'วงโคจร ' + fmtAlt(orb.periapsis) + ' × ' + fmtAlt(orb.apoapsis) +
          ' · ความเยื้อง e=' + (orb.eccentricity || 0).toFixed(3) +
          ' · คาบ ' + Math.round(orb.period) + ' วิ' +
          (staged ? ' · สลัด ' + (sum.stagesFlown - 1) + ' ท่อน' : ''));
      } else if (pv) {
        var dr = Math.abs(sum.downrange || sum.impactX || 0);
        add('guidance', model && model.staged ? WARN : OK,
          'เลี้ยวโค้งแล้ว แต่ยังไม่ถึงวงโคจร',
          'ตกไกลจากฐาน ' + fmtAlt(dr) + ' · ความเร็วสูงสุด ' +
          Math.round(sum.maxVelocity || 0) + ' m/s' +
          (model && model.staged ? ' — Δv ไม่พอ เพิ่มถังหรือท่อน' : ''));
      } else {
        add('guidance', WARN, 'ยังไม่เข้าโปรแกรมเลี้ยวโค้ง',
          'ต้องพ้น 500 ม. และเร็วเกิน 50 m/s ก่อนไจโรจะเริ่มเอียงหัว');
      }
    }

    // --- 4d · FIREWORK BURST — did the shell burst in the target box? -----
    var br = sum.burst;
    if (br && (br.occurred || br.dud || (br.box && br.box.length === 2))) {
      var bx = br.box;
      var apo = sum.apogee || 0, apoT = sum.apogeeTime || 0, bT = br.time || 0;
      var timingDetail = 'ชนวน ' + bT.toFixed(1) + ' วิ · จุดสูงสุด ' + fmtAlt(apo) +
        ' ที่ ' + apoT.toFixed(1) + ' วิ' + (bx ? ' · กรอบ ' + bx[0] + '–' + bx[1] + ' ม.' : '');
      if (br.dud) {
        add('burst', FAIL, 'ลูกพลุด้าน — แตกกลางพื้น',
          'ชนวนยาวเกินแรงส่ง: ลูกพลุตกถึงพื้นก่อนชนวนจะไหม้ถึง (' + timingDetail + ')');
      } else if (!br.occurred) {
        add('burst', WARN, 'ยังไม่ทันแตก', timingDetail);
      } else if (bx && br.altitude >= bx[0] && br.altitude <= bx[1]) {
        add('burst', OK, 'ดอกพลุบานในกรอบเป้าหมาย 🎯',
          'แตกที่ ' + fmtAlt(br.altitude) + ' — ' + timingDetail);
      } else if (bx && br.altitude < bx[0]) {
        add('burst', FAIL, 'ดอกพลุบานต่ำเกินไป',
          'แตกที่ ' + fmtAlt(br.altitude) + ' (ต้องถึง ' + bx[0] + ' ม.) — ' +
          (bT > apoT + 0.2 ? 'ชนวนยาวไป ลูกร่วงลงก่อนแตก' : 'แรงส่งน้อยไป หรือชนวนสั้นไป') +
          ' · ' + timingDetail);
      } else if (bx) {
        add('burst', FAIL, 'ดอกพลุบานสูงเกินกรอบ',
          'แตกที่ ' + fmtAlt(br.altitude) + ' (เกิน ' + bx[1] + ' ม.) — แรงส่งมากไป · ' + timingDetail);
      } else {
        add('burst', OK, 'ลูกพลุแตกกลางฟ้า', 'แตกที่ ' + fmtAlt(br.altitude) + ' — ' + timingDetail);
      }
    }

    // --- 4e · OBSTACLE COLLISION (M02 · khom loy stream) -----------------
    var col = sum.collision;
    if (col && col.occurred) {
      add('safety', FAIL,
        col.byBurst ? 'ดอกพลุระเบิดโดนโคมลอย — ผิดกฎระยะปลอดภัย'
                    : 'ลูกพลุพุ่งชนโคมลอยกลางอากาศ',
        'ชนที่ ' + fmtAlt(col.altitude) + ' (แนว X ' + Math.round(col.x || 0) + ' ม.) ที่ ' +
        (col.time || 0).toFixed(1) + ' วิ — วิถีโค้งของลูกพลุต้องมี "อากาศว่าง" ตลอดเส้นทาง ' +
        '(ปรับมุมเอียง / แรงส่ง / ชนวน ให้ส่วนโค้งอ้อมพ้นสายโคม)');
    }

    // --- 5 · flight outcome ------------------------------------------
    if (!sim || !sim.ok) {
      add('outcome', FAIL, 'การจำลองไม่สำเร็จ', (sim && sim.reason) || '');
    } else if (!has('LIFTOFF')) {
      add('outcome', FAIL, 'ยานไม่เคยพ้นพื้น', 'ตรวจแรงยก/มวล');
    } else if (sum.orbit && sum.orbit.achieved) {
      add('outcome', OK, 'บรรลุวงโคจร — ยานไม่ตกกลับพื้นอีกแล้ว',
        'วงโคจร ' + fmtAlt(sum.orbit.periapsis) + ' × ' + fmtAlt(sum.orbit.apoapsis) +
        ' · คาบ ' + Math.round(sum.orbit.period) + ' วิ');
    } else if (!has('IMPACT')) {
      add('outcome', WARN, 'การจำลองจบขณะยานยังลอยอยู่',
        'apogee ' + fmtAlt(sum.apogee) + ' · เพิ่มเวลาจำลองเพื่อดูการร่อนลง');
    } else {
      add('outcome', OK, 'บินครบรอบ — ขึ้นถึงยอดแล้วร่อนลงแตะพื้น',
        'apogee ' + fmtAlt(sum.apogee) + ' · บินรวม ' + (sum.flightTime || 0).toFixed(0) + ' s');
    }

    // --- 6 · landing energy (only if it came down) -------------------
    var impact = events.filter(function (e) { return e.type === 'IMPACT'; })[0];
    if (impact) {
      var vImp = Math.abs(impact.velocity);
      var iDetail = 'ความเร็วแตะพื้น ' + vImp.toFixed(1) + ' m/s';
      if (loc) add('landing', WARN, 'ร่วงลงหลังเสียการควบคุม', iDetail);
      else if (brk) add('landing', OK, 'ตีลังกาลงหลังแตกที่ยอด — ไม่พุ่งปักหัวเหมือนหอกทิ้ง', iDetail);
      else if (vImp <= 6) add('landing', OK, 'ลงแตะพื้นนุ่มนวล', iDetail);
      else if (vImp <= 15) add('landing', WARN, 'ลงแรง — โครงสร้างอาจเสียหาย', iDetail);
      else add('landing', FAIL, 'ตกกระแทก', iDetail);
    }

    // --- 7 · NOTAM / restricted airspace (the law) -------------------
    //  A drifting Khom Loy that leaves the cleared radius is not a "whoops",
    //  it is an aviation-safety violation and the mission is void.
    var szr = sim && sim.meta && sim.meta.safeZoneRadius;
    if (szr != null && isFinite(szr)) {
      var far = (sum.maxDrift != null) ? sum.maxDrift : Math.abs(sum.impactX || 0);
      var nDetail = 'ลอยไปไกลสุด ' + Math.round(far) + ' ม. · ลงที่ ' +
        Math.round(Math.abs(sum.impactX || 0)) + ' ม. · เขต ' + szr + ' ม.';
      if (far > szr) {
        add('notam', FAIL, 'LEGAL VIOLATION: ละเมิดเขตห้ามบิน (NOTAM Breach)', nDetail);
      } else {
        add('notam', OK, 'อยู่ในเขตปลอดภัย (NOTAM)', nDetail);
      }
    }

    return out;
  }

  /** Roll the array up to one verdict for headline UI. */
  function verdict(results) {
    if (!results || !results.length) return OK;
    if (results.some(function (r) { return r.status === FAIL; })) return FAIL;
    if (results.some(function (r) { return r.status === WARN; })) return WARN;
    return OK;
  }

  function fmtAlt(m) {
    m = m || 0;
    return m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';
  }

  /**
   * The "WHY?" Science Card — a short teaching card shown when a mission fails.
   * Content comes from the mission's `atlas.science` block (falls back to a
   * generic projectile-motion card); a one-line CONTEXT sentence derived from
   * this specific flight is prepended so the lesson lands on what just happened.
   * @returns {{tag:string, context:string, body:string}}
   */
  function scienceCard(mission, sim, ctx) {
    var atl = (mission && mission.atlas) || {};
    var sum = (sim && sim.summary) || {};
    var br = sum.burst || {};
    var col = sum.collision || {};
    ctx = ctx || {};

    // ---- SKY ATLAS SEQUENCER cards — M03 chemistry order / M04 rhythm ----
    if (atl.sequence) {
      var sci0 = atl.science || {};
      var NM = { red: 'แดง', white: 'ขาว', blue: 'น้ำเงิน', green: 'เขียว', gold: 'ทอง' };
      var nice0 = function (a) { return (a || []).map(function (c) { return NM[c] || c; }).join(' → '); };
      var mo = mission.objectives || {};

      // M04 · Carnival — the composition / staggering card
      if (mo.carnivalRhythm) {
        var cr0 = mo.carnivalRhythm;
        var gc = ctx.gotColors || [], gf = ctx.gotFuses || [];
        var uniq = function (a) { var s = {}; a.forEach(function (x) { s[String(x)] = 1; }); return Object.keys(s).length; };
        var dc = uniq(gc), df = uniq(gf);
        var ctxR = gc.length
          ? ('รอบนี้: ใช้ ' + dc + ' สี · ชนวน ' + df + ' แบบ — ต้องการ ≥ ' + (cr0.minColors || 3) +
             ' สี และ ≥ ' + (cr0.minFuses || 2) + ' ชนวน. ' +
             (df < (cr0.minFuses || 2) ? 'ชนวนเท่ากันหมด = พลุบานพร้อมกันทีเดียวจบ ไม่มีจังหวะ. ' : '') +
             (dc < (cr0.minColors || 3) ? 'สีโทนเดียว = ท้องฟ้าจืด. ' : ''))
          : '';
        return { tag: sci0.tag, context: ctxR, body: sci0.body };
      }

      // M03 · a wrong Red/White/Blue firing order gets the chemistry card
      var want0 = mo.burstSequence || [];
      var got0 = ctx.gotSeq || [];
      var ctx0 = got0.length
        ? ('รอบนี้: คุณยิงเป็นลำดับ ' + nice0(got0) + ' — ต้องเป็น ' + nice0(want0) + '. ' +
           'สีมาจากธาตุโลหะ: สตรอนเทียม→แดง · แมกนีเซียม→ขาว · ทองแดง→น้ำเงิน.')
        : '';
      return { tag: sci0.tag, context: ctx0, body: sci0.body };
    }
    // a collision fail gets the dedicated safety card
    var sci = (col.occurred && atl.scienceCollision) ? atl.scienceCollision
      : atl.science || {
        tag: 'Physics Insight · Projectile Motion',
        body: 'จังหวะแตกต้องตรงกับจุดสูงสุด (apogee) ของแรงส่ง — ' +
          'ถ้าชนวนยาวเกินไป แรงโน้มถ่วงจะดึงลูกพลุตกลงมาก่อนแตก!'
      };
    var bx = br.box, ctx = '';
    if (col.occurred) {
      ctx = 'รอบนี้: ' + (col.byBurst ? 'ดอกพลุระเบิด' : 'ลูกพลุพุ่ง') + 'ชนโคมลอยที่ ' +
        fmtAlt(col.altitude) + ' (แนว X ' + Math.round(col.x || 0) + ' ม.) — ' +
        'มุมยิง ' + Math.round(sum.launchPitchDeg || 90) + '° พาส่วนโค้งไปทับสายโคมพอดี. ' +
        'ลองเปลี่ยนมุม/แรงส่ง/ชนวน ให้วิถีโค้งอ้อมพ้น.';
      return { tag: sci.tag, context: ctx, body: sci.body };
    }
    if (br.dud) {
      ctx = 'รอบนี้: ชนวนไหม้ไม่ทัน ลูกพลุตกถึงพื้นก่อนแตก — แรงส่งพาลูกขึ้นได้แค่ ' +
        fmtAlt(sum.apogee || 0) + ' แล้วร่วงลงภายใน ' + (br.time || 0).toFixed(1) + ' วิ.';
    } else if (br.occurred && bx && (br.altitude < bx[0] || br.altitude > bx[1])) {
      var apoT = sum.apogeeTime || 0;
      if (br.altitude < bx[0] && (br.time || 0) > apoT + 0.2) {
        ctx = 'รอบนี้: ลูกพลุถึงจุดสูงสุด (' + fmtAlt(sum.apogee || 0) + ') ที่ ' + apoT.toFixed(1) +
          ' วิ แต่ชนวนตั้งไว้ ' + (br.time || 0).toFixed(1) + ' วิ — แรงโน้มถ่วงดึงมันร่วงลงมาแตกที่ ' +
          fmtAlt(br.altitude) + '.';
      } else if (br.altitude < bx[0]) {
        ctx = 'รอบนี้: แรงส่งพาลูกขึ้นได้แค่ ' + fmtAlt(sum.apogee || 0) +
          ' ยังไม่ถึงกรอบ — ลูกแตกที่ ' + fmtAlt(br.altitude) + '.';
      } else {
        ctx = 'รอบนี้: แรงส่งแรงเกินไป ลูกพลุพุ่งถึง ' + fmtAlt(sum.apogee || 0) +
          ' แตกที่ ' + fmtAlt(br.altitude) + ' เลยกรอบไป.';
      }
    }
    return { tag: sci.tag, context: ctx, body: sci.body };
  }

  global.RS = global.RS || {};
  global.RS.Diagnostics = {
    STATUS: { OK: OK, WARN: WARN, FAIL: FAIL },
    run: run,
    verdict: verdict,
    scienceCard: scienceCard
  };

})(typeof window !== 'undefined' ? window : this);
