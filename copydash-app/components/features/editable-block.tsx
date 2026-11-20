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
  /** Reports the rendered height of the current text and of the original text. */
  onMeasure: (id: string, current: number, original: number) => void;
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
  const horizontal: React.CSSProperties = block.wrap
    ? { left: block.x - 5, width: block.w + 10 }
    : {
        width: "max-content",
        maxWidth: layout?.maxWidth,
        ...(block.textAlign === "center"
          ? { left: block.x + block.w / 2 + 5, transform: "translateX(-50%)" }
          : block.textAlign === "right" && pageW
            ? { right: pageW - (block.x + block.w + 15) }
            : { left: block.x - 5 }),
      };

  const style: React.CSSProperties = {
    position: "absolute",
    ...horizontal,
    top: block.top - 3 + (layout?.shift ?? 0),
    minWidth: block.w + 10,
    minHeight: block.h + 6,
    padding: "0 5px",
    display: "block",
    fontSize: block.fontH * 0.96,
    lineHeight: block.wrap ? (block.lineHeight ? `${block.lineHeight}px` : 1.3) : `${block.h + 6}px`,
    fontFamily: block.fontFamily ? `${block.fontFamily}, var(--font-sans)` : "var(--font-sans)",
    fontWeight: weight,
    letterSpacing: "-0.01em",
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
