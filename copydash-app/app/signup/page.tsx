"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/ui/icon";
import { Btn, FieldInput, Spinner } from "@/components/ui/primitives";
import { AuthShell } from "@/components/ui/auth-shell";

export default function SignupPage() {
  const router = useRouter();
  // Signing up starts a new workspace. Everyone else joins through an invitation link (/invite/[token]).
  const [form, setForm] = React.useState({ name: "", email: "", password: "", role: "pm" as const });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [checkEmail, setCheckEmail] = React.useState(false);

  const update = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { role: form.role, name: form.name } },
    });
    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    if (!data.session) {
      // Email confirmation is required before a session exists.
      setCheckEmail(true);
      return;
    }
    // Auto-confirmed: create the profile row now and continue in.
    await supabase.from("profiles").upsert({ id: data.user!.id, role: form.role, name: form.name, email: form.email });
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <AuthShell>
          <Link href="/login" style={{ display: "flex", alignItems: "center", gap: 6, color: "#71717b", fontSize: 13, marginBottom: 24, textDecoration: "none" }}>
            <Icon name="arrow-left" size={14} color="#71717b" /> Back to login
          </Link>

          {checkEmail ? (
            <div>
              <h2 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em",  color: "#09090b", fontFamily: "var(--font-sans)" }}>Check your email</h2>
              <p style={{ margin: 0, fontSize: 14, color: "#71717b", lineHeight: 1.6 }}>
                We sent a confirmation link to <strong>{form.email}</strong>. Click it to activate your account, then come back and sign in.
              </p>
              <Btn variant="outline" fullWidth style={{ marginTop: 20 }} onClick={() => router.push("/login")}>
                Back to login
              </Btn>
            </div>
          ) : (
            <>
              <h2 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em",  color: "#09090b", fontFamily: "var(--font-sans)" }}>Create your account</h2>
              <p style={{ margin: "0 0 12px", fontSize: 14, color: "#71717b" }}>Get started with CopyDash for free</p>
              <p style={{ margin: "0 0 24px", fontSize: 13, color: "#71717b", lineHeight: 1.6, padding: "10px 12px", background: "#fafafa", border: "1px solid #f4f4f5", borderRadius: 8 }}>
                Invited to a project? Open the link in your invitation email instead — it sets up your access.
              </p>
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <FieldInput label="Full name" value={form.name} onChange={(v) => update("name", v)} placeholder="Alex Martin" />
                <FieldInput label="Email" value={form.email} onChange={(v) => update("email", v)} placeholder="you@company.com" type="email" />
                <FieldInput label="Password" value={form.password} onChange={(v) => update("password", v)} placeholder="At least 8 characters" type="password" />
                {error && (
                  <div style={{ padding: "10px 12px", background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#e7000b" }}>{error}</div>
                )}
                <Btn type="submit" variant="primary" size="md" fullWidth disabled={loading || !form.name || !form.email || form.password.length < 8} style={{ marginTop: 4 }}>
                  {loading ? (
                    <>
                      <Spinner size={14} color="#fff" /> Creating account...
                    </>
                  ) : (
                    "Create account"
                  )}
                </Btn>
              </form>
              <p style={{ textAlign: "center", fontSize: 12, color: "#a1a1aa", marginTop: 20, lineHeight: 1.6 }}>
                By clicking continue, you agree to our Terms of Service and Privacy Policy.
              </p>
            </>
          )}
    </AuthShell>
  );
}
