import type { RgbaColor } from "./color";

/**
 * The "design snapshot" is the only input of the deterministic pipeline.
 * The AI agent (non-deterministic) fills it from Figma/Stitch; the script (deterministic) does the rest.
 */
export type FigmaAlias = { type: "VARIABLE_ALIAS"; id: string };
export type FigmaValue = RgbaColor | FigmaAlias | number | string | boolean;

export interface FigmaVariable {
  id: string;
  name: string; // "color/primary/500"
  resolvedType: "COLOR" | "FLOAT" | "STRING" | "BOOLEAN";
  description?: string;
  variableCollectionId: string;
  valuesByMode: Record<string, FigmaValue>;
}

export interface FigmaCollection {
  id: string;
  name: string;
  modes: { modeId: string; name: string }[];
  defaultModeId: string;
}

/** Same shape as `meta` from GET /v1/files/:key/variables/local */
export interface FigmaVariablesMeta {
  variables: Record<string, FigmaVariable>;
  variableCollections: Record<string, FigmaCollection>;
}

export interface TextStyleSnap {
  name: string; // "Heading/H1"
  description?: string;
  fontFamily: string;
  fontStyle?: string; // "Bold", "SemiBold"
  fontWeight?: number;
  fontSize: number;
  lineHeightPx?: number;
  lineHeightPercent?: number; // % of font size
  letterSpacingPx?: number;
  letterSpacingPercent?: number;
}

export interface EffectLayerSnap {
  type: string; // DROP_SHADOW | INNER_SHADOW | LAYER_BLUR | BACKGROUND_BLUR
  visible?: boolean;
  color?: RgbaColor;
  offset?: { x: number; y: number };
  radius?: number;
  spread?: number;
}

export interface EffectStyleSnap {
  name: string; // "Elevation/md"
  description?: string;
  effects: EffectLayerSnap[];
}

export interface ColorStyleSnap {
  name: string;
  description?: string;
  color: RgbaColor;
}

export type FlatValue = string | number;

/** Tailwind-like theme (what Google Stitch's HTML/Tailwind export contains). */
export interface TailwindTheme {
  colors?: Record<string, string | Record<string, string>>;
  darkColors?: Record<string, string | Record<string, string>>;
  spacing?: Record<string, string>;
  borderRadius?: Record<string, string>;
  fontFamily?: Record<string, string | string[]>;
  fontSize?: Record<
    string,
    string | [string, string | { lineHeight?: string; letterSpacing?: string; fontWeight?: string }]
  >;
  boxShadow?: Record<string, string>;
}

export interface DesignSnapshot {
  source: "figma" | "stitch" | "mixed";
  fileUrl?: string;
  /** Full variables with modes (REST API, or agent-built in the same shape). */
  variables?: FigmaVariablesMeta;
  /** Fallback from Figma MCP `get_variable_defs`: { "color/primary/500": "#3B82F6" } (single mode). */
  flatVariables?: Record<string, FlatValue>;
  /** Same names, values with the Dark mode applied. */
  flatVariablesDark?: Record<string, FlatValue>;
  colorStyles?: ColorStyleSnap[];
  textStyles?: TextStyleSnap[];
  effectStyles?: EffectStyleSnap[];
  tailwind?: TailwindTheme;
}

export function parseSnapshot(json: unknown): DesignSnapshot {
  if (typeof json !== "object" || json === null) throw new Error("Snapshot must be a JSON object.");
  const s = json as DesignSnapshot;
  const hasData =
    s.variables || s.flatVariables || s.colorStyles || s.textStyles || s.effectStyles || s.tailwind;
  if (!hasData) {
    throw new Error(
      "Snapshot has no data. Expected at least one of: variables, flatVariables, colorStyles, textStyles, effectStyles, tailwind.",
    );
  }
  if (!s.source) s.source = s.tailwind && !s.variables && !s.flatVariables ? "stitch" : "figma";
  return s;
}
