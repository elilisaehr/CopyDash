"use client";

// The editor's "Design fonts" panel on rebuilt PDF pages: the fonts chosen
// for each PDF text style (pages.design_fonts.styles), to change, plus
// "Recognise the fonts again" — re-splits the stored PDF and runs the font
// detection, for pages imported before it existed or after a skip.

import * as React from "react";
import { Btn, Spinner } from "@/components/ui/primitives";
import { FontStep, type FontStepResult, type FontStepStyle } from "@/components/features/font-step";
import { detectPdfFonts } from "@/lib/font-detect";
import { rebuildPdf } from "@/lib/pdf-rebuild-store";
import type { DesignFonts } from "@/lib/design-fonts";
import type { DesignBlock } from "@/lib/pdf-design";

export function EditorFonts({
  blocks,
  fonts,
  pdf,
  onSave,
}: {
  /** Every block of the rebuilt page (all PDF pages). */
  blocks: DesignBlock[];
  fonts: DesignFonts | null;
  /** The stored PDF, to recognise the fonts again. */
  pdf: ArrayBuffer | null;
  onSave: (r: FontStepResult) => Promise<void>;
}) {
  // Styles as saved: one per styleKey, its biggest block as the sample text.
  const saved = React.useMemo((): FontStepStyle[] => {
    const by = new Map<string, { chars: number; lead: DesignBlock }>();
    for (const b of blocks) {
      if (!b.styleKey) continue;
      const cur = by.get(b.styleKey);
      const chars = (cur?.chars ?? 0) + b.text.length;
      const lead = !cur || b.fontH > cur.lead.fontH ? b : cur.lead;
      by.set(b.styleKey, { chars, lead });
    }
    return [...by.entries()].map(([key, { chars, lead }]) => {
      const st = fonts?.styles?.[key];
      return {
        key,
        family: st?.family ?? null,
        weight: st?.weight ?? lead.weight ?? 400,
        sample: { text: lead.text.split("\n")[0].slice(0, 40), image: "", size: lead.fontH },
        chars,
      };
    });
  }, [blocks, fonts]);
  const [styles, setStyles] = React.useState<FontStepStyle[]>(saved);
  const [version, setVersion] = React.useState(0);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const recognise = async () => {
    if (!pdf) return;
    setError(null);
    try {
      setBusy("Reading the PDF…");
      const pages = await rebuildPdf(pdf.slice(0), (m) => setBusy(m));
      const detected = await detectPdfFonts(pages, (m) => setBusy(m));
      setStyles(
        detected.map((d) => ({
          key: d.key,
          family: d.best?.family ?? null,
          weight: d.best?.weight ?? 400,
          confidence: d.confidence,
          alternatives: d.alternatives.map((a) => a.family),
          sample: d.sample,
          chars: d.chars,
        })),
      );
      setVersion((v) => v + 1);
    } catch (e) {
      console.warn("Font recognition failed", e);
      setError("Couldn't recognise the fonts. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  if (!styles.length && !busy)
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, fontFamily: "var(--font-sans)", fontSize: 13 }}>
        <p style={{ margin: 0, color: "#71717b" }}>This page was imported before font recognition. Recognise its fonts from the PDF?</p>
        <div>
          <Btn variant="primary" size="sm" onClick={recognise} disabled={!pdf}>
            Recognise the fonts
          </Btn>
        </div>
        {error && <span style={{ color: "#b91c1c", fontSize: 12 }}>{error}</span>}
      </div>
    );

  if (busy)
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "24px 0", fontFamily: "var(--font-sans)", fontSize: 13, color: "#71717b" }}>
        <Spinner /> {busy}
      </div>
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Btn variant="ghost" size="sm" icon="rotate-ccw" onClick={recognise} disabled={!pdf}>
          Recognise the fonts again
        </Btn>
      </div>
      {error && <span style={{ color: "#b91c1c", fontSize: 12, fontFamily: "var(--font-sans)" }}>{error}</span>}
      <FontStep key={version} styles={styles} files={fonts?.files} onConfirm={(r) => onSave(r).catch((e) => setError(e instanceof Error ? e.message : "Couldn’t save the fonts. Please try again."))} confirmLabel="Save fonts" />
    </div>
  );
}
