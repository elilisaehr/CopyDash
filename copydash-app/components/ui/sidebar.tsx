"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "./icon";
import { Avatar } from "./primitives";
import { createClient } from "@/lib/supabase/client";

type NavItem = { id: string; label: string; icon: string; href: string };

const PM_NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "layout-dashboard", href: "/pm" },
  { id: "projects", label: "Projects", icon: "folder-open", href: "/pm/projects" },
  { id: "clients", label: "Clients", icon: "users", href: "/pm/clients" },
];

const CLIENT_NAV: NavItem[] = [
  { id: "client-home", label: "My Work", icon: "folder-open", href: "/client" },
];

export function Sidebar({
  user,
  role,
}: {
  user: { name: string; email: string; project?: string; avatar_url?: string | null };
  role: "pm" | "client";
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    // Mount-detection to avoid an SSR/CSR mismatch on the persisted
    // collapsed state (which only exists in localStorage, client-side).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    try {
      setCollapsed(JSON.parse(localStorage.getItem("cd-sidebar-collapsed") || "false") === true);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("cd-sidebar-collapsed", JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const nav = role === "client" ? CLIENT_NAV : PM_NAV;
  const width = collapsed ? 66 : 255;
  const settingsHref = role === "client" ? "/client/settings" : "/pm/settings";
  const helpHref = role === "client" ? "/client/help" : "/pm/help";

  const isActive = (href: string) => {
    if (href === "/pm" || href === "/client") return pathname === href;
    return pathname.startsWith(href);
  };

  return (
    <div
      style={{
        width,
        minHeight: "100vh",
        background: "#fafafa",
        borderRight: "1px solid #e4e4e7",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        flexShrink: 0,
        position: "relative",
        transition: mounted ? "width 0.22s cubic-bezier(.4,.2,.2,1)" : undefined,
      }}
    >
      <button
        onClick={toggleCollapsed}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        style={{
          position: "absolute",
          top: 24,
          right: -11,
          zIndex: 30,
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "#fff",
          border: "1px solid #e4e4e7",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#71717b",
          padding: 0,
        }}
      >
        <Icon name={collapsed ? "chevron-right" : "chevron-left"} size={12} color="currentColor" />
      </button>

      <div>
        <div style={{ padding: "12px 8px 4px", borderBottom: "1px solid #e4e4e7" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 8px", borderRadius: 10, justifyContent: collapsed ? "center" : "flex-start" }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: "#7f22fe", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon name="gallery-vertical-end" size={16} color="#fff" />
            </div>
            {!collapsed && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#09090b", fontFamily: "var(--font-sans)" }}>CopyDash</div>
                {role === "client" && user.project && <div style={{ fontSize: 11, color: "#71717b", fontFamily: "var(--font-body)", marginTop: 1 }}>{user.project}</div>}
              </div>
            )}
          </div>
        </div>
        <div style={{ padding: "8px 8px" }}>
          {nav.map((item) => (
            <SidebarNavItem key={item.id} item={item} active={isActive(item.href)} collapsed={collapsed} />
          ))}
        </div>
      </div>
      <div style={{ padding: "8px 8px", borderTop: "1px solid #e4e4e7" }}>
        <SidebarNavItem item={{ id: "settings", label: "Settings", icon: "settings", href: settingsHref }} active={isActive(settingsHref)} collapsed={collapsed} />
        <SidebarNavItem item={{ id: "help", label: "Help & Support", icon: "help-circle", href: helpHref }} active={isActive(helpHref)} collapsed={collapsed} />
        <UserMenu user={user} collapsed={collapsed} />
      </div>
    </div>
  );
}

function SidebarNavItem({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  const [hov, setHov] = React.useState(false);
  return (
    <Link
      href={item.href}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={collapsed ? item.label : ""}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: collapsed ? "8px 0" : "7px 10px",
        borderRadius: 8,
        cursor: "pointer",
        background: active ? "#f0eeff" : hov ? "#f4f4f5" : "transparent",
        marginBottom: 2,
        justifyContent: collapsed ? "center" : "flex-start",
        position: "relative",
        textDecoration: "none",
      }}
    >
      <Icon name={item.icon} size={16} color={active ? "#7f22fe" : "#71717b"} />
      {!collapsed && <span style={{ fontSize: 14, fontWeight: active ? 600 : 400, color: active ? "#7f22fe" : "#09090b", fontFamily: "var(--font-sans)" }}>{item.label}</span>}
      {collapsed && hov && (
        <div
          style={{
            position: "absolute",
            left: "calc(100% + 12px)",
            top: "50%",
            transform: "translateY(-50%)",
            background: "#09090b",
            color: "#fff",
            fontSize: 12,
            fontWeight: 500,
            padding: "5px 10px",
            borderRadius: 6,
            whiteSpace: "nowrap",
            fontFamily: "var(--font-sans)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            pointerEvents: "none",
            zIndex: 100,
          }}
        >
          {item.label}
        </div>
      )}
    </Link>
  );
}

function UserMenu({ user, collapsed }: { user: { name: string; email: string; avatar_url?: string | null }; collapsed: boolean }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const router = useRouter();

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div ref={ref} style={{ position: "relative", marginTop: 4, borderTop: "1px solid #e4e4e7" }}>
      <div
        onClick={() => setOpen((o) => !o)}
        title={collapsed ? `${user?.name || "User"} — click to sign out` : ""}
        style={{
          display: "flex",
          alignItems: "center",
          gap: collapsed ? 0 : 10,
          padding: collapsed ? "10px 0" : "10px 8px",
          cursor: "pointer",
          borderRadius: 8,
          justifyContent: collapsed ? "center" : "flex-start",
        }}
      >
        <Avatar name={user?.name || "User"} size={32} src={user?.avatar_url} />
        {!collapsed && (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name || "User"}</div>
              <div style={{ fontSize: 11, color: "#71717b", fontFamily: "var(--font-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.email || ""}</div>
            </div>
            <Icon name="chevrons-up-down" size={14} color="#a1a1aa" />
          </>
        )}
      </div>

      {open && (
        <div
          style={
            collapsed
              ? { position: "absolute", bottom: 0, left: "calc(100% + 8px)", background: "#fff", border: "1px solid #e4e4e7", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", padding: 4, zIndex: 200, minWidth: 220 }
              : { position: "absolute", bottom: "100%", left: 8, right: 8, background: "#fff", border: "1px solid #e4e4e7", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", padding: 4, zIndex: 200, marginBottom: 4 }
          }
        >
          <div style={{ padding: "10px 12px", borderBottom: "1px solid #f4f4f5", marginBottom: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)" }}>{user?.name}</div>
            <div style={{ fontSize: 11, color: "#71717b", fontFamily: "var(--font-body)", marginTop: 2 }}>{user?.email}</div>
          </div>
          <button
            onClick={handleLogout}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: "none", background: "none", cursor: "pointer", borderRadius: 6, fontSize: 13, fontFamily: "var(--font-body)", color: "#e7000b", textAlign: "left" }}
          >
            <Icon name="log-out" size={14} color="#e7000b" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
