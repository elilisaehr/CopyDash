"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Btn, Card, FieldInput, SelectInput, Avatar, Badge, PageHeader, Toggle } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/client";
import type { Profile, TeamInvitation, BrandingSettings, TeamRole, FigmaConnection } from "@/lib/supabase/types";

// SectionTitle isn't in the shared primitives — ported here as a tiny local helper.
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: "#71717b",
        fontFamily: "var(--font-sans)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

const TABS = [
  { id: "account", label: "Account", icon: "user" },
  { id: "notifications", label: "Notifications", icon: "bell" },
  { id: "team", label: "Team", icon: "users" },
  { id: "branding", label: "Branding", icon: "zap" },
  { id: "integrations", label: "Integrations", icon: "link" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export type PmNotifPrefs = {
  clientUpdates: boolean;
  comments: boolean;
  projectComplete: boolean;
  weeklyReport: boolean;
};

export const PM_NOTIF_DEFAULTS: PmNotifPrefs = {
  clientUpdates: true,
  comments: true,
  projectComplete: true,
  weeklyReport: false,
};

function TabNavButton({ id, label, icon, active, onClick }: { id: string; label: string; icon: string; active: boolean; onClick: () => void }) {
  const [hov, setHov] = React.useState(false);
  return (
    <button
      key={id}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px",
        borderRadius: 8,
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "var(--font-sans)",
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        background: active ? "#f5f3ff" : hov ? "#f4f4f5" : "transparent",
        color: active ? "#7f22fe" : "#71717b",
        transition: "all 0.12s",
      }}
    >
      <Icon name={icon} size={15} color={active ? "#7f22fe" : "#71717b"} />
      {label}
    </button>
  );
}

export function PmSettingsScreen({
  profile,
  notifPrefs,
  teamMembers,
  branding,
  figmaConnection,
}: {
  profile: Profile;
  notifPrefs: PmNotifPrefs;
  teamMembers: TeamInvitation[];
  branding: BrandingSettings | null;
  figmaConnection: FigmaConnection | null;
}) {
  const [tab, setTab] = React.useState<TabId>("account");

  return (
    <>
      <PageHeader title="Settings" subtitle="Manage your account and workspace preferences" />

      <div style={{ flex: 1, overflowY: "auto", padding: "32px 48px" }}>
        <div style={{ display: "flex", gap: 32, maxWidth: 900 }}>
          {/* Left: Tab nav */}
          <div style={{ width: 200, flexShrink: 0 }}>
            <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {TABS.map((t) => (
                <TabNavButton key={t.id} id={t.id} label={t.label} icon={t.icon} active={tab === t.id} onClick={() => setTab(t.id)} />
              ))}
            </nav>
          </div>

          {/* Right: Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {tab === "account" && <AccountTab profile={profile} />}
            {tab === "notifications" && <NotificationsTab userId={profile.id} initial={notifPrefs} />}
            {tab === "team" && <TeamTab pmId={profile.id} initial={teamMembers} />}
            {tab === "branding" && <BrandingTab pmId={profile.id} initial={branding} />}
            {tab === "integrations" && <IntegrationsTab initial={figmaConnection} />}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Account ──────────────────────────────────────────────────────
function AccountTab({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [form, setForm] = React.useState({
    name: profile.name || "",
    email: profile.email || "",
    company: profile.company || "",
    phone: profile.phone || "",
  });
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const handleSave = async () => {
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from("profiles")
      .update({ name: form.name, email: form.email, company: form.company, phone: form.phone })
      .eq("id", profile.id);
    setSaving(false);
    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <SectionTitle>Profile</SectionTitle>
      <Card style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, paddingBottom: 24, borderBottom: "1px solid #f4f4f5" }}>
          <Avatar name={form.name} size={56} src={profile.avatar_url} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)" }}>{form.name}</div>
            <div style={{ fontSize: 13, color: "#71717b", fontFamily: "var(--font-body)", marginTop: 2 }}>{form.email}</div>
            <Btn variant="outline" size="sm" style={{ marginTop: 8 }}>
              Change avatar
            </Btn>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <FieldInput label="Full Name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Your name" />
            <FieldInput label="Email" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} placeholder="you@company.com" type="email" />
          </div>
          <FieldInput label="Company / Agency" value={form.company} onChange={(v) => setForm((f) => ({ ...f, company: v }))} placeholder="Agency Studio" />
        </div>
      </Card>

      <SectionTitle>Security</SectionTitle>
      <Card style={{ marginBottom: 24 }}>
        {/* Cosmetic only — no real password-change flow wired up (out of scope; Supabase Auth password update would go here). */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <FieldInput label="Current Password" value="" onChange={() => {}} placeholder="••••••••" type="password" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <FieldInput label="New Password" value="" onChange={() => {}} placeholder="••••••••" type="password" />
            <FieldInput label="Confirm Password" value="" onChange={() => {}} placeholder="••••••••" type="password" />
          </div>
          <Btn variant="outline" size="sm" style={{ alignSelf: "flex-start" }}>
            Update password
          </Btn>
        </div>
      </Card>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Btn variant="primary" onClick={handleSave} disabled={saving} icon={saved ? "check" : undefined}>
          {saved ? "Saved!" : saving ? "Saving…" : "Save changes"}
        </Btn>
        {saved && <span style={{ fontSize: 13, color: "#15803d", fontFamily: "var(--font-body)" }}>Changes saved successfully.</span>}
      </div>

      <div style={{ marginTop: 40, paddingTop: 24, borderTop: "1px solid #f4f4f5" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#e7000b", fontFamily: "var(--font-sans)", marginBottom: 8 }}>Danger Zone</div>
        <div style={{ fontSize: 13, color: "#71717b", fontFamily: "var(--font-body)", marginBottom: 12 }}>
          Permanently delete your account and all associated data.
        </div>
        <Btn variant="destructive" size="sm">
          Delete account
        </Btn>
      </div>
    </div>
  );
}

// ── Notifications ────────────────────────────────────────────────
const NOTIF_ITEMS: { key: keyof PmNotifPrefs; label: string; desc: string }[] = [
  { key: "clientUpdates", label: "Client content updates", desc: "When a client fills in or edits a field" },
  { key: "comments", label: "New comments", desc: "When someone adds a comment to a field" },
  { key: "projectComplete", label: "Project completed", desc: "When all pages reach 100% completion" },
  { key: "weeklyReport", label: "Weekly summary report", desc: "A digest of all project activity this week" },
];

function NotificationsTab({ userId, initial }: { userId: string; initial: PmNotifPrefs }) {
  const [notifs, setNotifs] = React.useState<PmNotifPrefs>(initial);

  const handleToggle = async (key: keyof PmNotifPrefs) => {
    const updated = { ...notifs, [key]: !notifs[key] };
    setNotifs(updated);
    const supabase = createClient();
    await supabase.from("notification_prefs").upsert({ user_id: userId, prefs: updated }, { onConflict: "user_id" });
  };

  return (
    <div>
      <SectionTitle>Email Notifications</SectionTitle>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {NOTIF_ITEMS.map((item, i) => (
            <div
              key={item.key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 0",
                borderBottom: i < NOTIF_ITEMS.length - 1 ? "1px solid #f4f4f5" : "none",
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#09090b", fontFamily: "var(--font-sans)" }}>{item.label}</div>
                <div style={{ fontSize: 12, color: "#71717b", fontFamily: "var(--font-body)", marginTop: 2 }}>{item.desc}</div>
              </div>
              <Toggle value={notifs[item.key]} onChange={() => handleToggle(item.key)} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Team ─────────────────────────────────────────────────────────
function TeamTab({ pmId, initial }: { pmId: string; initial: TeamInvitation[] }) {
  const [teamMembers, setTeamMembers] = React.useState<TeamInvitation[]>(initial);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<TeamRole>("Editor");
  const [inviteSent, setInviteSent] = React.useState(false);
  const [inviting, setInviting] = React.useState(false);

  const handleInvite = async () => {
    if (!inviteEmail) return;
    setInviting(true);
    const supabase = createClient();
    // No real invitation email is sent — this only records the invite row.
    const { data, error } = await supabase
      .from("team_invitations")
      .insert({ pm_id: pmId, email: inviteEmail, role: inviteRole, status: "Pending" })
      .select("*")
      .single();
    setInviting(false);
    if (!error && data) {
      setTeamMembers((m) => [data as TeamInvitation, ...m]);
      setInviteEmail("");
      setInviteSent(true);
      setTimeout(() => setInviteSent(false), 3000);
    }
  };

  return (
    <div>
      <SectionTitle>Team Members</SectionTitle>
      <Card style={{ marginBottom: 20 }}>
        {teamMembers.length === 0 ? (
          <div style={{ fontSize: 13, color: "#a1a1aa", fontFamily: "var(--font-body)", padding: "8px 0" }}>No team members invited yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {teamMembers.map((m, i) => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 0",
                  borderBottom: i < teamMembers.length - 1 ? "1px solid #f4f4f5" : "none",
                }}
              >
                <Avatar name={m.email} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "#09090b", fontFamily: "var(--font-sans)" }}>{m.email}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Badge color={m.status === "Pending" ? "#fff7ed" : "#f0fdf4"}>
                    <span style={{ color: m.status === "Pending" ? "#c2410c" : "#15803d" }}>{m.status}</span>
                  </Badge>
                  <span style={{ fontSize: 12, color: "#71717b", fontFamily: "var(--font-sans)", background: "#f4f4f5", padding: "3px 8px", borderRadius: 6 }}>{m.role}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <SectionTitle>Invite Member</SectionTitle>
      <Card>
        {inviteSent && (
          <div style={{ marginBottom: 16, padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="check-circle" size={14} color="#15803d" />
            <span style={{ fontSize: 13, color: "#15803d", fontFamily: "var(--font-body)" }}>Invitation sent!</span>
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <FieldInput label="Email address" value={inviteEmail} onChange={setInviteEmail} placeholder="colleague@agency.co" type="email" />
          </div>
          <div style={{ width: 140, paddingTop: 20 }}>
            <SelectInput
              value={inviteRole}
              onChange={(v) => setInviteRole(v as TeamRole)}
              options={(["Admin", "Editor", "Viewer"] as TeamRole[]).map((r) => ({ value: r, label: r }))}
            />
          </div>
        </div>
        <Btn variant="primary" size="sm" icon="send" onClick={handleInvite} disabled={!inviteEmail || inviting} style={{ marginTop: 12 }}>
          Send invitation
        </Btn>
      </Card>
    </div>
  );
}

// ── Branding ─────────────────────────────────────────────────────
const BRAND_COLORS = ["#7f22fe", "#0369a1", "#15803d", "#b45309", "#be123c", "#0891b2"];

function BrandingTab({ pmId, initial }: { pmId: string; initial: BrandingSettings | null }) {
  const [form, setForm] = React.useState({
    agency_name: initial?.agency_name || "Agency Studio",
    brand_color: initial?.brand_color || "#7f22fe",
    welcome_message: initial?.welcome_message || "Welcome! Please fill in the content for your website pages below.",
  });
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const handleSave = async () => {
    setSaving(true);
    const supabase = createClient();
    await supabase.from("branding_settings").upsert({ pm_id: pmId, ...form }, { onConflict: "pm_id" });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <SectionTitle>Client Portal Branding</SectionTitle>
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: "#09090b", fontFamily: "var(--font-sans)", display: "block", marginBottom: 8 }}>Agency Name</label>
            <input
              value={form.agency_name}
              onChange={(e) => setForm((f) => ({ ...f, agency_name: e.target.value }))}
              style={{
                height: 36,
                padding: "0 12px",
                borderRadius: 8,
                border: "1px solid #e4e4e7",
                fontSize: 14,
                fontFamily: "var(--font-body)",
                color: "#09090b",
                background: "#fff",
                outline: "none",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: "#09090b", fontFamily: "var(--font-sans)", display: "block", marginBottom: 8 }}>Brand Color</label>
            <div style={{ display: "flex", gap: 8 }}>
              {BRAND_COLORS.map((c) => (
                <div
                  key={c}
                  onClick={() => setForm((f) => ({ ...f, brand_color: c }))}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: c,
                    cursor: "pointer",
                    border: c === form.brand_color ? "3px solid #09090b" : "2px solid transparent",
                    boxSizing: "border-box",
                  }}
                />
              ))}
              <input
                type="color"
                value={form.brand_color}
                onChange={(e) => setForm((f) => ({ ...f, brand_color: e.target.value }))}
                style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #e4e4e7", cursor: "pointer", padding: 0 }}
              />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: "#09090b", fontFamily: "var(--font-sans)", display: "block", marginBottom: 8 }}>Portal Welcome Message</label>
            <textarea
              value={form.welcome_message}
              onChange={(e) => setForm((f) => ({ ...f, welcome_message: e.target.value }))}
              rows={3}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #e4e4e7",
                fontSize: 14,
                fontFamily: "var(--font-body)",
                color: "#09090b",
                background: "#fff",
                outline: "none",
                width: "100%",
                boxSizing: "border-box",
                resize: "vertical",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Btn variant="primary" size="sm" onClick={handleSave} disabled={saving} style={{ alignSelf: "flex-start" }}>
              {saved ? "Saved!" : saving ? "Saving…" : "Save branding"}
            </Btn>
            {saved && <span style={{ fontSize: 13, color: "#15803d", fontFamily: "var(--font-body)" }}>Branding saved.</span>}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── Integrations (Figma) ─────────────────────────────────────────
function IntegrationsTab({ initial }: { initial: FigmaConnection | null }) {
  const router = useRouter();
  const [connection, setConnection] = React.useState(initial);
  const [token, setToken] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleConnect = async () => {
    if (!token.trim()) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/figma/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token.trim() }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Connexion impossible.");
      return;
    }
    setConnection({ pm_id: "", access_token: "", figma_user_name: data.name, figma_user_email: data.email, connected_at: new Date().toISOString() });
    setToken("");
    router.refresh();
  };

  const handleDisconnect = async () => {
    setLoading(true);
    await fetch("/api/figma/connect", { method: "DELETE" });
    setLoading(false);
    setConnection(null);
    router.refresh();
  };

  return (
    <div>
      <SectionTitle>Figma</SectionTitle>
      <Card>
        {connection ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "#f0fdf4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name="check-circle" size={18} color="#15803d" />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)" }}>Connecté à Figma</div>
                <div style={{ fontSize: 12, color: "#71717b", fontFamily: "var(--font-body)" }}>
                  {connection.figma_user_name}
                  {connection.figma_user_email ? ` · ${connection.figma_user_email}` : ""}
                </div>
              </div>
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#71717b", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
              Vous pouvez maintenant importer des cadres Figma directement lors de la création d&rsquo;une page — pas besoin d&rsquo;exporter en PDF.
            </p>
            <Btn variant="outline" size="sm" onClick={handleDisconnect} disabled={loading}>
              {loading ? "…" : "Déconnecter"}
            </Btn>
          </div>
        ) : (
          <div>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#71717b", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
              Connectez votre compte Figma pour importer des maquettes directement, sans passer par un export PDF. Vous avez besoin d&rsquo;un{" "}
              <a href="https://www.figma.com/developers/api#access-tokens" target="_blank" rel="noreferrer" style={{ color: "#7f22fe" }}>
                jeton d&rsquo;accès personnel Figma
              </a>{" "}
              (Figma → Settings → Security → Personal access tokens → Generate new token).
            </p>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <FieldInput label="Jeton d'accès Figma" value={token} onChange={setToken} placeholder="figd_…" type="password" />
              </div>
              <Btn variant="primary" size="sm" onClick={handleConnect} disabled={loading || !token.trim()}>
                {loading ? "Vérification…" : "Connecter"}
              </Btn>
            </div>
            {error && <div style={{ marginTop: 10, fontSize: 13, color: "#e7000b", fontFamily: "var(--font-body)" }}>{error}</div>}
          </div>
        )}
      </Card>
    </div>
  );
}
