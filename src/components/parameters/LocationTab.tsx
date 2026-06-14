import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { gtmSupabase } from "@/lib/gtmSupabase";
import { Skeleton } from "@/components/ui/skeleton";

const MONO = "var(--font-mono)";

export type RuleType = "accept" | "maybe" | "hard";
export type Scope = "remote" | "country" | "city" | "region" | "raw_pattern";
export type RemoteScope =
  | "anywhere"
  | "europe"
  | "eu"
  | "us"
  | "hybrid"
  | "onsite"
  | "unknown";
export type MatchMode = "contains" | "equals" | "regex";

export type LocationRule = {
  id: string;
  pattern: string;
  rule_type: RuleType;
  reason: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
  location_score: number | null;
  priority: number;
  notes: string | null;
  scope: Scope | null;
  country: string | null;
  city: string | null;
  region: string | null;
  remote_scope: RemoteScope | null;
  match_mode: MatchMode;
};

type DraftRule = {
  id?: string;
  pattern: string;
  rule_type: RuleType;
  location_score: number | null;
  scope: Scope | null;
  country: string;
  city: string;
  region: string;
  remote_scope: RemoteScope | null;
  match_mode: MatchMode;
  priority: number;
  reason: string;
  notes: string;
  is_active: boolean;
};

const EMPTY_DRAFT: DraftRule = {
  pattern: "",
  rule_type: "accept",
  location_score: null,
  scope: null,
  country: "",
  city: "",
  region: "",
  remote_scope: null,
  match_mode: "contains",
  priority: 100,
  reason: "",
  notes: "",
  is_active: true,
};

async function fetchLocationRules(): Promise<LocationRule[]> {
  const { data, error } = await gtmSupabase
    .from("location_filter_rules" as never)
    .select("*");
  if (error) throw error;
  const rows = (data ?? []) as unknown as LocationRule[];
  // ordering: location_score desc (nulls last), rule_type, priority asc, country, city, pattern
  const ruleTypeOrder: Record<RuleType, number> = { hard: 0, maybe: 1, accept: 2 };
  return [...rows].sort((a, b) => {
    const sa = a.location_score ?? -Infinity;
    const sb = b.location_score ?? -Infinity;
    if (sa !== sb) return sb - sa;
    const ra = ruleTypeOrder[a.rule_type] ?? 99;
    const rb = ruleTypeOrder[b.rule_type] ?? 99;
    if (ra !== rb) return ra - rb;
    if (a.priority !== b.priority) return a.priority - b.priority;
    const ca = (a.country ?? "").localeCompare(b.country ?? "");
    if (ca !== 0) return ca;
    const ci = (a.city ?? "").localeCompare(b.city ?? "");
    if (ci !== 0) return ci;
    return (a.pattern ?? "").localeCompare(b.pattern ?? "");
  });
}

function draftToRow(d: DraftRule) {
  return {
    pattern: d.pattern.trim(),
    rule_type: d.rule_type,
    location_score: d.location_score,
    scope: d.scope,
    country: d.country.trim() || null,
    city: d.city.trim() || null,
    region: d.region.trim() || null,
    remote_scope: d.remote_scope,
    match_mode: d.match_mode,
    priority: d.priority,
    reason: d.reason.trim() || null,
    notes: d.notes.trim() || null,
    is_active: d.is_active,
  };
}

async function insertRule(d: DraftRule) {
  const { error } = await gtmSupabase
    .from("location_filter_rules" as never)
    .insert(draftToRow(d) as never);
  if (error) throw error;
}

async function updateRule(id: string, d: DraftRule) {
  const { error } = await gtmSupabase
    .from("location_filter_rules" as never)
    .update({ ...draftToRow(d), updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) throw error;
}

async function setActive(id: string, is_active: boolean) {
  const { error } = await gtmSupabase
    .from("location_filter_rules" as never)
    .update({ is_active, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) throw error;
}

async function deleteRule(id: string) {
  const { error } = await gtmSupabase
    .from("location_filter_rules" as never)
    .delete()
    .eq("id", id);
  if (error) throw error;
}

const BG = "#111118";
const BG_DEEP = "#0A0A0F";
const BORDER = "#1E1E2E";
const TEXT = "#F0F0FF";
const MUTED = "#8B8B9E";
const CYAN = "#00D4FF";

const RULE_TYPES: RuleType[] = ["accept", "maybe", "hard"];
const SCOPES: Scope[] = ["remote", "country", "city", "region", "raw_pattern"];
const REMOTE_SCOPES: RemoteScope[] = [
  "anywhere",
  "europe",
  "eu",
  "us",
  "hybrid",
  "onsite",
  "unknown",
];
const MATCH_MODES: MatchMode[] = ["contains", "equals", "regex"];

function ruleTypeBadge(t: RuleType) {
  if (t === "accept") return { bg: "rgba(34,197,94,0.15)", color: "#22C55E" };
  if (t === "maybe") return { bg: "rgba(249,158,11,0.15)", color: "#F59E0B" };
  return { bg: "rgba(239,68,68,0.15)", color: "#EF4444" };
}

function Badge({
  children,
  color,
  bg,
}: {
  children: React.ReactNode;
  color: string;
  bg: string;
}) {
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 text-[11px] font-medium uppercase"
      style={{ color, background: bg, borderRadius: 3, fontFamily: MONO, letterSpacing: 0.3 }}
    >
      {children}
    </span>
  );
}

function fieldStyle(): React.CSSProperties {
  return {
    background: BG_DEEP,
    border: `1px solid ${BORDER}`,
    borderRadius: 4,
    color: TEXT,
    fontFamily: MONO,
    fontSize: 13,
    padding: "6px 8px",
    outline: "none",
    width: "100%",
  };
}

export function LocationTab() {
  const qc = useQueryClient();
  const { data: rules = [], isLoading, error } = useQuery({
    queryKey: ["location-filter-rules"],
    queryFn: fetchLocationRules,
  });

  const [search, setSearch] = useState("");
  const [scoreFilter, setScoreFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<DraftRule>(EMPTY_DRAFT);
  const [editId, setEditId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<LocationRule | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rules.filter((r) => {
      if (scoreFilter !== "all") {
        if (scoreFilter === "unscored") {
          if (r.location_score !== null) return false;
        } else if (String(r.location_score) !== scoreFilter) return false;
      }
      if (typeFilter !== "all" && r.rule_type !== typeFilter) return false;
      if (scopeFilter !== "all" && r.scope !== scopeFilter) return false;
      if (activeFilter === "active" && !r.is_active) return false;
      if (activeFilter === "inactive" && r.is_active) return false;
      if (q) {
        const hay = [r.pattern, r.country, r.city, r.region, r.reason, r.notes]
          .map((v) => (v ?? "").toLowerCase())
          .join(" \u0000 ");
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rules, search, scoreFilter, typeFilter, scopeFilter, activeFilter]);

  const insertMut = useMutation({
    mutationFn: insertRule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["location-filter-rules"] });
      toast.success("Saved");
      setModalOpen(false);
    },
    onError: (e: Error) => {
      setFormError(e.message || "Save failed");
      toast.error("Save failed — try again");
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: DraftRule }) => updateRule(id, draft),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["location-filter-rules"] });
      toast.success("Saved");
      setModalOpen(false);
    },
    onError: (e: Error) => {
      setFormError(e.message || "Save failed");
      toast.error("Save failed — try again");
    },
  });
  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      setActive(id, is_active),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["location-filter-rules"] });
      toast.success("Saved");
    },
    onError: () => toast.error("Save failed — try again"),
  });
  const deleteMut = useMutation({
    mutationFn: deleteRule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["location-filter-rules"] });
      toast.success("Saved");
      setConfirmDelete(null);
    },
    onError: () => toast.error("Save failed — try again"),
  });

  function openAdd() {
    setDraft(EMPTY_DRAFT);
    setEditId(null);
    setFormError("");
    setModalOpen(true);
  }
  function openEdit(r: LocationRule) {
    setDraft({
      id: r.id,
      pattern: r.pattern ?? "",
      rule_type: r.rule_type,
      location_score: r.location_score,
      scope: r.scope,
      country: r.country ?? "",
      city: r.city ?? "",
      region: r.region ?? "",
      remote_scope: r.remote_scope,
      match_mode: r.match_mode,
      priority: r.priority ?? 100,
      reason: r.reason ?? "",
      notes: r.notes ?? "",
      is_active: r.is_active,
    });
    setEditId(r.id);
    setFormError("");
    setModalOpen(true);
  }

  function submit() {
    if (!draft.pattern.trim()) {
      setFormError("Pattern is required");
      return;
    }
    if (!Number.isFinite(draft.priority)) {
      setFormError("Priority must be a number");
      return;
    }
    setFormError("");
    if (editId) updateMut.mutate({ id: editId, draft });
    else insertMut.mutate(draft);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters bar */}
      <div
        className="flex flex-wrap items-center gap-2 p-3"
        style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 6 }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search pattern, country, city, region, reason, notes..."
          style={{ ...fieldStyle(), flex: "1 1 260px", minWidth: 200 }}
        />
        <FilterSelect
          label="Score"
          value={scoreFilter}
          onChange={setScoreFilter}
          options={[
            { value: "all", label: "All" },
            { value: "5", label: "5" },
            { value: "4", label: "4" },
            { value: "3", label: "3" },
            { value: "2", label: "2" },
            { value: "1", label: "1" },
            { value: "unscored", label: "Unscored" },
          ]}
        />
        <FilterSelect
          label="Type"
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: "all", label: "All" },
            ...RULE_TYPES.map((t) => ({ value: t, label: t })),
          ]}
        />
        <FilterSelect
          label="Scope"
          value={scopeFilter}
          onChange={setScopeFilter}
          options={[
            { value: "all", label: "All" },
            ...SCOPES.map((s) => ({ value: s, label: s })),
          ]}
        />
        <FilterSelect
          label="Status"
          value={activeFilter}
          onChange={setActiveFilter}
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]}
        />
        <button
          onClick={openAdd}
          className="px-3 py-1.5 text-[12px] font-semibold transition-colors"
          style={{
            background: CYAN,
            color: "#000",
            borderRadius: 4,
            fontFamily: MONO,
            cursor: "pointer",
          }}
        >
          + Add Rule
        </button>
      </div>

      {/* Table */}
      <div
        style={{
          background: BG,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table
            className="w-full text-[12px]"
            style={{ borderCollapse: "collapse", fontFamily: MONO, color: TEXT }}
          >
            <thead>
              <tr style={{ background: BG_DEEP, color: MUTED, textAlign: "left" }}>
                {[
                  "Score",
                  "Type",
                  "Scope",
                  "Country",
                  "City",
                  "Region",
                  "Remote",
                  "Pattern",
                  "Match",
                  "Pri",
                  "Reason",
                  "Notes",
                  "Active",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-2 py-2 text-[11px] uppercase tracking-wide font-medium whitespace-nowrap"
                    style={{ borderBottom: `1px solid ${BORDER}` }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 14 }).map((__, j) => (
                      <td
                        key={j}
                        className="px-2 py-2"
                        style={{ borderBottom: `1px solid ${BORDER}` }}
                      >
                        <Skeleton style={{ height: 16, width: "80%" }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td
                    colSpan={14}
                    className="px-3 py-6 text-center"
                    style={{ color: "#EF4444" }}
                  >
                    Failed to load: {(error as Error).message}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={14}
                    className="px-3 py-6 text-center"
                    style={{ color: MUTED }}
                  >
                    No rules match the current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const rt = ruleTypeBadge(r.rule_type);
                  return (
                    <tr
                      key={r.id}
                      style={{
                        opacity: r.is_active ? 1 : 0.55,
                        borderBottom: `1px solid ${BORDER}`,
                      }}
                    >
                      <td className="px-2 py-1.5">
                        {r.location_score ?? <span style={{ color: MUTED }}>—</span>}
                      </td>
                      <td className="px-2 py-1.5">
                        <Badge color={rt.color} bg={rt.bg}>
                          {r.rule_type}
                        </Badge>
                      </td>
                      <td className="px-2 py-1.5" style={{ color: MUTED }}>
                        {r.scope ?? "—"}
                      </td>
                      <td className="px-2 py-1.5">{r.country ?? ""}</td>
                      <td className="px-2 py-1.5">{r.city ?? ""}</td>
                      <td className="px-2 py-1.5">{r.region ?? ""}</td>
                      <td className="px-2 py-1.5" style={{ color: MUTED }}>
                        {r.remote_scope ?? ""}
                      </td>
                      <td
                        className="px-2 py-1.5"
                        style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}
                        title={r.pattern}
                      >
                        {r.pattern}
                      </td>
                      <td className="px-2 py-1.5" style={{ color: MUTED }}>
                        {r.match_mode}
                      </td>
                      <td className="px-2 py-1.5">{r.priority}</td>
                      <td
                        className="px-2 py-1.5"
                        style={{
                          maxWidth: 180,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          color: MUTED,
                        }}
                        title={r.reason ?? ""}
                      >
                        {r.reason ?? ""}
                      </td>
                      <td
                        className="px-2 py-1.5"
                        style={{
                          maxWidth: 180,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          color: MUTED,
                        }}
                        title={r.notes ?? ""}
                      >
                        {r.notes ?? ""}
                      </td>
                      <td className="px-2 py-1.5">
                        {r.is_active ? (
                          <Badge color={CYAN} bg="rgba(0,212,255,0.12)">
                            on
                          </Badge>
                        ) : (
                          <Badge color={MUTED} bg="rgba(139,139,158,0.12)">
                            off
                          </Badge>
                        )}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <RowAction onClick={() => openEdit(r)}>Edit</RowAction>
                        <RowAction
                          onClick={() =>
                            toggleMut.mutate({ id: r.id, is_active: !r.is_active })
                          }
                        >
                          {r.is_active ? "Deactivate" : "Reactivate"}
                        </RowAction>
                        <RowAction
                          onClick={() => setConfirmDelete(r)}
                          color="#EF4444"
                        >
                          Delete
                        </RowAction>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div
          className="px-3 py-2 text-[11px]"
          style={{ borderTop: `1px solid ${BORDER}`, color: MUTED, fontFamily: MONO }}
        >
          {filtered.length} of {rules.length} rules
        </div>
      </div>

      {/* Placeholder for Unrated section */}
      <div
        className="px-4 py-6"
        style={{
          background: BG,
          border: `1px dashed ${BORDER}`,
          borderRadius: 6,
          color: MUTED,
          fontFamily: MONO,
          fontSize: 13,
          textAlign: "center",
        }}
      >
        Unrated job locations will appear here in the next step.
      </div>

      {/* Modal */}
      {modalOpen && (
        <Modal onClose={() => setModalOpen(false)}>
          <RuleForm
            draft={draft}
            setDraft={setDraft}
            onSubmit={submit}
            onCancel={() => setModalOpen(false)}
            error={formError}
            isPending={insertMut.isPending || updateMut.isPending}
            title={editId ? "Edit location rule" : "Add location rule"}
          />
        </Modal>
      )}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)}>
          <div className="flex flex-col gap-4" style={{ minWidth: 360 }}>
            <h3
              className="text-sm font-semibold"
              style={{ color: TEXT, fontFamily: MONO }}
            >
              Delete rule?
            </h3>
            <p className="text-[13px]" style={{ color: MUTED }}>
              This will permanently delete the rule for pattern{" "}
              <span style={{ color: TEXT, fontFamily: MONO }}>
                "{confirmDelete.pattern}"
              </span>
              . This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 text-[12px]"
                style={{
                  background: "transparent",
                  color: MUTED,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 4,
                  fontFamily: MONO,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMut.mutate(confirmDelete.id)}
                disabled={deleteMut.isPending}
                className="px-3 py-1.5 text-[12px] font-semibold"
                style={{
                  background: "#EF4444",
                  color: "#fff",
                  borderRadius: 4,
                  fontFamily: MONO,
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function RowAction({
  children,
  onClick,
  color = CYAN,
}: {
  children: React.ReactNode;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="text-[11px] px-1.5 py-0.5 mr-1"
      style={{
        color,
        background: "transparent",
        border: `1px solid ${BORDER}`,
        borderRadius: 3,
        fontFamily: MONO,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label
      className="flex items-center gap-1.5 text-[11px]"
      style={{ color: MUTED, fontFamily: MONO }}
    >
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...fieldStyle(),
          padding: "4px 6px",
          width: "auto",
          fontSize: 12,
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ background: BG_DEEP }}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: BG,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          padding: 24,
          maxWidth: 720,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span
        className="text-[11px] uppercase tracking-wide"
        style={{ color: MUTED, fontFamily: MONO }}
      >
        {label}
      </span>
      {children}
      {hint && (
        <span className="text-[11px]" style={{ color: MUTED }}>
          {hint}
        </span>
      )}
    </label>
  );
}

function RuleForm({
  draft,
  setDraft,
  onSubmit,
  onCancel,
  error,
  isPending,
  title,
}: {
  draft: DraftRule;
  setDraft: (d: DraftRule) => void;
  onSubmit: () => void;
  onCancel: () => void;
  error: string;
  isPending: boolean;
  title: string;
}) {
  function up<K extends keyof DraftRule>(k: K, v: DraftRule[K]) {
    setDraft({ ...draft, [k]: v });
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold" style={{ color: TEXT, fontFamily: MONO }}>
        {title}
      </h3>

      <div
        className="text-[11px] flex flex-col gap-1 p-2.5"
        style={{
          borderLeft: `2px solid ${CYAN}`,
          background: "rgba(0,212,255,0.05)",
          color: MUTED,
          borderRadius: 3,
        }}
      >
        <span>Pattern is the actual text used to match job_postings.location.</span>
        <span>
          Country, city, region, and remote scope are metadata used to organize the rule.
        </span>
        <span>Use equals for short exact values like US, EMEA, or Remote.</span>
        <span>
          Use contains for longer location phrases like Remote - California or San
          Francisco.
        </span>
        <span>
          Hard rules can dismiss jobs. Maybe and accept rules should only affect scoring
          or prioritization.
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Pattern *">
          <input
            value={draft.pattern}
            onChange={(e) => up("pattern", e.target.value)}
            style={fieldStyle()}
            placeholder="e.g. Remote - United States"
          />
        </Field>
        <Field label="Rule type *">
          <select
            value={draft.rule_type}
            onChange={(e) => up("rule_type", e.target.value as RuleType)}
            style={fieldStyle()}
          >
            {RULE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Location score (1-5)">
          <select
            value={draft.location_score ?? ""}
            onChange={(e) =>
              up("location_score", e.target.value === "" ? null : Number(e.target.value))
            }
            style={fieldStyle()}
          >
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Scope">
          <select
            value={draft.scope ?? ""}
            onChange={(e) =>
              up("scope", e.target.value === "" ? null : (e.target.value as Scope))
            }
            style={fieldStyle()}
          >
            <option value="">—</option>
            {SCOPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Country">
          <input
            value={draft.country}
            onChange={(e) => up("country", e.target.value)}
            style={fieldStyle()}
          />
        </Field>
        <Field label="City">
          <input
            value={draft.city}
            onChange={(e) => up("city", e.target.value)}
            style={fieldStyle()}
          />
        </Field>

        <Field label="Region">
          <input
            value={draft.region}
            onChange={(e) => up("region", e.target.value)}
            style={fieldStyle()}
          />
        </Field>
        <Field label="Remote scope">
          <select
            value={draft.remote_scope ?? ""}
            onChange={(e) =>
              up(
                "remote_scope",
                e.target.value === "" ? null : (e.target.value as RemoteScope),
              )
            }
            style={fieldStyle()}
          >
            <option value="">—</option>
            {REMOTE_SCOPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Match mode *">
          <select
            value={draft.match_mode}
            onChange={(e) => up("match_mode", e.target.value as MatchMode)}
            style={fieldStyle()}
          >
            {MATCH_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority *">
          <input
            type="number"
            value={draft.priority}
            onChange={(e) => up("priority", Number(e.target.value))}
            style={fieldStyle()}
          />
        </Field>

        <Field label="Reason">
          <input
            value={draft.reason}
            onChange={(e) => up("reason", e.target.value)}
            style={fieldStyle()}
          />
        </Field>
        <Field label="Active">
          <label
            className="flex items-center gap-2 text-[13px]"
            style={{ color: TEXT, fontFamily: MONO }}
          >
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={(e) => up("is_active", e.target.checked)}
            />
            {draft.is_active ? "Active" : "Inactive"}
          </label>
        </Field>

        <div className="col-span-2">
          <Field label="Notes">
            <textarea
              value={draft.notes}
              onChange={(e) => up("notes", e.target.value)}
              style={{ ...fieldStyle(), minHeight: 70, resize: "vertical" }}
            />
          </Field>
        </div>
      </div>

      {error && (
        <div className="text-[12px]" style={{ color: "#EF4444", fontFamily: MONO }}>
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-[12px]"
          style={{
            background: "transparent",
            color: MUTED,
            border: `1px solid ${BORDER}`,
            borderRadius: 4,
            fontFamily: MONO,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          onClick={onSubmit}
          disabled={isPending}
          className="px-3 py-1.5 text-[12px] font-semibold"
          style={{
            background: CYAN,
            color: "#000",
            borderRadius: 4,
            fontFamily: MONO,
            cursor: "pointer",
          }}
        >
          {isPending ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
