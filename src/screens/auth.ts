// Sign-in screens in the planner's look: Google, Apple, email + password, confirmation code, password reset, second factor.
import { t, esc } from "../planner/ctx";
import {
  signInWithProvider, signInPassword, signUpPassword, confirmSignUp, resendSignUp, sendReset, verifyReset, setPassword,
  passwordProblem, authMessage, verifySecondFactor, type Provider,
} from "../lib/auth";
import { mountCaptcha, captchaToken, captchaEnabled } from "../lib/captcha";
import { supabase, isNative } from "../lib/supabase";

type Mode = "signin" | "signup" | "confirm" | "forgot" | "reset" | "mfa";
const SITE = ((import.meta.env.VITE_PUBLIC_SITE_URL as string) || "").replace(/\/$/, "");
const S: { mode: Mode; email: string; err: string; info: string; busy: boolean } = { mode: "signin", email: "", err: "", info: "", busy: false };
let root: HTMLElement, done: () => void;

const head = (sub: string) => '<header class="top auth-top"><div><h1>Perfect <em>Match</em></h1><p class="sub">' + sub + "</p></div></header>";
const msg = () => (S.err ? '<p class="vis-msg err" role="alert">' + esc(S.err) + "</p>" : "") + (S.info ? '<p class="vis-msg" role="status">' + esc(S.info) + "</p>" : "");
const legal = () => SITE ? '<p class="hint auth-legal">' + t("By continuing you accept the {terms} and the {privacy}.", { terms: '<a href="' + esc(SITE) + '/terms" target="_blank" rel="noopener noreferrer">' + t("terms") + "</a>", privacy: '<a href="' + esc(SITE) + '/privacy" target="_blank" rel="noopener noreferrer">' + t("privacy policy") + "</a>" }) + "</p>" : "";
const field = (id: string, label: string, type: string, auto: string, extra = "") => '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" type="' + type + '" autocomplete="' + auto + '" ' + extra + "></div>";

function view(): string {
  const busy = S.busy ? " disabled" : "";
  if (S.mode === "mfa") return head(t("Two-factor authentication")) + '<section class="card auth-card"><p style="margin-top:0">' + t("Enter the 6-digit code from your authenticator app.") + "</p>" +
    field("a-code", t("Code"), "text", "one-time-code", 'inputmode="numeric" maxlength="6" class="otp"') + msg() +
    '<button class="btn primary wide" data-auth="mfa"' + busy + ">" + t("Confirm") + '</button><button class="btn ghost wide" data-auth="out">' + t("Use another account") + "</button></section>";
  if (S.mode === "confirm") return head(t("Confirm your email")) + '<section class="card auth-card"><p style="margin-top:0">' + esc(t("We sent a 6-digit code to {email}. Enter it here to activate your account.", { email: S.email })) + "</p>" +
    field("a-code", t("Code"), "text", "one-time-code", 'inputmode="numeric" maxlength="8" class="otp"') + msg() +
    '<button class="btn primary wide" data-auth="confirm"' + busy + ">" + t("Activate account") + '</button><div class="auth-links"><button class="lnk" data-auth="resend">' + t("Send code again") + '</button><button class="lnk" data-auth="to-signin">' + t("Back") + '</button></div><div id="captcha"></div></section>';
  if (S.mode === "forgot") return head(t("Reset password")) + '<section class="card auth-card"><p style="margin-top:0">' + t("Enter your email. If an account exists, you will receive a code to set a new password.") + "</p>" +
    field("a-email", t("Email"), "email", "email", 'value="' + esc(S.email) + '" maxlength="254"') + msg() +
    '<div id="captcha"></div><button class="btn primary wide" data-auth="forgot"' + busy + ">" + t("Send code") + '</button><div class="auth-links"><button class="lnk" data-auth="to-signin">' + t("Back") + "</button></div></section>";
  if (S.mode === "reset") return head(t("New password")) + '<section class="card auth-card"><p style="margin-top:0">' + esc(t("Enter the code sent to {email} and choose a new password.", { email: S.email })) + "</p>" +
    field("a-code", t("Code"), "text", "one-time-code", 'inputmode="numeric" maxlength="8" class="otp"') + field("a-pw", t("New password"), "password", "new-password", 'maxlength="128"') + field("a-pw2", t("Repeat password"), "password", "new-password", 'maxlength="128"') +
    '<p class="hint">' + t("At least 10 characters with upper and lower case letters and digits or symbols – or a longer passphrase.") + "</p>" + msg() +
    '<button class="btn primary wide" data-auth="reset"' + busy + ">" + t("Save password") + '</button><div class="auth-links"><button class="lnk" data-auth="to-signin">' + t("Back") + "</button></div></section>";
  const up = S.mode === "signup";
  return head(t("Plan your wedding together – guests, venues, budget, seating and schedule in one place.")) +
    '<section class="card auth-card">' +
    '<button class="btn sso" data-auth="google"' + busy + '>' + t("Continue with Google") + "</button>" +
    '<button class="btn sso" data-auth="apple"' + busy + '>' + t("Continue with Apple") + "</button>" +
    '<div class="or"><span>' + t("or with email and password") + "</span></div>" +
    '<div class="seg full" role="tablist"><button class="' + (up ? "" : "on") + '" data-auth="to-signin" role="tab" aria-selected="' + !up + '">' + t("Sign in") + '</button><button class="' + (up ? "on" : "") + '" data-auth="to-signup" role="tab" aria-selected="' + up + '">' + t("Create account") + "</button></div>" +
    field("a-email", t("Email"), "email", "email", 'value="' + esc(S.email) + '" maxlength="254" autocapitalize="off"') +
    field("a-pw", t("Password"), "password", up ? "new-password" : "current-password", 'maxlength="128"') +
    (up ? field("a-pw2", t("Repeat password"), "password", "new-password", 'maxlength="128"') + '<p class="hint">' + t("At least 10 characters with upper and lower case letters and digits or symbols – or a longer passphrase.") + "</p>" : "") +
    msg() + '<div id="captcha"></div>' +
    '<button class="btn primary wide" data-auth="' + (up ? "signup" : "signin") + '"' + busy + ">" + (up ? t("Create account") : t("Sign in")) + "</button>" +
    (up ? "" : '<div class="auth-links"><button class="lnk" data-auth="to-forgot">' + t("Forgot password?") + "</button></div>") +
    "</section>" + legal();
}

function draw() {
  root.innerHTML = view();
  if (captchaEnabled && ["signin", "signup", "forgot", "confirm"].includes(S.mode)) mountCaptcha(document.getElementById("captcha"));
  const first = root.querySelector("#a-code, #a-email") as HTMLInputElement | null;
  if (first && !(first.id === "a-email" && first.value)) first.focus();
}
const val = (id: string) => ((document.getElementById(id) as HTMLInputElement | null)?.value || "").trim();
const raw = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value || "";
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

async function run(fn: () => Promise<void>) {
  S.busy = true; S.err = ""; draw();
  try { await fn(); } catch (e) { S.err = authMessage(e); }
  S.busy = false; draw();
}

async function onClick(a: string) {
  S.info = "";
  if (a.startsWith("to-")) { const keep = val("a-email"); if (keep) S.email = keep; S.mode = a.slice(3) as Mode; S.err = ""; draw(); return; }
  if (a === "google" || a === "apple") { await run(() => signInWithProvider(a as Provider).then(() => { if (isNative) done(); })); return; }
  if (a === "signin") {
    const e = val("a-email").toLowerCase(), p = raw("a-pw"); S.email = e;
    if (!emailOk(e) || !p) { S.err = t("Enter your email and password."); draw(); return; }
    await run(async () => { try { await signInPassword(e, p, await captchaToken()); } catch (err: any) { if (/not confirmed/i.test(err?.message || "")) { S.mode = "confirm"; S.info = t("Please confirm your email address first."); return; } throw err; } done(); });
    return;
  }
  if (a === "signup") {
    const e = val("a-email").toLowerCase(), p = raw("a-pw"), p2 = raw("a-pw2"); S.email = e;
    if (!emailOk(e)) { S.err = t("Please enter a valid email address."); draw(); return; }
    const prob = passwordProblem(p, e); if (prob) { S.err = prob; draw(); return; }
    if (p !== p2) { S.err = t("The passwords do not match."); draw(); return; }
    await run(async () => { await signUpPassword(e, p, await captchaToken()); S.mode = "confirm"; });
    return;
  }
  if (a === "confirm") {
    const c = val("a-code"); if (c.replace(/\D/g, "").length < 6) { S.err = t("Enter the code from the email."); draw(); return; }
    await run(async () => { await confirmSignUp(S.email, c); done(); });
    return;
  }
  if (a === "resend") { await run(async () => { await resendSignUp(S.email, await captchaToken()); S.info = t("We sent a new code."); }); return; }
  if (a === "forgot") {
    const e = val("a-email").toLowerCase(); S.email = e; if (!emailOk(e)) { S.err = t("Please enter a valid email address."); draw(); return; }
    await run(async () => { await sendReset(e, await captchaToken()); S.mode = "reset"; });
    return;
  }
  if (a === "reset") {
    const c = val("a-code"), p = raw("a-pw"), p2 = raw("a-pw2");
    const prob = passwordProblem(p, S.email); if (prob) { S.err = prob; draw(); return; }
    if (p !== p2) { S.err = t("The passwords do not match."); draw(); return; }
    await run(async () => {
      await verifyReset(S.email, c);
      // A second factor, if set up, is needed before the password may be changed.
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (data && data.nextLevel === "aal2" && data.currentLevel !== "aal2") { S.mode = "mfa"; S.info = t("Confirm with your authenticator app, then set the new password in Settings."); return; }
      await setPassword(p); done();
    });
    return;
  }
  if (a === "mfa") { const c = val("a-code"); await run(async () => { await verifySecondFactor(c); done(); }); return; }
  if (a === "out") { await supabase.auth.signOut(); S.mode = "signin"; draw(); }
}

function onKey(e: KeyboardEvent) {
  if (e.key !== "Enter" || !root.contains(e.target as Node)) return;
  const btn = root.querySelector(".btn.primary.wide") as HTMLButtonElement | null; if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
}

/** Shows the sign-in flow; resolves when the user is signed in (with second factor if required). */
export function showAuth(el: HTMLElement, mode: Mode = "signin", error = ""): Promise<void> {
  root = el; root.className = "wrap auth"; S.mode = mode; S.err = error; S.info = ""; S.busy = false;
  return new Promise((resolve) => {
    const click = (e: Event) => { const b = (e.target as HTMLElement).closest("[data-auth]") as HTMLElement | null; if (b && root.contains(b)) onClick(b.getAttribute("data-auth") as string); };
    done = () => { root.removeEventListener("click", click); document.removeEventListener("keydown", onKey); resolve(); };
    root.addEventListener("click", click); document.addEventListener("keydown", onKey);
    draw();
  });
}
