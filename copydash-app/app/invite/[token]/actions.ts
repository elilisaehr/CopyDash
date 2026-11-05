"use server";

// Accepting an invitation. The invitee isn't a member of anything yet, so
// RLS can't let them read the invitation or add their own memberships —
// these actions use the service role, and the secret token is the proof.

import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import type { Invitation } from "@/lib/supabase/types";

export type AcceptState = { error: string } | null;

async function pendingInvitation(token: string) {
  const service = createAdminClient();
  const { data } = await service.from("invitations").select("*").eq("token", token).is("accepted_at", null).maybeSingle();
  return data as Invitation | null;
}

/** Grants what the invitation promises to `userId` and marks it accepted. Returns an error message or null. */
async function grant(inv: Invitation, user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }): Promise<string | null> {
  const service = createAdminClient();
  const appRole = inv.role === "client" ? "client" : "pm";

  // Roles are per project, so an existing account can join in any role.
  const { data: profile } = await service.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (!profile) {
    const name = (user.user_metadata?.name as string) || inv.email.split("@")[0];
    const { error } = await service.from("profiles").insert({ id: user.id, role: appRole, name, email: user.email || inv.email });
    if (error) return error.message;
  }

  // Projects may have been moved or deleted since the invitation was sent.
  const { data: projects } = inv.project_ids.length
    ? await service.from("projects").select("id").eq("workspace_id", inv.workspace_id).in("id", inv.project_ids)
    : { data: [] };
  const projectIds = (projects ?? []).map((p) => p.id as string);

  if (inv.role !== "client") {
    // Never downgrade someone who is already an admin.
    await service.from("workspace_members").upsert({ workspace_id: inv.workspace_id, user_id: user.id, role: "editor" }, { onConflict: "workspace_id,user_id", ignoreDuplicates: true });
    if (inv.role === "admin") {
      await service.from("workspace_members").update({ role: "admin" }).eq("workspace_id", inv.workspace_id).eq("user_id", user.id);
    }
  }
  if (inv.role !== "admin" && projectIds.length) {
    const { error } = await service
      .from("project_members")
      // An editor invitation upgrades a contributor; a contributor invitation never downgrades an editor.
      .upsert(projectIds.map((project_id) => ({ project_id, user_id: user.id, role: inv.role })), { onConflict: "project_id,user_id", ignoreDuplicates: inv.role === "client" });
    if (error) return error.message;
  }
  await service.from("invitations").update({ accepted_at: new Date().toISOString(), accepted_by: user.id }).eq("id", inv.id);
  return null;
}

/** Already signed in with the invited email: just accept. */
export async function acceptInvitation(token: string): Promise<AcceptState> {
  const inv = await pendingInvitation(token);
  if (!inv) return { error: "This invitation has already been used or was cancelled." };
  const user = await getUser();
  if (!user) return { error: "Please sign in first." };
  if ((user.email || "").toLowerCase() !== inv.email.toLowerCase()) return { error: `This invitation is for ${inv.email}.` };
  const err = await grant(inv, user);
  if (err) return { error: err };
  redirect("/dashboard");
}

/** No account yet: create one for the invited email (the emailed link proves ownership), sign in, accept. */
export async function createAccountAndAccept(token: string, rawName: string, password: string): Promise<AcceptState> {
  const inv = await pendingInvitation(token);
  if (!inv) return { error: "This invitation has already been used or was cancelled." };
  const name = rawName.trim();
  if (!name) return { error: "Enter your name." };
  if (password.length < 8) return { error: "Choose a password of at least 8 characters." };

  const service = createAdminClient();
  const { error: createError } = await service.auth.admin.createUser({
    email: inv.email,
    password,
    email_confirm: true,
    user_metadata: { role: inv.role === "client" ? "client" : "pm", name },
  });
  if (createError) {
    return { error: /already|exists|registered/i.test(createError.message) ? "An account with this email already exists — sign in instead." : createError.message };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: inv.email, password });
  if (error || !data.user) return { error: error?.message || "Could not sign you in." };
  const err = await grant(inv, data.user);
  if (err) return { error: err };
  redirect("/dashboard");
}

/** Existing account that isn't signed in: sign in with the invited email, accept. */
export async function signInAndAccept(token: string, password: string): Promise<AcceptState> {
  const inv = await pendingInvitation(token);
  if (!inv) return { error: "This invitation has already been used or was cancelled." };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: inv.email, password });
  if (error || !data.user) return { error: "Wrong password." };
  const err = await grant(inv, data.user);
  if (err) return { error: err };
  redirect("/dashboard");
}
