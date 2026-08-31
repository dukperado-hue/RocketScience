#!/usr/bin/env bash
# scripts/fetch_models.sh — ดาวน์โหลดโมเดล .glb ฟรี ปลอดลิขสิทธิ์ จาก NASA-3D-Resources
#   (github.com/nasa/NASA-3D-Resources — public domain / usage-free)
# ทางเลือกแทน `node scripts/fetch_models.js` สำหรับเครื่องที่ไม่มี Node
#
#   bash scripts/fetch_models.sh          # ข้ามไฟล์ที่มีอยู่
#   FORCE=1 bash scripts/fetch_models.sh  # ดาวน์โหลดทับ
set -u

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/assets/models"
RAW="https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master"
mkdir -p "$DIR"

# local-name|NASA path (space จะถูก encode ให้อัตโนมัติ)
MODELS=(
  "cubesat.glb|3D Models/CubeSat - 2 RU Generic/CubeSat - 2 RU Generic.glb"
  "cubesat_cluster.glb|3D Models/CubeSat - 1 RU Generic/CubeSat - 1 RU Generic.glb"
  "capsule.glb|3D Models/Gemini/Gemini.glb"
  "comsat.glb|3D Models/Tracking and Data Relay Satellites (TDRS) (A)/Tracking and Data Relay Satellites (TDRS) (A).glb"
  "comsat_geo.glb|3D Models/Geostationary Operational Environmental Satellites/Geostationary Operational Environmental Satellites.glb"
  "probe.glb|3D Models/Voyager Probe (A)/Voyager Probe (A).glb"
  "bennu.glb|3D Models/1999 RQ36 asteroid/1999 RQ36 asteroid.glb"
)

urlencode() { local s="$1" o="" c i; for ((i=0;i<${#s};i++)); do c="${s:i:1}"
  case "$c" in [a-zA-Z0-9._~/-]) o+="$c";; " ") o+="%20";; *) printf -v c '%%%02X' "'$c"; o+="$c";; esac
done; printf '%s' "$o"; }

ok=0; fail=0; skip=0
for entry in "${MODELS[@]}"; do
  name="${entry%%|*}"; src="${entry#*|}"
  dest="$DIR/$name"
  if [[ -f "$dest" && "${FORCE:-0}" != "1" ]]; then echo "•  $name — มีอยู่แล้ว (ข้าม)"; skip=$((skip+1)); continue; fi
  url="$RAW/$(urlencode "$src")"
  printf '↓  %-22s ... ' "$name"
  if curl -fsSL --max-time 60 -o "$dest.part" "$url" && head -c4 "$dest.part" | grep -q "glTF"; then
    mv "$dest.part" "$dest"; echo "สำเร็จ ($(($(wc -c < "$dest")/1024)) KB)"; ok=$((ok+1))
  else
    rm -f "$dest.part"; echo "ล้มเหลว"; fail=$((fail+1))
  fi
done
echo; echo "เสร็จ: $ok ดาวน์โหลด, $skip ข้าม, $fail ล้มเหลว  ->  $DIR"
[[ $fail -eq 0 ]]
