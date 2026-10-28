import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getUser } from "@/lib/auth";
import { AppLayout } from "@/components/ui/primitives";
import { Sidebar } from "@/components/ui/sidebar";

export default async function ClientLayout({ children }: LayoutProps<"/client">) {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/login");

  // RLS limits the project read to the client's own projects, so it can run alongside the profile check.
  const [profile, { data: project }] = await Promise.all([
    getProfile(),
    supabase.from("projects").select("name").is("archived_at", null).limit(1).maybeSingle(),
  ]);
  if (!profile || profile.role !== "client") redirect("/pm");

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
