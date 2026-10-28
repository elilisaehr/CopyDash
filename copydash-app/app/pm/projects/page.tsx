import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { getWorkspaceContext } from "@/lib/workspace";
import { PmProjectsScreen, type ProjectWithStats } from "@/components/screens/pm-projects-screen";
import { projectStatus } from "@/lib/review";
import type { Client, PageStatus, Project } from "@/lib/supabase/types";

type ProjectRow = Project & { client: Pick<Client, "name"> | null; pages: { status: PageStatus }[] };

export default async function PmProjectsPage() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/login");
  const ctx = await getWorkspaceContext(supabase, user.id);
  if (!ctx) redirect("/onboarding");

  // Page statuses come along with each project, so the stats need no second request.
  const { data: projectRows } = await supabase
    .from("projects")
    .select("*, client:clients(name), pages(status)")
    .eq("workspace_id", ctx.workspace.id)
    .is("archived_at", null)
    .is("pages.archived_at", null)
    .order("updated_at", { ascending: false });

  const projects: ProjectWithStats[] = ((projectRows ?? []) as ProjectRow[]).map(({ client, pages, ...rest }) => ({
    ...rest,
    clientName: client?.name ?? "—",
    status: projectStatus(pages),
    pageCount: pages.length,
    completedPageCount: pages.filter((p) => p.status === "Completed").length,
    toReviewCount: pages.filter((p) => p.status === "Pending Review").length,
  }));

  return <PmProjectsScreen projects={projects} isAdmin={ctx.role === "admin"} />;
}
