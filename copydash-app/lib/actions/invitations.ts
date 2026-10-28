"use server";

// Admin-side invitation actions (Settings → Team, Clients). Invitation rows
// are written with the admin's own session, so the "invitations: admins
// manage" RLS policy is the real gate; requireAdmin only gives a clean error.
// Accepting an invitation lives in app/invite/[token]/actions.ts.

import { refresh } from "next/cache";
import { siteUrl } from "@/lib/site-url";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getProfile, getUser } from "@/lib/auth";
import { getWorkspaceContext } from "@/lib/workspace";
import { invitationEmail, sendEmail } from "@/lib/email";
import type { Invitation, InvitationRole } from "@/lib/supabase/types";

export type InviteResult =
  | { ok: true; link: string; emailSent: boolean; emailError?: string }
  | { ok: false; error: string };

const EMAIL_RE = /^\S+@\S+\.\S+$/;

async function adminContext() {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const ctx = await getWorkspaceContext(supabase, user.id);
  if (!ctx || ctx.role !== "admin") return null;
  return { supabase, user, ctx };
}

async function inviteLink(token: string) {
  return `${await siteUrl()}/invite/${token}`;
}

async function deliver(inv: Pick<Invitation, "email" | "role" | "token">, workspaceName: string, send = true): Promise<InviteResult> {
  const link = await inviteLink(inv.token);
  if (!send) return { ok: true, link, emailSent: false };
  const profile = await getProfile();
  const { subject, html, text } = invitationEmail({ inviterName: profile?.name || "Your agency", workspaceName, role: inv.role, url: link });
  const sent = await sendEmail({ to: inv.email, subject, html, text });
  return sent.ok ? { ok: true, link, emailSent: true } : { ok: true, link, emailSent: false, emailError: sent.error };
}

/** Creates (or refreshes) a pending invitation and emails it (unless `send` is false — link only). */
export async function createInvitation(input: { email: string; role: InvitationRole; projectIds: string[]; send?: boolean }): Promise<InviteResult> {
  const admin = await adminContext();
  if (!admin) return { ok: false, error: "Only workspace admins can invite people." };
  const { supabase, user, ctx } = admin;

  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (!["admin", "editor", "client"].includes(input.role)) return { ok: false, error: "Unknown role." };

  // Only projects of this workspace can be granted; admins see everything anyway.
  let projectIds: string[] = [];
  if (input.role !== "admin" && input.projectIds.length) {
    const { data } = await supabase.from("projects").select("id").eq("workspace_id", ctx.workspace.id).in("id", input.projectIds);
    projectIds = (data ?? []).map((p) => p.id as string);
  }
  if (input.role !== "admin" && projectIds.length === 0) return { ok: false, error: "Choose at least one project." };

  const [{ data: members }, { data: pending }] = await Promise.all([
    supabase.from("workspace_members").select("user_id").eq("workspace_id", ctx.workspace.id),
    supabase.from("invitations").select("*").eq("workspace_id", ctx.workspace.id).is("accepted_at", null),
  ]);

  if (input.role !== "client") {
    const { data: existing } = await supabase.from("profiles").select("id").ilike("email", email).maybeSingle();
    if (existing && members?.some((m) => m.user_id === existing.id)) return { ok: false, error: "This person is already in your team." };
    const seats = (members?.length ?? 0) + (pending ?? []).filter((i) => i.role !== "client" && i.email !== email).length;
    if (ctx.limits.max_members !== null && seats >= ctx.limits.max_members) {
      return { ok: false, error: `Your plan includes ${ctx.limits.max_members} team members. Upgrade to invite more.` };
    }
  }

  // Re-inviting the same person with the same role keeps one link and adds the projects.
  const same = (pending as Invitation[] | null)?.find((i) => i.email.toLowerCase() === email && i.role === input.role);
  const { data: inv, error } = same
    ? await supabase
        .from("invitations")
        .update({ project_ids: Array.from(new Set([...same.project_ids, ...projectIds])) })
        .eq("id", same.id)
        .select("*")
        .single()
    : await supabase
        .from("invitations")
        .insert({ workspace_id: ctx.workspace.id, email, role: input.role, project_ids: projectIds, invited_by: user.id })
        .select("*")
        .single();
  if (error || !inv) return { ok: false, error: error?.message || "Could not create the invitation." };

  const result = await deliver(inv as Invitation, ctx.workspace.name, input.send ?? true);
  refresh();
  return result;
}

/** Sends the email for an existing pending invitation again. */
export async function resendInvitation(id: string): Promise<InviteResult> {
  const admin = await adminContext();
  if (!admin) return { ok: false, error: "Only workspace admins can invite people." };
  const { data: inv } = await admin.supabase.from("invitations").select("*").eq("id", id).is("accepted_at", null).maybeSingle();
  if (!inv) return { ok: false, error: "This invitation no longer exists." };
  return deliver(inv as Invitation, admin.ctx.workspace.name);
}

export async function revokeInvitation(id: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await adminContext();
  if (!admin) return { ok: false, error: "Only workspace admins can manage invitations." };
  const { error } = await admin.supabase.from("invitations").delete().eq("id", id).is("accepted_at", null);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** Removes an editor (or admin) from the workspace and from its projects. The owner can't be removed. */
export async function removeMember(userId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await adminContext();
  if (!admin) return { ok: false, error: "Only workspace admins can remove people." };
  const { ctx, user } = admin;
  if (userId === user.id) return { ok: false, error: "You can't remove yourself." };
  if (userId === ctx.workspace.owner_id) return { ok: false, error: "The workspace owner can't be removed." };

  // project_members rows of other people aren't writable through RLS, so this uses the service role.
  const service = createAdminClient();
  const { data: projects } = await service.from("projects").select("id").eq("workspace_id", ctx.workspace.id);
  const ids = (projects ?? []).map((p) => p.id as string);
  if (ids.length) await service.from("project_members").delete().eq("user_id", userId).eq("role", "editor").in("project_id", ids);
  const { error } = await service.from("workspace_members").delete().eq("workspace_id", ctx.workspace.id).eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** Invites a client company's primary contact to all of that client's projects. */
export async function inviteClient(clientId: string, send = true): Promise<InviteResult> {
  const admin = await adminContext();
  if (!admin) return { ok: false, error: "Only workspace admins can invite clients." };
  const { data: client } = await admin.supabase
    .from("clients")
    .select("id, client_emails(address, is_primary), projects(id, archived_at)")
    .eq("id", clientId)
    .eq("workspace_id", admin.ctx.workspace.id)
    .maybeSingle();
  if (!client) return { ok: false, error: "Client not found." };

  const emails = (client.client_emails ?? []) as { address: string; is_primary: boolean }[];
  const email = (emails.find((e) => e.is_primary) ?? emails[0])?.address;
  if (!email) return { ok: false, error: "Add an email address to this client first." };
  const projectIds = ((client.projects ?? []) as { id: string; archived_at: string | null }[]).filter((p) => !p.archived_at).map((p) => p.id);
  if (projectIds.length === 0) return { ok: false, error: "Create a project for this client first — they'll be invited to it." };

  return createInvitation({ email, role: "client", projectIds, send });
}
