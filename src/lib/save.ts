// Hands a file to the user: share sheet on Android (save to Files, Drive, email …), download in the browser.
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { isNative } from "./supabase";

function toBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
}

export async function saveFile(name: string, blob: Blob): Promise<void> {
  const safe = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 120) || "file";
  if (isNative) {
    const path = "share/" + safe;
    const w = await Filesystem.writeFile({ path, data: await toBase64(blob), directory: Directory.Cache, recursive: true });
    try { await Share.share({ title: safe, files: [w.uri] }); }
    finally { setTimeout(() => { Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {}); }, 120000); }
    return;
  }
  const u = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = u; a.download = safe; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 10000);
}
