import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PagesListScreen, type ProjectWithClient } from "@/components/screens/pages-list-screen";

export default async function ProjectPage({ params }: PageProps<"/pm/projects/[projectId]">) {
  const { projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: project } = await supabase
    .from("projects")
    .select("*, clients(name)")
    .eq("id", projectId)
    .single();

  if (!project) notFound();

  const { data: pages } = await supabase
    .from("pages")
    .select("*")
    .eq("project_id", projectId)
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  const { data: figmaConnection } = await supabase
    .from("figma_connections")
    .select("pm_id")
    .eq("pm_id", user.id)
    .maybeSingle();

  return <PagesListScreen project={project as ProjectWithClient} pages={pages ?? []} figmaConnected={!!figmaConnection} />;
}
