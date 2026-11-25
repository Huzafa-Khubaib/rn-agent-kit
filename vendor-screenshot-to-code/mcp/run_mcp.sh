#!/usr/bin/env bash
# Run the MCP server without a full editable install (dev convenience).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
export PYTHONPATH="${ROOT}${PYTHONPATH:+:$PYTHONPATH}"
exec python3 -m screenshot_to_rn_mcp "$@"
