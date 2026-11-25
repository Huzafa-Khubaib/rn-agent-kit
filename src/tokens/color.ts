import { round } from "./names";

export interface RgbaColor {
  r: number; // 0..1
  g: number;
  b: number;
  a?: number;
}

const byte = (n: number) =>
  Math.round(Math.min(1, Math.max(0, n)) * 255)
    .toString(16)
    .padStart(2, "0");

/** Figma color (0..1 floats) -> lowercase #rrggbb or #rrggbbaa */
export function figmaColorToHex(c: RgbaColor): string {
  const base = `#${byte(c.r)}${byte(c.g)}${byte(c.b)}`;
  const a = c.a ?? 1;
  return a >= 0.999 ? base : base + byte(a);
}

/** Validates + normalizes hex to lowercase 6/8 digits. Returns null if invalid. */
export function normalizeHex(input: string): string | null {
  const m = /^#([0-9a-f]{3,8})$/i.exec(input.trim());
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
  if (h.length !== 6 && h.length !== 8) return null;
  return `#${h}`;
}

/** Accepts hex, rgb(), rgba(). hsl()/named colors return null (reported by callers). */
export function cssColorToHex(input: string): string | null {
  const hex = normalizeHex(input);
  if (hex) return hex;
  const m =
    /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+)(%?))?\s*\)$/i.exec(
      input.trim(),
    );
  if (!m) return null;
  const a = m[4] === undefined ? 1 : m[5] === "%" ? Number(m[4]) / 100 : Number(m[4]);
  return figmaColorToHex({
    r: Number(m[1]) / 255,
    g: Number(m[2]) / 255,
    b: Number(m[3]) / 255,
    a,
  });
}

/** "#rrggbbaa" -> { rgb: "#rrggbb", alpha: 0..1 } */
export function splitAlpha(hex: string): { rgb: string; alpha: number } {
  if (hex.length === 9)
    return { rgb: hex.slice(0, 7), alpha: round(parseInt(hex.slice(7, 9), 16) / 255, 2) };
  return { rgb: hex.slice(0, 7), alpha: 1 };
}
