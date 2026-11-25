# rn-agentic-dev

## 0.4.0

### Minor Changes

- Add always-on `rn-agent-router` + `bug-triage` skills, guided `connect` MCP wizard, `doctor --connections` live Figma/Jira tests, and optional Claude `--claude-hook` UserPromptSubmit injector.
- `connect` asks **Figma or Stitch** (equal): Stitch skips Figma token/MCP/live Figma test; diagrammatic README.

### Patch Changes

- feature-grill: screenshot + manual CSS mode when Figma MCP is rate-limited; require user approval before any third-party library.
- feature-grill + router: equal Figma vs Stitch design-source paths (MCP/Inspect vs screenshot + Tailwind).

## 0.3.0

### Minor Changes

- Add feature-grill → plan-review approval gate → jira-sync → verify workflow, plus intake/coverage/verify CLI commands and stronger SDLC init (MCP merge, .env gitignore).

### Patch Changes

- Document install prerequisites and recommended app packages in the README so npm users see setup steps clearly.

## 0.2.0

### Minor Changes

- Initial public release: init/doctor/update CLI, adapters, figma-to-tokens pipeline, SDLC skills, and GitHub workflow templates.
