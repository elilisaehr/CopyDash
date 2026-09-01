"use client";

// Live, read-only preview of the page being edited — mirrors the
// prototype's LivePreview 1:1 (mocked browser chrome + hero/about/footer
// sections), driven purely from local field state so it re-renders on
// every keystroke with no round-trip to Supabase.

export interface PreviewField {
  field_key: string;
  content: string;
}

export function LivePreview({
  fields,
  pageName,
  projectName,
}: {
  fields: PreviewField[];
  pageName: string;
  projectName: string;
}) {
  const get = (key: string) => fields.find((f) => f.field_key === key)?.content || "";
  const heroHeadline = get("hero_headline") || "Your Headline Goes Here";
  const heroSubtitle = get("hero_subtitle") || "A compelling subtitle that captures attention and drives action.";
  const ctaPrimary = get("cta_primary") || "Get Started";
  const aboutTitle = get("about_title") || "About Section";
  const aboutBody = get("about_body") || "Your body copy will appear here once you fill in the text fields on the right.";
  const footerTagline = get("footer_tagline") || "Built with passion.";

  return (
    <div style={{ background: "#f0f0f2", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.08)" }}>
      {/* Browser chrome */}
      <div style={{ background: "#e4e4e7", padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", gap: 5 }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />
          ))}
        </div>
        <div style={{ flex: 1, background: "#fff", borderRadius: 5, padding: "4px 12px", fontSize: 11, color: "#a1a1aa", fontFamily: "var(--font-body)" }}>
          {projectName.toLowerCase().replace(/\s+/g, "-")}.com/{pageName.toLowerCase().replace(/\s+/g, "-")}
        </div>
        <div style={{ fontSize: 10, color: "#a1a1aa", display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#28c840" }} />
          Live
        </div>
      </div>

      {/* Page preview */}
      <div style={{ background: "#fff" }}>
        {/* Nav */}
        <div style={{ padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #f4f4f5" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#09090b", fontFamily: "var(--font-sans)" }}>{projectName}</div>
          <div style={{ display: "flex", gap: 20 }}>
            {["Home", "About", "Services", "Contact"].map((n) => (
              <span key={n} style={{ fontSize: 11, color: "#71717b", fontFamily: "var(--font-body)" }}>{n}</span>
            ))}
          </div>
        </div>

        {/* Hero */}
        <div style={{ padding: "48px 32px 40px", background: "linear-gradient(135deg, #f5f3ff 0%, #fafafa 100%)", borderBottom: "1px solid #f0f0f2" }}>
          <div style={{ width: 40, height: 3, background: "#7f22fe", borderRadius: 2, marginBottom: 16 }} />
          <h1 style={{ margin: "0 0 14px", fontSize: 28, fontWeight: 700, color: "#09090b", fontFamily: "var(--font-sans)", lineHeight: 1.25, maxWidth: 480 }}>{heroHeadline}</h1>
          <p style={{ margin: "0 0 24px", fontSize: 14, color: "#71717b", fontFamily: "var(--font-body)", lineHeight: 1.6, maxWidth: 440 }}>{heroSubtitle}</p>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ padding: "10px 20px", background: "#7f22fe", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 500, fontFamily: "var(--font-sans)" }}>{ctaPrimary}</div>
            <div style={{ padding: "10px 20px", background: "#fff", color: "#09090b", borderRadius: 8, fontSize: 13, fontWeight: 500, fontFamily: "var(--font-sans)", border: "1px solid #e4e4e7" }}>Learn More</div>
          </div>
        </div>

        {/* About Section */}
        <div style={{ padding: "36px 32px", borderBottom: "1px solid #f4f4f5" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 20, fontWeight: 700, color: "#09090b", fontFamily: "var(--font-sans)" }}>{aboutTitle}</h2>
          <p style={{ margin: 0, fontSize: 13, color: "#71717b", fontFamily: "var(--font-body)", lineHeight: 1.7, maxWidth: 480 }}>{aboutBody}</p>
        </div>

        {/* Footer */}
        <div style={{ padding: "20px 32px", background: "#09090b", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, color: "#71717b", fontFamily: "var(--font-sans)" }}>{footerTagline}</span>
          <span style={{ fontSize: 11, color: "#3f3f46", fontFamily: "var(--font-body)" }}>© 2026 {projectName}</span>
        </div>
      </div>
    </div>
  );
}
