import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  byOrder,
  cvDelete,
  cvInsert,
  cvKey,
  cvList,
  cvUpdate,
  nextOrder,
  safeStr,
  safeTags,
  type CvAnswer,
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
  TagEditor,
  TextAreaInput,
  TextInput,
  Toggle,
} from "./ui";

const KINDS: { value: string; label: string }[] = [
  { value: "why_company", label: "Why this company" },
  { value: "why_role", label: "Why this role" },
  { value: "about_me", label: "About me" },
  { value: "strength", label: "Strength" },
  { value: "weakness", label: "Weakness" },
  { value: "achievement", label: "Biggest achievement" },
  { value: "failure", label: "Failure / setback" },
  { value: "leadership", label: "Leadership" },
  { value: "conflict", label: "Conflict" },
  { value: "compensation", label: "Compensation" },
  { value: "logistics", label: "Logistics / notice period" },
  { value: "other", label: "Other" },
];

const kindLabel = (v: string) => KINDS.find((k) => k.value === v)?.label ?? "Other";

function wordCount(v: string): number {
  const t = v.trim();
  return t ? t.split(/\s+/).length : 0;
}

export function AnswersTab() {
  const qc = useQueryClient();
  const { data: answers = [], isLoading } = useQuery({
    queryKey: cvKey("cv_answers"),
    queryFn: () => cvList<CvAnswer>("cv_answers", { column: "display_order" }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: cvKey("cv_answers") });
  const [mastersOnly, setMastersOnly] = useState(true);
  const [adding, setAdding] = useState(false);

  const grouped = useMemo(() => {
    const rows = (Array.isArray(answers) ? answers : []).filter((a) =>
      mastersOnly ? a.is_master !== false : true,
    );
    const map = new Map<string, CvAnswer[]>();
    for (const a of rows) {
      const kind = safeStr(a.question_kind) || "other";
      const list = map.get(kind) ?? [];
      list.push(a);
      map.set(kind, list);
    }
    return KINDS.filter((k) => map.has(k.value)).map((k) => ({
      kind: k.value,
      label: k.label,
      rows: (map.get(k.value) ?? []).sort(byOrder),
    }));
  }, [answers, mastersOnly]);

  async function addAnswer() {
    setAdding(true);
    try {
      await cvInsert("cv_answers", {
        question: "New question",
        question_kind: "other",
        answer: "",
        is_master: true,
        tags: [],
        display_order: nextOrder(answers),
      });
      refresh();
      toast.success("Answer added.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add answer");
    } finally {
      setAdding(false);
    }
  }

  if (isLoading) return <Empty>Loading…</Empty>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm max-w-2xl" style={{ color: "#8B8B9E" }}>
          Reusable answers to the questions every application asks. Cover letters pull from here
          instead of starting from scratch.
        </p>
        <div className="flex items-center gap-2">
          <Toggle
            checked={mastersOnly}
            onChange={setMastersOnly}
            label="Master answers only"
          />
          <PrimaryButton onClick={addAnswer} disabled={adding}>
            + New answer
          </PrimaryButton>
        </div>
      </div>

      {grouped.length === 0 ? (
        <Empty>No answers yet. Add one to start your answer bank.</Empty>
      ) : (
        grouped.map((g) => (
          <div key={g.kind} className="flex flex-col gap-3">
            <SectionLabel>
              {g.label} ({g.rows.length})
            </SectionLabel>
            {g.rows.map((a) => (
              <AnswerCard key={a.id} answer={a} onChanged={refresh} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}

function AnswerCard({ answer, onChanged }: { answer: CvAnswer; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CvAnswer>(answer);
  const [saving, setSaving] = useState(false);

  const text = safeStr(answer.answer);
  const words = wordCount(text);
  const isMaster = answer.is_master !== false;

  async function patch(values: Record<string, unknown>) {
    try {
      await cvUpdate("cv_answers", answer.id, values);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function save() {
    setSaving(true);
    try {
      await cvUpdate("cv_answers", answer.id, {
        question: draft.question,
        question_kind: safeStr(draft.question_kind) || "other",
        answer: draft.answer,
        variant_label: draft.variant_label,
        word_limit: typeof draft.word_limit === "number" ? draft.word_limit : null,
        is_master: draft.is_master !== false,
        company_name: draft.is_master !== false ? null : draft.company_name,
      });
      setEditing(false);
      onChanged();
      toast.success("Answer saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const draftWords = wordCount(safeStr(draft.answer));
  const limit = typeof draft.word_limit === "number" ? draft.word_limit : null;
  const overLimit = limit !== null && draftWords > limit;

  return (
    <Panel>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold" style={{ color: "#F0F0FF", fontFamily: MONO }}>
              {safeStr(answer.question) || "Untitled question"}
            </span>
            {isMaster ? (
              <span
                className="px-2 py-0.5 text-[11px]"
                style={{
                  color: "#00D4FF",
                  background: "rgba(0,212,255,0.08)",
                  border: "1px solid rgba(0,212,255,0.3)",
                  borderRadius: 999,
                  fontFamily: MONO,
                }}
              >
                MASTER
              </span>
            ) : (
              safeStr(answer.company_name) && (
                <span className="text-[11px]" style={{ color: "#8B8B9E", fontFamily: MONO }}>
                  {safeStr(answer.company_name)}
                </span>
              )
            )}
          </div>
          <p className="text-[13px] mt-1.5" style={{ color: "#C0C0D0" }}>
            {text.length > 220 ? `${text.slice(0, 220)}…` : text || "No answer written yet."}
          </p>
          <div className="text-[11px] mt-1" style={{ color: "#8B8B9E", fontFamily: MONO }}>
            {[
              `${words} words`,
              safeStr(answer.variant_label),
              typeof answer.word_limit === "number" ? `limit ${answer.word_limit}` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Action
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                toast.success("Copied.");
              } catch {
                toast.error("Copy failed");
              }
            }}
          >
            Copy answer
          </Action>
          <Action
            color="#00D4FF"
            onClick={() => {
              setDraft(answer);
              setEditing((v) => !v);
            }}
          >
            {editing ? "Close" : "Edit"}
          </Action>
          <Action
            color="#F87171"
            onClick={async () => {
              try {
                await cvDelete("cv_answers", answer.id);
                onChanged();
                toast.success("Answer deleted.");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Delete failed");
              }
            }}
          >
            Delete
          </Action>
        </div>
      </div>

      <div className="mt-3">
        <TagEditor tags={safeTags(answer.tags)} onChange={(next) => patch({ tags: next })} />
      </div>

      {editing && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <div className="md:col-span-2">
            <LabeledField label="Question">
              <TextInput
                value={safeStr(draft.question)}
                onChange={(v) => setDraft({ ...draft, question: v })}
              />
            </LabeledField>
          </div>
          <LabeledField label="Question kind">
            <SelectInput
              value={safeStr(draft.question_kind) || "other"}
              options={KINDS}
              onChange={(v) => setDraft({ ...draft, question_kind: v })}
            />
          </LabeledField>
          <LabeledField label="Variant label">
            <TextInput
              value={safeStr(draft.variant_label)}
              onChange={(v) => setDraft({ ...draft, variant_label: v })}
            />
          </LabeledField>
          <div className="md:col-span-2">
            <LabeledField label="Answer">
              <TextAreaInput
                value={safeStr(draft.answer)}
                rows={8}
                onChange={(v) => setDraft({ ...draft, answer: v })}
              />
            </LabeledField>
            <div
              className="text-[11px] mt-1"
              style={{ color: overLimit ? "#F59E0B" : "#8B8B9E", fontFamily: MONO }}
            >
              {draftWords} words{limit !== null ? ` / ${limit} limit` : ""}
              {overLimit ? " — over limit" : ""}
            </div>
          </div>
          <LabeledField label="Word limit">
            <TextInput
              value={limit === null ? "" : String(limit)}
              placeholder="e.g. 250"
              onChange={(v) => {
                const n = Number(v.replace(/[^0-9]/g, ""));
                setDraft({ ...draft, word_limit: v.trim() === "" || !n ? null : n });
              }}
            />
          </LabeledField>
          <LabeledField label="Company name">
            <TextInput
              value={draft.is_master !== false ? "" : safeStr(draft.company_name)}
              placeholder={draft.is_master !== false ? "Master answer — no company" : "Company"}
              onChange={(v) =>
                draft.is_master !== false ? undefined : setDraft({ ...draft, company_name: v })
              }
            />
          </LabeledField>
          <div className="md:col-span-2">
            <Toggle
              checked={draft.is_master !== false}
              onChange={(v) => setDraft({ ...draft, is_master: v })}
              label="Master answer"
            />
          </div>
          <div className="md:col-span-2 flex justify-end gap-2">
            <Action onClick={() => setEditing(false)}>Cancel</Action>
            <PrimaryButton onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save answer"}
            </PrimaryButton>
          </div>
        </div>
      )}
    </Panel>
  );
}
