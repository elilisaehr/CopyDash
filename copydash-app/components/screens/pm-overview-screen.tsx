"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Avatar, Btn, Card, KPICard, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { timeAgo } from "@/lib/format";
import type { ActivityLogEntry, Project } from "@/lib/supabase/types";

export interface ProjectWithStats extends Project {
  clientName: string;
  pageCount: number;
  completedPageCount: number;
}

type Greeting = "morning" | "afternoon" | "evening";

function activityVisual(entry: ActivityLogEntry): { icon: string; color: string; bg: string } {
  if (entry.type === "page_status") {
    return entry.text.includes("completed")
      ? { icon: "check-circle", color: "#15803d", bg: "#f0fdf4" }
      : { icon: "edit", color: "#7f22fe", bg: "#f5f3ff" };
  }
  if (entry.type === "comment") return { icon: "send", color: "#0369a1", bg: "#eff6ff" };
  if (entry.type === "project_created") return { icon: "file-text", color: "#f59e0b", bg: "#fffbeb" };
  return { icon: "zap", color: "#71717b", bg: "#f4f4f5" };
}

export function PmOverviewScreen({
  firstName,
  greeting,
  projects,
  activity,
}: {
  firstName: string;
  greeting: Greeting;
  projects: ProjectWithStats[];
  activity: ActivityLogEntry[];
}) {
  const router = useRouter();

  const totalPages = projects.reduce((s, p) => s + p.pageCount, 0);
  const completedPages = projects.reduce((s, p) => s + p.completedPageCount, 0);
  const recentProjects = [...projects].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)).slice(0, 3);
  const needsAttention = projects.filter((p) => p.status === "Pending Review");
  const activeCount = projects.filter((p) => p.status === "In Progress").length;
  const completedCount = projects.filter((p) => p.status === "Completed").length;

  return (
    <>
      <PageHeader
        title={`Good ${greeting}, ${firstName}`}
        subtitle="Here's what's happening across your projects today"
        actions={
          <Btn variant="primary" icon="plus" onClick={() => router.push("/pm/projects/new")}>
            New Project
          </Btn>
        }
      />

      <div style={{ flex: 1, overflowY: "auto", padding: "24px 48px 48px" }}>
        {/* KPI row */}
        <div style={{ display: "flex", gap: 16, marginBottom: 32 }}>
          <KPICard label="Active Projects" value={activeCount} icon="folder-open" subtitle={`${projects.length} total`} />
          <KPICard label="Pages Collected" value={`${completedPages}/${totalPages}`} icon="file-text" color="#0369a1" subtitle="across all projects" />
          <KPICard
            label="Pending Review"
            value={needsAttention.length}
            icon="eye"
            color={needsAttention.length > 0 ? "#f59e0b" : "#15803d"}
            subtitle={needsAttention.length > 0 ? "Action needed" : "All clear"}
          />
          <KPICard label="Completed" value={completedCount} icon="check-circle" color="#15803d" subtitle="delivered" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 24 }}>
          {/* Recent Projects */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)" }}>Recent Projects</h3>
              <Btn variant="ghost" size="sm" icon="arrow-right" iconPos="right" onClick={() => router.push("/pm/projects")}>
                View all
              </Btn>
            </div>
            {recentProjects.length === 0 ? (
              <div style={{ background: "#fff", border: "1px dashed #e4e4e7", borderRadius: 12, padding: "40px 20px", textAlign: "center" }}>
                <Icon name="folder-open" size={28} color="#e4e4e7" style={{ margin: "0 auto 12px" }} />
                <div style={{ fontSize: 14, fontWeight: 500, color: "#09090b", fontFamily: "var(--font-sans)", marginBottom: 4 }}>No projects yet</div>
                <div style={{ fontSize: 13, color: "#71717b", fontFamily: "var(--font-body)" }}>Create your first project to get started</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {recentProjects.map((p) => (
                  <RecentProjectRow key={p.id} project={p} onClick={() => router.push(`/pm/projects/${p.id}`)} />
                ))}
              </div>
            )}
          </div>

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Needs Attention */}
            <div>
              <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)" }}>Needs Attention</h3>
              {needsAttention.length === 0 ? (
                <div style={{ padding: 24, background: "#f0fdf4", borderRadius: 12, border: "1px solid #bbf7d0", textAlign: "center" }}>
                  <Icon name="check-circle" size={20} color="#15803d" style={{ margin: "0 auto 8px" }} />
                  <div style={{ fontSize: 13, color: "#15803d", fontWeight: 500, fontFamily: "var(--font-sans)" }}>All caught up!</div>
                  <div style={{ fontSize: 12, color: "#4ade80", marginTop: 4, fontFamily: "var(--font-body)" }}>No projects pending review</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {needsAttention.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => router.push(`/pm/projects/${p.id}`)}
                      style={{ padding: "12px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <Icon name="clock" size={14} color="#f59e0b" />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "#09090b", fontFamily: "var(--font-sans)" }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: "#92400e", fontFamily: "var(--font-body)", marginTop: 2 }}>
                          {p.clientName} · Pending Review
                        </div>
                      </div>
                      <Icon name="chevron-right" size={13} color="#f59e0b" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Activity Feed */}
            <div>
              <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)" }}>Recent Activity</h3>
              <Card style={{ padding: activity.length ? "4px 0" : 24 }}>
                {activity.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "16px 8px" }}>
                    <Icon name="zap" size={22} color="#e4e4e7" style={{ margin: "0 auto 10px" }} />
                    <div style={{ fontSize: 13, color: "#a1a1aa", fontFamily: "var(--font-body)" }}>No activity yet</div>
                  </div>
                ) : (
                  activity.map((entry, i) => {
                    const v = activityVisual(entry);
                    return (
                      <div
                        key={entry.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "12px 16px",
                          borderBottom: i < activity.length - 1 ? "1px solid #f4f4f5" : "none",
                        }}
                      >
                        <div style={{ width: 30, height: 30, borderRadius: 8, background: v.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Icon name={v.icon} size={14} color={v.color} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13,
                              color: "#09090b",
                              fontFamily: "var(--font-sans)",
                              fontWeight: 500,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {entry.text}
                          </div>
                          <div style={{ fontSize: 11, color: "#a1a1aa", fontFamily: "var(--font-body)", marginTop: 1 }}>
                            {entry.actor_name} · {timeAgo(entry.created_at)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </Card>
            </div>

            {/* Quick Actions */}
            <div>
              <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)" }}>Quick Actions</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <QuickAction icon="circle-plus" color="#7f22fe" bg="#f5f3ff" label="Create new project" onClick={() => router.push("/pm/projects/new")} />
                <QuickAction icon="users" color="#0369a1" bg="#eff6ff" label="Manage clients" onClick={() => router.push("/pm/clients")} />
                <QuickAction icon="folder-open" color="#15803d" bg="#f0fdf4" label="View all projects" onClick={() => router.push("/pm/projects")} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function RecentProjectRow({ project, onClick }: { project: ProjectWithStats; onClick: () => void }) {
  const [hov, setHov] = React.useState(false);
  const pct = project.pageCount === 0 ? 0 : Math.round((project.completedPageCount / project.pageCount) * 100);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: "#fff",
        border: `1px solid ${hov ? "#c4b4ff" : "#e4e4e7"}`,
        borderRadius: 12,
        padding: "16px 20px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 16,
        transition: "all 0.15s",
        boxShadow: hov ? "0 2px 12px rgba(127,34,254,0.07)" : "none",
      }}
    >
      <div style={{ width: 40, height: 40, borderRadius: 10, background: "#f5f3ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon name="file-text" size={18} color="#7f22fe" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#09090b",
              fontFamily: "var(--font-sans)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {project.name}
          </div>
          <StatusBadge status={project.status} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: "#f4f4f5", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: "#7f22fe", borderRadius: 2, transition: "width 0.4s" }} />
            </div>
            <span style={{ fontSize: 11, color: "#a1a1aa", fontFamily: "var(--font-sans)", flexShrink: 0 }}>{pct}%</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <Avatar name={project.clientName} size={18} />
            <span style={{ fontSize: 12, color: "#71717b", fontFamily: "var(--font-body)" }}>{project.clientName}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  icon,
  color,
  bg,
  label,
  onClick,
}: {
  icon: string;
  color: string;
  bg: string;
  label: string;
  onClick: () => void;
}) {
  const [hov, setHov] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        background: hov ? bg : "#fafafa",
        border: `1px solid ${hov ? "transparent" : "#e4e4e7"}`,
        borderRadius: 10,
        cursor: "pointer",
        transition: "all 0.15s",
        textAlign: "left",
      }}
    >
      <div style={{ width: 32, height: 32, borderRadius: 8, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon name={icon} size={15} color={color} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 500, color: "#09090b", fontFamily: "var(--font-sans)" }}>{label}</span>
      <Icon name="chevron-right" size={13} color="#a1a1aa" style={{ marginLeft: "auto" }} />
    </button>
  );
}
