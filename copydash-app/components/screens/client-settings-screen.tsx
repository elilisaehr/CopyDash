"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Btn, Card, FieldInput, SelectInput, Avatar, PageHeader, Toggle } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/supabase/types";

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
] as const;

type TabId = (typeof TABS)[number]["id"];

export type ClientNotifPrefs = {
  pageReady: boolean;
  commentReply: boolean;
  reviewResult: boolean;
  deadline: boolean;
  weekly: boolean;
};

export const CLIENT_NOTIF_DEFAULTS: ClientNotifPrefs = {
  pageReady: true,
  commentReply: true,
  reviewResult: true,
  deadline: true,
  weekly: false,
};

const LANGUAGES = ["English", "Français", "Español", "Deutsch"];

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

export function ClientSettingsScreen({
  profile,
  notifPrefs,
  project,
}: {
  profile: Profile;
  notifPrefs: ClientNotifPrefs;
  project: { name: string } | null;
}) {
  const [tab, setTab] = React.useState<TabId>("account");

  return (
    <>
      <PageHeader title="Settings" subtitle="Manage your profile and notification preferences" />

      <div style={{ flex: 1, overflowY: "auto", padding: "32px 48px" }}>
        <div style={{ display: "flex", gap: 32, maxWidth: 820 }}>
          {/* Tab nav */}
          <div style={{ width: 200, flexShrink: 0 }}>
            <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {TABS.map((t) => (
                <TabNavButton key={t.id} id={t.id} label={t.label} icon={t.icon} active={tab === t.id} onClick={() => setTab(t.id)} />
              ))}
            </nav>
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {tab === "account" && <AccountTab profile={profile} project={project} />}
            {tab === "notifications" && <NotificationsTab userId={profile.id} initial={notifPrefs} />}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Account ──────────────────────────────────────────────────────
function AccountTab({ profile, project }: { profile: Profile; project: { name: string } | null }) {
  const router = useRouter();
  const [form, setForm] = React.useState({
    name: profile.name || "",
    email: profile.email || "",
    phone: profile.phone || "",
    language: profile.language || "English",
  });
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const handleSave = async () => {
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from("profiles")
      .update({ name: form.name, email: form.email, phone: form.phone, language: form.language })
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
            {project && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8, background: "#f5f3ff", borderRadius: 6, padding: "3px 8px" }}>
                <Icon name="folder-open" size={12} color="#7f22fe" />
                <span style={{ fontSize: 12, color: "#7f22fe", fontFamily: "var(--font-sans)", fontWeight: 500 }}>{project.name}</span>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <FieldInput label="Full Name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Your name" />
            <FieldInput label="Email" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} placeholder="you@company.com" type="email" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <FieldInput label="Phone (optional)" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} placeholder="+1 555 000 0000" />
            <SelectInput
              label="Language"
              value={form.language}
              onChange={(v) => setForm((f) => ({ ...f, language: v }))}
              options={LANGUAGES.map((l) => ({ value: l, label: l }))}
            />
          </div>
        </div>
      </Card>

      <SectionTitle>Password</SectionTitle>
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
    </div>
  );
}

// ── Notifications ────────────────────────────────────────────────
const NOTIF_ITEMS: { key: keyof ClientNotifPrefs; label: string; desc: string }[] = [
  { key: "pageReady", label: "Page ready for you", desc: "When your agency assigns a page for you to fill in" },
  { key: "commentReply", label: "Comment replies", desc: "When someone replies to a comment on your content" },
  { key: "reviewResult", label: "Review results", desc: "When your submitted content is approved or needs changes" },
  { key: "deadline", label: "Deadline reminders", desc: "Reminders before a page is due" },
  { key: "weekly", label: "Weekly summary", desc: "A weekly recap of what still needs your input" },
];

function NotificationsTab({ userId, initial }: { userId: string; initial: ClientNotifPrefs }) {
  const [notifs, setNotifs] = React.useState<ClientNotifPrefs>(initial);

  const toggleNotif = async (key: keyof ClientNotifPrefs) => {
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
              <div style={{ paddingRight: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: "#09090b", fontFamily: "var(--font-sans)" }}>{item.label}</div>
                <div style={{ fontSize: 12, color: "#71717b", fontFamily: "var(--font-body)", marginTop: 2 }}>{item.desc}</div>
              </div>
              <Toggle value={notifs[item.key]} onChange={() => toggleNotif(item.key)} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
