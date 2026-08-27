import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cvKey, cvList, cvUpdate, safeStr, type CvGeneration } from "@/lib/career";
import { Action, Empty, LabeledField, MONO, Panel, SelectInput, TextAreaInput, TextInput } from "./ui";

const OUTCOMES: { value: string; label: string }[] = [
  { value: "not_sent", label: "Not sent" },
  { value: "applied", label: "Applied" },
  { value: "no_response", label: "No response" },
  { value: "rejected_screen", label: "Rejected at screen" },
  { value: "recruiter_screen", label: "Recruiter screen" },
  { value: "hiring_manager", label: "Hiring manager" },
  { value: "onsite", label: "Onsite / final" },
  { value: "offer", label: "Offer" },
  { value: "accepted", label: "Accepted" },
  { value: "withdrawn", label: "Withdrawn" },
];

const ADVANCED = ["recruiter_screen", "hiring_manager", "onsite", "offer", "accepted"];

function outcomeColor(v: string): string {
  if (v === "applied") return "#F59E0B";
  if (v === "rejected_screen" || v === "withdrawn") return "#F87171";
  if (v === "recruiter_screen" || v === "hiring_manager" || v === "onsite") return "#00D4FF";
  if (v === "offer" || v === "accepted") return "#10B981";
  return "#8B8B9E";
}

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

export function GenerationsTab() {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: cvKey("cv_generations"),
    queryFn: () =>
      cvList<CvGeneration>("cv_generations", { column: "created_at", ascending: false }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: cvKey("cv_generations") });

  const list = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);
  const applied = list.filter((r) => safeStr(r.outcome) === "applied" || r.applied_at).length;
  const advanced = list.filter((r) => ADVANCED.includes(safeStr(r.outcome))).length;

  if (isLoading) return <Empty>Loading…</Empty>;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm max-w-2xl" style={{ color: "#8B8B9E" }}>
        Every CV and cover letter generated, and what actually happened. Recording outcomes is what
        teaches the generator what works.
      </p>

      <div className="text-[12px]" style={{ color: "#8B8B9E", fontFamily: MONO }}>
        {list.length} generated · {applied} applied · {advanced} at recruiter screen or beyond —
        cold applications convert around 3%. Referrals convert around 40%.
      </div>

      {list.length === 0 ? (
        <Empty>No documents generated yet. Generate one in CV Studio, or ask Claude Code to build one.</Empty>
      ) : (
        list.map((g) => <GenerationRow key={g.id} gen={g} onChanged={refresh} />)
      )}
    </div>
  );
}

function GenerationRow({ gen, onChanged }: { gen: CvGeneration; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [referral, setReferral] = useState(safeStr(gen.referral_source));
  const [notes, setNotes] = useState(safeStr(gen.outcome_notes));
  const [saving, setSaving] = useState(false);

  const outcome = safeStr(gen.outcome) || "not_sent";
  const isCover = safeStr(gen.doc_type).toLowerCase().includes("cover");

  async function patch(values: Record<string, unknown>) {
    try {
      await cvUpdate("cv_generations", gen.id, values);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function changeOutcome(next: string) {
    const now = new Date().toISOString();
    const values: Record<string, unknown> = { outcome: next, outcome_at: now };
    if (next === "applied" && !gen.applied_at) values.applied_at = now;
    await patch(values);
  }

  async function saveDetail() {
    setSaving(true);
    try {
      await cvUpdate("cv_generations", gen.id, {
        referral_source: referral,
        outcome_notes: notes,
      });
      onChanged();
      toast.success("Outcome saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const coverage = gen.keyword_coverage;

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span
            className="px-2 py-0.5 text-[11px]"
            style={{
              color: isCover ? "#F59E0B" : "#00D4FF",
              border: `1px solid ${isCover ? "rgba(245,158,11,0.3)" : "rgba(0,212,255,0.3)"}`,
              borderRadius: 999,
              fontFamily: MONO,
            }}
          >
            {isCover ? "Cover letter" : "CV"}
          </span>
          <span className="text-sm font-semibold" style={{ color: "#F0F0FF", fontFamily: MONO }}>
            {safeStr(gen.company_name) || "—"}
          </span>
          <span className="text-[11px]" style={{ color: "#8B8B9E", fontFamily: MONO }}>
            {[safeStr(gen.arrangement), fmtDate(gen.created_at)].filter(Boolean).join(" · ")}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ color: outcomeColor(outcome) }}>
            <SelectInput value={outcome} options={OUTCOMES} onChange={changeOutcome} />
          </span>
          <Action color="#00D4FF" onClick={() => setOpen((v) => !v)}>
            {open ? "Close" : "Details"}
          </Action>
        </div>
      </div>

      {open && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <LabeledField label="Referral source">
            <TextInput
              value={referral}
              placeholder="Cold apply, referral name, recruiter outreach…"
              onChange={setReferral}
            />
          </LabeledField>
          <LabeledField label="Outcome notes">
            <TextAreaInput value={notes} rows={2} onChange={setNotes} />
          </LabeledField>
          {coverage != null && (
            <div className="md:col-span-2">
              <LabeledField label="Keyword coverage">
                <pre
                  className="text-[11px] overflow-auto"
                  style={{
                    color: "#8B8B9E",
                    fontFamily: MONO,
                    background: "#0D0D14",
                    border: "1px solid #1E1E2E",
                    borderRadius: 4,
                    padding: 8,
                    maxHeight: 180,
                  }}
                >
                  {JSON.stringify(coverage, null, 2)}
                </pre>
              </LabeledField>
            </div>
          )}
          <div className="md:col-span-2 flex justify-end">
            <Action color="#00D4FF" onClick={saveDetail} disabled={saving}>
              {saving ? "Saving…" : "Save details"}
            </Action>
          </div>
        </div>
      )}
    </Panel>
  );
}
