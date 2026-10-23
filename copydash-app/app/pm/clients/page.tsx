import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/workspace";
import { ClientsScreen } from "@/components/screens/clients-screen";

export default async function ClientsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Managing client companies is admin-only.
  const ctx = await requireAdmin(supabase, user.id);

  // RLS scopes client_emails to clients the admin can manage.
  const [{ data: clients }, { data: clientEmails }, { data: projects }] = await Promise.all([
    supabase.from("clients").select("*").eq("workspace_id", ctx.workspace.id).order("created_at", { ascending: false }),
    supabase.from("client_emails").select("*"),
    supabase.from("projects").select("id, client_id, name, status").eq("workspace_id", ctx.workspace.id).is("archived_at", null),
  ]);

  return (
    <ClientsScreen
      initialClients={clients ?? []}
      initialClientEmails={clientEmails ?? []}
      projects={projects ?? []}
      workspaceId={ctx.workspace.id}
    />
  );
}
