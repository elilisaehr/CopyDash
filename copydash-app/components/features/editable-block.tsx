"use client";

// Ported from project/copydash/pdfdesign.jsx (EditableBlock).
// A contentEditable <div> absolutely positioned over the rendered PDF page
// image at the block's {x, top, w, h}. By default the original text shows
// as a transparent overlay (so the underlying rendered pixels show through
// unchanged); on hover/active it gets a faint purple wash; once focused or
// edited it "lifts" to an opaque background-colour-matched pill so the new
// copy reads clearly against the design.

import * as React from "react";
import type { DesignBlock } from "@/lib/pdf-design";

/** Where DesignPage places the block once the page "flows" (see lib/design-flow). */
export interface BlockLayout {
  /** px the block moves down because text above it grew. */
  shift: number;
  /** Single-line blocks: max text width before wrapping onto a new line. */
  maxWidth?: number;
  /** Show the text on its opaque background even when unedited (the design image behind it was cut). */
  forceLift?: boolean;
  /** Sits on a zoomed picture whose copy of the text was wiped: show the text, with no background box. */
  onPicture?: boolean;
  /** The text is longer than the design planned for. */
  overflow?: boolean;
  pageW: number;
  /** Rebuilt PDF pages: the live font isn't the design's (a Figma PDF
   * carries none), so letter spacing is adjusted for each block's widest
   * line to take the same width as in the PDF — line breaks then match. */
  fitWidth?: boolean;
  /** Reports the rendered height of the current text and of the original text. */
  onMeasure: (id: string, current: number, original: number) => void;
}

let measureCtx: CanvasRenderingContext2D | null = null;

const fontAt = (el: HTMLElement, size: number) => {
  const cs = getComputedStyle(el);
  return `${cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}`;
};

/**
 * How to make the widest of `lines`, in the font `el` uses at the PDF's
 * size `fontH`, as wide as `target` px: letter spacing (px), capped so text
 * never looks stretched or crushed, and when even the tightest spacing is
 * too wide (a much wider font), a smaller size (down to 80%). Null when
 * there's nothing to fit.
 */
function fitText(el: HTMLElement, lines: string[], target: number, fontH: number): { px: number; scale: number } | null {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return null;
  measureCtx.font = fontAt(el, fontH);
  let widest = 0;
  let chars = 0;
  for (const raw of lines) {
    const t = raw.trim();
    const w = measureCtx.measureText(t).width;
    if (w > widest) {
      widest = w;
      chars = [...t].length;
    }
  }
  if (!widest || chars < 2) return null;
  // A hair under the target, so the widest line never wraps on rounding.
  const goal = target - 0.5;
  const lo = -0.08 * fontH;
  const hi = 0.12 * fontH;
  const px = (goal - widest) / chars;
  if (px >= lo) return { px: Math.min(hi, px), scale: 1 };
  // Width scales with the size (spacing included): scale · (widest + lo·chars) = goal.
  const scale = Math.max(0.8, goal / (widest + lo * chars));
  return { px: lo * scale, scale };
}

/**
 * Where the box must start (relative to block.top) for the first line's
 * baseline to sit on the PDF's: the PDF baseline is block.top + fontH; in
 * the box, the baseline is half the leading plus the font's ascent down.
 */
function baselineTop(el: HTMLElement, fontH: number, size: number, lineHeight: number): number | null {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return null;
  measureCtx.font = fontAt(el, size);
  const m = measureCtx.measureText("Hg");
  const asc = m.fontBoundingBoxAscent;
  const desc = m.fontBoundingBoxDescent;
  if (!Number.isFinite(asc) || !Number.isFinite(desc) || !lineHeight) return null;
  return fontH - ((lineHeight - (asc + desc)) / 2 + asc);
}

/** Lines the text of `el` is laid out on. */
function countLines(el: HTMLElement): number {
  const range = document.createRange();
  range.selectNodeContents(el);
  const mids: number[] = [];
  const size = parseFloat(getComputedStyle(el).fontSize) || 16;
  for (const r of range.getClientRects()) {
    if (r.width < 0.5) continue;
    const mid = (r.top + r.bottom) / 2;
    if (!mids.some((m) => Math.abs(m - mid) < size * 0.5)) mids.push(mid);
  }
  return mids.length;
}

/**
 * A paragraph must also wrap onto as many lines as in the PDF: from the
 * width fit, nudge the spacing (on the hidden twin, which holds the
 * original text) until the line count matches, within the same caps.
 */
function fitLineCount(twin: HTMLElement, spacing: number, lines: number, size: number): number {
  twin.style.fontSize = `${size}px`;
  const lo = -0.08 * size;
  const hi = 0.12 * size;
  const step = 0.004 * size;
  const at = (s: number) => {
    twin.style.letterSpacing = `${s}px`;
    return countLines(twin);
  };
  let s = spacing;
  let n = at(s);
  const dir = n < lines ? 1 : n > lines ? -1 : 0;
  while (dir && n !== lines && s + dir * step >= lo && s + dir * step <= hi) {
    s += dir * step;
    n = at(s);
    if ((dir > 0 && n > lines) || (dir < 0 && n < lines)) break; // stepped past it
  }
  return n === lines ? s : spacing;
}

export function EditableBlock({
  block,
  value,
  onChange,
  onActivate,
  onCommit,
  active,
  editable,
  layout,
}: {
  block: DesignBlock;
  value: string | undefined;
  onChange: (id: string, text: string) => void;
  onActivate?: (id: string) => void;
  /** Fired on blur with the final trimmed text — the persistence hook
   * (design_edits upsert lives outside this component, which stays a
   * faithful port of the source's contentEditable behaviour). */
  onCommit?: (id: string, text: string) => void;
  active?: boolean;
  editable?: boolean;
  layout?: BlockLayout;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const twinRef = React.useRef<HTMLDivElement>(null);
  const [focused, setFocused] = React.useState(false);
  const [hover, setHover] = React.useState(false);

  const text = value !== undefined ? value : block.text;
  const fit = !!layout?.fitWidth;
  const [spacing, setSpacing] = React.useState<number | null>(null);
  const [fitScale, setFitScale] = React.useState(1);
  const [baseTop, setBaseTop] = React.useState<number | null>(null);

  // Fit once the font is in (and again if fonts change), on the original
  // text: the spacing then stays put while the text is edited.
  React.useEffect(() => {
    if (!fit) return;
    let cancelled = false;
    const run = () => {
      const el = twinRef.current;
      if (cancelled || !el) return;
      const lines = block.sourceLines?.length ? block.sourceLines : block.text.split("\n");
      const f = fitText(el, lines, block.w, block.fontH);
      const size = block.fontH * (f?.scale ?? 1);
      let px = f?.px ?? null;
      // Paragraphs that reflow (headings keep their own line breaks).
      if (px !== null && block.wrap && lines.length > 1 && !block.text.includes("\n")) px = fitLineCount(el, px, lines.length, size);
      setSpacing(px);
      setFitScale(f?.scale ?? 1);
      // Same line height as the style below.
      const lh = block.wrap ? (block.lineHeight ?? 1.3 * size) : block.h + 6;
      setBaseTop(baselineTop(el, block.fontH, size, lh));
    };
    run();
    document.fonts.ready.then(run);
    document.fonts.addEventListener("loadingdone", run);
    return () => {
      cancelled = true;
      document.fonts.removeEventListener("loadingdone", run);
    };
  }, [fit, block.sourceLines, block.text, block.w, block.h, block.wrap, block.lineHeight, block.fontFamily, block.fontH]);
  const edited = value !== undefined && value !== block.text;
  const lifted = focused || edited || !!layout?.forceLift;
  const overflow = !!layout?.overflow;

  // Measure the block with its current text and, through an invisible twin
  // holding the original text, with the text the design was made for — the
  // difference is how far the content below has to move.
  const onMeasure = layout?.onMeasure;
  React.useEffect(() => {
    const el = ref.current;
    const twin = twinRef.current;
    if (!el || !twin || !onMeasure) return;
    const report = () => onMeasure(block.id, el.offsetHeight, twin.offsetHeight);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    ro.observe(twin);
    return () => ro.disconnect();
  }, [block.id, onMeasure]);

  // Keep DOM text in sync with external changes (AI apply, reset, another
  // viewer's edit) without disturbing the caret while the user is typing.
  React.useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.textContent !== text) el.textContent = text;
  }, [text]);

  const textColor = block.color || (block.dark ? "#ffffff" : "#0b0b0c");
  const bgColor = `rgb(${block.bg[0]},${block.bg[1]},${block.bg[2]})`;
  const weight = block.weight || (block.fontH >= 26 ? 700 : block.fontH >= 16 ? 600 : 500);

  // Paragraphs keep the design's width and grow downward. Single-line
  // blocks grow sideways into free space first (up to layout.maxWidth),
  // anchored on their alignment, then wrap.
  const pageW = layout?.pageW ?? 0;
  // Text box width (inside the 5px padding). Other pages leave 10px of
  // slack; fitted pages use the PDF's exact width (+1px for rounding), so
  // lines break and centre / right-align exactly where the design does.
  const boxW = fit ? block.w + 1 : block.w + 10;
  const horizontal: React.CSSProperties = block.wrap
    ? { left: block.x - 5, width: boxW }
    : {
        width: "max-content",
        maxWidth: layout?.maxWidth,
        ...(block.textAlign === "center"
          ? { left: block.x + block.w / 2 + (fit ? 0 : 5), transform: "translateX(-50%)" }
          : block.textAlign === "right" && pageW
            ? { right: pageW - (block.x + block.w + (fit ? 5 : 15)) }
            : { left: block.x - 5 }),
      };

  const style: React.CSSProperties = {
    position: "absolute",
    ...horizontal,
    // Fitted pages: the first baseline on the PDF's (measured); others keep
    // the box 3px above the text.
    top: block.top + (fit && baseTop !== null ? baseTop : -3) + (layout?.shift ?? 0),
    minWidth: boxW,
    minHeight: block.h + 6,
    padding: "0 5px",
    display: "block",
    // Rebuilt pages use the PDF's own size (their width is fitted below);
    // the other pages keep a slightly smaller size so text fits its box.
    fontSize: fit ? block.fontH * fitScale : block.fontH * 0.96,
    lineHeight: block.wrap ? (block.lineHeight ? `${block.lineHeight}px` : 1.3) : `${block.h + 6}px`,
    fontFamily: block.fontFamily ? `${block.fontFamily}, var(--font-sans)` : "var(--font-sans)",
    fontWeight: weight,
    letterSpacing: fit && spacing !== null ? `${spacing}px` : "-0.01em",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    textAlign: block.textAlign || "left",
    color: lifted || layout?.onPicture ? textColor : "transparent",
    background: lifted && !layout?.onPicture ? bgColor : hover || active ? "rgba(127,34,254,0.10)" : "transparent",
    boxShadow: focused
      ? `0 0 0 2px ${overflow ? "#f59e0b" : "#7f22fe"}`
      : overflow
        ? "inset 0 0 0 1px #f59e0b"
        : hover || active
          ? "inset 0 0 0 1px rgba(127,34,254,0.45)"
          : "none",
    borderRadius: 4,
    outline: "none",
    cursor: editable ? "text" : "default",
    caretColor: "#7f22fe",
    boxSizing: "content-box",
    transition: "background 0.12s, box-shadow 0.12s",
    overflow: "visible",
  };

  return (
    <>
      <div
        aria-hidden
        ref={twinRef}
        style={{ ...style, visibility: "hidden", pointerEvents: "none", boxShadow: "none", transition: "none" }}
      >
        {block.text}
      </div>
      <div
        ref={ref}
        data-block-id={block.id}
        contentEditable={editable}
        suppressContentEditableWarning
        spellCheck={false}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => {
          setFocused(true);
          onActivate?.(block.id);
        }}
        onBlur={(e) => {
          setFocused(false);
          const trimmed = (e.currentTarget.textContent || "").replace(/\s+/g, " ").trim();
          onChange(block.id, trimmed);
          onCommit?.(block.id, trimmed);
        }}
        onInput={(e) => onChange(block.id, e.currentTarget.textContent || "")}
        style={style}
      />
    </>
  );
}
