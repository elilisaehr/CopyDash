// Hand-written types matching supabase/migrations/0001_schema.sql.
// If the schema changes, keep this file in sync (or generate it with
// `supabase gen types typescript` once the project is reachable).

export type UserRole = "pm" | "client";
export type ProjectStatus = "Draft" | "In Progress" | "Pending Review" | "Completed";
export type PageStatus = ProjectStatus;
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
  added_at: string;
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
}

export interface DesignEdit {
  page_id: string;
  block_id: string;
  content: string;
  updated_at: string;
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
