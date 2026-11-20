// PDF lab — which font is this? (feasibility test)
//
// A Figma PDF carries no font name, but it draws every letter exactly. For
// each text style of the PDF (one pdf.js font per style), a few lines of the
// page's ink are compared with the same text rendered in candidate Google
// fonts at several weights: same size, same baseline, left edges aligned.
//   - shape: overlap of the two (Dice), the candidate given the letter
//     spacing that matches the ink's width (Figma tracking), in the text's
//     case or in capitals;
//   - width: that spacing, in em (a real match needs little).

import type { ReconstructedPage } from "@/lib/pdf-reconstruct";

export interface SampleLine {
  text: string;
  x: number;
  baseline: number;
  fontH: number;
  w: number;
}

export interface StyleSample {
  fontName: string;
  lines: SampleLine[];
}

export interface Candidate {
  family: string;
  weights: number[];
}

export interface Match {
  family: string;
  weight: number;
  score: number;
  shape: number;
  widthErr: number;
}

export interface StyleResult {
  fontName: string;
  sample: string;
  size: number;
  matches: Match[];
}

// Fetched through the dev server (./fonts), which asks Google.
// Popular Google families (sans, serif, display/script): the first pass of
// a test. The real catalogue (~1,700) would come from Google's metadata.
export const CANDIDATES = [
  "Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins", "Nunito", "Nunito Sans", "Raleway", "Source Sans 3",
  "Work Sans", "DM Sans", "Manrope", "Mulish", "Rubik", "Figtree", "Plus Jakarta Sans", "Outfit", "Karla", "Barlow",
  "Barlow Condensed", "Urbanist", "Lexend", "Sora", "Space Grotesk", "IBM Plex Sans", "Noto Sans", "PT Sans", "Ubuntu", "Fira Sans",
  "Titillium Web", "Oswald", "Archivo", "Heebo", "Hind", "Mukta", "Josefin Sans", "Quicksand", "Cabin", "Exo 2",
  "Kanit", "Red Hat Display", "Red Hat Text", "Public Sans", "Albert Sans", "Onest", "Instrument Sans", "Schibsted Grotesk", "Be Vietnam Pro", "Epilogue",
  "Hanken Grotesk", "Golos Text", "Libre Franklin", "Assistant", "Prompt", "Jost", "Arimo", "Overpass", "Encode Sans", "Asap",
  "Signika", "Catamaran", "Maven Pro", "Roboto Flex", "Roboto Condensed", "Inter Tight", "Chivo", "Commissioner", "Lexend Deca", "Readex Pro",
  "Questrial", "Varela Round", "Didact Gothic", "Tenor Sans", "Gantari", "Reddit Sans", "Bricolage Grotesque", "Familjen Grotesk", "Syne", "Geologica",
  "Source Serif 4", "Libre Baskerville", "Baskervville", "Playfair Display", "Merriweather", "Lora", "PT Serif", "Roboto Slab", "EB Garamond", "Cormorant Garamond",
  "Crimson Text", "Crimson Pro", "Libre Caslon Text", "DM Serif Display", "Noto Serif", "Frank Ruhl Libre", "Spectral", "Fraunces", "Bodoni Moda", "Newsreader",
  "Literata", "Gelasio", "Instrument Serif", "Young Serif", "Prata", "Cardo", "Old Standard TT", "Zilla Slab", "Arvo", "Bitter",
  "Dancing Script", "Pacifico", "Great Vibes", "Caveat", "Sacramento", "Allura", "Parisienne",
];

const TEST_WEIGHTS = [300, 400, 500, 600, 700, 800];

/** Loads a family's latin faces from Google Fonts; returns the weights it has (among TEST_WEIGHTS). */
async function loadFamily(family: string): Promise<Candidate | null> {
  const fam = family.replace(/ /g, "+");
  const tries = [`${fam}:wght@100..900`, `${fam}:wght@300;400;500;600;700;800`, `${fam}:wght@300;400;600;700`, `${fam}:wght@400;700`, fam];
  let css = "";
  for (const t of tries) {
    const res = await fetch(`/dev/pdf-lab/fonts?css=${encodeURIComponent(t)}`);
    if (res.ok) {
      css = await res.text();
      break;
    }
  }
  if (!css) return null;
  const weights = new Set<number>();
  // Each face: /* latin */ @font-face { … font-weight: 400 | 100 900; src: url(…) … }
  const re = /\/\*\s*latin\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  const faces: Promise<unknown>[] = [];
  while ((m = re.exec(css))) {
    const body = m[1];
    if (/font-style:\s*italic/.test(body)) continue;
    const wm = body.match(/font-weight:\s*(\d+)(?:\s+(\d+))?/);
    const url = body.match(/url\(([^)]+)\)/)?.[1];
    if (!wm || !url) continue;
    const lo = +wm[1];
    const hi = wm[2] ? +wm[2] : lo;
    for (const w of TEST_WEIGHTS) if (w >= lo && w <= hi) weights.add(w);
    const face = new FontFace(`lab-${family}`, `url(/dev/pdf-lab/fonts?file=${encodeURIComponent(url)})`, { weight: wm[2] ? `${lo} ${hi}` : String(lo) });
    document.fonts.add(face);
    faces.push(face.load().catch(() => null));
  }
  await Promise.all(faces);
  return weights.size ? { family, weights: [...weights].sort((a, b) => a - b) } : null;
}

let loaded: Promise<Candidate[]> | null = null;
export function loadCandidates(onStatus?: (s: string) => void): Promise<Candidate[]> {
  loaded ??= (async () => {
    const out: Candidate[] = [];
    for (let i = 0; i < CANDIDATES.length; i += 8) {
      onStatus?.(`Loading fonts ${i}/${CANDIDATES.length}…`);
      const batch = await Promise.all(CANDIDATES.slice(i, i + 8).map((f) => loadFamily(f).catch(() => null)));
      for (const c of batch) if (c) out.push(c);
    }
    return out;
  })();
  return loaded;
}

const SIZE = 48; // every sample is compared at this type size
const ASC = 1.15; // crop: this many em above the baseline…
const DESC = 0.35; // …and this many below

/** Ink coverage (0–1) of one PDF line, scaled to SIZE, with its left/right ink edges. */
function inkOf(pg: ReconstructedPage, od: Uint8ClampedArray, bd: Uint8ClampedArray, l: SampleLine) {
  const pad = l.fontH * 0.15;
  const x0 = Math.max(0, Math.floor(l.x - pad));
  const x1 = Math.min(pg.w, Math.ceil(l.x + l.w + pad));
  const y0 = Math.max(0, Math.floor(l.baseline - l.fontH * ASC));
  const y1 = Math.min(pg.h, Math.ceil(l.baseline + l.fontH * DESC));
  const cw = x1 - x0;
  const ch = y1 - y0;
  if (cw < 4 || ch < 4) return null;
  const big = document.createElement("canvas");
  big.width = cw;
  big.height = ch;
  const bctx = big.getContext("2d")!;
  const img = bctx.createImageData(cw, ch);
  // Full coverage = the text colour against its background: the strongest
  // differences in the crop (98th percentile), so antialiased edges keep
  // their partial coverage and the letters don't look bolder than they are.
  const diffs = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const i = ((y + y0) * pg.w + (x + x0)) * 4;
      diffs[y * cw + x] = Math.abs(od[i] - bd[i]) + Math.abs(od[i + 1] - bd[i + 1]) + Math.abs(od[i + 2] - bd[i + 2]);
    }
  const strong = [...diffs].filter((d) => d > 30).sort((a, b) => a - b);
  const full = strong.length ? strong[Math.floor(strong.length * 0.98)] : 255;
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const d = diffs[y * cw + x];
      const v = d < 20 ? 0 : Math.min(255, (255 * d) / full);
      const j = (y * cw + x) * 4;
      img.data[j] = img.data[j + 1] = img.data[j + 2] = v;
      img.data[j + 3] = 255;
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
  // Baseline lands at SIZE·ASC in the small crop.
  sctx.drawImage(big, 0, SIZE * ASC - (l.baseline - y0) * s, W, ch * s);
  const data = sctx.getImageData(0, 0, W, H).data;
  const cov = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) cov[i] = data[i * 4] / 255;
  const edges = edgesOf(cov, W, H);
  return edges ? { cov, W, H, ...edges } : null;
}

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
  ctx.font = `${weight} ${SIZE}px "lab-${family}"`;
  ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(text, 4, SIZE * ASC);
  const data = ctx.getImageData(0, 0, W, H).data;
  const cov = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) cov[i] = 1 - data[i * 4] / 255;
  return cov;
}

/** Two passes of a 3×3 box blur: a near-Gaussian that forgives 1px offsets of the contours. */
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

/**
 * Overlap of ink and candidate, left edges aligned. Precise: both blurred
 * and the best of small shifts (±2px, ±1px vertically) — forgives 1px
 * contour offsets; quick: raw overlap, for a first ranking.
 */
function dice(ink: NonNullable<ReturnType<typeof inkOf>>, cov: Float32Array, RW: number, cLeft: number, precise: boolean) {
  const W = ink.W;
  const H = ink.H;
  // The candidate cut to the ink's window (with 2px either side for shifts).
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
  const ys = precise ? [-1, 0, 1] : [0];
  const xs = precise ? [-2, -1, 0, 1, 2] : [0];
  for (const sy of ys)
    for (const sx of xs) {
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

/**
 * Renders the text in the candidate, with the letter spacing that gives the
 * ink's width (designers often track text in Figma), left edges aligned,
 * and measures the overlap. Tries the text as written and in capitals
 * (Figma's "uppercase" keeps the original case in the text layer).
 */
function compare(ink: NonNullable<ReturnType<typeof inkOf>>, text: string, family: string, weight: number, precise = false): { shape: number; widthErr: number } | null {
  const RW = Math.ceil(ink.W * 1.6 + SIZE * 2);
  const iw = ink.right - ink.left;
  let best: { shape: number; widthErr: number } | null = null;
  for (const t of text === text.toUpperCase() ? [text] : [text, text.toUpperCase()]) {
    const n = [...t].length;
    const natural = edgesOf(renderLine(t, family, weight, RW, ink.H), RW, ink.H);
    if (!natural || n < 2) continue;
    const spacing = (iw - (natural.right - natural.left)) / (n - 1);
    if (Math.abs(spacing) > SIZE * 0.25) continue; // far off: not this font
    const cov = renderLine(t, family, weight, RW, ink.H, spacing);
    const e = edgesOf(cov, RW, ink.H);
    if (!e) continue;
    const r = { shape: dice(ink, cov, RW, e.left, precise), widthErr: Math.abs(spacing) / SIZE };
    if (!best || r.shape > best.shape) best = r;
  }
  return best;
}

/** Ranks the candidates for each text style of a page. */
export async function detectFonts(pg: ReconstructedPage, styles: StyleSample[], candidates: Candidate[]): Promise<StyleResult[]> {
  const od = pg.original.getContext("2d")!.getImageData(0, 0, pg.w, pg.h).data;
  const bd = pg.background.getContext("2d")!.getImageData(0, 0, pg.w, pg.h).data;
  const out: StyleResult[] = [];
  for (const st of styles) {
    const inks = st.lines.map((l) => ({ l, ink: inkOf(pg, od, bd, l) })).filter((x) => x.ink);
    if (!inks.length) continue;
    const score = (family: string, w: number, precise: boolean): Match | null => {
      let shape = 0;
      let widthErr = 0;
      let n = 0;
      for (const { l, ink } of inks) {
        const r = compare(ink!, l.text.trim(), family, w, precise);
        if (!r) continue;
        shape += r.shape;
        widthErr += r.widthErr;
        n++;
      }
      if (!n) return null;
      shape /= n;
      widthErr /= n;
      return { family, weight: w, shape, widthErr, score: shape - 0.5 * widthErr };
    };
    // Quick ranking of every family and weight, then a precise one of the best 20.
    const quick: Match[] = [];
    for (const c of candidates) {
      for (const w of c.weights) {
        const m = score(c.family, w, false);
        if (m) quick.push(m);
      }
      await new Promise((r) => setTimeout(r, 0)); // keep the tab responsive
    }
    quick.sort((a, b) => b.score - a.score);
    const matches: Match[] = [];
    for (const q of quick.slice(0, 20)) {
      const m = score(q.family, q.weight, true);
      if (m) matches.push(m);
      await new Promise((r) => setTimeout(r, 0));
    }
    matches.sort((a, b) => b.score - a.score);
    // Best weight per family, top 8 families.
    const seen = new Set<string>();
    const top = matches.filter((m) => !seen.has(m.family) && seen.add(m.family)).slice(0, 8);
    out.push({ fontName: st.fontName, sample: inks[0].l.text.trim().slice(0, 40), size: Math.round(inks[0].l.fontH / pg.scale), matches: top });
  }
  return out;
}

/** Picks, per pdf.js font, a few long and large lines to compare. */
export function pickSamples(
  items: { str: string; fontName: string; x: number; baseline: number; fontH: number; w: number; rotated: boolean }[],
): StyleSample[] {
  const by = new Map<string, SampleLine[]>();
  for (const it of items) {
    const t = it.str.trim();
    // Whole runs only (the crop must hold exactly this text), not too long.
    if (it.rotated || t.length < 5 || t.length > 45 || !/\p{L}{3}/u.test(t) || it.fontH < 8) continue;
    if (/^[a-z]+(-[a-z0-9]+)+$/.test(t)) continue; // icon names
    const list = by.get(it.fontName) ?? [];
    list.push({ text: t, x: it.x, baseline: it.baseline, fontH: it.fontH, w: it.w });
    by.set(it.fontName, list);
  }
  const out: StyleSample[] = [];
  for (const [fontName, lines] of by) {
    lines.sort((a, b) => Math.min(b.text.length, 30) * b.fontH - Math.min(a.text.length, 30) * a.fontH);
    out.push({ fontName, lines: lines.slice(0, 3) });
  }
  return out;
}

/** Debug: the ink crop of a sample line over the candidate's rendering (ink red, candidate blue), as a data URL. */
export function debugCompare(pg: ReconstructedPage, l: SampleLine, family: string, weight: number): string | null {
  const od = pg.original.getContext("2d")!.getImageData(0, 0, pg.w, pg.h).data;
  const bd = pg.background.getContext("2d")!.getImageData(0, 0, pg.w, pg.h).data;
  const ink = inkOf(pg, od, bd, l);
  if (!ink) return null;
  const RW = Math.ceil(ink.W * 1.6 + SIZE * 2);
  const t = l.text.trim();
  const natural = edgesOf(renderLine(t, family, weight, RW, ink.H), RW, ink.H);
  if (!natural) return null;
  const spacing = (ink.right - ink.left - (natural.right - natural.left)) / Math.max(1, [...t].length - 1);
  const cov = renderLine(t, family, weight, RW, ink.H, spacing);
  const e = edgesOf(cov, RW, ink.H)!;
  const c = document.createElement("canvas");
  c.width = ink.W;
  c.height = ink.H;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(ink.W, ink.H);
  const dx = e.left - ink.left;
  for (let y = 0; y < ink.H; y++)
    for (let x = 0; x < ink.W; x++) {
      const a = ink.cov[y * ink.W + x];
      const cx = x + dx;
      const b = cx >= 0 && cx < RW ? cov[y * RW + cx] : 0;
      const j = (y * ink.W + x) * 4;
      img.data[j] = 255 - b * 255;
      img.data[j + 1] = 255 - Math.max(a, b) * 255;
      img.data[j + 2] = 255 - a * 255;
      img.data[j + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}
