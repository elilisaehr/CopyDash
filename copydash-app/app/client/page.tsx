import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { ClientDashboardScreen } from "@/components/screens/client-dashboard-screen";
import type { Page, Project } from "@/lib/supabase/types";

export default async function ClientHomePage() {
  const supabase = await createClient();

  // RLS scopes this to only the project(s) this client is a member of via
  // `project_members`. The prototype assumes exactly one project per client.
  // Its pages come along in the same request.
  const [profile, { data: row }] = await Promise.all([
    // app/client/layout.tsx already redirects unauthenticated users (and
    // non-clients) before this page ever renders, so a profile is guaranteed here.
    getProfile(),
    supabase
      .from("projects")
      .select("*, pages(*)")
      .is("archived_at", null)
      .is("pages.archived_at", null)
      .order("created_at", { referencedTable: "pages", ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const { pages, ...project } = (row ?? { pages: [] }) as Project & { pages: Page[] };

  return <ClientDashboardScreen userName={profile!.name} project={row ? (project as Project) : null} pages={pages ?? []} />;
}
