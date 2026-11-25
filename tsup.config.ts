import { defineConfig, type Options } from "tsup";

/**
 * Production npm build: ESM for Node 18+ CLI, minified, no source maps.
 * Runtime assets (skills/, templates/) ship beside dist/ and are resolved at runtime.
 */
const shared: Options = {
  format: ["esm"],
  target: "node18",
  platform: "node",
  outDir: "dist",
  sourcemap: false,
  minify: true,
  treeshake: true,
  splitting: false,
  dts: true,
  // Leave runtime deps external so npm installs resolve them normally.
  external: ["@clack/prompts", "commander", "execa", "zod"],
  esbuildOptions(options) {
    options.legalComments = "none";
  },
};

export default defineConfig([
  {
    ...shared,
    entry: { index: "src/index.ts" },
    clean: true,
  },
  {
    ...shared,
    entry: { cli: "src/cli.ts" },
    clean: false,
    banner: { js: "#!/usr/bin/env node" },
  },
  {
    ...shared,
    entry: {
      "scripts/figma-tokens": "src/scripts/figma-tokens.ts",
      "scripts/validate-jira-tickets": "src/scripts/validate-jira-tickets.ts",
    },
    clean: false,
    banner: { js: "#!/usr/bin/env node" },
  },
]);
