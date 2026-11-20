// CopyDash — which fonts does a PDF design use?
//
// Browser-only. A Figma PDF carries no font name, but it draws every letter
// exactly. For each text style of the PDF (one pdf.js font = one style), a
// few lines of the page's ink (original page minus the text-free
// background) are compared with the same text rendered in candidate Google
// fonts at every weight: same size and baseline, left edges aligned, the
// candidate given the letter spacing that matches the ink's width (Figma
// tracking), in the text's case and in capitals (Figma's "uppercase" keeps
// the original case in the text layer). The score is the overlap of the two
// (Dice) — quick on every family at two weights, then on every weight of
// the best 12, then blurred and with small shifts (forgives 1px contour
// offsets) on the best 20.
//
// Measured on 12 reference Figma PDFs (docs/06-implementation-plan.md):
// Google fonts are found (≥ 0.85 for text, a little lower for large serifs);
// paid fonts (Avenir, DIN, IvyPresto) get a look-alike with a lower score.
// So the result is a suggestion the user confirms on a side-by-side preview.
//
// Fonts are fetched through /api/fonts (our server asks Google Fonts).

import type { ReconstructedPage } from "@/lib/pdf-reconstruct";

export interface SampleLine {
  text: string;
  x: number;
  baseline: number;
  fontH: number;
  w: number;
}

export interface StyleSample {
  /** styleKeyOf(pdf.js font, size) — what blocks and design_fonts.styles use. */
  key: string;
  lines: SampleLine[];
  /** Characters of text in this style on the page (how much it matters). */
  chars: number;
}

export interface FontMatch {
  family: string;
  weight: number;
  /** Shape overlap, 0–1. */
  shape: number;
}

export type Confidence = "high" | "medium" | "low";

export interface DetectedStyle {
  key: string;
  best: FontMatch | null;
  confidence: Confidence;
  /** Other families, best weight each (for the picker). */
  alternatives: FontMatch[];
  /** The PDF's own rendering of a sample line (data URL) and its text. */
  sample: { text: string; image: string; size: number } | null;
  chars: number;
}

/**
 * Candidate Google families and their weight axis (variable range) — the
 * others are asked with every static weight (Google returns those it has).
 */
const VARIABLE: Record<string, string> = {
  Inter: "100..900", Roboto: "100..900", "Open Sans": "300..800", Montserrat: "100..900", Nunito: "200..900", "Nunito Sans": "200..900",
  Raleway: "100..900", "Source Sans 3": "200..900", "Work Sans": "100..900", "DM Sans": "100..900", Manrope: "200..800", Mulish: "200..900",
  Rubik: "300..900", Figtree: "300..900", "Plus Jakarta Sans": "200..800", Outfit: "100..900", Karla: "200..800", Urbanist: "100..900",
  Lexend: "100..900", Sora: "100..800", "Space Grotesk": "300..700", "IBM Plex Sans": "300..700", "Noto Sans": "100..900", Oswald: "300..700",
  Archivo: "100..900", Heebo: "100..900", "Josefin Sans": "300..700", Quicksand: "300..700", Cabin: "400..700", "Exo 2": "100..900",
  "Red Hat Display": "300..900", "Red Hat Text": "300..700", "Public Sans": "100..900", "Albert Sans": "100..900", Onest: "100..900",
  "Instrument Sans": "400..700", "Schibsted Grotesk": "400..900", Epilogue: "100..900", "Hanken Grotesk": "100..900", "Golos Text": "400..900",
  "Libre Franklin": "100..900", Assistant: "200..800", Jost: "100..900", Arimo: "400..700", Overpass: "100..900", "Encode Sans": "100..900",
  Asap: "100..900", Signika: "300..700", Catamaran: "100..900", "Maven Pro": "400..900", "Roboto Flex": "100..900", "Roboto Condensed": "100..900",
  "Inter Tight": "100..900", Chivo: "100..900", Commissioner: "100..900", "Lexend Deca": "100..900", "Readex Pro": "300..700", Gantari: "100..900",
  "Reddit Sans": "200..900", "Bricolage Grotesque": "200..800", "Familjen Grotesk": "400..700", Syne: "400..800", Geologica: "100..900",
  "Source Serif 4": "200..900", "Libre Baskerville": "400..700", Baskervville: "400..700", "Playfair Display": "400..900", Merriweather: "300..900",
  Lora: "400..700", "Roboto Slab": "100..900", "EB Garamond": "400..800", "Cormorant Garamond": "300..700", "Crimson Pro": "200..900",
  "Noto Serif": "100..900", "Frank Ruhl Libre": "300..900", Fraunces: "100..900", "Bodoni Moda": "400..900", Newsreader: "200..800",
  Literata: "200..900", Gelasio: "400..700", Bitter: "100..900", "Dancing Script": "400..700", Caveat: "400..700",
};
const STATIC_ONLY = [
  "Lato", "Poppins", "Barlow", "Barlow Condensed", "PT Sans", "Ubuntu", "Fira Sans", "Titillium Web", "Hind", "Mukta", "Kanit", "Be Vietnam Pro",
  "Prompt", "Questrial", "Varela Round", "Didact Gothic", "Tenor Sans", "PT Serif", "Crimson Text", "Libre Caslon Text", "DM Serif Display",
  "Spectral", "Instrument Serif", "Young Serif", "Prata", "Cardo", "Old Standard TT", "Zilla Slab", "Arvo", "Pacifico", "Great Vibes",
  "Sacramento", "Allura", "Parisienne",
];
export const CANDIDATE_FAMILIES = [...Object.keys(VARIABLE), ...STATIC_ONLY].sort();

const ALL_WEIGHTS = "100;200;300;400;500;600;700;800;900";
/** The css2 `family=` value asking for every weight of a family. */
export const googleFamilySpec = (family: string) => `${family.replace(/ /g, "+")}:wght@${VARIABLE[family] ?? ALL_WEIGHTS}`;

const TEST_WEIGHTS = [300, 400, 500, 600, 700, 800];

/** Faces registered under a private name ("cd-detect-<family>") so the detection never clashes with the page's fonts. */
const detectName = (family: string) => `cd-detect-${family}`;

async function loadFamily(family: string): Promise<{ family: string; weights: number[] } | null> {
  let css = "";
  for (const spec of [googleFamilySpec(family), family.replace(/ /g, "+")]) {
    const res = await fetch(`/api/fonts?css=${encodeURIComponent(spec)}`);
    if (res.ok) {
      css = await res.text();
      break;
    }
  }
  if (!css) return null;
  const weights = new Set<number>();
  const faces: Promise<unknown>[] = [];
  // Latin faces only: /* latin */ @font-face { … font-weight: 400 | 100 900; src: url(…) … }
  const re = /\/\*\s*latin\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const body = m[1];
    if (/font-style:\s*italic/.test(body)) continue;
    const wm = body.match(/font-weight:\s*(\d+)(?:\s+(\d+))?/);
    const url = body.match(/url\(([^)]+)\)/)?.[1];
    if (!wm || !url) continue;
    const lo = +wm[1];
    const hi = wm[2] ? +wm[2] : lo;
    for (const w of TEST_WEIGHTS) if (w >= lo && w <= hi) weights.add(w);
    const face = new FontFace(detectName(family), `url(/api/fonts?file=${encodeURIComponent(url)})`, { weight: wm[2] ? `${lo} ${hi}` : String(lo) });
    document.fonts.add(face);
    faces.push(face.load().catch(() => null));
  }
  await Promise.all(faces);
  return weights.size ? { family, weights: [...weights].sort((a, b) => a - b) } : null;
}

let candidates: Promise<{ family: string; weights: number[] }[]> | null = null;
function loadCandidates(onProgress?: (msg: string) => void) {
  candidates ??= (async () => {
    const out: { family: string; weights: number[] }[] = [];
    for (let i = 0; i < CANDIDATE_FAMILIES.length; i += 8) {
      onProgress?.(`Recognising fonts — loading ${Math.round((100 * i) / CANDIDATE_FAMILIES.length)}%`);
      const batch = await Promise.all(CANDIDATE_FAMILIES.slice(i, i + 8).map((f) => loadFamily(f).catch(() => null)));
      for (const c of batch) if (c) out.push(c);
    }
    return out;
  })();
  return candidates;
}

// ── Comparing ────────────────────────────────────────────────────────────

const SIZE = 48; // samples are compared at this type size
const ASC = 1.15; // crop: em above the baseline…
const DESC = 0.35; // …and below

type Ink = { cov: Float32Array; W: number; H: number; left: number; right: number };

function edgesOf(cov: Float32Array, W: number, H: number) {
  let left = W;
  let right = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (cov[y * W + x] > 0.3) {
        if (x < left) left = x;
        if (x > right) right = x;
      }
  return right > left ? { left, right: right + 1 } : null;
}

/** Ink coverage (0–1) of one PDF line, scaled to SIZE. */
function inkOf(pg: ReconstructedPage, od: Uint8ClampedArray, bd: Uint8ClampedArray, l: SampleLine): Ink | null {
  const pad = l.fontH * 0.15;
  const x0 = Math.max(0, Math.floor(l.x - pad));
  const x1 = Math.min(pg.w, Math.ceil(l.x + l.w + pad));
  const y0 = Math.max(0, Math.floor(l.baseline - l.fontH * ASC));
  const y1 = Math.min(pg.h, Math.ceil(l.baseline + l.fontH * DESC));
  const cw = x1 - x0;
  const ch = y1 - y0;
  if (cw < 4 || ch < 4) return null;
  // Full coverage = the text colour against its background (98th percentile
  // of the differences), so antialiased edges keep their partial coverage.
  const diffs = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const i = ((y + y0) * pg.w + (x + x0)) * 4;
      diffs[y * cw + x] = Math.abs(od[i] - bd[i]) + Math.abs(od[i + 1] - bd[i + 1]) + Math.abs(od[i + 2] - bd[i + 2]);
    }
  const strong = Array.from(diffs).filter((d) => d > 30).sort((a, b) => a - b);
  if (strong.length < 20) return null; // hidden text: no ink
  const full = strong[Math.floor(strong.length * 0.98)];
  const big = document.createElement("canvas");
  big.width = cw;
  big.height = ch;
  const bctx = big.getContext("2d")!;
  const img = bctx.createImageData(cw, ch);
  for (let i = 0; i < cw * ch; i++) {
    const d = diffs[i];
    const v = d < 20 ? 0 : Math.min(255, (255 * d) / full);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  bctx.putImageData(img, 0, 0);
  const s = SIZE / l.fontH;
  const W = Math.max(8, Math.round(cw * s));
  const H = Math.round(SIZE * (ASC + DESC));
  const small = document.createElement("canvas");
  small.width = W;
  small.height = H;
  const sctx = small.getContext("2d", { willReadFrequently: true })!;
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(big, 0, SIZE * ASC - (l.baseline - y0) * s, W, ch * s);
  const data = sctx.getImageData(0, 0, W, H).data;
  const cov = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) cov[i] = data[i * 4] / 255;
  const e = edgesOf(cov, W, H);
  return e ? { cov, W, H, ...e } : null;
}

let renderCanvas: HTMLCanvasElement | null = null;
function renderLine(text: string, family: string, weight: number, W: number, H: number, spacing = 0) {
  renderCanvas ??= document.createElement("canvas");
  const c = renderCanvas;
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000";
  ctx.font = `${weight} ${SIZE}px "${detectName(family)}"`;
  ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(text, 4, SIZE * ASC);
  const data = ctx.getImageData(0, 0, W, H).data;
  const cov = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) cov[i] = 1 - data[i * 4] / 255;
  return cov;
}

/** Two passes of a 3×3 box blur (near-Gaussian). */
function blur(src: Float32Array, W: number, H: number): Float32Array {
  let a = src;
  for (let pass = 0; pass < 2; pass++) {
    const b = new Float32Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let s = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= W) continue;
            s += a[yy * W + xx];
            n++;
          }
        }
        b[y * W + x] = s / n;
      }
    a = b;
  }
  return a;
}

const blurredInk = new WeakMap<Float32Array, Float32Array>();

function dice(ink: Ink, cov: Float32Array, RW: number, cLeft: number, precise: boolean) {
  const { W, H } = ink;
  const P = 2;
  const WW = W + 2 * P;
  const win = new Float32Array(WW * H);
  const dx0 = cLeft - ink.left - P;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < WW; x++) {
      const cx = x + dx0;
      if (cx >= 0 && cx < RW) win[y * WW + x] = cov[y * RW + cx];
    }
  let bi: Float32Array = ink.cov;
  let bc: Float32Array = win;
  if (precise) {
    let cached = blurredInk.get(ink.cov);
    if (!cached) {
      cached = blur(ink.cov, W, H);
      blurredInk.set(ink.cov, cached);
    }
    bi = cached;
    bc = blur(win, WW, H);
  }
  let best = 0;
  for (const sy of precise ? [-1, 0, 1] : [0])
    for (const sx of precise ? [-2, -1, 0, 1, 2] : [0]) {
      let inter = 0;
      let sum = 0;
      for (let y = 0; y < H; y++) {
        const cy = y + sy;
        if (cy < 0 || cy >= H) continue;
        for (let x = 0; x < W; x++) {
          const a = bi[y * W + x];
          const b = bc[cy * WW + x + P + sx];
          inter += Math.min(a, b);
          sum += a + b;
        }
      }
      const d = sum ? (2 * inter) / sum : 0;
      if (d > best) best = d;
    }
  return best;
}

function compare(ink: Ink, text: string, family: string, weight: number, precise: boolean): { shape: number; track: number } | null {
  const RW = Math.ceil(ink.W * 1.6 + SIZE * 2);
  const iw = ink.right - ink.left;
  let best: { shape: number; track: number } | null = null;
  for (const t of text === text.toUpperCase() ? [text] : [text, text.toUpperCase()]) {
    const n = [...t].length;
    const natural = edgesOf(renderLine(t, family, weight, RW, ink.H), RW, ink.H);
    if (!natural || n < 2) continue;
    const spacing = (iw - (natural.right - natural.left)) / (n - 1);
    if (Math.abs(spacing) > SIZE * 0.25) continue; // far off: not this font
    const cov = renderLine(t, family, weight, RW, ink.H, spacing);
    const e = edgesOf(cov, RW, ink.H);
    if (!e) continue;
    const r = { shape: dice(ink, cov, RW, e.left, precise), track: Math.abs(spacing) / SIZE };
    if (!best || r.shape > best.shape) best = r;
  }
  return best;
}

/** The PDF's own pixels around a sample line, for the side-by-side preview. */
function sampleImage(pg: ReconstructedPage, l: SampleLine): string {
  const pad = l.fontH * 0.25;
  const x0 = Math.max(0, Math.floor(l.x - pad));
  const y0 = Math.max(0, Math.floor(l.baseline - l.fontH * ASC));
  const w = Math.min(pg.w - x0, Math.ceil(l.w + 2 * pad));
  const h = Math.min(pg.h - y0, Math.ceil(l.fontH * (ASC + DESC)));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(pg.original, x0, y0, w, h, 0, 0, w, h);
  return c.toDataURL("image/png");
}

/** Picks, per text style, the longest and largest whole runs to compare (run by reconstructPdf). */
export function pickSamples(items: { str: string; key: string; x: number; baseline: number; fontH: number; w: number }[]): StyleSample[] {
  const by = new Map<string, { lines: SampleLine[]; chars: number }>();
  for (const it of items) {
    const t = it.str.trim();
    const entry = by.get(it.key) ?? { lines: [], chars: 0 };
    entry.chars += t.length;
    by.set(it.key, entry);
    // Whole runs only (the crop must hold exactly this text), not too long.
    if (t.length < 4 || t.length > 45 || !/\p{L}{3}/u.test(t) || it.fontH < 8) continue;
    entry.lines.push({ text: t, x: it.x, baseline: it.baseline, fontH: it.fontH, w: it.w });
  }
  const out: StyleSample[] = [];
  for (const [key, { lines, chars }] of by) {
    lines.sort((a, b) => Math.min(b.text.length, 30) * b.fontH - Math.min(a.text.length, 30) * a.fontH);
    out.push({ key, lines: lines.slice(0, 3), chars });
  }
  return out;
}

/** Confidence from the shape overlap (calibrated on the reference PDFs). */
const confidenceOf = (shape: number): Confidence => (shape >= 0.85 ? "high" : shape >= 0.78 ? "medium" : "low");

/**
 * Detects the font of every text style in the rebuilt pages. A style used on
 * several pages is detected once (on the page where it has the most text).
 */
export async function detectPdfFonts(pages: ReconstructedPage[], onProgress?: (msg: string) => void): Promise<DetectedStyle[]> {
  const cands = await loadCandidates(onProgress);
  // Where each style has the most text.
  const where = new Map<string, { pg: ReconstructedPage; st: StyleSample }>();
  let total = 0;
  for (const pg of pages)
    for (const st of pg.styles) {
      const cur = where.get(st.key);
      if (!cur || st.chars > cur.st.chars) where.set(st.key, { pg, st });
    }
  const chars = new Map<string, number>();
  for (const pg of pages) for (const st of pg.styles) chars.set(st.key, (chars.get(st.key) || 0) + st.chars);
  const pixels = new Map<ReconstructedPage, { od: Uint8ClampedArray; bd: Uint8ClampedArray }>();
  const out: DetectedStyle[] = [];
  // Precise scorers per style, kept for the consistency pass below.
  const scorers = new Map<string, (family: string, weight: number) => { shape: number; rank: number } | null>();
  for (const [key, { pg, st }] of where) {
    onProgress?.(`Recognising fonts — style ${++total}/${where.size}`);
    let px = pixels.get(pg);
    if (!px) {
      px = { od: pg.original.getContext("2d")!.getImageData(0, 0, pg.w, pg.h).data, bd: pg.background.getContext("2d")!.getImageData(0, 0, pg.w, pg.h).data };
      pixels.set(pg, px);
    }
    const inks = st.lines.map((l) => ({ l, ink: inkOf(pg, px.od, px.bd, l) })).filter((x): x is { l: SampleLine; ink: Ink } => !!x.ink);
    if (!inks.length) {
      out.push({ key, best: null, confidence: "low", alternatives: [], sample: null, chars: chars.get(key) || 0 });
      continue;
    }
    const score = (family: string, weight: number, precise: boolean) => {
      let shape = 0;
      let track = 0;
      let n = 0;
      for (const { l, ink } of inks) {
        const r = compare(ink, l.text, family, weight, precise);
        if (!r) continue;
        shape += r.shape;
        track += r.track;
        n++;
      }
      return n ? { family, weight, shape: shape / n, rank: shape / n - (0.5 * track) / n } : null;
    };
    // Quick pass in three steps: every family at a regular and a bold
    // weight, every weight of the 12 best families, then a precise ranking.
    type Q = { family: string; weight: number; shape: number; rank: number };
    const near = (ws: number[], w: number) => ws.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
    const byFamily: Q[] = [];
    for (const c of cands) {
      let best: Q | null = null;
      for (const w of new Set([near(c.weights, 400), near(c.weights, 700)])) {
        const m = score(c.family, w, false);
        if (m && (!best || m.rank > best.rank)) best = m;
      }
      if (best) byFamily.push(best);
      await new Promise((r) => setTimeout(r, 0)); // keep the tab responsive
    }
    byFamily.sort((a, b) => b.rank - a.rank);
    const quick: Q[] = [];
    for (const f of byFamily.slice(0, 12)) {
      for (const w of cands.find((c) => c.family === f.family)!.weights) {
        const m = score(f.family, w, false);
        if (m) quick.push(m);
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    quick.sort((a, b) => b.rank - a.rank);
    const precise: typeof quick = [];
    for (const q of quick.slice(0, 20)) {
      const m = score(q.family, q.weight, true);
      if (m) precise.push(m);
      await new Promise((r) => setTimeout(r, 0));
    }
    precise.sort((a, b) => b.rank - a.rank);
    const seen = new Set<string>();
    const ranked = precise.filter((m) => !seen.has(m.family) && seen.add(m.family)).map(({ family, weight, shape }) => ({ family, weight, shape }));
    scorers.set(key, (family, weight) => score(family, weight, true));
    const best = ranked[0] ?? null;
    out.push({
      key,
      best,
      confidence: best ? confidenceOf(best.shape) : "low",
      alternatives: ranked.slice(1, 10),
      sample: { text: inks[0].l.text, image: sampleImage(pg, inks[0].l), size: inks[0].l.fontH / pg.scale },
      chars: chars.get(key) || 0,
    });
  }
  // A design rarely mixes many families: the page's main family (most text
  // among confident styles) is scored on every other style at all its
  // weights, and wins if it's almost as good (look-alikes like Outfit for
  // Urbanist differ by a hair; a doubtful style by a little more).
  const weightOf = new Map<string, number>();
  for (const d of out) if (d.best && d.confidence === "high") weightOf.set(d.best.family, (weightOf.get(d.best.family) || 0) + d.chars);
  const main = [...weightOf.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const mainWeights = cands.find((c) => c.family === main)?.weights ?? [];
  if (main)
    for (const d of out) {
      const sc = scorers.get(d.key);
      if (!d.best || d.best.family === main || !sc) continue;
      onProgress?.(`Recognising fonts — checking ${d.key}`);
      let alt: FontMatch | null = null;
      for (const w of mainWeights) {
        const r = sc(main, w);
        if (r && (!alt || r.shape > alt.shape)) alt = { family: main, weight: w, shape: r.shape };
      }
      await new Promise((r) => setTimeout(r, 0));
      const margin = d.confidence === "high" ? 0.02 : 0.05;
      if (alt && alt.shape >= d.best.shape - margin) {
        d.alternatives = [d.best, ...d.alternatives.filter((a) => a.family !== main)];
        d.best = alt;
        d.confidence = confidenceOf(alt.shape) === "low" ? "medium" : confidenceOf(alt.shape);
      }
    }
  // Styles with nothing to compare (only short text like "1.", or hidden):
  // the font of the nearest size in the same pdf.js font — Figma packs a
  // family's glyphs together — with its weight, as a probable match.
  const sizeOf = (k: string) => +k.split("@")[1] || 0;
  const fontOf = (k: string) => k.split("@")[0];
  for (const d of out) {
    if (d.best) continue;
    const sib = out
      .filter((o) => o.best && o.confidence !== "low" && fontOf(o.key) === fontOf(d.key))
      .sort((a, b) => Math.abs(sizeOf(a.key) - sizeOf(d.key)) - Math.abs(sizeOf(b.key) - sizeOf(d.key)))[0];
    if (sib?.best) {
      d.best = { ...sib.best, shape: 0 };
      d.confidence = "medium";
      d.alternatives = sib.alternatives;
    }
  }
  return out.sort((a, b) => b.chars - a.chars);
}
