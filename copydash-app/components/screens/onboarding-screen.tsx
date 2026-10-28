"use client";

// First-login wizard for agency accounts. Three short steps, each saved as
// soon as it's done: name the workspace → first project (+ optional client)
// → first page (PDF / Figma / blank), then straight into the editor.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Btn, FieldInput, Spinner } from "@/components/ui/primitives";
import { AddPageForm } from "@/components/screens/pages-list-screen";
import { createClient } from "@/lib/supabase/client";
import { createPage, type NewPageData } from "@/lib/create-page";
import { planLimitError } from "@/lib/plan";

const STEPS = ["Your workspace", "First project", "First page"] as const;

export function OnboardingScreen({
  userId,
  firstName,
  suggestedWorkspaceName,
  existingWorkspaceId,
}: {
  userId: string;
  firstName: string;
  suggestedWorkspaceName: string;
  /** Set when the workspace was created on an earlier visit: resume at step 2. */
  existingWorkspaceId: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState(existingWorkspaceId ? 1 : 0);
  const [workspaceId, setWorkspaceId] = React.useState(existingWorkspaceId);
  const [projectId, setProjectId] = React.useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = React.useState(suggestedWorkspaceName);
  const [projectName, setProjectName] = React.useState("");
  const [clientName, setClientName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fail = (e: unknown, fallback: string) => {
    console.warn(fallback, e);
    setError(planLimitError(e) ?? fallback);
    setBusy(false);
  };

  const createWorkspace = async () => {
    if (!workspaceName.trim()) return;
    setBusy(true);
    setError(null);
    // The id is chosen here so the row doesn't have to be read back right
    // after the insert (its owner membership is added by a trigger).
    const id = crypto.randomUUID();
    const { error: err } = await createClient().from("workspaces").insert({ id, name: workspaceName.trim(), owner_id: userId });
    if (err) return fail(err, "Couldn’t create your workspace. Please try again.");
    setWorkspaceId(id);
    setBusy(false);
    setStep(1);
  };

  const createProject = async () => {
    if (!projectName.trim() || !workspaceId) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    let clientId: string | null = null;
    if (clientName.trim()) {
      const { data, error: err } = await supabase.from("clients").insert({ pm_id: userId, workspace_id: workspaceId, name: clientName.trim() }).select("id").single();
      if (err) return fail(err, "Couldn’t save the client. Please try again.");
      clientId = data.id;
    }
    const { data, error: err } = await supabase
      .from("projects")
      .insert({ pm_id: userId, workspace_id: workspaceId, client_id: clientId, name: projectName.trim(), status: "In Progress" })
      .select("id")
      .single();
    if (err) return fail(err, "Couldn’t create the project. Please try again.");
    setProjectId(data.id);
    setBusy(false);
    setStep(2);
  };

  const addPage = async (data: NewPageData) => {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      const pageId = await createPage(projectId, data);
      router.push(`/pm/projects/${projectId}/pages/${pageId}`);
    } catch (e) {
      fail(e, "Couldn’t create the page. Please try again.");
    }
  };

  const finishWithoutPage = () => router.push(projectId ? `/pm/projects/${projectId}` : "/pm");

  return (
    <div style={{ minHeight: "100vh", background: "#f7f9fb", display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: "#7f22fe", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="gallery-vertical-end" size={16} color="#fff" />
        </div>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#09090b", fontFamily: "var(--font-sans)" }}>CopyDash</span>
      </div>

      <div style={{ width: "100%", maxWidth: step === 2 ? 640 : 520 }}>
        <ol aria-label="Setup progress" style={{ listStyle: "none", margin: "0 0 20px", padding: 0, display: "flex", gap: 8 }}>
          {STEPS.map((label, i) => (
            <li key={label} aria-current={i === step ? "step" : undefined} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ height: 4, borderRadius: 2, background: i <= step ? "#7f22fe" : "#e4e4e7", transition: "background 0.2s" }} />
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: i === step ? 600 : 400, color: i === step ? "#09090b" : "#a1a1aa", fontFamily: "var(--font-sans)" }}>
                {i < step && <Icon name="check" size={11} color="#7f22fe" />}
                {label}
              </span>
            </li>
          ))}
        </ol>

        <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 14, padding: 28, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          {step === 0 && (
            <StepForm
              title={firstName ? `Welcome, ${firstName}!` : "Welcome!"}
              subtitle="Let’s set up your workspace. It’s where your projects, clients and teammates live."
              onSubmit={createWorkspace}
            >
              <FieldInput label="Agency or studio name" value={workspaceName} onChange={setWorkspaceName} placeholder="e.g. Atelier Nord" helper="You can change it later in Settings." />
              <StepActions busy={busy} disabled={!workspaceName.trim()} label="Continue" />
            </StepForm>
          )}

          {step === 1 && (
            <StepForm title="Create your first project" subtitle="A project is one website. You’ll add its pages next." onSubmit={createProject}>
              <FieldInput label="Project name" value={projectName} onChange={setProjectName} placeholder="e.g. Lovely Bakd website" />
              <FieldInput label="Client (optional)" value={clientName} onChange={setClientName} placeholder="e.g. Lovely Bakd" helper="Who the website is for. You can invite them once the page is ready." />
              <StepActions busy={busy} disabled={!projectName.trim()} label="Create project" />
            </StepForm>
          )}

          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <StepTitle title="Add your first page" subtitle="Upload the page design as a PDF or import it from Figma — you’ll edit the copy right on it." />
              {busy ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "40px 0", color: "#71717b", fontSize: 13, fontFamily: "var(--font-sans)" }}>
                  <Spinner size={18} color="#7f22fe" /> Preparing your page…
                </div>
              ) : (
                <AddPageForm existingPages={[]} figmaConnected={false} onCancel={finishWithoutPage} onSubmit={addPage} cancelLabel="Skip for now" />
              )}
            </div>
          )}

          {error && (
            <div role="alert" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#b91c1c", fontFamily: "var(--font-body)" }}>
              <Icon name="alert-circle" size={14} color="#b91c1c" /> {error}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

function StepTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#09090b", fontFamily: "var(--font-sans)", letterSpacing: "-0.01em" }}>{title}</h1>
      <p style={{ margin: "6px 0 0", fontSize: 14, color: "#71717b", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>{subtitle}</p>
    </div>
  );
}

function StepForm({ title, subtitle, onSubmit, children }: { title: string; subtitle: string; onSubmit: () => void; children: React.ReactNode }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      style={{ display: "flex", flexDirection: "column", gap: 18 }}
    >
      <StepTitle title={title} subtitle={subtitle} />
      {children}
    </form>
  );
}

function StepActions({ busy, disabled, label }: { busy: boolean; disabled: boolean; label: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
      <Btn variant="primary" type="submit" disabled={busy || disabled}>
        {busy ? (
          <>
            <Spinner size={13} color="#fff" /> Saving…
          </>
        ) : (
          label
        )}
      </Btn>
    </div>
  );
}
