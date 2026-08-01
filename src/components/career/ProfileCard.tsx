import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cvKey, cvList, cvUpdate, safeStr, type CvProfile } from "@/lib/career";
import { Action, LabeledField, MONO, Panel, PrimaryButton, TextInput } from "./ui";

export function ProfileCard() {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: cvKey("cv_profile"),
    queryFn: () => cvList<CvProfile>("cv_profile"),
  });
  const profile = rows[0] ?? null;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CvProfile | null>(profile);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(profile);
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
        </div>
        <Action color="#00D4FF" onClick={() => setEditing((v) => !v)}>
          {editing ? "Close" : "Edit profile"}
        </Action>
      </div>

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
