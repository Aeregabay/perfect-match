// Planner domain logic, ported from the original planner. Text is English source text (translated via t()).
import { state, ui, t, DAYS, MENUS, menuDefault, VATDEF, SLEEP as SLEEP_ } from "./ctx";
import { uid } from "../lib/util";
import { LOCALE } from "../lib/i18n";

// ---------------------------------------------------------------- venue checklist
// [id, priority (m = must, w = important, o = optional), question, comparison label]
export const CATS: { id: string; t: string; q: (string | undefined)[][] }[] = [
  { id: "verf", t: "Availability & exclusivity", q: [
    ["v1", "m", "Which dates in our preferred months are still available?", "Available dates"],
    ["v2", "m", "Is the venue exclusively ours, or are other events held on the same day or weekend?"],
    ["v3", "w", "From when can we access the venue for setup (the day before?), and by when must everything be cleared?"],
    ["v4", "w", "How long will you hold a date as an option without a deposit?"],
    ["v6", "w", "Are there local festivals or holidays around our dates that push up hotel prices?"],
    ["v5", "m", "Is there a minimum guest count or minimum spend? What does it cost if we fall below it?", "Minimum"],
  ] },
  { id: "raum", t: "Capacity & spaces", q: [
    ["k1", "m", "Does the size suit our guest count (not too cramped, not too empty)? How many fit for ceremony, dinner and party?", "Capacity"],
    ["k2", "m", "What is the bad-weather plan? Is there an indoor space for all guests, or is a marquee needed (cost)?", "Plan B"],
    ["k3", "w", "Where do the ceremony, drinks reception, dinner and party take place, and how far apart are they?"],
    ["k4", "m", "Is there enough shade and air-conditioned space on hot days?", "Heat"],
    ["k8", "w", "Are there patio heaters or a heated room for cool evenings?"],
    ["k5", "w", "How many toilets are there? Are extra restroom trailers needed?"],
    ["k6", "o", "Is there a room for getting ready and as a retreat for the couple?"],
    ["k7", "o", "Are the paths easy to walk for older guests (gravel, lawn, stairs, ramps)?"],
  ] },
  { id: "kost", t: "Costs & contract", q: [
    ["c1", "m", "What does the venue hire cost, and what is included (furniture, staff, cleaning, power)?", "Venue hire"],
    ["c2", "m", "What do food and drinks cost per person? Do all prices include VAT?", "Price per person"],
    ["c9", "w", "Which prices apply in each of our preferred months? Is one of them cheaper?", "Seasonal price"],
    ["c3", "m", "What do the payment schedule and deposit look like, and when is the final payment due?"],
    ["c4", "m", "What are the cancellation terms, and can the date be moved (including force majeure)?", "Cancellation"],
    ["c5", "w", "Which extra costs apply: overtime, corkage, cake cutting, service charge, final cleaning?"],
    ["c6", "w", "How high is the security deposit, and under which conditions is it returned?"],
    ["c7", "w", "By when must the final guest count be confirmed, and how much may it change afterwards?"],
    ["c8", "o", "Is the contract available in our language? Which law and jurisdiction apply?"],
  ] },
  { id: "cat", t: "Catering & drinks", q: [
    ["f1", "m", "Is catering in-house, is there a list of exclusive caterers, or can we choose freely?", "Catering"],
    ["f2", "w", "Is there a tasting, and is it included in the price?"],
    ["f3", "w", "How do you handle allergies, vegetarian and vegan menus and kids' menus?"],
    ["f4", "w", "What does the drinks package include: brands, open bar, for how many hours?"],
    ["f5", "o", "May we bring our own wine or sparkling wine? How high is the corkage fee?"],
    ["f6", "o", "Is a late-night snack possible?"],
    ["f7", "o", "How many service staff are planned for our guest count?"],
  ] },
  { id: "zeit", t: "Timing, noise & permits", q: [
    ["z1", "m", "Until when may we celebrate? When does the music have to stop outdoors and indoors?", "Curfew"],
    ["z2", "m", "Are there noise limits, a decibel limiter or neighbours who might complain?"],
    ["z3", "w", "Can a civil or symbolic ceremony take place on site, with sound system and microphone?"],
    ["z4", "w", "Are live bands and DJs allowed? Which conditions apply?"],
    ["z5", "w", "Does the venue hold the permits for events of this size?"],
    ["z6", "o", "Are fireworks, sparklers, candles or open fire allowed (fire risk)?"],
  ] },
  { id: "dl", t: "Suppliers & logistics", q: [
    ["d1", "m", "Do you provide an on-site coordinator? Who is our contact on the day?", "Coordination"],
    ["d2", "w", "Are there mandatory suppliers (photography, flowers, DJ), or can we choose freely?", "Mandatory suppliers"],
    ["d3", "w", "Which equipment is available (chairs, tables, linen, lighting), and what has to be rented?"],
    ["d4", "w", "Is there enough power for the band and lighting, or is a generator needed?"],
    ["d5", "o", "When and how can suppliers deliver? Is the access suitable for trucks?"],
    ["d6", "o", "Who is liable for damage? Is event liability insurance required?"],
  ] },
  { id: "gast", t: "Travel & accommodation", q: [
    ["g1", "m", "How far is it to the nearest airport, train station and hotels?", "Getting there"],
    ["g2", "m", "How many guests can stay overnight on site? Is booking the rooms mandatory?", "Beds on site"],
    ["g3", "w", "How many parking spaces are there? Can coaches drive up to the door?"],
    ["g4", "w", "Can taxis or shuttles be arranged after midnight?"],
    ["g5", "o", "Does the team speak our language?"],
  ] },
  { id: "atmo", t: "Atmosphere & details", q: [
    ["a7", "w", "Is anything disturbing nearby, e.g. a busy road, flight path, railway, industry, smells, building sites or power lines in view?", "Disturbances"],
    ["a1", "w", "When does the sun set on our date, and where is it during the ceremony? Where are the best photo spots?"],
    ["a2", "w", "Can we see photos of real weddings or contact previous couples as references?"],
    ["a3", "o", "Are there restrictions for photographers or drones?"],
    ["a4", "o", "What do you do about mosquitoes in the evening?"],
    ["a5", "o", "What happens in a power cut or heatwave?"],
    ["a6", "o", "Is childcare or a children's room possible? Are dogs allowed?"],
  ] },
];
export const PRIO = (): Record<string, string> => ({ m: t("Must"), w: t("Important"), o: t("Optional"), c: t("Own") });

export function questions(catId: string, withArchived?: boolean) {
  const c = CATS.filter((x) => x.id === catId)[0], ed = state.qEdits, ar = state.archived;
  const list: any[] = c.q.map((q) => { const e = ed[q[0] as string] || {}; return { id: q[0], p: e.p || q[1], t: e.t || t(q[2] as string), key: q[3] ? t(q[3]) : null, cat: c }; });
  state.customQ.forEach((q: any) => { if (q.cat === catId) list.push({ id: q.id, p: q.p || "c", t: q.t, custom: true, cat: c }); });
  const RANK: Record<string, number> = { m: 0, w: 1, o: 2, c: 3 };
  const sorted = list.map((q, i) => { q._i = i; return q; }).sort((x, y) => (RANK[x.p] - RANK[y.p]) || (x._i - y._i));
  return withArchived ? sorted : sorted.filter((q) => !ar[q.id]);
}
export function findQ(id: string) { let r: any = null; CATS.forEach((c) => { questions(c.id, true).forEach((q) => { if (q.id === id) r = q; }); }); return r; }
export function archivedQ() {
  const r: any[] = []; CATS.forEach((c) => { questions(c.id, true).forEach((q) => { if (state.archived[q.id]) r.push(q); }); });
  return r.sort((a, b) => (state.archived[b.id].at || 0) - (state.archived[a.id].at || 0));
}
export function allQ() { let r: any[] = []; CATS.forEach((c) => { r = r.concat(questions(c.id)); }); return r; }
export function st(loc: any, qid: string) { const a = loc.answers[qid]; return a && a.s ? a.s : "open"; }
export function note(loc: any, qid: string) { const a = loc.answers[qid]; return a && a.n ? a.n : ""; }
export function stats(loc: any, list?: any[]) {
  list = list || allQ(); const r: any = { total: list.length, ok: 0, issue: 0, open: 0, todo: 0, mustOpen: 0 };
  list.forEach((q) => { let s = st(loc, q.id); if (r[s] === undefined) s = "open"; r[s]++; if (q.p === "m" && (s === "open" || s === "todo")) r.mustOpen++; });
  r.pct = r.total ? Math.round((r.ok + r.issue) / r.total * 100) : 0; return r;
}
export function answeredBy(qid: string) {
  return state.locations.filter((l: any) => { const a = l.answers[qid]; return a && ((a.s && a.s !== "open") || a.n || (a.dates && a.dates.length) || (a.contested && a.contested.length) || (a.vendors && a.vendors.length) || (a.times && Object.keys(a.times).length)); });
}

export function datesOf(loc: any) { const a = loc.answers.v1; return a && a.dates ? a.dates : []; }
export function contOf(loc: any) { const a = loc.answers.v1; return a && a.contested ? a.contested : []; }
export function allDatesOf(loc: any) { return datesOf(loc).concat(contOf(loc)).sort(); }
export const TSTEPS = 22;
export function tLabel(i: number) { const m = (20 * 60 + i * 30) % (24 * 60); return fmtTimeMin(m); }
function fmtTimeMin(m: number) { return new Intl.DateTimeFormat(LOCALE, { hour: "numeric", minute: "2-digit" }).format(new Date(2024, 0, 1, Math.floor(m / 60), m % 60)); }
export function timesOf(loc: any) { const a = loc.answers.z1; return (a && a.times) || {}; }
export const VENDORS = () => ["Catering", "Drinks / bar", "Lighting & sound", "Furniture & equipment", "DJ / music", "Photography", "Video", "Flowers & decor", "Wedding cake", "Coordination / planner", "Marquee", "Transport / shuttle", "Hair & make-up"].map((x) => t(x));
export function vendorsOf(loc: any) { const a = loc.answers.d2; return (a && a.vendors) || []; }

export function blankLoc(name: string, region?: string) {
  return { id: "l" + uid(), name: name || "", nick: "", photo: "", region: region || "", address: "", maps: "", visit: "", contact: "", price: "", rating: 0, notes: "", answers: {}, at: Date.now() };
}
export function lname(l: any) { return l.nick || l.name || t("Unnamed"); }
export function lfull(l: any) { return l.nick ? l.nick + " · " + (l.name || "") : (l.name || t("Unnamed")); }
export function activeLocs() { return state.locations.filter((l: any) => !l.archived); }
export function archivedLocs() { return state.locations.filter((l: any) => !!l.archived).sort((a: any, b: any) => (b.archived.at || 0) - (a.archived.at || 0)); }
export function badge(l: any) { return l.rank ? '<span class="rk rk' + l.rank + '" title="' + t("Top {n}", { n: l.rank }) + '">' + l.rank + "</span>" : ""; }
export function sortForCmp(L: any[]) {
  if (ui.cmpSort === "chrono") return L;
  const idx: Record<string, number> = {}; state.locations.forEach((l: any, i: number) => { idx[l.id] = i; });
  return L.slice().sort((a, b) => ((a.rank || 9) - (b.rank || 9)) || (idx[a.id] - idx[b.id]));
}
export function peekLoc() { if (!ui.peek || ui.tab !== "check") return null; return state.locations.filter((x: any) => x.id === ui.peek && x.archived)[0] || null; }
export function cur() {
  const pk = peekLoc(); if (pk) return pk;
  const A = activeLocs();
  let l = A.filter((x: any) => x.id === ui.loc)[0];
  if (!l) { l = A[0] || null; ui.loc = l ? l.id : null; }
  return l;
}
export const VPMAX = 8;
export function vp(l: any) { return l.visitPhotos || []; }

// ---------------------------------------------------------------- detailed planning (services, packages, VAT)
export const PLAN_DEF: [string, string][] = [["ps1", "Venue hire"], ["ps2", "Catering & menu"], ["ps3", "Drinks & bar"], ["ps4", "Drinks reception"], ["ps5", "Wedding cake & dessert"], ["ps6", "Ceremony & officiant"], ["ps7", "Ceremony music"], ["ps8", "DJ / band"], ["ps9", "Sound & technology"], ["ps10", "Lighting"], ["ps11", "Flowers & decor"], ["ps12", "Furniture & rentals"], ["ps13", "Photography"], ["ps14", "Videography"], ["ps15", "Wedding planner & on-site coordination"], ["ps16", "Hair & make-up"], ["ps17", "Transport & shuttle"], ["ps18", "Guest accommodation"], ["ps19", "Childcare"], ["ps20", "Stationery & signage"]];
export function planSvcs(all?: boolean) {
  if (!state.planSvc) state.planSvc = PLAN_DEF.map((x) => ({ id: x[0], t: x[1], std: true }));
  state.planHide = state.planHide || {};
  return state.planSvc.filter((x: any) => all || !state.planHide[x.id]);
}
export const svcName = (x: any) => (x.std ? t(x.t) : x.t);
export function pItem(l: any, id: string) { l.plan = l.plan || {}; return l.plan[id] || (l.plan[id] = { v: "", p: "", inc: false, n: "", files: [] }); }
export function pGet(l: any, id: string) { return (l.plan && l.plan[id]) || { v: "", p: "", inc: false, n: "", files: [] }; }
export function parseMoney(v0: unknown): number | null {
  const mt = String(v0 || "").match(/-?\d[\d'’.,\s]*(k(?![a-z]))?/i); if (!mt) return null;
  const km = !!mt[1]; const v = mt[0].replace(/k$/i, "").replace(/[\s'’]/g, "").replace(/[.,]+$/, "");
  const lc = v.lastIndexOf(","), ld = v.lastIndexOf("."); let dec: string | null = null;
  if (lc >= 0 && ld >= 0) dec = lc > ld ? "," : ".";
  else if (lc >= 0) dec = /,\d{1,2}$/.test(v) && (v.match(/,/g) || []).length === 1 ? "," : null;
  else if (ld >= 0) dec = /\.\d{1,2}$/.test(v) && (v.match(/\./g) || []).length === 1 ? "." : null;
  let ip = v, fp = ""; if (dec) { const i = v.lastIndexOf(dec); ip = v.slice(0, i); fp = v.slice(i + 1); }
  const n = parseFloat(ip.replace(/[.,]/g, "") + (fp ? "." + fp : "")); if (isNaN(n)) return null; return km ? n * 1000 : n;
}
export function pGroups(l: any) { l.planGroups = l.planGroups || []; return l.planGroups; }
export function grpOf(l: any, sid: string) { return pGroups(l).filter((g: any) => (g.svc || []).indexOf(sid) >= 0)[0] || null; }
export function grpCovered(g: any) { return !!g && (g.inc || parseMoney(g.p) !== null); }
export function svcState(l: any, x: any) { const it = pGet(l, x.id), g = grpOf(l, x.id); if (it.todo) return "todo"; if (it.inc || parseMoney(it.p) !== null || grpCovered(g)) return "done"; return ""; }
export function grpState(g: any) { if (g.todo) return "todo"; return grpCovered(g) ? "done" : ""; }
export function vatOf(o: any) { const v = o && o.vat; if (v === undefined || v === null || String(v).trim() === "") return VATDEF(); const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? VATDEF() : n; }
export function discOf(l: any) { const n = parseFloat(String(l.planDiscount || "").replace(",", ".")); return isNaN(n) ? 0 : Math.max(0, Math.min(100, n)); }
export function planStats(l: any) {
  let tot = 0, vat = 0, inc = 0, open = 0, priced = 0, todo = 0; const seen: Record<string, number> = {};
  planSvcs().forEach((x: any) => {
    const it = pGet(l, x.id), g = grpOf(l, x.id), m = parseMoney(it.p);
    if (it.todo) todo++;
    if (g && grpCovered(g)) { if (!seen[g.id]) { seen[g.id] = 1; const gm = parseMoney(g.p); if (!g.inc && gm !== null) { tot += gm; vat += gm * vatOf(g) / 100; } } if (g.inc) inc++; else priced++; return; }
    if (it.inc) inc++; else if (m !== null) { tot += m; vat += m * vatOf(it) / 100; priced++; } else if (!it.todo) open++;
  });
  const d = discOf(l), gross = tot + vat, disc = gross * d / 100;
  return { tot, vat, gross, dpct: d, disc, total: gross - disc, inc, open, priced, todo };
}
export function findPF(l: any, sid: string, fid: string) { const it = pGet(l, sid); return (it.files || []).filter((x: any) => x.id === fid)[0] || null; }

// ---------------------------------------------------------------- guests
/** Answer to the save the date (before the invitation): open, positive, negative. */
export const STDR = (): Record<string, string> => ({ "": t("Open"), yes: t("Positive"), no: t("Negative") });
export const RSVP = (): Record<string, string> => ({ open: t("Open"), yes: t("Accepted"), no: t("Declined") });
export function sleepLbl(v: string) { const r = SLEEP_().filter((x) => x[0] === (v || ""))[0]; return r ? r[1] : t("Open"); }
export function dayIx(v: string) { const D = DAYS(); for (let i = 0; i < D.length; i++) if (D[i][0] === v) return i; return -1; }
export function gDaySet(g: any): string[] { return (g.days || []).filter((k: string) => dayIx(k) >= 0); }
export function dayTag(g: any) {
  const D = DAYS(); const ix = gDaySet(g).map(dayIx).filter((i) => i >= 0).sort((a, b) => a - b); if (!ix.length) return "";
  const contig = ix[ix.length - 1] - ix[0] === ix.length - 1;
  return ix.length > 1 && contig ? D[ix[0]][2] + "–" + D[ix[ix.length - 1]][2] : ix.map((i) => D[i][2]).join(", ");
}
export function guests() { state.guests = state.guests || []; return state.guests; }
export function blankGuest() {
  return { id: "g" + uid(), fn: "", ln: "", nick: "", kids: 0, menu: menuDefault(), rsvp: "open", plusOn: false, plus: { fn: "", ln: "", menu: menuDefault(), allergies: "" },
    group: "", side: "p1", email: "", mobile: "", address: "", allergies: "", sent: false, stdSent: false, stdType: "", stdResp: "", sleep: "", days: [], note: "", at: Date.now() };
}
export function gName(g: any) { const n = ((g.fn || "") + " " + (g.ln || "")).trim(); return n || t("Unnamed"); }
export function gHeads(g: any) { return 1 + (g.plusOn ? 1 : 0) + (+g.kids || 0); }
export function totalHeads(except?: string) { return guests().reduce((a: number, g: any) => a + (g.id === except ? 0 : gHeads(g)), 0); }
export const sideCls = (s: string) => (s === "p2" ? "bride" : "groom");
export function gMatch(g: any) {
  const f = ui.gf || {}, q = (ui.gq || "").toLowerCase().trim();
  if (f.side && g.side !== f.side) return false;
  if (f.rsvp && g.rsvp !== f.rsvp) return false;
  if (f.menu && g.menu !== f.menu && !(g.plusOn && g.plus && g.plus.menu === f.menu)) return false;
  if (f.kids === "none" && +g.kids) return false; if (f.kids === "some" && !+g.kids) return false;
  if (f.plus === "yes" && !g.plusOn) return false; if (f.plus === "no" && g.plusOn) return false;
  if (f.sent === "yes" && !g.sent) return false; if (f.sent === "no" && g.sent) return false;
  if (f.std === "yes" && !g.stdSent) return false; if (f.std === "no" && g.stdSent) return false;
  if (f.stdr && (f.stdr === "open" ? !!g.stdResp : g.stdResp !== f.stdr)) return false;
  if (f.std === "digital" && !(g.stdSent && g.stdType === "digital")) return false; if (f.std === "physical" && !(g.stdSent && g.stdType === "physical")) return false;
  if (f.day) { const gd = gDaySet(g); if (f.day === "none") { if (gd.length) return false; } else if (gd.indexOf(f.day) < 0) return false; }
  if (f.sleep) { if (f.sleep === "none" ? !!g.sleep : f.sleep === "other" ? (!g.sleep || g.sleep === "onsite") : g.sleep !== f.sleep) return false; }
  if (f.allerg === "yes" && !(g.allergies || (g.plusOn && g.plus && g.plus.allergies))) return false;
  if (q) { const hay = [g.fn, g.ln, g.nick, g.group, g.email, g.mobile, g.plus && g.plus.fn, g.plus && g.plus.ln].join(" ").toLowerCase(); if (hay.indexOf(q) < 0) return false; }
  return true;
}
export const menuIds = () => MENUS().map((m) => m.id);

// ---------------------------------------------------------------- tasks
export const COLS = (): [string, string, string][] => [["todo", t("To-do"), "var(--muted)"], ["doing", t("Ongoing"), "var(--pend)"], ["done", t("Done"), "var(--ok)"]];
export function tasks() { state.tasks = state.tasks || []; return state.tasks; }
export function findT(id: string) { return tasks().filter((x: any) => x.id === id)[0] || null; }
export function closeTask() { const tk = findT(ui.tEdit); if (tk && !tk.t && !tk.d && !(tk.items || []).length) { state.tasks = tasks().filter((x: any) => x !== tk); } ui.tEdit = null; ui.tDel = false; }

// ---------------------------------------------------------------- seating
export function seat() { state.seat = state.seat || { tables: [], assign: {} }; state.seat.tables = state.seat.tables || []; state.seat.assign = state.seat.assign || {}; return state.seat; }
export function seatPeople() {
  const P: any[] = [];
  guests().forEach((g: any) => {
    if (g.rsvp === "no") return;
    P.push({ pid: g.id + ":m", hh: g.id, name: gName(g), short: g.nick || g.fn || gName(g), side: g.side });
    if (g.plusOn) { const pn = ((g.plus && ((g.plus.fn || "") + " " + (g.plus.ln || "")).trim()) || ""); P.push({ pid: g.id + ":p", hh: g.id, name: pn || t("Companion of {name}", { name: g.fn || gName(g) }), short: (g.plus && g.plus.fn) || t("Companion"), side: g.side }); }
    for (let k = 1; k <= (+g.kids || 0); k++) P.push({ pid: g.id + ":k" + k, hh: g.id, name: t("Child {n} of {name}", { n: k, name: g.fn || gName(g) }), short: t("Child {n}", { n: k }), side: g.side, kid: true });
  });
  return P;
}

// ---------------------------------------------------------------- schedule
export const AGTAGS = () => ["Ceremony", "Drinks", "Food", "Music", "Speech", "Photo", "Transport", "Decor", "Party", "Styling"].map((x) => t(x));
export function agenda() { state.agenda = state.agenda || []; return state.agenda; }
export function tmin(tt: string) { const m = /^(\d{1,2}):(\d{2})$/.exec(tt || ""); return m ? (+m[1]) * 60 + (+m[2]) : null; }
export function tfmt(n: number) { n = ((n % 1440) + 1440) % 1440; return ("0" + Math.floor(n / 60)).slice(-2) + ":" + ("0" + n % 60).slice(-2); }
export function agSorted(day: string) {
  return agenda().filter((x: any) => x.day === day).sort((a: any, b: any) => { let A = tmin(a.start), B = tmin(b.start); if (A !== null && A < 300) A += 1440; if (B !== null && B < 300) B += 1440; return (A == null ? 9999 : A) - (B == null ? 9999 : B); });
}
export function openQs() { const r: any[] = []; activeLocs().forEach((l: any) => { allQ().forEach((q) => { if (st(l, q.id) === "todo") r.push({ k: l.id + "|" + q.id, l, q }); }); }); return r; }
export function agCur() { return agenda().filter((a: any) => a.id === ui.agEdit)[0] || null; }
export function agClose() { const x = agCur(); if (x && !x.title && !x.note && !(x.tags || []).length && !(x.links || []).length) { state.agenda = agenda().filter((a: any) => a !== x); } ui.agEdit = null; ui.agDel = false; }
export function defaultDay() { const D = DAYS(); const main = D.filter((d) => d[0] === "main")[0] || D[0]; return main ? main[0] : ""; }
