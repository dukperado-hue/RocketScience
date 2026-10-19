# Playtest report — sci-student (น้องไอริส ม.5 สายวิทย์) · desktop 1366x768 · 2026-10-19

Build: v0.22.2 (`softlaunch`) · Session folder: `playtest/runs/sci-student/`

เล่นไป ~12.6 นาที (ตาม `minutesPlayed`) จบครบ **M1 → M2 → M2.5 → หน้า "End of Early Access"** รอบแรกของแต่ละภารกิจ (M2 ต้องลอง 3 รอบถึงผ่าน) ที่เหลือเวลาไปจิ้มฟิสิกส์ของโคม/Mixing Bench/Details แทน

## 5 นาทีแรก
เปิดมาเจอการ์ดเปิดเรื่อง "From Wan Hu's Chair to Outer Space" มีรูปสัตว์ (แมว เป็ด คาปิบารา นาก) กับปุ่ม "Watch the legend (10 s)" และ "Start building" พร้อม disclaimer เรื่องปล่อยโคมใกล้สนามบินผิดกฎหมาย (`001-desktop-start.png`) ฉันกด Start building เลย

หน้า Factory ชัดมาก: ซ้ายคือ Parts, ขวาคือ Vehicle (Thrust÷weight, Total mass, Δv, Burn time) และ "Pre-flight checks" มี blueprint "Khom loi" ให้กดโหลดได้ทันที พอโหลดแล้วขึ้นว่า "Hot air: about 159 °C inside, floats above 119 °C" (`002-desktop-a.png`) ชอบมาก เพราะเป็นเงื่อนไขแรงลอยตัวจริง ๆ ไม่ใช่แค่ "พร้อมบิน"

ไอคอนม้วนกระดาษ (Lanna Manual) คลิกที่พิกัดตรง ๆ แล้วไม่เห็นอะไรในตอนแรก ต้องคลิกอีกรอบถึงเด้งป้ายขึ้นมา (`004-desktop-m2.png`) แต่หลังจากนั้นอ่านได้ครบทุกชิ้น กด Roll out to the pad → Space ไม่ติดเพราะโฟกัสไปอยู่ที่อื่น ต้องกดปุ่ม IGNITION เอง → โคมลอยขึ้นจริง ๆ ที่ T+30 s ภารกิจ M1 จบที่ T+46 s เพราะเป้าหมายคือ "ทำให้โคมล้ำเข้าน่านฟ้าสนามบินสมุย" (ต้องตั้ง Launch site ที่หาดริ้น มีติ๊ก "District permit" ให้) แปลกดีที่ภารกิจแรกคือการทำผิดกฎหมาย (จงใจ ตลกร้าย) แต่มี disclaimer คุมไว้

## จุดที่งง
- **ปุ่ม Manual 📜 ต้องกดซ้ำ**: คลิกครั้งแรกบนไอคอนไม่เด้งป้าย (`003-desktop-manual1.png`) ครั้งที่สองถึงเด้ง (`004-desktop-m2.png`) ป้ายหายเองเมื่อทำอย่างอื่น ถ้าไม่ลองซ้ำคงคิดว่าปุ่มเสีย
- **Mixing Bench ซ่อนอยู่ล่างสุดของแผง Parts** ในหมวดที่พับอยู่ (`013-desktop-bench.png`) ทั้งที่ blueprint Bang Fai ขึ้นว่า "Craft slow powder first" แต่ไม่บอกว่าต้องไปที่ไหน ฉันต้องเลื่อนหาเอง
- **Mixing Bench**: ปุ่ม Ox / Fu / Mo / Bi / In คือ "ประเภทวัตถุดิบ" ไม่ใช่สารจริง (ไม่ใช่ KNO₃, ถ่าน, กำมะถัน) เด็กวิทย์อย่างฉันอยากเห็นชื่อสารจริง ข้อความ "That makes slow powder" ขึ้นมาเลยโดยไม่บอกอัตราส่วน ส่วนมินิเกม Stir "on the beat" ไม่มีสัญญาณจังหวะที่ฉันมองเห็นผ่านภาพ กด Space 13 ครั้งทุก 0.6 วิ ได้ quality แค่ 30% ("Uneven; expect misfires") (`019-desktop-stir2.png`)
- **CoT** (จุดส้มใต้จรวด) กับ **CoP/CoM** ใน Factory ไม่มีคำอธิบายในเกม รู้ได้เพราะเคยเรียนเอง
- **การตั้งค่า Launch site รีเซ็ตกลับเป็นค่าเริ่มต้น** (ลม 2 m/s มุม 10°) ทุกครั้งที่ Roll out ใหม่ ต้องลากสไลเดอร์ทุกรอบ (`029-desktop-pad4.png`)
- **Pre-flight ของ blueprint "Sounding rocket (LV-45)" ขึ้นเตือนว่า CoP อยู่สูงกว่า CoM 100 cm "it will tumble"** (`032-desktop-snd.png`) ทั้งที่มันคือ blueprint "ready to fly" แล้วมันก็ tumble จริง ๆ ที่ T+65 (`034-desktop-e1.png`) ภารกิจผ่านเพราะ burnout แล้วเฉื่อยพ้น 100 km ไปแล้ว แต่เด็กจะงงว่าทำไมชุดสำเร็จรูปไม่เสถียร
- **"Past Mach 3 with empty tanks"** ในจรวดแข็งไม้ไผ่ (`024-desktop-fin.png`) ใช้คำว่า tanks ทั้งที่ไม่มีถัง
- **หน่วยกำกวมในเตือน "Not enough heat: 0.08 kW warms the air to about 27 °C, but it needs 251 °C to float"** (`042-desktop-tea.png`) 27 °C คืออุณหภูมิจริงหรือสูงกว่าอากาศรอบข้าง? ถ้าจริงก็ต่ำกว่าอากาศข้างนอกซึ่งไม่เป็นไปได้ ข้อความก่อนหน้าใช้ "159 °C inside" ซึ่งเป็นค่า absolute

## จุดที่ติด (นานกี่นาที)
| จุด | ติดนาน (นาที) | ออกได้ยังไง |
|---|---|---|
| M2: บั้งไฟสูงแค่ 2.2 km ไม่ถึง 5 km (twin-tail ที่ลม 2 m/s มุม 10°) | ~1.5 | เปิด hint ในหน้า Missions: "twin-tail, ลม 0, ราง 0°" ลากสไลเดอร์ลง 0 แล้วบินใหม่ได้ apogee 5.70 km |
| M2: ลองเพิ่มครีบเองบน Bang Fai (bamboo) ครีบเดียวด้านข้าง ลม 0 มุม 0° | ~1.5 | ตกที่ apogee 387 m พลิกทันที (`028-desktop-c2.png`) กลับไปใช้แบบ twin tails |
| หา Mixing Bench / รู้ว่าต้องกดอะไร | ~2 | เลื่อนแผงซ้ายลงสุดแล้วเปิด Mixing bench เอง |
| Space ไม่จุดระเบิดหลังลากสไลเดอร์ | ~0.5 | กดปุ่ม IGNITION ตรง ๆ (โฟกัสค้างที่สไลเดอร์) |

ไม่มีจุดไหนติดเกิน 5 นาที

## จุดที่ขำ / เบื่อ
- ขำ: Zombie Control พูดซอมบี้แล้วมีคำแปลวงเล็บ เช่น "Gravity is in charge now. Gravity is one of us." และ "The fine is sixty thousand baht. We do not have pockets." / Capybara "Crash so hard Capybara has to mop the screen." / Wan Hu's lantern chair 400 ดวง / manual ติดตลก เช่น "Not a hula hoop. Please return the hula hoop."
- ขำ+ชอบ: ข้อความ "Slowing the burn trades thrust for burn time. The total impulse stays about the same." ใน Mixing Bench ถูกต้องตามกลศาสตร์ (impulse เท่าเดิม) เป็นการสอนที่ดี
- ชอบ: เมื่อเลิก CAPCOM ซอมบี้ มี Lee (Flight Director), Prof. Owl, Aero-Duck, Tortoise Clerk เข้ามาพูดตามเหตุการณ์ใน M2.5 ทำให้โลกมีชีวิต
- เบื่อ: M1 แค่รอโคมลอย ใช้ 10× ก็จบ แต่การรอ 30 วิกว่าจะ lift-off (ต้องอุ่นอากาศ) ที่ 1× ค่อนข้างน่าเบื่อ
- เบื่อ: การนั่งรอให้จรวด M2.5 ตกลงมา (ใช้เวลา ~10 นาทีเกมเมื่อใช้ 10×) โดยไม่มีร่มชูชีพ/ไม่มีอะไรให้ทำระหว่าง coast ยกเว้นดู HUD

## บั๊ก
### BUG-1 · แผง Flight log ของบรรทัดแรกและการเรียงลำดับอาจสับสน / เหตุการณ์ "Top of the arc" ไม่ตรงกับ apogee
- ขั้นตอน reproduce:
  1. เล่น M2 twin-tail ลม 0 มุม 0°
  2. ดู Flight log หลังบิน
- ที่เกิดขึ้น: "T+62.9 Apogee 5.70 km" และ "T+62.9 Fire out" พร้อมกัน ส่วน "Top of the arc" ขึ้นที่ T+72.6 (หลัง apogee 10 วิ) และ "Bang Fai tube burnout" อยู่ที่ T+48.0 ในรอบแรก (ลม 2 m/s) "Top of the arc" ขึ้นที่ T+43.5 ทั้งที่ HUD ตอน T+50.1 ยังแสดง Vertical +85 m/s ที่ 1.62 km กำลังขึ้นอยู่ (`022-desktop-b1.png`) — เวลาเหตุการณ์ใน log ไม่ตรงกับ HUD
- ที่คาดไว้: "Top of the arc" ควรขึ้นพร้อม apogee จริง ("Fire out" ควรตรงกับ burnout)
- Screenshot: `playtest/runs/sci-student/022-desktop-b1.png`
- หมายเหตุ: ตอนอ่าน log ฉันดึงมาทีหลังที่ `log` เลยไม่แน่ใจว่าเป็นความต่างของนาฬิกา log กับ HUD หรือเกิดจริง

### BUG-2 · pageerror ใน console
- ขั้นตอน reproduce: เล่นเต็มเส้นทาง M1 → M2 → M2.5 แล้วดู `console`
- ที่เกิดขึ้น: `[pageerror] Cannot set properties of null (setting 'textContent')` หนึ่งครั้ง (ไม่รู้ว่าเกิดตอนไหนแน่ — อยู่หลัง analytics `mission_complete m2b-karman`) ไม่เห็นผลกระทบบนหน้าจอ
- ที่คาดไว้: ไม่มี pageerror
- Screenshot: ไม่มี (ดูจาก `console`)

### BUG-3 · HUD ค้างค่าเก่าหลัง Crashed
- ขั้นตอน: บินให้ตก (M2 รอบแรก) ดู HUD
- ที่เกิดขึ้น: "Velocity 0 m/s" แต่ "Mach 0.13" (และรอบอื่น "Mach 0.58", "Mach 0.41" ที่ความเร็ว 0) / ที่ M2.5 ตอน coast ที่ 159 km ขึ้น "Mach 6.92" ทั้งที่ที่ความสูงนั้นไม่มีอากาศ Mach ไม่มีความหมาย
- Screenshot: `playtest/runs/sci-student/023-desktop-end1.png`, `028-desktop-c2.png`, `034-desktop-e1.png`

### BUG-4 · ค่า "strength ×7168.48" และ "Wall temperature 30 °C" ของเทียน
- ขั้นตอน: Clear → กดเทียน (Tea-light candle) → เปิด Details
- ที่เกิดขึ้น: Safety factor ×7168.48 (ตัวเลขไม่มีความหมายสำหรับผู้เล่น) และ Wall temperature 30 °C สำหรับเทียนที่ให้กำลัง ~80 W / มวลใน inspector 0.02 kg แต่ในรายการ Parts ขึ้น 0.03 kg
- Screenshot: `playtest/runs/sci-student/043-desktop-det.png`

### BUG-5 · ค่าเทียบ "floats above X °C" กับ "air inside is Y °C" ตอน lift-off ต่างกัน
- ขั้นตอน: M1 Khom loi — Pre-flight บอก floats above 119 °C; log ตอนลอยบอก "Lift-off at 30.2 s: the air inside is 117 °C"
- ที่เกิดขึ้น: ลอยที่ 117 < 119 ต่างกัน 2 °C (อาจเป็นเพราะอุณหภูมิอากาศ/สภาพแวดล้อมจริงไม่ตรงกับค่าที่ใช้ทำนายตอน Factory) ไม่มีคำอธิบายในเกม
- Screenshot: ดู `002-desktop-a.png` และ `log` ของ M1

### BUG-6 · (UI) ปุ่ม "Back to the Factory" ซ้ำสองปุ่ม
- ที่เกิดขึ้น: หลัง End of Early Access มี `button.ghost[data-act=back]` "Back to the factory" ที่ซ่อนอยู่กับปุ่มจริง "Back to the Factory" (ตัวใหญ่ F) การ tap ด้วยข้อความจับปุ่มซ่อนก่อนแล้ว timeout (ผู้เล่นมนุษย์ไม่โดน แต่บอกว่ามี DOM ซ้ำ)
- Screenshot: `playtest/runs/sci-student/038-desktop-e5.png`

## จะเล่นต่อไหม
**ใช่** — ชอบที่ Pre-flight checks ให้เหตุผลทางฟิสิกส์ (CoP/CoM, T/W, ความร้อนของอากาศ) และ manual สนุก แต่อยากให้มีกราฟ/ตัวเลขให้ขุดลึกขึ้น และ Tier 2 ยังขาด manual ถ้าอัปเดต Space Age ออกมาจะกลับมาเล่นแน่ ๆ

## คะแนน (1–10)
**8 / 10** — ฟิสิกส์ส่วนใหญ่ถูกและมี Pre-flight ที่สอนได้จริง แต่คำอธิบายยังอ่านเป็นมุกมากกว่าสอน และ Tier 2 ไม่มี Lanna Manual

## ข้อสังเกตฟิสิกส์และคำอธิบาย (ตามภารกิจ persona)

### Lanna Manual — อ่านครบ 9 + 9 ชิ้นที่มีให้
อ่านครบทุกชิ้นที่มีไอคอนม้วนกระดาษ: Paper lantern small, Khom loi, Festival lantern, Cotton balloon, Bamboo mouth ring, Bamboo hoop large, Tea-light candle, Wax fuel cell, Smoke flare (Tier 0) และ Wooden chair, Wan Hu rocket tube, Bang Fai tube, Cast-grain motor, Nose cone 12 cm, Small fin, Tail stick, Kite, Parachute small (Tier 1) เนื้อหาเป็น 2 ส่วน: ขั้นตอนตลก + "⚠" + คำไทยสั้น ๆ + ย่อหน้าตัวเลขจริงด้านล่าง ถูกต้องเท่าที่ตรวจได้

ตัวอย่างที่เด็กวิทย์ชอบ:
- Khom loi: "0.3 m³ ... ~140 °C above the air outside ... ~12 minutes" ตรงกับตัวเลขในเกม
- Wax fuel cell: "~1.8 kW for 12 minutes" (ตรงกับ log "Lit 1 heat source (1800 W)")
- Smoke flare: "3.2 kW ... two minutes"
- Tail stick: "drags the centre of pressure behind the centre of mass" — บอกกลไกความเสถียรได้ถูกต้อง
- Bang Fai: บอกว่า nozzle เจาะเยื้องให้ thrust line ผ่าน CoM (ลึกดี)

ข้อติ:
- Manual "Paper lantern, small" เขียนว่า "A 0.12 m³ sa-paper shade" — "sa" (กระดาษสา) ไม่อธิบาย
- Manual ของ **Bang Fai** บอกว่า "turns into the wind" แต่ไม่อธิบายสาเหตุ (weathercocking = CP อยู่ท้าย CoM ใต้ครีบ/หาง) มีแต่ใน hint ของภารกิจที่บอกแค่ชื่อ "weathercocking" ฉันต้องเดาเอง
- **Tier 2 (LV-45, pressure-fed, turbopump, ถังทุกขนาด, decoupler, nose cone ใหญ่, ครีบใหญ่, ร่มใหญ่) ไม่มี Lanna Manual เลย** — ไม่มีไอคอนม้วนกระดาษ (ตรวจจาก class ของ part-card) ทั้งที่เป็นส่วนที่เนื้อหาฟิสิกส์ (Isp, สมการจรวด, TWR) น่าสอนที่สุด
- Parachute small บอก "~7 m/s" ตก; ตรวจได้ว่าเป็นไปได้ (ร่ม 6 m, มวล 22+ kg)
- Wan Hu rocket tube / Cast-grain motor "Craft … first" ล็อกด้วยการผสมเชื้อเพลิงก่อน มีดี

### ฟิสิกส์ที่ตรวจ
- **แรงลอยตัวโคม**: ตัวเลข "floats above 119 °C" สำหรับโคม 0.3 m³ มวล ~0.10 kg ฉันคำนวณเองจาก ρ_air(1−T_a/T_i)V = m ได้ ~110–150 °C ขึ้นกับสมมติฐาน อยู่ในช่วงเดียวกัน (ไม่ได้ตรวจละเอียดเพราะเกมไม่บอกอุณหภูมิอากาศรอบข้าง/ความหนาแน่นที่ใช้) Cotton balloon 3 m³ มวล 0.77 kg "floats above 91 °C" ก็ใกล้เคียง
- **Warning "Not enough heat"** ของเทียน 80 W: คิดตามได้ว่าต้องการ ΔT มาก ถูกทิศทาง แต่หน่วย/ความหมายกำกวม (ดูข้างบน)
- **Δv / TWR**: Bang Fai bamboo Isp 85 s, Δv 965–993 m/s, TWR 1.2: Δv = Isp·g·ln(m0/mf) → mass ratio ≈ 3.2 ซึ่งสอดคล้องกับมวล 26 kg ที่ burn 48 s ที่ thrust 313 N (ตรวจเทียบแบบคร่าว ๆ) สมเหตุสมผล
- **Gravity loss**: TWR 1.2 กับ Δv ~1 km/s แต่ apogee จริงได้แค่ 2.2 km (เมื่อเอียง/ลม) หรือ 5.7 km (เมื่อตรง ลม 0) ซึ่งสอนเรื่อง gravity loss + การเอียง ได้ดี แต่เกมไม่ได้พูดถึง
- **Weathercocking**: ในเกมเห็นผลจริง (ลม 2 m/s, ราง 10° → เอียง/พลิก, ลม 0, ราง 0° → ขึ้นตรง) แต่ไม่มีคำอธิบายในเกมว่าทำไม
- **Max-Q**: 82.4 kPa ที่ Mach 2.46 (T+34 s) ของ sounding rocket — ค่าถูกช่วงปกติ (ปกติ 30–60 kPa ที่ Mach 1.5–2 สำหรับจรวดตรวจอากาศ แต่ที่ TWR 2.8 สูงกว่านิดหน่อยก็พอรับได้)
- **Orbit panel (suborbital)**: Apoapsis 390.5 km, Periapsis "below ground", Period 32:37 — คำนวณจาก apoapsis 390 km ดูถูก Kepler เมื่อ periapsis ใต้ผิว (คาบ ~ครึ่งหนึ่งของวงรีใหญ่) ถูกต้องในแนวคิด; ผมไม่ได้เช็คตัวเลขละเอียด
- **Re-entry**: "Re-entry plasma: 10 MW/m² ... Nothing is shielding it" แต่ Skin temp ตอนนั้นแค่ ~305 °C และชนพื้นด้วย 140 m/s — ตัวเลข heat flux 10 MW/m² กับอุณหภูมิผิว 305 °C ไม่สอดคล้องกัน (น่าจะเป็นเพราะ ablate/เวลาแค่ไม่กี่วินาที แต่เกมไม่ได้อธิบาย)

### Prof. Owl
เห็นเฉพาะในเที่ยวบิน M2.5: "Max-Q — the air is pushing hardest right now. Hold together, little rocket." และ "Apogee. Top of the arc — gravity takes it from here." (`036-desktop-e3.png`) และมีในส่วน Story log เรื่อง "เหนืออากาศ" เกี่ยวกับกฎหมายอวกาศ ตอนบินมีให้เห็นแค่ 2 ประโยคสั้น ๆ ตลก/ให้กำลังใจ แต่ **ไม่ได้สอนอะไรเชิงฟิสิกส์** (ไม่อธิบายว่า Max-Q คืออะไรทำไมถึงเป็นอย่างนั้น, q = ½ρv²) ถ้าอยากให้เด็กไปอ่านต่อควรมีลิงก์/คำอธิบายสั้น ๆ 1–2 บรรทัด

### สิ่งที่อยากรู้เพิ่ม / อยากให้มี
- ทำไมบั้งไฟถึงหันเข้าหาลม — อยากให้มีแผนภาพ CP/CoM แบบเคลื่อนไหวบน Launch
- กราฟ T/W, ความเร็ว, ความสูง, q (dynamic pressure), Δv ที่ใช้/ที่เหลือ หลังบินจบ (ตอนนี้มีแค่สรุปตัวเลข 6 ช่อง)
- ปรับตัวเลขอุณหภูมิอากาศ/ความชื้นที่หาดริ้นได้ เพื่อดูผลต่อแรงลอยตัวโคม
- เหตุผลที่เปลี่ยน Isp ระหว่างผงเร็ว/ช้า (80 vs 85 s) และตัวเลือกวัตถุดิบจริง (KNO₃ / ถ่าน / กำมะถัน)
- ปุ่มดู Δv budget ของ Sounding rocket (3038 m/s) เทียบกับ Δv ที่ใช้จริงเพื่อให้เห็น gravity + drag loss

### ศัพท์/หน่วยที่เด็ก ม.ปลายอาจไม่เข้าใจ
CoM, CoP, CoT, TWR, Δv, Max-Q, apoapsis/periapsis, "Safety factor ×7168", "B3" (cost?), "Isp 80 s" (หน่วยวินาที ไม่มีคำอธิบาย), "Mach" ที่ความสูงเกิน 100 km, "Kármán line" มีคำอธิบายแล้วในคำบรรยายภารกิจ ("where the air gives up and the paperwork begins") ซึ่งเป็นตัวอย่างที่ดี

### ส่วนที่สอนได้ดีจนอยากไปอ่านต่อ
- Pre-flight checks (T/W, "Centre of pressure is X cm above the centre of mass — it will tumble", "Hot air: about 159 °C inside, floats above 119 °C")
- Mixing Bench: "Slowing the burn trades thrust for burn time. The total impulse stays about the same."
- เกมแสดง "Fins stalled at 20° angle of attack — no more restoring force" เมื่อ tumble (`034-desktop-e1.png`) น่าสนใจมาก อยากอ่านเรื่อง angle of attack/stall ต่อ

## ข้อเสนอ 3 ข้อ
1. **เติม Lanna Manual ให้ Tier 2** (LV-45, pressure-fed, turbopump, ถัง, decoupler, ครีบใหญ่) พร้อมอธิบาย Isp / สมการจรวด / TWR และเพิ่มข้อความสั้น ๆ ใน Manual ของ Bang Fai ว่าทำไมจึงหันเข้าหาลม (CP อยู่ท้าย CoM) — ตอนนี้ส่วนที่ฟิสิกส์ลึกสุดไม่มีคำอธิบายเลย และให้ Prof. Owl อธิบายสั้น ๆ เมื่อเกิดเหตุการณ์ (Max-Q, apogee, tumble) แทนที่จะพูดแค่ให้กำลังใจ
2. **ทำให้ Pre-flight ตรงกับพฤติกรรมจริงและใช้หน่วยชัดเจน** — blueprint "ready to fly" (Sounding rocket) ไม่ควรเตือน "will tumble" โดยไม่บอกวิธีแก้ในที่เดียว / แก้ "27 °C vs 251 °C" ให้บอกว่าเป็นอุณหภูมิจริงหรือส่วนต่าง และบอกอุณหภูมิอากาศรอบข้าง / ตัด "Mach" และตัวเลขแปลก ๆ (×7168, Mach 6.92 ที่ 159 km) ออกจากการแสดงผลเมื่อไม่มีความหมาย
3. **ทำให้ Launch site จำค่าที่ตั้งไว้ และเพิ่มสรุปหลังบิน** — ไม่ต้องลากลม/มุมราง 0° ใหม่ทุกรอบ, ย้าย Mixing Bench ให้ค้นเจอง่ายขึ้น (หรือลิงก์จากข้อความ "Craft slow powder first"), แสดงกราฟความเร็ว/ความสูง/q และ Δv ที่ใช้จริงหลังบินจบ และเพิ่มสัญญาณจังหวะที่มองเห็นได้ในมินิเกม Stir
