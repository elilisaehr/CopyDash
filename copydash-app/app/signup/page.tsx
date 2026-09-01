"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/ui/icon";
import { Btn, FieldInput, Spinner } from "@/components/ui/primitives";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = React.useState({ name: "", email: "", password: "", role: "pm" as "pm" | "client" });
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
    router.push(form.role === "client" ? "/client" : "/pm");
    router.refresh();
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#fff", fontFamily: "var(--font-body)" }}>
      <div style={{ width: "45%", background: "#09090b", display: "flex", flexDirection: "column", padding: "40px 48px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "url(/assets/auth-bg.png)", backgroundSize: "cover", backgroundPosition: "center", opacity: 0.18 }} />
        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#7f22fe", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="gallery-vertical-end" size={18} color="#fff" />
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#fff", fontFamily: "var(--font-sans)" }}>CopyDash</span>
        </div>
        <div style={{ position: "relative", zIndex: 1, marginTop: "auto" }}>
          <p style={{ fontSize: 18, color: "#fff", lineHeight: 1.6, margin: "0 0 8px", fontFamily: "var(--font-sans)" }}>
            Collect content from clients.
            <br />
            Deliver to developers. Effortlessly.
          </p>
          <p style={{ fontSize: 13, color: "#71717b", margin: 0 }}>Join agencies and freelancers managing content with CopyDash.</p>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <Link href="/login" style={{ display: "flex", alignItems: "center", gap: 6, color: "#71717b", fontSize: 13, marginBottom: 24, textDecoration: "none" }}>
            <Icon name="arrow-left" size={14} color="#71717b" /> Back to login
          </Link>

          {checkEmail ? (
            <div>
              <h2 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 700, color: "#09090b", fontFamily: "var(--font-sans)" }}>Check your email</h2>
              <p style={{ margin: 0, fontSize: 14, color: "#71717b", lineHeight: 1.6 }}>
                We sent a confirmation link to <strong>{form.email}</strong>. Click it to activate your account, then come back and sign in.
              </p>
              <Btn variant="outline" fullWidth style={{ marginTop: 20 }} onClick={() => router.push("/login")}>
                Back to login
              </Btn>
            </div>
          ) : (
            <>
              <h2 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 700, color: "#09090b", fontFamily: "var(--font-sans)" }}>Create account</h2>
              <p style={{ margin: "0 0 28px", fontSize: 14, color: "#71717b" }}>Get started with CopyDash for free</p>
              <div style={{ display: "flex", background: "#f4f4f5", borderRadius: 10, padding: 4, marginBottom: 24, gap: 4 }}>
                {[
                  { id: "pm" as const, label: "Project Manager" },
                  { id: "client" as const, label: "Client" },
                ].map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => update("role", r.id)}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "none",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 500,
                      fontFamily: "var(--font-sans)",
                      background: form.role === r.id ? "#fff" : "transparent",
                      color: form.role === r.id ? "#09090b" : "#71717b",
                      boxShadow: form.role === r.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                      transition: "all 0.15s",
                    }}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <FieldInput label="Full name" value={form.name} onChange={(v) => update("name", v)} placeholder="Alex Martin" />
                <FieldInput label="Email" value={form.email} onChange={(v) => update("email", v)} placeholder="you@company.com" type="email" />
                <FieldInput label="Password" value={form.password} onChange={(v) => update("password", v)} placeholder="Create a password (min 6 characters)" type="password" />
                {error && (
                  <div style={{ padding: "10px 12px", background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#e7000b" }}>{error}</div>
                )}
                <Btn type="submit" variant="primary" size="md" fullWidth disabled={loading || !form.name || !form.email || form.password.length < 6} style={{ marginTop: 4 }}>
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
        </div>
      </div>
    </div>
  );
}
