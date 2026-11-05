// Left-panel visual of the auth screens: a small, believable mockup of the
// product (a page whose headline is being edited in place, with its status and
// a comment). Pure CSS so it never depends on an image asset. Bleeds off the
// panel's bottom-right corner on purpose.

import * as React from "react";

const sans = "var(--font-sans)";
const body = "var(--font-body)";

function Line({ width }: { width: string }) {
  return <div style={{ width, height: 7, borderRadius: 3, background: "#ececee" }} />;
}

export function AuthVisual() {
  return (
    <div aria-hidden="true" style={{ position: "relative", flex: 1, minHeight: 300, marginTop: 40 }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: "min(520px, 82%)",
          display: "flex",
          flexDirection: "column",
          background: "#fff",
          borderRadius: "14px 14px 0 0",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.08), 0 32px 64px -24px rgba(16,6,40,0.9)",
          overflow: "hidden",
        }}
      >
        {/* Editor bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: "1px solid #f4f4f5" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#09090b", fontFamily: sans }}>Homepage</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 9px", borderRadius: 6, background: "#fef9c3", color: "#713f12", fontSize: 11, fontWeight: 500, fontFamily: sans }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ca8a04" }} />
            In Progress
          </span>
        </div>

        {/* The page design */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-start", padding: "26px 26px 0" }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", color: "#a1a1aa", fontFamily: sans, marginBottom: 10 }}>NEW THIS AUTUMN</div>
          <div
            style={{
              display: "inline-block",
              margin: "0 -8px",
              padding: "4px 8px",
              borderRadius: 6,
              background: "rgba(127,34,254,0.07)",
              boxShadow: "0 0 0 1.5px #7f22fe",
              fontSize: 25,
              lineHeight: 1.2,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "#09090b",
              fontFamily: sans,
            }}
          >
            Bread worth getting up for
            <span className="cd-auth-caret" style={{ display: "inline-block", width: 2, height: 24, marginLeft: 2, verticalAlign: "-4px", background: "#7f22fe" }} />
          </div>
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8, marginTop: 18 }}>
            <Line width="82%" />
            <Line width="74%" />
            <Line width="44%" />
          </div>
          <div style={{ width: "100%", flex: 1, marginTop: 22, borderRadius: "8px 8px 0 0", background: "#f4f4f5" }} />
        </div>
      </div>

      {/* A comment on the headline */}
      <div
        style={{
          position: "absolute",
          top: 148,
          right: 32,
          width: 190,
          padding: "11px 13px",
          background: "#fff",
          borderRadius: 10,
          boxShadow: "0 0 0 1px rgba(9,9,11,0.06), 0 18px 36px -12px rgba(16,6,40,0.75)",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: "#09090b", fontFamily: sans, marginBottom: 4 }}>Marketing</div>
        <div style={{ fontSize: 12, lineHeight: 1.45, color: "#52525c", fontFamily: body }}>Much better. It fits on one line now.</div>
      </div>
    </div>
  );
}
