import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/auth";
import { ClientDashboardScreen } from "@/components/screens/client-dashboard-screen";
import type { Page, Project } from "@/lib/supabase/types";

export default async function ClientHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // app/client/layout.tsx already redirects unauthenticated users (and
  // non-clients) before this page ever renders, so `user` is guaranteed here.
  const profile = await ensureProfile(supabase, user!);

  // RLS scopes this to only the project(s) this client is a member of via
  // `project_members`. The prototype assumes exactly one project per client.
  const { data: project } = await supabase.from("projects").select("*").is("archived_at", null).limit(1).maybeSingle();

  let pages: Page[] = [];
  if (project) {
    const { data } = await supabase
      .from("pages")
      .select("*")
      .eq("project_id", project.id)
      .is("archived_at", null)
      .order("created_at", { ascending: true });
    pages = data || [];
  }

  return <ClientDashboardScreen userName={profile.name} project={project as Project | null} pages={pages} />;
}
