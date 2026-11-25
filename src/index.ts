/**
 * Programmatic API for rn-agentic-dev (side-effect free).
 * CLI consumers should use the `rn-agentic-dev` binary / `npx rn-agentic-dev`.
 */
export { initCommand, type InitOptions, type InitDeps, type ProjectKind } from "./commands/init.js";
export { doctorCommand } from "./commands/doctor.js";
export { connectCommand, type ConnectOptions, type ConnectDeps } from "./commands/connect.js";
export { updateCommand, type UpdateOptions } from "./commands/update.js";
export { runConnectionTests, type ConnectionCheck } from "./connect/test-connections.js";
export { mergeClaudeMd, installClaudeMdRouter } from "./adapters/claude-md.js";
export { createNativeProject, type CreateStack, type CreateProjectOptions } from "./scaffold/create-project.js";
export { applyArchitectureScaffold } from "./scaffold/architecture.js";
export { loadSkills, getSkillsRoot, skillBody } from "./utils/skills.js";
export { getTemplatesRoot } from "./utils/templates.js";
export { detectProject, type ProjectDetection } from "./detect/project.js";
export type { Skill, Adapter } from "./adapters/types.js";
export { intakeCommand, type IntakeOptions } from "./commands/intake.js";
export { jiraSyncCommand, type JiraSyncOptions } from "./commands/jira-sync.js";
export { coverageCommand, runCoverage, type CoverageOptions } from "./commands/coverage.js";
export { verifyCommand, type VerifyOptions } from "./commands/verify.js";
export {
  parseAgentConfig,
  parseApprovals,
  parseFeaturePlanJson,
  parseDesignSource,
  DesignSourceSchema,
  type DesignSource,
} from "./schema/agent-config.js";
export { mergeMcpConfig } from "./utils/mcp-merge.js";
export { ensureEnvGitignore } from "./utils/gitignore.js";
export {
  parseScreenTaggedAcceptanceCriteria,
  hasBlockingOpenItems,
  parseAcceptanceCriteriaIds,
  type ScreenTaggedAc,
} from "./features/spec-parse.js";
