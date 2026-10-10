#!/usr/bin/env bash
# Calls the two booking endpoints the way Vaani will. Run `npm run dev` first.
# Usage: ./scripts/test-endpoints.sh [base_url]
set -euo pipefail
BASE="${1:-http://localhost:3000}"
SECRET="$(grep -E '^VAANI_TOOL_SECRET=' .env.local | cut -d= -f2-)"

echo "== 1. Free slots (Tuesday evening preferred)"
SLOTS=$(curl -sS -X POST "$BASE/api/vaani/slots" -H "content-type: application/json" -H "x-vaani-secret: $SECRET" \
  -d '{"preferred_day":"tuesday","preferred_time":"evening"}')
echo "$SLOTS"
SLOT_ID=$(echo "$SLOTS" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.slots?.[0]?.slot_id||"")})')
[ -z "$SLOT_ID" ] && { echo "No slot returned; stopping."; exit 1; }

echo; echo "== 2. Book the first slot (test caller, no email)"
curl -sS -X POST "$BASE/api/vaani/book" -H "content-type: application/json" -H "x-vaani-secret: $SECRET" -d @- <<JSON
{"slot_id":"$SLOT_ID","caller_name":"Test Caller","caller_phone":"+910000000000","locality":"Kothrud","property_type":"3BHK","carpet_area_sqft":"1400","scope":"Kitchen, living room, both bedrooms","timeline":"Done by March","email_confirmation":"no"}
JSON
echo; echo; echo "== 3. Same slot again (should come back as slot_taken with alternatives)"
curl -sS -X POST "$BASE/api/vaani/book" -H "content-type: application/json" -H "x-vaani-secret: $SECRET" -d @- <<JSON
{"slot_id":"$SLOT_ID","caller_name":"Second Caller","caller_phone":"+910000000001","locality":"Baner","property_type":"2BHK","scope":"Full home","timeline":"January","email_confirmation":"no"}
JSON
echo
