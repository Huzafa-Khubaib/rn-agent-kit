# Phase 1 — React Native / Expo stacks

Working copy of [abi/screenshot-to-code](https://github.com/abi/screenshot-to-code) with two new output stacks:

- `react_native` → TypeScript `App.tsx` (RN primitives + StyleSheet)
- `expo` → Expo-friendly `App.tsx`

## What changed

- Backend `Stack` literals + `is_react_native_stack()`
- System / create / video prompts for mobile fidelity
- Agent tools: `App.tsx` paths; `screenshot_preview` disabled for RN
- Frontend stack dropdown + Code-tab default (no HTML iframe preview)

## Run (when you have a Gemini key)

```bash
cd vendor-screenshot-to-code/backend
echo "GEMINI_API_KEY=your-key" > .env
poetry install && poetry run playwright install chromium
poetry run uvicorn main:app --reload --port 7001

# other terminal
cd ../frontend && pnpm install && pnpm dev
```

Open http://localhost:5173 → pick **React Native** or **Expo** → drop a screenshot.

## Next phases

- Phase 2: MCP wrapper — see [PHASE2_MCP.md](./PHASE2_MCP.md) / [mcp/README.md](./mcp/README.md)
- Phase 3: Wire into `rn-agent-kit` as design source option 3 (Screenshots)
