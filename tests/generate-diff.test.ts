import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { diffTokens } from "../src/tokens/diff";
import { generateFromTokensJson } from "../src/tokens/generate-theme";
import { buildArtifacts } from "../src/tokens/pipeline";
import { parseSnapshot } from "../src/tokens/snapshot";
import { serializeTree } from "../src/tokens/tree";

const snap = parseSnapshot(
  JSON.parse(readFileSync(new URL("./fixtures/figma-snapshot.json", import.meta.url), "utf8")),
);

describe("tokens.ts generation", () => {
  const { tokensJson } = buildArtifacts(snap, null);

  it("is deterministic (byte-identical across runs, no timestamps)", () => {
    expect(generateFromTokensJson(tokensJson).ts).toBe(generateFromTokensJson(tokensJson).ts);
    expect(buildArtifacts(snap, null).tokensJson).toBe(tokensJson);
  });

  it("emits typed light/dark themes", () => {
    const { ts } = generateFromTokensJson(tokensJson);
    expect(ts).toContain("@generated");
    expect(ts).toContain("export const lightTheme");
    expect(ts).toContain("export const darkTheme: Theme");
    expect(ts).toContain("export type Theme = Widen<typeof lightTheme>");
  });

  it("produces a module whose values match the transformer", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "tok-")), "tokens.ts");
    writeFileSync(file, generateFromTokensJson(tokensJson).ts);
    const mod = await import(/* @vite-ignore */ file);
    expect(mod.themes.light.colors.background.default).toBe("#f9fafb");
    expect(mod.themes.dark.colors.background.default).toBe("#111827");
    expect(mod.lightTheme.colors.primary[500]).toBe("#3b82f6");
  });
});

describe("diff against previous tokens.json", () => {
  const a = {
    color: { $type: "color", x: { $value: "#000000" }, y: { $value: "#111111" } },
  } as const;
  const b = {
    color: { $type: "color", x: { $value: "#ffffff" }, z: { $value: "#222222" } },
  } as const;

  it("lists added, removed and changed", () => {
    const d = diffTokens(JSON.parse(serializeTree(a as any)), JSON.parse(serializeTree(b as any)));
    expect(d.added).toEqual(["color.z"]);
    expect(d.removed).toEqual(["color.y"]);
    expect(d.changed).toEqual([{ path: "color.x", before: '"#000000"', after: '"#ffffff"' }]);
  });

  it('is empty on identical input and "initial" with no previous file', () => {
    const same = buildArtifacts(snap, tokensJsonOf(snap));
    expect(same.diff).toEqual({ initial: false, added: [], removed: [], changed: [] });
    expect(buildArtifacts(snap, null).diff.initial).toBe(true);
    expect(same.report).toContain("No changes.");
  });
});

function tokensJsonOf(s: typeof snap) {
  return buildArtifacts(s, null).tokensJson;
}
