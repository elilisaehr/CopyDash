// Creates a page in a project from the "Add page" form (PDF upload, Figma
// frame, or blank). Browser-only: shared by the project's pages list and the
// onboarding wizard.

import { createClient } from "@/lib/supabase/client";

export interface NewPageData {
  name: string;
  file: File | null;
  pdfText: string | null;
  figmaUrl: string | null;
}

/** Returns the new page's id. Throws on failure (including plan-limit errors). */
export async function createPage(projectId: string, data: NewPageData): Promise<string> {
  const supabase = createClient();
  const { data: newPage, error: insertErr } = await supabase
    .from("pages")
    .insert({
      project_id: projectId,
      name: data.name,
      status: "Draft",
      template: "custom",
      has_pdf_design: !!data.file || !!data.figmaUrl,
      design_source: data.file ? "pdf" : data.figmaUrl ? "figma" : null,
    })
    .select("id")
    .single();
  if (insertErr) throw insertErr;

  if (data.file) {
    const path = `${projectId}/pages/${newPage.id}/${data.file.name}`;
    const { error: uploadErr } = await supabase.storage.from("pdfs").upload(path, data.file, { upsert: true });
    if (uploadErr) throw uploadErr;
    const { error: updateErr } = await supabase
      .from("pages")
      .update({ pdf_filename: data.file.name, pdf_storage_path: path, pdf_text: data.pdfText })
      .eq("id", newPage.id);
    if (updateErr) throw updateErr;
  } else if (data.figmaUrl) {
    const res = await fetch("/api/figma/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId: newPage.id, figmaUrl: data.figmaUrl }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "L'import Figma a échoué.");
  }
  return newPage.id;
}
