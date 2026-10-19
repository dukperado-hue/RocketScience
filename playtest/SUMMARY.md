# Playtest summary — Early Access (v0.22.2 `softlaunch`) — ฉบับชั่วคราว (4 จาก 5 persona)

> **ยังไม่ครบ:** persona `sci-student` ถูกหยุดกลางคันก่อนเขียนรายงาน (ไม่มี `playtest/reports/sci-student.md`; มี screenshot 31 ภาพใน `playtest/runs/sci-student/`) จึง **ยังไม่มีผลตรวจฟิสิกส์เชิงลึก / tooltip Lanna Manual / ความลึกของ Prof. Owl จากมุมนักเรียนวิทย์** ตารางนี้สรุปจาก 4 รายงาน: first-jobber, arts-student, nasa-engineer, cool-uncle

## คะแนน
| persona | อุปกรณ์ | เล่นไปถึง | เวลา | คะแนน |
|---|---|---|---|---|
| first-jobber | mobile | M1, M2 (M2.5 ไม่ได้เล่น); ทดสอบ newtab + private mode | ~7 นาที | 6/10 |
| arts-student | desktop | M1, M2, M2.5 + การ์ดจบ Early Access (ทำตาม Hint ล้วน ๆ ไม่คำนวณ) | ~9 นาที | 7/10 |
| nasa-engineer | desktop | Sandbox, LV-45 ข้าม Kármán 4 เที่ยว (ไม่ได้เล่น Campaign M1–M2.5) | ~10 นาที | 7/10 |
| cool-uncle | mobile + desktop | เก้าอี้ Up! (Sandbox) + LV-45 จนชน | ~20 นาที | 7/10 |

## ตารางปัญหา (เรียงตามจำนวน persona ที่เจอซ้ำ แล้วตามความรุนแรง)
ความรุนแรง: **เลิกเล่น** (เสี่ยงเลิกใน 5 นาทีแรก) · **ติด** · **รำคาญ** · **จุกจิก**

| # | ปัญหา | persona ที่เจอ | ความรุนแรง | หลักฐาน (screenshot ใน `playtest/runs/…`) | แนวทางแก้ |
|---|---|---|---|---|---|
| 1 | **ทางเข้าเกมไม่บอกว่าต้องทำอะไร** หลัง "Start building"/ดูคลิปตำนาน Factory เป็นกริดว่าง; M1 อธิบายอยู่แค่แท็บ Missions; รายการชิ้นส่วนยาว ~4,300 px บนมือถือ blueprint และปุ่ม "Roll out to the pad" อยู่ไกลสุดหน้า | first-jobber, arts-student, cool-uncle | **เลิกเล่น (เสี่ยง)** — cool-uncle "เกือบเลิกตอนเจอหน้า Factory ว่าง ๆ" | first-jobber/002-mobile-factory, 003-mobile-missions · arts-student/003-desktop-legend2 · cool-uncle/003-mobile-legend2 | หลังปิดการ์ดเปิดเกม พาไป/ไฮไลต์ Missions + ปุ่ม "เริ่มด้วยโคมลอย" ที่โหลด Khom loi ให้เลย; ปุ่ม Roll out ลอยติดล่างจอ; มือถือทำรายการชิ้นส่วนเป็น bottom sheet แทนหน้ายาว |
| 2 | **หน้า Launch: การ์ดทับตัวควบคุม** CAPCOM/เรดาร์/Capybara บังปุ่มเลือกจุดปล่อยและสไลเดอร์ Wind (ซึ่ง M2 ต้องปรับ); การ์ดสถานะมุมซ้ายบนซ้อนกันบน desktop; popup สรุปทับแผงข้อมูลบนมือถือ | first-jobber, arts-student, cool-uncle | **ติด** | first-jobber/006-mobile-launch, 024-mobile-launch3, 026-mobile-m2sum · arts-student/006-desktop-pad, 023-desktop-pad2 · cool-uncle/008-mobile-launch, 018-mobile-fly8 | จัดชั้น/ตำแหน่งใหม่บนมือถือ; การ์ด CAPCOM/เรดาร์ย่อหรือแตะปิดได้; แก้การ์ดสถานะที่ซ้อนกัน |
| 3 | **ผ่านภารกิจแล้วไม่มีสัญญาณบนจอ** M1 ไม่มีการ์ดสรุป (`summaryOpen` เป็น false) เห็นแค่บรรทัดใน Flight Log; การ์ดจบ Early Access มาตอนจรวดตก (~T+704 s) ทั้งที่ข้าม 100 km ที่ T+83; บนมือถือไม่เห็น Flight Log/แบนเนอร์ violation/milestone Capybara | first-jobber, arts-student, cool-uncle | **รำคาญ** (ผู้เล่นไม่รู้ว่าผ่านแล้ว) | first-jobber/009-mobile-m1done, 031-mobile-m2done · arts-student/007-desktop-flight, 040-desktop-end5 · cool-uncle/012-mobile-fly2 เทียบ 032-desktop-d4 | แบนเนอร์/การ์ด "ภารกิจสำเร็จ" ทันทีที่ objective ครบ พร้อมปุ่มไปต่อ; แสดง milestone บนมือถือ; ให้จบเที่ยวบินได้เมื่อ M2.5 สำเร็จ |
| 4 | **ต้องรอนาน ไม่มีทางข้าม** บินเก้าอี้ Up! ที่ 10× ยังกิน ~6 นาทีจริง ที่ 1× ค้างที่ 0 m ~40 s; ขาลงจาก 300+ km นาน และเกมปิด warp เอง; รอจรวดตกก่อนเห็นการ์ดจบ | cool-uncle, nasa-engineer, arts-student | **รำคาญ** | cool-uncle/032-desktop-d4 (log T+1170 s) · nasa-engineer/014-desktop-impact2 · arts-student/040-desktop-end5 | ปุ่ม "ข้ามไปจบ/ช็อตเด่น"; warp เริ่มที่ 4× หรือ auto-warp ช่วงรอ; ไม่ปิด warp เองถ้าไม่จำเป็น |
| 5 | **ข้อความล็อก "Craft … powder first" ไม่บอกทาง** Mixing bench ซ่อนพับท้ายรายการยาว; Sandbox banner บอก "ปลดล็อกทุกอย่าง" แต่ Tier 1 ยังเทา; เก้าอี้ Up! ล็อก "Mission 1" โดยไม่บอกว่ามี Sandbox | first-jobber, arts-student, nasa-engineer, cool-uncle | **ติด** (1–2 นาที ไม่ถึง 5) | first-jobber/015-mobile-mix · arts-student/011-desktop-bf2, 013-desktop-bench · nasa-engineer/005-desktop-lv45 · cool-uncle/005-mobile-sandbox | ทำให้ข้อความล็อกเป็นปุ่มพาไป Mixing bench; แก้ข้อความ Sandbox ให้ตรงกับของที่ยังล็อก; ใส่คำใบ้ Sandbox ที่ป้ายล็อก |
| 6 | **ปุ่มควบคุมการบินบนมือถือล้นจอ/เล็ก** "Chute"/"Hold" ซ้อน, "Assist:" ถูกตัด, ปุ่ม 1×–10×, Map, Cam, เสียง, ↺ อยู่นอกจอ ต้องเลื่อนแถบโดยไม่มีสัญลักษณ์; ปุ่มกว้าง ~36 px; ไม่มีคีย์ R บนมือถือ | first-jobber, cool-uncle | **ติด** | first-jobber/006-mobile-launch, 007-mobile-flight · cool-uncle/008-mobile-launch, 012-mobile-fly2 | แบ่ง 2 แถว/เมนู; ปุ่มอย่างน้อย 44 px; ให้ Warp + Retry + เสียงเห็นในจอแรก |
| 7 | **CAPCOM ไม่ตรงเวลาเมื่อใช้ time-warp / ข้อความไม่ตรงเหตุการณ์** "Tower clear" ที่ T+17.5 ทั้งที่พ้นรางที่ T+0.8; คำแปลบอก 331 m ขณะจอ 683 m; Tortoise Clerk พูดถึง "this zombie" ทั้งที่ไม่มี payload | nasa-engineer, cool-uncle | **รำคาญ** | nasa-engineer (log) · cool-uncle/015-mobile-fly5, 035-desktop-d7 | ปล่อยบรรทัด CAPCOM ตามเวลาเกม ไม่ใช่เวลาจริง; ใส่เงื่อนไข "มี payload" ให้ข้อความของเสมียน |
| 8 | **ศัพท์ฟิสิกส์ไม่มีคำอธิบาย + คำเตือน pre-flight ขัดกับ blueprint ที่เกมแนะนำ** SAS, weathercocking, CoP/CoM; "will tumble" ขึ้นบน LV-45 แบบสำเร็จรูปและจรวดก็ตีลังกาจริง; "Add fins low down" ทั้งที่มีครีบแล้ว; ไม่มีตัวชี้ CoP บนกริด | arts-student, nasa-engineer | **รำคาญ** | arts-student/032-desktop-snd, 035-desktop-up2 · nasa-engineer/005-desktop-lv45 | ไอคอน "?" อธิบายสั้น ๆ ไทย/อังกฤษ; ซ่อนหรือปรับคำเตือนบนพรีเซ็ต; แสดง CoP บนกริด |
| 9 | **ข้อความ/ค่าที่สอนผิดหรือไม่สมเหตุผล (จาก nasa-engineer เท่านั้น — ยังไม่ได้ตรวจซ้ำ)** "Re-entry plasma … blackout" ที่ ~1.7 km/s; ปุ่ม "Auto-turn" เรียก gravity turn แต่เป็น pitch 1°/s; ร่ม 5.4 kg ชะลอจรวด ~6 t; Mach 6.95 ที่ 157 km; throttle 100% หลังดับเครื่อง; skin temp ค้าง 294 °C หลังชน; OST ผูกกับ 100 km | nasa-engineer | **รำคาญ** (ความถูกต้อง/ความเชื่อถือ) | nasa-engineer/011-desktop-reentry, 033-desktop-gt, 036-desktop-chute1, 009-desktop-burnout, 014-desktop-impact2 | ตรวจแต่ละข้อกับเจ้าของเกม (หลายข้อรายงานเองว่า "ควรตรวจสอบ"); แก้ข้อความ/ชื่อปุ่มก่อน เพราะแก้ถูกและไม่แตะ physics |
| 10 | **ไม่มีทางแชร์** ไม่มีปุ่มแชร์/บันทึกภาพ/คลิป/ลิงก์ในหน้า Landed/Crashed; ภาพที่แคปไปแชร์ไม่มีคำเตือนติดไป | cool-uncle | **รำคาญ** (พลาดโอกาสเผยแพร่) | cool-uncle/007-mobile-built, 036-desktop-d8 | การ์ดภาพสรุป + Web Share API พร้อมโลโก้ชื่อเกมและ disclaimer เล็ก ๆ |
| 11 | **ตัวหนังสือเล็ก** ป้ายค่าส่วนใหญ่ 11 px (บางจุด 10.5 px); desktop มีข้อความต่ำกว่า 12 px 87 จุด | cool-uncle | **รำคาญ** | cool-uncle/008-mobile-launch (วัดด้วย eval) | ขั้นต่ำ ~14 px หรือตัวเลือกขนาดตัวอักษร |
| 12 | **Space ไม่จุดชนวนหลังลากสไลเดอร์ใน Launch site** (โฟกัสค้างที่สไลเดอร์) ต้องคลิกปุ่ม IGNITION | arts-student | **ติด** (~0.5 นาที) ยังไม่ยืนยันว่าเป็นบั๊กเกมจริงหรือเฉพาะ harness | arts-student/025-desktop-burn, 026-desktop-after | blur สไลเดอร์หลังปล่อย หรือให้ Space ทำงานแม้โฟกัสสไลเดอร์ |
| 13 | **ป้ายปุ่มเริ่มใหม่ไม่ตรงกัน** มือถือ "Fly again", desktop "บินอีกครั้ง / Retry Flight / R" — **สมมติฐานของเรา:** Retry จะแสดงเฉพาะเมื่อเข้าด้วยปุ่ม "Roll out to the pad"; ถ้าเข้าด้วยแท็บ "Launch" จะไม่มี snapshot จึงเห็น "Fly again" (ยังไม่ได้ยืนยัน) | cool-uncle (nasa-engineer ก็เห็นป้ายไทยเด่นกว่า UI อื่น) | **จุกจิก** (อาจเป็นช่องโหว่ของ Quick Retry) | cool-uncle/018-mobile-fly8 เทียบ 034-desktop-d6 | ทดสอบเส้นทาง "แท็บ Launch → บิน → Retry"; ถ้าไม่มีปุ่ม ให้ใช้ design ที่ launch ล่าสุดเป็น snapshot |
| 14 | **UX วางครีบใน Factory** tap จาก palette ติดกลางลำ (ไม่ใช่ท้ายลำ); ชิ้นที่ overlap ไม่ถูกไฮไลต์ | nasa-engineer | **รำคาญ** (ติดราว 3 นาที) | nasa-engineer/018-desktop-fins, 024-desktop-d1 | auto-attach ครีบที่ท้ายลำ; ไฮไลต์ชิ้นที่ overlap |
| 15 | Flight Log เป็นอังกฤษล้วน ยาวและถี่เมื่อ warp 10× (ผู้เล่นศิลป์ข้าม) | arts-student | **จุกจิก** | arts-student/007-desktop-flight | ใส่ไทยหรือสรุปเหตุการณ์สำคัญ |
| 16 | ป้าย private-mode ทับโลโก้และไม่หายภายใน ≥4 วินาที | first-jobber | **จุกจิก** | first-jobber/032-mobile-priv1, 033-mobile-priv2 | วางป้ายไม่ให้ทับโลโก้ + ปุ่มปิด |
| 17 | ฉากชนบนมือถือเป็นหมอกน้ำตาลเบลอ (เห็นครั้งเดียว อาจเป็นเฟรมที่จับ) | cool-uncle | **จุกจิก** (ต้องยืนยัน) | cool-uncle/027-mobile-crash3 เทียบ 036-desktop-d8 | ทดซ้ำบนมือถือ |
| 18 | รายละเอียด Parachute ขึ้นข้อความเครื่องยนต์ "Engines are bought, not built"; "New crater" 2 รายการจากการชนเดียว | nasa-engineer | **จุกจิก** | nasa-engineer/035-desktop-chute, 014-desktop-impact2 | แก้ข้อความ; ตรวจว่า crater คู่ตั้งใจหรือไม่ |

## สิ่งที่ทำงานดี (หลายคนเห็นตรงกัน)
- **ตัวละคร มุกซอมบี้แปลภาษา และวัฒนธรรมไทย** ถูกชมจากทั้ง 4 persona (ศาลพระภูมิ, บั้งไฟเป็นงานบุญ, พ.ศ., Story log ไทย); disclaimer สองภาษาอ่านชัดและไม่ดุเกินไป
- **Hint บนการ์ด Mission** ทำให้คนไม่ถนัดวิทย์ผ่าน M1–M2.5 ได้ภายใน ~9 นาทีโดยไม่คำนวณ (arts-student)
- **Quick Retry** (first-jobber): กดแล้วกลับแท่นทันที จรวด/ราง/ลมเดิม ไม่มีของเก่าค้าง; R กลางเที่ยวบินใช้ได้ และนับ attempt (`retryAttempt` 2→3)
- **Audio unlock** `not-created` → `running` ตั้งแต่แตะแรก; **save** อยู่ครบหลัง `newtab`; **private mode** ไม่พัง มีป้ายสองภาษา ไม่มี console error; โหลด ~0.5–1.5 วินาที (localhost)
- **กลไกฟิสิกส์ที่ nasa-engineer ชม:** ballistic coast ตรงกับ √(2gΔh), pre-flight "CoP เหนือ CoM → tumble" เห็นผลจริง, ศัพท์ Max-Q/apogee/LOS/go-for-launch ใช้ถูกบริบท, ข้อความล็อก Tier 2 และสวิตช์ Sandbox ชัดเจน

## ข้อจำกัดของผลนี้ (อ่านก่อนเชื่อ)
- **ยังไม่ครบ 5 persona** (ดูด้านบน) และทุกคนเล่น ~7–20 นาที ไม่ถึง 25 นาที เพราะใช้ warp 10×
- **ไม่ได้ทดสอบ:** iPhone Safari จริง, เสียงดังจริง (headless ฟังไม่ได้ — วัดได้แค่สถานะ AudioContext), เครือข่ายช้า (โหลดวัดบน localhost), ว่าป้าย private mode ขึ้นซ้ำหลัง newtab, M2.5 จริงใน Campaign โดย first-jobber/nasa-engineer
- **cool-uncle** เล่นใน Sandbox จึงไม่ได้เห็น `events` (analytics ไม่ทำงานใน Sandbox — เป็นพฤติกรรมที่คาดไว้ ไม่ใช่บั๊ก) และไม่ได้ลอง M1 จริง
- ข้อ 9 มาจาก persona เดียวและหลายข้อมีคำว่า "ควรตรวจสอบ" ในรายงานต้นทาง **ยังไม่ได้ตรวจกับโค้ด/ผู้ออกแบบ**
- บางอาการที่ persona เจอเป็นข้อจำกัดของ harness (เช่น `tap "text=IGNITION"` ชนข้อความใน log) — ไม่นับเป็นปัญหาผู้เล่นจริง
- ตรวจแล้วว่ารายงานทั้ง 4 ไม่มีร่องรอยการอ่าน source/`__rs` (ค้นข้อความ `src/`, `.ts`, `__rs`) แต่กติกานี้เป็นแค่คำสั่งในพรอมต์ ไม่ได้บังคับด้วยเครื่องมือ

## ลำดับที่แนะนำ (ยังไม่แก้โค้ดตามคำสั่ง)
1. **5 นาทีแรก:** ข้อ 1 (ทางเข้า/ปุ่มเริ่มด้วยโคมลอย) + ข้อ 6 และ 2 (เลย์เอาต์มือถือ) — ตัวที่ทำให้เลิกเล่นหรือติดบ่อยที่สุด
2. ข้อ 3 (สัญญาณผ่านภารกิจ) และ ข้อ 5 (ลิงก์ไป Mixing bench) — ทำง่าย ผลสูง
3. ข้อ 9 และ 8 — ข้อความที่ไม่แตะ physics/balance; ให้ตรวจก่อนแก้
4. ข้อ 13 — ตรวจว่า Quick Retry ใช้ได้จากแท็บ Launch หรือไม่ (เป็นผลของงาน Sprint A)
