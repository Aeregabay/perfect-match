// First steps: create a wedding or join your partner's wedding with a code.
import { t, esc, uid } from "../planner/ctx";
import { CURRENCIES } from "../planner/views/settings";
import { supabase } from "../lib/supabase";
import { LOCALE } from "../lib/i18n";

function guessCurrency(): string {
  const r = (LOCALE.split("-")[1] || "").toUpperCase();
  const map: Record<string, string> = { CH: "CHF", LI: "CHF", US: "USD", GB: "GBP", CA: "CAD", AU: "AUD", NZ: "NZD", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", BG: "BGN", RS: "RSD", TR: "TRY", IL: "ILS", AE: "AED", ZA: "ZAR", IN: "INR", JP: "JPY", CN: "CNY", SG: "SGD", HK: "HKD", BR: "BRL", MX: "MXN" };
  return map[r] || "EUR";
}

/** Defaults derived from the wedding date: the wedding day, four months around it, two menus, staying on site. */
export function defaultSettings(date: string | null) {
  const s: any = { vat: 0, website: "", menus: [{ id: "meat", name: t("Meat") }, { id: "veg", name: t("Vegetarian") }], stays: [{ id: "onsite", name: t("At the venue") }], blocked: [] };
  const d = date ? new Date(date + "T12:00:00") : null;
  const wd = d ? new Intl.DateTimeFormat(LOCALE, { weekday: "long" }).format(d) : t("Wedding day");
  s.days = [{ id: "main", name: wd, short: wd.slice(0, 2), label: t("Wedding"), off: 0 }];
  const base = d || new Date(new Date().getFullYear(), new Date().getMonth() + 9, 1);
  s.months = [-1, 0, 1, 2].map((o) => { const m = new Date(base.getFullYear(), base.getMonth() + o, 1); return m.getFullYear() + "-" + String(m.getMonth() + 1).padStart(2, "0"); });
  return s;
}

/** Resolves with the id of the created or joined wedding (or "" when cancelled). */
export function showOnboarding(el: HTMLElement, canCancel: boolean): Promise<string> {
  el.className = "wrap auth";
  let mode: "create" | "join" = "create", err = "", busy = false;
  const cur = guessCurrency();
  const draw = () => {
    el.innerHTML = '<header class="top auth-top"><div><h1>Perfect <em>Match</em></h1><p class="sub">' + t("Let’s set up your wedding.") + "</p></div></header>" +
      '<section class="card auth-card"><div class="seg full"><button class="' + (mode === "create" ? "on" : "") + '" data-ob="m-create">' + t("New wedding") + '</button><button class="' + (mode === "join" ? "on" : "") + '" data-ob="m-join">' + t("Join with code") + "</button></div>" +
      (mode === "create"
        ? '<div class="fields" style="margin-top:12px"><div class="field"><label for="o-p1">' + t("Your name") + '</label><input id="o-p1" maxlength="80" autocomplete="given-name"></div><div class="field"><label for="o-p2">' + t("Your partner’s name") + '</label><input id="o-p2" maxlength="80" autocomplete="off"></div>' +
          '<div class="field"><label for="o-date">' + t("Wedding date (if known)") + '</label><input id="o-date" type="date"></div><div class="field"><label for="o-cap">' + t("Expected guests") + '</label><input id="o-cap" type="number" inputmode="numeric" min="1" max="5000" placeholder="100"></div>' +
          '<div class="field"><label for="o-cur">' + t("Currency") + '</label><select id="o-cur">' + CURRENCIES.map((c) => "<option" + (c === cur ? " selected" : "") + ">" + c + "</option>").join("") + "</select></div></div>"
        : '<p class="hint">' + t("Your partner creates the code in Perfect Match under Settings → Plan together.") + '</p><div class="field"><label for="o-code">' + t("Invitation code") + '</label><input id="o-code" class="otp" maxlength="11" autocomplete="off" autocapitalize="characters" placeholder="ABCDE-FGHJK"></div>') +
      (err ? '<p class="vis-msg err" role="alert">' + esc(err) + "</p>" : "") +
      '<button class="btn primary wide" data-ob="go"' + (busy ? " disabled" : "") + ">" + (mode === "create" ? t("Create wedding") : t("Join")) + "</button>" +
      (canCancel ? '<div class="auth-links"><button class="lnk" data-ob="cancel">' + t("Cancel") + "</button></div>" : '<div class="auth-links"><button class="lnk" data-ob="out">' + t("Sign out") + "</button></div>") + "</section>";
  };
  return new Promise((resolve) => {
    const finish = (v: string) => { el.removeEventListener("click", click); resolve(v); };
    const click = async (e: Event) => {
      const b = (e.target as HTMLElement).closest("[data-ob]") as HTMLElement | null; if (!b) return;
      const a = b.getAttribute("data-ob");
      if (a === "m-create" || a === "m-join") { mode = a.slice(2) as "create" | "join"; err = ""; draw(); return; }
      if (a === "cancel") { finish(""); return; }
      if (a === "out") { await supabase.auth.signOut(); finish(""); return; }
      if (a !== "go" || busy) return;
      const vals: Record<string, string> = {};
      el.querySelectorAll("input,select").forEach((i) => { vals[i.id] = ((i as HTMLInputElement).value || "").trim(); });
      const v = (id: string) => vals[id] || "";
      busy = true; err = ""; draw();
      el.querySelectorAll("input,select").forEach((i) => { if (vals[i.id] !== undefined) (i as HTMLInputElement).value = vals[i.id]; });
      if (mode === "create") {
        const date = v("o-date") || null, cap = parseInt(v("o-cap"), 10);
        const { data, error } = await supabase.rpc("create_wedding", { p_partner1: v("o-p1"), p_partner2: v("o-p2"), p_date: date, p_capacity: cap > 0 && cap <= 5000 ? cap : null, p_currency: v("o-cur") || cur, p_settings: defaultSettings(date) });
        busy = false;
        if (error) { err = /too many/i.test(error.message) ? t("You can plan up to 5 weddings.") : t("The wedding could not be created. Check your connection."); draw(); el.querySelectorAll("input,select").forEach((i) => { if (vals[i.id] !== undefined) (i as HTMLInputElement).value = vals[i.id]; }); return; }
        if (v("o-p1")) await supabase.from("profiles").update({ display_name: v("o-p1") }).eq("id", (await supabase.auth.getUser()).data.user?.id || uid());
        finish(data as string);
      } else {
        const { data, error } = await supabase.rpc("accept_partner_invite", { p_code: v("o-code") });
        busy = false;
        if (error) { const keep = vals["o-code"]; setTimeout(() => { const c = document.getElementById("o-code") as HTMLInputElement | null; if (c) c.value = keep; }, 0); err = /INVITE_INVALID/.test(error.message) ? t("This code is not valid or has expired.") : /too many/i.test(error.message) ? t("You can plan up to 5 weddings.") : t("That did not work. Please try again."); draw(); return; }
        finish(data as string);
      }
    };
    el.addEventListener("click", click);
    draw();
  });
}
