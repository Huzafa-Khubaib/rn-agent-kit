// Add to your project's eslint.config.mjs (init copies the rule file to tools/eslint/).
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const rnAgentKit = require("./tools/eslint/rn-agentic-dev-rules.cjs");

export default [
  { ignores: ["src/shared/theme/tokens.ts"] }, // generated
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "rn-agentic-dev": rnAgentKit },
    rules: {
      // Existing project with lots of legacy styles? start with { checkDimensions: false } and tighten later.
      "rn-agentic-dev/no-hardcoded-design-values": ["error", {}],
    },
  },
];
