"use client";

import * as React from "react";

export function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Drag to resize"
      style={{
        width: 7,
        flexShrink: 0,
        cursor: "col-resize",
        position: "relative",
        background: "transparent",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          bottom: 0,
          width: hover ? 3 : 1,
          background: hover ? "#8e51ff" : "#e4e4e7",
          transform: "translateX(-50%)",
          transition: "width 0.1s, background 0.1s",
        }}
      />
    </div>
  );
}
