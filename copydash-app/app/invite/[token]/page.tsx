import { createAdminClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { InviteScreen, type InviteMode } from "@/components/screens/invite-screen";
import type { Invitation } from "@/lib/supabase/types";

// Public landing page of an invitation link. Reads the invitation with the
// service role (the visitor has no access to it yet); the token is the secret.
export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const service = createAdminClient();

  const [{ data: row }, user] = await Promise.all([
    service.from("invitations").select("*, workspace:workspaces(name)").eq("token", token).maybeSingle(),
    getUser(),
  ]);
  const inv = row as (Invitation & { workspace: { name: string } | null }) | null;

  if (!inv || inv.accepted_at) {
    return <InviteScreen mode="invalid" token={token} email="" workspaceName="" inviterName="" role="client" />;
  }

  const [{ data: inviter }, { data: existing }] = await Promise.all([
    inv.invited_by ? service.from("profiles").select("name").eq("id", inv.invited_by).maybeSingle() : Promise.resolve({ data: null }),
    service.from("profiles").select("id").ilike("email", inv.email).limit(1).maybeSingle(),
  ]);

  let mode: InviteMode;
  if (user) mode = (user.email || "").toLowerCase() === inv.email.toLowerCase() ? "accept" : "mismatch";
  else mode = existing ? "signin" : "create";

  return (
    <InviteScreen
      mode={mode}
      token={token}
      email={inv.email}
      signedInEmail={user?.email ?? undefined}
      workspaceName={inv.workspace?.name ?? "an agency"}
      inviterName={(inviter as { name: string } | null)?.name || "Someone"}
      role={inv.role}
    />
  );
}
