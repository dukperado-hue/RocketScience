# Playtest report — retro-gamer (พี่โอ๊ต) · desktop + mobile · 2026-10-19

Build: v0.22.2 (`softlaunch`) · Session folder: `playtest/runs/retro-gamer/`

เล่นบน desktop ประมาณ 17 นาที (`minutesPlayed` 16.4 ตอนจบ desktop) + mobile ประมาณ 1.2 นาที (mobile เป็น profile ใหม่ ความคืบหน้าไม่ตามมา) ผ่าน M1, M2, M2.5 ครบ แล้วลอง crash: ตกพื้น, ตกทะเล, ไฟลุกกลางอากาศ (โคมลอย) ส่วน "จรวดระเบิดกลางอากาศ" ไม่สำเร็จ (รายละเอียดท้ายรายงาน) เสียงประเมินไม่ได้ เครื่องมือฟังไม่ได้ เห็นแค่ `audio: running` เลยไม่แต่งเรื่องเสียง

## 5 นาทีแรก
เปิดมาเจอ Factory กับการ์ด "From Wan Hu's Chair to Outer Space" ปุ่ม "Watch the legend (10 s)" กับ "Start building" (`001-desktop-start.png`) ภาพแมว เป็ด คาปิบารา นากถูกมัดกับเก้าอี้ที่เต็มไปด้วยพลุ เห็นแล้วรู้เลยว่าเกมนี้ตลก พี่ข้ามไปกด Start building (ไม่ได้ดู legend) กดบลูพรินต์ "Khom loi (sky lantern)" ได้โคมมาทั้งลูก ฝั่งขวาขึ้น Thrust/Δv/Pre-flight บอก "Ready to roll out." (`002-desktop-a.png`) กด Roll out แล้ว Space ติด ไม่มีใครสอน จากเปิดเกมถึงโคมจุดไฟไม่ถึง 2 นาที แบบนี้ยอม ตู้อาเขตก็ต้องแบบนี้ ใส่เหรียญแล้วเล่นเลย

โคมใช้ราว 30 วินาทีกว่าจะลอยจากพื้น ต้องเร่ง 10× เกมถึงเดิน ภารกิจ M1 สำเร็จที่ T+40 s สูงแค่ 3-7 เมตร เพราะ Haad Rin อยู่ในแนวร่อน RWY 17 อยู่แล้ว (log: "In the RWY 17 final approach path — 13.5 km out ... at 2 m", `005-desktop-d.png`) แค่จุดไฟก็ผ่าน ตลกดี แต่รู้สึกเหมือนโกงนิดหน่อย

## จุดที่งง
- **ปุ่ม T (SAS)**: hint M2.5 บอก "Turn SAS on (T)" แต่กด `t` ก่อนหรือทันทีหลัง Space HUD ยังขึ้น "Manual" (`054-desktop-s8.png`) ต้องแตะปุ่ม SAS ก่อนจุดระเบิดถึงติด (`055-desktop-s9.png`) หรือกด `t` กลางอากาศ (`053-desktop-s7.png`) ไม่มี feedback ว่า key ถูกรับหรือไม่
- **Space ไม่จุดระเบิดหลังปรับ slider** ในแผง Launch site (ดู BUG-2)
- **Mixing bench**: บลูพรินต์บอก "Craft slow powder first" แต่ไม่บอกว่าไปทำที่ไหน ต้องเลื่อนแผงซ้ายลงสุด กาง "Mixing bench" (พับทุกครั้งที่กลับเข้า Factory) เลือกหมวด Ox/Fu/Mo (เป็นหมวดนามธรรม ไม่ใช่สารจริง) แล้วกด "Stir the batch" แล้วกด Space ตามจังหวะ (`025-desktop-mb3.png`, `028-desktop-stir.png`) ผงที่ได้ quality 48% "Uneven; expect misfires" ผมกดผ่าน CLI จังหวะไม่ได้เลยไม่อาจสรุปว่ามินิเกมสนุกไหม
- การ์ด inspect มีปุ่ม "Flip" สองปุ่มชื่อเหมือนกัน แยกแนวตั้ง/นอนไม่ออก (`019-desktop-fu.png`)
- พี่แตะ "Fuel" หวังเปิดวัตถุดิบ ดันไปกดโดน "Wax fuel cell" ที่อยู่ในรายการ (selector ของเครื่องมือจับชื่อซ้ำ) เป็นปัญหาของ harness มากกว่าเกม แต่ชื่อซ้ำกันทำให้งงได้

## จุดที่ติด (นานกี่นาที)
| จุด | ติดนาน (นาที) | ออกได้ยังไง |
|---|---|---|
| หาที่ craft ผงดินปืนเพื่อปลดบลูพรินต์ Bang Fai | ~3 | เลื่อนแผงซ้ายสุด กาง Mixing bench, Stir แล้วกด Space ตามจังหวะ |
| Space ไม่ติดหลังปรับ slider | ~1 | คลิกพื้นที่ว่างเพื่อ blur |
| SAS (T) ไม่ติดก่อนปล่อย | ~2 (ลอง 3 รอบ) | แตะปุ่ม SAS ก่อน Space |

## จุดที่ขำ / เบื่อ
- ขำ: ซอมบี้ Control พูดซอมบี้ "Hnnnn gnarrr..." แล้วมี [Translation] ตามมา "The shark is never impressed." "We do not have pockets. We have teeth." "Gravity is one of us." "Paper on fire. Beautiful. Do it again." (จาก `log`)
- ขำ: ตกพื้นแล้วควันดำ สไลม์เขียวเต็มจอ คาปิบารามาเช็ดเลนส์ "Don't mind me. Just tidying." Milestone "Palate cleanser" และหลุมค้างถาวร "New crater ... It stays." (`043-desktop-im6.png`, `050-desktop-s4.png`)
- ขำ: Wan Hu's chair 47 กระบอก จุดแล้วเก้าอี้พลิกนอน ซอมบี้ "Dizzy. Very dizzy." แล้ว "Landed at 16 m/s. Picked itself up, minus 1 limb." (`073-desktop-wh2.png`, `075-desktop-wh4.png`)
- เบื่อ: โคมลอยช้ามาก ไม่เร่งก็ดูหน้าจอเปล่า ๆ (บิน T+1,488 s กว่าจะลงทะเล)
- เบื่อ: cutscene หลัง crash ยาวราว 14-17 วินาที (ชน T+138.8 summary ขึ้นราว T+156) มีปุ่ม "Skip ▸" แต่เล็กและจาง ที่ช่วยได้คือกด `r` เพื่อ Retry ได้เลย ดีมาก

## บั๊ก
### BUG-1 · ภาพซากไม่ตรงกับเหตุการณ์
- ขั้นตอน reproduce:
  1. M2 Bang Fai twin tails ปล่อยจาก Yasothon ให้ตกพื้นไม่มีร่ม
  2. ดูฉากหลังชน
- ที่เกิดขึ้น / ที่คาดไว้: ช่วงควัน/สไลม์ จรวดยังตั้งตรงบนรางเหมือนไม่ได้ตก (`043-desktop-im6.png`) ตอนชนจาก Sounding rocket ซากทั้งก้อนเอียงลอยเหนือหลุมพร้อมเงาด้านล่าง (`050-desktop-s4.png`) ชนที่ 140 m/s จากอวกาศ ซากยังก้อนสมบูรณ์ไม่แตก (`064-desktop-e5.png`) คาดว่าซากควรแตก/ฝังในหลุม ไม่ลอย
- Screenshot: `playtest/runs/retro-gamer/043-desktop-im6.png`, `050-desktop-s4.png`, `064-desktop-e5.png`
- Console: ไม่เห็น error

### BUG-2 · Space ไม่จุดระเบิดเมื่อโฟกัสค้างที่ slider
- ขั้นตอน reproduce:
  1. หน้า Launch เลือก Bamboo ramp แตะ slider แล้วกด Home
  2. กด Space (ลองกด Tab แล้ว Space ด้วย)
- ที่เกิดขึ้น / ที่คาดไว้: ค้าง "On the pad" T+0.0 (`033-desktop-fl1.png`) ใช้เวลาราว 1 นาที จนคลิกพื้นที่ว่าง (`document.activeElement` = BODY) ถึงติด (ลำดับ: Space ติดที่ T+5.6 หลังคลิก) คาดว่า Space ควรจุดระเบิดได้เสมอ
- Screenshot: `playtest/runs/retro-gamer/033-desktop-fl1.png`

### BUG-3 · SAS (T) ไม่ติดก่อนจุดระเบิด และ blueprint "Sounding rocket (LV-45)" ที่ hint บอกให้ใช้ ตีลังกาตกถ้าไม่เปิด SAS ก่อน
- ขั้นตอน reproduce:
  1. Factory > Sounding rocket (LV-45) (Pre-flight เตือนเหลือง "Centre of pressure is 100 cm above the centre of mass — it will tumble" `046-desktop-sr.png`)
  2. Roll out, กด `t` แล้ว Space แล้วบิน
- ที่เกิดขึ้น / ที่คาดไว้: Manual ตลอด, "Fins stalled / Flying tail-first" ตกที่ 139 m/s (`047-desktop-s1.png`); ถ้าแตะปุ่ม SAS ก่อนจุดระเบิดจะบินตรงถึง 390 km (`055-desktop-s9.png`) คาดว่าคีย์ `t` ควรทำงานเหมือนปุ่ม และบลูพรินต์ "ready to fly" ไม่ควรมีคำเตือน tumble ตั้งแต่ Factory ภาพ CoT ที่ปลายหัวฉีดกับข้อความ "CoP 100 cm above CoM" ผมไม่แน่ใจว่าตรงกันหรือไม่
- Screenshot: `046-desktop-sr.png`, `047-desktop-s1.png`, `054-desktop-s8.png`, `055-desktop-s9.png`

### BUG-4 · ฉาก Capybara เช็ดจอบังการคลิกปุ่ม
- ขั้นตอน reproduce: crash แล้วแตะ "10×" ระหว่าง cutscene
- ที่เกิดขึ้น / ที่คาดไว้: harness รายงาน `.rs-cleanser` (canvas) ดักคลิก ปุ่มไม่ตอบสนอง ผู้เล่นจริงจะรู้สึกว่าเกมค้าง ปุ่ม Skip ▸ เล็กและจาง (`045-desktop-im8.png` กับ `043-desktop-im6.png`)

### BUG-5 · Flight log สแปม "Wan Hu rocket tube burnout." ซ้ำ 47 บรรทัด
- ขั้นตอน reproduce: Wan Hu's chair (47 rockets) แล้วจุดระเบิด
- ที่เกิดขึ้น / ที่คาดไว้: บรรทัดเดียวกันซ้ำที่ T+2.6 ท่วมแผง log (`075-desktop-wh4.png`) ควรรวมเป็น "47 × burnout"
- Screenshot: `075-desktop-wh4.png`

### BUG-6 · มุก "tourist on the beach ... Full Moon Party" โผล่ที่ Yasothon
- ที่ Yasothon (ไม่มีทะเล) CAPCOM ยังพูดถึงนักท่องเที่ยวบนชายหาด ที่ 305 m, 2.0 km (จาก `log` ของเที่ยว M2) เล็กน้อย แต่รู้สึกว่าสคริปต์ไม่ตามฉาก

### BUG-7 · "Impact in ~15.0 s" ไม่ตรงเวลาจริง
- log T+625.7 "Impact in ~15.0 s — time warp off so you can watch." แต่ชนจริงที่ T+698.8 (ต่างราว 73 วินาทีในเกม ตอนที่บอกอยู่ที่ราว 10.5 km 640 m/s, `059-desktop-s13.png`) ตอนที่ผมเห็นเวลาจริงนานกว่านั้นราว 36 วินาที

### BUG-8 · (mobile) HUD ซ้อนกัน บังจรวด และ toolbar ล่างซ่อนปุ่ม ◀ ▶
- ขั้นตอน: เปิดบน viewport mobile 390x844 แล้วเข้าหน้า Launch
- ที่เกิดขึ้น: radar + กล่อง CAPCOM + แผงสถานะกินพื้นที่ราว 40-50% ภาพโคมโดนบัง และแผง Launch site ถูก radar ทับ (`079-mobile-m4.png`, `083-mobile-m8.png`) ปุ่ม ◀ ▶ อยู่ท้าย toolbar ที่เลื่อนแนวนอน ต้องแตะหา (`082-mobile-m7.png`) ปุ่มขนาด 36 px (ต่ำกว่า 44 px) แตะติดทุกครั้งที่ลอง ไม่มีบั๊กตอบสนอง ไม่ได้ลองบังคับถือค้าง (ใช้แตะเฉย ๆ)

## จะเล่นต่อไหม
ใช่ ถ้า Space Age Update ออก เกมจบในตัวจริง ไม่มีอะไรบีบให้จ่าย เล่นจบ M1→M2.5 ประมาณ 15 นาที และได้หน้า "End of Early Access" ตรง ๆ (`065-desktop-e6.png`) พร้อมปุ่ม "Keep flying in Sandbox" ผมอยากลองบลูพรินต์อื่น (Bang Fai steel, ผงคุณภาพสูง) และ sandbox ต่อ แต่ถ้าฉาก crash ยังเบาแบบนี้ ก็อยากให้ปรับก่อน

## คะแนน (1–10)
**7.5 / 10** — เสน่ห์กับมุกแน่นระดับ PvZ ภาคแรก ลูปสั้น ไม่มีกลิ่น EA แต่ฉาก crash ยังไม่หนึบแบบอาเขต และมีบั๊กเรื่องคีย์ SAS/โฟกัส

### เทียบ space flight sim ที่เคยเล่น
- ดีกว่า: เริ่มเล่นไว (บลูพรินต์พร้อมบิน), Pre-flight checks ใน Factory เป็นภาษาคน (thrust/weight, CoP/CoM, "21 motors fire into another part"), หลุมค้างถาวรหลัง crash, ปิด time warp อัตโนมัติก่อนชน, CAPCOM แยกตัวละครตามหน้าที่ (Prof. Owl, Aero-Duck, Lee) พูดสถานการณ์จริง (fins stalled, tail-first), Δv/burn time ใน Factory
- แย่กว่า/ขาด: ไม่เห็น maneuver node, ตัวชี้ prograde/retrograde ในจอบิน, SAS มีแค่ hold (ที่เห็น), ไม่มี Δv ต่อ stage ระหว่างบิน, ปุ่ม Map เทา (ไม่ได้ลองกดบนจรวดที่ใช้ได้), time warp ทดสอบแค่ถึง 10×
- Keyboard-only: ใช้ได้จริง Space (จุดระเบิด), `r` (retry หลังชน ดีมาก), `t` (SAS มีข้อจำกัดตามบั๊ก), ArrowLeft/Right (ใช้แล้วรับ), `4` (warp 10× ตาม tooltip) ปุ่มเหล่านี้ไม่มีรายการสรุปบนจอ ต้องชี้เมาส์ดู title หรือเดา ไม่ได้ลอง Z/X/Shift/Ctrl/Tab ครบ

### Monetization vibe
ไม่เจอ paywall, energy/timer, ปุ่มซื้อ หรือข้อความขายของเลย ป้าย "Early Access · Tier 0–2" และ "Coming Soon in the Space Age Update" ดูซื่อตรง หน้า "End of Early Access" บอกตรง ๆ แล้วให้เล่น Sandbox ต่อฟรี เกมรู้สึกครบในตัวในขอบเขตที่ประกาศ ติเล็กน้อย: แผงชิ้นส่วนมีหัวข้อ "Tier 3–4 · Space Age · Coming Soon" และบลูพรินต์ล็อกปนอยู่ กวนตาแต่ไม่ถึงขั้นล่อซื้อ

### มุมวิศวกร/กฎหมาย
- Disclaimer โคมลอยใกล้สนามบิน (EN + TH) อยู่ตั้งแต่หน้าแรกและหน้า Missions (`001-desktop-start.png`, `011-desktop-m.png`) สมเหตุสมผล
- ป้ายแดง "Maximum penalty: 3 years and/or 60,000 THB" + "CAAT public guidance on sky lanterns (NCPO Section 44 order) — verify current rules" (`005-desktop-d.png`) มี "verify current rules" ดี แต่เสี่ยงที่ผู้เล่นเชื่อว่าตัวเลขโทษและฐานอำนาจถูกต้องตามกฎหมายจริง และ CAPCOM พูดซ้ำเป็นมุก ผมยืนยันตัวเลข/คำสั่ง ม.44 เองไม่ได้ ควรตรวจสอบก่อนปล่อย ไม่ควรอ้างมาตรา/ตัวเลขที่ยังยืนยันไม่ได้
- ช่อง "District permit + Samui Tower notified" ในแผง Launch site (ไม่ได้ติ๊ก) อาจทำให้เข้าใจว่าแจ้งแล้วปล่อยได้ถูกกฎหมาย ควรมีข้อความกำกับ (ไม่ได้ลองติ๊ก ไม่ทราบผล)
- Tortoise Clerk "Under the Outer Space Treaty this zombie belongs to all humankind" และ "Filing under the Liability Convention" เป็นมุกกฎหมายที่เนียน แต่เป็นการตีความแบบมุก ไม่ใช่ข้อกฎหมายจริง ควรดูให้รู้ว่ามุก
- "paper ignites around 233 °C (451 °F)" (Fahrenheit 451) เป็นมุกเทียบหนังสือ ตัวเลขกระดาษจริงแตกต่างกันตามชนิด ควรตรวจสอบ

### เอกลักษณ์ (เทียบ PvZ ภาคแรก)
มีแล้ว: ตัวละครบุคลิกชัด (ซอมบี้ Control, คาปิบารา, นาก, เป็ด, นกฮูก, แมว), มุกประจำตัว, ศิลปะอบอุ่น, เกมจบในตัว ยังไม่ถึง: ซอมบี้ยังเป็นเสียงกับผู้โดยสาร ไม่ใช่ตัวเล่นที่มีกลไกเฉพาะแบบ PvZ และฉากล้มเหลวยังไม่หนึบเท่าฉากตายของซอมบี้ใน PvZ

## ที่ลอง crash (ตามที่ขอ)
- ตกพื้น: M2 Bang Fai ตกจาก 5.7 km ที่ 70 m/s (`043`, `044`, `045`) และ Sounding rocket ที่ 139 m/s (`050`) ได้หลุมค้าง
- ตกทะเล: โคมลอยลมพัดออกอ่าวไทย ลงที่ 9.1 km จากแท่น ความเร็ว 3.5 m/s ("Splashdown ... A shark came to look.") นุ่มนวลมาก ไม่ใช่ "crash" น้ำมีแผ่นสี่เหลี่ยมโปร่งใสลอยดูแปลก (`010-desktop-i.png`) (ไม่ได้ลองตกทะเลด้วยจรวดที่ความเร็วสูง)
- ไฟลุกกลางอากาศ: ใส่ Wax fuel cell สองก้อน โคมร้อน 700 °C "burns up" ได้ Milestone "Fahrenheit 451" (`020-desktop-fire.png` เป็นฉากหลังลงพื้นแล้ว ไม่ได้จับภาพขณะไหม้ในอากาศ)
- ระเบิดกลางอากาศของจรวด: ทำไม่สำเร็จ ลอง Wan Hu's chair ผงคุณภาพ 30% ผลคือพลิกตกที่ 16 m/s ไม่ระเบิด และ re-entry (10 MW/m², skin temp ~358 °C) ก็ไม่ทำให้ระเบิด ไม่ได้ลอง Bang Fai steel, ผงคุณภาพสูง, ถังเกินพิกัด

## ข้อเสนอ 3 ข้อ
1. แก้คีย์บอร์ด/SAS: ให้ `t` ทำงานก่อนจุดระเบิดและมี feedback บนจอ, ให้ Space จุดระเบิดได้แม้โฟกัสอยู่ที่ slider, เพิ่มรายการ keybind ในเกม, และทำให้ Sounding rocket "ready to fly" บินตรงได้ตามที่ hint สัญญา (หรือเอาป้าย ready ออก)
2. ทำฉาก crash ให้หนึบแบบอาเขต: hit-stop ~100 ms, กล้องสั่น, ลูกไฟ/ซากแตกก่อนสไลม์, ซากฝังในหลุมไม่ลอย (BUG-1), รวม log burnout 47 บรรทัด (BUG-5), ปุ่ม Skip ใหญ่ขึ้นและคลิกได้เสมอ
3. ตรวจและกำกับข้อความกฎหมาย: ยืนยันโทษ "3 ปี / 60,000 บาท" และ NCPO ม.44 ก่อนอ้าง หรือเขียนเป็นตัวอย่างในเกมชัด ๆ, เพิ่มข้อความกำกับที่ช่อง "District permit + Samui Tower notified"; บน mobile ลดหรือย้าย radar + CAPCOM ไม่ให้บังจรวด และขยายปุ่ม ◀ ▶ ให้ถึง 44 px
