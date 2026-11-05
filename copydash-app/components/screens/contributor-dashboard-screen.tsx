"use client";

import * as React from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { Btn, Card, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { formatDate } from "@/lib/format";
import type { Page, Project } from "@/lib/supabase/types";

export function ContributorDashboardScreen({
  userName,
  projects,
}: {
  userName: string;
  projects: (Project & { pages: Page[] })[];
}) {
  const firstName = userName?.split(" ")[0] || "there";
  const waiting = projects.reduce((n, p) => n + p.pages.filter((pg) => pg.status === "In Progress").length, 0);

  if (projects.length === 0) {
    return (
      <>
        <PageHeader title={`Welcome, ${firstName}`} subtitle="Your workspace is almost ready" />
        <div style={{ padding: "24px 48px 48px", flex: 1, overflowY: "auto" }}>
          <Card style={{ textAlign: "center", padding: "56px 32px" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: "#f5f3ff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
              }}
            >
              <Icon name="folder-open" size={22} color="#7f22fe" />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)", marginBottom: 6 }}>
              No project yet
            </div>
            <p style={{ margin: "0 auto", maxWidth: 360, fontSize: 14, color: "#71717b", fontFamily: "var(--font-body)" }}>
              You haven&rsquo;t been added to a project yet. Check back soon.
            </p>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={`Welcome, ${firstName}`} subtitle={waiting ? `It's your turn on ${waiting} ${waiting === 1 ? "page" : "pages"}` : "Nothing waiting for you right now"} />

      <div style={{ padding: "24px 48px 48px", flex: 1, overflowY: "auto" }}>
        {projects.map((project) => (
          <ProjectSection key={project.id} project={project} />
        ))}

        {/* Help banner */}
        <div
          style={{
            marginTop: 32,
            padding: "16px 20px",
            background: "#f5f3ff",
            borderRadius: 12,
            border: "1px solid #e9e4ff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "#7f22fe",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name="help-circle" size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)" }}>Need help filling in your content?</div>
              <div style={{ fontSize: 12, color: "#71717b", fontFamily: "var(--font-body)" }}>Open a page marked &ldquo;Your turn&rdquo; to edit it, then submit it for review. Changes are saved automatically.</div>
            </div>
          </div>
          <Link href="/help" style={{ textDecoration: "none" }}>
            <Btn variant="outline" size="sm">
              Get Help
            </Btn>
          </Link>
        </div>
      </div>
    </>
  );
}

function ProjectSection({ project }: { project: Project & { pages: Page[] } }) {
  const pages = project.pages;
  const completed = pages.filter((p) => p.status === "Completed").length;
  const pct = pages.length ? Math.round((completed / pages.length) * 100) : 0;

  return (
    <div style={{ marginBottom: 40 }}>
        {/* Project progress card */}
            <Card style={{ marginBottom: 32, background: "linear-gradient(135deg, #7f22fe 0%, #a684ff 100%)", border: "none" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
                <div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.7)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      fontFamily: "var(--font-sans)",
                      marginBottom: 6,
                    }}
                  >
                    {project.company || "Your Project"}
                  </div>
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#fff", fontFamily: "var(--font-sans)" }}>{project.name}</h2>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "rgba(255,255,255,0.75)", fontFamily: "var(--font-body)" }}>
                    {completed} of {pages.length} pages completed
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 40, fontWeight: 700, color: "#fff", fontFamily: "var(--font-sans)", lineHeight: 1 }}>{pct}%</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontFamily: "var(--font-body)", marginTop: 4 }}>Complete</div>
                </div>
              </div>
              <div style={{ marginTop: 20, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.25)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: "#fff", borderRadius: 3, transition: "width 0.5s ease" }} />
              </div>
            </Card>

            {/* Pages */}
            <div style={{ marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)" }}>Your Pages</h3>
              <span style={{ fontSize: 12, color: "#a1a1aa", fontFamily: "var(--font-body)" }}>{pages.length} total</span>
            </div>

            {pages.length === 0 ? (
              <Card style={{ textAlign: "center", padding: "40px 24px" }}>
                <p style={{ margin: 0, fontSize: 14, color: "#71717b", fontFamily: "var(--font-body)" }}>No pages have been added to this project yet.</p>
              </Card>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                {/* Pages where it's their turn come first (sort is stable). */}
                {[...pages].sort((a, b) => Number(b.status === "In Progress") - Number(a.status === "In Progress")).map((pg) => (
                  <ContributorPageCard key={pg.id} page={pg} />
                ))}
              </div>
            )}
    </div>
  );
}

// `yourTurn` pages are the ones to act on; the others still open, read-only.
const STATUS_ACTION: Record<string, { label: string; color: string; bg: string; yourTurn: boolean }> = {
  Draft: { label: "Being prepared", color: "#71717b", bg: "#f4f4f5", yourTurn: false },
  "In Progress": { label: "Your turn — edit this page", color: "#f59e0b", bg: "#fef9c3", yourTurn: true },
  "Pending Review": { label: "Being reviewed", color: "#1d4ed8", bg: "#eff6ff", yourTurn: false },
  Completed: { label: "Completed", color: "#15803d", bg: "#dcfce7", yourTurn: false },
};

function ContributorPageCard({ page }: { page: Page }) {
  const [hov, setHov] = React.useState(false);
  const info = STATUS_ACTION[page.status] || STATUS_ACTION.Draft;
  const isEditable = info.yourTurn;
  const lastEdited = page.updated_by_name ? `Last edited ${formatDate(page.updated_at)}` : "Not started yet";

  const content = (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: "#fff",
        border: `1px solid ${hov && isEditable ? "#c4b4ff" : "#e4e4e7"}`,
        borderRadius: 12,
        padding: 20,
        cursor: "pointer",
        boxShadow: hov && isEditable ? "0 4px 16px rgba(127,34,254,0.1)" : "0 1px 2px rgba(0,0,0,0.05)",
        transition: "all 0.15s",
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: info.bg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name={page.status === "Completed" ? "check-circle" : "file-text"} size={17} color={info.color} />
        </div>
        <StatusBadge status={page.status} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)", marginBottom: 4 }}>{page.name}</div>
      <div style={{ fontSize: 12, color: "#71717b", fontFamily: "var(--font-body)", marginBottom: 16 }}>{lastEdited}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: isEditable ? "#7f22fe" : "#a1a1aa", fontFamily: "var(--font-sans)" }}>{info.label}</span>
        {isEditable && <Icon name="arrow-right" size={14} color="#7f22fe" />}
      </div>
    </div>
  );

  return (
    <Link href={`/projects/${page.project_id}/pages/${page.id}`} style={{ textDecoration: "none", display: "block" }}>
      {content}
    </Link>
  );
}
