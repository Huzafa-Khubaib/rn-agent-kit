import { flatten } from "./tree";
import type { DtcgGroup, FlatToken } from "./types";

export interface TokenChange {
  path: string;
  before: string;
  after: string;
}
export interface TokenDiff {
  initial: boolean;
  added: string[];
  removed: string[];
  changed: TokenChange[];
}

const show = (t: FlatToken) =>
  JSON.stringify(t.value) +
  (Object.keys(t.modes).length ? ` (modes: ${JSON.stringify(t.modes)})` : "");

export function diffTokens(prev: DtcgGroup | null, next: DtcgGroup): TokenDiff {
  const nextFlat = new Map(flatten(next).map((t) => [t.path, t]));
  if (!prev) return { initial: true, added: [...nextFlat.keys()], removed: [], changed: [] };
  const prevFlat = new Map(flatten(prev).map((t) => [t.path, t]));
  const added = [...nextFlat.keys()].filter((p) => !prevFlat.has(p));
  const removed = [...prevFlat.keys()].filter((p) => !nextFlat.has(p));
  const changed: TokenChange[] = [];
  for (const [path, n] of nextFlat) {
    const p = prevFlat.get(path);
    if (p && (show(p) !== show(n) || p.type !== n.type))
      changed.push({ path, before: show(p), after: show(n) });
  }
  return { initial: false, added, removed, changed };
}

export const diffIsEmpty = (d: TokenDiff) =>
  !d.initial && !d.added.length && !d.removed.length && !d.changed.length;
