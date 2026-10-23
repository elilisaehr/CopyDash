// Fonts a PM can assign to a PDF design so edited copy renders in the
// design's own typeface. PDFs exported from Figma (and many others) embed
// text as Type3 glyph drawings with no font name or usable font file, so
// the typeface can't be recovered automatically — the PM picks it once per
// page (stored in pages.design_fonts) and it's loaded from Google Fonts.

import * as React from "react";
import type { BlockKind } from "./pdf-design";

export interface DesignFonts {
  /** Used for heading and subheading blocks. */
  heading?: string | null;
  /** Used for lead and body blocks. */
  body?: string | null;
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

/** Loads the picked design fonts with every weight they offer. */
export function useDesignFonts(fonts: DesignFonts | null | undefined) {
  const names = [...new Set([fonts?.heading, fonts?.body].filter((n): n is string => !!n && n in GOOGLE_FONTS))].sort();
  useStylesheet("cd-design-fonts", names.length ? googleFontsUrl(names.map((n) => familyParam(n, GOOGLE_FONTS[n]))) : null);
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
