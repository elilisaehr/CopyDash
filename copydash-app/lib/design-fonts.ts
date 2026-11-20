// Fonts a PM can assign to a PDF design so edited copy renders in the
// design's own typeface. PDFs exported from Figma (and many others) embed
// text as Type3 glyph drawings with no font name or usable font file, so
// the typeface can't be recovered automatically — the PM picks it once per
// page (stored in pages.design_fonts) and it's loaded from Google Fonts.

import * as React from "react";
import type { BlockKind, DesignBlock } from "./pdf-design";
import { registerGoogleFamily } from "./font-detect";
import { createClient } from "./supabase/client";

export interface StyleFont {
  family: string;
  /** CSS weight read from the PDF; absent for an uploaded file (its own weight). */
  weight?: number;
}

export interface DesignFonts {
  /** Used for heading and subheading blocks. */
  heading?: string | null;
  /** Used for lead and body blocks. */
  body?: string | null;
  /** Rebuilt PDF pages: the font of each PDF text style (DesignBlock.styleKey),
   * detected at import and confirmed by the user. Wins over heading/body. */
  styles?: Record<string, StyleFont>;
  /** Font files uploaded by the agency: family name → path in the 'pdfs'
   * bucket (<project>/fonts/<file>). Other families come from Google Fonts. */
  files?: Record<string, string>;
}

// name → weights available on Google Fonts (css2 axis syntax: a range for
// variable fonts, a ;-list for static ones — asking for a missing weight
// makes Google reject the whole request).
export const GOOGLE_FONTS: Record<string, string> = {
  Inter: "100..900",
  Roboto: "100..900",
  "Open Sans": "300..800",
  "Noto Sans": "100..900",
  Lato: "100;300;400;700;900",
  Montserrat: "100..900",
  Poppins: "100;200;300;400;500;600;700;800;900",
  Nunito: "200..1000",
  "Nunito Sans": "200..1000",
  Raleway: "100..900",
  "Source Sans 3": "200..900",
  "Work Sans": "100..900",
  "DM Sans": "100..1000",
  Manrope: "200..800",
  Mulish: "200..1000",
  Rubik: "300..900",
  Figtree: "300..900",
  "Plus Jakarta Sans": "200..800",
  Outfit: "100..900",
  Karla: "200..800",
  Barlow: "100;200;300;400;500;600;700;800;900",
  "Roboto Slab": "100..900",
  Merriweather: "300..900",
  Lora: "400..700",
  "Playfair Display": "400..900",
  "PT Serif": "400;700",
  "Libre Baskerville": "400;700",
};

export const FONT_NAMES = Object.keys(GOOGLE_FONTS);

const familyParam = (name: string, weights: string) => `family=${name.replace(/ /g, "+")}:wght@${weights}`;

const googleFontsUrl = (params: string[]) => `https://fonts.googleapis.com/css2?${params.join("&")}&display=swap`;

/** Quoted CSS family for a picked font (names like "Source Sans 3" must be quoted). */
export const cssFamily = (name: string) => `"${name}"`;

export const fontForKind = (fonts: DesignFonts | null | undefined, kind: BlockKind) =>
  (kind === "heading" || kind === "subhead" ? fonts?.heading : fonts?.body) || null;

/** The font a block is shown in: its PDF style's font, else the heading/body pick. */
export function fontForBlock(fonts: DesignFonts | null | undefined, b: DesignBlock): StyleFont | null {
  const st = b.styleKey ? fonts?.styles?.[b.styleKey] : undefined;
  if (st) return st;
  const f = fontForKind(fonts, b.kind);
  return f ? { family: f } : null;
}

/** The block with its design font (family and, for detected styles, weight). */
export function withFont(fonts: DesignFonts | null | undefined, b: DesignBlock): DesignBlock {
  const f = fontForBlock(fonts, b);
  if (!f) return b;
  // An uploaded file draws its own weight; asking for another would fake it.
  const weight = fonts?.files?.[f.family] ? 400 : (f.weight ?? b.weight);
  return { ...b, fontFamily: cssFamily(f.family), weight };
}

function useStylesheet(id: string, href: string | null) {
  React.useEffect(() => {
    if (!href) return;
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    if (link.href !== href) link.href = href;
  }, [id, href]);
}

/** Loads the page's design fonts: Google families with every weight they offer, uploaded files from Storage. */
export function useDesignFonts(fonts: DesignFonts | null | undefined) {
  const files = fonts?.files ?? {};
  const all = [fonts?.heading, fonts?.body, ...Object.values(fonts?.styles ?? {}).map((s) => s.family)].filter((n): n is string => !!n);
  const google = [...new Set(all.filter((n) => !files[n]))].sort();
  // Through our server, family by family (see registerGoogleFamily): a
  // family Google doesn't have only fails on its own.
  const key = google.join("|");
  React.useEffect(() => {
    if (!key) return;
    for (const name of key.split("|")) registerGoogleFamily(name);
  }, [key]);
  const fileKey = JSON.stringify(Object.entries(files).sort());
  React.useEffect(() => {
    const entries = JSON.parse(fileKey) as [string, string][];
    if (!entries.length) return;
    const supabase = createClient();
    for (const [family, path] of entries) loadFontFile(supabase, family, path);
  }, [fileKey]);
}

const loadedFiles = new Set<string>();
/** Registers an uploaded font file (once per session) under its family name, for every weight (no faked bold). */
async function loadFontFile(supabase: ReturnType<typeof createClient>, family: string, path: string) {
  if (loadedFiles.has(path)) return;
  loadedFiles.add(path);
  try {
    const { data, error } = await supabase.storage.from("pdfs").download(path);
    if (error || !data) throw error ?? new Error("No data");
    await registerFontFile(family, await data.arrayBuffer());
  } catch (e) {
    loadedFiles.delete(path);
    console.warn("Couldn't load the design font", family, e);
  }
}

/**
 * Uploads a font file for a project and returns its storage path. Stored
 * under a neutral name (no "font" or ".ttf" in the URL): content blockers
 * cut requests to URLs like …/fonts/x.ttf ("Failed to fetch"). The family
 * name is kept in pages.design_fonts.files.
 */
export async function uploadFontFile(supabase: ReturnType<typeof createClient>, projectId: string, family: string, file: File): Promise<string> {
  const path = `${projectId}/design-assets/${crypto.randomUUID()}`;
  try {
    const { error } = await supabase.storage.from("pdfs").upload(path, file, { contentType: "application/octet-stream" });
    if (error) throw error;
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    throw new Error(`Couldn't upload the font file “${file.name}” (${family}): ${why}. A browser extension (ad or privacy blocker) may be blocking it.`);
  }
  return path;
}

/** Adds a font file to the document under `family`, covering every weight. */
export async function registerFontFile(family: string, data: ArrayBuffer) {
  const face = new FontFace(family, data, { weight: "1 1000" });
  await face.load();
  document.fonts.add(face);
}

/**
 * Loads fonts named by a Figma design from Google Fonts, one stylesheet per
 * family so a family Google doesn't have (a paid or local font) only fails
 * on its own; the browser then falls back as before.
 */
export function useWebFonts(names: string[]) {
  const key = [...new Set(names)].sort().join("|");
  React.useEffect(() => {
    if (!key) return;
    for (const name of key.split("|")) {
      const id = `cd-webfont-${name.replace(/[^a-zA-Z0-9]/g, "-")}`;
      if (document.getElementById(id)) continue;
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      // Unlisted families: ask for the weights nearly every family has.
      link.href = googleFontsUrl([familyParam(name, GOOGLE_FONTS[name] || "400;700")]);
      document.head.appendChild(link);
    }
  }, [key]);
}

/** Loads every font in the list at 400/700, for previews in the picker. */
export function useFontPreviews(enabled: boolean) {
  useStylesheet("cd-font-previews", enabled ? googleFontsUrl(FONT_NAMES.map((n) => familyParam(n, "400;700"))) : null);
}
