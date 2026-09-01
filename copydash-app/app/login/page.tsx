"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/ui/icon";
import { Avatar, Btn, FieldInput, Spinner } from "@/components/ui/primitives";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState<"pm" | "client">("pm");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    const actualRole = data.user?.user_metadata?.role === "client" ? "client" : "pm";
    router.push(actualRole === "client" ? "/client" : "/pm");
    router.refresh();
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#fff", fontFamily: "var(--font-body)" }}>
      {/* Left panel */}
      <div style={{ width: "45%", background: "#09090b", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "40px 48px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "url(/assets/auth-bg.png)", backgroundSize: "cover", backgroundPosition: "center", opacity: 0.18 }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "#7f22fe", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="gallery-vertical-end" size={18} color="#fff" />
            </div>
            <span style={{ fontSize: 18, fontWeight: 700, color: "#fff", fontFamily: "var(--font-sans)" }}>CopyDash</span>
          </div>
        </div>
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ width: 40, height: 2, background: "#7f22fe", marginBottom: 20, borderRadius: 1 }} />
          <p style={{ fontSize: 20, color: "#fff", lineHeight: 1.6, margin: "0 0 24px", fontFamily: "var(--font-sans)", fontWeight: 400 }}>
            &ldquo;CopyDash transformed how we collect content from clients. What used to take weeks now takes days.&rdquo;
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar name="Sofia Davis" size={36} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", fontFamily: "var(--font-sans)" }}>Sofia Davis</div>
              <div style={{ fontSize: 12, color: "#a1a1aa", fontFamily: "var(--font-body)" }}>Creative Director, Studio Nord</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 700, color: "#09090b", fontFamily: "var(--font-sans)" }}>Welcome back</h2>
            <p style={{ margin: 0, fontSize: 14, color: "#71717b" }}>Sign in to your CopyDash account</p>
          </div>

          <div style={{ display: "flex", background: "#f4f4f5", borderRadius: 10, padding: 4, marginBottom: 28, gap: 4 }}>
            {[
              { id: "pm" as const, label: "Project Manager" },
              { id: "client" as const, label: "Client" },
            ].map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRole(r.id)}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 500,
                  fontFamily: "var(--font-sans)",
                  background: role === r.id ? "#fff" : "transparent",
                  color: role === r.id ? "#09090b" : "#71717b",
                  boxShadow: role === r.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  transition: "all 0.15s",
                }}
              >
                {r.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <FieldInput label="Email" value={email} onChange={setEmail} placeholder={role === "pm" ? "alex@agency.co" : "sarah@acmecorp.com"} type="email" />
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
        </div>
      </div>
    </div>
  );
}
