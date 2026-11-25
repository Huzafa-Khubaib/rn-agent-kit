export interface Skill {
  name: string;
  content: string;
  description: string;
  globs: string[];
  alwaysApply: boolean;
}

export interface Adapter {
  name: string;
  detect(cwd: string): boolean | Promise<boolean>;
  install(skills: Skill[], cwd: string): Promise<void>;
}
