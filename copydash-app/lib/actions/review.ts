"use server";

// Moving a page through the review flow (lib/review.ts). The status update
// runs with the user's own session, so the database decides whether this
// person may make this move (migration 0008). Then whoever's turn it now is
// gets an email — best-effort, the move never fails because of email.

import { refresh } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { reviewEmail, sendEmail, type ReviewEvent } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import { PAGE_STATUSES } from "@/lib/review";
import type { PageStatus } from "@/lib/supabase/types";

export type StatusResult = { ok: true; notified: number } | { ok: false; error: string };

type Recipient = { id: string; email: string; side: "agency" | "client" };

// Which notification switch (Settings → Notifications) covers each email; on unless turned off.
const PREF: Record<ReviewEvent, string> = { sent: "pageReady", sent_back: "reviewResult", submitted: "clientUpdates", approved: "reviewResult" };

export async function changePageStatus(pageId: string, next: PageStatus): Promise<StatusResult> {
  if (!PAGE_STATUSES.includes(next)) return { ok: false, error: "Unknown status." };
  const profile = await getProfile();
  if (!profile) return { ok: false, error: "Please sign in again." };

  const supabase = await createClient();
  const { data: before } = await supabase.from("pages").select("status").eq("id", pageId).maybeSingle();
  if (!before) return { ok: false, error: "This page no longer exists." };
  if (before.status === next) return { ok: true, notified: 0 };

  const { data: page, error } = await supabase
    .from("pages")
    .update({ status: next, updated_by_name: profile.name })
    .eq("id", pageId)
    .select("id, name, project_id, project:projects(name, workspace_id)")
    .maybeSingle();
  if (error || !page) return { ok: false, error: error?.message || "You can't change this page's status." };

  const event: ReviewEvent | null =
    next === "With client" ? (before.status === "To review" ? "sent_back" : "sent") : next === "To review" ? "submitted" : next === "Approved" ? "approved" : null;

  let notified = 0;
  if (event) {
    const project = page.project as unknown as { name: string; workspace_id: string } | null;
    const side = event === "submitted" ? "agency" : "client";
    const recipients = (await recipientsFor(page.project_id, project?.workspace_id ?? null, side, PREF[event])).filter((r) => r.id !== profile.id);
    const base = await siteUrl();
    const results = await Promise.all(
      recipients.map((r) => {
        const url = r.side === "client" ? `${base}/client/pages/${page.id}` : `${base}/pm/projects/${page.project_id}/pages/${page.id}`;
        const mail = reviewEmail({ event, actorName: profile.name, pageName: page.name, projectName: project?.name ?? "your project", url });
        return sendEmail({ to: r.email, ...mail });
      }),
    );
    notified = results.filter((r) => r.ok).length;
  }

  refresh();
  return { ok: true, notified };
}

// The people to notify, read with the service role: clients can't read the
// agency's profiles (and vice versa), and notification prefs are private.
// Agency side = workspace admins + the project's editors; client side = the project's clients.
async function recipientsFor(projectId: string, workspaceId: string | null, side: "agency" | "client", prefKey: string): Promise<Recipient[]> {
  const admin = createAdminClient();
  const [{ data: members }, { data: admins }] = await Promise.all([
    admin.from("project_members").select("user_id").eq("project_id", projectId).eq("role", side === "client" ? "client" : "editor"),
    side === "agency" && workspaceId
      ? admin.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).eq("role", "admin")
      : Promise.resolve({ data: [] as { user_id: string }[] }),
  ]);
  const ids = [...new Set([...(members ?? []), ...(admins ?? [])].map((m) => m.user_id as string))];
  if (!ids.length) return [];

  const [{ data: profiles }, { data: prefs }] = await Promise.all([
    admin.from("profiles").select("id, email").in("id", ids),
    admin.from("notification_prefs").select("user_id, prefs").in("user_id", ids),
  ]);
  const optedOut = new Set((prefs ?? []).filter((p) => (p.prefs as Record<string, boolean> | null)?.[prefKey] === false).map((p) => p.user_id as string));
  return (profiles ?? []).filter((p) => p.email && !optedOut.has(p.id)).map((p) => ({ id: p.id as string, email: p.email as string, side }));
}
