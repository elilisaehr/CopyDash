// What people see for each role. The stored value 'client' is displayed as
// "Contributor" everywhere: renaming it in the database would break the
// deployed code during a release, and nobody ever sees the stored value.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvitationRole } from "@/lib/supabase/types";

/** A person's role on one project (migration 0009, project_role()). */
export type ProjectRole = InvitationRole;

export const ROLE_LABEL: Record<InvitationRole, string> = { admin: "Admin", editor: "Editor", client: "Contributor" };

export const ROLE_HELP: Record<InvitationRole, string> = {
  admin: "Manages everything: projects, people and settings.",
  editor: "Adds, removes and edits pages in the projects they're on, and can invite contributors to them.",
  client: "Edits the copy on the pages of their projects when it's their turn. Creates nothing.",
};

/** The signed-in person's role on a project, or null if they have no access to it. */
export async function getProjectRole(supabase: SupabaseClient, projectId: string): Promise<ProjectRole | null> {
  const { data } = await supabase.rpc("project_role", { p_project_id: projectId });
  return (data as ProjectRole | null) ?? null;
}

/** Admins and editors run a project; contributors only work on its copy. */
export const managesProject = (role: ProjectRole | null) => role === "admin" || role === "editor";

/** What the editors need to know: full control, or copy only. */
export const editorRole = (role: ProjectRole) => (role === "client" ? ("client" as const) : ("pm" as const));
