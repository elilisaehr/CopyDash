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

export function EditableBlock({
  block,
  value,
  onChange,
  onActivate,
  onCommit,
  active,
  editable,
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
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [focused, setFocused] = React.useState(false);
  const [hover, setHover] = React.useState(false);

  const text = value !== undefined ? value : block.text;
  const edited = value !== undefined && value !== block.text;
  const lifted = focused || edited;

  // Keep DOM text in sync with external changes (AI apply, reset, another
  // viewer's edit) without disturbing the caret while the user is typing.
  React.useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.textContent !== text) el.textContent = text;
  }, [text]);

  const textColor = block.color || (block.dark ? "#ffffff" : "#0b0b0c");
  const bgColor = `rgb(${block.bg[0]},${block.bg[1]},${block.bg[2]})`;
  const weight = block.weight || (block.fontH >= 26 ? 700 : block.fontH >= 16 ? 600 : 500);

  return (
    <div
      ref={ref}
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
      style={{
        position: "absolute",
        left: block.x - 5,
        top: block.top - 3,
        width: block.wrap ? block.w + 10 : undefined,
        minWidth: block.w + 10,
        minHeight: block.h + 6,
        padding: "0 5px",
        display: "block",
        fontSize: block.fontH * 0.96,
        lineHeight: block.wrap ? 1.3 : `${block.h + 6}px`,
        fontFamily: "var(--font-sans)",
        fontWeight: weight,
        letterSpacing: "-0.01em",
        whiteSpace: block.wrap ? "pre-wrap" : "pre",
        wordBreak: block.wrap ? "break-word" : undefined,
        textAlign: block.textAlign || "left",
        color: lifted ? textColor : "transparent",
        background: lifted ? bgColor : hover || active ? "rgba(127,34,254,0.10)" : "transparent",
        boxShadow: focused
          ? "0 0 0 2px #7f22fe"
          : edited
            ? "inset 0 -2px 0 rgba(127,34,254,0.55)"
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
      }}
    />
  );
}
