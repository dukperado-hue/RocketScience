/* =============================================================================
 * FROM FIRE TO ORBIT — Render layer
 * js/render/UI.js  ·  THE SKY ATLAS (แผนที่นภากาศ)  ·  Phase 16
 *
 * The mission-select + firework "Design Desk" front-end for the Fireworks era.
 * Replaces the plain era→briefing flow with a story campaign:
 *
 *   openSkyAtlas()  → a constellation of mission stamps (M01 unlocked, rest 🔒)
 *   → click a stamp → openCulturalBrief(mission)  (the cultural hook + NPC)
 *   → "เริ่มออกแบบพลุ" → openDesignDesk(mission)   (choose lift / colour / fuse)
 *   → "จุดพลุ!" → opts.onLaunchFirework(mission, design)  (app.js runs the sim)
 *   ── on failure ──
 *   → openScienceCard(card, onRetry)   ("WHY?" — a physics teaching card)
 *   → "ลองอีกครั้ง" → back to openDesignDesk (choices remembered)
 *
 * Pure DOM. No Three.js. Consumes RS.data.missions + RS.MissionEngine only.
 * ===========================================================================*/
(function (global) {
  'use strict';

  var RS = global.RS = global.RS || {};
  RS.render = RS.render || {};

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ---- the design-desk menus -------------------------------------------------
  var LIFT_OPTS = [
    { id: 'fw_lift_s', label: 'เล็ก', sub: 'Small', hint: 'ขึ้นเตี้ย · ถึงยอดเร็ว', dots: '•' },
    { id: 'fw_lift_m', label: 'กลาง', sub: 'Medium', hint: 'ยอด ~90 ม. · ถึงยอด ~3 วิ', dots: '••' },
    { id: 'fw_lift_l', label: 'ใหญ่', sub: 'Large', hint: 'ขึ้นสูง · เสี่ยงเลยกรอบ', dots: '•••' }
  ];
  // the Effect-Colour menu is data-driven (js/data/parts.js · RS.data.fireworkColors)
  // so chemistry lives in one place; this is the fallback if that file is absent
  var COLOR_FALLBACK = [
    { id: 'red',   label: 'แดง',     sub: 'Strontium (Sr)',        hex: '#ff4d5a', chem: 'สตรอนเชียม' },
    { id: 'white', label: 'ขาว',     sub: 'Magnesium / Aluminium', hex: '#eaf1ff', chem: 'แมกนีเซียม / อะลูมิเนียม' },
    { id: 'blue',  label: 'น้ำเงิน', sub: 'Copper (Cu)',           hex: '#4d9bff', chem: 'ทองแดง' },
    { id: 'green', label: 'เขียว',   sub: 'Barium (Ba)',           hex: '#54e08a', chem: 'แบเรียม' },
    { id: 'gold',  label: 'ทอง',     sub: 'Carbon / Iron',         hex: '#ffc247', chem: 'คาร์บอน + เหล็ก' }
  ];
  function COLOR_OPTS() {
    var d = RS.data && RS.data.fireworkColors;
    return (d && d.length) ? d : COLOR_FALLBACK;
  }
  var FUSE_OPTS = [
    { id: 1.5, label: '1.5 วิ', sub: 'สั้น',  hint: 'แตกตอนยังพุ่งขึ้น' },
    { id: 3.0, label: '3.0 วิ', sub: 'กลาง',  hint: 'แตกใกล้จุดสูงสุด' },
    { id: 4.5, label: '4.5 วิ', sub: 'ยาว',   hint: 'แตกที่ยอด/ตอนร่วงลง' }
  ];
  // ---- HANABI (M05) · burst shape + decay menus (data-driven, parts.js) ----
  var SHAPE_FALLBACK = [
    { id: 'peony',         label: 'พีโอนี',  sub: 'Peony',         glyph: '🌐', hint: 'ทรงกลมมาตรฐาน' },
    { id: 'chrysanthemum', label: 'เบญจมาศ', sub: 'Chrysanthemum', glyph: '❋',  hint: 'ดาวไฟหนาแน่น + หางยาว' },
    { id: 'ring',          label: 'วงแหวน',  sub: 'Ring',          glyph: '◯',  hint: 'วงแหวน 2 มิติ' }
  ];
  var DECAY_FALLBACK = [
    { id: 'none',    label: 'ไม่มี',     sub: 'None',        glyph: '·',  hint: 'ดับทันที' },
    { id: 'sparkle', label: 'แตกประกาย', sub: 'Sparkle',     glyph: '✦',  hint: 'กะพริบก่อนดับ' },
    { id: 'sakura',  label: 'ฝนซากุระ',  sub: 'Sakura Rain', glyph: '🌸', hint: 'แรงต้านสูง ร่วงช้า' }
  ];
  function SHAPE_OPTS() {
    var d = RS.data && RS.data.fireworkShapes;
    return (d && d.length) ? d : SHAPE_FALLBACK;
  }
  function DECAY_OPTS() {
    var d = RS.data && RS.data.fireworkDecays;
    return (d && d.length) ? d : DECAY_FALLBACK;
  }
  // launch angle (M02+): pitch in the 2-D sim. 90 = straight up, <90 arcs
  // right (+x), >90 arcs left (−x)
  var ANGLE_OPTS = [
    { id: 105, label: 'ซ้าย 75°', sub: 'Left',     hint: 'โค้งไปทางซ้าย', glyph: '↖' },
    { id: 90,  label: 'ตรง 90°',  sub: 'Straight', hint: 'พุ่งขึ้นตรง',    glyph: '↑' },
    { id: 75,  label: 'ขวา 75°',  sub: 'Right',    hint: 'โค้งไปทางขวา',   glyph: '↗' }
  ];

  function UI() {
    this._opts = null;
    this._mission = null;
    // last design the player chose — remembered across a fail→retry loop
    // `seq` = per-tube picks for a SEQUENCER mission (M03/M04);
    // `shape`/`decay` = the HANABI burst-desk picks (M05)
    this._design = { lift: 'fw_lift_m', color: 'gold', fuse: 3.0, angle: 90,
      seq: ['gold', 'gold', 'gold'], shape: 'peony', decay: 'none' };
    this._built = false;
  }

  UI.prototype.init = function (opts) {
    this._opts = opts || {};
    this._ensureDom();
    return this;
  };

  UI.prototype.colorHex = function (id) {
    var c = COLOR_OPTS().filter(function (o) { return o.id === id; })[0];
    return c ? c.hex : '#ffc247';
  };
  UI.prototype.colorLabel = function (id) {
    var c = COLOR_OPTS().filter(function (o) { return o.id === id; })[0];
    return c ? c.label : id;
  };

  // ---- lazy DOM build (all overlays live under one #sky-atlas-root) --------
  UI.prototype._ensureDom = function () {
    if (this._built) return;
    if (!$('sky-atlas-root')) return;              // markup missing — no-op
    this._root = $('sky-atlas-root');
    this._elAtlas = $('sky-atlas');
    this._elGrid = $('sky-atlas-grid');
    this._elBrief = $('fw-cultural');
    this._elDesk = $('fw-desk');
    this._elSci = $('fw-science');

    var self = this;
    var wire = function (id, fn) { var el = $(id); if (el) el.addEventListener('click', fn); };
    wire('sky-atlas-close', function () { self.close(); });
    wire('fw-cultural-back', function () { self.openSkyAtlas(); });
    wire('fw-cultural-go', function () { self.openDesignDesk(self._mission); });
    wire('fw-desk-back', function () { self.openCulturalBrief(self._mission); });
    wire('fw-desk-launch', function () { self._launch(); });
    wire('fw-science-retry', function () { self._sciRetry && self._sciRetry(); });
    wire('fw-science-close', function () { if (self._elSci) self._elSci.hidden = true; });

    global.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && self._root && !self._root.hidden) {
        if (self._elSci && !self._elSci.hidden) self._elSci.hidden = true;
        else self.close();
      }
    });
    this._built = true;
  };

  UI.prototype._show = function (which) {
    if (!this._root) return;
    // a different flow is taking over — dismiss the plain engineering briefing
    if (RS.MissionBriefing && RS.MissionBriefing.hide) RS.MissionBriefing.hide();
    this._root.hidden = false;
    [['atlas', this._elAtlas], ['brief', this._elBrief], ['desk', this._elDesk]]
      .forEach(function (p) { if (p[1]) p[1].hidden = (p[0] !== which); });
  };

  UI.prototype.close = function () {
    if (this._elSci) this._elSci.hidden = true;
    if (this._root) this._root.hidden = true;
  };

  // ---- 1 · THE SKY ATLAS — the mission constellation ---------------------
  UI.prototype.openSkyAtlas = function () {
    this._ensureDom();
    if (!this._root) { this._fallbackBrief(); return; }
    var ME = this._opts.missionEngine || (RS.MissionEngine);
    var atlasMissions = this._atlasMissions();
    var firstOpen = null;
    var self = this;

    this._elGrid.innerHTML = atlasMissions.map(function (m, i) {
      var done = ME && ME.isDone && ME.isDone(m.id);
      var a = m.atlas || {};
      // M01 is always available; later stamps unlock when the previous is done
      var unlocked = i === 0 || (ME && ME.isDone && ME.isDone(atlasMissions[i - 1].id));
      if (unlocked && !done && !firstOpen) firstOpen = m;
      var cls = 'sa-stamp' + (done ? ' done' : unlocked ? ' open' : ' locked');
      return '<button type="button" class="' + cls + '" data-mid="' + esc(m.id) + '"' +
        (unlocked ? '' : ' disabled') +
        ' style="--sa-accent:' + esc(a.accent || '#8fd0ff') + '">' +
        '<span class="sa-stamp-ic">' + esc(done ? '✓' : unlocked ? (a.stamp || '🎆') : '🔒') + '</span>' +
        '<span class="sa-stamp-code">' + esc(a.code || ('M' + (i + 1))) + '</span>' +
        '<span class="sa-stamp-name">' + esc(a.name || m.title) + '</span>' +
        '</button>';
    }).join('') + this._lockedPlaceholders(atlasMissions.length);

    Array.prototype.forEach.call(this._elGrid.querySelectorAll('.sa-stamp:not(.locked)'), function (b) {
      b.addEventListener('click', function () {
        var m = atlasMissions.filter(function (x) { return x.id === b.dataset.mid; })[0];
        if (m) self.openCulturalBrief(m);
      });
    });

    this._show('atlas');
  };

  // future missions the campaign will add — shown greyed so the player sees the map
  UI.prototype._lockedPlaceholders = function (haveN) {
    var soon = [
      { code: 'M03', name: 'ลอยกระทง', ic: '🪷' },
      { code: 'M04', name: 'ตรุษจีน', ic: '🐉' },
      { code: 'M05', name: 'ปีใหม่', ic: '🎉' }
    ].slice(Math.max(0, haveN - 2));
    return soon.map(function (s) {
      return '<button type="button" class="sa-stamp locked" disabled>' +
        '<span class="sa-stamp-ic">🔒</span>' +
        '<span class="sa-stamp-code">' + s.code + '</span>' +
        '<span class="sa-stamp-name">' + s.name + '</span></button>';
    }).join('');
  };

  UI.prototype._atlasMissions = function () {
    var src = this._opts.missions || (RS.data && RS.data.missions);
    var list = (src && src.forEra) ? src.forEra('1p5-fireworks') : [];
    return list.filter(function (m) { return m.atlas; });
  };

  // ---- 2 · THE CULTURAL BRIEF -----------------------------------------
  UI.prototype.openCulturalBrief = function (mission) {
    this._ensureDom();
    this._mission = mission;
    if (!this._root) { this._fallbackBrief(); return; }
    var self = this;
    var a = mission.atlas || {};
    var ME = this._opts.missionEngine || RS.MissionEngine;
    var npc = (ME && ME.npc) ? ME.npc(mission.npc) : { name: '', glyph: '🎆', role: '' };

    $('fw-cultural-code').textContent = a.code || 'M01';
    $('fw-cultural-name').textContent = a.name || mission.title;
    $('fw-cultural-sub').textContent = a.subtitle || '';
    $('fw-cultural-stamp').textContent = a.stamp || '🎆';
    var card = $('fw-cultural-card');
    if (card) card.style.setProperty('--sa-accent', a.accent || '#8fd0ff');
    $('fw-cultural-npc').textContent = npc.glyph + ' ' + npc.name +
      (npc.role ? ' · ' + npc.role : '');
    $('fw-cultural-brief').textContent = a.culturalBrief || mission.description || '';
    var box = (mission.objectives && mission.objectives.burstAltitudeBox) || null;
    var seq = (mission.objectives && mission.objectives.burstSequence) || null;
    $('fw-cultural-goal').textContent = seq
      ? ('🎯 เป้าหมาย: ยิงพลุ 3 หลอด ให้แตกตามลำดับ ' +
         seq.map(function (c) { return self.colorLabel(c); }).join(' → '))
      : box
        ? ('🎯 เป้าหมาย: ดอกพลุต้องบานในกรอบ ' + box[0] + '–' + box[1] + ' เมตร')
        : (mission.description || '');

    this._show('brief');
  };

  // ---- 3 · THE FIREWORK DESIGN DESK ----------------------------------
  UI.prototype.openDesignDesk = function (mission) {
    this._ensureDom();
    this._mission = mission || this._mission;
    if (!this._root) { this._fallbackBrief(); return; }
    if (this._elSci) this._elSci.hidden = true;
    var self = this;
    var atl = this._mission.atlas || {};
    var obj = this._mission.objectives || {};
    var box = obj.burstAltitudeBox || null;
    var goal = $('fw-desk-goal');

    // ---- THE SEQUENCER DESK — M03 (3 tubes, colour, staggered) /
    //  M04 CARNIVAL (5 tubes, colour + fuse, all fire at t0=0).
    if (atl.sequence) {
      this._renderSequencerDesk();
      return;
    }
    // ---- THE HANABI BURST DESK — M05 (1 massive shell, shape + decay) ----
    if (atl.burstDesk) {
      this._renderBurstDesk();
      return;
    }
    if (goal) goal.textContent = box ? ('🎯 กรอบเป้าหมาย ' + box[0] + '–' + box[1] + ' ม.') : '';

    var mkRow = function (rowId, title, thai, opts, cur, key, render) {
      var wrap = $(rowId);
      wrap.innerHTML = '<div class="fwd-row-h"><b>' + esc(title) + '</b><span>' + esc(thai) + '</span></div>' +
        '<div class="fwd-opts">' + opts.map(function (o) {
          return render(o, o.id === cur);
        }).join('') + '</div>';
      wrap.hidden = false;
      Array.prototype.forEach.call(wrap.querySelectorAll('.fwd-opt'), function (b) {
        b.addEventListener('click', function () {
          self._design[key] = (key === 'fuse' || key === 'angle')
            ? parseFloat(b.dataset.val) : b.dataset.val;
          self.openDesignDesk(self._mission);   // re-render to reflect selection
        });
      });
    };

    mkRow('fwd-row-lift', '1 · แรงขับ', 'Lift Charge', LIFT_OPTS, this._design.lift, 'lift',
      function (o, on) {
        return '<button type="button" class="fwd-opt' + (on ? ' on' : '') + '" data-val="' + o.id + '">' +
          '<span class="fwd-opt-big">' + o.dots + '</span>' +
          '<span class="fwd-opt-l">' + esc(o.label) + '</span>' +
          '<span class="fwd-opt-s">' + esc(o.sub) + '</span>' +
          '<span class="fwd-opt-h">' + esc(o.hint) + '</span></button>';
      });
    mkRow('fwd-row-color', '2 · สารให้สี', 'Effect Colour', COLOR_OPTS(), this._design.color, 'color',
      function (o, on) {
        return '<button type="button" class="fwd-opt' + (on ? ' on' : '') + '" data-val="' + o.id + '"' +
          ' style="--fwd-c:' + o.hex + '">' +
          '<span class="fwd-opt-swatch"></span>' +
          '<span class="fwd-opt-l">' + esc(o.label) + '</span>' +
          '<span class="fwd-opt-s">' + esc(o.sub) + '</span>' +
          '<span class="fwd-opt-h">' + esc(o.chem) + '</span></button>';
      });
    mkRow('fwd-row-fuse', '3 · ชนวนหน่วงเวลา', 'Fuse Timing', FUSE_OPTS, this._design.fuse, 'fuse',
      function (o, on) {
        return '<button type="button" class="fwd-opt' + (on ? ' on' : '') + '" data-val="' + o.id + '">' +
          '<span class="fwd-opt-big">⏱</span>' +
          '<span class="fwd-opt-l">' + esc(o.label) + '</span>' +
          '<span class="fwd-opt-s">' + esc(o.sub) + '</span>' +
          '<span class="fwd-opt-h">' + esc(o.hint) + '</span></button>';
      });

    // 4th row — Launch Angle — only for missions that flag it (M02+)
    var angleRow = $('fwd-row-angle');
    if (this._mission.atlas && this._mission.atlas.angles) {
      mkRow('fwd-row-angle', '4 · องศาการยิง', 'Launch Angle', ANGLE_OPTS, this._design.angle, 'angle',
        function (o, on) {
          return '<button type="button" class="fwd-opt' + (on ? ' on' : '') + '" data-val="' + o.id + '">' +
            '<span class="fwd-opt-big">' + o.glyph + '</span>' +
            '<span class="fwd-opt-l">' + esc(o.label) + '</span>' +
            '<span class="fwd-opt-s">' + esc(o.sub) + '</span>' +
            '<span class="fwd-opt-h">' + esc(o.hint) + '</span></button>';
        });
    } else if (angleRow) {
      angleRow.hidden = true; angleRow.innerHTML = '';
    }
    var seqRow = $('fwd-row-seq');
    if (seqRow) { seqRow.hidden = true; seqRow.innerHTML = ''; }

    var prev = $('fw-desk-preview');
    if (prev) {
      var L = LIFT_OPTS.filter(function (o) { return o.id === self._design.lift; })[0];
      var Cc = COLOR_OPTS().filter(function (o) { return o.id === self._design.color; })[0];
      prev.style.setProperty('--fwd-c', (Cc && Cc.hex) || '#ffc247');
      var angleTxt = (this._mission.atlas && this._mission.atlas.angles)
        ? (' · มุม <b>' + (ANGLE_OPTS.filter(function (o) { return o.id === self._design.angle; })[0] || {}).label + '</b>')
        : '';
      prev.innerHTML = '<span class="fwd-preview-shell">🎆</span>' +
        '<span>แรงขับ <b>' + esc(L ? L.label : '') + '</b> · สี <b>' + esc(Cc ? Cc.label : '') +
        '</b> · ชนวน <b>' + self._design.fuse.toFixed(1) + ' วิ</b>' + angleTxt + '</span>';
    }

    this._show('desk');
  };

  // ---- 3b · THE SEQUENCER DESK (M03) — Tube 1 / Tube 2 / Tube 3 -----------
  //  One full Effect-Colour selector per tube. Lift + fuse are shown as a
  //  locked "standard" chip so the player knows what's fixed. The engine fires
  //  Tube 1, waits ~1 s, Tube 2, waits ~1 s, Tube 3 (see FlightScreen).
  UI.prototype._renderSequencerDesk = function () {
    var self = this;
    var d = this._design;
    var atl = this._mission.atlas || {};
    var n = atl.tubeCount || 3;
    var tuneFuse = !!atl.tuneFuse;
    var simultaneous = !!atl.simultaneous;
    var GLYPH = { red: '🔴', white: '⚪', blue: '🔵', green: '🟢', gold: '🟡' };

    // per-tube design = [{color, fuse}] — migrate an old string[] + (re)size to n,
    // keeping whatever the player already picked (persists across fail→retry)
    if (!Array.isArray(d.seq)) d.seq = [];
    d.seq = d.seq.map(function (t) {
      return (t && typeof t === 'object')
        ? { color: t.color || 'gold', fuse: +t.fuse || 3.0 }
        : { color: t || 'gold', fuse: 3.0 };
    });
    while (d.seq.length < n) d.seq.push({ color: 'gold', fuse: 3.0 });
    d.seq.length = n;

    var goal = $('fw-desk-goal');
    if (goal) {
      goal.textContent = atl.deskGoal ||
        (simultaneous ? '🎯 ยิงพร้อมกัน ' + n + ' หลอด — ผสมสีและชนวนให้หลากหลาย'
                      : '🎯 ยิงตามลำดับ แดง → ขาว → น้ำเงิน');
    }

    // hide the single-shell rows, show the tube sequencer
    ['fwd-row-lift', 'fwd-row-color', 'fwd-row-fuse', 'fwd-row-angle'].forEach(function (id) {
      var el = $(id); if (el) { el.hidden = true; el.innerHTML = ''; }
    });

    var colOpts = COLOR_OPTS();
    var swatch = function (ti, o, on) {
      return '<button type="button" class="fwd-opt' + (on ? ' on' : '') +
        '" data-tube="' + ti + '" data-kind="color" data-val="' + o.id +
        '" style="--fwd-c:' + o.hex + '" title="' + esc(o.sub) + '">' +
        '<span class="fwd-opt-swatch"></span>' +
        '<span class="fwd-opt-l">' + esc(o.label) + '</span>' +
        (tuneFuse ? '' :
          '<span class="fwd-opt-s">' + esc(o.sub) + '</span>' +
          '<span class="fwd-opt-h">' + esc(o.chem) + '</span>') +
        '</button>';
    };
    var fuseChip = function (ti, f, on) {
      return '<button type="button" class="fwd-fusechip' + (on ? ' on' : '') +
        '" data-tube="' + ti + '" data-kind="fuse" data-val="' + f.id + '" title="' + esc(f.hint) + '">' +
        '⏱ ' + esc(f.label) + '</button>';
    };
    var tubeHtml = function (ti) {
      var t = d.seq[ti];
      var body = '<div class="fwd-opts fwd-opts-seq' + (tuneFuse ? ' compact' : '') + '">' +
        colOpts.map(function (o) { return swatch(ti, o, o.id === t.color); }).join('') + '</div>';
      if (tuneFuse) {
        body += '<div class="fwd-fuserow">' +
          FUSE_OPTS.map(function (f) { return fuseChip(ti, f, f.id === t.fuse); }).join('') + '</div>';
      }
      return '<div class="fwd-tube" data-tube="' + ti + '">' +
        '<div class="fwd-tube-h"><span class="fwd-tube-n">หลอดที่ ' + (ti + 1) + '</span>' +
        '<span class="fwd-tube-tag">' + (GLYPH[t.color] || '⚫') +
          (tuneFuse ? ' · ' + t.fuse.toFixed(1) + ' วิ' : '') + '</span></div>' +
        body + '</div>';
    };

    var seqRow = $('fwd-row-seq');
    if (!seqRow) { this._show('desk'); return; }   // markup missing — plain desk
    seqRow.hidden = false;
    seqRow.style.setProperty('--sa-accent', atl.accent || '#5c8cff');

    var lockTxt = simultaneous
      ? '🔒 แรงส่ง: กลาง &nbsp;·&nbsp; 🔥 ยิงพร้อมกันทั้ง ' + n + ' หลอด (t₀ = 0) — จังหวะมาจาก "ชนวน"'
      : '🔒 แรงส่ง: กลาง (Medium) &nbsp;·&nbsp; 🔒 ชนวน: 3.0 วินาที &nbsp;·&nbsp; 🔒 ยิงตรง 90°';

    seqRow.innerHTML =
      '<div class="fwd-row-h"><b>' + (tuneFuse ? 'สี + ชนวน' : 'สารให้สี') + ' · ' + n + ' หลอด</b>' +
        '<span>' + (tuneFuse ? 'Colour + Fuse × ' + n : 'Effect Colour × ' + n) + '</span></div>' +
      '<div class="fwd-seq-lockbar">' + lockTxt + '</div>' +
      '<div class="fwd-tubes' + (n >= 5 ? ' five' : '') + '">' +
        d.seq.map(function (_, i) { return tubeHtml(i); }).join('') + '</div>';

    Array.prototype.forEach.call(seqRow.querySelectorAll('[data-kind]'), function (b) {
      b.addEventListener('click', function () {
        var ti = +b.dataset.tube;
        if (b.dataset.kind === 'fuse') self._design.seq[ti].fuse = parseFloat(b.dataset.val);
        else self._design.seq[ti].color = b.dataset.val;
        self._renderSequencerDesk();
      });
    });

    // ---- the preview strip -----------------------------------------------
    var prev = $('fw-desk-preview');
    if (prev) {
      prev.style.setProperty('--fwd-c', self.colorHex(d.seq[n - 1].color));
      if (tuneFuse) {
        var cset = {}, fset = {};
        d.seq.forEach(function (t) { cset[t.color] = 1; fset[t.fuse] = 1; });
        var nc = Object.keys(cset).length, nf = Object.keys(fset).length;
        var need = (this._mission.objectives && this._mission.objectives.carnivalRhythm) || {};
        prev.innerHTML = '<span class="fwd-preview-shell">🎆</span>' +
          '<span>' + d.seq.map(function (t) {
            return '<b style="color:' + self.colorHex(t.color) + '" title="ชนวน ' + t.fuse.toFixed(1) + ' วิ">' +
              (GLYPH[t.color] || '⚫') + '<sub style="opacity:.7;font-size:.7em">' + t.fuse.toFixed(1) + '</sub></b>';
          }).join(' ') +
          ' &nbsp;<span class="fwd-preview-tally' + (nc >= (need.minColors || 3) ? ' ok' : '') + '">สี ' +
            nc + '/' + (need.minColors || 3) + '</span> ' +
          '<span class="fwd-preview-tally' + (nf >= (need.minFuses || 2) ? ' ok' : '') + '">ชนวน ' +
            nf + '/' + (need.minFuses || 2) + '</span></span>';
      } else {
        prev.innerHTML = '<span class="fwd-preview-shell">🎆</span>' +
          '<span>ลำดับยิง: ' + d.seq.map(function (t, i) {
            return '<b style="color:' + self.colorHex(t.color) + '">' + (GLYPH[t.color] || '⚫') + ' ' +
              esc(self.colorLabel(t.color)) + '</b>' + (i < n - 1 ? ' <span style="opacity:.6">→</span> ' : '');
          }).join('') + '</span>';
      }
    }

    this._show('desk');
  };

  // ---- 3c · THE HANABI BURST DESK (M05) — 1 massive shell -----------------
  //  Lift + colour + fuse are locked; the player designs the burst SHAPE
  //  (star packing → velocity distribution) and the DECAY effect (star
  //  aerodynamics → Sakura Rain hang-and-fall). See FlightScreen._spawnFwBurst.
  UI.prototype._renderBurstDesk = function () {
    var self = this;
    var d = this._design;
    var atl = this._mission.atlas || {};
    d.lift = atl.lockLift || 'fw_lift_l';
    d.color = atl.lockColor || 'pink';
    if (!d.shape) d.shape = 'peony';
    if (!d.decay) d.decay = 'none';

    var goal = $('fw-desk-goal');
    if (goal) goal.textContent = atl.deskGoal || '🎯 ออกแบบพลุลูกใหญ่ 1 ลูก';

    ['fwd-row-seq'].forEach(function (id) {
      var el = $(id); if (el) { el.hidden = true; el.innerHTML = ''; }
    });

    var lockChip = function (rowId, num, title, thai, label, sub) {
      var wrap = $(rowId); if (!wrap) return;
      wrap.hidden = false;
      wrap.innerHTML =
        '<div class="fwd-row-h"><b>' + num + ' · ' + esc(title) + '</b><span>' + esc(thai) + '</span></div>' +
        '<div class="fwd-locked"><span class="fwd-locked-ic">🔒</span>' +
        '<span class="fwd-locked-l">' + esc(label) + '</span>' +
        '<span class="fwd-locked-s">' + esc(sub) + ' · ล็อกไว้</span></div>';
    };
    var LIFTMAP = { fw_lift_s: 'เล็ก', fw_lift_m: 'กลาง', fw_lift_l: 'ใหญ่ (Large)' };
    lockChip('fwd-row-lift', '1', 'แรงขับ', 'Lift Charge', LIFTMAP[d.lift] || d.lift, 'ขึ้นสูงสุด');
    lockChip('fwd-row-color', '2', 'สารให้สี', 'Effect Colour', self.colorLabel(d.color), 'โทนซากุระ');

    var mkPick = function (rowId, num, title, thai, opts, cur, key) {
      var wrap = $(rowId); if (!wrap) return;
      wrap.hidden = false;
      wrap.innerHTML =
        '<div class="fwd-row-h"><b>' + num + ' · ' + esc(title) + '</b><span>' + esc(thai) + '</span></div>' +
        '<div class="fwd-opts fwd-opts-3">' + opts.map(function (o) {
          return '<button type="button" class="fwd-opt' + (o.id === cur ? ' on' : '') +
            '" data-key="' + key + '" data-val="' + o.id + '">' +
            '<span class="fwd-opt-big">' + (o.glyph || '•') + '</span>' +
            '<span class="fwd-opt-l">' + esc(o.label) + '</span>' +
            '<span class="fwd-opt-s">' + esc(o.sub) + '</span>' +
            '<span class="fwd-opt-h">' + esc(o.hint) + '</span></button>';
        }).join('') + '</div>';
      Array.prototype.forEach.call(wrap.querySelectorAll('.fwd-opt'), function (b) {
        b.addEventListener('click', function () {
          self._design[b.dataset.key] = b.dataset.val;
          self._renderBurstDesk();
        });
      });
    };
    mkPick('fwd-row-fuse', '3', 'รูปทรงการแตก', 'Burst Shape', SHAPE_OPTS(), d.shape, 'shape');
    mkPick('fwd-row-angle', '4', 'เอฟเฟกต์หาง', 'Decay Effect', DECAY_OPTS(), d.decay, 'decay');

    var prev = $('fw-desk-preview');
    if (prev) {
      var sh = SHAPE_OPTS().filter(function (o) { return o.id === d.shape; })[0] || {};
      var de = DECAY_OPTS().filter(function (o) { return o.id === d.decay; })[0] || {};
      prev.style.setProperty('--fwd-c', self.colorHex(d.color));
      prev.innerHTML = '<span class="fwd-preview-shell">🎆</span>' +
        '<span>พลุใหญ่ · สี <b>' + esc(self.colorLabel(d.color)) + '</b> · ทรง <b>' +
        (sh.glyph || '') + ' ' + esc(sh.label || d.shape) + '</b> · หาง <b>' +
        (de.glyph || '') + ' ' + esc(de.label || d.decay) + '</b></span>';
    }

    this._show('desk');
  };

  UI.prototype._launch = function () {
    var self = this;
    var m = this._mission, d = this._design;
    var atl = m.atlas || {};
    this.close();
    if (!this._opts.onLaunchFirework) return;

    if (atl.burstDesk) {
      this._opts.onLaunchFirework(m, {
        lift: atl.lockLift || 'fw_lift_l',
        color: atl.lockColor || 'pink', colorHex: self.colorHex(atl.lockColor || 'pink'),
        fuse: +atl.lockFuse || 3.6, angle: 90,
        shape: d.shape, decay: d.decay
      });
      return;
    }

    if (atl.sequence) {
      var tc = atl.tubeCount || 3;
      var seq = d.seq.slice(0, tc).map(function (t) {
        return { color: t.color, colorHex: self.colorHex(t.color),
                 fuse: atl.tuneFuse ? (+t.fuse || 3.0) : 3.0 };
      });
      this._opts.onLaunchFirework(m, {
        // lift is always locked "กลาง"; M03 also locks the fuse, M04 unlocks it
        lift: 'fw_lift_m', angle: 90, fuse: seq[0].fuse, sequence: seq
      });
      return;
    }
    this._opts.onLaunchFirework(m, {
      lift: d.lift, color: d.color, colorHex: this.colorHex(d.color), fuse: d.fuse,
      angle: (m.atlas && m.atlas.angles) ? d.angle : 90
    });
  };

  // ---- 4 · THE "WHY?" SCIENCE CARD ---------------------------------
  UI.prototype.openScienceCard = function (card, onRetry) {
    this._ensureDom();
    this._sciRetry = onRetry || null;
    if (!this._elSci) {                              // fallback: plain alert-ish
      if (global.alert) global.alert((card.tag || '') + '\n\n' + (card.body || ''));
      if (onRetry) onRetry();
      return;
    }
    $('fw-science-tag').textContent = card.tag || 'Physics Insight';
    var ctx = $('fw-science-context');
    ctx.textContent = card.context || '';
    ctx.hidden = !card.context;
    $('fw-science-body').textContent = card.body || '';
    this._root.hidden = false;
    this._elSci.hidden = false;
  };

  // if the markup is missing entirely, degrade to the normal MissionBriefing
  UI.prototype._fallbackBrief = function () {
    if (this._mission && RS.MissionBriefing) {
      var self = this;
      RS.MissionBriefing.show(this._mission, {
        onAccept: function () {
          if (self._opts.onLaunchFirework) {
            self._opts.onLaunchFirework(self._mission, {
              lift: self._design.lift, color: self._design.color,
              colorHex: self.colorHex(self._design.color), fuse: self._design.fuse,
              angle: (self._mission.atlas && self._mission.atlas.angles) ? self._design.angle : 90
            });
          }
        }
      });
    }
  };

  RS.render.UI = new UI();

})(typeof window !== 'undefined' ? window : this);
