import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { getWorkspaceContext } from "@/lib/workspace";
import { HelpSupportScreen, type HelpContact } from "@/components/screens/help-support-screen";

export default async function HelpPage() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/login");

  // People in a workspace see the CopyDash Support card; a contributor sees
  // the admin of their project.
  if (await getWorkspaceContext(supabase, user.id)) return <HelpSupportScreen audience="team" />;

  const { data: project } = await supabase.from("projects").select("pm_id").limit(1).maybeSingle();
  let contact: HelpContact | null = null;
  if (project?.pm_id) {
    // "profiles: member reads their project's pm" RLS policy allows this read.
    const { data: admin } = await supabase.from("profiles").select("name, email").eq("id", project.pm_id).maybeSingle();
    if (admin) contact = admin as HelpContact;
  }
  return <HelpSupportScreen audience="contributor" contact={contact} />;
}
