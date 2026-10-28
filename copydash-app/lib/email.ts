import "server-only";

// Transactional email through Resend's REST API (no SDK needed).
// Until a sending domain is verified in Resend, `onboarding@resend.dev` can
// only deliver to the Resend account owner's own address — every other
// recipient is refused, so callers must treat sending as best-effort.

const FROM = process.env.RESEND_FROM || "CopyDash <onboarding@resend.dev>";

export type SendResult = { ok: true } | { ok: false; error: string };

export async function sendEmail({ to, subject, html, text }: { to: string; subject: string; html: string; text: string }): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "Email sending is not configured." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, error: body?.message || `Email provider error (${res.status}).` };
  } catch {
    return { ok: false, error: "Could not reach the email provider." };
  }
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// One card layout for every email: a sentence (bold name first), a button, the raw link, a footer.
function layout({ who, sentence, button, url, footer }: { who: string; sentence: string; button: string; url: string; footer: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Inter,Arial,sans-serif;color:#09090b">
<div style="max-width:480px;margin:40px auto;background:#fff;border:1px solid #e4e4e7;border-radius:14px;padding:32px">
  <div style="font-size:18px;font-weight:700;margin-bottom:24px">CopyDash</div>
  <p style="font-size:15px;line-height:1.6;margin:0 0 24px"><strong>${escape(who)}</strong> ${escape(sentence)}</p>
  <a href="${escape(url)}" style="display:inline-block;background:#7f22fe;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:8px">${escape(button)}</a>
  <p style="font-size:12px;color:#71717b;line-height:1.6;margin:24px 0 0">Or paste this link into your browser:<br><span style="word-break:break-all">${escape(url)}</span></p>
  <p style="font-size:12px;color:#a1a1aa;margin:24px 0 0">${escape(footer)}</p>
</div></body></html>`;
}

export function invitationEmail({ inviterName, workspaceName, role, url }: { inviterName: string; workspaceName: string; role: string; url: string }) {
  const what =
    role === "client"
      ? `to review and fill in the copy for your website with ${workspaceName}`
      : `to join ${workspaceName} on CopyDash as ${role === "admin" ? "an admin" : "an editor"}`;
  const footer = "If you weren't expecting this, you can ignore this email.";
  const subject = `${inviterName} invited you to CopyDash`;
  const text = `${inviterName} invited you ${what}.\n\nAccept the invitation: ${url}\n\n${footer}`;
  const html = layout({ who: inviterName, sentence: `invited you ${what}.`, button: "Accept invitation", url, footer });
  return { subject, html, text };
}

export type ReviewEvent = "sent" | "sent_back" | "submitted" | "approved";

/** "It's your turn" email after a page changes hands (see lib/actions/review.ts). */
export function reviewEmail({ event, actorName, pageName, projectName, url }: { event: ReviewEvent; actorName: string; pageName: string; projectName: string; url: string }) {
  const page = `the ${pageName} page of ${projectName}`;
  const { sentence, subject, button } = {
    sent: { sentence: `sent you ${page} to fill in. It's your turn.`, subject: `Your turn: ${pageName} — ${projectName}`, button: "Open the page" },
    sent_back: { sentence: `sent ${page} back to you with changes to look at. It's your turn.`, subject: `Back to you: ${pageName} — ${projectName}`, button: "See what changed" },
    submitted: { sentence: `submitted ${page} for review. It's your turn.`, subject: `Pending review: ${pageName} — ${projectName}`, button: "Review the page" },
    approved: { sentence: `marked ${page} as completed. Nothing more to do on it.`, subject: `Completed: ${pageName} — ${projectName}`, button: "View the page" },
  }[event];
  const footer = "You get this email because you work on this project in CopyDash. You can turn it off in Settings → Notifications.";
  const text = `${actorName} ${sentence}\n\n${button}: ${url}\n\n${footer}`;
  return { subject, html: layout({ who: actorName, sentence, button, url, footer }), text };
}
