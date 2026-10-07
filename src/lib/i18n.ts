// Translation layer. The English text in the code is the source; other languages map it in
// src/i18n/<lang>.json ({"English source": "Translation"}). `npm run i18n:extract` lists every source string.
type Dict = Record<string, string>;
const dicts: Record<string, Dict> = {};
let current: Dict = {};
let lang = "en";

/** Locale for dates, times and numbers: the device locale, so formats feel native even before translations exist. */
export const LOCALE: string = (() => {
  const cands = typeof navigator !== "undefined" ? [...(navigator.languages || []), navigator.language] : [];
  for (const c of cands) {
    try { const l = Intl.getCanonicalLocales(String(c).split("@")[0].replace("_", "-"))[0]; if (l) { new Intl.NumberFormat(l); return l; } } catch { /* try next */ }
  }
  return "en";
})();

export function registerLanguage(code: string, dict: Dict) { dicts[code] = dict; }
export function setLanguage(code: string) {
  current = dicts[code] ?? {};
  lang = dicts[code] ? code : "en";
  document.documentElement.lang = lang;
}

function fill(s: string, vars?: Record<string, string | number>) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function t(s: string, vars?: Record<string, string | number>): string {
  return fill(current[s] ?? s, vars);
}

/** Plural: tp("{n} invitation", "{n} invitations", n). Translations key the pair as "one|other" with forms joined by "|". */
export function tp(one: string, other: string, n: number, vars?: Record<string, string | number>): string {
  const all = { n, ...vars };
  const tr = current[one + "|" + other];
  if (tr) {
    const forms = tr.split("|");
    const rules = ["zero", "one", "two", "few", "many", "other"];
    const r = new Intl.PluralRules(lang).select(n);
    const cats = new Intl.PluralRules(lang).resolvedOptions().pluralCategories as string[];
    const ordered = rules.filter((x) => cats.includes(x));
    return fill(forms[ordered.indexOf(r)] ?? forms[forms.length - 1], all);
  }
  return fill(new Intl.PluralRules("en").select(n) === "one" ? one : other, all);
}
