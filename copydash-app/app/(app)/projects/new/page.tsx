import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { requireAdmin } from "@/lib/workspace";
import { projectLimitMessage, projectLimitReached } from "@/lib/plan";
import { CreateProjectScreen } from "@/components/screens/create-project-screen";

export default async function NewProjectPage() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/login");
  const ctx = await requireAdmin(supabase, user.id);

  const { count: activeProjects } = await supabase.from("projects").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id).is("archived_at", null);
  const limitMessage = projectLimitReached(ctx.limits, activeProjects ?? 0) ? projectLimitMessage(ctx.limits) : null;

  return <CreateProjectScreen workspaceId={ctx.workspace.id} limitMessage={limitMessage} />;
}
