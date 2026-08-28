import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  cvKey,
  cvList,
  cvUpdate,
  safeLanguages,
  safeMetrics,
  safeStr,
  type CvProfile,
  type LanguageEntry,
  type MetricEntry,
} from "@/lib/career";
import {
  Action,
  Empty,
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

export function InformationTab() {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: cvKey("cv_profile"),
    queryFn: () => cvList<CvProfile>("cv_profile"),
  });
  const profile = Array.isArray(rows) ? (rows[0] ?? null) : null;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CvProfile | null>(profile);
  const [metrics, setMetrics] = useState<MetricEntry[]>(safeMetrics(profile?.metrics_quickref));
  const [languages, setLanguages] = useState<LanguageEntry[]>(safeLanguages(profile?.languages));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) {
      setDraft(profile);
      setMetrics(safeMetrics(profile?.metrics_quickref));
      setLanguages(safeLanguages(profile?.languages));
    }
  }, [profile, editing]);

  if (isLoading) return <Empty>Loading…</Empty>;
  if (!profile) return <Empty>No profile row found.</Empty>;

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
        languages: languages.filter((l) => l.language.trim() !== ""),
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

  const savedMetrics = safeMetrics(profile.metrics_quickref);
  const savedLanguages = safeLanguages(profile.languages);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm max-w-2xl" style={{ color: "#8B8B9E" }}>
          Contact details, languages and the headline numbers every CV and cover letter pulls from.
        </p>
        <Action color="#00D4FF" onClick={() => setEditing((v) => !v)}>
          {editing ? "Close" : "Edit information"}
        </Action>
      </div>

      {/* Identity */}
      <Panel>
        <SectionLabel>Identity</SectionLabel>
        {!editing ? (
          <div className="mt-2">
            <div className="text-sm font-semibold" style={{ color: "#F0F0FF", fontFamily: MONO }}>
              {safeStr(profile.full_name) || "Unnamed"}
            </div>
            <div className="text-[12px] mt-1" style={{ color: "#8B8B9E", fontFamily: MONO }}>
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
              <div className="text-[12px] mt-1" style={{ color: "#C0C0D0" }}>
                {safeStr(profile.citizenship_line)}
              </div>
            )}
          </div>
        ) : (
          draft && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
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
            </div>
          )
        )}
      </Panel>

      {/* Languages */}
      <Panel>
        <SectionLabel>Languages</SectionLabel>
        {!editing ? (
          savedLanguages.length === 0 ? (
            <p className="text-[12px] mt-2" style={{ color: "#8B8B9E" }}>
              No languages yet.
            </p>
          ) : (
            <div className="mt-2 flex flex-col gap-1">
              {savedLanguages.map((l, i) => (
                <div key={i} className="text-[13px]" style={{ color: "#C0C0D0" }}>
                  {l.language || "—"}
                  <span className="ml-2 text-[11px]" style={{ color: "#8B8B9E", fontFamily: MONO }}>
                    {l.level}
                  </span>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="flex flex-col gap-2 mt-3">
            {languages.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <TextInput
                    value={l.language}
                    placeholder="Language"
                    onChange={(v) =>
                      setLanguages(languages.map((x, j) => (j === i ? { ...x, language: v } : x)))
                    }
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <TextInput
                    value={l.level}
                    placeholder="e.g. C2 (Native)"
                    onChange={(v) =>
                      setLanguages(languages.map((x, j) => (j === i ? { ...x, level: v } : x)))
                    }
                  />
                </div>
                <Action
                  color="#F87171"
                  onClick={() => setLanguages(languages.filter((_, j) => j !== i))}
                >
                  Remove
                </Action>
              </div>
            ))}
            <div>
              <Action
                color="#00D4FF"
                onClick={() => setLanguages([...languages, { language: "", level: "" }])}
              >
                + Add language
              </Action>
            </div>
          </div>
        )}
      </Panel>

      {/* Headline metrics */}
      <Panel>
        <SectionLabel>Headline metrics</SectionLabel>
        {!editing ? (
          savedMetrics.length === 0 ? (
            <p className="text-[12px] mt-2" style={{ color: "#8B8B9E" }}>
              No headline metrics yet.
            </p>
          ) : (
            <div className="mt-2 flex flex-col gap-1">
              {savedMetrics.map((m, i) => (
                <div key={i} className="text-[13px]" style={{ color: "#C0C0D0" }}>
                  • {m.text}
                  <span className="ml-2 text-[11px]" style={{ color: "#8B8B9E", fontFamily: MONO }}>
                    {m.sensitivity}
                  </span>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="flex flex-col gap-2 mt-3">
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
                <Action color="#F87171" onClick={() => setMetrics(metrics.filter((_, j) => j !== i))}>
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
        )}
      </Panel>

      {editing && (
        <div className="flex justify-end gap-2">
          <Action onClick={() => setEditing(false)}>Cancel</Action>
          <PrimaryButton onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save profile"}
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}
