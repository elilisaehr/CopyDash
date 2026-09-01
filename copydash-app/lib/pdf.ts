// Shared pdf.js loader + text extraction. Browser-only — always call
// this from a "use client" component (dynamic import avoids pulling
// pdf.js into any server bundle).

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

export function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjsLib) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      return pdfjsLib;
    });
  }
  return pdfjsPromise;
}

/** Extracts plain text from the first `maxPages` pages of a PDF File. */
export async function extractPdfText(file: File, maxPages = 8): Promise<string | null> {
  try {
    const pdfjsLib = await getPdfjs();
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = "";
    for (let i = 1; i <= Math.min(pdf.numPages, maxPages); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item) => ("str" in item ? item.str : "")).join(" ") + "\n\n";
    }
    return text.trim() || null;
  } catch (e) {
    console.warn("PDF text extraction failed:", e);
    return null;
  }
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
