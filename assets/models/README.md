# assets/models/ — โมเดล .glb เพย์โหลด Tier 4–5

วางไฟล์ `.glb` (จาก NASA 3D Resources — https://nasa3d.arc.nasa.gov/models) ตามชื่อนี้
`js/modelManager.js` จะโหลด + แคช + ปรับสเกล/กึ่งกลางอัตโนมัติ
**ถ้าไฟล์ยังไม่มี เกมจะใช้รูปทรง procedural สำรองให้เอง (ไม่พัง)**

| ไฟล์ที่ต้องวาง            | เพย์โหลด (data.js)      | Tier | หมายเหตุโมเดลที่แนะนำ                    |
|--------------------------|------------------------|------|----------------------------------------|
| `probe.glb`              | `pl_test_mass`         | 4    | โพรบ/มวลจำลอง (เช่น Voyager, Juno)       |
| `capsule.glb`            | `pl_reentry_cap`       | 4    | แคปซูลกลับโลก (เช่น Orion, Apollo CM)   |
| `cubesat.glb`            | `pl_cubesat`           | 5    | CubeSat 3U                              |
| `cubesat_cluster.glb`    | `pl_cubesat_cluster`   | 5    | กลุ่ม CubeSat (หรือใช้ cubesat ซ้ำได้)  |
| `comsat.glb`             | `pl_comsat_small`      | 5    | ดาวเทียมสื่อสาร (เช่น TDRS, ACE)        |
| `comsat_geo.glb`         | `pl_comsat_geo`        | 5    | ดาวเทียมสื่อสารตัวใหญ่                   |

ข้อกำหนด: `.glb` (binary glTF) เท่านั้น, ไม่ผ่าน Draco compression (ยังไม่ได้ผูก DRACOLoader),
ขนาดไฟล์ควร < ~5 MB ต่อชิ้นเพื่อโหลดเร็ว โมเดลจะถูกสเกลให้พอดีจมูกจรวดอัตโนมัติ

เพิ่มเพย์โหลด↔ไฟล์คู่ใหม่ได้ที่ `MODEL_FOR` ใน `js/modelManager.js`
