import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathExists } from "../utils/fs.js";

export type ProjectStack = "expo" | "cli" | "unknown";
export type PackageManager = "npm" | "yarn" | "pnpm" | "bun";
export type NavigationLib = "expo-router" | "react-navigation" | "unknown" | "none";

export interface ProjectDetection {
  hasPackageJson: boolean;
  isReactNative: boolean;
  stack: ProjectStack;
  typescript: boolean;
  packageManager: PackageManager;
  navigation: NavigationLib;
  packageName?: string;
}

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

async function readPackageJson(cwd: string): Promise<PackageJson | null> {
  const file = path.join(cwd, "package.json");
  if (!(await pathExists(file))) return null;
  try {
    return JSON.parse(await readFile(file, "utf8")) as PackageJson;
  } catch {
    return null;
  }
}

function hasDep(pkg: PackageJson, name: string): boolean {
  return Boolean(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);
}

export async function detectPackageManager(cwd: string): Promise<PackageManager> {
  if (await pathExists(path.join(cwd, "bun.lockb"))) return "bun";
  if (await pathExists(path.join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (await pathExists(path.join(cwd, "yarn.lock"))) return "yarn";
  return "npm";
}

export async function detectProject(cwd: string): Promise<ProjectDetection> {
  const pkg = await readPackageJson(cwd);
  if (!pkg) {
    return {
      hasPackageJson: false,
      isReactNative: false,
      stack: "unknown",
      typescript: false,
      packageManager: await detectPackageManager(cwd),
      navigation: "none",
    };
  }

  const isReactNative =
    hasDep(pkg, "react-native") ||
    hasDep(pkg, "expo") ||
    (await pathExists(path.join(cwd, "app.json"))) ||
    (await pathExists(path.join(cwd, "app.config.ts"))) ||
    (await pathExists(path.join(cwd, "app.config.js")));

  let stack: ProjectStack = "unknown";
  if (hasDep(pkg, "expo") || (await pathExists(path.join(cwd, "app.json")))) {
    stack = "expo";
  } else if (hasDep(pkg, "react-native")) {
    stack = "cli";
  }

  const typescript =
    hasDep(pkg, "typescript") ||
    (await pathExists(path.join(cwd, "tsconfig.json"))) ||
    (await pathExists(path.join(cwd, "app.config.ts")));

  let navigation: NavigationLib = "none";
  if (hasDep(pkg, "expo-router")) navigation = "expo-router";
  else if (
    hasDep(pkg, "@react-navigation/native") ||
    hasDep(pkg, "@react-navigation/native-stack")
  ) {
    navigation = "react-navigation";
  } else if (isReactNative) {
    navigation = "unknown";
  }

  return {
    hasPackageJson: true,
    isReactNative,
    stack,
    typescript,
    packageManager: await detectPackageManager(cwd),
    navigation,
    packageName: pkg.name,
  };
}

export function formatDetectionSummary(d: ProjectDetection): string {
  const lines = [
    `package.json: ${d.hasPackageJson ? "yes" : "no"}`,
    `react-native: ${d.isReactNative ? "yes" : "no"}`,
    `stack: ${d.stack}`,
    `typescript: ${d.typescript ? "yes" : "no"}`,
    `package manager: ${d.packageManager}`,
    `navigation: ${d.navigation}`,
  ];
  if (d.packageName) lines.unshift(`name: ${d.packageName}`);
  return lines.join("\n");
}
