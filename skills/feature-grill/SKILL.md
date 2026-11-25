---
name: feature-grill
description: >-
  Use when the user gives a Figma/Stitch link, screenshots/recordings, and PRD for a
  feature. Interviews SCREEN BY SCREEN and ELEMENT BY ELEMENT, one question at a
  time, until every UI detail is confirmed. Produces docs/features/<slug>/spec.md
  with screen-tagged ACs. Run BEFORE plan-review and any Jira ticket. Never writes
  application feature code, tokens, or tickets (screenshot-to-rn MCP draft code is OK).
globs: "**/docs/features/**/*.{md,json}"
alwaysApply: false
---

# Feature Grill

Goal: remove every assumption before planning. **Build nothing. Create no tickets. Write no tokens.**

```
PRD + design source (Figma XOR Stitch XOR Screenshots)
      │  Step 0  pick source → prepare + confirm screen list
      │  Step 1  for each screen: overview → elements → states → confirm
      │  Step 2  cross-screen questions
      ▼
docs/features/<slug>/spec.md
      │
      ▼
plan-review (only if Open items empty, or user explicitly accepts them)
```

## Inputs

- **Design source:** Figma **or** Google Stitch **or** Screenshots (equal options — pick one path and stick to it)
- PRD (file path or pasted text)

If the design source or PRD is missing, ask for it (**one** question). Prefer asking **design source first** when unclear.

Derive `<slug>` (kebab-case from feature title). Confirm only if ambiguous.

## Step 0 — Prepare (no grilling yet)

### 0a. Choose design source (ONE question if not obvious)

If the user already pasted a `figma.com` link → **Figma**.  
If they pasted a Stitch link / said Stitch → **Stitch**.  
If they uploaded screenshots/recordings or `.agent/config.json` has `designSource: screenshot` → **Screenshots**.  
Otherwise ask exactly:

```text
Design source for this feature?
1. Figma (MCP / file link)
2. Stitch (Google Stitch export + screenshots)
3. Screenshots / recordings (screenshot-to-rn MCP + Gemini)
Recommended: <1, 2, or 3 based on .agent/config.json designSource>
```

Do **not** mix Figma MCP measures with Stitch/Screenshot guesses in the same screen. One source per feature (user may switch only by explicit request).

### 0b. Load screens by source

**Path A — Figma**

1. Read the PRD fully.
2. Via **Figma MCP**, list frames/screens in **flow order** (node ids + deep links).
3. **If Figma MCP fails** (rate limit, auth, missing access, empty frames):
   - One line: Figma MCP unavailable → **Figma screenshot + Inspect CSS** mode.
   - Screen list from **PRD** (note missing node ids; backfill when quota returns).
   - Do **not** block grilling.

**Path B — Stitch**

1. Read the PRD fully.
2. Ask for the **Stitch project/share link** (if missing) and whether they can export **HTML + Tailwind**.
3. Build screen list from **PRD flow** + any Stitch screen names the user provides.
4. Default design mode: **Stitch screenshot + CSS/Tailwind** (there is no Figma MCP on this path).
5. Point tokens work at **figma-to-tokens Step 1B** (Tailwind export → snapshot) — do not invent a Figma file.

**Path C — Screenshots / recordings**

1. Read the PRD fully.
2. Confirm `DESIGN_SOURCE=screenshot` / MCP `screenshot-to-rn` is available (`ping_backend` if unsure). If backend/MCP missing, tell the user in one line to run the vendor backend + `connect --design-source screenshot` — do not invent UI.
3. Build screen list from **PRD flow**. Ask where PNGs live (`SCREENSHOTS_DIR` or chat uploads).
4. At the start of each screen: require that screen's **full-frame screenshot** (or a short recording for multi-state flows).
5. Optionally call MCP `screenshot_to_rn` (stack `expo` or `react_native`) to draft `App.tsx` — use it as a **visual reference for measures**, not as final app code. Record draft path under Decisions. Grilling still confirms every element; never skip Open items.
6. Tokens: extract palette/spacing from shots into Open items or a later tokens build — do not invent theme values.

### 0c. Repo scan + confirm list

1. Scan the repo: `docs/project-context.md`, theme / tokens, components, navigation, state libs, `package.json`.
2. Show **screen list + order** and label the path: `Design source: Figma` | `Stitch` | `Screenshots` (+ sub-mode if needed).
3. Ask **ONE** question: *Is this the correct list and order of screens?*  
   Recommended: yes, proceed in this order (list them).

Do not start Step 1 until the list/order is confirmed (or corrected).

### Design source modes (detail)

| Source | Sub-mode | What you use |
| ------ | -------- | ------------ |
| **Figma** | MCP OK | Node ids, deep links, measured styles |
| **Figma** | MCP down | Per-screen screenshot + Figma Inspect paste |
| **Stitch** | Screenshots | Per-screen Stitch screenshot + CSS / spacing paste |
| **Stitch** | Tailwind export | HTML + `theme.extend` for tokens; screenshots for layout grill |
| **Screenshots** | Still images | Per-screen PNG + vision / screenshot-to-rn draft |
| **Screenshots** | Recording | Short recording via `recording_to_rn` (Gemini) + refine |

In **any screenshot sub-mode** (including Path C), at the **start of each screen** (before 1b), ask **ONE** question:  
*Send a screenshot of `<Screen name>` only (full frame).*  
Do not start element grilling for that screen until the screenshot is in the chat (or the user says they will describe without a shot).

## Step 1 — Per-screen loop

Process screens **in confirmed order**. Finish a screen completely before the next.

### 1a. Screen overview (ONE question at a time)

Cover, in separate messages when still unknown:

| Topic | Ask / confirm |
| ----- | ------------- |
| Purpose | What is this screen for? |
| Entry | How does the user arrive (from which screen/action)? |
| Exits | Where does each exit lead? |
| Presentation | Tab, stack screen, modal, or bottom sheet? |
| Scroll | Fixed, scrollable, pull-to-refresh? |
| Keyboard | Avoiding behavior, dismiss on tap outside? |
| Safe area | Top/bottom insets handling? |

Skip any item already answered by PRD / Figma / Stitch / code / screenshot — **state the known fact** and move on.

### 1b. Element by element (top → bottom, left → right)

Walk **every** visible element: header, back, icons, images, text, inputs, buttons, chips, cards, lists, dividers, tab bars, badges, toasts, etc.

**ONE element = ONE message.**

#### Figma — MCP has the values

```text
Element: <name> — <position on screen>

From Figma:
- size: …
- spacing: …
- color: … (token: <name> | NO TOKEN MATCH)
- font: …
- radius: …
- shadow: …

Unknown (only what applies):
- text: static vs dynamic (source?)
- tap action / destination
- pressed / disabled / focus / error states
- validation / max length / truncation
- placeholder
- loading skeleton
- animation / haptics
- accessibility label

Recommended: <best default so user can reply "yes">
```

#### Figma — MCP rate-limited / unavailable (screenshot + Inspect)

**Never** write “values TBD on re-sync” and move on. Missing measures = **ask now**.

```text
Element: <name> — <position on screen>

From screenshot / PRD:
- what is visible: …
- likely role: …

Need from Figma Inspect (paste what you can):
- size (W×H) / layout
- spacing (padding/margin/gap)
- color (hex or token name)
- font (family, size, weight, line-height)
- radius
- shadow / blur

Also unknown (only what applies):
- text source / tap / states / validation / a11y / animation

Recommended: <behavior default; still need CSS pastes above>
```

#### Stitch — screenshot + CSS / Tailwind

Same discipline: **no invented px/hex**. Prefer values from Stitch UI, export HTML, or Tailwind classes.

```text
Element: <name> — <position on screen>

From Stitch screenshot / PRD:
- what is visible: …
- likely role: …

Need from Stitch (paste Inspect, export HTML, or Tailwind classes):
- size (W×H) / layout
- spacing (padding/margin/gap)
- color (hex, rgb, or Tailwind token e.g. bg-primary-500)
- font (family, size, weight, line-height)
- radius
- shadow / blur

Also unknown (only what applies):
- text source / tap / states / validation / a11y / animation

Recommended: <behavior default; still need CSS/Tailwind pastes above>
```

#### Screenshots — vision + screenshot-to-rn MCP

Same discipline: **no invented px/hex**. Prefer values read from the shot, MCP draft StyleSheet, or user confirmation.

```text
Element: <name> — <position on screen>

From screenshot / MCP draft / PRD:
- what is visible: …
- likely role: …
- draft StyleSheet hints (if screenshot_to_rn ran): …

Confirm or correct:
- size (W×H) / layout
- spacing (padding/margin/gap)
- color (hex)
- font (family, size, weight, line-height)
- radius
- shadow / blur

Also unknown (only what applies):
- text source / tap / states / validation / a11y / animation

Recommended: <behavior default; still need confirmed measures>
```

If measures are uncertain, call `refine_rn_ui` with the draft + this screen's shot, or put **Open items** — never invent numbers.

Ask only **still-missing** CSS fields — one message; recommend behavior only, never invent measures. If the user cannot provide values, **Open items** (do not invent numbers).

Rules for elements:

- Never ask what PRD, Figma, Stitch, screenshot, or code already answers — state it and continue.
- No matching theme token → `NO TOKEN MATCH` explicitly.
- User **corrects** a design value → Decisions + warn source may be outdated.
- Figma MCP recovers later → optional node-id backfill; **do not re-grill** confirmed screens unless asked.
- Stitch tokens → remind user to run **figma-to-tokens** Step 1B (Tailwind export), not Figma REST, before implement.

### 1b-extra. Third-party libraries (hard)

If an element or behavior seems to need a **library** (Lottie, maps, video, social auth SDK, biometrics, image picker, etc.):

1. **Do not** assume or “just use” a package.
2. Ask **ONE** question: whether a lib is needed, **recommend one** option, and wait for approval (or the user’s preferred package).
3. Only after the user agrees, record it under Decisions / Elements (package name + why).
4. Never add dependencies or write install commands during feature-grill (this skill builds no code).

### 1c. Screen states (ONE question at a time)

Ask only unknowns among:

- loading
- empty
- error
- offline
- no-permission
- long text / small screens
- Android vs iOS differences
- back / swipe behavior
- app background / resume

### 1d. Screen confirmation

Show a **compact summary** of everything decided for this screen (overview + elements + states + libs approved). Note design source: `Figma MCP` | `Figma screenshot + Inspect` | `Stitch screenshot + CSS/Tailwind` | `Screenshots + MCP`.

Ask: *Confirm this screen?*

- Only after the user says **confirm** (or clear yes): append/update that screen section in `docs/features/<slug>/spec.md`.
- Then move to the next screen (in screenshot modes: ask for the **next** screen’s screenshot first).

## Step 2 — Cross-screen (ONE question at a time)

After all screens are confirmed, cover gaps among:

- navigation transitions
- shared components
- shared state
- deep links
- auth requirements
- analytics events
- permissions
- API contracts + error handling
- security / PII
- out-of-scope

## Step 3 — Finish `docs/features/<slug>/spec.md`

Required structure:

```markdown
# <Feature title>

## Summary
…

## Screens
1. <Screen A> — <one-line purpose>
2. <Screen B> — …

## Screen: <Screen A>
### Overview
…
### Elements
#### <Element name>
- Design source: Figma MCP | Figma screenshot + Inspect | Stitch screenshot + CSS/Tailwind | Screenshots + MCP
- Visual / CSS: …
- Behavior: …
### States
- loading: …
- empty: …
- …

## Screen: <Screen B>
…

## Acceptance criteria
- AC-1 [<Screen A>]: …
- AC-2 [<Screen A>]: …
- AC-3 [<Screen B>]: …

## Decisions
- D-1: …
- D-2: (design correction) … — Figma/Stitch/Screenshot source may be outdated
- D-3: (library) use <package> for <reason> — user approved
- D-4: Design source = Figma | Stitch | Screenshots
- D-5: (optional) screenshot-to-rn draft App.tsx reference path / stack

## Open items
(none)
```

### Acceptance criteria rules

- Numbered `AC-1` … `AC-n`
- **Screen-tagged**: `AC-n [<Screen name>]:` (required)
- Each AC testable (observable UI/behavior)
- Maestro later references `# AC-n` (and optionally the screen name)

### Open items

- If the user says **"don't know"**, add a bullet under `## Open items` and continue.
- Missing CSS the user cannot provide → Open item (never invent px/hex).
- Empty Open items = `(none)` or an empty section with no real bullets.
- **plan-review must not start** while Open items is non-empty, unless the user **explicitly accepts** those open items (see plan-review).

## Rules (hard)

1. **ONE question per message.** Never batch.
2. Always include a **recommended answer**.
3. Never invent screens/elements missing from PRD / Figma / Stitch / screenshot.
4. Never invent CSS (px/hex/font/Tailwind) when measures are missing — **ask** or Open item.
5. Never leave “TBD when MCP recovers” as a substitute for asking.
6. Never mix Figma / Stitch / Screenshots mid-feature without an explicit user switch.
7. Never add/choose a third-party library without asking (recommend + wait for yes).
8. Never write application feature code, design tokens, or Jira tickets in this skill (screenshot-to-rn draft reference only).
9. Do not hand off to plan-review with unresolved Open items unless the user explicitly accepts them.

## Done checklist

- [ ] Design source chosen: **Figma** or **Stitch** or **Screenshots**
- [ ] Screen list/order confirmed
- [ ] Sub-mode clear (MCP / Figma screenshot / Stitch screenshot+Tailwind / Screenshots+MCP)
- [ ] Every screen: screenshot if needed + overview + every element + states + user confirm
- [ ] Libraries only with user approval
- [ ] Cross-screen questions done
- [ ] `spec.md` written with screen-tagged ACs + design source Decision
- [ ] Open items empty or explicitly accepted
- [ ] User pointed at **plan-review**
