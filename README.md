# RocketScience — Legal Simulator 🚀⚖️

เกมการศึกษาแบบเว็บของ **Cool Uncle Lab** ที่สอนว่า *การมีเทคโนโลยียิงของขึ้นฟ้ายังไม่พอ*
คุณต้องผ่านกฎหมายการเดินอากาศ กฎจังหวัด ประกาศ NOTAM ไปจนถึงสนธิสัญญาอวกาศระหว่างประเทศด้วย

**เล่นออนไลน์:** https://dukperado-hue.github.io/RocketScience/
รวมอยู่ในหน้ารวมโปรเจกต์ที่ https://coolunclelab.com/lab.html

## ลูปหลักของเกม

```
เลือกภารกิจ → เลือกชนิดจรวด → ตั้งชื่อ → โรงประกอบ (VAB)
   → ขั้นตอนขออนุญาต (Legal Clearance) → ปล่อยจรวด → รายงานหลังบิน → ปลดล็อก Tier ถัดไป
```

## ระดับจรวด (Tiers)

| Tier | ตัวอย่าง | ฟิสิกส์ | กรอบกฎหมาย |
|------|----------|---------|-------------|
| 1 | โคมลอย, พลุ | ลมพัดเฉ แรงโน้มถ่วง แรงขับต่ำ | ข้อบัญญัติท้องถิ่น, พ.ร.บ.การเดินอากาศ (เขตปลอดภัย 9 กม.) |
| 2 | บั้งไฟ, ตะไล | วิถีเดายาก แรงขับไม่สม่ำเสมอ, spin-stabilization | ระเบียบจังหวัด, คณะทำงาน Sky Hazard |
| 3 | Sugar Rocket, จรวดหยั่งอากาศ | แรงต้านอากาศ, CP/CG, ครีบ | ข้อกำหนด CAAT, ปิดห้วงอากาศ, NOTAM |
| 4 | จรวดวิถีโค้ง, ขีปนาวุธ | วิถีกระสุน, staging, การกลับเข้าชั้นบรรยากาศ | ความมั่นคงแห่งชาติ, ห้วงอากาศหวงห้าม, ประเมินจุดตก |
| 5 | ดาวเทียมดวงเล็ก/ใหญ่ | กลศาสตร์วงโคจร, Δv, สมการ Tsiolkovsky | Outer Space Treaty 1967 (Art. VI), Liability Convention 1972, ITU |

## สถานะ

**Phase 1:** ลูปหลักครบ 8 ขั้น + เครื่องจำลองการปล่อย Canvas 2 มิติ (Tier 1–2)

**Phase 2 (ปัจจุบัน):** เล่นได้ครบ Tier 1–5
- **ฟิสิกส์ยกระดับ** (`physics.js`): หลายท่อน (staging / jettison dry mass), Specific Impulse (Isp) →
  อัตราการเผาไหม้ (Sutton), สมการจรวด Tsiolkovsky (Δv = ve·ln m0/mf) ตัดสิน "ถึงวงโคจรได้ไหม",
  กลศาสตร์วงโคจร (vis-viva), payload fraction, ความร้อนตอนกลับเข้าชั้นบรรยากาศ
- **เฟสปล่อย 3D ภาพยนตร์** (`launch3d.js`, Three.js r147): ระบบอนุภาคควัน+ไอพ่น (สีตามชนิดเชื้อเพลิง
  แข็ง/เหลว), EffectComposer (UnrealBloomPass + FilmPass), ไอพ่นเป็นแหล่งแสงไดนามิก,
  camera shake ตอนจุดระเบิด/Max-Q, กล้องสลับมุม Ground → Chase → Orbital ตามความสูง,
  แยกท่อนเห็นภาพ, โลกโค้งในมุมวงโคจร — fallback อัตโนมัติเป็น 2D ถ้า Three.js โหลดไม่ได้
- **VAB สำหรับ Tier 3–5:** จรวดมีท่อนสำเร็จ ผู้เล่นเลือกเพย์โหลด (มวลจริงกิน Δv) + อัปเกรด แล้วดู
  Δv budget เทียบ Δv ที่ต้องใช้ ก่อนปล่อย
- **มินิเกมกฎหมายอวกาศ:** Outer Space Treaty 1967 Art. VI (รัฐรับรอง), Liability Convention 1972,
  ITU, แผนขยะอวกาศ

**Phase 3 (ปัจจุบัน):** HUD ขั้นสูง + ฟิสิกส์เฉพาะถิ่น + ตัวละครเล่าเรื่อง
- **Advanced Flight HUD** (`js/ui.js` → `window.FlightHUD`): แถบล่างจอสไตล์ Spaceflight Simulator —
  ซ้าย = มาตรวัดความเร็ว (m/s), ขวา = ความสูง (m/km) + แถบเชื้อเพลิงไดนามิก,
  กลาง = ปุ่ม Pitch/Yaw คุม gravity turn + ปุ่ม STAGE สลัดท่อน; คีย์บอร์ด W/S/A/D + Space
- **ฟิสิกส์เฉพาะถิ่น** (`physics.js`):
  - Tier 1 โคมลอย — อุณหพลศาสตร์กระดาษสา: ดินขับแรง/หนักเกิน → ความร้อนต่อมวลโครงเกิน
    จุดวาบไฟ ~233°C (Fahrenheit 451) → โคมไหม้กลางอากาศ
  - Tier 2 บั้งไฟ — ดินปืนเกินปริมาตรปลอก → ความดันเกินกำลังวัสดุ → ระเบิดคาแท่น (CATO);
    ดินปืนมาก → CG เลื่อนไปท้ายจนหลัง CP → static instability (coning) เสียความสูง
  - Tier 4 — guidance / thrust-termination: ตัดเครื่องเมื่อ projected apogee ถึงเป้า
    (แก้จรวดพุ่งเลยเป้าจนตกกลับด้วยความเร็วเกินขอบเขตความร้อน)
- **"ลี" (Lee)** (`js/narrative.js` → `window.Narrative`): แมวสยามสไตล์โยไค หัวหน้าวิศวกร &
  ที่ปรึกษากฎหมาย — บทสนทนาพิมพ์ดีดแบบ RPG ก่อน/หลังภารกิจ อธิบาย "ทำไม" ด้วยทฤษฎีจริง
  (Newton F=ma, Tsiolkovsky, q̇∝ρv³, TWR) ผูกกับข้อกฎหมายที่เกี่ยวข้อง

**Phase 4 (ถัดไป):** วงโคจรค้างฟ้า (GEO transfer), rendezvous, การกู้ท่อนกลับมาใช้ซ้ำ, เศรษฐศาสตร์ของภารกิจ

## โครงสร้างไฟล์

```
index.html          หน้าเดียว (single-page) ทุกหน้าจอเป็น <section> สลับด้วย JS
css/style.css        โทเคนธีม Cool Uncle Lab (light/dark/horror) + สำเนียงอาร์เคด + UI พิมพ์เขียว VAB
js/data.js           TIERS, ROCKETS (10 ชนิด), MISSIONS, PARTS
js/law.js            LegalFramework (ครบ 5 tier) + checkClearance()
js/physics.js        เครื่องจำลองการบิน: Tier 1–4 บูรณาการแรงจริง / Tier 5 orbital ใช้ Δv budget + วิถีสคริปต์
                     + ฟิสิกส์เฉพาะถิ่น Tier 1–2, guidance cutoff Tier 4, control API (pitch/yaw/stage)
js/ui.js             FlightHUD — แถบ HUD ล่างจอ + ปุ่มควบคุม + คีย์บอร์ด (Phase 3)
js/narrative.js      "ลี" — บทสนทนาพิมพ์ดีด + เนื้อหาทฤษฎี/กฎหมายต่อสถานการณ์ (Phase 3)
js/launch2d.js       ตัวเรนเดอร์ Canvas 2 มิติ (fallback)
js/launch3d.js       ตัวเรนเดอร์ Three.js ภาพยนตร์ (ค่าเริ่มต้น)
js/main.js           สเตตแมชชีน, VAB (2 โหมด), โมดัลกฎหมาย + มินิเกม, คิดคะแนนตาม tier, ปลดล็อก (localStorage)
vendor/three/        Three.js r147 UMD + postprocessing (EffectComposer / UnrealBloomPass / FilmPass)
```

## รันในเครื่อง

เปิด `index.html` ตรง ๆ ได้เลย (สคริปต์เป็น global ไม่ใช่ ES module) หรือ
`python -m http.server` แล้วเปิด `http://localhost:8000`

---
สร้างด้วย Claude · Cool Uncle Lab 2026
