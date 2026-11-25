---
name: rn-architecture
description: >-
  Feature-based React Native architecture: folders, layers, navigation, Zustand +
  TanStack Query, dependency rules, error boundaries, env config, scalability.
  Use when structuring a new RN/Expo app, adding a feature module, choosing state
  libraries, wiring navigation, or reviewing folder/layer boundaries.
globs: "**/*.{ts,tsx,js,jsx}"
alwaysApply: false
---

# rn-architecture

Prefer **feature-based** structure over type-based dumping grounds (`components/`, `hooks/` at root). Cite **React Native docs**, **Expo Router docs**, **React Navigation docs**, **Zustand**, and **TanStack Query** for APIs.

## Folder structure

```text
src/
  app/                    # Expo Router routes only (or navigation/ for RN CLI)
  features/
    auth/
      components/
      hooks/
      services/
      store/
      types/
      index.ts            # public API of the feature
    home/
      ...
  shared/
    components/           # truly cross-feature UI
    hooks/
    lib/                  # http client, storage, logger
    theme/
    types/
  config/                 # env, feature flags
```

**Rule:** A feature may import `shared/*` and its own folders. Features must **not** import another feature’s internals—only that feature’s `index.ts` (or a dedicated `api.ts`).

```ts
// ✅ Good — consume public API
import { useSession } from "@/features/auth";

// ❌ Bad — reach into another feature
import { sessionStore } from "@/features/auth/store/sessionStore";
```

## Layers (UI / domain / data)

| Layer      | Lives in                          | May call                               |
| ---------- | --------------------------------- | -------------------------------------- |
| **UI**     | `components/`, screens/routes     | hooks, shared UI                       |
| **Domain** | `hooks/`, `store/`, pure `types/` | services, other domain in same feature |
| **Data**   | `services/`                       | HTTP, SecureStore, native SDKs         |

```ts
// ✅ Good — screen is thin
export function LoginScreen() {
  const { mutate, isPending, error } = useLogin();
  return <LoginForm onSubmit={mutate} loading={isPending} error={error} />;
}

// ❌ Bad — UI talks to network + parses JSON
export function LoginScreen() {
  const onSubmit = async (email: string) => {
    const res = await fetch("/login", { method: "POST", body: JSON.stringify({ email }) });
    const data = await res.json();
    setUser(data.user);
  };
}
```

Keep **domain logic** out of JSX. Keep **transport details** (URLs, headers) out of hooks when a `services/` function can own them.

## Navigation

### Expo Router (preferred for Expo)

- Routes under `app/` (or `src/app/`). Screens stay dumb; data in feature hooks.
- Typed routes via Expo Router typed routes (see **Expo Router — Typed routes**).
- Prefer route groups `(auth)`, `(tabs)` over deep relative `../../` imports.

```tsx
// ✅ Good — href + params typed / validated at boundary
import { Link } from "expo-router";
<Link href={{ pathname: "/product/[id]", params: { id } }} />;

// ❌ Bad — string soup with no feature ownership
navigation.navigate("Product" as any, { id });
```

### React Navigation (RN CLI / bare)

- One root navigator; feature stacks registered from `features/*/navigation`.
- Define a single `RootParamList`; pass it to `NativeStackScreenProps`.
- Cite **React Navigation — TypeScript**.

```ts
// ✅ Good
export type RootParamList = {
  Home: undefined;
  Product: { id: string };
};

// ❌ Bad
navigation.navigate("Product", { id: 123 as any });
```

## State: Zustand + TanStack Query

| Concern                 | Tool                                            |
| ----------------------- | ----------------------------------------------- |
| Server/async cache      | **TanStack Query** (`useQuery` / `useMutation`) |
| Client UI/session prefs | **Zustand**                                     |
| Form ephemeral state    | Local `useState` / React Hook Form              |

```ts
// ✅ Good — server state in Query
const { data } = useQuery({ queryKey: ["products", id], queryFn: () => productsApi.get(id) });

// ✅ Good — client flags in Zustand
const theme = useSettingsStore((s) => s.theme);

// ❌ Bad — mirror server lists into Zustand
const setProducts = useCatalogStore((s) => s.setProducts);
useEffect(() => {
  productsApi.list().then(setProducts);
}, []);
```

**Dependency rules for stores**

- Selectors must be narrow: `useStore(s => s.user.id)` not `useStore(s => s)`.
- No importing React components into store modules.
- Persist only intentional slices (see **Zustand — Persist middleware**).

## Dependency rules (enforce in review)

1. `app/` / screens → features + shared (not services directly if a hook exists).
2. `features/x/components` → same-feature hooks/types; not sibling features.
3. `services` → `shared/lib`, never UI.
4. No circular imports; break cycles via `types/` or `index.ts` re-exports.
5. Native modules and SDKs only behind `services/` or `shared/lib`.

## Error boundaries

- Wrap each root tab / stack with an error boundary.
- Use `react-native-error-boundary` or a small class boundary; log to Sentry/Crashlytics in `onError`.
- Failed Query states stay in the feature UI; boundaries catch render crashes.

```tsx
// ✅ Good
<ErrorBoundary fallback={<CrashScreen />} onError={reportError}>
  <FeatureRoot />
</ErrorBoundary>

// ❌ Bad — uncaught render throw kills the whole app with no recovery
```

## Env config

- Use **Expo** `app.config.ts` + `expo-constants` / `expo-env`, or `react-native-config` for bare.
- Never import secrets into client bundles that are not meant to be public.
- Gate with a typed config module:

```ts
// src/config/env.ts
import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra ?? {};

export const env = {
  apiUrl: String(extra.apiUrl ?? ""),
  appEnv: (extra.appEnv ?? "development") as "development" | "staging" | "production",
};

if (!env.apiUrl) throw new Error("Missing extra.apiUrl");
```

```ts
// ❌ Bad
const API = process.env.API_URL; // untyped, often undefined in RN without a plugin
```

## Scalability rules

- New product area → new `features/<name>` with its own `index.ts`.
- Cap shared UI: if only one feature uses it, move it into that feature.
- Prefer FlashList for long lists; virtualize by default.
- Code-split heavy screens with lazy routes / `React.lazy` where the bundler supports it.
- Feature flags live in `config/`, not scattered magic booleans.
- Keep `shared/types` for cross-cutting DTOs only; feature-specific types stay local.

## Common mistakes

1. **Type-based folders at scale** — `src/components/Button123.tsx` with no owner.
2. **God store** — one Zustand store for server + UI + navigation.
3. **Fetching in `useEffect` + `useState`** instead of TanStack Query.
4. **Cross-feature deep imports** that break encapsulation.
5. **Business logic in screen files** (hard to test, hard to reuse).
6. **Untyped navigation params** and `as any` casts.
7. **Shipping `.env` secrets** that belong only on the server.
8. **No error boundary** around navigators → white screen of death.
9. **Circular feature imports** via barrel files that re-export everything.
10. **Ignoring official patterns** — reinvent routing instead of Expo Router / React Navigation docs.
