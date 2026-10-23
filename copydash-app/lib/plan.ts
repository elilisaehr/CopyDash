// Plan limits as the user sees them. The limits themselves are enforced by
// database triggers (migration 0007), which raise PLAN_LIMIT_* errors.

import type { PlanLimits } from "@/lib/supabase/types";

export const PLAN_LABEL: Record<string, string> = { free: "Free", pro: "Pro", agency: "Agency" };

export const projectLimitReached = (limits: PlanLimits, activeProjects: number) =>
  limits.max_projects !== null && activeProjects >= limits.max_projects;

export const pageLimitReached = (limits: PlanLimits, activePages: number) =>
  limits.max_pages_per_project !== null && activePages >= limits.max_pages_per_project;

export const projectLimitMessage = (limits: PlanLimits) =>
  `The ${PLAN_LABEL[limits.plan] ?? limits.plan} plan includes ${limits.max_projects} active project${limits.max_projects === 1 ? "" : "s"}. Archive a project or upgrade to add more.`;

export const pageLimitMessage = (limits: PlanLimits) =>
  `The ${PLAN_LABEL[limits.plan] ?? limits.plan} plan includes ${limits.max_pages_per_project} pages per project. Archive a page or upgrade to add more.`;

/** Turns a database plan-limit error into a readable message (null for other errors). */
export function planLimitError(err: unknown): string | null {
  const msg = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "";
  if (msg.includes("PLAN_LIMIT_PROJECTS")) return "Your plan's project limit is reached. Archive a project or upgrade to add more.";
  if (msg.includes("PLAN_LIMIT_PAGES")) return "Your plan's page limit for this project is reached. Archive a page or upgrade to add more.";
  return null;
}
