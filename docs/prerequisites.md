# Prerequisites

Install these before using `rn-agentic-dev` end-to-end. The CLI itself only requires Node 18+.

## Required for the CLI

| Tool | Why | Install |
| ---- | --- | ------- |
| **Node.js 18+** (20 LTS recommended) | Runs `rn-agentic-dev` | [nodejs.org](https://nodejs.org/) or `brew install node` |
| **npm** / **yarn** / **pnpm** | Package manager | Comes with Node / `corepack enable` |
| **Git** | Branches in `ticket-to-code` | [git-scm.com](https://git-scm.com/) or `brew install git` |

```bash
node -v    # >= 18
npm -v
git --version
```

## Required for a React Native / Expo app

| Tool | Why | Install |
| ---- | --- | ------- |
| **Expo CLI** (if Expo) | Dev client / prebuild | `npx expo` |
| **Watchman** (macOS, recommended) | Metro file watching | `brew install watchman` |

## Optional — native builds & E2E

| Tool | Why | Install |
| ---- | --- | ------- |
| **JDK 17** | Android Gradle | `brew install --cask temurin@17` |
| **Android Studio + SDK** | Android builds / emulator | set `ANDROID_HOME` |
| **Xcode** (macOS) | iOS builds / simulator | Mac App Store + `xcode-select --install` |
| **CocoaPods** | iOS deps | `brew install cocoapods` |
| **Maestro** | E2E flows | `curl -fsSL "https://get.maestro.mobile.dev" \| bash` then add `~/.maestro/bin` to `PATH` |
| **EAS CLI** | Cloud builds | `npm i -g eas-cli` |

```bash
curl -fsSL "https://get.maestro.mobile.dev" | bash
echo 'export PATH="$PATH:$HOME/.maestro/bin"' >> ~/.zshrc && source ~/.zshrc
maestro --version
```

## Optional — design / Jira

| Need | Setup |
| ---- | ----- |
| Figma MCP + token | `init --sdlc` or `connect`; set `FIGMA_TOKEN` / `FIGMA_ACCESS_TOKEN` |
| Stitch | `connect --design-source stitch`; screenshots + Tailwind export |
| Screenshots → RN | `connect --design-source screenshot`; local backend **or** hosted Render URL ([deploy guide](./deploy-screenshot-mcp-render.md)) |
| Atlassian / Jira | set `JIRA_SITE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` |

Never commit secrets. Prefer `.env` (gitignored) + `.env.example`.
