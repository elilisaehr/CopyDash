import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/workspace";
import { projectLimitMessage, projectLimitReached } from "@/lib/plan";
import { CreateProjectScreen, type CreateProjectClient } from "@/components/screens/create-project-screen";

export default async function NewProjectPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const ctx = await requireAdmin(supabase, user.id);

  const { count: activeProjects } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", ctx.workspace.id)
    .is("archived_at", null);
  const limitMessage = projectLimitReached(ctx.limits, activeProjects ?? 0) ? projectLimitMessage(ctx.limits) : null;

  const { data: clientsRaw } = await supabase
    .from("clients")
    .select("id, name, client_emails(address, is_primary)")
    .eq("workspace_id", ctx.workspace.id)
    .order("name", { ascending: true });

  const clients: CreateProjectClient[] = (clientsRaw ?? []).map((c) => {
    const emails = (c.client_emails ?? []) as { address: string; is_primary: boolean }[];
    const primary = emails.find((e) => e.is_primary) ?? emails[0];
    return { id: c.id as string, name: c.name as string, email: primary?.address ?? "" };
  });

  return <CreateProjectScreen clients={clients} workspaceId={ctx.workspace.id} limitMessage={limitMessage} />;
}
