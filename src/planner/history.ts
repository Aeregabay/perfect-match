// Undo / redo: snapshots of the last 10 own changes (quick typing is merged into one step).
// Undo restores only the items that the step changed, so edits your partner made meanwhile stay untouched.
// Deleted photos/documents are only removed from storage once no undo step can bring them back.
import { state, t } from "./ctx";
import { collect, apply } from "./store";
import { canon } from "../lib/util";

const H = { u: [] as string[], r: [] as string[], base: null as string | null, timer: null as ReturnType<typeof setTimeout> | null, max: 10 };
const doomed = new Set<string>();
let onApply: () => void = () => {};
let removeNow: (paths: string[]) => void = () => {};

const snap = () => JSON.stringify(state, (k, v) => (k.startsWith("_") || k === "updatedAt" ? undefined : v));

export function histInit(applied: () => void, remove: (paths: string[]) => void) {
  H.u = []; H.r = []; H.base = snap(); clearTimeout(H.timer as any); H.timer = null; doomed.clear();
  onApply = applied; removeNow = remove; histUI();
}

/** After every own change. */
export function histTouch() {
  if (H.base === null) return;
  if (H.timer) clearTimeout(H.timer);
  H.timer = setTimeout(histCommit, 700);
  histUI();
}
export function histCommit() {
  if (H.timer) clearTimeout(H.timer); H.timer = null;
  if (H.base === null) return;
  const c = snap();
  if (c !== H.base) { H.u.push(H.base); if (H.u.length > H.max) H.u.shift(); H.r = []; H.base = c; flushDoomed(); }
  histUI();
}
/** Partner changes and server merges become the new base, not an undo step of your own. */
export function histAbsorb() { if (H.base !== null && !H.timer) H.base = snap(); }

export function dropLater(path: string) { if (path) { doomed.add(path); flushDoomed(); } }
function flushDoomed() {
  if (!doomed.size) return;
  const all = [snap(), H.base || ""].concat(H.u, H.r), gone: string[] = [];
  doomed.forEach((p) => { if (!all.some((x) => x.indexOf(p) >= 0)) { gone.push(p); doomed.delete(p); } });
  if (gone.length) removeNow(gone);
}
/** On leaving the planner: delete files no longer used by the current state. */
export function histFinish() { H.u = []; H.r = []; H.base = snap(); flushDoomed(); H.base = null; }

function collectOf(json: string) {
  const saved = { ...state };
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, JSON.parse(json));
  if (!state.seat) state.seat = { tables: [], assign: {} };
  const m = collect();
  const out = new Map<string, string>(); m.forEach((v, k) => out.set(k, JSON.stringify(v)));
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, saved);
  return out;
}
function patch(from: string, to: string) {
  const A = collectOf(from), B = collectOf(to);
  const keys = new Set([...A.keys(), ...B.keys()]);
  keys.forEach((k) => {
    const a = A.get(k), b = B.get(k);
    if (a === b || (a && b && canon(JSON.parse(a)) === canon(JSON.parse(b)))) return;
    const i = k.indexOf(":");
    apply(k.slice(0, i), k.slice(i + 1), b ? JSON.parse(b) : null);
  });
}

export function undo() {
  if (H.timer) histCommit();
  if (!H.u.length || H.base === null) return;
  const prev = H.u.pop() as string;
  patch(H.base, prev);
  H.r.push(H.base); H.base = snap(); onApply(); histUI();
}
export function redo() {
  if (H.timer) histCommit();
  if (!H.r.length || H.base === null) return;
  const next = H.r.pop() as string;
  patch(H.base, next);
  H.u.push(H.base); if (H.u.length > H.max) H.u.shift(); H.base = snap(); onApply(); histUI();
}

export function histUI() {
  const cu = !!(H.u.length || H.timer), cr = !!(H.r.length && !H.timer);
  const bu = document.getElementById("hundo") as HTMLButtonElement | null, br = document.getElementById("hredo") as HTMLButtonElement | null;
  if (bu) { bu.disabled = !cu; bu.title = t("Undo") + (H.u.length ? " (" + H.u.length + ")" : ""); }
  if (br) { br.disabled = !cr; br.title = t("Redo") + (H.r.length ? " (" + H.r.length + ")" : ""); }
}
