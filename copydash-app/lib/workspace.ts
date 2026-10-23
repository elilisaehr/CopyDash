// Server-side workspace context: which agency workspace the signed-in user
// acts in, their role there, and the plan's limits. See migration 0007.

import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanLimits, Workspace, WorkspaceRole } from "@/lib/supabase/types";

export interface WorkspaceContext {
  workspace: Workspace;
  role: WorkspaceRole;
  limits: PlanLimits;
}

/** The user's workspace (admin memberships first), or null if they have none yet. */
export const getWorkspaceContext = cache(async (supabase: SupabaseClient, userId: string): Promise<WorkspaceContext | null> => {
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role, workspace:workspaces(*)")
    .eq("user_id", userId)
    .order("role", { ascending: true }) // 'admin' < 'editor'
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const workspace = membership?.workspace as unknown as Workspace | null;
  if (!membership || !workspace) return null;

  const { data: limits } = await supabase.from("plan_limits").select("*").eq("plan", workspace.plan).maybeSingle();
  return {
    workspace,
    role: membership.role as WorkspaceRole,
    limits: (limits as PlanLimits | null) ?? { plan: workspace.plan, max_projects: null, max_pages_per_project: null, max_members: null },
  };
});

/** For admin-only routes: editors are sent back to the dashboard. */
export async function requireAdmin(supabase: SupabaseClient, userId: string): Promise<WorkspaceContext> {
  const ctx = await getWorkspaceContext(supabase, userId);
  if (!ctx) redirect("/onboarding");
  if (ctx.role !== "admin") redirect("/pm");
  return ctx;
}
