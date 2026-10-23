"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Btn, Card, FieldInput, PageHeader, SelectInput, Spinner } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/client";
import { planLimitError } from "@/lib/plan";
import { PlanLimitNotice } from "@/components/features/plan-limit-notice";

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

export function CreateProjectScreen({
  clients,
  workspaceId,
  limitMessage,
}: {
  clients: CreateProjectClient[];
  workspaceId: string;
  /** Set when the plan's project limit is already reached: shown instead of the form. */
  limitMessage: string | null;
}) {
  const router = useRouter();
  const [form, setForm] = React.useState({
    name: "",
    clientIsNew: false,
    existingClientId: "",
    newClientName: "",
    clientEmail: "",
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

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
            .insert({ pm_id: user.id, workspace_id: workspaceId, name: form.newClientName.trim() })
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
        .insert({ pm_id: user.id, workspace_id: workspaceId, client_id: clientId, name: form.name.trim(), status: "In Progress" })
        .select("id")
        .single();
      if (projErr) throw projErr;

      router.push(`/pm/projects/${project.id}`);
      router.refresh();
    } catch (e) {
      setError(planLimitError(e) ?? (e instanceof Error ? e.message : "Something went wrong. Please try again."));
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
          {limitMessage && <PlanLimitNotice message={limitMessage} />}
          {!limitMessage && error && (
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

          {!limitMessage && (
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
              <Btn variant="primary" onClick={handleSubmit} disabled={!form.name.trim() || submitting}>
                {submitting ? (
                  <>
                    <Spinner size={13} color="#fff" /> Creating…
                  </>
                ) : (
                  "Create Project"
                )}
              </Btn>
              <Btn variant="outline" onClick={() => router.push("/pm/projects")} disabled={submitting}>
                Cancel
              </Btn>
            </div>
          </div>
          )}
        </div>
      </div>
    </>
  );
}
