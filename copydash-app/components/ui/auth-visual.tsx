"use client";

// Decorative left-panel visual for the auth screens (signup, and available
// for reuse on login). Pure CSS/SVG so it never depends on a missing image
// asset — a small mockup of the product itself (a page being edited, with
// a "content synced" badge) rather than a generic gradient.

import * as React from "react";
import { Icon } from "@/components/ui/icon";

export function AuthVisual() {
  return (
    <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 320 }}>
      {/* Ambient glow */}
      <div
        style={{
          position: "absolute",
          inset: "-20%",
          background: "radial-gradient(circle at 32% 28%, rgba(127,34,254,0.38), transparent 58%)",
          pointerEvents: "none",
        }}
      />
      {/* Faint dot-grid texture */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "radial-gradient(rgba(255,255,255,0.09) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage: "radial-gradient(circle at 40% 40%, #000 0%, transparent 72%)",
          WebkitMaskImage: "radial-gradient(circle at 40% 40%, #000 0%, transparent 72%)",
          pointerEvents: "none",
        }}
      />

      {/* Page mockup card */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: 280,
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 30px 60px -20px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)",
          transform: "rotate(-3deg)",
          overflow: "hidden",
        }}
      >
        {/* Browser chrome */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", borderBottom: "1px solid #f4f4f5" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f87171" }} />
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fbbf24" }} />
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80" }} />
          <span
            style={{
              marginLeft: 8,
              flex: 1,
              height: 14,
              borderRadius: 4,
              background: "#f4f4f5",
              fontSize: 9,
              color: "#a1a1aa",
              display: "flex",
              alignItems: "center",
              paddingLeft: 6,
              fontFamily: "var(--font-body)",
            }}
          >
            copydash.app/acme/homepage
          </span>
        </div>

        {/* Body — skeleton "content" with one line mid-edit */}
        <div style={{ padding: "18px 16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ width: "60%", height: 12, borderRadius: 4, background: "#e4e4e7" }} />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 7px",
              margin: "2px -7px",
              borderRadius: 6,
              background: "rgba(127,34,254,0.08)",
              boxShadow: "0 0 0 1.5px rgba(127,34,254,0.55)",
            }}
          >
            <div style={{ width: "78%", height: 9, borderRadius: 3, background: "#c9a8ff" }} />
            <span
              style={{
                width: 2,
                height: 11,
                background: "#7f22fe",
                borderRadius: 1,
                animation: "cd-caret-blink 1.1s step-end infinite",
              }}
            />
          </div>
          <div style={{ width: "92%", height: 8, borderRadius: 3, background: "#f0f0f2" }} />
          <div style={{ width: "84%", height: 8, borderRadius: 3, background: "#f0f0f2" }} />
          <div style={{ width: "70%", height: 8, borderRadius: 3, background: "#f0f0f2" }} />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
            <div style={{ width: 54, height: 18, borderRadius: 5, background: "#7f22fe" }} />
          </div>
        </div>
      </div>

      {/* Floating "synced" badge */}
      <div
        style={{
          position: "absolute",
          zIndex: 2,
          right: "18%",
          bottom: "22%",
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "8px 12px",
          background: "#fff",
          borderRadius: 10,
          boxShadow: "0 12px 28px -8px rgba(0,0,0,0.5)",
          transform: "rotate(4deg)",
        }}
      >
        <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon name="check" size={12} color="#15803d" />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)", whiteSpace: "nowrap" }}>Content synced</span>
      </div>

      <style>{`
        @keyframes cd-caret-blink {
          0%, 45% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
