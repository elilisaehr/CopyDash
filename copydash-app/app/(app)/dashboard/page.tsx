import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getUser } from "@/lib/auth";
import { getMyProjects } from "@/lib/projects";
import { getWorkspaceContext } from "@/lib/workspace";
import { OverviewScreen } from "@/components/screens/overview-screen";
import { ContributorDashboardScreen } from "@/components/screens/contributor-dashboard-screen";
import type { Page, Project } from "@/lib/supabase/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/login");
  const [profile, ctx] = await Promise.all([getProfile(), getWorkspaceContext(supabase, user.id)]);

  // Not in any workspace: a contributor. RLS limits this to their projects.
  if (!ctx) {
    const { data: rows } = await supabase
      .from("projects")
      .select("*, pages(*)")
      .is("archived_at", null)
      .is("pages.archived_at", null)
      .order("updated_at", { ascending: false })
      .order("created_at", { referencedTable: "pages", ascending: true });
    return <ContributorDashboardScreen userName={profile?.name ?? ""} projects={(rows ?? []) as (Project & { pages: Page[] })[]} />;
  }

  // RLS scopes the activity feed too: only admins get one.
  const [projects, { data: activity }] = await Promise.all([
    getMyProjects(supabase, user.id),
    supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(5),
  ]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const firstName = (profile?.name || user.email || "there").split(" ")[0];

  return <OverviewScreen firstName={firstName} greeting={greeting} projects={projects} activity={activity ?? []} isAdmin={ctx.role === "admin"} />;
}
