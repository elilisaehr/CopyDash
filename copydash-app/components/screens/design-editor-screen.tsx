"use client";

// CopyDash — Design Editor Screen
// Shows the uploaded design PDF and lets the user edit the copy directly on
// it. Ported from project/copydash/designeditor.jsx + pdfdesign.jsx, wired
// to real Supabase-backed data instead of localStorage/in-memory blobs:
//  - the PDF comes from Storage (bucket "pdfs", page.pdf_storage_path)
//  - blocks are computed with lib/pdf-design's buildBlocks against the
//    real rendered pdf.js canvas
//  - edits are seeded from and persisted to the `design_edits` table
//    (page_id, block_id) -> content, upserted on blur
// Reuses the same field-card mechanism as the standard Form editor:
// FieldTextarea + AISuggestButton + CommentButton per block, keyed by
// block.id.

import * as React from "react";
import { Icon } from "@/components/ui/icon";
import { Btn, FieldTextarea, StatusBadge, StatusPicker, Spinner, Modal, SelectInput } from "@/components/ui/primitives";
import { ChangeNote, useReviewRound } from "@/components/features/review";
import { CommentButton } from "@/components/features/comments";
import { computeSEO, SEOToggle, SEOPanel } from "@/components/features/seo";
import { AISuggestButton } from "@/components/features/ai-suggest";
import { EditableBlock } from "@/components/features/editable-block";
import { DesignPage, type BlockFlowInfo, type StackBox, type StackPiece } from "@/components/features/design-page";
import { PhotoOverlay, type OverlayPhoto } from "@/components/features/photo-overlay";
import { coverBox, croppedBox, deletePhotoEdit, downloadPhoto, loadPhotoEdits, savePhotoEdit, uploadPhoto, type PhotoEdit } from "@/lib/pdf-photos";
import { mockGenerateFieldSuggestions } from "@/lib/ai-mock";
import { getPdfjs } from "@/lib/pdf";
import { PdfPasswordError, loadBackgrounds, loadPieces, loadRebuildModel, rebuildPdf, rebuildToRendered, saveRebuild, type LoadedPiece, type StoredModel } from "@/lib/pdf-rebuild-store";
import type { ReconstructedPage } from "@/lib/pdf-reconstruct";
import { createClient } from "@/lib/supabase/client";
import { changePageStatus } from "@/lib/actions/review";
import { REBUILD_ERROR_KEY } from "@/lib/create-page";
import { renderPdfDesign, joinLines, legacyLineIdPrefix, sampleBg, luminance, type DesignBlock, type RenderedPage, type BlockKind } from "@/lib/pdf-design";
import { FONT_NAMES, cssFamily, fontForKind, useDesignFonts, useFontPreviews, useWebFonts, type DesignFonts } from "@/lib/design-fonts";
import { useResizablePanel } from "@/hooks/use-resizable-panel";
import { ResizeHandle } from "@/components/ui/resize-handle";
import type { Project, Page, PageStatus, UserRole, FigmaDesign } from "@/lib/supabase/types";

// Day rebuilt PDF pages (migration 0010) arrived: PDF pages created since then are rebuilt at import.
const REBUILD_SINCE = "2026-11-20";

const KIND_LABEL: Record<BlockKind, string> = {
  heading: "Heading",
  subhead: "Subheading",
  lead: "Lead Text",
  body: "Body Text",
};

const DESIGN_AI_MESSAGES = [
  "Reading the design layout…",
  "Analysing tone of voice…",
  "Rewriting copy in place…",
  "Checking length constraints…",
];

// Derive a sensible character budget from the space the design gives the text.
const blockMaxChars = (b: DesignBlock) => Math.max(24, Math.ceil(b.text.length * 1.35) + 8);

const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;
const isParagraph = (b: DesignBlock) => (b.sourceLines?.length || 0) > 1;

type PdfStatus = "loading" | "ready" | "error";
type AiState = "idle" | "processing" | "done" | "error";

interface DesignEditorUser {
  id: string;
  name: string;
  role: UserRole;
}

export function DesignEditorScreen({
  project,
  page,
  user,
  role = "pm",
  onBack,
}: {
  project: Project;
  page: Page;
  user: DesignEditorUser;
  role?: UserRole;
  onBack: () => void;
}) {
  // ── edits map (block_id -> content), seeded from design_edits ──────────
  const [edits, setEditsState] = React.useState<Record<string, string>>({});
  const editsRef = React.useRef<Record<string, string>>({});
  const setEdits = React.useCallback((updater: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => {
    setEditsState((prev) => {
      const next = typeof updater === "function" ? (updater as (p: Record<string, string>) => Record<string, string>)(prev) : updater;
      editsRef.current = next;
      return next;
    });
  }, []);

  const [editsLoaded, setEditsLoaded] = React.useState(false);
  const [pdfPath, setPdfPath] = React.useState<string | null>(page.design_source === "figma" ? null : page.pdf_storage_path);
  const [pdfBuffer, setPdfBuffer] = React.useState<ArrayBuffer | null>(null);
  const [pdfStatus, setPdfStatus] = React.useState<PdfStatus>("loading");
  const [pages, setPages] = React.useState<RenderedPage[]>([]);
  const [blocks, setBlocks] = React.useState<DesignBlock[]>([]);
  // Figma-sourced design: base (unscaled) data fetched once; `pages`/`blocks`
  // above are re-derived from this at the live zoom `scale` below, the same
  // way the PDF pipeline re-renders at a new scale — see the effect further
  // down. Figma gives exact text position/content/style directly from its
  // API, so no pdf.js geometry-detection is needed for this source.
  const [figmaDesign, setFigmaDesign] = React.useState<FigmaDesign | null>(null);
  // Rebuilt PDF (design_source "pdf_html"): the description saved at import
  // and each page's background (no text) as a local object URL.
  const [designSource, setDesignSource] = React.useState(page.design_source);
  const isRebuild = designSource === "pdf_html";
  const [rebuild, setRebuild] = React.useState<{ model: StoredModel; backgrounds: string[] } | null>(null);
  const [rebuildVersion, setRebuildVersion] = React.useState(0);
  const [rebuildProgress, setRebuildProgress] = React.useState<string | null>(null);
  const [reportOpen, setReportOpen] = React.useState(false);
  // A PDF page in the classic editor created since rebuilt pages exist means
  // the rebuild failed at import: say so, with the reason when known, and offer a retry.
  const rebuildFailed = designSource === "pdf" && page.created_at >= REBUILD_SINCE;
  const [rebuildError, setRebuildError] = React.useState<string | null>(null);
  const [retrying, setRetrying] = React.useState(false);
  React.useEffect(() => {
    if (!rebuildFailed) return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRebuildError(sessionStorage.getItem(REBUILD_ERROR_KEY(page.id)));
    } catch {
      /* ignore */
    }
  }, [rebuildFailed, page.id]);
  // Its layers and pictures, loaded after the backgrounds (only needed once text grows).
  const [pieces, setPieces] = React.useState<LoadedPiece[][] | null>(null);

  const [scale, setScale] = React.useState(1);
  const [autoFit, setAutoFit] = React.useState(true);
  const { width: fieldsWidth, onMouseDown: onResizeFields } = useResizablePanel(440, 320, 800, "cd-design-fields-width");
  const paneRef = React.useRef<HTMLDivElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const pageRefs = React.useRef<Record<number, HTMLDivElement | null>>({});
  const fieldRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  // Where each block sits once longer text has pushed the design down, and which ones are too long.
  const [flowInfo, setFlowInfo] = React.useState<Record<string, BlockFlowInfo>>({});
  const flowShiftRef = React.useRef<Record<string, number>>({});
  const onFlow = React.useCallback((info: Record<string, BlockFlowInfo>) => {
    for (const [id, f] of Object.entries(info)) flowShiftRef.current[id] = f.shift;
    setFlowInfo((prev) => ({ ...prev, ...info }));
  }, []);

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [saveStatus, setSaveStatus] = React.useState<"idle" | "saving" | "saved">("idle");
  const [pageStatus, setPageStatus] = React.useState<PageStatus>(page.status);
  const [reviewVersion, setReviewVersion] = React.useState(0);
  const round = useReviewRound(page.id, "design_edits", reviewVersion);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [fontsOpen, setFontsOpen] = React.useState(false);
  const [resyncError, setResyncError] = React.useState<string | null>(null);
  const [resyncConflicts, setResyncConflicts] = React.useState<ResyncConflict[] | null>(null);
  const [designFonts, setDesignFonts] = React.useState<DesignFonts | null>(page.design_fonts ?? null);
  useDesignFonts(designFonts);
  const [figmaFonts, setFigmaFonts] = React.useState<string[]>([]);
  useWebFonts(figmaFonts);
  const [seoOpen, setSeoOpen] = React.useState(false);
  const [aiState, setAiState] = React.useState<AiState>("idle");
  const [aiProgress, setAiProgress] = React.useState(0);
  const [aiMsgIdx, setAiMsgIdx] = React.useState(0);
  // Read after mount: the server can't see localStorage, and reading it in
  // the initial state made the first render differ (hydration error).
  const [hint, setHint] = React.useState(false);
  React.useEffect(() => {
    let seen = false;
    try {
      seen = !!localStorage.getItem("cd-design-hint-seen");
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!seen) setHint(true);
  }, []);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Contributors edit only while the page is with them (the database enforces it too).
  const editable = role === "pm" || pageStatus === "In Progress";

  // ── load existing design_edits for this page ────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.from("design_edits").select("block_id, content").eq("page_id", page.id);
      if (cancelled) return;
      const seeded: Record<string, string> = {};
      (data || []).forEach((r: { block_id: string; content: string }) => {
        seeded[r.block_id] = r.content;
      });
      setEdits(seeded);
      setEditsLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id]);

  // ── download the PDF from Storage whenever pdfPath changes ─────────────
  // (no pdfPath means no design has been uploaded yet — nothing to load;
  // the empty-state pane is driven directly off `pdfPath` in the render.)
  React.useEffect(() => {
    if (!pdfPath || isRebuild) return;
    let cancelled = false;
    (async () => {
      setPdfStatus("loading");
      const supabase = createClient();
      const { data, error } = await supabase.storage.from("pdfs").download(pdfPath);
      if (cancelled) return;
      if (error || !data) {
        console.warn("Design PDF download failed", error);
        setPdfStatus("error");
        return;
      }
      const buf = await data.arrayBuffer();
      if (cancelled) return;
      setPdfBuffer(buf);
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfPath, isRebuild]);

  // Fit the design to the available pane width on first render.
  const handleNaturalWidth = React.useCallback(
    (w: number) => {
      if (!autoFit || !w) return;
      const avail = (paneRef.current?.clientWidth || 760) - 64;
      setScale(Math.max(0.4, Math.min(1, +(avail / w).toFixed(3))));
      setAutoFit(false);
    },
    [autoFit],
  );

  // ── render every page to canvas + build blocks whenever the PDF bytes
  // or zoom scale change. pdf.js detaches the ArrayBuffer it's given, so
  // a fresh copy is passed in on every render pass. ──────────────────────
  React.useEffect(() => {
    if (!pdfBuffer) return;
    let cancelled = false;
    (async () => {
      try {
        const pdfjsLib = await getPdfjs();
        const rendered = await renderPdfDesign(pdfjsLib, pdfBuffer.slice(0), scale);
        if (cancelled) return;
        setPages(rendered);
        setBlocks(rendered.flatMap((p) => p.blocks));
        setPdfStatus("ready");
        if (rendered.length) handleNaturalWidth(rendered[0].w / scale);
      } catch (e) {
        if (!cancelled) {
          console.warn("Design PDF render failed", e);
          setPdfStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfBuffer, scale, handleNaturalWidth]);

  // ── Rebuilt PDF path: load the saved description and page backgrounds ──
  React.useEffect(() => {
    if (!isRebuild) return;
    let cancelled = false;
    let urls: string[] = [];
    (async () => {
      setPdfStatus("loading");
      const supabase = createClient();
      try {
        const model = await loadRebuildModel(supabase, page.id);
        if (!model) throw new Error("No rebuilt design saved for this page");
        urls = await loadBackgrounds(supabase, model);
        if (cancelled) return;
        setRebuild({ model, backgrounds: urls });
        setPdfStatus("ready");
        const loaded = await loadPieces(supabase, model);
        urls = [...urls, ...loaded.urls];
        if (cancelled) return;
        setPieces(loaded.pages);
      } catch (e) {
        if (!cancelled) {
          console.warn("Rebuilt design load failed", e);
          setPdfStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [isRebuild, page.id, rebuildVersion]);

  // Re-derive pages/blocks from the rebuilt design at the live zoom.
  React.useEffect(() => {
    if (!rebuild) return;
    const rendered = rebuildToRendered(rebuild.model, rebuild.backgrounds, scale);
    // Synchronous derivation from already-loaded state (same as the Figma path below).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPages(rendered);
    setBlocks(rendered.flatMap((p) => p.blocks));
    if (rebuild.model.pages.length) handleNaturalWidth(rebuild.model.pages[0].w);
  }, [rebuild, scale, handleNaturalWidth]);

  // ── Photos of a rebuilt page: replace a picture, crop / zoom it (lib/pdf-photos) ──
  const [photoEdits, setPhotoEdits] = React.useState<Record<string, PhotoEdit>>({});
  const [photoImgs, setPhotoImgs] = React.useState<Record<string, HTMLImageElement>>({});
  const [selectedPhoto, setSelectedPhoto] = React.useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = React.useState<string | null>(null);
  // The crop being adjusted, shown live, saved on Done.
  const [cropDraft, setCropDraft] = React.useState<PhotoEdit | null>(null);
  const photoFileRef = React.useRef<HTMLInputElement>(null);
  const photoTarget = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!isRebuild) return;
    let cancelled = false;
    loadPhotoEdits(createClient(), page.id)
      .then((e) => !cancelled && setPhotoEdits(e))
      .catch((e) => console.warn("Photo edits load failed", e));
    return () => {
      cancelled = true;
    };
  }, [isRebuild, page.id, rebuildVersion]);

  const liveEdits = React.useMemo(() => (cropDraft ? { ...photoEdits, [cropDraft.piece]: cropDraft } : photoEdits), [photoEdits, cropDraft]);

  // The picture's layer in the model, and the file an edit draws in it.
  const layerOf = React.useCallback(
    (piece: string) => {
      const [pi, li] = piece.split(":").map(Number);
      const pg = rebuild?.model.pages[pi];
      const l = pg?.layers[li];
      return pg && l?.kind === "image" ? { layer: l, path: (e: PhotoEdit) => e.path ?? pg.images[l.src] } : null;
    },
    [rebuild],
  );

  // Download the files the edits need (each once).
  const photoUrls = React.useRef<string[]>([]);
  const photoLoading = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    const supabase = createClient();
    for (const e of Object.values(liveEdits)) {
      const path = layerOf(e.piece)?.path(e);
      if (!path || photoImgs[path] || photoLoading.current.has(path)) continue;
      photoLoading.current.add(path);
      downloadPhoto(supabase, path)
        .then(({ img, url }) => {
          photoUrls.current.push(url);
          setPhotoImgs((m) => ({ ...m, [path]: img }));
        })
        .catch((err) => console.warn("Photo download failed", err))
        .finally(() => photoLoading.current.delete(path));
    }
  }, [liveEdits, layerOf, photoImgs]);
  React.useEffect(() => () => photoUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  /** Where an edit puts its image (PDF points), with the pan kept over the frame; null until its file is loaded. */
  const placeEdit = React.useCallback(
    (e: PhotoEdit) => {
      const found = layerOf(e.piece);
      const path = found?.path(e);
      const img = path ? photoImgs[path] : undefined;
      if (!found || !img) return null;
      const { layer } = found;
      const base = e.path ? coverBox(layer.frame, img.naturalWidth, img.naturalHeight) : layer.box;
      return { img, layer, ...croppedBox(base, layer.frame, e.zoom, e.dx, e.dy) };
    },
    [layerOf, photoImgs],
  );

  // The pieces at the live zoom, per page, in the shape DesignPage draws —
  // edited pictures drawn from their new file / crop — and the frames to redraw.
  const { stacks, patches, photoFrames } = React.useMemo(() => {
    if (!pieces) return { stacks: null, patches: null, photoFrames: null };
    const sc = (b: [number, number, number, number]): StackBox => [b[0] * scale, b[1] * scale, b[2] * scale, b[3] * scale];
    const stacks: StackPiece[][] = [];
    const patches: StackBox[][] = [];
    const photoFrames: OverlayPhoto[][] = [];
    for (const page of pieces) {
      const st: StackPiece[] = [];
      const pa: StackBox[] = [];
      const ph: OverlayPhoto[] = [];
      for (const p of page) {
        if (p.kind === "vector") {
          st.push({ kind: "vector", img: p.img, box: sc(p.box) });
          continue;
        }
        const f = p.orig.frame;
        // Photos big enough to aim at and visible (hidden carousel slides have no opacity).
        if (f[2] - f[0] >= 16 && f[3] - f[1] >= 16 && p.orig.opacity > 0.05) ph.push({ piece: p.piece, frame: sc(f) });
        const e = liveEdits[p.piece];
        const placed = e ? placeEdit(e) : null;
        if (!placed) {
          st.push({ kind: "image", img: p.img, box: sc(p.box), frame: sc(p.frame), radius: p.radius * scale, opacity: p.opacity });
          continue;
        }
        st.push({ kind: "image", img: placed.img, box: sc(placed.box), frame: sc(f), radius: p.orig.radius * scale, opacity: p.orig.opacity });
        // Redraw both the frame and the area the original was baked into.
        pa.push(sc([Math.min(f[0], p.frame[0]), Math.min(f[1], p.frame[1]), Math.max(f[2], p.frame[2]), Math.max(f[3], p.frame[3])]));
      }
      stacks.push(st);
      patches.push(pa);
      photoFrames.push(ph);
    }
    return { stacks, patches, photoFrames };
  }, [pieces, scale, liveEdits, placeEdit]);

  const savePhoto = React.useCallback(
    async (piece: string, run: () => Promise<void>) => {
      setPhotoBusy(piece);
      setSaveStatus("saving");
      try {
        await run();
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2200);
      } catch (e) {
        setSaveStatus("idle");
        console.warn("Photo save failed", e);
        alert(e instanceof Error ? e.message : "The photo couldn't be saved. Try again.");
      } finally {
        setPhotoBusy(null);
      }
    },
    [],
  );

  const onPhotoFile = async (file: File | null) => {
    const piece = photoTarget.current;
    photoTarget.current = null;
    if (!file || !piece) return;
    await savePhoto(piece, async () => {
      const supabase = createClient();
      const path = await uploadPhoto(supabase, project.id, page.id, piece, file);
      const edit: PhotoEdit = { piece, path, zoom: 1, dx: 0, dy: 0 };
      await savePhotoEdit(supabase, page.id, edit);
      setPhotoEdits((m) => ({ ...m, [piece]: edit }));
    });
  };

  const resetPhoto = (piece: string) =>
    savePhoto(piece, async () => {
      await deletePhotoEdit(createClient(), page.id, piece);
      setPhotoEdits((m) => {
        const n = { ...m };
        delete n[piece];
        return n;
      });
    });

  // Crop: pan in page px → PDF points; zoom and pan kept so the image covers its frame.
  const adjustCrop = React.useCallback(
    (change: (d: PhotoEdit) => PhotoEdit) =>
      setCropDraft((d) => {
        if (!d) return d;
        const next = change(d);
        const placed = placeEdit(next);
        return placed ? { ...next, dx: placed.dx, dy: placed.dy } : next;
      }),
    [placeEdit],
  );

  const finishCrop = async () => {
    const d = cropDraft;
    if (!d) return;
    setCropDraft(null);
    const unchanged = d.path === null && d.zoom === 1 && Math.abs(d.dx) < 0.01 && Math.abs(d.dy) < 0.01;
    const before = photoEdits[d.piece];
    if (unchanged && !before) return;
    if (before && before.path === d.path && before.zoom === d.zoom && before.dx === d.dx && before.dy === d.dy) return;
    // Show the result right away; the save follows.
    setPhotoEdits((m) => {
      const n = { ...m };
      if (unchanged) delete n[d.piece];
      else n[d.piece] = d;
      return n;
    });
    await savePhoto(d.piece, async () => {
      if (unchanged) await deletePhotoEdit(createClient(), page.id, d.piece);
      else await savePhotoEdit(createClient(), page.id, d);
    });
  };

  const cropState = React.useMemo(() => {
    if (!cropDraft) return null;
    const placed = placeEdit(cropDraft);
    const box = placed?.box;
    return {
      piece: cropDraft.piece,
      zoom: cropDraft.zoom,
      preview: placed && box ? { url: placed.img.src, box: [box[0] * scale, box[1] * scale, box[2] * scale, box[3] * scale] as StackBox } : undefined,
    };
  }, [cropDraft, placeEdit, scale]);

  const editedPhotos = React.useMemo(() => new Set(Object.keys(photoEdits)), [photoEdits]);

  const report = React.useMemo(
    () => (rebuild ? rebuild.model.pages.flatMap((p, i) => p.report.map((r) => ({ ...r, page: i + 1 }))) : []),
    [rebuild],
  );

  // ── Figma path: fetch the design fetched at import/resync time ─────────
  React.useEffect(() => {
    if (page.design_source !== "figma") return;
    let cancelled = false;
    (async () => {
      setPdfStatus("loading");
      const supabase = createClient();
      const { data } = await supabase.from("figma_designs").select("*").eq("page_id", page.id).maybeSingle();
      if (cancelled) return;
      if (!data) {
        setPdfStatus("error");
        return;
      }
      setFigmaDesign(data as unknown as FigmaDesign);
      setPdfStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [page.id, page.design_source]);

  // Background colour behind each Figma text block, sampled from the
  // rendered frame PNG (Figma's image host allows CORS reads) so an edited
  // block lifts onto its real background instead of a white pill.
  const [figmaBg, setFigmaBg] = React.useState<Record<string, [number, number, number]>>({});
  React.useEffect(() => {
    if (!figmaDesign) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      canvas.width = figmaDesign.width;
      canvas.height = figmaDesign.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        const out: Record<string, [number, number, number]> = {};
        for (const b of figmaDesign.blocks) out[b.id] = sampleBg(ctx, b.x, b.y, b.w, b.h);
        setFigmaBg(out);
      } catch (e) {
        console.warn("Figma background sampling failed", e);
      }
    };
    img.src = figmaDesign.image_url;
    return () => {
      cancelled = true;
    };
  }, [figmaDesign]);

  // Re-derive the renderer-agnostic `pages`/`blocks` state from the Figma
  // design whenever it loads or the zoom scale changes — mirrors the PDF
  // effect above, just without needing to re-render anything (Figma's
  // rendered PNG + exact block geometry is already fetched at import time).
  React.useEffect(() => {
    if (!figmaDesign) return;
    const s = scale;
    const scaledBlocks: DesignBlock[] = figmaDesign.blocks.map((b) => {
      const bg = figmaBg[b.id] || [255, 255, 255];
      return {
        id: b.id,
        pageIndex: 0,
        x: b.x * s,
        top: b.y * s,
        w: b.w * s,
        h: b.h * s,
        fontH: b.fontSize * s,
        text: b.text,
        bg,
        dark: luminance(bg) < 0.5,
        kind: b.fontSize >= 30 ? "heading" : b.fontSize >= 22 ? "subhead" : b.fontSize >= 17 ? "lead" : "body",
        color: b.color,
        weight: b.fontWeight,
        textAlign: b.textAlign,
        wrap: true,
        lineHeight: b.lineHeight ? b.lineHeight * s : undefined,
        fontFamily: b.fontFamily ? cssFamily(b.fontFamily) : undefined,
      };
    });
    // Deriving pages/blocks synchronously from already-fetched figmaDesign
    // state — no external I/O to defer past a microtask, unlike the async
    // fetch effects above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPages([
      {
        pageIndex: 0,
        w: Math.round(figmaDesign.width * s),
        h: Math.round(figmaDesign.height * s),
        url: figmaDesign.image_url,
        blocks: scaledBlocks,
      },
    ]);
    setBlocks(scaledBlocks);
    setFigmaFonts([...new Set(figmaDesign.blocks.map((b) => b.fontFamily).filter((f): f is string => !!f))]);
    handleNaturalWidth(figmaDesign.width);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [figmaDesign, figmaBg, scale]);

  // Edits saved before paragraph merging (and before block ids stopped
  // depending on zoom) are keyed per source line. Carry them over onto the
  // block that now contains that line; the old rows stay in design_edits
  // until the block is reset, so this re-applies on each load until the
  // block is edited again (which saves it under its current id).
  const legacyKeysRef = React.useRef<Record<string, string[]>>({});
  React.useEffect(() => {
    if (!editsLoaded || !blocks.length) return;
    const currentIds = new Set(blocks.map((b) => b.id));
    setEdits((prev) => {
      const orphans = Object.keys(prev).filter((k) => !currentIds.has(k));
      if (!orphans.length) return prev;
      const consumed = new Set<string>();
      let next = prev;
      for (const b of blocks) {
        if (!b.sourceLines || prev[b.id] !== undefined) continue;
        const used: string[] = [];
        const lines = b.sourceLines.map((line) => {
          const prefix = legacyLineIdPrefix(b.pageIndex, line);
          const key = orphans.find((k) => !consumed.has(k) && k.startsWith(prefix));
          if (key === undefined) return line;
          consumed.add(key);
          used.push(key);
          return prev[key];
        });
        if (!used.length) continue;
        legacyKeysRef.current[b.id] = used;
        const merged = joinLines(lines);
        if (merged !== b.text) next = { ...next, [b.id]: merged };
      }
      return next;
    });
  }, [blocks, editsLoaded, setEdits]);

  // Scroll the active block into view when picked from the side panel.
  React.useEffect(() => {
    if (!activeId || pdfStatus !== "ready") return;
    const pageIdx = pages.findIndex((pg) => pg.blocks.some((b) => b.id === activeId));
    if (pageIdx < 0) return;
    const block = pages[pageIdx].blocks.find((b) => b.id === activeId);
    const pageEl = pageRefs.current[pageIdx];
    const wrap = wrapRef.current;
    if (pageEl && wrap && block) {
      const target = pageEl.offsetTop + block.top + (flowShiftRef.current[block.id] || 0) - 140;
      wrap.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    }
  }, [activeId, pdfStatus, pages]);

  // Scroll the matching field card into view when a block is clicked
  // directly on the design (the reverse of the effect above).
  React.useEffect(() => {
    if (!activeId) return;
    fieldRefs.current[activeId]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeId]);

  const onChange = React.useCallback(
    (id: string, text: string) => {
      setEdits((prev) => ({ ...prev, [id]: text }));
    },
    [setEdits],
  );

  const persistBlock = React.useCallback(
    async (id: string) => {
      const content = editsRef.current[id];
      if (content === undefined) return;
      const supabase = createClient();
      await supabase.from("design_edits").upsert({ page_id: page.id, block_id: id, content });
    },
    [page.id],
  );

  const resetBlock = React.useCallback(
    async (id: string) => {
      const legacy = legacyKeysRef.current[id] || [];
      delete legacyKeysRef.current[id];
      setEdits((prev) => {
        const n = { ...prev };
        delete n[id];
        legacy.forEach((k) => delete n[k]);
        return n;
      });
      const supabase = createClient();
      await supabase.from("design_edits").delete().eq("page_id", page.id).in("block_id", [id, ...legacy]);
    },
    [page.id, setEdits],
  );

  const curText = (b: DesignBlock) => (edits[b.id] !== undefined ? edits[b.id] : b.text);
  const isEdited = (b: DesignBlock) => edits[b.id] !== undefined && edits[b.id] !== b.text;
  const editedCount = blocks.filter(isEdited).length;

  // Field shape shared with AISuggestButton / SEOPanel / CommentButton.
  const kindSeen: Record<string, number> = {};
  const fields = blocks.map((b) => {
    kindSeen[b.kind] = (kindSeen[b.kind] || 0) + 1;
    return {
      id: b.id,
      label: `${KIND_LABEL[b.kind]} ${kindSeen[b.kind]}`,
      content: curText(b),
      maxChars: blockMaxChars(b),
    };
  });

  const seo = React.useMemo(
    () => computeSEO(fields.map((f) => ({ id: f.id, content: f.content })), page.name, project.name),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blocks, edits, page.name, project.name],
  );

  // Edits persist per block on blur; Save flushes the focused one and stamps the page.
  const handleSave = async () => {
    setSaveStatus("saving");
    if (activeId) await persistBlock(activeId);
    const supabase = createClient();
    await supabase.from("pages").update({ updated_by_name: user.name }).eq("id", page.id);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2200);
  };

  // Last-round changes, ignoring rows whose before/after are both the design's original text.
  const changeFor = (b: DesignBlock) => {
    const c = round?.changes[b.id];
    return c && (c.before ?? b.text) !== (c.after ?? b.text) ? c : null;
  };

  const flushActive = async () => {
    if (activeId) await persistBlock(activeId);
  };

  // Status changes (status menu, contributor "Submit for Review") save pending
  // edits first, then go through the server action that emails the project.
  const moveTo = async (next: PageStatus) => {
    await flushActive();
    const res = await changePageStatus(page.id, next);
    if (!res.ok) return alert(res.error);
    setPageStatus(next);
    setReviewVersion((v) => v + 1);
  };

  const handleReplace = async (file: File | null) => {
    if (!file) return;
    const prevStatus = pdfStatus;
    setPdfStatus("loading");
    const supabase = createClient();
    // Rebuilt pages: split the new PDF first, so a file that can't be opened
    // (password) is refused before anything is replaced.
    let rebuilt: ReconstructedPage[] | null = null;
    if (isRebuild) {
      try {
        rebuilt = await rebuildPdf(await file.arrayBuffer(), setRebuildProgress);
      } catch (e) {
        setRebuildProgress(null);
        if (e instanceof PdfPasswordError) {
          alert(e.message);
          setPdfStatus(prevStatus);
          return;
        }
        console.warn("PDF rebuild failed, falling back to the image editor", e);
      }
    }
    const path = pdfPath || `${project.id}/${page.id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("pdfs").upload(path, file, { upsert: true, contentType: "application/pdf" });
    if (upErr) {
      console.warn("Design PDF upload failed", upErr);
      setRebuildProgress(null);
      setPdfStatus("error");
      return;
    }
    await supabase.from("pages").update({ pdf_storage_path: path, pdf_filename: file.name }).eq("id", page.id);
    // A new PDF means new block ids — the old per-block edits no longer apply.
    await supabase.from("design_edits").delete().eq("page_id", page.id);
    setEdits({});
    setAutoFit(true);
    if (isRebuild) {
      try {
        if (!rebuilt) throw new Error("Rebuild failed");
        await saveRebuild(supabase, project.id, page.id, rebuilt, setRebuildProgress);
        setPieces(null);
        setPhotoEdits({});
        setSelectedPhoto(null);
        setCropDraft(null);
        setRebuildVersion((v) => v + 1);
      } catch (e) {
        // Keep the page usable with the older image editor.
        console.warn("Falling back to the image editor", e);
        await supabase.from("pages").update({ design_source: "pdf" }).eq("id", page.id);
        setRebuild(null);
        setDesignSource("pdf");
      } finally {
        setRebuildProgress(null);
      }
    }
    setPdfPath(path);
  };

  // Rebuild a page that fell back to the classic editor, from its stored PDF.
  // Block ids come from the same text detection, so existing edits stay attached.
  const retryRebuild = async () => {
    if (!pdfBuffer) return;
    setRetrying(true);
    setRebuildError(null);
    try {
      const supabase = createClient();
      const rebuilt = await rebuildPdf(pdfBuffer.slice(0), setRebuildProgress);
      await saveRebuild(supabase, project.id, page.id, rebuilt, setRebuildProgress);
      const { error } = await supabase.from("pages").update({ design_source: "pdf_html" }).eq("id", page.id);
      if (error) throw error;
      try {
        sessionStorage.removeItem(REBUILD_ERROR_KEY(page.id));
      } catch {
        /* ignore */
      }
      setPieces(null);
      setPhotoEdits({});
      setDesignSource("pdf_html");
    } catch (e) {
      console.warn("PDF rebuild retry failed", e);
      setRebuildError(e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e));
    } finally {
      setRetrying(false);
      setRebuildProgress(null);
    }
  };

  const dismissHint = () => {
    setHint(false);
    try {
      localStorage.setItem("cd-design-hint-seen", "1");
    } catch {
      /* ignore */
    }
  };

  // Batch AI pass over every text block on the design.
  const runAI = async () => {
    if (!blocks.length) return;
    setAiState("processing");
    setAiProgress(0);
    setAiMsgIdx(0);
    const msgInterval = setInterval(() => {
      setAiMsgIdx((i) => (i + 1) % DESIGN_AI_MESSAGES.length);
    }, 1100);
    try {
      const supabase = createClient();
      const upserts: { page_id: string; block_id: string; content: string }[] = [];
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        const maxChars = blockMaxChars(b);
        const suggestions = await mockGenerateFieldSuggestions("Improve writing", curText(b), KIND_LABEL[b.kind], maxChars);
        const best = suggestions[0];
        if (best) {
          const content = best.text.slice(0, maxChars);
          setEdits((prev) => ({ ...prev, [b.id]: content }));
          upserts.push({ page_id: page.id, block_id: b.id, content });
        }
        setAiProgress(Math.round(((i + 1) / blocks.length) * 100));
      }
      clearInterval(msgInterval);
      if (upserts.length) await supabase.from("design_edits").upsert(upserts);
      setAiState("done");
    } catch (e) {
      clearInterval(msgInterval);
      console.warn("AI pass failed", e);
      setAiState("error");
    }
  };

  const z = (d: number) => {
    setAutoFit(false);
    setScale((s) => Math.max(0.4, Math.min(1.8, +(s + d).toFixed(2))));
  };

  const showDesign = !!pdfPath || !!figmaDesign;

  const saveFonts = async (next: DesignFonts) => {
    const supabase = createClient();
    const { error } = await supabase.from("pages").update({ design_fonts: next }).eq("id", page.id);
    if (error) throw error;
    setDesignFonts(next);
  };

  // PDF designs carry no usable font, so edited copy uses the fonts the PM
  // picked for the page (Figma blocks already know their real font).
  const withDesignFont = (b: DesignBlock): DesignBlock => {
    const font = figmaDesign ? null : fontForKind(designFonts, b.kind);
    return font ? { ...b, fontFamily: cssFamily(font) } : b;
  };

  const handleResyncFigma = async () => {
    if (!figmaDesign) return;
    const before = figmaDesign;
    setResyncError(null);
    setPdfStatus("loading");
    const fakeUrl = `https://www.figma.com/design/${before.file_key}/resync?node-id=${before.node_id.replace(/:/g, "-")}`;
    const res = await fetch("/api/figma/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId: page.id, figmaUrl: fakeUrl }),
    });
    if (!res.ok) {
      // The previously imported design is still valid — keep showing it.
      const body = await res.json().catch(() => ({}));
      setResyncError(body.error || `Re-sync failed (${res.status}).`);
      setPdfStatus("ready");
      return;
    }
    const supabase = createClient();
    const { data } = await supabase.from("figma_designs").select("*").eq("page_id", page.id).maybeSingle();
    if (!data) {
      setResyncError("Re-sync finished but the design couldn’t be reloaded. Refresh the page.");
      setPdfStatus("ready");
      return;
    }
    const next = data as unknown as FigmaDesign;
    // A conflict: the text changed in Figma AND was edited in CopyDash to
    // something else. Those need a decision; everything else just updates.
    const prevText = new Map(before.blocks.map((b) => [b.id, b.text]));
    const conflicts: ResyncConflict[] = [];
    for (const b of next.blocks) {
      const prev = prevText.get(b.id);
      const edit = editsRef.current[b.id];
      if (prev === undefined || edit === undefined || edit === prev || b.text === prev || b.text === edit) continue;
      conflicts.push({ id: b.id, figmaText: b.text, editText: edit });
    }
    setFigmaDesign(next);
    setPdfStatus("ready");
    if (conflicts.length) setResyncConflicts(conflicts);
  };

  // Drop the CopyDash edit for each block where the user chose Figma's text.
  const resolveConflicts = async (useFigma: string[]) => {
    setResyncConflicts(null);
    if (!useFigma.length) return;
    setEdits((prev) => {
      const n = { ...prev };
      useFigma.forEach((id) => delete n[id]);
      return n;
    });
    const supabase = createClient();
    const { error } = await supabase.from("design_edits").delete().eq("page_id", page.id).in("block_id", useFigma);
    if (error) setResyncError("Couldn’t save your choices. Please re-sync again.");
  };
  const commentUser = { id: user.id, name: user.name, role: user.role };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "#f7f9fb" }}>
      {/* Header */}
      <div
        style={{
          background: "#fff",
          borderBottom: "1px solid #e4e4e7",
          padding: "0 24px",
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <button
            onClick={onBack}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#71717b", fontSize: 13, padding: "4px 8px", borderRadius: 6, flexShrink: 0 }}
          >
            <Icon name="arrow-left" size={14} /> Back
          </button>
          <div style={{ width: 1, height: 20, background: "#e4e4e7", flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.name}</div>
            <div style={{ fontSize: 11, color: "#71717b", display: "flex", alignItems: "center", gap: 5 }}>
              <Icon name="file-text" size={11} color="#a1a1aa" /> {page.name} · design
            </div>
          </div>
          {role === "pm" ? <StatusPicker status={pageStatus} onChange={(next) => moveTo(next as PageStatus)} /> : <StatusBadge status={pageStatus} />}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 2, border: "1px solid #e4e4e7", borderRadius: 8, padding: 2 }}>
            <button onClick={() => z(-0.1)} style={zoomBtnStyle}>
              −
            </button>
            <span style={{ fontSize: 12, color: "#52525b", fontFamily: "var(--font-mono)", width: 42, textAlign: "center" }}>{Math.round(scale * 100)}%</span>
            <button onClick={() => z(0.1)} style={zoomBtnStyle}>
              +
            </button>
          </div>
          {fields.length > 0 && <SEOToggle open={seoOpen} onToggle={() => setSeoOpen((o) => !o)} score={seo.pct} />}
          {role === "pm" && (
            <>
              {figmaDesign ? (
                <Btn variant="outline" size="sm" icon="link" onClick={handleResyncFigma} disabled={pdfStatus === "loading"}>
                  Re-sync from Figma
                </Btn>
              ) : (
                <>
                  {pdfPath && (
                    <Btn variant="outline" size="sm" icon="type" onClick={() => setFontsOpen(true)}>
                      Fonts
                    </Btn>
                  )}
                  {report.length > 0 && (
                    <Btn variant="outline" size="sm" icon="alert-circle" onClick={() => setReportOpen(true)}>
                      Conversion report · {report.length}
                    </Btn>
                  )}
                  <input ref={fileRef} type="file" accept=".pdf,application/pdf" style={{ display: "none" }} onChange={(e) => handleReplace(e.target.files?.[0] || null)} />
                  <Btn variant="outline" size="sm" icon="upload" onClick={() => fileRef.current?.click()}>
                    Replace
                  </Btn>
                </>
              )}
              <Btn variant="outline" size="sm" icon="download" onClick={() => setExportOpen(true)} disabled={!blocks.length}>
                Export
              </Btn>
            </>
          )}
          {role === "client" && pageStatus === "In Progress" && (
            <Btn variant="outline" size="sm" onClick={() => moveTo("Pending Review")}>
              Submit for Review
            </Btn>
          )}
          <Btn variant="primary" size="sm" onClick={() => handleSave()} icon={saveStatus === "saved" ? "check" : undefined}>
            {saveStatus === "saving" ? (
              <>
                <Spinner size={13} color="#fff" /> Saving…
              </>
            ) : saveStatus === "saved" ? (
              "Saved!"
            ) : (
              "Save"
            )}
          </Btn>
        </div>
      </div>

      {/* Body — Split Pane */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        {/* Left: the real design */}
        <div ref={paneRef} style={{ flex: 1, minWidth: 320, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0, position: "relative" }}>
          {resyncError && (
            <div
              role="alert"
              style={{
                position: "absolute",
                top: 16,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 21,
                maxWidth: "calc(100% - 32px)",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#b91c1c",
                borderRadius: 10,
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
              }}
            >
              <Icon name="alert-circle" size={14} color="#b91c1c" />
              <span style={{ fontSize: 13, fontFamily: "var(--font-sans)" }}>Re-sync failed: {resyncError}</span>
              <button onClick={() => setResyncError(null)} aria-label="Dismiss" style={{ background: "none", border: "none", cursor: "pointer", color: "#b91c1c", padding: 2, display: "flex" }}>
                <Icon name="x" size={13} />
              </button>
            </div>
          )}

          {rebuildFailed && (
            <div
              role="alert"
              style={{
                position: "absolute",
                top: 16,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 22,
                maxWidth: "calc(100% - 32px)",
                width: 560,
                background: "#fffbeb",
                border: "1px solid #fde68a",
                color: "#92400e",
                borderRadius: 10,
                padding: "10px 14px",
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
              }}
            >
              <Icon name="alert-circle" size={14} color="#b45309" style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 13, lineHeight: 1.45, fontFamily: "var(--font-sans)" }}>
                This PDF couldn&apos;t be rebuilt as an editable page, so it opened in the classic editor.
                {rebuildError && <div style={{ fontSize: 12, marginTop: 2, color: "#b45309", fontFamily: "var(--font-mono)", wordBreak: "break-word" }}>{rebuildError}</div>}
                {retrying && rebuildProgress && <div style={{ fontSize: 12, marginTop: 2 }}>{rebuildProgress}</div>}
              </div>
              {role === "pm" && (
                <Btn variant="outline" size="sm" onClick={retryRebuild} disabled={retrying || !pdfBuffer}>
                  {retrying ? "Rebuilding…" : "Try again"}
                </Btn>
              )}
            </div>
          )}

          {hint && editable && showDesign && (
            <div
              style={{
                position: "absolute",
                top: 16,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 20,
                background: "#09090b",
                color: "#fff",
                borderRadius: 10,
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                boxShadow: "0 6px 24px rgba(0,0,0,0.22)",
              }}
            >
              <Icon name="edit" size={14} color="#c4b4ff" />
              <span style={{ fontSize: 13, fontFamily: "var(--font-sans)" }}>Click any text on the design to edit it in place.</span>
              <button onClick={dismissHint} style={{ background: "none", border: "none", cursor: "pointer", color: "#a1a1aa", padding: 2, display: "flex" }}>
                <Icon name="x" size={13} />
              </button>
            </div>
          )}

          {showDesign ? (
            <div ref={wrapRef} style={{ flex: 1, overflow: "auto", background: "#eceef1", position: "relative" }}>
              {pdfStatus === "loading" && (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: "#71717b" }}>
                  <Spinner size={26} color="#7f22fe" />
                  <div style={{ fontSize: 13, fontFamily: "var(--font-sans)" }}>{rebuildProgress ? "Rebuilding the design…" : "Rendering design…"}</div>
                  {rebuildProgress && <div style={{ fontSize: 12, color: "#a1a1aa", fontFamily: "var(--font-sans)" }}>{rebuildProgress}</div>}
                </div>
              )}
              {pdfStatus === "error" && (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "#71717b", padding: 40, textAlign: "center" }}>
                  <Icon name="file-text" size={28} color="#d4d4d8" />
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)" }}>Design unavailable</div>
                  <div style={{ fontSize: 12, maxWidth: 280, fontFamily: "var(--font-body)" }}>The PDF couldn&apos;t be loaded. Ask the project manager to re-upload the design.</div>
                </div>
              )}
              {isRebuild && (
                <input
                  ref={photoFileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    e.target.value = "";
                    onPhotoFile(f);
                  }}
                />
              )}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28, padding: "32px 24px 80px" }}>
                {pages.map((pg) => (
                  <DesignPage
                    key={`${pg.pageIndex}-${pg.w}`}
                    pg={pg}
                    pageRef={(el) => {
                      pageRefs.current[pg.pageIndex] = el;
                    }}
                    onFlow={onFlow}
                    liveText={isRebuild}
                    stack={isRebuild ? stacks?.[pg.pageIndex] : undefined}
                    patches={isRebuild ? patches?.[pg.pageIndex] : undefined}
                    renderOverlay={
                      isRebuild && editable && photoFrames?.[pg.pageIndex]?.length
                        ? (shiftAt) => (
                            <PhotoOverlay
                              photos={photoFrames[pg.pageIndex]}
                              shiftAt={shiftAt}
                              selected={selectedPhoto}
                              edited={editedPhotos}
                              busy={photoBusy}
                              crop={cropState}
                              onSelect={(piece) => {
                                setSelectedPhoto(piece);
                                if (piece) setActiveId(null);
                              }}
                              onReplace={(piece) => {
                                photoTarget.current = piece;
                                photoFileRef.current?.click();
                              }}
                              onStartCrop={(piece) => setCropDraft(photoEdits[piece] ?? { piece, path: null, zoom: 1, dx: 0, dy: 0 })}
                              onReset={resetPhoto}
                              onPan={(dx, dy) => adjustCrop((d) => ({ ...d, dx: d.dx + dx / scale, dy: d.dy + dy / scale }))}
                              onZoom={(zoom) => adjustCrop((d) => ({ ...d, zoom }))}
                              onCropDone={finishCrop}
                              onCropCancel={() => setCropDraft(null)}
                            />
                          )
                        : undefined
                    }
                    renderBlock={(b, layout) => (
                      <EditableBlock
                        key={b.id}
                        block={withDesignFont(b)}
                        value={editsLoaded ? edits[b.id] : b.text}
                        onChange={onChange}
                        onCommit={persistBlock}
                        onActivate={setActiveId}
                        active={activeId === b.id}
                        editable={editable}
                        layout={layout}
                      />
                    )}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "#71717b", padding: 40, textAlign: "center" }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: "#f4f4f5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="upload" size={22} color="#a1a1aa" />
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)" }}>No design uploaded yet</div>
              <div style={{ fontSize: 12, maxWidth: 300, fontFamily: "var(--font-body)" }}>
                {role === "pm" ? "Upload the page design as a PDF (exported from Figma) to start editing the copy on it." : "The design for this page hasn’t been added yet."}
              </div>
              {role === "pm" && (
                <Btn variant="primary" size="sm" icon="upload" onClick={() => fileRef.current?.click()}>
                  Upload design PDF
                </Btn>
              )}
            </div>
          )}
        </div>

        <ResizeHandle onMouseDown={onResizeFields} />

        {/* Right: Editor Fields — same mechanism as the standard editor. Drag
            the handle above to resize (persisted), clamped to a 320px min. */}
        <div style={{ flex: `0 0 ${fieldsWidth}px`, width: fieldsWidth, minWidth: 320, background: "#fff", display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
          <div style={{ padding: "16px 24px", borderBottom: "1px solid #e4e4e7", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="edit" size={15} color="#71717b" />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Text Fields</span>
              <span style={{ fontSize: 11, color: "#a1a1aa", fontFamily: "var(--font-mono)" }}>{blocks.length}</span>
            </div>
            <Btn variant="ghost" size="sm" icon="sparkles" onClick={runAI} disabled={aiState === "processing" || !blocks.length || !editable}>
              {aiState === "processing" ? "Processing…" : "Improve with AI"}
            </Btn>
          </div>

          {aiState === "processing" && (
            <div style={{ padding: "24px", background: "#f5f3ff", borderBottom: "1px solid #e9e4ff", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <Spinner size={18} color="#7f22fe" />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#7f22fe", fontFamily: "var(--font-sans)" }}>AI Improving Copy</div>
                  <div style={{ fontSize: 12, color: "#a684ff", marginTop: 2 }}>{DESIGN_AI_MESSAGES[aiMsgIdx]}</div>
                </div>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: "#ddd6fe", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${aiProgress}%`, background: "#7f22fe", borderRadius: 2, transition: "width 0.4s ease" }} />
              </div>
            </div>
          )}

          {aiState === "done" && (
            <div style={{ padding: "10px 24px", background: "#f0fdf4", borderBottom: "1px solid #bbf7d0", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="check-circle" size={14} color="#15803d" />
              <span style={{ fontSize: 12, color: "#15803d", fontFamily: "var(--font-sans)", fontWeight: 500 }}>AI updated the copy on {editedCount} of {blocks.length} blocks</span>
            </div>
          )}

          {aiState === "error" && (
            <div style={{ padding: "10px 24px", background: "#fef2f2", borderBottom: "1px solid #fecaca", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="alert-circle" size={14} color="#b91c1c" />
              <span style={{ fontSize: 12, color: "#b91c1c", fontFamily: "var(--font-sans)", fontWeight: 500 }}>AI pass failed — edit manually or try again</span>
            </div>
          )}

          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
            {blocks.length === 0 && (
              <div style={{ padding: "48px 12px", textAlign: "center", color: "#a1a1aa", fontSize: 13 }}>
                {showDesign ? "Reading text from the design…" : "Upload a design to see its text fields here."}
              </div>
            )}
            {blocks.map((b, i) => {
              const change = changeFor(b);
              const field = fields[i];
              const edited = isEdited(b);
              const active = activeId === b.id;
              return (
                <div
                  key={b.id}
                  ref={(el) => {
                    fieldRefs.current[b.id] = el;
                  }}
                  onClick={() => setActiveId(b.id)}
                  onBlur={() => persistBlock(b.id)}
                  style={{ padding: 16, borderRadius: 10, border: `1px solid ${active ? "#c4b4ff" : "#f0f0f0"}`, background: active ? "#fdfcff" : "#fafafa", transition: "all 0.15s", cursor: "text" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#7f22fe", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--font-sans)", opacity: 0.7, display: "flex", alignItems: "center", gap: 6 }}>
                      {edited && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7f22fe" }} />}
                      {field.label}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {edited && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            resetBlock(b.id);
                          }}
                          title="Reset to original"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#a1a1aa", padding: 2, display: "flex", borderRadius: 4 }}
                        >
                          <Icon name="x" size={12} />
                        </button>
                      )}
                      <AISuggestButton field={field} onApply={(text) => onChange(b.id, text)} />
                      <CommentButton projectId={project.id} pageId={page.id} fieldKey={b.id} user={commentUser} />
                    </div>
                  </div>
                  <FieldTextarea value={field.content} onChange={(v) => onChange(b.id, v)} maxLength={field.maxChars} rows={b.kind === "body" || b.kind === "lead" ? 3 : 2} disabled={!editable} />
                  {isParagraph(b) && <WordCount text={field.content} original={b.text} />}
                  {flowInfo[b.id]?.overflow && (
                    <div style={{ marginTop: 8, padding: "7px 10px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a", display: "flex", gap: 7, alignItems: "flex-start" }}>
                      <Icon name="alert-circle" size={13} color="#b45309" style={{ marginTop: 1, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, lineHeight: 1.45, color: "#92400e", fontFamily: "var(--font-body)" }}>
                        Too long for the space in the design — everything below is pushed down. Shorten it to keep the original layout.
                      </span>
                    </div>
                  )}
                  {change ? (
                    <ChangeNote change={change} original={b.text} />
                  ) : edited && (
                    <div style={{ marginTop: 8, fontSize: 11, color: "#a1a1aa", fontFamily: "var(--font-body)", display: "flex", gap: 5, alignItems: "baseline" }}>
                      <span style={{ flexShrink: 0 }}>Original:</span>
                      <span style={{ textDecoration: "line-through", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.text}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* SEO Drawer */}
      {seoOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: 380,
            zIndex: 200,
            background: "#fff",
            borderLeft: "1px solid #e4e4e7",
            boxShadow: "-8px 0 32px rgba(0,0,0,0.08)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <SEOPanel fields={fields} pageName={page.name} projectName={project.name} onClose={() => setSeoOpen(false)} />
        </div>
      )}

      <Modal open={exportOpen} onClose={() => setExportOpen(false)} title="Export Content" width={480}>
        <ExportPanel fields={fields} onClose={() => setExportOpen(false)} />
      </Modal>

      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Conversion report" width={520}>
        <ConversionReport items={report} pages={rebuild?.model.pages.length ?? 1} />
      </Modal>

      <Modal open={fontsOpen} onClose={() => setFontsOpen(false)} title="Design Fonts" width={480}>
        {fontsOpen && <FontsPanel value={designFonts} onSave={saveFonts} onClose={() => setFontsOpen(false)} />}
      </Modal>

      {/* Closing without choosing keeps every CopyDash edit — nothing is lost. */}
      <Modal open={!!resyncConflicts} onClose={() => resolveConflicts([])} title="Text changed in Figma and CopyDash" width={640}>
        {resyncConflicts && <ResyncConflictsPanel conflicts={resyncConflicts} labelFor={(id) => fields.find((f) => f.id === id)?.label || "Text"} onResolve={resolveConflicts} />}
      </Modal>
    </div>
  );
}

// What the PDF → editable page conversion couldn't keep as is (lib/pdf-reconstruct).
function ConversionReport({ items, pages }: { items: { code: string; message: string; count?: number; page: number }[]; pages: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ margin: 0, fontSize: 13, color: "#71717b", lineHeight: 1.5, fontFamily: "var(--font-body)" }}>
        The PDF was rebuilt into an editable page: background, pictures and live text. Most of it looks like the original; these points couldn&apos;t be converted exactly.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 380, overflowY: "auto" }}>
        {items.map((r, i) => (
          <div key={`${r.page}-${r.code}-${i}`} style={{ padding: "10px 12px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a", display: "flex", gap: 8, alignItems: "flex-start" }}>
            <Icon name="alert-circle" size={14} color="#b45309" style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ fontSize: 13, color: "#92400e", lineHeight: 1.5, fontFamily: "var(--font-body)" }}>
              {pages > 1 && <strong style={{ fontWeight: 600 }}>Page {r.page} · </strong>}
              {r.message}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Paragraph blocks wrap inside the design's original box, so copy that runs
// noticeably longer than the original will likely overflow the layout.
function WordCount({ text, original }: { text: string; original: string }) {
  const words = countWords(text);
  const orig = countWords(original);
  const tooLong = words > orig * 1.15 && words - orig >= 3;
  const color = tooLong ? "#b45309" : "#a1a1aa";
  return (
    <div style={{ marginTop: 8, fontSize: 11, color, fontFamily: "var(--font-body)", display: "flex", gap: 5, alignItems: "center" }}>
      {tooLong && <Icon name="alert-circle" size={12} color={color} />}
      <span style={{ fontFamily: "var(--font-mono)" }}>
        {words}/{orig} words
      </span>
      {tooLong && <span>· longer than the original, may not fit the design</span>}
    </div>
  );
}

interface ResyncConflict {
  id: string;
  figmaText: string;
  editText: string;
}

type ConflictChoice = "copydash" | "figma";

function ResyncConflictsPanel({ conflicts, labelFor, onResolve }: { conflicts: ResyncConflict[]; labelFor: (id: string) => string; onResolve: (useFigma: string[]) => void }) {
  const [choice, setChoice] = React.useState<Record<string, ConflictChoice>>(() => Object.fromEntries(conflicts.map((c) => [c.id, "copydash"])));
  const setAll = (v: ConflictChoice) => setChoice(Object.fromEntries(conflicts.map((c) => [c.id, v])));
  const useFigma = conflicts.filter((c) => choice[c.id] === "figma").map((c) => c.id);

  const option = (c: ResyncConflict, v: ConflictChoice, title: string, text: string) => {
    const selected = choice[c.id] === v;
    return (
      <button
        type="button"
        onClick={() => setChoice((p) => ({ ...p, [c.id]: v }))}
        aria-pressed={selected}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: "left",
          padding: "10px 12px",
          borderRadius: 8,
          border: `1px solid ${selected ? "#8e51ff" : "#e4e4e7"}`,
          background: selected ? "#f5f3ff" : "#fff",
          boxShadow: selected ? "0 0 0 1px #8e51ff" : "none",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: selected ? "#7f22fe" : "#71717b", fontFamily: "var(--font-sans)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", border: `1.5px solid ${selected ? "#7f22fe" : "#d4d4d8"}`, background: selected ? "radial-gradient(#7f22fe 0 3px, transparent 3.5px)" : "#fff", flexShrink: 0 }} />
          {title}
        </span>
        <span style={{ fontSize: 13, color: "#09090b", fontFamily: "var(--font-body)", lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{text}</span>
      </button>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ margin: 0, fontSize: 13, color: "#71717b", lineHeight: 1.5, fontFamily: "var(--font-body)" }}>
        {conflicts.length === 1 ? "This text was" : `These ${conflicts.length} texts were`} changed in Figma since the last sync, and also edited here. Choose which version to keep — everything else has been updated from Figma.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn variant="outline" size="sm" onClick={() => setAll("copydash")}>
          Keep all CopyDash edits
        </Btn>
        <Btn variant="outline" size="sm" onClick={() => setAll("figma")}>
          Use all Figma texts
        </Btn>
      </div>
      <div style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
        {conflicts.map((c) => (
          <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#7f22fe", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--font-sans)", opacity: 0.7 }}>{labelFor(c.id)}</div>
            <div style={{ display: "flex", gap: 8 }}>
              {option(c, "copydash", "CopyDash edit", c.editText)}
              {option(c, "figma", "New in Figma", c.figmaText)}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Btn variant="primary" size="sm" onClick={() => onResolve(useFigma)}>
          {useFigma.length ? `Apply — use Figma for ${useFigma.length}` : "Keep CopyDash edits"}
        </Btn>
      </div>
    </div>
  );
}

const FONT_OPTIONS = FONT_NAMES.map((n) => ({ value: n, label: n }));

const FONT_SLOTS = [
  { key: "heading", label: "Headings", sample: "Your headline, in place", size: 20, weight: 700 },
  { key: "body", label: "Body text", sample: "Body copy preview — the quick brown fox jumps over the lazy dog.", size: 14, weight: 400 },
] as const;

function FontsPanel({ value, onSave, onClose }: { value: DesignFonts | null; onSave: (next: DesignFonts) => Promise<void>; onClose: () => void }) {
  useFontPreviews(true);
  const [draft, setDraft] = React.useState<DesignFonts>(value || {});
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      onClose();
    } catch (e) {
      console.warn("Saving design fonts failed", e);
      setError("Couldn’t save the fonts. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <p style={{ margin: 0, fontSize: 13, color: "#71717b", lineHeight: 1.5, fontFamily: "var(--font-body)" }}>
        PDFs don&apos;t tell us which fonts they use, so edited text falls back to a default font. Pick the design&apos;s fonts so edits match the page — everyone editing this page will see them.
      </p>
      {FONT_SLOTS.map((slot) => {
        const font = draft[slot.key];
        return (
          <div key={slot.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SelectInput label={slot.label} value={font || ""} onChange={(v) => setDraft((d) => ({ ...d, [slot.key]: v || null }))} options={FONT_OPTIONS} placeholder="Default font" />
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #f0f0f0",
                background: "#fafafa",
                color: "#09090b",
                fontSize: slot.size,
                fontWeight: slot.weight,
                lineHeight: 1.35,
                fontFamily: font ? `${cssFamily(font)}, var(--font-sans)` : "var(--font-sans)",
              }}
            >
              {slot.sample}
            </div>
          </div>
        );
      })}
      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#b91c1c", fontFamily: "var(--font-sans)" }}>
          <Icon name="alert-circle" size={13} color="#b91c1c" /> {error}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Btn variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Btn>
        <Btn variant="primary" size="sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save fonts"}
        </Btn>
      </div>
    </div>
  );
}

function ExportPanel({ fields, onClose }: { fields: { id: string; label: string; content: string }[]; onClose: () => void }) {
  const [copied, setCopied] = React.useState(false);
  const text = fields.map((f) => `${f.label}: ${f.content}`).join("\n\n");

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard not available */
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, border: "1px solid #f0f0f0", borderRadius: 10, padding: 14, background: "#fafafa" }}>
        {fields.map((f) => (
          <div key={f.id}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#7f22fe", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "var(--font-sans)", marginBottom: 4 }}>{f.label}</div>
            <div style={{ fontSize: 13, color: "#09090b", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>{f.content || <span style={{ color: "#a1a1aa" }}>Empty</span>}</div>
          </div>
        ))}
        {fields.length === 0 && <div style={{ fontSize: 13, color: "#a1a1aa", textAlign: "center", padding: 20 }}>No fields to export yet.</div>}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Btn variant="ghost" size="sm" onClick={onClose}>
          Close
        </Btn>
        <Btn variant="primary" size="sm" icon={copied ? "check" : "copy"} onClick={copyAll} disabled={!fields.length}>
          {copied ? "Copied!" : "Copy all as text"}
        </Btn>
      </div>
    </div>
  );
}

const zoomBtnStyle: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 6,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  color: "#52525b",
  fontSize: 17,
  lineHeight: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "var(--font-sans)",
};
