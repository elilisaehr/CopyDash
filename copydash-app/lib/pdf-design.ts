// CopyDash — PDF Design Editor geometry/canvas algorithm.
//
// Ported as closely as possible from the prototype
// (project/copydash/pdfdesign.jsx: sampleBg/readPixel/median/luminance/hashStr,
// buildBlocks). This is pure geometry over a rendered pdf.js page canvas:
// it groups text items into line-blocks by baseline proximity, splits each
// line into separate blocks wherever there's a wide horizontal gap (e.g. a
// logo vs. nav links, or feature columns on one row), and samples the
// background colour behind each block by reading canvas pixels at its
// margins — so the editable overlay can render text transparently by
// default and only "lift" to an opaque, colour-matched pill when edited.
//
// Deliberately skipped (per task scope): the synthetic canvas-design demo
// path (buildSampleDesignPdf / buildCanvasDesign / renderCanvasDesign /
// cdPdfStore) that stood in for a real uploaded PDF, and the click-to-
// annotate fallback for PDFs with zero extractable text. In this app every
// design page always has a real uploaded PDF in Storage.

// Minimal shape of a pdf.js text item we actually read (see
// pdfjs-dist's TextItem type — str/transform/width).
export interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  [key: string]: unknown;
}

export interface PdfTextStyle {
  fontFamily?: string;
  ascent?: number;
  descent?: number;
  vertical?: boolean;
  [key: string]: unknown;
}

// The minimal pieces of a pdf.js PageViewport buildBlocks needs.
export interface PdfViewportLike {
  scale: number;
  transform: number[];
}

export type BlockKind = "heading" | "subhead" | "lead" | "body";

export interface DesignBlock {
  id: string;
  pageIndex: number;
  x: number;
  top: number;
  w: number;
  h: number;
  fontH: number;
  text: string;
  bg: [number, number, number];
  dark: boolean;
  kind: BlockKind;
}

// ── Small helpers (ported verbatim) ──────────────────────────────────────

export const luminance = ([r, g, b]: [number, number, number]) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

export const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// Stable hash so a block keeps the same id across re-renders (edits never scramble).
export const hashStr = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

export const median = (arr: number[]) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export const readPixel = (ctx: CanvasRenderingContext2D, x: number, y: number): [number, number, number] => {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  x = Math.max(0, Math.min(cw - 1, Math.round(x)));
  y = Math.max(0, Math.min(ch - 1, Math.round(y)));
  const d = ctx.getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2]];
};

// Sample the background colour around a text block (median of margin points).
export const sampleBg = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): [number, number, number] => {
  const pts: [number, number][] = [
    [x - 10, y + h / 2],
    [x - 10, y + 2],
    [x + w / 2, y - 7],
    [x + w + 10, y + h / 2],
    [x - 10, y + h - 2],
  ];
  const cols = pts.map(([px, py]) => readPixel(ctx, px, py));
  return [median(cols.map((c) => c[0])), median(cols.map((c) => c[1])), median(cols.map((c) => c[2]))];
};

interface RawItem {
  x: number;
  baseline: number;
  w: number;
  fontH: number;
  text: string;
}

interface Line {
  items: RawItem[];
  baseline: number;
}

// pdf.js's Util.transform is a static matrix helper — passed in so this
// module doesn't need to import the whole pdfjs-dist package.
export type MatrixTransformFn = (m1: number[], m2: number[]) => number[];

// Group PDF text items into editable line-blocks.
export function buildBlocks(
  items: (PdfTextItem | { str?: undefined })[],
  _styles: Record<string, PdfTextStyle>,
  viewport: PdfViewportLike,
  pageIndex: number,
  ctx: CanvasRenderingContext2D,
  transformFn: MatrixTransformFn,
): DesignBlock[] {
  const scale = viewport.scale;
  const raw: RawItem[] = [];
  for (const it of items) {
    if (!("str" in it) || !it.str || !it.str.trim()) continue;
    const tx = transformFn(viewport.transform, it.transform);
    const fontH = Math.hypot(tx[2], tx[3]);
    if (fontH < 4) continue;
    raw.push({ x: tx[4], baseline: tx[5], w: it.width * scale, fontH, text: it.str });
  }
  raw.sort((a, b) => a.baseline - b.baseline || a.x - b.x);

  const lines: Line[] = [];
  for (const r of raw) {
    let L: Line | null = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (Math.abs(lines[i].baseline - r.baseline) <= Math.max(4, r.fontH * 0.45)) {
        L = lines[i];
        break;
      }
    }
    if (!L) {
      L = { items: [], baseline: r.baseline };
      lines.push(L);
    }
    L.items.push(r);
    L.baseline = (L.baseline + r.baseline) / 2;
  }

  // Split each line into blocks wherever there's a wide horizontal gap
  // (e.g. logo vs. nav links, or three feature columns on one row).
  const blocks: DesignBlock[] = [];
  const makeBlock = (group: RawItem[]) => {
    const fontH = Math.max(...group.map((o) => o.fontH));
    const x = Math.min(...group.map((o) => o.x));
    const right = Math.max(...group.map((o) => o.x + o.w));
    const baseline = Math.max(...group.map((o) => o.baseline));
    const top = baseline - fontH;
    const h = fontH * 1.22;
    const text = group
      .map((o) => o.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return;
    const bg = sampleBg(ctx, x, top, right - x, h);
    blocks.push({
      id: `p${pageIndex}-${hashStr(text)}-${Math.round(top / 8)}`,
      pageIndex,
      x,
      top,
      w: right - x,
      h,
      fontH,
      text,
      bg,
      dark: luminance(bg) < 0.5,
      kind: fontH >= 30 ? "heading" : fontH >= 22 ? "subhead" : fontH >= 17 ? "lead" : "body",
    });
  };
  for (const L of lines) {
    const its = L.items.sort((a, b) => a.x - b.x);
    let group: RawItem[] = [its[0]];
    for (let i = 1; i < its.length; i++) {
      const prev = group[group.length - 1];
      const gap = its[i].x - (prev.x + prev.w);
      if (gap > Math.max(60, prev.fontH * 4)) {
        makeBlock(group);
        group = [its[i]];
      } else group.push(its[i]);
    }
    makeBlock(group);
  }
  return blocks;
}

export interface RenderedPage {
  pageIndex: number;
  w: number;
  h: number;
  url: string;
  blocks: DesignBlock[];
}

/**
 * Renders every page of a PDF (given as an ArrayBuffer) to a canvas at
 * `scale`, running buildBlocks against each page's text content. Mirrors
 * the pdf.js render loop inside the prototype's PdfDesignEditor effect.
 */
export async function renderPdfDesign(
  pdfjsLib: typeof import("pdfjs-dist"),
  data: ArrayBuffer,
  scale: number,
): Promise<RenderedPage[]> {
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const out: RenderedPage[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const tc = await page.getTextContent();
    const blocks = buildBlocks(
      tc.items as PdfTextItem[],
      tc.styles as Record<string, PdfTextStyle>,
      viewport,
      p - 1,
      ctx,
      (m1, m2) => pdfjsLib.Util.transform(m1, m2),
    );
    out.push({ pageIndex: p - 1, w: canvas.width, h: canvas.height, url: canvas.toDataURL("image/png"), blocks });
  }
  return out;
}
