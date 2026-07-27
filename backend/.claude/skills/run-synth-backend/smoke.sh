#!/usr/bin/env bash
# Smoke-test driver for the Synth backend Express API.
# Launches backend/server.js in the background, waits for readiness,
# hits a handful of real endpoints (DB-backed + live JamBase proxy),
# prints pass/fail per check, then stops the server.
#
# Usage:
#   bash .claude/skills/run-synth-backend/smoke.sh          # run checks, then stop server
#   bash .claude/skills/run-synth-backend/smoke.sh --keep   # leave server running after checks
#
# Must be run with cwd = backend/ (the script cd's there defensively anyway).

set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PORT="${PORT:-3001}"
LOG_FILE="${TMPDIR:-/tmp}/synth-backend.log"
KEEP=0
[ "${1:-}" = "--keep" ] && KEEP=1

cd "$BACKEND_DIR" || exit 1

pass=0
fail=0
check() {
  local desc="$1" url="$2" grep_for="$3"
  local body
  body=$(curl -s "$url")
  if echo "$body" | grep -q "$grep_for"; then
    echo "PASS  $desc"
    pass=$((pass+1))
  else
    echo "FAIL  $desc"
    echo "      GET $url"
    echo "      -> $body"
    fail=$((fail+1))
  fi
}

echo "Starting backend server (log: $LOG_FILE)..."
NODE_ENV=development PORT="$PORT" node server.js > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

echo "Waiting for http://localhost:$PORT/health ..."
ready=0
for i in $(seq 1 30); do
  if curl -sf "http://localhost:$PORT/health" > /dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done

if [ "$ready" -ne 1 ]; then
  echo "Server did not become ready in 30s. Log tail:"
  tail -n 40 "$LOG_FILE"
  kill "$SERVER_PID" 2>/dev/null
  exit 1
fi

check "health check"              "http://localhost:$PORT/health"                          '"status":"OK"'
check "setlist proxy health"      "http://localhost:$PORT/api/setlists/health"              '"status":"ok"'
check "DB-backed concert search"  "http://localhost:$PORT/api/concerts/search?query=test"   '"success":true'
check "DB-backed recent concerts" "http://localhost:$PORT/api/concerts/recent?limit=1"      '"success":true'
check "live JamBase events proxy" "http://localhost:$PORT/api/jambase/events?limit=1"       '"success":true'

echo
echo "$pass passed, $fail failed"

if [ "$KEEP" -eq 1 ]; then
  echo "Server left running: PID $SERVER_PID on port $PORT (log: $LOG_FILE)"
else
  kill "$SERVER_PID" 2>/dev/null
  echo "Server stopped."
fi

[ "$fail" -eq 0 ]
