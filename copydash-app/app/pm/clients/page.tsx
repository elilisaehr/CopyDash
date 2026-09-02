import { createClient } from "@/lib/supabase/server";
import { ClientsScreen } from "@/components/screens/clients-screen";

export default async function ClientsPage() {
  const supabase = await createClient();

  // RLS ("clients: pm full access" / "client_emails: pm full access" /
  // "projects: pm full access") already scopes every one of these to the
  // signed-in PM, so no explicit pm_id filter is needed here.
  const [{ data: clients }, { data: clientEmails }, { data: projects }] = await Promise.all([
    supabase.from("clients").select("*").order("created_at", { ascending: false }),
    supabase.from("client_emails").select("*"),
    supabase.from("projects").select("id, client_id, name, status").is("archived_at", null),
  ]);

  return (
    <ClientsScreen
      initialClients={clients ?? []}
      initialClientEmails={clientEmails ?? []}
      projects={projects ?? []}
    />
  );
}
