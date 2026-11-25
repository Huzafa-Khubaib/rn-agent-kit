import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectProject, formatDetectionSummary } from "./project.js";

describe("detectProject", () => {
  let tmp: string;

  afterEach(async () => {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it("detects empty dir as non-RN", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-detect-"));
    const d = await detectProject(tmp);
    expect(d.hasPackageJson).toBe(false);
    expect(d.isReactNative).toBe(false);
  });

  it("detects Expo + typescript + pnpm + expo-router", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-detect-"));
    await writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({
        name: "expo-app",
        dependencies: {
          expo: "52.0.0",
          "react-native": "0.76.0",
          "expo-router": "4.0.0",
          typescript: "5.6.0",
        },
      }),
      "utf8",
    );
    await writeFile(path.join(tmp, "pnpm-lock.yaml"), "", "utf8");

    const d = await detectProject(tmp);
    expect(d.isReactNative).toBe(true);
    expect(d.stack).toBe("expo");
    expect(d.typescript).toBe(true);
    expect(d.packageManager).toBe("pnpm");
    expect(d.navigation).toBe("expo-router");
    expect(formatDetectionSummary(d)).toContain("stack: expo");
  });
});
