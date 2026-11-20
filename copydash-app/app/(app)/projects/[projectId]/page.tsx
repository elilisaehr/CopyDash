import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { getWorkspaceContext } from "@/lib/workspace";
import { getProjectPeople } from "@/lib/people";
import { pageLimitMessage, pageLimitReached } from "@/lib/plan";
import { getProjectRole, managesProject } from "@/lib/roles";
import { PagesListScreen } from "@/components/screens/pages-list-screen";
import type { Project } from "@/lib/supabase/types";

export default async function ProjectPage({ params }: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/login");

  const [{ data: project }, { data: pages }, { data: figmaConnection }, ctx, role] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
    supabase.from("pages").select("*").eq("project_id", projectId).is("archived_at", null).order("created_at", { ascending: true }),
    supabase.from("figma_connections").select("pm_id").eq("pm_id", user.id).maybeSingle(),
    getWorkspaceContext(supabase, user.id),
    getProjectRole(supabase, projectId),
  ]);

  if (!project || !role) notFound();

  // Limits follow the project's own workspace plan.
  const limits = ctx && ctx.workspace.id === project.workspace_id ? ctx.limits : null;
  const limitMessage = limits && pageLimitReached(limits, pages?.length ?? 0) ? pageLimitMessage(limits) : null;
  const people = managesProject(role) ? await getProjectPeople(project, { id: user.id, role }) : null;

  return (
    <PagesListScreen
      project={project as Project}
      pages={pages ?? []}
      figmaConnected={!!figmaConnection}
      pageLimitMessage={limitMessage}
      role={role}
      viewerId={user.id}
      people={people}
    />
  );
}
