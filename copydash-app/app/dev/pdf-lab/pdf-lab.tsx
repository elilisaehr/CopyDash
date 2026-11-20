"use client";

import * as React from "react";
import { getPdfjs } from "@/lib/pdf";
import { reconstructPdf, type ReconstructedPage } from "@/lib/pdf-reconstruct";
import { flattenPage, saveRebuild, scaleBlock, scaleFor } from "@/lib/pdf-rebuild-store";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DesignPage, type StackPiece } from "@/components/features/design-page";
import { EditableBlock } from "@/components/features/editable-block";

/** The editor's design pane on a rebuilt page, without the database: live text, content pushed down by longer text. */
function EditorPreview({
  pg,
  background,
}: {
  pg: ReconstructedPage;
  background: string;
}) {
  const k = Math.min(1, 900 / pg.w);
  const [edits, setEdits] = React.useState<Record<string, string>>({});
  const [active, setActive] = React.useState<string | null>(null);
  const sc = (
    b: [number, number, number, number],
  ): [number, number, number, number] => [
    b[0] * k,
    b[1] * k,
    b[2] * k,
    b[3] * k,
  ];
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
      blocks: pg.blocks.map((b) => scaleBlock(b, k)),
    }),
    [pg, k, background],
  );
  const onChange = React.useCallback(
    (id: string, text: string) => setEdits((e) => ({ ...e, [id]: text })),
    [],
  );
  return (
    <div
      id={`lab-editor-${pg.pageIndex}`}
      style={{
        background: "#eceef1",
        padding: 24,
        display: "flex",
        justifyContent: "center",
      }}
    >
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
    </div>
  );
}

/** The pieces stacked in order (no text): what the page is redrawn from when text grows. */
const compose = (pg: ReconstructedPage) => flattenPage(pg);

/** Share of non-text pixels that differ (3×3 average, to ignore resampling noise). */
function mismatch(
  a: HTMLCanvasElement,
  b: HTMLCanvasElement,
  pg: ReconstructedPage,
): { pct: number; diff: HTMLCanvasElement } {
  const W = pg.w;
  const H = pg.h;
  const da = a.getContext("2d")!.getImageData(0, 0, W, H).data;
  const db = b.getContext("2d")!.getImageData(0, 0, W, H).data;
  const text = new Uint8Array(W * H);
  for (const bl of pg.blocks) {
    for (
      let y = Math.max(0, Math.floor(bl.top - 4));
      y < Math.min(H, bl.top + bl.h + 4);
      y++
    )
      text.fill(
        1,
        y * W + Math.max(0, Math.floor(bl.x - 4)),
        y * W + Math.min(W, Math.ceil(bl.x + bl.w + 4)),
      );
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
      for (let dx = -1; dx <= 1; dx++)
        s +=
          d[
            (Math.min(H - 1, Math.max(0, y + dy)) * W +
              Math.min(W - 1, Math.max(0, x + dx))) *
              4 +
              c
          ];
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
        Math.abs(avg(da, x, y, 0) - avg(db, x, y, 0)) +
        Math.abs(avg(da, x, y, 1) - avg(db, x, y, 1)) +
        Math.abs(avg(da, x, y, 2) - avg(db, x, y, 2));
      if (e > 30) {
        bad++;
        out.data[i] = 255;
      } else
        out.data[i] = out.data[i + 1] = out.data[i + 2] = 180 + da[i] * 0.25;
    }
  }
  dctx.putImageData(out, 0, 0);
  return { pct: (100 * bad) / Math.max(1, tot), diff };
}

export function PdfLab() {
  const [status, setStatus] = React.useState("Drop a PDF");
  const [view, setView] = React.useState<"compare" | "editor">("compare");
  const [result, setResult] = React.useState<
    {
      pg: ReconstructedPage;
      comp: string;
      orig: string;
      diff: string;
      pct: number;
      piecesPct: number;
      ms: number;
    }[]
  >([]);

  const run = async (file: File) => {
    setStatus("Extracting…");
    setResult([]);
    (window as unknown as { __lab: unknown }).__lab = undefined;
    const t = performance.now();
    let pages: ReconstructedPage[];
    try {
      const pdfjs = await getPdfjs();
      pages = await reconstructPdf(pdfjs, await file.arrayBuffer(), scaleFor, (msg) =>
        setStatus(`Extracting… ${msg}`),
      );
    } catch (e) {
      console.error("[pdf-lab]", e);
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
      (window as unknown as { __lab: unknown }).__lab = { error: String(e) };
      return;
    }
    const ms = Math.round(performance.now() - t);
    // What the editor shows: the background as saved (JPEG), decoded again.
    const asSaved = async (c: HTMLCanvasElement) => {
      const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/jpeg", 1));
      const bmp = await createImageBitmap(blob);
      const out = document.createElement("canvas");
      out.width = c.width;
      out.height = c.height;
      out.getContext("2d")!.drawImage(bmp, 0, 0);
      return out;
    };
    const res = await Promise.all(
      pages.map(async (pg) => {
        const shown = await asSaved(pg.background);
        const m = mismatch(pg.original, shown, pg);
        // The pieces, stacked: what the page is redrawn from when text grows.
        const piecesPct = mismatch(pg.original, compose(pg), pg).pct;
        return {
          pg,
          comp: shown.toDataURL("image/jpeg", 0.9),
          orig: pg.original.toDataURL("image/jpeg", 0.9),
          diff: m.diff.toDataURL(),
          pct: m.pct,
          piecesPct,
          ms,
        };
      }),
    );
    (window as unknown as { __labPages: unknown }).__labPages = pages; // for inspection from the console
    // Dry run of the app's save step (same code), against a fake client that only measures the files.
    const saved: { path: string; bytes: number }[] = [];
    const fake = {
      storage: { from: () => ({ upload: async (path: string, blob: Blob) => (saved.push({ path, bytes: blob.size }), { error: null }) }) },
      from: () => ({ upsert: async (row: unknown) => (saved.push({ path: "pdf_reconstructions", bytes: JSON.stringify(row).length }), { error: null }) }),
    } as unknown as SupabaseClient;
    try {
      const t2 = performance.now();
      await saveRebuild(fake, "project", "page", pages);
      (window as unknown as { __labSave: unknown }).__labSave = { ok: true, ms: Math.round(performance.now() - t2), files: saved.length, kb: Math.round(saved.reduce((a, f) => a + f.bytes, 0) / 1024) };
    } catch (e) {
      console.error("[pdf-lab] save dry run", e);
      (window as unknown as { __labSave: unknown }).__labSave = { ok: false, error: String(e) };
    }
    (window as unknown as { __lab: unknown }).__lab = res.map((r) => ({
      pct: r.pct,
      piecesPct: r.piecesPct,
      ms: r.ms,
      layers: r.pg.layers.length,
      images: Object.keys(r.pg.images).length,
      blocks: r.pg.blocks.length,
      report: r.pg.report,
    }));
    setResult(res);
    setStatus(`Done in ${ms} ms`);
  };

  return (
    <div style={{ padding: 24, fontFamily: "var(--font-sans)", fontSize: 13 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
        PDF lab — reconstruction test
      </h1>
      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => e.target.files?.[0] && run(e.target.files[0])}
      />
      <p id="lab-status" style={{ margin: "8px 0" }}>
        {status}
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        {(["compare", "editor"] as const).map((v) => (
          <button
            key={v}
            id={`lab-view-${v}`}
            onClick={() => setView(v)}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid #ccc",
              background: view === v ? "#7f22fe" : "#fff",
              color: view === v ? "#fff" : "#333",
              cursor: "pointer",
            }}
          >
            {v === "compare" ? "Comparison" : "Editor preview"}
          </button>
        ))}
      </div>
      {result.map(({ pg, comp, orig, diff, pct, piecesPct }) => (
        <div key={pg.pageIndex} style={{ marginTop: 16 }}>
          <p>
            Page {pg.pageIndex + 1}: {pg.w}×{pg.h} —{" "}
            {pg.layers.filter((l) => l.kind === "vector").length} vector layers,{" "}
            {pg.layers.filter((l) => l.kind === "image").length} images (
            {Object.keys(pg.images).length} files), {pg.blocks.length} text
            blocks — mismatch outside text: shown <b>{pct.toFixed(3)}%</b>, pieces (when text grows){" "}
            {piecesPct.toFixed(3)}%
          </p>
          <ul style={{ margin: "6px 0 10px 18px", listStyle: "disc" }}>
            {pg.report.map((r) => (
              <li key={r.code}>
                <b>{r.code}</b>
                {r.count ? ` (${r.count})` : ""}: {r.message}
              </li>
            ))}
          </ul>
          {view === "editor" ? (
            <EditorPreview pg={pg} background={comp} />
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              {[
                ["Original", orig],
                ["Shown in the editor (no text)", comp],
                ["Differences (red)", diff],
              ].map(([label, src]) => (
                <figure key={label} style={{ width: "32%" }}>
                  <figcaption style={{ fontWeight: 600, marginBottom: 4 }}>
                    {label}
                  </figcaption>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={label}
                    style={{ width: "100%", border: "1px solid #ddd" }}
                  />
                </figure>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
