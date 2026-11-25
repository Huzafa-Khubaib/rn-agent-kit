import { applyArchitectureScaffold } from "./architecture.js";
import { createNativeProject } from "./create-project.js";
import type { RunCommand } from "../utils/exec.js";

/** Create a React Native CLI app and apply architecture scaffold. */
export async function scaffoldRnCli(
  parentDir: string,
  name: string,
  runCommand?: RunCommand,
): Promise<string> {
  const projectDir = await createNativeProject({
    name,
    stack: "cli",
    cwd: parentDir,
    runCommand,
  });
  await applyArchitectureScaffold(projectDir);
  return projectDir;
}
