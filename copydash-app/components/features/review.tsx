"use client";

// Review flow UI shared by the Design and Form editors:
//  - useReviewRound: the page's last hand-offs + what changed in the last round
//  - ChangeNote: "changed by … / before: …" under a text that changed

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import type { CopyChange, Handoff } from "@/lib/review";

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
