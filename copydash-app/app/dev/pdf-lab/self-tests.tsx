// PDF lab — self-tests for the PDF engine (lib/pdf-reconstruct, lib/pdf-rebuild-store,
// EditableBlock). Browser-only: they need canvas, pdf.js and the DOM, so they run
// from the lab page ("Run self-tests"), not from a Node test runner.
//
// Each test builds a tiny PDF by hand (Helvetica, one content stream) that
// reproduces one problem of the PDF engine audit, runs the real code on it and
// checks pixels or blocks. `audit` names the audit item a test guards.

import * as React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { getPdfjs } from "@/lib/pdf";
import { __lab, reconstructPdf, type ReconstructedPage } from "@/lib/pdf-reconstruct";
import { hasAlpha } from "@/lib/pdf-rebuild-store";
import { EditableBlock } from "@/components/features/editable-block";
import type { DesignBlock } from "@/lib/pdf-design";

export interface SelfTestResult {
  id: string;
  audit: string;
  name: string;
  ok: boolean;
  detail: string;
  ms: number;
}

// ── tiny PDF builder ──────────────────────────────────────────────────────
const PAGE_W = 400;
const PAGE_H = 300;
const SCALE = 2;

/** A one-page PDF (400×300 pt, Helvetica as /F1) whose page draws `content`. ASCII only. */
export function makePdf(content: string): ArrayBuffer {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out).buffer as ArrayBuffer;
}

/** Rounded rectangle path (PDF user space). */
const rrect = (x0: number, y0: number, x1: number, y1: number, r: number) => {
  const k = r * 0.5523;
  return [
    `${x0 + r} ${y0} m`,
    `${x1 - r} ${y0} l`,
    `${x1 - r + k} ${y0} ${x1} ${y0 + r - k} ${x1} ${y0 + r} c`,
    `${x1} ${y1 - r} l`,
    `${x1} ${y1 - r + k} ${x1 - r + k} ${y1} ${x1 - r} ${y1} c`,
    `${x0 + r} ${y1} l`,
    `${x0 + r - k} ${y1} ${x0} ${y1 - r + k} ${x0} ${y1 - r} c`,
    `${x0} ${y0 + r} l`,
    `${x0} ${y0 + r - k} ${x0 + r - k} ${y0} ${x0 + r} ${y0} c h`,
  ].join(" ");
};

// ── pixel helpers (device px = pt × SCALE, y down) ────────────────────────
type PtBox = [number, number, number, number]; // x0, y0, x1, y1 in PDF points (y up)
const dev = ([x0, y0, x1, y1]: PtBox) => [x0 * SCALE, (PAGE_H - y1) * SCALE, x1 * SCALE, (PAGE_H - y0) * SCALE].map(Math.round);

/** Pixels in the box that differ from white by more than `min` (sum of RGB distances). */
function inkIn(c: HTMLCanvasElement, box: PtBox, min = 30): number {
  const [x0, y0, x1, y1] = dev(box);
  const d = c.getContext("2d")!.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    const r = 255 - (255 - d[i]) * a;
    const g = 255 - (255 - d[i + 1]) * a;
    const b = 255 - (255 - d[i + 2]) * a;
    if (255 * 3 - r - g - b > min) n++;
  }
  return n;
}

function pixel(c: HTMLCanvasElement, xPt: number, yPt: number): [number, number, number] {
  const d = c.getContext("2d")!.getImageData(Math.round(xPt * SCALE), Math.round((PAGE_H - yPt) * SCALE), 1, 1).data;
  return [d[0], d[1], d[2]];
}

/** FNV-1a hash of a canvas's pixels (equality checks between runs). */
function hashCanvas(c: HTMLCanvasElement): string {
  const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
  let h = 0x811c9dc5;
  for (let i = 0; i < d.length; i += 7) h = Math.imul(h ^ d[i], 0x01000193);
  return (h >>> 0).toString(16);
}

const fingerprint = (pg: ReconstructedPage) => `${hashCanvas(pg.background)}|${pg.blocks.map((b) => b.id + ":" + b.text).join("¦")}`;

async function rebuild(content: string): Promise<ReconstructedPage> {
  const pdfjs = await getPdfjs();
  const [pg] = await reconstructPdf(pdfjs, makePdf(content), SCALE);
  return pg;
}

// ── canvas prototype restoration ──────────────────────────────────────────
const PAINT = ["fill", "stroke", "drawImage", "fillRect", "strokeRect", "fillText", "strokeText", "putImageData"] as const;
type Proto = Record<string, unknown>;
const protos = (): Proto[] => {
  const list: Proto[] = [CanvasRenderingContext2D.prototype as unknown as Proto];
  if (typeof OffscreenCanvasRenderingContext2D !== "undefined") list.push(OffscreenCanvasRenderingContext2D.prototype as unknown as Proto);
  return list;
};
const snapshot = () => protos().map((p) => PAINT.map((m) => p[m]));
/** Names of paint methods that are no longer the browser's own. */
function changed(saved: unknown[][]): string[] {
  const out: string[] = [];
  protos().forEach((p, k) => PAINT.forEach((m, j) => p[m] !== saved[k][j] && out.push(m)));
  return out;
}
/** Puts the browser's methods back after a failed test, so the next tests (and the page) still draw. */
function forceRestore(saved: unknown[][]) {
  protos().forEach((p, k) => PAINT.forEach((m, j) => (p[m] = saved[k][j])));
}

const canvas = (w = PAGE_W * SCALE, h = PAGE_H * SCALE) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d");
  return c;
};

async function openPage(content: string) {
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: makePdf(content) }).promise;
  const page = await doc.getPage(1);
  return { page, viewport: page.getViewport({ scale: SCALE }) };
}

// ── the tests ─────────────────────────────────────────────────────────────
type Test = { id: string; audit: string; name: string; run: (saved: unknown[][]) => Promise<string | true> };

const TESTS: Test[] = [
  {
    id: "gate-success",
    audit: "A3",
    name: "withGate restores the canvas methods after a successful run",
    run: async (saved) => {
      await __lab.withGate(() => true, async () => 1);
      const c = changed(saved);
      return c.length ? `still replaced: ${c.join(", ")}` : true;
    },
  },
  {
    id: "gate-error",
    audit: "A3",
    name: "withGate restores the canvas methods after a rejected run",
    run: async (saved) => {
      let rejected = false;
      await __lab.withGate(() => true, async () => Promise.reject(new Error("boom"))).catch(() => (rejected = true));
      const c = changed(saved);
      if (!rejected) return "the error was swallowed";
      return c.length ? `still replaced: ${c.join(", ")}` : true;
    },
  },
  {
    id: "gate-sync-throw",
    audit: "A3",
    name: "withGate restores the canvas methods when the run throws synchronously",
    run: async (saved) => {
      let threw = false;
      try {
        await __lab.withGate(() => true, (() => {
          throw new Error("sync boom");
        }) as unknown as () => Promise<number>);
      } catch {
        threw = true;
      }
      const c = changed(saved);
      if (!threw) return "the error was swallowed";
      return c.length ? `still replaced: ${c.join(", ")}` : true;
    },
  },
  {
    id: "gate-cancel",
    audit: "A3",
    name: "withGate restores the canvas methods when the render is cancelled",
    run: async (saved) => {
      const { page, viewport } = await openPage("0 0 1 rg 50 50 300 200 re f");
      let error = "";
      await __lab
        .gatedRender(page, canvas(), viewport, () => true, (task) => task.cancel())
        .catch((e: { name?: string }) => (error = e?.name || "error"));
      const c = changed(saved);
      if (error !== "RenderingCancelledException") return `expected a cancelled render, got "${error || "success"}"`;
      return c.length ? `still replaced: ${c.join(", ")}` : true;
    },
  },
  {
    id: "gate-concurrent",
    audit: "A2",
    name: "Two gated renders at the same time each keep their own filter",
    run: async (saved) => {
      const { page, viewport } = await openPage("0 0 0 rg 50 50 300 200 re f");
      const none = canvas();
      const all = canvas();
      await Promise.all([__lab.gatedRender(page, none, viewport, () => false), __lab.gatedRender(page, all, viewport, () => true)]);
      const a = inkIn(none, [0, 0, PAGE_W, PAGE_H]);
      const b = inkIn(all, [0, 0, PAGE_W, PAGE_H]);
      const c = changed(saved);
      if (c.length) return `still replaced: ${c.join(", ")}`;
      if (a > 0) return `the "draw nothing" render drew ${a} px (it used the other render's filter)`;
      if (!b) return `the "draw everything" render drew nothing`;
      return true;
    },
  },
  {
    id: "gate-overlap-restore",
    audit: "A2",
    name: "Overlapping withGate calls leave the browser's own methods in place",
    run: async (saved) => {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const first = __lab.withGate(() => true, () => wait(10));
      const second = __lab.withGate(() => true, () => wait(40));
      await Promise.all([first, second]);
      const c = changed(saved);
      return c.length ? `still replaced: ${c.join(", ")}` : true;
    },
  },
  {
    id: "gate-other-canvas",
    audit: "A1",
    name: "A gated render doesn't block drawing on the app's other canvases",
    run: async () => {
      const other = canvas(20, 20);
      await __lab.withGate(() => false, async () => {
        other.getContext("2d")!.fillRect(0, 0, 20, 20);
      });
      const d = other.getContext("2d")!.getImageData(10, 10, 1, 1).data;
      return d[3] === 255 ? true : "the other canvas stayed blank (its drawing was dropped by the gate)";
    },
  },
  {
    id: "simultaneous-imports",
    audit: "A1/A2",
    name: "Two PDFs converted at the same time give the same result as one after the other",
    run: async () => {
      const a = "0 0 0 rg BT /F1 24 Tf 40 200 Td (First document) Tj ET 0.9 0.2 0.2 rg 40 80 200 60 re f";
      const b = "0.2 0.5 0.2 rg 20 20 360 260 re f 1 g BT /F1 18 Tf 60 150 Td (Second one) Tj ET";
      const seqA = fingerprint(await rebuild(a));
      const seqB = fingerprint(await rebuild(b));
      const [parA, parB] = await Promise.all([rebuild(a), rebuild(b)]);
      const bad = [fingerprint(parA) !== seqA && "first", fingerprint(parB) !== seqB && "second"].filter(Boolean);
      return bad.length ? `different result for the ${bad.join(" and ")} document` : true;
    },
  },
  {
    id: "interrupted-import",
    audit: "A3",
    name: "A failed conversion leaves the engine working for the next one",
    run: async (saved) => {
      const pdfjs = await getPdfjs();
      const good = "0 0 0 rg BT /F1 24 Tf 40 200 Td (After a failure) Tj ET";
      const before = fingerprint(await rebuild(good));
      let failed = false;
      await reconstructPdf(pdfjs, new TextEncoder().encode("%PDF-1.4 not really a pdf").buffer as ArrayBuffer, SCALE).catch(() => (failed = true));
      const c = changed(saved);
      if (!failed) return "the broken file didn't fail";
      if (c.length) return `still replaced: ${c.join(", ")}`;
      return fingerprint(await rebuild(good)) === before ? true : "the next conversion gave a different result";
    },
  },
  {
    id: "op-count",
    audit: "A5",
    name: "pdf.js runs the same operator list we analysed (one filter call per operation)",
    run: async () => {
      const pg = await rebuild("0 0 0 rg BT /F1 24 Tf 40 200 Td (Counted) Tj ET 40 100 200 40 re f");
      const d = pg.diagnostics;
      if (!d) return "no diagnostics";
      return d.filterCalls === d.ops ? true : `${d.filterCalls} filter calls for ${d.ops} operations`;
    },
  },
  {
    id: "pdfjs-version",
    audit: "A5",
    name: "pdf.js is the version the engine was validated with (6.3.289)",
    run: async () => {
      const pdfjs = await getPdfjs();
      return pdfjs.version === "6.3.289" ? true : `pdf.js ${pdfjs.version}`;
    },
  },
  {
    id: "underline-kept",
    audit: "B1",
    name: "An underline under a link stays in the background",
    run: async () => {
      const pg = await rebuild("0 0 0 rg BT /F1 20 Tf 40 200 Td (Underlined link) Tj ET 40 195 150 1.5 re f");
      const box: PtBox = [42, 195, 188, 196.5];
      const o = inkIn(pg.original, box);
      const b = inkIn(pg.background, box);
      if (!o) return "test PDF: no underline in the original";
      return b >= o * 0.8 ? true : `underline removed (${b} of ${o} px left)`;
    },
  },
  {
    id: "pill-kept",
    audit: "B2",
    name: "A tight badge behind its label stays in the background",
    run: async () => {
      const pg = await rebuild(`0.1 0.3 0.8 rg ${rrect(34, 94, 82, 112, 6)} f 1 g BT /F1 14 Tf 40 99 Td (NEW) Tj ET`);
      const [r, , b] = pixel(pg.background, 36.5, 103);
      const [or, , ob] = pixel(pg.original, 36.5, 103);
      if (!(ob > or + 60)) return "test PDF: no blue badge in the original";
      return b > r + 60 ? true : `badge removed (background is rgb ${pixel(pg.background, 36.5, 103).join(",")})`;
    },
  },
  {
    id: "text-colour-in-box",
    audit: "B2 follow-up",
    name: "Text in a tight box keeps its own colour (red link in a white box on a red section)",
    run: async () => {
      const red = "0.72 0.2 0.18 rg";
      const pg = await rebuild(`${red} 0 0 400 300 re f 1 g 38 192 160 26 re f ${red} BT /F1 18 Tf 42 198 Td (name@ethz.ch) Tj ET`);
      const b = pg.blocks.find((x) => x.text.includes("name@ethz.ch"));
      if (!b) return "the link is not an editable block";
      const [r, g, bl] = pixel(pg.background, 40, 205);
      if (!(r > 240 && g > 240 && bl > 240)) return "test PDF: the white box is not in the background";
      const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(b.color || "");
      const shown = m ? [+m[1], +m[2], +m[3]] : b.dark ? [255, 255, 255] : [11, 11, 12];
      const dist = Math.hypot(shown[0] - 184, shown[1] - 51, shown[2] - 46);
      return dist < 80 ? true : `the text would show in rgb(${shown.join(",")}) instead of red`;
    },
  },
  {
    id: "glyph-rects-removed",
    audit: "B1/B2",
    name: "Letters drawn as thin rectangles (Figma 'l') are still removed from the background",
    run: async () => {
      const stems = [0, 1, 2].map((i) => `${40 + 8.88 * i + 2.7} 150 3.4 28.7 re f`).join(" ");
      const pg = await rebuild(`BT 3 Tr /F1 40 Tf 40 150 Td (lll) Tj ET 0 0 0 rg ${stems} 0 Tr`);
      const box: PtBox = [40, 150, 70, 179];
      const o = inkIn(pg.original, box);
      const b = inkIn(pg.background, box);
      if (!o) return "test PDF: no stems in the original";
      return b <= o * 0.05 ? true : `letter shapes left in the background (${b} of ${o} px)`;
    },
  },
  {
    id: "rotated-cm-kept",
    audit: "B5",
    name: "Text rotated by a transform (no text matrix) stays in the background",
    run: async () => {
      const pg = await rebuild("0 0 0 rg q 0 1 -1 0 330 40 cm BT /F1 16 Tf 0 0 Td (VERTICAL) Tj ET Q");
      const box: PtBox = [312, 38, 334, 125];
      const o = inkIn(pg.original, box);
      const b = inkIn(pg.background, box);
      if (!o) return "test PDF: no rotated text in the original";
      if (pg.blocks.some((bl) => bl.text.includes("VERTICAL"))) return "rotated text became an editable block";
      return b >= o * 0.8 ? true : `rotated text vanished (${b} of ${o} px left, and it isn't editable)`;
    },
  },
  {
    id: "faint-text-kept",
    audit: "B6",
    name: "Very light text is kept (editable, or in the background)",
    run: async () => {
      const pg = await rebuild("0.93 g BT /F1 18 Tf 40 240 Td (Faint caption) Tj ET");
      const box: PtBox = [40, 236, 160, 256];
      if (!inkIn(pg.original, box, 20)) return "test PDF: no faint text in the original";
      const editable = pg.blocks.some((b) => b.text.includes("Faint"));
      const inBackground = inkIn(pg.background, box, 20) >= inkIn(pg.original, box, 20) * 0.8;
      return editable || inBackground ? true : "the light text vanished (dropped as hidden and removed from the background)";
    },
  },
  {
    id: "hidden-text-dropped",
    audit: "B6",
    name: "Text covered by a shape is still left out of the editable blocks",
    run: async () => {
      const pg = await rebuild("0 g BT /F1 18 Tf 40 60 Td (Hidden words) Tj ET 1 g 30 50 200 30 re f");
      return pg.blocks.some((b) => b.text.includes("Hidden")) ? "hidden text became an editable block" : true;
    },
  },
  {
    id: "has-alpha",
    audit: "hasAlpha",
    name: "A picture with a single transparent pixel is detected as transparent (PNG, not JPEG)",
    run: async () => {
      const c = canvas(4, 4);
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#336699";
      ctx.fillRect(0, 0, 4, 4);
      ctx.clearRect(1, 0, 1, 1);
      return hasAlpha(c) ? true : "transparency missed (the picture would be saved as JPEG with a black hole)";
    },
  },
  {
    id: "blur-heading",
    audit: "D1",
    name: "Clicking into a two-line heading and out again saves nothing and keeps its line break",
    run: async () => {
      const block: DesignBlock = {
        id: "selftest-heading",
        pageIndex: 0,
        x: 20,
        top: 20,
        w: 260,
        h: 60,
        fontH: 22,
        text: "Le temps long.\nLes liens durables.",
        bg: [255, 255, 255],
        dark: false,
        kind: "heading",
        wrap: true,
        lineHeight: 28,
        sourceLines: ["Le temps long.", "Les liens durables."],
      };
      return blurTest(block, null);
    },
  },
  {
    id: "blur-line",
    audit: "D1",
    name: "Clicking into a one-line text and out again saves nothing",
    run: async () =>
      blurTest(
        { id: "selftest-line", pageIndex: 0, x: 20, top: 20, w: 200, h: 20, fontH: 16, text: "Read more", bg: [255, 255, 255], dark: false, kind: "body", sourceLines: ["Read more"] },
        null,
      ),
  },
  {
    id: "blur-edit",
    audit: "D1",
    name: "A real edit is still saved on blur",
    run: async () =>
      blurTest(
        { id: "selftest-edit", pageIndex: 0, x: 20, top: 20, w: 200, h: 20, fontH: 16, text: "Read more", bg: [255, 255, 255], dark: false, kind: "body", sourceLines: ["Read more"] },
        "Discover the range",
      ),
  },
];

/** Mounts an EditableBlock, focuses it, optionally types `typed`, blurs it and checks what was committed. */
async function blurTest(block: DesignBlock, typed: string | null): Promise<string | true> {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:0;top:0;width:400px;height:200px;opacity:0;pointer-events:none";
  document.body.appendChild(host);
  const root = createRoot(host);
  const commits: string[] = [];
  let value: string | undefined;
  const render = () =>
    root.render(
      <div style={{ position: "relative", width: 400, height: 200 }}>
        <EditableBlock block={block} value={value} editable onChange={(_, t) => (value = t)} onCommit={(_, t) => commits.push(t)} />
      </div>,
    );
  try {
    flushSync(render);
    const el = host.querySelector<HTMLElement>(`[data-block-id="${block.id}"]`);
    if (!el) return "block not rendered";
    el.focus();
    if (typed !== null) {
      el.textContent = typed;
      el.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
    el.blur();
    await new Promise((r) => setTimeout(r, 0));
    if (typed === null) {
      const changedCommit = commits.find((t) => t !== block.text);
      if (changedCommit !== undefined) return `saved a change nobody made: ${JSON.stringify(changedCommit)} (original ${JSON.stringify(block.text)})`;
      return true;
    }
    return commits.at(-1) === typed ? true : `expected ${JSON.stringify(typed)} to be saved, got ${JSON.stringify(commits.at(-1))}`;
  } finally {
    root.unmount();
    host.remove();
  }
}

export async function runSelfTests(onProgress?: (msg: string) => void): Promise<SelfTestResult[]> {
  const saved = snapshot();
  const out: SelfTestResult[] = [];
  for (const t of TESTS) {
    onProgress?.(`Self-test: ${t.name}`);
    const t0 = performance.now();
    let ok = false;
    let detail = "";
    try {
      const r = await t.run(saved);
      ok = r === true;
      detail = r === true ? "" : r;
    } catch (e) {
      detail = `threw: ${e instanceof Error ? e.message : String(e)}`;
    }
    // A failed restoration test must not break the tests after it.
    if (changed(saved).length) forceRestore(saved);
    out.push({ id: t.id, audit: t.audit, name: t.name, ok, detail, ms: Math.round(performance.now() - t0) });
  }
  return out;
}
