// Cloudflare Turnstile bot protection for sign-up, sign-in and password reset (active when a site key is configured).
const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string) || "";
export const captchaEnabled = !!SITE_KEY;

type TS = { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id: string) => void; remove: (id: string) => void };
declare global { interface Window { turnstile?: TS } }

let loader: Promise<TS> | null = null;
function load(): Promise<TS> {
  if (!loader) loader = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true; s.onload = () => (window.turnstile ? res(window.turnstile) : rej(new Error("captcha"))); s.onerror = () => { loader = null; rej(new Error("captcha")); };
    document.head.appendChild(s);
  });
  return loader;
}

let widget = "", token = "", waiters: ((t: string) => void)[] = [];

/** Mounts the widget into the element (no-op without site key). */
export async function mountCaptcha(el: HTMLElement | null) {
  if (!captchaEnabled || !el) return;
  try {
    const ts = await load();
    if (widget) { try { ts.remove(widget); } catch { /* */ } }
    token = "";
    widget = ts.render(el, {
      sitekey: SITE_KEY, appearance: "interaction-only", theme: "auto",
      callback: (tok: string) => { token = tok; waiters.splice(0).forEach((w) => w(tok)); },
      "expired-callback": () => { token = ""; },
    });
  } catch { /* the server rejects the request and the user sees a message */ }
}

/** Token for the next auth request (single use; the widget resets afterwards). */
export async function captchaToken(): Promise<string | undefined> {
  if (!captchaEnabled) return undefined;
  const tok = token || await new Promise<string>((res) => { waiters.push(res); setTimeout(() => res(""), 15000); });
  token = "";
  if (window.turnstile && widget) { try { window.turnstile.reset(widget); } catch { /* */ } }
  return tok || undefined;
}
