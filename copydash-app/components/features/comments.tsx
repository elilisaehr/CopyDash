"use client";

import * as React from "react";
import { Icon } from "@/components/ui/icon";
import { Avatar } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/format";
import type { Comment, UserRole } from "@/lib/supabase/types";

interface CommentsUser {
  id: string;
  name: string;
  role: UserRole;
}

export function CommentButton({
  projectId,
  pageId,
  fieldKey,
  user,
}: {
  projectId: string;
  pageId: string;
  fieldKey: string;
  user: CommentsUser;
}) {
  const [open, setOpen] = React.useState(false);
  const [count, setCount] = React.useState(0);
  const ref = React.useRef<HTMLDivElement>(null);

  const refreshCount = React.useCallback(async () => {
    const supabase = createClient();
    const { count: c } = await supabase
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("page_id", pageId)
      .eq("field_key", fieldKey)
      .eq("resolved", false);
    setCount(c || 0);
  }, [pageId, fieldKey]);

  React.useEffect(() => {
    // Fetch-on-mount: refreshCount awaits Supabase before setting state,
    // so this doesn't render synchronously within the effect itself.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshCount();
  }, [refreshCount]);

  const handleClose = () => {
    setOpen(false);
    refreshCount();
  };

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) handleClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Comments"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 8px",
          borderRadius: 6,
          border: `1px solid ${open ? "#c4b4ff" : count > 0 ? "#f59e0b" : "#e4e4e7"}`,
          background: open ? "#f5f3ff" : count > 0 ? "#fffbeb" : "#fff",
          cursor: "pointer",
        }}
      >
        <Icon name="edit" size={12} color={count > 0 ? "#f59e0b" : "#a1a1aa"} />
        {count > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b", fontFamily: "var(--font-sans)" }}>{count}</span>}
      </button>

      {open && (
        <div style={{ position: "absolute", right: 0, top: 36, zIndex: 300 }}>
          <CommentThread projectId={projectId} pageId={pageId} fieldKey={fieldKey} user={user} onClose={handleClose} />
        </div>
      )}
    </div>
  );
}

function CommentThread({
  projectId,
  pageId,
  fieldKey,
  user,
  onClose,
}: {
  projectId: string;
  pageId: string;
  fieldKey: string;
  user: CommentsUser;
  onClose: () => void;
}) {
  const [comments, setComments] = React.useState<Comment[]>([]);
  const [text, setText] = React.useState("");
  const [showResolved, setShowResolved] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const load = React.useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("comments")
      .select("*")
      .eq("page_id", pageId)
      .eq("field_key", fieldKey)
      .order("created_at", { ascending: true });
    setComments((data as Comment[]) || []);
    setLoading(false);
  }, [pageId, fieldKey]);

  React.useEffect(() => {
    // Fetch-on-mount: load() awaits Supabase before setting state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    inputRef.current?.focus();
  }, [load]);

  const active = comments.filter((c) => !c.resolved);
  const resolved = comments.filter((c) => c.resolved);
  const displayed = showResolved ? comments : active;

  const handleAdd = async () => {
    if (!text.trim()) return;
    const supabase = createClient();
    await supabase.from("comments").insert({
      project_id: projectId,
      page_id: pageId,
      field_key: fieldKey,
      author_id: user.id,
      author_name: user.name,
      role: user.role,
      body: text.trim(),
    });
    setText("");
    load();
  };

  const handleResolve = async (id: string) => {
    const supabase = createClient();
    await supabase.from("comments").update({ resolved: true }).eq("id", id);
    load();
  };

  const handleDelete = async (id: string) => {
    const supabase = createClient();
    await supabase.from("comments").delete().eq("id", id);
    load();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", background: "#fff", borderRadius: 12, border: "1px solid #e4e4e7", boxShadow: "0 4px 24px rgba(0,0,0,0.10)", width: 300, maxHeight: 440, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid #f4f4f5" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Icon name="edit" size={13} color="#7f22fe" />
          <span style={{ fontSize: 13, fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)" }}>Comments</span>
          {active.length > 0 && <span style={{ background: "#7f22fe", color: "#fff", borderRadius: 9999, fontSize: 10, fontWeight: 600, padding: "1px 6px", fontFamily: "var(--font-sans)" }}>{active.length}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {resolved.length > 0 && (
            <button onClick={() => setShowResolved((s) => !s)} style={{ fontSize: 11, color: "#71717b", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", padding: "2px 6px", borderRadius: 4 }}>
              {showResolved ? "Hide resolved" : `${resolved.length} resolved`}
            </button>
          )}
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#a1a1aa", padding: 2, borderRadius: 4 }}>
            <Icon name="x" size={14} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        {loading ? null : displayed.length === 0 ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <Icon name="edit" size={24} color="#e4e4e7" style={{ margin: "0 auto 8px" }} />
            <div style={{ fontSize: 13, color: "#a1a1aa", fontFamily: "var(--font-body)" }}>No comments yet</div>
            <div style={{ fontSize: 11, color: "#d4d4d8", fontFamily: "var(--font-body)", marginTop: 4 }}>Be the first to comment</div>
          </div>
        ) : (
          displayed.map((c) => <CommentBubble key={c.id} comment={c} user={user} onResolve={() => handleResolve(c.id)} onDelete={() => handleDelete(c.id)} />)
        )}
      </div>

      <div style={{ padding: "10px 14px", borderTop: "1px solid #f4f4f5" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <Avatar name={user.name} size={26} />
          <div style={{ flex: 1, position: "relative" }}>
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              placeholder="Add a comment… (Enter to send)"
              rows={2}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e4e4e7", fontSize: 13, fontFamily: "var(--font-body)", color: "#09090b", resize: "none", outline: "none", boxSizing: "border-box", lineHeight: 1.5 }}
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={!text.trim()}
            style={{ width: 30, height: 30, borderRadius: 8, border: "none", cursor: text.trim() ? "pointer" : "not-allowed", background: text.trim() ? "#7f22fe" : "#f4f4f5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          >
            <Icon name="send" size={13} color={text.trim() ? "#fff" : "#a1a1aa"} />
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentBubble({ comment: c, user, onResolve, onDelete }: { comment: Comment; user: CommentsUser; onResolve: () => void; onDelete: () => void }) {
  const [hov, setHov] = React.useState(false);
  const isMe = c.author_id === user.id;
  const roleColor = c.role === "pm" ? "#7f22fe" : "#0369a1";
  const roleLabel = c.role === "pm" ? "PM" : "Client";

  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{ opacity: c.resolved ? 0.5 : 1 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <Avatar name={c.author_name} size={24} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#09090b", fontFamily: "var(--font-sans)" }}>{c.author_name}</span>
            <span style={{ fontSize: 10, fontWeight: 500, color: roleColor, background: `${roleColor}15`, padding: "1px 5px", borderRadius: 4, fontFamily: "var(--font-sans)" }}>{roleLabel}</span>
            <span style={{ fontSize: 11, color: "#a1a1aa", fontFamily: "var(--font-body)" }}>{timeAgo(c.created_at)}</span>
            {c.resolved && <span style={{ fontSize: 10, color: "#15803d", fontFamily: "var(--font-sans)" }}>✓ Resolved</span>}
          </div>
          <div style={{ fontSize: 13, color: "#3f3f46", fontFamily: "var(--font-body)", lineHeight: 1.5, background: "#fafafa", padding: "7px 10px", borderRadius: "0 8px 8px 8px", border: "1px solid #f4f4f5", wordBreak: "break-word" }}>{c.body}</div>
          {hov && !c.resolved && (
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <button onClick={onResolve} style={{ fontSize: 11, color: "#15803d", background: "none", border: "none", cursor: "pointer", padding: "2px 4px", fontFamily: "var(--font-body)", display: "flex", alignItems: "center", gap: 3 }}>
                <Icon name="check" size={11} color="#15803d" /> Resolve
              </button>
              {isMe && (
                <button onClick={onDelete} style={{ fontSize: 11, color: "#e7000b", background: "none", border: "none", cursor: "pointer", padding: "2px 4px", fontFamily: "var(--font-body)", display: "flex", alignItems: "center", gap: 3 }}>
                  <Icon name="trash" size={11} color="#e7000b" /> Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
