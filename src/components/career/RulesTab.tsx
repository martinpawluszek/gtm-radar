import { useState } from "react";
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
  swapOrder,
  type CvRule,
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
  Toggle,
} from "./ui";

const RULE_KINDS = [
  { value: "style", label: "Style" },
  { value: "content", label: "Content" },
  { value: "exclusion", label: "Exclusions" },
  { value: "ats", label: "ATS" },
  { value: "prompt", label: "Prompt" },
];

export function RulesTab() {
  const qc = useQueryClient();
  const { data: rules = [], isLoading } = useQuery({
    queryKey: cvKey("cv_rules"),
    queryFn: () => cvList<CvRule>("cv_rules", { column: "display_order" }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: cvKey("cv_rules") });

  if (isLoading) return <Empty>Loading…</Empty>;

  const other = rules.filter((r) => !RULE_KINDS.some((k) => k.value === safeStr(r.kind)));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm max-w-2xl" style={{ color: "#8B8B9E" }}>
          These are the instructions the AI follows when generating your CV and cover letters.
          Active rules are applied on every generation; toggle one off to ignore it without
          deleting it.
        </p>
        <PrimaryButton
          onClick={async () => {
            try {
              await cvInsert("cv_rules", {
                kind: "style",
                title: "New rule",
                body: "",
                is_active: true,
                display_order: nextOrder(rules),
              });
              refresh();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not add rule");
            }
          }}
        >
          + New rule
        </PrimaryButton>
      </div>

      {[...RULE_KINDS, { value: "__other", label: "Other" }].map((k) => {
        const rows = (
          k.value === "__other" ? other : rules.filter((r) => safeStr(r.kind) === k.value)
        ).sort(byOrder);
        if (rows.length === 0 && k.value === "__other") return null;
        return (
          <div key={k.value} className="flex flex-col gap-2">
            <SectionLabel>
              {k.label} ({rows.length})
            </SectionLabel>
            {rows.length === 0 ? (
              <p className="text-[12px]" style={{ color: "#8B8B9E" }}>
                No rules in this group.
              </p>
            ) : (
              rows.map((r, i) => (
                <RuleCard key={r.id} rule={r} index={i} siblings={rows} onChanged={refresh} />
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

function RuleCard({
  rule,
  index,
  siblings,
  onChanged,
}: {
  rule: CvRule;
  index: number;
  siblings: CvRule[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CvRule>(rule);
  const [saving, setSaving] = useState(false);
  const active = rule.is_active !== false;

  async function patch(values: Record<string, unknown>) {
    try {
      await cvUpdate("cv_rules", rule.id, values);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function move(dir: -1 | 1) {
    const other = siblings[index + dir];
    if (!other) return;
    try {
      await swapOrder("cv_rules", rule, other, index, index + dir);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reorder failed");
    }
  }

  async function save() {
    setSaving(true);
    try {
      await cvUpdate("cv_rules", rule.id, {
        kind: draft.kind,
        title: draft.title,
        body: draft.body,
      });
      setEditing(false);
      onChanged();
      toast.success("Rule saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel style={{ padding: 14, opacity: active ? 1 : 0.6 }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold" style={{ color: "#F0F0FF", fontFamily: MONO }}>
            {safeStr(rule.title) || "Untitled rule"}
          </div>
          {safeStr(rule.body) && (
            <p className="text-[13px] mt-1 whitespace-pre-wrap" style={{ color: "#C0C0D0" }}>
              {safeStr(rule.body)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Toggle
            checked={active}
            onChange={(v) => patch({ is_active: v })}
            label={active ? "Active" : "Inactive"}
          />
          <Action onClick={() => move(-1)} disabled={index === 0} title="Move up">
            ↑
          </Action>
          <Action onClick={() => move(1)} disabled={index === siblings.length - 1} title="Move down">
            ↓
          </Action>
          <Action
            color="#00D4FF"
            onClick={() => {
              setDraft(rule);
              setEditing((v) => !v);
            }}
          >
            {editing ? "Close" : "Edit"}
          </Action>
          <Action
            color="#F87171"
            onClick={async () => {
              try {
                await cvDelete("cv_rules", rule.id);
                onChanged();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Delete failed");
              }
            }}
          >
            Delete
          </Action>
        </div>
      </div>

      {editing && (
        <div className="flex flex-col gap-3 mt-3">
          <LabeledField label="Title">
            <TextInput
              value={safeStr(draft.title)}
              onChange={(v) => setDraft({ ...draft, title: v })}
            />
          </LabeledField>
          <LabeledField label="Kind">
            <SelectInput
              value={safeStr(draft.kind) || "style"}
              options={RULE_KINDS.map((k) => ({ value: k.value, label: k.value }))}
              onChange={(v) => setDraft({ ...draft, kind: v })}
            />
          </LabeledField>
          <LabeledField label="Body">
            <TextAreaInput
              value={safeStr(draft.body)}
              rows={4}
              onChange={(v) => setDraft({ ...draft, body: v })}
            />
          </LabeledField>
          <div className="flex justify-end gap-2">
            <Action onClick={() => setEditing(false)}>Cancel</Action>
            <PrimaryButton onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save rule"}
            </PrimaryButton>
          </div>
        </div>
      )}
    </Panel>
  );
}
