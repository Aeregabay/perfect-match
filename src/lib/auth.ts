// Sign-in: Google, Apple, or email + password (email confirmed with a code). Optional authenticator app (TOTP) as second factor.
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { supabase, isNative, OAUTH_REDIRECT } from "./supabase";
import { t } from "./i18n";

export type Provider = "google" | "apple";

const COMMON = ["password", "passwort", "1234567890", "qwertzuiop", "qwertyuiop", "iloveyou", "letmein", "welcome", "wedding", "hochzeit"];
/** Returns a problem description, or "" when the password is acceptable. */
export function passwordProblem(pw: string, email = ""): string {
  if (pw.length < 10) return t("Use at least 10 characters.");
  if (pw.length > 128) return t("Use at most 128 characters.");
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes < 3 && pw.length < 16) return t("Mix upper and lower case letters, digits or symbols – or use a longer passphrase (16+ characters).");
  const low = pw.toLowerCase();
  if (COMMON.some((c) => low.includes(c))) return t("This password is too easy to guess.");
  const local = email.split("@")[0].toLowerCase();
  if (local.length >= 4 && low.includes(local)) return t("Don’t use your email address in the password.");
  return "";
}

/** Translates auth errors into plain language without revealing whether an account exists. */
export function authMessage(e: unknown): string {
  const m = String((e as { message?: string })?.message || e || "");
  const code = String((e as { code?: string })?.code || "");
  if (/invalid login credentials|invalid_credentials/i.test(m + code)) return t("Email or password is not correct.");
  if (/email not confirmed|email_not_confirmed/i.test(m + code)) return t("Please confirm your email address first.");
  if (/expired|invalid.*(otp|token)|otp_expired/i.test(m + code)) return t("The code is wrong or has expired.");
  if (/rate limit|too many|over_request_rate_limit|over_email_send_rate_limit/i.test(m + code)) return t("Too many attempts. Please wait a few minutes.");
  if (/weak|pwned|leaked|weak_password/i.test(m + code)) return t("This password appears in known data leaks. Please choose another one.");
  if (/captcha/i.test(m)) return t("The security check failed. Please try again.");
  if (/reauthentication/i.test(m + code)) return t("Please confirm with the code we sent to your email.");
  if (/fetch|network|Failed to/i.test(m)) return t("No connection. Please check your internet connection.");
  if (/already registered|user_already_exists/i.test(m + code)) return t("Please check your inbox for the confirmation code.");
  return t("That did not work. Please try again.");
}

export async function signInPassword(email: string, password: string, captchaToken?: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } });
  if (error) throw error;
}

/** Creates the account; the user then confirms with the 6-digit code from the email. */
export async function signUpPassword(email: string, password: string, captchaToken?: string) {
  const { error } = await supabase.auth.signUp({ email, password, options: { captchaToken } });
  // Supabase answers like a success for existing addresses (no account enumeration); the code step follows either way.
  if (error && !/already registered/i.test(error.message)) throw error;
}
export async function confirmSignUp(email: string, code: string) {
  const { error } = await supabase.auth.verifyOtp({ email, token: code.replace(/\D/g, ""), type: "email" });
  if (error) throw error;
}
export async function resendSignUp(email: string, captchaToken?: string) {
  const { error } = await supabase.auth.resend({ type: "signup", email, options: { captchaToken } });
  if (error) throw error;
}
export async function sendReset(email: string, captchaToken?: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { captchaToken });
  if (error) throw error;
}
export async function verifyReset(email: string, code: string) {
  const { error } = await supabase.auth.verifyOtp({ email, token: code.replace(/\D/g, ""), type: "recovery" });
  if (error) throw error;
}
export async function setPassword(password: string, nonce?: string) {
  const { error } = await supabase.auth.updateUser(nonce ? { password, nonce } : { password });
  if (error) throw error;
}
export async function sendReauth() {
  const { error } = await supabase.auth.reauthenticate();
  if (error) throw error;
}

// ---------------------------------------------------------------- Google / Apple
let pending: ((err?: string) => void) | null = null;

export async function signInWithProvider(p: Provider): Promise<void> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: p,
    options: { redirectTo: OAUTH_REDIRECT, skipBrowserRedirect: isNative, queryParams: p === "google" ? { prompt: "select_account" } : undefined },
  });
  if (error) throw error;
  if (!isNative) return; // the browser navigates to the provider and comes back with ?code=
  await new Promise<void>((resolve, reject) => {
    pending = (err) => { pending = null; if (err) reject(new Error(err)); else resolve(); };
    Browser.open({ url: data.url, presentationStyle: "popover" }).catch((e) => { pending = null; reject(e); });
  });
}

async function finish(url: string) {
  const u = new URL(url);
  const params = new URLSearchParams(u.search || u.hash.replace(/^#/, ""));
  const code = params.get("code"), err = params.get("error_description") || params.get("error");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return error ? error.message : undefined;
  }
  return err || "cancelled";
}

/** Android: Custom Tab redirects to app.perfectmatch.planner://login-callback?code=… */
export function initOAuthListener() {
  if (!isNative) return;
  App.addListener("appUrlOpen", async ({ url }) => {
    if (!url.startsWith(OAUTH_REDIRECT)) return;
    try { await Browser.close(); } catch { /* already closed */ }
    const err = await finish(url);
    if (pending) pending(err);
  });
  Browser.addListener("browserFinished", () => { setTimeout(() => { if (pending) pending("cancelled"); }, 1500); });
}

/** Web: the provider sends the browser back to the app with ?code=… */
export async function completeWebOAuth(): Promise<string | undefined> {
  if (isNative) return;
  const q = new URLSearchParams(location.search);
  if (!q.get("code") && !q.get("error")) return;
  const err = await finish(location.href);
  history.replaceState(null, "", location.pathname);
  return err;
}

// ---------------------------------------------------------------- second factor (authenticator app)
export async function needsSecondFactor(): Promise<boolean> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return !!data && data.nextLevel === "aal2" && data.currentLevel !== "aal2";
}
export async function verifySecondFactor(code: string) {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  const f = data.totp.find((x) => x.status === "verified");
  if (!f) throw new Error("no factor");
  const r = await supabase.auth.mfa.challengeAndVerify({ factorId: f.id, code: code.replace(/\D/g, "") });
  if (r.error) throw r.error;
}
export async function totpFactors() {
  const { data } = await supabase.auth.mfa.listFactors();
  return data ? data.totp : [];
}
export async function enrollTotp() {
  // Remove unfinished enrolments first, otherwise Supabase refuses a new one with the same name.
  const { data: list } = await supabase.auth.mfa.listFactors();
  for (const f of (list?.all || []).filter((x) => x.status !== "verified")) await supabase.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Perfect Match " + new Date().getFullYear() });
  if (error) throw error;
  return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}
export async function confirmTotp(factorId: string, code: string) {
  const r = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\D/g, "") });
  if (r.error) throw r.error;
}
export async function removeTotp(factorId: string) {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
  await supabase.auth.refreshSession();
}
