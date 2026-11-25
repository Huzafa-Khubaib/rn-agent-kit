import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeSnapshot } from "../src/tokens/normalize";
import { getToken } from "../src/tokens/tree";
import { parseSnapshot } from "../src/tokens/snapshot";

const snap = parseSnapshot(
  JSON.parse(readFileSync(new URL("./fixtures/figma-snapshot.json", import.meta.url), "utf8")),
);

describe("Figma -> DTCG", () => {
  const { tree, issues } = normalizeSnapshot(snap);

  it("exports primitives with lowercase hex and DTCG fields", () => {
    expect(getToken(tree, ["color", "primary", "500"])).toEqual({
      $type: "color",
      $value: "#3b82f6",
    });
  });

  it("keeps aliases and puts Dark into $extensions.mode", () => {
    expect(getToken(tree, ["color", "background", "default"])).toEqual({
      $type: "color",
      $value: "{color.neutral.50}",
      $description: "Screen background",
      $extensions: { mode: { dark: "{color.neutral.900}" } },
    });
  });

  it("infers dimension/number/fontFamily types from names", () => {
    expect(getToken(tree, ["spacing", "md"])?.$value).toBe("16px");
    expect(getToken(tree, ["radius", "md"])).toMatchObject({ $type: "dimension", $value: "12px" });
    expect(getToken(tree, ["opacity", "disabled"])).toMatchObject({ $type: "number", $value: 0.4 });
    expect(getToken(tree, ["font", "family", "sans"])).toMatchObject({
      $type: "fontFamily",
      $value: "Inter",
    });
  });

  it("converts text and effect styles", () => {
    expect(getToken(tree, ["typography", "heading", "h1"])?.$value).toEqual({
      fontFamily: "Inter",
      fontSize: "32px",
      fontWeight: 700,
      lineHeight: 1.25,
    });
    expect(getToken(tree, ["typography", "body", "regular"])?.$value).toMatchObject({
      letterSpacing: "0.2px",
      fontWeight: 400,
    });
    expect(getToken(tree, ["shadow", "md"])?.$value).toEqual({
      color: "#0000001a",
      offsetX: "0px",
      offsetY: "4px",
      blur: "8px",
      spread: "0px",
    });
  });

  it("reports unnamed colors with a Figma fix hint", () => {
    const issue = issues.find((i) => i.code === "unnamed-token");
    expect(issue?.token).toBe("color.color-1");
    expect(issue?.fix).toMatch(/Rename it in Figma/);
  });

  it("reports a missing dark mode when none exists, and skips unresolved aliases with an error", () => {
    const noDark = normalizeSnapshot(
      parseSnapshot({ source: "figma", flatVariables: { "color/a/b": "#fff" } }),
    );
    expect(noDark.issues.some((i) => i.code === "missing-dark-mode")).toBe(true);
    expect(noDark.issues.some((i) => i.code === "single-mode-source")).toBe(true);

    const bad = JSON.parse(JSON.stringify(snap));
    bad.variables.variables.s3.valuesByMode.m2 = { type: "VARIABLE_ALIAS", id: "external" };
    const res = normalizeSnapshot(parseSnapshot(bad));
    expect(res.issues.find((i) => i.code === "unresolved-alias")?.severity).toBe("error");
    expect(getToken(res.tree, ["color", "brand"])).toBeUndefined();
  });

  it("reports collisions instead of overwriting", () => {
    const dup = JSON.parse(JSON.stringify(snap));
    dup.variables.variables.dup = {
      ...dup.variables.variables.v1,
      id: "dup",
      name: "Color/Primary/500",
    };
    const res = normalizeSnapshot(parseSnapshot(dup));
    expect(res.issues.some((i) => i.code === "name-collision")).toBe(true);
  });

  it("puts color variables under color.* even without the prefix", () => {
    const res = normalizeSnapshot(
      parseSnapshot({ source: "figma", flatVariables: { "Brand/Primary": "#112233" } }),
    );
    expect(getToken(res.tree, ["color", "brand", "primary"])?.$value).toBe("#112233");
  });

  it("handles MCP flat variables incl. dark and Font(...) strings", () => {
    const res = normalizeSnapshot(
      parseSnapshot({
        source: "figma",
        flatVariables: {
          "color/bg/base": "#FFFFFF",
          "spacing/md": 16,
          "Heading/H2":
            'Font(family: "Inter", style: Bold, size: 24, weight: 700, lineHeight: 32, letterSpacing: 0)',
        },
        flatVariablesDark: { "color/bg/base": "#000000" },
      }),
    );
    expect(getToken(res.tree, ["color", "bg", "base"])?.$extensions).toEqual({
      mode: { dark: "#000000" },
    });
    expect(getToken(res.tree, ["spacing", "md"])?.$value).toBe("16px");
    expect(getToken(res.tree, ["heading", "h2"])?.$value).toMatchObject({
      fontSize: "24px",
      lineHeight: 1.3333,
    });
  });
});
