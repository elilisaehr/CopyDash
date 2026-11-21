"use client";

import * as React from "react";
import { getPdfjs } from "@/lib/pdf";
import { reconstructPdf, type ReconstructedPage } from "@/lib/pdf-reconstruct";
import { flattenPage, saveRebuild, scaleBlock, scaleFor } from "@/lib/pdf-rebuild-store";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DesignPage, type StackPiece } from "@/components/features/design-page";
import { EditableBlock } from "@/components/features/editable-block";
import { checkText, compareWords, type TextCheck } from "./text-check";
import { FONT_NAMES, cssFamily, useDesignFonts, withFont, type DesignFonts } from "@/lib/design-fonts";
import { detectPdfFonts, type DetectedStyle } from "@/lib/font-detect";
import { FontStep } from "@/components/features/font-step";
import { Modal } from "@/components/ui/primitives";
import { runSelfTests, type SelfTestResult } from "./self-tests";
import { baseline, compareRuns, hashText, type Delta, type LabMetrics } from "./baseline";

// Local test bench for PDF → reconstructed page. Runs one PDF or every
// reference PDF (~/Desktop/Test, served by ./files), and scores each page:
//   - background: non-text pixels that differ from the original (as shown,
//     and as redrawn from the pieces when text grows);
//   - text: each block's live text vs the PDF's ink (line breaks, width,
//     position, colour) — see ./text-check;
//   - words: PDF words missing from the blocks, or doubled.
// Results are on window.__labSummary for inspection from the console.
// A full run is compared with the committed reference results (./baseline,
// "Save as baseline" replaces them); "Run self-tests" runs ./self-tests.

type Overlay = "off" | "fade" | "difference" | "blink";

interface PageResult {
  pg: ReconstructedPage;
  comp: string;
  orig: string;
  diff: string;
  pct: number;
  piecesPct: number;
  words: { missing: string[]; extra: string[] };
}

interface DocResult {
  name: string;
  ms: number;
  pages: PageResult[];
  error?: string;
  save?: { ok: boolean; kb?: number; files?: number; ms?: number; error?: string };
}

/** The editor's design pane on a rebuilt page, without the database, plus the original on top for comparison. */
function EditorPreview({
  pg,
  background,
  overlay,
  opacity,
  check,
  showIssues,
  font,
  designFonts,
  onCheck,
}: {
  pg: ReconstructedPage;
  background: string;
  overlay: Overlay;
  opacity: number;
  check?: TextCheck;
  showIssues: boolean;
  /** A design font picked for the whole page (as the editor's Fonts panel does). */
  font: string;
  /** Fonts detected for the document, applied as the editor does (lib/design-fonts withFont). */
  designFonts?: DesignFonts | null;
  onCheck: (pageIndex: number, c: TextCheck) => void;
}) {
  const k = Math.min(1, 900 / pg.w);
  const [edits, setEdits] = React.useState<Record<string, string>>({});
  const [active, setActive] = React.useState<string | null>(null);
  const [blinkOn, setBlinkOn] = React.useState(false);
  const pageRef = React.useRef<HTMLDivElement>(null);
  const sc = (b: [number, number, number, number]): [number, number, number, number] => [b[0] * k, b[1] * k, b[2] * k, b[3] * k];
  const stack = React.useMemo(
    (): StackPiece[] =>
      pg.layers.map((l) =>
        l.kind === "vector"
          ? { kind: "vector", img: l.canvas, box: sc(l.box) }
          : l.shown && l.shownBox
            ? { kind: "image", img: l.shown, box: sc(l.shownBox), frame: sc(l.shownBox), radius: 0, opacity: 1 }
            : {
                kind: "image",
                img: pg.images[l.src],
                box: sc(l.box),
                frame: sc(l.frame),
                radius: l.radius * k,
                opacity: l.opacity,
              },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pg, k],
  );
  const rendered = React.useMemo(
    () => ({
      pageIndex: pg.pageIndex,
      w: Math.round(pg.w * k),
      h: Math.round(pg.h * k),
      url: background,
      blocks: pg.blocks.map((b) => (font ? { ...scaleBlock(b, k), fontFamily: cssFamily(font) } : withFont(designFonts, scaleBlock(b, k)))),
    }),
    [pg, k, background, font, designFonts],
  );
  const onChange = React.useCallback((id: string, text: string) => setEdits((e) => ({ ...e, [id]: text })), []);

  // Once the fonts are in and the layout has settled, measure the text.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      await document.fonts.ready;
      await new Promise((r) => setTimeout(r, font || designFonts ? 2500 : 400)); // picked fonts load from Google first
      if (cancelled || !pageRef.current) return;
      onCheck(pg.pageIndex, checkText(pg, pageRef.current, k));
    })();
    return () => {
      cancelled = true;
    };
  }, [pg, k, onCheck, font, designFonts]);

  React.useEffect(() => {
    if (overlay !== "blink") return;
    const t = setInterval(() => setBlinkOn((b) => !b), 700);
    return () => clearInterval(t);
  }, [overlay]);

  const origOpacity = overlay === "off" ? 0 : overlay === "difference" ? 1 : overlay === "blink" ? (blinkOn ? 1 : 0) : opacity;

  return (
    <div id={`lab-editor-${pg.pageIndex}`} style={{ background: "#eceef1", padding: 24, display: "flex", justifyContent: "center" }}>
      <div ref={pageRef} style={{ position: "relative", width: rendered.w, flexShrink: 0 }}>
        <DesignPage
          pg={rendered}
          liveText
          stack={stack}
          renderBlock={(b, layout) => (
            <EditableBlock
              key={b.id}
              block={b}
              value={edits[b.id]}
              onChange={onChange}
              onActivate={setActive}
              active={active === b.id}
              editable
              layout={layout}
            />
          )}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={pg.original.toDataURL("image/jpeg", 0.9)}
          alt=""
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: rendered.w,
            height: rendered.h,
            opacity: origOpacity,
            mixBlendMode: overlay === "difference" ? "difference" : "normal",
            pointerEvents: "none",
            borderRadius: 6,
          }}
        />
        {showIssues &&
          check?.blocks
            .filter((b) => b.issues.length)
            .map((b) => (
              <div
                key={b.id}
                title={`${b.text}\n${b.issues.join(", ")}`}
                style={{
                  position: "absolute",
                  left: b.box[0] * k - 3,
                  top: b.box[1] * k - 3,
                  width: (b.box[2] - b.box[0]) * k + 6,
                  height: (b.box[3] - b.box[1]) * k + 6,
                  border: "2px solid #e5484d",
                  borderRadius: 3,
                  pointerEvents: "none",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: -2,
                    top: -16,
                    fontSize: 10,
                    lineHeight: "14px",
                    padding: "0 4px",
                    background: "#e5484d",
                    color: "#fff",
                    borderRadius: 3,
                    whiteSpace: "nowrap",
                  }}
                >
                  {b.issues.join(", ")}
                </span>
              </div>
            ))}
      </div>
    </div>
  );
}

/** Share of non-text pixels that differ (3×3 average, to ignore resampling noise). */
function mismatch(a: HTMLCanvasElement, b: HTMLCanvasElement, pg: ReconstructedPage): { pct: number; diff: HTMLCanvasElement } {
  const W = pg.w;
  const H = pg.h;
  const da = a.getContext("2d")!.getImageData(0, 0, W, H).data;
  const db = b.getContext("2d")!.getImageData(0, 0, W, H).data;
  const text = new Uint8Array(W * H);
  for (const bl of pg.blocks) {
    for (let y = Math.max(0, Math.floor(bl.top - 4)); y < Math.min(H, bl.top + bl.h + 4); y++)
      text.fill(1, y * W + Math.max(0, Math.floor(bl.x - 4)), y * W + Math.min(W, Math.ceil(bl.x + bl.w + 4)));
  }
  const diff = document.createElement("canvas");
  diff.width = W;
  diff.height = H;
  const dctx = diff.getContext("2d")!;
  const out = dctx.createImageData(W, H);
  let bad = 0;
  let tot = 0;
  const avg = (d: Uint8ClampedArray, x: number, y: number, c: number) => {
    let s = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) s += d[(Math.min(H - 1, Math.max(0, y + dy)) * W + Math.min(W - 1, Math.max(0, x + dx))) * 4 + c];
    return s / 9;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      out.data[i + 3] = 255;
      if (text[y * W + x]) {
        out.data[i + 2] = 200;
        continue;
      }
      tot++;
      const e =
        Math.abs(avg(da, x, y, 0) - avg(db, x, y, 0)) + Math.abs(avg(da, x, y, 1) - avg(db, x, y, 1)) + Math.abs(avg(da, x, y, 2) - avg(db, x, y, 2));
      if (e > 30) {
        bad++;
        out.data[i] = 255;
      } else out.data[i] = out.data[i + 1] = out.data[i + 2] = 180 + da[i] * 0.25;
    }
  }
  dctx.putImageData(out, 0, 0);
  return { pct: (100 * bad) / Math.max(1, tot), diff };
}

/** What the editor shows: the background as saved (JPEG), decoded again. */
async function asSaved(c: HTMLCanvasElement) {
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/jpeg", 1));
  const bmp = await createImageBitmap(blob);
  const out = document.createElement("canvas");
  out.width = c.width;
  out.height = c.height;
  out.getContext("2d")!.drawImage(bmp, 0, 0);
  return out;
}

/** The PDF's text layer, one string per page (items joined as the reader would). */
async function pdfText(data: ArrayBuffer): Promise<string[]> {
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data }).promise;
  const out: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    let s = "";
    let prevEnd: number | null = null;
    let prevY = 0;
    for (const it of tc.items) {
      if (!("str" in it)) continue;
      // A visible gap or a jump to another line or column is a word break.
      const x = it.transform[4];
      const y = it.transform[5];
      const size = Math.hypot(it.transform[2], it.transform[3]) || 1;
      if (prevEnd !== null && !/\p{L}-$/u.test(s) && (Math.abs(y - prevY) > size * 0.5 || x - prevEnd > size * 0.1 || x < prevEnd - size)) s += " ";
      prevEnd = x + it.width;
      prevY = y;
      s += it.str;
      // A line ending in a hyphen continues the word (as joinLines does).
      if (it.hasEOL) s += /\p{L}-$/u.test(s) ? "" : " ";
    }
    out.push(s);
    page.cleanup();
  }
  await doc.loadingTask.destroy();
  return out;
}

async function runDoc(name: string, buf: ArrayBuffer, onStatus: (s: string) => void): Promise<DocResult> {
  const t = performance.now();
  const pdfjs = await getPdfjs();
  const pages = await reconstructPdf(pdfjs, buf.slice(0), scaleFor, (msg) => onStatus(`${name}: ${msg}`));
  const texts = await pdfText(buf.slice(0));
  const ms = Math.round(performance.now() - t);
  const res: PageResult[] = await Promise.all(
    pages.map(async (pg) => {
      const shown = await asSaved(pg.background);
      const m = mismatch(pg.original, shown, pg);
      return {
        pg,
        comp: shown.toDataURL("image/jpeg", 0.9),
        orig: pg.original.toDataURL("image/jpeg", 0.9),
        diff: m.diff.toDataURL(),
        pct: m.pct,
        piecesPct: mismatch(pg.original, flattenPage(pg), pg).pct,
        words: compareWords([texts[pg.pageIndex] || ""], pg.blocks.map((b) => b.text)),
      };
    }),
  );
  // Dry run of the app's save step (same code), against a fake client that only measures the files.
  const saved: { path: string; bytes: number }[] = [];
  const fake = {
    storage: { from: () => ({ upload: async (path: string, blob: Blob) => (saved.push({ path, bytes: blob.size }), { error: null }) }) },
    from: () => ({
      upsert: async (row: unknown) => (saved.push({ path: "pdf_reconstructions", bytes: JSON.stringify(row).length }), { error: null }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  } as unknown as SupabaseClient;
  let save: DocResult["save"];
  try {
    const t2 = performance.now();
    await saveRebuild(fake, "project", "page", pages);
    save = { ok: true, ms: Math.round(performance.now() - t2), files: saved.length, kb: Math.round(saved.reduce((a, f) => a + f.bytes, 0) / 1024) };
  } catch (e) {
    console.error("[pdf-lab] save dry run", e);
    save = { ok: false, error: String(e) };
  }
  return { name, ms, pages: res, save };
}

interface Row {
  di: number;
  name: string;
  page: number;
  /** Reconstruction failed (no page) or the save dry run failed. */
  error?: string;
  bg?: number;
  pieces?: number;
  text?: number;
  blocks?: number;
  issues?: Record<string, number>;
  missing?: number;
  extra?: number;
  report?: string[];
  ms?: number;
  kb?: number;
}

const fmt = (n: number, d = 1) => n.toFixed(d);
const cell: React.CSSProperties = { padding: "4px 8px", borderBottom: "1px solid #eee", textAlign: "left", verticalAlign: "top" };
const bad = (on: boolean): React.CSSProperties => (on ? { color: "#c62828", fontWeight: 600 } : {});

export function PdfLab() {
  const [status, setStatus] = React.useState("Drop a PDF, or run every reference PDF");
  const [docs, setDocs] = React.useState<DocResult[]>([]);
  const [sel, setSel] = React.useState(0);
  const [checks, setChecks] = React.useState<Record<string, TextCheck>>({});
  const [showCompare, setShowCompare] = React.useState(false);
  const [overlay, setOverlay] = React.useState<Overlay>("off");
  const [opacity, setOpacity] = React.useState(0.5);
  const [showIssues, setShowIssues] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [font, setFont] = React.useState("");
  const [fonts, setFonts] = React.useState<Record<string, DetectedStyle[]>>({});
  const [applyFonts, setApplyFonts] = React.useState(true);
  const [stepOpen, setStepOpen] = React.useState(false);
  const [selfTests, setSelfTests] = React.useState<SelfTestResult[] | null>(null);
  // What the import would save: the detected font of each style.
  const designFontsOf = (name: string): DesignFonts | null => {
    const list = fonts[name];
    if (!list) return null;
    return { styles: Object.fromEntries(list.filter((d) => d.best).map((d) => [d.key, { family: d.best!.family, weight: d.best!.weight }])) };
  };
  const runFontDetect = async () => {
    setBusy(true);
    const t = performance.now();
    const out: Record<string, DetectedStyle[]> = {};
    for (const d of docs) {
      if (!d.pages.length) continue;
      out[d.name] = await detectPdfFonts(
        d.pages.map((p) => p.pg),
        (m) => setStatus(`${d.name}: ${m}`),
      );
      setFonts({ ...out });
    }
    (window as unknown as { __labFonts: unknown }).__labFonts = out;
    setStatus(`Fonts detected in ${Math.round((performance.now() - t) / 1000)} s`);
    setBusy(false);
  };
  useDesignFonts(font ? { heading: font, body: font } : null);
  const selFonts = applyFonts && docs[sel] ? designFontsOf(docs[sel].name) : null;
  useDesignFonts(selFonts);
  const waiting = React.useRef<{ key: string; pages: number; done: () => void } | null>(null);
  const checksRef = React.useRef(checks);
  React.useEffect(() => {
    checksRef.current = checks;
  }, [checks]);

  const docsRef = React.useRef(docs);
  React.useEffect(() => {
    docsRef.current = docs;
  }, [docs]);

  // Text checks come from the mounted editor preview of the selected document.
  const selRef = React.useRef(sel);
  React.useEffect(() => {
    selRef.current = sel;
  }, [sel]);
  const onCheck = React.useCallback((pageIndex: number, c: TextCheck) => {
    const key = `${selRef.current}-${pageIndex}`;
    setChecks((prev) => {
      const next = { ...prev, [key]: c };
      const w = waiting.current;
      if (w && Array.from({ length: w.pages }, (_, i) => `${w.key}-${i}`).every((k2) => next[k2])) {
        waiting.current = null;
        setTimeout(w.done, 0);
      }
      return next;
    });
  }, []);

  const addDoc = async (name: string, buf: ArrayBuffer) => {
    let doc: DocResult;
    try {
      doc = await runDoc(name, buf, setStatus);
    } catch (e) {
      console.error("[pdf-lab]", name, e);
      doc = { name, ms: 0, pages: [], error: e instanceof Error ? e.message : String(e) };
    }
    const idx = docsRef.current.length;
    docsRef.current = [...docsRef.current, doc];
    setDocs(docsRef.current);
    if (!doc.pages.length) return;
    setStatus(`${name}: measuring the text…`);
    await new Promise<void>((resolve) => {
      waiting.current = { key: String(idx), pages: doc.pages.length, done: resolve };
      selRef.current = idx;
      setSel(idx);
      setTimeout(resolve, 30000); // never hang the batch
    });
  };

  const reset = () => {
    docsRef.current = [];
    setDocs([]);
    setChecks({});
    setSel(0);
  };

  const runFiles = async (files: File[]) => {
    setBusy(true);
    reset();
    const t = performance.now();
    for (const f of files) await addDoc(f.name, await f.arrayBuffer());
    setStatus(`Done: ${files.length} file(s) in ${Math.round((performance.now() - t) / 1000)} s`);
    setBusy(false);
  };

  const runReference = async () => {
    setBusy(true);
    reset();
    const t = performance.now();
    try {
      const list = (await (await fetch("/dev/pdf-lab/files")).json()) as { files?: string[]; dir?: string; error?: string };
      const { dir, error } = list;
      let { files } = list;
      if (!files) throw new Error(error || "No file list");
      // ?only=GDS runs just the files whose name contains it.
      const only = new URLSearchParams(window.location.search).get("only")?.toLowerCase();
      if (only) files = files.filter((f) => f.toLowerCase().includes(only));
      for (const name of files) {
        setStatus(`${name}…`);
        const buf = await (await fetch(`/dev/pdf-lab/files?name=${encodeURIComponent(name)}`)).arrayBuffer();
        await addDoc(name, buf);
      }
      setStatus(`Done: ${files.length} reference PDFs from ${dir} in ${Math.round((performance.now() - t) / 1000)} s`);
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusy(false);
  };

  // One row per page, for the table and the console.
  const rows: Row[] = docs.flatMap((d, di): Row[] =>
    d.error
      ? [{ di, name: d.name, page: 0, error: d.error }]
      : d.pages.map((p) => {
          const c = checks[`${di}-${p.pg.pageIndex}`];
          return {
            di,
            name: d.name,
            page: p.pg.pageIndex + 1,
            bg: p.pct,
            pieces: p.piecesPct,
            text: c?.score,
            blocks: p.pg.blocks.length,
            issues: c?.counts,
            missing: p.words.missing.length,
            extra: p.words.extra.length,
            report: p.pg.report.map((r) => r.code),
            ms: d.ms,
            kb: d.save?.kb,
            error: d.save && !d.save.ok ? d.save.error : undefined,
          };
        }),
  );
  // Rows in the shape of the reference results (./baseline.json).
  const metrics: LabMetrics[] = rows
    .filter((r) => r.bg !== undefined)
    .map((r) => {
      const pg = docs[r.di].pages[r.page - 1].pg;
      return {
        name: r.name,
        page: r.page,
        bg: +(r.bg ?? 0).toFixed(4),
        pieces: +(r.pieces ?? 0).toFixed(4),
        text: r.text === undefined ? null : +r.text.toFixed(2),
        blocks: r.blocks ?? 0,
        missing: r.missing ?? 0,
        extra: r.extra ?? 0,
        report: Object.fromEntries(pg.report.map((x) => [x.code, x.count ?? 1])),
        blocksHash: hashText(pg.blocks.map((b) => `${b.id}:${b.text}`).join("¦")),
        kb: r.kb ?? null,
        ms: r.ms ?? 0,
        diag: pg.diagnostics ? { ...pg.diagnostics } : undefined,
      };
    });
  const complete = metrics.length > 0 && metrics.every((m) => m.text !== null) && !busy;
  const deltas: Delta[] = complete && baseline.rows.length ? compareRuns(metrics, baseline.rows) : [];
  const saveRun = async (as: "baseline" | null, name = "run") => {
    const body = { recordedAt: new Date().toISOString(), pdfjs: (await getPdfjs()).version, note: as === "baseline" ? "Reference results of the PDF lab" : name, rows: metrics };
    const res = await fetch(`/dev/pdf-lab/results?${as ? "as=baseline" : `name=${encodeURIComponent(name)}`}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const out = (await res.json()) as { file?: string; error?: string };
    setStatus(out.file ? `Saved to ${out.file}` : `Save failed: ${out.error}`);
  };
  const runTests = async () => {
    setBusy(true);
    const res = await runSelfTests(setStatus);
    setSelfTests(res);
    setStatus(`Self-tests: ${res.filter((t) => t.ok).length}/${res.length} passed`);
    setBusy(false);
  };

  // pdf.js itself, for experiments from the console.
  React.useEffect(() => {
    getPdfjs().then((p) => ((window as unknown as { __pdfjs: unknown }).__pdfjs = p));
  }, []);
  React.useEffect(() => {
    (window as unknown as { __labSummary: unknown }).__labSummary = rows;
    (window as unknown as { __labDocs: unknown }).__labDocs = docs;
    (window as unknown as { __labChecks: unknown }).__labChecks = checks;
    Object.assign(window, { __labMetrics: metrics, __labCompare: deltas, __labSelfTests: selfTests, __labSave: saveRun });
  });

  const scored = rows.filter((r) => r.text !== undefined);
  const avgText = scored.length ? scored.reduce((a, r) => a + (r.text ?? 0), 0) / scored.length : null;
  const doc = docs[sel];

  return (
    <div style={{ padding: 24, fontFamily: "var(--font-sans)", fontSize: 13 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>PDF lab — reconstruction test</h1>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button
          id="lab-run-all"
          disabled={busy}
          onClick={runReference}
          style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: busy ? "#bbb" : "#7f22fe", color: "#fff", cursor: busy ? "default" : "pointer", fontWeight: 600 }}
        >
          Run every reference PDF
        </button>
        <button
          id="lab-detect-fonts"
          disabled={busy || !docs.length}
          onClick={runFontDetect}
          style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #7f22fe", background: "#fff", color: "#7f22fe", cursor: busy ? "default" : "pointer", fontWeight: 600 }}
        >
          Detect fonts
        </button>
        <button
          id="lab-selftest"
          disabled={busy}
          onClick={runTests}
          style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #7f22fe", background: "#fff", color: "#7f22fe", cursor: busy ? "default" : "pointer", fontWeight: 600 }}
        >
          Run self-tests
        </button>
        <button
          id="lab-save-baseline"
          disabled={!complete}
          onClick={() => saveRun("baseline")}
          title="Replace app/dev/pdf-lab/baseline.json with this run"
          style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #ccc", background: "#fff", color: complete ? "#333" : "#aaa", cursor: complete ? "pointer" : "default" }}
        >
          Save as baseline
        </button>
        <input
          type="file"
          multiple
          accept="application/pdf"
          disabled={busy}
          onChange={(e) => e.target.files?.length && runFiles([...e.target.files])}
        />
      </div>
      <p id="lab-status" style={{ margin: "8px 0" }}>
        {status}
      </p>

      {selfTests && (
        <div id="lab-selftests" style={{ margin: "12px 0" }}>
          <b>
            Self-tests: {selfTests.filter((t) => t.ok).length}/{selfTests.length} passed
          </b>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12, marginTop: 6 }}>
            <tbody>
              {selfTests.map((t) => (
                <tr key={t.id}>
                  <td style={{ ...cell, ...bad(!t.ok), width: 40 }}>{t.ok ? "✓" : "✗"}</td>
                  <td style={{ ...cell, width: 70, color: "#666" }}>{t.audit}</td>
                  <td style={cell}>{t.name}</td>
                  <td style={{ ...cell, ...bad(!t.ok) }}>{t.detail}</td>
                  <td style={{ ...cell, color: "#888", width: 60 }}>{t.ms} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {complete && (
        <div id="lab-compare" style={{ margin: "12px 0" }}>
          <b>Compared with the baseline</b>{" "}
          {baseline.rows.length ? (
            <>
              ({baseline.recordedAt.slice(0, 10)}, pdf.js {baseline.pdfjs}) —{" "}
              <span style={bad(deltas.some((d) => d.verdict === "regression"))}>{deltas.filter((d) => d.verdict === "regression").length} regressions</span>,{" "}
              {deltas.filter((d) => d.verdict === "improvement").length} improvements, {deltas.filter((d) => d.verdict === "change").length} other changes
            </>
          ) : (
            "— no baseline recorded yet"
          )}
          {deltas.length > 0 && (
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12, marginTop: 6 }}>
              <tbody>
                {deltas.map((d, i) => (
                  <tr key={i}>
                    <td style={cell}>{d.name}</td>
                    <td style={cell}>{d.field}</td>
                    <td style={cell}>
                      {d.before} → {d.after}
                    </td>
                    <td style={{ ...cell, ...bad(d.verdict === "regression"), color: d.verdict === "improvement" ? "#2e7d32" : undefined }}>{d.verdict}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {Object.keys(fonts).length > 0 && (
        <div id="lab-fonts" style={{ margin: "12px 0" }}>
          <b>Font detection</b> (lib/font-detect, as at import — shape overlap 0–1)
          {Object.entries(fonts).map(([name, list]) => (
            <div key={name} style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 600 }}>{name}</div>
              <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
                <tbody>
                  {list.map((st) => (
                    <tr key={st.key}>
                      <td style={cell}>
                        “{st.sample?.text.slice(0, 30) ?? "—"}” · {st.sample ? Math.round(st.sample.size) : "?"}pt · {st.chars} chars
                      </td>
                      <td style={{ ...cell, fontWeight: 700 }}>
                        {st.best ? `${st.best.family} ${st.best.weight}` : "—"} <span style={{ color: "#888" }}>{st.best?.shape.toFixed(3)}</span> · {st.confidence}
                      </td>
                      <td style={{ ...cell, color: "#666" }}>{st.alternatives.slice(0, 3).map((a) => `${a.family} ${a.shape.toFixed(2)}`).join(" · ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <>
          <p style={{ margin: "12px 0 6px" }}>
            <b>Scoreboard</b>
            {avgText !== null && <> — average text score <b>{fmt(avgText)}%</b></>} (click a row to see it below)
          </p>
          <table id="lab-table" style={{ borderCollapse: "collapse", width: "100%", marginBottom: 16 }}>
            <thead>
              <tr style={{ background: "#f6f6f8" }}>
                {["File", "Page", "Background", "Pieces", "Text OK", "Text issues", "Words missing / extra", "Report", "Time", "Saved"].map((h) => (
                  <th key={h} style={cell}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.di}-${r.page}`}
                  onClick={() => setSel(r.di)}
                  style={{ cursor: "pointer", background: r.di === sel ? "#f3ecff" : undefined }}
                >
                  <td style={cell}>{r.name}</td>
                  <td style={cell}>{r.page || "—"}</td>
                  {r.bg === undefined ? (
                    <td style={{ ...cell, ...bad(true) }} colSpan={8}>
                      Error: {r.error}
                    </td>
                  ) : (
                    <>
                      <td style={{ ...cell, ...bad(r.bg > 0.1) }}>{fmt(r.bg, 3)}%</td>
                      <td style={{ ...cell, ...bad((r.pieces ?? 0) > 0.5) }}>{fmt(r.pieces ?? 0, 3)}%</td>
                      <td style={{ ...cell, ...bad(r.text !== undefined && r.text < 90) }}>
                        {r.text === undefined ? "…" : `${fmt(r.text)}% of ${r.blocks}`}
                      </td>
                      <td style={cell}>
                        {r.issues
                          ? Object.entries(r.issues)
                              .map(([k2, n]) => `${k2} ${n}`)
                              .join(", ") || "—"
                          : "…"}
                      </td>
                      <td style={{ ...cell, ...bad((r.missing ?? 0) + (r.extra ?? 0) > 0) }}>
                        {r.missing} / {r.extra}
                      </td>
                      <td style={{ ...cell, fontSize: 11 }}>{(r.report ?? []).join(", ") || "—"}</td>
                      <td style={cell}>{fmt((r.ms ?? 0) / 1000)} s</td>
                      <td style={{ ...cell, ...bad(!!r.error) }}>{r.error ? `Error: ${r.error}` : `${r.kb} KB`}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {doc && fonts[doc.name] && (
        <Modal open={stepOpen} onClose={() => setStepOpen(false)} title="Design fonts" width={720}>
          {stepOpen && (
            <FontStep
              styles={fonts[doc.name].map((d) => ({
                key: d.key,
                family: d.best?.family ?? null,
                weight: d.best?.weight ?? 400,
                confidence: d.confidence,
                alternatives: d.alternatives.map((a) => a.family),
                sample: d.sample,
                chars: d.chars,
              }))}
              onConfirm={(r) => {
                (window as unknown as { __labStep: unknown }).__labStep = r;
                setStepOpen(false);
              }}
              onSkip={() => setStepOpen(false)}
            />
          )}
        </Modal>
      )}
      {doc && (
        <>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", margin: "8px 0", position: "sticky", top: 0, background: "#fff", padding: "8px 0", zIndex: 5 }}>
            <b>{doc.name}</b>
            <span>Original on top:</span>
            {(["off", "fade", "difference", "blink"] as const).map((v) => (
              <button
                key={v}
                id={`lab-overlay-${v}`}
                onClick={() => setOverlay(v)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: "1px solid #ccc",
                  background: overlay === v ? "#7f22fe" : "#fff",
                  color: overlay === v ? "#fff" : "#333",
                  cursor: "pointer",
                }}
              >
                {v === "off" ? "Off" : v === "fade" ? "Fade" : v === "difference" ? "Difference (black = identical)" : "Blink"}
              </button>
            ))}
            {overlay === "fade" && <input type="range" min={0} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(+e.target.value)} />}
            <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
              Font:
              <select id="lab-font" value={font} onChange={(e) => setFont(e.target.value)}>
                <option value="">Default (as imported)</option>
                {FONT_NAMES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            {fonts[doc.name] && (
              <button id="lab-font-step" onClick={() => setStepOpen(true)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #7f22fe", background: "#fff", color: "#7f22fe", cursor: "pointer" }}>
                Import step
              </button>
            )}
            {fonts[doc.name] && (
              <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input id="lab-apply-fonts" type="checkbox" checked={applyFonts} onChange={(e) => setApplyFonts(e.target.checked)} /> Detected fonts
              </label>
            )}
            <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <input type="checkbox" checked={showIssues} onChange={(e) => setShowIssues(e.target.checked)} /> Outline text issues
            </label>
            <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <input type="checkbox" checked={showCompare} onChange={(e) => setShowCompare(e.target.checked)} /> Background comparison
            </label>
          </div>
          {doc.error && <p style={bad(true)}>Error: {doc.error}</p>}
          {doc.pages.map(({ pg, comp, orig, diff, pct, piecesPct, words }) => {
            const c = checks[`${sel}-${pg.pageIndex}`];
            return (
              <div key={`${sel}-${pg.pageIndex}`} style={{ marginTop: 16 }}>
                <p>
                  Page {pg.pageIndex + 1}: {pg.w}×{pg.h} — {pg.layers.filter((l) => l.kind === "vector").length} vector layers,{" "}
                  {pg.layers.filter((l) => l.kind === "image").length} images ({Object.keys(pg.images).length} files), {pg.blocks.length} text blocks —
                  background mismatch <b>{fmt(pct, 3)}%</b>, pieces {fmt(piecesPct, 3)}%, text OK <b>{c ? `${fmt(c.score)}%` : "…"}</b>
                </p>
                <ul style={{ margin: "6px 0 10px 18px", listStyle: "disc" }}>
                  {pg.report.map((r) => (
                    <li key={r.code}>
                      <b>{r.code}</b>
                      {r.count ? ` (${r.count})` : ""}: {r.message}
                    </li>
                  ))}
                  {words.missing.length > 0 && (
                    <li style={bad(true)}>
                      Words of the PDF not in any block ({words.missing.length}): {words.missing.slice(0, 40).join(" · ")}
                    </li>
                  )}
                  {words.extra.length > 0 && (
                    <li style={bad(true)}>
                      Words in the blocks but not in the PDF, or doubled ({words.extra.length}): {words.extra.slice(0, 40).join(" · ")}
                    </li>
                  )}
                </ul>
                {showCompare && (
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
                    {[
                      ["Original", orig],
                      ["Shown in the editor (no text)", comp],
                      ["Differences (red)", diff],
                    ].map(([label, src]) => (
                      <figure key={label} style={{ width: "32%" }}>
                        <figcaption style={{ fontWeight: 600, marginBottom: 4 }}>{label}</figcaption>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt={label} style={{ width: "100%", border: "1px solid #ddd" }} />
                      </figure>
                    ))}
                  </div>
                )}
                <EditorPreview
                  pg={pg}
                  background={comp}
                  overlay={overlay}
                  opacity={opacity}
                  check={c}
                  showIssues={showIssues}
                  font={font}
                  designFonts={selFonts}
                  onCheck={onCheck}
                />
                {c && c.blocks.some((b) => b.issues.length) && (
                  <details style={{ margin: "8px 0" }}>
                    <summary>Text issues, block by block ({c.blocks.filter((b) => b.issues.length).length})</summary>
                    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
                      <thead>
                        <tr>
                          {["Text", "Size", "Lines PDF → editor", "Width", "dx", "dy", "Colour Δ", "Issues"].map((h) => (
                            <th key={h} style={cell}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {c.blocks
                          .filter((b) => b.issues.length)
                          .map((b) => (
                            <tr key={b.id}>
                              <td style={cell}>{b.text}</td>
                              <td style={cell}>{fmt(b.fontH / pg.scale, 0)}pt</td>
                              <td style={cell}>
                                {b.pdfLines} → {b.htmlLines}
                              </td>
                              <td style={cell}>{b.widthRatio === null ? "—" : `${fmt((b.widthRatio - 1) * 100, 0)}%`}</td>
                              <td style={cell}>{b.dx === null ? "—" : fmt(b.dx, 0)}</td>
                              <td style={cell}>{b.dy === null ? "—" : fmt(b.dy, 0)}</td>
                              <td style={cell}>{b.colorDist === null ? "—" : fmt(b.colorDist, 0)}</td>
                              <td style={{ ...cell, ...bad(true) }}>{b.issues.join(", ")}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </details>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
