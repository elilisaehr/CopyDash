import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { EditorRouter } from "@/components/screens/editor-router";
import type { Field, Page, Project } from "@/lib/supabase/types";

export default async function PmPageEditorPage({
  params,
}: PageProps<"/pm/projects/[projectId]/pages/[pageId]">) {
  const { projectId, pageId } = await params;
  const supabase = await createClient();

  // Everything is addressed by id, so all reads go out together.
  const [profile, { data: project }, { data: page }, { data: fields }] = await Promise.all([
    getProfile(),
    supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
    supabase.from("pages").select("*").eq("id", pageId).eq("project_id", projectId).maybeSingle(),
    supabase.from("fields").select("*").eq("page_id", pageId).order("position"),
  ]);
  if (!profile) redirect("/login");
  if (!project || !page) notFound();

  return (
    <EditorRouter
      project={project as Project}
      page={page as Page}
      fields={(fields as Field[]) || []}
      user={{ id: profile.id, name: profile.name, role: "pm" }}
      role="pm"
      backHref={`/pm/projects/${projectId}`}
    />
  );
}
