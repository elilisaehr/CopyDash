"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Btn, Card, FieldInput, PageHeader, Spinner } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/client";
import { planLimitError } from "@/lib/plan";
import { PlanLimitNotice } from "@/components/features/plan-limit-notice";

export function CreateProjectScreen({
  workspaceId,
  limitMessage,
}: {
  workspaceId: string;
  /** Set when the plan's project limit is already reached: shown instead of the form. */
  limitMessage: string | null;
}) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("You must be signed in.");

      const { data: project, error: projErr } = await supabase
        .from("projects")
        .insert({ pm_id: user.id, workspace_id: workspaceId, company: company.trim(), name: name.trim(), status: "In Progress" })
        .select("id")
        .single();
      if (projErr) throw projErr;

      router.push(`/projects/${project.id}`);
      router.refresh();
    } catch (e) {
      setError(planLimitError(e) ?? (e instanceof Error ? e.message : "Something went wrong. Please try again."));
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Create Project"
        subtitle="Set up a new content collection workspace"
        breadcrumb={[{ label: "Projects", onClick: () => router.push("/projects") }, { label: "New Project" }]}
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
                  <FieldInput label="Project Name" value={name} onChange={setName} placeholder="e.g. E-commerce Website" />
                  <FieldInput
                    label="Company (optional)"
                    value={company}
                    onChange={setCompany}
                    placeholder="e.g. Lovely Bakd"
                    helper="Who the website is for. You'll invite people from the project's People tab."
                  />
                </div>
              </Card>

              <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
                <Btn variant="primary" onClick={handleSubmit} disabled={!name.trim() || submitting}>
                  {submitting ? (
                    <>
                      <Spinner size={13} color="#fff" /> Creating…
                    </>
                  ) : (
                    "Create Project"
                  )}
                </Btn>
                <Btn variant="outline" onClick={() => router.push("/projects")} disabled={submitting}>
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
