"use server";

// The People tab of a project. Admins can invite and remove editors and
// contributors; editors only contributors, on projects they're on.
//
// Editors have no database rights on invitations or other people's
// memberships, so once projectAccess() has checked the caller's role (read by
// the database from their own session), these use the service role. Every
// action starts with that check, and they can be called from any browser.

import { refresh } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { deliverInvitation, inviteLink, type InviteResult } from "@/lib/invite-delivery";
import { canSeeInviteLink, editorProjectIds } from "@/lib/people";
import { planLimitError } from "@/lib/plan";
import { getProjectRole, managesProject, type ProjectRole } from "@/lib/roles";
import type { Invitation } from "@/lib/supabase/types";

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const NOT_ALLOWED = "You can't manage this person on this project.";

async function projectAccess(projectId: string) {
  const profile = await getProfile();
  if (!profile) return null;
  const role = await getProjectRole(await createClient(), projectId);
  if (!managesProject(role)) return null;
  const service = createAdminClient();
  const { data: project } = await service.from("projects").select("id, workspace_id, workspace:workspaces(name)").eq("id", projectId).maybeSingle();
  if (!project?.workspace_id) return null;
  const workspaceName = (project.workspace as unknown as { name: string } | null)?.name ?? "CopyDash";
  return { profile, role: role as ProjectRole, service, workspaceId: project.workspace_id as string, workspaceName };
}

/** Editors act on contributors only. */
const mayActOn = (viewer: ProjectRole, target: ProjectRole) => viewer === "admin" || target === "client";

export async function inviteToProject(input: { projectId: string; email: string; role: "editor" | "client" }): Promise<InviteResult> {
  const access = await projectAccess(input.projectId);
  if (!access) return { ok: false, error: NOT_ALLOWED };
  const { profile, role, service, workspaceId, workspaceName } = access;

  if (input.role !== "editor" && input.role !== "client") return { ok: false, error: "Unknown role." };
  if (!mayActOn(role, input.role)) return { ok: false, error: "Only an admin can invite an editor." };
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email address." };

  // Already here?
  const { data: existing } = await service.from("profiles").select("id").ilike("email", email).maybeSingle();
  if (existing) {
    const [{ data: member }, { data: admin }] = await Promise.all([
      service.from("project_members").select("user_id").eq("project_id", input.projectId).eq("user_id", existing.id).maybeSingle(),
      service.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).eq("user_id", existing.id).eq("role", "admin").maybeSingle(),
    ]);
    if (member || admin) return { ok: false, error: "This person is already on this project." };
  }

  const { data: pending } = await service.from("invitations").select("*").eq("workspace_id", workspaceId).is("accepted_at", null);
  const invitations = (pending ?? []) as Invitation[];

  if (input.role === "editor") {
    const [{ data: members }, { data: workspace }] = await Promise.all([
      service.from("workspace_members").select("user_id").eq("workspace_id", workspaceId),
      service.from("workspaces").select("limits:plan_limits(max_members)").eq("id", workspaceId).maybeSingle(),
    ]);
    const max = (workspace?.limits as unknown as { max_members: number | null } | null)?.max_members ?? null;
    const alreadyTeam = !!existing && (members ?? []).some((m) => m.user_id === existing.id);
    const seats = (members ?? []).length + invitations.filter((i) => i.role !== "client" && i.email.toLowerCase() !== email).length;
    if (max !== null && !alreadyTeam && seats >= max) return { ok: false, error: `Your plan includes ${max} team members. Upgrade to invite more.` };
  }

  // One invitation per project here, so an editor's invitation never opens a
  // project they aren't on. Inviting twice reuses the same link.
  const same = invitations.find((i) => i.email.toLowerCase() === email && i.role === input.role && i.project_ids.length === 1 && i.project_ids[0] === input.projectId);
  let inv: Invitation | null = same ?? null;
  if (!inv) {
    const { data, error } = await service
      .from("invitations")
      .insert({ workspace_id: workspaceId, email, role: input.role, project_ids: [input.projectId], invited_by: profile.id })
      .select("*")
      .single();
    if (error || !data) return { ok: false, error: planLimitError(error) ?? "Could not create the invitation." };
    inv = data as Invitation;
  }

  const result = await deliverInvitation(inv, { workspaceName, inviterName: profile.name || "Your team" });
  refresh();
  return result;
}

async function projectInvitation(service: ReturnType<typeof createAdminClient>, projectId: string, invitationId: string) {
  const { data } = await service.from("invitations").select("*").eq("id", invitationId).is("accepted_at", null).contains("project_ids", [projectId]).maybeSingle();
  return data as Invitation | null;
}

export async function resendProjectInvitation(projectId: string, invitationId: string): Promise<InviteResult> {
  const access = await projectAccess(projectId);
  if (!access) return { ok: false, error: NOT_ALLOWED };
  const { profile, role, service, workspaceName } = access;
  const inv = await projectInvitation(service, projectId, invitationId);
  if (!inv) return { ok: false, error: "This invitation no longer exists." };
  if (!mayActOn(role, inv.role)) return { ok: false, error: NOT_ALLOWED };

  const result = await deliverInvitation(inv, { workspaceName, inviterName: profile.name || "Your team" });
  const projects = role === "admin" ? [] : await editorProjectIds(profile.id);
  if (result.ok && !canSeeInviteLink(role, inv, projects)) {
    if (result.emailSent) return { ...result, link: "" };
    return { ok: false, error: `The email couldn't be sent. Ask an admin to share the link. (${result.emailError ?? "Unknown error"})` };
  }
  return result;
}

/** The link of a pending invitation, when this person may see it. */
export async function getProjectInviteLink(projectId: string, invitationId: string): Promise<{ ok: true; link: string } | { ok: false; error: string }> {
  const access = await projectAccess(projectId);
  if (!access) return { ok: false, error: NOT_ALLOWED };
  const { profile, role, service } = access;
  const inv = await projectInvitation(service, projectId, invitationId);
  if (!inv) return { ok: false, error: "This invitation no longer exists." };
  const projects = role === "admin" ? [] : await editorProjectIds(profile.id);
  if (!canSeeInviteLink(role, inv, projects)) return { ok: false, error: NOT_ALLOWED };
  return { ok: true, link: await inviteLink(inv.token) };
}

/** Takes this project out of the invitation; an invitation left with no project is deleted. */
export async function cancelProjectInvitation(projectId: string, invitationId: string): Promise<{ ok: boolean; error?: string }> {
  const access = await projectAccess(projectId);
  if (!access) return { ok: false, error: NOT_ALLOWED };
  const { role, service } = access;
  const inv = await projectInvitation(service, projectId, invitationId);
  if (!inv) return { ok: false, error: "This invitation no longer exists." };
  if (!mayActOn(role, inv.role)) return { ok: false, error: NOT_ALLOWED };

  const rest = inv.project_ids.filter((id) => id !== projectId);
  const { error } = rest.length
    ? await service.from("invitations").update({ project_ids: rest }).eq("id", inv.id)
    : await service.from("invitations").delete().eq("id", inv.id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** Removes someone from this one project. Workspace admins aren't removed this way: they come with the workspace. */
export async function removeFromProject(projectId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  const access = await projectAccess(projectId);
  if (!access) return { ok: false, error: NOT_ALLOWED };
  const { profile, role, service } = access;
  if (userId === profile.id) return { ok: false, error: "You can't remove yourself." };

  const { data: member } = await service.from("project_members").select("role").eq("project_id", projectId).eq("user_id", userId).maybeSingle();
  if (!member) return { ok: false, error: "This person isn't on this project." };
  if (!mayActOn(role, member.role as ProjectRole)) return { ok: false, error: NOT_ALLOWED };

  const { error } = await service.from("project_members").delete().eq("project_id", projectId).eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}
