# Phase 2 — MCP wrapper

See [`mcp/README.md`](./mcp/README.md).

## Quick start (local)

```bash
# 1) Backend (terminal A)
cd backend
# GEMINI_API_KEY in .env
poetry run uvicorn main:app --reload --port 7001

# 2) Install MCP (once)
cd ../mcp
pip install -e .

# 3) Point Cursor mcp.json at run_mcp.sh (see mcp/README.md)
```

## Hosted (Render — Figma-style URL)

```bash
# From vendor-screenshot-to-code/
# See render.yaml + Dockerfile.hosted
# Full steps: ../../docs/deploy-screenshot-mcp-render.md
```

After deploy, clients use:

```json
{
  "url": "https://YOUR-SERVICE.onrender.com/mcp",
  "headers": { "Authorization": "Bearer ${SCREENSHOT_TO_RN_MCP_API_KEY}" }
}
```

## Tools for agents

- `ping_backend`
- `screenshot_to_rn`
- `recording_to_rn`
- `refine_rn_ui`

## Next

**Phase 3** — `rn-agent-kit` design source `screenshot` + feature-grill Path C calling these tools.
