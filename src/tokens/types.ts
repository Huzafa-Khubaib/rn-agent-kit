/** W3C Design Tokens Community Group (DTCG) types used by rn-agentic-dev. */
export type DtcgType =
  | "color"
  | "dimension"
  | "fontFamily"
  | "fontWeight"
  | "duration"
  | "cubicBezier"
  | "number"
  | "shadow"
  | "typography";

export interface DtcgToken {
  $value: unknown;
  $type?: DtcgType;
  $description?: string;
  /** Modes live in `$extensions.mode`, e.g. { dark: "{color.neutral.900}" }. `$value` is the light/default mode. */
  $extensions?: Record<string, unknown>;
}

export interface DtcgGroup {
  $type?: DtcgType;
  $description?: string;
  [key: string]: unknown;
}

export interface FlatToken {
  /** Dot path, e.g. "color.primary.500" */
  path: string;
  type: DtcgType;
  value: unknown;
  /** Extra modes, e.g. { dark: ... } */
  modes: Record<string, unknown>;
  description?: string;
}

export type Severity = "error" | "warning" | "info";

export type IssueCode =
  | "unnamed-token"
  | "ungrouped-token"
  | "ambiguous-type"
  | "unsupported-type"
  | "unresolved-alias"
  | "name-collision"
  | "missing-dark-mode"
  | "missing-category"
  | "ignored-mode"
  | "style-without-variable"
  | "unsupported-effect"
  | "missing-line-height"
  | "font-loading"
  | "single-mode-source"
  | "invalid-value";

export interface Issue {
  severity: Severity;
  code: IssueCode;
  token?: string;
  message: string;
  /** What the human should do (in Figma / Stitch) to resolve it. */
  fix: string;
}
