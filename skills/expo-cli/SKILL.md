---
name: expo-cli
description: >-
  Expo workflow guidance: when to use Expo, expo-router, prebuild, config
  plugins, EAS Build/Submit/Update, app.config.ts env variants, dev client,
  common errors. Use when starting or migrating an Expo app, configuring EAS,
  writing app.config, adding native modules, or debugging prebuild/dev-client.
globs: "**/{app,App}.{tsx,ts,jsx,js},**/app.config.*,**/app.json,**/eas.json,**/.eas/**"
alwaysApply: false
---

# expo-cli

Follow **Expo docs** (current SDK), **Expo Router**, **EAS Build / Submit / Update**, and **Config plugins**. Prefer the **Expo CNG** (Continuous Native Generation) workflow: treat `android/` / `ios/` as **generated** unless you eject to a long-lived bare fork.

## When to use Expo

| Choose Expo when                                                          | Prefer bare RN CLI when                                     |
| ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| You want OTA updates, EAS, and fast native integration via config plugins | You already maintain large custom native trees outside Expo |
| Most needs are covered by Expo SDK + config plugins                       | You must vendor native code Expo cannot generate            |
| Greenfield app                                                            | Legacy native app with no migration plan                    |

Default recommendation: **Expo + prebuild + Dev Client + EAS**, not Classic “Expo Go only” for production apps with custom native code.

## Expo Router

Cite **Expo Router docs**.

- File-based routes in `app/`.
- Use layouts `_layout.tsx`, groups `(auth)`, `(tabs)`.
- Typed routes: enable experiments / typedRoutes in `app.json` per current SDK docs.
- Prefer `router.push` / `Link` over imperative React Navigation unless you need nested custom navigators.

```tsx
// ✅ Good
import { Stack } from "expo-router";
export default function Layout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

// ❌ Bad — duplicate navigation trees fighting Expo Router
```

Deep links: configure `scheme` in `app.config.ts` and use Expo Linking helpers (**Expo — Linking**).

## Prebuild (CNG)

```bash
npx expo prebuild
npx expo prebuild --clean   # regenerate native projects
```

**Rules**

- Source of truth: `app.config.ts` + config plugins + `package.json` native deps.
- **Never hand-edit** generated `android/` / `ios/` in a managed CNG repo unless you have committed them as a bare fork and accept merge pain.
- After adding a native module: install → add config plugin if required → `prebuild` → run via Dev Client.

```ts
// ✅ Good — customize via config
export default {
  expo: {
    plugins: [["expo-build-properties", { ios: { deploymentTarget: "15.1" } }]],
  },
};

// ❌ Bad — edit Podfile by hand every week in a CNG project
```

## Config plugins

- Prefer official plugins from Expo modules and well-maintained libraries.
- Keep plugins in `app.config.ts` (typed) not only `app.json`.
- Order can matter (auth, notifications, build-properties)—follow each library’s Expo install guide.
- Local plugins: `plugins/withMyMod.js` + export from config.

## EAS Build / Submit / Update

Cite **EAS Build**, **EAS Submit**, **EAS Update**.

### eas.json (sketch)

```json
{
  "cli": { "version": ">= 16.0.0", "appVersionSource": "remote" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "channel": "development"
    },
    "staging": {
      "distribution": "internal",
      "channel": "staging",
      "env": { "APP_ENV": "staging" }
    },
    "production": {
      "channel": "production",
      "env": { "APP_ENV": "production" }
    }
  },
  "submit": {
    "production": {}
  }
}
```

```bash
eas build --profile development --platform ios
eas build --profile production --platform all
eas submit --platform ios
eas update --channel staging --message "fix checkout"
```

**Rules**

- Match **update channels** to build profiles.
- Native-breaking changes require a **new binary**, not only `eas update`.
- Use `runtimeVersion` policy (`appVersion` or fingerprint) per **EAS Update — Runtime versions**.

## app.config.ts + env variants

```ts
// app.config.ts
import type { ExpoConfig, ConfigContext } from "expo/config";

const APP_ENV = process.env.APP_ENV ?? "development";

const extras = {
  development: { apiUrl: "https://dev.api.example.com", appEnv: "development" },
  staging: { apiUrl: "https://staging.api.example.com", appEnv: "staging" },
  production: { apiUrl: "https://api.example.com", appEnv: "production" },
} as const;

type AppEnv = keyof typeof extras;

export default ({ config }: ConfigContext): ExpoConfig => {
  const env = (APP_ENV in extras ? APP_ENV : "development") as AppEnv;
  const isProd = env === "production";

  return {
    ...config,
    name: isProd ? "MyApp" : `MyApp (${env})`,
    slug: "my-app",
    scheme: "myapp",
    ios: {
      bundleIdentifier: isProd ? "com.example.myapp" : `com.example.myapp.${env}`,
    },
    android: {
      package: isProd ? "com.example.myapp" : `com.example.myapp.${env}`,
    },
    extra: extras[env],
    updates: { url: "https://u.expo.dev/<project-id>" },
    runtimeVersion: { policy: "appVersion" },
  };
};
```

```ts
// ✅ Good — read via expo-constants
import Constants from "expo-constants";
export const apiUrl = Constants.expoConfig?.extra?.apiUrl as string;

// ❌ Bad — assume process.env.API_URL exists on device without babel plugin / extra
```

Use distinct **bundle IDs / applicationIds** per env so staging doesn’t clobber prod on devices.

## Dev Client

Cite **Expo Dev Clients**.

```bash
npx expo install expo-dev-client
eas build --profile development
npx expo start --dev-client
```

- Use Dev Client when you need custom native code (not available in Expo Go).
- Expo Go is fine for prototypes with SDK-only APIs.

## Common errors and fixes

| Symptom                                  | Likely cause                      | Fix                                          |
| ---------------------------------------- | --------------------------------- | -------------------------------------------- |
| “Unable to resolve module” after install | Metro cache / wrong node          | `npx expo start -c`; verify `package.json`   |
| Native module null / not found           | Binary outdated vs JS             | Rebuild Dev Client / EAS binary              |
| Config plugin not applied                | Edited native without prebuild    | `npx expo prebuild --clean`                  |
| OTA “update ignored”                     | runtimeVersion mismatch           | Align policy; ship new binary                |
| Push / permissions missing               | Missing plugin usage              | Add plugin; rebuild                          |
| Duplicate symbols / Pod errors           | Manual Podfile drift              | Regenerate via prebuild; don’t mix workflows |
| Wrong env API URL                        | `APP_ENV` not passed to EAS       | Set `env` in `eas.json` profile              |
| Scheme / deep link fails                 | Missing `scheme` / intent filters | Set in app config; rebuild                   |

```bash
# ✅ Good hygiene
npx expo-doctor
npx expo install --fix   # align versions to SDK
```

## Common mistakes

1. Hand-editing `ios/` / `android/` in a CNG project, then losing changes on `--clean`.
2. Shipping custom native deps but still trying to run in **Expo Go**.
3. Using `eas update` for native/SDK upgrades (needs new binary).
4. Same bundle identifier for dev/staging/prod.
5. Putting secrets in `extra` that shouldn’t ship in the client.
6. Forgetting config plugins for notifications, Google Sign-In, etc.
7. Pinning random Expo package versions instead of `npx expo install`.
8. Ignoring `expo-doctor` and SDK compatibility tables.
9. Misaligned EAS **channel** vs who receives updates.
10. Copy-pasting outdated `app.json` keys from old SDK blog posts—always check current **Expo docs**.
