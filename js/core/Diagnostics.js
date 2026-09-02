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
    var margin = st.stabilityMarginM;
    var mDetail = isFinite(margin)
      ? 'ระยะ CoM–CoP ' + margin.toFixed(2) + ' m (' +
        (st.totalBuoyancy > st.totalThrust ? 'โหมดพยุง' : 'โหมดจรวด') + ')'
      : '—';
    if (st.partCount <= 1) {
      add('stability', OK, 'ชิ้นเดียว — ไม่มีปัญหาเสถียรภาพ', mDetail);
    } else if (!isFinite(margin)) {
      add('stability', WARN, 'ประเมินเสถียรภาพไม่ได้ (ไม่มีพื้นที่อ้างอิง)', mDetail);
    } else if (margin <= 0) {
      add('stability', FAIL, 'ไม่เสถียร — ยานจะส่ายหัว/พลิก', mDetail);
    } else if (margin < 0.05) {
      add('stability', WARN, 'เสถียรภาพเฉียดฉิว', mDetail);
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

    // --- 5 · flight outcome ------------------------------------------
    if (!sim || !sim.ok) {
      add('outcome', FAIL, 'การจำลองไม่สำเร็จ', (sim && sim.reason) || '');
    } else if (!has('LIFTOFF')) {
      add('outcome', FAIL, 'ยานไม่เคยพ้นพื้น', 'ตรวจแรงยก/มวล');
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
      if (vImp <= 6) add('landing', OK, 'ลงแตะพื้นนุ่มนวล', iDetail);
      else if (vImp <= 15) add('landing', WARN, 'ลงแรง — โครงสร้างอาจเสียหาย', iDetail);
      else add('landing', FAIL, 'ตกกระแทก', iDetail);
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

  global.RS = global.RS || {};
  global.RS.Diagnostics = {
    STATUS: { OK: OK, WARN: WARN, FAIL: FAIL },
    run: run,
    verdict: verdict
  };

})(typeof window !== 'undefined' ? window : this);
