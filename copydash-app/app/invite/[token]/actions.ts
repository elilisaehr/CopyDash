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

const homeFor = (inv: Invitation) => (inv.role === "client" ? "/client" : "/pm");

/** Grants what the invitation promises to `userId` and marks it accepted. Returns an error message or null. */
async function grant(inv: Invitation, user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }): Promise<string | null> {
  const service = createAdminClient();
  const appRole = inv.role === "client" ? "client" : "pm";

  const { data: profile } = await service.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile && profile.role !== appRole) {
    return appRole === "client"
      ? "This email already has an agency account, so it can't join as a client. Ask the agency to invite a different address."
      : "This email already has a client account, so it can't join an agency team. Ask the agency to invite a different address.";
  }
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
      .upsert(projectIds.map((project_id) => ({ project_id, user_id: user.id, role: inv.role })), { onConflict: "project_id,user_id", ignoreDuplicates: true });
    if (error) return error.message;
  }
  if (inv.role === "client") {
    // The client company whose email this is now has access.
    const { data: emails } = await service.from("client_emails").select("client_id").ilike("address", inv.email);
    const clientIds = (emails ?? []).map((e) => e.client_id as string);
    if (clientIds.length) await service.from("clients").update({ status: "Active" }).eq("workspace_id", inv.workspace_id).in("id", clientIds);
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
  redirect(homeFor(inv));
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
  redirect(homeFor(inv));
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
  redirect(homeFor(inv));
}
