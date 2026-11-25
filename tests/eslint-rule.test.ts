import { createRequire } from "node:module";
import { RuleTester } from "eslint";
import { describe, it } from "vitest";

const require = createRequire(import.meta.url);
const plugin = require("../templates/eslint/rn-agentic-dev-rules.cjs");

RuleTester.describe = describe;
RuleTester.it = it;
(RuleTester as any).itOnly = it.only;

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});
const rule = plugin.rules["no-hardcoded-design-values"];

tester.run("no-hardcoded-design-values", rule, {
  valid: [
    { code: "const s = { color: theme.colors.text.primary, padding: theme.spacing.md };" },
    { code: 'const s = { backgroundColor: "transparent", margin: 0 };' },
    { code: 'const c = "#ffffff";', filename: "/app/src/shared/theme/tokens.ts" },
    { code: 'const c = "#ffffff";', filename: "/app/src/features/a/A.test.tsx" },
    { code: "const s = { padding: 16, fontSize: 14 };", options: [{ checkDimensions: false }] },
    { code: 'const s = { color: "primary" };' }, // semantic variant name, not a CSS color
    { code: "const s = { flex: 1, width: 100, opacity: 0.5 };" },
  ],
  invalid: [
    { code: 'const s = { backgroundColor: "#fff" };', errors: [{ messageId: "hardcodedColor" }] },
    { code: 'const s = { color: "#12345678" };', errors: [{ messageId: "hardcodedColor" }] },
    { code: 'const s = { color: "rgba(0,0,0,0.5)" };', errors: [{ messageId: "hardcodedColor" }] },
    { code: 'const s = { borderColor: "white" };', errors: [{ messageId: "hardcodedColor" }] },
    {
      code: 'const a = <View style={{ backgroundColor: "#FF0000" }} />;',
      errors: [{ messageId: "hardcodedColor" }],
    },
    { code: "const s = { color: `#abc` };", errors: [{ messageId: "hardcodedColor" }] },
    { code: 'const s = { fontFamily: "Inter" };', errors: [{ messageId: "hardcodedFont" }] },
    {
      code: "const s = { padding: 16, borderRadius: 8 };",
      errors: [{ messageId: "hardcodedDimension" }, { messageId: "hardcodedDimension" }],
    },
    {
      code: "const s = { fontSize: 14, lineHeight: 20 };",
      errors: [{ messageId: "hardcodedDimension" }, { messageId: "hardcodedDimension" }],
    },
    {
      code: 'const s = { color: "#000" };',
      options: [{ allowedValues: [] }],
      errors: [{ messageId: "hardcodedColor" }],
    },
  ],
});
