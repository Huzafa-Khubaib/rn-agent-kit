# Deploy screenshot-to-rn MCP on Render

Host the MCP so teammates connect like **Figma remote** — only a URL in Cursor, no local `run_mcp.sh`.

## What you get

| Endpoint | Purpose |
|----------|---------|
| `https://<service>.onrender.com/mcp` | Cursor / Claude MCP URL |
| `https://<service>.onrender.com/health` | Render health check |

One Docker service runs:

1. screenshot-to-code **backend** (WebSocket on `127.0.0.1:7001`)
2. **Streamable HTTP MCP** on Render’s `PORT`

## 1. Render Dashboard

1. Open [dashboard.render.com](https://dashboard.render.com/)
2. **New** → **Web Service**
3. Connect the GitHub repo that contains `vendor-screenshot-to-code/`  
   *(If that folder is gitignored locally, push it to a branch/repo first, or use Docker Hub below.)*
4. Settings:

| Field | Value |
|-------|--------|
| Root Directory | `vendor-screenshot-to-code` |
| Runtime | Docker |
| Dockerfile Path | `./Dockerfile.hosted` |
| Health Check Path | `/health` |

Or **New** → **Blueprint** and point at `vendor-screenshot-to-code/render.yaml`.

## 2. Environment variables (Render → Environment)

| Key | Required | Notes |
|-----|----------|--------|
| `GEMINI_API_KEY` | **Yes** (recommended) | Server-side only — never commit |
| `MCP_API_KEY` | **Yes** for public URL | Shared Bearer secret for clients |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Optional | Extra models |
| `MCP_ALLOWED_HOSTS` | Optional | Default `*` (ok on Render) |

Generate a long random `MCP_API_KEY` (password manager). Same value goes in each user’s `.env` as `SCREENSHOT_TO_RN_MCP_API_KEY`.

## 3. Deploy

Click **Create Web Service** / **Apply**. Wait until status is **Live**.  
Copy the service URL, e.g. `https://screenshot-to-rn-mcp.onrender.com`.

## 4. Users connect (Cursor)

**Option A — kit wizard**

```bash
npx rn-agentic-dev connect --design-source screenshot
# pick “Remote hosted URL (Render)”
```

**Option B — manual `.cursor/mcp.json`**

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

Put the Bearer secret in the user environment / project `.env`:

```bash
SCREENSHOT_TO_RN_MCP_API_KEY=same-as-render-MCP_API_KEY
```

Restart Cursor → Settings → MCP → confirm **screenshot-to-rn** is connected → try `ping_backend`.

## 5. Docker Hub path (if vendor is not on GitHub)

From this machine:

```bash
cd vendor-screenshot-to-code
docker build -f Dockerfile.hosted -t YOUR_DOCKERHUB/screenshot-to-rn-mcp:latest .
docker push YOUR_DOCKERHUB/screenshot-to-rn-mcp:latest
```

Render → **New Web Service** → **Deploy an existing image from a registry** → paste that image.  
Set the same env vars as above. Health path `/health`.

## Notes

- Free/starter Render services **spin down** when idle; first request can be slow.
- Remote tools should prefer `image_data_urls` (base64) — server cannot read the user’s local disk paths.
- Do not put `GEMINI_API_KEY` or `MCP_API_KEY` in git or in `mcp.json` as raw strings.
