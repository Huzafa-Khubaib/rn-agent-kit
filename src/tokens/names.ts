export function slug(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s === "" ? "_" : s;
}

/** "Color/Text/On Surface" -> ["color","text","on-surface"] */
export function splitName(name: string): string[] {
  return name
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean)
    .map(slug);
}

/** "on-surface" -> "onSurface"; numeric keys are kept ("500"). */
export function toThemeKey(seg: string): string {
  return /^\d+$/.test(seg) ? seg : seg.replace(/-([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
}

export function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
