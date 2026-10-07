import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource/figtree/400.css";
import "@fontsource/figtree/500.css";
import "@fontsource/figtree/600.css";
import "@fontsource/figtree/700.css";
import "./styles/app.css";
import { supabase, configured } from "./lib/supabase";
import { initOAuthListener, completeWebOAuth, needsSecondFactor, authMessage } from "./lib/auth";
import { cacheWipe } from "./lib/securecache";
import { setLanguage, t } from "./lib/i18n";
import { W, readPref, writePref, esc } from "./planner/ctx";
import { startPlanner, stopPlanner } from "./planner/app";
import { nav } from "./planner/views/settings";
import { showAuth } from "./screens/auth";
import { showOnboarding } from "./screens/onboarding";

setLanguage("en");
const app = document.getElementById("app") as HTMLElement;
let flowRunning = false, signingOut = false;

function busy(text: string) { app.className = "wrap"; app.innerHTML = '<p class="hint" style="padding-top:24px">' + esc(text) + "</p>"; }

async function loadWeddings() {
  const { data, error } = await supabase.from("weddings").select("*").order("created_at");
  if (error) throw error;
  W.weddings = data || [];
  return W.weddings;
}

async function openWedding(id: string) {
  let ws = W.weddings || [];
  if (!ws.find((w: any) => w.id === id)) ws = await loadWeddings();
  const w = ws.find((x: any) => x.id === id) || ws[0];
  if (!w) return flow();
  writePref("pm-wedding", w.id);
  await startPlanner(app, w);
}

/** Session → second factor → wedding → planner. */
async function flow(authError = "") {
  if (flowRunning) return; flowRunning = true;
  try {
    stopPlanner();
    let { data: { session } } = await supabase.auth.getSession();
    if (!session) { await showAuth(app, "signin", authError); session = (await supabase.auth.getSession()).data.session; }
    if (!session) return;
    while (await needsSecondFactor()) await showAuth(app, "mfa");
    if (!(await supabase.auth.getSession()).data.session) { setTimeout(() => flow(), 0); return; }
    busy(t("Loading…"));
    const { data: u } = await supabase.auth.getUser();
    W.meId = u.user?.id || ""; W.email = u.user?.email || "";
    W.identities = Array.from(new Set((u.user?.identities || []).map((i) => i.provider)));
    let ws: any[] = [];
    try { ws = await loadWeddings(); } catch { ws = []; }
    let id = readPref("pm-wedding");
    if (!ws.find((w) => w.id === id)) id = ws[0] ? ws[0].id : "";
    if (!id) {
      id = await showOnboarding(app, false);
      if (!id) { setTimeout(() => flow(), 0); return; }
      await loadWeddings();
    }
    await openWedding(id);
  } finally { flowRunning = false; }
}

nav.switchWedding = (id: string) => { stopPlanner(); if (!id) { writePref("pm-wedding", ""); flow(); return; } openWedding(id); };
nav.newWedding = async () => { stopPlanner(); const id = await showOnboarding(app, true); if (id) { await loadWeddings(); openWedding(id); } else openWedding(readPref("pm-wedding")); };
nav.signedOut = async () => { signingOut = true; stopPlanner(); await cacheWipe(); writePref("pm-wedding", ""); try { sessionStorage.clear(); } catch { /* */ } await supabase.auth.signOut(); signingOut = false; flow(); };
nav.deleteAccount = async () => {
  const { error } = await supabase.functions.invoke("delete-account", { method: "POST" });
  if (error) throw error;
  signingOut = true; stopPlanner(); await cacheWipe(); writePref("pm-wedding", "");
  await supabase.auth.signOut({ scope: "local" }); signingOut = false;
  app.className = "wrap auth"; app.innerHTML = '<header class="top auth-top"><div><h1>Perfect <em>Match</em></h1></div></header><section class="card auth-card"><p style="margin:0">' + esc(t("Your account has been deleted.")) + '</p><button class="btn primary wide" id="again">' + esc(t("OK")) + "</button></section>";
  document.getElementById("again")?.addEventListener("click", () => flow());
};

supabase.auth.onAuthStateChange((ev) => {
  if (ev === "SIGNED_OUT" && !signingOut && W.sync) { stopPlanner(); cacheWipe(); setTimeout(() => flow(), 0); }
});

async function boot() {
  if (!configured) {
    app.innerHTML = '<header class="top"><div><h1>Perfect <em>Match</em></h1><p class="sub">Missing configuration: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see docs/SETUP.md).</p></div></header>';
    return;
  }
  initOAuthListener();
  let err = "";
  try { err = (await completeWebOAuth()) || ""; } catch (e) { err = authMessage(e); }
  flow(err && err !== "cancelled" ? t("Sign-in with this provider did not work. Please try again.") : "");
}
boot();
