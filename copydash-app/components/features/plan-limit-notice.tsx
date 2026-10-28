// Shown where a plan limit blocks an action (new project, new page). Paid
// plans aren't on sale yet, so it explains the limit and the way around it
// (archiving) rather than linking to checkout.

import { Icon } from "@/components/ui/icon";

export function PlanLimitNotice({ message, style }: { message: string; style?: React.CSSProperties }) {
  return (
    <div
      role="status"
      style={{
        padding: "12px 14px",
        background: "#fffbeb",
        border: "1px solid #fde68a",
        borderRadius: 10,
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        ...style,
      }}
    >
      <Icon name="alert-circle" size={15} color="#b45309" style={{ marginTop: 1, flexShrink: 0 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#92400e", fontFamily: "var(--font-sans)" }}>Plan limit reached</span>
        <span style={{ fontSize: 13, color: "#92400e", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>{message} Paid plans are coming soon.</span>
      </div>
    </div>
  );
}
