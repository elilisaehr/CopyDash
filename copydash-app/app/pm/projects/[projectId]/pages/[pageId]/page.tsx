import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/auth";
import { EditorRouter } from "@/components/screens/editor-router";
import type { Field, Page, Project } from "@/lib/supabase/types";

export default async function PmPageEditorPage({
  params,
}: PageProps<"/pm/projects/[projectId]/pages/[pageId]">) {
  const { projectId, pageId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const profile = await ensureProfile(supabase, user);

  const { data: project } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (!project) notFound();

  const { data: page } = await supabase.from("pages").select("*").eq("id", pageId).eq("project_id", projectId).maybeSingle();
  if (!page) notFound();

  const { data: fields } = await supabase.from("fields").select("*").eq("page_id", pageId).order("position");

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
