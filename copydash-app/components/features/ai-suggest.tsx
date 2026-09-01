"use client";

import * as React from "react";
import { Icon } from "@/components/ui/icon";
import { Btn, Spinner } from "@/components/ui/primitives";
import { mockGenerateFieldSuggestions } from "@/lib/ai-mock";

export interface AiField {
  id: string;
  label: string;
  content: string;
  maxChars: number;
}

const ACTIONS = [
  { id: "improve", label: "Improve writing", icon: "sparkles", color: "#7f22fe" },
  { id: "seo", label: "Optimise for SEO", icon: "zap", color: "#f59e0b" },
  { id: "shorter", label: "Make shorter", icon: "filter", color: "#0369a1" },
  { id: "formal", label: "More formal", icon: "building", color: "#52525b" },
  { id: "friendly", label: "More friendly", icon: "user", color: "#15803d" },
  { id: "translate_fr", label: "Translate to French", icon: "globe", color: "#be123c" },
];

export function AISuggestButton({ field, onApply }: { field: AiField; onApply: (text: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [loadingType, setLoadingType] = React.useState<string | null>(null);
  const [suggestions, setSuggestions] = React.useState<{ id: number; text: string }[]>([]);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const generate = async (action: (typeof ACTIONS)[number]) => {
    if (!field.content && action.id !== "improve") return;
    setLoadingType(action.id);
    setLoading(true);
    setSuggestions([]);
    try {
      const result = await mockGenerateFieldSuggestions(action.label, field.content, field.label, field.maxChars);
      setSuggestions(result);
    } finally {
      setLoading(false);
      setLoadingType(null);
    }
  };

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => {
          setOpen((o) => !o);
          setSuggestions([]);
        }}
        title="AI Suggestions"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 8px",
          borderRadius: 6,
          border: `1px solid ${open ? "#c4b4ff" : "#e4e4e7"}`,
          background: open ? "#f5f3ff" : "#fff",
          cursor: "pointer",
        }}
      >
        <Icon name="sparkles" size={12} color={open ? "#7f22fe" : "#a1a1aa"} />
        <span style={{ fontSize: 10, fontWeight: 600, color: open ? "#7f22fe" : "#71717b", fontFamily: "var(--font-sans)" }}>AI</span>
      </button>

      {open && (
        <div style={{ position: "absolute", right: 0, top: 34, zIndex: 300, width: 320, background: "#fff", borderRadius: 14, border: "1px solid #e4e4e7", boxShadow: "0 8px 32px rgba(0,0,0,0.12)", overflow: "hidden" }}>
          <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid #f4f4f5", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 20, height: 20, borderRadius: 6, background: "#f5f3ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="sparkles" size={11} color="#7f22fe" />
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)" }}>AI Suggestions</span>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#a1a1aa", padding: 2 }}>
              <Icon name="x" size={13} />
            </button>
          </div>

          {suggestions.length === 0 && !loading && (
            <div style={{ padding: "10px 10px 4px" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "var(--font-sans)", padding: "2px 6px 8px" }}>Choose an action</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    onClick={() => generate(action)}
                    disabled={loading}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #e4e4e7",
                      background: loadingType === action.id ? "#f5f3ff" : "#fafafa",
                      cursor: loading ? "not-allowed" : "pointer",
                      opacity: loading && loadingType !== action.id ? 0.5 : 1,
                    }}
                  >
                    {loadingType === action.id ? <Spinner size={12} color="#7f22fe" /> : <Icon name={action.icon} size={13} color={action.color} />}
                    <span style={{ fontSize: 11, fontWeight: 500, color: "#09090b", fontFamily: "var(--font-sans)", lineHeight: 1.2 }}>{action.label}</span>
                  </button>
                ))}
              </div>
              {!field.content && (
                <div style={{ margin: "8px 4px 0", padding: "8px 10px", background: "#fffbeb", borderRadius: 8, fontSize: 11, color: "#92400e", fontFamily: "var(--font-body)" }}>
                  💡 Add some text first for better suggestions, or AI will generate from context.
                </div>
              )}
            </div>
          )}

          {loading && !suggestions.length && (
            <div style={{ padding: "28px 20px", textAlign: "center" }}>
              <Spinner size={22} color="#7f22fe" />
              <div style={{ fontSize: 13, fontWeight: 500, color: "#7f22fe", fontFamily: "var(--font-sans)", marginTop: 12 }}>Generating suggestions…</div>
            </div>
          )}

          {suggestions.length > 0 && (
            <div style={{ padding: "8px 10px 12px" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#7f22fe", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "var(--font-sans)", padding: "2px 6px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>{suggestions.length} suggestions</span>
                <button onClick={() => setSuggestions([])} style={{ fontSize: 10, color: "#a1a1aa", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)" }}>
                  ← Back
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {suggestions.map((s, i) => (
                  <SuggestionCard
                    key={s.id}
                    text={s.text}
                    index={i + 1}
                    maxChars={field.maxChars}
                    onApply={() => {
                      onApply(s.text);
                      setOpen(false);
                      setSuggestions([]);
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SuggestionCard({ text, index, maxChars, onApply }: { text: string; index: number; maxChars: number; onApply: () => void }) {
  const [hov, setHov] = React.useState(false);
  const len = text.length;
  const over = len > maxChars;

  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{ borderRadius: 10, border: `1px solid ${hov ? "#c4b4ff" : "#e4e4e7"}`, background: hov ? "#fdfcff" : "#fafafa", overflow: "hidden" }}>
      <div style={{ padding: "10px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: "#7f22fe", fontFamily: "var(--font-sans)" }}>Option {index}</span>
          <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: over ? "#e7000b" : "#a1a1aa" }}>
            {len}/{maxChars}
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "#3f3f46", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>{text}</p>
      </div>
      {hov && (
        <div style={{ padding: "8px 12px", borderTop: "1px solid #f0eeff", display: "flex", gap: 6 }}>
          <Btn variant="primary" size="sm" onClick={onApply} style={{ flex: 1, fontSize: 11 }} icon="check">
            Apply
          </Btn>
          <Btn variant="ghost" size="sm" onClick={() => navigator.clipboard?.writeText(text)} style={{ fontSize: 11 }} icon="copy">
            Copy
          </Btn>
        </div>
      )}
    </div>
  );
}
