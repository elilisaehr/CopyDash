"use client";

// A row-action dropdown that portals to <body> and positions itself with
// `position: fixed` from the trigger's bounding rect, so it's never clipped
// by an ancestor's `overflow: hidden` (e.g. a table card's rounded-corner
// wrapper) — regardless of whether the row is the first, last, or only one.
// Flips to open upward when there isn't room below.

import * as React from "react";
import { createPortal } from "react-dom";

export function DropdownMenu({
  open,
  anchorRef,
  align = "right",
  onClose,
  children,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  align?: "left" | "right";
  onClose: () => void;
  children: React.ReactNode;
}) {
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [style, setStyle] = React.useState<React.CSSProperties | null>(null);

  React.useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setStyle(null);
      return;
    }
    const rect = anchorRef.current.getBoundingClientRect();
    const menuH = menuRef.current?.offsetHeight ?? 0;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < menuH + 10 && rect.top > menuH + 10;
    setStyle({
      position: "fixed",
      top: openUpward ? rect.top - menuH - 6 : rect.bottom + 6,
      ...(align === "right" ? { right: window.innerWidth - rect.right } : { left: rect.left }),
    });
  }, [open, anchorRef, align]);

  React.useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node) || anchorRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const handleScroll = () => onClose();
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [open, onClose, anchorRef]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={menuRef}
      onClick={(e) => e.stopPropagation()}
      style={{
        background: "#fff",
        border: "1px solid #e4e4e7",
        borderRadius: 10,
        boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
        zIndex: 1000,
        minWidth: 160,
        padding: 4,
        visibility: style ? "visible" : "hidden",
        ...style,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
