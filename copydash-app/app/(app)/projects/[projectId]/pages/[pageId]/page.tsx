import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { editorRole, getProjectRole } from "@/lib/roles";
import { EditorRouter } from "@/components/screens/editor-router";
import type { Field, Page, Project } from "@/lib/supabase/types";

export default async function PageEditorPage({ params }: PageProps<"/projects/[projectId]/pages/[pageId]">) {
  const { projectId, pageId } = await params;
  const supabase = await createClient();

  // Everything is addressed by id, so all reads go out together.
  const [profile, { data: project }, { data: page }, { data: fields }, projectRole] = await Promise.all([
    getProfile(),
    supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
    supabase.from("pages").select("*").eq("id", pageId).eq("project_id", projectId).maybeSingle(),
    supabase.from("fields").select("*").eq("page_id", pageId).order("position"),
    getProjectRole(supabase, projectId),
  ]);
  if (!profile) redirect("/login");
  if (!project || !page || !projectRole) notFound();

  // The role on this project, not the account: someone can be an admin in
  // their own workspace and a contributor on another's project.
  const role = editorRole(projectRole);

  return (
    <EditorRouter
      project={project as Project}
      page={page as Page}
      fields={(fields as Field[]) || []}
      user={{ id: profile.id, name: profile.name, role }}
      role={role}
      backHref={`/projects/${projectId}`}
    />
  );
}
