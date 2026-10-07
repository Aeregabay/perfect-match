// Keeps the planner in sync with the server, item by item.
// * Local edits are detected by comparing each item with the last server version (no manual "save").
// * Writes carry the revision they are based on; if the partner changed the same item meanwhile,
//   both edits are merged field by field and written again.
// * Without connection, edits stay in an encrypted copy on the device and are sent later.
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { canon, merge3 } from "./util";
import { cacheGet, cachePut } from "./securecache";

export type Row = { kind: string; id: string; data: Record<string, unknown>; rev: number; deleted: boolean; updated_at?: string };
type Known = { rev: number; base: string; deleted: boolean };
export type SyncStatus = "loading" | "saved" | "saving" | "offline" | "error";

export interface Adapter {
  /** Current planner content as items, keyed "kind:id". */
  collect(): Map<string, Record<string, unknown>>;
  /** Puts an item into the planner (null removes it). */
  apply(kind: string, id: string, data: Record<string, unknown> | null): void;
  /** Planner content changed from outside (partner, merge, revert). */
  changed(): void;
  status(): void;
  /** The server refused a write (free-tier limit or validation); the item was reset. */
  rejected(code: string, kind: string): void;
  wedding(row: Record<string, unknown>): void;
}

const LIMIT_CODES = ["FREE_LIMIT_GUESTS", "FREE_LIMIT_VENUES", "ITEM_LIMIT"];
const split = (k: string) => { const i = k.indexOf(":"); return [k.slice(0, i), k.slice(i + 1)] as const; };

export class Sync {
  status: SyncStatus = "loading";
  pending = 0;
  lastError = "";
  private known = new Map<string, Known>();
  private lastSeen = "";
  private timer: ReturnType<typeof setTimeout> | undefined;
  private cacheTimer: ReturnType<typeof setTimeout> | undefined;
  private busy = false;
  private again = false;
  private retryMs = 5000;
  private channel: RealtimeChannel | null = null;
  private live = false;
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private stopped = false;

  constructor(public readonly wid: string, private a: Adapter) {}

  /** Restores the device copy first (instant start, works offline), then loads the server state. */
  async start(): Promise<boolean> {
    const c = await cacheGet<{ known: [string, Known][]; items: [string, Record<string, unknown>][]; lastSeen: string }>("w:" + this.wid);
    let fromCache = false;
    if (c) {
      this.known = new Map(c.known); this.lastSeen = c.lastSeen || "";
      for (const [k, d] of c.items) { const [kind, id] = split(k); this.a.apply(kind, id, d); }
      fromCache = true;
    }
    await this.fullLoad();
    this.subscribe();
    const onOnline = () => { this.retryMs = 5000; this.refresh(); this.touch(0); };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") this.refresh(); else this.flushNow(); });
    this.pollTimer = setInterval(() => { if (!this.live || Math.random() < 0.25) this.refresh(); }, 30000);
    return fromCache;
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer); clearInterval(this.pollTimer);
    if (this.channel) supabase.removeChannel(this.channel);
  }

  /** Call after every local change. */
  touch(ms = 800) {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), ms);
    clearTimeout(this.cacheTimer);
    this.cacheTimer = setTimeout(() => this.persist(), 300);
    this.countPending();
    this.a.status();
  }

  flushNow() { clearTimeout(this.timer); return this.flush(); }

  private async fullLoad() {
    const rows: Row[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("entities").select("kind,id,data,rev,deleted,updated_at")
        .eq("wedding_id", this.wid).order("kind").order("id").range(from, from + 999);
      if (error) { this.setOffline(error.message); return; }
      rows.push(...(data as Row[]));
      if (!data || data.length < 1000) break;
    }
    const onServer = new Set(rows.map((r) => r.kind + ":" + r.id));
    const desired = this.a.collect();
    // Items the server no longer has (purged long ago): drop them unless they carry unsent edits.
    for (const [k, kn] of [...this.known]) {
      if (onServer.has(k)) continue;
      const d = desired.get(k);
      if (!d || canon(d) === kn.base) { const [kind, id] = split(k); this.a.apply(kind, id, null); this.known.delete(k); }
      else this.known.delete(k); // pushed again as a new item
    }
    this.applyRemote(rows);
    this.status = "saved";
    this.touch(50);
  }

  /** Changes since the last check (fallback when live updates are not connected). */
  async refresh() {
    if (this.stopped) return;
    let q = supabase.from("entities").select("kind,id,data,rev,deleted,updated_at").eq("wedding_id", this.wid);
    if (this.lastSeen) q = q.gte("updated_at", new Date(Date.parse(this.lastSeen) - 10000).toISOString());
    const { data, error } = await q.limit(5000);
    if (error) { this.setOffline(error.message); return; }
    if (this.status === "offline") { this.status = "saved"; this.touch(0); }
    this.applyRemote(data as Row[]);
    const { data: w } = await supabase.from("weddings").select("*").eq("id", this.wid).maybeSingle();
    if (w) this.a.wedding(w);
  }

  private subscribe() {
    this.channel = supabase.channel("w:" + this.wid)
      .on("postgres_changes", { event: "*", schema: "public", table: "entities", filter: "wedding_id=eq." + this.wid },
        (p) => { const r = p.new as Row; if (r && r.kind) this.applyRemote([r]); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "weddings", filter: "id=eq." + this.wid },
        (p) => this.a.wedding(p.new as Record<string, unknown>))
      .subscribe((s) => { const was = this.live; this.live = s === "SUBSCRIBED"; if (this.live && !was) this.refresh(); });
  }

  /** Brings server rows into the planner, merging with local edits that are not sent yet. */
  applyRemote(rows: Row[]): boolean {
    if (!rows.length) return false;
    const desired = this.a.collect();
    let changed = false, needPush = false;
    for (const r of rows) {
      if (r.updated_at && r.updated_at > this.lastSeen) this.lastSeen = r.updated_at;
      const k = r.kind + ":" + r.id;
      const kn = this.known.get(k);
      if (kn && r.rev <= kn.rev) continue;
      const local = desired.get(k);
      const remoteS = canon(r.deleted ? {} : r.data);
      const localUnchanged = !kn ? local === undefined : kn.deleted ? local === undefined : local !== undefined && canon(local) === kn.base;
      if (r.deleted) { if (local !== undefined) { this.a.apply(r.kind, r.id, null); changed = true; } }
      else if (localUnchanged || !kn) { this.a.apply(r.kind, r.id, r.data); changed = true; }
      else if (local === undefined) { needPush = true; } // deleted here, edited there: the deletion is sent again
      else {
        const merged = merge3(JSON.parse(kn.base || "{}"), local, r.data) as Record<string, unknown>;
        this.a.apply(r.kind, r.id, merged); changed = true; needPush = true;
      }
      this.known.set(k, { rev: r.rev, base: remoteS, deleted: r.deleted });
    }
    if (changed) this.a.changed();
    if (needPush) this.touch(300); else { this.countPending(); this.persistSoon(); this.a.status(); }
    return changed;
  }

  private countPending() {
    const desired = this.a.collect();
    let n = 0;
    for (const [k, d] of desired) { const kn = this.known.get(k); if (!kn || kn.deleted || canon(d) !== kn.base) n++; }
    for (const [k, kn] of this.known) if (!kn.deleted && !desired.has(k)) n++;
    this.pending = n;
    return n;
  }

  private setOffline(msg: string) {
    this.status = "offline"; this.lastError = msg; this.a.status();
  }

  private async flush() {
    if (this.stopped) return;
    if (this.busy) { this.again = true; return; }
    this.busy = true; this.again = false;
    const desired = this.a.collect();
    type Op = { k: string; d: Record<string, unknown> | null; s: string; base: number | null };
    const ops: Op[] = [];
    for (const [k, d] of desired) {
      const kn = this.known.get(k), s = canon(d);
      if (!kn || kn.deleted || s !== kn.base) ops.push({ k, d, s, base: kn ? kn.rev : null });
    }
    for (const [k, kn] of this.known) if (!kn.deleted && !desired.has(k)) ops.push({ k, d: null, s: "{}", base: kn.rev });
    if (ops.length) { this.status = "saving"; this.a.status(); }
    let offline = false;
    const run = async (op: Op) => {
      if (offline) return;
      const [kind, id] = split(op.k);
      const { data, error } = await supabase.rpc("put_entity", { p_wedding: this.wid, p_kind: kind, p_id: id, p_data: op.d ?? {}, p_base: op.base, p_deleted: !op.d });
      if (error) {
        const code = LIMIT_CODES.find((c) => (error.message || "").includes(c));
        // Only content errors reset the item; auth, permission and network problems are retried and never lose edits.
        if (code || /^(P0001|23514|23502|22001|22P02|2202E)$/.test(error.code || "")) {
          // Refused by the server: reset this item to the last server version.
          const kn = this.known.get(op.k);
          this.a.apply(kind, id, kn && !kn.deleted ? JSON.parse(kn.base) : null);
          this.a.changed();
          this.a.rejected(code ?? "WRITE_REFUSED", kind);
          return;
        }
        offline = true; this.lastError = error.message; return;
      }
      const r = (Array.isArray(data) ? data[0] : data) as { rev: number; ok: boolean; data: Record<string, unknown> | null; deleted: boolean };
      if (r.ok) this.known.set(op.k, { rev: r.rev, base: op.d ? op.s : "{}", deleted: !op.d });
      else { this.applyRemote([{ kind, id, data: r.data ?? {}, rev: r.rev, deleted: r.deleted }]); this.again = true; }
    };
    const queue = [...ops];
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => { while (queue.length) await run(queue.shift()!); }));
    this.busy = false;
    const left = this.countPending();
    if (offline) {
      this.status = "offline";
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, 60000);
    } else {
      this.retryMs = 5000;
      this.status = left ? "saving" : "saved";
      if (this.again || left) { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 400); }
    }
    this.persistSoon();
    this.a.status();
  }

  private persistSoon() { clearTimeout(this.cacheTimer); this.cacheTimer = setTimeout(() => this.persist(), 300); }

  private persist() {
    if (this.stopped) return;
    return cachePut("w:" + this.wid, { known: [...this.known], items: [...this.a.collect()], lastSeen: this.lastSeen });
  }
}
