import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PmOverviewScreen, type ProjectWithStats } from "@/components/screens/pm-overview-screen";
import type { Client, Project } from "@/lib/supabase/types";

type ProjectRow = Project & { client: Pick<Client, "name"> | null };

export default async function PmDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: projectRows }, { data: activity }] = await Promise.all([
    supabase.from("profiles").select("name").eq("id", user.id).maybeSingle(),
    supabase
      .from("projects")
      .select("*, client:clients(name)")
      .eq("pm_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("activity_log")
      .select("*")
      .eq("pm_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const rows = (projectRows ?? []) as ProjectRow[];
  const projectIds = rows.map((p) => p.id);

  let pageRows: { project_id: string; status: string }[] = [];
  if (projectIds.length > 0) {
    const { data } = await supabase.from("pages").select("project_id, status").in("project_id", projectIds);
    pageRows = data ?? [];
  }

  const pageStats = new Map<string, { total: number; completed: number }>();
  for (const row of pageRows) {
    const s = pageStats.get(row.project_id) ?? { total: 0, completed: 0 };
    s.total += 1;
    if (row.status === "Completed") s.completed += 1;
    pageStats.set(row.project_id, s);
  }

  const projects: ProjectWithStats[] = rows.map(({ client, ...rest }) => {
    const s = pageStats.get(rest.id) ?? { total: 0, completed: 0 };
    return {
      ...rest,
      clientName: client?.name ?? "—",
      pageCount: s.total,
      completedPageCount: s.completed,
    };
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const firstName = (profile?.name || user.email || "there").split(" ")[0];

  return <PmOverviewScreen firstName={firstName} greeting={greeting} projects={projects} activity={activity ?? []} />;
}
