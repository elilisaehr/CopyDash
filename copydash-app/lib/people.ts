import "server-only";

// Who is on a project, for its People tab. Only admins and editors get here,
// and never contributors. Read with the service role because editors can't
// read other people's memberships or the invitations table: invitation links
// stay secret, and this returns no token.

import { createAdminClient } from "@/lib/supabase/server";
import type { ProjectRole } from "@/lib/roles";
import type { Invitation } from "@/lib/supabase/types";

export interface ProjectPerson {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: ProjectRole;
  /** Admins come with the workspace, so they can't be removed from one project. */
  removable: boolean;
}

export interface ProjectInvite {
  id: string;
  email: string;
  role: ProjectRole;
  createdAt: string;
  /** Can this viewer resend or cancel it? Editors only act on contributor invitations. */
  manageable: boolean;
  /** Can this viewer see its link? Never when it also opens projects they aren't on. */
  linkVisible: boolean;
}

export interface ProjectPeople {
  people: ProjectPerson[];
  invitations: ProjectInvite[];
}

const ORDER: Record<ProjectRole, number> = { admin: 0, editor: 1, client: 2 };

/** Is this invitation's link safe to show to this viewer? */
export function canSeeInviteLink(viewerRole: ProjectRole, inv: Pick<Invitation, "role" | "project_ids">, viewerProjectIds: string[]) {
  if (viewerRole === "admin") return true;
  return inv.role === "client" && inv.project_ids.every((id) => viewerProjectIds.includes(id));
}

export async function editorProjectIds(userId: string): Promise<string[]> {
  const { data } = await createAdminClient().from("project_members").select("project_id").eq("user_id", userId).eq("role", "editor");
  return (data ?? []).map((m) => m.project_id as string);
}

export async function getProjectPeople(
  project: { id: string; pm_id: string; workspace_id: string | null },
  viewer: { id: string; role: ProjectRole },
): Promise<ProjectPeople> {
  const service = createAdminClient();
  const [{ data: members }, { data: admins }, { data: invitations }, viewerProjects] = await Promise.all([
    service.from("project_members").select("user_id, role").eq("project_id", project.id),
    project.workspace_id
      ? service.from("workspace_members").select("user_id").eq("workspace_id", project.workspace_id).eq("role", "admin")
      : Promise.resolve({ data: [] as { user_id: string }[] }),
    project.workspace_id
      ? service.from("invitations").select("*").eq("workspace_id", project.workspace_id).is("accepted_at", null).contains("project_ids", [project.id]).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Invitation[] }),
    viewer.role === "admin" ? Promise.resolve([]) : editorProjectIds(viewer.id),
  ]);

  const roles = new Map<string, ProjectRole>();
  for (const m of members ?? []) roles.set(m.user_id as string, m.role as ProjectRole);
  // Set last: being an admin wins over a project membership.
  for (const a of admins ?? []) roles.set(a.user_id as string, "admin");
  roles.set(project.pm_id, "admin");

  const ids = [...roles.keys()];
  const { data: profiles } = await service.from("profiles").select("id, name, email, avatar_url").in("id", ids);

  const people = (profiles ?? [])
    .map((p): ProjectPerson => {
      const role = roles.get(p.id as string)!;
      return {
        userId: p.id as string,
        name: (p.name as string) || (p.email as string),
        email: p.email as string,
        avatarUrl: (p.avatar_url as string | null) ?? null,
        role,
        removable: role !== "admin" && p.id !== viewer.id && (viewer.role === "admin" || role === "client"),
      };
    })
    .sort((a, b) => ORDER[a.role] - ORDER[b.role] || a.name.localeCompare(b.name));

  return {
    people,
    invitations: ((invitations ?? []) as Invitation[]).map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      createdAt: inv.created_at,
      manageable: viewer.role === "admin" || inv.role === "client",
      linkVisible: canSeeInviteLink(viewer.role, inv, viewerProjects),
    })),
  };
}
