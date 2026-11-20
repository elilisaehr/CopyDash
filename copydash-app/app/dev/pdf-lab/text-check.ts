// PDF lab — how close the editor's live text is to the PDF's own text.
//
// The truth is the PDF's ink: original page minus the text-free background,
// inside each block. Its rows give the PDF's lines (count, left/right
// edges, vertical position). The editor's lines come from the DOM (one
// client rect per line of the block's text). Comparing the two shows wrong
// line breaks, a different font or size (width), a shifted block and a
// wrong colour. Words missing or doubled come from comparing the PDF's text
// layer with the blocks' text.

import type { ReconstructedPage } from "@/lib/pdf-reconstruct";

type Line = { left: number; right: number; top: number; bottom: number };

export interface BlockCheck {
  id: string;
  text: string;
  fontH: number;
  /** Where the block's ink is, in page px (for drawing the outline). */
  box: [number, number, number, number];
  pdfLines: number;
  htmlLines: number;
  /** Editor width / PDF width on the widest line (1 = same). */
  widthRatio: number | null;
  /** Editor minus PDF, in page px, on the alignment edge. */
  dx: number | null;
  dy: number | null;
  /** RGB distance between the editor's colour and the PDF ink. */
  colorDist: number | null;
  issues: string[];
}

export interface TextCheck {
  /** Share of blocks with no issue, 0–100. */
  score: number;
  blocks: BlockCheck[];
  counts: Record<string, number>;
}

const inkDiff = (o: Uint8ClampedArray, b: Uint8ClampedArray, i: number) =>
  Math.abs(o[i] - b[i]) + Math.abs(o[i + 1] - b[i + 1]) + Math.abs(o[i + 2] - b[i + 2]);

/** The PDF's lines inside a block, read from the ink. */
function pdfInk(
  pg: ReconstructedPage,
  od: Uint8ClampedArray,
  bd: Uint8ClampedArray,
  b: ReconstructedPage["blocks"][number],
): { lines: Line[]; color: [number, number, number] | null } {
  const W = pg.w;
  const H = pg.h;
  const x0 = Math.max(0, Math.floor(b.x - 3));
  const x1 = Math.min(W, Math.ceil(b.x + b.w + 3));
  const y0 = Math.max(0, Math.floor(b.top - b.fontH * 0.15));
  const y1 = Math.min(H, Math.ceil(b.top + b.h + b.fontH * 0.1));
  const rows: { y: number; left: number; right: number }[] = [];
  let max = 0;
  for (let y = y0; y < y1; y++) {
    let left = -1;
    let right = -1;
    for (let x = x0; x < x1; x++) {
      const d = inkDiff(od, bd, (y * W + x) * 4);
      if (d > 60) {
        if (left < 0) left = x;
        right = x + 1;
        if (d > max) max = d;
      }
    }
    if (left >= 0) rows.push({ y, left, right });
  }
  // Rows with ink, grouped; small gaps (the dot of an i) don't split a line.
  const gap = Math.max(1, b.fontH * 0.12);
  const bands: Line[] = [];
  for (const r of rows) {
    const last = bands[bands.length - 1];
    if (last && r.y - last.bottom <= gap) {
      last.bottom = r.y + 1;
      last.left = Math.min(last.left, r.left);
      last.right = Math.max(last.right, r.right);
    } else bands.push({ top: r.y, bottom: r.y + 1, left: r.left, right: r.right });
  }
  // Accents, underlines: too thin to be a line of their own.
  const lines: Line[] = [];
  for (const band of bands) {
    if (band.bottom - band.top >= b.fontH * 0.3) lines.push(band);
    else if (lines.length) {
      const l = lines[lines.length - 1];
      l.left = Math.min(l.left, band.left);
      l.right = Math.max(l.right, band.right);
    }
  }
  // Ink colour: the strongest ink pixels (glyph cores, not antialiased edges).
  let color: [number, number, number] | null = null;
  if (max > 0) {
    const acc = [0, 0, 0];
    let n = 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4;
        if (inkDiff(od, bd, i) >= max * 0.75) {
          acc[0] += od[i];
          acc[1] += od[i + 1];
          acc[2] += od[i + 2];
          n++;
        }
      }
    if (n) color = [acc[0] / n, acc[1] / n, acc[2] / n];
  }
  return { lines, color };
}

/** The editor's lines for a block, in page px. */
function htmlLines(el: HTMLElement, origin: DOMRect, k: number, fontH: number): Line[] {
  const range = document.createRange();
  range.selectNodeContents(el);
  const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
  const lines: Line[] = [];
  for (const r of rects) {
    const top = (r.top - origin.top) / k;
    const bottom = (r.bottom - origin.top) / k;
    const left = (r.left - origin.left) / k;
    const right = (r.right - origin.left) / k;
    const mid = (top + bottom) / 2;
    const l = lines.find((x) => Math.abs((x.top + x.bottom) / 2 - mid) < fontH * 0.5);
    if (l) {
      l.left = Math.min(l.left, left);
      l.right = Math.max(l.right, right);
      l.top = Math.min(l.top, top);
      l.bottom = Math.max(l.bottom, bottom);
    } else lines.push({ top, bottom, left, right });
  }
  return lines.sort((a, b) => a.top - b.top);
}

const parseRgb = (s: string): [number, number, number] | null => {
  const m = s.match(/rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/);
  return m ? [+m[1], +m[2], +m[3]] : null;
};

/**
 * Check every block of a page. `pageEl` is the editor's page element (its
 * top-left is the page's top-left), drawn at `k` × the reconstruction size.
 */
export function checkText(pg: ReconstructedPage, pageEl: HTMLElement, k: number): TextCheck {
  const od = pg.original.getContext("2d")!.getImageData(0, 0, pg.w, pg.h).data;
  const bd = pg.background.getContext("2d")!.getImageData(0, 0, pg.w, pg.h).data;
  const origin = pageEl.getBoundingClientRect();
  const blocks: BlockCheck[] = [];
  for (const b of pg.blocks) {
    const el = pageEl.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(b.id)}"]`);
    const ink = pdfInk(pg, od, bd, b);
    const html = el ? htmlLines(el, origin, k, b.fontH) : [];
    const issues: string[] = [];
    let widthRatio: number | null = null;
    let dx: number | null = null;
    let dy: number | null = null;
    let colorDist: number | null = null;
    if (!el) issues.push("not shown");
    else if (!ink.lines.length) issues.push("no ink in PDF");
    else {
      if (html.length !== ink.lines.length) issues.push(`line breaks (${ink.lines.length} → ${html.length})`);
      // Widest line of each, so a short last line doesn't skew it.
      const wp = Math.max(...ink.lines.map((l) => l.right - l.left));
      const wh = html.length ? Math.max(...html.map((l) => l.right - l.left)) : 0;
      if (html.length) {
        widthRatio = wh / wp;
        if (Math.abs(widthRatio - 1) > 0.06 && html.length === ink.lines.length)
          issues.push(`width ${Math.round((widthRatio - 1) * 100)}%`);
        const pl = Math.min(...ink.lines.map((l) => l.left));
        const pr = Math.max(...ink.lines.map((l) => l.right));
        const hl = Math.min(...html.map((l) => l.left));
        const hr = Math.max(...html.map((l) => l.right));
        dx = b.textAlign === "center" ? (hl + hr) / 2 - (pl + pr) / 2 : b.textAlign === "right" ? hr - pr : hl - pl;
        // First line, vertical centre: glyph box vs ink. Ink is cap height +
        // descenders, the glyph box is ascent + descent; ~0.1 em apart.
        dy = (html[0].top + html[0].bottom) / 2 - (ink.lines[0].top + ink.lines[0].bottom) / 2;
        if (Math.abs(dx) > Math.max(3, b.fontH * 0.3)) issues.push(`shifted ${dx > 0 ? "right" : "left"} ${Math.round(Math.abs(dx))}px`);
        if (Math.abs(dy) > Math.max(3, b.fontH * 0.35)) issues.push(`shifted ${dy > 0 ? "down" : "up"} ${Math.round(Math.abs(dy))}px`);
      }
      const shown = parseRgb(getComputedStyle(el).color);
      if (shown && ink.color) {
        colorDist = Math.hypot(shown[0] - ink.color[0], shown[1] - ink.color[1], shown[2] - ink.color[2]);
        // Thin type never reaches its true colour once antialiased: be lenient.
        if (colorDist > (b.fontH < 14 ? 110 : 80)) issues.push("colour");
      }
    }
    const all = [...ink.lines, ...html];
    blocks.push({
      id: b.id,
      text: b.text.length > 60 ? `${b.text.slice(0, 57)}…` : b.text,
      fontH: b.fontH,
      box: all.length
        ? [Math.min(...all.map((l) => l.left)), Math.min(...all.map((l) => l.top)), Math.max(...all.map((l) => l.right)), Math.max(...all.map((l) => l.bottom))]
        : [b.x, b.top, b.x + b.w, b.top + b.h],
      pdfLines: ink.lines.length,
      htmlLines: html.length,
      widthRatio,
      dx,
      dy,
      colorDist,
      issues,
    });
  }
  const counts: Record<string, number> = {};
  for (const b of blocks) for (const i of b.issues) counts[i.split(" ")[0]] = (counts[i.split(" ")[0]] || 0) + 1;
  const ok = blocks.filter((b) => !b.issues.length).length;
  return { score: blocks.length ? (100 * ok) / blocks.length : 100, blocks, counts };
}

// ── Words: is every word of the PDF in an editable block, once? ──────────

const words = (s: string) =>
  s
    .replace(/[­]/g, "")
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((w) => w.length > 0);

/** Words of the PDF text layer missing from the blocks, and words the blocks have more often than the PDF. */
export function compareWords(pdfText: string[], blockText: string[]): { missing: string[]; extra: string[] } {
  const count = (list: string[]) => {
    const m = new Map<string, number>();
    for (const s of list) for (const w of words(s)) m.set(w, (m.get(w) || 0) + 1);
    return m;
  };
  const a = count(pdfText);
  const b = count(blockText);
  const missing: string[] = [];
  const extra: string[] = [];
  for (const [w, n] of a) for (let i = (b.get(w) || 0); i < n; i++) missing.push(w);
  for (const [w, n] of b) for (let i = (a.get(w) || 0); i < n; i++) extra.push(w);
  return { missing, extra };
}
