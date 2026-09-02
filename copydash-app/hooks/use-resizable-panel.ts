"use client";

import * as React from "react";

/**
 * Drag-to-resize a fixed-width panel (typically the right-hand pane of a
 * split view). Returns the current width plus an `onMouseDown` handler to
 * attach to a thin divider between the two panes — dragging it left grows
 * the panel, dragging right shrinks it, clamped to [min, max]. Persists to
 * localStorage when `storageKey` is given, so the choice survives reloads.
 */
export function useResizablePanel(defaultWidth: number, min: number, max: number, storageKey?: string) {
  const [width, setWidth] = React.useState(() => {
    if (!storageKey) return defaultWidth;
    try {
      const saved = Number(localStorage.getItem(storageKey));
      return saved && saved >= min && saved <= max ? saved : defaultWidth;
    } catch {
      return defaultWidth;
    }
  });
  const widthRef = React.useRef(width);
  React.useEffect(() => {
    widthRef.current = width;
  }, [width]);

  const onMouseDown = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = widthRef.current;

      const onMove = (ev: MouseEvent) => {
        const delta = startX - ev.clientX;
        setWidth(Math.min(max, Math.max(min, startWidth + delta)));
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        if (storageKey) {
          try {
            localStorage.setItem(storageKey, String(widthRef.current));
          } catch {
            /* ignore */
          }
        }
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [min, max, storageKey],
  );

  return { width, onMouseDown };
}
