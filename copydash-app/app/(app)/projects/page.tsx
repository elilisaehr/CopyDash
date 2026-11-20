import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { getMyProjects } from "@/lib/projects";
import { getWorkspaceContext } from "@/lib/workspace";
import { ProjectsScreen } from "@/components/screens/projects-screen";

export default async function ProjectsPage() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/login");
  const [projects, ctx] = await Promise.all([getMyProjects(supabase, user.id), getWorkspaceContext(supabase, user.id)]);
  return <ProjectsScreen projects={projects} canCreate={ctx?.role === "admin"} />;
}
