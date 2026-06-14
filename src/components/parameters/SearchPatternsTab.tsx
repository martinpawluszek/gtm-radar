import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { gtmSupabase } from "@/lib/gtmSupabase";
import { Skeleton } from "@/components/ui/skeleton";

const MONO = "var(--font-mono)";

type Pattern = {
  id: string;
  pattern_text: string;
  normalized_pattern_text: string | null;
  pattern_type: string | null;
  source: string | null;
  priority_score: number | null;
  confidence_score: number | null;
  usage_count: number | null;
  success_count: number | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
  last_used_at?: string | null;
};

type LearningJob = Record<string, unknown> & {
  id?: string;
  title?: string | null;
  company_name?: string | null;
  location?: string | null;
  ai_role_score?: number | null;
  ai_composite_score?: number | null;
  martin_feedback_score?: number | null;
  martin_feedback_comment?: string | null;
  martin_feedback_overrides?: unknown;
  jd_url?: string | null;
  created_at?: string | null;
};

async function fetchPatterns(): Promise<Pattern[]> {
  const { data, error } = await gtmSupabase
    .from("job_title_patterns" as never)
    .select("*");
  if (error) throw error;
  const rows = (data ?? []) as unknown as Pattern[];
  return [...rows].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    const ap = a.priority_score ?? -Infinity;
    const bp = b.priority_score ?? -Infinity;
    if (ap !== bp) return bp - ap;
    const ac = a.confidence_score ?? -Infinity;
    const bc = b.confidence_score ?? -Infinity;
    if (ac !== bc) return bc - ac;
    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  });
}

async function fetchActivePatterns(): Promise<Pattern[]> {
  const { data, error } = await gtmSupabase
    .from("active_title_patterns_for_search" as never)
    .select("*");
  if (error) throw error;
  return (data ?? []) as unknown as Pattern[];
}

async function fetchLearningJobs(): Promise<LearningJob[]> {
  const { data, error } = await gtmSupabase
    .from("top_rated_jobs_for_learning" as never)
    .select("*");
  if (error) throw error;
  return (data ?? []) as unknown as LearningJob[];
}

export function SearchPatternsTab() {
  const qc = useQueryClient();
  const patternsQ = useQuery({ queryKey: ["job-title-patterns"], queryFn: fetchPatterns });
  const activeQ = useQuery({
    queryKey: ["active-title-patterns-for-search"],
    queryFn: fetchActivePatterns,
  });
  const learningQ = useQuery({
    queryKey: ["top-rated-jobs-for-learning"],
    queryFn: fetchLearningJobs,
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["job-title-patterns"] });
    qc.invalidateQueries({ queryKey: ["active-title-patterns-for-search"] });
  };

  // Add form
  const [patternText, setPatternText] = useState("");
  const [patternType, setPatternType] = useState("title_search_query");
  const [source, setSource] = useState("manual");
  const [priorityScore, setPriorityScore] = useState<string>("50");
  const [confidenceScore, setConfidenceScore] = useState<string>("");
  const [notes, setNotes] = useState("");

  const addMutation = useMutation({
    mutationFn: async () => {
      const trimmed = patternText.trim();
      if (!trimmed) throw new Error("pattern_text required");
      const { error } = await gtmSupabase.rpc("create_job_title_pattern" as never, {
        p_pattern_text: trimmed,
        p_pattern_type: patternType,
        p_source: source,
        p_priority_score: Number(priorityScore) || 50,
        p_confidence_score: confidenceScore ? Number(confidenceScore) : null,
        p_notes: notes.trim() || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pattern added");
      setPatternText("");
      setNotes("");
      setConfidenceScore("");
      refreshAll();
    },
    onError: (e: Error) => toast.error(e.message || "Save failed"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pattern> }) => {
      const { error } = await gtmSupabase
        .from("job_title_patterns" as never)
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      refreshAll();
    },
    onError: (e: Error) => toast.error(e.message || "Save failed"),
  });

  return (
    <div className="flex flex-col gap-6">
      <AddPatternCard
        patternText={patternText}
        setPatternText={setPatternText}
        patternType={patternType}
        setPatternType={setPatternType}
        source={source}
        setSource={setSource}
        priorityScore={priorityScore}
        setPriorityScore={setPriorityScore}
        confidenceScore={confidenceScore}
        setConfidenceScore={setConfidenceScore}
        notes={notes}
        setNotes={setNotes}
        onSubmit={() => addMutation.mutate()}
        isPending={addMutation.isPending}
      />

      <Section title={`All Search Patterns (${patternsQ.data?.length ?? 0})`}>
        {patternsQ.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : patternsQ.error ? (
          <ErrorBox error={patternsQ.error as Error} />
        ) : !patternsQ.data?.length ? (
          <Empty text="No patterns yet." />
        ) : (
          <PatternTable
            rows={patternsQ.data}
            onSave={(id, patch) => updateMutation.mutate({ id, patch })}
            isPending={updateMutation.isPending}
          />
        )}
      </Section>

      <Section title={`Active Patterns For Search (${activeQ.data?.length ?? 0})`}>
        {activeQ.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : activeQ.error ? (
          <ErrorBox error={activeQ.error as Error} />
        ) : !activeQ.data?.length ? (
          <Empty text="No active patterns." />
        ) : (
          <ActivePatternTable rows={activeQ.data} />
        )}
      </Section>

      <Section title={`Top Rated Jobs For Learning (${learningQ.data?.length ?? 0})`}>
        {learningQ.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : learningQ.error ? (
          <ErrorBox error={learningQ.error as Error} />
        ) : !learningQ.data?.length ? (
          <Empty text="No reference jobs yet." />
        ) : (
          <LearningJobsTable rows={learningQ.data} />
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#111118",
        border: "1px solid #1E1E2E",
        borderRadius: 6,
        padding: 20,
      }}
      className="flex flex-col gap-3"
    >
      <h2
        className="text-sm font-semibold tracking-tight"
        style={{ color: "#F0F0FF", fontFamily: MONO }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="text-sm py-6 text-center" style={{ color: "#8B8B9E", fontFamily: MONO }}>
      {text}
    </p>
  );
}

function ErrorBox({ error }: { error: Error }) {
  return (
    <p
      className="text-sm p-3"
      style={{
        color: "#FCA5A5",
        background: "rgba(239,68,68,0.08)",
        border: "1px solid rgba(239,68,68,0.25)",
        borderRadius: 4,
        fontFamily: MONO,
      }}
    >
      {error.message}
    </p>
  );
}

function InputBox({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="bg-transparent outline-none text-sm px-2 py-1.5 w-full"
      style={{
        color: "#F0F0FF",
        fontFamily: MONO,
        border: "1px solid #1E1E2E",
        borderRadius: 4,
      }}
    />
  );
}

function AddPatternCard(props: {
  patternText: string;
  setPatternText: (v: string) => void;
  patternType: string;
  setPatternType: (v: string) => void;
  source: string;
  setSource: (v: string) => void;
  priorityScore: string;
  setPriorityScore: (v: string) => void;
  confidenceScore: string;
  setConfidenceScore: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  onSubmit: () => void;
  isPending: boolean;
}) {
  return (
    <Section title="Add Pattern">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Pattern Text (required)">
          <InputBox value={props.patternText} onChange={props.setPatternText} placeholder="e.g. Account Executive" />
        </Field>
        <Field label="Pattern Type">
          <InputBox value={props.patternType} onChange={props.setPatternType} />
        </Field>
        <Field label="Source">
          <InputBox value={props.source} onChange={props.setSource} />
        </Field>
        <Field label="Priority Score">
          <InputBox type="number" value={props.priorityScore} onChange={props.setPriorityScore} />
        </Field>
        <Field label="Confidence Score (optional)">
          <InputBox type="number" value={props.confidenceScore} onChange={props.setConfidenceScore} />
        </Field>
        <Field label="Notes (optional)">
          <InputBox value={props.notes} onChange={props.setNotes} />
        </Field>
      </div>
      <div className="flex justify-end">
        <button
          onClick={props.onSubmit}
          disabled={props.isPending || !props.patternText.trim()}
          className="px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-50"
          style={{
            color: "#00D4FF",
            background: "rgba(0,212,255,0.1)",
            border: "1px solid rgba(0,212,255,0.25)",
            borderRadius: 4,
            fontFamily: MONO,
          }}
        >
          {props.isPending ? "Saving..." : "Add Pattern"}
        </button>
      </div>
    </Section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px]" style={{ color: "#8B8B9E", fontFamily: MONO }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const cellStyle: React.CSSProperties = {
  color: "#F0F0FF",
  fontFamily: MONO,
  fontSize: 12,
  padding: "8px 8px",
  borderBottom: "1px solid #1E1E2E",
  verticalAlign: "top",
};
const headStyle: React.CSSProperties = {
  ...cellStyle,
  color: "#8B8B9E",
  fontWeight: 500,
  textAlign: "left",
  whiteSpace: "nowrap",
  borderBottom: "1px solid #1E1E2E",
};

function PatternTable({
  rows,
  onSave,
  isPending,
}: {
  rows: Pattern[];
  onSave: (id: string, patch: Partial<Pattern>) => void;
  isPending: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Pattern>>({});

  const startEdit = (r: Pattern) => {
    setEditingId(r.id);
    setDraft({
      pattern_text: r.pattern_text,
      pattern_type: r.pattern_type,
      priority_score: r.priority_score,
      confidence_score: r.confidence_score,
      notes: r.notes,
      is_active: r.is_active,
    });
  };

  return (
    <div className="overflow-auto">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={headStyle}>Pattern</th>
            <th style={headStyle}>Normalized</th>
            <th style={headStyle}>Type</th>
            <th style={headStyle}>Source</th>
            <th style={headStyle}>Prio</th>
            <th style={headStyle}>Conf</th>
            <th style={headStyle}>Used</th>
            <th style={headStyle}>Success</th>
            <th style={headStyle}>Active</th>
            <th style={headStyle}>Notes</th>
            <th style={headStyle}>Created</th>
            <th style={headStyle}>Updated</th>
            <th style={headStyle}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const editing = editingId === r.id;
            return (
              <tr key={r.id} style={{ opacity: r.is_active ? 1 : 0.55 }}>
                <td style={cellStyle}>
                  {editing ? (
                    <InputBox
                      value={String(draft.pattern_text ?? "")}
                      onChange={(v) => setDraft({ ...draft, pattern_text: v })}
                    />
                  ) : (
                    r.pattern_text
                  )}
                </td>
                <td style={cellStyle}>{r.normalized_pattern_text ?? "—"}</td>
                <td style={cellStyle}>
                  {editing ? (
                    <InputBox
                      value={String(draft.pattern_type ?? "")}
                      onChange={(v) => setDraft({ ...draft, pattern_type: v })}
                    />
                  ) : (
                    r.pattern_type ?? "—"
                  )}
                </td>
                <td style={cellStyle}>{r.source ?? "—"}</td>
                <td style={cellStyle}>
                  {editing ? (
                    <InputBox
                      type="number"
                      value={String(draft.priority_score ?? "")}
                      onChange={(v) =>
                        setDraft({ ...draft, priority_score: v === "" ? null : Number(v) })
                      }
                    />
                  ) : (
                    r.priority_score ?? "—"
                  )}
                </td>
                <td style={cellStyle}>
                  {editing ? (
                    <InputBox
                      type="number"
                      value={String(draft.confidence_score ?? "")}
                      onChange={(v) =>
                        setDraft({ ...draft, confidence_score: v === "" ? null : Number(v) })
                      }
                    />
                  ) : (
                    r.confidence_score ?? "—"
                  )}
                </td>
                <td style={cellStyle}>{r.usage_count ?? 0}</td>
                <td style={cellStyle}>{r.success_count ?? 0}</td>
                <td style={cellStyle}>
                  <span
                    className="px-1.5 py-0.5 text-[10px]"
                    style={{
                      color: r.is_active ? "#10B981" : "#8B8B9E",
                      background: r.is_active ? "rgba(16,185,129,0.08)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${r.is_active ? "rgba(16,185,129,0.25)" : "#1E1E2E"}`,
                      borderRadius: 3,
                      fontFamily: MONO,
                    }}
                  >
                    {r.is_active ? "active" : "inactive"}
                  </span>
                </td>
                <td style={{ ...cellStyle, maxWidth: 200 }}>
                  {editing ? (
                    <InputBox
                      value={String(draft.notes ?? "")}
                      onChange={(v) => setDraft({ ...draft, notes: v })}
                    />
                  ) : (
                    r.notes ?? "—"
                  )}
                </td>
                <td style={cellStyle}>{r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}</td>
                <td style={cellStyle}>{r.updated_at ? new Date(r.updated_at).toLocaleDateString() : "—"}</td>
                <td style={cellStyle}>
                  <div className="flex gap-1.5">
                    {editing ? (
                      <>
                        <ActionBtn
                          color="#00D4FF"
                          onClick={() => {
                            onSave(r.id, draft);
                            setEditingId(null);
                          }}
                          disabled={isPending}
                        >
                          Save
                        </ActionBtn>
                        <ActionBtn color="#8B8B9E" onClick={() => setEditingId(null)}>
                          Cancel
                        </ActionBtn>
                      </>
                    ) : (
                      <>
                        <ActionBtn color="#8B8B9E" onClick={() => startEdit(r)}>
                          Edit
                        </ActionBtn>
                        <ActionBtn
                          color={r.is_active ? "#F87171" : "#10B981"}
                          onClick={() => onSave(r.id, { is_active: !r.is_active })}
                          disabled={isPending}
                        >
                          {r.is_active ? "Deactivate" : "Reactivate"}
                        </ActionBtn>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  color,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  color: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-2 py-1 text-[11px] font-medium disabled:opacity-50"
      style={{
        color,
        background: `${color}15`,
        border: `1px solid ${color}40`,
        borderRadius: 3,
        fontFamily: MONO,
      }}
    >
      {children}
    </button>
  );
}

function ActivePatternTable({ rows }: { rows: Pattern[] }) {
  return (
    <div className="overflow-auto">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={headStyle}>Pattern</th>
            <th style={headStyle}>Normalized</th>
            <th style={headStyle}>Type</th>
            <th style={headStyle}>Source</th>
            <th style={headStyle}>Prio</th>
            <th style={headStyle}>Conf</th>
            <th style={headStyle}>Used</th>
            <th style={headStyle}>Success</th>
            <th style={headStyle}>Last Used</th>
            <th style={headStyle}>Notes</th>
            <th style={headStyle}>Created</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i}>
              <td style={cellStyle}>{r.pattern_text}</td>
              <td style={cellStyle}>{r.normalized_pattern_text ?? "—"}</td>
              <td style={cellStyle}>{r.pattern_type ?? "—"}</td>
              <td style={cellStyle}>{r.source ?? "—"}</td>
              <td style={cellStyle}>{r.priority_score ?? "—"}</td>
              <td style={cellStyle}>{r.confidence_score ?? "—"}</td>
              <td style={cellStyle}>{r.usage_count ?? 0}</td>
              <td style={cellStyle}>{r.success_count ?? 0}</td>
              <td style={cellStyle}>
                {r.last_used_at ? new Date(r.last_used_at).toLocaleDateString() : "—"}
              </td>
              <td style={{ ...cellStyle, maxWidth: 200 }}>{r.notes ?? "—"}</td>
              <td style={cellStyle}>
                {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LearningJobsTable({ rows }: { rows: LearningJob[] }) {
  // Determine known columns; show whatever fields are present
  const colsOrder = [
    "company_name",
    "title",
    "location",
    "ai_role_score",
    "ai_composite_score",
    "martin_feedback_score",
    "martin_feedback_comment",
    "martin_feedback_overrides",
    "jd_url",
    "created_at",
  ];
  const present = useMemo(() => {
    const keys = new Set<string>();
    rows.forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
    return colsOrder.filter((c) => keys.has(c));
  }, [rows]);

  const render = (key: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return "—";
    if (key === "jd_url" && typeof value === "string") {
      return (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          style={{ color: "#00D4FF" }}
          className="underline"
        >
          link
        </a>
      );
    }
    if (key === "created_at" && typeof value === "string") {
      return new Date(value).toLocaleDateString();
    }
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className="overflow-auto">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {present.map((c) => (
              <th key={c} style={headStyle}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={(r.id as string) ?? i}>
              {present.map((c) => (
                <td key={c} style={{ ...cellStyle, maxWidth: 280 }}>
                  {render(c, r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
