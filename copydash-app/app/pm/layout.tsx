import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/auth";
import { AppLayout } from "@/components/ui/primitives";
import { Sidebar } from "@/components/ui/sidebar";

export default async function PmLayout({ children }: LayoutProps<"/pm">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await ensureProfile(supabase, user);
  if (profile.role !== "pm") redirect("/client");

  return (
    <AppLayout sidebar={<Sidebar user={{ name: profile.name, email: profile.email, avatar_url: profile.avatar_url }} role="pm" />}>
      {children}
    </AppLayout>
  );
}
