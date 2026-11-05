"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Btn, FieldInput, Spinner } from "@/components/ui/primitives";
import { AuthShell } from "@/components/ui/auth-shell";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <AuthShell>
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em",  color: "#09090b", fontFamily: "var(--font-sans)" }}>Welcome back</h2>
            <p style={{ margin: 0, fontSize: 14, color: "#71717b" }}>Sign in to your CopyDash account</p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <FieldInput label="Email" value={email} onChange={setEmail} placeholder="you@company.com" type="email" />
            <FieldInput label="Password" value={password} onChange={setPassword} placeholder="••••••••" type="password" />

            {error && (
              <div style={{ padding: "10px 12px", background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#e7000b", fontFamily: "var(--font-body)" }}>
                {error}
              </div>
            )}

            <Btn type="submit" variant="primary" size="md" fullWidth disabled={loading || !email || !password}>
              {loading ? (
                <>
                  <Spinner size={14} color="#fff" /> Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </Btn>
          </form>

          <p style={{ textAlign: "center", fontSize: 13, color: "#71717b", marginTop: 24 }}>
            Don&rsquo;t have an account? <Link href="/signup" style={{ color: "#7f22fe", fontWeight: 500 }}>Sign up</Link>
          </p>
    </AuthShell>
  );
}
