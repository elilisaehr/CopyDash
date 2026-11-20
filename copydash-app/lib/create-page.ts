// Creates a page in a project from the "Add page" form (PDF upload, Figma
// frame, or blank). Browser-only: shared by the project's pages list and the
// onboarding wizard.

import { createClient } from "@/lib/supabase/client";
import { PdfPasswordError, rebuildPdf, saveRebuild } from "@/lib/pdf-rebuild-store";
import type { ReconstructedPage } from "@/lib/pdf-reconstruct";
import { detectPdfFonts } from "@/lib/font-detect";
import { uploadFontFile, type DesignFonts } from "@/lib/design-fonts";
import type { FontStepResult, FontStepStyle } from "@/components/features/font-step";

export interface NewPageData {
  name: string;
  file: File | null;
  pdfText: string | null;
  figmaUrl: string | null;
}

/**
 * Returns the new page's id. Throws on failure (including plan-limit errors).
 * A PDF is rebuilt into an editable page (lib/pdf-rebuild-store) — that takes
 * a few seconds, reported through `onProgress`.
 */
export async function createPage(
  projectId: string,
  data: NewPageData,
  onProgress?: (msg: string) => void,
  /** Rebuilt PDFs: shows the detected fonts for the user to confirm (null = skipped). */
  confirmFonts?: (styles: FontStepStyle[]) => Promise<FontStepResult | null>,
): Promise<string> {
  const supabase = createClient();
  // Split the PDF first: a password-protected file is refused before any page exists.
  let rebuilt: ReconstructedPage[] | null = null;
  let rebuildError: string | null = null;
  if (data.file) {
    try {
      rebuilt = await rebuildPdf(await data.file.arrayBuffer(), onProgress);
    } catch (e) {
      if (e instanceof PdfPasswordError) throw e;
      // Anything else: the page still works with the older image + text overlay editor.
      console.warn("PDF rebuild failed, falling back to the image editor", e);
      rebuildError = errorText(e);
    }
  }
  // Design fonts: recognised from the letters, confirmed by the user.
  let designFonts: DesignFonts | null = null;
  if (rebuilt && confirmFonts) {
    let detected: FontStepStyle[] = [];
    try {
      detected = (await detectPdfFonts(rebuilt, onProgress)).map((d) => ({
        key: d.key,
        family: d.best?.family ?? null,
        weight: d.best?.weight ?? 400,
        confidence: d.confidence,
        alternatives: d.alternatives.map((a) => a.family),
        sample: d.sample,
        chars: d.chars,
      }));
    } catch (e) {
      console.warn("Font detection failed — the page keeps the default font", e);
    }
    if (detected.length) {
      onProgress?.("Waiting for the fonts to be confirmed");
      const choice = await confirmFonts(detected);
      if (choice) {
        const files: Record<string, string> = {};
        for (const [family, file] of Object.entries(choice.uploads)) files[family] = await uploadFontFile(supabase, projectId, family, file);
        designFonts = { styles: choice.styles, ...(Object.keys(files).length ? { files } : {}) };
      }
    }
  }
  const { data: newPage, error: insertErr } = await supabase
    .from("pages")
    .insert({
      project_id: projectId,
      name: data.name,
      status: "Draft",
      template: "custom",
      has_pdf_design: !!data.file || !!data.figmaUrl,
      design_source: data.file ? (rebuilt ? "pdf_html" : "pdf") : data.figmaUrl ? "figma" : null,
      design_fonts: designFonts,
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
    if (rebuilt) {
      try {
        await saveRebuild(supabase, projectId, newPage.id, rebuilt, onProgress);
      } catch (e) {
        console.warn("Saving the rebuilt PDF failed, falling back to the image editor", e);
        rebuildError = errorText(e);
        await supabase.from("pages").update({ design_source: "pdf" }).eq("id", newPage.id);
      }
    }
    // The editor shows why the page opened in the classic editor (see REBUILD_ERROR_KEY).
    if (rebuildError) rememberRebuildError(newPage.id, rebuildError);
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

const errorText = (e: unknown) => (e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e));

/** sessionStorage key holding why a page's PDF couldn't be rebuilt. */
export const REBUILD_ERROR_KEY = (pageId: string) => `cd-rebuild-error:${pageId}`;

function rememberRebuildError(pageId: string, reason: string) {
  try {
    sessionStorage.setItem(REBUILD_ERROR_KEY(pageId), reason);
  } catch {
    /* private mode: the banner shows without the reason */
  }
}
