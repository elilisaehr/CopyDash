import { createClient } from "@/lib/supabase/server";
import { getProfile, getUser } from "@/lib/auth";
import { getWorkspaceContext } from "@/lib/workspace";
import { SettingsScreen, TEAM_NOTIF_DEFAULTS, type TeamNotifPrefs, type TeamData } from "@/components/screens/settings-screen";
import { ContributorSettingsScreen, CONTRIBUTOR_NOTIF_DEFAULTS, type ContributorNotifPrefs } from "@/components/screens/contributor-settings-screen";
import type { Profile, BrandingSettings, FigmaConnection, Invitation, Project, Page, WorkspaceMember } from "@/lib/supabase/types";

export default async function SettingsPage() {
  const supabase = await createClient();
  // The layout already redirects signed-out users, and guarantees a profile.
  const user = (await getUser())!;
  const [profile, ctx] = (await Promise.all([getProfile(), getWorkspaceContext(supabase, user.id)])) as [Profile, Awaited<ReturnType<typeof getWorkspaceContext>>];

  // Not in any workspace: a contributor. Account and notifications only.
  if (!ctx) {
    const [{ data: notifRow }, { data: project }] = await Promise.all([
      supabase.from("notification_prefs").select("prefs").eq("user_id", user.id).maybeSingle(),
      supabase.from("projects").select("name").is("archived_at", null).limit(1).maybeSingle(),
    ]);
    const prefs: ContributorNotifPrefs = { ...CONTRIBUTOR_NOTIF_DEFAULTS, ...(notifRow?.prefs || {}) };
    return <ContributorSettingsScreen profile={profile} notifPrefs={prefs} project={project as { name: string } | null} />;
  }
  const isAdmin = ctx.role === "admin";

  const [
    { data: notifRow },
    { data: branding },
    { data: figmaConnection },
    { data: archivedProjects },
    { data: archivedPages },
    { data: members },
    { data: invitations },
    { data: activeProjects },
  ] = await Promise.all([
    supabase.from("notification_prefs").select("prefs").eq("user_id", profile.id).maybeSingle(),
    supabase.from("branding_settings").select("*").eq("pm_id", profile.id).maybeSingle(),
    supabase.from("figma_connections").select("*").eq("pm_id", profile.id).maybeSingle(),
    supabase.from("projects").select("*").eq("workspace_id", ctx.workspace.id).not("archived_at", "is", null).order("archived_at", { ascending: false }),
    supabase.from("pages").select("*, project:projects(name)").not("archived_at", "is", null).order("archived_at", { ascending: false }),
    supabase.from("workspace_members").select("*").eq("workspace_id", ctx.workspace.id).order("created_at", { ascending: true }),
    // RLS: only admins can read invitations, so editors simply get none.
    supabase.from("invitations").select("*").eq("workspace_id", ctx.workspace.id).is("accepted_at", null).order("created_at", { ascending: false }),
    supabase.from("projects").select("id, name").eq("workspace_id", ctx.workspace.id).is("archived_at", null).order("name", { ascending: true }),
  ]);

  // Second wave: names of the team, and which projects each editor works on.
  const memberIds = ((members ?? []) as WorkspaceMember[]).map((m) => m.user_id);
  const projectIds = (activeProjects ?? []).map((p) => p.id as string);
  const [{ data: memberProfiles }, { data: editorLinks }] = await Promise.all([
    memberIds.length ? supabase.from("profiles").select("id, name, email, avatar_url").in("id", memberIds) : Promise.resolve({ data: [] }),
    projectIds.length && isAdmin
      ? supabase.from("project_members").select("user_id, project_id").eq("role", "editor").in("project_id", projectIds)
      : Promise.resolve({ data: [] }),
  ]);

  const team: TeamData = {
    ownerId: ctx.workspace.owner_id,
    members: ((members ?? []) as WorkspaceMember[]).map((m) => {
      const p = (memberProfiles ?? []).find((x) => x.id === m.user_id) as Pick<Profile, "name" | "email" | "avatar_url"> | undefined;
      return {
        userId: m.user_id,
        role: m.role,
        name: p?.name || p?.email || "Team member",
        email: p?.email || "",
        avatarUrl: p?.avatar_url ?? null,
        projectIds: (editorLinks ?? []).filter((l) => l.user_id === m.user_id).map((l) => l.project_id as string),
      };
    }),
    invitations: (invitations as Invitation[]) || [],
    projects: (activeProjects ?? []) as { id: string; name: string }[],
  };

  const notifPrefs: TeamNotifPrefs = { ...TEAM_NOTIF_DEFAULTS, ...(notifRow?.prefs || {}) };

  return (
    <SettingsScreen
      profile={profile}
      notifPrefs={notifPrefs}
      team={team}
      branding={branding as BrandingSettings | null}
      figmaConnection={figmaConnection as FigmaConnection | null}
      archivedProjects={(archivedProjects as Project[]) || []}
      archivedPages={(archivedPages as (Page & { project: { name: string } | null })[]) || []}
      isAdmin={isAdmin}
    />
  );
}
