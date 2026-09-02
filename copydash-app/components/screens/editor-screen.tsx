"use client";

// Ported from copydash/project.jsx EditorScreen — the split-pane content
// editor (live preview + text fields). Real data is passed in as props
// (already fetched server-side by the route wrapper); this component
// only talks to Supabase for the `fields` rows it edits and the
// `pages.status` it updates, exactly as instructed. It renders INSIDE
// the already-present AppLayout from app/pm|client/layout.tsx, so it
// must never render its own Sidebar or a 100vh wrapper — see the
// flex layout note below.

import * as React from "react";
import { Icon } from "@/components/ui/icon";
import { Btn, FieldTextarea, Modal, Spinner, StatusPicker } from "@/components/ui/primitives";
import { CommentButton } from "@/components/features/comments";
import { AISuggestButton } from "@/components/features/ai-suggest";
import { SEOToggle, SEOPanel, computeSEO } from "@/components/features/seo";
import { LivePreview } from "@/components/features/live-preview";
import { ExportModal } from "@/components/features/export-modal";
import { createClient } from "@/lib/supabase/client";
import { mockGeneratePageContent } from "@/lib/ai-mock";
import { useResizablePanel } from "@/hooks/use-resizable-panel";
import { ResizeHandle } from "@/components/ui/resize-handle";
import type { Field, Page, PageStatus, Project } from "@/lib/supabase/types";

interface EditorUser {
  id: string;
  name: string;
  role: "pm" | "client";
}

// ── Defaults (exact ids/labels/maxChars/placeholders from the prototype's
// DEFAULT_FIELDS) — used only to self-heal a page that has no fields yet.
const DEFAULT_FIELDS: { field_key: string; label: string; max_chars: number; placeholder: string }[] = [
  { field_key: "hero_headline", label: "Hero Headline", max_chars: 60, placeholder: "Your compelling headline here…" },
  { field_key: "hero_subtitle", label: "Hero Subtitle", max_chars: 140, placeholder: "A brief description of what you offer…" },
  { field_key: "cta_primary", label: "Primary CTA", max_chars: 30, placeholder: "e.g. Get Started, Learn More…" },
  { field_key: "about_title", label: "Section Title", max_chars: 50, placeholder: "About us section heading…" },
  { field_key: "about_body", label: "Main Body Copy", max_chars: 350, placeholder: "Describe your offering…" },
  { field_key: "footer_tagline", label: "Footer Tagline", max_chars: 80, placeholder: "Short tagline…" },
];

const AI_MESSAGES = [
  "Reading document structure…",
  "Identifying content sections…",
  "Extracting editable text fields…",
  "Applying formatting rules…",
  "Generating suggestions…",
];

const fieldRows = (fieldKey: string) => (fieldKey === "about_body" ? 5 : 2);
const byPosition = (a: Field, b: Field) => a.position - b.position;

type AiState = "idle" | "processing" | "done" | "error";
type SaveStatus = "idle" | "saving" | "saved";

export function EditorScreen({
  project,
  page,
  fields: initialFields,
  user,
  role,
  onBack,
}: {
  project: Project;
  page: Page;
  fields: Field[];
  user: EditorUser;
  role: "pm" | "client";
  onBack: () => void;
}) {
  const [fields, setFields] = React.useState<Field[]>(() => [...initialFields].sort(byPosition));
  const [pageStatus, setPageStatus] = React.useState(page.status);
  const [aiState, setAiState] = React.useState<AiState>("idle");
  const [aiMsgIdx, setAiMsgIdx] = React.useState(0);
  const [aiProgress, setAiProgress] = React.useState(0);
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [activeFieldId, setActiveFieldId] = React.useState<string | null>(null);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [seoOpen, setSeoOpen] = React.useState(false);
  const { width: fieldsWidth, onMouseDown: onResizeFields } = useResizablePanel(440, 320, 800, "cd-editor-fields-width");

  const anyEmpty = fields.length > 0 && fields.every((f) => !f.content);
  const completedFields = fields.filter((f) => f.content.length > 0).length;
  const totalFields = fields.length;

  // ── AI run (initial extraction pass, or "Re-run AI") ────────────
  const runAI = React.useCallback(
    async (fieldsOverride?: Field[]) => {
      const targetFields = fieldsOverride || fields;
      setAiState("processing");
      setAiProgress(0);
      setAiMsgIdx(0);

      const interval = setInterval(() => {
        setAiProgress((p) => (p >= 90 ? 90 : p + Math.random() * 12));
        setAiMsgIdx((i) => Math.min(i + 1, AI_MESSAGES.length - 1));
      }, 700);

      try {
        const sourceText = page.pdf_text || project.extracted_text || undefined;
        const results = await mockGeneratePageContent(
          targetFields.map((f) => f.field_key),
          project.name,
          page.name,
          sourceText,
        );
        clearInterval(interval);
        setAiProgress(100);

        const updated = targetFields.map((f) => {
          const match = results.find((r) => r.id === f.field_key);
          return match ? { ...f, content: match.content.slice(0, f.max_chars) } : f;
        });
        setFields(updated);

        const supabase = createClient();
        await Promise.all(updated.map((f) => supabase.from("fields").update({ content: f.content }).eq("id", f.id)));

        setAiState("done");
      } catch {
        clearInterval(interval);
        setAiState("error");
      }
    },
    [fields, page.name, page.pdf_text, project.extracted_text, project.name],
  );

  // ── Mount: self-heal empty pages, then maybe auto-run AI ────────
  const didInit = React.useRef(false);
  React.useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    (async () => {
      let currentFields = fields;

      if (currentFields.length === 0) {
        const supabase = createClient();
        const seedRows = DEFAULT_FIELDS.map((f, i) => ({
          page_id: page.id,
          field_key: f.field_key,
          label: f.label,
          content: "",
          max_chars: f.max_chars,
          placeholder: f.placeholder,
          position: i,
        }));
        const { data } = await supabase.from("fields").insert(seedRows).select();
        currentFields = ((data as Field[]) || []).sort(byPosition);
        setFields(currentFields);
      }

      const stillEmpty = currentFields.length > 0 && currentFields.every((f) => !f.content);
      const sourceText = page.pdf_text || project.extracted_text;
      if (stillEmpty && sourceText) {
        setTimeout(() => runAI(currentFields), 600);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Field editing ────────────────────────────────────────────────
  const updateField = (id: string, content: string) => {
    setFields((fs) => fs.map((f) => (f.id === id ? { ...f, content } : f)));
  };

  const persistField = async (id: string, content: string) => {
    const supabase = createClient();
    await supabase.from("fields").update({ content }).eq("id", id);
  };

  // ── Save (persists every field + the current status; mirrors the
  // prototype's idle/saving/saved cycle, and covers the field the user
  // is still focused on since local state is already current) ────────
  const handleSave = async (overrideStatus?: PageStatus) => {
    setSaveStatus("saving");
    const supabase = createClient();
    const nextStatus = overrideStatus || pageStatus;
    await Promise.all([
      ...fields.map((f) => supabase.from("fields").update({ content: f.content }).eq("id", f.id)),
      supabase.from("pages").update({ status: nextStatus, updated_by_name: user.name }).eq("id", page.id),
      new Promise((r) => setTimeout(r, 500)),
    ]);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2500);
  };

  const seoFields = React.useMemo(() => fields.map((f) => ({ id: f.field_key, content: f.content })), [fields]);
  const seoScore = React.useMemo(() => computeSEO(seoFields, page.name, project.name).pct, [seoFields, page.name, project.name]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "#f7f9fb", fontFamily: "var(--font-body)" }}>
      {/* Editor Header */}
      <div style={{ flexShrink: 0, background: "#fff", borderBottom: "1px solid #e4e4e7", padding: "0 32px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#71717b", fontSize: 13, padding: "4px 8px", borderRadius: 6 }}>
            <Icon name="arrow-left" size={14} /> Back
          </button>
          <div style={{ width: 1, height: 20, background: "#e4e4e7" }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)" }}>{project.name}</div>
            <div style={{ fontSize: 11, color: "#71717b" }}>{page.name} page</div>
          </div>
          <StatusPicker
            status={pageStatus}
            onChange={(next) => {
              setPageStatus(next as PageStatus);
              handleSave(next as PageStatus);
            }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 12, color: "#a1a1aa", fontFamily: "var(--font-sans)" }}>
            {completedFields}/{totalFields} fields filled
          </div>
          <SEOToggle open={seoOpen} onToggle={() => setSeoOpen((o) => !o)} score={seoScore} />
          {role === "pm" && (
            <>
              <Btn variant="outline" size="sm" icon="download" onClick={() => setExportOpen(true)}>
                Export PDF
              </Btn>
              {pageStatus !== "Pending Review" && pageStatus !== "Completed" && (
                <Btn
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPageStatus("Pending Review");
                    handleSave("Pending Review");
                  }}
                >
                  Send for Review
                </Btn>
              )}
            </>
          )}
          {role === "client" && pageStatus !== "Completed" && pageStatus !== "Pending Review" && (
            <Btn
              variant="outline"
              size="sm"
              onClick={() => {
                setPageStatus("Pending Review");
                handleSave("Pending Review");
              }}
            >
              Submit for Review
            </Btn>
          )}
          <Btn variant="primary" size="sm" onClick={() => handleSave()} icon={saveStatus === "saved" ? "check" : undefined}>
            {saveStatus === "saving" ? (
              <>
                <Spinner size={13} color="#fff" /> Saving…
              </>
            ) : saveStatus === "saved" ? (
              "Saved!"
            ) : (
              "Save"
            )}
          </Btn>
        </div>
      </div>

      {/* Body — Split Pane */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        {/* Left: Live Preview */}
        <div style={{ flex: 1, minWidth: 320, overflow: "auto", padding: "32px 24px 32px 32px" }}>
          <LivePreview fields={fields} pageName={page.name} projectName={project.name} />
        </div>

        <ResizeHandle onMouseDown={onResizeFields} />

        {/* Right: Editor Fields — drag the handle above to resize (persisted), clamped to a 320px min. */}
        <div style={{ flex: `0 0 ${fieldsWidth}px`, width: fieldsWidth, minWidth: 320, background: "#fff", display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
          {/* Fields Header */}
          <div style={{ padding: "16px 24px", borderBottom: "1px solid #e4e4e7", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="edit" size={15} color="#71717b" />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Text Fields</span>
            </div>
            <Btn variant="ghost" size="sm" icon="sparkles" onClick={() => runAI()} disabled={aiState === "processing"}>
              {aiState === "processing" ? "Processing…" : "Re-run AI"}
            </Btn>
          </div>

          {/* AI State */}
          {aiState === "processing" && (
            <div style={{ padding: "24px", background: "#f5f3ff", borderBottom: "1px solid #e9e4ff", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <Spinner size={18} color="#7f22fe" />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#7f22fe", fontFamily: "var(--font-sans)" }}>AI Extracting Content</div>
                  <div style={{ fontSize: 12, color: "#a684ff", marginTop: 2 }}>{AI_MESSAGES[aiMsgIdx]}</div>
                </div>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: "#ddd6fe", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${aiProgress}%`, background: "#7f22fe", borderRadius: 2, transition: "width 0.4s ease" }} />
              </div>
            </div>
          )}

          {aiState === "done" && !anyEmpty && (
            <div style={{ padding: "10px 24px", background: "#f0fdf4", borderBottom: "1px solid #bbf7d0", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="check-circle" size={14} color="#15803d" />
              <span style={{ fontSize: 12, color: "#15803d", fontFamily: "var(--font-sans)", fontWeight: 500 }}>AI successfully extracted {fields.length} content sections</span>
            </div>
          )}

          {/* Fields List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
            {fields.map((field) => (
              <div
                key={field.id}
                onClick={() => setActiveFieldId(field.id)}
                onBlur={() => persistField(field.id, field.content)}
                style={{
                  padding: 16,
                  borderRadius: 10,
                  border: `1px solid ${activeFieldId === field.id ? "#c4b4ff" : "#f0f0f0"}`,
                  background: activeFieldId === field.id ? "#fdfcff" : "#fafafa",
                  transition: "all 0.15s",
                  cursor: "text",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#7f22fe", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--font-sans)", opacity: 0.7 }}>{field.label}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, color: "#a1a1aa", fontFamily: "var(--font-mono)" }}>ID: {field.field_key.toUpperCase()}</span>
                    <AISuggestButton
                      field={{ id: field.id, label: field.label, content: field.content, maxChars: field.max_chars }}
                      onApply={(text) => {
                        updateField(field.id, text);
                        persistField(field.id, text);
                      }}
                    />
                    <CommentButton projectId={project.id} pageId={page.id} fieldKey={field.field_key} user={user} />
                  </div>
                </div>
                <FieldTextarea
                  value={field.content}
                  onChange={(v) => updateField(field.id, v)}
                  placeholder={field.placeholder}
                  maxLength={field.max_chars}
                  rows={fieldRows(field.field_key)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SEO Drawer */}
      {seoOpen && (
        <div
          className="slide-in-right"
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: 380,
            zIndex: 200,
            background: "#fff",
            borderLeft: "1px solid #e4e4e7",
            boxShadow: "-8px 0 32px rgba(0,0,0,0.08)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <SEOPanel fields={seoFields} pageName={page.name} projectName={project.name} onClose={() => setSeoOpen(false)} />
        </div>
      )}

      {/* Export Modal */}
      <Modal open={exportOpen} onClose={() => setExportOpen(false)} title="Export Content" width={480}>
        <ExportModal project={project} page={page} fields={fields} onClose={() => setExportOpen(false)} />
      </Modal>
    </div>
  );
}
