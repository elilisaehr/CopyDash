"use client";

// One page of the Design Editor: the design image with its editable text
// blocks, laid out as a "flow" (lib/design-flow). When a block gets more
// text than the design planned for, the blocks and image below it move
// down; the image is redrawn on a canvas, cut under each growing block, with
// the gap filled by stretching the plainest background row found just
// under the cut. With no overflow the plain <img> is shown, as before.

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
}: {
  pg: RenderedPage;
  pageRef?: (el: HTMLDivElement | null) => void;
  renderBlock: (b: DesignBlock, layout: BlockLayout) => React.ReactNode;
  /** Reports where each block ended up and which ones are too long. */
  onFlow?: (info: Record<string, BlockFlowInfo>) => void;
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
    () => computeFlow(pg.blocks.map((b) => ({ id: b.id, top: b.top, bottom: b.top + b.h, extra: extraOf(b) }))),
    [pg.blocks, extraOf],
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
  React.useLayoutEffect(() => {
    if (!flowing || !img || !canvasRef.current) return;
    drawFlow(canvasRef.current, img, pg.w, pg.h, flow.steps, flow.total);
  }, [flowing, img, pg.w, pg.h, flow.steps, flow.total]);

  const height = pg.h + (img ? flow.total : 0);

  return (
    <div
      ref={pageRef}
      style={{ position: "relative", width: pg.w, height, background: "#fff", borderRadius: 6, overflow: "hidden", boxShadow: "0 4px 30px rgba(0,0,0,0.14)", flexShrink: 0 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={pg.url} crossOrigin="anonymous" width={pg.w} height={pg.h} draggable={false} style={{ display: flowing ? "none" : "block", userSelect: "none" }} alt="" />
      {flowing && <canvas ref={canvasRef} style={{ display: "block", width: pg.w, height }} />}

      {/* A block spanning a cut (e.g. a paragraph beside a growing title)
          hides the stretched strip behind its own background. */}
      {pg.blocks.map((b) => {
        const st = flowing ? flow.stretch[b.id] || 0 : 0;
        if (!st) return null;
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
          forceLift: flowing && (flow.stretch[b.id] || 0) > 0,
          overflow: extraOf(b) > 0,
          pageW: pg.w,
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

/** Redraws the design on `canvas`, cut at each step and moved down by its offset. */
function drawFlow(canvas: HTMLCanvasElement, img: HTMLImageElement, w: number, h: number, steps: FlowStep[], total: number) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round((h + total) * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const nw = img.naturalWidth;
  const ry = img.naturalHeight / h;
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
