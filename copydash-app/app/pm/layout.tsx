import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getUser } from "@/lib/auth";
import { getWorkspaceContext } from "@/lib/workspace";
import { PLAN_LABEL } from "@/lib/plan";
import { AppLayout } from "@/components/ui/primitives";
import { Sidebar } from "@/components/ui/sidebar";

export default async function PmLayout({ children }: LayoutProps<"/pm">) {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/login");

  // Agency accounts work inside a workspace; a brand-new account sets one up first.
  const [profile, ctx] = await Promise.all([getProfile(), getWorkspaceContext(supabase, user.id)]);
  if (!profile || profile.role !== "pm") redirect("/client");
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
