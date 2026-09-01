import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateProjectScreen, type CreateProjectClient } from "@/components/screens/create-project-screen";

export default async function NewProjectPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: clientsRaw } = await supabase
    .from("clients")
    .select("id, name, client_emails(address, is_primary)")
    .order("name", { ascending: true });

  const clients: CreateProjectClient[] = (clientsRaw ?? []).map((c) => {
    const emails = (c.client_emails ?? []) as { address: string; is_primary: boolean }[];
    const primary = emails.find((e) => e.is_primary) ?? emails[0];
    return { id: c.id as string, name: c.name as string, email: primary?.address ?? "" };
  });

  return <CreateProjectScreen clients={clients} />;
}
