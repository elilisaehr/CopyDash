"use client";

// Ported ~1:1 from the prototype's ExportModal / ExportOption. Pure
// client-side logic — no Supabase involved. PDF export renders an HTML
// document into a new tab and triggers window.print(); JSON/CSV export
// build a Blob and trigger a download.
//
// Adaptation from the prototype: `project.client` (a plain string in the
// localStorage-era prototype) has no equivalent on our `Project` row
// (only `client_id`, a foreign key) — the exported summary/meta lines
// simply omit it rather than fetching a client name this component was
// never given.

import * as React from "react";
import { Icon } from "@/components/ui/icon";
import { Btn, StatusBadge } from "@/components/ui/primitives";
import type { Field, Page, Project } from "@/lib/supabase/types";

type ExportKind = "pdf" | "json" | "csv";

function slug(...parts: string[]) {
  return parts.join("-").replace(/\s+/g, "-").toLowerCase();
}

export function ExportModal({
  project,
  page,
  fields,
  onClose,
}: {
  project: Project;
  page: Page;
  fields: Field[];
  onClose: () => void;
}) {
  const [exported, setExported] = React.useState<ExportKind | null>(null);

  // ── PDF export ─────────────────────────────────────────────────
  const exportPDF = () => {
    const html = `<!DOCTYPE html><html><head><title>${project.name} — ${page.name}</title>
<style>
  body{font-family:Georgia,serif;max-width:720px;margin:48px auto;color:#09090b;line-height:1.7;padding:0 24px}
  h1{font-size:28px;margin-bottom:4px;font-family:system-ui,sans-serif}
  .meta{font-size:13px;color:#71717b;margin-bottom:32px}
  .field{margin-bottom:28px}
  .field-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#7f22fe;margin-bottom:6px;font-family:system-ui,sans-serif}
  .field-value{font-size:16px;color:#09090b;background:#f9f9f9;padding:12px 16px;border-radius:6px;border-left:3px solid #7f22fe}
  .empty{color:#a1a1aa;font-style:italic}
  hr{border:none;border-top:1px solid #e4e4e7;margin:28px 0}
  .footer{font-size:11px;color:#a1a1aa;text-align:center;margin-top:48px}
</style></head><body>
<h1>${project.name}</h1>
<p class="meta">Page: <strong>${page.name}</strong> · Exported ${new Date().toLocaleDateString("en-US", { dateStyle: "long" })}</p>
<hr>
${fields
  .map(
    (f) =>
      `<div class="field"><div class="field-label">${f.label}</div><div class="field-value ${f.content ? "" : "empty"}">${f.content || "(not filled)"}</div></div>`,
  )
  .join("")}
<hr>
<div class="footer">Exported via CopyDash · ${new Date().toLocaleString()}</div>
</body></html>`;
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 400);
    }
    setExported("pdf");
  };

  // ── JSON export ────────────────────────────────────────────────
  const exportJSON = () => {
    const data = {
      project: { id: project.id, name: project.name },
      page: { id: page.id, name: page.name, status: page.status },
      exportedAt: new Date().toISOString(),
      fields: fields.reduce<Record<string, { label: string; content: string; maxChars: number }>>((acc, f) => {
        acc[f.field_key] = { label: f.label, content: f.content, maxChars: f.max_chars };
        return acc;
      }, {}),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(project.name, page.name)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExported("json");
  };

  // ── CSV export ─────────────────────────────────────────────────
  const exportCSV = () => {
    const rows = [
      ["Project", "Page", "Field Key", "Field Label", "Content", "Max Characters", "Exported At"],
      ...fields.map((f) => [
        project.name,
        page.name,
        f.field_key,
        f.label,
        `"${(f.content || "").replace(/"/g, '""')}"`,
        String(f.max_chars),
        new Date().toISOString(),
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(project.name, page.name)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExported("csv");
  };

  const filledCount = fields.filter((f) => f.content).length;

  return (
    <div>
      {/* Summary */}
      <div style={{ padding: "14px 16px", background: "#fafafa", borderRadius: 10, marginBottom: 24, border: "1px solid #e4e4e7" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)" }}>{project.name}</span>
          <StatusBadge status={filledCount === fields.length ? "Completed" : "In Progress"} />
        </div>
        <div style={{ fontSize: 13, color: "#71717b", fontFamily: "var(--font-body)" }}>
          {page.name} · <strong>{filledCount}</strong>/{fields.length} fields filled
        </div>
        {filledCount < fields.length && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#f59e0b", fontFamily: "var(--font-body)", display: "flex", alignItems: "center", gap: 4 }}>
            <Icon name="clock" size={12} color="#f59e0b" />
            {fields.length - filledCount} field{fields.length - filledCount > 1 ? "s" : ""} still empty
          </div>
        )}
      </div>

      {/* Export options */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <ExportOption
          icon="file-text"
          title="Export as PDF"
          subtitle="Printable document for client sign-off"
          color="#7f22fe"
          bg="#f5f3ff"
          active={exported === "pdf"}
          onClick={exportPDF}
        />
        <ExportOption
          icon="copy"
          title="Export as JSON"
          subtitle="Structured data for developers · field IDs included"
          color="#0369a1"
          bg="#eff6ff"
          active={exported === "json"}
          onClick={exportJSON}
        />
        <ExportOption
          icon="filter"
          title="Export as CSV"
          subtitle="Spreadsheet format · open in Excel or Sheets"
          color="#15803d"
          bg="#f0fdf4"
          active={exported === "csv"}
          onClick={exportCSV}
        />
      </div>

      {exported && (
        <div style={{ marginTop: 16, padding: "10px 14px", background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="check-circle" size={14} color="#15803d" />
          <span style={{ fontSize: 13, color: "#15803d", fontFamily: "var(--font-body)", fontWeight: 500 }}>
            {exported === "pdf" ? "PDF opened in new tab — use Cmd+P / Ctrl+P to save." : `${exported.toUpperCase()} file downloaded successfully.`}
          </span>
        </div>
      )}

      <Btn variant="ghost" size="sm" fullWidth onClick={onClose} style={{ marginTop: 16 }}>
        Close
      </Btn>
    </div>
  );
}

export function ExportOption({
  icon,
  title,
  subtitle,
  color,
  bg,
  active,
  onClick,
}: {
  icon: string;
  title: string;
  subtitle: string;
  color: string;
  bg: string;
  active: boolean;
  onClick: () => void;
}) {
  const [hov, setHov] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 16px",
        borderRadius: 10,
        border: `1px solid ${active ? color : hov ? "#d4d4d8" : "#e4e4e7"}`,
        background: active ? bg : hov ? "#fafafa" : "#fff",
        cursor: "pointer",
        textAlign: "left",
        transition: "all 0.15s",
        width: "100%",
      }}
    >
      <div style={{ width: 36, height: 36, borderRadius: 8, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon name={icon} size={17} color={color} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)" }}>{title}</div>
        <div style={{ fontSize: 12, color: "#71717b", fontFamily: "var(--font-body)", marginTop: 2 }}>{subtitle}</div>
      </div>
      {active ? <Icon name="check-circle" size={16} color={color} /> : <Icon name="arrow-right" size={14} color="#a1a1aa" />}
    </button>
  );
}
