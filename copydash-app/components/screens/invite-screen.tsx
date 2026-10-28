"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/ui/icon";
import { Btn, FieldInput, Spinner } from "@/components/ui/primitives";
import { AuthVisual } from "@/components/ui/auth-visual";
import { acceptInvitation, createAccountAndAccept, signInAndAccept, type AcceptState } from "@/app/invite/[token]/actions";
import type { InvitationRole } from "@/lib/supabase/types";

export type InviteMode = "create" | "signin" | "accept" | "mismatch" | "invalid";

const ROLE_LINE: Record<InvitationRole, string> = {
  admin: "as an admin of the workspace",
  editor: "as an editor on their projects",
  client: "to review and fill in your website copy",
};

export function InviteScreen({
  mode,
  token,
  email,
  signedInEmail,
  workspaceName,
  inviterName,
  role,
}: {
  mode: InviteMode;
  token: string;
  email: string;
  signedInEmail?: string;
  workspaceName: string;
  inviterName: string;
  role: InvitationRole;
}) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  // Actions redirect on success, so only an error ever comes back.
  const run = (action: () => Promise<AcceptState>) =>
    startTransition(async () => {
      setError(null);
      const res = await action();
      if (res?.error) setError(res.error);
    });

  const signOut = async () => {
    await createClient().auth.signOut();
    router.refresh();
  };

  const busy = (label: string) => (
    <>
      <Spinner size={14} color="#fff" /> {label}
    </>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#fff", fontFamily: "var(--font-body)" }}>
      <div style={{ width: "45%", background: "#09090b", display: "flex", flexDirection: "column", padding: "40px 48px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#7f22fe", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="gallery-vertical-end" size={18} color="#fff" />
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#fff", fontFamily: "var(--font-sans)" }}>CopyDash</span>
        </div>
        <AuthVisual />
        <div style={{ position: "relative", zIndex: 1 }}>
          <p style={{ fontSize: 18, color: "#fff", lineHeight: 1.6, margin: 0, fontFamily: "var(--font-sans)" }}>
            Edit website copy right on the real page design.
          </p>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          {mode === "invalid" ? (
            <div>
              <h2 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 700, color: "#09090b", fontFamily: "var(--font-sans)" }}>This invitation can&rsquo;t be used</h2>
              <p style={{ margin: "0 0 24px", fontSize: 14, color: "#71717b", lineHeight: 1.6 }}>
                It has already been accepted, or the agency cancelled it. Ask them to send you a new one — or sign in if you already joined.
              </p>
              <Link href="/login" style={{ color: "#7f22fe", fontSize: 14, fontWeight: 500 }}>
                Go to sign in
              </Link>
            </div>
          ) : (
            <>
              <h2 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 700, color: "#09090b", fontFamily: "var(--font-sans)" }}>Join {workspaceName}</h2>
              <p style={{ margin: "0 0 28px", fontSize: 14, color: "#71717b", lineHeight: 1.6 }}>
                {inviterName} invited <strong style={{ color: "#09090b" }}>{email}</strong> {ROLE_LINE[role]}.
              </p>

              {mode === "accept" && (
                <Btn variant="primary" size="md" fullWidth disabled={pending} onClick={() => run(() => acceptInvitation(token))}>
                  {pending ? busy("Joining…") : "Accept invitation"}
                </Btn>
              )}

              {mode === "mismatch" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <p style={{ margin: 0, fontSize: 13, color: "#09090b", lineHeight: 1.6 }}>
                    You&rsquo;re signed in as <strong>{signedInEmail}</strong>. Sign out to accept this invitation with {email}.
                  </p>
                  <Btn variant="outline" size="md" fullWidth onClick={signOut}>
                    Sign out
                  </Btn>
                </div>
              )}

              {mode === "create" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(() => createAccountAndAccept(token, name, password));
                  }}
                  style={{ display: "flex", flexDirection: "column", gap: 14 }}
                >
                  <FieldInput label="Email" value={email} onChange={() => {}} disabled />
                  <FieldInput label="Full name" value={name} onChange={setName} placeholder="Your name" />
                  <FieldInput label="Password" value={password} onChange={setPassword} placeholder="At least 8 characters" type="password" />
                  <Btn type="submit" variant="primary" size="md" fullWidth disabled={pending || !name.trim() || password.length < 8} style={{ marginTop: 4 }}>
                    {pending ? busy("Creating your account…") : "Create account and join"}
                  </Btn>
                </form>
              )}

              {mode === "signin" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(() => signInAndAccept(token, password));
                  }}
                  style={{ display: "flex", flexDirection: "column", gap: 14 }}
                >
                  <p style={{ margin: 0, fontSize: 13, color: "#71717b" }}>You already have a CopyDash account — sign in to accept.</p>
                  <FieldInput label="Email" value={email} onChange={() => {}} disabled />
                  <FieldInput label="Password" value={password} onChange={setPassword} placeholder="••••••••" type="password" />
                  <Btn type="submit" variant="primary" size="md" fullWidth disabled={pending || !password} style={{ marginTop: 4 }}>
                    {pending ? busy("Signing in…") : "Sign in and join"}
                  </Btn>
                </form>
              )}

              {error && (
                <div style={{ marginTop: 16, padding: "10px 12px", background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#e7000b" }}>{error}</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
