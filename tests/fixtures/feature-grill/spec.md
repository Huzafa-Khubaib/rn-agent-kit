# Login

## Summary

Email/password login confirmed via feature-grill (fixture for tests).

## Screens

1. Login — credentials entry
2. Login Error — inline validation / API error

## Screen: Login

### Overview

- Purpose: Authenticate the user
- Entry: App launch when logged out
- Exits: Home on success; stay on Login on failure
- Presentation: stack screen
- Scroll: keyboard-aware scroll
- Safe area: top + bottom insets

### Elements

#### Email input

- Figma: height 48, spacing md, color text.primary / token `colors.text.primary`, radius sm
- Behavior: dynamic text; validation email format; placeholder `Email`; testID `login-email`

#### Password input

- Figma: height 48, spacing md, color text.primary, radius sm
- Behavior: secure text; min length 8; placeholder `Password`; testID `login-password`

#### Submit button

- Figma: height 48, fill `colors.brand.primary`, radius md
- Behavior: tap → submit; disabled while loading; testID `login-submit`

### States

- loading: button disabled + spinner on submit
- empty: N/A (form)
- error: inline under fields
- offline: toast + retry
- no-permission: N/A
- back/swipe: system back exits app (root)
- background/resume: keep form values

## Screen: Login Error

### Overview

- Purpose: Show field/API errors on same Login layout
- Entry: failed submit
- Exits: edit fields and retry
- Presentation: same stack screen (error state)

### Elements

#### Error text

- Figma: color `colors.status.error`, font caption
- Behavior: dynamic message from validation or API

### States

- error: visible
- loading: hidden

## Acceptance criteria

- AC-1 [Login]: Email and password fields are visible with correct placeholders
- AC-2 [Login]: Submit is disabled while a login request is in flight
- AC-3 [Login Error]: Invalid credentials show an error message under the form

## Decisions

- D-1: Use stack (not modal) for Login
- D-2: Offline shows toast rather than full-screen error

## Open items

(none)
