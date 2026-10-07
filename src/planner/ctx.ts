// Shared planner context: content (same shape as the original planner), UI state and wedding settings.
import type { Sync } from "../lib/sync";
import { LOCALE, t, tp } from "../lib/i18n";
import { esc, uid } from "../lib/util";
export { t, tp, esc, uid };

/** Planner content. Object identity stays the same; contents are replaced on load. */
export const state: any = {};
/** View state (open tab, filters, open dialogs …). */
export const ui: any = {};
/** Wedding row, members, account. */
export const W: any = { w: null, members: [], meId: "", email: "", weddings: [], sync: null as Sync | null, factors: [], identities: [] };

export const hooks = {
  render: () => {},
  markDirty: () => {},
  status: () => {},
  toast: (_msg: string, _err?: boolean) => {},
};
export const render = () => hooks.render();
export const markDirty = () => hooks.markDirty();

export function resetState() {
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, { locations: [], guests: [], tasks: [], agenda: [], seat: { tables: [], assign: {} }, customQ: [], qEdits: {}, archived: {} });
}
export function resetUi() {
  for (const k of Object.keys(ui)) delete ui[k];
  Object.assign(ui, { tab: "home", gal: null, galMsg: "", galErr: false, loc: null, filter: "all", must: false, closed: {}, confirmDel: null,
    editQ: null, editT: "", editP: "", modal: null, locX: 0, cmpSort: "top", gfHide: readPref("pm-gfopen") !== "1" });
}
export function readPref(k: string): string { try { return localStorage.getItem(k) || ""; } catch { return ""; } }
export function writePref(k: string, v: string) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* ignore */ } }

// ---------------------------------------------------------------- wedding settings
export type DayDef = { id: string; name: string; short: string; label: string };
export type Opt = { id: string; name: string };
export const settings = (): any => (W.w && W.w.settings) || {};
export const wid = (): string => (W.w ? W.w.id : "");

/** Event days: [key, long name, short name, label] like the original planner. */
export function DAYS(): [string, string, string, string][] {
  const d: DayDef[] = settings().days || [];
  return d.map((x) => [x.id, x.name || t("Day"), x.short || (x.name || "").slice(0, 3), x.label || ""]);
}
/** Accommodation options, first entry "Open". The option with id "onsite" counts as staying at the venue. */
export function SLEEP(): [string, string][] {
  const s: Opt[] = settings().stays || [];
  return [["", t("Open")] as [string, string]].concat(s.map((x) => [x.id, x.name] as [string, string]));
}
export function MENUS(): Opt[] {
  const m: Opt[] = settings().menus || [];
  return m.length ? m : [{ id: "meat", name: t("Meat") }, { id: "veg", name: t("Vegetarian") }];
}
export const menuDefault = () => MENUS()[0].id;
export const menuName = (id: string) => (MENUS().find((m) => m.id === id) || { name: id || "" }).name;
export function SIDE(): Record<string, string> {
  const w = W.w || {};
  return { p1: w.partner1_name || t("Partner 1"), p2: w.partner2_name || t("Partner 2") };
}
export const CAP = (): number => (W.w && W.w.guest_capacity) || 100;
export const VATDEF = (): number => { const v = parseFloat(String(settings().vat ?? "0").replace(",", ".")); return isNaN(v) ? 0 : v; };
export const CUR = (): string => (W.w && W.w.currency) || "EUR";
/** Preferred months for the availability calendar as [year, monthIndex]. */
export function MONTHS(): [number, number][] {
  return (settings().months || []).map((s: string) => { const p = s.split("-"); return [+p[0], +p[1] - 1] as [number, number]; })
    .filter((x: [number, number]) => x[0] > 2000 && x[1] >= 0 && x[1] < 12).sort((a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1]);
}
/** Periods to avoid (holidays, festivals) shown hatched in the calendar. */
export function BLOCKED(): { label: string; from: string; to: string }[] { return (settings().blocked || []).filter((b: any) => b && b.from && b.to); }

// ---------------------------------------------------------------- formatting
const nf = () => new Intl.NumberFormat(LOCALE, { style: "currency", currency: CUR(), minimumFractionDigits: 0, maximumFractionDigits: 2 });
export function fmtMoney(n: number) { try { return nf().format(Math.round(n * 100) / 100); } catch { return (Math.round(n * 100) / 100).toFixed(2) + " " + CUR(); } }
export function pad(n: number) { return (n < 10 ? "0" : "") + n; }
export function iso(y: number, m: number, d: number) { return y + "-" + pad(m + 1) + "-" + pad(d); }
const dt = (s: string) => { const p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); };
/** "Sat, 18 Sep 2027" in the device locale. */
export function fmtD(s: string) { try { return new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(dt(s)); } catch { return s; } }
export function dispDate(v: string) { return /^\d{4}-\d{2}-\d{2}$/.test(v || "") ? new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric" }).format(dt(v)) : v || ""; }
export function fmtTS(ts: number) { try { return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric" }).format(new Date(ts)); } catch { return ""; } }
export const fmtDate = fmtTS;
export function monthName(m: number, y: number) { return new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric" }).format(new Date(y, m, 1)); }
/** Weekday initials starting Monday. */
export function weekdays(style: "narrow" | "short" = "short") { const f = new Intl.DateTimeFormat(LOCALE, { weekday: style }); return [5, 6, 7, 8, 9, 10, 11].map((d) => f.format(new Date(2024, 1, d))); }
export function fmtTime(hhmm: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ""); if (!m) return hhmm || "";
  return new Intl.DateTimeFormat(LOCALE, { hour: "numeric", minute: "2-digit" }).format(new Date(2024, 0, 1, +m[1], +m[2]));
}
export function fmtNum(n: number, d = 1) { return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: d }).format(n); }
