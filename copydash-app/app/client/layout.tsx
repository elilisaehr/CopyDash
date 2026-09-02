import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/auth";
import { AppLayout } from "@/components/ui/primitives";
import { Sidebar } from "@/components/ui/sidebar";

export default async function ClientLayout({ children }: LayoutProps<"/client">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await ensureProfile(supabase, user);
  if (profile.role !== "client") redirect("/pm");

  const { data: project } = await supabase.from("projects").select("name").is("archived_at", null).limit(1).maybeSingle();

  return (
    <AppLayout
      sidebar={
        <Sidebar
          user={{ name: profile.name, email: profile.email, avatar_url: profile.avatar_url, project: project?.name }}
          role="client"
        />
      }
    >
      {children}
    </AppLayout>
  );
}
