"use client";

// "Design fonts" — shown when a PDF is imported (and from the editor's Fonts
// button on rebuilt pages). PDFs exported from Figma carry no font name, so
// the fonts are recognised from the letters' shapes (lib/font-detect) and
// the user confirms them on a side-by-side preview: the PDF's own line next
// to the same text in the proposed font. Styles that share a font are one
// row; changing a row's font changes all its styles (each keeps its weight).
// A paid or custom font can be uploaded as a file (.otf, .ttf, .woff, .woff2).

import * as React from "react";
import { Btn, Modal } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { CANDIDATE_FAMILIES, type Confidence } from "@/lib/font-detect";
import { FONT_NAMES, cssFamily, registerFontFile, useDesignFonts, type StyleFont } from "@/lib/design-fonts";

export interface FontStepStyle {
  key: string;
  family: string | null;
  weight: number;
  confidence?: Confidence;
  alternatives?: string[];
  sample?: { text: string; image: string; size: number } | null;
  chars: number;
}

export interface FontStepResult {
  styles: Record<string, StyleFont>;
  /** Font files picked in this step, to upload: family name → file. */
  uploads: Record<string, File>;
}

const GOOGLE_CHOICES = [...new Set([...CANDIDATE_FAMILIES, ...FONT_NAMES])].sort();

const CONFIDENCE: Record<Confidence, { label: string; color: string; bg: string }> = {
  high: { label: "Match found", color: "#15803d", bg: "#f0fdf4" },
  medium: { label: "Probable — check the preview", color: "#b45309", bg: "#fffbeb" },
  low: { label: "Closest free font — upload yours for an exact match", color: "#b91c1c", bg: "#fef2f2" },
};

/** The PDF's line as an image; reports the size its text is shown at (the crop is 1.5 em tall). */
function SampleImage({ src, alt, onEm }: { src: string; alt: string; onEm: (px: number) => void }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      onLoad={(e) => onEm(e.currentTarget.clientHeight / 1.5)}
      style={{ maxWidth: "100%", maxHeight: 56, display: "block", objectFit: "contain", objectPosition: "left" }}
    />
  );
}

const familyFromFile = (name: string) => name.replace(/\.(otf|ttf|woff2?)$/i, "").replace(/[-_]+/g, " ").trim() || "Custom font";

export function FontStep({
  styles,
  files,
  onConfirm,
  onSkip,
  confirmLabel = "Use these fonts",
}: {
  styles: FontStepStyle[];
  /** Fonts already uploaded for this project/page (family → storage path). */
  files?: Record<string, string>;
  onConfirm: (r: FontStepResult) => void;
  onSkip?: () => void;
  confirmLabel?: string;
}) {
  // Current family of each style.
  const [picked, setPicked] = React.useState<Record<string, string | null>>(() => Object.fromEntries(styles.map((s) => [s.key, s.family])));
  const [uploads, setUploads] = React.useState<Record<string, File>>({});
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);
  // Size the PDF sample's text is shown at, per row: the preview uses the same.
  const [ems, setEms] = React.useState<Record<string, number>>({});
  const uploadFor = React.useRef<string | null>(null);

  // Rows: one per detected family (styles detected as the same font move together).
  const rows = React.useMemo(() => {
    const m = new Map<string, FontStepStyle[]>();
    for (const s of styles) {
      const k = s.family ?? `none:${s.key}`;
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return [...m.values()].sort((a, b) => b.reduce((n, s) => n + s.chars, 0) - a.reduce((n, s) => n + s.chars, 0));
  }, [styles]);

  // Load what's shown (Google families through the page-font loader; files are registered on upload).
  const shown = React.useMemo(
    () => ({
      styles: Object.fromEntries(Object.entries(picked).filter((e): e is [string, string] => !!e[1]).map(([k, f]) => [k, { family: f }])),
      files: { ...(files ?? {}), ...Object.fromEntries(Object.keys(uploads).map((f) => [f, "pending"])) },
    }),
    [picked, files, uploads],
  );
  // Uploaded families are already registered: don't ask Google for them.
  useDesignFonts({ styles: Object.fromEntries(Object.entries(shown.styles).filter(([, f]) => !uploads[f.family])), files: files ?? {} });

  const setRow = (row: FontStepStyle[], family: string | null) => setPicked((p) => ({ ...p, ...Object.fromEntries(row.map((s) => [s.key, family])) }));

  const onFile = async (file: File | undefined) => {
    const rowKey = uploadFor.current;
    if (!file || !rowKey) return;
    setUploadError(null);
    const family = familyFromFile(file.name);
    try {
      await registerFontFile(family, await file.arrayBuffer());
    } catch {
      setUploadError(`“${file.name}” isn't a font file we can read. Use .otf, .ttf, .woff or .woff2.`);
      return;
    }
    setUploads((u) => ({ ...u, [family]: file }));
    const row = rows.find((r) => r.some((s) => s.key === rowKey));
    if (row) setRow(row, family);
  };

  const confirm = () => {
    const out: Record<string, StyleFont> = {};
    for (const s of styles) {
      const f = picked[s.key];
      if (f) out[s.key] = shown.files[f] ? { family: f } : { family: f, weight: s.weight };
    }
    // Only the files still in use.
    const used = new Set(Object.values(out).map((s) => s.family));
    onConfirm({ styles: out, uploads: Object.fromEntries(Object.entries(uploads).filter(([f]) => used.has(f))) });
  };

  const fileFamilies = [...new Set([...Object.keys(files ?? {}), ...Object.keys(uploads)])].sort();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: "var(--font-sans)" }}>
      <p style={{ margin: 0, fontSize: 13, color: "#71717b", lineHeight: 1.5, fontFamily: "var(--font-body)" }}>
        PDFs don&apos;t say which fonts they use, so we recognised them from the shape of the letters. Check each one against the design: on the left the PDF, on the right
        the same text in the font we&apos;ll use. Everyone editing this page will see these fonts.
      </p>
      <input ref={fileInput} type="file" accept=".otf,.ttf,.woff,.woff2" style={{ display: "none" }} onChange={(e) => (onFile(e.target.files?.[0]), (e.target.value = ""))} />
      {uploadError && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#b91c1c" }}>
          <Icon name="alert-circle" size={13} color="#b91c1c" /> {uploadError}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: "56vh", overflowY: "auto", paddingRight: 4 }}>
        {rows.map((row) => {
          const lead = [...row].sort((a, b) => (b.sample ? 1 : 0) - (a.sample ? 1 : 0) || b.chars - a.chars)[0];
          const family = picked[lead.key];
          const isFile = !!family && !!shown.files[family];
          const conf = family === lead.family ? lead.confidence : isFile ? "high" : undefined;
          const suggestions = [...new Set([lead.family, ...(lead.alternatives ?? [])].filter((f): f is string => !!f))];
          const previewSize = ems[lead.key] ?? 20;
          const weights = [...new Set(row.map((s) => s.weight))].sort((a, b) => a - b);
          return (
            <div key={lead.key} style={{ border: "1px solid #e4e4e7", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "center" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "#a1a1aa", marginBottom: 4 }}>In the PDF</div>
                  {lead.sample?.image ? (
                    <SampleImage src={lead.sample.image} alt={lead.sample.text} onEm={(px) => setEms((m) => (m[lead.key] === px ? m : { ...m, [lead.key]: px }))} />
                  ) : (
                    <span style={{ fontSize: 12, color: "#a1a1aa" }}>{lead.sample ? "Compare on the page — or recognise the fonts again" : "No sample"}</span>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "#a1a1aa", marginBottom: 4 }}>In CopyDash</div>
                  <div
                    style={{
                      fontFamily: family ? `${cssFamily(family)}, var(--font-sans)` : "var(--font-sans)",
                      fontWeight: isFile ? 400 : lead.weight,
                      fontSize: previewSize,
                      lineHeight: 1.2,
                      color: "#09090b",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {lead.sample?.text ?? "The quick brown fox"}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <select
                  aria-label="Font"
                  value={family ?? ""}
                  onChange={(e) => setRow(row, e.target.value || null)}
                  style={{ height: 34, padding: "0 10px", borderRadius: 8, border: "1px solid #e4e4e7", fontSize: 13, fontFamily: "var(--font-body)", background: "#fff", minWidth: 200 }}
                >
                  <option value="">Default font</option>
                  {suggestions.length > 0 && (
                    <optgroup label="Suggested">
                      {suggestions.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {fileFamilies.length > 0 && (
                    <optgroup label="Your font files">
                      {fileFamilies.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Google Fonts">
                    {GOOGLE_CHOICES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </optgroup>
                </select>
                {!isFile && family && <span style={{ fontSize: 12, color: "#71717b" }}>{weights.length > 1 ? `weights ${weights.join(", ")}` : `weight ${weights[0]}`}</span>}
                <Btn
                  variant="ghost"
                  size="sm"
                  icon="upload"
                  onClick={() => {
                    uploadFor.current = lead.key;
                    fileInput.current?.click();
                  }}
                >
                  Upload font file
                </Btn>
                {conf && (
                  <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 999, color: CONFIDENCE[conf].color, background: CONFIDENCE[conf].bg }}>
                    {CONFIDENCE[conf].label}
                  </span>
                )}
              </div>
              {row.length > 1 && <div style={{ fontSize: 11, color: "#a1a1aa" }}>Used by {row.length} text styles on this page</div>}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        {onSkip && (
          <Btn variant="ghost" size="sm" onClick={onSkip}>
            Skip
          </Btn>
        )}
        <Btn variant="primary" size="sm" onClick={confirm}>
          {confirmLabel}
        </Btn>
      </div>
    </div>
  );
}

/**
 * The step as a promise, for the import flow: `ask(styles)` opens it and
 * resolves with the user's choice (null if skipped); render `element`.
 */
export function useFontStep() {
  const [state, setState] = React.useState<{ styles: FontStepStyle[]; resolve: (r: FontStepResult | null) => void } | null>(null);
  const ask = React.useCallback((styles: FontStepStyle[]) => new Promise<FontStepResult | null>((resolve) => setState({ styles, resolve })), []);
  const close = (r: FontStepResult | null) => {
    state?.resolve(r);
    setState(null);
  };
  const element = (
    <Modal open={!!state} onClose={() => close(null)} title="Design fonts" width={720}>
      {state && <FontStep styles={state.styles} onConfirm={(r) => close(r)} onSkip={() => close(null)} />}
    </Modal>
  );
  return { ask, element };
}
