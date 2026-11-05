import "server-only";

// Sends an invitation email and builds its link. Deliberately not in a
// "use server" file: everything exported from those can be called from a browser.

import { invitationEmail, sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import type { Invitation } from "@/lib/supabase/types";

export type InviteResult =
  // link is empty when this viewer isn't allowed to see it.
  | { ok: true; link: string; emailSent: boolean; emailError?: string }
  | { ok: false; error: string };

export async function inviteLink(token: string) {
  return `${await siteUrl()}/invite/${token}`;
}

export async function deliverInvitation(
  inv: Pick<Invitation, "email" | "role" | "token">,
  { workspaceName, inviterName, send = true }: { workspaceName: string; inviterName: string; send?: boolean },
): Promise<InviteResult> {
  const link = await inviteLink(inv.token);
  if (!send) return { ok: true, link, emailSent: false };
  const { subject, html, text } = invitationEmail({ inviterName, workspaceName, role: inv.role, url: link });
  const sent = await sendEmail({ to: inv.email, subject, html, text });
  return sent.ok ? { ok: true, link, emailSent: true } : { ok: true, link, emailSent: false, emailError: sent.error };
}
