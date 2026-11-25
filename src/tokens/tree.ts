import type { DtcgGroup, DtcgToken, DtcgType, FlatToken } from "./types";

export const MODE_EXT = "mode";

const collator = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

export function isToken(node: unknown): node is DtcgToken {
  return typeof node === "object" && node !== null && !Array.isArray(node) && "$value" in node;
}

export function isGroup(node: unknown): node is DtcgGroup {
  return typeof node === "object" && node !== null && !Array.isArray(node) && !("$value" in node);
}

/** Flattens a DTCG tree. `$type` is inherited from parent groups. Output is sorted (deterministic). */
export function flatten(tree: DtcgGroup): FlatToken[] {
  const out: FlatToken[] = [];
  const walk = (node: DtcgGroup, path: string[], inherited?: DtcgType) => {
    const groupType = node.$type ?? inherited;
    for (const key of Object.keys(node).sort(collator)) {
      if (key.startsWith("$")) continue;
      const child = node[key];
      const full = [...path, key];
      if (isToken(child)) {
        const type = child.$type ?? groupType;
        if (!type)
          throw new Error(
            `Token "${full.join(".")}" has no $type (set it on the token or a parent group).`,
          );
        out.push({
          path: full.join("."),
          type,
          value: child.$value,
          modes: {
            ...((child.$extensions?.[MODE_EXT] as Record<string, unknown> | undefined) ?? {}),
          },
          description: child.$description,
        });
      } else if (isGroup(child)) {
        walk(child, full, groupType);
      }
    }
  };
  walk(tree, []);
  return out;
}

/** Inserts a token. Returns false (and changes nothing) on a path conflict. */
export function setToken(tree: DtcgGroup, path: string[], token: DtcgToken): boolean {
  let node: DtcgGroup = tree;
  for (const seg of path.slice(0, -1)) {
    const next = node[seg];
    if (next === undefined) {
      const created: DtcgGroup = {};
      node[seg] = created;
      node = created;
    } else if (isGroup(next)) {
      node = next;
    } else {
      return false; // a token sits where we need a group
    }
  }
  const leaf = path[path.length - 1];
  if (node[leaf] !== undefined) return false;
  node[leaf] = token;
  return true;
}

export function getToken(tree: DtcgGroup, path: string[]): DtcgToken | undefined {
  let node: unknown = tree;
  for (const seg of path) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[seg];
  }
  return isToken(node) ? node : undefined;
}

function sortNode(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sortNode);
  if (typeof node !== "object" || node === null) return node;
  const rec = node as Record<string, unknown>;
  const keys = Object.keys(rec).sort((a, b) => {
    const da = a.startsWith("$") ? 0 : 1;
    const db = b.startsWith("$") ? 0 : 1;
    return da !== db ? da - db : collator(a, b);
  });
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = sortNode(rec[k]);
  return out;
}

/** Stable JSON: sorted keys, 2 spaces, trailing newline. No timestamps. */
export function serializeTree(tree: DtcgGroup): string {
  return `${JSON.stringify(sortNode(tree), null, 2)}\n`;
}
