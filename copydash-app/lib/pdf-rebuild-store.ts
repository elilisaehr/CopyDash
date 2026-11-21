// CopyDash — saving and loading a reconstructed PDF page (see lib/pdf-reconstruct).
//
// Browser-only. At import, each PDF page is split into layers, pictures and
// text blocks; this module uploads the files to the 'pdfs' bucket under
// <project>/pages/<page>/rebuild/ and stores their description in
// `pdf_reconstructions`. Geometry is stored in PDF points (scale 1) so the
// editor can show it at any zoom.
//
// Each page also gets a flattened background (every layer and picture,
// without the text) as one JPEG: the editor shows that, with the text live
// on top. The separate layers and pictures are kept so a picture can later
// be replaced or re-cropped and the background flattened again.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getPdfjs } from "@/lib/pdf";
import { flattenLayers, reconstructPdf, type ReconstructedPage, type ReportItem } from "@/lib/pdf-reconstruct";
import type { DesignBlock, RenderedPage } from "@/lib/pdf-design";

export const REBUILD_MODEL_VERSION = 1;

type Box = [number, number, number, number];

export type StoredLayer =
  | { kind: "vector"; box: Box; file: string }
  | {
      kind: "image";
      src: string;
      box: Box;
      frame: Box;
      radius: number;
      opacity: number;
      /** The picture as drawn in its frame (clip, corners, opacity baked in), over `shownBox`. */
      shown?: string;
      shownBox?: Box;
    };

export interface StoredPage {
  w: number;
  h: number;
  /** Flattened background (layers + pictures, no text). */
  background: string;
  layers: StoredLayer[];
  /** One file per distinct PDF picture, keyed by the layer's `src`. */
  images: Record<string, string>;
  blocks: DesignBlock[];
  report: ReportItem[];
}

export interface StoredModel {
  pages: StoredPage[];
}

/** Sharp at 2× for usual pages, but very large pages stay under ~2400px wide (canvas memory). */
export const scaleFor = (pageWidth: number) => Math.max(1, Math.min(2, 2400 / pageWidth));

const toBlob = (c: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Image encoding failed"))), type, quality));

export const hasAlpha = (c: HTMLCanvasElement) => {
  const d = c.getContext("2d")?.getImageData(0, 0, c.width, c.height).data;
  if (!d) return true;
  for (let i = 3; i < d.length; i += 16) if (d[i] < 255) return true;
  return false;
};

/** The page without its text, stacked from its layers and pictures (used to check them against `pg.background`). */
export const flattenPage = (pg: ReconstructedPage) => flattenLayers(pg.w, pg.h, pg.layers, pg.images);

const scaleBox = (b: Box, k: number): Box => [b[0] * k, b[1] * k, b[2] * k, b[3] * k];

/** Block geometry × k (positions, sizes, font size, line pitch). */
export function scaleBlock(b: DesignBlock, k: number): DesignBlock {
  return { ...b, x: b.x * k, top: b.top * k, w: b.w * k, h: b.h * k, fontH: b.fontH * k, lineHeight: b.lineHeight ? b.lineHeight * k : undefined };
}

/**
 * Splits the PDF, uploads every file and saves the description for the page.
 * Returns the report items of every page (for a summary after import).
 */
export async function importPdfRebuild(
  supabase: SupabaseClient,
  projectId: string,
  pageId: string,
  pdf: ArrayBuffer,
  onProgress?: (msg: string) => void,
): Promise<ReportItem[]> {
  return saveRebuild(supabase, projectId, pageId, await rebuildPdf(pdf, onProgress), onProgress);
}

/** Thrown for a PDF that can't be opened without a password. */
export class PdfPasswordError extends Error {
  constructor() {
    super("This PDF is password-protected. Remove the password, then upload it again.");
  }
}

/** Splits the PDF in memory (no upload yet). */
export async function rebuildPdf(pdf: ArrayBuffer, onProgress?: (msg: string) => void): Promise<ReconstructedPage[]> {
  const pdfjs = await getPdfjs();
  try {
    return await reconstructPdf(pdfjs, pdf, scaleFor, onProgress);
  } catch (e) {
    if ((e as { name?: string })?.name === "PasswordException") throw new PdfPasswordError();
    throw e;
  }
}

/** Uploads the files of a split PDF and saves the page's description. */
export async function saveRebuild(
  supabase: SupabaseClient,
  projectId: string,
  pageId: string,
  pages: ReconstructedPage[],
  onProgress?: (msg: string) => void,
): Promise<ReportItem[]> {
  // A new folder per import, so a re-import never shows a mix of old and new files.
  const dir = `${projectId}/pages/${pageId}/rebuild/${Date.now()}`;
  const upload = async (name: string, blob: Blob) => {
    const path = `${dir}/${name}`;
    const { error } = await supabase.storage.from("pdfs").upload(path, blob, { upsert: true, contentType: blob.type });
    if (error) throw error;
    return path;
  };

  const stored: StoredPage[] = [];
  for (const pg of pages) {
    const k = 1 / pg.scale;
    const n = pg.pageIndex + 1;
    onProgress?.(`Saving page ${n}/${pages.length}`);
    // Maximum quality: below it, Chrome's JPEG subsamples colour and the page
    // drifts from the original (0.08% of pixels on a long photo-heavy page vs 0.0001%).
    const background = await upload(`p${n}-background.jpg`, await toBlob(pg.background, "image/jpeg", 1));
    const images: Record<string, string> = {};
    let i = 0;
    for (const [src, canvas] of Object.entries(pg.images)) {
      const png = hasAlpha(canvas);
      images[src] = await upload(`p${n}-img${++i}.${png ? "png" : "jpg"}`, await toBlob(canvas, png ? "image/png" : "image/jpeg", 0.92));
    }
    const layers: StoredLayer[] = [];
    let v = 0;
    for (const l of pg.layers) {
      if (l.kind === "vector") layers.push({ kind: "vector", box: scaleBox(l.box, k), file: await upload(`p${n}-layer${++v}.png`, await toBlob(l.canvas, "image/png")) });
      else {
        const shown = l.shown ? await upload(`p${n}-shown${++v}.png`, await toBlob(l.shown, "image/png")) : undefined;
        layers.push({ kind: "image", src: l.src, box: scaleBox(l.box, k), frame: scaleBox(l.frame, k), radius: l.radius * k, opacity: l.opacity, shown, shownBox: l.shownBox ? scaleBox(l.shownBox, k) : undefined });
      }
    }
    stored.push({ w: pg.w * k, h: pg.h * k, background, layers, images, blocks: pg.blocks.map((b) => scaleBlock(b, k)), report: pg.report });
  }

  const model: StoredModel = { pages: stored };
  const { error } = await supabase.from("pdf_reconstructions").upsert({ page_id: pageId, version: REBUILD_MODEL_VERSION, model, created_at: new Date().toISOString() });
  if (error) throw error;
  // Replaced / re-cropped photos point at pieces of the previous split: they no longer apply.
  const { error: photoErr } = await supabase.from("pdf_photo_edits").delete().eq("page_id", pageId);
  if (photoErr) console.warn("Could not clear the photo edits of the previous split", photoErr);
  return pages.flatMap((p) => p.report);
}

export async function loadRebuildModel(supabase: SupabaseClient, pageId: string): Promise<StoredModel | null> {
  const { data, error } = await supabase.from("pdf_reconstructions").select("model").eq("page_id", pageId).maybeSingle();
  if (error || !data) return null;
  return data.model as StoredModel;
}

/** Downloads each page's flattened background once, as a local object URL. */
export async function loadBackgrounds(supabase: SupabaseClient, model: StoredModel): Promise<string[]> {
  return Promise.all(
    model.pages.map(async (p) => {
      const { data, error } = await supabase.storage.from("pdfs").download(p.background);
      if (error || !data) throw error ?? new Error("Background download failed");
      return URL.createObjectURL(data);
    }),
  );
}

/** The model at zoom `k`, in the shape the design editor renders. */
export function rebuildToRendered(model: StoredModel, backgrounds: string[], k: number): RenderedPage[] {
  return model.pages.map((p, i) => ({
    pageIndex: i,
    w: Math.round(p.w * k),
    h: Math.round(p.h * k),
    url: backgrounds[i],
    blocks: p.blocks.map((b) => scaleBlock(b, k)),
  }));
}

/** A picture's placement in the PDF (PDF points), whatever file is used to draw it. */
export interface PhotoPlacement {
  /** Key into StoredPage.images. */
  src: string;
  box: Box;
  frame: Box;
  radius: number;
  opacity: number;
}

/** A page's pieces with their pictures loaded, geometry in PDF points. */
export type LoadedPiece =
  | { kind: "vector"; img: HTMLImageElement; box: Box }
  | {
      kind: "image";
      img: HTMLImageElement;
      box: Box;
      frame: Box;
      radius: number;
      opacity: number;
      /** "<page index>:<layer index>" — the key of its row in pdf_photo_edits. */
      piece: string;
      /** Where the picture itself sits (`box`/`frame` above may be its baked `shown` render). */
      orig: PhotoPlacement;
    };

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = url;
  });

/**
 * Downloads every layer and picture of the model (each file once). Used to
 * redraw the page piece by piece when longer text pushes the content down.
 * Returns the pieces per page and the object URLs to revoke later.
 */
export async function loadPieces(supabase: SupabaseClient, model: StoredModel): Promise<{ pages: LoadedPiece[][]; urls: string[] }> {
  const urls: string[] = [];
  const cache = new Map<string, Promise<HTMLImageElement>>();
  const get = (path: string) => {
    let p = cache.get(path);
    if (!p) {
      p = (async () => {
        const { data, error } = await supabase.storage.from("pdfs").download(path);
        if (error || !data) throw error ?? new Error("Download failed");
        const url = URL.createObjectURL(data);
        urls.push(url);
        return loadImage(url);
      })();
      cache.set(path, p);
    }
    return p;
  };
  const pages = await Promise.all(
    model.pages.map((pg, pi) =>
      Promise.all(
        pg.layers.map(async (l, li): Promise<LoadedPiece | null> => {
          if (l.kind === "vector") return { kind: "vector", img: await get(l.file), box: l.box };
          const piece = `${pi}:${li}`;
          const orig: PhotoPlacement = { src: l.src, box: l.box, frame: l.frame, radius: l.radius, opacity: l.opacity };
          // Prefer the picture as drawn in its frame (pixel-identical); clip and opacity are baked in.
          if (l.shown && l.shownBox) return { kind: "image", img: await get(l.shown), box: l.shownBox, frame: l.shownBox, radius: 0, opacity: 1, piece, orig };
          const path = pg.images[l.src];
          return path ? { kind: "image", img: await get(path), box: l.box, frame: l.frame, radius: l.radius, opacity: l.opacity, piece, orig } : null;
        }),
      ).then((pieces) => pieces.filter((x): x is LoadedPiece => !!x)),
    ),
  );
  return { pages, urls };
}
