import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/scripts/figma-tokens";
import { fetchFigmaSnapshot, parseFigmaFileKey } from "../src/tokens/fetch-figma";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "figma-tokens-"));
  mkdirSync(join(dir, "design"));
  cpSync(
    new URL("./fixtures/figma-snapshot.json", import.meta.url),
    join(dir, "design/source-snapshot.json"),
  );
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const read = (p: string) => readFileSync(join(dir, p), "utf8");

describe("figma-tokens CLI", () => {
  it("build writes tokens.json, tokens.ts, report and ThemeProvider; second run changes nothing", async () => {
    expect(await runCli(["build"], dir)).toBe(0);
    for (const f of [
      "design/tokens.json",
      "src/shared/theme/tokens.ts",
      "design/tokens-report.md",
      "src/shared/theme/ThemeProvider.tsx",
    ])
      expect(existsSync(join(dir, f))).toBe(true);
    const before = [
      read("design/tokens.json"),
      read("src/shared/theme/tokens.ts"),
      read("design/tokens-report.md"),
    ];
    expect(before[2]).toContain("Initial generation");
    expect(before[2]).toContain("Rename it in Figma");

    writeFileSync(join(dir, "src/shared/theme/ThemeProvider.tsx"), "// user edited");
    expect(await runCli(["build"], dir)).toBe(0);
    expect([read("design/tokens.json"), read("src/shared/theme/tokens.ts")]).toEqual(
      before.slice(0, 2),
    );
    expect(read("design/tokens-report.md")).toContain("No changes.");
    expect(read("src/shared/theme/ThemeProvider.tsx")).toBe("// user edited");
  });

  it("check passes when fresh and fails when tokens.ts or tokens.json drift", async () => {
    await runCli(["build"], dir);
    expect(await runCli(["check"], dir)).toBe(0);

    writeFileSync(
      join(dir, "src/shared/theme/tokens.ts"),
      `${read("src/shared/theme/tokens.ts")}\n// hand edit`,
    );
    expect(await runCli(["check"], dir)).toBe(1);
    expect(await runCli(["generate"], dir)).toBe(0);
    expect(await runCli(["check"], dir)).toBe(0);

    const json = JSON.parse(read("design/tokens.json"));
    json.spacing.md.$value = "20px";
    writeFileSync(join(dir, "design/tokens.json"), `${JSON.stringify(json, null, 2)}\n`);
    expect(await runCli(["check"], dir)).toBe(1); // ts stale AND json differs from snapshot
  });

  it("records a diff when the design changes", async () => {
    await runCli(["build"], dir);
    const snap = JSON.parse(read("design/source-snapshot.json"));
    snap.variables.variables.v8.valuesByMode.m1 = 20;
    delete snap.variables.variables.v7;
    writeFileSync(join(dir, "design/source-snapshot.json"), JSON.stringify(snap));
    await runCli(["build"], dir);
    const report = read("design/tokens-report.md");
    expect(report).toContain("### Removed (1)");
    expect(report).toContain('`spacing.md`: {"16px"} → {"20px"}'.replace(/[{}]/g, ""));
  });

  it("--strict fails on errors; bad input fails without writing files", async () => {
    const snap = JSON.parse(read("design/source-snapshot.json"));
    snap.variables.variables.s3.valuesByMode.m2 = { type: "VARIABLE_ALIAS", id: "external" };
    writeFileSync(join(dir, "design/source-snapshot.json"), JSON.stringify(snap));
    expect(await runCli(["build", "--strict"], dir)).toBe(1);

    writeFileSync(join(dir, "design/source-snapshot.json"), "{}");
    expect(await runCli(["build"], dir)).toBe(1);
    expect(await runCli(["nope"], dir)).toBe(1);
  });
});

describe("fetch (mocked REST)", () => {
  it("parses file keys", () => {
    expect(parseFigmaFileKey("https://www.figma.com/design/AbC123/My-File?node-id=1-2")).toBe(
      "AbC123",
    );
    expect(() => parseFigmaFileKey("https://example.com")).toThrow();
  });

  it("builds a snapshot from styles and tolerates missing Enterprise variables API", async () => {
    const calls: string[] = [];
    const fake = async (url: string) => {
      calls.push(url);
      const json = (body: unknown, ok = true, status = 200) => ({
        ok,
        status,
        json: async () => body,
      });
      if (url.includes("/variables/local")) return json({}, false, 403);
      if (url.includes("/styles"))
        return json({
          meta: {
            styles: [
              { name: "Heading/H1", style_type: "TEXT", node_id: "1:1" },
              { name: "Brand/Primary", style_type: "FILL", node_id: "1:2" },
            ],
          },
        });
      return json({
        nodes: {
          "1:1": {
            document: {
              style: { fontFamily: "Inter", fontWeight: 700, fontSize: 32, lineHeightPx: 40 },
            },
          },
          "1:2": { document: { fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 } }] } },
        },
      });
    };
    const { snapshot, notes } = await fetchFigmaSnapshot(
      "https://www.figma.com/design/AbC123/x",
      "tok",
      fake,
    );
    expect(snapshot.variables).toBeUndefined();
    expect(snapshot.textStyles?.[0]).toMatchObject({
      name: "Heading/H1",
      fontSize: 32,
      lineHeightPx: 40,
    });
    expect(snapshot.colorStyles?.[0].name).toBe("Brand/Primary");
    expect(notes[0]).toMatch(/Enterprise/);
    expect(calls.some((c) => c.includes("ids=1%3A1,1%3A2"))).toBe(true);
  });
});
