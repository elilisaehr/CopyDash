import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getUser } from "@/lib/auth";
import { getWorkspaceContext } from "@/lib/workspace";
import { PmOverviewScreen, type ProjectWithStats } from "@/components/screens/pm-overview-screen";
import { projectStatus } from "@/lib/review";
import type { Client, PageStatus, Project } from "@/lib/supabase/types";

type ProjectRow = Project & { client: Pick<Client, "name"> | null; pages: { status: PageStatus }[] };

export default async function PmDashboardPage() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/login");
  const ctx = await getWorkspaceContext(supabase, user.id);
  if (!ctx) redirect("/onboarding");

  // RLS scopes both queries: admins see the whole workspace, editors only
  // the projects they're invited to (and no activity feed). Page statuses
  // come along with each project, so the stats need no second request.
  const [profile, { data: projectRows }, { data: activity }] = await Promise.all([
    getProfile(),
    supabase
      .from("projects")
      .select("*, client:clients(name), pages(status)")
      .eq("workspace_id", ctx.workspace.id)
      .is("archived_at", null)
      .is("pages.archived_at", null)
      .order("updated_at", { ascending: false }),
    supabase
      .from("activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const projects: ProjectWithStats[] = ((projectRows ?? []) as ProjectRow[]).map(({ client, pages, ...rest }) => ({
    ...rest,
    clientName: client?.name ?? "—",
    status: projectStatus(pages),
    pageCount: pages.length,
    completedPageCount: pages.filter((p) => p.status === "Completed").length,
    toReviewCount: pages.filter((p) => p.status === "Pending Review").length,
  }));

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const firstName = (profile?.name || user.email || "there").split(" ")[0];

  return <PmOverviewScreen firstName={firstName} greeting={greeting} projects={projects} activity={activity ?? []} isAdmin={ctx.role === "admin"} />;
}
