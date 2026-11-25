import path from "node:path";
import type { RunCommand } from "../utils/exec.js";
import { defaultRunCommand } from "../utils/exec.js";

export type CreateStack = "expo" | "cli";

export interface CreateProjectOptions {
  name: string;
  stack: CreateStack;
  cwd: string;
  runCommand?: RunCommand;
}

/** Scaffold a new app with create-expo-app or RN community CLI. */
export async function createNativeProject(options: CreateProjectOptions): Promise<string> {
  const run = options.runCommand ?? defaultRunCommand;
  const { name, stack, cwd } = options;
  const projectDir = path.join(cwd, name);

  // stdio: inherit — child owns the TTY (progress + any prompts). Callers must
  // not run a clack spinner around this or output/prompts get swallowed.
  if (stack === "expo") {
    await run(
      "npx",
      ["create-expo-app@latest", name, "--template", "blank-typescript", "--yes"],
      {
        cwd,
        stdio: "inherit",
      },
    );
  } else {
    // --install-pods false avoids CocoaPods prompt that looks like a hang when
    // stdin is not a clean interactive TTY (e.g. wrapped CLIs / CI).
    await run(
      "npx",
      [
        "@react-native-community/cli@latest",
        "init",
        name,
        "--pm",
        "npm",
        "--install-pods",
        "false",
      ],
      {
        cwd,
        stdio: "inherit",
      },
    );
  }

  return projectDir;
}
