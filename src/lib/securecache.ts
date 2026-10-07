// Encrypted offline copy of the planner on the device (AES-256-GCM).
// Android: the key lives in the Keystore-backed secure storage. Web: a non-extractable key in IndexedDB.
import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import { isNative } from "./supabase";

const DB = "perfect-match", STORE = "kv", KEY_NAME = "pm-cache-key";

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet<T>(k: string): Promise<T | undefined> {
  const db = await idb();
  return new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(k); q.onsuccess = () => res(q.result as T); q.onerror = () => rej(q.error); });
}
async function idbSet(k: string, v: unknown): Promise<void> {
  const db = await idb();
  return new Promise((res, rej) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).put(v, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}
async function idbClear(): Promise<void> {
  const db = await idb();
  return new Promise((res, rej) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).clear(); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

let keyP: Promise<CryptoKey | null> | null = null;
function key(): Promise<CryptoKey | null> {
  if (!keyP) keyP = (async () => {
    if (!globalThis.crypto?.subtle || !globalThis.indexedDB) return null;
    if (isNative) {
      let raw = (await SecureStorage.get(KEY_NAME)) as string | null;
      if (!raw) { raw = b64(crypto.getRandomValues(new Uint8Array(32))); await SecureStorage.set(KEY_NAME, raw); }
      return crypto.subtle.importKey("raw", unb64(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
    }
    let k = await idbGet<CryptoKey>(KEY_NAME);
    if (!k) { k = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); await idbSet(KEY_NAME, k); }
    return k;
  })().catch(() => null);
  return keyP;
}

export async function cachePut(name: string, value: unknown): Promise<void> {
  try {
    const k = await key(); if (!k) return;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(JSON.stringify(value)));
    await idbSet("c:" + name, { iv, ct });
  } catch { /* the cache is a convenience; the server copy is authoritative */ }
}

export async function cacheGet<T>(name: string): Promise<T | null> {
  try {
    const k = await key(); if (!k) return null;
    const rec = await idbGet<{ iv: Uint8Array; ct: ArrayBuffer }>("c:" + name);
    if (!rec) return null;
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: rec.iv as BufferSource }, k, rec.ct);
    return JSON.parse(new TextDecoder().decode(pt)) as T;
  } catch { return null; }
}

/** Removes every cached planner and the cache key (sign-out, account deletion). */
export async function cacheWipe(): Promise<void> {
  keyP = null;
  try { await idbClear(); } catch { /* ignore */ }
  if (isNative) { try { await SecureStorage.remove(KEY_NAME); } catch { /* ignore */ } }
}
