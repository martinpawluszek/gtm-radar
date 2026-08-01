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
  swapOrder,
  type CvProject,
} from "@/lib/career";
import {
  Action,
  Empty,
  LabeledField,
  MONO,
  Panel,
  PrimaryButton,
  TagEditor,
  TextAreaInput,
  TextInput,
} from "./ui";

export function BuiltTab() {
  const qc = useQueryClient();
  const { data: projects = [], isLoading } = useQuery({
    queryKey: cvKey("cv_projects"),
    queryFn: () => cvList<CvProject>("cv_projects", { column: "display_order" }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: cvKey("cv_projects") });
  const ordered = useMemo(() => [...projects].sort(byOrder), [projects]);
  const [adding, setAdding] = useState(false);

  async function addProject() {
    setAdding(true);
    try {
      await cvInsert("cv_projects", {
        name: "New project",
        status: "active",
        tags: [],
        display_order: nextOrder(projects),
      });
      refresh();
      toast.success("Project added.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add project");
    } finally {
      setAdding(false);
    }
  }

  if (isLoading) return <Empty>Loading…</Empty>;

  const activeCount = ordered.filter((p) => safeStr(p.status) !== "hold").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm" style={{ color: "#8B8B9E" }}>
          {activeCount} active · {ordered.length - activeCount} on hold
        </p>
        <PrimaryButton onClick={addProject} disabled={adding}>
          + New project
        </PrimaryButton>
      </div>

      {ordered.length === 0 ? (
        <Empty>Nothing built here yet.</Empty>
      ) : (
        ordered.map((p, i) => (
          <ProjectCard
            key={p.id}
            project={p}
            index={i}
            total={ordered.length}
            siblings={ordered}
            onChanged={refresh}
          />
        ))
      )}
    </div>
  );
}

function ProjectCard({
  project,
  index,
  total,
  siblings,
  onChanged,
}: {
  project: CvProject;
  index: number;
  total: number;
  siblings: CvProject[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CvProject>(project);
  const [saving, setSaving] = useState(false);
  const onHold = safeStr(project.status) === "hold";

  async function patch(values: Record<string, unknown>) {
    try {
      await cvUpdate("cv_projects", project.id, values);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function save() {
    setSaving(true);
    try {
      await cvUpdate("cv_projects", project.id, {
        name: draft.name,
        org: draft.org,
        year: draft.year,
        description: draft.description,
        stack: draft.stack,
        status: draft.status || "active",
        hold_reason: draft.hold_reason,
      });
      setEditing(false);
      onChanged();
      toast.success("Project saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function move(dir: -1 | 1) {
    const other = siblings[index + dir];
    if (!other) return;
    try {
      await swapOrder("cv_projects", project, other, index, index + dir);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reorder failed");
    }
  }

  return (
    <Panel style={onHold ? { opacity: 0.85, borderColor: "rgba(245,158,11,0.25)" } : undefined}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold" style={{ color: "#F0F0FF", fontFamily: MONO }}>
              {safeStr(project.name) || "Untitled"}
            </span>
            {onHold ? (
              <span
                className="px-2 py-0.5 text-[11px]"
                style={{
                  color: "#F59E0B",
                  background: "rgba(245,158,11,0.08)",
                  border: "1px solid rgba(245,158,11,0.3)",
                  borderRadius: 999,
                  fontFamily: MONO,
                }}
              >
                On hold
              </span>
            ) : (
              <span
                className="px-2 py-0.5 text-[11px]"
                style={{
                  color: "#10B981",
                  background: "rgba(16,185,129,0.08)",
                  border: "1px solid rgba(16,185,129,0.3)",
                  borderRadius: 999,
                  fontFamily: MONO,
                }}
              >
                Active
              </span>
            )}
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: "#8B8B9E", fontFamily: MONO }}>
            {[safeStr(project.org), safeStr(project.year)].filter(Boolean).join(" · ") || "—"}
          </div>
          {safeStr(project.description) && (
            <p className="text-[13px] mt-2" style={{ color: "#C0C0D0" }}>
              {safeStr(project.description)}
            </p>
          )}
          {safeStr(project.stack) && (
            <div className="text-[11px] mt-1.5" style={{ color: "#8B8B9E", fontFamily: MONO }}>
              Stack: {safeStr(project.stack)}
            </div>
          )}
          {onHold && safeStr(project.hold_reason) && (
            <p className="text-[12px] mt-2" style={{ color: "#F59E0B" }}>
              On hold: {safeStr(project.hold_reason)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Action onClick={() => move(-1)} disabled={index === 0} title="Move up">
            ↑
          </Action>
          <Action onClick={() => move(1)} disabled={index === total - 1} title="Move down">
            ↓
          </Action>
          <Action
            onClick={() => patch({ status: onHold ? "active" : "hold" })}
            color={onHold ? "#10B981" : "#F59E0B"}
          >
            {onHold ? "Resume" : "Put on hold"}
          </Action>
          <Action
            color="#00D4FF"
            onClick={() => {
              setDraft(project);
              setEditing((v) => !v);
            }}
          >
            {editing ? "Close" : "Edit"}
          </Action>
          <Action
            color="#F87171"
            onClick={async () => {
              try {
                await cvDelete("cv_projects", project.id);
                onChanged();
                toast.success("Project deleted.");
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
        <TagEditor tags={safeTags(project.tags)} onChange={(next) => patch({ tags: next })} />
      </div>

      {editing && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <LabeledField label="Name">
            <TextInput value={safeStr(draft.name)} onChange={(v) => setDraft({ ...draft, name: v })} />
          </LabeledField>
          <LabeledField label="Org">
            <TextInput value={safeStr(draft.org)} onChange={(v) => setDraft({ ...draft, org: v })} />
          </LabeledField>
          <LabeledField label="Year">
            <TextInput value={safeStr(draft.year)} onChange={(v) => setDraft({ ...draft, year: v })} />
          </LabeledField>
          <LabeledField label="Stack">
            <TextInput
              value={safeStr(draft.stack)}
              onChange={(v) => setDraft({ ...draft, stack: v })}
            />
          </LabeledField>
          <div className="md:col-span-2">
            <LabeledField label="Description">
              <TextAreaInput
                value={safeStr(draft.description)}
                onChange={(v) => setDraft({ ...draft, description: v })}
              />
            </LabeledField>
          </div>
          <div className="md:col-span-2">
            <LabeledField label="Hold reason">
              <TextInput
                value={safeStr(draft.hold_reason)}
                placeholder="Why is this benched?"
                onChange={(v) => setDraft({ ...draft, hold_reason: v })}
              />
            </LabeledField>
          </div>
          <div className="md:col-span-2 flex justify-end gap-2">
            <Action onClick={() => setEditing(false)}>Cancel</Action>
            <PrimaryButton onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save project"}
            </PrimaryButton>
          </div>
        </div>
      )}
    </Panel>
  );
}
