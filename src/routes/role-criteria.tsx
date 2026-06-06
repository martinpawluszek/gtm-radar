import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { gtmSupabase } from "@/lib/gtmSupabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Bonus,
  DEFAULT_CRITERIA,
  PARAMS,
  ParamKey,
  ROLE_CRITERIA_SQL,
  RoleCriteria,
  Weights,
  sumWeights,
} from "@/lib/roleCriteria";

export const Route = createFileRoute("/role-criteria")({
  head: () => ({ meta: [{ title: "Role Criteria — GTM Intelligence" }] }),
  component: RoleCriteriaPage,
});

const CARD: React.CSSProperties = {
  background: "#111118",
  border: "1px solid #1E1E2E",
  borderRadius: 6,
  padding: 20,
  marginBottom: 16,
};

const MONO = "var(--font-mono)";

type LoadResult =
  | { kind: "ok"; row: RoleCriteria | null }
  | { kind: "missing-table"; message: string };

async function loadCriteria(): Promise<LoadResult> {
  const { data, error } = await gtmSupabase
    .from("role_criteria" as never)
    .select("*")
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    const msg = error.message || "";
    if (/role_criteria|does not exist|schema cache/i.test(msg)) {
      return { kind: "missing-table", message: msg };
    }
    throw new Error(msg);
  }
  return { kind: "ok", row: (data as RoleCriteria | null) ?? null };
}

function makeDraftFrom(row: RoleCriteria | null): RoleCriteria {
  if (row) {
    return {
      ...row,
      target_titles: row.target_titles ?? [],
      excluded_titles: row.excluded_titles ?? [],
      weights: { ...DEFAULT_CRITERIA.weights, ...(row.weights ?? {}) },
      rubric: { ...DEFAULT_CRITERIA.rubric, ...(row.rubric ?? {}) },
      disqualifiers: row.disqualifiers ?? [],
      bonuses: row.bonuses ?? [],
    };
  }
  return {
    id: "",
    version: 0,
    is_active: true,
    ...DEFAULT_CRITERIA,
  };
}

function RoleCriteriaPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["role_criteria"],
    queryFn: loadCriteria,
  });

  if (isLoading) {
    return <div className="text-sm" style={{ color: "#8B8B9E", fontFamily: MONO }}>Loading…</div>;
  }

  if (data?.kind === "missing-table") {
    return <MissingTableNotice message={data.message} />;
  }

  if (error) {
    return (
      <div className="p-6 text-sm" style={{ color: "#EF4444", background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6 }}>
        Failed to load criteria: {(error as Error).message}
      </div>
    );
  }

  return <Editor initial={data?.row ?? null} onSaved={() => refetch()} />;
}

function MissingTableNotice({ message }: { message: string }) {
  return (
    <div style={{ ...CARD, marginBottom: 0 }}>
      <h2 className="text-base font-semibold mb-2" style={{ color: "#F0F0FF", fontFamily: MONO }}>
        Setup required
      </h2>
      <p className="text-sm mb-3" style={{ color: "#8B8B9E" }}>
        The <code style={{ color: "#00D4FF" }}>role_criteria</code> table does not exist yet in your GTM Supabase project.
        Paste the SQL below into the Supabase SQL editor (ljdpqsoiktoluwtgodmc) and run it, then reload this page.
      </p>
      <pre
        className="text-xs overflow-x-auto p-3"
        style={{ background: "#0A0A0F", border: "1px solid #1E1E2E", borderRadius: 4, color: "#F0F0FF", fontFamily: MONO }}
      >{ROLE_CRITERIA_SQL}</pre>
      <p className="text-xs mt-3" style={{ color: "#8B8B9E" }}>
        Underlying error: {message}
      </p>
    </div>
  );
}

function Editor({ initial, onSaved }: { initial: RoleCriteria | null; onSaved: () => void }) {
  const [draft, setDraft] = useState<RoleCriteria>(() => makeDraftFrom(initial));
  const [baseline, setBaseline] = useState<RoleCriteria>(() => makeDraftFrom(initial));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next = makeDraftFrom(initial);
    setDraft(next);
    setBaseline(next);
  }, [initial]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(baseline),
    [draft, baseline],
  );

  const weightSum = sumWeights(draft.weights);
  const weightsValid = Math.abs(weightSum - 1) < 0.001;

  const reset = () => {
    if (!dirty) return;
    if (!confirm("Discard unsaved changes and reload from the database?")) return;
    setDraft(baseline);
  };

  const save = async () => {
    if (!weightsValid) {
      toast.error("Weights must sum to 100% before saving");
      return;
    }
    setSaving(true);
    try {
      const nextVersion = (initial?.version ?? 0) + 1;
      const payload = {
        version: nextVersion,
        is_active: true,
        target_titles: draft.target_titles,
        excluded_titles: draft.excluded_titles,
        weights: draft.weights,
        rubric: draft.rubric,
        disqualifiers: draft.disqualifiers,
        bonuses: draft.bonuses,
        updated_at: new Date().toISOString(),
      };
      let resultRow: RoleCriteria | null = null;
      if (initial?.id) {
        const { data, error } = await gtmSupabase
          .from("role_criteria" as never)
          .update(payload as never)
          .eq("id", initial.id)
          .select("*")
          .single();
        if (error) throw error;
        resultRow = data as RoleCriteria;
      } else {
        const { data, error } = await gtmSupabase
          .from("role_criteria" as never)
          .insert(payload as never)
          .select("*")
          .single();
        if (error) throw error;
        resultRow = data as RoleCriteria;
      }
      const next = makeDraftFrom(resultRow);
      setDraft(next);
      setBaseline(next);
      toast.success(`Saved v${resultRow!.version}`);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: -8 }}>
      {/* Header */}
      <div className="grid items-center gap-3 mb-4" style={{ gridTemplateColumns: "1fr auto" }}>
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-xl font-semibold" style={{ color: "#F0F0FF", fontFamily: MONO }}>
            Role Criteria
          </h2>
          <span className="px-2 py-0.5 text-xs"
            style={{ background: "#111118", border: "1px solid #1E1E2E", color: "#8B8B9E", borderRadius: 3, fontFamily: MONO }}>
            v{draft.version || 1}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {dirty && (
            <span className="text-xs" style={{ color: "#F59E0B", fontFamily: MONO }}>
              Unsaved changes
            </span>
          )}
          <Button onClick={reset} variant="outline" size="sm" disabled={!dirty}
            style={{ background: "transparent", border: "1px solid #1E1E2E", color: "#8B8B9E" }}>
            Reset to Default
          </Button>
          <Button onClick={save} size="sm" disabled={!dirty || saving || !weightsValid}
            style={{
              background: !dirty || !weightsValid ? "rgba(0,212,255,0.2)" : "#00D4FF",
              color: "#0A0A0F",
              border: "none",
            }}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Section 1: Titles */}
      <div style={CARD}>
        <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <TitleList
            title="Target Titles"
            items={draft.target_titles}
            onChange={(items) => setDraft({ ...draft, target_titles: items })}
          />
          <TitleList
            title="Excluded Titles"
            items={draft.excluded_titles}
            onChange={(items) => setDraft({ ...draft, excluded_titles: items })}
          />
        </div>
      </div>

      {/* Section 2: Weights */}
      <div style={CARD}>
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="text-sm font-semibold uppercase" style={{ color: "#F0F0FF", fontFamily: MONO, letterSpacing: "0.08em" }}>
            Parameter Weights
          </h3>
          <span className="text-xs" style={{ color: "#8B8B9E", fontFamily: MONO }}>Must sum to 1.0</span>
        </div>
        <div className="flex flex-col gap-3">
          {PARAMS.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-4">
              <div style={{ width: 160, color: "#F0F0FF", fontSize: 13 }}>{label}</div>
              <div className="flex-1">
                <Slider
                  value={[draft.weights[key]]}
                  min={0.05}
                  max={0.5}
                  step={0.05}
                  onValueChange={([v]) =>
                    setDraft({ ...draft, weights: { ...draft.weights, [key]: v } as Weights })
                  }
                />
              </div>
              <div style={{ width: 56, textAlign: "right", color: "#00D4FF", fontFamily: MONO, fontSize: 13 }}>
                {Math.round(draft.weights[key] * 100)}%
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-3 flex items-center justify-between" style={{ borderTop: "1px solid #1E1E2E" }}>
          <span className="text-xs" style={{ color: "#8B8B9E", fontFamily: MONO }}>Total</span>
          <span className="text-xs font-medium" style={{
            color: weightsValid ? "#10B981" : "#F59E0B",
            fontFamily: MONO,
          }}>
            {weightsValid
              ? `✓ Valid (${Math.round(weightSum * 100)}%)`
              : `${Math.round(weightSum * 100)}% — Weights must sum to 100%`}
          </span>
        </div>
      </div>

      {/* Section 3: Rubric */}
      <div style={CARD}>
        <h3 className="text-sm font-semibold uppercase mb-3" style={{ color: "#F0F0FF", fontFamily: MONO, letterSpacing: "0.08em" }}>
          Scoring Rubric
        </h3>
        <div className="flex flex-col">
          {PARAMS.map(({ key, label }) => (
            <RubricSection
              key={key}
              label={label}
              values={draft.rubric[key]}
              onChange={(scores) =>
                setDraft({ ...draft, rubric: { ...draft.rubric, [key]: scores } })
              }
            />
          ))}
        </div>
      </div>

      {/* Section 4: Disqualifiers & Bonuses */}
      <div style={CARD}>
        <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <DisqualifierList
            items={draft.disqualifiers}
            onChange={(items) => setDraft({ ...draft, disqualifiers: items })}
          />
          <BonusList
            items={draft.bonuses}
            onChange={(items) => setDraft({ ...draft, bonuses: items })}
          />
        </div>
      </div>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function TitleList({
  title, items, onChange,
}: { title: string; items: string[]; onChange: (next: string[]) => void }) {
  const [value, setValue] = useState("");
  const add = () => {
    const v = value.trim();
    if (!v) return;
    if (items.includes(v)) { setValue(""); return; }
    onChange([...items, v]);
    setValue("");
  };
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase mb-2" style={{ color: "#F0F0FF", fontFamily: MONO, letterSpacing: "0.08em" }}>
        {title}
      </h4>
      <div className="flex flex-wrap gap-1.5 mb-3 min-h-[28px]">
        {items.length === 0 && (
          <span className="text-xs" style={{ color: "#8B8B9E" }}>None</span>
        )}
        {items.map((t) => (
          <RemovableTag key={t} label={t} onRemove={() => onChange(items.filter((x) => x !== t))} />
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Add title…"
          className="h-8"
          style={{ background: "#0A0A0F", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
        />
        <Button size="sm" onClick={add} variant="outline"
          style={{ borderColor: "rgba(0,212,255,0.4)", color: "#00D4FF", background: "transparent", height: 32 }}>
          <Plus size={12} /> Add
        </Button>
      </div>
    </div>
  );
}

function RemovableTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs"
      style={{ background: "#1E1E2E", color: "#F0F0FF", borderRadius: 3, fontFamily: MONO, height: 24 }}
    >
      {label}
      <button
        onClick={onRemove}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="inline-flex"
        aria-label={`Remove ${label}`}
        style={{ color: hover ? "#EF4444" : "#8B8B9E", transition: "color 120ms" }}
      >
        <X size={11} />
      </button>
    </span>
  );
}

function RubricSection({
  label, values, onChange,
}: {
  label: string;
  values: Record<1 | 2 | 3 | 4 | 5, string>;
  onChange: (next: Record<1 | 2 | 3 | 4 | 5, string>) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: "1px solid #1E1E2E" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between"
        style={{ height: 40, color: "#F0F0FF", fontSize: 13 }}
      >
        <span>{label}</span>
        <ChevronDown size={14} style={{
          color: "#8B8B9E",
          transform: open ? "none" : "rotate(-90deg)",
          transition: "transform 150ms",
        }} />
      </button>
      {open && (
        <div className="pb-3 flex flex-col gap-1.5">
          {[5, 4, 3, 2, 1].map((score) => {
            const s = score as 1 | 2 | 3 | 4 | 5;
            return (
              <div key={s} className="flex items-center gap-2">
                <span
                  className="inline-flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{
                    width: 22, height: 22,
                    background: "rgba(0,212,255,0.12)",
                    color: "#00D4FF",
                    border: "1px solid rgba(0,212,255,0.4)",
                    borderRadius: 3,
                    fontFamily: MONO,
                  }}
                >{s}</span>
                <Input
                  value={values[s] ?? ""}
                  onChange={(e) => onChange({ ...values, [s]: e.target.value })}
                  className="h-8"
                  style={{ background: "#0A0A0F", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DisqualifierList({
  items, onChange,
}: { items: string[]; onChange: (next: string[]) => void }) {
  const [value, setValue] = useState("");
  const add = () => {
    const v = value.trim();
    if (!v) return;
    onChange([...items, v]);
    setValue("");
  };
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase mb-2" style={{ color: "#F0F0FF", fontFamily: MONO, letterSpacing: "0.08em" }}>
        Disqualifiers
      </h4>
      <div className="flex flex-col gap-1 mb-3">
        {items.length === 0 && (
          <span className="text-xs" style={{ color: "#8B8B9E" }}>None</span>
        )}
        {items.map((rule, i) => (
          <div key={`${i}-${rule}`} className="flex items-center gap-2 px-2 py-1.5"
            style={{ background: "#0A0A0F", border: "1px solid #1E1E2E", borderRadius: 3 }}>
            <span className="text-xs flex-1" style={{ color: "#F0F0FF" }}>{rule}</span>
            <button
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              className="text-[#8B8B9E] hover:text-[#EF4444] transition-colors"
              aria-label="Delete rule"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Add disqualifier…"
          className="h-8"
          style={{ background: "#0A0A0F", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
        />
        <Button size="sm" onClick={add} variant="outline"
          style={{ borderColor: "rgba(0,212,255,0.4)", color: "#00D4FF", background: "transparent", height: 32 }}>
          <Plus size={12} /> Add Rule
        </Button>
      </div>
    </div>
  );
}

function BonusList({
  items, onChange,
}: { items: Bonus[]; onChange: (next: Bonus[]) => void }) {
  const [name, setName] = useState("");
  const [val, setVal] = useState("0.5");
  const add = () => {
    const n = name.trim();
    const v = Number(val);
    if (!n || Number.isNaN(v)) return;
    onChange([...items, { id: crypto.randomUUID(), name: n, value: v }]);
    setName("");
    setVal("0.5");
  };
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase mb-2" style={{ color: "#F0F0FF", fontFamily: MONO, letterSpacing: "0.08em" }}>
        Bonuses
      </h4>
      <div className="flex flex-col gap-1 mb-3">
        {items.length === 0 && (
          <span className="text-xs" style={{ color: "#8B8B9E" }}>None</span>
        )}
        {items.map((b) => (
          <div key={b.id} className="flex items-center gap-2 px-2 py-1.5"
            style={{ background: "#0A0A0F", border: "1px solid #1E1E2E", borderRadius: 3 }}>
            <Input
              value={b.name}
              onChange={(e) => onChange(items.map((x) => x.id === b.id ? { ...x, name: e.target.value } : x))}
              className="h-7 flex-1 text-xs"
              style={{ background: "transparent", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
            />
            <div className="flex items-center gap-1">
              <span className="text-xs" style={{ color: "#00D4FF", fontFamily: MONO }}>
                {b.value >= 0 ? "+" : ""}
              </span>
              <Input
                type="number"
                step="0.1"
                value={b.value}
                onChange={(e) => onChange(items.map((x) => x.id === b.id ? { ...x, value: Number(e.target.value) } : x))}
                className="h-7 w-16 text-xs"
                style={{ background: "transparent", border: "1px solid #1E1E2E", color: "#00D4FF", fontFamily: MONO }}
              />
            </div>
            <button
              onClick={() => onChange(items.filter((x) => x.id !== b.id))}
              className="text-[#8B8B9E] hover:text-[#EF4444] transition-colors"
              aria-label="Delete bonus"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Bonus name…"
          className="h-8 flex-1"
          style={{ background: "#0A0A0F", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
        />
        <Input
          type="number"
          step="0.1"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="h-8 w-20"
          style={{ background: "#0A0A0F", border: "1px solid #1E1E2E", color: "#00D4FF", fontFamily: MONO }}
        />
        <Button size="sm" onClick={add} variant="outline"
          style={{ borderColor: "rgba(0,212,255,0.4)", color: "#00D4FF", background: "transparent", height: 32 }}>
          <Plus size={12} /> Add Bonus
        </Button>
      </div>
    </div>
  );
}
