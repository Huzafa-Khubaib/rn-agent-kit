---
name: rn-typescript-react
description: >-
  Strict TypeScript and React Native UI patterns: no any, discriminated unions,
  zod validation, hooks rules, memoization guidance, FlatList/FlashList,
  re-renders, naming, Jest + RNTL, ESLint. Use when writing or reviewing TS/TSX,
  fixing type errors, optimizing lists, adding tests, or configuring eslint/tsconfig.
globs: "**/*.{ts,tsx}"
alwaysApply: false
---

# rn-typescript-react

Target **TypeScript strict mode**, **React 18+ / RN New Architecture–ready** patterns, and current **Jest** + **React Native Testing Library** APIs. Cite **TypeScript Handbook**, **React docs**, **React Native docs**, **Zod**, **TanStack Query**, and **Testing Library — React Native**.

## Strict tsconfig

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true
  }
}
```

Enable path aliases (`@/*`) in both `tsconfig` and Babel (`babel-plugin-module-resolver` or Expo defaults).

## No `any`

- Prefer `unknown` + narrowing, generics, or `zod` inference.
- ESLint: `@typescript-eslint/no-explicit-any`: `error`.
- Avoid `as any`; use `satisfies`, type guards, or schema parse.

```ts
// ✅ Good
function parseUser(input: unknown): User {
  return userSchema.parse(input);
}

// ❌ Bad
function parseUser(input: any) {
  return input as User;
}
```

## Discriminated unions

Model UI and domain states as unions with a `type` / `status` tag.

```ts
// ✅ Good
type LoadState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: Error };

function View({ state }: { state: LoadState<Product> }) {
  switch (state.status) {
    case "idle":
    case "loading":
      return <Spinner />;
    case "success":
      return <ProductCard product={state.data} />;
    case "error":
      return <ErrorText message={state.error.message} />;
  }
}

// ❌ Bad — optional fields that lie
type LoadState = { loading: boolean; data?: Product; error?: string };
```

## Zod for runtime validation

Validate **boundaries**: API JSON, route params, SecureStore, form payloads.

```ts
import { z } from "zod";

export const productSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  priceCents: z.number().int().nonnegative(),
});
export type Product = z.infer<typeof productSchema>;

// ✅ Good — parse at the edge
export async function getProduct(id: string): Promise<Product> {
  const json: unknown = await api.get(`/products/${id}`);
  return productSchema.parse(json);
}

// ❌ Bad — trust network shapes
export async function getProduct(id: string): Promise<Product> {
  return api.get(`/products/${id}`);
}
```

## Hooks rules

- Only call hooks at top level of React functions (see **Rules of Hooks**).
- Custom hooks: `use*` prefix; return stable tuples/objects intentionally.
- Put side effects in `useEffect` with correct deps; prefer Query/Mutation over manual effects for server I/O.
- Don’t conditionally define components inside parents (remounts + hook resets).

```tsx
// ❌ Bad
function Screen({ items }) {
  if (!items) return null;
  const [x, setX] = useState(0); // conditional hook
}
```

## Memoization — when NOT to use it

**Do not** default to `useMemo` / `useCallback` / `React.memo`.

Use them only when:

1. Referential equality is required by a child that is expensive **and** memoized, or
2. A dependency array would otherwise change every render and trigger expensive work, or
3. Profiling shows a real cost.

```tsx
// ✅ Good — plain handler; child is a light View
<Button onPress={() => submit(id)} />;

// ❌ Bad — cargo-cult memo
const onPress = useCallback(() => submit(id), [id]);
const title = useMemo(() => "Save", []);
```

Prefer **state colocation**, **narrow Zustand selectors**, and **Query select** over memo wrappers.

## FlatList / FlashList performance

Prefer **`@shopify/flash-list`** for long lists (see **FlashList docs**). Otherwise optimize FlatList:

- `keyExtractor` stable and unique
- `getItemType` / `overrideItemLayout` when using FlashList
- Avoid inline `renderItem` props that close over changing objects when the row is memoized—pass `item` only
- `estimatedItemSize` (FlashList) required
- Don’t put heavy work in `renderItem`; precompute in data layer

```tsx
// ✅ Good
const renderItem = useCallback(({ item }: { item: Product }) => <ProductRow product={item} />, []);
<FlashList data={products} renderItem={renderItem} estimatedItemSize={72} />;

// ❌ Bad
<FlatList
  data={products}
  renderItem={({ item }) => (
    <ProductRow product={item} style={{ margin: Math.random() }} extra={entireStore} />
  )}
/>;
```

## Avoiding re-renders

- Split components so list rows don’t subscribe to whole-app state.
- Zustand: `useStore(s => s.count)` not `useStore()`.
- Context: split state/dispatch contexts; don’t put frequently changing values in a giant provider.
- Pass `id` + selectors instead of fat objects when possible.
- Images: known size; avoid animating layout thrash on every frame without `useNativeDriver` / Reanimated.

## Naming conventions

| Kind               | Pattern           | Example                  |
| ------------------ | ----------------- | ------------------------ |
| Component          | PascalCase        | `ProductCard`            |
| Hook               | `use` + camelCase | `useProduct`             |
| Screen             | `*Screen`         | `ProductScreen`          |
| Service fn         | verb + noun       | `fetchProduct`           |
| Zustand store      | `use*Store`       | `useSettingsStore`       |
| Types              | PascalCase        | `Product`                |
| Zod schema         | `*Schema`         | `productSchema`          |
| Query key          | factory           | `productKeys.detail(id)` |
| Boolean            | `is`/`has`/`can`  | `isLoading`              |
| Event handler prop | `on*`             | `onSubmit`               |
| Local handler      | `handle*`         | `handleSubmit`           |

Files: `ProductCard.tsx`, `useProduct.ts`, `productSchema.ts`. Avoid `index.tsx` for non-barrel screens when it hurts searchability.

## Testing (Jest + RNTL)

Cite **React Native Testing Library** queries (`getByRole`, `getByText`, `getByLabelText`). Prefer user-centric assertions.

```tsx
import { render, screen, userEvent } from "@testing-library/react-native";

it("submits email", async () => {
  const user = userEvent.setup();
  const onSubmit = jest.fn();
  render(<LoginForm onSubmit={onSubmit} />);
  await user.type(screen.getByLabelText("Email"), "a@b.com");
  await user.press(screen.getByRole("button", { name: "Sign in" }));
  expect(onSubmit).toHaveBeenCalledWith({ email: "a@b.com" });
});
```

- Mock network at the service boundary or MSW; don’t assert on implementation details of hooks.
- Use `@testing-library/react-native` async utilities; avoid manual `act` unless required.
- Snapshot sparingly—prefer behavior tests.

## ESLint (baseline)

```js
// eslint.config.js — sketch; adapt to flat config + RN
{
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended-type-checked",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:react-native/all",
  ],
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/consistent-type-imports": "error",
    "react/react-in-jsx-scope": "off",
    "react-hooks/exhaustive-deps": "error",
  },
}
```

Pair with **Prettier**; don’t fight formatting in ESLint.

## Common mistakes

1. Disabling `strict` or sprinkling `any` / `@ts-ignore` to “save time”.
2. Optional-field state machines instead of discriminated unions.
3. Trusting API JSON without **Zod** (or similar) at the boundary.
4. Wrapping everything in `useCallback`/`memo` without a measured need.
5. Anonymous `renderItem` with unstable props → row thrashing.
6. Selecting entire Zustand store → render storms.
7. Testing implementation (`useState` calls) instead of UI behavior.
8. `console.log` debugging left in list `renderItem`.
9. Incorrect hook dependency arrays silencing `exhaustive-deps`.
10. Using outdated Testing Library APIs (`getByTestId` as first choice, shallow enzyme).
