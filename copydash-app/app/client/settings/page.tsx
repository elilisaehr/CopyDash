import { createClient } from "@/lib/supabase/server";
import { getProfile, getUser } from "@/lib/auth";
import { ClientSettingsScreen, CLIENT_NOTIF_DEFAULTS, type ClientNotifPrefs } from "@/components/screens/client-settings-screen";

export default async function ClientSettingsPage() {
  const supabase = await createClient();
  // app/client/layout.tsx already redirects unauthenticated users (and
  // non-clients) before this page ever renders, so `user` is guaranteed here.
  const user = (await getUser())!;

  const [profile, { data: notifRow }, { data: project }] = await Promise.all([
    getProfile(),
    supabase.from("notification_prefs").select("prefs").eq("user_id", user.id).maybeSingle(),
    // RLS scopes this to only the project(s) this client is a member of via `project_members`.
    supabase.from("projects").select("name").limit(1).maybeSingle(),
  ]);

  const notifPrefs: ClientNotifPrefs = { ...CLIENT_NOTIF_DEFAULTS, ...(notifRow?.prefs || {}) };

  return <ClientSettingsScreen profile={profile!} notifPrefs={notifPrefs} project={project as { name: string } | null} />;
}
