"use client";

// Picks the Form editor or the PDF Design editor based on
// `page.has_pdf_design`, and adapts each screen's `onBack` callback prop
// to real Next.js navigation (both editor screens render inside the
// already-present AppLayout and know nothing about routing themselves).

import { useRouter } from "next/navigation";
import { EditorScreen } from "./editor-screen";
import { DesignEditorScreen } from "./design-editor-screen";
import type { Field, Page, Project, UserRole } from "@/lib/supabase/types";

export function EditorRouter({
  project,
  page,
  fields,
  user,
  role,
  backHref,
}: {
  project: Project;
  page: Page;
  fields: Field[];
  user: { id: string; name: string; role: UserRole };
  role: UserRole;
  backHref: string;
}) {
  const router = useRouter();
  const onBack = () => router.push(backHref);

  if (page.has_pdf_design) {
    return <DesignEditorScreen project={project} page={page} user={user} role={role} onBack={onBack} />;
  }
  return <EditorScreen project={project} page={page} fields={fields} user={user} role={role} onBack={onBack} />;
}
