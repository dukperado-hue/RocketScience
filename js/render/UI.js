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
  var COLOR_OPTS = [
    { id: 'red',   label: 'แดง',    sub: 'Strontium (Sr)', hex: '#ff4d5a', chem: 'สตรอนเชียม' },
    { id: 'gold',  label: 'ทอง',    sub: 'Carbon / Iron',  hex: '#ffc247', chem: 'คาร์บอน + เหล็ก' },
    { id: 'green', label: 'เขียว',  sub: 'Barium (Ba)',    hex: '#54e08a', chem: 'แบเรียม' }
  ];
  var FUSE_OPTS = [
    { id: 1.5, label: '1.5 วิ', sub: 'สั้น',  hint: 'แตกตอนยังพุ่งขึ้น' },
    { id: 3.0, label: '3.0 วิ', sub: 'กลาง',  hint: 'แตกใกล้จุดสูงสุด' },
    { id: 4.5, label: '4.5 วิ', sub: 'ยาว',   hint: 'แตกที่ยอด/ตอนร่วงลง' }
  ];
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
    this._design = { lift: 'fw_lift_m', color: 'gold', fuse: 3.0, angle: 90 };
    this._built = false;
  }

  UI.prototype.init = function (opts) {
    this._opts = opts || {};
    this._ensureDom();
    return this;
  };

  UI.prototype.colorHex = function (id) {
    var c = COLOR_OPTS.filter(function (o) { return o.id === id; })[0];
    return c ? c.hex : '#ffc247';
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
    $('fw-cultural-goal').textContent = box
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
    var box = (this._mission.objectives && this._mission.objectives.burstAltitudeBox) || null;
    var goal = $('fw-desk-goal');
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
    mkRow('fwd-row-color', '2 · สารให้สี', 'Effect Colour', COLOR_OPTS, this._design.color, 'color',
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

    var prev = $('fw-desk-preview');
    if (prev) {
      var L = LIFT_OPTS.filter(function (o) { return o.id === self._design.lift; })[0];
      var Cc = COLOR_OPTS.filter(function (o) { return o.id === self._design.color; })[0];
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

  UI.prototype._launch = function () {
    var m = this._mission, d = this._design;
    this.close();
    if (this._opts.onLaunchFirework) this._opts.onLaunchFirework(m, {
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
