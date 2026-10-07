// User interaction, ported from the original planner (event delegation on the document).
import { state, ui, W, t, uid, writePref, menuDefault } from "./ctx";
import {
  cur, vp, findQ, CATS, tLabel, findT, tasks, COLS, closeTask, agenda, agCur, agClose, agSorted, tmin, tfmt, seat, seatPeople,
  guests, blankGuest, gName, gDaySet, dayIx, totalHeads, gHeads, pItem, pGroups, planSvcs, pGet, findPF, VENDORS, blankLoc, defaultDay,
} from "./data";
import { render, markDirty, stashUI, addVisitPhotos, addPlanFiles, setCoverPhoto, dropFile, downloadDoc, toast } from "./app";
import { planLiveState, galLoc } from "./views/venues";
import { importGuests, guestsCsv } from "./views/guests";
import { quickTables } from "./views/others";
import { settingsClick, settingsChange, settingsInput } from "./views/settings";
import { saveFile } from "../lib/save";
import { undo, redo } from "./history";

const active = () => !!W.sync;
const FREE = () => !(W.w && W.w.premium);

function galStep(d: number) { const l = galLoc(); if (!l) return; const n = vp(l).length; if (n < 2) return; ui.gal.i = (ui.gal.i + d + n) % n; ui.gal.confirm = false; render(); }
function limitModal(text: string) { ui.modal = { kind: "limit", text }; render(); }

document.addEventListener("click", (e) => {
  if (!active()) return;
  const b = (e.target as HTMLElement).closest("[data-act]") as HTMLElement | null; if (!b) return;
  const a = b.getAttribute("data-act") as string, loc = cur();
  const attr = (k: string) => b.getAttribute(k) as string;
  if (a === "must") return;
  if (a === "undo") { undo(); return; }
  if (a === "redo") { redo(); return; }
  if (settingsClick(a, b, e)) return;
  if (a === "galopen") { ui.gal = { lid: attr("data-id"), i: 0, confirm: false }; ui.galMsg = ""; render(); return; }
  if (a === "galclose") { ui.gal = null; render(); return; }
  if (a === "galprev") { galStep(-1); return; }
  if (a === "galnext") { galStep(1); return; }
  if (a === "galdelask") { if (ui.gal) { ui.gal.confirm = true; render(); } return; }
  if (a === "galdelno") { if (ui.gal) { ui.gal.confirm = false; render(); } return; }
  if (a === "galdel") { const gl = galLoc(); if (gl && ui.gal) { gl.visitPhotos = vp(gl); const rm = gl.visitPhotos.splice(ui.gal.i, 1)[0]; if (rm && rm.f) dropFile(rm.f); ui.gal.confirm = false; if (!gl.visitPhotos.length) ui.gal = null; markDirty(); } render(); return; }
  if (a === "agday") { ui.agDay = attr("data-v"); render(); return; }
  if (a === "agnew") {
    let tStart = attr("data-t") || ""; const L0 = agSorted(ui.agDay || defaultDay());
    if (!tStart && L0.length) { const last = L0[L0.length - 1]; const ls = tmin(last.start), le0 = tmin(last.end); const le = le0 != null ? le0 : (ls != null ? ls + 30 : null); if (le != null) tStart = tfmt(le); }
    const na = { id: "a" + uid(), day: ui.agDay || defaultDay(), start: tStart, end: "", title: "", note: "", tags: [], links: [], at: Date.now() }; agenda().push(na); ui.agEdit = na.id; ui.agDel = false; markDirty(); render(); const ti2 = document.getElementById("ag-title"); if (ti2) ti2.focus(); return;
  }
  if (a === "agopen") { const al = (e.target as HTMLElement).closest("[data-act=aglink]"); if (al && al !== b) return; ui.agEdit = attr("data-id"); ui.agDel = false; render(); return; }
  if (a === "agclose") { agClose(); markDirty(); render(); return; }
  if (a === "agdelask") { ui.agDel = true; render(); return; }
  if (a === "agdelno") { ui.agDel = false; render(); return; }
  if (a === "agdel") { const dx = ui.agEdit; state.agenda = agenda().filter((z: any) => z.id !== dx); ui.agEdit = null; ui.agDel = false; markDirty(); render(); return; }
  if (a === "agtag") { const ax = agCur(); if (ax) { ax.tags = ax.tags || []; const tv = attr("data-v"), ti3 = ax.tags.indexOf(tv); if (ti3 >= 0) ax.tags.splice(ti3, 1); else ax.tags.push(tv); markDirty(); } render(); return; }
  if (a === "agtagadd") { const ax2 = agCur(), ni2 = document.getElementById("ag-newtag") as HTMLInputElement | null, v3 = ni2 && ni2.value.trim().slice(0, 40); if (ax2 && v3) { ax2.tags = ax2.tags || []; if (ax2.tags.indexOf(v3) < 0) ax2.tags.push(v3); markDirty(); } render(); return; }
  if (a === "aglinkadd") { const ax3 = agCur(), ls = document.getElementById("ag-lsel") as HTMLSelectElement | null, v4 = ls && ls.value; if (ax3 && v4) { ax3.links = ax3.links || []; if (ax3.links.indexOf(v4) < 0) ax3.links.push(v4); markDirty(); } render(); return; }
  if (a === "agunlink") { const ax4 = agCur(); if (ax4) { ax4.links = (ax4.links || []).filter((k: string) => k !== attr("data-k")); markDirty(); } render(); return; }
  if (a === "aglink") {
    e.stopPropagation(); const k = attr("data-k"); if (ui.agEdit) agClose();
    if (k.indexOf("t:") === 0) { ui.tab = "tasks"; ui.tEdit = k.slice(2); ui.tDel = false; render(); window.scrollTo(0, 0); return; }
    const pq = k.slice(2).split("|"); ui.peek = null; ui.loc = pq[0]; ui.tab = "check"; ui.filter = "all"; ui.must = false; const qq = findQ(pq[1]); if (qq && ui.closed) delete ui.closed[qq.cat.id]; ui.flashQ = pq[1]; render();
    const el = document.getElementById("q-" + pq[1]); if (el) el.scrollIntoView({ block: "center" }); setTimeout(() => { ui.flashQ = null; const e2 = document.getElementById("q-" + pq[1]); if (e2) e2.classList.remove("flash"); }, 2500); return;
  }
  if (a === "gfhide") { ui.gfHide = !ui.gfHide; writePref("pm-gfopen", ui.gfHide ? "" : "1"); render(); return; }
  if (a === "gofilt") { const fk = attr("data-k"), fv = attr("data-v"); ui.gf = {}; ui.gq = ""; ui.gf[fk] = fv; ui.tab = "guests"; ui.gOpen = null; render(); window.scrollTo(0, 0); return; }
  if (a === "homeadd") { if (attr("data-v") === "guest") { ui.tab = "guests"; render(); const ga = document.querySelector("[data-act=gadd]") as HTMLElement | null; if (ga) ga.click(); } else { ui.tab = "tasks"; render(); const ta2 = document.querySelector(".gtools [data-act=tnew]") as HTMLElement | null; if (ta2) ta2.click(); } return; }
  if (a === "topenh") { ui.tab = "tasks"; ui.tEdit = attr("data-tid"); ui.tDel = false; render(); window.scrollTo(0, 0); return; }
  if (a === "tnew") { const nt = { id: "t" + uid(), t: "", d: "", items: [], col: attr("data-col") || "todo", at: Date.now() }; tasks().push(nt); ui.tEdit = nt.id; ui.tDel = false; markDirty(); render(); const ti = document.getElementById("t-title"); if (ti) ti.focus(); return; }
  if (a === "topen") { if ((e.target as HTMLElement).closest("[data-act=tmove]")) return; ui.tEdit = attr("data-tid"); ui.tDel = false; render(); return; }
  if (a === "tclose") { closeTask(); markDirty(); render(); return; }
  if (a === "tmove") { const tm = findT(attr("data-tid")); if (tm) { const ix = COLS().map((c) => c[0]).indexOf(tm.col || "todo") + (+attr("data-d")); if (ix >= 0 && ix < 3) { tm.col = COLS()[ix][0]; state.tasks = tasks().filter((x: any) => x !== tm); state.tasks.push(tm); markDirty(); } } render(); return; }
  if (a === "tdelask") { ui.tDel = true; render(); return; }
  if (a === "tdelno") { ui.tDel = false; render(); return; }
  if (a === "tdel") { const td = ui.tEdit; state.tasks = tasks().filter((x: any) => x.id !== td); ui.tEdit = null; ui.tDel = false; markDirty(); render(); return; }
  if (a === "tiadd") { const ni = document.getElementById("t-newitem") as HTMLInputElement | null, tt = findT(ui.tEdit); if (!tt || !ni || !ni.value.trim()) { if (ni) ni.focus(); return; } tt.items = tt.items || []; tt.items.push({ id: "i" + uid(), t: ni.value.trim().slice(0, 500), done: false }); markDirty(); render(); const n2 = document.getElementById("t-newitem"); if (n2) n2.focus(); return; }
  if (a === "tidel") { const t2 = findT(ui.tEdit); if (t2) { t2.items = (t2.items || []).filter((x: any) => x.id !== attr("data-iid")); markDirty(); } render(); return; }
  if (a === "seatpick") { const hk = attr("data-hh"); ui.seatSel = ui.seatSel && ui.seatSel.hh === hk ? null : { hh: hk }; render(); return; }
  if (a === "seatpickp") { const pk2 = attr("data-pid");
    if (ui.seatSel && ui.seatSel.pid !== pk2) { const tbx = b.closest(".tb") as HTMLElement | null; if (tbx) { tbx.click(); return; } } ui.seatSel = ui.seatSel && ui.seatSel.pid === pk2 ? null : { pid: pk2 }; render(); return; }
  if (a === "seatcancel") { ui.seatSel = null; render(); return; }
  if (a === "unseat") { delete seat().assign[attr("data-pid")]; if (ui.seatSel && ui.seatSel.pid === attr("data-pid")) ui.seatSel = null; markDirty(); render(); return; }
  if (a === "seatto") { const ss = ui.seatSel; if (!ss) return; if ((e.target as HTMLElement).closest("input,select")) return; const tid = attr("data-tid"), S2 = seat();
    if (ss.pid) S2.assign[ss.pid] = tid; else seatPeople().forEach((x) => { if (x.hh === ss.hh && !S2.assign[x.pid]) S2.assign[x.pid] = tid; });
    ui.seatSel = null; markDirty(); render(); return; }
  if (a === "tbadd") { const S3 = seat(), sh = attr("data-shape"); S3.tables.push({ id: "tb" + uid(), name: (sh === "long" ? t("Long table") + " " : t("Table") + " ") + (S3.tables.length + 1), cap: sh === "long" ? 12 : 10, shape: sh, at: Date.now() }); markDirty(); render(); return; }
  if (a === "tbquick") { const S4 = seat(), n = quickTables(); for (let q3 = 1; q3 <= n; q3++) S4.tables.push({ id: "tb" + uid(), name: t("Table") + " " + q3, cap: 10, shape: "round", at: Date.now() + q3 }); markDirty(); render(); return; }
  if (a === "tbdelask") { ui.tbDel = attr("data-tid"); render(); return; }
  if (a === "tbdelno") { ui.tbDel = null; render(); return; }
  if (a === "tbdel") { const S5 = seat(), dt = attr("data-tid"); S5.tables = S5.tables.filter((x: any) => x.id !== dt); Object.keys(S5.assign).forEach((k) => { if (S5.assign[k] === dt) delete S5.assign[k]; }); ui.tbDel = null; markDirty(); render(); return; }
  if (a === "gadd") {
    if (FREE() && totalHeads() + 1 > 30) { limitModal(t("The free version includes up to 30 guests (including companions and children).")); return; }
    const ng = blankGuest(); guests().unshift(ng); ui.gOpen = ng.id; ui.gNew = ng.id; ui.gf = {}; ui.gq = ""; render();
    const fi = document.getElementById("g-" + ng.id + "-fn"); if (fi) { fi.focus(); fi.scrollIntoView({ block: "center" }); } return;
  }
  if (a === "gtoggle") {
    const gid = attr("data-id");
    if (ui.gNew === gid) { ui.gNew = null; const gn = guests().filter((x: any) => x.id === gid)[0]; if (gn && !gn.fn && !gn.ln) { state.guests = guests().filter((x: any) => x !== gn); } else markDirty(); }
    ui.gOpen = ui.gOpen === gid ? null : gid; ui.gDel = null; render(); const gr = document.getElementById("gr-" + gid); if (gr && ui.gOpen) gr.scrollIntoView({ block: "nearest" }); return;
  }
  if (a === "gstdr") { const gr2 = guests().filter((x: any) => x.id === attr("data-id"))[0]; if (gr2) { gr2.stdResp = attr("data-v") || ""; markDirty(); } render(); return; }
  if (a === "gstd") { const gs = guests().filter((x: any) => x.id === attr("data-id"))[0]; if (gs) { const v5 = attr("data-v"); gs.stdType = gs.stdType === v5 ? "" : v5; if (gs.stdType) gs.stdSent = true; markDirty(); } render(); return; }
  if (a === "gdelask") { ui.gDel = attr("data-id"); render(); return; }
  if (a === "gdelno") { ui.gDel = null; render(); return; }
  if (a === "gdel") { const di = attr("data-id"); state.guests = guests().filter((x: any) => x.id !== di); Object.keys(seat().assign).forEach((k) => { if (k.startsWith(di + ":")) delete seat().assign[k]; }); ui.gDel = null; ui.gOpen = null; if (ui.gNew === di) ui.gNew = null; markDirty(); render(); return; }
  if (a === "gfclear") { ui.gf = {}; ui.gq = ""; render(); return; }
  if (a === "gimp") { ui.gImp = !ui.gImp; ui.gImpMsg = ""; render(); const ta = document.getElementById("gimp-text"); if (ta) ta.focus(); return; }
  if (a === "gimpno") { ui.gImp = false; render(); return; }
  if (a === "gimpok") {
    const tx = document.getElementById("gimp-text") as HTMLTextAreaElement | null, before = guests().length, beforeHeads = totalHeads();
    const r = importGuests(tx ? tx.value : "");
    if (typeof r === "string") { ui.gImpMsg = r; const gm = document.getElementById("gimp-msg"); if (gm) gm.textContent = r; return; }
    if (FREE() && totalHeads() > 30) {
      // Keep the import within the free limit and say what was left out.
      const added = guests().slice(before); state.guests = guests().slice(0, before); let heads = beforeHeads, kept = 0;
      added.forEach((g: any) => { if (heads + gHeads(g) <= 30) { guests().push(g); heads += gHeads(g); kept++; } });
      toast(t("Free version: {kept} of {n} guests imported (limit 30 people).", { kept, n: added.length }), true);
    } else if (r) toast(t("{n} guests imported.", { n: r }));
    state.guests.sort((x: any, y: any) => (y.at || 0) - (x.at || 0));
    ui.gImp = false; ui.gf = {}; ui.gq = ""; if (r) markDirty(); render(); return;
  }
  if (a === "gexport") { saveFile(t("guests") + ".csv", new Blob([guestsCsv()], { type: "text/csv;charset=utf-8" })).catch(() => toast(t("Export failed."), true)); return; }
  if (a === "peek") { ui.peek = attr("data-id"); ui.tab = "check"; ui.confirmDel = null; render(); window.scrollTo(0, 0); return; }
  if (a === "peekback") { ui.peek = null; ui.tab = "arch"; render(); window.scrollTo(0, 0); return; }
  if (a === "svctodo") { const tl = cur(); if (tl) { const ti4 = pItem(tl, attr("data-s")); ti4.todo = !ti4.todo; markDirty(); } render(); return; }
  if (a === "pgtodo") { const tl2 = cur(); if (tl2) { pGroups(tl2).forEach((g: any) => { if (g.id === attr("data-g")) g.todo = !g.todo; }); markDirty(); } render(); return; }
  if (a === "pgnew") { const tl3 = cur(); if (tl3) { pGroups(tl3).push({ id: "g" + uid(), name: t("Package {n}", { n: pGroups(tl3).length + 1 }), v: "", p: "", inc: false, todo: false, svc: [] }); markDirty(); } render(); return; }
  if (a === "pgdelask") { ui.pgDel = attr("data-g"); render(); return; }
  if (a === "pgdelno") { ui.pgDel = null; render(); return; }
  if (a === "pgdel") { const tl4 = cur(); if (tl4) { tl4.planGroups = pGroups(tl4).filter((g: any) => g.id !== attr("data-g")); markDirty(); } ui.pgDel = null; render(); return; }
  if (a === "svchide") { planSvcs(); state.planHide[attr("data-s")] = true; markDirty(); render(); return; }
  if (a === "svcshow") { planSvcs(); delete state.planHide[attr("data-s")]; markDirty(); render(); return; }
  if (a === "svcadd") { const si = document.getElementById("add-svc") as HTMLInputElement | null, st2 = si && si.value.trim().slice(0, 120); if (!st2) { if (si) si.focus(); return; } planSvcs(); state.planSvc.push({ id: "pu" + uid(), t: st2 }); markDirty(); render(); return; }
  if (a === "fopen") { ui.doc = { s: attr("data-s"), f: attr("data-f") }; render(); return; }
  if (a === "docclose") { ui.doc = null; render(); return; }
  if (a === "docdl") { const dl = cur(), df = ui.doc && dl && findPF(dl, ui.doc.s, ui.doc.f); if (df) downloadDoc(df); return; }
  if (a === "fdelask") { ui.fdel = attr("data-s") + ":" + attr("data-f"); render(); return; }
  if (a === "fdelno") { ui.fdel = null; render(); return; }
  if (a === "fdel") { const fl2 = cur(), it2 = fl2 && pGet(fl2, attr("data-s")), fid = attr("data-f");
    if (it2 && it2.files) { const ix2 = it2.files.findIndex((x: any) => x.id === fid); if (ix2 >= 0) { dropFile(it2.files[ix2].f); it2.files.splice(ix2, 1); markDirty(); } }
    ui.fdel = null; render(); return; }
  if (a === "tab") {
    ui.peek = null; ui.seatSel = null; if (ui.tEdit) { closeTask(); markDirty(); } if (ui.agEdit) { agClose(); markDirty(); }
    let tv = attr("data-v"); if (tv === "loc") tv = ui.locSub || "cmp"; if (["cmp", "check", "plan", "arch"].indexOf(tv) >= 0) ui.locSub = tv;
    ui.tab = tv; stashUI(); render(); window.scrollTo(0, 0); return;
  }
  if (a === "pick") { ui.peek = null; ui.loc = attr("data-id"); ui.confirmDel = null; stashUI(); render(); return; }
  if (a === "goto") { ui.peek = null; ui.loc = attr("data-id"); ui.tab = "check"; stashUI(); render(); window.scrollTo(0, 0); return; }
  if (a === "save") { if (W.sync) W.sync.flushNow(); return; }
  if (a === "filter") { ui.filter = attr("data-v"); stashUI(); render(); return; }
  if (a === "addloc") {
    if (FREE() && state.locations.filter((l: any) => !l.deleted).length >= 2) { limitModal(t("The free version includes up to 2 venues. Archive or delete one, or unlock Perfect Match.")); return; }
    const n = blankLoc(t("Venue {n}", { n: state.locations.length + 1 }), ""); state.locations.push(n); ui.loc = n.id; ui.tab = "check"; ui.peek = null; markDirty(); render(); const f = document.getElementById("f-name") as HTMLInputElement | null; if (f) { f.focus(); f.select(); } return;
  }
  if (a === "modalno") { ui.modal = null; render(); return; }
  if (a === "modalok") {
    const m = ui.modal; ui.modal = null; if (!m) { render(); return; }
    if (m.kind === "locarch") { const al = state.locations.filter((x: any) => x.id === m.lid)[0], ri = document.getElementById("arch-reason") as HTMLInputElement | null;
      if (al) { al.archived = { at: Date.now(), reason: ri ? ri.value.trim().slice(0, 300) : "" }; delete al.rank; ui.loc = null; ui.confirmDel = null; }
      markDirty(); render(); return; }
    const q = findQ(m.qid);
    if (q && m.kind === "archive") { state.archived[q.id] = { at: Date.now() }; }
    if (q && m.kind === "edit") {
      if (q.custom) { state.customQ.forEach((c: any) => { if (c.id === q.id) { c.t = m.t; c.p = m.p; } }); }
      else { let o: any = null; CATS.forEach((c) => { c.q.forEach((x) => { if (x[0] === q.id) o = x; }); });
        const ed: any = {}; if (m.t !== t(o[2])) ed.t = m.t; if (m.p !== o[1]) ed.p = m.p;
        if (ed.t || ed.p) state.qEdits[q.id] = ed; else delete state.qEdits[q.id]; }
      ui.editQ = null;
    }
    markDirty(); render(); return;
  }
  if (a === "cmpsort") { ui.cmpSort = attr("data-v"); stashUI(); render(); return; }
  if (a === "locrestore") { const rl = state.locations.filter((x: any) => x.id === attr("data-id"))[0]; if (rl) { delete rl.archived; ui.loc = rl.id; ui.tab = "check"; ui.peek = null; } markDirty(); render(); return; }
  if (a === "restq") { delete state.archived[attr("data-q")]; markDirty(); render(); return; }
  if (a === "editq") { const eq = findQ(attr("data-q")); if (!eq) return; ui.editQ = eq.id; ui.editT = eq.t; ui.editP = eq.p; render();
    const ei = document.getElementById("eq-text") as HTMLInputElement | null; if (ei) { ei.focus(); ei.setSelectionRange(ei.value.length, ei.value.length); } return; }
  if (a === "editp") { ui.editP = attr("data-v"); render(); return; }
  if (a === "editcancel") { ui.editQ = null; render(); return; }
  if (a === "editsave") { const tt = (ui.editT || "").trim().slice(0, 500), cq = findQ(ui.editQ); if (!cq) { ui.editQ = null; render(); return; }
    if (!tt) { const ei2 = document.getElementById("eq-text"); if (ei2) ei2.focus(); return; }
    if (tt === cq.t && ui.editP === cq.p) { ui.editQ = null; render(); return; }
    ui.modal = { kind: "edit", qid: cq.id, t: tt, p: ui.editP }; render(); return; }
  if (a === "archq") { ui.modal = { kind: "archive", qid: attr("data-q") }; render(); return; }
  if (!loc) return;
  if (a === "date" || a === "daterm") {
    const ds = attr("data-d"), av = loc.answers.v1 || { s: "open", n: "" }; av.dates = av.dates || []; av.contested = av.contested || [];
    const ix = av.dates.indexOf(ds), iy = av.contested.indexOf(ds);
    if (a === "daterm") { if (ix >= 0) av.dates.splice(ix, 1); if (iy >= 0) av.contested.splice(iy, 1); }
    else if (ix >= 0) { av.dates.splice(ix, 1); av.contested.push(ds); av.contested.sort(); }
    else if (iy >= 0) { av.contested.splice(iy, 1); }
    else { av.dates.push(ds); av.dates.sort(); }
    if ((av.dates.length || av.contested.length) && av.s === "open") av.s = "ok";
    loc.answers.v1 = av; markDirty(); render(); return;
  }
  if (a === "tclear") { const az = loc.answers.z1; if (az && az.times) { delete az.times[attr("data-k")]; } markDirty(); render(); return; }
  if (a === "locarchask") { ui.modal = { kind: "locarch", lid: loc.id }; render(); return; }
  if (a === "rank") { const rv = +attr("data-v"); if (loc.rank === rv) delete loc.rank; else { state.locations.forEach((x: any) => { if (x.rank === rv) delete x.rank; }); loc.rank = rv; } markDirty(); render(); return; }
  if (a === "photoask") { ui.confirmPhoto = loc.id; render(); return; }
  if (a === "photono") { ui.confirmPhoto = null; render(); return; }
  if (a === "photodel") { const old = loc.photo; loc.photo = ""; ui.confirmPhoto = null; markDirty(); render(); if (old) dropFile(old); return; }
  if (a === "rate") { const v = +attr("data-v"); loc.rating = loc.rating === v ? 0 : v; markDirty(); render(); return; }
  if (a === "delask") { ui.confirmDel = loc.id; render(); return; }
  if (a === "delno") { ui.confirmDel = null; render(); return; }
  if (a === "del") {
    const files = [loc.photo].concat(vp(loc).map((p: any) => p.f));
    Object.keys(loc.plan || {}).forEach((k) => (loc.plan[k].files || []).forEach((f: any) => files.push(f.f)));
    state.locations = state.locations.filter((l: any) => l.id !== loc.id); ui.confirmDel = null; ui.loc = null; ui.peek = null; markDirty(); render();
    files.filter(Boolean).forEach((p: string) => dropFile(p)); return;
  }
  if (a === "set") { const q = attr("data-q"), s = attr("data-s"); const ans = loc.answers[q] || { s: "open", n: "" };
    ans.s = ans.s === s ? "open" : s; loc.answers[q] = ans; markDirty(); render(); return; }
  if (a === "addq") { const cat = attr("data-cat"), inp = document.getElementById("add-" + cat) as HTMLInputElement | null, tq = inp && inp.value.trim().slice(0, 500); if (!tq) { if (inp) inp.focus(); return; }
    state.customQ.push({ id: "u" + uid(), cat, t: tq }); markDirty(); render(); return; }
});

document.addEventListener("change", (e) => {
  if (!active()) return;
  const tg = e.target as HTMLInputElement; if (!tg.getAttribute) return;
  const ga = (k: string) => tg.getAttribute(k);
  if (settingsChange(tg)) return;
  const gid2 = ga("data-g");
  if (ga("data-agsel")) { const ax5 = agCur(); if (ax5) { ax5.day = tg.value; ui.agDay = tg.value; markDirty(); render(); } return; }
  if (ga("data-ag") === "start" || ga("data-ag") === "end") { const ax6 = agCur(); if (ax6) { ax6[ga("data-ag") as string] = tg.value; markDirty(); render(); } return; }
  if (ga("data-tchk")) { const t4 = findT(ui.tEdit); if (t4) { (t4.items || []).forEach((x: any) => { if (x.id === ga("data-tchk")) x.done = tg.checked; }); markDirty(); render(); } return; }
  if (ga("data-tcol")) { const t5 = findT(ui.tEdit); if (t5) { t5.col = tg.value; state.tasks = tasks().filter((x: any) => x !== t5); state.tasks.push(t5); markDirty(); render(); } return; }
  if (ga("data-tbcap")) { seat().tables.forEach((x: any) => { if (x.id === ga("data-tbcap")) x.cap = +tg.value; }); markDirty(); render(); return; }
  if (ga("data-gf")) { ui.gf = ui.gf || {}; ui.gf[ga("data-gf") as string] = tg.value; render(); return; }
  if (gid2 && ga("data-gday")) { const gq3 = guests().filter((x: any) => x.id === gid2)[0]; if (!gq3) return;
    const ds = gDaySet(gq3).slice(), dk = ga("data-gday") as string, dix = ds.indexOf(dk); if (tg.checked) { if (dix < 0) ds.push(dk); } else if (dix >= 0) ds.splice(dix, 1);
    gq3.days = ds.sort((x, y) => dayIx(x) - dayIx(y)); if (ui.gNew !== gid2) markDirty(); render(); return; }
  if (gid2 && (ga("data-gsel") || ga("data-gchk"))) { const gg = guests().filter((x: any) => x.id === gid2)[0]; if (!gg) return;
    const k2 = (ga("data-gsel") || ga("data-gchk")) as string, v2: any = tg.type === "checkbox" ? tg.checked : (k2 === "kids" ? +tg.value : tg.value);
    if (FREE() && (k2 === "kids" || k2 === "plusOn")) {
      const next = { ...gg, [k2]: v2 };
      if (gHeads(next) > gHeads(gg) && totalHeads(gg.id) + gHeads(next) > 30) { tg.checked = !!gg.plusOn; limitModal(t("The free version includes up to 30 guests (including companions and children).")); return; }
    }
    if (k2.indexOf("plus.") === 0) { gg.plus = gg.plus || {}; gg.plus[k2.slice(5)] = v2; } else gg[k2] = v2;
    if (k2 === "plusOn" && v2 && !(gg.plus && gg.plus.menu)) { gg.plus = gg.plus || {}; gg.plus.menu = menuDefault(); }
    if (k2 === "stdSent" && !v2) gg.stdType = "";
    if (ui.gNew !== gid2) markDirty(); render(); return; }
  if (ga("data-pfile")) { addPlanFiles(cur(), ga("data-pfile") as string, tg.files); tg.value = ""; return; }
  if (ga("data-pgrp")) { const gl = cur(); if (!gl) return; const sid2 = ga("data-pgrp") as string, val = tg.value;
    pGroups(gl).forEach((g: any) => { g.svc = (g.svc || []).filter((z: string) => z !== sid2); });
    if (val === "__new") { const t0 = planSvcs(true).filter((z: any) => z.id === sid2)[0]; pGroups(gl).push({ id: "g" + uid(), name: t("{name} package", { name: t0 ? (t0.std ? t(t0.t) : t0.t) : t("Package") }), v: pGet(gl, sid2).v || "", p: "", inc: false, todo: false, svc: [sid2] }); }
    else if (val) { pGroups(gl).forEach((g: any) => { if (g.id === val) g.svc.push(sid2); }); }
    markDirty(); render(); return; }
  if (ga("data-pginc")) { const gl2 = cur(); if (!gl2) return; pGroups(gl2).forEach((g: any) => { if (g.id === ga("data-pginc")) g.inc = tg.checked; }); markDirty(); render(); return; }
  if (ga("data-pinc")) { const pl3 = cur(); if (!pl3) return; const it3 = pItem(pl3, ga("data-pinc") as string); it3.inc = tg.checked; markDirty(); render(); return; }
  if (ga("data-vph")) { const gl = ui.gal ? galLoc() : cur(); addVisitPhotos(gl, tg.files); tg.value = ""; return; }
  if (ga("data-photo")) { const pl = cur(), fl = tg.files && tg.files[0]; if (pl && fl) setCoverPhoto(pl, fl); tg.value = ""; return; }
  const vd = ga("data-vend");
  if (vd) { const l = cur(); if (!l) return; const av = l.answers.d2 || { s: "open", n: "" }; av.vendors = av.vendors || [];
    const ix = av.vendors.indexOf(vd); if (tg.checked) { if (ix < 0) av.vendors.push(vd); } else if (ix >= 0) av.vendors.splice(ix, 1);
    const V = VENDORS(); av.vendors.sort((x: string, y: string) => { const ia = V.indexOf(x), ib = V.indexOf(y); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    if (av.vendors.length && av.s === "open") av.s = "ok"; l.answers.d2 = av; ui.vendOpen = true; markDirty(); render(); return; }
  if (ga("data-time")) { render(); return; }
  if (tg.id === "mustonly") { ui.must = tg.checked; stashUI(); render(); }
});

document.addEventListener("input", (e) => {
  if (!active()) return;
  const tg = e.target as HTMLInputElement; if (!tg.getAttribute) return;
  const ga = (k: string) => tg.getAttribute(k);
  if (settingsInput(tg)) return;
  if (ga("data-edit") === "t") { ui.editT = tg.value; return; }
  if (ga("data-ag") === "title" || ga("data-ag") === "note") { const ax7 = agCur(); if (ax7) { ax7[ga("data-ag") as string] = tg.value; markDirty(); } return; }
  if (ga("data-tk")) { const t6 = findT(ui.tEdit); if (t6) { t6[ga("data-tk") as string] = tg.value; markDirty(); } return; }
  if (ga("data-titem")) { const t7 = findT(ui.tEdit); if (t7) { (t7.items || []).forEach((x: any) => { if (x.id === ga("data-titem")) x.t = tg.value; }); markDirty(); } return; }
  if (ga("data-tbname")) { seat().tables.forEach((x: any) => { if (x.id === ga("data-tbname")) x.name = tg.value; }); markDirty(); return; }
  if (tg.id === "seatq") { ui.seatQ = tg.value; const sp = tg.selectionStart; render(); const s2 = document.getElementById("seatq") as HTMLInputElement | null; if (s2) { s2.focus(); try { s2.setSelectionRange(sp, sp); } catch { /* */ } } return; }
  if (tg.id === "gq") { ui.gq = tg.value; const pos = tg.selectionStart; render(); const q2 = document.getElementById("gq") as HTMLInputElement | null; if (q2) { q2.focus(); try { q2.setSelectionRange(pos, pos); } catch { /* */ } } return; }
  const gk = ga("data-gk");
  if (gk) { const g3 = guests().filter((x: any) => x.id === ga("data-g"))[0]; if (!g3) return;
    if (gk.indexOf("plus.") === 0) { g3.plus = g3.plus || {}; g3.plus[gk.slice(5)] = tg.value; } else g3[gk] = tg.value;
    const hb = document.querySelector("#gr-" + g3.id + " .ghead b"); if (hb && (gk === "fn" || gk === "ln")) hb.textContent = gName(g3);
    if (ui.gNew !== g3.id) markDirty(); return; }
  const loc = cur(); if (!loc) return;
  const pln = ga("data-plan");
  if (pln) { pItem(loc, pln)[ga("data-pk") as string] = tg.value; markDirty(); planLiveState(); return; }
  if (ga("data-pdisc")) { loc.planDiscount = tg.value; markDirty(); planLiveState(); return; }
  const pgi = ga("data-pg");
  if (pgi) { pGroups(loc).forEach((g: any) => { if (g.id === pgi) g[ga("data-pgk") as string] = tg.value; }); markDirty(); planLiveState(); return; }
  const tk = ga("data-time");
  if (tk) { const az = loc.answers.z1 || { s: "open", n: "" }; az.times = az.times || {}; az.times[tk] = +tg.value; if (az.s === "open") az.s = "ok"; loc.answers.z1 = az;
    tg.classList.remove("unset"); tg.setAttribute("aria-valuetext", tLabel(+tg.value));
    const o = document.getElementById("o-" + tk); if (o) { o.textContent = tLabel(+tg.value); o.className = ""; }
    markDirty(); return; }
  const k = ga("data-field");
  if (k) { loc[k] = tg.value; if (k === "name" || k === "nick") { const c = document.querySelector('[data-chip="' + loc.id + '"]'); if (c) c.textContent = loc.nick || loc.name || t("Unnamed"); const nk = document.querySelector(".loc-head .nk"); if (nk) nk.textContent = loc.nick || loc.name || t("Unnamed"); } markDirty(); return; }
  const q = ga("data-note");
  if (q) { const ans = loc.answers[q] || { s: "open", n: "" }; ans.n = tg.value; loc.answers[q] = ans; markDirty(); }
});

document.addEventListener("keydown", (e) => {
  if (!active()) return;
  const tg = e.target as HTMLElement;
  if ((e.ctrlKey || e.metaKey) && !e.altKey && /^[zy]$/i.test(e.key)) {
    const txt = tg && (tg.tagName === "INPUT" || tg.tagName === "TEXTAREA" || tg.isContentEditable);
    if (!txt) { e.preventDefault(); if (/y/i.test(e.key) || e.shiftKey) redo(); else undo(); return; }
  }
  if (ui.agEdit && e.key === "Escape") { agClose(); markDirty(); render(); return; }
  if (e.key === "Enter" && tg.id === "ag-newtag") { e.preventDefault(); (document.querySelector("[data-act=agtagadd]") as HTMLElement | null)?.click(); return; }
  if (ui.tEdit && e.key === "Escape") { closeTask(); markDirty(); render(); return; }
  if (e.key === "Enter" && tg.id === "t-newitem") { e.preventDefault(); (document.querySelector("[data-act=tiadd]") as HTMLElement | null)?.click(); return; }
  if (e.key === "Enter" && tg.classList && tg.classList.contains("tk")) { e.preventDefault(); tg.click(); return; }
  if (ui.seatSel && e.key === "Escape") { ui.seatSel = null; render(); return; }
  if (ui.doc && e.key === "Escape") { ui.doc = null; render(); return; }
  if (e.key === "Enter" && tg.id === "add-svc") { e.preventDefault(); (document.querySelector("[data-act=svcadd]") as HTMLElement | null)?.click(); return; }
  if ((e.key === "Enter" || e.key === " ") && tg.classList && tg.classList.contains("arch-loc")) { e.preventDefault(); tg.click(); return; }
  if (ui.gal) { if (e.key === "Escape") { if (ui.gal.confirm) ui.gal.confirm = false; else ui.gal = null; render(); return; }
    if (e.key === "ArrowLeft") { galStep(-1); return; } if (e.key === "ArrowRight") { galStep(1); return; } }
  if (e.key === "Escape") { if (ui.modal) { ui.modal = null; render(); return; } if (ui.editQ) { ui.editQ = null; render(); return; } }
  if (e.key === "Enter" && tg.id === "eq-text") { e.preventDefault(); (document.querySelector("[data-act=editsave]") as HTMLElement | null)?.click(); return; }
  if (e.key === "Enter" && tg.id && tg.id.indexOf("add-") === 0) { e.preventDefault(); (tg.parentNode as HTMLElement).querySelector<HTMLElement>("[data-act=addq]")?.click(); }
});

let tx0: number | null = null, ty0: number | null = null;
document.addEventListener("touchstart", (e) => { if (!ui.gal || !e.touches[0]) return; tx0 = e.touches[0].clientX; ty0 = e.touches[0].clientY; }, { passive: true });
document.addEventListener("touchend", (e) => { if (!ui.gal || tx0 === null || ty0 === null) return; const tt = e.changedTouches[0]; const dx = tt.clientX - tx0, dy = tt.clientY - ty0; tx0 = null;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) galStep(dx < 0 ? 1 : -1); }, { passive: true });

document.addEventListener("dragstart", (e) => { const c = (e.target as HTMLElement).closest && (e.target as HTMLElement).closest(".tk"); if (!c) return; ui.drag = c.getAttribute("data-tid"); c.classList.add("drag"); try { e.dataTransfer!.setData("text/plain", ui.drag); e.dataTransfer!.effectAllowed = "move"; } catch { /* */ } });
document.addEventListener("dragend", () => { ui.drag = null; document.querySelectorAll(".tk.drag,.kb-col.over").forEach((x) => x.classList.remove("drag", "over")); });
document.addEventListener("dragover", (e) => { if (!ui.drag) return; const col = (e.target as HTMLElement).closest && (e.target as HTMLElement).closest(".kb-col"); if (!col) return; e.preventDefault(); document.querySelectorAll(".kb-col.over").forEach((x) => { if (x !== col) x.classList.remove("over"); }); col.classList.add("over"); });
document.addEventListener("drop", (e) => {
  if (!ui.drag) return; const col = (e.target as HTMLElement).closest && (e.target as HTMLElement).closest(".kb-col"); if (!col) return; e.preventDefault(); const tk = findT(ui.drag); ui.drag = null; if (!tk) return;
  const before = (e.target as HTMLElement).closest(".tk"), bid = before && before.getAttribute("data-tid"); tk.col = col.getAttribute("data-col"); const L = tasks().filter((x: any) => x !== tk);
  const ix = bid && bid !== tk.id ? L.map((x: any) => x.id).indexOf(bid) : -1; if (ix >= 0) L.splice(ix, 0, tk); else L.push(tk); state.tasks = L; markDirty(); render();
});
document.addEventListener("toggle", (e) => {
  const d = e.target as HTMLDetailsElement; if (d.matches && d.matches("details.vend")) { ui.vendOpen = d.open; return; }
  if (!d.matches || !d.matches("details.cat")) return;
  const id = d.getAttribute("data-cat") as string; if (d.open) delete ui.closed[id]; else ui.closed[id] = true; stashUI();
}, true);

