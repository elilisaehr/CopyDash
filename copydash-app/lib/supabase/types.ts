// Hand-written types matching supabase/migrations/0001_schema.sql.
// If the schema changes, keep this file in sync (or generate it with
// `supabase gen types typescript` once the project is reachable).

import type { DesignFonts } from "@/lib/design-fonts";

export type UserRole = "pm" | "client";
/** Legacy column, no longer shown: a project's status is derived from its pages (lib/review.ts). */
export type ProjectStatus = "Draft" | "In Progress" | "Pending Review" | "Completed";
/** See lib/review.ts and migration 0008. */
export type PageStatus = "Draft" | "With client" | "To review" | "Approved";
export type ClientStatus = "Active" | "Waiting" | "Archived";
export type EmailLabel = "Primary" | "Billing" | "Technical" | "Marketing" | "Other";
export type TeamRole = "Admin" | "Editor" | "Viewer";
export type InviteStatus = "Pending" | "Active";

export interface Profile {
  id: string;
  role: UserRole;
  name: string;
  email: string;
  phone: string;
  company: string;
  language: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  pm_id: string;
  workspace_id: string | null;
  name: string;
  contact_name: string;
  phone: string;
  notes: string;
  status: ClientStatus;
  joined_at: string;
  created_at: string;
  updated_at: string;
}

export interface ClientEmail {
  id: string;
  client_id: string;
  address: string;
  label: EmailLabel | string;
  is_primary: boolean;
  created_at: string;
}

export interface Project {
  id: string;
  pm_id: string;
  workspace_id: string | null;
  client_id: string | null;
  name: string;
  status: ProjectStatus;
  pdf_filename: string | null;
  pdf_storage_path: string | null;
  extracted_text: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectMember {
  project_id: string;
  user_id: string;
  role: ProjectMemberRole;
  added_at: string;
}

// ── Workspaces (migration 0007) ─────────────────────────────────────
export type WorkspaceRole = "admin" | "editor";
export type ProjectMemberRole = "editor" | "client";
export type InvitationRole = "admin" | "editor" | "client";

export interface PlanLimits {
  plan: string;
  /** null = unlimited */
  max_projects: number | null;
  max_pages_per_project: number | null;
  max_members: number | null;
}

export interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  plan: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  created_at: string;
}

export interface Invitation {
  id: string;
  workspace_id: string;
  email: string;
  role: InvitationRole;
  project_ids: string[];
  token: string;
  invited_by: string | null;
  created_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
}

export interface Page {
  id: string;
  project_id: string;
  name: string;
  status: PageStatus;
  template: string;
  pdf_text: string | null;
  pdf_filename: string | null;
  pdf_storage_path: string | null;
  has_pdf_design: boolean;
  design_source: "pdf" | "figma" | null;
  design_seed: string | null;
  /** PDF designs only — see lib/design-fonts.ts. */
  design_fonts: DesignFonts | null;
  updated_by_name: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Field {
  id: string;
  page_id: string;
  field_key: string;
  label: string;
  content: string;
  max_chars: number;
  placeholder: string;
  position: number;
  updated_at: string;
  updated_by: string | null;
  updated_by_name: string | null;
  /** Text at the latest hand-off (null = empty) — see migration 0008. */
  baseline: string | null;
  /** Text at the hand-off before that. */
  prev_baseline: string | null;
}

export interface DesignEdit {
  page_id: string;
  block_id: string;
  content: string;
  updated_at: string;
  updated_by: string | null;
  updated_by_name: string | null;
  /** Text at the latest hand-off (null = the design's original text). */
  baseline: string | null;
  prev_baseline: string | null;
}

export interface Comment {
  id: string;
  project_id: string;
  page_id: string;
  field_key: string;
  author_id: string;
  author_name: string;
  role: UserRole;
  body: string;
  resolved: boolean;
  created_at: string;
}

export interface ActivityLogEntry {
  id: string;
  pm_id: string;
  project_id: string | null;
  actor_name: string;
  type: string;
  text: string;
  created_at: string;
}

export interface NotificationPrefs {
  user_id: string;
  prefs: Record<string, boolean>;
  updated_at: string;
}

export interface TeamInvitation {
  id: string;
  pm_id: string;
  email: string;
  role: TeamRole;
  status: InviteStatus;
  invited_at: string;
}

export interface FigmaConnection {
  pm_id: string;
  access_token: string;
  figma_user_name: string | null;
  figma_user_email: string | null;
  connected_at: string;
}

export interface FigmaBlock {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  fontSize: number;
  fontWeight: number;
  fontFamily: string | null;
  color: string;
  textAlign: "left" | "center" | "right" | "justify";
  lineHeight: number | null;
}

export interface FigmaDesign {
  page_id: string;
  file_key: string;
  node_id: string;
  file_name: string | null;
  frame_name: string | null;
  image_url: string;
  width: number;
  height: number;
  blocks: FigmaBlock[];
  fetched_at: string;
}

export interface BrandingSettings {
  pm_id: string;
  agency_name: string;
  brand_color: string;
  welcome_message: string;
  updated_at: string;
}

// Loose Database type good enough for the supabase-js generic without
// hand-maintaining every Insert/Update/Relationships variant.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
