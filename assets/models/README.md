# assets/models/ — โมเดล .glb เพย์โหลด Tier 4–5 + หอจดหมายเหตุ (Codex)

โมเดลมาจาก **NASA-3D-Resources** (github.com/nasa/NASA-3D-Resources — public domain / ใช้ได้ฟรี)
`js/modelManager.js` โหลด + แคช + ปรับสเกล/กึ่งกลางอัตโนมัติ ใช้ทั้งในฉากปล่อยจรวด (`launch3d.js`)
และในโชว์รูม 3 มิติของหอจดหมายเหตุ (`codexViewer.js`)
**ถ้าไฟล์ไม่มี เกมจะสร้างรูปทรง procedural สำรองให้เอง (ไม่พัง)**

## ดึงโมเดลอัตโนมัติ

```bash
node scripts/fetch_models.js          # ดาวน์โหลดที่ยังไม่มี
node scripts/fetch_models.js --force  # ทับของเดิม
node scripts/fetch_models.js --list   # ดูรายการ/URL เฉย ๆ
# หรือถ้าไม่มี Node:
bash scripts/fetch_models.sh
```

## รายการไฟล์

| ไฟล์                 | เพย์โหลด (data.js)    | Tier | ที่มา (NASA-3D-Resources)          |
|----------------------|----------------------|------|-----------------------------------|
| `probe.glb`          | `pl_test_mass`       | 4    | Voyager Probe (A)                 |
| `capsule.glb`        | `pl_reentry_cap`     | 4    | Gemini (แคปซูลลูกเรือ)             |
| `cubesat.glb`        | `pl_cubesat`         | 5    | CubeSat – 2 RU Generic            |
| `cubesat_cluster.glb`| `pl_cubesat_cluster` | 5    | CubeSat – 1 RU Generic            |
| `comsat.glb`         | `pl_comsat_small`    | 5    | Tracking & Data Relay Sat (TDRS)  |
| `comsat_geo.glb`     | `pl_comsat_geo`      | 5    | GOES (ดาวเทียมค้างฟ้า)             |

นอกจากนี้ `fetch_models` ยังดึง `bennu.glb` (1999 RQ36 asteroid) มาเก็บไว้ด้วย — แต่หอจดหมายเหตุ
เลือกวาดก้อนหิน procedural แทน (โมเดล NASA ไม่มีเทกซ์เจอร์ เลยขาวโพลน) ไฟล์นี้จึงเป็นตัวสำรอง

ข้อกำหนด: `.glb` (binary glTF) เท่านั้น, ไม่ผ่าน Draco, < ~12 MB ต่อชิ้น
เพิ่ม/เปลี่ยนคู่ไฟล์↔เพย์โหลดได้ที่ `MODEL_FOR` ใน `js/modelManager.js` และ `MODELS` ใน `scripts/fetch_models.js`
