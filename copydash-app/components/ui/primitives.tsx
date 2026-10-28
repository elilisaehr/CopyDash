"use client";

import * as React from "react";
import { Icon } from "./icon";

// ── Button ────────────────────────────────────────────────────────
type BtnVariant = "primary" | "outline" | "ghost" | "destructive" | "accent";
type BtnSize = "sm" | "md" | "lg";

export function Btn({
  children,
  variant = "primary",
  size = "md",
  onClick,
  disabled,
  style = {},
  icon,
  iconPos = "left",
  fullWidth,
  type = "button",
  title,
}: {
  children?: React.ReactNode;
  variant?: BtnVariant;
  size?: BtnSize;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  style?: React.CSSProperties;
  icon?: string;
  iconPos?: "left" | "right";
  fullWidth?: boolean;
  type?: "button" | "submit";
  title?: string;
}) {
  const [hovered, setHovered] = React.useState(false);

  const baseStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    fontFamily: "var(--font-sans)",
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    border: "none",
    outline: "none",
    transition: "all 0.15s ease",
    userSelect: "none",
    opacity: disabled ? 0.5 : 1,
    width: fullWidth ? "100%" : undefined,
    whiteSpace: "nowrap",
  };

  const sizeStyle: React.CSSProperties = {
    sm: { padding: "0 10px", height: 30, fontSize: 12, borderRadius: 6 },
    md: { padding: "0 14px", height: 36, fontSize: 14, borderRadius: 8 },
    lg: { padding: "0 20px", height: 44, fontSize: 15, borderRadius: 8 },
  }[size];

  const variantStyle: React.CSSProperties = {
    primary: { background: hovered ? "#7008e7" : "#7f22fe", color: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.1)" },
    outline: { background: hovered ? "#f4f4f5" : "#fff", color: "#09090b", border: "1px solid #e4e4e7", boxShadow: "0 1px 2px rgba(0,0,0,0.1)" },
    ghost: { background: hovered ? "#f4f4f5" : "transparent", color: "#09090b" },
    destructive: { background: hovered ? "#c40009" : "#e7000b", color: "#fff" },
    accent: { background: hovered ? "#7008e7" : "#8e51ff", color: "#fff" },
  }[variant];

  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...baseStyle, ...sizeStyle, ...variantStyle, ...style }}
    >
      {icon && iconPos === "left" && <Icon name={icon} size={14} color="currentColor" />}
      {children}
      {icon && iconPos === "right" && <Icon name={icon} size={14} color="currentColor" />}
    </button>
  );
}

// ── Status ────────────────────────────────────────────────────────
export const STATUS_CONFIG: Record<string, { bg: string; text: string }> = {
  Draft: { bg: "#f4f4f5", text: "#71717b" },
  "In Progress": { bg: "#fef9c3", text: "#713f12" },
  "Pending Review": { bg: "#eff6ff", text: "#1d4ed8" },
  Completed: { bg: "#dcfce7", text: "#15803d" },
  Waiting: { bg: "#fff7ed", text: "#9a3412" },
  Active: { bg: "#f0fdf4", text: "#15803d" },
  Archived: { bg: "#f4f4f5", text: "#71717b" },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { bg: "#f4f4f5", text: "#71717b" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 8px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 500,
        fontFamily: "var(--font-sans)",
        background: cfg.bg,
        color: cfg.text,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.text, flexShrink: 0 }} />
      {status}
    </span>
  );
}

export function StatusPicker({
  status,
  onChange,
  options = ["Draft", "In Progress", "Pending Review", "Completed"],
  disabled = false,
}: {
  status: string;
  onChange?: (next: string) => void;
  options?: string[];
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLSpanElement>(null);
  const cfg = STATUS_CONFIG[status] || { bg: "#f4f4f5", text: "#71717b" };

  React.useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <span ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "2px 6px 2px 8px",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 500,
          fontFamily: "var(--font-sans)",
          background: cfg.bg,
          color: cfg.text,
          whiteSpace: "nowrap",
          border: "none",
          cursor: disabled ? "default" : "pointer",
          transition: "filter 0.12s",
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.text, flexShrink: 0 }} />
        {status}
        {!disabled && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, marginLeft: 1 }}>
            <path d="m6 9 6 6 6-6" />
          </svg>
        )}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 50,
            background: "#fff",
            border: "1px solid #e4e4e7",
            borderRadius: 8,
            boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
            padding: 4,
            minWidth: 170,
          }}
          className="fade-in"
        >
          {options.map((opt) => {
            const oc = STATUS_CONFIG[opt] || { bg: "#f4f4f5", text: "#71717b" };
            const active = opt === status;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  onChange?.(opt);
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "7px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: active ? "#fafafa" : "transparent",
                  cursor: "pointer",
                  fontSize: 13,
                  fontFamily: "var(--font-sans)",
                  color: "#09090b",
                  textAlign: "left",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: oc.text, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{opt}</span>
                {active && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7f22fe" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </span>
  );
}

export function Badge({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 500,
        fontFamily: "var(--font-sans)",
        background: color || "#f4f4f5",
        color: "#09090b",
      }}
    >
      {children}
    </span>
  );
}

// ── Avatar ────────────────────────────────────────────────────────
export function Avatar({ name = "", size = 32, src }: { name?: string; size?: number; src?: string | null }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const colors = ["#7f22fe", "#0369a1", "#15803d", "#b45309", "#be123c"];
  const color = colors[(name.charCodeAt(0) || 0) % colors.length];
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
  ) : (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        color: "#fff",
        fontSize: size * 0.38,
        fontWeight: 600,
        fontFamily: "var(--font-sans)",
      }}
    >
      {initials}
    </div>
  );
}

// ── Inputs ────────────────────────────────────────────────────────
export function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  helper,
  disabled,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  helper?: string;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && <label style={{ fontSize: 13, fontWeight: 500, color: "#09090b", fontFamily: "var(--font-sans)" }}>{label}</label>}
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          height: 36,
          padding: "0 12px",
          borderRadius: 8,
          border: "1px solid #e4e4e7",
          fontSize: 14,
          fontFamily: "var(--font-body)",
          color: "#09090b",
          background: disabled ? "#fafafa" : "#fff",
          outline: "none",
          width: "100%",
          boxSizing: "border-box",
          transition: "border-color 0.15s",
        }}
        onFocus={(e) => (e.target.style.borderColor = "#8e51ff")}
        onBlur={(e) => (e.target.style.borderColor = "#e4e4e7")}
      />
      {helper && <span style={{ fontSize: 12, color: "#71717b", fontFamily: "var(--font-body)" }}>{helper}</span>}
    </div>
  );
}

export function FieldTextarea({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  rows = 3,
  disabled,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  disabled?: boolean;
}) {
  const len = (value || "").length;
  const pct = maxLength ? Math.min(100, (len / maxLength) * 100) : 0;
  const overLimit = !!maxLength && len > maxLength;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: "#71717b", fontFamily: "var(--font-sans)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>
          {!!maxLength && <span style={{ fontSize: 11, color: overLimit ? "#e7000b" : "#a1a1aa", fontFamily: "var(--font-mono)" }}>{len}/{maxLength}</span>}
        </div>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          border: `1px solid ${overLimit ? "#e7000b" : "#e4e4e7"}`,
          fontSize: 14,
          fontFamily: "var(--font-body)",
          color: "#09090b",
          background: disabled ? "#fafafa" : "#fff",
          outline: "none",
          width: "100%",
          boxSizing: "border-box",
          resize: "vertical",
          lineHeight: 1.5,
          transition: "border-color 0.15s",
        }}
        onFocus={(e) => !overLimit && (e.target.style.borderColor = "#8e51ff")}
        onBlur={(e) => (e.target.style.borderColor = overLimit ? "#e7000b" : "#e4e4e7")}
      />
      {!!maxLength && (
        <div style={{ height: 4, borderRadius: 2, background: "#f4f4f5", overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: overLimit ? "#e7000b" : pct > 80 ? "#f59e0b" : "#7f22fe",
              borderRadius: 2,
              transition: "width 0.2s, background 0.2s",
            }}
          />
        </div>
      )}
    </div>
  );
}

export function SelectInput({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && <label style={{ fontSize: 13, fontWeight: 500, color: "#09090b", fontFamily: "var(--font-sans)" }}>{label}</label>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          height: 36,
          padding: "0 12px",
          borderRadius: 8,
          border: "1px solid #e4e4e7",
          fontSize: 14,
          fontFamily: "var(--font-body)",
          color: "#09090b",
          background: "#fff",
          outline: "none",
          width: "100%",
          appearance: "none",
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23a1a1aa' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 12px center",
        }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <div
      onClick={onChange}
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        background: value ? "#7f22fe" : "#e4e4e7",
        cursor: "pointer",
        position: "relative",
        transition: "background 0.2s",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 3,
          left: value ? 21 : 3,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          transition: "left 0.2s",
        }}
      />
    </div>
  );
}

// ── Surfaces ──────────────────────────────────────────────────────
export function Card({
  children,
  style = {},
  onClick,
  hover,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: () => void;
  hover?: boolean;
}) {
  const [hov, setHov] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: "#fff",
        border: "1px solid #e4e4e7",
        borderRadius: 14,
        padding: 24,
        boxShadow: hover && hov ? "0 4px 12px rgba(0,0,0,0.08)" : "0 1px 2px rgba(0,0,0,0.05)",
        transition: "box-shadow 0.15s, transform 0.15s",
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 520,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: number;
}) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          width,
          maxWidth: "90vw",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          padding: 32,
          position: "relative",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, fontFamily: "var(--font-sans)", color: "#09090b" }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 6, color: "#71717b" }}>
            <Icon name="x" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Spinner({ size = 18, color = "#7f22fe" }: { size?: number; color?: string }) {
  const [deg, setDeg] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setDeg((d) => d + 10), 30);
    return () => clearInterval(id);
  }, []);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2px solid #e4e4e7`,
        borderTopColor: color,
        transform: `rotate(${deg}deg)`,
        flexShrink: 0,
      }}
    />
  );
}

export function ProgressBar({ value, max = 100, color = "#7f22fe", thin }: { value: number; max?: number; color?: string; thin?: boolean }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: thin ? 4 : 6, borderRadius: 3, background: "#f4f4f5", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 500, color: "#71717b", fontFamily: "var(--font-sans)", flexShrink: 0 }}>{pct}%</span>
    </div>
  );
}

export function Divider({ label }: { label?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "4px 0" }}>
      <div style={{ flex: 1, height: 1, background: "#e4e4e7" }} />
      {label && <span style={{ fontSize: 12, color: "#a1a1aa", fontFamily: "var(--font-body)", whiteSpace: "nowrap" }}>{label}</span>}
      {label && <div style={{ flex: 1, height: 1, background: "#e4e4e7" }} />}
    </div>
  );
}

export function KPICard({
  label,
  value,
  icon,
  color = "#7f22fe",
  subtitle,
}: {
  label: string;
  value: React.ReactNode;
  icon: string;
  color?: string;
  subtitle?: string;
}) {
  return (
    <Card style={{ flex: 1, minWidth: 160 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: "#71717b", fontFamily: "var(--font-sans)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#09090b", fontFamily: "var(--font-sans)", lineHeight: 1 }}>{value}</div>
          {subtitle && <div style={{ fontSize: 12, color: "#a1a1aa", marginTop: 6, fontFamily: "var(--font-body)" }}>{subtitle}</div>}
        </div>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "#f5f3ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon name={icon} size={18} color={color} />
        </div>
      </div>
    </Card>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumb,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: { label: string; onClick?: () => void }[];
}) {
  return (
    <div style={{ padding: "40px 48px 32px", borderBottom: "1px solid #e4e4e7", background: "#fff", flexShrink: 0 }}>
      {breadcrumb && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, fontSize: 13, color: "#71717b", fontFamily: "var(--font-body)" }}>
          {breadcrumb.map((item, i) => (
            <React.Fragment key={i}>
              {i > 0 && <Icon name="chevron-right" size={12} color="#a1a1aa" />}
              <span style={{ cursor: item.onClick ? "pointer" : "default", color: item.onClick ? "#7f22fe" : "#71717b" }} onClick={item.onClick}>
                {item.label}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, color: "#09090b", fontFamily: "var(--font-sans)", lineHeight: 1.2 }}>{title}</h1>
          {subtitle && <p style={{ margin: "6px 0 0", fontSize: 15, color: "#71717b", fontFamily: "var(--font-body)" }}>{subtitle}</p>}
        </div>
        {actions && <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>{actions}</div>}
      </div>
    </div>
  );
}

export function AppLayout({ sidebar, children }: { sidebar: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#fff" }}>
      {sidebar}
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>{children}</div>
    </div>
  );
}
