// The review flow's vocabulary, shared by server and client code.
// A page moves Draft → With client → To review → Approved, and can be sent
// back from To review to With client. The database enforces who may move it
// (supabase/migrations/0008_review_flow.sql): the agency moves it anywhere,
// a client can only submit a page that is with them.

import type { PageStatus } from "@/lib/supabase/types";

export const PAGE_STATUSES: PageStatus[] = ["Draft", "With client", "To review", "Approved"];

/** Whose turn a page is in a given status. */
export function turnOf(status: PageStatus): "agency" | "client" | "nobody" {
  if (status === "With client") return "client";
  if (status === "Approved") return "nobody";
  return "agency";
}

/** A project's status, derived from its pages: what most needs someone's attention. */
export function projectStatus(pages: { status: PageStatus }[]): PageStatus {
  if (pages.some((p) => p.status === "To review")) return "To review";
  if (pages.some((p) => p.status === "With client")) return "With client";
  if (pages.length > 0 && pages.every((p) => p.status === "Approved")) return "Approved";
  return "Draft";
}

export interface Handoff {
  from_status: PageStatus;
  to_status: PageStatus;
  actor_name: string | null;
  created_at: string;
}

/** A copy row's last-round change: its text at the hand-off before last (null = original) and at the last one. */
export interface CopyChange {
  before: string | null;
  after: string | null;
  by: string | null;
}
