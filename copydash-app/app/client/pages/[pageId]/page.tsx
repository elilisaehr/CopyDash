import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";

// Old address of a page, used in emails already sent. RLS decides whether the
// signed-in person can see the page.
export default async function LegacyPageEditor({ params }: PageProps<"/client/pages/[pageId]">) {
  const { pageId } = await params;
  if (!(await getUser())) redirect("/login");
  const supabase = await createClient();
  const { data: page } = await supabase.from("pages").select("project_id").eq("id", pageId).maybeSingle();
  if (!page) notFound();
  redirect(`/projects/${page.project_id}/pages/${pageId}`);
}
