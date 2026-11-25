# {{SUMMARY}}

> Type: `{{TYPE}}` · Parent: `{{PARENT_KEY}}` · Project: `{{PROJECT_KEY}}`

## Figma

- **Screen:** {{SCREEN_NAME}}
- **Node ID:** `{{FIGMA_NODE_ID}}`
- **Link:** {{FIGMA_URL}}

<!-- Use NEEDS_FIGMA (and explain the gap) when the PRD feature has no matching frame. -->

## Acceptance Criteria (Gherkin)

```gherkin
Feature: {{FEATURE_NAME}}

  Scenario: Happy path
    Given {{GIVEN_HAPPY}}
    When {{WHEN_HAPPY}}
    Then {{THEN_HAPPY}}

  Scenario: Error / empty path
    Given {{GIVEN_ERROR}}
    When {{WHEN_ERROR}}
    Then {{THEN_ERROR}}
```

## testIDs

Key elements that must exist in the UI (and Maestro / RNTL selectors):

- `{{TEST_ID_1}}`
- `{{TEST_ID_2}}`
- `{{TEST_ID_3}}`

## API contracts

{{API_CONTRACTS}}

<!-- Example:
- POST /v1/auth/login
  - body: { email: string, password: string }
  - 200: { accessToken: string, user: { id, email } }
  - 401: { error: "invalid_credentials" }
Or write: none
-->

## States

| State   | UX / copy         |
| ------- | ----------------- |
| loading | {{STATE_LOADING}} |
| empty   | {{STATE_EMPTY}}   |
| error   | {{STATE_ERROR}}   |
| success | {{STATE_SUCCESS}} |

## Test cases

| ID                      | Title           | Maps to    |
| ----------------------- | --------------- | ---------- |
| `TC-{{PROJECT_KEY}}-01` | {{TC_01_TITLE}} | Happy path |
| `TC-{{PROJECT_KEY}}-02` | {{TC_02_TITLE}} | Error path |

## Definition of Done

- [ ] Matches Figma node (spacing/type/color from `design/tokens.json` / theme)
- [ ] All listed `testIDs` present and stable
- [ ] Loading / empty / error states implemented
- [ ] Unit or component tests for core logic (where applicable)
- [ ] Maestro E2E covers happy path (`maestro/`)
- [ ] Accessibility: labels, roles, hit targets ≥ 44pt
- [ ] No hardcoded design values (ESLint `no-hardcoded-design-values`)
- [ ] Linked PR / CI green

## Notes

{{NOTES}}
