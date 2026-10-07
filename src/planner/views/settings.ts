// Settings: the wedding-specific values (names, days, months, options), partner, weddings, account, privacy.
import { state, ui, W, t, esc, uid, settings, monthName, CUR, wid } from "../ctx";
import { LOCALE } from "../../lib/i18n";
import { hooks } from "../ctx";
import { supabase } from "../../lib/supabase";
import { passwordProblem, authMessage, setPassword, sendReauth, totpFactors, enrollTotp, confirmTotp, removeTotp } from "../../lib/auth";
import { saveFile } from "../../lib/save";
import { Share } from "@capacitor/share";
import { listAll, removeFiles } from "../../lib/files";
import { guestsCsv } from "./guests";

export const nav = {
  switchWedding: (_id: string) => {},
  newWedding: () => {},
  signedOut: () => {},
  deleteAccount: async () => {},
};

const SITE = ((import.meta.env.VITE_PUBLIC_SITE_URL as string) || "").replace(/\/$/, "");
const VERSION = "0.2.2";
export const CURRENCIES = ["CHF", "EUR", "USD", "GBP", "CAD", "AUD", "NZD", "SEK", "NOK", "DKK", "ISK", "PLN", "CZK", "HUF", "RON", "BGN", "RSD", "BAM", "MKD", "ALL", "TRY", "UAH", "ILS", "AED", "SAR", "QAR", "EGP", "MAD", "ZAR", "NGN", "KES", "INR", "PKR", "LKR", "THB", "VND", "IDR", "MYR", "PHP", "SGD", "HKD", "TWD", "CNY", "JPY", "KRW", "BRL", "ARS", "CLP", "COP", "PEN", "MXN"];

// ---------------------------------------------------------------- persistence
let wTimer: ReturnType<typeof setTimeout> | undefined, wPatch: Record<string, unknown> = {};
function saveWedding(patch: Record<string, unknown>, ms = 700) {
  Object.assign(W.w, patch); Object.assign(wPatch, patch);
  clearTimeout(wTimer);
  wTimer = setTimeout(async () => {
    const p = wPatch; wPatch = {};
    const { error } = await supabase.from("weddings").update(p).eq("id", wid());
    if (error) hooks.toast(t("Settings could not be saved. Check your connection."), true);
    const i = (W.weddings || []).findIndex((x: any) => x.id === wid()); if (i >= 0) W.weddings[i] = { ...W.weddings[i], ...p };
  }, ms);
}
function setS(key: string, val: unknown, ms?: number) { saveWedding({ settings: { ...settings(), [key]: val } }, ms); }
const list = (k: string): any[] => (settings()[k] || []).slice();

export async function loadMembers() {
  if (!W.w) return;
  const { data } = await supabase.from("wedding_members").select("user_id,role,joined_at").eq("wedding_id", wid()).order("joined_at");
  const ids = (data || []).map((m: any) => m.user_id);
  const { data: prof } = ids.length ? await supabase.from("profiles").select("id,display_name").in("id", ids) : { data: [] };
  const names: Record<string, string> = {}; (prof || []).forEach((p: any) => { names[p.id] = p.display_name; });
  W.members = (data || []).map((m: any) => ({ ...m, name: names[m.user_id] || "" }));
  const me = (prof || []).find((p: any) => p.id === W.meId); W.myName = me ? me.display_name : "";
  W.factors = await totpFactors().catch(() => []);
}

// ---------------------------------------------------------------- render
function row(label: string, inner: string, wide?: boolean) { return '<div class="field' + (wide ? " wide" : "") + '"><label>' + label + "</label>" + inner + "</div>"; }
function optList(key: string, items: { id: string; name: string }[], fixed: string[], ph: string) {
  return '<div class="olist">' + items.map((x) => '<div class="orow"><input data-opt="' + key + '" data-id="' + esc(x.id) + '" value="' + esc(x.name) + '" aria-label="' + esc(ph) + '" maxlength="60">' +
    (fixed.indexOf(x.id) >= 0 || items.length <= 1 ? '<span class="hint">' + (x.id === "onsite" ? t("counts as on site") : "") + "</span>" : '<button class="icon" data-act="optrm" data-k="' + key + '" data-id="' + esc(x.id) + '" aria-label="' + t("Remove") + '">×</button>') + "</div>").join("") +
    '<div class="addq"><input id="opt-new-' + key + '" placeholder="' + esc(ph) + '" maxlength="60"><button class="btn" data-act="optadd" data-k="' + key + '">' + t("Add") + "</button></div></div>";
}

export function renderSettings() {
  const w = W.w || {}, s = settings(), mine = (W.members || []).find((m: any) => m.user_id === W.meId) || {}, owner = mine.role === "owner";
  const days = list("days"), months = list("months").sort(), blocked = list("blocked");
  let h = '<h2 class="hm-sec" style="margin-top:6px">' + t("Settings") + "</h2>";

  h += '<section class="card"><h3 class="sub-sec">' + t("Your wedding") + '</h3><div class="fields">' +
    row(t("Partner 1"), '<input data-wf="partner1_name" value="' + esc(w.partner1_name) + '" maxlength="80" autocomplete="off">') +
    row(t("Partner 2"), '<input data-wf="partner2_name" value="' + esc(w.partner2_name) + '" maxlength="80" autocomplete="off">') +
    row(t("Wedding date"), '<input type="date" data-wf="wedding_date" value="' + esc(w.wedding_date || "") + '">') +
    row(t("Guest capacity"), '<input type="number" min="1" max="5000" inputmode="numeric" data-wf="guest_capacity" value="' + esc(w.guest_capacity || "") + '" placeholder="100">') +
    row(t("Currency"), '<select data-wf="currency">' + CURRENCIES.concat(CURRENCIES.indexOf(CUR()) < 0 ? [CUR()] : []).map((c) => '<option' + (c === CUR() ? " selected" : "") + ">" + c + "</option>").join("") + "</select>") +
    row(t("Default VAT %"), '<input data-ws="vat" inputmode="decimal" value="' + esc(s.vat ?? "") + '" placeholder="0">') +
    row(t("Wedding website (optional)"), '<input data-ws="website" type="url" value="' + esc(s.website || "") + '" placeholder="https://…">', true) +
    "</div></section>";

  h += '<section class="card" style="margin-top:12px"><h3 class="sub-sec">' + t("Event days") + '</h3><p class="hint" style="margin-top:0">' + t("Used for attendance per guest, people per day and the schedule.") + '</p><div class="olist">' +
    days.map((d: any, i: number) => '<div class="orow day3"><input data-day="' + esc(d.id) + '" data-dk="name" value="' + esc(d.name) + '" placeholder="' + t("Name, e.g. Friday") + '" maxlength="40"><input data-day="' + esc(d.id) + '" data-dk="short" value="' + esc(d.short) + '" placeholder="' + t("Short") + '" maxlength="6" class="short"><input data-day="' + esc(d.id) + '" data-dk="label" value="' + esc(d.label) + '" placeholder="' + t("What happens, e.g. Welcome dinner") + '" maxlength="60">' +
      '<span class="obtns">' + (i > 0 ? '<button class="icon" data-act="dayup" data-id="' + esc(d.id) + '" aria-label="' + t("Move up") + '">↑</button>' : "") + '<button class="icon" data-act="dayrm" data-id="' + esc(d.id) + '" aria-label="' + t("Remove") + '">×</button></span></div>').join("") +
    '<div class="chips"><button class="btn" data-act="dayadd" data-v="before">+ ' + t("Day before") + '</button><button class="btn" data-act="dayadd" data-v="after">+ ' + t("Day after") + "</button></div></div></section>";

  h += '<section class="card" style="margin-top:12px"><h3 class="sub-sec">' + t("Venue search") + '</h3><p class="hint" style="margin-top:0">' + t("Preferred months appear as calendars in the checklist to mark available dates.") + "</p>" +
    '<div class="chips">' + months.map((m: string) => { const p = m.split("-"); return '<button class="dchip" data-act="monrm" data-v="' + esc(m) + '" aria-label="' + esc(t("Remove {date}", { date: monthName(+p[1] - 1, +p[0]) })) + '">' + esc(monthName(+p[1] - 1, +p[0])) + "<span>×</span></button>"; }).join("") + "</div>" +
    '<div class="addq" style="margin-top:8px"><input type="month" id="mon-new" aria-label="' + t("Month") + '"><button class="btn" data-act="monadd">' + t("Add month") + "</button></div>" +
    '<p class="hint" style="margin:14px 0 6px">' + t("Periods to avoid (holidays, festivals) are hatched in the calendar.") + '</p><div class="olist">' +
    blocked.map((b: any, i: number) => '<div class="orow day3"><input data-bl="' + i + '" data-bk="label" value="' + esc(b.label) + '" placeholder="' + t("e.g. Easter holidays") + '" maxlength="60"><input type="date" data-bl="' + i + '" data-bk="from" value="' + esc(b.from) + '" aria-label="' + t("From") + '"><input type="date" data-bl="' + i + '" data-bk="to" value="' + esc(b.to) + '" aria-label="' + t("To") + '"><span class="obtns"><button class="icon" data-act="blrm" data-v="' + i + '" aria-label="' + t("Remove") + '">×</button></span></div>').join("") +
    '<div class="chips"><button class="btn" data-act="bladd">+ ' + t("Period") + "</button></div></div></section>";

  h += '<section class="card" style="margin-top:12px"><h3 class="sub-sec">' + t("Guest options") + '</h3><div class="fields"><div class="field"><label>' + t("Menus") + "</label>" + optList("menus", list("menus"), [], t("e.g. Fish")) + '</div><div class="field"><label>' + t("Accommodation") + "</label>" + optList("stays", list("stays"), ["onsite"], t("e.g. Hotel in town")) + "</div></div></section>";

  // partner
  h += '<section class="card" style="margin-top:12px"><h3 class="sub-sec">' + t("Plan together") + '</h3><ul class="plain">' +
    (W.members || []).map((m: any) => "<li>" + esc(m.user_id === W.meId ? (m.name || t("You")) + " (" + t("you") + ")" : (m.name || t("Partner"))) + (m.role === "owner" ? ' · <span class="hint">' + t("owner") + "</span>" : "") + "</li>").join("") + "</ul>" +
    '<p class="hint">' + t("Your partner installs Perfect Match, signs in and enters this code under “Join with code”. The code works once and expires after 7 days.") + "</p>" +
    (ui.inv && ui.inv.code ? '<div class="codebox"><code>' + esc(ui.inv.code) + '</code><button class="btn" data-act="invcopy">' + t("Copy") + '</button><button class="btn" data-act="invshare">' + t("Share") + "</button></div>" : '<button class="btn primary" data-act="invnew">' + t("Create invitation code") + "</button>") +
    (ui.inv && ui.inv.err ? '<p class="vis-msg err">' + esc(ui.inv.err) + "</p>" : "") + "</section>";

  // weddings
  const others = (W.weddings || []).filter((x: any) => x.id !== wid());
  h += '<section class="card" style="margin-top:12px"><h3 class="sub-sec">' + t("Weddings") + "</h3>" +
    (others.length ? '<div class="chips">' + others.map((x: any) => '<button class="btn" data-act="wswitch" data-id="' + x.id + '">' + esc([x.partner1_name, x.partner2_name].filter(Boolean).join(" & ") || t("Wedding")) + "</button>").join("") + "</div>" : "") +
    '<div class="chips" style="margin-top:8px"><button class="btn ghost" data-act="wnew">+ ' + t("New wedding or join with code") + "</button>" +
    (ui.wDel ? "" : (W.members || []).length > 1 ? '<button class="btn ghost" data-act="wdelask" data-v="leave">' + t("Leave this wedding") + "</button>" : owner ? '<button class="btn ghost danger" data-act="wdelask" data-v="delete">' + t("Delete this wedding") + "</button>" : "") + "</div>" +
    (ui.wDel ? '<div class="danger-box"><p style="margin-top:0">' + (ui.wDel === "leave" ? t("You lose access to this wedding. Your partner keeps everything.") : t("All guests, venues, tasks, photos and documents of this wedding are deleted permanently.")) + "</p>" +
      '<label class="hint" for="wdel-confirm">' + t("Type DELETE to confirm") + '</label><input id="wdel-confirm" autocomplete="off" style="margin:4px 0 8px">' +
      '<div class="chips"><button class="btn ghost" data-act="wdelno">' + t("Cancel") + '</button><button class="btn danger" data-act="wdel">' + (ui.wDel === "leave" ? t("Leave") : t("Delete permanently")) + "</button></div></div>" : "") + "</section>";

  // account
  const prov = (W.identities || []).map((x: string) => x === "email" ? t("Email & password") : x === "google" ? "Google" : x === "apple" ? "Apple" : x);
  const fac = (W.factors || []).find((f: any) => f.status === "verified");
  h += '<section class="card" style="margin-top:12px"><h3 class="sub-sec">' + t("Account") + '</h3><div class="fields">' +
    row(t("Your name (visible to your partner)"), '<input data-pf="display_name" value="' + esc(W.myName || "") + '" maxlength="80" autocomplete="name">') +
    row(t("Email"), '<input value="' + esc(W.email || "") + '" readonly>') + "</div>" +
    '<p class="hint">' + esc(t("Sign-in methods: {list}", { list: prov.join(", ") || "–" })) + "</p>";
  if ((W.identities || []).indexOf("email") >= 0) {
    const pw = ui.pw || {};
    h += pw.open ? '<div class="danger-box" style="border-color:var(--line)"><div class="fields">' +
      row(t("New password"), '<input type="password" id="pw-new" autocomplete="new-password" maxlength="128">') + row(t("Repeat"), '<input type="password" id="pw-rep" autocomplete="new-password" maxlength="128">') +
      (pw.nonce ? row(t("Code from the email"), '<input id="pw-nonce" inputmode="numeric" autocomplete="one-time-code" maxlength="10">') : "") + "</div>" +
      (pw.err ? '<p class="vis-msg err">' + esc(pw.err) + "</p>" : "") + '<div class="chips" style="margin-top:8px"><button class="btn ghost" data-act="pwno">' + t("Cancel") + '</button><button class="btn primary" data-act="pwsave">' + t("Change password") + "</button></div></div>"
      : '<button class="btn" data-act="pwopen">' + t("Change password") + "</button> ";
  }
  const mfa = ui.mfa || {};
  h += '<h4 style="margin:16px 0 6px">' + t("Two-factor authentication") + "</h4>";
  if (fac) h += '<p class="hint" style="margin-top:0">' + t("Active: signing in also needs a code from your authenticator app.") + "</p>" + (mfa.off ? '<div class="chips"><span>' + t("Turn off two-factor authentication?") + '</span><button class="btn danger" data-act="mfaoff">' + t("Turn off") + '</button><button class="btn ghost" data-act="mfaoffno">' + t("Cancel") + "</button></div>" : '<button class="btn ghost" data-act="mfaoffask">' + t("Turn off") + "</button>");
  else if (mfa.qr) h += '<p class="hint" style="margin-top:0">' + t("Scan the code with an authenticator app (e.g. Google Authenticator, Microsoft Authenticator, 1Password) and enter the 6-digit code.") + '</p><div class="mfa"><img src="' + esc(mfa.qr) + '" alt="' + t("QR code for the authenticator app") + '" width="180" height="180"><div><p class="hint">' + t("Or enter this key manually:") + "</p><code class=\"secret\">" + esc(mfa.secret) + '</code><input id="mfa-code" class="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456"><div class="chips" style="margin-top:8px"><button class="btn ghost" data-act="mfacancel">' + t("Cancel") + '</button><button class="btn primary" data-act="mfaverify">' + t("Activate") + "</button></div></div></div>" + (mfa.err ? '<p class="vis-msg err">' + esc(mfa.err) + "</p>" : "");
  else h += '<p class="hint" style="margin-top:0">' + t("Recommended: protect your guest data with a code from an authenticator app in addition to your password.") + '</p><button class="btn" data-act="mfaon">' + t("Set up two-factor authentication") + "</button>" + (mfa.err ? '<p class="vis-msg err">' + esc(mfa.err) + "</p>" : "");
  h += '<div class="chips" style="margin-top:16px"><button class="btn" data-act="signout">' + t("Sign out") + "</button></div></section>";

  // data & privacy
  h += '<section class="card" style="margin-top:12px"><h3 class="sub-sec">' + t("Data & privacy") + '</h3><p class="hint" style="margin-top:0">' + t("Your data is stored encrypted in the EU and is only visible to the people of this wedding. No ads, no tracking.") + "</p>" +
    '<div class="chips"><button class="btn" data-act="exportjson">' + t("Export all data (JSON)") + '</button><button class="btn" data-act="gexport">' + t("Export guest list (CSV)") + "</button></div>" +
    (SITE ? '<p style="margin:12px 0 0"><a href="' + esc(SITE) + '/privacy" target="_blank" rel="noopener noreferrer">' + t("Privacy policy") + '</a> · <a href="' + esc(SITE) + '/terms" target="_blank" rel="noopener noreferrer">' + t("Terms") + '</a> · <a href="' + esc(SITE) + '/imprint" target="_blank" rel="noopener noreferrer">' + t("Imprint") + "</a></p>" : "") +
    '<div class="danger-box" style="margin-top:14px"><b>' + t("Delete account") + '</b><p class="hint">' + t("Deletes your account. Weddings you plan alone are deleted with all photos and documents; shared weddings stay with your partner.") + "</p>" +
    (ui.accDel ? '<label class="hint" for="acc-confirm">' + t("Type DELETE to confirm") + '</label><input id="acc-confirm" autocomplete="off" style="margin:4px 0 8px"><div class="chips"><button class="btn ghost" data-act="accdelno">' + t("Cancel") + '</button><button class="btn danger" data-act="accdel">' + t("Delete account permanently") + "</button></div>" + (ui.accErr ? '<p class="vis-msg err">' + esc(ui.accErr) + "</p>" : "")
      : '<button class="btn danger" data-act="accdelask">' + t("Delete account") + "</button>") + "</div>" +
    '<p class="hint" style="margin:12px 0 0">' + esc(t("Version {v}", { v: VERSION }) + " · " + (w.premium ? t("Unlocked") : t("Free version"))) + "</p></section>";
  return h;
}

// ---------------------------------------------------------------- events
const rerender = () => hooks.render();
function exportJson() {
  const out: any = { app: "Perfect Match", exported: new Date().toISOString(), wedding: { partner1: W.w.partner1_name, partner2: W.w.partner2_name, date: W.w.wedding_date, capacity: W.w.guest_capacity, currency: W.w.currency, settings: W.w.settings } };
  for (const k of Object.keys(state)) if (!k.startsWith("_")) out[k] = state[k];
  return saveFile("perfect-match-export.json", new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
}

export function settingsClick(a: string, b: HTMLElement, _e: Event): boolean {
  const attr = (k: string) => b.getAttribute(k) as string;
  switch (a) {
    case "dayadd": {
      const days = list("days"), date = W.w.wedding_date ? new Date(W.w.wedding_date + "T12:00:00") : null;
      const idx = days.length; let name = "";
      if (date) { const off = attr("data-v") === "before" ? -(days.filter((d: any) => d.off < 0).length + 1) : days.filter((d: any) => (d.off || 0) > 0).length + 1; const d2 = new Date(date); d2.setDate(d2.getDate() + off); name = new Intl.DateTimeFormat(LOCALE, { weekday: "long" }).format(d2);
        const nd = { id: "d" + uid(6), name, short: name.slice(0, 2), label: "", off };
        if (off < 0) days.unshift(nd); else days.push(nd); }
      else days.splice(attr("data-v") === "before" ? 0 : idx, 0, { id: "d" + uid(6), name: t("Day {n}", { n: idx + 1 }), short: "", label: "" });
      setS("days", days, 0); rerender(); return true;
    }
    case "dayrm": setS("days", list("days").filter((d: any) => d.id !== attr("data-id")), 0); rerender(); return true;
    case "dayup": { const d = list("days"), i = d.findIndex((x: any) => x.id === attr("data-id")); if (i > 0) { const x = d[i]; d[i] = d[i - 1]; d[i - 1] = x; setS("days", d, 0); } rerender(); return true; }
    case "monadd": { const el = document.getElementById("mon-new") as HTMLInputElement | null, v = el && el.value; if (!v || !/^\d{4}-\d{2}$/.test(v)) { if (el) el.focus(); return true; } const m = list("months"); if (m.indexOf(v) < 0) m.push(v); setS("months", m.sort(), 0); rerender(); return true; }
    case "monrm": setS("months", list("months").filter((m: string) => m !== attr("data-v")), 0); rerender(); return true;
    case "bladd": setS("blocked", list("blocked").concat([{ label: "", from: "", to: "" }]), 0); rerender(); return true;
    case "blrm": { const bl = list("blocked"); bl.splice(+attr("data-v"), 1); setS("blocked", bl, 0); rerender(); return true; }
    case "optadd": { const k = attr("data-k"), el = document.getElementById("opt-new-" + k) as HTMLInputElement | null, v = el && el.value.trim(); if (!v) { if (el) el.focus(); return true; } setS(k, list(k).concat([{ id: k.slice(0, 1) + uid(6), name: v.slice(0, 60) }]), 0); rerender(); return true; }
    case "optrm": { const k = attr("data-k"); setS(k, list(k).filter((x: any) => x.id !== attr("data-id")), 0); rerender(); return true; }
    case "invnew":
      supabase.rpc("create_partner_invite", { p_wedding: wid() }).then(({ data, error }) => { ui.inv = error ? { err: /too many/i.test(error.message) ? t("Too many open codes. Use one of them first or wait until they expire.") : t("The code could not be created. Check your connection.") } : { code: data }; rerender(); });
      return true;
    case "invcopy": navigator.clipboard?.writeText(ui.inv.code).then(() => hooks.toast(t("Code copied."))); return true;
    case "invshare": Share.share({ text: t("Plan our wedding with me in Perfect Match. Code: {code}", { code: ui.inv.code }) }).catch(() => {}); return true;
    case "wswitch": nav.switchWedding(attr("data-id")); return true;
    case "wnew": nav.newWedding(); return true;
    case "wdelask": ui.wDel = attr("data-v"); rerender(); return true;
    case "wdelno": ui.wDel = null; rerender(); return true;
    case "wdel": {
      const c = document.getElementById("wdel-confirm") as HTMLInputElement | null;
      if (!c || c.value.trim().toUpperCase() !== "DELETE") { if (c) c.focus(); return true; }
      (async () => {
        if (ui.wDel === "leave") { const { error } = await supabase.from("wedding_members").delete().eq("wedding_id", wid()).eq("user_id", W.meId); if (error) { hooks.toast(t("That did not work. Please try again."), true); return; } }
        else { const files = await listAll(wid()); if (files.length) await removeFiles(wid(), files); const { error } = await supabase.from("weddings").delete().eq("id", wid()); if (error) { hooks.toast(t("That did not work. Please try again."), true); return; } }
        ui.wDel = null; W.weddings = (W.weddings || []).filter((x: any) => x.id !== wid()); nav.switchWedding("");
      })();
      return true;
    }
    case "pwopen": ui.pw = { open: true }; rerender(); return true;
    case "pwno": ui.pw = null; rerender(); return true;
    case "pwsave": {
      const n = (document.getElementById("pw-new") as HTMLInputElement).value, r = (document.getElementById("pw-rep") as HTMLInputElement).value, nonce = (document.getElementById("pw-nonce") as HTMLInputElement | null)?.value.trim();
      const prob = passwordProblem(n, W.email); if (prob) { ui.pw.err = prob; rerender(); return true; }
      if (n !== r) { ui.pw.err = t("The passwords do not match."); rerender(); return true; }
      setPassword(n, nonce || undefined).then(() => { ui.pw = null; hooks.toast(t("Password changed.")); rerender(); }, async (e) => {
        if (/reauthentication/i.test(String(e.message || e.code))) { await sendReauth().catch(() => {}); ui.pw.nonce = true; ui.pw.err = t("For your security we sent a code to your email. Enter it and save again."); }
        else ui.pw.err = authMessage(e);
        rerender();
      });
      return true;
    }
    case "mfaon": enrollTotp().then((r) => { ui.mfa = { ...r }; rerender(); }, (e) => { ui.mfa = { err: authMessage(e) }; rerender(); }); return true;
    case "mfacancel": if (ui.mfa && ui.mfa.id) supabase.auth.mfa.unenroll({ factorId: ui.mfa.id }).catch(() => {}); ui.mfa = null; rerender(); return true;
    case "mfaverify": {
      const c = (document.getElementById("mfa-code") as HTMLInputElement).value;
      confirmTotp(ui.mfa.id, c).then(async () => { ui.mfa = null; W.factors = await totpFactors(); hooks.toast(t("Two-factor authentication is active.")); rerender(); }, (e) => { ui.mfa.err = authMessage(e); rerender(); });
      return true;
    }
    case "mfaoffask": ui.mfa = { off: true }; rerender(); return true;
    case "mfaoffno": ui.mfa = null; rerender(); return true;
    case "mfaoff": {
      const f = (W.factors || []).find((x: any) => x.status === "verified");
      if (f) removeTotp(f.id).then(async () => { ui.mfa = null; W.factors = await totpFactors(); hooks.toast(t("Two-factor authentication turned off.")); rerender(); }, (e) => { ui.mfa = { err: authMessage(e) }; rerender(); });
      return true;
    }
    case "signout": nav.signedOut(); return true;
    case "accdelask": ui.accDel = true; ui.accErr = ""; rerender(); return true;
    case "accdelno": ui.accDel = false; rerender(); return true;
    case "accdel": {
      const c = document.getElementById("acc-confirm") as HTMLInputElement | null;
      if (!c || c.value.trim().toUpperCase() !== "DELETE") { if (c) c.focus(); return true; }
      nav.deleteAccount().catch(() => { ui.accErr = t("The account could not be deleted. Check your connection and try again."); rerender(); });
      return true;
    }
    case "exportjson": exportJson().catch(() => hooks.toast(t("Export failed."), true)); return true;
    case "exportcsv": saveFile(t("guests") + ".csv", new Blob([guestsCsv()], { type: "text/csv;charset=utf-8" })).catch(() => {}); return true;
  }
  return false;
}

export function settingsInput(el: HTMLInputElement): boolean {
  const g = (k: string) => el.getAttribute(k);
  if (g("data-wf") && el.tagName === "INPUT" && el.type !== "date" && el.type !== "number") { saveWedding({ [g("data-wf") as string]: el.value.slice(0, 80) }); return true; }
  if (g("data-ws")) { setS(g("data-ws") as string, el.value.trim().slice(0, 300)); return true; }
  if (g("data-day")) { const d = list("days"), x = d.find((y: any) => y.id === g("data-day")); if (x) { x[g("data-dk") as string] = el.value; setS("days", d); } return true; }
  if (g("data-bl")) { const b = list("blocked"), x = b[+(g("data-bl") as string)]; if (x) { x[g("data-bk") as string] = el.value; setS("blocked", b); } return true; }
  if (g("data-opt")) { const k = g("data-opt") as string, o = list(k), x = o.find((y: any) => y.id === g("data-id")); if (x) { x.name = el.value.slice(0, 60); setS(k, o); } return true; }
  if (g("data-pf")) {
    W.myName = el.value.slice(0, 80);
    clearTimeout((settingsInput as any)._t);
    (settingsInput as any)._t = setTimeout(() => { supabase.from("profiles").update({ display_name: W.myName }).eq("id", W.meId).then(({ error }) => { if (error) hooks.toast(t("Settings could not be saved. Check your connection."), true); }); }, 700);
    return true;
  }
  return false;
}

export function settingsChange(el: HTMLInputElement): boolean {
  const f = el.getAttribute("data-wf");
  if (!f) return !!(el.getAttribute("data-ws") || el.getAttribute("data-day") || el.getAttribute("data-bl") || el.getAttribute("data-opt") || el.getAttribute("data-pf"));
  if (f === "wedding_date") { saveWedding({ wedding_date: el.value || null }, 0); rerender(); }
  else if (f === "guest_capacity") { const n = parseInt(el.value, 10); saveWedding({ guest_capacity: n > 0 && n <= 5000 ? n : null }, 0); rerender(); }
  else if (f === "currency") { saveWedding({ currency: el.value }, 0); rerender(); }
  else { saveWedding({ [f]: el.value.slice(0, 80) }, 0); rerender(); }
  return true;
}
