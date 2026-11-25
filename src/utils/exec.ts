import { execa, type Options as ExecaOptions, type Result } from "execa";

export type RunCommand = (
  file: string,
  args?: readonly string[],
  options?: ExecaOptions,
) => Promise<Result>;

export const defaultRunCommand: RunCommand = (file, args = [], options = {}) =>
  execa(file, args, { ...options });
