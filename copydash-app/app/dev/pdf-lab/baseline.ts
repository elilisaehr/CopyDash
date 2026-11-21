// PDF lab — reference results (./baseline.json) and the comparison with a new run.
//
// The baseline is one row per page of the 12 reference PDFs, recorded with
// "Copy baseline" after a full run and committed. Every engine change is run
// again and compared: fidelity going down beyond the noise of a run is a
// regression, block or report changes are listed for review.

import baselineFile from "./baseline.json";

export interface LabMetrics {
  name: string;
  page: number;
  /** Non-text pixels that differ from the original, background as saved (%). */
  bg: number;
  /** Same, page redrawn from the pieces (%). */
  pieces: number;
  /** Share of text blocks with no issue (%), measured in the editor preview. */
  text: number | null;
  blocks: number;
  missing: number;
  extra: number;
  /** Report items: code → count (1 when the item has no count). */
  report: Record<string, number>;
  /** Hash of every block's id and text: changes when blocks are split, merged or renamed. */
  blocksHash: string;
  kb: number | null;
  ms: number;
  /** Engine diagnostics (lib/pdf-reconstruct `diagnostics`), when recorded. */
  diag?: Record<string, number>;
}

export interface Baseline {
  recordedAt: string;
  pdfjs: string;
  note: string;
  rows: LabMetrics[];
}

export const baseline = baselineFile as unknown as Baseline;

export type Verdict = "regression" | "improvement" | "change";
export interface Delta {
  name: string;
  page: number;
  field: string;
  before: string;
  after: string;
  verdict: Verdict;
}

/** Noise of one run, measured by running the unchanged engine twice (see docs). */
export const TOLERANCE = {
  /** percentage points of non-text pixels */
  bg: 0.005,
  pieces: 0.02,
  /** percentage points of text blocks: fonts load at slightly different times */
  text: 3,
  /** relative size of the saved files */
  kb: 0.05,
};

export function hashText(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16);
}

const f = (n: number | null | undefined, d = 3) => (n === null || n === undefined ? "—" : n.toFixed(d));

export function compareRuns(rows: LabMetrics[], base: LabMetrics[]): Delta[] {
  const out: Delta[] = [];
  const key = (r: { name: string; page: number }) => `${r.name}#${r.page}`;
  const byKey = new Map(base.map((r) => [key(r), r]));
  for (const r of rows) {
    const b = byKey.get(key(r));
    const push = (field: string, before: string, after: string, verdict: Verdict) => out.push({ name: r.name, page: r.page, field, before, after, verdict });
    if (!b) {
      push("page", "—", "new", "change");
      continue;
    }
    byKey.delete(key(r));
    const lower = (field: "bg" | "pieces", tol: number) => {
      const d = r[field] - b[field];
      if (Math.abs(d) > tol) push(field, `${f(b[field])}%`, `${f(r[field])}%`, d > 0 ? "regression" : "improvement");
    };
    lower("bg", TOLERANCE.bg);
    lower("pieces", TOLERANCE.pieces);
    if (r.text !== null && b.text !== null && Math.abs(r.text - b.text) > TOLERANCE.text)
      push("text", `${f(b.text, 1)}%`, `${f(r.text, 1)}%`, r.text < b.text ? "regression" : "improvement");
    if (r.blocks !== b.blocks) push("blocks", String(b.blocks), String(r.blocks), "change");
    else if (r.blocksHash !== b.blocksHash) push("block texts", b.blocksHash, r.blocksHash, "change");
    if (r.missing !== b.missing) push("words missing", String(b.missing), String(r.missing), r.missing > b.missing ? "regression" : "improvement");
    if (r.extra !== b.extra) push("words extra", String(b.extra), String(r.extra), r.extra > b.extra ? "regression" : "improvement");
    for (const code of new Set([...Object.keys(b.report), ...Object.keys(r.report)])) {
      if ((b.report[code] ?? 0) !== (r.report[code] ?? 0)) push(`report ${code}`, String(b.report[code] ?? 0), String(r.report[code] ?? 0), "change");
    }
    if (r.kb !== null && b.kb !== null && Math.abs(r.kb - b.kb) > b.kb * TOLERANCE.kb) push("saved KB", String(b.kb), String(r.kb), "change");
    if (r.diag && b.diag) {
      for (const k of new Set([...Object.keys(b.diag), ...Object.keys(r.diag)])) {
        if ((b.diag[k] ?? 0) !== (r.diag[k] ?? 0)) push(`diag ${k}`, String(b.diag[k] ?? 0), String(r.diag[k] ?? 0), "change");
      }
    }
  }
  for (const b of byKey.values()) out.push({ name: b.name, page: b.page, field: "page", before: "present", after: "missing", verdict: "regression" });
  return out;
}
