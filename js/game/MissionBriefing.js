/* =============================================================================
 * FROM FIRE TO ORBIT — game layer
 * js/game/MissionBriefing.js  ·  the pre-assembly briefing screen  (Phase 4)
 *
 * A full-screen "engineering brief": NPC transcript with a typewriter effect,
 * then the mission's objectives + constraints laid out like a spec sheet, then
 * one [ ACCEPT MISSION ] button that drops the player into the 2D builder.
 *
 * Pure DOM. Reads RS.MissionEngine for NPC metadata. No render/, no Three.js.
 * ===========================================================================*/
(function (global) {
  'use strict';

  var RS = global.RS = global.RS || {};

  function $(id) { return document.getElementById(id); }

  function MissionBriefing() {
    this.root   = $('mission-briefing');
    this.elKick = $('mb-kicker');
    this.elTitle = $('mb-title');
    this.elDesc = $('mb-desc');
    this.elAvatar = $('mb-avatar');
    this.elSpeaker = $('mb-speaker');
    this.elRole = $('mb-role');
    this.elLog  = $('mb-log');
    this.elObj  = $('mb-objectives');
    this.elCon  = $('mb-constraints');
    this.btnAccept = $('mb-accept');
    this.btnSkip = $('mb-skip');

    this._lines = [];
    this._li = 0;
    this._ci = 0;
    this._timer = 0;
    this._typing = false;
    this._onAccept = null;
    this._bound = false;
    if (this.root) this._bind();
  }

  MissionBriefing.prototype._bind = function () {
    var self = this;
    this.btnAccept.addEventListener('click', function () { self._accept(); });
    this.btnSkip.addEventListener('click', function () { self._finishAll(); });
    // click anywhere in the transcript advances / completes the current line
    $('mb-stage').addEventListener('click', function (e) {
      if (e.target.closest('button')) return;
      if (self._typing) self._completeLine();
      else if (self._li < self._lines.length) self._nextLine();
    });
    global.addEventListener('keydown', function (e) {
      if (self.root.hidden) return;
      if (e.key === 'Enter' && !self.btnAccept.disabled) self._accept();
      else if (e.key === ' ') {
        e.preventDefault();
        if (self._typing) self._completeLine();
        else if (self._li < self._lines.length) self._nextLine();
      }
    });
  };

  /**
   * @param {Object} mission  from RS.data.missions
   * @param {{onAccept:function}} opts
   */
  MissionBriefing.prototype.show = function (mission, opts) {
    if (!this.root || !mission) { if (opts && opts.onAccept) opts.onAccept(); return; }
    opts = opts || {};
    this._onAccept = opts.onAccept || null;

    var npc = RS.MissionEngine ? RS.MissionEngine.npc(mission.npc) : { name: '', glyph: '🛰️', role: '' };

    this.elKick.textContent = 'MISSION BRIEF · ' + String(mission.era || '').toUpperCase();
    this.elTitle.textContent = mission.title || mission.id;
    this.elDesc.textContent = mission.description || '';
    this.elAvatar.textContent = npc.glyph;
    this.elAvatar.style.borderColor = npc.accent || '#5bd6ff';
    this.elSpeaker.textContent = npc.name;
    this.elSpeaker.style.color = npc.accent || '#e9f1ff';
    this.elRole.textContent = npc.role || '';

    this.elObj.innerHTML = this._specRows(objectiveRows(mission));
    this.elCon.innerHTML = this._specRows(constraintRows(mission));

    this._lines = (mission.npc_dialogue && mission.npc_dialogue.length)
      ? mission.npc_dialogue.slice() : [mission.description || ''];
    this._li = 0; this._ci = 0;
    this.elLog.innerHTML = '';
    this.btnAccept.disabled = true;

    this.root.hidden = false;
    this._nextLine();
  };

  MissionBriefing.prototype._specRows = function (rows) {
    if (!rows.length) return '<li class="mb-spec-none">— ไม่มี —</li>';
    return rows.map(function (r) {
      return '<li><span class="mb-spec-ic">' + r.icon + '</span>' +
        '<span class="mb-spec-tx"><b>' + esc(r.label) + '</b>' +
        (r.sub ? '<i>' + esc(r.sub) + '</i>' : '') + '</span></li>';
    }).join('');
  };

  // ---- typewriter -----------------------------------------------------
  MissionBriefing.prototype._nextLine = function () {
    if (this._li >= this._lines.length) { this._finishAll(); return; }
    var text = this._lines[this._li];
    var row = document.createElement('p');
    row.className = 'mb-line';
    row.innerHTML = '<span class="mb-cursor"></span>';
    this.elLog.appendChild(row);
    this._curRow = row;
    this._curText = text;
    this._ci = 0;
    this._typing = true;
    this._tick();
  };

  MissionBriefing.prototype._tick = function () {
    var self = this;
    if (this._ci >= this._curText.length) { this._typing = false; this._afterLine(); return; }
    this._ci++;
    this._curRow.textContent = this._curText.slice(0, this._ci);
    this._timer = global.setTimeout(function () { self._tick(); },
      /[。.!?…ฯ]/.test(this._curText[this._ci - 1]) ? 190 : 17);
  };

  MissionBriefing.prototype._completeLine = function () {
    if (this._timer) { global.clearTimeout(this._timer); this._timer = 0; }
    this._typing = false;
    if (this._curRow) this._curRow.textContent = this._curText;
    this._afterLine();
  };

  MissionBriefing.prototype._afterLine = function () {
    this._li++;
    this.elLog.scrollTop = this.elLog.scrollHeight;
    if (this._li >= this._lines.length) this._finishAll();
  };

  MissionBriefing.prototype._finishAll = function () {
    if (this._timer) { global.clearTimeout(this._timer); this._timer = 0; }
    // render any not-yet-shown lines instantly
    while (this._li < this._lines.length) {
      var row = document.createElement('p');
      row.className = 'mb-line';
      row.textContent = this._lines[this._li];
      this.elLog.appendChild(row);
      this._li++;
    }
    if (this._curRow && this._typing) this._curRow.textContent = this._curText;
    this._typing = false;
    this.elLog.scrollTop = this.elLog.scrollHeight;
    this.btnAccept.disabled = false;
    this.btnAccept.focus();
  };

  MissionBriefing.prototype._accept = function () {
    if (this._timer) { global.clearTimeout(this._timer); this._timer = 0; }
    this.root.hidden = true;
    var cb = this._onAccept; this._onAccept = null;
    if (cb) cb();
  };

  // ---- spec-sheet rows ---------------------------------------------
  function objectiveRows(m) {
    var o = m.objectives || {}, rows = [];
    if (o.targetAltitude != null) {
      rows.push({ icon: '🎯', label: 'ระดับความสูง ≥ ' + o.targetAltitude + ' ม.',
        sub: 'ยอดสูงสุด (apogee) ต้องถึงเป้า' });
    }
    if (o.surviveFlight) {
      rows.push({ icon: '🛡️', label: 'บินได้โดยไม่เสียการควบคุม',
        sub: 'ห้ามตีลังกา / โครงสร้างห้ามพัง' });
    }
    return rows;
  }
  function constraintRows(m) {
    var c = m.constraints || {}, rows = [];
    if (c.maxCost != null) {
      rows.push({ icon: '💰', label: 'งบประมาณ ≤ ' + c.maxCost + ' ฿',
        sub: 'ราคารวมชิ้นส่วนทั้งยาน' });
    }
    if (c.maxMass != null) {
      rows.push({ icon: '⚖️', label: 'มวลรวม ≤ ' + (c.maxMass < 1
        ? Math.round(c.maxMass * 1000) + ' g' : c.maxMass + ' kg') });
    }
    (c.requiredParts || []).forEach(function (pid) {
      var cat = RS.PartsCatalog, p = cat && cat.get(pid);
      rows.push({ icon: '🔧', label: 'ต้องใช้: ' + ((p && p.name) || pid) });
    });
    return rows;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  RS.MissionBriefing = new MissionBriefing();

})(typeof window !== 'undefined' ? window : this);
