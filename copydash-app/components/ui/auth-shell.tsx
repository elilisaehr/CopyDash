// The frame of the sign-in, sign-up and invitation screens: the product on the
// left (hidden on small screens, see .cd-auth-panel in globals.css), the form on
// the right.

import * as React from "react";
import { Icon } from "@/components/ui/icon";
import { AuthVisual } from "@/components/ui/auth-visual";

function Logo({ color }: { color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 32, height: 32, borderRadius: 9, background: "#7f22fe", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name="gallery-vertical-end" size={16} color="#fff" />
      </div>
      <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em", color, fontFamily: "var(--font-sans)" }}>CopyDash</span>
    </div>
  );
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", minHeight: "100dvh", background: "#fff", fontFamily: "var(--font-body)" }}>
      <aside className="cd-auth-panel" style={{ width: "48%", flexShrink: 0, background: "#0d0a14", color: "#fff", display: "flex", flexDirection: "column", padding: "40px 0 0 56px", overflow: "hidden" }}>
        <Logo color="#fff" />
        <div style={{ marginTop: 56, paddingRight: 56, maxWidth: 560 }}>
          <h1 style={{ margin: 0, fontSize: 38, lineHeight: 1.12, fontWeight: 600, letterSpacing: "-0.03em", fontFamily: "var(--font-sans)", textWrap: "balance" }}>
            Write website copy on the real page, not in a document.
          </h1>
          <p style={{ margin: "16px 0 0", fontSize: 15, lineHeight: 1.6, color: "#a9a5b4", maxWidth: 440, textWrap: "pretty" }}>
            Marketing, design and whoever signs off work on the same page, and everyone can see whose turn it is.
          </p>
        </div>
        <AuthVisual />
      </aside>

      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div className="cd-auth-mobile-logo" style={{ marginBottom: 32 }}>
            <Logo color="#09090b" />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
