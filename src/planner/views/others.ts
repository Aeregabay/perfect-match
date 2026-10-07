// Seating plan, schedule, tasks.
import { ui, t, tp, esc, DAYS, fmtTime } from "../ctx";
import { COLS, tasks, findT, seat, seatPeople, sideCls, AGTAGS, agenda, tmin, tfmt, agSorted, openQs, lname, findQ, defaultDay } from "../data";
import { state } from "../ctx";

// ---------------------------------------------------------------- tasks (kanban)
export function renderTasks() {
  const T = tasks(), C = COLS();
  let h = '<div class="gtools" style="margin-top:0"><span class="hint" style="flex:1">' + esc(t("{done} of {n} tasks done. Drag cards or move them with ‹ ›.", { done: T.filter((x: any) => x.col === "done").length, n: T.length })) + '</span><button class="btn primary" data-act="tnew" data-col="todo">+ ' + t("Task") + '</button></div><div class="kb">';
  C.forEach((c, ci) => {
    const L = T.filter((x: any) => (x.col || "todo") === c[0]);
    h += '<div class="kb-col" data-col="' + c[0] + '"><div class="kb-h"><i style="background:' + c[2] + '"></i><h3>' + c[1] + '</h3><span class="n">' + L.length + "</span></div>";
    L.forEach((tk: any) => {
      const it = tk.items || [], dn = it.filter((x: any) => x.done).length;
      h += '<div class="tk" draggable="true" data-act="topen" data-tid="' + tk.id + '" role="button" tabindex="0"><b>' + esc(tk.t || t("Untitled")) + "</b>" + (tk.d ? "<p>" + esc(tk.d) + "</p>" : "") +
        '<div class="tk-f">' + (it.length ? '<span class="mbar"><i style="width:' + (dn / it.length * 100) + '%"></i></span><small>' + dn + "/" + it.length + "</small>" : '<span style="flex:1"></span>') +
        '<span class="tk-mv">' + (ci > 0 ? '<button data-act="tmove" data-tid="' + tk.id + '" data-d="-1" aria-label="' + t("Move left") + '">‹</button>' : "") + (ci < 2 ? '<button data-act="tmove" data-tid="' + tk.id + '" data-d="1" aria-label="' + t("Move right") + '">›</button>' : "") + "</span></div></div>";
    });
    h += '<button class="kb-add" data-act="tnew" data-col="' + c[0] + '">+ ' + t("Task") + "</button></div>";
  });
  return h + "</div>";
}
export function renderTaskModal() {
  const tk = findT(ui.tEdit); if (!tk) { ui.tEdit = null; return ""; } const it = tk.items || [];
  return '<div class="modal-bg" data-act="tclose"></div><div class="modal wide" role="dialog" aria-modal="true" aria-label="' + t("Task") + '">' +
    '<input class="tin tt" id="t-title" data-tk="t" value="' + esc(tk.t) + '" placeholder="' + t("Task title") + '">' +
    '<label class="fld" for="t-col">' + t("Status") + '</label><select class="tin" id="t-col" data-tcol="1">' + COLS().map((c) => '<option value="' + c[0] + '"' + (tk.col === c[0] ? " selected" : "") + ">" + c[1] + "</option>").join("") + "</select>" +
    '<label class="fld" for="t-desc">' + t("Description") + '</label><textarea class="tin" id="t-desc" data-tk="d" placeholder="' + esc(t("Details, links, contacts …")) + '">' + esc(tk.d) + "</textarea>" +
    '<span class="fld">' + t("Checklist") + (it.length ? " · " + it.filter((x: any) => x.done).length + "/" + it.length : "") + '</span><div class="cl">' +
    it.map((x: any) => '<div class="cl-row' + (x.done ? " done" : "") + '"><input type="checkbox" data-tchk="' + x.id + '"' + (x.done ? " checked" : "") + ' aria-label="' + t("Done") + '"><input class="ci" data-titem="' + x.id + '" value="' + esc(x.t) + '"><button class="icon" data-act="tidel" data-iid="' + x.id + '" aria-label="' + t("Delete item") + '">×</button></div>').join("") +
    '</div><div class="cl-add"><input id="t-newitem" placeholder="' + esc(t("New item, Enter to add")) + '"><button class="btn" data-act="tiadd">' + t("Add") + "</button></div>" +
    '<div class="m-actions" style="justify-content:space-between">' + (ui.tDel ? '<span class="confirm"><span>' + t("Delete task?") + '</span><button class="btn danger" data-act="tdel">' + t("Delete") + '</button><button class="btn ghost" data-act="tdelno">' + t("Cancel") + "</button></span>" : '<button class="btn ghost" data-act="tdelask">' + t("Delete task") + "</button>") +
    '<button class="btn primary" data-act="tclose">' + t("Done") + "</button></div></div>";
}

// ---------------------------------------------------------------- seating
function tableSvg(tb: any, n: number) {
  const cap = +tb.cap || 8; let dots = "", i: number; const fill = (j: number) => j < n ? (j < cap ? "var(--accent)" : "var(--warn)") : "var(--surface-2)", tot = Math.max(cap, n);
  if (tb.shape === "long") {
    const top = Math.ceil(tot / 2), bot = tot - top, w = Math.max(100, top * 20);
    const vb = Math.max(160, w + 40), x0 = (vb - w) / 2;
    for (i = 0; i < top; i++) dots += '<circle cx="' + (x0 + 10 + i * (w - 20) / Math.max(1, top - 1) * (top > 1 ? 1 : 0) + (top === 1 ? (w - 20) / 2 : 0)) + '" cy="42" r="9" fill="' + fill(i) + '" stroke="var(--line)"/>';
    for (i = 0; i < bot; i++) dots += '<circle cx="' + (x0 + 10 + i * (w - 20) / Math.max(1, bot - 1) * (bot > 1 ? 1 : 0) + (bot === 1 ? (w - 20) / 2 : 0)) + '" cy="118" r="9" fill="' + fill(top + i) + '" stroke="var(--line)"/>';
    return '<svg viewBox="0 0 ' + vb + ' 160" aria-hidden="true"><rect x="' + x0 + '" y="58" width="' + w + '" height="44" rx="10" fill="var(--rose-soft)" stroke="var(--rose)"/>' + dots + '<text x="' + (vb / 2) + '" y="85" text-anchor="middle" font-size="15" font-weight="700" fill="var(--ink)">' + n + "/" + cap + "</text></svg>";
  }
  for (i = 0; i < tot; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / tot; dots += '<circle cx="' + (80 + 62 * Math.cos(a)).toFixed(1) + '" cy="' + (80 + 62 * Math.sin(a)).toFixed(1) + '" r="' + (tot > 14 ? 7 : 9) + '" fill="' + fill(i) + '" stroke="var(--line)"/>'; }
  return '<svg viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="44" fill="var(--rose-soft)" stroke="var(--rose)"/>' + dots + '<text x="80" y="86" text-anchor="middle" font-size="17" font-weight="700" fill="var(--ink)">' + n + "/" + cap + "</text></svg>";
}
export function quickTables() { return Math.max(1, Math.ceil(seatPeople().length / 10)); }
export function renderSeat() {
  const S = seat(), P = seatPeople(), byId: Record<string, any> = {}, tids: Record<string, number> = {}; S.tables.forEach((x: any) => { tids[x.id] = 1; });
  P.forEach((x) => { byId[x.pid] = x; });
  Object.keys(S.assign).forEach((k) => { if (!byId[k] || !tids[S.assign[k]]) delete S.assign[k]; });
  const placed = P.filter((x) => S.assign[x.pid]).length, seats = S.tables.reduce((a: number, x: any) => a + (+x.cap || 0), 0);
  let h = '<section class="card"><div class="st-sum"><div><b>' + placed + " / " + P.length + "</b> <span>" + t("people seated") + "</span></div><div><b>" + S.tables.length + "</b> <span>" + esc(tp("table", "tables", S.tables.length) + " · " + tp("{n} seat", "{n} seats", seats)) + "</span></div>" +
    (seats && seats < P.length ? '<span style="color:var(--warn);font-weight:600">' + esc(tp("{n} seat short", "{n} seats short", P.length - seats)) + "</span>" : "") + "</div>" +
    '<p class="hint" style="margin:8px 0 0">' + t("Tap a guest (whole household) or a person at a table, then tap the target table. Guests who declined are not shown.") + "</p>";
  const sel = ui.seatSel;
  const hh: Record<string, any[]> = {}, order: string[] = []; P.forEach((x) => { if (S.assign[x.pid]) return; if (!hh[x.hh]) { hh[x.hh] = []; order.push(x.hh); } hh[x.hh].push(x); });
  const q = (ui.seatQ || "").toLowerCase().trim();
  const pool = order.filter((k) => !q || hh[k].map((x) => x.name).join(" ").toLowerCase().indexOf(q) >= 0);
  h += '<div class="st-pool"><div class="gtools" style="margin:4px 0 8px"><b style="flex:none">' + t("Without a seat ({n})", { n: P.length - placed }) + '</b><input id="seatq" placeholder="' + t("Search…") + '" value="' + esc(ui.seatQ || "") + '"></div><div class="pl">';
  if (!order.length) h += '<span class="hint">' + t("Everyone has a seat.") + "</span>";
  pool.forEach((k) => { const L = hh[k], m = L[0], lbl = L.map((x, i) => i === 0 ? x.name : x.short).join(" + ");
    const on = sel && sel.hh === k;
    h += '<button class="pc ' + sideCls(m.side) + (on ? " sel" : "") + '" data-act="seatpick" data-hh="' + k + '">' + esc(lbl) + (L.length > 1 ? " <em>" + L.length + "</em>" : "") + "</button>"; });
  h += "</div></div></section>";
  h += '<div class="gtools"><span style="flex:1"></span>' + (!S.tables.length ? '<button class="btn" data-act="tbquick">' + esc(t("Quick start: {n} round tables of 10", { n: quickTables() })) + "</button>" : "") +
    '<button class="btn" data-act="tbadd" data-shape="long">+ ' + t("Long table") + '</button><button class="btn primary" data-act="tbadd" data-shape="round">+ ' + t("Round table") + "</button></div>";
  h += '<div class="st-grid">';
  S.tables.forEach((tb: any) => {
    const inT = P.filter((x) => S.assign[x.pid] === tb.id), n = inT.length, cap = +tb.cap || 8;
    h += '<div class="tb' + (sel ? " target" : "") + (n > cap ? " full" : "") + '" data-act="seatto" data-tid="' + tb.id + '"><div class="tb-h"><input data-tbname="' + tb.id + '" value="' + esc(tb.name) + '" aria-label="' + t("Table name") + '">' +
      '<select data-tbcap="' + tb.id + '" aria-label="' + t("Seats") + '">' + [4, 6, 8, 10, 12, 14, 16, 20, 24].concat([cap]).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b).map((v) => '<option value="' + v + '"' + (v === cap ? " selected" : "") + ">" + v + "</option>").join("") + "</select>" +
      '<button class="icon" data-act="tbdelask" data-tid="' + tb.id + '" aria-label="' + t("Remove table") + '" title="' + t("Remove table") + '">×</button></div>' +
      (ui.tbDel === tb.id ? '<div class="confirm" style="margin:6px 0"><span>' + t("Remove table? The guests go back to the list.") + '</span><button class="btn danger" data-act="tbdel" data-tid="' + tb.id + '">' + t("Remove") + '</button><button class="btn ghost" data-act="tbdelno">' + t("Cancel") + "</button></div>" : "") +
      tableSvg(tb, n) + '<div class="pl">' + inT.map((x) => { const on = sel && sel.pid === x.pid; return '<span class="pc ' + sideCls(x.side) + (on ? " sel" : "") + '"><span data-act="seatpickp" data-pid="' + x.pid + '" style="cursor:pointer">' + esc(x.name) + '</span><button class="x" data-act="unseat" data-pid="' + x.pid + '" aria-label="' + t("Free seat") + '">×</button></span>'; }).join("") + "</div></div>";
  });
  h += "</div>";
  if (sel) { const nm = sel.hh ? hh[sel.hh] && hh[sel.hh].map((x) => x.short).join(" + ") : byId[sel.pid] && byId[sel.pid].name;
    h += '<div class="st-bar" role="status"><span>' + esc((nm || "") + " → " + t("tap a table")) + '</span><button data-act="seatcancel">' + t("Cancel") + "</button></div>"; }
  return h;
}

// ---------------------------------------------------------------- schedule
export function lnkHtml(k: string) {
  if (k.indexOf("t:") === 0) { const tk = findT(k.slice(2)); if (!tk) return ""; return '<span class="ag-lnk' + (tk.col === "done" ? " done" : "") + '" data-act="aglink" data-k="' + esc(k) + '">✓ ' + esc(tk.t || t("Task")) + "</span>"; }
  const pp = k.slice(2).split("|"), l = state.locations.filter((x: any) => x.id === pp[0])[0], q = findQ(pp[1]); if (!l || !q) return "";
  return '<span class="ag-lnk q" data-act="aglink" data-k="' + esc(k) + '">? ' + esc(lname(l)) + ": " + esc(q.t.length > 48 ? q.t.slice(0, 46) + "…" : q.t) + "</span>";
}
function durTxt(d: number) { return d >= 60 ? t("{h} h", { h: Math.floor(d / 60) }) + (d % 60 ? " " + t("{m} min", { m: d % 60 }) : "") : t("{m} min", { m: d }); }
export function renderAgenda() {
  const D = DAYS();
  if (!D.length) return '<div class="ag-empty">' + t("Add your event days in Settings to plan the schedule.") + ' <button class="btn" data-act="tab" data-v="settings">' + t("Settings") + "</button></div>";
  if (!D.some((d) => d[0] === ui.agDay)) ui.agDay = defaultDay();
  let h = '<div class="ag-days">' + D.map((d) => { const n = agenda().filter((x: any) => x.day === d[0]).length; return '<button class="' + (ui.agDay === d[0] ? "on" : "") + '" data-act="agday" data-v="' + d[0] + '"><b>' + esc(d[1]) + "</b><small>" + esc((d[3] ? d[3] + " · " : "") + tp("{n} item", "{n} items", n)) + "</small></button>"; }).join("") + "</div>";
  const L = agSorted(ui.agDay);
  h += '<div class="gtools" style="margin-top:0"><span class="hint" style="flex:1">' + t("Tap an item to edit it. “+ Insert” between two items adds something in between.") + '</span><button class="btn primary" data-act="agnew" data-t="">+ ' + t("Schedule item") + "</button></div>";
  if (!L.length) return h + '<div class="ag-empty">' + t("No schedule for this day yet. Start with “+ Schedule item”.") + "</div>";
  h += '<div class="ag">';
  L.forEach((x: any, i: number) => {
    const s1 = tmin(x.start), e1 = tmin(x.end), dur = s1 != null && e1 != null ? ((e1 - s1 + 1440) % 1440) : null;
    h += '<div class="ag-row"><div class="ag-time">' + esc(x.start ? fmtTime(x.start) : "–") + (x.end ? "<small>" + esc(t("until {time}", { time: fmtTime(x.end) })) + "</small>" : "") + '</div><div class="ag-rail"><i></i></div>' +
      '<button class="ag-card" data-act="agopen" data-id="' + x.id + '"><b>' + esc(x.title || t("Untitled")) + "</b>" + (dur ? '<span class="dur">' + esc(durTxt(dur)) + "</span>" : "") + (x.note ? "<p>" + esc(x.note) + "</p>" : "") +
      (((x.tags || []).length || (x.links || []).length) ? '<div class="ag-meta">' + (x.tags || []).map((tg: string) => '<span class="ag-tag">' + esc(tg) + "</span>").join("") + (x.links || []).map(lnkHtml).join("") + "</div>" : "") + "</button></div>";
    const nx = L[i + 1], endT = e1 != null ? e1 : (s1 != null ? s1 + 30 : null);
    const ns = nx ? tmin(nx.start) : null;
    const gap = nx && endT != null && ns != null ? ((ns - endT + 1440) % 1440) : 0;
    h += '<div class="ag-row' + (gap > 0 && gap < 600 ? " gap" : "") + '"><div></div><div class="ag-rail"></div><div>' + (gap > 0 && gap < 600 ? '<div class="ag-gapl">' + esc(t("{m} min to spare", { m: gap })) + "</div>" : "") + '<button class="ag-ins" data-act="agnew" data-t="' + (endT != null ? tfmt(endT) : "") + '">+ ' + (endT != null ? esc(t("Insert at {time}", { time: fmtTime(tfmt(endT)) })) : t("Insert")) + "</button></div></div>";
  });
  return h + "</div>";
}
export function renderAgModal() {
  const x = agenda().filter((a: any) => a.id === ui.agEdit)[0]; if (!x) { ui.agEdit = null; return ""; }
  const AT = AGTAGS(), tags = AT.concat((x.tags || []).filter((tg: string) => AT.indexOf(tg) < 0));
  const qs = openQs(), T = tasks();
  return '<div class="modal-bg" data-act="agclose"></div><div class="modal wide" role="dialog" aria-modal="true" aria-label="' + t("Schedule item") + '">' +
    '<input class="tin tt" id="ag-title" data-ag="title" value="' + esc(x.title) + '" placeholder="' + t("What happens?") + '">' +
    '<div class="trow2"><div><label class="fld" for="ag-start">' + t("From") + '</label><input class="tin" type="time" id="ag-start" data-ag="start" value="' + esc(x.start) + '"></div><div><label class="fld" for="ag-end">' + t("To") + '</label><input class="tin" type="time" id="ag-end" data-ag="end" value="' + esc(x.end) + '"></div></div>' +
    '<label class="fld" for="ag-day">' + t("Day") + '</label><select class="tin" id="ag-day" data-agsel="day">' + DAYS().map((d) => '<option value="' + d[0] + '"' + (x.day === d[0] ? " selected" : "") + ">" + esc(d[1]) + "</option>").join("") + "</select>" +
    '<label class="fld" for="ag-note">' + t("Note") + '</label><textarea class="tin" id="ag-note" data-ag="note" placeholder="' + esc(t("Who, where, what to keep in mind …")) + '" style="min-height:70px">' + esc(x.note) + "</textarea>" +
    '<span class="fld">' + t("Tags") + '</span><div class="tagpick">' + tags.map((tg: string) => { const on = (x.tags || []).indexOf(tg) >= 0; return '<button class="' + (on ? "on" : "") + '" data-act="agtag" data-v="' + esc(tg) + '">' + esc(tg) + "</button>"; }).join("") + "</div>" +
    '<div class="cl-add"><input id="ag-newtag" placeholder="' + t("Own tag") + '"><button class="btn" data-act="agtagadd">+ ' + t("Tag") + "</button></div>" +
    '<span class="fld">' + t("Links") + "</span>" + ((x.links || []).length ? '<div class="lnklist">' + (x.links || []).map((k: string) => "<span><em>" + lnkHtml(k) + '</em><button class="icon" data-act="agunlink" data-k="' + esc(k) + '" aria-label="' + t("Remove link") + '">×</button></span>').join("") + "</div>" : '<p class="hint" style="margin:0">' + t("No link yet.") + "</p>") +
    '<div class="cl-add"><select class="tin" id="ag-lsel"><option value="">' + t("Choose a task or open question …") + "</option>" +
      (T.length ? '<optgroup label="' + t("Tasks") + '">' + T.map((tk: any) => '<option value="t:' + tk.id + '">' + esc(tk.t || t("Untitled")) + "</option>").join("") + "</optgroup>" : "") +
      (qs.length ? '<optgroup label="' + t("To clarify (?)") + '">' + qs.map((o) => '<option value="q:' + esc(o.k) + '">' + esc(lname(o.l)) + ": " + esc(o.q.t.slice(0, 70)) + "</option>").join("") + "</optgroup>" : "") +
    '</select><button class="btn" data-act="aglinkadd">' + t("Link") + "</button></div>" +
    '<div class="m-actions" style="justify-content:space-between">' + (ui.agDel ? '<span class="confirm"><span>' + t("Delete item?") + '</span><button class="btn danger" data-act="agdel">' + t("Delete") + '</button><button class="btn ghost" data-act="agdelno">' + t("Cancel") + "</button></span>" : '<button class="btn ghost" data-act="agdelask">' + t("Delete") + "</button>") +
    '<button class="btn primary" data-act="agclose">' + t("Done") + "</button></div></div>";
}
