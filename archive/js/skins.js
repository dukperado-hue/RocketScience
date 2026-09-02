// js/skins.js — Phase 11 · ลายข้างบั้งไฟ / โคม (Decorative Skins)
//
//   หลังเลือกชนิดจรวด + เชื้อเพลิงแล้ว ผู้เล่นเลือก "ลาย" มาแปะข้างลำจาก catalog
//   ลายพื้นฐานปลดล็อกอยู่แล้ว · ลายพิเศษปลดล็อกจาก mission (Skins.unlockFromFlight)
//
//   window.Skins.render(hostEl, family, onChange)   family = "bangfai" | "khom"
//   window.Skins.derived(family)                    -> { id, th, locked }
//   window.Skins.texture(THREE, id)                 -> THREE.CanvasTexture (สร้างใหม่ทุกครั้ง — ผู้เรียก dispose เอง)
//   window.Skins.state                              -> { bangfai, khom }
//   window.Skins.unlock(id) / unlockFromFlight(ctx) / reset()

(function () {
  "use strict";

  // ---------- catalog: ลายวาดด้วย canvas (unwrapped ผิวทรงกระบอก) ----------
  //   draw(x, W, H)  — x = 2d context, ผืนผ้าใบขนาด W×H
  //   repX / repY    — จำนวนรอบที่ texture วนรอบลำ / ตามยาว
  const CATALOG = [
    {
      id: "plain", th: "ไม้ไผ่เปลือย", en: "Bare", families: ["bangfai", "khom"],
      free: true, repX: 1, repY: 3,
      desc: "ลำเปล่า ไม่ตกแต่ง — เบาที่สุด",
      draw(x, W, H) {
        x.fillStyle = "#b98f57"; x.fillRect(0, 0, W, H);
        x.strokeStyle = "rgba(90,66,38,.5)"; x.lineWidth = 3;
        for (let i = 0; i < 4; i++) { const y = H * (i + 0.5) / 4; x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke(); }
        for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(${120 + Math.random() * 40},${90 + Math.random() * 30},${55},${.12 + Math.random() * .12})`; x.fillRect(Math.random() * W, Math.random() * H, 2, 6); }
      }
    },
    {
      id: "lai_thai", th: "ลายไทยทอง", en: "Gilded Lai Thai", families: ["bangfai", "khom"],
      free: true, repX: 4, repY: 1,
      desc: "ลายกนกทองบนพื้นชาด — บั้งไฟเอ้งานบุญ",
      draw(x, W, H) {
        x.fillStyle = "#8f1d1d"; x.fillRect(0, 0, W, H);
        // ขอบกนกบน-ล่าง
        const band = h0 => { x.fillStyle = "#e7b53c"; x.fillRect(0, h0, W, H * 0.12); x.fillStyle = "#8f1d1d"; for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(W * (i + .5) / 6, h0 + H * 0.06, W * 0.06, 0, 7); x.fill(); } };
        band(0); band(H - H * 0.12);
        // เปลวกนกกลางลำ
        x.strokeStyle = "#e7b53c"; x.lineWidth = 6; x.lineCap = "round";
        for (let i = 0; i < 3; i++) {
          const cx = W * (i + .5) / 3;
          x.beginPath(); x.moveTo(cx, H * 0.82);
          x.bezierCurveTo(cx - W * .12, H * .6, cx + W * .1, H * .4, cx, H * .18);
          x.stroke();
          x.beginPath(); x.moveTo(cx, H * .5); x.quadraticCurveTo(cx + W * .1, H * .42, cx + W * .06, H * .3); x.stroke();
        }
      }
    },
    {
      id: "phi_ta_khon", th: "ผีตาโขน", en: "Phi Ta Khon", families: ["bangfai", "khom"],
      repX: 3, repY: 1,
      desc: "หน้ากากผีตาโขน ดานสัย เลย — งานบุญหลวงคู่บั้งไฟ",
      draw(x, W, H) {
        const cols = ["#c0392b", "#1f8a70", "#e0a80d"];
        for (let p = 0; p < 3; p++) {
          const x0 = W * p / 3, w = W / 3;
          x.fillStyle = cols[p]; x.fillRect(x0, 0, w, H);
          // หมวก (กระบวยกระโจม)
          x.fillStyle = "#f2ead6";
          x.beginPath(); x.moveTo(x0 + w * .5, H * .04); x.lineTo(x0 + w * .18, H * .3); x.lineTo(x0 + w * .82, H * .3); x.closePath(); x.fill();
          // ใบหน้ายาว
          x.beginPath(); x.ellipse(x0 + w * .5, H * .58, w * .34, H * .3, 0, 0, 7); x.fill();
          // ตากลมโต
          x.fillStyle = "#111"; [-.15, .15].forEach(d => { x.beginPath(); x.arc(x0 + w * (.5 + d), H * .5, w * .09, 0, 7); x.fill(); });
          x.fillStyle = "#fff"; [-.15, .15].forEach(d => { x.beginPath(); x.arc(x0 + w * (.5 + d) + 3, H * .49, w * .03, 0, 7); x.fill(); });
          // จมูกยาวงอน
          x.strokeStyle = cols[p]; x.lineWidth = w * .11; x.lineCap = "round";
          x.beginPath(); x.moveTo(x0 + w * .5, H * .55); x.quadraticCurveTo(x0 + w * .5, H * .74, x0 + w * .72, H * .68); x.stroke();
          // ปากยิ้มฟันเลื่อย
          x.strokeStyle = "#111"; x.lineWidth = 4;
          x.beginPath(); x.moveTo(x0 + w * .32, H * .78); x.quadraticCurveTo(x0 + w * .5, H * .86, x0 + w * .68, H * .78); x.stroke();
          x.fillStyle = "#fff";
          for (let t = 0; t < 5; t++) x.fillRect(x0 + w * (.34 + t * .08), H * .78, w * .04, H * .03);
        }
      }
    },
    {
      id: "naga", th: "นาคเลื้อย", en: "Coiling Naga", families: ["bangfai"],
      repX: 1, repY: 2,
      desc: "พญานาคพันลำ ขอฝนจากบาดาล",
      draw(x, W, H) {
        x.fillStyle = "#0f3d2e"; x.fillRect(0, 0, W, H);
        // ลำตัวนาคพันเฉียง
        x.lineWidth = W * .16; x.lineCap = "round";
        const grad = x.createLinearGradient(0, 0, W, H); grad.addColorStop(0, "#2e9e6b"); grad.addColorStop(1, "#d7b84a");
        x.strokeStyle = grad;
        x.beginPath(); x.moveTo(-W * .1, H * 1.05);
        x.bezierCurveTo(W * .5, H * .8, W * .1, H * .4, W * .7, H * .18);
        x.bezierCurveTo(W * 1.0, H * .05, W * 1.1, H * -.1, W * 1.2, H * -.2);
        x.stroke();
        // เกล็ด
        x.strokeStyle = "rgba(0,0,0,.25)"; x.lineWidth = 3;
        for (let t = 0; t <= 1; t += .045) {
          const px = -W * .1 + (W * 1.3) * t, py = H * 1.05 - H * 1.25 * Math.pow(t, .8);
          x.beginPath(); x.arc(px, py, W * .05, 0.6, 2.5); x.stroke();
        }
        // หัวนาค
        x.fillStyle = "#d7b84a";
        x.beginPath(); x.ellipse(W * .78, H * .12, W * .12, H * .07, -.5, 0, 7); x.fill();
        x.fillStyle = "#111"; x.beginPath(); x.arc(W * .82, H * .1, 5, 0, 7); x.fill();
      }
    },
    {
      id: "kranok_fai", th: "กนกเปลวไฟ", en: "Flame Kranok", families: ["bangfai"],
      repX: 5, repY: 1,
      desc: "เปลวกนกพวยพุ่งขึ้น สื่อแรงขับ",
      draw(x, W, H) {
        x.fillStyle = "#15100c"; x.fillRect(0, 0, W, H);
        for (let i = 0; i < 5; i++) {
          const cx = W * (i + .5) / 5;
          const g = x.createLinearGradient(0, H, 0, 0);
          g.addColorStop(0, "#7a1500"); g.addColorStop(.5, "#ff6a00"); g.addColorStop(1, "#ffd23b");
          x.fillStyle = g;
          x.beginPath();
          x.moveTo(cx - W * .07, H);
          x.bezierCurveTo(cx - W * .12, H * .55, cx + W * .1, H * .5, cx, H * .05);
          x.bezierCurveTo(cx - W * .04, H * .5, cx + W * .12, H * .58, cx + W * .07, H);
          x.closePath(); x.fill();
          x.strokeStyle = "#ffe9a8"; x.lineWidth = 2; x.stroke();
        }
      }
    },
    {
      id: "phaya_thaen", th: "พญาแถน", en: "Phaya Thaen", families: ["bangfai", "khom"],
      repX: 1, repY: 1,
      desc: "เทพเจ้าแห่งฟ้าฝน — ลายจักรวาลทองบนคราม",
      draw(x, W, H) {
        const g = x.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, "#0b1a4a"); g.addColorStop(1, "#1e2f6b");
        x.fillStyle = g; x.fillRect(0, 0, W, H);
        // ดวงตะวันเทพกลางลำ
        x.fillStyle = "#e7b53c";
        x.beginPath(); x.arc(W * .5, H * .5, W * .16, 0, 7); x.fill();
        for (let i = 0; i < 16; i++) {
          const a = i / 16 * Math.PI * 2;
          x.save(); x.translate(W * .5, H * .5); x.rotate(a);
          x.beginPath(); x.moveTo(W * .2, 0); x.lineTo(W * .34, -6); x.lineTo(W * .34, 6); x.closePath(); x.fill();
          x.restore();
        }
        // ดาว+ เมฆขมวด
        x.fillStyle = "rgba(231,181,60,.9)";
        for (let i = 0; i < 40; i++) { const s = 1 + Math.random() * 2.5; x.fillRect(Math.random() * W, Math.random() * H, s, s); }
        x.strokeStyle = "rgba(231,181,60,.5)"; x.lineWidth = 3;
        for (let i = 0; i < 5; i++) { const cy = H * (i + .5) / 5; x.beginPath(); x.arc(W * (.15 + (i % 2) * .7), cy, W * .09, .3, 3.2); x.stroke(); }
      }
    },
    // ---------- ตำนานผี (photo pack) — คอลเลกชันเปิดกว้าง จะทยอยเพิ่มทีหลังแบบ gacha ----------
    {
      id: "gh_pilot", th: "ผีนักบิน", en: "Ghost Pilot", families: ["bangfai", "khom"],
      free: true, photo: true, img: "assets/skins/pilot_ghost.jpg",
      desc: "ตำนานผีนักบินที่ยังห่วงน่านฟ้า — คอลเลกชันตำนานผี #1"
    },
    {
      id: "gh_jar", th: "ผีสาวในไหปลาร้า", en: "Jar Ghost", families: ["bangfai", "khom"],
      free: true, photo: true, img: "assets/skins/jar_ghost.jpg",
      desc: "ตำนานผีพื้นบ้านชื่อดัง — คอลเลกชันตำนานผี #2"
    },
    {
      id: "gh_granny", th: "ยายวรนาฎ", en: "Grandma Woranat", families: ["bangfai", "khom"],
      free: true, photo: true, img: "assets/skins/granny_ghost.jpg",
      desc: "ผู้เฒ่าผู้แก่คอยเฝ้าดูแลงานบุญ — คอลเลกชันตำนานผี #3"
    },
    {
      id: "gh_oni", th: "โอนิ", en: "Oni", families: ["bangfai", "khom"],
      free: true, photo: true, img: "assets/skins/oni.jpg",
      desc: "ยักษ์แห่งตำนานญี่ปุ่น — คอลเลกชันตำนานผี #4"
    }
  ];

  // ---------- photo pack: โหลดรูปจริงล่วงหน้า + วาดแบบ cover-fit ----------
  const imgCache = new Map();
  function getImg(url) {
    let e = imgCache.get(url);
    if (!e) { e = { img: new Image(), redraw: [] }; e.img.src = url; imgCache.set(url, e); }
    return e;
  }
  // เริ่มโหลดทันทีตอนสคริปต์ทำงาน ให้พร้อมก่อนผู้เล่นถึงหน้า VAB
  CATALOG.filter(s => s.photo).forEach(s => getImg(s.img));

  function drawCover(x, img, W, H) {
    const ir = img.naturalWidth / img.naturalHeight, tr = W / H;
    let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
    if (ir > tr) { sw = sh * tr; sx = (img.naturalWidth - sw) / 2; }
    else { sh = sw / tr; sy = (img.naturalHeight - sh) / 2; }
    x.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
  }
  function drawPhoto(x, s, W, H, onLoaded) {
    x.fillStyle = "#20242c"; x.fillRect(0, 0, W, H);
    const e = getImg(s.img);
    if (e.img.complete && e.img.naturalWidth > 0) { drawCover(x, e.img, W, H); return; }
    if (!onLoaded) return;
    e.redraw.push(onLoaded);
    e.img.addEventListener("load", () => {
      const cbs = e.redraw.splice(0); cbs.forEach(fn => { try { fn(); } catch (er) {} });
    }, { once: true });
  }

  const KEY = "rocketscience-skins";
  const DEFAULT_UNLOCKED = CATALOG.filter(s => s.free).map(s => s.id);
  let unlocked = new Set(DEFAULT_UNLOCKED);
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (Array.isArray(raw)) raw.forEach(id => unlocked.add(id));
  } catch (e) {}
  function persist() { try { localStorage.setItem(KEY, JSON.stringify([...unlocked])); } catch (e) {} }

  const state = { bangfai: "lai_thai", khom: "plain" };
  let _onChange = null;

  const byId = id => CATALOG.find(s => s.id === id) || CATALOG[0];
  const isUnlocked = id => unlocked.has(id);
  function forFamily(fam) { return CATALOG.filter(s => s.families.indexOf(fam) > -1); }

  function derived(fam) {
    let id = state[fam] || "plain";
    if (!isUnlocked(id)) id = "plain";
    const s = byId(id);
    return { id, th: s.th, en: s.en, locked: !isUnlocked(id) };
  }

  // ---------- texture ----------
  function texture(THREE, id) {
    const s = byId(id);
    const W = 256, H = 512;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d");
    const tex = new THREE.CanvasTexture(c);
    if (s.photo) {
      drawPhoto(x, s, W, H, () => { tex.needsUpdate = true; });
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.repeat.set(1, 1);
    } else {
      try { s.draw(x, W, H); } catch (e) { console.warn("[Skins] draw", id, e); x.fillStyle = "#b98f57"; x.fillRect(0, 0, W, H); }
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(s.repX || 1, s.repY || 1);
    }
    tex.anisotropy = 4;
    if (THREE.sRGBEncoding != null) tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  // ---------- VAB panel ----------
  function render(host, fam, onChange) {
    _onChange = onChange || _onChange;
    if (!host) return;
    fam = fam || "bangfai";
    host.hidden = false;
    const list = forFamily(fam);
    let cur = state[fam];
    if (!isUnlocked(cur)) cur = state[fam] = "plain";
    host.innerHTML = `
      <div class="vx-title">ลายข้างลำ <span class="vx-tag">CATALOG</span></div>
      <p class="vx-note" style="margin-top:-2px">แต้มบั้งไฟเอ้ตามงานบุญ — ลายพิเศษปลดล็อกจากภารกิจ</p>
      <div class="skin-grid">
        ${list.map(s => {
          const on = s.id === cur, lk = !isUnlocked(s.id);
          return `<button type="button" class="skin-sw${on ? " on" : ""}${lk ? " locked" : ""}" data-skin="${s.id}" ${lk ? "disabled" : ""}>
            <span class="skin-chip" data-chip="${s.id}"></span>
            <span class="skin-th">${s.th}${lk ? " 🔒" : ""}</span>
            <small>${lk ? "ยังไม่ปลดล็อก" : s.desc}</small>
          </button>`;
        }).join("")}
      </div>`;
    // วาดตัวอย่างลายลงชิป
    host.querySelectorAll("[data-chip]").forEach(el => {
      const s = byId(el.dataset.chip);
      const cc = document.createElement("canvas"); cc.width = 40; cc.height = 40;
      const cx = cc.getContext("2d");
      if (s.photo) drawPhoto(cx, s, 40, 40, () => { el.style.backgroundImage = `url(${cc.toDataURL()})`; });
      else { try { s.draw(cx, 40, 40); } catch (e) {} }
      el.style.backgroundImage = `url(${cc.toDataURL()})`;
    });
    host.querySelectorAll("[data-skin]").forEach(b => b.addEventListener("click", () => {
      if (b.disabled) return;
      state[fam] = b.dataset.skin;
      render(host, fam);
      notify();
    }));
  }
  function notify() { if (_onChange) { try { _onChange(); } catch (e) { console.warn("[Skins] onChange", e); } } }

  // ---------- unlock ----------
  function unlock(id) {
    if (!byId(id) || unlocked.has(id)) return false;
    unlocked.add(id); persist();
    return true;
  }
  // ปลดล็อกจากผลการบิน (ให้ main.js เรียกใน showReport) — คืน array ของลายที่เพิ่งปลดล็อก
  function unlockFromFlight(ctx) {
    ctx = ctx || {};
    const got = [];
    const m = ctx.mission || {}, sum = ctx.summary || {}, r = ctx.rocket || {};
    const pass = !!ctx.missionPassed;
    if (r.id === "bangfai" && pass && unlock("phi_ta_khon")) got.push(byId("phi_ta_khon"));
    if (m.id === "m3_rocketfest" && pass && unlock("naga")) got.push(byId("naga"));
    if ((ctx.totalScore || 0) >= 20000 && unlock("kranok_fai")) got.push(byId("kranok_fai"));
    if ((sum.apogee || 0) >= 1500 && r.id === "bangfai" && unlock("phaya_thaen")) got.push(byId("phaya_thaen"));
    return got;
  }
  function reset() { unlocked = new Set(DEFAULT_UNLOCKED); persist(); state.bangfai = "lai_thai"; state.khom = "plain"; }

  window.Skins = {
    render, derived, texture, state, unlock, unlockFromFlight, reset,
    CATALOG, isUnlocked, forFamily,
    count: () => ({ have: unlocked.size, total: CATALOG.length })
  };
})();
