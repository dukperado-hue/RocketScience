/* =============================================================================
 * FROM FIRE TO ORBIT — Unified Architecture
 * js/core/Blueprint2D.js
 *
 * The 2-D Orthographic Blueprint Builder (à la Spaceflight Simulator).
 *
 *   • Dark blueprint canvas, clean grid.
 *   • ONE vertical parts rail on the left (icon + short name).
 *   • Drag a part onto the grid; it SNAPS to the open attach-nodes of the
 *     parts already placed. Drag a placed part to move it; drag it off the
 *     grid (or hit the trash) to remove it.
 *   • Every edit rebuilds the RS.Vehicle and repaints CoM / CoP + telemetry.
 *
 * No 3-D. No physics. This file only turns pointer gestures into a valid
 * Vehicle graph and draws it.
 * ===========================================================================*/
(function (global) {
  'use strict';

  var CATEGORY_COLOR = {
    Structural:   '#8b6f47',
    Propulsion:   '#c65b3a',
    Aerodynamics: '#3a7ca5',
    Payload:      '#5b8c5a'
  };

  var SNAP_PX = 34;            // pointer must be within this of a snap solution
  var MIN_CELL = 26, MAX_CELL = 84;

  /**
   * @param {Object} cfg
   * @param {HTMLCanvasElement} cfg.canvas
   * @param {HTMLElement} cfg.catalogEl    - container for the left rail
   * @param {HTMLElement} [cfg.telemetryEl]- container for the readout
   * @param {HTMLElement} [cfg.statusEl]   - one-line hint / validity strip
   * @param {import('./Vehicle').Vehicle} cfg.vehicle
   * @param {Object} cfg.catalog           - RS.PartsCatalog
   * @param {string} [cfg.era='0-khomloy']
   * @param {function(Object):void} [cfg.onChange] - passed vehicle.computeStats()
   */
  function Blueprint2D(cfg) {
    this.canvas = cfg.canvas;
    this.ctx = cfg.canvas.getContext('2d');
    this.catalogEl = cfg.catalogEl;
    this.telemetryEl = cfg.telemetryEl || null;
    this.statusEl = cfg.statusEl || null;
    this.vehicle = cfg.vehicle;
    this.catalog = cfg.catalog;
    this.era = cfg.era || '0-khomloy';
    this.onChange = cfg.onChange || function () {};

    this.view = { ox: 0, oy: 0, cell: 52 };
    this.pointer = { x: 0, y: 0, inside: false };
    this.carry = null;          // { part, fromIid } while dragging
    this.hoverSolution = null;  // resolved snap while carrying
    this.selectedIid = null;
    this._raf = 0;
    this._dpr = Math.min(global.devicePixelRatio || 1, 2);

    this._buildCatalog();
    this._bind();
    this.resize();
    this._recenter();
    this._render();
    this._emitChange();
  }

  // ---------------------------------------------------------------------------
  //  Left rail
  // ---------------------------------------------------------------------------

  Blueprint2D.prototype._buildCatalog = function () {
    var self = this;
    var parts = this.catalog.byEra(this.era);
    this.catalogEl.innerHTML = '';
    this.catalogEl.classList.add('bp-rail');

    parts.forEach(function (part) {
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'bp-part';
      row.dataset.partId = part.id;
      row.style.setProperty('--cat', CATEGORY_COLOR[part.category] || '#888');
      row.innerHTML =
        '<span class="bp-part-ic">' + part.icon + '</span>' +
        '<span class="bp-part-tx">' +
          '<span class="bp-part-nm">' + esc(part.name) + '</span>' +
          '<span class="bp-part-mt">' + part.category + ' · ' +
            fmtMass(part.mass) + ' · ฿' + part.cost + '</span>' +
        '</span>';
      row.title = part.blurb || part.name;
      row.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        self._startCarry(part, null, e);   // catalog already stores Part instances
      });
      self.catalogEl.appendChild(row);
    });
  };

  // ---------------------------------------------------------------------------
  //  Carry / drag lifecycle
  // ---------------------------------------------------------------------------

  Blueprint2D.prototype._startCarry = function (part, fromIid, e) {
    this.carry = { part: part, fromIid: fromIid };
    this.selectedIid = fromIid;
    if (e && e.pointerId != null && this.canvas.setPointerCapture) {
      try { global.addEventListener('pointermove', this._onMoveWin, true); } catch (x) {}
    }
    this._setStatus('วาง “' + part.name + '” — เลื่อนไปที่จุดต่อสีเขียว');
    this._render();
  };

  Blueprint2D.prototype._drop = function () {
    if (!this.carry) return;
    var part = this.carry.part;
    var fromIid = this.carry.fromIid;
    var sol = this.hoverSolution;

    // dropped outside the grid while moving an existing part => delete it
    if (fromIid != null && !this.pointer.inside) {
      this.vehicle.removeInstance(fromIid);
      this._afterEdit('ถอด “' + part.name + '” ออกแล้ว');
      this.carry = null; this.hoverSolution = null; this.selectedIid = null;
      return;
    }

    if (!sol) {
      this._setStatus(this.vehicle.instances.length
        ? 'ยังไม่เจอจุดต่อที่เข้ากันได้ — ลองเลื่อนเข้าใกล้จุดสีเขียว'
        : 'เลื่อนเข้ามาในกริดเพื่อวางชิ้นแรก');
      this.carry = null; this.hoverSolution = null; this._render();
      return;
    }

    if (fromIid != null) this.vehicle.removeInstance(fromIid);
    this.vehicle.addInstance(part, sol.gx, sol.gy, sol.links);
    this._afterEdit((fromIid != null ? 'ย้าย' : 'ต่อ') + ' “' + part.name + '” เข้ากับยานแล้ว');

    this.carry = null;
    this.hoverSolution = null;
    this.selectedIid = this.vehicle.instances[this.vehicle.instances.length - 1].iid;
  };

  Blueprint2D.prototype._afterEdit = function (msg) {
    this.vehicle.markDirty();
    this._recenter();
    this._emitChange();
    if (msg) this._setStatus(msg);
    this._render();
  };

  // ---------------------------------------------------------------------------
  //  Snap solver — the heart of the builder
  // ---------------------------------------------------------------------------

  /**
   * Given the part being carried and the current pointer position, find the
   * best legal placement. Returns { gx, gy, links[] } or null.
   */
  Blueprint2D.prototype._solveSnap = function () {
    var part = this.carry.part;
    var ignoreIid = this.carry.fromIid;
    var p = this._pointerCell();

    // First part on an empty grid: free placement, snapped to integer cells.
    var live = this.vehicle.instances.filter(function (i) { return i.iid !== ignoreIid; });
    if (!live.length) {
      return {
        gx: Math.round(p.cx - part.size.w / 2),
        gy: Math.round(p.cy - part.size.h / 2),
        links: []
      };
    }

    var openNodes = this.vehicle.openNodes().filter(function (n) {
      return n.iid !== ignoreIid;
    });
    var best = null, bestDist = Infinity;

    for (var a = 0; a < part.attachNodes.length; a++) {
      var myNode = part.attachNodes[a];
      for (var b = 0; b < openNodes.length; b++) {
        var tgt = openNodes[b];

        // node kinds must match (stack↔stack, radial↔radial)
        if (myNode.type !== tgt.type) continue;
        // target's whitelist must allow my category …
        if (tgt.accepts.indexOf('*') === -1 &&
            tgt.accepts.indexOf(part.category) === -1) continue;
        // … and my node's whitelist must allow the target's category
        var tgtInst = this.vehicle.byIid(tgt.iid);
        if (myNode.accepts.indexOf('*') === -1 &&
            myNode.accepts.indexOf(tgtInst.part.category) === -1) continue;

        // place so my node lands exactly on the target node
        var gx = Math.round(tgt.x - myNode.dx);
        var gy = Math.round(tgt.y - myNode.dy);

        // reject footprint overlaps
        if (this._overlaps(part, gx, gy, ignoreIid)) continue;

        var px = this._cellToPx(tgt.x, tgt.y);
        var d = Math.hypot(px.x - this.pointer.x, px.y - this.pointer.y);
        if (d < bestDist) {
          bestDist = d;
          best = {
            gx: gx, gy: gy,
            links: [{ node: myNode.id, toIid: tgt.iid, toNode: tgt.nodeId }],
            _anchorPx: px
          };
        }
      }
    }

    if (best && bestDist <= SNAP_PX * 3) return best;  // generous: nearest node
    return null;
  };

  Blueprint2D.prototype._overlaps = function (part, gx, gy, ignoreIid) {
    for (var x = gx; x < gx + part.size.w; x++) {
      for (var y = gy; y < gy + part.size.h; y++) {
        if (this.vehicle.cellOccupied(x, y, ignoreIid)) return true;
      }
    }
    return false;
  };

  // ---------------------------------------------------------------------------
  //  Coordinate helpers
  // ---------------------------------------------------------------------------

  Blueprint2D.prototype._cellToPx = function (cx, cy) {
    return {
      x: this.view.ox + cx * this.view.cell,
      y: this.view.oy + cy * this.view.cell
    };
  };
  Blueprint2D.prototype._pxToCell = function (px, py) {
    return {
      cx: (px - this.view.ox) / this.view.cell,
      cy: (py - this.view.oy) / this.view.cell
    };
  };
  Blueprint2D.prototype._pointerCell = function () {
    return this._pxToCell(this.pointer.x, this.pointer.y);
  };

  Blueprint2D.prototype._recenter = function () {
    // keep the vehicle bounding box roughly centred
    var insts = this.vehicle.instances;
    var w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!insts.length) {
      this.view.ox = w / 2;
      this.view.oy = h / 2;
      return;
    }
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    insts.forEach(function (i) {
      minX = Math.min(minX, i.gx); minY = Math.min(minY, i.gy);
      maxX = Math.max(maxX, i.gx + i.part.size.w);
      maxY = Math.max(maxY, i.gy + i.part.size.h);
    });
    var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    this.view.ox = w / 2 - cx * this.view.cell;
    this.view.oy = h / 2 - cy * this.view.cell;
  };

  // ---------------------------------------------------------------------------
  //  Events
  // ---------------------------------------------------------------------------

  Blueprint2D.prototype._bind = function () {
    var self = this;
    var cv = this.canvas;

    this._onMoveWin = function (e) {
      var r = cv.getBoundingClientRect();
      self.pointer.x = e.clientX - r.left;
      self.pointer.y = e.clientY - r.top;
      self.pointer.inside =
        self.pointer.x >= 0 && self.pointer.y >= 0 &&
        self.pointer.x <= r.width && self.pointer.y <= r.height;
      if (self.carry) self.hoverSolution = self._solveSnap();
      self._render();
    };

    cv.addEventListener('pointermove', function (e) {
      var r = cv.getBoundingClientRect();
      self.pointer.x = e.clientX - r.left;
      self.pointer.y = e.clientY - r.top;
      self.pointer.inside = true;
      if (self.carry) self.hoverSolution = self._solveSnap();
      self._render();
    });
    cv.addEventListener('pointerleave', function () {
      self.pointer.inside = false;
      if (self.carry) { self.hoverSolution = null; self._render(); }
    });

    cv.addEventListener('pointerdown', function (e) {
      var hit = self._hitTest(e);
      if (self.carry) return;                 // carrying: click handled on up
      if (hit) {
        self.selectedIid = hit.iid;
        self._startCarry(hit.part, hit.iid, e);
      } else {
        self.selectedIid = null;
        self._render();
      }
    });

    global.addEventListener('pointerup', function () {
      if (self.carry) self._drop();
      try { global.removeEventListener('pointermove', self._onMoveWin, true); } catch (x) {}
      self._render();
    });

    cv.addEventListener('wheel', function (e) {
      e.preventDefault();
      var before = self._pxToCell(self.pointer.x, self.pointer.y);
      var factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      self.view.cell = clamp(self.view.cell * factor, MIN_CELL, MAX_CELL);
      var after = self._cellToPx(before.cx, before.cy);
      self.view.ox += self.pointer.x - after.x;
      self.view.oy += self.pointer.y - after.y;
      self._render();
    }, { passive: false });

    global.addEventListener('keydown', function (e) {
      if ((e.key === 'Delete' || e.key === 'Backspace') && self.selectedIid != null) {
        var inst = self.vehicle.byIid(self.selectedIid);
        self.vehicle.removeInstance(self.selectedIid);
        self.selectedIid = null;
        self._afterEdit(inst ? 'ลบ “' + inst.part.name + '”' : 'ลบชิ้นส่วน');
      }
    });

    global.addEventListener('resize', function () { self.resize(); self._recenter(); self._render(); });
  };

  Blueprint2D.prototype._hitTest = function (e) {
    var r = this.canvas.getBoundingClientRect();
    var px = e.clientX - r.left, py = e.clientY - r.top;
    var c = this._pxToCell(px, py);
    // topmost (last drawn) wins
    for (var i = this.vehicle.instances.length - 1; i >= 0; i--) {
      var inst = this.vehicle.instances[i];
      if (c.cx >= inst.gx && c.cx < inst.gx + inst.part.size.w &&
          c.cy >= inst.gy && c.cy < inst.gy + inst.part.size.h) {
        return inst;
      }
    }
    return null;
  };

  // ---------------------------------------------------------------------------
  //  Sizing
  // ---------------------------------------------------------------------------

  Blueprint2D.prototype.resize = function () {
    var cv = this.canvas;
    var w = cv.clientWidth || 640, h = cv.clientHeight || 420;
    cv.width = Math.round(w * this._dpr);
    cv.height = Math.round(h * this._dpr);
    this.ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
  };

  // ---------------------------------------------------------------------------
  //  Render
  // ---------------------------------------------------------------------------

  Blueprint2D.prototype._render = function () {
    if (this._raf) return;
    var self = this;
    this._raf = global.requestAnimationFrame(function () {
      self._raf = 0;
      self._paint();
    });
  };

  Blueprint2D.prototype._paint = function () {
    var ctx = this.ctx;
    var w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    var cell = this.view.cell;

    // blueprint ground
    ctx.fillStyle = '#0d1f3c';
    ctx.fillRect(0, 0, w, h);

    // grid
    ctx.lineWidth = 1;
    var startX = this.view.ox % cell, startY = this.view.oy % cell;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    for (var x = startX; x < w; x += cell) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (var y = startY; y < h; y += cell) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();

    // major axes through grid origin
    ctx.strokeStyle = 'rgba(120,180,255,0.28)';
    ctx.beginPath();
    ctx.moveTo(this.view.ox, 0); ctx.lineTo(this.view.ox, h);
    ctx.moveTo(0, this.view.oy); ctx.lineTo(w, this.view.oy);
    ctx.stroke();

    // pad line (grid y where the root part's bottom rests)
    var root = this.vehicle.byIid(this.vehicle.rootIid);
    if (root) {
      var padY = this._cellToPx(0, root.gy + root.part.size.h).y;
      ctx.strokeStyle = 'rgba(120,255,180,0.35)';
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(0, padY); ctx.lineTo(w, padY); ctx.stroke();
      ctx.setLineDash([]);
    }

    // placed parts
    this.vehicle.instances.forEach(function (inst) {
      this._drawPart(inst, inst.iid === this.selectedIid);
    }, this);

    // open attach nodes (snap targets) — only while carrying
    if (this.carry) {
      var open = this.vehicle.openNodes().filter(function (n) {
        return n.iid !== this.carry.fromIid;
      }, this);
      open.forEach(function (n) {
        var px = this._cellToPx(n.x, n.y);
        ctx.fillStyle = 'rgba(120,255,180,0.9)';
        ctx.beginPath(); ctx.arc(px.x, px.y, 5, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(120,255,180,0.35)';
        ctx.beginPath(); ctx.arc(px.x, px.y, 10, 0, 7); ctx.stroke();
      }, this);
    }

    // carry ghost
    if (this.carry) this._drawGhost();

    // CoM / CoP markers
    var stats = this.vehicle.computeStats();
    if (stats.partCount) {
      this._drawMarker(stats.com.x, stats.com.y, '#ffcf40', '◉', 'CoM');
      if (stats.refArea > 0) this._drawMarker(stats.cop.x, stats.cop.y, '#5bd6ff', '△', 'CoP');
    }
  };

  Blueprint2D.prototype._drawPart = function (inst, selected) {
    var ctx = this.ctx;
    var p = inst.part;
    var a = this._cellToPx(inst.gx, inst.gy);
    var wpx = p.size.w * this.view.cell, hpx = p.size.h * this.view.cell;
    var col = CATEGORY_COLOR[p.category] || '#888';

    ctx.fillStyle = hexA(col, 0.28);
    ctx.strokeStyle = selected ? '#fff' : hexA(col, 0.95);
    ctx.lineWidth = selected ? 2.5 : 1.5;
    roundRect(ctx, a.x + 3, a.y + 3, wpx - 6, hpx - 6, 6);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#eaf1ff';
    ctx.font = Math.min(wpx, hpx) * 0.4 + 'px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.icon, a.x + wpx / 2, a.y + hpx / 2 - 2);

    ctx.fillStyle = 'rgba(234,241,255,0.65)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(p.name, a.x + wpx / 2, a.y + hpx - 9);

    // node markers
    p.attachNodes.forEach(function (node) {
      var used = inst.links.some(function (lk) { return lk.node === node.id; });
      var px = this._cellToPx(inst.gx + node.dx, inst.gy + node.dy);
      ctx.fillStyle = used ? 'rgba(255,255,255,0.25)' : 'rgba(120,255,180,0.55)';
      ctx.beginPath(); ctx.arc(px.x, px.y, 3, 0, 7); ctx.fill();
    }, this);
  };

  Blueprint2D.prototype._drawGhost = function () {
    var ctx = this.ctx;
    var part = this.carry.part;
    var sol = this.hoverSolution;
    var gx, gy, ok;
    if (sol) { gx = sol.gx; gy = sol.gy; ok = true; }
    else {
      var c = this._pointerCell();
      gx = Math.round(c.cx - part.size.w / 2);
      gy = Math.round(c.cy - part.size.h / 2);
      ok = this.vehicle.instances.length === 0;
    }
    var a = this._cellToPx(gx, gy);
    var wpx = part.size.w * this.view.cell, hpx = part.size.h * this.view.cell;

    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = ok ? 'rgba(120,255,180,0.20)' : 'rgba(255,120,120,0.18)';
    ctx.strokeStyle = ok ? 'rgba(120,255,180,0.95)' : 'rgba(255,120,120,0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    roundRect(ctx, a.x + 3, a.y + 3, wpx - 6, hpx - 6, 6);
    ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#eaf1ff';
    ctx.font = Math.min(wpx, hpx) * 0.4 + 'px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(part.icon, a.x + wpx / 2, a.y + hpx / 2);
    ctx.restore();
  };

  Blueprint2D.prototype._drawMarker = function (cx, cy, color, glyph, label) {
    var ctx = this.ctx;
    var px = this._cellToPx(cx, cy);
    ctx.fillStyle = color;
    ctx.font = '16px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(glyph, px.x, px.y);
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillText(label, px.x + 16, px.y);
  };

  // ---------------------------------------------------------------------------
  //  Telemetry / change hook
  // ---------------------------------------------------------------------------

  Blueprint2D.prototype._emitChange = function () {
    var s = this.vehicle.computeStats();
    if (this.telemetryEl) this._renderTelemetry(s);
    if (this.statusEl && !this.carry) {
      this.statusEl.textContent = s.valid
        ? '✓ ยานพร้อมจำลอง — TWR ' + s.twr.toFixed(2)
        : (s.partCount === 0 ? 'ลากชิ้นส่วนจากด้านซ้ายมาวางบนกริด'
           : !s.connected ? '⚠ ชิ้นส่วนบางชิ้นไม่ได้ต่อกับยาน'
           : '⚠ ยังไม่มีแรงขับหรือแรงพยุง');
    }
    this.onChange(s);
  };

  Blueprint2D.prototype._renderTelemetry = function (s) {
    var rows = [
      ['ชิ้นส่วน', s.partCount],
      ['มวลรวม (เปียก)', fmtMass(s.totalMass)],
      ['— โครงแห้ง', fmtMass(s.dryMass)],
      ['— เชื้อเพลิง', fmtMass(s.propellantMass)],
      ['ราคา', '฿' + s.cost],
      ['แรงขับรวม', s.totalThrust.toFixed(1) + ' N'],
      ['แรงพยุงรวม', s.totalBuoyancy.toFixed(1) + ' N'],
      ['น้ำหนัก', s.weightN.toFixed(1) + ' N'],
      ['TWR', s.twr.toFixed(2)],
      ['เวลาเผาไหม้', s.burnTime.toFixed(0) + ' s'],
      ['Σ Cd·A', s.dragArea.toFixed(3) + ' m²'],
      ['CoM (x,y)', s.comM.x.toFixed(2) + ', ' + s.comM.y.toFixed(2) + ' m'],
      ['CoP (x,y)', s.refArea > 0 ? s.copM.x.toFixed(2) + ', ' + s.copM.y.toFixed(2) + ' m' : '—'],
      ['ระยะเสถียร', s.stabilityMarginM.toFixed(2) + ' m'],
      ['เสถียรภาพ', s.stable ? '✓ เสถียร' : '✗ ส่ายหัว'],
      ['ต่อกันครบ', s.connected ? '✓' : '✗']
    ];
    this.telemetryEl.innerHTML = '<dl class="bp-telem">' + rows.map(function (r) {
      return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>';
    }).join('') + '</dl>' +
      '<p class="bp-verdict ' + (s.valid ? 'ok' : 'no') + '">' +
      (s.valid ? 'พร้อมจำลองการบิน' : 'ยังประกอบไม่ครบ') + '</p>';
  };

  Blueprint2D.prototype._setStatus = function (msg) {
    if (this.statusEl) this.statusEl.textContent = msg;
  };

  // ---------------------------------------------------------------------------
  //  Public API
  // ---------------------------------------------------------------------------

  Blueprint2D.prototype.reset = function () {
    this.vehicle.clear();
    this.selectedIid = null;
    this.carry = null;
    this.hoverSolution = null;
    this._afterEdit('ล้างกริดแล้ว');
  };

  /** Swap the era: rebuild the parts rail and clear the grid (parts don't mix). */
  Blueprint2D.prototype.setEra = function (eraId) {
    if (!eraId || eraId === this.era) return;
    this.era = eraId;
    this._buildCatalog();
    this.reset();
  };

  Blueprint2D.prototype.zoom = function (dir) {
    this.view.cell = clamp(this.view.cell * (dir > 0 ? 1.15 : 1 / 1.15), MIN_CELL, MAX_CELL);
    this._render();
  };

  Blueprint2D.prototype.getStats = function () { return this.vehicle.computeStats(); };

  // ---------------------------------------------------------------------------
  //  small utils
  // ---------------------------------------------------------------------------

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function fmtMass(kg) {
    if (kg < 1) return (kg * 1000).toFixed(0) + ' g';
    if (kg < 1000) return kg.toFixed(1) + ' kg';
    return (kg / 1000).toFixed(2) + ' t';
  }
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  global.RS = global.RS || {};
  global.RS.Blueprint2D = Blueprint2D;

})(typeof window !== 'undefined' ? window : this);
