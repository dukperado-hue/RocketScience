/* =============================================================================
 * FROM FIRE TO ORBIT — Render layer
 * js/render/PartArt.js  ·  storybook silhouettes for parts (Reboot Phase 25)
 *
 * One job: draw a RECOGNISABLE little picture of a part into a box on a 2D
 * canvas — a glowing paper envelope, a candle cell, a bamboo hoop, a rocket
 * motor with a nozzle, a bamboo tail stick, a firework shell…  Used by the
 * left catalog rail (thumbnails) AND the blueprint canvas, so that a stack of
 * parts reads as an actual โคมลอย / บั้งไฟ instead of coloured blocks.
 *
 * RS.render.PartArt.draw(ctx, part, x, y, w, h, opts?)
 *   opts: { ghost?:bool, selected?:bool, alpha?:number }
 *
 * Pure canvas 2D. No physics, no DOM. Degrades safely — an unknown part just
 * gets a tidy category-coloured capsule.
 * ===========================================================================*/
(function (global) {
  'use strict';
  var RS = global.RS = global.RS || {};
  RS.render = RS.render || {};
  var TAU = Math.PI * 2;

  var INK = {
    Structural: '#6b4c2c', Propulsion: '#7a2f1c',
    Aerodynamics: '#255a78', Payload: '#356b3a'
  };
  var FILL = {
    Structural: '#c79a6a', Propulsion: '#e0765a',
    Aerodynamics: '#63b6e0', Payload: '#7fc27e'
  };

  function lerp(a, b, t) { return a + (b - a) * t; }

  // ------------------------------------------------------------- shape helpers
  function tube(ctx, x, y, w, h, fill, ink, rings) {
    var r = Math.min(w, h) * 0.16;
    rr(ctx, x, y, w, h, r);
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, w * 0.05); ctx.stroke();
    if (rings) {
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = Math.max(1, w * 0.04);
      for (var i = 1; i <= rings; i++) {
        var yy = y + h * (i / (rings + 1));
        ctx.beginPath(); ctx.moveTo(x + w * 0.06, yy); ctx.lineTo(x + w * 0.94, yy); ctx.stroke();
      }
    }
  }
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function flame(ctx, cx, baseY, s) {
    var g = ctx.createLinearGradient(0, baseY, 0, baseY - s * 2.4);
    g.addColorStop(0, 'rgba(255,180,60,0.95)');
    g.addColorStop(0.55, 'rgba(255,120,40,0.7)');
    g.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.55, baseY);
    ctx.quadraticCurveTo(cx - s * 0.35, baseY - s * 1.6, cx, baseY - s * 2.4);
    ctx.quadraticCurveTo(cx + s * 0.35, baseY - s * 1.6, cx + s * 0.55, baseY);
    ctx.quadraticCurveTo(cx, baseY + s * 0.35, cx - s * 0.55, baseY);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,250,220,0.9)';
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.24, baseY);
    ctx.quadraticCurveTo(cx, baseY - s * 1.3, cx + s * 0.24, baseY);
    ctx.closePath(); ctx.fill();
  }

  // --------------------------------------------------------------- part shapes
  var SHAPES = {
    envelope: function (ctx, x, y, w, h, _e, o) {
      var dim = !!(o && o.dim);   // wax spent — cooled, dull paper, no flame
      var cx = x + w / 2, topY = y + h * 0.03, mouthY = y + h * 0.92, mw = w * 0.30;
      function paper() {
        ctx.beginPath();
        ctx.moveTo(cx, topY);
        ctx.bezierCurveTo(x + w * 1.00, y + h * 0.14, x + w * 0.92, y + h * 0.60, cx + mw, mouthY);
        ctx.quadraticCurveTo(cx, mouthY + h * 0.045, cx - mw, mouthY);
        ctx.bezierCurveTo(x + w * 0.08, y + h * 0.60, x, y + h * 0.14, cx, topY);
        ctx.closePath();
      }
      paper();
      var g = ctx.createLinearGradient(0, topY, 0, mouthY);
      if (dim) { g.addColorStop(0, '#dccbaa'); g.addColorStop(0.5, '#c7ad86'); g.addColorStop(1, '#a88c65'); }
      else     { g.addColorStop(0, '#fff0c9'); g.addColorStop(0.45, '#ffc879'); g.addColorStop(1, '#ff9a4e'); }
      ctx.fillStyle = g; ctx.fill();
      // inner light pool — a clean radial, no shadowBlur grey-bleed
      if (!dim) {
        ctx.save(); paper(); ctx.clip();
        var lp = ctx.createRadialGradient(cx, mouthY - h * 0.14, 0, cx, mouthY - h * 0.14, h * 0.64);
        lp.addColorStop(0, 'rgba(255,247,214,0.92)');
        lp.addColorStop(0.5, 'rgba(255,209,130,0.34)');
        lp.addColorStop(1, 'rgba(255,180,90,0)');
        ctx.fillStyle = lp; ctx.fillRect(x, y, w, h);
        ctx.restore();
      }
      // vertical paper-panel seams following the curve
      ctx.strokeStyle = dim ? 'rgba(120,95,60,0.35)' : 'rgba(180,110,55,0.42)';
      ctx.lineWidth = Math.max(1, w * 0.022);
      for (var k = -2; k <= 2; k++) {
        ctx.beginPath();
        ctx.moveTo(cx + k * w * 0.085, topY + h * 0.04);
        ctx.quadraticCurveTo(cx + k * w * 0.30, y + h * 0.44, cx + k * mw * 0.72, mouthY);
        ctx.stroke();
      }
      // paper edge
      ctx.strokeStyle = dim ? 'rgba(110,88,55,0.7)' : 'rgba(150,88,40,0.72)';
      ctx.lineWidth = Math.max(1, w * 0.02);
      paper(); ctx.stroke();
      // bamboo mouth ring
      ctx.strokeStyle = '#9a6a34'; ctx.lineWidth = Math.max(1.5, w * 0.05);
      ctx.beginPath();
      ctx.moveTo(cx - mw, mouthY);
      ctx.quadraticCurveTo(cx, mouthY + h * 0.045, cx + mw, mouthY);
      ctx.stroke();
      if (!dim) flame(ctx, cx, mouthY + h * 0.02, w * 0.12);
    },
    fuelcell: function (ctx, x, y, w, h, _e, o) {
      var dim = !!(o && o.dim);
      var cw = w * 0.44, cx = x + w / 2;
      tube(ctx, cx - cw / 2, y + h * 0.30, cw, h * 0.6, '#e7d3a6', '#7a5a2c', 2);
      // wax drips
      ctx.fillStyle = 'rgba(255,240,210,0.8)';
      ctx.beginPath(); ctx.arc(cx - cw * 0.3, y + h * 0.42, w * 0.03, 0, TAU); ctx.fill();
      if (!dim) flame(ctx, cx, y + h * 0.30, w * 0.16);
    },
    hoop: function (ctx, x, y, w, h) {
      var cx = x + w / 2, cy = y + h * 0.52;
      ctx.strokeStyle = '#a9803f'; ctx.lineWidth = Math.max(2, w * 0.08);
      ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.40, h * 0.20, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(110,76,44,0.7)'; ctx.lineWidth = Math.max(1, w * 0.04);
      ctx.beginPath(); ctx.moveTo(cx - w * 0.4, cy); ctx.lineTo(cx + w * 0.4, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - h * 0.2); ctx.lineTo(cx, cy + h * 0.2); ctx.stroke();
    },
    tag: function (ctx, x, y, w, h) {
      var cx = x + w / 2;
      ctx.strokeStyle = 'rgba(90,60,35,0.7)'; ctx.lineWidth = Math.max(1, w * 0.03);
      ctx.beginPath(); ctx.moveTo(cx, y + h * 0.1); ctx.lineTo(cx, y + h * 0.34); ctx.stroke();
      rr(ctx, cx - w * 0.2, y + h * 0.34, w * 0.4, h * 0.5, w * 0.05);
      ctx.fillStyle = '#fff2d8'; ctx.fill();
      ctx.strokeStyle = 'rgba(170,40,40,0.55)'; ctx.lineWidth = Math.max(1, w * 0.03); ctx.stroke();
      ctx.strokeStyle = 'rgba(170,40,40,0.35)';
      for (var i = 1; i <= 3; i++) {
        var yy = y + h * (0.34 + 0.11 * i);
        ctx.beginPath(); ctx.moveTo(cx - w * 0.12, yy); ctx.lineTo(cx + w * 0.12, yy); ctx.stroke();
      }
    },
    nose: function (ctx, x, y, w, h) {
      var cx = x + w / 2;
      ctx.beginPath();
      ctx.moveTo(cx, y + h * 0.06);
      ctx.quadraticCurveTo(x + w * 0.9, y + h * 0.55, x + w * 0.82, y + h * 0.92);
      ctx.lineTo(x + w * 0.18, y + h * 0.92);
      ctx.quadraticCurveTo(x + w * 0.1, y + h * 0.55, cx, y + h * 0.06);
      ctx.closePath();
      ctx.fillStyle = '#d7dee8'; ctx.fill();
      ctx.strokeStyle = '#33506f'; ctx.lineWidth = Math.max(1, w * 0.045); ctx.stroke();
    },
    body: function (ctx, x, y, w, h) {
      tube(ctx, x + w * 0.24, y + h * 0.05, w * 0.52, h * 0.9, '#d9c2a0', '#6b4c2c', 3);
    },
    motor: function (ctx, x, y, w, h, engine) {
      var bw = w * 0.5, cx = x + w / 2;
      tube(ctx, cx - bw / 2, y + h * 0.05, bw, h * 0.62, '#c98a5e', '#5a2f1c', 1);
      // nozzle
      ctx.beginPath();
      ctx.moveTo(cx - bw * 0.42, y + h * 0.67);
      ctx.lineTo(cx - bw * 0.62, y + h * 0.95);
      ctx.lineTo(cx + bw * 0.62, y + h * 0.95);
      ctx.lineTo(cx + bw * 0.42, y + h * 0.67);
      ctx.closePath();
      ctx.fillStyle = '#8a4a2e'; ctx.fill();
      ctx.strokeStyle = '#4a2418'; ctx.lineWidth = Math.max(1, w * 0.04); ctx.stroke();
      if (engine) {
        ctx.fillStyle = 'rgba(90,47,28,0.9)';
        ctx.beginPath(); ctx.moveTo(cx - bw / 2, y + h * 0.2);
        ctx.lineTo(cx - bw * 1.0, y + h * 0.62); ctx.lineTo(cx - bw / 2, y + h * 0.62);
        ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx + bw / 2, y + h * 0.2);
        ctx.lineTo(cx + bw * 1.0, y + h * 0.62); ctx.lineTo(cx + bw / 2, y + h * 0.62);
        ctx.closePath(); ctx.fill();
      }
    },
    tailstick: function (ctx, x, y, w, h) {
      var cx = x + w / 2, tw = Math.max(2, w * 0.12);
      rr(ctx, cx - tw / 2, y + h * 0.03, tw, h * 0.94, tw * 0.5);
      ctx.fillStyle = '#b98d55'; ctx.fill();
      ctx.strokeStyle = '#6b4c2c'; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = 'rgba(60,42,24,0.75)';
      for (var i = 1; i <= 4; i++) {
        var yy = y + h * (0.12 + 0.2 * i);
        ctx.beginPath(); ctx.moveTo(cx - tw * 1.6, yy); ctx.lineTo(cx + tw * 1.6, yy); ctx.stroke();
      }
    },
    fin: function (ctx, x, y, w, h) {
      ctx.beginPath();
      ctx.moveTo(x + w * 0.3, y + h * 0.08);
      ctx.lineTo(x + w * 0.3, y + h * 0.92);
      ctx.lineTo(x + w * 0.92, y + h * 0.92);
      ctx.closePath();
      ctx.fillStyle = FILL.Aerodynamics; ctx.fill();
      ctx.strokeStyle = INK.Aerodynamics; ctx.lineWidth = Math.max(1, w * 0.05); ctx.stroke();
    },
    howot: function (ctx, x, y, w, h) {
      ctx.fillStyle = '#cdb98c'; ctx.strokeStyle = '#6b4c2c';
      ctx.lineWidth = Math.max(1, w * 0.04);
      for (var i = 0; i < 4; i++) {
        var bx = x + w * (0.2 + i * 0.16);
        rr(ctx, bx, y + h * (0.12 + (i % 2) * 0.08), w * 0.12, h * 0.72, w * 0.05);
        ctx.fill(); ctx.stroke();
      }
    },
    fwshell: function (ctx, x, y, w, h) {
      var cx = x + w / 2, cy = y + h * 0.56, r = Math.min(w, h) * 0.34;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU);
      var g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
      g.addColorStop(0, '#8a5fd0'); g.addColorStop(1, '#3a2570');
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = '#241452'; ctx.lineWidth = Math.max(1, w * 0.04); ctx.stroke();
      ctx.strokeStyle = '#caa24a'; ctx.lineWidth = Math.max(1, w * 0.05);
      ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.quadraticCurveTo(cx + r * 0.8, cy - r * 1.4, cx + r * 1.1, cy - r * 1.7);
      ctx.stroke();
    },
    fwtube: function (ctx, x, y, w, h) {
      tube(ctx, x + w * 0.3, y + h * 0.06, w * 0.4, h * 0.9, '#7a5230', '#3d2a18', 2);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(x + w / 2, y + h * 0.1, w * 0.18, h * 0.05, 0, 0, TAU); ctx.fill();
    },
    capsule: function (ctx, x, y, w, h) {
      var cx = x + w / 2;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.28, y + h * 0.6);
      ctx.quadraticCurveTo(cx, y + h * 0.02, x + w * 0.72, y + h * 0.6);
      ctx.lineTo(x + w * 0.78, y + h * 0.86);
      ctx.lineTo(x + w * 0.22, y + h * 0.86);
      ctx.closePath();
      ctx.fillStyle = '#c7d0dc'; ctx.fill();
      ctx.strokeStyle = '#3a4a5e'; ctx.lineWidth = Math.max(1, w * 0.045); ctx.stroke();
    },
    bell: function (ctx, x, y, w, h) {
      var cx = x + w / 2;
      tube(ctx, cx - w * 0.2, y + h * 0.05, w * 0.4, h * 0.4, '#b9c2cd', '#3a4a5e', 0);
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.18, y + h * 0.45);
      ctx.quadraticCurveTo(cx - w * 0.5, y + h * 0.8, cx - w * 0.42, y + h * 0.95);
      ctx.lineTo(cx + w * 0.42, y + h * 0.95);
      ctx.quadraticCurveTo(cx + w * 0.5, y + h * 0.8, cx + w * 0.18, y + h * 0.45);
      ctx.closePath();
      ctx.fillStyle = '#8f9aa8'; ctx.fill();
      ctx.strokeStyle = '#3a4a5e'; ctx.lineWidth = Math.max(1, w * 0.04); ctx.stroke();
    },
    band: function (ctx, x, y, w, h) {
      rr(ctx, x + w * 0.12, y + h * 0.34, w * 0.76, h * 0.32, h * 0.1);
      ctx.fillStyle = '#d8a24a'; ctx.fill();
      ctx.strokeStyle = '#7a5410'; ctx.lineWidth = Math.max(1, w * 0.04); ctx.stroke();
    }
  };

  function pick(part) {
    var id = part.id || '', c = part.category;
    if (/cover_|envelope|_paper/.test(id)) return 'envelope';
    if (/fuel_|_wax|_cell/.test(id)) return 'fuelcell';
    if (id === 'frame_bamboo') return 'hoop';
    if (/tailstick|_stick/.test(id)) return 'tailstick';
    if (/payload_tag|_tag/.test(id)) return 'tag';
    if (/howot/.test(id)) return 'howot';
    if (/nose|_ogive|v2_nose/.test(id)) return 'nose';
    if (/v2_tank|body_|_tube|orb_tank/.test(id)) return 'body';
    if (/v2_engine|_engine/.test(id)) return 'bell';
    if (/orb_engine/.test(id)) return 'bell';
    if (/motor_|propulsion_mue/.test(id)) return 'motor';
    if (/fw_shell|_shell|_peony|_burst/.test(id)) return 'fwshell';
    if (/fw_mortar|_mortar|fw_lift|_charge|fw_tube/.test(id)) return 'fwtube';
    if (/orb_payload|_capsule|_sat/.test(id)) return 'capsule';
    if (/decoupler|_ring|_interstage/.test(id)) return 'band';
    if (/fin/.test(id)) return 'fin';
    // by category
    if (c === 'Aerodynamics') return 'fin';
    if (c === 'Propulsion') return 'motor';
    if (c === 'Payload') return 'capsule';
    return 'body';
  }

  function draw(ctx, part, x, y, w, h, opts) {
    if (!ctx || !part) return;
    opts = opts || {};
    ctx.save();
    ctx.globalAlpha = (opts.alpha != null ? opts.alpha : 1) * (opts.ghost ? 0.75 : 1);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // inset a touch so strokes stay inside the cell
    var pad = Math.min(w, h) * 0.08;
    x += pad; y += pad; w -= pad * 2; h -= pad * 2;
    var kind = pick(part);
    var fn = SHAPES[kind] || SHAPES.body;
    try { fn(ctx, x, y, w, h, kind === 'bell', opts); }
    catch (e) { /* never let art break the builder */ }
    if (opts.selected) {
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5;
      ctx.strokeRect(x - pad * 0.5, y - pad * 0.5, w + pad, h + pad);
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  RS.render.PartArt = { draw: draw, kindOf: pick };
})(typeof window !== 'undefined' ? window : this);
