"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Btn, FieldInput, Spinner } from "@/components/ui/primitives";
import { AuthShell } from "@/components/ui/auth-shell";
import { acceptInvitation, createAccountAndAccept, signInAndAccept, type AcceptState } from "@/app/invite/[token]/actions";
import type { InvitationRole } from "@/lib/supabase/types";

export type InviteMode = "create" | "signin" | "accept" | "mismatch" | "invalid";

const ROLE_LINE: Record<InvitationRole, string> = {
  admin: "as an admin of the workspace",
  editor: "as an editor on their projects",
  client: "as a contributor, to review and fill in the website copy",
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
    <AuthShell>
          {mode === "invalid" ? (
            <div>
              <h2 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em",  color: "#09090b", fontFamily: "var(--font-sans)" }}>This invitation can&rsquo;t be used</h2>
              <p style={{ margin: "0 0 24px", fontSize: 14, color: "#71717b", lineHeight: 1.6 }}>
                It has already been accepted, or it was cancelled. Ask for a new one — or sign in if you already joined.
              </p>
              <Link href="/login" style={{ color: "#7f22fe", fontSize: 14, fontWeight: 500 }}>
                Go to sign in
              </Link>
            </div>
          ) : (
            <>
              <h2 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em",  color: "#09090b", fontFamily: "var(--font-sans)" }}>Join {workspaceName}</h2>
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
    </AuthShell>
  );
}
