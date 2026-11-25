import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeSnapshot } from "../src/tokens/normalize";
import { parseSnapshot } from "../src/tokens/snapshot";
import { buildThemes, TokenError } from "../src/tokens/transform";
import type { DtcgGroup } from "../src/tokens/types";

const snap = parseSnapshot(
  JSON.parse(readFileSync(new URL("./fixtures/figma-snapshot.json", import.meta.url), "utf8")),
);
const { tree } = normalizeSnapshot(snap);

describe("DTCG -> theme transformer", () => {
  const t = buildThemes(tree);
  const colors = (m: "light" | "dark") => t[m].colors as any;

  it("resolves aliases per mode", () => {
    expect(colors("light").background.default).toBe("#f9fafb");
    expect(colors("dark").background.default).toBe("#111827");
    expect(colors("light").text.primary).toBe("#111827");
    expect(colors("dark").text.primary).toBe("#ffffff");
    expect(colors("dark").brand).toBe("#2563eb");
    expect(t.hasDark).toBe(true);
  });

  it("keeps primitives identical in both modes", () => {
    expect(colors("light").primary["500"]).toBe("#3b82f6");
    expect(colors("dark").primary["500"]).toBe("#3b82f6");
  });

  it("converts dimensions, numbers and font families to RN values", () => {
    expect((t.light.spacing as any).md).toBe(16);
    expect((t.light.radius as any).md).toBe(12);
    expect((t.light.opacity as any).disabled).toBe(0.4);
    expect((t.light.fontFamilies as any).sans).toBe("Inter"); // "font/family/sans" -> fontFamilies.sans
    expect(t.light.font).toBeUndefined();
  });

  it("converts typography with px line height and string weight", () => {
    expect((t.light.typography as any).heading.h1).toEqual({
      fontFamily: "Inter",
      fontSize: 32,
      fontWeight: "700",
      lineHeight: 40,
    });
    expect((t.light.typography as any).body.regular.letterSpacing).toBe(0.2);
  });

  it("converts shadows to RN style props", () => {
    expect((t.light.shadows as any).md).toEqual({
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 4,
    });
  });

  it("throws on circular and unresolved aliases", () => {
    const circular: DtcgGroup = {
      color: {
        $type: "color",
        a: { $value: "{color.b}" },
        b: { $value: "{color.a}" },
      },
    };
    expect(() => buildThemes(circular)).toThrow(/Circular alias/);
    expect(() => buildThemes({ color: { $type: "color", a: { $value: "{color.nope}" } } })).toThrow(
      TokenError,
    );
  });

  it("rejects invalid values and camelCases keys", () => {
    expect(() => buildThemes({ color: { $type: "color", a: { $value: "red" } } })).toThrow(
      /#rrggbb/,
    );
    const th = buildThemes({
      color: { $type: "color", "on-surface": { $value: "#fff000" } },
      spacing: { $type: "dimension", x: { $value: "1rem" } },
    });
    expect((th.light.colors as any).onSurface).toBe("#fff000");
    expect((th.light.spacing as any).x).toBe(16);
  });
});
