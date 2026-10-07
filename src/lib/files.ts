// Photos and documents in the private storage bucket. Paths inside a wedding look like "vp/<id>.jpg".
import { supabase } from "./supabase";

const BUCKET = "wedding-files";
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
const urls = new Map<string, string>();
const blobs = new Map<string, Blob>();
const loading = new Set<string>();
let onLoaded: () => void = () => {};
let timer: ReturnType<typeof setTimeout> | undefined;

export function onFileLoaded(fn: () => void) { onLoaded = fn; }

/** Object URL for a stored file; starts the download on first use and calls onFileLoaded when ready. */
export function fileUrl(wid: string, path: string | undefined): string {
  if (!path) return "";
  if (path.startsWith("data:") || path.startsWith("blob:")) return path;
  const k = wid + "/" + path;
  const u = urls.get(k);
  if (u) return u;
  if (!loading.has(k)) {
    loading.add(k);
    supabase.storage.from(BUCKET).download(k).then(({ data }) => {
      loading.delete(k);
      if (data) { blobs.set(k, data); urls.set(k, URL.createObjectURL(data)); clearTimeout(timer); timer = setTimeout(() => onLoaded(), 60); }
    }, () => loading.delete(k));
  }
  return PIXEL;
}

export async function fileBlob(wid: string, path: string): Promise<Blob> {
  const k = wid + "/" + path;
  const b = blobs.get(k);
  if (b) return b;
  const { data, error } = await supabase.storage.from(BUCKET).download(k);
  if (error || !data) throw error ?? new Error("download failed");
  blobs.set(k, data);
  return data;
}

export async function uploadFile(wid: string, path: string, blob: Blob, contentType: string): Promise<void> {
  const k = wid + "/" + path;
  const { error } = await supabase.storage.from(BUCKET).upload(k, blob, { contentType, upsert: false, cacheControl: "3600" });
  if (error) throw error;
  blobs.set(k, blob);
  urls.set(k, URL.createObjectURL(blob));
}

export async function removeFiles(wid: string, paths: string[]): Promise<boolean> {
  const list = paths.filter((p) => p && !p.startsWith("data:")).map((p) => wid + "/" + p);
  if (!list.length) return true;
  const { error } = await supabase.storage.from(BUCKET).remove(list);
  list.forEach((k) => { const u = urls.get(k); if (u) URL.revokeObjectURL(u); urls.delete(k); blobs.delete(k); });
  return !error;
}

/** Every file of a wedding (used before deleting the wedding). */
export async function listAll(wid: string): Promise<string[]> {
  const out: string[] = [];
  for (const area of ["ph", "vp", "pf"]) {
    const { data } = await supabase.storage.from(BUCKET).list(wid + "/" + area, { limit: 1000 });
    (data ?? []).forEach((f) => out.push(area + "/" + f.name));
  }
  return out;
}

export function clearFileCache() {
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls.clear(); blobs.clear(); loading.clear();
}

/**
 * Re-encodes an image as JPEG on the device: scales it down and drops all metadata (GPS position, camera, owner).
 * Lowers quality until the result is below maxBytes.
 */
export async function resizeImage(file: Blob, maxSide = 1024, quality = 0.72, maxBytes = 0): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    let q = quality;
    const enc = (qq: number) => new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", qq));
    let out = await enc(q);
    while (out && maxBytes && out.size > maxBytes && q > 0.3) { q -= 0.08; out = await enc(q); }
    return out;
  } catch { return null; }
}
