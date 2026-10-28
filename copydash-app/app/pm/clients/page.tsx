import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { requireAdmin } from "@/lib/workspace";
import { ClientsScreen } from "@/components/screens/clients-screen";
import { projectStatus } from "@/lib/review";
import type { PageStatus } from "@/lib/supabase/types";

export default async function ClientsPage() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/login");
  // Managing client companies is admin-only.
  const ctx = await requireAdmin(supabase, user.id);

  // RLS scopes client_emails to clients the admin can manage.
  const [{ data: clients }, { data: clientEmails }, { data: projectRows }] = await Promise.all([
    supabase.from("clients").select("*").eq("workspace_id", ctx.workspace.id).order("created_at", { ascending: false }),
    supabase.from("client_emails").select("*"),
    supabase.from("projects").select("id, client_id, name, pages(status)").eq("workspace_id", ctx.workspace.id).is("archived_at", null).is("pages.archived_at", null),
  ]);
  // A project's status comes from its pages (lib/review.ts).
  const projects = (projectRows ?? []).map(({ pages, ...p }) => ({ ...p, status: projectStatus(pages as { status: PageStatus }[]) }));

  return (
    <ClientsScreen
      initialClients={clients ?? []}
      initialClientEmails={clientEmails ?? []}
      projects={projects}
      workspaceId={ctx.workspace.id}
    />
  );
}
