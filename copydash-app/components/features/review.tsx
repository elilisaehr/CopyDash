"use client";

// Review flow UI shared by the Design and Form editors:
//  - useReviewRound: the page's last hand-offs + what changed in the last round
//  - ReviewBanner: says whose turn it is, with the buttons to hand the page over

import * as React from "react";
import { Icon } from "@/components/ui/icon";
import { Btn } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/client";
import { changePageStatus } from "@/lib/actions/review";
import type { CopyChange, Handoff } from "@/lib/review";
import type { PageStatus, UserRole } from "@/lib/supabase/types";

/**
 * The last round = what happened between the two latest hand-offs, e.g. what
 * the client changed between "sent to client" and "submitted". Only shown
 * once a page has gone back and forth (2+ hand-offs) and is with someone.
 * `version` re-reads after this session moves the page.
 */
export function useReviewRound(pageId: string, table: "design_edits" | "fields", version: number) {
  const [round, setRound] = React.useState<{ handoff: Handoff; changes: Record<string, CopyChange> } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const key = table === "design_edits" ? "block_id" : "id";
      const [{ data: handoffs }, { data: rows }] = await Promise.all([
        supabase.from("page_handoffs").select("from_status, to_status, actor_name, created_at").eq("page_id", pageId).order("created_at", { ascending: false }).limit(2),
        supabase.from(table).select(`${key}, baseline, prev_baseline, updated_by_name`).eq("page_id", pageId),
      ]);
      if (cancelled) return;
      const latest = (handoffs as Handoff[] | null)?.[0];
      if (!latest || (handoffs?.length ?? 0) < 2 || (latest.to_status !== "Pending Review" && latest.to_status !== "In Progress")) {
        setRound(null);
        return;
      }
      const changes: Record<string, CopyChange> = {};
      for (const r of (rows ?? []) as unknown as Record<string, string | null>[]) {
        if (r.prev_baseline !== r.baseline) changes[r[key] as string] = { before: r.prev_baseline, after: r.baseline, by: r.updated_by_name };
      }
      setRound({ handoff: latest, changes });
    })();
    return () => {
      cancelled = true;
    };
  }, [pageId, table, version]);

  return round;
}

type Tone = "turn" | "waiting" | "done";

const TONES: Record<Tone, { bg: string; border: string; icon: string; iconColor: string }> = {
  turn: { bg: "#f5f3ff", border: "#e9e4ff", icon: "zap", iconColor: "#7f22fe" },
  waiting: { bg: "#fafafa", border: "#f0f0f0", icon: "clock", iconColor: "#71717b" },
  done: { bg: "#f0fdf4", border: "#bbf7d0", icon: "check-circle", iconColor: "#15803d" },
};

interface Move {
  label: string;
  to: PageStatus;
  variant: "primary" | "outline";
}

function describe(role: UserRole, status: PageStatus, who: string | null, changed: number): { tone: Tone; title: string; detail: string; moves: Move[] } {
  const changedText = changed ? ` ${changed} ${changed === 1 ? "text" : "texts"} changed.` : "";
  if (role === "client") {
    switch (status) {
      case "Draft":
        return { tone: "waiting", title: "Your agency is still preparing this page.", detail: "You'll get an email when it's your turn to edit it.", moves: [] };
      case "In Progress":
        return {
          tone: "turn",
          title: "Your turn: edit the texts, then submit them for review.",
          detail: who ? `${who} sent this page back to you.${changedText}` : "Your edits save as you go. Submitting hands the page to your agency.",
          moves: [{ label: "Submit for review", to: "Pending Review", variant: "primary" }],
        };
      case "Pending Review":
        return { tone: "waiting", title: "Submitted — your agency is reviewing this page.", detail: "You'll get an email if they send it back to you.", moves: [] };
      default:
        return { tone: "done", title: "Completed — this page is final.", detail: "Nothing more to do here.", moves: [] };
    }
  }
  switch (status) {
    case "Draft":
      return { tone: "turn", title: "Draft — only your team works on this page.", detail: "Send it to the client when it's ready for their input.", moves: [{ label: "Send to client", to: "In Progress", variant: "primary" }] };
    case "In Progress":
      return { tone: "waiting", title: "With the client — it's their turn.", detail: "They'll submit it when they're done. You can still edit.", moves: [{ label: "Back to draft", to: "Draft", variant: "outline" }] };
    case "Pending Review":
      return {
        tone: "turn",
        title: "Your turn: review this page.",
        detail: `${who ? `${who} submitted it.` : "The client submitted it."}${changedText}`,
        moves: [
          { label: "Send back to client", to: "In Progress", variant: "outline" },
          { label: "Approve", to: "Completed", variant: "primary" },
        ],
      };
    default:
      return { tone: "done", title: "Completed — this page is final.", detail: "Reopen it if the client needs to change something.", moves: [{ label: "Reopen for the client", to: "In Progress", variant: "outline" }] };
  }
}

export function ReviewBanner({
  pageId,
  role,
  status,
  handoffBy,
  changedCount,
  showChanges,
  onToggleChanges,
  beforeMove,
  onMoved,
}: {
  pageId: string;
  role: UserRole;
  status: PageStatus;
  /** Who made the latest hand-off, when there's a last round to show. */
  handoffBy: string | null;
  changedCount: number;
  showChanges: boolean;
  onToggleChanges: () => void;
  /** Saves pending edits first, so nothing typed is lost when the page locks. */
  beforeMove?: () => Promise<void>;
  onMoved: (next: PageStatus) => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [message, setMessage] = React.useState<{ text: string; error: boolean } | null>(null);
  const { tone, title, detail, moves } = describe(role, status, handoffBy, changedCount);
  const t = TONES[tone];

  const move = (to: PageStatus) =>
    startTransition(async () => {
      setMessage(null);
      await beforeMove?.();
      const res = await changePageStatus(pageId, to);
      if (!res.ok) {
        setMessage({ text: res.error, error: true });
        return;
      }
      onMoved(to);
      if (res.notified) setMessage({ text: `Email sent to ${res.notified} ${res.notified === 1 ? "person" : "people"}.`, error: false });
    });

  return (
    <div style={{ flexShrink: 0, background: t.bg, borderBottom: `1px solid ${t.border}`, padding: "10px 24px", display: "flex", alignItems: "center", gap: 12 }}>
      <Icon name={t.icon} size={16} color={t.iconColor} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)" }}>{title}</div>
        <div style={{ fontSize: 12, color: message?.error ? "#b91c1c" : "#71717b", fontFamily: "var(--font-body)", marginTop: 2 }}>
          {message ? message.text : detail}
          {changedCount > 0 && !message && (
            <button onClick={onToggleChanges} style={{ marginLeft: 8, background: "none", border: "none", padding: 0, cursor: "pointer", color: "#7f22fe", fontSize: 12, fontWeight: 500, fontFamily: "var(--font-sans)" }}>
              {showChanges ? "Show all texts" : "Show only changes"}
            </button>
          )}
        </div>
      </div>
      {moves.map((m) => (
        <Btn key={m.to} variant={m.variant} size="sm" onClick={() => move(m.to)} disabled={pending}>
          {m.label}
        </Btn>
      ))}
    </div>
  );
}

/** Small "changed by … / before: …" note under a text that changed in the last round. */
export function ChangeNote({ change, original }: { change: CopyChange; original: string }) {
  const before = change.before ?? original;
  return (
    <div style={{ marginTop: 8, fontSize: 11, color: "#1d4ed8", fontFamily: "var(--font-body)", display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontWeight: 600, fontFamily: "var(--font-sans)" }}>Changed{change.by ? ` by ${change.by}` : ""} in the last round</span>
      <span style={{ color: "#71717b", display: "flex", gap: 5, alignItems: "baseline" }}>
        <span style={{ flexShrink: 0 }}>Before:</span>
        <span style={{ textDecoration: before ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{before || "(empty)"}</span>
      </span>
    </div>
  );
}
