# Playtest report — nasa-engineer (ดร.ธนา, flight dynamics) · desktop · 2026-10-19

Build: v0.22.2 (`softlaunch`) · Session folder: `playtest/runs/nasa-engineer/` · เวลาเล่นในเกมรวมประมาณ 10 นาที (`minutesPlayed` ~9.5) ผมหยุดก่อนครบ 25 นาทีเพราะภารกิจหลักเสร็จแล้วและประเด็นเริ่มซ้ำ

ขอบเขตที่ได้ลอง: Campaign (ดูการล็อก) → Sandbox → LV-45 Tier 2 ขึ้นเกิน 100 km (4 เที่ยวบิน) → แก้ครีบ/ใส่ร่ม → Auto-turn → Map
**ไม่ได้ลอง**: M1/M2/M2.5 ใน Campaign จริง, airspace Samui (CTR/approach path), staging/decoupler, RCS, payload, Story tab, เปลี่ยนวัสดุ/เชื้อเพลิงอย่างเป็นระบบ (เห็นแค่รายการวัสดุของครีบ)

## 5 นาทีแรก
- เปิดเกมเจอ title card "From Wan Hu's Chair to Outer Space" พร้อม disclaimer เรื่องโคมลอย (อังกฤษ+ไทย) ปิดได้ (`playtest/runs/nasa-engineer/001-desktop-start.png`)
- Campaign ล็อก Tier 2: blueprint "Sounding rocket (LV-45)" ขึ้น 🔒 "Mission 2 · Viral Ballistics" และชิ้น Tier 1 ล็อกที่ "Mission 1" — **บอกเหตุผลของการล็อกชัดเจนดี**
- Missions tab มีสวิตช์ Campaign / Sandbox มุมขวา กด Sandbox แล้วขึ้น "every part and range unlocked; flights are not recorded. Your campaign progress is kept for when you switch back." (`003-desktop-sandbox.png`) ชัดเจนมาก และบอกว่าเซฟ campaign ไม่หาย
- Factory ใน Sandbox แตะ LV-45 ได้เลย: T/W 2.79, mass 6.14 t, thrust 168 kN, Δv 3038 m/s, burn 63.6 s (`005-desktop-lv45.png`)
- Roll out → Space → burnout ที่ T+63.7 s ข้าม Kármán ที่ T+82.9 s apogee 390 km ตั้งแต่เที่ยวแรก (ไม่มี Mission summary เพราะ Sandbox ไม่บันทึก แต่มีการ์ด "Crashed" ตอนจบ)

## ✅ ง่ายเกินจริงแต่รับได้
| รายการ | เหตุผลที่รับได้ |
|---|---|
| ขึ้นเกิน 100 km ง่ายมากด้วย LV-45 เปล่า (apogee 390 km) | เกมการศึกษา ให้ผู้เล่นชนะเร็ว (ภารกิจจริงของ sounding rocket ถึง 100 km ได้ด้วย Δv น้อยกว่านี้มาก) |
| Max-Q รายงานเป็น kPa + Mach ("82.4 kPa at Mach 2.46") | ศัพท์/หน่วยถูกต้อง ค่าอยู่ในช่วงที่เป็นไปได้ |
| Free-fall สอดคล้องกับฟิสิกส์: ตกจาก 367→290 km ได้ v=1169 m/s (ผมคำนวณ √(2gΔh) ≈ 1160 m/s) | โมเดล ballistic ช่วง coast ถูกต้อง ไม่โกง |
| Map: "Burn prograde to raise the far side, retrograde to lower it" | ถูกต้องตามกลศาสตร์วงโคจร อธิบายง่าย |
| Flight Director (Lee) ใช้ go-for-launch poll, "Engine cut-off", "Loss of signal" | ใช้บริบทถูก (NASA จริงเรียก MECO/SECO แต่ cut-off รับได้) |
| Kármán = 100 km เป็น milestone "Space passport" | ตรงกับ convention (FAI) ที่ใช้กันทั่วไป |
| Pre-flight: "Centre of pressure is … cm above the centre of mass — it will tumble" แล้วจรวดก็ tumble จริง | สอนเรื่อง static margin ถูกต้องและเห็นผลจริง ชอบมาก |
| ร่มชูชีพลงมาที่ 26 m/s ยังนับ "Crashed" มีหลุม | รับได้ (capsule จริงลงที่ ~5–8 m/s) |
| Aluminium "Weakens above ~150 °C" | หลักการถูก ตัวเลขเฉพาะอัลลอยด์ **ควรตรวจสอบ** |

## ❌ ผิดจนรับไม่ได้ (สอนผิด / ผิดหลักการ)
| # | ปัญหา | หลักฐาน | ที่ถูกต้อง |
|---|---|---|---|
| 1 | **Parachute small (5.4 kg) ช่วยจรวด ~6 t ลดจาก 167 m/s ที่ 9.6 km เหลือ 40 m/s ภายในไม่กี่วินาที โดยไม่ฉีก** | log "Parachute, small deployed at 9.63 km, 167 m/s"; `036-desktop-chute1.png`; state under canopy 40 m/s ที่ 7.6 km | ร่ม 5 kg รับมวลระดับตันไม่ได้ และ deploy ที่ ~Mach 0.5 / q สูงจะฉีก (มีขีดจำกัด deployment q). ไม่ทราบพื้นที่ drag ในเกม → **ควรตรวจสอบ** แต่ผลลัพธ์ดูเกินจริงมาก |
| 2 | **"Re-entry plasma: 10 MW/m² … Expect blackout" ที่ ~1.7 km/s (Mach ~5.7 ที่ 22 km)** | log T+613.7/613.8; `011-desktop-reentry.png` | Plasma/RF blackout เกิดที่ความเร็วระดับ orbital re-entry (หลาย km/s เกิน ~5) ไม่ใช่ 1.7 km/s นี่คือ aerodynamic heating ธรรมดา. ตัวเลขฟลักซ์ 10 MW/m² **ควรตรวจสอบ** ว่าคำนวณอย่างไร |
| 3 | **Mach 6.95 แสดงที่ 157 km** | `009-desktop-burnout.png` | เหนือ ~100 km ไม่มีตัวกลางต่อเนื่อง speed of sound/Mach ไม่มีความหมาย ควรแสดง "—" |
| 4 | **ปุ่ม "Auto-turn" + "Gravity turn: leaning 1°/s toward 80°"** ทำให้ apogee ตกเหลือ 39.7 km และ tumble ที่ 28.7 km | `033-desktop-gt.png`, `034-desktop-gt2.png`; log | Gravity turn จริงคือ AoA ≈ 0 ให้แรงโน้มถ่วงโน้มเส้นทาง ไม่ใช่อัตรา pitch คงที่ 1°/s. ชื่อนี้ทำให้ผู้เล่นเข้าใจผิด ควรเรียก "pitch program" หรือแก้พฤติกรรม |
| 5 | **Tortoise Clerk: "…outer space. Under the Outer Space Treaty this zombie belongs to all humankind."** ผูกกับ 100 km | log T+83.2 | OST ไม่ได้กำหนดเส้นแบ่งอวกาศ (ไม่มีนิยามเขตแดนในกฎหมายระหว่างประเทศ) ถ้าเป็นมุกก็เข้าใจ แต่เด็กอาจเข้าใจว่าสนธิสัญญากำหนด 100 km ควรเติม "(FAI convention)". ระดับ: สอนผิดเล็กน้อย |
| 6 | **Skin temp 279 °C ตอน coast ที่ 157 km และค้าง 294 °C ตอนจอดบนพื้น (หลัง crash)** | `009`, `014-desktop-impact2.png` | ที่ 157 km ไม่มี aero heating และบนพื้นต้องเย็นลง — **ควรตรวจสอบ** ว่าโมเดลตั้งใจ (thermal soak ไม่มี cooling?) |
| 7 | **Throttle แสดง 100% หลังดับเครื่อง / ตอน falling / crashed** | state, `011`, `014` | ควรเป็น 0% หรือ "—" |

## จุดที่งง
- Sandbox banner บอก "Every Tier 0–2 part unlocked" แต่ชิ้น Tier 1 (Wan Hu rocket tube, Bang Fai tube, blueprint Wan Hu's chair/Bang Fai) ยังเทา พร้อมข้อความ "Craft fast/slow powder first" (`005-desktop-lv45.png`)
- Pre-flight บอก "Add fins low down" ทั้งที่ blueprint มีครีบที่ฐานอยู่แล้ว (swept fin) และกริด Factory ไม่มีตัวชี้ CoP (เห็นแค่ CoM กับ CoT) ทำให้ไม่รู้ว่าต้องแก้ตรงไหน (`005`)
- แตะ (tap) ชิ้นส่วนจาก palette จะไปติดกลางลำตัวเสมอ (ครีบ delta ไปติดกลางลำ ไม่ใช่ท้ายลำ `018-desktop-fins.png`) ต้องลากไปที่จุด attach เล็ก ๆ ที่ฐาน ผู้เล่นใหม่ไม่รู้
- ลากชิ้นทับเครื่องยนต์ ได้แค่ "1 overlapping part won't launch" ไม่ไฮไลท์ว่าชิ้นไหน (`024-desktop-d1.png`)
- ปุ่ม "Retry Flight" มีป้ายไทย "บินอีกครั้ง" ใหญ่ + อังกฤษเล็ก ในขณะที่ UI ส่วนอื่นเป็นอังกฤษ (`038-desktop-land2.png`)

## จุดที่ติด (นานกี่นาที)
| จุด | ติดนาน (นาที) | ออกได้ยังไง |
|---|---|---|
| ติดครีบ delta ที่ท้ายลำ (tap ติดกลางลำ / ลากทับเครื่องยนต์ / ลากแล้ว detach) | ~3 | ลากจาก palette ไปที่ attach node ข้างฐาน (776,612) แล้วเปิด Mirror ได้สองข้างพร้อมกัน |
| harness: `tap "text=Remove"` จับ element ซ่อน "Release to remove" จน timeout | ~1 | ใช้ `tap "button:has-text('Remove')"` (ข้อจำกัดเครื่องมือ ไม่ใช่เกม) |

ไม่มีจุดไหนติดเกิน 5 นาที

## จุดที่ขำ / เบื่อ
- ขำ: Zombie Control "Rrahh… gorrrr…" แปลว่า "The rocket has been distributed evenly across the province. Very fair." (`015-desktop-after.png`); Aero-Duck "Guidance is go. Quack — sorry."; Tortoise Clerk "Form 12-B: Unscheduled Rotation"; log "Flying tail-first at 1712 m/s — the fins are now at the front, pushing the wrong way." (ถูกหลักการและขำ)
- เบื่อ: ขาลงจาก 300+ km ต้องรอนาน (เร่ง 10× ยังใช้ ~20 วินาทีจริง) และเกมปิด time warp เองก่อนชน ~15 s ต้องกด 10× ใหม่; ไม่มีปุ่มข้ามไป impact
- เบื่อ: ภายใต้ time warp ข้อความ CAPCOM มาช้ากว่าเหตุการณ์จริง (ดู BUG-4)

## บั๊ก
### BUG-1 · Sandbox banner ขัดกับสถานะล็อก
- ขั้นตอน: 1. Missions → Sandbox 2. Factory → เลื่อนดูหมวด PROPULSION / blueprint Tier 1
- ที่เกิดขึ้น / ที่คาด: banner บอกปลดล็อกทั้งหมด แต่ Tier 1 ยังเทา "Craft … powder first"
- Screenshot: `playtest/runs/nasa-engineer/005-desktop-lv45.png`

### BUG-2 · Details ของ Parachute ขึ้นข้อความของเครื่องยนต์
- ขั้นตอน: Sandbox → แตะ Parachute, small ในแท็บ Factory → Details
- ที่เกิดขึ้น: "Engines are bought, not built — fixed construction."
- Screenshot: `playtest/runs/nasa-engineer/035-desktop-chute.png`

### BUG-3 · "New crater" สองรายการจาก impact เดียว
- ขั้นตอน: บิน LV-45 ไม่ติดร่ม ปล่อยตก
- ที่เกิดขึ้น: crater 19.8 m/3.2 m และ 12.2 m/1.9 m ที่ T+698.8 เดียวกัน (อาจตั้งใจ แยกชิ้น — **ควรตรวจสอบ**)
- Screenshot: `playtest/runs/nasa-engineer/014-desktop-impact2.png`

### BUG-4 · CAPCOM ตอน time warp ล่าช้า/หลุดลำดับ
- ขั้นตอน: ignition แล้วกด 10× ทันที
- ที่เกิดขึ้น: "Aero-Duck: Tower clear" ที่ T+17.5 ทั้งที่ clear rail ที่ T+0.8; "Prof. Owl: Clear of the rail" ที่ T+41.7 (เที่ยวที่ 2, log จาก `log`)
- Console: ไม่มี error; มีเฉพาะ GL perf warning "GPU stall due to ReadPixels"

### BUG-5 · Telemetry ค้าง/ไม่สมเหตุผล
- Throttle 100% หลังดับเครื่อง, Mach เหนือ Kármán, skin temp ค้าง — ดูตาราง ❌ ข้อ 3, 6, 7; `009`, `014`

## จะเล่นต่อไหม
ใช่ ถ้า... เกมแก้ข้อความที่สอนผิดก่อน — ผมสนุกกับการแก้ stability (CoP/CoM) และมุกล้อ NASA ใช้ศัพท์ถูกหลายจุด (Max-Q, apogee, LOS, go for launch) แต่เด็กจะเชื่อเรื่อง plasma / gravity turn / ร่มชูชีพ จึงอยากให้แก้

## คะแนน (1–10)
**7 / 10** — ฟิสิกส์ ballistic และบทเรียน static margin ทำได้ดีเกินคาด แต่มีข้อความสอนผิด 3–4 จุด (plasma ที่ Mach 5, "gravity turn", ร่ม 5 kg รับจรวดหลายตัน, OST กับ 100 km) และ UI วางครีบยังฝืด

## ข้อเสนอ 3 ข้อ
1. แก้เนื้อหาที่สอนผิด: "Re-entry plasma/blackout" ให้ขึ้นเมื่อ v สูงจริง, เปลี่ยน "Gravity turn" เป็น "pitch program" (หรือทำ AoA≈0 จริง), เพิ่มขีดจำกัด deploy ของร่ม (q/ความเร็ว) และให้ขนาดร่มสัมพันธ์กับมวล
2. เพิ่มตัวชี้ CoP บนกริด Factory คู่กับ CoM/CoT, ให้ pre-flight check ชี้ว่าควรเพิ่มครีบอย่างไร, ไฮไลท์ชิ้นที่ overlap และให้ tap-attach วางครีบที่ท้ายลำ
3. ทำ telemetry ให้สมเหตุสมผล: Mach เหนือ 100 km เป็น "—", throttle 0% หลังดับเครื่อง, skin temp ระบายลง, ซิงก์ CAPCOM กับเวลาเกมตอน warp, และแก้ banner Sandbox / ข้อความ "Craft first" ให้ตรงกัน
