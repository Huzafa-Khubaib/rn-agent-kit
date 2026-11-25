import { cssColorToHex } from "./color";
import { round, slug } from "./names";
import type { TailwindTheme } from "./snapshot";
import type { NormalizeContext } from "./normalize-figma";
import { put, checkColorName } from "./normalize-figma";
import type { DtcgToken } from "./types";

/** "0.5rem" | "8px" | "8" -> px number (1rem = 16px). */
export function cssLengthToPx(v: string): number | null {
  const m = /^(-?[\d.]+)\s*(px|rem|em)?$/.exec(v.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === "rem" || m[2] === "em" ? n * 16 : n;
}

function splitTopLevel(input: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of input) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === sep && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** First layer of a CSS box-shadow -> DTCG shadow value. null if unsupported (inset / unparsable). */
export function parseBoxShadow(css: string): Record<string, string> | null {
  const first = splitTopLevel(css, ",")[0]?.trim();
  if (!first || first === "none") return null;
  const parts: string[] = first.match(/[^\s(]+\([^)]*\)|\S+/g) ?? [];
  if (parts.includes("inset")) return null;
  const lengths: number[] = [];
  let color = "#000000";
  for (const p of parts) {
    const px = cssLengthToPx(p);
    if (px !== null) lengths.push(px);
    else {
      const c = cssColorToHex(p);
      if (c) color = c;
    }
  }
  if (lengths.length < 2) return null;
  const [x, y, blur = 0, spread = 0] = lengths;
  return {
    color,
    offsetX: `${round(x)}px`,
    offsetY: `${round(y)}px`,
    blur: `${round(blur)}px`,
    spread: `${round(spread)}px`,
  };
}

function colorEntries(
  colors: NonNullable<TailwindTheme["colors"]>,
  ctx: NormalizeContext,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const [group, val] of Object.entries(colors)) {
    const entries: [string[], string][] =
      typeof val === "string"
        ? [[[slug(group)], val]]
        : Object.entries(val).map(([k, v]) => [[slug(group), slug(k)], v]);
    for (const [path, raw] of entries) {
      const hex = cssColorToHex(raw);
      if (!hex) {
        ctx.issues.push({
          severity: "warning",
          code: "invalid-value",
          token: ["color", ...path].join("."),
          message: `Color "${raw}" is not hex/rgb(a) and was skipped.`,
          fix: "Use hex or rgb()/rgba() colors in the Stitch design (hsl, oklch and CSS variables are not converted).",
        });
        continue;
      }
      out.set(path.join("."), hex);
    }
  }
  return out;
}

export function normalizeTailwind(tw: TailwindTheme, ctx: NormalizeContext) {
  if (tw.colors) {
    const light = colorEntries(tw.colors, ctx);
    const dark = tw.darkColors ? colorEntries(tw.darkColors, ctx) : new Map<string, string>();
    for (const [path, hex] of [...light.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const segs = ["color", ...path.split(".")];
      checkColorName(path.split(".").join("/"), ctx, segs.join("."), false);
      const token: DtcgToken = { $type: "color", $value: hex };
      const d = dark.get(path);
      if (d && d !== hex) token.$extensions = { mode: { dark: d } };
      put(ctx, segs, token);
    }
    for (const path of dark.keys()) {
      if (!light.has(path)) {
        ctx.issues.push({
          severity: "warning",
          code: "invalid-value",
          token: `color.${path}`,
          message: `Dark color "${path}" has no light counterpart and was skipped.`,
          fix: "Define the same color name for both light and dark palettes.",
        });
      }
    }
    if (!tw.darkColors) {
      ctx.issues.push({
        severity: "info",
        code: "single-mode-source",
        message: "Stitch export contained only one color palette; dark theme will equal light.",
        fix: 'Generate a dark variant of the design in Stitch and add its palette as "tailwind.darkColors".',
      });
    }
  }

  const lengthGroup = (record: Record<string, string> | undefined, root: string) => {
    for (const [k, v] of Object.entries(record ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
      const px = cssLengthToPx(v);
      if (px === null) {
        ctx.issues.push({
          severity: "info",
          code: "invalid-value",
          token: `${root}.${slug(k)}`,
          message: `Length "${v}" could not be converted to px; skipped.`,
          fix: "Use px or rem values.",
        });
        continue;
      }
      put(ctx, [root, slug(k)], { $type: "dimension", $value: `${round(px)}px` });
    }
  };
  lengthGroup(tw.spacing, "spacing");
  lengthGroup(tw.borderRadius, "radius");

  for (const [k, v] of Object.entries(tw.fontFamily ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    const first = (Array.isArray(v) ? v[0] : v.split(",")[0])?.trim().replace(/^['"]|['"]$/g, "");
    if (first) put(ctx, ["font-family", slug(k)], { $type: "fontFamily", $value: first });
  }

  for (const [k, v] of Object.entries(tw.fontSize ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    const size = typeof v === "string" ? v : v[0];
    const px = cssLengthToPx(size);
    if (px === null) continue;
    put(ctx, ["font-size", slug(k)], { $type: "dimension", $value: `${round(px)}px` });
    const lh =
      Array.isArray(v) && typeof v[1] === "object"
        ? v[1].lineHeight
        : Array.isArray(v)
          ? (v[1] as string)
          : undefined;
    if (lh) {
      const lhPx = /^[\d.]+$/.test(lh) ? Number(lh) * px : cssLengthToPx(lh);
      if (lhPx !== null)
        put(ctx, ["line-height", slug(k)], { $type: "dimension", $value: `${round(lhPx)}px` });
    }
  }
  if (tw.fontSize) {
    ctx.issues.push({
      severity: "info",
      code: "invalid-value",
      message:
        "Stitch/Tailwind has no text styles; only font-size/line-height/font-family tokens were created.",
      fix: 'Compose "typography.*" tokens in Figma (text styles) if you need ready-made text styles.',
    });
  }

  for (const [k, v] of Object.entries(tw.boxShadow ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    const shadow = parseBoxShadow(v);
    if (!shadow) {
      ctx.issues.push({
        severity: "warning",
        code: "unsupported-effect",
        token: `shadow.${slug(k)}`,
        message: `Shadow "${k}: ${v}" is inset/unparsable and was skipped.`,
        fix: "RN supports outer drop shadows only.",
      });
      continue;
    }
    put(ctx, ["shadow", slug(k)], { $type: "shadow", $value: shadow });
  }
}
