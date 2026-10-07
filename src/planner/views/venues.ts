// Venues: checklist, comparison, detailed planning, archive, photo gallery, document viewer.
import { state, ui, t, tp, esc, fmtD, dispDate, fmtTS, fmtDate, fmtMoney, iso, MONTHS, BLOCKED, monthName, weekdays, VATDEF } from "../ctx";
import {
  CATS, PRIO, questions, findQ, archivedQ, allQ, st, note, stats, answeredBy, datesOf, contOf, allDatesOf, TSTEPS, tLabel, timesOf,
  VENDORS, vendorsOf, lname, lfull, activeLocs, archivedLocs, badge, sortForCmp, peekLoc, cur, VPMAX, vp,
  planSvcs, svcName, pGet, parseMoney, pGroups, grpOf, grpCovered, svcState, grpState, vatOf, planStats, findPF,
} from "../data";
import { ICON_EDIT, ICON_ARCH, img } from "./common";
import { fileUrl } from "../../lib/files";
import { wid } from "../ctx";

function isBlocked(s: string) { return BLOCKED().filter((b) => s >= b.from && s <= b.to)[0] || null; }

export function renderCal(loc: any) {
  const sel = datesOf(loc), sel2 = contOf(loc), M = MONTHS();
  if (!M.length) return '<p class="hint" style="margin:0">' + t("Choose your preferred months in Settings to mark available dates here.") + ' <button class="btn" data-act="tab" data-v="settings">' + t("Settings") + "</button></p>";
  let h = '<div class="cal-wrap">';
  const wd = weekdays("short");
  M.forEach((ym) => {
    const y = ym[0], m = ym[1], first = (new Date(y, m, 1).getDay() + 6) % 7, n = new Date(y, m + 1, 0).getDate();
    h += '<div class="cal"><h5>' + esc(monthName(m, y)) + '</h5><div class="cal-grid">' + wd.map((d) => '<span class="dow">' + esc(d.slice(0, 2)) + "</span>").join("");
    for (let i = 0; i < first; i++) h += "<span></span>";
    for (let d = 1; d <= n; d++) {
      const s = iso(y, m, d), w = new Date(y, m, d).getDay(), on = sel.indexOf(s) >= 0, on2 = sel2.indexOf(s) >= 0, bl = isBlocked(s);
      const cls = "day" + (w === 6 ? " sat" : (w === 5 || w === 0) ? " we" : "") + (bl ? " hol" : "") + (on ? " sel" : "") + (on2 ? " sel2" : "");
      h += '<button class="' + cls + '" data-act="date" data-d="' + s + '" aria-pressed="' + (on || on2) + '" aria-label="' + esc(fmtD(s) + (on ? ", " + t("available") : on2 ? ", " + t("available, several couples interested") : "") + (bl ? ", " + bl.label : "")) + '"' + (bl ? ' title="' + esc(bl.label) + '"' : "") + ">" + d + "</button>";
    }
    h += "</div></div>";
  });
  h += '</div><div class="cal-legend"><span><i style="background:var(--ok)"></i>' + t("available") + '</span><span><i style="background:var(--pend)"></i>' + t("available, but several couples interested") + '</span><span><i style="background:var(--accent-soft)"></i>' + t("Saturday") + "</span>" +
    BLOCKED().map((b) => '<span><i class="day hol" style="width:12px;height:12px;min-height:0;aspect-ratio:auto;padding:0"></i>' + esc(b.label) + "</span>").join("") + "<span>" + t("Tap to switch: green → yellow → empty.") + "</span></div>";
  const both = sel.concat(sel2).sort();
  if (both.length) h += '<div class="chips">' + both.map((s: string) => { const y2 = sel2.indexOf(s) >= 0; return '<button class="dchip ' + (y2 ? "y" : "g") + '" data-act="daterm" data-d="' + s + '" title="' + (y2 ? t("available, several couples interested") : t("available")) + '" aria-label="' + esc(t("Remove {date}", { date: fmtD(s) })) + '">' + esc(fmtD(s)) + "<span>×</span></button>"; }).join("") + "</div>";
  return h;
}

const TKEYS = () => [["out", t("Music outdoors until")], ["in", t("Party indoors until")]];
export function renderTimes(loc: any) {
  const tm = timesOf(loc); let h = '<div class="times">';
  TKEYS().forEach((k) => {
    const v = tm[k[0]], set = typeof v === "number";
    h += '<div class="tr"><label for="t-' + k[0] + '">' + k[1] + '</label><input type="range" class="rng ' + k[0] + (set ? "" : " unset") + '" id="t-' + k[0] + '" data-time="' + k[0] + '" min="0" max="' + TSTEPS + '" step="1" value="' + (set ? v : 8) + '" aria-valuetext="' + esc(set ? tLabel(v) : t("not set")) + '">' +
      '<output id="o-' + k[0] + '" class="' + (set ? "" : "none") + '">' + esc(set ? tLabel(v) : t("open")) + "</output>" +
      (set ? '<button class="icon" data-act="tclear" data-k="' + k[0] + '" aria-label="' + esc(t("Reset {what}", { what: k[1] })) + '" title="' + t("Reset") + '">×</button>' : "<span></span>") + "</div>";
  });
  h += '<div class="tr"><span class="spacer"></span><div class="tscale">' + [0, 4, 8, 12, 16, 20].map((i) => '<span style="left:' + (i / TSTEPS * 100) + '%">' + esc(tLabel(i)) + "</span>").join("") + "</div></div></div>";
  return h;
}

export function renderVendors(loc: any) {
  const V = VENDORS(), sel = vendorsOf(loc), all = V.concat(sel.filter((v: string) => V.indexOf(v) < 0));
  let h = '<details class="vend"' + (ui.vendOpen ? " open" : "") + '><summary><span class="vs-l">' + t("Set by the venue") + '</span><span class="vs-v">' + (sel.length ? esc(sel.join(", ")) : t("nothing selected")) + '</span></summary><div class="vgrid">';
  all.forEach((v: string, i: number) => { h += '<label class="vopt" for="vd-' + i + '"><input type="checkbox" id="vd-' + i + '" data-vend="' + esc(v) + '"' + (sel.indexOf(v) >= 0 ? " checked" : "") + ">" + esc(v) + "</label>"; });
  return h + "</div></details>";
}

export function locChips() {
  let h = '<div class="locbar">';
  activeLocs().forEach((l: any) => {
    h += '<button class="loc-chip ' + (l.id === ui.loc && !peekLoc() ? "on" : "") + '" data-act="pick" data-id="' + l.id + '" title="' + esc(l.name) + '">' + (l.photo ? '<img class="chip-img" src="' + img(l.photo) + '" alt="">' : "") + badge(l) + '<span data-chip="' + l.id + '">' + esc(lname(l)) + "</span><small>" + stats(l).pct + "%</small></button>";
  });
  return h + '<button class="loc-chip add" data-act="addloc">+ ' + t("Venue") + "</button></div>";
}

export function renderCheck() {
  const loc = cur(); let h = locChips();
  if (loc && loc.archived) { h += '<div class="banner"><span><b>' + t("Archived venue") + "</b> · " + esc(t("archived on {date}", { date: fmtDate(loc.archived.at) })) + (loc.archived.reason ? " · " + esc(t("Reason: {r}", { r: loc.archived.reason })) : "") + '</span><button class="btn" data-act="peekback">← ' + t("Back to archive") + '</button><button class="btn primary" data-act="locrestore" data-id="' + loc.id + '">' + t("Reactivate") + "</button></div>"; }
  if (!loc) { return h + '<div class="card"><p>' + t("No active venue. Add a new one or bring one back from the archive.") + '</p><button class="btn primary" data-act="addloc">' + t("Add venue") + "</button></div>"; }
  function f(k: string, label: string, ph: string, wide?: boolean, type?: string) { return '<div class="field' + (wide ? " wide" : "") + '"><label for="f-' + k + '">' + label + '</label><input id="f-' + k + '" type="' + (type || "text") + '" data-field="' + k + '" value="' + esc(loc[k]) + '" placeholder="' + esc(ph) + '"></div>'; }
  let ph = '<div class="photo-wrap">' + (loc.photo ? '<img class="photo" src="' + img(loc.photo) + '" alt="' + esc(t("Photo of {name}", { name: lname(loc) })) + '">' : '<label class="photo-empty" for="photo-in">+ ' + t("Add a cover photo") + "</label>") +
    '<div class="photo-actions"><div class="loc-head"><span class="nk">' + esc(lname(loc)) + "</span>" + (loc.nick ? '<span class="nm">' + esc(loc.name) + "</span>" : "") + "</div>" +
    (loc.photo ? (ui.confirmPhoto === loc.id ? '<div class="confirm"><span>' + t("Remove photo?") + '</span><button class="btn danger" data-act="photodel">' + t("Remove") + '</button><button class="btn ghost" data-act="photono">' + t("Cancel") + "</button></div>"
      : '<div style="display:flex;gap:8px;flex-wrap:wrap"><label class="btn" for="photo-in">' + t("Replace photo") + '</label><button class="btn ghost" data-act="photoask">' + t("Remove photo") + "</button></div>") : "") +
    '<input type="file" accept="image/*" id="photo-in" class="file-hidden" data-photo="1"></div></div>';
  const nv = vp(loc).length;
  ph += '<div class="vis-row">' + (nv ? '<button class="btn" data-act="galopen" data-id="' + loc.id + '">' + t("View visit photos ({n} / {max})", { n: nv, max: VPMAX }) + "</button>" : '<span class="hint">' + t("No visit photos yet.") + "</span>") +
    (nv < VPMAX ? '<label class="btn ghost" for="vph-in">+ ' + t("Upload visit photos") + '</label><input type="file" accept="image/*" multiple id="vph-in" class="file-hidden" data-vph="1">' : '<span class="hint">' + t("Maximum of {max} reached", { max: VPMAX }) + "</span>") +
    (ui.galMsg && !ui.gal ? '<span id="vis-msg" class="vis-msg' + (ui.galErr ? " err" : "") + '">' + esc(ui.galMsg) + "</span>" : "") + "</div>";
  h += '<section class="card">' + ph + '<div class="fields">' +
    f("name", t("Venue"), t("e.g. Countryside estate …")) + f("nick", t("Nickname"), t("e.g. Flower pavilion")) + f("region", t("Region / town"), t("e.g. Tuscany")) +
    f("address", t("Address"), t("Street, postcode, town")) + f("maps", t("Map link"), "https://maps.google.com/…") + f("visit", t("Visited on"), "", false, "date") + f("contact", t("Contact person"), t("Name, phone, email")) +
    f("price", t("Total quote"), t("e.g. 30,000 for 100 guests")) + f("notes", t("Overall impression"), t("What sticks in your mind?"), true) +
    '</div><div class="card-foot"><div class="stars"><span class="lbl">' + t("Gut feeling") + "</span>";
  for (let i = 1; i <= 5; i++) h += '<button class="star ' + (i <= loc.rating ? "on" : "") + '" data-act="rate" data-v="' + i + '" aria-label="' + esc(t("{n} of 5", { n: i })) + '">★</button>';
  h += "</div>" + (loc.archived ? "" : '<div class="rank"><span class="lbl">' + t("Top 3") + "</span>" + [1, 2, 3].map((n) => '<button class="rkbtn r' + n + (loc.rank === n ? " on" : "") + '" data-act="rank" data-v="' + n + '" aria-pressed="' + (loc.rank === n) + '" title="' + esc(t("Mark as no. {n}", { n })) + '">' + n + "</button>").join("") + "</div>");
  if (/^https?:\/\//.test(loc.maps || "")) h += '<a class="maplink" href="' + esc(loc.maps) + '" target="_blank" rel="noopener noreferrer">' + t("Open map") + " ↗</a>";
  h += ui.confirmDel === loc.id
    ? '<div class="confirm"><span>' + esc(t("Delete “{name}” with all answers?", { name: loc.name || t("Unnamed") })) + '</span><button class="btn danger" data-act="del">' + t("Delete") + '</button><button class="btn ghost" data-act="delno">' + t("Cancel") + "</button></div>"
    : '<div style="display:flex;gap:8px;flex-wrap:wrap">' + (loc.archived ? '<button class="btn" data-act="locrestore" data-id="' + loc.id + '">' + t("Reactivate") + "</button>" : '<button class="btn" data-act="locarchask">' + t("Archive venue") + "</button>") + '<button class="btn ghost" data-act="delask">' + t("Delete venue") + "</button></div>";
  h += "</div></section>";

  const s = stats(loc);
  h += '<div class="progress"><div class="nums"><span><b>' + s.ok + "</b> " + t("resolved") + "</span><span><b>" + s.issue + "</b> " + t("problems") + "</span><span><b>" + s.todo + "</b> " + t("to clarify") + "</span><span><b>" + s.open + "</b> " + t("open") + "</span><span><b>" + s.mustOpen + "</b> " + t("must-have questions open") + "</span></div>" +
    '<div class="bar"><i class="b-ok" style="width:' + (s.ok / s.total * 100) + '%"></i><i class="b-issue" style="width:' + (s.issue / s.total * 100) + '%"></i><i class="b-todo" style="width:' + (s.todo / s.total * 100) + '%"></i></div></div>';
  h += '<div class="filters"><div class="seg">' +
    [["all", t("All")], ["open", t("Open")], ["todo", t("To clarify")], ["issue", t("Problems")], ["ok", t("Resolved")]].map((x) => '<button data-act="filter" data-v="' + x[0] + '" class="' + (ui.filter === x[0] ? "on" : "") + '">' + x[1] + "</button>").join("") +
    '</div><label class="toggle"><input type="checkbox" id="mustonly" data-act="must" ' + (ui.must ? "checked" : "") + "> " + t("Must-haves only") + "</label></div>";
  const P = PRIO();
  CATS.forEach((c) => {
    const list = questions(c.id), cs = stats(loc, list);
    const shown = list.filter((q: any) => { const x = st(loc, q.id); return (ui.filter === "all" || ui.filter === x) && (!ui.must || q.p === "m"); });
    h += '<details class="cat" data-cat="' + c.id + '" ' + (ui.closed[c.id] ? "" : "open") + "><summary><h2>" + esc(t(c.t)) + '</h2><span class="cnt">' + (cs.ok + cs.issue) + " / " + cs.total + (cs.todo ? ' · <span class="y">' + cs.todo + " ?</span>" : "") + (cs.issue ? ' · <span class="w">' + cs.issue + " ⚠</span>" : "") + '</span></summary><div class="qs">';
    if (!shown.length) h += '<p class="empty">' + t("No questions for this filter.") + "</p>";
    shown.forEach((q: any) => {
      const x = st(loc, q.id);
      if (ui.editQ === q.id) {
        h += '<div class="q editing"><label class="elbl" for="eq-text">' + t("Edit question (applies to all venues)") + "</label>" +
          '<input id="eq-text" data-edit="t" value="' + esc(ui.editT) + '">' +
          '<div class="eq-row"><div class="seg">' + (q.custom ? ["m", "w", "o", "c"] : ["m", "w", "o"]).map((k) => '<button data-act="editp" data-v="' + k + '" class="' + (ui.editP === k ? "on" : "") + '">' + P[k] + "</button>").join("") + "</div>" +
          '<div class="eq-actions"><button class="btn ghost" data-act="editcancel">' + t("Cancel") + '</button><button class="btn primary" data-act="editsave">' + t("Save") + "</button></div></div></div>";
        return;
      }
      h += '<div class="q s-' + x + (ui.flashQ === q.id ? " flash" : "") + '" id="q-' + q.id + '"><div class="q-top"><div class="q-btns">' +
        '<button class="tick ok" data-act="set" data-q="' + q.id + '" data-s="ok" aria-pressed="' + (x === "ok") + '" title="' + t("Resolved") + '">✓</button>' +
        '<button class="tick todo" data-act="set" data-q="' + q.id + '" data-s="todo" aria-pressed="' + (x === "todo") + '" title="' + t("To clarify") + '">?</button>' +
        '<button class="tick issue" data-act="set" data-q="' + q.id + '" data-s="issue" aria-pressed="' + (x === "issue") + '" title="' + t("Problem / follow up") + '">!</button></div>' +
        '<p class="q-text">' + esc(q.t) + '<span class="prio p-' + q.p + '">' + P[q.p] + "</span></p>" +
        '<div class="q-tools"><button class="icon" data-act="editq" data-q="' + q.id + '" aria-label="' + t("Edit question") + '" title="' + t("Edit question") + '">' + ICON_EDIT + "</button>" +
        '<button class="icon" data-act="archq" data-q="' + q.id + '" aria-label="' + t("Archive question") + '" title="' + t("Archive question") + '">' + ICON_ARCH + "</button></div>" +
        "</div>" + (q.id === "v1" ? renderCal(loc) : q.id === "z1" ? renderTimes(loc) : q.id === "d2" ? renderVendors(loc) : "") + '<input class="q-note" id="n-' + q.id + '" data-note="' + q.id + '" value="' + esc(note(loc, q.id)) + '" placeholder="' + esc(q.id === "v1" ? t("Note, e.g. option held until …") : q.id === "d2" ? t("Comment, e.g. choice of 5 DJ companies") : t("Note the answer…")) + '"></div>';
    });
    if (ui.filter === "all") h += '<div class="addq"><input id="add-' + c.id + '" placeholder="' + esc(t("Add your own question (applies to all venues)")) + '"><button class="btn" data-act="addq" data-cat="' + c.id + '">' + t("Add") + "</button></div>";
    h += "</div></details>";
  });
  return h;
}

export function renderCmp() {
  const L = sortForCmp(activeLocs());
  if (!L.length) return '<div class="card"><p>' + t("No venue added yet.") + '</p><button class="btn primary" data-act="addloc">' + t("Add your first venue") + "</button></div>";
  function row(label: string, fn: (l: any) => string) { return '<tr><th class="rowh" scope="row">' + label + "</th>" + L.map((l: any) => "<td>" + fn(l) + "</td>").join("") + "</tr>"; }
  function grp(x: string) { return '<tr class="grp"><th colspan="' + (L.length + 1) + '">' + x + "</th></tr>"; }
  function dash(v: string) { return v ? esc(v) : '<span class="hint">–</span>'; }
  let h = '<div class="cmp-tools"><span>' + t("Order") + '</span><div class="seg"><button data-act="cmpsort" data-v="top" class="' + (ui.cmpSort !== "chrono" ? "on" : "") + '">' + t("Top 3 first") + '</button><button data-act="cmpsort" data-v="chrono" class="' + (ui.cmpSort === "chrono" ? "on" : "") + '">' + t("Chronological") + "</button></div>" +
    (archivedLocs().length ? "<span>· " + esc(tp("{n} archived, not compared", "{n} archived, not compared", archivedLocs().length)) + "</span>" : "") + "</div>" +
    '<div class="tbl-wrap"><table><thead><tr><th class="rowh"></th>' +
    L.map((l: any) => '<th scope="col">' + (l.photo ? '<img class="th-img" src="' + img(l.photo) + '" alt="">' : "") + '<button data-act="goto" data-id="' + l.id + '">' + badge(l) + esc(lname(l)) + "</button>" + (l.nick ? '<span class="th-sub">' + esc(l.name) + "</span>" : "") + (vp(l).length ? '<br><button class="th-gal" data-act="galopen" data-id="' + l.id + '">' + t("Photos ({n})", { n: vp(l).length }) + "</button>" : "") + "</th>").join("") + "</tr></thead><tbody>";
  h += row(t("Region"), (l) => dash(l.region));
  h += row(t("Map"), (l) => /^https?:\/\//.test(l.maps || "") ? '<a class="maplink" href="' + esc(l.maps) + '" target="_blank" rel="noopener noreferrer">' + t("Map") + " ↗</a>" : dash(""));
  h += row(t("Visited"), (l) => dash(dispDate(l.visit)));
  h += row(t("Quote"), (l) => dash(l.price));
  h += row(t("Gut feeling"), (l) => l.rating ? '<span style="color:var(--warn)">' + "★".repeat(l.rating) + '</span><span style="color:var(--line)">' + "★".repeat(5 - l.rating) + "</span>" : dash(""));
  h += row(t("Progress"), (l) => { const s = stats(l); return '<div class="mini"><div class="bar"><i class="b-ok" style="width:' + (s.ok / s.total * 100) + '%"></i><i class="b-issue" style="width:' + (s.issue / s.total * 100) + '%"></i><i class="b-todo" style="width:' + (s.todo / s.total * 100) + '%"></i></div><span>' + s.pct + "%</span></div>"; });
  h += row(t("Problems"), (l) => { const s = stats(l); return s.issue ? '<span class="cell-issue">' + s.issue + " ⚠</span>" : "0"; });
  h += row(t("To clarify"), (l) => { const s = stats(l); return s.todo ? '<span class="cell-todo">' + s.todo + " ?</span>" : "0"; });
  h += row(t("Must-haves open"), (l) => String(stats(l).mustOpen));
  h += row(t("Overall impression"), (l) => dash(l.notes));
  h += grp(t("Key facts from the answers"));
  CATS.forEach((c) => { questions(c.id).forEach((q: any) => {
    if (!q.key) return;
    h += row(esc(q.key), (l) => {
      const s = st(l, q.id), n = note(l, q.id);
      if (q.id === "z1") { const tt = timesOf(l), parts: string[] = []; if (typeof tt.out === "number") parts.push(t("outdoors {time}", { time: tLabel(tt.out) })); if (typeof tt.in === "number") parts.push(t("indoors {time}", { time: tLabel(tt.in) }));
        if (parts.length) return "<b>" + esc(parts.join(" · ")) + "</b>" + (n ? '<div class="hint" style="margin-top:4px">' + esc(n) + "</div>" : ""); }
      if (q.id === "d2") { const vs = vendorsOf(l); if (vs.length) return '<div class="chips">' + vs.map((x: string) => '<span class="dchip ro">' + esc(x) + "</span>").join("") + "</div>" + (n ? '<div class="hint" style="margin-top:4px">' + esc(n) + "</div>" : ""); }
      if (q.id === "v1") { const ds = allDatesOf(l), cy = contOf(l); if (ds.length) return '<div class="chips">' + ds.map((x: string) => { const y2 = cy.indexOf(x) >= 0; return '<span class="dchip ro ' + (y2 ? "y" : "g") + '" title="' + (y2 ? t("several couples interested") : t("available")) + '">' + esc(fmtD(x)) + "</span>"; }).join("") + "</div>" + (n ? '<div class="hint" style="margin-top:4px">' + esc(n) + "</div>" : ""); }
      const ic = s === "ok" ? '<span class="cell-ok">✓</span> ' : s === "issue" ? '<span class="cell-issue">!</span> ' : s === "todo" ? '<span class="cell-todo">?</span> ' : "";
      return (ic || n) ? ic + dash(n) : dash("");
    });
  }); });
  h += grp(t("Progress by area"));
  CATS.forEach((c) => { const list = questions(c.id);
    h += row(esc(t(c.t)), (l) => { const s = stats(l, list); return (s.ok + s.issue) + " / " + s.total + (s.issue ? ' · <span class="cell-issue">' + s.issue + " ⚠</span>" : ""); });
  });
  h += "</tbody></table></div>";

  if (!state.archived.z1) {
    const withT = L.filter((l: any) => { const tt = timesOf(l); return typeof tt.out === "number" || typeof tt.in === "number"; });
    h += '<h3 class="sec">' + t("Curfews compared") + "</h3>";
    if (!withT.length) h += '<p class="hint">' + t("No times entered yet. Set them in the checklist under “Curfew” with the sliders.") + "</p>";
    else {
      const ticks = [0, 4, 8, 12, 16, 20];
      const track = (inner: string) => '<div class="tbars"><div class="ttrack">' + ticks.map((i) => '<i class="gl" style="left:' + (i / TSTEPS * 100) + '%"></i>').join("") + inner + "</div></div>";
      h += '<div class="card tchart"><div class="tlegend"><span><i style="background:var(--s-out)"></i>' + t("Music outdoors") + '</span><span><i style="background:var(--s-in)"></i>' + t("Party indoors") + "</span><span>" + esc(t("Axis {from} to {to}", { from: tLabel(0), to: tLabel(TSTEPS) })) + "</span></div>";
      h += '<div class="trow axis"><span></span><div class="tbars"><div class="tscale">' + [0, 8, 16].map((i) => '<span style="left:' + (i / TSTEPS * 100) + '%">' + esc(tLabel(i)) + "</span>").join("") + "</div></div></div>";
      withT.slice().sort((a: any, b: any) => { const ta = timesOf(a), tb = timesOf(b); return Math.max(tb.out || 0, tb.in || 0) - Math.max(ta.out || 0, ta.in || 0); }).forEach((l: any) => {
        const tt = timesOf(l);
        const bar = (k: string, lbl: string) => { const v = tt[k]; if (typeof v !== "number") return '<div class="tbar empty"><span>' + esc(lbl) + ": " + t("open") + "</span></div>";
          return '<div class="tbar ' + k + '" style="width:' + (v / TSTEPS * 100) + '%" title="' + esc(l.name + " · " + lbl + " " + tLabel(v)) + '"><span>' + esc(tLabel(v)) + "</span></div>"; };
        h += '<div class="trow"><span class="tname" title="' + esc(lfull(l)) + '">' + esc(lname(l)) + "</span>" + track(bar("out", t("outdoors")) + bar("in", t("indoors"))) + "</div>";
      });
      h += "</div>";
      const missing = L.length - withT.length; if (missing) h += '<p class="hint">' + esc(tp("Without times: {n} venue.", "Without times: {n} venues.", missing)) + "</p>";
    }
  }
  const dm: Record<string, string[]> = {};
  L.forEach((l: any) => { const cy = contOf(l); allDatesOf(l).forEach((d: string) => { (dm[d] = dm[d] || []).push(cy.indexOf(d) >= 0 ? '<span class="yl" title="' + t("several couples interested") + '">' + esc(lname(l)) + " (" + t("several couples interested") + ")</span>" : esc(lname(l))); }); });
  const dk = Object.keys(dm).sort();
  h += '<h3 class="sec">' + t("Available dates") + "</h3>";
  h += dk.length ? '<div class="tbl-wrap dates-list">' + dk.map((d) => '<div class="dr"><span class="dd">' + esc(fmtD(d)) + '</span><span class="dn">' + dm[d].join(", ") + '</span><span class="dc">' + esc(tp("{n} venue", "{n} venues", dm[d].length)) + "</span></div>").join("") + "</div>"
    : '<p class="hint">' + t("No dates entered yet. Mark them in the checklist under “Available dates”.") + "</p>";
  h += '<h3 class="sec">' + t("Open problems and points to clarify") + '</h3><div class="issues">';
  const qs = allQ();
  L.forEach((l: any) => {
    const items = qs.filter((q: any) => st(l, q.id) === "issue"), todos = qs.filter((q: any) => st(l, q.id) === "todo");
    const li = (q: any) => "<li>" + esc(q.t) + (note(l, q.id) ? "<small>" + esc(note(l, q.id)) + "</small>" : "") + "</li>";
    h += '<div class="card"><h4>' + badge(l) + (l.rank ? " " : "") + esc(lfull(l)) + "</h4>";
    h += items.length ? "<ul>" + items.map(li).join("") + "</ul>" : '<p class="hint">' + t("No problems marked.") + "</p>";
    if (todos.length) h += '<p class="hint" style="margin:10px 0 0"><span class="cell-todo">?</span> ' + t("To clarify") + "</p><ul>" + todos.map(li).join("") + "</ul>";
    h += "</div>";
  });
  return h + "</div>";
}

export function renderArch() {
  const AL = archivedLocs(); let hl = '<h3 class="sub-sec">' + t("Archived venues") + "</h3>";
  if (!AL.length) hl += '<p class="hint">' + t("No archived venues. In the checklist, “Archive venue” moves a venue here. All answers are kept.") + "</p>";
  else { hl += '<div class="arch" style="margin-bottom:24px">'; AL.forEach((l: any) => { const s2 = stats(l);
    hl += '<div class="card arch-loc" data-act="peek" data-id="' + l.id + '" role="button" tabindex="0" title="' + t("View details") + '">' + (l.photo ? '<img src="' + img(l.photo) + '" alt="">' : "") + '<div class="al-body"><div class="arch-meta">' + esc(t("archived on {date}", { date: fmtDate(l.archived.at) })) + '</div><p class="arch-q">' + esc(lfull(l)) + "</p>" +
      (l.archived.reason ? '<p style="margin:4px 0 0">' + esc(t("Reason: {r}", { r: l.archived.reason })) + "</p>" : "") +
      '<p class="hint" style="margin:4px 0 0">' + esc(t("{pct}% done · {issues} problems · {todo} to clarify", { pct: s2.pct, issues: s2.issue, todo: s2.todo })) + "</p></div>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost" data-act="peek" data-id="' + l.id + '">' + t("View details") + '</button><button class="btn" data-act="locrestore" data-id="' + l.id + '">' + t("Reactivate") + "</button></div></div>"; });
    hl += "</div>"; }
  return hl + '<h3 class="sub-sec">' + t("Archived questions") + "</h3>" + renderArchQ();
}
function renderArchQ() {
  const list = archivedQ(), P = PRIO();
  if (!list.length) return '<div class="card"><p style="margin-top:0"><b>' + t("No archived questions yet.") + '</b></p><p class="hint" style="margin-bottom:0">' + t("When you archive a question, it disappears from all venues and lands here together with the answers already entered. You can restore it at any time.") + "</p></div>";
  let h = '<p class="hint">' + t("Archived questions don’t count towards progress and don’t appear in the comparison. When restored, all answers are back.") + '</p><div class="arch">';
  list.forEach((q: any) => {
    const who = answeredBy(q.id);
    h += '<div class="card"><div class="arch-head"><div><div class="arch-meta">' + esc(t(q.cat.t)) + " · " + esc(t("archived on {date}", { date: fmtDate(state.archived[q.id].at) })) + "</div>" +
      '<p class="arch-q">' + esc(q.t) + '<span class="prio p-' + q.p + '">' + P[q.p] + "</span></p></div>" +
      '<button class="btn" data-act="restq" data-q="' + q.id + '">' + t("Restore") + "</button></div>";
    h += who.length ? "<ul>" + who.map((l: any) => { const a = l.answers[q.id]; const ic = a.s === "ok" ? '<span class="cell-ok">✓</span> ' : a.s === "issue" ? '<span class="cell-issue">!</span> ' : a.s === "todo" ? '<span class="cell-todo">?</span> ' : "";
      return "<li><b>" + esc(l.name || t("Unnamed")) + ":</b> " + ic + (a.dates && a.dates.length ? esc(a.dates.map(fmtD).join(", ")) + (a.n ? " · " : "") : "") + (a.contested && a.contested.length ? esc(" " + t("yellow") + ": " + a.contested.map(fmtD).join(", ")) + " " : "") + (a.vendors && a.vendors.length ? esc(a.vendors.join(", ")) + " · " : "") + (a.times && Object.keys(a.times).length ? esc(Object.keys(a.times).map((k) => (k === "out" ? t("outdoors") + " " : t("indoors") + " ") + tLabel(a.times[k])).join(", ")) + " " : "") + esc(a.n || "") + "</li>"; }).join("") + "</ul>" : '<p class="hint" style="margin:8px 0 0">' + t("No answers entered.") + "</p>";
    h += "</div>";
  });
  return h + "</div>";
}

export function renderModal() {
  const m = ui.modal; if (!m) return "";
  if (m.kind === "limit") {
    return '<div class="modal-bg" data-act="modalno"></div><div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title"><h3 id="m-title">' + t("Free version limit") + "</h3><p>" + esc(m.text) + "</p><p class=\"hint\">" + t("Unlocking Perfect Match removes all limits for this wedding with a one-time purchase.") + '</p><div class="m-actions"><button class="btn primary" data-act="modalno">' + t("OK") + "</button></div></div>";
  }
  if (m.kind === "locarch") { const al = state.locations.filter((x: any) => x.id === m.lid)[0]; if (!al) return "";
    return '<div class="modal-bg" data-act="modalno"></div><div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title"><h3 id="m-title">' + t("Archive venue?") + '</h3><p class="quote">' + esc(lfull(al)) + "</p>" +
      "<p>" + (al.rank ? t("It disappears from the checklist and the comparison and loses its top-3 place. All answers, dates and photos are kept. You can reactivate it any time under “Archive”.") : t("It disappears from the checklist and the comparison. All answers, dates and photos are kept. You can reactivate it any time under “Archive”.")) + "</p>" +
      '<label class="hint" for="arch-reason">' + t("Reason (optional)") + '</label><input id="arch-reason" class="reason" placeholder="' + esc(t("e.g. too expensive, no accommodation")) + '">' +
      '<div class="m-actions"><button class="btn ghost" data-act="modalno">' + t("Cancel") + '</button><button class="btn warn" data-act="modalok">' + t("Archive") + "</button></div></div>"; }
  const q = findQ(m.qid); if (!q) return "";
  const n = state.locations.length, k = answeredBy(q.id).length, P = PRIO(); let h: string;
  if (m.kind === "archive") {
    h = '<h3 id="m-title">' + t("Archive question?") + '</h3><p class="quote">' + esc(q.t) + "</p>" +
      "<p>" + esc(tp("The question disappears from {n} venue.", "The question disappears from all {n} venues.", n)) + " " + esc(k ? tp("The answers of {n} venue are kept in the archive.", "The answers of {n} venues are kept in the archive.", k) : t("You will find it in the archive.")) + " " + t("You can restore it at any time.") + "</p>" +
      '<div class="m-actions"><button class="btn ghost" data-act="modalno">' + t("Cancel") + '</button><button class="btn warn" data-act="modalok">' + t("Archive") + "</button></div>";
  } else {
    const same = m.t === q.t;
    h = '<h3 id="m-title">' + t("Change question?") + "</h3>" + (same ? "" : '<p class="quote old">' + esc(q.t) + "</p>") + '<p class="quote">' + esc(m.t) + "</p>" +
      (m.p !== q.p ? "<p>" + t("Priority") + ": " + P[q.p] + " → <b>" + P[m.p] + "</b></p>" : "") +
      "<p>" + esc(tp("The change applies to {n} venue.", "The change applies to all {n} venues.", n)) + (k ? " " + esc(t("Existing answers ({n}) stay unchanged.", { n: k })) : "") + "</p>" +
      '<div class="m-actions"><button class="btn ghost" data-act="modalno">' + t("Cancel") + '</button><button class="btn primary" data-act="modalok">' + t("Save change") + "</button></div>";
  }
  return '<div class="modal-bg" data-act="modalno"></div><div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">' + h + "</div>";
}

// ---------------------------------------------------------------- planning
export function planSumHtml(loc: any) {
  const S = planStats(loc);
  return '<div class="ps-calc"><div><span class="lbl">' + t("Net") + "</span><b>" + fmtMoney(S.tot) + '</b></div><span class="op">+</span><div><span class="lbl">' + t("VAT") + "</span><b>" + fmtMoney(S.vat) + '</b></div><span class="op">−</span>' +
    '<div><span class="lbl"><label for="pdisc">' + t("Discount %") + '</label></span><span class="drow"><input id="pdisc" data-pdisc="1" inputmode="decimal" value="' + esc(loc.planDiscount || "") + '" placeholder="0"><small>' + (S.disc ? "−" + fmtMoney(S.disc) : "") + '</small></span></div><span class="op">=</span>' +
    '<div class="tot"><span class="lbl">' + t("Total") + '</span><span class="big">' + fmtMoney(S.total) + "</span></div></div>" +
    '<div class="plan-sum" style="margin-top:12px"><div><span class="lbl">' + t("With price") + "</span><b>" + S.priced + '</b></div><div><span class="lbl">' + t("Included") + "</span><b>" + S.inc + '</b></div><div><span class="lbl">' + t("To clarify") + '</span><b style="color:var(--pend-line)">' + S.todo + '</b></div><div><span class="lbl">' + t("Open") + "</span><b>" + S.open + "</b></div>" +
    (loc.price ? '<div><span class="lbl">' + t("Venue quote (checklist)") + "</span>" + esc(loc.price) + "</div>" : "") + "</div>";
}
function svcCard(loc: any, x: any, g: any) {
  const it = pGet(loc, x.id), m = parseMoney(it.p), stt = svcState(loc, x), gcov = grpCovered(g), nm = svcName(x);
  const pill = it.todo ? '<span class="pill todo">' + t("to clarify") + "</span>" : it.inc ? '<span class="pill inc">' + t("included") + "</span>" : (m !== null && gcov) ? '<span class="pill" title="' + t("Included in the package price, not counted separately") + '">' + fmtMoney(m) + " · " + t("in package") + "</span>" : m !== null ? '<span class="pill pr">' + fmtMoney(m) + "</span>" : gcov ? '<span class="pill inc">' + t("in package") + "</span>" : "";
  const G = pGroups(loc);
  return '<div class="svc' + (stt ? " " + stt : "") + '" data-svc="' + x.id + '"><div class="svc-h"><h3>' + esc(nm) + "</h3>" + pill +
    '<button class="tick todo svq" data-act="svctodo" data-s="' + x.id + '" aria-pressed="' + (!!it.todo) + '" title="' + t("To clarify") + '">?</button>' +
    '<button class="icon" data-act="svchide" data-s="' + x.id + '" title="' + t("Hide service (for all venues, data is kept)") + '" aria-label="' + t("Hide service") + '">' + ICON_ARCH + "</button></div>" +
    (g ? '<p class="hint" style="margin:0">' + esc(t("Supplier: {v}", { v: g.v || t("as package") })) + "</p>" : '<input data-plan="' + x.id + '" data-pk="v" value="' + esc(it.v) + '" placeholder="' + t("Supplier") + '" aria-label="' + esc(t("Supplier") + " " + nm) + '">') +
    '<div class="prow"><input data-plan="' + x.id + '" data-pk="p" value="' + esc(it.p) + '" placeholder="' + esc(g && gcov ? t("included in package price") : t("Price, e.g. 2,400")) + '" inputmode="decimal" aria-label="' + esc(t("Price") + " " + nm) + '"' + (it.inc ? " disabled" : "") + ">" +
    '<span class="vat"><input data-plan="' + x.id + '" data-pk="vat" value="' + esc(it.vat == null ? "" : it.vat) + '" placeholder="' + VATDEF() + '" inputmode="decimal" aria-label="' + esc(t("VAT in percent") + " " + nm) + '"' + (it.inc ? " disabled" : "") + ">%</span>" +
    '<label><input type="checkbox" data-pinc="' + x.id + '"' + (it.inc ? " checked" : "") + "> " + t("incl.") + "</label></div>" +
    (m !== null && !it.inc && !gcov ? '<small class="gross" data-gross="' + x.id + '">' + esc(t("gross {amount}", { amount: fmtMoney(m * (1 + vatOf(it) / 100)) })) + "</small>" : '<small class="gross" data-gross="' + x.id + '"></small>') +
    '<input data-plan="' + x.id + '" data-pk="n" value="' + esc(it.n) + '" placeholder="' + t("Details, note") + '" aria-label="' + esc(t("Note") + " " + nm) + '">' +
    '<div class="fchips">' + (it.files || []).map((f: any) => { const cf = ui.fdel === x.id + ":" + f.id;
      return cf ? '<span class="fchip conf"><button data-act="fdel" data-s="' + x.id + '" data-f="' + f.id + '">' + t("Delete?") + '</button><button class="x" data-act="fdelno">' + t("No") + "</button></span>"
        : '<span class="fchip"><button data-act="fopen" data-s="' + x.id + '" data-f="' + f.id + '" title="' + esc(f.name) + '">' + (f.type === "application/pdf" ? "📄 " : "🖼 ") + esc(f.name) + '</button><button class="x" data-act="fdelask" data-s="' + x.id + '" data-f="' + f.id + '" aria-label="' + t("Delete file") + '">×</button></span>'; }).join("") +
    '<label class="fadd" for="pf-' + x.id + '">+ ' + t("PDF / image") + '</label><input type="file" id="pf-' + x.id + '" class="file-hidden" accept="image/*,application/pdf" multiple data-pfile="' + x.id + '"></div>' +
    '<label class="grpsel"><span>' + t("Package") + '</span><select data-pgrp="' + x.id + '" aria-label="' + esc(t("Package for {name}", { name: nm })) + '"><option value="">– ' + t("no package") + " –</option>" + G.map((gg: any) => '<option value="' + gg.id + '"' + (g && g.id === gg.id ? " selected" : "") + ">" + esc(gg.name || t("Package")) + "</option>").join("") + '<option value="__new">+ ' + t("New package …") + "</option></select></label></div>";
}
export function renderPlan() {
  const loc = cur(); let h = locChips();
  if (!loc) return h + '<div class="card"><p>' + t("No active venue.") + "</p></div>";
  const G = pGroups(loc), SV = planSvcs();
  h += '<section class="card"><div class="loc-head" style="margin-bottom:10px"><span class="nk">' + esc(lname(loc)) + "</span>" + (loc.nick ? '<span class="nm">' + esc(loc.name) + "</span>" : "") + "</div>" +
    '<div id="plan-sum">' + planSumHtml(loc) + "</div>" +
    '<p class="hint" style="margin:10px 0 0">' + esc(t("Green = price or “included” entered, yellow = still to clarify (“?” button). Enter prices net; VAT (default {vat} %) is added per service. Services from the same supplier can be combined below with “Package”; the package price then counts once for all.", { vat: VATDEF() })) + "</p></section>";
  if (ui.planMsg) h += '<p class="vis-msg' + (ui.planErr ? " err" : "") + '" id="plan-msg">' + esc(ui.planMsg) + "</p>";
  G.forEach((g: any) => { const mem = SV.filter((x: any) => (g.svc || []).indexOf(x.id) >= 0), gs = grpState(g);
    h += '<section class="pgrp' + (gs ? " " + gs : "") + '" data-pgid="' + g.id + '"><div class="pg-h"><input class="pg-name" data-pg="' + g.id + '" data-pgk="name" value="' + esc(g.name) + '" placeholder="' + esc(t("Package name, e.g. catering package")) + '" aria-label="' + t("Package name") + '">' +
      '<button class="tick todo svq" data-act="pgtodo" data-g="' + g.id + '" aria-pressed="' + (!!g.todo) + '" title="' + t("To clarify") + '">?</button>' +
      (ui.pgDel === g.id ? '<span class="confirm"><span>' + t("Dissolve package? The services stay.") + '</span><button class="btn danger" data-act="pgdel" data-g="' + g.id + '">' + t("Dissolve") + '</button><button class="btn ghost" data-act="pgdelno">' + t("Cancel") + "</button></span>" : '<button class="btn ghost" data-act="pgdelask" data-g="' + g.id + '">' + t("Dissolve package") + "</button>") + "</div>" +
      '<div class="pg-f"><input data-pg="' + g.id + '" data-pgk="v" value="' + esc(g.v) + '" placeholder="' + t("Supplier for all") + '" aria-label="' + t("Package supplier") + '">' +
      '<input data-pg="' + g.id + '" data-pgk="p" value="' + esc(g.p) + '" placeholder="' + t("Package price") + '" inputmode="decimal" aria-label="' + t("Package price") + '"' + (g.inc ? " disabled" : "") + ">" +
      '<span class="vat"><input data-pg="' + g.id + '" data-pgk="vat" value="' + esc(g.vat == null ? "" : g.vat) + '" placeholder="' + VATDEF() + '" inputmode="decimal" aria-label="' + t("Package VAT in percent") + '"' + (g.inc ? " disabled" : "") + ">% " + t("VAT") + "</span>" +
      '<label><input type="checkbox" data-pginc="' + g.id + '"' + (g.inc ? " checked" : "") + "> " + t("included") + "</label>" + (parseMoney(g.p) !== null && !g.inc ? '<span class="pill pr">' + fmtMoney(parseMoney(g.p) as number) + "</span>" : "") + "</div>" +
      '<div class="plan-grid">' + (mem.length ? mem.map((x: any) => svcCard(loc, x, g)).join("") : '<p class="hint">' + t("No services in this package yet. Choose this package under “Package” on a service.") + "</p>") + "</div></section>"; });
  h += '<div class="plan-grid">';
  SV.forEach((x: any) => { if (!grpOf(loc, x.id)) h += svcCard(loc, x, null); });
  h += '</div><div class="addsvc"><input id="add-svc" placeholder="' + esc(t("Add another service (applies to all venues)")) + '"><button class="btn" data-act="svcadd">' + t("Add") + '</button><button class="btn ghost" data-act="pgnew">+ ' + t("Empty package") + "</button></div>";
  const hid = planSvcs(true).filter((x: any) => state.planHide[x.id]);
  if (hid.length) h += '<div class="svc-hidden"><p class="hint">' + t("Hidden services (data is kept):") + '</p><div class="chips">' + hid.map((x: any) => '<button class="btn ghost" data-act="svcshow" data-s="' + x.id + '">' + esc(t("Show {name}", { name: svcName(x) })) + "</button>").join("") + "</div></div>";
  return h;
}
export function planLiveState() {
  const loc = cur(); if (!loc) return;
  const ps = document.getElementById("plan-sum");
  if (ps) { const fa = document.activeElement as HTMLInputElement | null, fid = fa && fa.id, pos = fa && fa.selectionStart; ps.innerHTML = planSumHtml(loc); if (fid === "pdisc") { const f2 = document.getElementById("pdisc") as HTMLInputElement | null; if (f2) { f2.focus(); try { f2.setSelectionRange(pos, pos); } catch { /* */ } } } }
  document.querySelectorAll("[data-gross]").forEach((el) => { const sid = el.getAttribute("data-gross") as string, it = pGet(loc, sid), m = parseMoney(it.p), g = grpOf(loc, sid); el.textContent = (m !== null && !it.inc && !grpCovered(g)) ? t("gross {amount}", { amount: fmtMoney(m * (1 + vatOf(it) / 100)) }) : ""; });
  document.querySelectorAll(".svc[data-svc]").forEach((el) => { const sid = el.getAttribute("data-svc") as string, st2 = svcState(loc, { id: sid }); el.classList.toggle("todo", st2 === "todo"); el.classList.toggle("done", st2 === "done"); });
  document.querySelectorAll(".pgrp[data-pgid]").forEach((el) => { const g = pGroups(loc).filter((z: any) => z.id === el.getAttribute("data-pgid"))[0]; if (!g) return; const st3 = grpState(g); el.classList.toggle("todo", st3 === "todo"); el.classList.toggle("done", st3 === "done"); });
}

// ---------------------------------------------------------------- gallery & documents
export function galLoc() { if (!ui.gal) return null; return state.locations.filter((x: any) => x.id === ui.gal.lid)[0] || null; }
export function renderGal() {
  const l = galLoc(); if (!l) { ui.gal = null; return ""; }
  const P = vp(l), n = P.length, g = ui.gal; if (g.i >= n) g.i = n - 1; if (g.i < 0) g.i = 0;
  let h = '<div class="gal" role="dialog" aria-modal="true" aria-label="' + esc(t("Visit photos {name}", { name: lname(l) })) + '">' +
    '<div class="gal-top"><span class="gt"><b>' + esc(lname(l)) + "</b></span>" + (n ? '<span class="gc">' + (g.i + 1) + " / " + n + "</span>" : "") + '<button class="gal-btn" data-act="galclose" aria-label="' + t("Close") + '">×</button></div>';
  if (!n) return h + '<div class="gal-stage"><div class="gal-empty">' + t("No visit photos yet.") + '<br><br><label class="gb" style="display:inline-block;background:rgba(255,255,255,.12);padding:8px 14px;border-radius:8px;cursor:pointer" for="vph-in2">+ ' + t("Add photos") + '</label><input type="file" accept="image/*" multiple id="vph-in2" class="file-hidden" data-vph="1"></div></div></div>';
  const p = P[g.i];
  h += '<div class="gal-stage" id="gal-stage">' + (n > 1 ? '<button class="gal-btn gal-nav prev" data-act="galprev" aria-label="' + t("Previous photo") + '">‹</button>' : "") +
    '<img src="' + img(p.f) + '" alt="' + esc(t("Visit photo {i} of {n}", { i: g.i + 1, n })) + '">' +
    (n > 1 ? '<button class="gal-btn gal-nav next" data-act="galnext" aria-label="' + t("Next photo") + '">›</button>' : "") + "</div>";
  h += '<div class="gal-bot">' + (g.confirm ? "<span>" + t("Delete this photo?") + '</span><button class="gb del" data-act="galdel">' + t("Delete") + '</button><button class="gb" data-act="galdelno">' + t("Cancel") + "</button>"
    : (g.msg ? '<span class="gd" style="flex-basis:100%;text-align:center;opacity:1;color:#ffcf7a">' + esc(g.msg) + "</span>" : "") + '<span class="gd">' + esc(t("uploaded on {date}", { date: fmtTS(p.at) })) + "</span>" + (n < VPMAX ? '<label class="gb" for="vph-in2">+ ' + t("Photos") + '</label><input type="file" accept="image/*" multiple id="vph-in2" class="file-hidden" data-vph="1">' : "") + '<button class="gb" data-act="galdelask">' + t("Delete photo") + "</button>") + "</div></div>";
  return h;
}
export function renderDoc() {
  const l = cur(); if (!ui.doc || !l) { ui.doc = null; return ""; } const f = findPF(l, ui.doc.s, ui.doc.f); if (!f) { ui.doc = null; return ""; }
  const u = fileUrl(wid(), f.f), pdf = f.type === "application/pdf";
  return '<div class="gal" role="dialog" aria-modal="true" aria-label="' + esc(f.name) + '"><div class="gal-top"><span class="gt"><b>' + esc(f.name) + "</b></span>" +
    '<button class="gal-btn" style="width:auto;padding:0 14px;font-size:14px" data-act="docdl">' + t("Download") + "</button>" +
    '<button class="gal-btn" data-act="docclose" aria-label="' + t("Close") + '">×</button></div>' +
    '<div class="gal-stage">' + (pdf ? '<div id="pdfv" class="pdfv" data-p="' + esc(f.f) + '"><p class="gal-empty">' + t("Loading PDF…") + "</p></div>" : '<img src="' + esc(u) + '" alt="' + esc(f.name) + '">') + "</div>" +
    '<div class="gal-bot"><span class="gd">' + (f.size ? esc((f.size / 1048576).toFixed(1)) + " MB · " : "") + esc(t("uploaded on {date}", { date: fmtTS(f.at) })) + "</span></div></div>";
}
