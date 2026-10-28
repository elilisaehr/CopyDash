"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Avatar, Btn, KPICard, PageHeader, ProgressBar, StatusBadge } from "@/components/ui/primitives";
import { RenameModal } from "@/components/ui/rename-modal";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import type { PageStatus, Project } from "@/lib/supabase/types";

/** `status` is derived from the pages (lib/review.ts projectStatus), not the legacy column. */
export interface ProjectWithStats extends Omit<Project, "status"> {
  status: PageStatus;
  clientName: string;
  pageCount: number;
  completedPageCount: number;
  toReviewCount: number;
}

const FILTER_TABS = ["All", "Pending Review", "In Progress", "Draft", "Completed"] as const;
type FilterTab = (typeof FILTER_TABS)[number];

export function PmProjectsScreen({ projects, isAdmin }: { projects: ProjectWithStats[]; /** Editors can't create, rename or archive projects. */ isAdmin: boolean }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<FilterTab>("All");
  const [search, setSearch] = React.useState("");
  const [renamingProject, setRenamingProject] = React.useState<ProjectWithStats | null>(null);

  const handleRename = async (name: string) => {
    if (!renamingProject) return;
    const supabase = createClient();
    const { error } = await supabase.from("projects").update({ name }).eq("id", renamingProject.id);
    if (error) {
      alert(`Couldn't rename project: ${error.message}`);
      return;
    }
    setRenamingProject(null);
    router.refresh();
  };

  const filtered = projects.filter((p) => {
    const matchTab = activeTab === "All" || p.status === activeTab;
    const q = search.trim().toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.clientName.toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  const stats = [
    { label: "Total Projects", value: projects.length, icon: "folder-open", subtitle: "All time" },
    { label: "Pending Review", value: projects.filter((p) => p.status === "Pending Review").length, icon: "eye", color: "#1d4ed8", subtitle: "Your turn" },
    { label: "In Progress", value: projects.filter((p) => p.status === "In Progress").length, icon: "clock", color: "#c2410c", subtitle: "Client's turn" },
    { label: "Completed", value: projects.filter((p) => p.status === "Completed").length, icon: "check-circle", color: "#15803d", subtitle: "Every page completed" },
  ];

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Manage your website content collection projects"
        actions={
          <>
            <div style={{ position: "relative" }}>
              <Icon name="search" size={14} color="#a1a1aa" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects…"
                style={{
                  padding: "0 12px 0 32px",
                  height: 36,
                  borderRadius: 8,
                  border: "1px solid #e4e4e7",
                  fontSize: 13,
                  fontFamily: "var(--font-body)",
                  outline: "none",
                  width: 220,
                  color: "#09090b",
                }}
              />
            </div>
            {isAdmin && (
              <Btn variant="primary" icon="plus" onClick={() => router.push("/pm/projects/new")}>
                New Project
              </Btn>
            )}
          </>
        }
      />

      {/* KPI Cards */}
      <div style={{ padding: "24px 48px 0", display: "flex", gap: 16 }}>
        {stats.map((s) => (
          <KPICard key={s.label} {...s} />
        ))}
      </div>

      {/* Table */}
      <div style={{ padding: "24px 48px 48px", flex: 1 }}>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid #e4e4e7" }}>
          {FILTER_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "8px 14px",
                border: "none",
                background: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
                fontFamily: "var(--font-sans)",
                color: activeTab === tab ? "#09090b" : "#71717b",
                borderBottom: activeTab === tab ? "2px solid #7f22fe" : "2px solid transparent",
                marginBottom: -1,
                transition: "all 0.1s",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Table */}
        <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e4e4e7", background: "#fafafa" }}>
                  {["Project Name", "Client", "Progress", "Status", "Last Updated", ""].map((h, i) => (
                    <th
                      key={i}
                      style={{
                        padding: "10px 16px",
                        textAlign: "left",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#71717b",
                        fontFamily: "var(--font-sans)",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        width: i === 2 ? 180 : i === 5 ? 60 : undefined,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 48, textAlign: "center", color: "#a1a1aa", fontSize: 14, fontFamily: "var(--font-body)" }}>
                      No projects found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((p, i) => (
                    <ProjectTableRow
                      key={p.id}
                      project={p}
                      last={i === filtered.length - 1}
                      onSelect={() => router.push(`/pm/projects/${p.id}`)}
                      onRename={() => setRenamingProject(p)}
                      canManage={isAdmin}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: "#a1a1aa", fontFamily: "var(--font-body)" }}>
          {filtered.length} of {projects.length} projects
        </div>
      </div>

      <RenameModal
        open={!!renamingProject}
        title="Rename project"
        initialName={renamingProject?.name ?? ""}
        onCancel={() => setRenamingProject(null)}
        onSave={handleRename}
      />
    </>
  );
}

function ProjectTableRow({
  project: p,
  last,
  onSelect,
  onRename,
  canManage,
}: {
  project: ProjectWithStats;
  last: boolean;
  onSelect: () => void;
  onRename: () => void;
  canManage: boolean;
}) {
  const router = useRouter();
  const [hov, setHov] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [archiving, setArchiving] = React.useState(false);
  const menuBtnRef = React.useRef<HTMLButtonElement>(null);

  const handleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (!confirm(`Archive "${p.name}"? You can restore it later from Settings → Archive.`)) return;
    setArchiving(true);
    const supabase = createClient();
    const { error } = await supabase.from("projects").update({ archived_at: new Date().toISOString() }).eq("id", p.id);
    if (error) {
      setArchiving(false);
      alert(`Couldn't archive project: ${error.message}`);
      return;
    }
    router.refresh();
  };

  return (
    <tr
      onClick={onSelect}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? "#fafafa" : "#fff",
        cursor: "pointer",
        transition: "background 0.1s",
        borderBottom: last ? "none" : "1px solid #f4f4f5",
        opacity: archiving ? 0.5 : 1,
      }}
    >
      <td style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "#f5f3ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name="file-text" size={15} color="#7f22fe" />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#09090b", fontFamily: "var(--font-sans)" }}>{p.name}</div>
            <div style={{ fontSize: 12, color: "#a1a1aa", fontFamily: "var(--font-body)", marginTop: 1 }}>{p.pageCount} pages</div>
          </div>
        </div>
      </td>
      <td style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Avatar name={p.clientName} size={24} />
          <span style={{ fontSize: 13, color: "#09090b", fontFamily: "var(--font-body)" }}>{p.clientName}</span>
        </div>
      </td>
      <td style={{ padding: "14px 16px", minWidth: 160 }}>
        <ProgressBar value={p.completedPageCount} max={p.pageCount} thin />
      </td>
      <td style={{ padding: "14px 16px" }}>
        <StatusBadge status={p.status} />
      </td>
      <td style={{ padding: "14px 16px" }}>
        <span style={{ fontSize: 13, color: "#71717b", fontFamily: "var(--font-body)" }}>{formatDate(p.updated_at)}</span>
      </td>
      <td style={{ padding: "14px 16px", textAlign: "right", position: "relative" }}>
        {canManage && (
        <>
        <button
          ref={menuBtnRef}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((m) => !m);
          }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 6, color: "#71717b", opacity: hov || menuOpen ? 1 : 0, transition: "opacity 0.1s" }}
        >
          <Icon name="more-horizontal" size={16} />
        </button>
        <DropdownMenu open={menuOpen} anchorRef={menuBtnRef} onClose={() => setMenuOpen(false)}>
          <button
            onClick={() => {
              setMenuOpen(false);
              onSelect();
            }}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: "none", background: "none", cursor: "pointer", borderRadius: 6, fontSize: 13, fontFamily: "var(--font-body)", color: "#09090b", textAlign: "left" }}
          >
            <Icon name="folder-open" size={14} color="#71717b" />
            Open project
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(false);
              onRename();
            }}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: "none", background: "none", cursor: "pointer", borderRadius: 6, fontSize: 13, fontFamily: "var(--font-body)", color: "#09090b", textAlign: "left" }}
          >
            <Icon name="edit" size={14} color="#71717b" />
            Rename
          </button>
          <button
            onClick={handleArchive}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: "none", background: "none", cursor: "pointer", borderRadius: 6, fontSize: 13, fontFamily: "var(--font-body)", color: "#e7000b", textAlign: "left" }}
          >
            <Icon name="trash" size={14} color="#e7000b" />
            Archive
          </button>
        </DropdownMenu>
        </>
        )}
      </td>
    </tr>
  );
}
