import { createClient } from "@/lib/supabase/server";
import { getProfile, getUser } from "@/lib/auth";
import { getWorkspaceContext, type WorkspaceContext } from "@/lib/workspace";
import { PmSettingsScreen, PM_NOTIF_DEFAULTS, type PmNotifPrefs } from "@/components/screens/pm-settings-screen";
import type { Profile, TeamInvitation, BrandingSettings, FigmaConnection, Project, Page } from "@/lib/supabase/types";

export default async function PmSettingsPage() {
  const supabase = await createClient();
  // app/pm/layout.tsx already redirects unauthenticated users (and
  // non-PMs) before this page ever renders, so `user` is guaranteed here.
  const user = (await getUser())!;
  // The layout also guarantees a profile and a workspace.
  const [profile, ctx] = (await Promise.all([getProfile(), getWorkspaceContext(supabase, user.id)])) as [Profile, WorkspaceContext];

  const [{ data: notifRow }, { data: team }, { data: branding }, { data: figmaConnection }, { data: archivedProjects }, { data: archivedPages }] =
    await Promise.all([
      supabase.from("notification_prefs").select("prefs").eq("user_id", profile.id).maybeSingle(),
      supabase.from("team_invitations").select("*").eq("pm_id", profile.id).order("invited_at", { ascending: false }),
      supabase.from("branding_settings").select("*").eq("pm_id", profile.id).maybeSingle(),
      supabase.from("figma_connections").select("*").eq("pm_id", profile.id).maybeSingle(),
      supabase.from("projects").select("*").eq("workspace_id", ctx.workspace.id).not("archived_at", "is", null).order("archived_at", { ascending: false }),
      supabase.from("pages").select("*, project:projects(name)").not("archived_at", "is", null).order("archived_at", { ascending: false }),
    ]);

  const notifPrefs: PmNotifPrefs = { ...PM_NOTIF_DEFAULTS, ...(notifRow?.prefs || {}) };

  return (
    <PmSettingsScreen
      profile={profile}
      notifPrefs={notifPrefs}
      teamMembers={(team as TeamInvitation[]) || []}
      branding={branding as BrandingSettings | null}
      figmaConnection={figmaConnection as FigmaConnection | null}
      archivedProjects={(archivedProjects as Project[]) || []}
      archivedPages={(archivedPages as (Page & { project: { name: string } | null })[]) || []}
      isAdmin={ctx.role === "admin"}
    />
  );
}
