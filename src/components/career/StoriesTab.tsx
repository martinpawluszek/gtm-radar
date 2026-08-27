import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  cvDelete,
  cvInsert,
  cvKey,
  cvList,
  cvUpdate,
  orderOf,
  safeStr,
  safeTags,
  type CvExperience,
  type CvStory,
} from "@/lib/career";
import {
  Action,
  Empty,
  LabeledField,
  MONO,
  Panel,
  PrimaryButton,
  SelectInput,
  TagEditor,
  TextAreaInput,
  TextInput,
} from "./ui";

export const STORY_TYPES: { value: string; label: string }[] = [
  { value: "win", label: "Win" },
  { value: "failure", label: "Failure" },
  { value: "leadership", label: "Leadership" },
  { value: "conflict", label: "Conflict" },
  { value: "turnaround", label: "Turnaround" },
  { value: "decision", label: "Decision" },
  { value: "technical", label: "Technical" },
  { value: "other", label: "Other" },
];

const SENSITIVITY_OPTIONS = [
  { value: "cv_ok", label: "cv_ok" },
  { value: "cv_only", label: "cv_only" },
  { value: "excluded", label: "excluded" },
];

export function StoriesTab() {
  const qc = useQueryClient();
  const { data: stories = [], isLoading } = useQuery({
    queryKey: cvKey("cv_stories"),
    queryFn: () => cvList<CvStory>("cv_stories", { column: "created_at" }),
  });
  const { data: experiences = [] } = useQuery({
    queryKey: cvKey("cv_experiences"),
    queryFn: () => cvList<CvExperience>("cv_experiences", { column: "display_order" }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: cvKey("cv_stories") });
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const ordered = useMemo(() => {
    const rows = Array.isArray(stories) ? [...stories] : [];
    return rows.sort((a, b) => {
      const sig = Number(b.is_signature === true) - Number(a.is_signature === true);
      if (sig !== 0) return sig;
      const ord = orderOf(a) - orderOf(b);
      if (ord !== 0) return ord;
      return safeStr(a.created_at).localeCompare(safeStr(b.created_at));
    });
  }, [stories]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of ordered) {
      const k = safeStr(s.story_type) || "other";
      map[k] = (map[k] ?? 0) + 1;
    }
    return map;
  }, [ordered]);

  const visible = ordered.filter(
    (s) => filter === "all" || (safeStr(s.story_type) || "other") === filter,
  );

  async function addStory() {
    setAdding(true);
    try {
      await cvInsert("cv_stories", { title: "New story", tags: [] });
      refresh();
      toast.success("Story added.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add story");
    } finally {
      setAdding(false);
    }
  }

  if (isLoading) return <Empty>Loading…</Empty>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm max-w-2xl" style={{ color: "#8B8B9E" }}>
          STAR-format stories (situation, action, result, lesson) for cover letters and interview
          prep. {ordered.length} stor{ordered.length === 1 ? "y" : "ies"}.
        </p>
        <PrimaryButton onClick={addStory} disabled={adding}>
          + New story
        </PrimaryButton>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <Action
          color={filter === "all" ? "#00D4FF" : "#8B8B9E"}
          onClick={() => setFilter("all")}
        >
          All ({ordered.length})
        </Action>
        {STORY_TYPES.filter((t) => counts[t.value]).map((t) => (
          <Action
            key={t.value}
            color={filter === t.value ? "#00D4FF" : "#8B8B9E"}
            onClick={() => setFilter(t.value)}
          >
            {t.label} ({counts[t.value]})
          </Action>
        ))}
      </div>

      {visible.length === 0 ? (
        <Empty>No stories yet. Add one to start building your STAR bank.</Empty>
      ) : (
        visible.map((s) => (
          <StoryCard key={s.id} story={s} experiences={experiences} onChanged={refresh} />
        ))
      )}
    </div>
  );
}

function StoryCard({
  story,
  experiences,
  onChanged,
}: {
  story: CvStory;
  experiences: CvExperience[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CvStory>(story);
  const [saving, setSaving] = useState(false);

  const linked = experiences.find((e) => e.id === story.experience_id) ?? null;

  async function patch(values: Record<string, unknown>) {
    try {
      await cvUpdate("cv_stories", story.id, values);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function save() {
    setSaving(true);
    try {
      await cvUpdate("cv_stories", story.id, {
        title: draft.title,
        situation: draft.situation,
        action: draft.action,
        result: draft.result,
        lesson: draft.lesson,
        experience_id: draft.experience_id || null,
        story_type: safeStr(draft.story_type) || "other",
        metrics: draft.metrics,
        raw_notes: draft.raw_notes,
        sensitivity: safeStr(draft.sensitivity) || "cv_ok",
      });
      setEditing(false);
      onChanged();
      toast.success("Story saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const Part = ({ label, value }: { label: string; value: string }) =>
    value ? (
      <div>
        <div className="text-[11px] uppercase" style={{ color: "#8B8B9E", fontFamily: MONO }}>
          {label}
        </div>
        <p className="text-[13px] mt-0.5" style={{ color: "#C0C0D0" }}>
          {value}
        </p>
      </div>
    ) : null;

  return (
    <Panel>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm font-semibold" style={{ color: "#F0F0FF", fontFamily: MONO }}>
            {safeStr(story.title) || "Untitled story"}
          </div>
          {linked && (
            <div className="text-[11px] mt-0.5" style={{ color: "#8B8B9E", fontFamily: MONO }}>
              {safeStr(linked.role_title)} · {safeStr(linked.company)}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Action
            color="#00D4FF"
            onClick={() => {
              setDraft(story);
              setEditing((v) => !v);
            }}
          >
            {editing ? "Close" : "Edit"}
          </Action>
          <Action
            color="#F87171"
            onClick={async () => {
              try {
                await cvDelete("cv_stories", story.id);
                onChanged();
                toast.success("Story deleted.");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Delete failed");
              }
            }}
          >
            Delete
          </Action>
        </div>
      </div>

      {!editing && (
        <div className="flex flex-col gap-2.5 mt-3">
          <Part label="Situation" value={safeStr(story.situation)} />
          <Part label="Action" value={safeStr(story.action)} />
          <Part label="Result" value={safeStr(story.result)} />
          <Part label="Lesson" value={safeStr(story.lesson)} />
        </div>
      )}

      <div className="mt-3">
        <TagEditor tags={safeTags(story.tags)} onChange={(next) => patch({ tags: next })} />
      </div>

      {editing && (
        <div className="flex flex-col gap-3 mt-4">
          <LabeledField label="Title">
            <TextInput
              value={safeStr(draft.title)}
              onChange={(v) => setDraft({ ...draft, title: v })}
            />
          </LabeledField>
          <LabeledField label="Situation">
            <TextAreaInput
              value={safeStr(draft.situation)}
              onChange={(v) => setDraft({ ...draft, situation: v })}
            />
          </LabeledField>
          <LabeledField label="Action">
            <TextAreaInput
              value={safeStr(draft.action)}
              onChange={(v) => setDraft({ ...draft, action: v })}
            />
          </LabeledField>
          <LabeledField label="Result">
            <TextAreaInput
              value={safeStr(draft.result)}
              onChange={(v) => setDraft({ ...draft, result: v })}
            />
          </LabeledField>
          <LabeledField label="Lesson">
            <TextAreaInput
              value={safeStr(draft.lesson)}
              rows={2}
              onChange={(v) => setDraft({ ...draft, lesson: v })}
            />
          </LabeledField>
          <LabeledField label="Linked experience">
            <SelectInput
              value={draft.experience_id ?? ""}
              options={[
                { value: "", label: "— none —" },
                ...experiences.map((e) => ({
                  value: e.id,
                  label: `${safeStr(e.role_title) || "Role"} · ${safeStr(e.company) || "—"}`,
                })),
              ]}
              onChange={(v) => setDraft({ ...draft, experience_id: v || null })}
            />
          </LabeledField>
          <div className="flex justify-end gap-2">
            <Action onClick={() => setEditing(false)}>Cancel</Action>
            <PrimaryButton onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save story"}
            </PrimaryButton>
          </div>
        </div>
      )}
    </Panel>
  );
}
