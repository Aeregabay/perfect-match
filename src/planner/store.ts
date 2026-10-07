// Maps the planner content (one object like the original planner) to server items and back.
//   loc:<id>    venue incl. answers, planning, photo references
//   guest:<id>  invitation incl. companion, children and their seats
//   task:<id>, agenda:<id>, table:<id>
//   cfg:checklist  own/edited/archived questions;  cfg:plan  planning services
import { state } from "./ctx";
import { clone } from "../lib/util";

const byAt = (a: any, b: any) => (a.at || 0) - (b.at || 0);
const byOrd = (a: any, b: any) => (a.ord ?? 1e9) - (b.ord ?? 1e9) || (a.at || 0) - (b.at || 0);

function seatsOf(gid: string) {
  const out: Record<string, string> = {}, A = (state.seat && state.seat.assign) || {};
  for (const k of Object.keys(A)) if (k.startsWith(gid + ":")) out[k.slice(gid.length + 1)] = A[k];
  return out;
}

export function collect(): Map<string, Record<string, unknown>> {
  const m = new Map<string, Record<string, unknown>>();
  (state.locations || []).forEach((l: any) => m.set("loc:" + l.id, l));
  (state.guests || []).forEach((g: any) => { const s = seatsOf(g.id); m.set("guest:" + g.id, Object.keys(s).length ? { ...g, seat: s } : g); });
  (state.tasks || []).forEach((x: any, i: number) => { x.ord = i; m.set("task:" + x.id, x); });
  (state.agenda || []).forEach((x: any) => m.set("agenda:" + x.id, x));
  ((state.seat && state.seat.tables) || []).forEach((x: any, i: number) => { x.ord = i; m.set("table:" + x.id, x); });
  const ck: any = {};
  if (state.customQ && state.customQ.length) ck.customQ = state.customQ;
  if (state.qEdits && Object.keys(state.qEdits).length) ck.qEdits = state.qEdits;
  if (state.archived && Object.keys(state.archived).length) ck.archived = state.archived;
  if (Object.keys(ck).length || state._hasChecklist) m.set("cfg:checklist", ck);
  if (state.planSvc || state.planHide) m.set("cfg:plan", { planSvc: state.planSvc || null, planHide: state.planHide || {} });
  return m;
}

function upsert(list: any[], id: string, obj: any) {
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0) list[i] = obj; else list.push(obj);
}
function remove(list: any[], id: string) { const i = list.findIndex((x) => x.id === id); if (i >= 0) list.splice(i, 1); }

export function apply(kind: string, id: string, data0: Record<string, unknown> | null) {
  const data: any = data0 ? clone(data0) : null;
  if (data) data.id = id;
  switch (kind) {
    case "loc":
      if (data) { data.answers = data.answers || {}; upsert(state.locations, id, data); state.locations.sort(byAt); } else remove(state.locations, id);
      break;
    case "guest": {
      const A = state.seat.assign;
      for (const k of Object.keys(A)) if (k.startsWith(id + ":")) delete A[k];
      if (data) {
        const s = data.seat || {}; delete data.seat;
        for (const k of Object.keys(s)) A[id + ":" + k] = s[k];
        upsert(state.guests, id, data); state.guests.sort((a: any, b: any) => (b.at || 0) - (a.at || 0));
      } else remove(state.guests, id);
      break;
    }
    case "task":
      if (data) { upsert(state.tasks, id, data); state.tasks.sort(byOrd); } else remove(state.tasks, id);
      break;
    case "agenda":
      if (data) upsert(state.agenda, id, data); else remove(state.agenda, id);
      break;
    case "table":
      if (data) { upsert(state.seat.tables, id, data); state.seat.tables.sort(byOrd); } else remove(state.seat.tables, id);
      break;
    case "cfg":
      if (id === "checklist") { state.customQ = (data && data.customQ) || []; state.qEdits = (data && data.qEdits) || {}; state.archived = (data && data.archived) || {}; state._hasChecklist = !!data; }
      if (id === "plan") { if (data && data.planSvc) state.planSvc = data.planSvc; else delete state.planSvc; state.planHide = (data && data.planHide) || {}; if (!data) delete state.planHide; }
      break;
  }
}
