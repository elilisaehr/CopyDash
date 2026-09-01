import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/auth";
import { EditorRouter } from "@/components/screens/editor-router";
import type { Field, Page, Project } from "@/lib/supabase/types";

export default async function ClientPageEditorPage({ params }: PageProps<"/client/pages/[pageId]">) {
  const { pageId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const profile = await ensureProfile(supabase, user);

  // RLS ("pages: member read") already scopes this to pages in projects
  // the signed-in client is a member of.
  const { data: page } = await supabase.from("pages").select("*").eq("id", pageId).maybeSingle();
  if (!page) notFound();

  const { data: project } = await supabase.from("projects").select("*").eq("id", page.project_id).maybeSingle();
  if (!project) notFound();

  const { data: fields } = await supabase.from("fields").select("*").eq("page_id", pageId).order("position");

  return (
    <EditorRouter
      project={project as Project}
      page={page as Page}
      fields={(fields as Field[]) || []}
      user={{ id: profile.id, name: profile.name, role: "client" }}
      role="client"
      backHref="/client"
    />
  );
}
