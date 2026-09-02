"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Avatar, Btn, KPICard, Modal, PageHeader, SelectInput, Spinner, StatusBadge, FieldInput } from "@/components/ui/primitives";
import { RenameModal } from "@/components/ui/rename-modal";
import { createClient } from "@/lib/supabase/client";
import { extractPdfText } from "@/lib/pdf";
import { formatDate } from "@/lib/format";
import type { Page, Project } from "@/lib/supabase/types";

const STATUS_FILTERS = ["All", "Draft", "In Progress", "Pending Review", "Completed"];

export interface ProjectWithClient extends Project {
  clients: { name: string } | null;
}

export function PagesListScreen({
  project,
  pages,
  figmaConnected,
}: {
  project: ProjectWithClient;
  pages: Page[];
  figmaConnected: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("All");
  const [addPageOpen, setAddPageOpen] = React.useState(false);
  const [creatingPage, setCreatingPage] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [renamingPage, setRenamingPage] = React.useState<Page | null>(null);

  const handleRenamePage = async (name: string) => {
    if (!renamingPage) return;
    const supabase = createClient();
    const { error: renameErr } = await supabase.from("pages").update({ name }).eq("id", renamingPage.id);
    if (renameErr) {
      alert(`Couldn't rename page: ${renameErr.message}`);
      return;
    }
    setRenamingPage(null);
    router.refresh();
  };

  const filtered = pages.filter((pg) => {
    const ms = statusFilter === "All" || pg.status === statusFilter;
    const mq = !search || pg.name.toLowerCase().includes(search.toLowerCase());
    return ms && mq;
  });

  const stats = [
    { label: "Total Pages", value: pages.length, icon: "file-text" },
    { label: "Completed", value: pages.filter((p) => p.status === "Completed").length, icon: "check-circle", color: "#15803d" },
    { label: "In Progress", value: pages.filter((p) => p.status === "In Progress").length, icon: "zap", color: "#f59e0b" },
    { label: "Pending Review", value: pages.filter((p) => p.status === "Pending Review").length, icon: "eye", color: "#0369a1" },
  ];

  const handleAddPage = async (data: { name: string; file: File | null; pdfText: string | null; figmaUrl: string | null }) => {
    setAddPageOpen(false);
    setCreatingPage(true);
    setError(null);
    const supabase = createClient();
    try {
      const { data: newPage, error: insertErr } = await supabase
        .from("pages")
        .insert({
          project_id: project.id,
          name: data.name,
          status: "Draft",
          template: "custom",
          has_pdf_design: !!data.file || !!data.figmaUrl,
          design_source: data.file ? "pdf" : data.figmaUrl ? "figma" : null,
        })
        .select("id")
        .single();
      if (insertErr) throw insertErr;

      if (data.file) {
        const path = `${project.id}/pages/${newPage.id}/${data.file.name}`;
        const { error: uploadErr } = await supabase.storage.from("pdfs").upload(path, data.file, { upsert: true });
        if (uploadErr) throw uploadErr;
        const { error: updateErr } = await supabase
          .from("pages")
          .update({ pdf_filename: data.file.name, pdf_storage_path: path, pdf_text: data.pdfText })
          .eq("id", newPage.id);
        if (updateErr) throw updateErr;
      } else if (data.figmaUrl) {
        const res = await fetch("/api/figma/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageId: newPage.id, figmaUrl: data.figmaUrl }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "L'import Figma a échoué.");
      }

      router.push(`/pm/projects/${project.id}/pages/${newPage.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the page. Please try again.");
      setCreatingPage(false);
    }
  };

  return (
    <>
      <PageHeader
        title={project.name}
        subtitle={project.clients?.name || "No client assigned"}
        breadcrumb={[{ label: "Projects", onClick: () => router.push("/pm/projects") }, { label: project.name }]}
        actions={
          <>
            <Btn variant="outline" size="sm" icon="share">
              Share
            </Btn>
            <Btn variant="primary" icon="plus" onClick={() => setAddPageOpen(true)} disabled={creatingPage}>
              {creatingPage ? "Creating…" : "Add Page"}
            </Btn>
          </>
        }
      />

      <div style={{ padding: "24px 48px 0", display: "flex", gap: 16 }}>
        {stats.map((s) => (
          <KPICard key={s.label} {...s} />
        ))}
      </div>

      <div style={{ padding: "24px 48px 48px", flex: 1 }}>
        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: "10px 14px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Icon name="alert-circle" size={14} color="#e7000b" />
            <span style={{ fontSize: 13, color: "#e7000b", fontFamily: "var(--font-body)" }}>{error}</span>
          </div>
        )}

        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ position: "relative" }}>
              <Icon name="search" size={13} color="#a1a1aa" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter pages…"
                style={{
                  padding: "0 12px 0 30px",
                  height: 34,
                  borderRadius: 8,
                  border: "1px solid #e4e4e7",
                  fontSize: 13,
                  fontFamily: "var(--font-body)",
                  outline: "none",
                  width: 200,
                  color: "#09090b",
                }}
              />
            </div>
            <SelectInput value={statusFilter} onChange={setStatusFilter} options={STATUS_FILTERS.map((s) => ({ value: s, label: s }))} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="outline" size="sm" icon="download">
              Export PDF
            </Btn>
          </div>
        </div>

        {/* Table */}
        <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e4e4e7", background: "#fafafa" }}>
                <th style={{ padding: "10px 16px", textAlign: "left", width: 40 }}>
                  <input type="checkbox" style={{ cursor: "pointer" }} />
                </th>
                {["Page Name", "Status", "Last Updated", "Updated By", ""].map((h, i) => (
                  <th
                    key={i}
                    style={{
                      padding: "10px 16px",
                      textAlign: "left",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#71717b",
                      fontFamily: "var(--font-sans)",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {h && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        {h}
                        <Icon name="chevrons-up-down" size={12} color="#a1a1aa" />
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((pg, i) => (
                <PageTableRow
                  key={pg.id}
                  page={pg}
                  last={i === filtered.length - 1}
                  onSelect={() => router.push(`/pm/projects/${project.id}/pages/${pg.id}`)}
                  onRename={() => setRenamingPage(pg)}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#a1a1aa", fontSize: 14, fontFamily: "var(--font-body)" }}>
                    No pages match your filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: "#a1a1aa", fontFamily: "var(--font-body)" }}>
          {filtered.length} page{filtered.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Add Page Modal */}
      <Modal open={addPageOpen} onClose={() => setAddPageOpen(false)} title="Add a new page" width={580}>
        <AddPageForm existingPages={pages} figmaConnected={figmaConnected} onCancel={() => setAddPageOpen(false)} onSubmit={handleAddPage} />
      </Modal>

      <RenameModal
        open={!!renamingPage}
        title="Rename page"
        initialName={renamingPage?.name ?? ""}
        onCancel={() => setRenamingPage(null)}
        onSave={handleRenamePage}
      />
    </>
  );
}

function PageTableRow({
  page: pg,
  last,
  onSelect,
  onRename,
}: {
  page: Page;
  last: boolean;
  onSelect: () => void;
  onRename: () => void;
}) {
  const router = useRouter();
  const [hov, setHov] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [archiving, setArchiving] = React.useState(false);

  const handleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (!confirm(`Archive "${pg.name}"? You can restore it later from Settings → Archive.`)) return;
    setArchiving(true);
    const supabase = createClient();
    const { error } = await supabase.from("pages").update({ archived_at: new Date().toISOString() }).eq("id", pg.id);
    if (error) {
      setArchiving(false);
      alert(`Couldn't archive page: ${error.message}`);
      return;
    }
    router.refresh();
  };

  return (
    <tr
      onClick={onSelect}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => {
        setHov(false);
        setMenuOpen(false);
      }}
      style={{
        background: hov ? "#fafafa" : "#fff",
        cursor: "pointer",
        borderBottom: last ? "none" : "1px solid #f4f4f5",
        transition: "background 0.1s",
        opacity: archiving ? 0.5 : 1,
      }}
    >
      <td style={{ padding: "12px 16px" }} onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" style={{ cursor: "pointer" }} />
      </td>
      <td style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: "#f5f3ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon name="file" size={13} color="#7f22fe" />
          </div>
          <span style={{ fontSize: 14, fontWeight: 500, color: "#09090b", fontFamily: "var(--font-sans)" }}>{pg.name}</span>
        </div>
      </td>
      <td style={{ padding: "12px 16px" }}>
        <StatusBadge status={pg.status} />
      </td>
      <td style={{ padding: "12px 16px" }}>
        <span style={{ fontSize: 13, color: "#71717b", fontFamily: "var(--font-body)" }}>
          {pg.updated_by_name ? formatDate(pg.updated_at) : "—"}
        </span>
      </td>
      <td style={{ padding: "12px 16px" }}>
        {pg.updated_by_name ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Avatar name={pg.updated_by_name} size={22} />
            <span style={{ fontSize: 13, color: "#71717b", fontFamily: "var(--font-body)" }}>{pg.updated_by_name}</span>
          </div>
        ) : (
          <span style={{ fontSize: 13, color: "#a1a1aa", fontFamily: "var(--font-body)" }}>—</span>
        )}
      </td>
      <td style={{ padding: "12px 16px", textAlign: "right", position: "relative" }}>
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", opacity: hov ? 1 : 0, transition: "opacity 0.1s" }}>
          <Btn variant="ghost" size="sm" icon="edit" onClick={onSelect}>
            Open
          </Btn>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((m) => !m);
            }}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 6, color: "#71717b" }}
          >
            <Icon name="more-horizontal" size={16} />
          </button>
        </div>
        {menuOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              right: 8,
              top: 40,
              background: "#fff",
              border: "1px solid #e4e4e7",
              borderRadius: 10,
              boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
              zIndex: 50,
              minWidth: 160,
              padding: 4,
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onRename();
              }}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: "none", background: "none", cursor: "pointer", borderRadius: 6, fontSize: 13, fontFamily: "var(--font-body)", color: "#09090b", textAlign: "left" }}
            >
              <Icon name="edit" size={14} color="#71717b" />
              Rename
            </button>
            <button
              onClick={handleArchive}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: "none", background: "none", cursor: "pointer", borderRadius: 6, fontSize: 13, fontFamily: "var(--font-body)", color: "#e7000b", textAlign: "left" }}
            >
              <Icon name="trash" size={14} color="#e7000b" />
              Archive
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

// ── Add Page Form ────────────────────────────────────────────────
// Final iteration from the design prototype: a single PDF drop zone that
// auto-fills the page name from the filename, plus a subtle "skip PDF"
// link for creating an empty page. No multi-step template picker.
function AddPageForm({
  existingPages,
  figmaConnected,
  onCancel,
  onSubmit,
}: {
  existingPages: Page[];
  figmaConnected: boolean;
  onCancel: () => void;
  onSubmit: (data: { name: string; file: File | null; pdfText: string | null; figmaUrl: string | null }) => void;
}) {
  const [mode, setMode] = React.useState<"pdf" | "figma">("pdf");
  const [name, setName] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [pdfText, setPdfText] = React.useState<string | null>(null);
  const [figmaUrl, setFigmaUrl] = React.useState("");
  const [extracting, setExtracting] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const usedNames = new Set(existingPages.map((p) => p.name.toLowerCase()));
  const nameClash = !!name && usedNames.has(name.trim().toLowerCase());

  const handleFile = async (f: File | null | undefined) => {
    if (!f) return;
    setFile(f);
    setExtracting(true);
    const text = await extractPdfText(f);
    setPdfText(text);
    setExtracting(false);
    if (!name) {
      const base = f.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " ").trim();
      setName(base.charAt(0).toUpperCase() + base.slice(1));
    }
  };

  const canSubmitPdf = name.trim() && !nameClash && file && !extracting;
  const canSubmitFigma = name.trim() && !nameClash && figmaUrl.trim();
  const canSubmit = mode === "pdf" ? canSubmitPdf : canSubmitFigma;

  const submit = () => {
    if (!canSubmit) return;
    if (mode === "pdf") onSubmit({ name: name.trim(), file, pdfText, figmaUrl: null });
    else onSubmit({ name: name.trim(), file: null, pdfText: null, figmaUrl: figmaUrl.trim() });
  };

  const skip = () => {
    if (!name.trim() || nameClash) return;
    onSubmit({ name: name.trim(), file: null, pdfText: null, figmaUrl: null });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Mode toggle */}
      <div style={{ display: "flex", background: "#f4f4f5", borderRadius: 10, padding: 4, gap: 4 }}>
        {[
          { id: "pdf" as const, label: "PDF", icon: "file-text" },
          { id: "figma" as const, label: "Figma", icon: "link" },
        ].map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setMode(opt.id)}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              fontFamily: "var(--font-sans)",
              background: mode === opt.id ? "#fff" : "transparent",
              color: mode === opt.id ? "#09090b" : "#71717b",
              boxShadow: mode === opt.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            <Icon name={opt.icon} size={13} color={mode === opt.id ? "#7f22fe" : "#a1a1aa"} />
            {opt.label}
          </button>
        ))}
      </div>

      {mode === "figma" ? (
        <FigmaImportFields figmaConnected={figmaConnected} figmaUrl={figmaUrl} onFigmaUrl={setFigmaUrl} />
      ) : (
        <p style={{ margin: 0, fontSize: 13, color: "#71717b", fontFamily: "var(--font-body)" }}>
          Upload the page design as a PDF — export it straight from Figma. Your client sees the real design in CopyDash and edits
          the copy directly on it.
        </p>
      )}

      {/* PDF upload */}
      <div style={{ display: mode === "pdf" ? "block" : "none" }}>
        <label style={{ fontSize: 12, fontWeight: 500, color: "#09090b", fontFamily: "var(--font-sans)", display: "block", marginBottom: 8 }}>
          Design PDF (from Figma)
        </label>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,application/pdf"
          style={{ display: "none" }}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        {!file ? (
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFile(e.dataTransfer.files?.[0]);
            }}
            style={{
              border: `2px dashed ${dragOver ? "#7f22fe" : "#e4e4e7"}`,
              borderRadius: 12,
              padding: "32px 16px",
              textAlign: "center",
              cursor: "pointer",
              background: dragOver ? "#f5f3ff" : "#fafafa",
              transition: "all 0.15s",
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: "#f4f4f5",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 12px",
              }}
            >
              <Icon name="upload" size={20} color="#71717b" />
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#09090b", fontFamily: "var(--font-sans)", marginBottom: 4 }}>
              Drop your Figma PDF export here or click to browse
            </div>
            <div style={{ fontSize: 12, color: "#a1a1aa", fontFamily: "var(--font-body)" }}>Up to 10MB · Export as PDF from Figma for best results</div>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              background: "#fafafa",
              borderRadius: 10,
              border: `1px solid ${pdfText ? "#bbf7d0" : "#e4e4e7"}`,
              transition: "border-color 0.2s",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: pdfText ? "#f0fdf4" : "#f5f3ff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name="file-text" size={16} color={pdfText ? "#15803d" : "#7f22fe"} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#09090b",
                  fontFamily: "var(--font-sans)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {file.name}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-body)",
                  color: pdfText ? "#15803d" : extracting ? "#7f22fe" : "#a1a1aa",
                  marginTop: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                {extracting ? (
                  <>
                    <Spinner size={10} color="#7f22fe" /> Reading design…
                  </>
                ) : pdfText ? (
                  `✓ Design ready · ${pdfText.length.toLocaleString()} characters of editable text found`
                ) : (
                  `${(file.size / 1024).toFixed(0)} KB`
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setPdfText(null);
              }}
              title="Remove file"
              style={{ background: "none", border: "none", cursor: "pointer", color: "#a1a1aa", padding: 4, borderRadius: 6 }}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Page name */}
      <div>
        <FieldInput label="Page name" value={name} onChange={setName} placeholder={file ? "" : "Will use the PDF filename"} />
        {nameClash && (
          <div style={{ marginTop: 6, fontSize: 12, color: "#e7000b", fontFamily: "var(--font-body)", display: "flex", alignItems: "center", gap: 4 }}>
            <Icon name="x" size={12} color="#e7000b" /> A page named &quot;{name}&quot; already exists in this project.
          </div>
        )}
      </div>

      {/* Info banner */}
      {pdfText && !nameClash && name && (
        <div
          style={{
            padding: "10px 14px",
            background: "#f5f3ff",
            border: "1px solid #e9e4ff",
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Icon name="edit" size={14} color="#7f22fe" />
          <span style={{ fontSize: 12, color: "#7f22fe", fontFamily: "var(--font-body)" }}>
            We&apos;ll render the design and make every text layer editable in place.
          </span>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, paddingTop: 12, borderTop: "1px solid #f4f4f5" }}>
        <Btn variant="primary" fullWidth onClick={submit} disabled={!canSubmit} icon={mode === "figma" ? "link" : "file-text"}>
          {mode === "pdf" ? (extracting ? "Reading design…" : "Create page from design") : "Importer depuis Figma"}
        </Btn>
        <Btn variant="outline" onClick={onCancel}>
          Cancel
        </Btn>
      </div>

      {/* Subtle skip option */}
      {mode === "pdf" && !file && (
        <button
          type="button"
          onClick={skip}
          disabled={!name.trim() || nameClash}
          style={{
            background: "none",
            border: "none",
            cursor: name.trim() && !nameClash ? "pointer" : "not-allowed",
            color: name.trim() && !nameClash ? "#7f22fe" : "#a1a1aa",
            fontSize: 12,
            fontFamily: "var(--font-body)",
            padding: 0,
            marginTop: -8,
            textAlign: "center",
          }}
        >
          Skip PDF — create an empty page
        </button>
      )}
    </div>
  );
}

// ── Figma import fields (used inside AddPageForm when mode === "figma") ──
function FigmaImportFields({
  figmaConnected,
  figmaUrl,
  onFigmaUrl,
}: {
  figmaConnected: boolean;
  figmaUrl: string;
  onFigmaUrl: (v: string) => void;
}) {
  if (!figmaConnected) {
    return (
      <div
        style={{
          padding: "14px 16px",
          background: "#fffbeb",
          border: "1px solid #fde68a",
          borderRadius: 10,
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        <Icon name="alert-circle" size={15} color="#92400e" style={{ marginTop: 1 }} />
        <div style={{ fontSize: 12, color: "#92400e", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
          Connectez d&rsquo;abord votre compte Figma dans{" "}
          <a href="/pm/settings" style={{ color: "#92400e", fontWeight: 600 }}>
            Paramètres → Integrations
          </a>{" "}
          pour importer directement depuis Figma.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <FieldInput
        label="Lien du cadre Figma"
        value={figmaUrl}
        onChange={onFigmaUrl}
        placeholder="https://www.figma.com/design/…?node-id=…"
        helper="Dans Figma : clic droit sur le cadre (frame) à importer → Copy link to selection."
      />
    </div>
  );
}
