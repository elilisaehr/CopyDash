import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { EditorRouter } from "@/components/screens/editor-router";
import type { Field, Page, Project } from "@/lib/supabase/types";

export default async function ClientPageEditorPage({ params }: PageProps<"/client/pages/[pageId]">) {
  const { pageId } = await params;
  const supabase = await createClient();

  // RLS ("pages: member read") already scopes this to pages in projects
  // the signed-in client is a member of. The project comes along in the same request.
  const [profile, { data: row }, { data: fields }] = await Promise.all([
    getProfile(),
    supabase.from("pages").select("*, project:projects(*)").eq("id", pageId).maybeSingle(),
    supabase.from("fields").select("*").eq("page_id", pageId).order("position"),
  ]);
  if (!profile) redirect("/login");
  if (!row) notFound();

  const { project, ...page } = row as Page & { project: Project | null };
  if (!project) notFound();

  return (
    <EditorRouter
      project={project}
      page={page as Page}
      fields={(fields as Field[]) || []}
      user={{ id: profile.id, name: profile.name, role: "client" }}
      role="client"
      backHref="/client"
    />
  );
}
