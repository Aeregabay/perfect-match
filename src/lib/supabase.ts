import { createClient, type SupportedStorage } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
export const configured = Boolean(url && anonKey);
export const isNative = Capacitor.isNativePlatform();

/** Where Google/Apple send the user back: a custom scheme on Android (PKCE protects the code), the web app otherwise. */
export const OAUTH_REDIRECT = isNative
  ? "app.perfectmatch.planner://login-callback"
  : `${window.location.origin}/`;

// On Android the session (incl. PKCE verifier) lives in Keystore-backed secure storage, never in plain WebView storage.
const nativeStorage: SupportedStorage = {
  async getItem(key) { const v = await SecureStorage.get(key); return typeof v === "string" ? v : null; },
  async setItem(key, value) { await SecureStorage.set(key, value); },
  async removeItem(key) { await SecureStorage.remove(key); },
};

export const supabase = createClient(url || "http://localhost", anonKey || "missing", {
  auth: {
    storage: isNative ? nativeStorage : window.localStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});
