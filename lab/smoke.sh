#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE=(docker compose -f lab/compose.yaml)
BASE="${RACMOND_URL:-http://localhost:3000}"
command -v docker >/dev/null || { echo 'Docker is required for the real stack.' >&2; exit 1; }
command -v node >/dev/null || { echo 'Node.js is required to parse API responses.' >&2; exit 1; }
"${COMPOSE[@]}" config --quiet
"${COMPOSE[@]}" ps
curl -fsS "$BASE/api/lab/health" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s);if(!d.liveEnabled||d.services.some(x=>!x.available)){console.error(d);process.exit(1)}})'
ORDER=$(curl -fsS -X POST "$BASE/api/lab?mode=live" -H 'Content-Type: application/json' -d '{"scenario":"happy","quantity":1}')
ID=$(printf '%s' "$ORDER" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).order.id))')
TRACE=$(printf '%s' "$ORDER" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).order.traceId))')
echo "Created live order $ID / trace $TRACE"
for attempt in $(seq 1 40); do
  RESULT=$(curl -fsS "$BASE/api/lab/orders/$ID?mode=live")
  if printf '%s' "$RESULT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s).order;const names=new Set(o.spans.map(s=>s.service));process.exit(o.status==="completed"&&names.size===5?0:1)})'; then
    echo 'PASS: order completed and one trace contains all five services.'; break
  fi
  [[ "$attempt" -lt 40 ]] || {
    echo "$RESULT"
    echo '--- Redis stream diagnostics ---'
    "${COMPOSE[@]}" exec -T redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli XINFO STREAM orders.accepted; REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli XINFO GROUPS orders.accepted; REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli XINFO STREAM invoice.posted; REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli XINFO GROUPS invoice.posted' || true
    echo '--- Accounting persistence diagnostics ---'
    "${COMPOSE[@]}" exec -T postgres psql -U racmond -d lab_accounting -c "SELECT count(*) AS invoices FROM invoices; SELECT count(*) AS outbox_rows, count(published_at) AS published FROM outbox; SELECT count(*) AS journal_rows FROM journal_entries;" || true
    echo '--- CRM worker logs ---'
    "${COMPOSE[@]}" logs --tail=80 crm-worker || true
    echo '--- Accounting logs ---'
    "${COMPOSE[@]}" logs --tail=120 accounting || true
    echo 'Timed out waiting for business completion and trace export.' >&2; exit 1;
  }
  sleep 2
done
count_invoices() { "${COMPOSE[@]}" exec -T postgres psql -U racmond -d lab_accounting -At -c "SELECT count(*) FROM invoices WHERE order_id='$ID';"; }
count_reservations() { "${COMPOSE[@]}" exec -T postgres psql -U racmond -d lab_erp -At -c "SELECT count(*) FROM reservations WHERE order_id='$ID' AND state='reserved';"; }
[[ "$(count_invoices)" == "1" ]] || { echo 'Expected exactly one invoice.' >&2; exit 1; }
[[ "$(count_reservations)" == "1" ]] || { echo 'Expected one active reservation.' >&2; exit 1; }
"${COMPOSE[@]}" exec -T postgres psql -U racmond -d lab_accounting -At -c "SELECT count(*) FROM journal_balance WHERE order_id='$ID' AND NOT balanced;" | grep -qx 0
REPLAY=$(curl -fsS -X POST "$BASE/api/lab?mode=live" -H 'Content-Type: application/json' -d "{\"scenario\":\"duplicate-replay\",\"replayOrderId\":\"$ID\",\"quantity\":1}")
REPLAY_TRACE=$(printf '%s' "$REPLAY" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).order.traceId))')
[[ "$REPLAY_TRACE" != "$TRACE" ]] || { echo 'Replay reused the original trace ID.' >&2; exit 1; }
for attempt in $(seq 1 30); do
  RESULT=$(curl -fsS "$BASE/api/lab/orders/$ID?mode=live")
  if printf '%s' "$RESULT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s).order;process.exit(o.status==="completed"&&o.traceId===process.argv[1]?0:1)})' "$REPLAY_TRACE"; then break; fi
  [[ "$attempt" -lt 30 ]] || { echo "$RESULT"; echo 'Replay did not complete CRM notification.' >&2; exit 1; }
  sleep 2
done
[[ "$(count_invoices)" == "1" ]] || { echo 'Replay duplicated an invoice.' >&2; exit 1; }
[[ "$(count_reservations)" == "1" ]] || { echo 'Replay duplicated a reservation.' >&2; exit 1; }
echo 'PASS: replay completed with a new trace and preserved invoice, journal balance and reservation counts.'
curl -fsS "$BASE/api/runtime?mode=live" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s);if(d.snapshots.length!==2||d.snapshots.some(x=>!x.available||!Number.isFinite(x.heapUsed))){console.error(d);process.exit(1)}})'
echo 'PASS: both Java and Go runtime endpoints returned measured samples.'
if [[ "${KEEP_LAB_ORDERS:-0}" != "1" ]]; then
  echo "Test order retained for idempotency audit: $ID. Reset the local lab volumes to remove all lab data."
fi
echo 'Live smoke checks passed.'
