#!/usr/bin/env node
/*
 * scripts/fetch_models.js — ดาวน์โหลดโมเดล .glb ฟรี ปลอดลิขสิทธิ์ จาก NASA-3D-Resources
 *   (github.com/nasa/NASA-3D-Resources — public domain / usage-free)
 *   ลงในโฟลเดอร์ assets/models/ ตามชื่อที่ js/modelManager.js (MODEL_FOR) คาดหวัง
 *
 * ใช้งาน:
 *   node scripts/fetch_models.js           # ดาวน์โหลดไฟล์ที่ยังไม่มี
 *   node scripts/fetch_models.js --force    # ดาวน์โหลดทับของเดิม
 *   node scripts/fetch_models.js --list     # แค่แสดงรายการ ไม่ดาวน์โหลด
 *
 * ไม่ต้องติดตั้ง dependency ใด ๆ (ใช้โมดูล https/fs ในตัว Node)
 */
"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");

const RAW = "https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/";
const OUT_DIR = path.resolve(__dirname, "..", "assets", "models");
const MAX_MB = 12;

// local filename  ->  path ใน NASA-3D-Resources (ยังไม่ encode) + คำอธิบาย
const MODELS = {
  "cubesat.glb":         { src: "3D Models/CubeSat - 2 RU Generic/CubeSat - 2 RU Generic.glb", note: "CubeSat 2U generic" },
  "cubesat_cluster.glb": { src: "3D Models/CubeSat - 1 RU Generic/CubeSat - 1 RU Generic.glb", note: "CubeSat 1U (ใช้แทนคลัสเตอร์)" },
  "capsule.glb":         { src: "3D Models/Gemini/Gemini.glb",                                  note: "แคปซูลลูกเรือ Gemini" },
  "comsat.glb":          { src: "3D Models/Tracking and Data Relay Satellites (TDRS) (A)/Tracking and Data Relay Satellites (TDRS) (A).glb", note: "ดาวเทียมสื่อสาร TDRS" },
  "comsat_geo.glb":      { src: "3D Models/Geostationary Operational Environmental Satellites/Geostationary Operational Environmental Satellites.glb", note: "ดาวเทียมค้างฟ้า GOES" },
  "probe.glb":           { src: "3D Models/Voyager Probe (A)/Voyager Probe (A).glb",           note: "ยานสำรวจอวกาศ Voyager" },
  "bennu.glb":           { src: "3D Models/1999 RQ36 asteroid/1999 RQ36 asteroid.glb",        note: "ดาวเคราะห์น้อยเบนนู (101955 Bennu / 1999 RQ36)" }
};

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const LIST_ONLY = args.includes("--list");

function encodeUrl(p) {
  return RAW + p.split("/").map(encodeURIComponent).join("/");
}

function download(url, dest, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "RocketScience-fetch-models" } }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) return reject(new Error("too many redirects"));
        const next = new URL(res.headers.location, url).toString();
        return resolve(download(next, dest, redirectsLeft - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error("HTTP " + res.statusCode));
      }
      const len = parseInt(res.headers["content-length"] || "0", 10);
      if (len && len > MAX_MB * 1024 * 1024) {
        res.resume();
        return reject(new Error(`ไฟล์ใหญ่เกิน ${MAX_MB} MB (${(len / 1048576).toFixed(1)} MB)`));
      }
      const tmp = dest + ".part";
      const out = fs.createWriteStream(tmp);
      res.pipe(out);
      out.on("finish", () => out.close(() => {
        const buf = fs.readFileSync(tmp, { encoding: null }).slice(0, 4).toString("ascii");
        if (buf !== "glTF") { fs.unlinkSync(tmp); return reject(new Error("ไม่ใช่ไฟล์ .glb (binary glTF)")); }
        fs.renameSync(tmp, dest);
        resolve(fs.statSync(dest).size);
      }));
      out.on("error", err => { fs.existsSync(tmp) && fs.unlinkSync(tmp); reject(err); });
    });
    req.on("error", reject);
    req.setTimeout(30000, () => req.destroy(new Error("timeout")));
  });
}

(async function main() {
  if (LIST_ONLY) {
    console.log("โมเดลที่จะดาวน์โหลด (NASA-3D-Resources, public domain):\n");
    for (const [name, m] of Object.entries(MODELS)) {
      console.log(`  ${name.padEnd(22)} <- ${m.note}\n  ${" ".repeat(22)}    ${encodeUrl(m.src)}\n`);
    }
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  let ok = 0, skip = 0, fail = 0;

  for (const [name, m] of Object.entries(MODELS)) {
    const dest = path.join(OUT_DIR, name);
    if (fs.existsSync(dest) && !FORCE) {
      console.log(`•  ${name}  — มีอยู่แล้ว (ข้าม; ใช้ --force เพื่อทับ)`);
      skip++;
      continue;
    }
    process.stdout.write(`↓  ${name}  <- ${m.note} ... `);
    try {
      const size = await download(encodeUrl(m.src), dest);
      console.log(`สำเร็จ (${(size / 1024).toFixed(0)} KB)`);
      ok++;
    } catch (e) {
      console.log(`ล้มเหลว: ${e.message}`);
      fail++;
    }
  }

  console.log(`\nเสร็จ: ${ok} ดาวน์โหลด, ${skip} ข้าม, ${fail} ล้มเหลว  ->  ${OUT_DIR}`);
  if (fail) process.exitCode = 1;
})();
