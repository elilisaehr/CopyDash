"use client";

import * as React from "react";
import { Icon } from "@/components/ui/icon";
import { Btn, Card, Avatar, PageHeader } from "@/components/ui/primitives";

// SectionTitle isn't in the shared primitives — ported here as a tiny local helper.
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: "#71717b",
        fontFamily: "var(--font-sans)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

function FAQItem({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
  return (
    <div style={{ borderBottom: "1px solid #f4f4f5" }}>
      <button
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          width: "100%",
          padding: "16px 0",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 500, color: "#09090b", fontFamily: "var(--font-sans)" }}>{q}</span>
        <Icon name="chevron-down" size={16} color="#a1a1aa" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }} />
      </button>
      {open && (
        <div style={{ fontSize: 13, color: "#52525b", fontFamily: "var(--font-body)", lineHeight: 1.6, paddingBottom: 16, maxWidth: 560 }}>{a}</div>
      )}
    </div>
  );
}

// Ported verbatim from copydash/support.jsx's `faqs` array.
const FAQS = [
  {
    q: "How do I edit my page content?",
    a: 'From "My Work", click any page card that says "Start editing" or "Continue editing". Each section has a text field on the right — just type your content. Your changes save automatically as you go.',
  },
  {
    q: "How do I submit my content for review?",
    a: 'Once you\'ve filled in a page, open it and click "Submit for Review" in the top bar. Your project manager will be notified and will review your content. You\'ll get an email once it\'s approved or if changes are requested.',
  },
  {
    q: "What do the status labels mean?",
    a: 'Draft means the page hasn\'t been started. In Progress means you\'ve begun editing. Pending Review means you\'ve submitted it and your agency is reviewing. Completed means it\'s approved and final.',
  },
  {
    q: "Can I edit a page after submitting it?",
    a: 'While a page is "Pending Review" it\'s locked so your agency can review a stable version. If you need to make changes, ask your project manager to send it back to you, or wait until they request changes.',
  },
  {
    q: "Will I lose my work if I close the tab?",
    a: "No. Everything you type is saved automatically and is still here when you come back. You can safely close the tab and continue later.",
  },
  {
    q: "I think my content has a mistake after approval. What now?",
    a: "Reach out to your project manager using the contact box on this page. They can reopen the page so you can make edits.",
  },
];

const GETTING_STARTED = [
  { icon: "folder-open", title: "Open a page", desc: "Pick a page from My Work" },
  { icon: "edit", title: "Fill it in", desc: "Type your content — it auto-saves" },
  { icon: "send", title: "Submit", desc: "Send it to your agency to review" },
];

export interface HelpContact {
  name: string;
  email: string;
}

export function HelpSupportScreen({
  role,
  contact,
}: {
  role: "pm" | "client";
  /** Client only — the PM found via their project's `pm_id`. Ignored for role="pm". */
  contact?: HelpContact | null;
}) {
  const [openFaq, setOpenFaq] = React.useState(0);
  const [msg, setMsg] = React.useState("");
  const [sent, setSent] = React.useState(false);

  // Contact target depends on role: clients reach their PM, PMs reach CopyDash support.
  const pm =
    role === "pm"
      ? { name: "CopyDash Support", role: "Product support team", email: "support@copydash.io" }
      : contact
        ? { name: contact.name, role: "Your Project Manager", email: contact.email }
        : { name: "Your Project Manager", role: "Your Project Manager", email: "" };

  // Cosmetic only — there is no messages table / real delivery, this just shows the same success toast as the prototype.
  const handleSend = () => {
    if (!msg.trim()) return;
    setSent(true);
    setMsg("");
    setTimeout(() => setSent(false), 3500);
  };

  return (
    <>
      <PageHeader title="Help & Support" subtitle="Guides, answers, and a direct line to your team" />

      <div style={{ flex: 1, overflowY: "auto", padding: "32px 48px 56px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 32, maxWidth: 1040 }}>
          {/* Left column */}
          <div style={{ minWidth: 0 }}>
            {/* Quick start */}
            <SectionTitle>Getting started</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 32 }}>
              {GETTING_STARTED.map((s, i) => (
                <div key={i} style={{ padding: 16, background: "#fff", border: "1px solid #e4e4e7", borderRadius: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: "#f5f3ff", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                    <Icon name={s.icon} size={16} color="#7f22fe" />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)", marginBottom: 2 }}>
                    {i + 1}. {s.title}
                  </div>
                  <div style={{ fontSize: 12, color: "#71717b", fontFamily: "var(--font-body)", lineHeight: 1.4 }}>{s.desc}</div>
                </div>
              ))}
            </div>

            {/* FAQ */}
            <SectionTitle>Frequently asked questions</SectionTitle>
            <Card>
              {FAQS.map((f, i) => (
                <FAQItem key={i} q={f.q} a={f.a} open={openFaq === i} onToggle={() => setOpenFaq(openFaq === i ? -1 : i)} />
              ))}
            </Card>
          </div>

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Contact PM / support */}
            <div>
              <SectionTitle>Contact your team</SectionTitle>
              <Card>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #f4f4f5" }}>
                  <Avatar name={pm.name} size={42} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)" }}>{pm.name}</div>
                    <div style={{ fontSize: 12, color: "#71717b", fontFamily: "var(--font-body)" }}>{pm.role}</div>
                  </div>
                </div>
                {sent ? (
                  <div style={{ padding: "14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon name="check-circle" size={15} color="#15803d" />
                    <span style={{ fontSize: 13, color: "#15803d", fontFamily: "var(--font-body)" }}>Message sent — {pm.name.split(" ")[0]} will reply by email.</span>
                  </div>
                ) : (
                  <>
                    <textarea
                      value={msg}
                      onChange={(e) => setMsg(e.target.value)}
                      placeholder="Ask a question or describe what you need help with…"
                      rows={4}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: "1px solid #e4e4e7",
                        fontSize: 13,
                        fontFamily: "var(--font-body)",
                        color: "#09090b",
                        background: "#fff",
                        outline: "none",
                        boxSizing: "border-box",
                        resize: "vertical",
                        lineHeight: 1.5,
                      }}
                    />
                    <Btn variant="primary" size="sm" icon="send" onClick={handleSend} disabled={!msg.trim()} fullWidth style={{ marginTop: 10 }}>
                      Send message
                    </Btn>
                  </>
                )}
                {pm.email && (
                  <a href={`mailto:${pm.email}`} style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 14, fontSize: 12, color: "#71717b", fontFamily: "var(--font-body)" }}>
                    <Icon name="mail" size={13} color="#71717b" /> {pm.email}
                  </a>
                )}
              </Card>
            </div>

            {/* Response time */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: "#f5f3ff", border: "1px solid #e9e4ff", borderRadius: 12 }}>
              <Icon name="clock" size={16} color="#7f22fe" />
              <div style={{ fontSize: 12, color: "#52525b", fontFamily: "var(--font-body)", lineHeight: 1.4 }}>
                <span style={{ fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)" }}>Typical response: under 1 business day.</span> Support hours Mon–Fri, 9am–6pm.
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
