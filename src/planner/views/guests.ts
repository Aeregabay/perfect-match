// Guest list: summary, filters, invitations with companion and children, dispatch, import.
import { ui, t, tp, esc, DAYS, SLEEP, MENUS, SIDE, CAP, menuName, menuDefault } from "../ctx";
import { STDR, RSVP, sleepLbl, dayIx, gDaySet, dayTag, guests, blankGuest, gName, gHeads, gMatch } from "../data";

function gF(g: any, k: string, label: string, type?: string, wide?: boolean) {
  const v = k.indexOf("plus.") === 0 ? (g.plus || {})[k.slice(5)] : g[k];
  return '<div class="field' + (wide ? " wide" : "") + '"><label for="g-' + g.id + "-" + k + '">' + label + "</label>" +
    (type === "area" ? '<textarea id="g-' + g.id + "-" + k + '" data-g="' + g.id + '" data-gk="' + k + '">' + esc(v) + "</textarea>" : '<input id="g-' + g.id + "-" + k + '" type="' + (type || "text") + '" data-g="' + g.id + '" data-gk="' + k + '" value="' + esc(v) + '"' + (type === "email" ? ' autocomplete="off"' : "") + ">") + "</div>";
}
function gS(g: any, k: string, label: string, opts: [string | number, string][]) {
  const v = k.indexOf("plus.") === 0 ? (g.plus || {})[k.slice(5)] : g[k];
  return '<div class="field"><label for="g-' + g.id + "-" + k + '">' + label + '</label><select id="g-' + g.id + "-" + k + '" data-g="' + g.id + '" data-gsel="' + k + '">' + opts.map((o) => '<option value="' + esc(o[0]) + '"' + (String(v) === String(o[0]) ? " selected" : "") + ">" + esc(o[1]) + "</option>").join("") + "</select></div>";
}

export function renderGuests() {
  const G = guests(), D = DAYS(), SD = SIDE(), M = MENUS(), cap = CAP();
  const all: any = { dd: D.map(() => 0), dopen: 0, onsite: 0, n: 0, heads: 0, yes: 0, no: 0, open: 0, kids: 0, sent: 0, p1: 0, p2: 0, std: 0, stdP: 0, stdD: 0, menu: {} };
  G.forEach((g: any) => {
    const hd = gHeads(g); all.n++; all.heads += hd; all.kids += (+g.kids || 0); if (g.sent) all.sent++;
    if (g.stdSent) { all.std++; if (g.stdType === "physical") all.stdP++; else if (g.stdType === "digital") all.stdD++; }
    if (g.sleep === "onsite" && g.rsvp !== "no") all.onsite += hd;
    if (g.rsvp !== "no") { const gd2 = gDaySet(g); if (gd2.length) gd2.forEach((k) => { const i2 = dayIx(k); if (i2 >= 0) all.dd[i2] += hd; }); else all.dopen += hd; }
    all[g.side === "p2" ? "p2" : "p1"] += hd;
    all["sr_" + (g.stdResp || "open")] = (all["sr_" + (g.stdResp || "open")] || 0) + hd;
    if (g.rsvp === "yes") all.yes += hd; else if (g.rsvp === "no") all.no += hd; else all.open += hd;
    if (g.rsvp !== "no") { all.menu[g.menu] = (all.menu[g.menu] || 0) + 1; if (g.plusOn) { const pm = (g.plus && g.plus.menu) || menuDefault(); all.menu[pm] = (all.menu[pm] || 0) + 1; } }
  });
  let h = '<section class="card"><div class="gsum">' +
    '<div><span class="lbl">' + t("People in total") + "</span><b>" + all.heads + "</b><small>" + esc(tp("{n} invitation", "{n} invitations", all.n) + " · " + t("max. {cap}", { cap })) + "</small></div>" +
    '<div><span class="lbl">' + t("Save the date positive") + "</span><b>" + (all.sr_yes || 0) + "</b><small>" + esc(t("people · {no} negative · {open} open", { no: all.sr_no || 0, open: all.sr_open || 0 })) + "</small></div>" +
    '<div><span class="lbl">' + t("RSVP accepted") + "</span><b>" + all.yes + "</b><small>" + esc(t("people · {no} declined · {open} open", { no: all.no, open: all.open })) + "</small></div>" +
    '<div><span class="lbl">' + t("Menu") + "</span><b>" + M.map((m) => all.menu[m.id] || 0).join(" / ") + "</b><small>" + esc(M.map((m) => m.name).join(" / ") + ", " + t("without declines and children")) + "</small></div>" +
    '<div><span class="lbl">' + t("Children") + "</span><b>" + all.kids + "</b></div>" +
    '<div><span class="lbl">' + t("Side") + "</span><b>" + all.p1 + " / " + all.p2 + "</b><small>" + esc(SD.p1 + " / " + SD.p2 + " (" + t("people") + ")") + "</small></div>" +
    (D.length ? '<div><span class="lbl">' + t("People per day") + "</span><b>" + all.dd.join(" · ") + "</b><small>" + esc(D.map((x) => x[2]).join(" · ") + ", " + tp("{n} without days yet", "{n} without days yet", all.dopen)) + "</small></div>" : "") +
    (SLEEP().some((s) => s[0] === "onsite") ? '<div><span class="lbl">' + esc(t("Staying: {place}", { place: sleepLbl("onsite") })) + "</span><b>" + all.onsite + "</b><small>" + t("people, without declines") + "</small></div>" : "") +
    '<div><span class="lbl">' + t("Save the date") + "</span><b>" + all.std + "</b><small>" + esc(t("of {n} · {d} digital, {p} printed", { n: all.n, d: all.stdD, p: all.stdP })) + "</small></div>" +
    '<div><span class="lbl">' + t("Invitation sent") + "</span><b>" + all.sent + "</b><small>" + esc(t("of {n}", { n: all.n })) + "</small></div>" +
    "</div>" + (all.heads > cap ? '<p class="vis-msg err" style="margin:10px 0 0">' + esc(t("More than {cap} people – above the planned capacity.", { cap })) + "</p>" : "") + "</section>";
  const f = ui.gf || {};
  function fs(k: string, lbl: string, opts: [string, string][]) { return '<div><label for="gf-' + k + '">' + lbl + '</label><select id="gf-' + k + '" data-gf="' + k + '" class="' + (f[k] ? "act" : "") + '">' + ([["", t("All")]] as [string, string][]).concat(opts).map((o) => '<option value="' + esc(o[0]) + '"' + ((f[k] || "") === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>").join("") + "</select></div>"; }
  const nAct = Object.keys(f).filter((k) => f[k]).length;
  const L = G.filter(gMatch), active = Object.keys(f).some((k) => f[k]) || (ui.gq || "").trim();
  h += '<div class="gact"><button class="btn" data-act="gimp">' + t("Import list") + '</button><button class="btn" data-act="gexport">' + t("Export CSV") + '</button><button class="btn primary" data-act="gadd">+ ' + t("Invite guest") + "</button></div>";
  h += '<div class="gsearch"><input id="gq" type="search" placeholder="' + esc(t("Search: name, group, email…")) + '" value="' + esc(ui.gq || "") + '">' +
    '<button class="btn gfbtn' + (nAct ? " on" : "") + '" data-act="gfhide" aria-expanded="' + (!ui.gfHide) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>' + t("Filter") + (nAct ? ' <span class="gfn">' + nAct + "</span>" : "") + '<span class="gfcar">' + (ui.gfHide ? "▾" : "▴") + "</span></button></div>";
  if (!ui.gfHide) h += '<div class="gfpanel"><div class="gfilt">' + fs("side", t("Side"), [["p1", SD.p1], ["p2", SD.p2]]) + fs("rsvp", t("RSVP"), [["open", t("Open")], ["yes", t("Accepted")], ["no", t("Declined")]]) +
    fs("menu", t("Menu"), M.map((m) => [m.id, m.name] as [string, string])) + fs("kids", t("Children"), [["none", t("Without children")], ["some", t("With children")]]) +
    fs("plus", t("Companion"), [["yes", t("With")], ["no", t("Without")]]) + fs("std", t("Save the date"), [["yes", t("Sent")], ["digital", t("Sent · digital")], ["physical", t("Sent · printed")], ["no", t("Not sent")]]) + fs("stdr", t("Save-the-date answer"), [["yes", t("Positive")], ["no", t("Negative")], ["open", t("Open")]]) + fs("sent", t("Invitation"), [["yes", t("Sent")], ["no", t("Not sent")]]) + fs("allerg", t("Allergies"), [["yes", t("With allergies")]]) +
    fs("sleep", t("Accommodation"), ([["none", t("Open")]] as [string, string][]).concat(SLEEP().slice(1)).concat([["other", t("Other accommodation")]])) +
    (D.length ? fs("day", t("Present on"), D.map((x) => [x[0], x[1]] as [string, string]).concat([["none", t("Days open")]])) : "") + "</div>" + (nAct ? '<div class="gfbar"><button class="linkbtn" data-act="gfclear">' + t("Reset all filters") + "</button></div>" : "") + "</div>";
  if (ui.gImp) h += '<section class="card gimp" style="margin-bottom:12px"><p style="margin-top:0"><b>' + t("Import list") + '</b></p><p class="hint">' + esc(t("Copy from Excel or Google Sheets and paste here, first row with column names (e.g. First name, Last name, Nickname, Children, Menu, RSVP, Companion, Group, Side, Email, Mobile, Address, Allergies, Invitation sent, Save the date, Note). CSV with ; or , works too.")) + "</p>" +
    '<textarea id="gimp-text" placeholder="' + esc(t("First name") + "\t" + t("Last name") + "\t" + t("Side") + " …") + '"></textarea><div class="gfoot"><span class="hint" id="gimp-msg">' + esc(ui.gImpMsg || "") + '</span><span style="display:flex;gap:8px"><button class="btn ghost" data-act="gimpno">' + t("Cancel") + '</button><button class="btn primary" data-act="gimpok">' + t("Import") + "</button></span></div></section>";
  h += '<div class="gcount"><span class="hint">' + esc(active ? t("{a} of {b} invitations", { a: L.length, b: G.length }) : tp("{n} invitation", "{n} invitations", G.length)) + "</span>" + (active ? '<button class="linkbtn" data-act="gfclear">' + t("Reset search & filters") + "</button>" : "") + '</div><div class="glist">';
  if (!G.length) h += '<div class="card"><p style="margin:0">' + t("No guests yet. Invite the first one or import a list.") + "</p></div>";
  else if (!L.length) h += '<p class="empty">' + t("No guests for this filter.") + "</p>";
  const R = RSVP(), mdef = menuDefault();
  L.forEach((g: any) => {
    const op = ui.gOpen === g.id;
    const tags = '<span class="gt ' + (g.rsvp === "yes" ? "yes" : g.rsvp === "no" ? "no" : "op") + '">' + R[g.rsvp || "open"] + "</span>" +
      '<span class="gt ' + (g.side === "p2" ? "br" : "gr") + '">' + esc(SD[g.side === "p2" ? "p2" : "p1"]) + "</span>" +
      (g.plusOn ? '<span class="gt">+1</span>' : "") + (+g.kids ? '<span class="gt">' + esc(tp("{n} child", "{n} children", +g.kids)) + "</span>" : "") +
      (g.menu && g.menu !== mdef ? '<span class="gt">' + esc(menuName(g.menu)) + "</span>" : "") + (dayTag(g) ? '<span class="gt">' + esc(dayTag(g)) + "</span>" : "") + (g.sleep === "onsite" ? '<span class="gt br">' + esc(sleepLbl("onsite")) + "</span>" : g.sleep ? '<span class="gt">' + esc(sleepLbl(g.sleep)) + "</span>" : "") +
      (g.stdSent ? '<span class="gt' + (g.stdResp === "yes" ? " yes" : g.stdResp === "no" ? " no" : "") + '" title="' + esc((g.stdType === "physical" ? t("Save the date sent (printed)") : g.stdType === "digital" ? t("Save the date sent (digital)") : t("Save the date sent")) + " · " + t("Answer: {a}", { a: STDR()[g.stdResp || ""] })) + '">' + t("StD") + (g.stdType === "physical" ? " ✉︎" : g.stdType === "digital" ? " @" : "") + (g.stdResp === "yes" ? " ✓" : g.stdResp === "no" ? " ✗" : "") + "</span>"
        : g.stdResp ? '<span class="gt ' + (g.stdResp === "yes" ? "yes" : "no") + '" title="' + t("Save-the-date answer") + '">' + t("StD") + " " + (g.stdResp === "yes" ? "✓" : "✗") + "</span>" : "") + (g.sent ? '<span class="gt yes" title="' + t("Invitation sent") + '">' + t("Invitation") + " ✓</span>" : "");
    const sub = [g.nick, g.plusOn ? t("with {name}", { name: (g.plus && ((g.plus.fn || "") + " " + (g.plus.ln || "")).trim()) || t("companion") }) : "", g.group].filter(Boolean).join(" · ");
    h += '<div class="grow' + (op ? " open" : "") + '" id="gr-' + g.id + '"><div class="ghrow"><button class="ghead" data-act="gtoggle" data-id="' + g.id + '" aria-expanded="' + op + '"><span class="gn"><b>' + esc(gName(g)) + "</b>" + (sub ? "<small>" + esc(sub) + "</small>" : "") + '</span><span class="gtags">' + tags + "</span></button>" +
      (op ? '<label class="plustog' + (g.plusOn ? " on" : "") + '"><input type="checkbox" data-g="' + g.id + '" data-gchk="plusOn"' + (g.plusOn ? " checked" : "") + "> " + t("Companion") + "</label>" : "") + "</div>";
    if (op) {
      const MO = M.map((m) => [m.id, m.name] as [string, string]);
      h += '<div class="gbody"><div class="fields">' + gF(g, "fn", t("First name")) + gF(g, "ln", t("Last name")) + gF(g, "nick", t("Nickname (optional)")) + gF(g, "group", t("Group / household")) +
        gS(g, "side", t("Side"), [["p1", SD.p1], ["p2", SD.p2]]) + gS(g, "rsvp", t("RSVP status"), [["open", t("Open")], ["yes", t("Accepted")], ["no", t("Declined")]]) +
        gS(g, "menu", t("Menu"), MO) + gS(g, "kids", t("Children"), [0, 1, 2, 3, 4, 5, 6].map((n) => [n, String(n)] as [number, string])) + gS(g, "sleep", t("Accommodation"), SLEEP()) +
        gF(g, "email", t("Email"), "email") + gF(g, "mobile", t("Mobile"), "tel") + gF(g, "address", t("Address"), "text", true) + gF(g, "allergies", t("Allergies"), "text", true) +
        '<div class="field wide"><label>' + t("Dispatch") + '</label><div class="sendbox">' +
          '<div class="sb"><label class="cb2"><input type="checkbox" data-g="' + g.id + '" data-gchk="stdSent"' + (g.stdSent ? " checked" : "") + "> " + t("Save the date sent") + "</label>" +
          '<div class="seg sm">' + [["digital", t("Digital")], ["physical", t("Printed")]].map((o) => '<button type="button" data-act="gstd" data-id="' + g.id + '" data-v="' + o[0] + '" class="' + ((g.stdType || "") === o[0] ? "on" : "") + '">' + o[1] + "</button>").join("") + "</div>" +
          '<div class="stdr"><span>' + t("Answer") + '</span><div class="seg sm">' + [["", t("Open")], ["yes", t("Positive")], ["no", t("Negative")]].map((o) => '<button type="button" data-act="gstdr" data-id="' + g.id + '" data-v="' + o[0] + '" class="' + ((g.stdResp || "") === o[0] ? "on" + (o[0] ? " r-" + o[0] : "") : "") + '">' + o[1] + "</button>").join("") + "</div></div></div>" +
          '<div class="sb"><label class="cb2"><input type="checkbox" data-g="' + g.id + '" data-gchk="sent"' + (g.sent ? " checked" : "") + "> " + t("Invitation sent") + '</label><span class="hint">' + t("digital · answer in the RSVP status") + "</span></div>" +
        "</div></div>" +
        (D.length ? '<div class="field wide"><label>' + t("Present for") + '</label><div class="daychk">' + D.map((x) => { const on = gDaySet(g).indexOf(x[0]) >= 0; return '<label class="dc' + (on ? " on" : "") + '"><input type="checkbox" data-g="' + g.id + '" data-gday="' + x[0] + '"' + (on ? " checked" : "") + "><span><b>" + esc(x[1]) + "</b><small>" + esc(x[3]) + "</small></span></label>"; }).join("") + "</div></div>" : "") + "</div>";
      if (g.plusOn) h += '<div class="gplus"><h4>' + t("Companion") + '</h4><div class="fields">' + gF(g, "plus.fn", t("First name")) + gF(g, "plus.ln", t("Last name")) + gS(g, "plus.menu", t("Menu"), MO) + gF(g, "plus.allergies", t("Allergies")) + "</div></div>";
      h += '<div class="fields" style="margin-top:12px">' + gF(g, "note", t("Note"), "area", true) + "</div>";
      h += '<p class="hint" style="margin:8px 0 0">' + t("Allergies are health data: only note what the kitchen needs to know.") + "</p>";
      h += '<div class="gfoot">' + (ui.gDel === g.id ? '<span class="confirm"><span>' + esc(t("Remove “{name}”?", { name: gName(g) })) + '</span><button class="btn danger" data-act="gdel" data-id="' + g.id + '">' + t("Remove") + '</button><button class="btn ghost" data-act="gdelno">' + t("Cancel") + "</button></span>"
        : '<button class="btn ghost" data-act="gdelask" data-id="' + g.id + '">' + t("Remove guest") + "</button>") + (ui.gNew === g.id ? '<button class="btn sage" data-act="gtoggle" data-id="' + g.id + '">' + t("Add guest") + "</button>" : '<button class="btn" data-act="gtoggle" data-id="' + g.id + '">' + t("Close") + "</button>") + "</div></div>";
    }
    h += "</div>";
  });
  return h + "</div>";
}

// ---------------------------------------------------------------- import / export
function normKey(k: string) { return String(k || "").toLowerCase().replace(/[^a-zäöüéèàç0-9]/g, ""); }
const GMAP: Record<string, string> = {
  firstname: "fn", first: "fn", givenname: "fn", vorname: "fn", prenom: "fn", prénom: "fn", nombre: "fn",
  lastname: "ln", surname: "ln", familyname: "ln", name: "ln", nachname: "ln", nom: "ln", apellido: "ln",
  nickname: "nick", spitzname: "nick", children: "kids", kids: "kids", kinder: "kids", child: "kids", enfants: "kids",
  menu: "menu", menü: "menu", meal: "menu", food: "menu", essen: "menu", rsvp: "rsvp", status: "rsvp", rsvpstatus: "rsvp", attending: "rsvp", zusage: "rsvp",
  companion: "plus", plusone: "plus", plus1: "plus", partner: "plus", begleitung: "plus", begleitperson: "plus",
  group: "group", household: "group", grouphousehold: "group", gruppe: "group", haushalt: "group", side: "side", seite: "side",
  email: "email", mail: "email", emailaddress: "email", mobile: "mobile", phone: "mobile", tel: "mobile", telephone: "mobile", cell: "mobile", handy: "mobile", telefon: "mobile",
  address: "address", adresse: "address", allergies: "allergies", allergy: "allergies", dietary: "allergies", allergien: "allergies",
  invitationsent: "sent", invitation: "sent", sent: "sent", einladung: "sent", einladungversendet: "sent", savethedate: "std", std: "std", savethedateanswer: "stdr", stdanswer: "stdr", stdrückmeldung: "stdr", stdrueckmeldung: "stdr",
  accommodation: "sleep", stay: "sleep", übernachtung: "sleep", unterkunft: "sleep", note: "note", notes: "note", comment: "note", kommentar: "note", notiz: "note",
};
function yesish(v: string) { return /^(yes|y|x|1|true|✓|sent|ja|j|oui|si|sí|versendet)$/i.test(String(v || "").trim()); }
export function importGuests(txt: string): number | string {
  const lines = String(txt || "").replace(/\r/g, "").split("\n").filter((l) => l.trim()); if (lines.length < 2) return t("At least a header row and one guest row are needed.");
  const sep = lines[0].indexOf("\t") >= 0 ? "\t" : (lines[0].split(";").length >= lines[0].split(",").length ? ";" : ",");
  function split(l: string) { if (sep === "\t") return l.split("\t"); const out: string[] = []; let c = "", q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (ch === '"') { if (q && l[i + 1] === '"') { c += '"'; i++; } else q = !q; } else if (ch === sep && !q) { out.push(c); c = ""; } else c += ch; } out.push(c); return out; }
  const head = split(lines[0]).map((k) => GMAP[normKey(k)] || null); if (head.indexOf("fn") < 0 && head.indexOf("ln") < 0) return t("No “First name” or “Last name” column found.");
  const SD = SIDE(), M = MENUS(), ST = SLEEP().slice(1); let n = 0;
  lines.slice(1).forEach((l) => {
    const c = split(l), g: any = blankGuest(); let any = false;
    head.forEach((k, i) => { const v = (c[i] || "").trim(); if (!k || !v) return; any = true;
      if (k === "kids") g.kids = Math.max(0, Math.min(6, parseInt(v, 10) || 0));
      else if (k === "menu") { const m = M.find((x) => x.name.toLowerCase() === v.toLowerCase() || x.id === v.toLowerCase()) || (/veg/i.test(v) ? M.find((x) => /veg/i.test(x.id + x.name)) : null); if (m) g.menu = m.id; }
      else if (k === "rsvp") g.rsvp = /^(yes|y|✓|accepted|attending|coming|ja|zu|oui|si|sí)/i.test(v) ? "yes" : /^(no|n|declined|not|nein|ab|non)/i.test(v) ? "no" : "open";
      else if (k === "side") g.side = (SD.p2 && v.toLowerCase() === SD.p2.toLowerCase()) || /^(2|p2|partner 2|bride|braut)$/i.test(v) ? "p2" : "p1";
      else if (k === "sent") g.sent = yesish(v);
      else if (k === "std") { if (/digital|mail|whats|online/i.test(v)) { g.stdSent = true; g.stdType = "digital"; } else if (/print|post|card|paper|phys|karte/i.test(v)) { g.stdSent = true; g.stdType = "physical"; } else g.stdSent = yesish(v); }
      else if (k === "stdr") g.stdResp = /^(yes|y|positive|ja|j|oui|si|sí|positiv|✓)/i.test(v) ? "yes" : /^(no|n|negative|nein|non|negativ|✗)/i.test(v) ? "no" : "";
      else if (k === "sleep") { const s = ST.find((x) => x[1].toLowerCase() === v.toLowerCase()); if (s) g.sleep = s[0]; }
      else if (k === "plus") { if (yesish(v) || /\+1/.test(v)) g.plusOn = true; else if (!/^(no|n|0|-|nein|non)$/i.test(v)) { g.plusOn = true; const pp = v.split(/\s+/); g.plus.fn = pp.shift() || ""; g.plus.ln = pp.join(" "); } }
      else g[k] = v.slice(0, 2000); });
    if (any && (g.fn || g.ln)) { guests().push(g); n++; }
  });
  return n;
}
export function guestsCsv(): string {
  const SD = SIDE(), R = RSVP(), D = DAYS();
  const cols = [t("First name"), t("Last name"), t("Nickname"), t("Group / household"), t("Side"), t("RSVP"), t("Menu"), t("Children"), t("Companion"), t("Companion menu"), t("Email"), t("Mobile"), t("Address"), t("Allergies"), t("Save the date"), t("Save-the-date answer"), t("Invitation sent"), t("Accommodation"), t("Present for"), t("Note")];
  const q = (v: unknown) => { let s = String(v == null ? "" : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const rows = guests().map((g: any) => [g.fn, g.ln, g.nick, g.group, SD[g.side === "p2" ? "p2" : "p1"], R[g.rsvp || "open"], menuName(g.menu), +g.kids || 0,
    g.plusOn ? ((g.plus && ((g.plus.fn || "") + " " + (g.plus.ln || "")).trim()) || t("yes")) : "", g.plusOn ? menuName((g.plus && g.plus.menu) || "") : "", g.email, g.mobile, g.address,
    [g.allergies, g.plusOn && g.plus && g.plus.allergies].filter(Boolean).join(" / "), g.stdSent ? (g.stdType === "physical" ? t("printed") : g.stdType === "digital" ? t("digital") : t("yes")) : "", g.stdResp ? STDR()[g.stdResp] : "", g.sent ? t("yes") : "",
    g.sleep ? sleepLbl(g.sleep) : "", gDaySet(g).map((k) => (D.find((d) => d[0] === k) || ["", k])[1]).join(", "), g.note]);
  return "﻿" + [cols].concat(rows).map((r) => r.map(q).join(";")).join("\r\n");
}
