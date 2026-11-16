// CopyDash — "flow" layout for the Design Editor.
//
// A design is a flat image with editable text blocks laid over it. When a
// block gets more text than the design planned for, it grows downward and
// everything below it moves down by the same amount — like a text element
// in Webflow or Elementor pushing the rest of the page. The image is cut
// horizontally at the bottom of each growing block and the gap is filled
// by stretching one background row of the design (see DesignPage).
//
// Pure geometry, no DOM: given each block's original box and how many px
// taller it now renders, work out where everything goes.

import type { DesignBlock } from "@/lib/pdf-design";

export interface FlowInput {
  id: string;
  /** Original top / bottom of the text in the design, in page px. */
  top: number;
  bottom: number;
  /** How many px taller the block now renders than its original text. */
  extra: number;
}

/** From design y = `y` downward, the image is drawn `offset` px lower. */
export interface FlowStep {
  y: number;
  offset: number;
}

export interface Flow {
  /** How far each block moves down. */
  shift: Record<string, number>;
  /** For a block that spans a cut line (e.g. a paragraph next to a growing
   * title in another column): how much the image behind it is stretched,
   * so it can cover that gap with its own background. */
  stretch: Record<string, number>;
  steps: FlowStep[];
  /** Total px added to the page height. */
  total: number;
}

/** Below this, a height difference is font rounding, not real overflow. */
export const OVERFLOW_TOLERANCE = 4;

export function computeFlow(items: FlowInput[]): Flow {
  // Process blocks by their bottom edge: a block's position only depends on
  // blocks that end above it, which are then already placed.
  const sorted = [...items].sort((a, b) => a.bottom - b.bottom);
  const steps: FlowStep[] = [];
  const offsetAt = (y: number, strict: boolean) => {
    let off = 0;
    for (const s of steps) {
      if (strict ? s.y < y : s.y <= y) off = s.offset;
      else break;
    }
    return off;
  };

  const shift: Record<string, number> = {};
  const stretch: Record<string, number> = {};
  for (const it of sorted) {
    const sh = offsetAt(it.top, false);
    const st = offsetAt(it.bottom, true) - sh;
    shift[it.id] = sh;
    stretch[it.id] = st;
    if (it.extra > 0) {
      const offset = Math.ceil(sh + st + it.extra);
      const y = Math.round(it.bottom);
      const last = steps[steps.length - 1];
      if (offset > (last?.offset ?? 0)) {
        if (last && last.y >= y) last.offset = offset;
        else steps.push({ y, offset });
      }
    }
  }
  return { shift, stretch, steps, total: steps[steps.length - 1]?.offset ?? 0 };
}

/**
 * Single-line blocks (buttons, nav links, short titles) first grow sideways
 * into the free space on their row, and only wrap onto a new line once they
 * reach the next block or the page edge. Returns each such block's maximum
 * text width, in px.
 */
export function lineCaps(
  blocks: DesignBlock[],
  pageW: number,
  /** Free background on each side of a block, read from the design image
   * (stops at a picture, a button edge, a colour change). */
  freeSpan?: (b: DesignBlock) => { left: number; right: number } | null,
): Record<string, number> {
  const MARGIN = 12;
  const caps: Record<string, number> = {};
  for (const b of blocks) {
    if (b.wrap) continue;
    const row = blocks.filter((n) => n !== b && n.top < b.top + b.h && n.top + n.h > b.top);
    const span = freeSpan?.(b);
    const right = Math.min(pageW - MARGIN, span ? span.right - MARGIN : Infinity, ...row.filter((n) => n.x >= b.x + b.w - 2).map((n) => n.x - MARGIN));
    const left = Math.max(MARGIN, span ? span.left + MARGIN : -Infinity, ...row.filter((n) => n.x + n.w <= b.x + 2).map((n) => n.x + n.w + MARGIN));
    // Mirrors EditableBlock's box: left at x-5, 5px padding, text box min w+10.
    let cap: number;
    if (b.textAlign === "center") {
      const cx = b.x + b.w / 2 + 5;
      cap = 2 * Math.min(cx - left, right - cx);
    } else if (b.textAlign === "right") {
      cap = b.x + b.w + 10 - left;
    } else {
      cap = right - 5 - b.x;
    }
    caps[b.id] = Math.max(cap, b.w + 10);
  }
  return caps;
}
