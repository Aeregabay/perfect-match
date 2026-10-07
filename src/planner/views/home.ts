// Overview: key figures, quick access, guest charts, people per day, open points, top venues.
import { t, tp, esc, DAYS, SIDE, MENUS, CAP, settings, W } from "../ctx";
import { guests, gHeads, gDaySet, dayIx, tasks, seatPeople, seat, activeLocs, stats, badge, lname, agenda, sleepLbl } from "../data";
import { img } from "./common";

const PALETTE = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)"];

function donut(title: string, segs: { l: string; v: number; c: string; f: string }[], fkey: string) {
  const tot = segs.reduce((a, x) => a + x.v, 0), R = 46, r = 30, cx = 52, cy = 52; let a0 = -Math.PI / 2, paths = "";
  if (!tot) paths = '<circle cx="52" cy="52" r="38" fill="none" stroke="var(--c0)" stroke-width="16"/>';
  else segs.forEach((x) => {
    if (!x.v) return;
    if (x.v === tot) { paths += '<circle cx="52" cy="52" r="38" fill="none" stroke="' + x.c + '" stroke-width="16" data-act="gofilt" data-k="' + fkey + '" data-v="' + x.f + '" style="cursor:pointer"><title>' + esc(x.l) + ": " + x.v + " (100%)</title></circle>"; return; }
    const a1 = a0 + x.v / tot * 2 * Math.PI;
    const la = (a1 - a0) > Math.PI ? 1 : 0, p = (rr: number, a: number) => (cx + rr * Math.cos(a)).toFixed(2) + " " + (cy + rr * Math.sin(a)).toFixed(2);
    paths += '<path d="M' + p(R, a0) + " A" + R + " " + R + " 0 " + la + " 1 " + p(R, a1) + " L" + p(r, a1) + " A" + r + " " + r + " 0 " + la + " 0 " + p(r, a0) + 'Z" fill="' + x.c + '" stroke="var(--surface)" stroke-width="2" data-act="gofilt" data-k="' + fkey + '" data-v="' + x.f + '"><title>' + esc(x.l) + ": " + x.v + " (" + Math.round(x.v / tot * 100) + "%)</title></path>"; a0 = a1;
  });
  return '<div class="dn"><h4>' + esc(title) + '</h4><div class="dn-b"><svg viewBox="0 0 104 104" role="img" aria-label="' + esc(title) + '">' + paths + '<text x="52" y="57" text-anchor="middle" font-size="17" font-weight="700" fill="var(--ink)">' + tot + '</text></svg><div class="lg">' +
    segs.map((x) => '<button data-act="gofilt" data-k="' + fkey + '" data-v="' + x.f + '"><i style="background:' + x.c + '"></i><span>' + esc(x.l) + "</span><em>" + x.v + "<small>" + (tot ? Math.round(x.v / tot * 100) : 0) + "%</small></em></button>").join("") + "</div></div></div>";
}

export function renderHome() {
  const G = guests(), D = DAYS(), SD = SIDE(), M = MENUS();
  const P: any = { sry: 0, srn: 0, sro: 0, srWait: 0, heads: 0, yes: 0, no: 0, open: 0, p1: 0, p2: 0, menu: {}, onsite: 0, other: 0, sopen: 0, sent: 0, unsent: 0, dd: D.map(() => 0), dopen: 0, noname: 0, stdP: 0, stdD: 0, stdNo: 0 };
  G.forEach((g: any) => {
    const hd = gHeads(g); P.heads += hd; if (g.rsvp === "yes") P.yes += hd; else if (g.rsvp === "no") P.no += hd; else P.open += hd;
    if (g.plusOn && !(g.plus && g.plus.fn)) P.noname++;
    if (g.sent) P.sent++; else P.unsent++;
    if (g.stdSent) { if (g.stdType === "physical") P.stdP++; else P.stdD++; } else P.stdNo++;
    if (g.stdResp === "yes") P.sry += hd; else if (g.stdResp === "no") P.srn += hd; else { P.sro += hd; if (g.stdSent) P.srWait++; }
    if (g.rsvp === "no") return;
    P[g.side === "p2" ? "p2" : "p1"] += hd;
    P.menu[g.menu] = (P.menu[g.menu] || 0) + 1; if (g.plusOn) { const pm = (g.plus && g.plus.menu) || M[0].id; P.menu[pm] = (P.menu[pm] || 0) + 1; }
    if (g.sleep === "onsite") P.onsite += hd; else if (g.sleep) P.other += hd; else P.sopen += hd;
    const ds = gDaySet(g); if (ds.length) ds.forEach((k) => { const i = dayIx(k); if (i >= 0) P.dd[i] += hd; }); else P.dopen += hd;
  });
  const T = tasks(), tc: any = { todo: 0, doing: 0, done: 0 }; T.forEach((x: any) => { tc[x.col || "todo"]++; });
  const SP = seatPeople(), S = seat(), placed = SP.filter((x) => S.assign[x.pid]).length;
  const A = activeLocs(), top = A.filter((l: any) => l.rank).sort((a: any, b: any) => a.rank - b.rank);
  const cap = CAP();
  let h = '<div class="hm-hero">' +
    '<button class="kpi" data-act="tab" data-v="guests"><span class="lbl">' + t("People invited") + '</span><span class="big">' + P.heads + " <small>/ " + cap + '</small></span><span class="sub2">' + esc(tp("{n} invitation", "{n} invitations", G.length) + " · " + (cap - P.heads >= 0 ? tp("{n} seat free", "{n} seats free", cap - P.heads) : t("{n} over capacity", { n: P.heads - cap }))) + "</span>" +
      '<span class="kbar"><i style="width:' + Math.min(100, P.yes / cap * 100) + '%;background:var(--c1)"></i><i style="width:' + Math.min(100, P.open / cap * 100) + '%;background:var(--c0)"></i></span></button>' +
    '<button class="kpi" data-act="gofilt" data-k="stdr" data-v="yes"><span class="lbl">' + t("Save the date positive") + '</span><span class="big">' + P.sry + " <small>/ " + P.heads + '</small></span><span class="sub2">' + esc(t("{no} negative · {open} open", { no: P.srn, open: P.sro })) + "</span>" +
      (P.heads ? '<span class="kbar"><i style="width:' + (P.sry / P.heads * 100) + '%;background:var(--c1)"></i><i style="width:' + (P.srn / P.heads * 100) + '%;background:var(--c2)"></i></span>' : "") + "</button>" +
    '<button class="kpi" data-act="gofilt" data-k="rsvp" data-v="yes"><span class="lbl">' + t("RSVP accepted") + '</span><span class="big">' + P.yes + " <small>/ " + P.heads + '</small></span><span class="sub2">' + esc(t("{no} declined · {open} open", { no: P.no, open: P.open })) + "</span>" +
      (P.heads ? '<span class="kbar"><i style="width:' + (P.yes / P.heads * 100) + '%;background:var(--c1)"></i><i style="width:' + (P.no / P.heads * 100) + '%;background:var(--c2)"></i></span>' : "") + "</button>" +
    '<button class="kpi" data-act="tab" data-v="tasks"><span class="lbl">' + t("Tasks done") + '</span><span class="big">' + tc.done + " <small>/ " + T.length + '</small></span><span class="sub2">' + esc(t("{doing} ongoing · {todo} to-do", { doing: tc.doing, todo: tc.todo })) + "</span>" +
      (T.length ? '<span class="kbar"><i style="width:' + (tc.done / T.length * 100) + '%;background:var(--c1)"></i><i style="width:' + (tc.doing / T.length * 100) + '%;background:var(--c2)"></i></span>' : "") + "</button>" +
    '<button class="kpi" data-act="tab" data-v="seat"><span class="lbl">' + t("Seating plan") + '</span><span class="big">' + placed + " <small>/ " + SP.length + '</small></span><span class="sub2">' + esc(t("people seated") + " · " + tp("{n} table", "{n} tables", S.tables.length)) + "</span>" +
      (SP.length ? '<span class="kbar"><i style="width:' + (placed / SP.length * 100) + '%;background:var(--c1)"></i></span>' : "") + "</button></div>";
  const qb = (act: string, v: string, title: string, sub: string, cls?: string) => '<button class="ql' + (cls ? " " + cls : "") + '" data-act="' + act + '" data-v="' + v + '"><b>' + esc(title) + "</b><small>" + esc(sub) + "</small></button>";
  const AG = agenda().length, site = settings().website;
  h += '<h3 class="hm-sec">' + t("Quick access") + '</h3><div class="qgroups">' +
    '<section class="qg g-loc"><h4>' + t("Venues") + '</h4><div class="qlinks">' + qb("tab", "cmp", t("Comparison"), tp("{n} active venue", "{n} active venues", A.length)) + qb("tab", "check", t("Checklist"), t("Questions per venue")) + qb("tab", "plan", t("Detailed planning"), t("Suppliers & prices")) + "</div></section>" +
    '<section class="qg g-guest"><h4>' + t("Guests & celebration") + '</h4><div class="qlinks">' + qb("tab", "guests", t("Guest list"), tp("{n} invitation", "{n} invitations", G.length)) + qb("tab", "seat", t("Seating plan"), tp("{n} table", "{n} tables", S.tables.length)) + qb("tab", "agenda", t("Schedule"), tp("{n} item", "{n} items", AG)) + qb("homeadd", "guest", "+ " + t("Invite guest"), t("New invitation"), "add") + "</div></section>" +
    '<section class="qg g-org"><h4>' + (/^https:\/\//.test(site || "") ? t("Organisation & website") : t("Organisation")) + '</h4><div class="qlinks">' + qb("tab", "tasks", t("Tasks"), t("{n} open", { n: tc.todo + tc.doing })) + qb("homeadd", "task", "+ " + t("Task"), t("New ticket"), "add") +
      (/^https:\/\//.test(site || "") ? '<a class="ql web" href="' + esc(site) + '" target="_blank" rel="noopener noreferrer"><b>' + t("Website") + " ↗</b><small>" + t("Open your wedding website") + "</small></a>" : qb("tab", "settings", t("Settings"), t("Days, menus, partner"))) + "</div></section></div>";
  h += '<h3 class="hm-sec">' + t("Guests") + '</h3><div class="donuts">' +
    donut(t("Save-the-date answer · people"), [{ l: t("Positive"), v: P.sry, c: "var(--c1)", f: "yes" }, { l: t("Negative"), v: P.srn, c: "var(--c2)", f: "no" }, { l: t("Open"), v: P.sro, c: "var(--c0)", f: "open" }], "stdr") +
    donut(t("RSVP invitation · people"), [{ l: t("Accepted"), v: P.yes, c: "var(--c1)", f: "yes" }, { l: t("Declined"), v: P.no, c: "var(--c2)", f: "no" }, { l: t("Open"), v: P.open, c: "var(--c0)", f: "open" }], "rsvp") +
    donut(t("Side · people"), [{ l: SD.p1, v: P.p1, c: "var(--c1)", f: "p1" }, { l: SD.p2, v: P.p2, c: "var(--c2)", f: "p2" }], "side") +
    donut(t("Menu · adults"), M.map((m, i) => ({ l: m.name, v: P.menu[m.id] || 0, c: PALETTE[i % PALETTE.length], f: m.id })), "menu") +
    donut(t("Accommodation · people"), [{ l: sleepLbl("onsite"), v: P.onsite, c: "var(--c1)", f: "onsite" }, { l: t("Other accommodation"), v: P.other, c: "var(--c2)", f: "other" }, { l: t("Open"), v: P.sopen, c: "var(--c0)", f: "none" }], "sleep") +
    donut(t("Save the date · invitations"), [{ l: t("Digital"), v: P.stdD, c: "var(--c1)", f: "digital" }, { l: t("Printed"), v: P.stdP, c: "var(--c2)", f: "physical" }, { l: t("Not yet"), v: P.stdNo, c: "var(--c0)", f: "no" }], "std") +
    donut(t("Invitation · invitations"), [{ l: t("Sent"), v: P.sent, c: "var(--c1)", f: "yes" }, { l: t("Not yet"), v: P.unsent, c: "var(--c0)", f: "no" }], "sent") +
    "</div>";
  const mx = Math.max.apply(null, P.dd.concat([1]));
  h += '<div class="hm-cols">';
  if (D.length) h += '<div><h3 class="hm-sec">' + t("People per day") + '</h3><div class="dn"><div class="dbar" style="grid-template-columns:repeat(' + D.length + ',1fr)">' + D.map((x, i) => '<div title="' + esc(x[1] + " · " + x[3] + ": " + tp("{n} person", "{n} people", P.dd[i])) + '"><b>' + P.dd[i] + '</b><i style="height:' + (P.dd[i] / mx * 90) + '%"></i><span class="dl"><strong>' + esc(x[2]) + "</strong><em>" + esc(x[3]) + "</em></span></div>").join("") + "</div>" +
    '<p class="hint" style="margin:8px 0 0">' + esc(tp("{n} person without days yet", "{n} people without days yet", P.dopen) + " · " + t("without declines")) + "</p></div></div>";
  const todo: any[] = [];
  if (P.dopen && D.length) todo.push([P.dopen, t("People without days of attendance"), "gofilt", "day", "none"]);
  if (P.noname) todo.push([P.noname, t("Companions without first name"), "tab", "guests", ""]);
  if (P.srWait) todo.push([P.srWait, t("Save the dates without answer"), "gofilt", "stdr", "open"]);
  if (P.stdNo) todo.push([P.stdNo, t("Save the dates not sent yet"), "gofilt", "std", "no"]);
  if (P.unsent) todo.push([P.unsent, t("Invitations not sent yet"), "gofilt", "sent", "no"]);
  if (P.open) todo.push([P.open, t("People without RSVP"), "gofilt", "rsvp", "open"]);
  if (SP.length - placed) todo.push([SP.length - placed, t("People without a seat"), "tab", "seat", ""]);
  T.filter((x: any) => x.col === "doing").slice(0, 3).forEach((x: any) => { const it = x.items || []; todo.push([it.length ? it.filter((y: any) => y.done).length + "/" + it.length : "•", x.t || t("Untitled"), "topenh", x.id, ""]); });
  h += '<div><h3 class="hm-sec">' + t("Open points") + "</h3>" + (todo.length ? '<ul class="todo-l">' + todo.map((x) => '<li><button data-act="' + x[2] + '" ' + (x[2] === "gofilt" ? 'data-k="' + x[3] + '" data-v="' + x[4] + '"' : x[2] === "tab" ? 'data-v="' + x[3] + '"' : 'data-tid="' + x[3] + '"') + '><span class="n">' + x[0] + "</span><span>" + esc(x[1]) + "</span></button></li>").join("") + "</ul>" : '<p class="hint">' + t("Nothing open.") + "</p>") + "</div></div>";
  h += '<h3 class="hm-sec">' + t("Top venues") + "</h3>" + (top.length ? '<div class="top3">' + top.map((l: any) => { const s2 = stats(l); return '<button class="t3" data-act="goto" data-id="' + l.id + '">' + (l.photo ? '<img src="' + img(l.photo) + '" alt="">' : "") + "<span>" + badge(l) + ' <b style="display:inline">' + esc(lname(l)) + '</b><small style="display:block">' + esc((l.price || t("Quote open")) + " · " + t("{pct}% clarified", { pct: s2.pct })) + "</small></span></button>"; }).join("") + "</div>" : '<p class="hint">' + t("No top 3 set yet. You can do that in the checklist of each venue.") + "</p>");
  if (W.w && !W.w.premium) h += '<p class="hint" style="margin-top:24px">' + esc(t("Free version: up to {g} guests, {v} venues and {f} files.", { g: 30, v: 2, f: 40 })) + "</p>";
  return h;
}
