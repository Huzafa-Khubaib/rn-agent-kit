# Phase 3 — rn-agent-kit Screenshots design source

Kit now treats **Figma / Stitch / Screenshots** as equal design sources.

## User flow

```bash
npx rn-agentic-dev connect --design-source screenshot
# or interactive: pick “Screenshots / recordings”
```

Writes:

- `.agent/config.json` → `designSource: "screenshot"`, optional `screenshotsDir`
- `.env` → `GEMINI_API_KEY`, `SCREENSHOT_TO_CODE_WS_URL`, `SCREENSHOT_TO_RN_MCP_CWD`, …
- MCP merge → `screenshot-to-rn` (no Figma MCP)

## Agent flow

1. Router → feature-grill asks **1 Figma / 2 Stitch / 3 Screenshots**
2. Path C: per-screen PNGs → MCP `screenshot_to_rn` / `refine_rn_ui`
3. plan-review → jira-sync → ticket-to-code (adapt draft into app architecture)

## Prerequisites

1. Phase 1+2 vendor under `vendor-screenshot-to-code/`
2. Backend: `poetry run uvicorn main:app --port 7001` + `GEMINI_API_KEY`
3. `pip install mcp websockets` for the MCP package
