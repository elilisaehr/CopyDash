// CopyDash — PDF Design Editor geometry/canvas algorithm.
//
// Ported as closely as possible from the prototype
// (project/copydash/pdfdesign.jsx: sampleBg/readPixel/median/luminance/hashStr,
// buildBlocks). This is pure geometry over a rendered pdf.js page canvas:
// it groups text items into lines by baseline proximity, splits each
// line into separate segments wherever there's a wide horizontal gap (e.g. a
// logo vs. nav links, or feature columns on one row), merges vertically
// stacked segments with the same font and a regular line pitch into one
// paragraph block (so a multi-line paragraph edits as one unit), and samples the
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
  /** Optional explicit overrides (used by the Figma import path, which
   * knows the real text color/weight from the API instead of having to
   * infer them the way the PDF geometry pipeline does). When absent,
   * EditableBlock falls back to the `dark`/fontH-based PDF-path logic. */
  color?: string;
  weight?: number;
  textAlign?: "left" | "center" | "right" | "justify";
  /** When true, EditableBlock wraps text within the block's original width
   * (growing downward for extra lines) instead of growing sideways on a
   * single line. Set by the Figma import path and by the PDF path for
   * merged multi-line paragraphs; single-line PDF blocks keep the original
   * single-line behavior. */
  wrap?: boolean;
  /** Line pitch in px measured from the source design (PDF paragraphs), so
   * wrapped text keeps the design's own line spacing. */
  lineHeight?: number;
  /** PDF path only: the original text of each source line this block was
   * merged from (one entry for a single-line block). Used to detect
   * paragraph blocks and to carry over edits saved before paragraph merging
   * existed, when edits were keyed per line. */
  sourceLines?: string[];
  /** Original font family read from the source design (PDF embedded font
   * name, or Figma's node style.fontFamily). EditableBlock uses this so
   * edited text keeps rendering in the design's own typeface instead of
   * falling back to the app's UI font. Undefined falls back to the app font. */
  fontFamily?: string;
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
  fontFamily?: string;
}

interface Line {
  items: RawItem[];
  baseline: number;
}

// One horizontal run of text on a single line (a line split at wide gaps).
interface Segment {
  x: number;
  right: number;
  baseline: number;
  fontH: number;
  text: string;
  fontFamily?: string;
}

interface Paragraph {
  segs: Segment[];
  /** Baseline-to-baseline distance, fixed by the first two lines. */
  pitch?: number;
}

const joinText = (parts: string[]) => parts.join(" ").replace(/\s+/g, " ").trim();

const toSegment = (group: RawItem[]): Segment | null => {
  const text = joinText(group.map((o) => o.text));
  if (!text) return null;
  return {
    x: Math.min(...group.map((o) => o.x)),
    right: Math.max(...group.map((o) => o.x + o.w)),
    baseline: Math.max(...group.map((o) => o.baseline)),
    fontH: Math.max(...group.map((o) => o.fontH)),
    text,
    fontFamily: group[0].fontFamily,
  };
};

// A line starting with a bullet or "1." / "a)" is its own list item, never
// the continuation of the paragraph above.
const LIST_ITEM = /^([•●▪◦·‣–—*-]|\d{1,3}[.)]|[a-zA-Z][.)])\s/;

// Does segment `b` continue paragraph `p` (whose current last line is `a`)?
function continuesParagraph(p: Paragraph, a: Segment, b: Segment): boolean {
  if (LIST_ITEM.test(b.text)) return false;
  // Same type size. The embedded font name isn't compared: exporters split
  // one typeface into several font subsets, so two lines of the same title
  // can carry different font names (seen on a real Figma/browser export).
  if (Math.abs(a.fontH - b.fontH) > Math.max(a.fontH, b.fontH) * 0.12) return false;
  // Directly below, at normal line spacing — a wider gap is a paragraph break.
  const gap = b.baseline - a.baseline;
  if (gap < a.fontH * 0.9 || gap > a.fontH * 1.9) return false;
  if (p.pitch !== undefined && Math.abs(gap - p.pitch) > p.pitch * 0.2) return false;
  // Horizontally stacked (same column), not side by side.
  const overlap = Math.min(a.right, b.right) - Math.max(a.x, b.x);
  return overlap >= 0.5 * Math.min(a.right - a.x, b.right - b.x);
}

// Join paragraph lines; a line ending in a hyphen continues the word.
export const joinLines = (lines: string[]) =>
  lines.reduce((acc, line) => (/\p{L}-$/u.test(acc) ? acc + line : `${acc} ${line}`)).replace(/\s+/g, " ").trim();

// Infer alignment from how the lines' edges line up (left is the default).
function detectAlign(segs: Segment[], fontH: number): DesignBlock["textAlign"] {
  if (segs.length < 2) return undefined;
  const spread = (vals: number[]) => Math.max(...vals) - Math.min(...vals);
  const tol = fontH * 0.5;
  const lefts = spread(segs.map((s) => s.x));
  if (lefts <= tol) return undefined;
  if (spread(segs.map((s) => s.right)) <= tol) return "right";
  if (spread(segs.map((s) => (s.x + s.right) / 2)) <= tol) return "center";
  return undefined;
}

// pdf.js's Util.transform is a static matrix helper — passed in so this
// module doesn't need to import the whole pdfjs-dist package.
export type MatrixTransformFn = (m1: number[], m2: number[]) => number[];

// Group PDF text items into editable blocks: one per paragraph (or per
// standalone line — headings, nav items, buttons).
export function buildBlocks(
  items: (PdfTextItem | { str?: undefined })[],
  styles: Record<string, PdfTextStyle>,
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
    const fontName = (it as PdfTextItem).fontName as string | undefined;
    const fontFamily = fontName ? styles[fontName]?.fontFamily : undefined;
    raw.push({ x: tx[4], baseline: tx[5], w: it.width * scale, fontH, text: it.str, fontFamily });
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

  // Split each line into segments wherever there's a wide horizontal gap
  // (e.g. logo vs. nav links, or three feature columns on one row). Two
  // ems is well above any word space, even in justified text, and below a
  // typical column gutter.
  const segments: Segment[] = [];
  const pushSegment = (group: RawItem[]) => {
    const s = toSegment(group);
    if (s) segments.push(s);
  };
  for (const L of lines) {
    const its = L.items.sort((a, b) => a.x - b.x);
    let group: RawItem[] = [its[0]];
    for (let i = 1; i < its.length; i++) {
      const prev = group[group.length - 1];
      const gap = its[i].x - (prev.x + prev.w);
      if (gap > Math.max(16 * scale, prev.fontH * 2)) {
        pushSegment(group);
        group = [its[i]];
      } else group.push(its[i]);
    }
    pushSegment(group);
  }
  segments.sort((a, b) => a.baseline - b.baseline || a.x - b.x);

  // Merge vertically stacked segments into paragraphs, top to bottom. Each
  // segment joins the paragraph whose last line sits closest above it.
  const paragraphs: Paragraph[] = [];
  for (const s of segments) {
    let best: Paragraph | null = null;
    let bestGap = Infinity;
    for (const p of paragraphs) {
      const last = p.segs[p.segs.length - 1];
      if (!continuesParagraph(p, last, s)) continue;
      const gap = s.baseline - last.baseline;
      if (gap < bestGap) {
        best = p;
        bestGap = gap;
      }
    }
    if (best) {
      best.pitch ??= bestGap;
      best.segs.push(s);
    } else paragraphs.push({ segs: [s] });
  }

  const blocks: DesignBlock[] = [];
  for (const { segs, pitch } of paragraphs) {
    const first = segs[0];
    const last = segs[segs.length - 1];
    const multi = segs.length > 1;
    const fontH = Math.max(...segs.map((s) => s.fontH));
    const x = Math.min(...segs.map((s) => s.x));
    const right = Math.max(...segs.map((s) => s.right));
    const top = first.baseline - fontH;
    const h = last.baseline - first.baseline + fontH * 1.22;
    const sourceLines = segs.map((s) => s.text);
    const text = multi ? joinLines(sourceLines) : first.text;
    const bg = sampleBg(ctx, x, top, right - x, h);
    const size = fontH / scale; // type size at 100% zoom
    blocks.push({
      // Position is measured at scale 1 so the id (and the saved edit keyed
      // by it) is the same at every zoom level and screen width.
      id: `p${pageIndex}-${hashStr(text)}-${Math.round(top / scale / 8)}`,
      pageIndex,
      x,
      top,
      w: right - x,
      h,
      fontH,
      text,
      bg,
      dark: luminance(bg) < 0.5,
      kind: size >= 30 ? "heading" : size >= 22 ? "subhead" : size >= 17 ? "lead" : "body",
      fontFamily: first.fontFamily,
      wrap: multi || undefined,
      lineHeight: multi ? pitch : undefined,
      textAlign: detectAlign(segs, fontH),
      sourceLines,
    });
  }
  return blocks;
}

/** Prefix shared by every id the pre-paragraph-merge (per-line) algorithm
 * could have given this line, whatever the zoom level was back then. */
export const legacyLineIdPrefix = (pageIndex: number, line: string) => `p${pageIndex}-${hashStr(line)}-`;

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
