import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/auth";
import { ClientSettingsScreen, CLIENT_NOTIF_DEFAULTS, type ClientNotifPrefs } from "@/components/screens/client-settings-screen";

export default async function ClientSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // app/client/layout.tsx already redirects unauthenticated users (and
  // non-clients) before this page ever renders, so `user` is guaranteed here.
  const profile = await ensureProfile(supabase, user!);

  const [{ data: notifRow }, { data: project }] = await Promise.all([
    supabase.from("notification_prefs").select("prefs").eq("user_id", profile.id).maybeSingle(),
    // RLS scopes this to only the project(s) this client is a member of via `project_members`.
    supabase.from("projects").select("name").limit(1).maybeSingle(),
  ]);

  const notifPrefs: ClientNotifPrefs = { ...CLIENT_NOTIF_DEFAULTS, ...(notifRow?.prefs || {}) };

  return <ClientSettingsScreen profile={profile} notifPrefs={notifPrefs} project={project as { name: string } | null} />;
}
