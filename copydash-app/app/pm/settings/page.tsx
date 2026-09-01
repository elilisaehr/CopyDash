import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/auth";
import { PmSettingsScreen, PM_NOTIF_DEFAULTS, type PmNotifPrefs } from "@/components/screens/pm-settings-screen";
import type { TeamInvitation, BrandingSettings } from "@/lib/supabase/types";

export default async function PmSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // app/pm/layout.tsx already redirects unauthenticated users (and
  // non-PMs) before this page ever renders, so `user` is guaranteed here.
  const profile = await ensureProfile(supabase, user!);

  const [{ data: notifRow }, { data: team }, { data: branding }] = await Promise.all([
    supabase.from("notification_prefs").select("prefs").eq("user_id", profile.id).maybeSingle(),
    supabase.from("team_invitations").select("*").eq("pm_id", profile.id).order("invited_at", { ascending: false }),
    supabase.from("branding_settings").select("*").eq("pm_id", profile.id).maybeSingle(),
  ]);

  const notifPrefs: PmNotifPrefs = { ...PM_NOTIF_DEFAULTS, ...(notifRow?.prefs || {}) };

  return (
    <PmSettingsScreen
      profile={profile}
      notifPrefs={notifPrefs}
      teamMembers={(team as TeamInvitation[]) || []}
      branding={branding as BrandingSettings | null}
    />
  );
}
