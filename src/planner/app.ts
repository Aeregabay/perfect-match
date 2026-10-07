// Planner shell: header, navigation, sync status, rendering, file handling, start/stop.
import { state, ui, W, hooks, t, esc, resetState, resetUi, wid, uid } from "./ctx";
import { cur, vp, VPMAX, pItem, archivedQ, archivedLocs, closeTask, agClose, defaultDay } from "./data";
import { renderHome } from "./views/home";
import { renderGuests } from "./views/guests";
import { renderSeat, renderAgenda, renderTasks, renderTaskModal, renderAgModal } from "./views/others";
import { renderCheck, renderCmp, renderPlan, renderArch, renderModal, renderGal, renderDoc } from "./views/venues";
import { renderSettings, loadMembers } from "./views/settings";
import { ICON_GEAR } from "./views/common";
import { Sync } from "../lib/sync";
import { collect, apply } from "./store";
import { onFileLoaded, uploadFile, resizeImage, removeFiles, fileBlob, clearFileCache } from "../lib/files";
import { saveFile } from "../lib/save";
import { supabase } from "../lib/supabase";
import "./events";
import { histInit, histTouch, histUI, histAbsorb, histFinish, dropLater } from "./history";

const LOCSUB = ["cmp", "check", "plan", "arch"];
let root: HTMLElement;
let renderPending = false;

function initials() {
  const w = W.w || {};
  const a = (w.partner1_name || "").trim().charAt(0).toUpperCase(), b = (w.partner2_name || "").trim().charAt(0).toUpperCase();
  return a || b ? esc(a) + "&amp;" + esc(b) : "";
}

function navHtml() {
  const inLoc = LOCSUB.indexOf(ui.tab) >= 0; if (inLoc) ui.locSub = ui.tab;
  return [["home", t("Overview")], ["loc", t("Venues")], ["guests", t("Guests")], ["seat", t("Seating")], ["agenda", t("Schedule")], ["tasks", t("Tasks")]].map((x) => {
    const on = x[0] === "loc" ? inLoc : ui.tab === x[0];
    return '<button class="tab ' + (on ? "on" : "") + '" data-act="tab" data-v="' + x[0] + '" role="tab" aria-selected="' + on + '"><svg class="ti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + TICO[x[0]] + '</svg><span class="tl">' + x[1] + "</span></button>";
  }).join("");
}
const TICO: Record<string, string> = {
  home: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  loc: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  guests: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M17 14.5c2.3.2 4 1.7 4.5 4.5"/>',
  seat: '<circle cx="12" cy="12" r="4"/><circle cx="12" cy="3.5" r="1.5"/><circle cx="12" cy="20.5" r="1.5"/><circle cx="3.5" cy="12" r="1.5"/><circle cx="20.5" cy="12" r="1.5"/>',
  agenda: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  tasks: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1.3 1.3L7 5M3.5 12l1.3 1.3L7 11M3.5 18l1.3 1.3L7 17"/>',
};
const I_UNDO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>';
const I_REDO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>';
function subNavHtml() {
  if (LOCSUB.indexOf(ui.tab) < 0) return "";
  return '<div class="subwrap"><div class="subnav seg" role="tablist" aria-label="' + t("Venues") + '">' + [["cmp", t("Comparison")], ["check", t("Checklist")], ["plan", t("Planning")], ["arch", t("Archive") + '<span class="acnt"> (' + (archivedQ().length + archivedLocs().length) + ")</span>"]].map((x) =>
    '<button class="' + (ui.tab === x[0] ? "on" : "") + '" data-act="tab" data-v="' + x[0] + '" role="tab" aria-selected="' + (ui.tab === x[0]) + '">' + x[1] + "</button>").join("") + "</div></div>";
}

export function render(soft = false) {
  if (!root) return;
  // Never rebuild the page under the user's fingers while typing; partner updates wait until the field is left.
  const ae = document.activeElement as HTMLElement | null;
  if (soft && ae && root.contains(ae) && /^(INPUT|TEXTAREA)$/.test(ae.tagName) && (ae as HTMLInputElement).type !== "checkbox") { renderPending = true; return; }
  renderPending = false;
  const y = window.scrollY;
  const lb0 = document.querySelector(".locbar"); if (lb0) ui.locX = lb0.scrollLeft;
  let h = '<header class="top"><div><h1>' + t("Wedding") + " <em>" + (initials() || t("Planner")) + "</em></h1></div>" +
    '<div class="topr"><div id="status" class="status"></div>' +
    '<button id="hundo" class="hbtn" data-act="undo" type="button" aria-label="' + t("Undo") + '" disabled>' + I_UNDO + "</button>" +
    '<button id="hredo" class="hbtn" data-act="redo" type="button" aria-label="' + t("Redo") + '" disabled>' + I_REDO + "</button>" +
    '<button id="savefab" class="savefab" data-act="save" type="button"></button>' +
    '<button class="hbtn gear' + (ui.tab === "settings" ? " on" : "") + '" data-act="tab" data-v="settings" aria-label="' + t("Settings") + '" title="' + t("Settings") + '">' + ICON_GEAR + "</button></div></header>" +
    '<nav class="tabs"><div class="tabs-sc" role="tablist">' + navHtml() + "</div></nav>" + subNavHtml();
  h += ui.tab === "check" ? renderCheck() : ui.tab === "cmp" ? renderCmp() : ui.tab === "plan" ? renderPlan() : ui.tab === "guests" ? renderGuests() : ui.tab === "seat" ? renderSeat() : ui.tab === "tasks" ? renderTasks() : ui.tab === "home" ? renderHome() : ui.tab === "agenda" ? renderAgenda() : ui.tab === "settings" ? renderSettings() : renderArch();
  h += renderModal();
  if (ui.gal) h += renderGal();
  if (ui.doc) h += renderDoc();
  if (ui.tEdit && ui.tab === "tasks") h += renderTaskModal();
  if (ui.agEdit && ui.tab === "agenda") h += renderAgModal();
  setTimeout(fillPdf, 0);
  document.body.style.overflow = (ui.gal || ui.doc) ? "hidden" : "";
  root.innerHTML = h; renderStatus();
  // Sticky offsets: desktop tabs on top; mobile compact header on top, tabs at the bottom.
  const mob = window.matchMedia("(max-width:760px)").matches, tb = document.querySelector(mob ? "header.top" : ".tabs") as HTMLElement | null, sn = document.querySelector(".subwrap") as HTMLElement | null;
  if (tb) { document.documentElement.style.setProperty("--tabs-h", tb.offsetHeight + "px"); document.documentElement.style.setProperty("--stick-h", (tb.offsetHeight + (sn ? sn.offsetHeight : 0)) + "px"); }
  const tsc = document.querySelector(".tabs-sc") as HTMLElement | null, ton = tsc && (tsc.querySelector(".tab.on") as HTMLElement | null);
  if (tsc && ton && tsc.scrollWidth > tsc.clientWidth) tsc.scrollLeft = Math.max(0, ton.offsetLeft - tsc.offsetLeft - 24);
  const lb = document.querySelector(".locbar") as HTMLElement | null;
  if (lb) {
    lb.scrollLeft = ui.locX || 0;
    const on = lb.querySelector(".loc-chip.on") as HTMLElement | null;
    if (on) { const l = on.offsetLeft - lb.offsetLeft, r = l + on.offsetWidth; if (l < lb.scrollLeft) lb.scrollLeft = Math.max(0, l - 16); else if (r > lb.scrollLeft + lb.clientWidth) lb.scrollLeft = r - lb.clientWidth + 16; }
    ui.locX = lb.scrollLeft;
    lb.addEventListener("scroll", () => { ui.locX = lb.scrollLeft; }, { passive: true });
    stuckCheck();
  }
  const mi = document.getElementById("arch-reason"), mb = document.querySelector(".modal [data-act=modalok]") as HTMLElement | null; if (mi) mi.focus(); else if (mb) mb.focus();
  window.scrollTo(0, y);
}
document.addEventListener("focusout", () => { setTimeout(() => { if (renderPending) render(); }, 0); });

function stuckCheck() { const lb = document.querySelector(".locbar"); if (!lb) return; const top = parseFloat(getComputedStyle(lb).top) || 0; lb.classList.toggle("stuck", lb.getBoundingClientRect().top <= top + 0.5 && window.scrollY > 0); }
window.addEventListener("scroll", stuckCheck, { passive: true });

const I_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const I_BUSY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite"/></path></svg>';
const I_LOCAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="2"/><path d="M11 18h2"/></svg>';

export function renderStatus() {
  const el = document.getElementById("status"), b = document.getElementById("savefab") as HTMLButtonElement | null;
  const s = W.sync; if (!s) return;
  let cls = "status", txt = "", fcls = "savefab", ft = t("Saved"), ic = I_OK, dis = true;
  if (s.status === "loading") { cls += " local"; txt = t("Connecting…"); ft = t("Loading"); ic = I_BUSY; }
  else if (s.status === "offline") { cls += " err"; txt = s.pending ? t("Offline – changes are kept on this device and sent automatically") : t("Offline"); ft = s.pending ? t("On this device") : t("Offline"); ic = I_LOCAL; fcls += s.pending ? " err" : ""; dis = !s.pending; }
  else if (s.status === "saving" || s.pending) { cls += " pending"; txt = t("Saving…"); ft = t("Saving…"); ic = I_BUSY; fcls += " busy"; }
  else { txt = t("All saved"); }
  if (el) { el.className = cls; el.innerHTML = '<span class="dot"></span><span>' + esc(txt) + "</span>"; }
  histUI();
  if (b) { b.className = fcls; b.innerHTML = ic + '<span class="ft">' + esc(ft) + "</span>"; b.disabled = dis; b.title = ft; b.setAttribute("aria-label", ft); }
}

export function markDirty() {
  state.updatedAt = Date.now();
  if (W.sync) W.sync.touch();
  stashUI(); histTouch();
}
function stashUI() { try { sessionStorage.setItem("pm-ui", JSON.stringify({ tab: ui.tab, loc: ui.loc, filter: ui.filter, must: ui.must, closed: ui.closed, lx: ui.locX, cs: ui.cmpSort })); } catch { /* */ } }
function restoreUI() { try { const s = JSON.parse(sessionStorage.getItem("pm-ui") || "null"); if (s) { ui.tab = s.tab || ui.tab; ui.loc = s.loc; ui.filter = s.filter || "all"; ui.must = !!s.must; ui.closed = s.closed || {}; ui.locX = s.lx || 0; ui.cmpSort = s.cs || "top"; } } catch { /* */ } }
export { stashUI };

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string, err?: boolean) {
  let el = document.getElementById("toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.className = "toast" + (err ? " err" : ""); el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el!.hidden = true; }, 4200);
}

// ---------------------------------------------------------------- files
export const MAXFILE = 12000000;
export async function addVisitPhotos(l: any, files0: FileList | null) {
  let files = Array.from(files0 || []).filter((f) => !f.type || f.type.indexOf("image/") === 0);
  if (!l || !files.length) return;
  const free = VPMAX - vp(l).length; let skipped = 0;
  if (free <= 0) { ui.galErr = true; ui.galMsg = t("Maximum {max} visit photos per venue. Delete a photo first.", { max: VPMAX }); render(); return; }
  if (files.length > free) { skipped = files.length - free; files = files.slice(0, free); }
  const total = files.length, first = vp(l).length; let done = 0, added = 0, failed = "";
  ui.galErr = false; ui.galMsg = t("Uploading photos… {a} / {b}", { a: 0, b: total }); render();
  for (const f of files) {
    const bl = await resizeImage(f, 1600, 0.72, 450000);
    done++;
    if (bl) {
      const pid = uid(), path = "vp/" + pid + ".jpg";
      try { await uploadFile(wid(), path, bl, "image/jpeg"); l.visitPhotos = vp(l); l.visitPhotos.push({ id: pid, f: path, size: bl.size, at: Date.now() }); added++; markDirty(); }
      catch (e: any) { failed = uploadError(e); }
    }
    ui.galMsg = t("Uploading photos… {a} / {b}", { a: done, b: total }); const m = document.getElementById("vis-msg"); if (m) m.textContent = ui.galMsg;
  }
  ui.galMsg = failed ? failed : !added ? t("The photo could not be read.") : skipped ? t("Limit of {max} photos reached: {n} not added.", { max: VPMAX, n: skipped }) : "";
  ui.galErr = !!failed || !added || skipped > 0;
  if (added) { ui.gal = { lid: l.id, i: first, confirm: false }; if (skipped || failed) ui.gal.msg = ui.galMsg; }
  render();
}
export function uploadError(e: any): string {
  const m = String((e && (e.message || e.error)) || "");
  if (/row-level security|policy|403|Unauthorized/i.test(m)) return t("File limit of the free version reached (40 files).");
  if (/fetch|network|Failed/i.test(m) || !navigator.onLine) return t("Uploading needs an internet connection.");
  if (/size|large|413/i.test(m)) return t("The file is too large (max. 12 MB).");
  return t("Upload failed. Please try again.");
}
export async function addPlanFiles(l: any, sid: string, files0: FileList | null) {
  const files = Array.from(files0 || []); if (!l || !files.length) return;
  const it = pItem(l, sid), errs: string[] = []; let done = 0;
  ui.planErr = false; ui.planMsg = t("Uploading files… {a} / {b}", { a: 0, b: files.length }); render();
  for (const f of files) {
    done++;
    const id = uid(); let blob: Blob | null = null, ext = "", type = "";
    if (f.type === "application/pdf" || /\.pdf$/i.test(f.name || "")) {
      if (f.size > MAXFILE) { errs.push(t("“{name}” is larger than 12 MB.", { name: f.name })); continue; }
      const head = new Uint8Array(await f.slice(0, 5).arrayBuffer());
      if (String.fromCharCode(...head) !== "%PDF-") { errs.push(t("“{name}” is not a valid PDF.", { name: f.name })); continue; }
      blob = f; ext = "pdf"; type = "application/pdf";
    } else if (!f.type || f.type.indexOf("image/") === 0) {
      blob = await resizeImage(f, 2000, 0.82, 900000); ext = "jpg"; type = "image/jpeg";
      if (!blob) { errs.push(t("“{name}” could not be read.", { name: f.name })); continue; }
    } else { errs.push(t("“{name}”: only PDF or images.", { name: f.name })); continue; }
    const path = "pf/" + id + "." + ext;
    try { await uploadFile(wid(), path, blob, type); it.files = it.files || []; it.files.push({ id, name: (f.name || "file." + ext).slice(0, 120), type, f: path, size: blob.size, at: Date.now() }); markDirty(); }
    catch (e) { errs.push(uploadError(e)); }
    ui.planMsg = t("Uploading files… {a} / {b}", { a: done, b: files.length }); const m = document.getElementById("plan-msg"); if (m) m.textContent = ui.planMsg;
  }
  ui.planMsg = errs.join(" "); ui.planErr = errs.length > 0; render();
}
export async function setCoverPhoto(l: any, f: File) {
  const bl = await resizeImage(f, 900, 0.75, 200000); if (!bl) { toast(t("The photo could not be read."), true); return; }
  const path = "ph/" + uid() + ".jpg", old = l.photo;
  try { await uploadFile(wid(), path, bl, "image/jpeg"); } catch (e) { toast(uploadError(e), true); return; }
  l.photo = path; markDirty(); render();
  if (old) dropFile(old);
}
/** Removed photos/documents stay restorable via undo; they leave storage once no undo step uses them. */
export function dropFile(path: string) { dropLater(path); }

export async function downloadDoc(f: any) {
  try {
    const blob = await fileBlob(wid(), f.f);
    const fn = f.type === "application/pdf" ? (/\.pdf$/i.test(f.name) ? f.name : f.name + ".pdf") : f.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg";
    await saveFile(fn, blob);
  } catch { toast(t("File not found."), true); }
}

let pdfjs: Promise<any> | null = null;
function loadPdf() {
  // Legacy build: includes polyfills for older Android WebViews.
  if (!pdfjs) pdfjs = Promise.all([import("pdfjs-dist/legacy/build/pdf.mjs"), import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")]).then(([lib, w]) => { lib.GlobalWorkerOptions.workerSrc = w.default; return lib; });
  return pdfjs;
}
function fillPdf() {
  const box = document.getElementById("pdfv"); if (!box || box.getAttribute("data-done")) return; box.setAttribute("data-done", "1");
  const p = box.getAttribute("data-p") as string;
  Promise.all([loadPdf(), fileBlob(wid(), p).then((b) => b.arrayBuffer())]).then(([lib, buf]) => lib.getDocument({ data: buf, isEvalSupported: false }).promise).then(async (doc: any) => {
    if (document.getElementById("pdfv") !== box) return; box.innerHTML = "";
    const W2 = Math.min(box.clientWidth - 16, 1000), dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (let n = 1; n <= doc.numPages; n++) {
      const pg = await doc.getPage(n), v0 = pg.getViewport({ scale: 1 }), sc = W2 / v0.width, vpt = pg.getViewport({ scale: sc * dpr });
      const c = document.createElement("canvas"); c.width = vpt.width; c.height = vpt.height; c.style.width = Math.round(vpt.width / dpr) + "px"; box.appendChild(c);
      await pg.render({ canvasContext: c.getContext("2d"), viewport: vpt, canvas: c }).promise;
    }
  }).catch((e: unknown) => { void e; if (document.getElementById("pdfv") === box) box.innerHTML = '<p class="gal-empty">' + esc(t("The PDF could not be displayed. Use “Download”.")) + "</p>"; });
}

// ---------------------------------------------------------------- start / stop
let limitShown = 0;
export async function startPlanner(el: HTMLElement, wedding: any) {
  stopPlanner();
  root = el; root.className = "wrap";
  resetState(); resetUi(); restoreUI();
  W.w = wedding; ui.agDay = defaultDay();
  hooks.render = () => render(); hooks.markDirty = markDirty; hooks.status = renderStatus; hooks.toast = toast;
  onFileLoaded(() => render(true));
  const sync = new Sync(wedding.id, {
    collect, apply,
    changed: () => { histAbsorb(); render(true); },
    status: () => renderStatus(),
    rejected: (code, kind) => {
      if (Date.now() - limitShown < 1500) return; limitShown = Date.now();
      const text = code === "FREE_LIMIT_GUESTS" ? t("The free version includes up to 30 guests (including companions and children).")
        : code === "FREE_LIMIT_VENUES" ? t("The free version includes up to 2 venues. Archive or delete one, or unlock Perfect Match.")
        : code === "ITEM_LIMIT" ? t("This wedding has reached the maximum number of entries.") : t("The change could not be saved ({kind}).", { kind });
      ui.modal = { kind: "limit", text }; render();
    },
    wedding: (row) => { if (!W.w || row.id !== W.w.id) return; const keepSettings = ui.tab === "settings" && document.activeElement && root.contains(document.activeElement); W.w = { ...W.w, ...row }; if (!keepSettings) render(true); },
  });
  W.sync = sync;
  render();
  histInit(() => { if (W.sync) W.sync.touch(); stashUI(); render(); }, (paths) => { removeFiles(wid(), paths); });
  await sync.start();
  histInit(() => { if (W.sync) W.sync.touch(); stashUI(); render(); }, (paths) => { removeFiles(wid(), paths); });
  loadMembers().then(() => { if (ui.tab === "settings") render(); });
  render();
}
export function stopPlanner() {
  if (W.sync) histFinish();
  if (W.sync) { W.sync.stop(); W.sync = null; }
  clearFileCache();
}

export { closeTask, agClose, cur, supabase };
