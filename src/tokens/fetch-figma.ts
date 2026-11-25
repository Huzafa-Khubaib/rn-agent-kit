import type {
  ColorStyleSnap,
  DesignSnapshot,
  EffectStyleSnap,
  FigmaVariablesMeta,
  TextStyleSnap,
} from "./snapshot";
import type { RgbaColor } from "./color";

type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export function parseFigmaFileKey(url: string): string {
  const m = /figma\.com\/(?:file|design|make|board)\/([A-Za-z0-9]+)/.exec(url);
  if (!m) throw new Error(`Not a Figma file URL: ${url}`);
  return m[1];
}

interface StyleMeta {
  name: string;
  style_type: "FILL" | "TEXT" | "EFFECT" | "GRID";
  node_id: string;
  description?: string;
}
interface FigmaNode {
  style?: {
    fontFamily: string;
    fontWeight: number;
    fontSize: number;
    letterSpacing?: number;
    lineHeightPx?: number;
  };
  fills?: { type: string; color?: RgbaColor; opacity?: number }[];
  effects?: {
    type: string;
    visible?: boolean;
    color?: RgbaColor;
    offset?: { x: number; y: number };
    radius?: number;
    spread?: number;
  }[];
}

/**
 * Optional REST path (needs FIGMA_TOKEN). The primary path is the Figma MCP, which the agent drives.
 * NOTE: GET /variables/local is only available on Figma Enterprise plans; without it we fall back to styles only.
 * This function is covered by mocked-fetch tests, not by a live-API test.
 */
export async function fetchFigmaSnapshot(
  fileUrl: string,
  token: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<{ snapshot: DesignSnapshot; notes: string[] }> {
  const key = parseFigmaFileKey(fileUrl);
  const headers = { "X-Figma-Token": token };
  const get = async (path: string) => {
    const res = await fetchImpl(`https://api.figma.com/v1${path}`, { headers });
    if (!res.ok)
      throw Object.assign(new Error(`Figma API ${res.status} for ${path}`), { status: res.status });
    return (await res.json()) as Record<string, any>;
  };
  const notes: string[] = [];
  const snapshot: DesignSnapshot = { source: "figma", fileUrl };

  try {
    const v = await get(`/files/${key}/variables/local`);
    snapshot.variables = v.meta as FigmaVariablesMeta;
  } catch (e) {
    const status = (e as { status?: number }).status;
    notes.push(
      status === 403 || status === 404
        ? "Variables REST API not available (requires Figma Enterprise + file_variables:read). Use the Figma MCP path for variables."
        : `Variables request failed: ${(e as Error).message}`,
    );
  }

  const styles = ((await get(`/files/${key}/styles`)).meta?.styles ?? []) as StyleMeta[];
  const nodes: Record<string, FigmaNode> = {};
  const ids = styles.map((s) => s.node_id);
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const res = await get(`/files/${key}/nodes?ids=${chunk.map(encodeURIComponent).join(",")}`);
    for (const [id, n] of Object.entries(res.nodes ?? {}))
      nodes[id] = (n as { document: FigmaNode }).document;
  }

  const text: TextStyleSnap[] = [];
  const effect: EffectStyleSnap[] = [];
  const color: ColorStyleSnap[] = [];
  for (const s of styles) {
    const n = nodes[s.node_id];
    if (!n) continue;
    if (s.style_type === "TEXT" && n.style) {
      text.push({
        name: s.name,
        description: s.description || undefined,
        fontFamily: n.style.fontFamily,
        fontWeight: n.style.fontWeight,
        fontSize: n.style.fontSize,
        lineHeightPx: n.style.lineHeightPx,
        letterSpacingPx: n.style.letterSpacing,
      });
    } else if (s.style_type === "EFFECT" && n.effects) {
      effect.push({ name: s.name, description: s.description || undefined, effects: n.effects });
    } else if (s.style_type === "FILL") {
      const fill = n.fills?.find((f) => f.type === "SOLID" && f.color);
      if (fill?.color)
        color.push({
          name: s.name,
          description: s.description || undefined,
          color: { ...fill.color, a: (fill.color.a ?? 1) * (fill.opacity ?? 1) },
        });
    }
  }
  if (text.length) snapshot.textStyles = text;
  if (effect.length) snapshot.effectStyles = effect;
  if (color.length) snapshot.colorStyles = color;

  const hasVariables =
    Boolean(snapshot.variables?.variables) &&
    Object.keys(snapshot.variables?.variables ?? {}).length > 0;
  if (!hasVariables) {
    const styleCount = text.length + effect.length + color.length;
    notes.push(
      styleCount > 0
        ? `WARNING: Figma file has no Variables (or Variables API unavailable). Falling back to ${styleCount} published style(s). Tokens may be incomplete — prefer Variables when available.`
        : "WARNING: Figma file has no Variables and no usable published styles. Token sync will be empty — fix the file or use MCP design context.",
    );
  }

  return { snapshot, notes };
}
