// CopyDash — photos of a rebuilt PDF page: replace a picture, crop / zoom it
// inside its frame (table pdf_photo_edits, migration 0011).
//
// A picture keeps its frame (position, size, rounded corners, opacity) from
// the PDF. What changes is the image drawn in it and where: `zoom` scales
// the image around the frame's centre, `dx`/`dy` (PDF points) move it. The
// image always covers its frame — moving or zooming out stops at the edges.

import type { SupabaseClient } from "@supabase/supabase-js";

type Box = [number, number, number, number];

export interface PhotoEdit {
  /** "<page index>:<layer index>" in the rebuilt model. */
  piece: string;
  /** Uploaded photo in the 'pdfs' bucket; null = the original picture, re-cropped. */
  path: string | null;
  zoom: number;
  dx: number;
  dy: number;
}

export const MAX_ZOOM = 4;
/** Longest side of an uploaded photo once resized (px). */
const MAX_SIDE = 2400;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export async function loadPhotoEdits(supabase: SupabaseClient, pageId: string): Promise<Record<string, PhotoEdit>> {
  const { data, error } = await supabase.from("pdf_photo_edits").select("piece, path, zoom, dx, dy").eq("page_id", pageId);
  if (error) throw error;
  const out: Record<string, PhotoEdit> = {};
  for (const r of data ?? []) out[r.piece] = { piece: r.piece, path: r.path, zoom: Number(r.zoom), dx: Number(r.dx), dy: Number(r.dy) };
  return out;
}

export async function savePhotoEdit(supabase: SupabaseClient, pageId: string, e: PhotoEdit): Promise<void> {
  const { error } = await supabase.from("pdf_photo_edits").upsert({ page_id: pageId, piece: e.piece, path: e.path, zoom: e.zoom, dx: e.dx, dy: e.dy });
  if (error) throw error;
}

export async function deletePhotoEdit(supabase: SupabaseClient, pageId: string, piece: string): Promise<void> {
  const { error } = await supabase.from("pdf_photo_edits").delete().eq("page_id", pageId).eq("piece", piece);
  if (error) throw error;
}

/**
 * Resizes the chosen file (longest side ≤ 2400 px), uploads it to the page's
 * photos folder and returns its storage path. PNGs with transparency stay
 * PNG, everything else becomes JPEG.
 */
export async function uploadPhoto(supabase: SupabaseClient, projectId: string, pageId: string, piece: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file (JPEG, PNG, WebP…).");
  if (file.size > MAX_FILE_BYTES) throw new Error("This image is larger than 25 MB.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This image can't be read. Try a JPEG or PNG.");
  }
  const k = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * k));
  canvas.height = Math.max(1, Math.round(bitmap.height * k));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image processing is not available in this browser.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const png = file.type === "image/png" && hasTransparency(ctx, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Image encoding failed"))), png ? "image/png" : "image/jpeg", 0.9),
  );
  const path = `${projectId}/pages/${pageId}/photos/${Date.now()}-${piece.replace(":", "-")}.${png ? "png" : "jpg"}`;
  const { error } = await supabase.storage.from("pdfs").upload(path, blob, { contentType: blob.type });
  if (error) throw error;
  return path;
}

function hasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const d = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < d.length; i += 16) if (d[i] < 250) return true;
  return false;
}

/** Downloads a photo from the bucket as a loaded image (and its object URL, to revoke later). */
export async function downloadPhoto(supabase: SupabaseClient, path: string): Promise<{ img: HTMLImageElement; url: string }> {
  const { data, error } = await supabase.storage.from("pdfs").download(path);
  if (error || !data) throw error ?? new Error("Photo download failed");
  const url = URL.createObjectURL(data);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Photo load failed"));
    el.src = url;
  });
  return { img, url };
}

/** A new photo fills its frame (cropped evenly on the sides that overflow). */
export function coverBox(frame: Box, imgW: number, imgH: number): Box {
  const [x0, y0, x1, y1] = frame;
  const fw = x1 - x0;
  const fh = y1 - y0;
  const k = Math.max(fw / imgW, fh / imgH);
  const w = imgW * k;
  const h = imgH * k;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
}

/** The pan that keeps the zoomed image over the whole frame (each axis separately). */
function clampPan(lo0: number, hi0: number, f0: number, f1: number, d: number) {
  const a = f1 - hi0; // image's far edge must stay past the frame's far edge
  const b = f0 - lo0; // and its near edge before the frame's near edge
  // An image smaller than its frame on this axis may move only inside it.
  return Math.min(Math.max(a, b), Math.max(Math.min(a, b), d));
}

/**
 * Where the image is drawn: `base` (its box before any crop) scaled by `zoom`
 * around the frame's centre, moved by dx/dy, kept over the frame. Returns the
 * box and the pan actually applied.
 */
export function croppedBox(base: Box, frame: Box, zoom: number, dx: number, dy: number): { box: Box; dx: number; dy: number } {
  const cx = (frame[0] + frame[2]) / 2;
  const cy = (frame[1] + frame[3]) / 2;
  const z = Math.min(MAX_ZOOM, Math.max(1, zoom));
  const x0 = cx + (base[0] - cx) * z;
  const x1 = cx + (base[2] - cx) * z;
  const y0 = cy + (base[1] - cy) * z;
  const y1 = cy + (base[3] - cy) * z;
  const px = clampPan(x0, x1, frame[0], frame[2], dx);
  const py = clampPan(y0, y1, frame[1], frame[3], dy);
  return { box: [x0 + px, y0 + py, x1 + px, y1 + py], dx: px, dy: py };
}
