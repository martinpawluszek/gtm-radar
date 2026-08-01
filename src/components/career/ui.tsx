import { useState, type ReactNode } from "react";

export const MONO = "var(--font-mono)";

export function Panel({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: "#111118",
        border: "1px solid #1E1E2E",
        borderRadius: 6,
        padding: 16,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      className="text-[11px] uppercase tracking-wide"
      style={{ color: "#8B8B9E", fontFamily: MONO }}
    >
      {children}
    </div>
  );
}

export function Chip({
  children,
  color = "#8B8B9E",
  onRemove,
  title,
}: {
  children: ReactNode;
  color?: string;
  onRemove?: () => void;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px]"
      style={{
        color,
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${color}44`,
        borderRadius: 999,
        fontFamily: MONO,
      }}
    >
      {children}
      {onRemove && (
        <button
          onClick={onRemove}
          className="opacity-60 hover:opacity-100"
          style={{ color, lineHeight: 1 }}
          aria-label="Remove tag"
        >
          ×
        </button>
      )}
    </span>
  );
}

export function TagEditor({
  tags,
  onChange,
  placeholder = "add tag",
}: {
  tags: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const value = raw.trim().replace(/,$/, "").trim();
    if (!value) return;
    if (tags.includes(value)) {
      setDraft("");
      return;
    }
    onChange([...tags, value]);
    setDraft("");
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {tags.map((t) => (
        <Chip key={t} color="#00D4FF" onRemove={() => onChange(tags.filter((x) => x !== t))}>
          {t}
        </Chip>
      ))}
      <input
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit(draft);
          } else if (e.key === "Backspace" && !draft && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => commit(draft)}
        className="bg-transparent outline-none text-[11px] px-1.5 py-0.5"
        style={{
          color: "#F0F0FF",
          border: "1px dashed #2A2A3E",
          borderRadius: 999,
          fontFamily: MONO,
          width: 90,
        }}
      />
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  mono = true,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="bg-transparent outline-none text-sm px-2 py-1.5 w-full"
      style={{
        color: "#F0F0FF",
        border: "1px solid #1E1E2E",
        borderRadius: 4,
        fontFamily: mono ? MONO : undefined,
      }}
    />
  );
}

export function TextAreaInput({
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="bg-transparent outline-none text-sm px-2 py-1.5 w-full"
      style={{ color: "#F0F0FF", border: "1px solid #1E1E2E", borderRadius: 4 }}
    />
  );
}

export function LabeledField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <SectionLabel>{label}</SectionLabel>
      {children}
    </label>
  );
}

export function SelectInput({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-transparent outline-none text-[12px] px-2 py-1"
      style={{
        color: "#F0F0FF",
        border: "1px solid #1E1E2E",
        borderRadius: 4,
        fontFamily: MONO,
        background: "#0D0D14",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} style={{ background: "#0D0D14" }}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px]"
      style={{
        color: checked ? "#10B981" : "#8B8B9E",
        background: checked ? "rgba(16,185,129,0.08)" : "transparent",
        border: `1px solid ${checked ? "rgba(16,185,129,0.3)" : "#1E1E2E"}`,
        borderRadius: 4,
        fontFamily: MONO,
      }}
    >
      <span
        className="inline-block rounded-full"
        style={{ width: 6, height: 6, background: checked ? "#10B981" : "#3A3A4E" }}
      />
      {label}
    </button>
  );
}

export function Action({
  children,
  onClick,
  color = "#8B8B9E",
  disabled = false,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  color?: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="px-2 py-0.5 text-[11px] disabled:opacity-40"
      style={{
        color,
        border: "1px solid #1E1E2E",
        borderRadius: 4,
        fontFamily: MONO,
        background: "transparent",
      }}
    >
      {children}
    </button>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1.5 text-[13px] font-medium disabled:opacity-50"
      style={{
        color: "#00D4FF",
        background: "rgba(0,212,255,0.1)",
        border: "1px solid rgba(0,212,255,0.25)",
        borderRadius: 4,
        fontFamily: MONO,
      }}
    >
      {children}
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <Panel>
      <p className="text-sm" style={{ color: "#8B8B9E" }}>
        {children}
      </p>
    </Panel>
  );
}
