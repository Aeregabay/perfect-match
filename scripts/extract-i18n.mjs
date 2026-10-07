// Lists every English source text used with t("…") / tp("…", "…") and writes src/i18n/catalog.json.
// Translators copy it to src/i18n/<lang>.json and fill in the values. Plurals use the key "one|other".
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../src");
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.ts$/.test(f)) files.push(p); } })(root);

const str = String.raw`"((?:[^"\\]|\\.)*)"`;
const single = new RegExp(String.raw`\bt\(\s*` + str, "g");
const plural = new RegExp(String.raw`\btp\(\s*` + str + String.raw`\s*,\s*` + str, "g");
const out = {};
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(plural)) out[JSON.parse(`"${m[1]}"`) + "|" + JSON.parse(`"${m[2]}"`)] = "";
  for (const m of src.matchAll(single)) out[JSON.parse(`"${m[1]}"`)] = "";
}
// Question texts, category names, services and tags are passed through t() as data.
const data = fs.readFileSync(path.join(root, "planner/data.ts"), "utf8");
for (const m of data.matchAll(/\["[a-z]\d{1,2}", "[mwo]", "((?:[^"\\]|\\.)*)"(?:, "((?:[^"\\]|\\.)*)")?\]/g)) { out[JSON.parse(`"${m[1]}"`)] = ""; if (m[2]) out[JSON.parse(`"${m[2]}"`)] = ""; }
for (const m of data.matchAll(/\{ id: "\w+", t: "((?:[^"\\]|\\.)*)"/g)) out[JSON.parse(`"${m[1]}"`)] = "";
for (const m of data.matchAll(/\["ps\d+", "((?:[^"\\]|\\.)*)"\]/g)) out[JSON.parse(`"${m[1]}"`)] = "";
for (const m of data.matchAll(/=> \[([^\]]+)\]\.map\(\(x\) => t\(x\)\)/g)) for (const s of m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)) out[JSON.parse(`"${s[1]}"`)] = "";

const sorted = Object.fromEntries(Object.keys(out).sort((a, b) => a.localeCompare(b)).map((k) => [k, ""]));
fs.mkdirSync(path.join(root, "i18n"), { recursive: true });
fs.writeFileSync(path.join(root, "i18n/catalog.json"), JSON.stringify(sorted, null, 2) + "\n");
console.log(Object.keys(sorted).length + " texts → src/i18n/catalog.json");
