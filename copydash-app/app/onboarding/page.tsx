import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getUser } from "@/lib/auth";
import { getWorkspaceContext } from "@/lib/workspace";
import { OnboardingScreen } from "@/components/screens/onboarding-screen";

// First-login wizard for agency accounts: workspace → first project → first
// page. Someone who already has a workspace with projects is done here;
// someone who left after step 1 resumes at step 2.
export default async function OnboardingPage() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/login");

  const [profile, ctx] = await Promise.all([getProfile(), getWorkspaceContext(supabase, user.id)]);
  if (!profile || profile.role !== "pm") redirect("/client");
  if (ctx) {
    if (ctx.role !== "admin") redirect("/pm");
    const { count } = await supabase.from("projects").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id);
    if ((count ?? 0) > 0) redirect("/pm");
  }

  const firstName = (profile.name || user.email || "").split(/[ @]/)[0];
  return (
    <OnboardingScreen
      userId={user.id}
      firstName={firstName}
      suggestedWorkspaceName={profile.company || (firstName ? `${firstName}'s studio` : "")}
      existingWorkspaceId={ctx?.workspace.id ?? null}
    />
  );
}
