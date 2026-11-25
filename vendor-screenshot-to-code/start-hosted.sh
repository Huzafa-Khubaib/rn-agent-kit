#!/usr/bin/env bash
# All-in-one host: local screenshot-to-code backend + public Streamable HTTP MCP.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_PORT="${BACKEND_PORT:-7001}"
export SCREENSHOT_TO_CODE_WS_URL="${SCREENSHOT_TO_CODE_WS_URL:-ws://127.0.0.1:${BACKEND_PORT}}"
export MCP_TRANSPORT="${MCP_TRANSPORT:-streamable-http}"
export MCP_HOST="${MCP_HOST:-0.0.0.0}"
# Render / cloud hosts inject PORT
export PORT="${PORT:-${MCP_PORT:-8000}}"

echo "[hosted] backend → 127.0.0.1:${BACKEND_PORT}"
echo "[hosted] MCP HTTP → ${MCP_HOST}:${PORT}/mcp  (health: /health)"

cd "${ROOT}/backend"
poetry run uvicorn main:app --host 127.0.0.1 --port "${BACKEND_PORT}" &
BACKEND_PID=$!

cleanup() {
  kill "${BACKEND_PID}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Wait until backend accepts connections (max ~90s)
python - <<PY
import socket, time, sys
port = int("${BACKEND_PORT}")
for _ in range(90):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            sys.exit(0)
    except OSError:
        time.sleep(1)
print("backend did not become ready", file=sys.stderr)
sys.exit(1)
PY

cd "${ROOT}/mcp"
export PYTHONPATH="${ROOT}/mcp${PYTHONPATH:+:$PYTHONPATH}"
exec python -m screenshot_to_rn_mcp
