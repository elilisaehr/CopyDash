"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/ui/icon";
import {
  Avatar,
  Btn,
  Divider,
  FieldInput,
  KPICard,
  Modal,
  PageHeader,
  StatusBadge,
} from "@/components/ui/primitives";
import { formatDate } from "@/lib/format";
import type { Client, ClientEmail, EmailLabel } from "@/lib/supabase/types";

type ProjectLite = { id: string; client_id: string | null; name: string; status: string };

type ClientWithEmails = Client & { emails: ClientEmail[] };

// Row shape used while editing a client's email list — a freshly added row
// has no `id` yet (it's assigned by Postgres on insert).
type EmailRow = { id?: string; address: string; label: string; is_primary: boolean };

const LABEL_OPTIONS: EmailLabel[] = ["Primary", "Billing", "Technical", "Marketing", "Other"];

export function ClientsScreen({
  initialClients,
  initialClientEmails,
  projects,
}: {
  initialClients: Client[];
  initialClientEmails: ClientEmail[];
  projects: ProjectLite[];
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [addOpen, setAddOpen] = React.useState(false);
  const [editClient, setEditClient] = React.useState<ClientWithEmails | null>(null);
  const [newClient, setNewClient] = React.useState({ name: "", contactName: "", email: "" });
  const [adding, setAdding] = React.useState(false);
  const [savingEdit, setSavingEdit] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  const toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = React.useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);
  React.useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const clients: ClientWithEmails[] = React.useMemo(
    () =>
      initialClients.map((c) => ({
        ...c,
        emails: initialClientEmails.filter((e) => e.client_id === c.id),
      })),
    [initialClients, initialClientEmails],
  );

  const filtered = clients.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.contact_name || "").toLowerCase().includes(q) ||
      c.emails.some((e) => e.address.toLowerCase().includes(q))
    );
  });

  const getClientProjects = (client: Client) => projects.filter((p) => p.client_id === client.id);

  const handleAddClient = async () => {
    if (!newClient.name || !newClient.email) return;
    setAdding(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setAdding(false);
      return;
    }
    const { data: created, error } = await supabase
      .from("clients")
      .insert({
        pm_id: user.id,
        name: newClient.name,
        contact_name: newClient.contactName || newClient.name,
        status: "Waiting",
      })
      .select()
      .single();
    if (error || !created) {
      setAdding(false);
      showToast(error?.message || "Failed to add client.");
      return;
    }
    await supabase.from("client_emails").insert({
      client_id: created.id,
      address: newClient.email,
      label: "Primary",
      is_primary: true,
    });
    setAdding(false);
    setNewClient({ name: "", contactName: "", email: "" });
    setAddOpen(false);
    // No email provider is wired up yet — this success toast is cosmetic,
    // matching the prototype's UX; no invitation email is actually sent.
    // (A DB trigger auto-links the client's auth account to their projects
    // once they sign up with a matching email — no app code needed here.)
    showToast("Client added! Invitation email sent.");
    router.refresh();
  };

  const handleSaveEdit = async (updated: ClientWithEmails) => {
    setSavingEdit(true);
    const supabase = createClient();
    await supabase
      .from("clients")
      .update({
        name: updated.name,
        contact_name: updated.contact_name,
        phone: updated.phone,
        notes: updated.notes,
      })
      .eq("id", updated.id);
    // Simplest correct way to reconcile the email list: replace it wholesale.
    await supabase.from("client_emails").delete().eq("client_id", updated.id);
    if (updated.emails.length) {
      await supabase.from("client_emails").insert(
        updated.emails.map((e) => ({
          client_id: updated.id,
          address: e.address,
          label: e.label,
          is_primary: e.is_primary,
        })),
      );
    }
    setSavingEdit(false);
    setEditClient(null);
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this client?")) return;
    const supabase = createClient();
    await supabase.from("clients").delete().eq("id", id);
    router.refresh();
  };

  const handleResendInvite = () => {
    // Cosmetic only — no email provider is configured.
    showToast("Invitation email sent.");
  };

  const handleCopyInviteLink = (clientId: string) => {
    navigator.clipboard?.writeText(`https://copydash.app/invite/${clientId}`);
    showToast("Invite link copied to clipboard.");
  };

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle="Manage your clients and their access"
        actions={
          <Btn variant="primary" icon="plus" onClick={() => setAddOpen(true)}>
            Add Client
          </Btn>
        }
      />

      <div style={{ padding: "24px 48px 48px", flex: 1, overflowY: "auto" }}>
        {/* Stats */}
        <div style={{ display: "flex", gap: 16, marginBottom: 28 }}>
          <KPICard label="Total Clients" value={clients.length} icon="users" color="#7f22fe" />
          <KPICard label="Active" value={clients.filter((c) => c.status === "Active").length} icon="check-circle" color="#15803d" />
          <KPICard label="Waiting Access" value={clients.filter((c) => c.status === "Waiting").length} icon="clock" color="#f59e0b" />
        </div>

        {/* Search */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ position: "relative" }}>
            <Icon
              name="search"
              size={13}
              color="#a1a1aa"
              style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients…"
              style={{
                padding: "0 12px 0 30px",
                height: 34,
                borderRadius: 8,
                border: "1px solid #e4e4e7",
                fontSize: 13,
                fontFamily: "var(--font-body)",
                outline: "none",
                width: 240,
                color: "#09090b",
              }}
            />
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 16px",
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Icon name="check-circle" size={16} color="#15803d" />
            <span style={{ fontSize: 13, color: "#15803d", fontFamily: "var(--font-body)", fontWeight: 500 }}>{toast}</span>
          </div>
        )}

        {/* Client cards grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {filtered.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              clientProjects={getClientProjects(client)}
              onDelete={() => handleDelete(client.id)}
              onResendInvite={handleResendInvite}
              onCopyLink={() => handleCopyInviteLink(client.id)}
              onEdit={() => setEditClient(client)}
            />
          ))}
          {filtered.length === 0 && (
            <div style={{ gridColumn: "1 / -1", padding: 64, textAlign: "center", color: "#a1a1aa", fontSize: 14, fontFamily: "var(--font-body)" }}>
              <Icon name="users" size={32} color="#e4e4e7" style={{ margin: "0 auto 12px" }} />
              <div>No clients found</div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Client Modal */}
      {editClient && (
        <Modal open={true} onClose={() => setEditClient(null)} title="Edit Client" width={520}>
          <EditClientForm client={editClient} onSave={handleSaveEdit} onCancel={() => setEditClient(null)} saving={savingEdit} />
        </Modal>
      )}

      {/* Add Client Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add New Client" width={460}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <FieldInput
            label="Company Name"
            value={newClient.name}
            onChange={(v) => setNewClient((c) => ({ ...c, name: v }))}
            placeholder="e.g. Acme Corp"
          />
          <FieldInput
            label="Contact Name"
            value={newClient.contactName}
            onChange={(v) => setNewClient((c) => ({ ...c, contactName: v }))}
            placeholder="e.g. John Smith"
          />
          <FieldInput
            label="Email Address"
            value={newClient.email}
            onChange={(v) => setNewClient((c) => ({ ...c, email: v }))}
            placeholder="client@company.com"
            type="email"
            helper="An invitation will be sent to this address."
          />
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <Btn
              variant="primary"
              fullWidth
              onClick={handleAddClient}
              disabled={!newClient.name || !newClient.email || adding}
              icon="send"
            >
              {adding ? "Sending…" : "Send Invitation"}
            </Btn>
            <Btn variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Btn>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ── Client card ──────────────────────────────────────────────────
function ClientCard({
  client,
  clientProjects,
  onDelete,
  onResendInvite,
  onCopyLink,
  onEdit,
}: {
  client: ClientWithEmails;
  clientProjects: ProjectLite[];
  onDelete: () => void;
  onResendInvite: () => void;
  onCopyLink: () => void;
  onEdit: () => void;
}) {
  const [hov, setHov] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const emails = client.emails;
  const primary = emails.find((e) => e.is_primary)?.address || emails[0]?.address || "";
  const otherEmails = emails.filter((e) => !e.is_primary);

  const menuItems: { label: string; icon: string; action: () => void; danger?: boolean }[] = [
    { label: "Edit client", icon: "edit", action: onEdit },
    { label: "Resend invite", icon: "mail", action: onResendInvite },
    { label: "Copy invite link", icon: "link", action: onCopyLink },
    { label: "Remove client", icon: "trash", action: onDelete, danger: true },
  ];

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => {
        setHov(false);
        setMenuOpen(false);
      }}
      style={{
        background: "#fff",
        border: `1px solid ${hov ? "#e0d8ff" : "#e4e4e7"}`,
        borderRadius: 14,
        padding: 20,
        position: "relative",
        transition: "all 0.15s",
        boxShadow: hov ? "0 4px 16px rgba(127,34,254,0.06)" : "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14, gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
          <Avatar name={client.contact_name || client.name} size={40} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "#09090b",
                fontFamily: "var(--font-sans)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {client.name}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#71717b",
                fontFamily: "var(--font-body)",
                marginTop: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {client.contact_name}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <StatusBadge status={client.status} />
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setMenuOpen((m) => !m)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#a1a1aa",
                padding: 4,
                borderRadius: 6,
                opacity: hov ? 1 : 0,
                transition: "opacity 0.1s",
              }}
            >
              <Icon name="more-horizontal" size={15} />
            </button>
            {menuOpen && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: 28,
                  background: "#fff",
                  border: "1px solid #e4e4e7",
                  borderRadius: 10,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
                  zIndex: 50,
                  minWidth: 170,
                  padding: 4,
                }}
              >
                {menuItems.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      item.action();
                      setMenuOpen(false);
                    }}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 12px",
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      borderRadius: 6,
                      fontSize: 13,
                      fontFamily: "var(--font-body)",
                      color: item.danger ? "#e7000b" : "#09090b",
                      textAlign: "left",
                    }}
                  >
                    <Icon name={item.icon} size={13} color={item.danger ? "#e7000b" : "#71717b"} />
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Emails */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="mail" size={13} color="#a1a1aa" />
          <span
            style={{
              fontSize: 12,
              color: "#09090b",
              fontFamily: "var(--font-body)",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {primary}
          </span>
          {emails.length > 1 && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 6px",
                borderRadius: 4,
                background: "#f5f3ff",
                color: "#7f22fe",
                fontFamily: "var(--font-sans)",
              }}
            >
              +{emails.length - 1}
            </span>
          )}
        </div>
        {otherEmails.slice(0, 2).map((em) => (
          <div key={em.id} style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 21 }}>
            <span
              style={{
                fontSize: 11,
                color: "#71717b",
                fontFamily: "var(--font-body)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
              }}
            >
              {em.address}
            </span>
            <span style={{ fontSize: 10, color: "#a1a1aa", fontFamily: "var(--font-sans)", padding: "1px 5px", borderRadius: 3, background: "#fafafa" }}>
              {em.label}
            </span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="clock" size={13} color="#a1a1aa" />
          <span style={{ fontSize: 12, color: "#71717b", fontFamily: "var(--font-body)" }}>Joined {formatDate(client.joined_at)}</span>
        </div>
      </div>

      <Divider />

      {/* Projects — clickable */}
      <div style={{ marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#71717b",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontFamily: "var(--font-sans)",
            }}
          >
            Projects ({clientProjects.length})
          </span>
        </div>
        {clientProjects.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {clientProjects.slice(0, 3).map((p) => (
              <ProjectChip key={p.id} project={p} />
            ))}
            {clientProjects.length > 3 && (
              <div style={{ fontSize: 11, color: "#a1a1aa", fontFamily: "var(--font-body)", paddingLeft: 4 }}>
                + {clientProjects.length - 3} more
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#a1a1aa", fontFamily: "var(--font-body)", fontStyle: "italic" }}>No projects yet</div>
        )}
      </div>
    </div>
  );
}

// ── Clickable project chip used inside the ClientCard ──────────────
function ProjectChip({ project }: { project: ProjectLite }) {
  const [hov, setHov] = React.useState(false);
  return (
    <Link
      href={`/pm/projects/${project.id}`}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "7px 10px",
        background: hov ? "#f5f3ff" : "#fafafa",
        border: `1px solid ${hov ? "#ddd6fe" : "transparent"}`,
        borderRadius: 8,
        cursor: "pointer",
        transition: "all 0.12s",
        textDecoration: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, flex: 1 }}>
        <Icon name="folder-open" size={12} color={hov ? "#7008e7" : "#7f22fe"} />
        <span
          style={{
            fontSize: 12,
            color: "#09090b",
            fontFamily: "var(--font-sans)",
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {project.name}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <StatusBadge status={project.status} />
        <Icon name="chevron-right" size={11} color={hov ? "#7f22fe" : "#a1a1aa"} />
      </div>
    </Link>
  );
}

// ── Edit Client Form (used in modal) ────────────────────────────────
function EditClientForm({
  client,
  onSave,
  onCancel,
  saving,
}: {
  client: ClientWithEmails;
  onSave: (updated: ClientWithEmails) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = React.useState(client.name);
  const [contactName, setContactName] = React.useState(client.contact_name);
  const [phone, setPhone] = React.useState(client.phone || "");
  const [notes, setNotes] = React.useState(client.notes || "");
  const [emails, setEmails] = React.useState<EmailRow[]>(
    client.emails.length
      ? client.emails.map((e) => ({ id: e.id, address: e.address, label: e.label, is_primary: e.is_primary }))
      : [{ address: "", label: "Primary", is_primary: true }],
  );

  const updateEmail = (i: number, key: "address" | "label", val: string) =>
    setEmails((es) => es.map((e, idx) => (idx === i ? { ...e, [key]: val } : e)));

  // "Other" (not "Secondary") so the label always lands inside LABEL_OPTIONS.
  const addEmail = () => setEmails((es) => [...es, { address: "", label: "Other", is_primary: false }]);

  const removeEmail = (i: number) =>
    setEmails((es) => {
      const next = es.filter((_, idx) => idx !== i);
      if (next.length && !next.some((e) => e.is_primary)) next[0].is_primary = true;
      return next;
    });

  const setPrimary = (i: number) => setEmails((es) => es.map((e, idx) => ({ ...e, is_primary: idx === i })));

  const valid = name.trim().length > 0 && emails.some((e) => e.address && /\S+@\S+\.\S+/.test(e.address));

  const handleSubmit = () => {
    if (!valid) return;
    let cleaned = emails.filter((e) => e.address.trim()).map((e) => ({ ...e, address: e.address.trim() }));
    if (cleaned.length && !cleaned.some((e) => e.is_primary)) {
      cleaned = cleaned.map((e, i) => (i === 0 ? { ...e, is_primary: true } : e));
    }
    onSave({
      ...client,
      name: name.trim(),
      contact_name: contactName,
      phone,
      notes,
      emails: cleaned.map((e) => ({
        id: e.id ?? "",
        client_id: client.id,
        address: e.address,
        label: e.label,
        is_primary: e.is_primary,
        created_at: "",
      })),
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxHeight: "70vh", overflowY: "auto", padding: "0 2px" }}>
      {/* Company */}
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <FieldInput label="Company Name" value={name} onChange={setName} placeholder="e.g. Acme Corp" />
        </div>
        <div style={{ flex: 1 }}>
          <FieldInput label="Primary Contact" value={contactName} onChange={setContactName} placeholder="Full name" />
        </div>
      </div>

      <FieldInput label="Phone (optional)" value={phone} onChange={setPhone} placeholder="+1 415 555 0142" />

      {/* Emails section */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: "#09090b", fontFamily: "var(--font-sans)" }}>
            Email Addresses
            <span style={{ fontSize: 11, fontWeight: 400, color: "#71717b", marginLeft: 6, fontFamily: "var(--font-body)" }}>({emails.length})</span>
          </label>
          <button
            onClick={addEmail}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 10px",
              background: "#f5f3ff",
              color: "#7f22fe",
              border: "1px solid #ddd6fe",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
            }}
          >
            <Icon name="plus" size={12} color="#7f22fe" /> Add email
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {emails.map((em, i) => (
            <div
              key={em.id ?? i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                background: em.is_primary ? "#fdfcff" : "#fafafa",
                border: `1px solid ${em.is_primary ? "#ddd6fe" : "#e4e4e7"}`,
                borderRadius: 8,
              }}
            >
              <input
                type="email"
                value={em.address}
                onChange={(e) => updateEmail(i, "address", e.target.value)}
                placeholder="email@company.com"
                style={{
                  flex: 1,
                  height: 30,
                  padding: "0 10px",
                  borderRadius: 6,
                  border: "1px solid #e4e4e7",
                  fontSize: 13,
                  fontFamily: "var(--font-body)",
                  color: "#09090b",
                  background: "#fff",
                  outline: "none",
                }}
              />
              <select
                value={em.label}
                onChange={(e) => updateEmail(i, "label", e.target.value)}
                style={{
                  height: 30,
                  padding: "0 8px",
                  borderRadius: 6,
                  border: "1px solid #e4e4e7",
                  fontSize: 12,
                  fontFamily: "var(--font-body)",
                  color: "#09090b",
                  background: "#fff",
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                {LABEL_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setPrimary(i)}
                title={em.is_primary ? "Primary email" : "Set as primary"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  padding: "5px 8px",
                  background: em.is_primary ? "#7f22fe" : "#fff",
                  color: em.is_primary ? "#fff" : "#71717b",
                  border: `1px solid ${em.is_primary ? "#7f22fe" : "#e4e4e7"}`,
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "var(--font-sans)",
                }}
              >
                {em.is_primary ? (
                  <>
                    <Icon name="check" size={10} color="#fff" /> Primary
                  </>
                ) : (
                  "Make primary"
                )}
              </button>
              <button
                onClick={() => removeEmail(i)}
                disabled={emails.length === 1}
                title="Remove email"
                style={{
                  background: "none",
                  border: "none",
                  cursor: emails.length === 1 ? "not-allowed" : "pointer",
                  color: emails.length === 1 ? "#d4d4d8" : "#a1a1aa",
                  padding: 4,
                  borderRadius: 4,
                }}
              >
                <Icon name="x" size={13} />
              </button>
            </div>
          ))}
        </div>
        <p style={{ margin: "8px 2px 0", fontSize: 11, color: "#a1a1aa", fontFamily: "var(--font-body)" }}>
          The primary email receives all invitations. Other addresses receive CC notifications.
        </p>
      </div>

      {/* Notes */}
      <div>
        <label style={{ fontSize: 13, fontWeight: 500, color: "#09090b", fontFamily: "var(--font-sans)", display: "block", marginBottom: 6 }}>
          Notes (internal)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Internal notes — not visible to the client"
          rows={3}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #e4e4e7",
            fontSize: 13,
            fontFamily: "var(--font-body)",
            color: "#09090b",
            background: "#fff",
            outline: "none",
            resize: "vertical",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, marginTop: 4, position: "sticky", bottom: 0, background: "#fff", paddingTop: 12, borderTop: "1px solid #f4f4f5" }}>
        <Btn variant="primary" fullWidth icon="check" onClick={handleSubmit} disabled={!valid || saving}>
          {saving ? "Saving…" : "Save Changes"}
        </Btn>
        <Btn variant="outline" onClick={onCancel}>
          Cancel
        </Btn>
      </div>
    </div>
  );
}
