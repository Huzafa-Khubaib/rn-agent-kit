import { applyArchitectureScaffold } from "./architecture.js";
import { createNativeProject } from "./create-project.js";
import type { RunCommand } from "../utils/exec.js";

/** Create an Expo TypeScript app and apply architecture scaffold. */
export async function scaffoldExpo(
  parentDir: string,
  name: string,
  runCommand?: RunCommand,
): Promise<string> {
  const projectDir = await createNativeProject({
    name,
    stack: "expo",
    cwd: parentDir,
    runCommand,
  });
  await applyArchitectureScaffold(projectDir);
  return projectDir;
}
