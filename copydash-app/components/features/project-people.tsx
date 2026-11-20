"use client";

// A project's People tab: who is on it, pending invitations, and an invite
// form. Shown to admins and editors only (see lib/people.ts). The server
// actions in lib/actions/people.ts make the real checks.

import * as React from "react";
import { Avatar, Btn, Card, FieldInput, SelectInput } from "@/components/ui/primitives";
import { InviteOutcome, RolePill } from "@/components/screens/settings-screen";
import { cancelProjectInvitation, getProjectInviteLink, inviteToProject, removeFromProject, resendProjectInvitation } from "@/lib/actions/people";
import type { InviteResult } from "@/lib/invite-delivery";
import { formatDate } from "@/lib/format";
import type { ProjectPeople } from "@/lib/people";
import { ROLE_HELP, ROLE_LABEL, type ProjectRole } from "@/lib/roles";

const titleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#71717b",
  fontFamily: "var(--font-sans)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 12,
};

const rowStyle = (last: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 0",
  borderBottom: last ? "none" : "1px solid #f4f4f5",
});

export function ProjectPeoplePanel({
  projectId,
  viewerId,
  viewerRole,
  people,
  invitations,
}: ProjectPeople & { projectId: string; viewerId: string; viewerRole: ProjectRole }) {
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"editor" | "client">("client");
  const [outcome, setOutcome] = React.useState<InviteResult | null>(null);
  const [confirmRemove, setConfirmRemove] = React.useState<string | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const canSend = /^\S+@\S+\.\S+$/.test(email.trim());
  const invitedRole = viewerRole === "admin" ? role : "client";

  const send = () =>
    startTransition(async () => {
      const res = await inviteToProject({ projectId, email, role: invitedRole });
      setOutcome(res);
      if (res.ok) setEmail("");
    });

  const resend = (id: string) => startTransition(async () => setOutcome(await resendProjectInvitation(projectId, id)));

  const cancel = (id: string) =>
    startTransition(async () => {
      const res = await cancelProjectInvitation(projectId, id);
      if (!res.ok) setOutcome({ ok: false, error: res.error || "Could not cancel the invitation." });
    });

  const remove = (userId: string) =>
    startTransition(async () => {
      const res = await removeFromProject(projectId, userId);
      setConfirmRemove(null);
      if (!res.ok) setOutcome({ ok: false, error: res.error || "Could not remove this person." });
    });

  const copyLink = (id: string) =>
    startTransition(async () => {
      const res = await getProjectInviteLink(projectId, id);
      if (!res.ok) {
        setOutcome({ ok: false, error: res.error });
        return;
      }
      await navigator.clipboard?.writeText(res.link);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={titleStyle}>On this project</div>
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {people.map((p, i) => (
            <div key={p.userId} style={rowStyle(i === people.length - 1)}>
              <Avatar name={p.name} size={36} src={p.avatarUrl} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#09090b", fontFamily: "var(--font-sans)" }}>
                  {p.name}
                  {p.userId === viewerId && <span style={{ color: "#a1a1aa", fontWeight: 400 }}> (you)</span>}
                </div>
                <div style={{ fontSize: 12, color: "#71717b", fontFamily: "var(--font-body)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.email}</div>
              </div>
              <RolePill role={p.role} />
              {p.removable &&
                (confirmRemove === p.userId ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <Btn variant="destructive" size="sm" disabled={pending} onClick={() => remove(p.userId)}>
                      Remove
                    </Btn>
                    <Btn variant="outline" size="sm" onClick={() => setConfirmRemove(null)}>
                      Keep
                    </Btn>
                  </div>
                ) : (
                  <Btn variant="ghost" size="sm" icon="trash" title="Remove from this project" onClick={() => setConfirmRemove(p.userId)} />
                ))}
            </div>
          ))}
        </div>
      </Card>

      {invitations.length > 0 && (
        <>
          <div style={titleStyle}>Pending invitations</div>
          <Card style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {invitations.map((inv, i) => (
                <div key={inv.id} style={rowStyle(i === invitations.length - 1)}>
                  <Avatar name={inv.email} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "#09090b", fontFamily: "var(--font-sans)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.email}</div>
                    <div style={{ fontSize: 12, color: "#71717b", fontFamily: "var(--font-body)", marginTop: 2 }}>Invited {formatDate(inv.createdAt)}</div>
                  </div>
                  <RolePill role={inv.role} />
                  {inv.manageable && (
                    <div style={{ display: "flex", gap: 2 }}>
                      {inv.linkVisible && <Btn variant="ghost" size="sm" icon={copiedId === inv.id ? "check" : "link"} title="Copy invite link" disabled={pending} onClick={() => copyLink(inv.id)} />}
                      <Btn variant="ghost" size="sm" icon="send" title="Send the email again" disabled={pending} onClick={() => resend(inv.id)} />
                      <Btn variant="ghost" size="sm" icon="x" title="Cancel invitation" disabled={pending} onClick={() => cancel(inv.id)} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      <div style={titleStyle}>{viewerRole === "admin" ? "Invite someone" : "Invite a contributor"}</div>
      <Card>
        {outcome && <InviteOutcome result={outcome} onDismiss={() => setOutcome(null)} />}
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <FieldInput label="Email address" value={email} onChange={setEmail} placeholder="name@company.com" type="email" />
          </div>
          {viewerRole === "admin" && (
            <div style={{ width: 140 }}>
              <SelectInput
                label="Role"
                value={role}
                onChange={(v) => setRole(v as "editor" | "client")}
                options={(["client", "editor"] as const).map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
              />
            </div>
          )}
        </div>
        <div style={{ fontSize: 12, color: "#71717b", fontFamily: "var(--font-body)", marginTop: 8 }}>{ROLE_HELP[invitedRole]}</div>
        <Btn variant="primary" size="sm" icon="send" onClick={send} disabled={!canSend || pending} style={{ marginTop: 16 }}>
          {pending ? "Sending…" : "Send invitation"}
        </Btn>
      </Card>
    </div>
  );
}
