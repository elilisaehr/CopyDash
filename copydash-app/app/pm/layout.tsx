import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/auth";
import { getWorkspaceContext } from "@/lib/workspace";
import { PLAN_LABEL } from "@/lib/plan";
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

  // Agency accounts work inside a workspace; a brand-new account sets one up first.
  const ctx = await getWorkspaceContext(supabase, user.id);
  if (!ctx) redirect("/onboarding");

  return (
    <AppLayout
      sidebar={
        <Sidebar
          user={{ name: profile.name, email: profile.email, avatar_url: profile.avatar_url }}
          role="pm"
          workspace={{ name: ctx.workspace.name, role: ctx.role, planLabel: PLAN_LABEL[ctx.workspace.plan] ?? ctx.workspace.plan }}
        />
      }
    >
      {children}
    </AppLayout>
  );
}
