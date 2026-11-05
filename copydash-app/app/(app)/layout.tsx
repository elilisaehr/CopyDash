import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getUser } from "@/lib/auth";
import { getWorkspaceContext } from "@/lib/workspace";
import { PLAN_LABEL } from "@/lib/plan";
import { AppLayout } from "@/components/ui/primitives";
import { Sidebar } from "@/components/ui/sidebar";

// The one protected space: everyone gets the same routes, and each screen
// adapts to the person's role. No middleware, on purpose (see CLAUDE.md).
export default async function AppSpaceLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/login");

  const [profile, ctx] = await Promise.all([getProfile(), getWorkspaceContext(supabase, user.id)]);
  if (!profile) redirect("/login");

  // Someone who signed up themselves sets up a workspace first, unless they
  // were invited to a project. Invited contributors never see the wizard.
  if (!ctx && profile.role === "pm") {
    const { count } = await supabase.from("project_members").select("project_id", { count: "exact", head: true }).eq("user_id", user.id);
    if (!count) redirect("/onboarding");
  }

  return (
    <AppLayout
      sidebar={
        <Sidebar
          user={{ name: profile.name, email: profile.email, avatar_url: profile.avatar_url }}
          workspace={ctx ? { name: ctx.workspace.name, role: ctx.role, planLabel: PLAN_LABEL[ctx.workspace.plan] ?? ctx.workspace.plan } : undefined}
        />
      }
    >
      {children}
    </AppLayout>
  );
}
