import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, UserRole } from "./supabase/types";

/**
 * Ensures a `profiles` row exists for the signed-in user. Supabase auth
 * accounts are created independently of our `profiles` table; the role and
 * display name chosen at signup are stashed in `user_metadata` and copied
 * into `profiles` here the first time we see the user (works whether or
 * not email confirmation delayed the first real session).
 */
export async function ensureProfile(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> },
): Promise<Profile> {
  const { data: existing } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (existing) return existing as Profile;

  const role: UserRole = user.user_metadata?.role === "client" ? "client" : "pm";
  const name = (user.user_metadata?.name as string) || user.email?.split("@")[0] || "User";

  const { data: created, error } = await supabase
    .from("profiles")
    .insert({ id: user.id, role, name, email: user.email || "" })
    .select("*")
    .single();

  if (error) throw error;
  return created as Profile;
}
