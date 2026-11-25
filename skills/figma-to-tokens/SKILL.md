---
name: figma-to-tokens
description: >-
  Extract design tokens (colors, typography, spacing, radius, shadows, light/dark)
  from Figma or Google Stitch into a typed React Native theme. Use when the user
  asks to sync/update/extract design tokens, set up the theme, match the design
  system, or when design/tokens.json is missing or stale — not for new feature
  screens (router → feature-grill). Also use before prd-to-jira. Never hand-write
  token files; always run the script.
alwaysApply: false
---

# figma-to-tokens

Turns a design source into **one source of truth** and a typed theme, deterministically.

```
Figma / Stitch ──(agent + MCP)──▶ design/source-snapshot.json
                                        │  npx rn-agentic-dev tokens build   (deterministic script)
                                        ▼
        design/tokens.json  (W3C DTCG)  ──▶ src/shared/theme/tokens.ts (light/dark, typed)
        design/tokens-report.md         ──▶ what a human must fix in Figma/Stitch + what changed
```

**Division of labour (important):** you (the agent) only _collect_ raw values into the snapshot.
The script does ALL naming, alias handling, conversion, diffing and code generation. Never write
`tokens.json` or `tokens.ts` by hand, and never "improve" generated output; fix the source and re-run.

## Hard rules

1. Never edit `design/tokens.json`, `src/shared/theme/tokens.ts` or `design/tokens-report.md` manually. They are generated.
2. Never invent a token. If a value is not in the design source, leave it out. The report will flag the gap.
3. Components use theme tokens only: no hex/rgb colors, no font-family strings, no magic spacing/radius/font-size numbers (see "Using tokens").
4. Do not guess dark-mode values. Dark values must come from the source (a Dark mode, or a dark palette).
5. If the report has `error` items, tell the user and stop before building screens that depend on them.
6. Never put the Figma token into any file. It lives in the `FIGMA_TOKEN` env var only.

## Step 0: Pre-flight

- Is there a Figma file URL or a Stitch design? If neither, ask the user for one.
- Does `design/tokens.json` already exist? Then this is a **re-run**: the script will diff for you.
- Is `package.json` script `"tokens": "rn-agentic-dev tokens"` present? If not, use `npx rn-agentic-dev tokens <cmd>`.

## Step 1A: Collect from Figma (MCP)

Tool names depend on the installed Figma MCP version; use whichever tools return **variables**, **styles** and **node metadata**
(typically `get_variable_defs`, `get_metadata`, `get_design_context`). If no Figma MCP is configured, stop and tell the user to run `rn-agentic-dev doctor`.

Collect in this order and write everything into `design/source-snapshot.json`:

1. **Variables.** Run the variables tool on the file's top-level frames (every page's main frames), then union the results.
   - If you can obtain the full variables structure (collections + modes + aliases), put it in `variables` (shape below).
   - Otherwise, store the flat result of `get_variable_defs` in `flatVariables` (`{ "color/primary/500": "#3B82F6", ... }`).
2. **Dark mode.** `get_variable_defs` returns values for the mode applied to the node. To capture dark values, use a frame that has
   Dark mode applied (ask the user to duplicate one key frame in Dark mode if none exists) and store that result in `flatVariablesDark`
   with the same names. Do NOT approximate dark colors.
3. **Text styles** → `textStyles[]`, **effect styles** → `effectStyles[]`, **paint/color styles** → `colorStyles[]`.
   - `lineHeightPx` / `letterSpacingPx` in px; if Figma gives percent use `lineHeightPercent` / `letterSpacingPercent`.
   - Only visible `DROP_SHADOW` layers become shadows (React Native has no inner shadow).
4. Record `fileUrl`.

Optional shortcut when the user has a Figma token: `FIGMA_TOKEN=... npx rn-agentic-dev tokens fetch --url <figma-url>`.
Limits: the Variables REST API needs a Figma **Enterprise** plan (without it you get styles only; use the MCP path for variables).

## Step 1B: Collect from Google Stitch

Stitch features and export formats change quickly. Use whatever your Stitch/Stitch-MCP access provides; the most reliable input is the
**HTML + Tailwind export**, whose `tailwind.config` contains `theme.extend`.

1. Open the exported HTML, find the Tailwind config object, and copy `colors`, `spacing`, `borderRadius`, `fontFamily`, `fontSize`, `boxShadow` into `snapshot.tailwind`.
2. If a dark variant of the design exists, copy its palette into `tailwind.darkColors` (same keys as `colors`).
3. Use only hex or `rgb()/rgba()` colors. `hsl()`, `oklch()` and CSS variables are reported and skipped.
4. Stitch has no text styles, so you get `font-size.*`, `line-height.*`, `font-family.*` tokens, not `typography.*`.
   If the project needs full text styles, ask the user to define them in Figma, or add them to the snapshot as `textStyles` manually from the PRD.
5. You may combine sources: `source: "mixed"` with `variables` (Figma) and `tailwind` (Stitch). On a name collision, the script keeps the first and reports an error.

## Snapshot format

```jsonc
{
  "source": "figma", // "figma" | "stitch" | "mixed"
  "fileUrl": "https://www.figma.com/design/AbC123/App",
  "variables": {
    // optional; same shape as Figma REST `meta`
    "variables": {
      "v1": {
        "id": "v1",
        "name": "color/primary/500",
        "resolvedType": "COLOR",
        "variableCollectionId": "c1",
        "valuesByMode": { "m1": { "r": 0.23, "g": 0.51, "b": 0.96, "a": 1 } },
      },
      "s1": {
        "id": "s1",
        "name": "color/background/default",
        "resolvedType": "COLOR",
        "variableCollectionId": "c2",
        "valuesByMode": {
          "m2": { "type": "VARIABLE_ALIAS", "id": "v3" },
          "m3": { "type": "VARIABLE_ALIAS", "id": "v4" },
        },
      },
    },
    "variableCollections": {
      "c2": {
        "id": "c2",
        "name": "Semantic",
        "defaultModeId": "m2",
        "modes": [
          { "modeId": "m2", "name": "Light" },
          { "modeId": "m3", "name": "Dark" },
        ],
      },
    },
  },
  "flatVariables": { "color/primary/500": "#3B82F6", "spacing/md": 16 }, // fallback (single mode)
  "flatVariablesDark": { "color/primary/500": "#60A5FA" }, // same names, Dark applied
  "textStyles": [
    {
      "name": "Heading/H1",
      "fontFamily": "Inter",
      "fontStyle": "Bold",
      "fontSize": 32,
      "lineHeightPx": 40,
    },
  ],
  "effectStyles": [
    {
      "name": "Elevation/md",
      "effects": [
        {
          "type": "DROP_SHADOW",
          "visible": true,
          "color": { "r": 0, "g": 0, "b": 0, "a": 0.1 },
          "offset": { "x": 0, "y": 4 },
          "radius": 8,
          "spread": 0,
        },
      ],
    },
  ],
  "colorStyles": [{ "name": "Brand/Primary", "color": { "r": 1, "g": 0, "b": 0, "a": 1 } }],
  "tailwind": {
    "colors": {},
    "darkColors": {},
    "spacing": {},
    "borderRadius": {},
    "fontFamily": {},
    "fontSize": {},
    "boxShadow": {},
  },
}
```

Colors are Figma-style floats `0..1` in `variables`/styles, and CSS strings in `flatVariables`/`tailwind`.
Use at least one of `variables`, `flatVariables`, `colorStyles`, `textStyles`, `effectStyles`, `tailwind`.

## Step 2: Build

```bash
npx rn-agentic-dev tokens build            # writes tokens.json, tokens.ts, tokens-report.md (+ ThemeProvider.tsx once)
npx rn-agentic-dev tokens build --strict   # exit 1 if the report contains errors (use in CI/agent loops)
```

Then **read `design/tokens-report.md`** and act on it:

| Report item                                     | What you do                                                                                                                  |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 🔴 error (`unresolved-alias`, `name-collision`) | Tell the user exactly what to change in Figma/Stitch. Do not work around it in code.                                         |
| 🟡 `unnamed-token`                              | List the placeholder names (e.g. "Color 1") and ask the user to rename them semantically.                                    |
| 🟡 `missing-dark-mode`                          | Tell the user dark mode will mirror light until a Dark mode exists in the design.                                            |
| 🟡 `missing-category`                           | Spacing/radius/typography missing: ask the user to add them as variables/styles; do not invent a scale.                      |
| 🟡 `unsupported-effect`                         | Inner shadows/blur are not supported by RN; propose a design alternative.                                                    |
| 🔵 `font-loading`                               | Make sure each font family/weight is loaded (expo-font `useFonts` or native linking) under the exact name used in the theme. |
| 🔵 `single-mode-source`                         | Explain how to capture Dark values (Step 1A.2 / 1B.2).                                                                       |

Summarize the report to the user in a few lines: counts, top issues, and the "Changes since last run" section.

## Step 3: Re-runs and diffs

- Re-run Step 1 → `build`. The script diffs against the previous `tokens.json` and lists **Added / Removed / Changed** in the report.
- **Removed or renamed tokens break code.** Run `npx tsc --noEmit` right after `build`. Every compile error pointing at `theme.*` is a usage you must migrate.
  Do not keep a stale alias to hide the error.
- Commit `design/source-snapshot.json`, `design/tokens.json`, `design/tokens-report.md` and `tokens.ts` together, in one commit: `chore(design): sync tokens`.
- Hand-edited `tokens.json`? Run `npx rn-agentic-dev tokens generate` to rebuild only `tokens.ts`. The next `build` from the snapshot will overwrite
  hand edits, so put real fixes in the design file.

## Token model

DTCG file (`design/tokens.json`): `$type`, `$value`, `$description`, aliases like `"{color.primary.500}"`. The **light/default** value is `$value`;
other modes live in `$extensions.mode`:

```json
{
  "color": {
    "$type": "color",
    "primary": { "500": { "$value": "#3b82f6" } },
    "background": {
      "default": {
        "$value": "{color.neutral.50}",
        "$description": "Screen background",
        "$extensions": { "mode": { "dark": "{color.neutral.900}" } }
      }
    }
  }
}
```

Naming normalization: names are split on `/`, lower-cased, non-alphanumerics become `-` (`Color/On Surface` → `color.on-surface`).
Color variables always land under `color.*`.

Conversion to React Native values (all done by the script):

| DTCG                        | Theme value                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `color` `#rrggbb[aa]`       | string, lower-case                                                                                            |
| `dimension` `16px` / `1rem` | number `16` (1rem = 16)                                                                                       |
| `fontWeight`                | string `"700"` (RN requirement)                                                                               |
| `typography`                | `{ fontFamily, fontSize, fontWeight, lineHeight (px), letterSpacing }`, spreadable into a `TextStyle`         |
| `shadow`                    | `{ shadowColor, shadowOffset, shadowOpacity, shadowRadius (=blur/2), elevation (≈blur/2) }`, first layer only |
| `duration`                  | ms number                                                                                                     |

Theme root keys: `color`→`colors`, `shadow`→`shadows`, `font/family`→`fontFamilies`, `font/size`→`fontSizes`, others keep their name
(`spacing`, `radius`, `typography`, `opacity`). Nested keys are camelCased (`on-surface` → `onSurface`); numeric keys stay (`primary[500]`).
`shadowRadius`/`elevation` are heuristics; check shadows visually on Android and iOS.

## Using tokens in components

```tsx
// GOOD
import { useTheme } from '@/shared/theme/ThemeProvider';

export function PrimaryButton({ label, onPress }: Props) {
  const { theme } = useTheme();
  return (
    <Pressable
      testID="login-submit"
      onPress={onPress}
      style={{
        backgroundColor: theme.colors.brand,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radius.md,
        ...theme.shadows.md,
      }}
    >
      <Text style={{ ...theme.typography.body.regular, color: theme.colors.text.primary }}>{label}</Text>
    </Pressable>
  );
}

// BAD: every line below is rejected by the ESLint rule
style={{ backgroundColor: '#3B82F6', padding: 16, borderRadius: 12, fontFamily: 'Inter', fontSize: 16 }}
```

- Static styles that depend on the theme: `useMemo(() => StyleSheet.create({...}), [theme])`; do not create styles inside loops or per-item renders.
- Need a value that has no token? Do not hardcode it. Add it to the design file, re-run the skill, then use it.
- `ThemeProvider` follows the system color scheme (`useColorScheme`) and accepts `forcedTheme`. Wrap the app root once.

## ESLint guard

`rn-agentic-dev/no-hardcoded-design-values` (file: `tools/eslint/rn-agentic-dev-rules.cjs`, config snippet: `templates/eslint/eslint.config.snippet.mjs`) reports:

- hex, `rgb()/rgba()/hsl()/…` color strings and common named colors in `*color` props
- `fontFamily` string literals
- numeric `margin*`, `padding*`, `gap`, `border*Radius`, `fontSize`, `lineHeight`, `letterSpacing` (except `0`)

Options: `checkColors`, `checkFonts`, `checkDimensions` (set `checkDimensions: false` when adopting in a legacy codebase and tighten later),
`allowedValues`, `allowedNumbers`, `allowedPaths` (defaults skip `/shared/theme/`, `/design/`, tests and `*.config.*`).
Never silence the rule with `eslint-disable` to ship a hardcoded value. If the rule flags generated code, fix the generator input.

## CI

```yaml
- run: npx rn-agentic-dev tokens check # fails if tokens.ts is stale vs tokens.json, or tokens.json is stale vs source-snapshot.json
- run: npx tsc --noEmit && npx eslint .
```

## Common mistakes

- Writing colors into `tokens.ts` "just this once". The next build erases it and CI's `tokens check` fails.
- Passing `get_variable_defs` output for **one** frame and assuming it is the whole design system. Union several frames, then read the report's `missing-category` items.
- Treating light values as dark values (`flatVariablesDark` copied from light). The report cannot detect this; ask the user if unsure.
- Leaving designers' placeholder names ("Color 1", "Fill 3") in the file. Components get unusable token names; get them renamed in Figma.
- Forgetting to load custom fonts. The theme's `fontFamily` must equal the registered font name for that weight, or RN silently falls back to the system font.
- Using `shadows.*` on a `View` without a background color: iOS then draws no shadow.
- Re-running `build` and ignoring "Removed" tokens. Run `tsc` and migrate usages.

## Done checklist

- [ ] `design/source-snapshot.json` committed, `fileUrl` set
- [ ] `tokens build` ran without errors; `tokens check` passes
- [ ] Report reviewed; unresolved items communicated to the user (with the exact Figma fix)
- [ ] `tsc`, ESLint (no hardcoded design values) and unit tests pass
- [ ] No hardcoded colors/fonts/spacing in components touched by this change
