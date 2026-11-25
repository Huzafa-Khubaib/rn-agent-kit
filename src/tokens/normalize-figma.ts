import { cssColorToHex, figmaColorToHex, normalizeHex } from "./color";
import { round, splitName } from "./names";
import type {
  ColorStyleSnap,
  EffectStyleSnap,
  FigmaCollection,
  FigmaValue,
  FigmaVariable,
  FigmaVariablesMeta,
  FlatValue,
  TextStyleSnap,
} from "./snapshot";
import { setToken } from "./tree";
import type { DtcgGroup, DtcgToken, DtcgType, Issue } from "./types";

export interface NormalizeContext {
  tree: DtcgGroup;
  issues: Issue[];
}

const UNNAMED_RE =
  /^(color|colour|fill|stroke|untitled|rectangle|frame|group|style|variable|paint|text|effect)[\s_-]*\d*$/i;
const HEXISH_RE = /^(#[0-9a-f]{3,8}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const WEIGHTS: Record<string, number> = {
  thin: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  regular: 400,
  normal: 400,
  book: 400,
  medium: 500,
  semibold: 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
};

export function weightFromStyleName(style?: string): number | undefined {
  if (!style) return undefined;
  const key = style.toLowerCase().replace(/italic|oblique|[\s_-]/g, "");
  return key === "" ? 400 : WEIGHTS[key];
}

/** Put a token in the tree or record a collision issue. */
export function put(ctx: NormalizeContext, path: string[], token: DtcgToken): boolean {
  if (setToken(ctx.tree, path, token)) return true;
  ctx.issues.push({
    severity: "error",
    code: "name-collision",
    token: path.join("."),
    message: `"${path.join(".")}" collides with another token or group after name normalization; this one was skipped.`,
    fix: 'Give the two variables/styles distinct names (names are lower-cased and non-alphanumerics become "-").',
  });
  return false;
}

export function checkColorName(
  raw: string,
  ctx: NormalizeContext,
  tokenPath: string,
  requireGroup = true,
) {
  const name = raw.trim();
  if (UNNAMED_RE.test(name) || HEXISH_RE.test(name)) {
    ctx.issues.push({
      severity: "warning",
      code: "unnamed-token",
      token: tokenPath,
      message: `Color "${raw}" has a placeholder/unnamed name, so it cannot carry meaning in code.`,
      fix: 'Rename it in Figma to a semantic path, e.g. "color/brand/primary" or "color/text/muted".',
    });
  } else if (requireGroup && !name.includes("/")) {
    ctx.issues.push({
      severity: "info",
      code: "ungrouped-token",
      token: tokenPath,
      message: `Color "${raw}" is not inside a group (no "/" in its name).`,
      fix: 'Prefix it with a group, e.g. "color/neutral/white".',
    });
  }
}

/** Decide the DTCG type for a numeric Figma variable by its name. null = ambiguous. */
export function inferNumberType(name: string): DtcgType | null {
  const n = name.toLowerCase();
  if (/(^|\/)(opacity|alpha)($|\/|-)/.test(n)) return "number";
  if (/weight/.test(n)) return "fontWeight";
  if (/(duration|delay|time)/.test(n)) return "duration";
  if (
    /(space|spacing|gap|padding|margin|size|radius|radii|rounded|stroke|border|width|height|font|line-height|letter)/.test(
      n,
    )
  )
    return "dimension";
  return null;
}

/** Color variables always live under `color.*`, even if the designer omitted the prefix ("Brand/Primary"). */
export function colorPath(name: string): string[] {
  const segs = splitName(name);
  if (["color", "colors", "colour", "colours"].includes(segs[0]))
    return ["color", ...segs.slice(1)];
  return ["color", ...segs];
}

function modeRoles(c: FigmaCollection) {
  const find = (re: RegExp, exclude?: string) =>
    c.modes.find((m) => re.test(m.name) && m.modeId !== exclude)?.modeId;
  const base = find(/light/i) ?? c.defaultModeId;
  const dark = find(/dark/i, base);
  const ignored = c.modes.filter((m) => m.modeId !== base && m.modeId !== dark).map((m) => m.name);
  return { base, dark, ignored };
}

function isAlias(v: FigmaValue): v is { type: "VARIABLE_ALIAS"; id: string } {
  return typeof v === "object" && v !== null && "type" in v && v.type === "VARIABLE_ALIAS";
}

export function normalizeVariables(meta: FigmaVariablesMeta, ctx: NormalizeContext) {
  const vars = Object.values(meta.variables).sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
  const pathOf = new Map<string, string[]>(
    vars.map((v) => [v.id, v.resolvedType === "COLOR" ? colorPath(v.name) : splitName(v.name)]),
  );
  const reportedModes = new Set<string>();

  const convert = (
    value: FigmaValue | undefined,
    type: DtcgType,
    v: FigmaVariable,
    tokenPath: string,
  ): unknown => {
    if (value === undefined) return undefined;
    if (isAlias(value)) {
      const target = pathOf.get(value.id);
      if (!target) {
        ctx.issues.push({
          severity: "error",
          code: "unresolved-alias",
          token: tokenPath,
          message: `"${v.name}" aliases a variable that is not in this file (likely from an external library).`,
          fix: "Publish/enable the library and re-run, or detach the alias in Figma so the variable has its own value.",
        });
        return undefined;
      }
      return `{${target.join(".")}}`;
    }
    switch (type) {
      case "color":
        return typeof value === "object" && "r" in value ? figmaColorToHex(value) : undefined;
      case "dimension":
        return typeof value === "number" ? `${round(value)}px` : undefined;
      case "duration":
        return typeof value === "number" ? `${round(value)}ms` : undefined;
      case "number":
      case "fontWeight":
        return typeof value === "number" ? value : undefined;
      case "fontFamily":
        return typeof value === "string" ? value : undefined;
      default:
        return undefined;
    }
  };

  for (const v of vars) {
    const col = meta.variableCollections[v.variableCollectionId];
    if (!col) continue;
    const path = pathOf.get(v.id) ?? [];
    const tokenPath = path.join(".");

    let type: DtcgType | null = null;
    if (v.resolvedType === "COLOR") type = "color";
    else if (v.resolvedType === "FLOAT") {
      type = inferNumberType(v.name);
      if (!type) {
        type = "number";
        ctx.issues.push({
          severity: "info",
          code: "ambiguous-type",
          token: tokenPath,
          message: `Number "${v.name}" has no unit hint in its name; exported as a plain number.`,
          fix: 'Rename with a category, e.g. "spacing/md", "radius/lg", "opacity/disabled", "font-size/body".',
        });
      }
    } else if (v.resolvedType === "STRING") {
      type = /font|family|typeface/i.test(v.name) ? "fontFamily" : null;
    }
    if (!type) {
      ctx.issues.push({
        severity: "info",
        code: "unsupported-type",
        token: tokenPath,
        message: `Variable "${v.name}" (${v.resolvedType}) is not exportable as a design token and was skipped.`,
        fix: 'Only COLOR, FLOAT and font-family STRING variables are exported. Rename string variables with "font-family" if they are fonts.',
      });
      continue;
    }

    if (type === "color") checkColorName(v.name, ctx, tokenPath);

    const roles = modeRoles(col);
    if (roles.ignored.length && !reportedModes.has(col.id)) {
      reportedModes.add(col.id);
      ctx.issues.push({
        severity: "info",
        code: "ignored-mode",
        token: col.name,
        message: `Collection "${col.name}" has extra modes that are ignored: ${roles.ignored.join(", ")}.`,
        fix: 'Only "Light"/default and "Dark" modes are exported. Rename modes accordingly if they should be included.',
      });
    }

    const base = convert(v.valuesByMode[roles.base], type, v, tokenPath);
    if (base === undefined) continue;
    const token: DtcgToken = { $type: type, $value: base };
    if (v.description) token.$description = v.description;
    if (roles.dark) {
      const dark = convert(v.valuesByMode[roles.dark], type, v, tokenPath);
      if (dark !== undefined && JSON.stringify(dark) !== JSON.stringify(base))
        token.$extensions = { mode: { dark } };
    }
    put(ctx, path, token);
  }
}

/** Figma MCP `get_variable_defs` fallback: flat { name: value } maps. */
export function normalizeFlat(
  light: Record<string, FlatValue>,
  dark: Record<string, FlatValue> | undefined,
  ctx: NormalizeContext,
) {
  const parse = (name: string, val: FlatValue): { type: DtcgType; value: unknown } | null => {
    if (typeof val === "number") {
      const type = inferNumberType(name) ?? "number";
      if (type === "dimension") return { type, value: `${round(val)}px` };
      if (type === "duration") return { type, value: `${round(val)}ms` };
      return { type, value: val };
    }
    const color = cssColorToHex(val);
    if (color) return { type: "color", value: color };
    if (/^Font\(/i.test(val)) {
      // Best-effort: Font(family: "Inter", style: Bold, size: 24, weight: 700, lineHeight: 32, letterSpacing: 0)
      const family = /family:\s*"([^"]+)"/.exec(val)?.[1];
      const size = Number(/size:\s*([\d.]+)/.exec(val)?.[1]);
      if (!family || !size) return null;
      const weight =
        Number(/weight:\s*(\d+)/.exec(val)?.[1]) ||
        weightFromStyleName(/style:\s*([A-Za-z ]+)/.exec(val)?.[1]) ||
        400;
      const lh = Number(/lineHeight:\s*([\d.]+)/.exec(val)?.[1]);
      const ls = Number(/letterSpacing:\s*(-?[\d.]+)/.exec(val)?.[1]);
      const value: Record<string, unknown> = {
        fontFamily: family,
        fontSize: `${size}px`,
        fontWeight: weight,
      };
      if (lh) value.lineHeight = round(lh / size, 4);
      if (ls) value.letterSpacing = `${round(ls)}px`;
      return { type: "typography", value };
    }
    if (/^\d+(\.\d+)?$/.test(val.trim()) === false && /font|family/i.test(name))
      return { type: "fontFamily", value: val };
    return null;
  };

  for (const name of Object.keys(light).sort()) {
    const parsed = parse(name, light[name]);
    const path = parsed?.type === "color" ? colorPath(name) : splitName(name);
    const tokenPath = path.join(".");
    if (!parsed) {
      ctx.issues.push({
        severity: "info",
        code: "invalid-value",
        token: tokenPath,
        message: `Value of "${name}" could not be interpreted (${JSON.stringify(light[name])}); skipped.`,
        fix: "Check the variable type in Figma, or provide full variables via the REST API / agent snapshot.",
      });
      continue;
    }
    if (parsed.type === "color") checkColorName(name, ctx, tokenPath);
    const token: DtcgToken = { $type: parsed.type, $value: parsed.value };
    const darkRaw = dark?.[name];
    if (darkRaw !== undefined) {
      const d = parse(name, darkRaw);
      if (d && JSON.stringify(d.value) !== JSON.stringify(parsed.value))
        token.$extensions = { mode: { dark: d.value } };
    }
    put(ctx, path, token);
  }
  if (!dark) {
    ctx.issues.push({
      severity: "info",
      code: "single-mode-source",
      message:
        "Variables came from a single-mode source (MCP get_variable_defs); no dark values were captured.",
      fix: 'Put a frame in Dark mode, run get_variable_defs on it and store the result as "flatVariablesDark" (or use the Variables REST API on Enterprise).',
    });
  }
}

function stripRoot(path: string[], roots: string[]): string[] {
  return path.length > 1 && roots.includes(path[0]) ? path.slice(1) : path;
}

export function normalizeColorStyles(styles: ColorStyleSnap[], ctx: NormalizeContext) {
  for (const s of [...styles].sort((a, b) => a.name.localeCompare(b.name))) {
    const path = ["color", ...stripRoot(splitName(s.name), ["color", "colour"])];
    const tokenPath = path.join(".");
    checkColorName(s.name, ctx, tokenPath);
    const token: DtcgToken = { $type: "color", $value: figmaColorToHex(s.color) };
    if (s.description) token.$description = s.description;
    if (put(ctx, path, token)) {
      ctx.issues.push({
        severity: "info",
        code: "style-without-variable",
        token: tokenPath,
        message: `Color style "${s.name}" is not backed by a variable, so it has no light/dark values.`,
        fix: "Convert it to a Figma variable (with Light/Dark modes) to get dark-mode support.",
      });
    }
  }
}

export function normalizeTextStyles(styles: TextStyleSnap[], ctx: NormalizeContext) {
  for (const s of [...styles].sort((a, b) => a.name.localeCompare(b.name))) {
    const path = ["typography", ...stripRoot(splitName(s.name), ["typography", "text", "font"])];
    const tokenPath = path.join(".");
    const value: Record<string, unknown> = {
      fontFamily: s.fontFamily,
      fontSize: `${round(s.fontSize)}px`,
      fontWeight: s.fontWeight ?? weightFromStyleName(s.fontStyle) ?? 400,
    };
    const lhPx =
      s.lineHeightPx ??
      (s.lineHeightPercent !== undefined ? (s.fontSize * s.lineHeightPercent) / 100 : undefined);
    if (lhPx !== undefined) value.lineHeight = round(lhPx / s.fontSize, 4);
    else {
      ctx.issues.push({
        severity: "warning",
        code: "missing-line-height",
        token: tokenPath,
        message: `Text style "${s.name}" has automatic line height; RN will use the font default.`,
        fix: "Set an explicit line height on the text style in Figma.",
      });
    }
    const lsPx =
      s.letterSpacingPx ??
      (s.letterSpacingPercent !== undefined ? (s.fontSize * s.letterSpacingPercent) / 100 : 0);
    if (lsPx) value.letterSpacing = `${round(lsPx)}px`;
    const token: DtcgToken = { $type: "typography", $value: value };
    if (s.description) token.$description = s.description;
    put(ctx, path, token);
  }
}

export function normalizeEffectStyles(styles: EffectStyleSnap[], ctx: NormalizeContext) {
  for (const s of [...styles].sort((a, b) => a.name.localeCompare(b.name))) {
    const path = [
      "shadow",
      ...stripRoot(splitName(s.name), ["shadow", "shadows", "elevation", "effect"]),
    ];
    const tokenPath = path.join(".");
    const layers: Record<string, unknown>[] = [];
    for (const e of s.effects) {
      if (e.visible === false) continue;
      if (e.type === "DROP_SHADOW" && e.color) {
        layers.push({
          color: figmaColorToHex(e.color),
          offsetX: `${round(e.offset?.x ?? 0)}px`,
          offsetY: `${round(e.offset?.y ?? 0)}px`,
          blur: `${round(e.radius ?? 0)}px`,
          spread: `${round(e.spread ?? 0)}px`,
        });
      } else {
        ctx.issues.push({
          severity: "warning",
          code: "unsupported-effect",
          token: tokenPath,
          message: `Effect "${e.type}" in "${s.name}" is not supported by React Native and was skipped.`,
          fix: "Use drop shadows only for elevation. Blurs/inner shadows need a custom native or Skia implementation.",
        });
      }
    }
    if (!layers.length) continue;
    const token: DtcgToken = { $type: "shadow", $value: layers.length === 1 ? layers[0] : layers };
    if (s.description) token.$description = s.description;
    put(ctx, path, token);
  }
}

export { normalizeHex };
