# screenshot-to-rn MCP (Phase 2)

MCP tools that call your **screenshot-to-code** backend and return **React Native / Expo** `App.tsx`.

## Tools

| Tool | Purpose |
|------|---------|
| `ping_backend` | Health-check WebSocket backend |
| `screenshot_to_rn` | Screenshot(s) → RN/Expo code |
| `recording_to_rn` | Screen recording → RN/Expo (needs Gemini) |
| `refine_rn_ui` | Update existing `App.tsx` with instructions (+ optional shots) |

## Local stdio (dev)

1. **Backend:**

```bash
cd ../backend
echo "GEMINI_API_KEY=your-key" > .env
poetry install
poetry run uvicorn main:app --reload --port 7001
```

2. **MCP deps:**

```bash
cd ../mcp
python3 -m pip install -e .
```

3. **Cursor `.cursor/mcp.json`:**

```json
{
  "mcpServers": {
    "screenshot-to-rn": {
      "command": "/ABS/PATH/TO/vendor-screenshot-to-code/mcp/run_mcp.sh",
      "env": {
        "SCREENSHOT_TO_CODE_WS_URL": "ws://127.0.0.1:7001",
        "GEMINI_API_KEY": "${GEMINI_API_KEY}"
      }
    }
  }
}
```

## Hosted / Render (Figma-style URL)

Deploy the all-in-one image (`Dockerfile.hosted` + `render.yaml` in the parent folder). Users connect like Figma remote MCP:

```json
{
  "mcpServers": {
    "screenshot-to-rn": {
      "url": "https://YOUR-SERVICE.onrender.com/mcp",
      "headers": {
        "Authorization": "Bearer ${SCREENSHOT_TO_RN_MCP_API_KEY}"
      }
    }
  }
}
```

See [docs/deploy-screenshot-mcp-render.md](../../docs/deploy-screenshot-mcp-render.md).

Local HTTP smoke test:

```bash
export MCP_TRANSPORT=streamable-http PORT=8000 MCP_API_KEY=dev-secret
export SCREENSHOT_TO_CODE_WS_URL=ws://127.0.0.1:7001
python -m screenshot_to_rn_mcp
# → http://127.0.0.1:8000/mcp  health: /health
```

## Env

| Variable | Default | Meaning |
|----------|---------|---------|
| `SCREENSHOT_TO_CODE_WS_URL` | `ws://127.0.0.1:7001` | Backend WebSocket base (no path) |
| `MCP_TRANSPORT` | `stdio` | `stdio` \| `streamable-http` \| `http` |
| `PORT` / `MCP_PORT` | `8000` | HTTP listen port (Render sets `PORT`) |
| `MCP_API_KEY` | — | Optional Bearer token for hosted MCP |
| `GEMINI_API_KEY` | — | Passed through to generate payload if set |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | — | Optional alternatives |
| `MCP_ALLOWED_HOSTS` | `*` | Comma hosts for DNS rebinding; `*` disables check |
