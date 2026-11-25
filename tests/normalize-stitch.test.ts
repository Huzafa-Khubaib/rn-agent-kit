import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBoxShadow } from "../src/tokens/normalize-stitch";
import { normalizeSnapshot } from "../src/tokens/normalize";
import { buildThemes } from "../src/tokens/transform";
import { getToken } from "../src/tokens/tree";
import { parseSnapshot } from "../src/tokens/snapshot";

const snap = parseSnapshot(
  JSON.parse(readFileSync(new URL("./fixtures/stitch-snapshot.json", import.meta.url), "utf8")),
);

describe("Stitch (Tailwind) -> DTCG", () => {
  const { tree, issues } = normalizeSnapshot(snap);

  it("maps nested colors, DEFAULT and dark palette", () => {
    expect(getToken(tree, ["color", "primary", "default"])).toEqual({
      $type: "color",
      $value: "#6750a4",
      $extensions: { mode: { dark: "#d0bca4".replace("d0bca4", "d0bcff") } },
    });
    expect(getToken(tree, ["color", "on-surface"])?.$extensions).toEqual({
      mode: { dark: "#e6e0e9" },
    });
  });

  it("converts rem to px and keeps font tokens", () => {
    expect(getToken(tree, ["spacing", "2"])?.$value).toBe("8px");
    expect(getToken(tree, ["radius", "default"])?.$value).toBe("4px");
    expect(getToken(tree, ["font-family", "sans"])?.$value).toBe("Inter");
    expect(getToken(tree, ["line-height", "base"])?.$value).toBe("24px");
  });

  it("parses the first outer shadow and skips inset", () => {
    expect(getToken(tree, ["shadow", "md"])?.$value).toMatchObject({
      offsetY: "4px",
      blur: "6px",
      spread: "-1px",
      color: "#0000001a",
    });
    expect(getToken(tree, ["shadow", "inner"])).toBeUndefined();
    expect(issues.some((i) => i.code === "unsupported-effect")).toBe(true);
    expect(parseBoxShadow("none")).toBeNull();
  });

  it("builds light/dark themes from it", () => {
    const t = buildThemes(tree);
    expect(t.hasDark).toBe(true);
    expect((t.dark.colors as any).onSurface).toBe("#e6e0e9");
  });
});
