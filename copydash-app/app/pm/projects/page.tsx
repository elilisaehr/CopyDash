import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PmProjectsScreen, type ProjectWithStats } from "@/components/screens/pm-projects-screen";
import type { Client, Project } from "@/lib/supabase/types";

type ProjectRow = Project & { client: Pick<Client, "name"> | null };

export default async function PmProjectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: projectRows } = await supabase
    .from("projects")
    .select("*, client:clients(name)")
    .eq("pm_id", user.id)
    .order("updated_at", { ascending: false });

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

  return <PmProjectsScreen projects={projects} />;
}
