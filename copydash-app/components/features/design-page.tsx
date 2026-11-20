"use client";

// One page of the Design Editor: the design image with its editable text
// blocks, laid out as a "flow" (lib/design-flow). When a block gets more
// text than the design planned for, the blocks and image below it move
// down; the image is redrawn on a canvas, cut under each growing block, with
// the gap filled by stretching the plainest background row found just
// under the cut, and any picture under the cut zoomed to its new height.
// With no overflow the plain <img> is shown, as before.

import * as React from "react";
import { Icon } from "@/components/ui/icon";
import type { BlockLayout } from "@/components/features/editable-block";
import { computeFlow, lineCaps, OVERFLOW_TOLERANCE, type FlowStep } from "@/lib/design-flow";
import type { DesignBlock, RenderedPage } from "@/lib/pdf-design";

export interface BlockFlowInfo {
  shift: number;
  overflow: boolean;
}

export function DesignPage({
  pg,
  pageRef,
  renderBlock,
  onFlow,
  liveText,
  stack,
  patches,
  renderOverlay,
}: {
  pg: RenderedPage;
  pageRef?: (el: HTMLDivElement | null) => void;
  renderBlock: (b: DesignBlock, layout: BlockLayout) => React.ReactNode;
  /** Reports where each block ended up and which ones are too long. */
  onFlow?: (info: Record<string, BlockFlowInfo>) => void;
  /** The image has no text of its own (a rebuilt PDF page): every block shows its text, with no background box. */
  liveText?: boolean;
  /** Rebuilt PDF page: the pieces the image is made of, in paint order (page px). When text
   * grows, each piece is moved, stretched or zoomed on its own instead of guessing from the image. */
  stack?: StackPiece[];
  /** Rebuilt page: frames (page px) whose picture was replaced or re-cropped. The page is
   * shown as the exact background with only these areas redrawn from `stack`. */
  patches?: StackBox[];
  /** Drawn above the page image, under the text (e.g. the photo selection). Gets the
   * vertical offset growing text adds at a page y, and the page's flow steps. */
  renderOverlay?: (shiftAt: (y: number) => number) => React.ReactNode;
}) {
  const [sizes, setSizes] = React.useState<Record<string, { cur: number; orig: number }>>({});
  const onMeasure = React.useCallback((id: string, cur: number, orig: number) => {
    setSizes((p) => (p[id]?.cur === cur && p[id]?.orig === orig ? p : { ...p, [id]: { cur, orig } }));
  }, []);

  const extraOf = React.useCallback(
    (b: DesignBlock) => {
      const s = sizes[b.id];
      if (!s) return 0;
      const extra = s.cur - Math.max(b.h + 6, s.orig);
      return extra > OVERFLOW_TOLERANCE ? extra : 0;
    },
    [sizes],
  );

  const flow = React.useMemo(
    () =>
      computeFlow(
        pg.blocks.map((b) => ({
          id: b.id,
          top: b.top,
          bottom: b.top + b.h,
          extra: extraOf(b),
          // Pieces redrawn one by one: cut through the middle of the last line.
          cut: stack ? b.top + b.h - Math.min(b.h, b.lineHeight || b.h) / 2 : undefined,
        })),
      ),
    [pg.blocks, extraOf, stack],
  );

  // Tell the editor where blocks moved (scroll sync) and which overflow (field warnings).
  const flowKey = pg.blocks.map((b) => `${flow.shift[b.id] || 0}:${extraOf(b) ? 1 : 0}`).join(",");
  React.useEffect(() => {
    if (!onFlow) return;
    const info: Record<string, BlockFlowInfo> = {};
    for (const b of pg.blocks) info[b.id] = { shift: flow.shift[b.id] || 0, overflow: extraOf(b) > 0 };
    onFlow(info);
    // flowKey sums up everything `info` is built from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowKey, onFlow]);

  // The design image, loaded once so it can be redrawn cut and stretched.
  const [img, setImg] = React.useState<HTMLImageElement | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => !cancelled && setImg(el);
    el.src = pg.url;
    return () => {
      cancelled = true;
    };
  }, [pg.url]);

  const caps = React.useMemo(
    () => lineCaps(pg.blocks, pg.w, img ? (b) => freeSpan(img, b, pg.h) : undefined),
    [pg.blocks, pg.w, pg.h, img],
  );

  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const flowing = flow.total > 0 && !!img;
  const patched = !!stack && !!patches?.length && !!img;
  const drawn = flowing || patched;
  const pictures = React.useMemo(
    () => {
      if (!flowing || !img || stack) return [];
      // Where each cut's growing text starts: the zoom begins just above it,
      // so whatever sits higher in the picture (a menu, a logo) stays put.
      const anchors = flow.steps.map((s) => {
        const growing = pg.blocks.filter((b) => extraOf(b) > 0 && Math.abs(Math.round(b.top + b.h) - s.y) <= 1);
        return growing.length ? Math.min(...growing.map((b) => b.top)) : s.y;
      });
      return findPictures(img, pg.w, pg.h, flow.steps, anchors, pg.blocks);
    },
    [flowing, img, stack, pg.w, pg.h, flow.steps, pg.blocks, extraOf],
  );
  // Blocks over a zoomed picture: its copy of their text is wiped, so they show their own.
  const onPicture = React.useMemo(() => {
    const ids = new Set<string>();
    if (!img || !pictures.length) return ids;
    const rx = img.naturalWidth / pg.w;
    const ry = img.naturalHeight / pg.h;
    for (const b of pg.blocks) if (onAnyPicture(b, pictures, rx, ry)) ids.add(b.id);
    return ids;
  }, [img, pictures, pg.blocks, pg.w, pg.h]);
  React.useLayoutEffect(() => {
    if (!drawn || !img || !canvasRef.current) return;
    if (stack && flowing) drawStack(canvasRef.current, stack, pg.w, pg.h, flow.steps, flow.total);
    else if (stack && patches?.length) drawPatched(canvasRef.current, img, stack, pg.w, pg.h, patches);
    else drawFlow(canvasRef.current, img, pg.w, pg.h, flow.steps, flow.total, pictures, pg.blocks);
  }, [drawn, flowing, img, stack, patches, pg.w, pg.h, pg.blocks, flow.steps, flow.total, pictures]);

  const steps = flow.steps;
  const shiftAt = React.useCallback((y: number) => (img ? offsetAt(steps, y) : 0), [img, steps]);

  const height = pg.h + (img ? flow.total : 0);

  return (
    <div
      ref={pageRef}
      style={{ position: "relative", width: pg.w, height, background: "#fff", borderRadius: 6, overflow: "hidden", boxShadow: "0 4px 30px rgba(0,0,0,0.14)", flexShrink: 0 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={pg.url} crossOrigin="anonymous" width={pg.w} height={pg.h} draggable={false} style={{ display: drawn ? "none" : "block", userSelect: "none" }} alt="" />
      {drawn && <canvas ref={canvasRef} style={{ display: "block", width: pg.w, height }} />}
      {renderOverlay?.(shiftAt)}

      {/* A block spanning a cut (e.g. a paragraph beside a growing title)
          hides the stretched strip behind its own background. */}
      {pg.blocks.map((b) => {
        const st = flowing ? flow.stretch[b.id] || 0 : 0;
        if (!st || liveText || onPicture.has(b.id)) return null;
        return (
          <div
            key={`cover-${b.id}`}
            style={{
              position: "absolute",
              left: b.x - 5,
              top: b.top - 3 + (flow.shift[b.id] || 0),
              width: b.w + 20,
              height: b.h + 6 + st,
              background: `rgb(${b.bg[0]},${b.bg[1]},${b.bg[2]})`,
              borderRadius: 4,
            }}
          />
        );
      })}

      {pg.blocks.map((b) =>
        renderBlock(b, {
          shift: img ? flow.shift[b.id] || 0 : 0,
          maxWidth: caps[b.id],
          forceLift: !liveText && flowing && (flow.stretch[b.id] || 0) > 0,
          onPicture: liveText || onPicture.has(b.id),
          overflow: extraOf(b) > 0,
          pageW: pg.w,
          fitWidth: liveText,
          onMeasure,
        }),
      )}

      {pg.blocks.map((b) =>
        extraOf(b) > 0 ? (
          <div
            key={`warn-${b.id}`}
            style={{ position: "absolute", left: b.x - 5, width: b.w + 20, top: b.top - 3 + (flow.shift[b.id] || 0) - 22, display: "flex", justifyContent: "flex-end", pointerEvents: "none", zIndex: 5 }}
          >
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 999, background: "#fffbeb", border: "1px solid #fcd34d", color: "#92400e", fontSize: 10, fontWeight: 600, fontFamily: "var(--font-sans)", whiteSpace: "nowrap", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}
            >
              <Icon name="alert-circle" size={10} color="#b45309" />
              Too long for the design
            </span>
          </div>
        ) : null,
      )}
    </div>
  );
}

export type StackBox = [number, number, number, number];
export type StackPiece =
  | { kind: "vector"; img: CanvasImageSource; box: StackBox }
  | { kind: "image"; img: CanvasImageSource; box: StackBox; frame: StackBox; radius: number; opacity: number };

/**
 * Rebuilt PDF page: redraws its pieces in paint order with the content
 * pushed down. A background layer is cut at each growing block — the part
 * below moves down and the gap repeats that layer's own row at the cut, so
 * a section or a button crossed by the cut just gets taller. A picture whose
 * frame a cut runs through grows with it, zoomed from its own pixels (sides
 * cropped evenly). Pieces painted later stay on top, as in the PDF.
 */
function drawStack(canvas: HTMLCanvasElement, stack: StackPiece[], w: number, h: number, steps: FlowStep[], total: number) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round((h + total) * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h + total);
  drawPieces(ctx, stack, steps);
}

/**
 * No text has grown, but some pictures were replaced or re-cropped: the exact
 * background everywhere, and inside each changed frame the pieces redrawn in
 * paint order (so a gradient or a logo painted over the photo stays on top).
 */
function drawPatched(canvas: HTMLCanvasElement, img: HTMLImageElement, stack: StackPiece[], w: number, h: number, patches: StackBox[]) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.drawImage(img, 0, 0, w, h);
  for (const [x0, y0, x1, y1] of patches) {
    // Whole page pixels, one pixel wider: no seam of the old picture at the edge.
    const r: StackBox = [Math.floor(x0) - 1, Math.floor(y0) - 1, Math.ceil(x1) + 1, Math.ceil(y1) + 1];
    ctx.save();
    ctx.beginPath();
    ctx.rect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
    ctx.clip();
    ctx.fillStyle = "#fff";
    ctx.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
    drawPieces(ctx, stack.filter((p) => overlaps(p.kind === "image" ? p.frame : p.box, r)), []);
    ctx.restore();
  }
}

const overlaps = (a: StackBox, b: StackBox) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

function drawPieces(ctx: CanvasRenderingContext2D, stack: StackPiece[], steps: FlowStep[]) {
  for (const p of stack) {
    if (p.kind === "vector") {
      const [x0, y0, x1, y1] = p.box;
      const lw = x1 - x0;
      const lh = y1 - y0;
      // Source px per page px (layers are stored sharper than they are shown).
      const sx = sourceWidth(p.img) / lw || 1;
      const sy = sourceHeight(p.img) / lh || 1;
      let from = y0;
      let off = offsetAt(steps, y0);
      for (const s of steps) {
        if (s.y <= y0 || s.y >= y1) continue;
        ctx.drawImage(p.img, 0, (from - y0) * sy, lw * sx, (s.y - from) * sy, x0, from + off, lw, s.y - from);
        // The gap: this layer's plainest row near the cut, stretched (an icon
        // or a border on the exact cut row would turn into streaks).
        const row = plainestLayerRow(p.img, Math.min(lh - 1, s.y - y0) * sy, 6 * sy);
        ctx.drawImage(p.img, 0, row, lw * sx, Math.max(1, sy), x0, s.y + off, lw, s.offset - off);
        from = s.y;
        off = s.offset;
      }
      ctx.drawImage(p.img, 0, (from - y0) * sy, lw * sx, (y1 - from) * sy, x0, from + off, lw, y1 - from);
      continue;
    }
    const [fx0, fy0, fx1, fy1] = p.frame;
    const top = fy0 + offsetAt(steps, fy0);
    const bottom = fy1 + offsetAt(steps, fy1 - 0.01);
    const k = (bottom - top) / (fy1 - fy0);
    const cx = (fx0 + fx1) / 2;
    // The image box, scaled by k around the frame's top centre, then moved with it.
    const [bx0, by0, bx1, by1] = p.box;
    ctx.save();
    ctx.globalAlpha = p.opacity;
    ctx.beginPath();
    ctx.roundRect(fx0, top, fx1 - fx0, bottom - top, p.radius);
    ctx.clip();
    ctx.drawImage(p.img, cx + (bx0 - cx) * k, top + (by0 - fy0) * k, (bx1 - bx0) * k, (by1 - by0) * k);
    ctx.restore();
  }
}

/**
 * The most uniform row of a layer image within ±range of `row` (source px):
 * fewest changes along the row, ignoring fully transparent pixels. Cached per
 * image and row — called on every redraw while typing.
 */
const layerRowCache = new WeakMap<object, Map<number, number>>();
function plainestLayerRow(img: CanvasImageSource, row: number, range: number): number {
  const key = Math.round(row);
  let cache = layerRowCache.get(img as object);
  if (!cache) layerRowCache.set(img as object, (cache = new Map()));
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let best = key;
  try {
    const w = sourceWidth(img);
    const h = sourceHeight(img);
    const y0 = Math.max(0, Math.round(row - range));
    const y1 = Math.min(h, Math.round(row + range) + 1);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = Math.max(1, y1 - y0);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (ctx && y1 > y0) {
      ctx.drawImage(img, 0, y0, w, y1 - y0, 0, 0, w, y1 - y0);
      const d = ctx.getImageData(0, 0, w, y1 - y0).data;
      const step = Math.max(1, Math.floor(w / 400));
      let bestScore = Infinity;
      for (let y = 0; y < y1 - y0; y++) {
        let score = 0;
        for (let x = step; x < w; x += step) {
          const i = (y * w + x) * 4;
          const j = i - step * 4;
          score += Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2]) + Math.abs(d[i + 3] - d[j + 3]);
        }
        // Prefer rows close to the cut when equally plain.
        score += Math.abs(y0 + y - row) * 0.01;
        if (score < bestScore) {
          bestScore = score;
          best = y0 + y;
        }
      }
    }
  } catch {
    /* unreadable image: stretch the row at the cut */
  }
  cache.set(key, best);
  return best;
}

const sourceWidth = (img: CanvasImageSource) => (img instanceof HTMLImageElement ? img.naturalWidth : (img as HTMLCanvasElement).width);
const sourceHeight = (img: CanvasImageSource) => (img instanceof HTMLImageElement ? img.naturalHeight : (img as HTMLCanvasElement).height);

/** A picture (photo, illustration) crossed by a cut, in natural image px; rows [top, bottom). */
interface Picture {
  x0: number;
  x1: number;
  top: number;
  bottom: number;
}

/**
 * Redraws the design on `canvas`, cut at each step and moved down by its
 * offset. Each gap is filled by stretching the plainest row just under the
 * cut, which keeps backgrounds, cards and buttons crisp. Then every picture
 * a cut runs through is zoomed to its new height (proportions kept, sides
 * cropped evenly), from a copy with the design's own text wiped out (that
 * text is shown live on top, see `onPicture`).
 */
function drawFlow(canvas: HTMLCanvasElement, img: HTMLImageElement, w: number, h: number, steps: FlowStep[], total: number, pictures: Picture[], blocks: DesignBlock[]) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round((h + total) * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const nw = img.naturalWidth;
  const ry = img.naturalHeight / h;
  const rx = nw / w;
  const slice = (y0: number, y1: number, off: number) => {
    if (y1 > y0) ctx.drawImage(img, 0, y0 * ry, nw, (y1 - y0) * ry, 0, y0 + off, w, y1 - y0);
  };
  let prevY = 0;
  let prevOff = 0;
  for (const s of steps) {
    slice(prevY, s.y, prevOff);
    const row = plainestRow(img, s.y * ry, 10 * ry);
    ctx.drawImage(img, 0, row, nw, 1, 0, s.y + prevOff, w, s.offset - prevOff);
    prevY = s.y;
    prevOff = s.offset;
  }
  slice(prevY, h, prevOff);

  for (const p of pictures) {
    const top = p.top / ry;
    const bottom = p.bottom / ry;
    const destTop = top + offsetAt(steps, top);
    const destH = bottom + offsetAt(steps, bottom) - destTop;
    const srcW = p.x1 - p.x0;
    const srcH = p.bottom - p.top;
    const showW = srcW / (destH / (bottom - top));
    const clean = cleanPicture(img, p, blocks, rx, ry);
    if (!clean) continue;
    ctx.drawImage(clean, (srcW - showW) / 2, 0, showW, srcH, p.x0 / rx, destTop, srcW / rx, destH);
    // Unless the picture starts here, fade from the unzoomed picture above
    // into the zoomed one, so the line where the zoom starts doesn't show.
    const band = Math.min(48, (bottom - top) / 4);
    if (p.top > 0 && band >= 4 && !sharpAbove(img, p)) {
      const fade = document.createElement("canvas");
      fade.width = srcW;
      fade.height = Math.max(1, Math.round(band * ry));
      const f = fade.getContext("2d");
      if (f) {
        f.drawImage(clean, 0, 0, srcW, fade.height, 0, 0, srcW, fade.height);
        const g = f.createLinearGradient(0, 0, 0, fade.height);
        g.addColorStop(0, "rgba(0,0,0,1)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        f.globalCompositeOperation = "destination-in";
        f.fillStyle = g;
        f.fillRect(0, 0, srcW, fade.height);
        ctx.drawImage(fade, p.x0 / rx, destTop, srcW / rx, band);
      }
    }
  }
}

/** Whether the picture's top row sits on a real edge (the picture starts there, nothing to fade). */
function sharpAbove(img: HTMLImageElement, p: Picture): boolean {
  const pix = pixelsOf(img);
  if (!pix || p.top < 1) return true;
  const nw = img.naturalWidth;
  let hard = 0;
  let n = 0;
  for (let x = p.x0; x < p.x1; x += Math.max(1, Math.floor((p.x1 - p.x0) / 80))) {
    const i = (p.top * nw + x) * 4;
    const j = ((p.top - 1) * nw + x) * 4;
    n++;
    if (Math.abs(pix[i] - pix[j]) + Math.abs(pix[i + 1] - pix[j + 1]) + Math.abs(pix[i + 2] - pix[j + 2]) > 40) hard++;
  }
  return n > 0 && hard / n >= 0.6;
}

/** How far down the design is drawn at page y (the last cut at or above it). */
function offsetAt(steps: FlowStep[], y: number) {
  let off = 0;
  for (const s of steps) if (s.y <= y) off = s.offset;
  return off;
}

/** Whether a block's original box overlaps a picture (page px vs natural px). */
function onAnyPicture(b: DesignBlock, pictures: Picture[], rx: number, ry: number) {
  return pictures.some((p) => b.x < p.x1 / rx && b.x + b.w > p.x0 / rx && b.top < p.bottom / ry && b.top + b.h > p.top / ry);
}

/**
 * Finds the pictures each cut runs through. Around the cut, the page is
 * split into 16px-wide columns; a column is part of a picture when, outside
 * the text blocks, its pixels are not mostly one or two colours (a flat card
 * with text is two colours; a photo is many). Then the picture's rows are
 * found by scanning up and down from the cut, and its side edges refined.
 */
function findPictures(img: HTMLImageElement, w: number, h: number, steps: FlowStep[], anchors: number[], blocks: DesignBlock[]): Picture[] {
  const pix = pixelsOf(img);
  if (!pix) return [];
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const rx = nw / w;
  const ry = nh / h;
  const mask = maskOf(img, blocks, rx, ry);
  const cw = Math.max(2, Math.round(16 * rx));
  const pics: Picture[] = [];

  // 0 = flat, 1 = picture, 2 = can't tell (almost all text).
  const kindOf = (x0: number, x1: number, y0: number, y1: number, stepX: number, stepY: number): 0 | 1 | 2 => {
    const rs: number[] = [];
    const gs: number[] = [];
    const bs: number[] = [];
    let total = 0;
    let grainy = 0;
    let vchange = 0;
    const vgap = Math.max(1, Math.round(3 * ry));
    for (let y = y0; y < y1; y += stepY) {
      for (let x = x0; x < x1; x += stepX) {
        total++;
        if (mask[y * nw + x]) continue;
        const i = (y * nw + x) * 4;
        rs.push(pix[i]);
        gs.push(pix[i + 1]);
        bs.push(pix[i + 2]);
        // Grain: how often a pixel differs from the one next to it.
        const yb = Math.min(nh - 1, y + vgap);
        if (!mask[yb * nw + x] && Math.abs(pix[i] - pix[i + (yb - y) * nw * 4]) + Math.abs(pix[i + 1] - pix[i + 1 + (yb - y) * nw * 4]) + Math.abs(pix[i + 2] - pix[i + 2 + (yb - y) * nw * 4]) > 4) vchange++;
        if (x + 1 < nw && !mask[y * nw + x + 1] && Math.abs(pix[i] - pix[i + 4]) + Math.abs(pix[i + 1] - pix[i + 5]) + Math.abs(pix[i + 2] - pix[i + 6]) > 8) grainy++;
      }
    }
    if (rs.length < total * 0.25) return 2;
    const share = plainShare(rs, gs, bs);
    const grain = grainy / rs.length;
    // Many colours, grain, or colours that keep changing down the column
    // (a smooth photo): a flat card with text has none of these.
    return share < 0.6 || grain > 0.3 || vchange / rs.length > 0.15 ? 1 : 0;
  };

  steps.forEach((s, si) => {
    const cut = Math.max(0, Math.min(nh - 1, Math.round(s.y * ry)));
    const zoomFrom = Math.max(0, Math.round((anchors[si] - 8) * ry));
    const y0 = Math.max(0, Math.round((s.y - 48) * ry));
    const y1 = Math.min(nh, Math.round((s.y + 48) * ry));
    const kinds: (0 | 1 | 2)[] = [];
    // Whole columns only: the last one takes the leftover px (a 2px sliver at the page edge would be misread).
    const chunks = Math.max(1, Math.floor(nw / cw));
    const colEnd = (i: number) => (i >= chunks ? nw : i * cw);
    for (let i = 0; i < chunks; i++) kinds.push(kindOf(i * cw, colEnd(i + 1), y0, y1, 2, 2));
    // Columns that are all text take a picture next to them (text over a photo), else flat.
    const known = kinds.map((k, i) => {
      if (k !== 2) return k;
      let l = i - 1;
      while (l >= 0 && kinds[l] === 2) l--;
      let r = i + 1;
      while (r < kinds.length && kinds[r] === 2) r++;
      return (l >= 0 && kinds[l] === 1) || (r < kinds.length && kinds[r] === 1) ? 1 : 0;
    });
    // Runs of same-kind columns; a narrow smooth patch inside a picture is still the picture.
    const runs: { x0: number; x1: number; pic: boolean }[] = [];
    for (let i = 0; i < known.length; ) {
      let j = i;
      while (j < known.length && known[j] === known[i]) j++;
      runs.push({ x0: i * cw, x1: colEnd(j), pic: known[i] === 1 });
      i = j;
    }
    for (let i = 1; i < runs.length - 1; i++) {
      if (!runs[i].pic && runs[i - 1].pic && runs[i + 1].pic && runs[i].x1 - runs[i].x0 <= 64 * rx) runs[i].pic = true;
    }
    const merged: typeof runs = [];
    for (const r of runs) {
      const last = merged[merged.length - 1];
      if (last && last.pic === r.pic) last.x1 = r.x1;
      else merged.push({ ...r });
    }

    for (let ri = 0; ri < merged.length; ri++) {
      const run = merged[ri];
      if (!run.pic || run.x1 - run.x0 < 48 * rx) continue;
      const { x0, x1 } = run;
      // The picture's top and bottom: the first sharp line above and below the
      // cut, where most of the row changes at once (the edge of a card, of a photo,
      // of the section). Rows of text are skipped.
      const stepX = Math.max(1, Math.floor((x1 - x0) / 80));
      const sharpLine = (y: number, yn: number) => {
        let n = 0;
        let hard = 0;
        let total = 0;
        for (let x = x0; x < x1; x += stepX) {
          total++;
          if (mask[y * nw + x] || mask[yn * nw + x]) continue;
          const i = (y * nw + x) * 4;
          const j = (yn * nw + x) * 4;
          n++;
          if (Math.abs(pix[i] - pix[j]) + Math.abs(pix[i + 1] - pix[j + 1]) + Math.abs(pix[i + 2] - pix[j + 2]) > 40) hard++;
        }
        return n >= total * 0.25 && hard / n >= 0.6;
      };
      let top = cut;
      while (top > 0 && !sharpLine(top, top - 1)) top--;
      let bottom = cut;
      while (bottom < nh - 1 && !sharpLine(bottom, bottom + 1)) bottom++;
      // Zoom the whole picture, unless there is text on it higher up (a menu
      // on a hero photo): then start just above the growing text, so that stays put.
      const from = Math.min(zoomFrom, cut);
      const textAbove = blocks.some((b) => b.x < x1 / rx && b.x + b.w > x0 / rx && b.top * ry >= top && (b.top + b.h) * ry < from);
      let pic: Picture = { x0, x1, top: textAbove ? Math.max(top, from) : top, bottom: bottom + 1 };
      // A picture that fades into a plain area (a hero photo under a colour
      // overlay) takes that area too: no edge where they meet. One with a
      // clear edge (a photo in a card) keeps its own width.
      // Checked at the picture's real edges (columns are only found 16px at a time).
      pic = refineEdges(pix, mask, nw, pic, cw);
      let grew = false;
      for (let k = ri - 1; k >= 0 && seamless(pix, mask, nw, pic, pic.x0); k--) {
        pic = { ...pic, x0: merged[k].x0 };
        grew = true;
      }
      for (let k = ri + 1; k < merged.length && seamless(pix, mask, nw, pic, pic.x1); k++) {
        pic = { ...pic, x1: merged[k].x1 };
        grew = true;
      }
      if (grew) pic = refineEdges(pix, mask, nw, pic, cw);
      const same = pics.find((p) => p.x0 < pic.x1 && pic.x0 < p.x1 && p.top < pic.bottom && pic.top < p.bottom);
      if (same) {
        same.x0 = Math.min(same.x0, pic.x0);
        same.x1 = Math.max(same.x1, pic.x1);
        same.top = Math.min(same.top, pic.top);
        same.bottom = Math.max(same.bottom, pic.bottom);
      } else pics.push(pic);
    }
  });
  return pics;
}

/**
 * Whether the picture continues across column `x` with no visible edge:
 * on most rows of the picture, the pixels a few px each side of `x` match.
 */
function seamless(pix: Uint8ClampedArray, mask: Uint8Array, nw: number, p: Picture, x: number): boolean {
  if (x <= 4 || x >= nw - 4) return false;
  let n = 0;
  let same = 0;
  for (let k = 0; k < 32; k++) {
    const y = Math.floor(p.top + ((p.bottom - p.top) * (k + 0.5)) / 32);
    const a = y * nw + x - 4;
    const b = y * nw + x + 3;
    if (mask[a] || mask[b]) continue;
    n++;
    if (Math.abs(pix[a * 4] - pix[b * 4]) + Math.abs(pix[a * 4 + 1] - pix[b * 4 + 1]) + Math.abs(pix[a * 4 + 2] - pix[b * 4 + 2]) <= 24) same++;
  }
  return n >= 8 && same / n >= 0.85;
}

/**
 * Columns are found 16px at a time; moves each side of the picture to its
 * real edge: the first column, coming from the flat side, that no longer
 * matches the colour next to it.
 */
function refineEdges(pix: Uint8ClampedArray, mask: Uint8Array, nw: number, p: Picture, cw: number): Picture {
  const ys: number[] = [];
  for (let k = 0; k < 24; k++) ys.push(Math.floor(p.top + ((p.bottom - p.top) * (k + 0.5)) / 24));
  const isBg = (x: number, ref: number) => {
    let n = 0;
    let same = 0;
    for (const y of ys) {
      if (mask[y * nw + x] || mask[y * nw + ref]) continue;
      const i = (y * nw + x) * 4;
      const j = (y * nw + ref) * 4;
      n++;
      if (Math.abs(pix[i] - pix[j]) + Math.abs(pix[i + 1] - pix[j + 1]) + Math.abs(pix[i + 2] - pix[j + 2]) <= 30) same++;
    }
    return n > 0 && same / n >= 0.85;
  };
  let { x0, x1 } = p;
  if (x0 > 0) {
    const ref = Math.max(0, x0 - cw);
    let x = ref + 1;
    while (x < Math.min(nw, x0 + cw) && isBg(x, ref)) x++;
    x0 = x;
  }
  if (x1 < nw) {
    const ref = Math.min(nw - 1, x1 + cw - 1);
    let x = ref - 1;
    while (x > Math.max(x0, x1 - cw) && isBg(x, ref)) x--;
    x1 = x + 1;
  }
  return { ...p, x0, x1: Math.max(x1, x0 + 1) };
}

/**
 * Share of the samples covered by their two most common colours: close to 1
 * for a flat background with text, low for a photo.
 */
function plainShare(rs: number[], gs: number[], bs: number[]): number {
  const n = rs.length;
  if (!n) return 1;
  const alive = new Uint8Array(n).fill(1);
  let covered = 0;
  for (let pass = 0; pass < 2; pass++) {
    const hist = new Map<number, number>();
    let best = -1;
    let bestN = 0;
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      const key = ((rs[i] >> 4) << 8) | ((gs[i] >> 4) << 4) | (bs[i] >> 4);
      const c = (hist.get(key) || 0) + 1;
      hist.set(key, c);
      if (c > bestN) {
        bestN = c;
        best = key;
      }
    }
    if (best < 0) break;
    let mr = 0;
    let mg = 0;
    let mb = 0;
    let m = 0;
    for (let i = 0; i < n; i++) {
      if (alive[i] && (((rs[i] >> 4) << 8) | ((gs[i] >> 4) << 4) | (bs[i] >> 4)) === best) {
        mr += rs[i];
        mg += gs[i];
        mb += bs[i];
        m++;
      }
    }
    mr /= m;
    mg /= m;
    mb /= m;
    for (let i = 0; i < n; i++) {
      if (alive[i] && Math.abs(rs[i] - mr) + Math.abs(gs[i] - mg) + Math.abs(bs[i] - mb) <= 24) {
        alive[i] = 0;
        covered++;
      }
    }
  }
  return covered / n;
}

/**
 * A copy of the picture with the design's own text painted over: each text
 * box is filled by blending the pixels around it, so the zoomed picture
 * doesn't show a second, zoomed copy of the text.
 */
const cleanCache = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement | null>>();
function cleanPicture(img: HTMLImageElement, p: Picture, blocks: DesignBlock[], rx: number, ry: number): HTMLCanvasElement | null {
  const key = `${p.x0}:${p.x1}:${p.top}:${p.bottom}`;
  let cache = cleanCache.get(img);
  if (!cache) cleanCache.set(img, (cache = new Map()));
  if (cache.has(key)) return cache.get(key) ?? null;
  let out: HTMLCanvasElement | null = null;
  try {
    const src = sourceOf(img);
    const W = p.x1 - p.x0;
    const H = p.bottom - p.top;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const cctx = c.getContext("2d");
    if (src && cctx && W > 0 && H > 0) {
      const id = src.getImageData(p.x0, p.top, W, H);
      const d = id.data;
      for (const b of blocks) {
        const L = Math.max(0, Math.round((b.x - 4) * rx) - p.x0);
        const R = Math.min(W, Math.round((b.x + b.w + 4) * rx) - p.x0);
        const T = Math.max(0, Math.round((b.top - 4) * ry) - p.top);
        const B = Math.min(H, Math.round((b.top + b.h + 4) * ry) - p.top);
        if (R <= L || B <= T) continue;
        for (let y = T; y < B; y++) {
          for (let x = L; x < R; x++) {
            let r = 0;
            let g = 0;
            let bl = 0;
            let n = 0;
            const add = (ax: number, ay: number, wt: number) => {
              const i = (ay * W + ax) * 4;
              r += d[i] * wt;
              g += d[i + 1] * wt;
              bl += d[i + 2] * wt;
              n += wt;
            };
            const tx = (x - L + 1) / (R - L + 1);
            const ty = (y - T + 1) / (B - T + 1);
            if (L > 0) add(L - 1, y, R < W ? 1 - tx : 1);
            if (R < W) add(R, y, L > 0 ? tx : 1);
            if (T > 0) add(x, T - 1, B < H ? 1 - ty : 1);
            if (B < H) add(x, B, T > 0 ? ty : 1);
            if (!n) continue;
            const i = (y * W + x) * 4;
            d[i] = r / n;
            d[i + 1] = g / n;
            d[i + 2] = bl / n;
          }
        }
      }
      cctx.putImageData(id, 0, 0);
      out = c;
    }
  } catch {
    out = null;
  }
  cache.set(key, out);
  return out;
}

/** All the design image's pixels (natural size), read once. */
const pixelCache = new WeakMap<HTMLImageElement, Uint8ClampedArray | null>();
function pixelsOf(img: HTMLImageElement): Uint8ClampedArray | null {
  let d = pixelCache.get(img);
  if (d === undefined) {
    try {
      d = sourceOf(img)?.getImageData(0, 0, img.naturalWidth, img.naturalHeight).data ?? null;
    } catch {
      d = null;
    }
    pixelCache.set(img, d);
  }
  return d;
}

/** 1 for every natural pixel inside a text block (with a small margin), so text doesn't count as picture. */
const maskCache = new WeakMap<DesignBlock[], { img: HTMLImageElement; mask: Uint8Array }>();
function maskOf(img: HTMLImageElement, blocks: DesignBlock[], rx: number, ry: number): Uint8Array {
  const hit = maskCache.get(blocks);
  if (hit && hit.img === img) return hit.mask;
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const mask = new Uint8Array(nw * nh);
  for (const b of blocks) {
    const x0 = Math.max(0, Math.round((b.x - 3) * rx));
    const x1 = Math.min(nw, Math.round((b.x + b.w + 3) * rx));
    const y0 = Math.max(0, Math.round((b.top - 3) * ry));
    const y1 = Math.min(nh, Math.round((b.top + b.h + 3) * ry));
    for (let y = y0; y < y1; y++) mask.fill(1, y * nw + x0, y * nw + x1);
  }
  maskCache.set(blocks, { img, mask });
  return mask;
}

// Natural-size copy of each design image, read for pixel checks.
const sourceCache = new WeakMap<HTMLImageElement, CanvasRenderingContext2D | null>();
function sourceOf(img: HTMLImageElement): CanvasRenderingContext2D | null {
  let ctx = sourceCache.get(img);
  if (ctx === undefined) {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    ctx = c.getContext("2d", { willReadFrequently: true });
    ctx?.drawImage(img, 0, 0);
    sourceCache.set(img, ctx);
  }
  return ctx;
}

/**
 * How far the block's own background runs to its left and right, in page
 * px: scans a few rows across the block's height outward from its edges and
 * stops at the first pixel that clearly differs from the block background
 * (a picture, a button edge, other text).
 */
function freeSpan(img: HTMLImageElement, b: DesignBlock, pageH: number): { left: number; right: number } | null {
  try {
    const ctx = sourceOf(img);
    if (!ctx) return null;
    const r = img.naturalHeight / pageH;
    const nw = img.naturalWidth;
    const rows = [b.top + 2, b.top + b.h / 2, b.top + b.h - 2].map((y) => Math.max(0, Math.min(img.naturalHeight - 1, Math.round(y * r))));
    const differs = (d: Uint8ClampedArray, i: number) =>
      Math.abs(d[i] - b.bg[0]) + Math.abs(d[i + 1] - b.bg[1]) + Math.abs(d[i + 2] - b.bg[2]) > 36;
    let left = 0;
    let right = nw;
    for (const y of rows) {
      const d = ctx.getImageData(0, y, nw, 1).data;
      for (let x = Math.min(nw - 1, Math.round((b.x + b.w + 4) * r)); x < right; x++) if (differs(d, x * 4)) right = x;
      for (let x = Math.max(0, Math.round((b.x - 4) * r)); x > left; x--) if (differs(d, x * 4)) left = x;
    }
    return { left: left / r, right: right / r };
  } catch {
    return null;
  }
}

/** The most uniform pixel row in [y, y + range) — least likely to smear text or pictures when stretched. */
function plainestRow(img: HTMLImageElement, y: number, range: number): number {
  const nh = img.naturalHeight;
  const start = Math.max(0, Math.min(nh - 1, Math.round(y)));
  const rows = Math.max(1, Math.min(nh - start, Math.round(range)));
  try {
    const ctx = sourceOf(img);
    if (!ctx) return start;
    const nw = img.naturalWidth;
    const data = ctx.getImageData(0, start, nw, rows).data;
    let best = start;
    let bestVar = Infinity;
    const stepX = Math.max(1, Math.floor(nw / 400));
    for (let r = 0; r < rows; r++) {
      let sum = 0;
      let sq = 0;
      let n = 0;
      for (let x = 0; x < nw; x += stepX) {
        const i = (r * nw + x) * 4;
        const l = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        // Compare with the next sample along the row: edges, not colour areas, are what smear.
        const j = i + stepX * 4;
        const l2 = x + stepX < nw ? data[j] * 0.299 + data[j + 1] * 0.587 + data[j + 2] * 0.114 : l;
        const d = Math.abs(l - l2);
        sum += d;
        sq += d * d;
        n++;
      }
      const v = sq / n + sum / n;
      if (v < bestVar) {
        bestVar = v;
        best = start + r;
      }
    }
    return best;
  } catch {
    return start;
  }
}
