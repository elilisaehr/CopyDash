"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Btn, Card, FieldInput, PageHeader, SelectInput, Spinner } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/client";
import { extractPdfText } from "@/lib/pdf";

export interface CreateProjectClient {
  id: string;
  name: string;
  email: string;
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#71717b",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  fontFamily: "var(--font-sans)",
  marginBottom: 6,
  display: "block",
};

export function CreateProjectScreen({ clients }: { clients: CreateProjectClient[] }) {
  const router = useRouter();
  const [step, setStep] = React.useState<1 | 2>(1);
  const [form, setForm] = React.useState({
    name: "",
    clientIsNew: false,
    existingClientId: "",
    newClientName: "",
    clientEmail: "",
  });
  const [file, setFile] = React.useState<File | null>(null);
  const [extracting, setExtracting] = React.useState(false);
  const [extractedText, setExtractedText] = React.useState<string | null>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const handleFile = async (f: File | null | undefined) => {
    if (!f) return;
    setFile(f);
    setExtractedText(null);
    setExtracting(true);
    const text = await extractPdfText(f);
    setExtractedText(text);
    setExtracting(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("You must be signed in.");

      let clientId: string | null = null;
      if (form.clientIsNew) {
        if (form.newClientName.trim()) {
          const { data: newClient, error: clientErr } = await supabase
            .from("clients")
            .insert({ pm_id: user.id, name: form.newClientName.trim() })
            .select("id")
            .single();
          if (clientErr) throw clientErr;
          clientId = newClient.id;
          if (form.clientEmail.trim()) {
            await supabase.from("client_emails").insert({
              client_id: clientId,
              address: form.clientEmail.trim(),
              label: "Primary",
              is_primary: true,
            });
          }
        }
      } else if (form.existingClientId) {
        clientId = form.existingClientId;
      }

      const { data: project, error: projErr } = await supabase
        .from("projects")
        .insert({ pm_id: user.id, client_id: clientId, name: form.name.trim(), status: "In Progress" })
        .select("id")
        .single();
      if (projErr) throw projErr;

      if (file) {
        const path = `${project.id}/${file.name}`;
        const { error: uploadErr } = await supabase.storage.from("pdfs").upload(path, file, { upsert: true });
        if (uploadErr) throw uploadErr;
        const { error: updateErr } = await supabase
          .from("projects")
          .update({ pdf_filename: file.name, pdf_storage_path: path, extracted_text: extractedText })
          .eq("id", project.id);
        if (updateErr) throw updateErr;
      }

      router.push(`/pm/projects/${project.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  const selectedExistingClient = clients.find((c) => c.id === form.existingClientId);

  return (
    <>
      <PageHeader
        title="Create Project"
        subtitle="Set up a new content collection workspace"
        breadcrumb={[{ label: "Projects", onClick: () => router.push("/pm/projects") }, { label: "New Project" }]}
      />

      <div style={{ flex: 1, overflowY: "auto", padding: "40px 48px" }}>
        <div style={{ maxWidth: 640 }}>
          {/* Step Indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 36 }}>
            {[{ n: 1, label: "Project Details" }, { n: 2, label: "Upload PDF" }].map((s, i) => (
              <React.Fragment key={s.n}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: step === s.n ? "#7f22fe" : step > s.n ? "#dcfce7" : "#f4f4f5",
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: "var(--font-sans)",
                      color: step === s.n ? "#fff" : step > s.n ? "#15803d" : "#71717b",
                    }}
                  >
                    {step > s.n ? <Icon name="check" size={12} color="#15803d" /> : s.n}
                  </div>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: step === s.n ? 600 : 400,
                      color: step === s.n ? "#09090b" : "#71717b",
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    {s.label}
                  </span>
                </div>
                {i < 1 && <div style={{ flex: 1, height: 1, background: "#e4e4e7", maxWidth: 40 }} />}
              </React.Fragment>
            ))}
          </div>

          {error && (
            <div
              style={{
                marginBottom: 20,
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

          {step === 1 && (
            <div>
              <Card>
                <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                  <FieldInput label="Project Name" value={form.name} onChange={(v) => update("name", v)} placeholder="e.g. E-commerce Website" />

                  <div>
                    <label style={labelStyle}>Client</label>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      {[
                        { v: false, label: "Existing client" },
                        { v: true, label: "New client" },
                      ].map((opt) => (
                        <button
                          key={String(opt.v)}
                          type="button"
                          onClick={() => update("clientIsNew", opt.v)}
                          style={{
                            padding: "6px 14px",
                            borderRadius: 8,
                            border: `1px solid ${form.clientIsNew === opt.v ? "#7f22fe" : "#e4e4e7"}`,
                            background: form.clientIsNew === opt.v ? "#f5f3ff" : "#fff",
                            cursor: "pointer",
                            fontSize: 13,
                            fontFamily: "var(--font-sans)",
                            color: form.clientIsNew === opt.v ? "#7f22fe" : "#71717b",
                            fontWeight: form.clientIsNew === opt.v ? 500 : 400,
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {form.clientIsNew ? (
                      <FieldInput value={form.newClientName} onChange={(v) => update("newClientName", v)} placeholder="Client company name" />
                    ) : clients.length > 0 ? (
                      <SelectInput
                        value={form.existingClientId}
                        onChange={(v) => update("existingClientId", v)}
                        options={clients.map((c) => ({ value: c.id, label: c.name }))}
                        placeholder="Select a client…"
                      />
                    ) : (
                      <div style={{ fontSize: 13, color: "#a1a1aa", fontFamily: "var(--font-body)", padding: "8px 0" }}>
                        No clients yet — switch to “New client” above.
                      </div>
                    )}
                  </div>

                  <FieldInput
                    label="Client Email"
                    value={form.clientIsNew ? form.clientEmail : selectedExistingClient?.email || ""}
                    onChange={(v) => update("clientEmail", v)}
                    placeholder="client@company.com"
                    type="email"
                    disabled={!form.clientIsNew}
                    helper="Your client will receive an invitation to review and edit content."
                  />
                </div>
              </Card>

              <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
                <Btn variant="primary" onClick={() => setStep(2)} disabled={!form.name.trim()}>
                  Continue
                </Btn>
                <Btn variant="outline" onClick={() => router.push("/pm/projects")}>
                  Cancel
                </Btn>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <Card>
                <div style={{ marginBottom: 20 }}>
                  <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)" }}>
                    Upload PDF Document
                  </h3>
                  <p style={{ margin: 0, fontSize: 14, color: "#71717b", fontFamily: "var(--font-body)" }}>
                    The AI will extract editable text sections from your PDF. Upload your design brief, wireframes, or content
                    document.
                  </p>
                </div>

                {!file ? (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: `2px dashed ${dragOver ? "#7f22fe" : "#e4e4e7"}`,
                      borderRadius: 12,
                      padding: "40px 24px",
                      textAlign: "center",
                      cursor: "pointer",
                      background: dragOver ? "#f5f3ff" : "#fafafa",
                      transition: "all 0.15s",
                    }}
                  >
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 12,
                        background: "#f4f4f5",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        margin: "0 auto 16px",
                      }}
                    >
                      <Icon name="upload" size={22} color="#71717b" />
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: "#09090b", fontFamily: "var(--font-sans)", marginBottom: 6 }}>
                      Drag & drop your PDF here
                    </div>
                    <div style={{ fontSize: 13, color: "#71717b", fontFamily: "var(--font-body)", marginBottom: 16 }}>
                      or click to browse files · PDF up to 10MB
                    </div>
                    <Btn
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                    >
                      Select PDF
                    </Btn>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      style={{ display: "none" }}
                      onChange={(e) => handleFile(e.target.files?.[0])}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 14px",
                      background: "#fafafa",
                      borderRadius: 8,
                      border: `1px solid ${extractedText ? "#bbf7d0" : "#e4e4e7"}`,
                      transition: "border-color 0.2s",
                    }}
                  >
                    <Icon name="file-text" size={16} color={extractedText ? "#15803d" : "#7f22fe"} />
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
                          color: extractedText ? "#15803d" : extracting ? "#7f22fe" : "#a1a1aa",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          marginTop: 2,
                        }}
                      >
                        {extracting ? (
                          <>
                            <Spinner size={10} color="#7f22fe" /> Extracting text…
                          </>
                        ) : extractedText ? (
                          `✓ ${extractedText.length.toLocaleString()} characters extracted`
                        ) : (
                          `${(file.size / 1024).toFixed(0)} KB · no text found`
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        setExtractedText(null);
                      }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#a1a1aa", padding: 2 }}
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                )}
              </Card>

              <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
                <Btn variant="primary" onClick={handleSubmit} disabled={submitting || extracting}>
                  {submitting ? (
                    <>
                      <Spinner size={13} color="#fff" /> Creating…
                    </>
                  ) : file ? (
                    "Create & Process with AI"
                  ) : (
                    "Create Project (skip upload)"
                  )}
                </Btn>
                <Btn variant="outline" onClick={() => setStep(1)} disabled={submitting}>
                  Back
                </Btn>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
