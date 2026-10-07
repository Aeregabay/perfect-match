const ALPHA = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Random id from the platform CSPRNG (never Math.random). */
export function uid(len = 10): string {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  let s = "";
  for (const b of a) s += ALPHA[b % 36];
  return s;
}

export function esc(s: unknown): string {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/** JSON with sorted keys, so equal content compares equal regardless of key order. */
export function canon(v: unknown): string {
  return JSON.stringify(v, (_k, x) => {
    if (x && typeof x === "object" && !Array.isArray(x)) {
      const o: Record<string, unknown> = {};
      for (const k of Object.keys(x).sort()) o[k] = (x as Record<string, unknown>)[k];
      return o;
    }
    return x;
  });
}

export function clone<T>(v: T): T { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const same = (a: unknown, b: unknown) => canon(a) === canon(b);

/**
 * Three-way merge of a local and a remote edit of the same item.
 * Objects merge per key, lists of items with an `id` merge per item, lists of plain values merge as sets.
 * When both sides changed the same value, the local edit wins (it is the newer write).
 */
export function merge3(base: unknown, local: unknown, remote: unknown): unknown {
  if (same(local, remote)) return clone(local);
  if (same(local, base)) return clone(remote);
  if (same(remote, base)) return clone(local);
  if (isObj(local) && isObj(remote)) {
    const b = isObj(base) ? base : {};
    const out: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
    for (const k of keys) {
      const inL = k in local, inR = k in remote, inB = k in b;
      if (inL && inR) out[k] = merge3(b[k], local[k], remote[k]);
      else if (inL) { if (!inB || !same(b[k], local[k])) out[k] = clone(local[k]); } // removed remotely and untouched locally → drop
      else if (inR) { if (!inB || !same(b[k], remote[k])) out[k] = clone(remote[k]); }
    }
    return out;
  }
  if (Array.isArray(local) && Array.isArray(remote)) {
    const b = Array.isArray(base) ? base : [];
    const idList = (a: unknown[]) => a.every((x) => isObj(x) && typeof x.id === "string");
    if (idList(local) && idList(remote) && idList(b)) {
      const byId = (a: unknown[]) => new Map(a.map((x) => [(x as { id: string }).id, x]));
      const B = byId(b), L = byId(local), R = byId(remote);
      const out: unknown[] = [];
      const ids = [...L.keys(), ...[...R.keys()].filter((k) => !L.has(k))];
      for (const id of ids) {
        const l = L.get(id), r = R.get(id), bb = B.get(id);
        if (l && r) out.push(merge3(bb, l, r));
        else if (l) { if (!bb || !same(bb, l)) out.push(clone(l)); }
        else if (r) { if (!bb || !same(bb, r)) out.push(clone(r)); }
      }
      return out;
    }
    if ([...local, ...remote, ...b].every((x) => x === null || typeof x !== "object")) {
      const key = (x: unknown) => JSON.stringify(x);
      const bs = new Set(b.map(key)), ls = new Set(local.map(key)), rs = new Set(remote.map(key));
      const out: unknown[] = [];
      const seen = new Set<string>();
      for (const x of [...local, ...remote]) {
        const k = key(x);
        if (seen.has(k)) continue;
        seen.add(k);
        const removed = bs.has(k) && (!ls.has(k) || !rs.has(k));
        if (!removed) out.push(x);
      }
      return out;
    }
  }
  return clone(local);
}
