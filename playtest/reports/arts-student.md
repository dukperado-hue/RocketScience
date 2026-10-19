# Playtest report — arts-student (พลอย ม.5 สายศิลป์) · desktop · 2569-10-19

Build: v0.22.2 (`softlaunch`) · Session folder: `playtest/runs/arts-student/`
เล่นไป ~9 นาที (minutesPlayed ~8.4) จบครบ M1, M2, M2.5 และเจอการ์ด End of Early Access (ผ่านเร็วเพราะทำตาม Hint ทุกข้อ)

## 5 นาทีแรก
- เปิดมามีการ์ดเรื่อง Wan Hu ปุ่ม "Watch the legend (10 s)" กับ "Start building" ภาพสัตว์ (แมว เป็ด คาปิบารา นาก) น่ารักมาก ตกใจว่าเกมนี้คือ "ซอมบี้ + จรวด" ขำตั้งแต่ภาพแรก (`playtest/runs/arts-student/001-desktop-first.png`) กดดูตำนาน เป็นคลิปสั้น ๆ ภาพสวย มีปุ่ม Skip (`002-desktop-legend.png`)
- หลังคลิปเข้า Factory เป็นตารางกริดว่าง ๆ มีรายการชิ้นส่วนยาวมาก ถ้าไม่มีใครบอก ไม่รู้จะทำอะไร (`003-desktop-legend2.png`) มีแถบ "Tier 0 unlocked / Next: Mission 1" เล็ก ๆ ดูเหมือนข้อความมากกว่าปุ่ม
- ไปที่ Missions เจอการ์ด Mission 1 มีเป้าหมาย 3 ข้อ + **Hint ที่ใช้ได้เลย** ("Khom loi blueprint · Haad Rin · wind from 015° · permit box ว่าง · เร่งเวลา 10×") มีภาษาไทยกำกับทุกบรรทัด (`004-desktop-missions.png`) ตรงนี้ดีมาก ทำตามได้โดยไม่ต้องรู้อะไรเลย
- กด "Build it in the Factory" -> แตะแบบสำเร็จรูป Khom loi -> โคมโผล่ทันที พรีไฟลต์ขึ้น "Ready to roll out" -> Roll out -> Space -> เร่ง 10× ภายในประมาณ 1 นาที M1 สำเร็จ ไม่ต้องคำนวณอะไรเลย (`007-desktop-flight.png`) ค่าเริ่มต้น (ลม, สถานที่) ถูกตั้งให้แล้ว
- สรุป: ถ้าอ่าน Hint ใน Missions ผ่านสบาย แต่ **เกมไม่ได้พาไปหน้า Missions** หลังคลิป ต้องไปเจอเอง

## จุดที่งง
- หลังดูตำนานจบ ไม่มีอะไรบอกว่า "ไปกดแท็บ Missions ก่อน" หน้า Factory ว่างเปล่า (`003-desktop-legend2.png`)
- **M2 ต้องผสมดินปืนก่อน** บลูพรินต์ "Bang Fai, twin tails" เป็นสีเทากดไม่ได้ เขียนว่า "Craft slow powder first" (`011-desktop-bf2.png`) **ไม่บอกว่าไปคราฟต์ที่ไหน** โต๊ะ "Mixing bench" ซ่อนอยู่ล่างสุดของรายการชิ้นส่วนที่ยาวมาก และพับอยู่ ต้องเลื่อนลงไปหาเอง (`013-desktop-bench.png`) ผ่านได้เพราะเลื่อนเจอ (ผมใช้ scrollIntoView ผ่าน harness ช่วยเลื่อน คนจริงต้องใช้ล้อเมาส์)
- ในโต๊ะผสม ปุ่ม Ox / Fu / Mo / Bi / In กับ Oxidiser / Moderator / Binder ไม่รู้ว่าคืออะไร (`014-desktop-bench2.png`) แต่เกมช่วยดี: เลือก Ox+Fu ขึ้น "That makes fast powder", เพิ่ม Mo ขึ้น "slow powder" และบอกว่าจะปลดล็อก Bang Fai tube (`018-desktop-mo.png`) ผ่านได้แบบเดาแล้วเกมยืนยัน
- ผมสั่ง `tap "text=Fuel"` แล้วมันไปกดโดนชิ้นส่วน "Wax fuel cell" ในรายการ ติดลงบนโคมแทนปุ่ม Fu (`016-desktop-fu.png`) (ข้อจำกัดการเลือกด้วยข้อความ แต่ก็บอกว่าคนจริงอาจกดพลาดได้ถ้าชื่อซ้ำ) แก้ด้วย Undo
- Hint ของ M2 ใช้คำว่า "weathercocking", "ramp angle 0°", "twin-tail blueprint" ไม่อธิบาย (ไทยก็ทับศัพท์) แต่ทำตามตัวอักษรก็ผ่าน
- แผงลอยบนหน้า Launch สำหรับ M2: ต้องลากแถบ Ramp angle กับ Wind ไป 0 ตาม Hint ไม่มีบอกว่าลากอย่างไร แต่ค่อนข้างตรงไปตรงมา (`023-desktop-pad2.png`, `024-desktop-set.png`)
- คำเตือนพรีไฟลต์: "Centre of pressure is 35 cm above the centre of mass — it will tumble..." (`022-desktop-twin.png`) และบนจรวด M2.5 ขึ้น 100 cm ทั้งที่เป็นแบบสำเร็จรูปที่มีครีบ (`032-desktop-snd.png`) คนไม่ถนัดวิทย์ไม่รู้ว่าต้องแก้ไหม และจรวด M2.5 ตีลังกาจริง แต่ก็ยังผ่านภารกิจได้ (`035-desktop-up2.png`)
- ปุ่ม SAS, Hold, RCS, Auto-turn, Assist ไม่มีคำอธิบาย (M2.5 Hint บอกให้เปิด SAS (T) แต่ตอน roll out มันติดสว่างอยู่แล้ว `033-desktop-pad3.png`)
- ตัวเลขอย่าง "strength x4283.02", "Isp 85 s", "Δv", "Thrust ÷ weight" ไม่เข้าใจ แต่ไม่จำเป็นต้องเข้าใจเพื่อผ่าน

## จุดที่ติด (นานกี่นาที)
| จุด | ติดนาน (นาที) | ออกได้ยังไง |
|---|---|---|
| หา "Mixing bench" เพื่อคราฟต์ดินปืนช้าก่อนใช้บลูพรินต์ M2 | ประมาณ 1.5 | เลื่อนรายการชิ้นส่วนไปล่างสุดแล้วเปิดพับ ไม่เกิน 5 นาที |
| Space ไม่จุดชนวน (M2) | ประมาณ 0.5 | โฟกัสค้างที่แถบเลื่อนที่เพิ่งลาก ต้องคลิกปุ่ม IGNITION (BUG-1) |

## จุดที่ขำ / เบื่อ
- ขำ:
  - ซอมบี้ Control พูด "Hnnnn gnarrr..." แล้วมี [Translation] ตามเป็นมุก เช่น "We do not have pockets. We do not have money. We have teeth." (ค่าปรับ 60,000 บาท), "A tourist on the beach is asking if this is part of the Full Moon Party. Yes.", "Gravity is one of us."
  - Capybara "Happens to everyone. Mostly to us." + milestone "Palate cleanser: Crash so hard Capybara has to mop the screen." (`030-desktop-crash.png`) ชอบมาก
  - ศาลพระภูมิตั้งข้างฐานปล่อยที่ยโสธร และมีมือซอมบี้ยื่นออกมาจากศาลตอนจรวดตก (`030-desktop-crash.png`) ขำและเป็นของไทยจริง
  - Tortoise Clerk "Under the Outer Space Treaty this zombie belongs to all humankind. Please sign here." / บันทึกเสมียนเต่า "ข้าพเจ้ากินใบสั่งไปแล้ว ใบสั่งไม่มีอยู่จริง"
  - Story log ภาษาไทยอ่านลื่น มุก "นิวตัน ซึ่งไม่รับสินบน", "บั้งไฟไม่สู้ลม มันตามลม", "ไม่ใช่ของงานบุญแน่นอน" (`031-desktop-story.png`)
  - ตัวละครสัตว์ แมวลี นกฮูกศาสตราจารย์ เป็ด Aero-Duck คาปิบารา นาก แยกบทบาทชัด น่ารัก
  - วันที่ในการ์ดภารกิจเป็น พ.ศ. (19 ต.ค. 2569) ใส่ใจ
  - วัฒนธรรม: โคมลอย หาดริ้น ฟูลมูน บั้งไฟยโสธร ถูกเล่าด้วยน้ำเสียงล้อเล่นแต่ไม่ดูถูก บั้งไฟถูกพูดถึงเป็นงานบุญ/ประเพณี ไม่เห็นอะไรผิดเพี้ยนหรือไม่เคารพ Disclaimer เรื่องการปล่อยโคมใกล้สนามบินผิดกฎหมายมีทั้งไทยอังกฤษ (`001`, `004`) ตรงประเด็น ไม่ดุเกินไป
- เบื่อ:
  - ข้อความซอมบี้คราง + [Translation] ในกล่องล่างซ้ายและ Flight Log ยาวมากและถี่ เมื่อเร่ง 10× อ่านไม่ทัน และ Flight Log เป็นอังกฤษล้วน (แค่ Story log มีไทย) เด็กศิลป์ที่ไม่ชอบอ่านยาว ๆ จะข้าม
  - ต้องรอจรวด M2.5 ตก (~T+704 วินาที) กว่าจะเจอการ์ดจบ ใช้ 10x ก็ยังรอ ~2 นาทีจริง ไม่มีปุ่มจบเที่ยวบิน (BUG-3)
  - รายการชิ้นส่วนด้านซ้ายยาวมากมาก ไม่เห็นภาพรวม

## บั๊ก
### BUG-1 · กด Space จุดชนวนไม่ติดถ้าเพิ่งลากแถบเลื่อนในแผง Launch site
- ขั้นตอน reproduce:
  1. M2: ไป Launch เลือก Bamboo ramp แล้วลากแถบ Ramp angle และ Wind ไป 0
  2. กด Space ทันที
- ที่เกิดขึ้น / ที่คาดไว้: จรวดไม่ออก (T+0.0 "On the pad") น่าจะเพราะ Space ถูกแถบเลื่อนที่โฟกัสอยู่กินไป คาดว่าต้องจุดชนวน ไม่มีข้อความบอกอะไร Flight Log ยังเขียน "Press Space or IGNITION" ต้องคลิกปุ่ม IGNITION (พิกัด 73,731) ถึงออก
- Screenshot: `playtest/runs/arts-student/025-desktop-burn.png` (แถบ Ramp angle มีกรอบโฟกัส), `026-desktop-after.png`
- หมายเหตุ: `tap "text=IGNITION"` ก็ไม่ติด (น่าจะไปจิ้มข้อความใน Flight Log แทนปุ่ม) น่าจะเป็นข้อจำกัดของ harness ไม่ใช่บั๊กเกม

### BUG-2 · แผงสถานะซ้อนทับกันที่มุมซ้ายบนหน้า Launch
- ขั้นตอน: เข้า Launch ที่จอ 1366x768
- ที่เกิดขึ้น: การ์ด "T+0.0 s / Altitude..." กับ "No payload / Seat 1.0 g" ทับกัน ข้อความ "No gimbal, no RCS — fins and luck only" ถูกการ์ดล่างบังบางส่วน
- Screenshot: `playtest/runs/arts-student/006-desktop-pad.png`, `023-desktop-pad2.png`

### BUG-3 · ผ่านภารกิจแล้วไม่มีสัญญาณชัดเจน / การ์ดจบมาช้า
- ขั้นตอน: ผ่าน M1 หรือ M2.5 แล้วรอ
- ที่เกิดขึ้น: M1 สำเร็จแต่ไม่มีการ์ดสรุป (`summaryOpen` ยังเป็น false ตลอด) มีแค่บรรทัด "MISSION 1 COMPLETE" ใน Flight Log (`007-desktop-flight.png`) M2.5 ข้ามเส้น 100 กม. ที่ T+83 แต่การ์ด End of Early Access โผล่ตอนจรวดตกที่ T+704 (`040-desktop-end5.png`) ข้อความภารกิจบอกแค่ "finish the flight" ผู้เล่นที่ไม่รู้ว่าต้องรอจะงง และการ์ดเป็น modal บังปุ่มแท็บจนต้องปิดก่อน

### BUG-4 · พรีไฟลต์เตือน "will tumble" บนแบบสำเร็จรูปที่เกมแนะนำเอง
- ขั้นตอน: M2.5 -> โหลด Sounding rocket (LV-45) -> ดู Pre-flight checks
- ที่เกิดขึ้น: เตือน CoP 100 cm เหนือ CoM จะตีลังกา และตีลังกาจริงที่ T+65 (log "Tumbling: tilt passed 90° at 58.8 km") แม้ยังผ่านภารกิจ ถ้าแบบ "ready to fly" ควรเสถียร หรือบอกว่าตั้งใจ
- Screenshot: `playtest/runs/arts-student/032-desktop-snd.png`, `035-desktop-up2.png`
- Console: มีแต่ GL warning "GPU stall due to ReadPixels" ซ้ำ ๆ ไม่มี error (ไม่ได้เช็ค `console` ทั้งเซสชัน เช็คตอนท้าย)

## จะเล่นต่อไหม
ใช่ ถ้ามีเนื้อเรื่อง Space Age ออกมา เพราะตัวละคร มุก และบรรยากาศไทย ๆ (โคมลอย บั้งไฟ ศาลพระภูมิ) ติดใจ แต่ตอนนี้ M1–M2.5 ผ่านครบภายใน ~9 นาทีโดยไม่ต้องคำนวณเลย เกม "ป้อน" จนรู้สึกแค่กดตาม Hint แล้วก็จบ (ไม่ได้ลอง Sandbox) ถ้าอยากรู้ฟิสิกส์จริง ๆ เกมยังไม่ได้อธิบาย

## คะแนน (1–10)
**7 / 10** — เสน่ห์ตัวละคร มุก และ Hint แบบสั่งทำตามได้เป็นจุดแข็งมาก แต่ onboarding หลังคลิป การหา Mixing bench และศัพท์ฟิสิกส์ที่ไม่มีคำอธิบายยังเป็นอุปสรรคสำหรับเด็กศิลป์

## ข้อเสนอ 3 ข้อ
1. เพิ่มปุ่ม/ลิงก์จาก "Craft slow powder first" (บนบลูพรินต์และชิ้นส่วนสีเทา) ไปเปิดและเลื่อนมาที่ Mixing bench เลย และหลังคลิปตำนานจบควรพาไปหน้า Missions หรือไฮไลต์ปุ่ม Missions
2. ทำ Hint/คำเตือนเป็นภาษาคน: อธิบาย SAS, weathercocking, centre of pressure/mass ด้วยประโยคสั้น ๆ + ไทย (หรือไอคอน "?") และอย่าขึ้นคำเตือนบนแบบสำเร็จรูปที่เกมแนะนำเอง
3. แก้การจุดชนวนด้วย Space (ปล่อยโฟกัสแถบเลื่อน) และเพิ่มการ์ดสรุป/ปุ่ม "ไปภารกิจต่อ" ตอนผ่านภารกิจโดยไม่ต้องรอจรวดตก พร้อมให้ Flight Log มีภาษาไทย
