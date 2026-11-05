import "server-only";

// Everything the signed-in person can see, with their role on each project.
// RLS decides which projects come back: their workspace's for an admin, and
// any project they were invited to, including in someone else's workspace.

import type { SupabaseClient } from "@supabase/supabase-js";
import { projectStatus } from "@/lib/review";
import type { ProjectRole } from "@/lib/roles";
import type { PageStatus, Project } from "@/lib/supabase/types";

/** `status` is derived from the pages (lib/review.ts projectStatus), not the legacy column. */
export interface ProjectWithStats extends Omit<Project, "status"> {
  status: PageStatus;
  myRole: ProjectRole;
  pageCount: number;
  completedPageCount: number;
  /** Pages waiting for this person's review. Always 0 on a project they only contribute to. */
  toReviewCount: number;
  /** Pages waiting for this person's edits. Only on a project they contribute to. */
  yourTurnCount: number;
}

type ProjectRow = Project & { pages: { status: PageStatus }[] };

export async function getMyProjects(supabase: SupabaseClient, userId: string): Promise<ProjectWithStats[]> {
  const [{ data: rows }, { data: workspaces }, { data: memberships }] = await Promise.all([
    supabase
      .from("projects")
      .select("*, pages(status)")
      .is("archived_at", null)
      .is("pages.archived_at", null)
      .order("updated_at", { ascending: false }),
    supabase.from("workspace_members").select("workspace_id").eq("user_id", userId).eq("role", "admin"),
    supabase.from("project_members").select("project_id, role").eq("user_id", userId),
  ]);
  const adminOf = new Set((workspaces ?? []).map((w) => w.workspace_id as string));
  const roleOn = new Map((memberships ?? []).map((m) => [m.project_id as string, m.role as ProjectRole]));

  return ((rows ?? []) as ProjectRow[]).map(({ pages, ...rest }) => {
    const isAdmin = rest.pm_id === userId || (!!rest.workspace_id && adminOf.has(rest.workspace_id));
    const myRole: ProjectRole = isAdmin ? "admin" : (roleOn.get(rest.id) ?? "client");
    return {
      ...rest,
      myRole,
      status: projectStatus(pages),
      pageCount: pages.length,
      completedPageCount: pages.filter((p) => p.status === "Completed").length,
      toReviewCount: myRole === "client" ? 0 : pages.filter((p) => p.status === "Pending Review").length,
      yourTurnCount: myRole === "client" ? pages.filter((p) => p.status === "In Progress").length : 0,
    };
  });
}
