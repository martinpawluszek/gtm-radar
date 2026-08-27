import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  cvKey,
  cvList,
  cvUpdate,
  safeMetrics,
  safeStr,
  type CvProfile,
  type MetricEntry,
} from "@/lib/career";
import {
  Action,
  LabeledField,
  MONO,
  Panel,
  PrimaryButton,
  SectionLabel,
  SelectInput,
  TextAreaInput,
  TextInput,
} from "./ui";

const SENSITIVITY_OPTIONS = [
  { value: "cv_ok", label: "cv_ok" },
  { value: "cv_only", label: "cv_only" },
  { value: "excluded", label: "excluded" },
];

export function ProfileCard() {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: cvKey("cv_profile"),
    queryFn: () => cvList<CvProfile>("cv_profile"),
  });
  const profile = rows[0] ?? null;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CvProfile | null>(profile);
  const [metrics, setMetrics] = useState<MetricEntry[]>(safeMetrics(profile?.metrics_quickref));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) {
      setDraft(profile);
      setMetrics(safeMetrics(profile?.metrics_quickref));
    }
  }, [profile, editing]);

  if (!profile) return null;

  async function save() {
    if (!draft || !profile) return;
    setSaving(true);
    try {
      await cvUpdate("cv_profile", profile.id, {
        full_name: draft.full_name,
        location: draft.location,
        email: draft.email,
        phone: draft.phone,
        linkedin_url: draft.linkedin_url,
        citizenship_line: draft.citizenship_line,
        metrics_quickref: metrics.filter((m) => m.text.trim() !== ""),
      });
      setEditing(false);
      qc.invalidateQueries({ queryKey: cvKey("cv_profile") });
      toast.success("Profile saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm font-semibold" style={{ color: "#F0F0FF", fontFamily: MONO }}>
            {safeStr(profile.full_name) || "Unnamed"}
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: "#8B8B9E", fontFamily: MONO }}>
            {[
              safeStr(profile.location),
              safeStr(profile.email),
              safeStr(profile.phone),
              safeStr(profile.linkedin_url),
            ]
              .filter(Boolean)
              .join(" · ") || "No contact details yet"}
          </div>
          {safeStr(profile.citizenship_line) && (
            <div className="text-[12px] mt-1" style={{ color: "#8B8B9E", fontFamily: MONO }}>
              {safeStr(profile.citizenship_line)}
            </div>
          )}
        </div>
        <Action color="#00D4FF" onClick={() => setEditing((v) => !v)}>
          {editing ? "Close" : "Edit profile"}
        </Action>
      </div>

      {!editing && safeMetrics(profile.metrics_quickref).length > 0 && (
        <div className="mt-3 flex flex-col gap-1">
          <SectionLabel>Headline metrics</SectionLabel>
          {safeMetrics(profile.metrics_quickref).map((m, i) => (
            <div key={i} className="text-[13px]" style={{ color: "#C0C0D0" }}>
              • {m.text}
              <span className="ml-2 text-[11px]" style={{ color: "#8B8B9E", fontFamily: MONO }}>
                {m.sensitivity}
              </span>
            </div>
          ))}
        </div>
      )}

      {editing && draft && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <LabeledField label="Full name">
            <TextInput
              value={safeStr(draft.full_name)}
              onChange={(v) => setDraft({ ...draft, full_name: v })}
            />
          </LabeledField>
          <LabeledField label="Location">
            <TextInput
              value={safeStr(draft.location)}
              onChange={(v) => setDraft({ ...draft, location: v })}
            />
          </LabeledField>
          <LabeledField label="Email">
            <TextInput
              value={safeStr(draft.email)}
              onChange={(v) => setDraft({ ...draft, email: v })}
            />
          </LabeledField>
          <LabeledField label="Phone">
            <TextInput
              value={safeStr(draft.phone)}
              onChange={(v) => setDraft({ ...draft, phone: v })}
            />
          </LabeledField>
          <div className="md:col-span-2">
            <LabeledField label="LinkedIn URL">
              <TextInput
                value={safeStr(draft.linkedin_url)}
                onChange={(v) => setDraft({ ...draft, linkedin_url: v })}
              />
            </LabeledField>
          </div>
          <div className="md:col-span-2">
            <LabeledField label="Citizenship line">
              <TextInput
                value={safeStr(draft.citizenship_line)}
                placeholder="e.g. EU citizen — no visa sponsorship required"
                onChange={(v) => setDraft({ ...draft, citizenship_line: v })}
              />
            </LabeledField>
          </div>

          <div className="md:col-span-2 flex flex-col gap-2">
            <SectionLabel>Headline metrics</SectionLabel>
            <p className="text-[12px]" style={{ color: "#8B8B9E" }}>
              The numbers every CV and cover letter pulls from. Update these when they change.
            </p>
            {metrics.map((m, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <TextAreaInput
                    value={m.text}
                    rows={2}
                    placeholder="e.g. Grew ARR from $1M to $3M in 18 months"
                    onChange={(v) =>
                      setMetrics(metrics.map((x, j) => (j === i ? { ...x, text: v } : x)))
                    }
                  />
                </div>
                <SelectInput
                  value={m.sensitivity}
                  options={SENSITIVITY_OPTIONS}
                  onChange={(v) =>
                    setMetrics(metrics.map((x, j) => (j === i ? { ...x, sensitivity: v } : x)))
                  }
                />
                <Action
                  color="#F87171"
                  onClick={() => setMetrics(metrics.filter((_, j) => j !== i))}
                >
                  Remove
                </Action>
              </div>
            ))}
            <div>
              <Action
                color="#00D4FF"
                onClick={() => setMetrics([...metrics, { text: "", sensitivity: "cv_ok" }])}
              >
                + Add metric
              </Action>
            </div>
          </div>

          <div className="md:col-span-2 flex justify-end gap-2">
            <Action onClick={() => setEditing(false)}>Cancel</Action>
            <PrimaryButton onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save profile"}
            </PrimaryButton>
          </div>
        </div>
      )}
    </Panel>
  );
}
