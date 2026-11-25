import { flatten } from "./tree";
import {
  normalizeColorStyles,
  normalizeEffectStyles,
  normalizeFlat,
  normalizeTextStyles,
  normalizeVariables,
  type NormalizeContext,
} from "./normalize-figma";
import { normalizeTailwind } from "./normalize-stitch";
import type { DesignSnapshot } from "./snapshot";
import type { DtcgGroup, Issue } from "./types";

const RANK = { error: 0, warning: 1, info: 2 } as const;

export function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort(
    (a, b) =>
      RANK[a.severity] - RANK[b.severity] ||
      a.code.localeCompare(b.code) ||
      (a.token ?? "").localeCompare(b.token ?? "") ||
      a.message.localeCompare(b.message),
  );
}

function postChecks(ctx: NormalizeContext) {
  const flat = flatten(ctx.tree);
  const roots = new Set(flat.map((t) => t.path.split(".")[0]));

  const required: [string, string, Issue["severity"]][] = [
    ["color", "colors", "warning"],
    ["spacing", "spacing scale", "warning"],
    ["radius", "border radius", "warning"],
    ["typography", "text styles", "warning"],
    ["shadow", "shadows/elevation", "info"],
  ];
  for (const [root, label, severity] of required) {
    if (!roots.has(root)) {
      ctx.issues.push({
        severity,
        code: "missing-category",
        token: root,
        message: `No "${root}.*" tokens found (${label}). Components would have to hardcode them.`,
        fix: `Add ${label} as Figma variables/styles named "${root}/...", then re-run.`,
      });
    }
  }

  const colors = flat.filter((t) => t.type === "color");
  const aliasColors = colors.filter((t) => typeof t.value === "string" && /^\{.+\}$/.test(t.value));
  const hasDark = colors.some((t) => "dark" in t.modes);
  if (colors.length && !hasDark) {
    ctx.issues.push({
      severity: "warning",
      code: "missing-dark-mode",
      message: "No color token has a Dark value. darkTheme will be identical to lightTheme.",
      fix: 'Add a "Dark" mode to your semantic color collection in Figma (or a dark palette in Stitch).',
    });
  } else if (hasDark) {
    for (const t of aliasColors.filter((c) => !("dark" in c.modes))) {
      ctx.issues.push({
        severity: "warning",
        code: "missing-dark-mode",
        token: t.path,
        message: `Semantic color "${t.path}" has the same value in Light and Dark.`,
        fix: "If that is intentional, ignore. Otherwise set a different value for the Dark mode in Figma.",
      });
    }
  }

  const families = new Set<string>();
  for (const t of flat) {
    if (t.type === "fontFamily" && typeof t.value === "string") families.add(t.value);
    if (t.type === "typography" && typeof t.value === "object" && t.value) {
      const f = (t.value as { fontFamily?: unknown }).fontFamily;
      if (typeof f === "string") families.add(f);
    }
  }
  if (families.size) {
    ctx.issues.push({
      severity: "info",
      code: "font-loading",
      message: `Fonts used: ${[...families].sort().join(", ")}. React Native needs each family/weight loaded under the exact name used in the theme.`,
      fix: "Load fonts with expo-font (useFonts) or link them natively, and verify the registered family names.",
    });
  }
}

export function normalizeSnapshot(snap: DesignSnapshot): { tree: DtcgGroup; issues: Issue[] } {
  const ctx: NormalizeContext = { tree: {}, issues: [] };
  if (snap.variables) normalizeVariables(snap.variables, ctx);
  if (snap.flatVariables) normalizeFlat(snap.flatVariables, snap.flatVariablesDark, ctx);
  if (snap.colorStyles) normalizeColorStyles(snap.colorStyles, ctx);
  if (snap.textStyles) normalizeTextStyles(snap.textStyles, ctx);
  if (snap.effectStyles) normalizeEffectStyles(snap.effectStyles, ctx);
  if (snap.tailwind) normalizeTailwind(snap.tailwind, ctx);
  postChecks(ctx);
  return { tree: ctx.tree, issues: sortIssues(ctx.issues) };
}
