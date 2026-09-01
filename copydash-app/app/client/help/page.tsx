import { createClient } from "@/lib/supabase/server";
import { HelpSupportScreen, type HelpContact } from "@/components/screens/help-support-screen";

export default async function ClientHelpPage() {
  const supabase = await createClient();

  // RLS scopes this to only the project(s) this client is a member of via `project_members`.
  const { data: project } = await supabase.from("projects").select("pm_id").limit(1).maybeSingle();

  let contact: HelpContact | null = null;
  if (project?.pm_id) {
    // "profiles: member reads their project's pm" RLS policy allows this read.
    const { data: pm } = await supabase.from("profiles").select("name, email").eq("id", project.pm_id).maybeSingle();
    if (pm) contact = pm as HelpContact;
  }

  return <HelpSupportScreen role="client" contact={contact} />;
}
