"use client";

// Photos of a rebuilt PDF page (see lib/pdf-photos): hover outline, click to
// select, a small toolbar (Replace / Crop / Reset), and the crop mode — drag
// the picture inside its frame, zoom with the slider or the mouse wheel.
// Sits above the page image and under the text, so clicking a text still
// edits it. Geometry in page px.

import * as React from "react";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/primitives";
import { MAX_ZOOM } from "@/lib/pdf-photos";

type Box = [number, number, number, number];

export interface OverlayPhoto {
  piece: string;
  frame: Box;
}

export interface CropState {
  piece: string;
  zoom: number;
  /** The whole image as currently placed (page px), shown faintly outside the frame. */
  preview?: { url: string; box: Box };
}

export function PhotoOverlay({
  photos,
  shiftAt,
  selected,
  edited,
  busy,
  crop,
  onSelect,
  onReplace,
  onStartCrop,
  onReset,
  onPan,
  onZoom,
  onCropDone,
  onCropCancel,
}: {
  photos: OverlayPhoto[];
  shiftAt: (y: number) => number;
  selected: string | null;
  edited: Set<string>;
  /** Piece being uploaded / saved. */
  busy: string | null;
  crop: CropState | null;
  onSelect: (piece: string | null) => void;
  onReplace: (piece: string) => void;
  onStartCrop: (piece: string) => void;
  onReset: (piece: string) => void;
  onPan: (dx: number, dy: number) => void;
  onZoom: (zoom: number) => void;
  onCropDone: () => void;
  onCropCancel: () => void;
}) {
  const [hover, setHover] = React.useState<string | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<{ x: number; y: number } | null>(null);

  // Click outside a photo (and outside its toolbar) drops the selection; Escape too.
  React.useEffect(() => {
    if (!selected) return;
    const down = (e: MouseEvent) => {
      if (crop) return;
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      onSelect(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (crop) onCropCancel();
      else onSelect(null);
    };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [selected, crop, onSelect, onCropCancel]);

  const place = (f: Box) => {
    const top = f[1] + shiftAt(f[1]);
    const bottom = f[3] + shiftAt(f[3] - 0.01);
    return { left: f[0], top, width: f[2] - f[0], height: bottom - top };
  };

  return (
    <div ref={rootRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {photos.map((p) => {
        const r = place(p.frame);
        const isSel = selected === p.piece;
        const cropping = crop?.piece === p.piece;
        const outline = cropping ? "2px solid #7f22fe" : isSel ? "2px solid #7f22fe" : hover === p.piece ? "1.5px dashed #7f22fe" : "none";
        return (
          <div
            key={p.piece}
            onMouseEnter={() => setHover(p.piece)}
            onMouseLeave={() => setHover((h) => (h === p.piece ? null : h))}
            onMouseDown={(e) => {
              if (crop && !cropping) return;
              if (!cropping) {
                onSelect(p.piece);
                return;
              }
              e.preventDefault();
              drag.current = { x: e.clientX, y: e.clientY };
              const move = (ev: MouseEvent) => {
                if (!drag.current) return;
                onPan(ev.clientX - drag.current.x, ev.clientY - drag.current.y);
                drag.current = { x: ev.clientX, y: ev.clientY };
              };
              const up = () => {
                drag.current = null;
                window.removeEventListener("mousemove", move);
                window.removeEventListener("mouseup", up);
              };
              window.addEventListener("mousemove", move);
              window.addEventListener("mouseup", up);
            }}
            style={{
              position: "absolute",
              ...r,
              pointerEvents: crop && !cropping ? "none" : "auto",
              cursor: cropping ? "grab" : "pointer",
              outline,
              outlineOffset: -1,
              // While cropping, above the text so the whole frame can be dragged.
              zIndex: cropping ? 6 : undefined,
            }}
          >
            {busy === p.piece && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.55)" }}>
                <Spinner size={20} color="#7f22fe" />
              </div>
            )}
          </div>
        );
      })}

      {/* The whole image while cropping, faint outside its frame. */}
      {crop?.preview &&
        (() => {
          const b = crop.preview.box;
          const top = b[1] + shiftAt(b[1]);
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={crop.preview.url}
              alt=""
              draggable={false}
              style={{ position: "absolute", left: b[0], top, width: b[2] - b[0], height: b[3] - b[1], opacity: 0.3, pointerEvents: "none", zIndex: 5 }}
            />
          );
        })()}

      {photos.map((p) => {
        if (selected !== p.piece) return null;
        const r = place(p.frame);
        const cropping = crop?.piece === p.piece;
        // Above the frame, or inside its top edge when the frame starts at the top of the page.
        const above = r.top >= 44;
        return (
          <div
            key={`bar-${p.piece}`}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              left: Math.max(4, r.left),
              top: above ? r.top - 40 : r.top + 8,
              display: "flex",
              alignItems: "center",
              gap: 2,
              padding: 3,
              background: "#fff",
              border: "1px solid #e4e4e7",
              borderRadius: 8,
              boxShadow: "0 4px 16px rgba(0,0,0,0.14)",
              pointerEvents: "auto",
              zIndex: 7,
              whiteSpace: "nowrap",
            }}
          >
            {cropping ? (
              <>
                <BarButton icon="x" label="Cancel" onClick={onCropCancel} />
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 8px" }}>
                  <span style={{ fontSize: 11, color: "#71717b", fontFamily: "var(--font-sans)" }}>Zoom</span>
                  <input
                    type="range"
                    min={1}
                    max={MAX_ZOOM}
                    step={0.01}
                    value={crop.zoom}
                    onChange={(e) => onZoom(Number(e.target.value))}
                    style={{ width: 110, accentColor: "#7f22fe" }}
                  />
                </div>
                <BarButton icon="check" label="Done" primary onClick={onCropDone} />
              </>
            ) : (
              <>
                <BarButton icon="upload" label="Replace" onClick={() => onReplace(p.piece)} disabled={busy === p.piece} />
                <BarButton icon="crop" label="Crop" onClick={() => onStartCrop(p.piece)} disabled={busy === p.piece} />
                {edited.has(p.piece) && <BarButton icon="rotate-ccw" label="Reset" onClick={() => onReset(p.piece)} disabled={busy === p.piece} />}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BarButton({ icon, label, onClick, primary, disabled }: { icon: string; label: string; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  const [h, setH] = React.useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        height: 28,
        padding: "0 9px",
        border: "none",
        borderRadius: 6,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        background: primary ? (h ? "#6a11d9" : "#7f22fe") : h ? "#f4f4f5" : "transparent",
        color: primary ? "#fff" : "#09090b",
        fontSize: 12,
        fontWeight: 500,
        fontFamily: "var(--font-sans)",
      }}
    >
      <Icon name={icon} size={13} color={primary ? "#fff" : "#3f3f46"} />
      {label}
    </button>
  );
}
