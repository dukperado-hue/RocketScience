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

**Phase 1 (ปัจจุบัน):** ลูปหลักครบทั้ง 8 ขั้น + เครื่องจำลองการปล่อยแบบ Canvas 2 มิติ สำหรับ Tier 1–2
เล่นได้จริง (Tier 3–5 มีข้อมูลครบแต่ยังล็อก)

**Phase 2 (ถัดไป):** เปลี่ยนเฟสปล่อยเป็น Three.js — particle ควัน/ไอพ่นตามชนิดจรวด, EffectComposer (Bloom / Film Grain),
แสงไดนามิกจากไอพ่น, camera shake ตอนจุดระเบิดและ Max-Q, กล้องสลับมุม ground → chase → orbital;
เปิด Tier 3–5, staging, การกลับเข้าชั้นบรรยากาศ, กลศาสตร์วงโคจร

## โครงสร้างไฟล์

```
index.html          หน้าเดียว (single-page) ทุกหน้าจอเป็น <section> สลับด้วย JS
css/style.css        โทเคนธีม Cool Uncle Lab (light/dark/horror) + สำเนียงอาร์เคด + UI พิมพ์เขียว VAB
js/data.js           TIERS, ROCKETS (10 ชนิด), MISSIONS, PARTS
js/law.js            LegalFramework (ครบ 5 tier) + checkClearance()
js/physics.js        เครื่องจำลองการบิน 2 มิติ
js/launch2d.js       ตัวเรนเดอร์ Canvas + HUD (Altitude / Velocity / Dynamic Pressure)
js/main.js           สเตตแมชชีน, drag-and-drop VAB, โมดัลกฎหมาย, คิดคะแนน, ปลดล็อก (localStorage)
vendor/              ว่างใน Phase 1 (Three.js จะมาลงที่นี่ใน Phase 2)
```

## รันในเครื่อง

เปิด `index.html` ตรง ๆ ได้เลย (สคริปต์เป็น global ไม่ใช่ ES module) หรือ
`python -m http.server` แล้วเปิด `http://localhost:8000`

---
สร้างด้วย Claude · Cool Uncle Lab 2026
