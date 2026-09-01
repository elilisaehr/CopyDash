"use client";

import * as React from "react";
import { Icon } from "@/components/ui/icon";

export interface SeoField {
  id: string;
  content: string;
}

export interface SeoCheck {
  id: string;
  label: string;
  score: number;
  max: number;
  tip: string;
}

export interface SeoResult {
  checks: SeoCheck[];
  total: number;
  maxTotal: number;
  pct: number;
  wordCount: number;
}

// Ported 1:1 from copydash/seo.jsx computeSEO — deterministic, no AI.
export function computeSEO(fields: SeoField[], pageName: string, projectName: string): SeoResult {
  const get = (id: string) => (fields.find((f) => f.id === id)?.content || "").trim();
  const headline = get("hero_headline");
  const subtitle = get("hero_subtitle");
  const cta = get("cta_primary");
  const aboutTitle = get("about_title");
  const body = get("about_body");
  const footer = get("footer_tagline");
  const allText = [headline, subtitle, body, aboutTitle, footer].join(" ");
  const wordCount = allText.split(/\s+/).filter(Boolean).length;

  const checks: SeoCheck[] = [];

  const titleLen = headline.length;
  if (titleLen === 0) checks.push({ id: "title", label: "Missing page headline", score: 0, max: 15, tip: "Add a compelling headline (50–60 chars ideal)." });
  else if (titleLen < 30) checks.push({ id: "title", label: "Headline too short", score: 7, max: 15, tip: `Your headline is ${titleLen} chars. Aim for 50–60 characters.` });
  else if (titleLen > 70) checks.push({ id: "title", label: "Headline too long", score: 10, max: 15, tip: `Your headline is ${titleLen} chars. Keep it under 65.` });
  else checks.push({ id: "title", label: "Headline length ✓", score: 15, max: 15, tip: `Good length (${titleLen} chars). Search engines will display it fully.` });

  const descLen = subtitle.length;
  if (descLen === 0) checks.push({ id: "desc", label: "Missing meta description", score: 0, max: 15, tip: "Add a subtitle/description (120–160 chars ideal)." });
  else if (descLen < 80) checks.push({ id: "desc", label: "Description too short", score: 7, max: 15, tip: `Your description is ${descLen} chars. Aim for 120–160.` });
  else if (descLen > 165) checks.push({ id: "desc", label: "Description too long", score: 10, max: 15, tip: `Description is ${descLen} chars. It may be truncated in search results.` });
  else checks.push({ id: "desc", label: "Meta description ✓", score: 15, max: 15, tip: `Great length (${descLen} chars). Ideal for search results.` });

  const bodyWords = body.split(/\s+/).filter(Boolean).length;
  if (bodyWords === 0) checks.push({ id: "body", label: "No body content", score: 0, max: 20, tip: "Add body copy. Pages with 300+ words rank better." });
  else if (bodyWords < 100) checks.push({ id: "body", label: "Body copy too short", score: 8, max: 20, tip: `${bodyWords} words. Aim for at least 200–300 words for SEO.` });
  else if (bodyWords < 200) checks.push({ id: "body", label: "Body copy could be longer", score: 14, max: 20, tip: `${bodyWords} words. Add more detail to reach 300+.` });
  else checks.push({ id: "body", label: `Body content ✓ (${bodyWords} words)`, score: 20, max: 20, tip: `Good content length. Search engines reward comprehensive pages.` });

  if (!cta) checks.push({ id: "cta", label: "Missing call-to-action", score: 0, max: 10, tip: "Add a clear CTA button text to guide users." });
  else checks.push({ id: "cta", label: "Call-to-action ✓", score: 10, max: 10, tip: `"${cta}" — clear CTA present.` });

  const keyword = (projectName.split(" ")[0] || "").toLowerCase();
  const keywordCount = keyword ? allText.toLowerCase().split(keyword).length - 1 : 0;
  const density = wordCount > 0 ? Number(((keywordCount / wordCount) * 100).toFixed(1)) : 0;
  if (keywordCount === 0) checks.push({ id: "kw", label: "No keyword detected", score: 0, max: 15, tip: `Include "${keyword}" naturally in your content.` });
  else if (density > 4) checks.push({ id: "kw", label: "Keyword over-used", score: 8, max: 15, tip: `Density: ${density}%. Over-optimisation can hurt rankings. Aim for 1–3%.` });
  else checks.push({ id: "kw", label: `Keyword density ✓ (${density}%)`, score: 15, max: 15, tip: `"${keyword}" appears ${keywordCount} time${keywordCount > 1 ? "s" : ""} — natural density.` });

  const sentences = body.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const avgWords = sentences.length > 0 ? Math.round(bodyWords / sentences.length) : 0;
  if (sentences.length === 0) checks.push({ id: "read", label: "Readability: no sentences", score: 0, max: 10, tip: "Write in clear sentences for better readability." });
  else if (avgWords > 25) checks.push({ id: "read", label: "Sentences too long", score: 5, max: 10, tip: `Avg ${avgWords} words/sentence. Break them up for readability (aim < 20).` });
  else checks.push({ id: "read", label: `Readability ✓ (${avgWords} w/sentence)`, score: 10, max: 10, tip: `Good sentence length. Easy to read for users and search engines.` });

  const filled = fields.filter((f) => f.content.length > 0).length;
  const fillScore = fields.length ? Math.round((filled / fields.length) * 15) : 0;
  checks.push({
    id: "fill",
    label: `Content completeness (${filled}/${fields.length})`,
    score: fillScore,
    max: 15,
    tip: filled < fields.length ? `${fields.length - filled} field${fields.length - filled > 1 ? "s" : ""} still empty.` : "All fields filled — excellent!",
  });

  const total = checks.reduce((s, c) => s + c.score, 0);
  const maxTotal = checks.reduce((s, c) => s + c.max, 0);
  const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;

  return { checks, total, maxTotal, pct, wordCount };
}

export function SEO_GRADE(pct: number) {
  if (pct >= 85) return { label: "Excellent", color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" };
  if (pct >= 65) return { label: "Good", color: "#0369a1", bg: "#eff6ff", border: "#bfdbfe" };
  if (pct >= 45) return { label: "Fair", color: "#f59e0b", bg: "#fffbeb", border: "#fde68a" };
  return { label: "Needs Work", color: "#e7000b", bg: "#fff5f5", border: "#fecaca" };
}

export function SEOToggle({ open, onToggle, score }: { open: boolean; onToggle: () => void; score: number }) {
  const grade = SEO_GRADE(score);
  return (
    <button
      onClick={onToggle}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        borderRadius: 7,
        border: `1px solid ${open ? grade.border : "#e4e4e7"}`,
        background: open ? grade.bg : "#fff",
        cursor: "pointer",
        transition: "all 0.15s",
        fontFamily: "var(--font-sans)",
      }}
    >
      <Icon name="zap" size={13} color={grade.color} />
      <span style={{ fontSize: 12, fontWeight: 600, color: grade.color }}>SEO {score}</span>
      <span style={{ fontSize: 11, color: grade.color, opacity: 0.8 }}>{grade.label}</span>
    </button>
  );
}

export function SEOPanel({
  fields,
  pageName,
  projectName,
  onClose,
}: {
  fields: SeoField[];
  pageName: string;
  projectName: string;
  onClose?: () => void;
}) {
  const seo = React.useMemo(() => computeSEO(fields, pageName, projectName), [fields, pageName, projectName]);
  const grade = SEO_GRADE(seo.pct);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const circumference = 2 * Math.PI * 34;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "100%" }}>
      <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #f4f4f5" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="zap" size={15} color="#7f22fe" />
          <span style={{ fontSize: 14, fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)" }}>SEO Analysis</span>
        </div>
        {onClose && (
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#a1a1aa" }}>
            <Icon name="x" size={15} />
          </button>
        )}
      </div>
      <div style={{ padding: "20px 20px 16px", textAlign: "center", borderBottom: "1px solid #f4f4f5" }}>
        <div style={{ position: "relative", width: 80, height: 80, margin: "0 auto 12px" }}>
          <svg width="80" height="80" viewBox="0 0 80 80" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="40" cy="40" r="34" fill="none" stroke="#f4f4f5" strokeWidth="7" />
            <circle
              cx="40"
              cy="40"
              r="34"
              fill="none"
              stroke={grade.color}
              strokeWidth="7"
              strokeDasharray={`${circumference}`}
              strokeDashoffset={`${circumference * (1 - seo.pct / 100)}`}
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 0.6s ease" }}
            />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: grade.color, fontFamily: "var(--font-sans)", lineHeight: 1 }}>{seo.pct}</div>
            <div style={{ fontSize: 9, fontWeight: 600, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.04em", fontFamily: "var(--font-sans)" }}>/ 100</div>
          </div>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: grade.color, fontFamily: "var(--font-sans)" }}>{grade.label}</div>
        <div style={{ fontSize: 11, color: "#a1a1aa", fontFamily: "var(--font-body)", marginTop: 2 }}>SEO Score · {seo.wordCount} words</div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "10px 0" }}>
        {seo.checks.map((c) => {
          const pct = c.max ? Math.round((c.score / c.max) * 100) : 0;
          const isGood = pct >= 80;
          const isMid = pct >= 40 && pct < 80;
          const color = isGood ? "#15803d" : isMid ? "#f59e0b" : "#e7000b";
          const isOpen = expanded === c.id;

          return (
            <div key={c.id} onClick={() => setExpanded(isOpen ? null : c.id)} style={{ padding: "10px 16px", cursor: "pointer", borderBottom: "1px solid #f9f9f9" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: isGood ? "#f0fdf4" : isMid ? "#fffbeb" : "#fff5f5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon name={isGood ? "check" : isMid ? "clock" : "x"} size={10} color={color} />
                </div>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: "#09090b", fontFamily: "var(--font-sans)", lineHeight: 1.3 }}>{c.label}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color, fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                  {c.score}/{c.max}
                </span>
              </div>
              {isOpen && (
                <div style={{ marginTop: 8, marginLeft: 26, padding: "8px 10px", background: "#f5f3ff", borderRadius: 8, border: "1px solid #e9e4ff" }}>
                  <p style={{ margin: 0, fontSize: 11, color: "#7f22fe", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>{c.tip}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
