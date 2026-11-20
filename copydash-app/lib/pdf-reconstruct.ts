// CopyDash — PDF → reconstructed page (Acrobat-style "PDF to HTML").
//
// Browser-only (pdf.js + canvas). Takes a PDF and splits each page into the
// pieces a web page is made of, in the PDF's own paint order:
//   - vector layers: fills, borders, shapes, gradients — each run of drawing
//     between two pictures becomes one transparent PNG cropped to its content;
//   - images: every picture, as its own file, with the frame it is shown in
//     (clip rectangle, rounded corners, opacity) so it can later be replaced
//     or re-cropped;
//   - text: paragraphs (lib/pdf-design buildBlocks) rendered live on top;
//     the PDF's own copy of the text is left out of the layers.
// Stacking layers and images in order and putting the text on top
// reproduces the page. Whatever can't be rebuilt goes in `report`.
//
// How a layer is drawn: pdf.js runs the page's full operator list (so clips,
// transforms and transparency groups stay correct) while canvas paint calls
// are dropped for every operation outside the wanted set. Skipping
// operations instead (pdf.js `operationsFilter`) loses clip paths that a
// PDF defines together with a fill.

import { buildBlocks, type DesignBlock, type PdfTextItem, type PdfTextStyle } from "@/lib/pdf-design";

type Pdfjs = typeof import("pdfjs-dist");
type Box = [number, number, number, number]; // x0, y0, x1, y1 in page px

export interface VectorLayer {
  kind: "vector";
  box: Box;
  canvas: HTMLCanvasElement; // the layer cropped to `box`
}

export interface ImageLayer {
  kind: "image";
  /** Key into ReconstructedPage.images (one file per distinct PDF image). */
  src: string;
  /** Where the whole image would be drawn (it may overflow its frame). */
  box: Box;
  /** The visible window: clip rectangle ∩ page. */
  frame: Box;
  radius: number;
  opacity: number;
  /** The picture exactly as pdf.js draws it in its frame (clip, rounded
   * corners and opacity included), over `shownBox`. Redrawing the page from
   * this instead of `src` keeps it pixel-identical to the original. */
  shown?: HTMLCanvasElement;
  shownBox?: Box;
}

export type Layer = VectorLayer | ImageLayer;

export interface ReportItem {
  code:
    | "text_as_shapes"
    | "fonts_approximated"
    | "scanned_page"
    | "rotated_text"
    | "transparency"
    | "hidden_images"
    | "masked_images"
    | "hidden_text"
    | "icons_as_text"
    | "mixed_styles";
  /** Plain-language explanation shown to the user. */
  message: string;
  count?: number;
}

export interface ReconstructedPage {
  pageIndex: number;
  /** Render scale used: all geometry here is in PDF points × scale. */
  scale: number;
  w: number;
  h: number;
  layers: Layer[];
  images: Record<string, HTMLCanvasElement>;
  blocks: DesignBlock[];
  /** Full render of the original page, for comparison and "Keep as image". */
  original: HTMLCanvasElement;
  /** The page without its editable text, rendered by pdf.js in one pass on
   * white paper — pixel-identical to the original everywhere else. Shown in
   * the editor; `layers` are used only to redraw the page when text grows. */
  background: HTMLCanvasElement;
  report: ReportItem[];
}

type Mat = number[];
const mul = (a: Mat, b: Mat): Mat => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
const boxOf = (m: Mat, x0: number, y0: number, x1: number, y1: number): Box => {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ]) {
    xs.push(m[0] * x + m[2] * y + m[4]);
    ys.push(m[1] * x + m[3] * y + m[5]);
  }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
const inter = (a: Box, b: Box): Box => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
const empty = (b: Box) => b[2] <= b[0] || b[3] <= b[1];

/** Radius of a rounded-rectangle path: how far its first point sits from the nearest corner (device px). */
function radiusOf(data: ArrayLike<number> | null | undefined, mm: ArrayLike<number>, m: Mat): number {
  if (!data || data[0] !== 0) return 0; // 0 = moveTo
  const x = data[1];
  const y = data[2];
  const onEdgeX = Math.min(Math.abs(x - mm[0]), Math.abs(x - mm[2]));
  const onEdgeY = Math.min(Math.abs(y - mm[1]), Math.abs(y - mm[3]));
  const along = onEdgeX < 0.5 ? onEdgeY : onEdgeY < 0.5 ? onEdgeX : 0;
  return along * Math.hypot(m[0], m[1]);
}

/**
 * Whether a path is a rectangle or rounded rectangle: every point (curve
 * control points included) lies on an edge of its bounding box.
 * Path codes: 0 moveTo, 1 lineTo, 2 curveTo, 3 quadraticCurveTo, 4 closePath.
 */
function isRectLike(data: ArrayLike<number> | null | undefined, mm: ArrayLike<number>): boolean {
  if (!data) return false;
  const onEdge = (x: number, y: number) => {
    const e = Math.max(0.5, (mm[2] - mm[0] + mm[3] - mm[1]) * 0.002);
    return Math.abs(x - mm[0]) < e || Math.abs(x - mm[2]) < e || Math.abs(y - mm[1]) < e || Math.abs(y - mm[3]) < e;
  };
  for (let i = 0; i < data.length; ) {
    const op = data[i];
    const n = op === 0 || op === 1 ? 2 : op === 2 ? 6 : op === 3 ? 4 : op === 4 ? 0 : -1;
    if (n < 0) return false;
    for (let k = 0; k < n; k += 2) if (!onEdge(data[i + 1 + k], data[i + 2 + k])) return false;
    i += 1 + n;
  }
  return true;
}

/** Number of drawing commands in a pdf.js path (codes: 0 moveTo, 1 lineTo, 2 curveTo, 3 quadratic, 4 close). */
function pathCommands(data: ArrayLike<number> | null | undefined): number {
  if (!data) return 0;
  let n = 0;
  for (let i = 0; i < data.length; n++) {
    const op = data[i];
    const len = op === 0 || op === 1 ? 2 : op === 2 ? 6 : op === 3 ? 4 : op === 4 ? 0 : -1;
    if (len < 0) break;
    i += 1 + len;
  }
  return n;
}

// ── paint gate ──────────────────────────────────────────────────────────
// While `gate` is set, canvas paint calls only go through for the operation
// pdf.js is running (`curOp`, recorded by operationsFilter) when gate allows it.
let gate: ((op: number) => boolean) | null = null;
let curOp = -1;
const PAINT_METHODS = ["fill", "stroke", "drawImage", "fillRect", "strokeRect", "fillText", "strokeText", "putImageData"] as const;
function withGate<T>(allow: (op: number) => boolean, run: () => Promise<T>): Promise<T> {
  const proto = CanvasRenderingContext2D.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const originals = PAINT_METHODS.map((m) => proto[m]);
  PAINT_METHODS.forEach((m, k) => {
    const orig = originals[k];
    proto[m] = function (this: unknown, ...args: unknown[]) {
      if (gate && (curOp < 0 || !gate(curOp))) return;
      return orig.apply(this, args);
    };
  });
  gate = allow;
  curOp = -1;
  return run().finally(() => {
    gate = null;
    PAINT_METHODS.forEach((m, k) => (proto[m] = originals[k]));
  });
}

function canvasOf(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Copies a pdf.js image object (ImageBitmap or raw RGB/RGBA/gray data) to a canvas. */
function imageToCanvas(o: { width: number; height: number; bitmap?: ImageBitmap; data?: Uint8ClampedArray | Uint8Array }): HTMLCanvasElement | null {
  const c = canvasOf(o.width, o.height);
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  if (o.bitmap) {
    ctx.drawImage(o.bitmap, 0, 0);
    return c;
  }
  if (!o.data) return null;
  const id = ctx.createImageData(o.width, o.height);
  const n = o.width * o.height;
  const d = o.data;
  if (d.length === n * 4) id.data.set(d);
  else if (d.length === n * 3) for (let p = 0; p < n; p++) id.data.set([d[p * 3], d[p * 3 + 1], d[p * 3 + 2], 255], p * 4);
  else if (d.length === n) for (let p = 0; p < n; p++) id.data.set([d[p], d[p], d[p], 255], p * 4);
  else return null;
  ctx.putImageData(id, 0, 0);
  return c;
}

/** Crops a canvas to its non-transparent pixels. */
function cropToContent(c: HTMLCanvasElement): { box: Box; canvas: HTMLCanvasElement } | null {
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const { width: W, height: H } = c;
  const d = ctx.getImageData(0, 0, W, H).data;
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const out = canvasOf(x1 - x0 + 1, y1 - y0 + 1);
  out.getContext("2d")?.drawImage(c, -x0, -y0);
  return { box: [x0, y0, x1 + 1, y1 + 1], canvas: out };
}

/** Stacks layers and pictures in order on white paper — the page without its text. */
export function flattenLayers(W: number, H: number, layers: Layer[], images: Record<string, HTMLCanvasElement>): HTMLCanvasElement {
  const c = canvasOf(W, H);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  for (const l of layers) {
    if (l.kind === "vector") {
      ctx.drawImage(l.canvas, l.box[0], l.box[1]);
      continue;
    }
    if (l.shown && l.shownBox) {
      ctx.drawImage(l.shown, l.shownBox[0], l.shownBox[1]);
      continue;
    }
    const img = images[l.src];
    if (!img) continue;
    const [fx0, fy0, fx1, fy1] = l.frame;
    ctx.save();
    ctx.globalAlpha = l.opacity;
    ctx.beginPath();
    ctx.roundRect(fx0, fy0, fx1 - fx0, fy1 - fy0, l.radius);
    ctx.clip();
    ctx.drawImage(img, l.box[0], l.box[1], l.box[2] - l.box[0], l.box[3] - l.box[1]);
    ctx.restore();
  }
  return c;
}

export async function reconstructPdf(
  pdfjs: Pdfjs,
  data: ArrayBuffer,
  /** Render scale, or a function of the page width in PDF points. */
  scaleArg: number | ((pageWidth: number) => number),
  /** Progress messages, e.g. for a status line. */
  onProgress?: (msg: string) => void,
): Promise<ReconstructedPage[]> {
  const pdf = await pdfjs.getDocument({ data: data.slice(0) }).promise;
  const O = pdfjs.OPS;
  const out: ReconstructedPage[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    onProgress?.(`Page ${p}/${pdf.numPages}: reading`);
    const page = await pdf.getPage(p);
    const scale = typeof scaleArg === "function" ? scaleArg(page.getViewport({ scale: 1 }).width) : scaleArg;
    const vp = page.getViewport({ scale });
    const W = Math.ceil(vp.width);
    const H = Math.ceil(vp.height);
    const { fnArray: F, argsArray: A } = await page.getOperatorList();
    const isImage = (f: number) => f === O.paintImageXObject || f === O.paintInlineImageXObject || f === O.paintImageMaskXObject;
    const isText = (f: number) => f === O.showText || f === O.showSpacedText || f === O.nextLineShowText || f === O.nextLineSetSpacingShowText;

    // Full render: the original look, used to read text colours and as the "Keep as image" source.
    const t0 = performance.now();
    const original = canvasOf(W, H);
    const octx = original.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    await page.render({ canvasContext: octx, viewport: vp, canvas: original }).promise;

    const tc = await page.getTextContent();
    // Icon fonts write icon names as text ("angle-right", "arrow-left"): those
    // stay pictures in the background, not editable text.
    const isIconName = (t: string) => {
      const words = t.trim().split(/\s+/);
      return words.length > 0 && words.every((w) => /^[a-z]+(-[a-z0-9]+)+$/.test(w));
    };
    const allItems = tc.items as PdfTextItem[];
    // Rotated or slanted text can't be edited in place: it stays in the background.
    const isRotated = (t: PdfTextItem) => Math.abs(t.transform[1]) > 0.01 * Math.abs(t.transform[0]) || Math.abs(t.transform[2]) > 0.01 * Math.abs(t.transform[3]);
    const textItems = allItems.filter((t) => !(t.str && isIconName(t.str)));
    const iconItems = allItems.length - textItems.length;
    const items = textItems.filter((t) => !isRotated(t));
    const rotatedItems = textItems.filter((t) => t.str?.trim() && isRotated(t)).length;
    const candidates = buildBlocks(items, tc.styles as Record<string, PdfTextStyle>, vp, p - 1, octx, (m1, m2) => pdfjs.Util.transform(m1, m2));
    const textBoxes: Box[] = items
      .filter((t) => t.str && t.str.trim())
      .map((t) => {
        const m = pdfjs.Util.transform(vp.transform, t.transform);
        const fh = Math.hypot(m[2], m[3]);
        return [m[4] - 1, m[5] - fh * 1.05, m[4] + t.width * scale + 1, m[5] + fh * 0.35];
      });
    // Text boxes painted on a coarse grid (4px cells): a lookup instead of a scan of every box.
    const CELL = 4;
    const gw = Math.ceil(W / CELL);
    const gh = Math.ceil(H / CELL);
    const textGrid = new Uint8Array(gw * gh);
    for (const t of textBoxes) {
      const cx0 = Math.max(0, Math.floor(t[0] / CELL));
      const cx1 = Math.min(gw - 1, Math.floor(t[2] / CELL));
      for (let cy = Math.max(0, Math.floor(t[1] / CELL)); cy <= Math.min(gh - 1, Math.floor(t[3] / CELL)); cy++) textGrid.fill(1, cy * gw + cx0, cy * gw + cx1 + 1);
    }
    const inText = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && textGrid[Math.floor(y / CELL) * gw + Math.floor(x / CELL)] === 1;
    const pageBox: Box = [0, 0, W, H];

    // Walk the operator list: current transform, clip, opacity; find text drawn
    // as shapes (paths mostly covered by text boxes) and every picture's frame.
    type GState = { ctm: Mat; clip: Box; radius: number; alpha: number; pendingClip: boolean; masked: boolean; pattern: boolean };
    let g: GState = { ctm: vp.transform.slice(), clip: [-1e9, -1e9, 1e9, 1e9], radius: 0, alpha: 1, pendingClip: false, masked: false, pattern: false };
    const stack: GState[] = [];
    const maskDepth: boolean[] = [];
    const glyphOps = new Set<number>();
    const imageInfo = new Map<number, Omit<ImageLayer, "kind">>();
    /** Where each painting operation can draw (page px), to group layers. */
    const opBox = new Map<number, Box>();
    // Text drawn rotated: kept in the background layers (see `items` above).
    const rotatedTextOps = new Set<number>();
    let textRotated = false;
    let maskedImages = 0;
    const maskedGroups: boolean[] = [];
    // Soft masks being defined, and the last one finished. A mask that is just
    // solid shapes (Figma wraps every frame in one) only crops: it becomes a clip.
    type MaskDef = { simple: boolean; box: Box | null; radius: number };
    const maskDefs: MaskDef[] = [];
    let lastMask: MaskDef | null = null;
    const markComplex = () => maskDefs.forEach((m) => (m.simple = false));
    let transparency = 0;
    for (let i = 0; i < F.length; i++) {
      const f = F[i];
      const a = A[i] as unknown[];
      if (f === O.beginGroup) {
        const grp = a[0] as { smask?: { subtype?: string } };
        maskDepth.push(!!grp?.smask);
        if (grp?.smask) maskDefs.push({ simple: grp.smask.subtype === "Alpha", box: null, radius: 0 });
        // A group drawn while a soft mask is on is faded as a whole, even if
        // pdf.js turns the mask off for the drawing inside it.
        maskedGroups.push(g.masked || maskedGroups.includes(true));
        if (grp?.smask) transparency++;
      } else if (f === O.endGroup) {
        if (maskDepth.pop()) lastMask = maskDefs.pop() ?? null;
        maskedGroups.pop();
      }
      if (f === O.save || f === O.paintFormXObjectBegin || f === O.beginGroup) {
        stack.push({ ...g, clip: [...g.clip] as Box });
        if (f === O.paintFormXObjectBegin && a[0]) g.ctm = mul(g.ctm, a[0] as Mat);
      } else if (f === O.restore || f === O.paintFormXObjectEnd || f === O.endGroup) {
        g = stack.pop() ?? g;
      } else if (f === O.transform) {
        g.ctm = mul(g.ctm, a as Mat);
      } else if (f === O.setGState) {
        for (const [k, v] of a[0] as [string, unknown][]) {
          if (k === "ca") g.alpha *= v as number;
          if (k === "SMask") {
            if (v && lastMask?.simple && lastMask.box) {
              g.clip = inter(g.clip, lastMask.box);
              if (lastMask.radius) g.radius = lastMask.radius;
              g.masked = false;
            } else g.masked = !!v;
          }
          if (k === "BM" && v !== "source-over") transparency++;
        }
      } else if (f === O.setFillColorN) {
        g.pattern = true;
      } else if (f === O.setFillRGBColor || f === O.setFillGray || f === O.setFillCMYKColor) {
        g.pattern = false;
      } else if (f === O.clip || f === O.eoClip) {
        g.pendingClip = true;
      } else if (f === O.constructPath) {
        const mm = a[2] as ArrayLike<number> | null;
        const pathData = (a[1] as (ArrayLike<number> | null)[] | null)?.[0];
        if (mm) {
          const b = boxOf(g.ctm, mm[0], mm[1], mm[2], mm[3]);
          if (g.pendingClip) {
            g.clip = inter(g.clip, b);
            const r = radiusOf(pathData, mm, g.ctm);
            if (r) g.radius = r;
          }
          if (a[0] !== O.endPath) opBox.set(i, inter([b[0] - 4, b[1] - 4, b[2] + 4, b[3] + 4], inter(g.clip, pageBox)));
          const m = maskDefs[maskDefs.length - 1];
          if (m && a[0] !== O.endPath) {
            if ((a[0] === O.fill || a[0] === O.eoFill) && !g.pattern && g.alpha === 1 && isRectLike(pathData, mm)) {
              const clipped = inter(b, g.clip);
              m.box = m.box ? [Math.min(m.box[0], clipped[0]), Math.min(m.box[1], clipped[1]), Math.max(m.box[2], clipped[2]), Math.max(m.box[3], clipped[3])] : clipped;
              m.radius = Math.max(m.radius, radiusOf(pathData, mm, g.ctm));
            } else markComplex();
          }
          if (a[0] !== O.endPath && !empty(b) && !maskDepth.includes(true)) {
            let hit = 0;
            const sx = (b[2] - b[0]) / 8;
            const sy = (b[3] - b[1]) / 8;
            for (let gx = 0; gx < 8; gx++) for (let gy = 0; gy < 8; gy++) if (inText(b[0] + sx * (gx + 0.5), b[1] + sy * (gy + 0.5))) hit++;
            // Text drawn as outlines: mostly covered by text boxes, or partly
            // covered and as intricate as lettering (a paragraph drawn as one
            // shape leaves its blank lines uncovered; a button is a few segments).
            if (hit / 64 >= 0.6 || (hit / 64 >= 0.35 && pathCommands(pathData) >= 60)) glyphOps.add(i);
          }
        }
        g.pendingClip = false;
      } else if (isImage(f)) {
        if (maskDefs.length) markComplex();
        const box = boxOf(g.ctm, 0, 0, 1, 1);
        const frame = inter(box, inter(g.clip, [0, 0, W, H]));
        opBox.set(i, frame);
        // A picture faded by a soft mask can't be shown on its own: it stays in the background layers.
        if (g.masked || maskDepth.includes(true) || maskedGroups.includes(true)) maskedImages++;
        else if (!empty(frame)) imageInfo.set(i, { src: String(a[0] ?? `inline-${i}`), box, frame, radius: g.radius, opacity: g.alpha });
      } else if (f === O.shadingFill || f === O.paintSolidColorImageMask) {
        if (maskDefs.length) markComplex();
        opBox.set(i, inter(g.clip, pageBox));
      } else if (f === O.beginText) {
        textRotated = false;
      } else if (f === O.setTextMatrix) {
        const m = mul(g.ctm, Array.from(a[0] as ArrayLike<number>));
        textRotated = Math.abs(m[1]) > 0.01 * Math.abs(m[0]) || Math.abs(m[2]) > 0.01 * Math.abs(m[3]);
      } else if (isText(f) && textRotated) {
        rotatedTextOps.add(i);
        opBox.set(i, inter(g.clip, pageBox));
      }
    }

    // Image pixels, one canvas per distinct PDF image.
    const images: Record<string, HTMLCanvasElement> = {};
    for (const info of imageInfo.values()) {
      if (images[info.src]) continue;
      try {
        // Images used on several pages are shared (ids "g_…") in commonObjs.
        const objs = info.src.startsWith("g_") ? page.commonObjs : page.objs;
        const c = imageToCanvas(objs.get(info.src));
        if (c) images[info.src] = c;
      } catch {
        // inline / unresolved image: stays part of the vector layers below
      }
    }

    // Paint order. Vector drawing goes into as few layers as possible: a
    // drawing joins an earlier layer unless something painted in between
    // (a picture or another layer) overlaps it — moving it down then
    // changes nothing on screen. Each layer is one render of the page.
    const paints = (i: number) =>
      (isImage(F[i]) ||
      isText(F[i]) ||
      (F[i] === O.constructPath && A[i]?.[0] !== O.endPath) ||
      F[i] === O.shadingFill ||
      F[i] === O.paintSolidColorImageMask);
    const overlaps = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
    type Entry = { type: "image"; op: number; box: Box } | { type: "vector"; ops: Set<number>; box: Box };
    const entries: Entry[] = [];
    for (let i = 0; i < F.length; i++) {
      if (!paints(i) || glyphOps.has(i) || (isText(F[i]) && !rotatedTextOps.has(i))) continue;
      const box = opBox.get(i) ?? pageBox;
      if (empty(box)) continue;
      if (isImage(F[i]) && imageInfo.has(i) && images[imageInfo.get(i)!.src]) {
        entries.push({ type: "image", op: i, box });
        continue;
      }
      let last = -1;
      for (let k = entries.length - 1; k >= 0; k--) if (overlaps(entries[k].box, box)) { last = k; break; }
      let target = -1;
      // The overlapping entry itself if it is a layer, else the first layer after it.
      for (let k = Math.max(0, last); k < entries.length; k++) if (entries[k].type === "vector") { target = k; break; }
      if (target >= 0) {
        const e = entries[target] as Extract<Entry, { type: "vector" }>;
        e.ops.add(i);
        e.box = [Math.min(e.box[0], box[0]), Math.min(e.box[1], box[1]), Math.max(e.box[2], box[2]), Math.max(e.box[3], box[3])];
      } else entries.push({ type: "vector", ops: new Set([i]), box });
    }

    // Balanced blocks (save…restore, groups, form objects): a block with
    // nothing of the current layer inside is skipped whole — its state ends
    // with it, and skipping it spares pdf.js its masks and transparency maths.
    const blockEnd = new Int32Array(F.length).fill(-1);
    {
      const open: number[] = [];
      for (let i = 0; i < F.length; i++) {
        const f = F[i];
        if (f === O.save || f === O.beginGroup || f === O.paintFormXObjectBegin) open.push(i);
        else if (f === O.restore || f === O.endGroup || f === O.paintFormXObjectEnd) {
          const st = open.pop();
          if (st !== undefined) blockEnd[st] = i;
        }
      }
    }
    const filterFor = (ops: Set<number>) => {
      const prefix = new Int32Array(F.length + 1);
      for (let i = 0; i < F.length; i++) prefix[i + 1] = prefix[i] + (ops.has(i) ? 1 : 0);
      let skipUntil = -1;
      return (i: number) => {
        curOp = i;
        if (i <= skipUntil) return false;
        const end = blockEnd[i];
        if (end > i && prefix[end + 1] - prefix[i] === 0) {
          skipUntil = end;
          return false;
        }
        return true;
      };
    };

    const layers: Layer[] = [];
    const vectorCount = entries.filter((x) => x.type === "vector").length;
    let done = 0;
    for (const e of entries) {
      if (e.type === "image") {
        const info = imageInfo.get(e.op)!;
        const x0 = Math.max(0, Math.floor(info.frame[0]));
        const y0 = Math.max(0, Math.floor(info.frame[1]));
        const x1 = Math.min(W, Math.ceil(info.frame[2]));
        const y1 = Math.min(H, Math.ceil(info.frame[3]));
        let shown: HTMLCanvasElement | undefined;
        if (x1 > x0 && y1 > y0) {
          shown = canvasOf(x1 - x0, y1 - y0);
          const sctx = shown.getContext("2d") as CanvasRenderingContext2D;
          const only = new Set([e.op]);
          await withGate(
            (i) => !paints(i) || i === e.op,
            () =>
              page.render({ canvasContext: sctx, viewport: page.getViewport({ scale, offsetX: -x0, offsetY: -y0 }), canvas: shown!, background: "rgba(0,0,0,0)", operationsFilter: filterFor(only) }).promise,
          );
        }
        layers.push({ kind: "image", ...info, shown, shownBox: shown ? [x0, y0, x1, y1] : undefined });
        continue;
      }
      onProgress?.(`Page ${p}/${pdf.numPages}: background layer ${++done}/${vectorCount}`);
      // Render just the layer's area: the viewport is shifted so the area starts at 0,0.
      const x0 = Math.max(0, Math.floor(e.box[0]));
      const y0 = Math.max(0, Math.floor(e.box[1]));
      const x1 = Math.min(W, Math.ceil(e.box[2]));
      const y1 = Math.min(H, Math.ceil(e.box[3]));
      if (x1 <= x0 || y1 <= y0) continue;
      const c = canvasOf(x1 - x0, y1 - y0);
      const ctx = c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
      await withGate(
        (i) => !paints(i) || e.ops.has(i),
        () =>
          page.render({
            canvasContext: ctx,
            viewport: page.getViewport({ scale, offsetX: -x0, offsetY: -y0 }),
            canvas: c,
            background: "rgba(0,0,0,0)",
            operationsFilter: filterFor(e.ops),
          }).promise,
      );
      const cropped = cropToContent(c);
      if (cropped) {
        const b = cropped.box;
        layers.push({ kind: "vector", box: [b[0] + x0, b[1] + y0, b[2] + x0, b[3] + y0], canvas: cropped.canvas });
      }
    }

    // Text that isn't actually visible on the page (a hidden carousel slide,
    // text under a picture) has no ink in the original: leave it out.
    // The page minus the text that becomes editable, in one gated render.
    const background = canvasOf(W, H);
    const bctx = background.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    bctx.fillStyle = "#fff";
    bctx.fillRect(0, 0, W, H);
    {
      const textless = canvasOf(W, H);
      const tctx = textless.getContext("2d") as CanvasRenderingContext2D;
      await withGate(
        (i) => !glyphOps.has(i) && !(isText(F[i]) && !rotatedTextOps.has(i)),
        () =>
          page.render({
            canvasContext: tctx,
            viewport: vp,
            canvas: textless,
            background: "rgba(0,0,0,0)",
            operationsFilter: (i: number) => {
              curOp = i;
              return true;
            },
          }).promise,
      );
      bctx.drawImage(textless, 0, 0);
    }
    const fd = bctx.getImageData(0, 0, W, H).data;
    const od = octx.getImageData(0, 0, W, H).data;
    const blocks = candidates.filter((b) => {
      let ink = 0;
      let n = 0;
      const step = Math.max(1, Math.floor(Math.min(b.w, b.h) / 12));
      for (let y = Math.max(0, Math.floor(b.top)); y < Math.min(H, b.top + b.h); y += step) {
        for (let x = Math.max(0, Math.floor(b.x)); x < Math.min(W, b.x + b.w); x += step) {
          const i = (y * W + x) * 4;
          n++;
          if (Math.abs(od[i] - fd[i]) + Math.abs(od[i + 1] - fd[i + 1]) + Math.abs(od[i + 2] - fd[i + 2]) > 60) ink++;
        }
      }
      return n > 0 && ink / n > 0.02;
    });
    const hiddenText = candidates.length - blocks.length;
    // Headings keep the designer's line breaks ("Le temps long." / "Les liens
    // durables.") — the live font differs, so re-flowing by width would move
    // them. The id was computed from the joined text, so it doesn't change.
    for (const b of blocks) {
      if ((b.kind === "heading" || b.kind === "subhead") && b.sourceLines && b.sourceLines.length > 1) b.text = b.sourceLines.map((l) => l.trim()).join("\n");
    }
    // Paragraphs whose text runs use several fonts or sizes (bold, italic, a
    // different size) — the editor shows a block in one style for now.
    const mixedStyles = blocks.filter((b) => {
      const styles = new Set<string>();
      for (const t of items) {
        if (!t.str?.trim()) continue;
        const m = pdfjs.Util.transform(vp.transform, t.transform);
        if (m[4] >= b.x - 1 && m[4] <= b.x + b.w + 1 && m[5] >= b.top && m[5] <= b.top + b.h + 2) styles.add(`${t.fontName}|${Math.round(Math.hypot(m[2], m[3]))}`);
      }
      return styles.size > 1;
    }).length;

    const report: ReportItem[] = [];
    if (hiddenText)
      report.push({ code: "hidden_text", count: hiddenText, message: "Some text in the PDF isn't visible on the page (e.g. hidden carousel slides or text under a picture). It was left out of the editable fields." });
    if (mixedStyles)
      report.push({ code: "mixed_styles", count: mixedStyles, message: "Some paragraphs mix styles (bold, italic, sizes). The editor shows each paragraph in a single style." });
    if (iconItems)
      report.push({ code: "icons_as_text", count: iconItems, message: "Some icons are written as text in the PDF (icon font). They are kept as pictures, not editable text." });
    // A few paths (an underline, a bullet) aren't worth a warning.
    if (glyphOps.size >= 5)
      report.push({
        code: "text_as_shapes",
        count: glyphOps.size,
        message: "The PDF draws its text as shapes. The editable text was rebuilt from the PDF's hidden text layer, so line breaks and letter spacing can differ slightly.",
      });
    const fontNames = new Set(items.map((t) => t.fontName as string).filter(Boolean));
    let approx = 0;
    for (const fn of fontNames) {
      try {
        const font = page.commonObjs.get(fn) as { type?: string; missingFile?: boolean };
        if (font?.type === "Type3" || font?.missingFile) approx++;
      } catch {
        approx++;
      }
    }
    if (approx)
      report.push({
        code: "fonts_approximated",
        count: approx,
        message: "Some fonts aren't usable from the PDF (drawn glyphs or not embedded). The text uses the closest available font — set the design fonts to match.",
      });
    if (!items.some((t) => t.str?.trim()) && imageInfo.size)
      report.push({ code: "scanned_page", message: "This page looks scanned (a picture with no text). Its text can't be edited — text recognition (OCR) isn't supported." });
    if (rotatedItems)
      report.push({ code: "rotated_text", count: rotatedItems, message: "Some text is rotated or slanted. It is kept as part of the background, so it can't be edited." });
    if (maskedImages)
      report.push({
        code: "masked_images",
        count: maskedImages,
        message: "Some pictures fade into the design through a transparency mask. They are kept as part of the background, so they can't be replaced.",
      });
    if (transparency)
      report.push({ code: "transparency", count: transparency, message: "Transparency effects (masks, blend modes) are kept as part of the background, not as separate editable pieces." });
    const hidden = [...imageInfo.keys()].filter((k) => {
      const f = imageInfo.get(k)!.frame;
      return [...imageInfo.entries()].some(([k2, o]) => k2 > k && o.opacity === 1 && o.frame[0] <= f[0] && o.frame[1] <= f[1] && o.frame[2] >= f[2] && o.frame[3] >= f[3]);
    }).length;
    if (hidden)
      report.push({ code: "hidden_images", count: hidden, message: "Some pictures are completely covered by others (e.g. hidden carousel slides). They are kept but not shown." });

    console.info(`[pdf-reconstruct] page ${p}: ${Math.round(performance.now() - t0)} ms, ${vectorCount} vector layers, ${imageInfo.size} images`);
    out.push({ pageIndex: p - 1, scale, w: W, h: H, layers, images, blocks, original, background, report });
    page.cleanup();
  }
  return out;
}
