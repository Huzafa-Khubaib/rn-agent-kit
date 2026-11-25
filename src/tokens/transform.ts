import { splitAlpha } from "./color";
import { round, toThemeKey } from "./names";
import { flatten } from "./tree";
import type { DtcgGroup, DtcgType, FlatToken } from "./types";

export class TokenError extends Error {}

export type ThemeNode = string | number | boolean | number[] | { [key: string]: ThemeNode };
export type ThemeTree = { [key: string]: ThemeNode };

export interface BuiltThemes {
  light: ThemeTree;
  dark: ThemeTree;
  hasDark: boolean;
  warnings: string[];
}

const ALIAS_RE = /^\{([^{}]+)\}$/;

/** First DTCG path segment -> top-level key in the generated theme. */
const ROOT_KEYS: Record<string, string> = {
  color: "colors",
  shadow: "shadows",
  "font-family": "fontFamilies",
  "font-size": "fontSizes",
  "line-height": "lineHeights",
  "font-weight": "fontWeights",
};

type Index = Map<string, FlatToken>;
type Mode = "light" | "dark";

function resolveDeep(value: unknown, mode: Mode, index: Index, stack: string[]): unknown {
  if (typeof value === "string") {
    const m = ALIAS_RE.exec(value);
    if (!m) return value;
    const target = m[1];
    if (stack.includes(target))
      throw new TokenError(`Circular alias: ${[...stack, target].join(" -> ")}`);
    const t = index.get(target);
    if (!t) throw new TokenError(`Unresolved alias {${target}} referenced from "${stack[0]}"`);
    const next = mode === "dark" && "dark" in t.modes ? t.modes.dark : t.value;
    return resolveDeep(next, mode, index, [...stack, target]);
  }
  if (Array.isArray(value)) return value.map((v) => resolveDeep(v, mode, index, stack));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, resolveDeep(v, mode, index, stack)]),
    );
  }
  return value;
}

function px(v: unknown, path: string): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const m = /^(-?[\d.]+)\s*(px|rem|em)?$/.exec(v.trim());
    if (m) return round(Number(m[1]) * (m[2] === "rem" || m[2] === "em" ? 16 : 1), 4);
  }
  throw new TokenError(`"${path}": expected a dimension like "16px", got ${JSON.stringify(v)}`);
}

function rec(v: unknown, path: string): Record<string, unknown> {
  if (typeof v === "object" && v !== null && !Array.isArray(v)) return v as Record<string, unknown>;
  throw new TokenError(`"${path}": expected an object value`);
}

function family(v: unknown, path: string): string {
  const f = Array.isArray(v) ? v[0] : v;
  if (typeof f !== "string" || !f) throw new TokenError(`"${path}": expected a font family string`);
  return f;
}

function convertLeaf(type: DtcgType, v: unknown, path: string, warnings: string[]): ThemeNode {
  switch (type) {
    case "color": {
      if (typeof v !== "string" || !/^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(v))
        throw new TokenError(`"${path}": expected a #rrggbb[aa] color, got ${JSON.stringify(v)}`);
      return v.toLowerCase();
    }
    case "dimension":
      return px(v, path);
    case "number":
      if (typeof v !== "number") throw new TokenError(`"${path}": expected a number`);
      return v;
    case "fontWeight": {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new TokenError(`"${path}": expected a numeric font weight`);
      return String(n);
    }
    case "fontFamily":
      return family(v, path);
    case "duration": {
      const m = /^([\d.]+)\s*(ms|s)?$/.exec(String(v));
      if (!m) throw new TokenError(`"${path}": expected a duration like "200ms"`);
      return round(Number(m[1]) * (m[2] === "s" ? 1000 : 1), 2);
    }
    case "cubicBezier":
      if (!Array.isArray(v) || v.length !== 4)
        throw new TokenError(`"${path}": expected 4 numbers`);
      return v.map(Number);
    case "shadow": {
      const layers = Array.isArray(v) ? v : [v];
      if (layers.length > 1)
        warnings.push(
          `"${path}" has ${layers.length} shadow layers; React Native supports one, using the first.`,
        );
      const s = rec(layers[0], path);
      const color = String(s.color);
      if (!/^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(color))
        throw new TokenError(`"${path}": shadow.color must be hex`);
      const { rgb, alpha } = splitAlpha(color.toLowerCase());
      const blur = px(s.blur ?? 0, path);
      // Heuristic: Figma blur ≈ 2 × RN shadowRadius; Android elevation ≈ shadowRadius.
      return {
        shadowColor: rgb,
        shadowOffset: { width: px(s.offsetX ?? 0, path), height: px(s.offsetY ?? 0, path) },
        shadowOpacity: alpha,
        shadowRadius: round(blur / 2, 2),
        elevation: Math.round(blur / 2),
      };
    }
    case "typography": {
      const t = rec(v, path);
      const fontSize = px(t.fontSize, `${path}.fontSize`);
      const out: { [key: string]: ThemeNode } = {
        fontFamily: family(t.fontFamily, `${path}.fontFamily`),
        fontSize,
        fontWeight: String(Number(t.fontWeight ?? 400)),
      };
      if (t.lineHeight !== undefined) {
        // DTCG lineHeight is a unitless multiplier; RN wants absolute px.
        out.lineHeight =
          typeof t.lineHeight === "number"
            ? round(fontSize * t.lineHeight, 2)
            : px(t.lineHeight, `${path}.lineHeight`);
      }
      if (t.letterSpacing !== undefined)
        out.letterSpacing = px(t.letterSpacing, `${path}.letterSpacing`);
      return out;
    }
  }
}

function setNested(tree: ThemeTree, keys: string[], value: ThemeNode, path: string) {
  let node = tree;
  for (const k of keys.slice(0, -1)) {
    const next = node[k];
    if (next === undefined) {
      const created: ThemeTree = {};
      node[k] = created;
      node = created;
    } else if (typeof next === "object" && !Array.isArray(next)) {
      node = next as ThemeTree;
    } else {
      throw new TokenError(`"${path}": path conflicts with the value at "${k}"`);
    }
  }
  const leaf = keys[keys.length - 1];
  if (node[leaf] !== undefined)
    throw new TokenError(
      `"${path}": duplicate theme key "${keys.join(".")}" after camelCase conversion`,
    );
  node[leaf] = value;
}

/** Two-segment prefixes designers commonly use in Figma ("font/family/sans"). */
const PREFIX_KEYS: Record<string, string> = {
  "font.family": "fontFamilies",
  "font.size": "fontSizes",
  "font.weight": "fontWeights",
  "line.height": "lineHeights",
};

export function themeKeys(path: string): string[] {
  const segs = path.split(".");
  const prefix = PREFIX_KEYS[segs.slice(0, 2).join(".")];
  if (prefix && segs.length > 2) return [prefix, ...segs.slice(2).map(toThemeKey)];
  const [root, ...rest] = segs;
  return [ROOT_KEYS[root] ?? toThemeKey(root), ...rest.map(toThemeKey)];
}

/** DTCG tree -> fully resolved light + dark theme objects (React Native-ready values). */
export function buildThemes(tree: DtcgGroup): BuiltThemes {
  const flat = flatten(tree);
  const index: Index = new Map(flat.map((t) => [t.path, t]));
  const warnings: string[] = [];
  const themes: Record<Mode, ThemeTree> = { light: {}, dark: {} };
  for (const mode of ["light", "dark"] as const) {
    for (const t of flat) {
      const raw = mode === "dark" && "dark" in t.modes ? t.modes.dark : t.value;
      const resolved = resolveDeep(raw, mode, index, [t.path]);
      const leaf = convertLeaf(t.type, resolved, t.path, mode === "light" ? warnings : []);
      setNested(themes[mode], themeKeys(t.path), leaf, t.path);
    }
  }
  return { ...themes, hasDark: flat.some((t) => "dark" in t.modes), warnings };
}
