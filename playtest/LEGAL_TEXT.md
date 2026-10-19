# ข้อความกฎหมาย / บทลงโทษ / ค่าปรับ ในเกม — รอตรวจ

ผมรวบรวมทุกข้อความในเกมที่อ้างกฎหมาย บทลงโทษ หรือค่าปรับ (ไทย + อังกฤษ) และ **เปลี่ยนในเกมเป็นข้อความกลาง ๆ ไว้ก่อน** จนกว่าคุณจะตรวจ ไม่ได้ยืนยันความถูกต้องของข้อความเดิมใด ๆ

- **ส่วน A**: ข้อความที่ผู้เล่นเห็น — มีทั้ง *ข้อความเดิม* และ *ข้อความที่ใช้ตอนนี้* พร้อมตำแหน่งในไฟล์ (บรรทัดของ *ก่อนแก้* / *หลังแก้* ใน commit นี้)
- **ส่วน B**: ข้อความกฎหมายที่อยู่ในโค้ดแต่ **ยังไม่แสดงในเกม** (ใช้ในเทสต์/คอมเมนต์) — ไม่ได้แก้
- ตัวเลขค่าปรับภายใน (`monitor.fines` = 60,000 และ id ของการแจ้งเตือน `fine`) ยังอยู่ในโค้ดเพราะเทสต์ใช้ แต่ **ไม่แสดงตัวเลขบนจออีกแล้ว**
- ข้อความเตือนหน้าแรกตอนนี้ใช้ถ้อยคำกลางตามตัวอย่างของคุณ ("…ผิดกฎหมายและมีโทษ… ไม่ใช่คำแนะนำทางกฎหมาย") — ถ้าจะให้ตรวจ ให้ตรวจข้อนี้ด้วย

## ส่วน A — ข้อความที่ผู้เล่นเห็น

| # | ที่ไหน / ภาษา | ไฟล์:บรรทัด (ก่อน → หลังแก้) | ข้อความเดิม | ข้อความที่ใช้ตอนนี้ | หมายเหตุ / ต้องตรวจอะไร |
|---|---|---|---|---|---|
| 1 | คำเตือนหน้าแรก / การ์ด M1 (EN) | `src/ui/softLaunchUI.ts:10` → `:10` | Disclaimer: Releasing sky lanterns near airports is illegal and highly dangerous in real life. This is a physics simulation. Do not try this at home. | Disclaimer: Releasing sky lanterns near airports is against the law and carries penalties in real life. This is a physics simulation, not legal advice. Do not try this at home. | แสดงที่การ์ดหน้าแรก (prologue) และในการ์ดภารกิจ 1 (หน้า Missions) |
| 2 | คำเตือนหน้าแรก / การ์ด M1 (TH) | `src/ui/softLaunchUI.ts:11` → `:11` | คำเตือน: การปล่อยโคมลอยใกล้สนามบินในชีวิตจริงเป็นเรื่องผิดกฎหมายและอันตรายมาก เกมนี้เป็นเพียงการจำลองทางฟิสิกส์เท่านั้น | คำเตือน: การปล่อยโคมลอยใกล้สนามบินผิดกฎหมายและมีโทษ เกมนี้เป็นเพียงการจำลองทางฟิสิกส์ ไม่ใช่คำแนะนำทางกฎหมาย |  |
| 3 | แจ้งเตือน "ไม่มี permit" — หัวข้อ (EN) | `src/law/airspaceMonitor.ts:72` → `:72` | title: 'No permit, no ATC notification' | title: 'Penalty recorded (game)' | ขึ้นเป็นแบนเนอร์ + บรรทัดใน Flight log เมื่อโคมล้ำเข้าเขต/แนวร่อนโดยไม่ติ๊กช่อง permit |
| 4 | แจ้งเตือน "ไม่มี permit" — หัวข้อ (TH) | `src/law/airspaceMonitor.ts:72` → `:72` | titleTh: 'ไม่ได้รับอนุญาต / ไม่ได้แจ้งหอบังคับการบิน' | titleTh: 'บันทึกบทลงโทษในเกม' |  |
| 5 | แจ้งเตือน "ไม่มี permit" — รายละเอียด: บทลงโทษ จำคุก 3 ปี/ปรับ 60,000 บาท (EN) | `src/law/airspaceMonitor.ts:73` → `:73` | detail: 'Sky lanterns need district approval and advance notice to the airport or ATC (date, time, place, number). Maximum penalty: 3 years and/or 60,000 THB.' | detail: 'No permission or notice was logged for this lantern, so the game records a penalty. In real life, releasing lanterns near airports is against the law and can carry penalties. This is game text, not legal advice.' | ต้องการให้ตรวจ: ตัวเลขโทษ "3 ปี / 60,000 บาท" และข้อกำหนดขออนุมัติอำเภอ + แจ้งท่าอากาศยาน/ATC |
| 6 | แจ้งเตือน "ไม่มี permit" — ฐานทางกฎหมายที่อ้าง (EN) | `src/law/airspaceMonitor.ts:74` → `:74` | basis: 'CAAT public guidance on sky lanterns (NCPO Section 44 order) — verify current rules' | basis: 'Game text — not an official source; check current official announcements.' | ต้องการให้ตรวจ: การอ้างคำสั่ง คสช. ม.44 + แนวปฏิบัติสาธารณะของ กพท. ปี 2017 |
| 7 | แจ้งเตือนเขตควบคุมสมุย — หัวข้อ (EN) | `src/law/airspaceMonitor.ts:51` → `:51` | 'Unauthorised object in the Samui control zone' | 'Object in the Samui control zone' | คำว่า "Unauthorised" ถือเป็นการตัดสินทางกฎหมายจึงตัดออก; รายละเอียด (5 NM / Class D / 2,000 ft) และ basis "AIP Thailand AD 2 VTSM" เป็นข้อมูลน่านฟ้า ไม่ได้แก้ — ดูส่วน B |
| 8 | แบนเนอร์เมื่อเกิดการแจ้งเตือน (EN) | `src/phases/launch/LaunchPhase.ts:1096` → `:1096` | `⚠ REGULATORY VIOLATION · ${a.title}` | `⚠ AIRSPACE ALERT · ${a.title}` |  |
| 9 | ป้ายสถานะเรดาร์ (EN) | `src/phases/launch/LaunchPhase.ts:1086` → `:1086` | bad ? 'VIOLATION' | bad ? 'ALERT' |  |
| 10 | เรดาร์: ยอดค่าปรับ (EN) | `src/phases/launch/LaunchPhase.ts:1089` → `:1089` | `Fines: ฿${m.fines.toLocaleString()}` | 'Penalty recorded (game)' | เดิมแสดงตัวเลข ฿60,000 ตัวเลขภายใน (monitor.fines) ยังอยู่ แต่ไม่แสดงบนจอ |
| 11 | การ์ดสรุป: จำนวนการละเมิด/ค่าปรับ (EN) | `src/phases/launch/LaunchPhase.ts:1558` → `:1558` | `${this.monitor.alerts.filter((a) => a.id !== 'fine').length} violation${this.monitor.alerts.length > 2 ? 's' : ''}${this.monitor.fines ? ` · ฿${this.monitor.fines.toLocaleString()}` : ''}` | `${this.monitor.alerts.filter((a) => a.id !== 'fine').length} airspace alert${this.monitor.alerts.length > 2 ? 's' : ''}${this.monitor.fines ? ' · penalty recorded' : ''}` |  |
| 12 | ช่อง permit ในแผง Launch site (EN) | `src/phases/launch/LaunchPhase.ts:194` → `:194` | District permit + Samui Tower notified</label> | Pretend permission + notice were given (game option) · สมมติว่าขออนุญาตแล้ว</label> | เดิมอาจทำให้เข้าใจว่า "แจ้งแล้วปล่อยได้ถูกกฎหมาย" |
| 13 | CAPCOM (เสมียนเต่า) หลังไม่มี permit: จำคุก 3 ปี/60,000 บาท (EN) | `src/phases/launch/LaunchPhase.ts:1109` → `:1109` | 'No district permit, no notice to the tower. That is up to three years or sixty thousand baht, or both. I am not paying it. Otter is paying it.' | 'No permission, no notice to the tower. In real life that is a serious problem. I am not paying for it. Otter is paying for it.' |  |
| 14 | CAPCOM (Zombie Control) หลังไม่มี permit: ค่าปรับ 60,000 บาท (EN) | `src/phases/launch/LaunchPhase.ts:1117` → `:1117` | 'Fine: sixty thousand baht. We do not have pockets. We do not have money. We have teeth.' | 'A penalty. We do not have pockets. We do not have money. We have teeth.' |  |
| 15 | CAPCOM (Zombie Control) จบ M1: ค่าปรับ 60,000 บาท (EN) | `src/phases/launch/LaunchPhase.ts:1057` → `:1057` | 'Mission complete. The fine is sixty thousand baht. We do not have pockets. Next: bigger fire, in Yasothon.' | 'Mission complete. The paperwork is enormous. We do not have pockets. Next: bigger fire, in Yasothon.' |  |
| 16 | ภารกิจ 1 — brief: "อ่านใบสั่ง/ค่าปรับ" (EN) | `src/campaign/campaign.ts:102` → `:102` | Then read the fine.' | Then read the report.' |  |
| 17 | ภารกิจ 1 — brief: "อ่านใบสั่ง" (TH) | `src/campaign/campaign.ts:103` → `:103` | แล้วค่อยอ่านใบสั่ง' | แล้วค่อยอ่านรายงาน' |  |
| 18 | ภารกิจ 1 — objective: "airspace violation" (EN) | `src/campaign/campaign.ts:108` → `:108` | Trigger a Samui airspace violation (control zone or an approach path) | Trigger a Samui airspace alert (control zone or an approach path) |  |
| 19 | ภารกิจ 1 — objective: "ละเมิดน่านฟ้า" (TH) | `src/campaign/campaign.ts:108` → `:108` | ทำให้เกิดการละเมิดน่านฟ้าสมุย (เขตควบคุมหรือแนวร่อนลง) | ทำให้เกิดการแจ้งเตือนน่านฟ้าสมุย (เขตควบคุมหรือแนวร่อนลง) |  |
| 20 | ภารกิจ 1 — hint: ช่อง permit (EN) | `src/campaign/campaign.ts:110` → `:110` | leave the permit box empty | leave the “pretend permission” box empty |  |
| 21 | ภารกิจ 1 — hint: ช่อง permit (TH) | `src/campaign/campaign.ts:111` → `:111` | ไม่ต้องติ๊ก permit | ไม่ต้องติ๊กช่อง “สมมติว่าขออนุญาตแล้ว” |  |
| 22 | บันทึกเรื่องราว M1: ค่าปรับ ฿60,000 และ "ฝ่ายกฎหมายแนะนำ" (EN) | `src/campaign/campaign.ts:116` → `:116` | The fine came to ฿60,000. I have eaten the ticket. There is no ticket. There was never a ticket. Our lawyers advise that rockets are "a separate matter" | I have written it all up. There is a form. There is always a form. Our colleagues suggest that rockets are "a separate matter" |  |
| 23 | บันทึกเรื่องราว M1: ค่าปรับ 60,000 บาท และ "ฝ่ายกฎหมายแนะนำ" (TH) | `src/campaign/campaign.ts:117` → `:117` | ค่าปรับ 60,000 บาท ข้าพเจ้ากินใบสั่งไปแล้ว ใบสั่งไม่มีอยู่จริง และไม่เคยมีมาก่อน ฝ่ายกฎหมายแนะนำว่าจรวดเป็น "อีกเรื่องหนึ่ง" | ข้าพเจ้าบันทึกเหตุการณ์ไว้ครบแล้ว มีแบบฟอร์มเสมอ เพื่อนร่วมงานแนะนำว่าจรวดเป็น "อีกเรื่องหนึ่ง" |  |
| 24 | บันทึกเรื่องราว M2.5 (Kármán): "ในทางกฎหมาย" (EN) | `src/campaign/campaign.ts:158` → `:158` | legally we are "a liquid-fuel incident" | officially we are "a liquid-fuel incident" |  |
| 25 | บันทึกเรื่องราว M2.5 (Kármán): "ในทางกฎหมาย" (TH) | `src/campaign/campaign.ts:159` → `:159` | ในทางกฎหมายเราคือ | ในทางเอกสารเราคือ |  |
| 26 | CAPCOM ข้ามเส้น Kármán: อ้างสนธิสัญญาอวกาศ (EN) | `src/phases/launch/capcom.ts:148` → `:148` | We are now in outer space. Under the Outer Space Treaty this zombie belongs to all humankind. Please sign here. | We are now in outer space. Please sign here, and then here. | ต้องการให้ตรวจ: การเชื่อมสนธิสัญญาอวกาศ 1967 กับเส้น 100 กม. (สนธิสัญญาไม่ได้กำหนดเส้นแบ่ง) |
| 27 | CAPCOM เศษไหม้: อ้างอนุสัญญาความรับผิด (EN) | `src/phases/launch/capcom.ts:151` → `:151` | Filing under the Liability Convention. | I am filing it. Under “other”. |  |
| 28 | CAPCOM ท่อนที่ทิ้ง: อ้างอนุสัญญาความรับผิด (EN) | `src/phases/launch/capcom.ts:157` → `:157` | Under the Liability Convention we pay for any buffalo it lands on. | Someone owes a buffalo an apology. |  |
| 29 | CAPCOM ดาวเทียมซอมบี้: อ้างอนุสัญญาจดทะเบียน (EN) | `src/phases/launch/capcom.ts:160` → `:160` | Registering one (1) zombie as a space object under the Registration Convention. | Registering one (1) zombie as a satellite. |  |
| 30 | CAPCOM โคมตกยังไหม้: "ทำไมโคมต้องมี permit" (EN) | `src/phases/launch/capcom.ts:179` → `:179` | Filing under “why lanterns need permits”. | Filing under “why lanterns are a problem”. |  |

## ส่วน B — ข้อความกฎหมายในโค้ดที่ยังไม่แสดงในเกม (ไม่ได้แก้)

`SpaceLawEngine` (กฎกติกาอวกาศ: Air Navigation Act B.E. 2497, สนธิสัญญาอวกาศ 1967, Registration Convention 1975, Liability Convention 1972, แนวทางเศษซากอวกาศ, ค่าปรับจำลอง 40,000 / 100,000 บาท) ไม่ได้ถูกเรียกใช้ในเกมตอนนี้ (มีเฉพาะเทสต์ `src/physics/tier1.test.ts`) และ `LAUNCH_SITES` ใน `zones.ts` ไม่มีที่ใช้ — ถ้าจะนำมาแสดงในอนาคต ต้องตรวจก่อน

| ไฟล์:บรรทัด | ข้อความ |
|---|---|
| `src/law/SpaceLawEngine.ts:44` | fineTHB?: number;             // illustrative in-game fine |
| `src/law/SpaceLawEngine.ts:83` | title: 'Launch without notifying the aviation authority', |
| `src/law/SpaceLawEngine.ts:85` | basis: 'Air Navigation Act B.E. 2497 and CAAT announcements on releasing objects into airspace (summary — verify current rules)', |
| `src/law/SpaceLawEngine.ts:88` | lesson: 'Rockets, lanterns and balloons share the sky with aircraft. Authorities need to know when and where you launch.', |
| `src/law/SpaceLawEngine.ts:92` | title: 'Launch site inside an airport safety zone', |
| `src/law/SpaceLawEngine.ts:94` | basis: 'CAAT airport vicinity restrictions (summary — verify current rules)', |
| `src/law/SpaceLawEngine.ts:101` | lesson: 'Aircraft climbing out or on final approach are low and slow — the worst place for an unguided rocket.', |
| `src/law/SpaceLawEngine.ts:105` | title: 'Rocket entered airport-controlled airspace', |
| `src/law/SpaceLawEngine.ts:107` | basis: 'Air Navigation Act B.E. 2497 (summary — verify current rules)', |
| `src/law/SpaceLawEngine.ts:112` | consequence: { reputation: -40, fineTHB: 40_000, abortMission: true }, |
| `src/law/SpaceLawEngine.ts:113` | lesson: 'Wind drift matters: check where your trajectory can carry the rocket, not just where you point it.', |
| `src/law/SpaceLawEngine.ts:117` | title: 'Exceeded permitted altitude', |
| `src/law/SpaceLawEngine.ts:119` | basis: 'Conditions of the launch permit', |
| `src/law/SpaceLawEngine.ts:122` | lesson: 'A permit is a promise about where your vehicle will be. Over-performing breaks it too.', |
| `src/law/SpaceLawEngine.ts:126` | title: 'Vehicle came down in a populated area', |
| `src/law/SpaceLawEngine.ts:128` | basis: 'Civil liability for damage to persons and property (summary)', |
| `src/law/SpaceLawEngine.ts:134` | consequence: { reputation: -25, fineTHB: 100_000 }, |
| `src/law/SpaceLawEngine.ts:135` | lesson: 'Plan a recovery area downrange, away from homes and roads.', |
| `src/law/SpaceLawEngine.ts:141` | title: 'Welcome to outer space', |
| `src/law/SpaceLawEngine.ts:143` | basis: 'Outer Space Treaty 1967, Arts. I, II & VI', |
| `src/law/SpaceLawEngine.ts:146` | lesson: 'Space is free for all states to explore and cannot be claimed by any nation (Arts. I–II). Your state is internationally responsible for your activities, including private ones, and must authorise and supervise them (Art. VI).', |
| `src/law/SpaceLawEngine.ts:150` | title: 'Peaceful uses of outer space', |
| `src/law/SpaceLawEngine.ts:152` | basis: 'Outer Space Treaty 1967, Art. IV', |
| `src/law/SpaceLawEngine.ts:155` | lesson: 'The rockets of the 1950s were built for war; the treaty bans nuclear weapons and other weapons of mass destruction in orbit, and keeps the Moon and celestial bodies for peaceful purposes only. The same launchers carried Sputnik and Gagarin.', |
| `src/law/SpaceLawEngine.ts:159` | title: 'Unregistered space object', |
| `src/law/SpaceLawEngine.ts:161` | basis: 'Registration Convention 1975, Art. II', |
| `src/law/SpaceLawEngine.ts:164` | lesson: 'The launching state records each object it puts in orbit in a national registry and informs the UN Secretary-General, so everyone knows whose object is whose.', |
| `src/law/SpaceLawEngine.ts:168` | title: 'Space object caused damage on another state’s territory', |
| `src/law/SpaceLawEngine.ts:170` | basis: 'Liability Convention 1972, Art. II (absolute liability)', |
| `src/law/SpaceLawEngine.ts:174` | lesson: 'For damage on the Earth’s surface or to aircraft in flight, the launching state pays even if it wasn’t careless — absolute liability. (Precedent: Cosmos 954 debris over Canada, 1978.)', |
| `src/law/SpaceLawEngine.ts:178` | title: 'Collision with another space object', |
| `src/law/SpaceLawEngine.ts:180` | basis: 'Liability Convention 1972, Art. III (fault-based liability)', |
| `src/law/SpaceLawEngine.ts:183` | lesson: 'In space, liability depends on fault — so your tracking data, manoeuvre logs and conjunction warnings become evidence.', |
| `src/law/SpaceLawEngine.ts:187` | title: 'Long-lived orbital debris', |
| `src/law/SpaceLawEngine.ts:189` | basis: 'IADC / UN COPUOS Space Debris Mitigation Guidelines (2007)', |
| `src/law/SpaceLawEngine.ts:193` | lesson: 'The guidelines ask that objects leave low Earth orbit within 25 years of mission end; some regulators now require much faster disposal (e.g. the US FCC 5-year rule for satellites it licenses). Lower your spent stage’s periapsis so drag pulls it down.', |
| `src/law/SpaceLawEngine.ts:231` | finesTHB: this.log.reduce((s, e) => s + (e.consequence.fineTHB ?? 0), 0), |
| `src/law/samui.ts:4` | * SOURCED (AIP Thailand, AD 2 VTSM — Surat Thani / Samui, eAIP 2025-01-23 AIRAC): |
| `src/law/samui.ts:10` | *     SFC – 2000 ft AGL, Class D, Samui Tower |
| `src/law/samui.ts:15` | * RULES SUMMARY (CAAT public guidance on sky lanterns, 2017): release only with district approval, |
| `src/law/samui.ts:16` | *   notify the airport / ATC of date, time, place and number, keep two contacts reachable; |
| `src/law/samui.ts:17` | *   penalty under the NCPO Section 44 order up to 3 years and/or 60,000 THB. Verify for currency. |
| `src/law/zones.ts:5` | * sizes and ceilings are illustrative game values, NOT the legal limits. |
| `src/law/zones.ts:7` | * Thailand before presenting this as regulatory teaching material. |
| `src/law/zones.ts:112` | note: 'Official festival site, permit on file.' }, |
| `src/law/airspaceMonitor.ts:53` | `At ${altAGL.toFixed(0)} m, ${(this.distNdb(pos) / 1000).toFixed(1)} km from the Samui NDB — inside the 5 NM Class D zone (SFC–2,000 ft).`, |
| `src/law/airspaceMonitor.ts:54` | 'AIP Thailand AD 2 VTSM, AD 2.17 (ATS airspace)', 0)); |
| `src/law/airspaceMonitor.ts:65` | 'Game model of an ICAO Annex 14 approach surface (not a published zone)', 0)); |
| `src/law/airspaceMonitor.ts:70` | const fine = 60_000; |

## ข้อความที่ *ไม่ได้* แก้ แต่ควรรู้ (ข้อมูลน่านฟ้า ไม่ใช่กฎหมาย/โทษ)

- รัศมี 5 NM / Class D / SFC–2,000 ft ของท่าอากาศยานสมุย (อ้าง AIP Thailand AD 2 VTSM, eAIP 2025-01-23) — แสดงในรายละเอียดการแจ้งเตือนเขตควบคุม (`airspaceMonitor.ts`)
- รูปทรงแนวร่อน RWY 17/35 — ป้ายกำกับในเกมบอกเองว่าเป็น "game model … not a published zone"
- หมายเหตุสถานที่ปล่อย (`samui.ts` LANTERN_SITES) เช่น "Chaweng … inside the Samui control zone. Do not."
