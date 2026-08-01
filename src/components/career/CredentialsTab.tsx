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
  type CvCompetency,
  type CvCredential,
} from "@/lib/career";
import {
  Action,
  Chip,
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
} from "./ui";

const CRED_KINDS = [
  { value: "education", label: "Education" },
  { value: "program", label: "Programs" },
  { value: "certification", label: "Certifications" },
];

const CRED_STATUS = [
  { value: "earned", label: "earned" },
  { value: "in_progress", label: "in progress" },
];

const GROUPS = [
  { value: "commercial", label: "Commercial" },
  { value: "technical", label: "Technical" },
];

export function CredentialsTab() {
  const qc = useQueryClient();
  const { data: credentials = [], isLoading: cLoading } = useQuery({
    queryKey: cvKey("cv_credentials"),
    queryFn: () => cvList<CvCredential>("cv_credentials", { column: "display_order" }),
  });
  const { data: competencies = [], isLoading: kLoading } = useQuery({
    queryKey: cvKey("cv_competencies"),
    queryFn: () => cvList<CvCompetency>("cv_competencies", { column: "display_order" }),
  });

  const refreshCreds = () => qc.invalidateQueries({ queryKey: cvKey("cv_credentials") });
  const refreshComps = () => qc.invalidateQueries({ queryKey: cvKey("cv_competencies") });

  if (cLoading || kLoading) return <Empty>Loading…</Empty>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold" style={{ color: "#F0F0FF", fontFamily: MONO }}>
            Credentials
          </h2>
          <PrimaryButton
            onClick={async () => {
              try {
                await cvInsert("cv_credentials", {
                  kind: "certification",
                  title: "New credential",
                  status: "earned",
                  display_order: nextOrder(credentials),
                });
                refreshCreds();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Could not add");
              }
            }}
          >
            + New credential
          </PrimaryButton>
        </div>

        {CRED_KINDS.map((k) => {
          const rows = credentials.filter((c) => safeStr(c.kind) === k.value).sort(byOrder);
          return (
            <div key={k.value} className="flex flex-col gap-2">
              <SectionLabel>
                {k.label} ({rows.length})
              </SectionLabel>
              {rows.length === 0 ? (
                <p className="text-[12px]" style={{ color: "#8B8B9E" }}>
                  None yet.
                </p>
              ) : (
                rows.map((c, i) => (
                  <CredentialRow
                    key={c.id}
                    cred={c}
                    index={i}
                    siblings={rows}
                    onChanged={refreshCreds}
                  />
                ))
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold" style={{ color: "#F0F0FF", fontFamily: MONO }}>
            Competencies
          </h2>
          <PrimaryButton
            onClick={async () => {
              try {
                await cvInsert("cv_competencies", {
                  competency_group: "commercial",
                  label: "New competency",
                  tags: [],
                  display_order: nextOrder(competencies),
                });
                refreshComps();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Could not add");
              }
            }}
          >
            + New competency
          </PrimaryButton>
        </div>

        {GROUPS.map((g) => {
          const rows = competencies
            .filter((c) => safeStr(c.competency_group) === g.value)
            .sort(byOrder);
          return (
            <div key={g.value} className="flex flex-col gap-2">
              <SectionLabel>
                {g.label} ({rows.length})
              </SectionLabel>
              {rows.length === 0 ? (
                <p className="text-[12px]" style={{ color: "#8B8B9E" }}>
                  None yet.
                </p>
              ) : (
                rows.map((c, i) => (
                  <CompetencyRow
                    key={c.id}
                    comp={c}
                    index={i}
                    siblings={rows}
                    onChanged={refreshComps}
                  />
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CredentialRow({
  cred,
  index,
  siblings,
  onChanged,
}: {
  cred: CvCredential;
  index: number;
  siblings: CvCredential[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CvCredential>(cred);
  const [saving, setSaving] = useState(false);
  const inProgress = safeStr(cred.status) === "in_progress";

  const ordered = useMemo(() => siblings, [siblings]);

  async function move(dir: -1 | 1) {
    const other = ordered[index + dir];
    if (!other) return;
    try {
      await swapOrder("cv_credentials", cred, other, index, index + dir);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reorder failed");
    }
  }

  async function save() {
    setSaving(true);
    try {
      await cvUpdate("cv_credentials", cred.id, {
        kind: draft.kind,
        title: draft.title,
        org: draft.org,
        years: draft.years,
        detail: draft.detail,
        status: draft.status || "earned",
      });
      setEditing(false);
      onChanged();
      toast.success("Credential saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel style={{ padding: 12 }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold" style={{ color: "#F0F0FF" }}>
              {safeStr(cred.title) || "Untitled"}
            </span>
            <Chip color={inProgress ? "#F59E0B" : "#10B981"}>
              {inProgress ? "In progress" : "Earned"}
            </Chip>
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: "#8B8B9E", fontFamily: MONO }}>
            {[safeStr(cred.org), safeStr(cred.years)].filter(Boolean).join(" · ") || "—"}
          </div>
          {safeStr(cred.detail) && (
            <p className="text-[12px] mt-1" style={{ color: "#C0C0D0" }}>
              {safeStr(cred.detail)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Action onClick={() => move(-1)} disabled={index === 0} title="Move up">
            ↑
          </Action>
          <Action onClick={() => move(1)} disabled={index === ordered.length - 1} title="Move down">
            ↓
          </Action>
          <Action
            color="#00D4FF"
            onClick={() => {
              setDraft(cred);
              setEditing((v) => !v);
            }}
          >
            {editing ? "Close" : "Edit"}
          </Action>
          <Action
            color="#F87171"
            onClick={async () => {
              try {
                await cvDelete("cv_credentials", cred.id);
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <LabeledField label="Title">
            <TextInput
              value={safeStr(draft.title)}
              onChange={(v) => setDraft({ ...draft, title: v })}
            />
          </LabeledField>
          <LabeledField label="Org">
            <TextInput value={safeStr(draft.org)} onChange={(v) => setDraft({ ...draft, org: v })} />
          </LabeledField>
          <LabeledField label="Years">
            <TextInput
              value={safeStr(draft.years)}
              onChange={(v) => setDraft({ ...draft, years: v })}
            />
          </LabeledField>
          <LabeledField label="Kind">
            <SelectInput
              value={safeStr(draft.kind) || "certification"}
              options={[
                { value: "education", label: "education" },
                { value: "program", label: "program" },
                { value: "certification", label: "certification" },
              ]}
              onChange={(v) => setDraft({ ...draft, kind: v })}
            />
          </LabeledField>
          <LabeledField label="Status">
            <SelectInput
              value={safeStr(draft.status) || "earned"}
              options={CRED_STATUS}
              onChange={(v) => setDraft({ ...draft, status: v })}
            />
          </LabeledField>
          <div className="md:col-span-2">
            <LabeledField label="Detail">
              <TextAreaInput
                value={safeStr(draft.detail)}
                rows={2}
                onChange={(v) => setDraft({ ...draft, detail: v })}
              />
            </LabeledField>
          </div>
          <div className="md:col-span-2 flex justify-end gap-2">
            <Action onClick={() => setEditing(false)}>Cancel</Action>
            <PrimaryButton onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </PrimaryButton>
          </div>
        </div>
      )}
    </Panel>
  );
}

function CompetencyRow({
  comp,
  index,
  siblings,
  onChanged,
}: {
  comp: CvCompetency;
  index: number;
  siblings: CvCompetency[];
  onChanged: () => void;
}) {
  const [label, setLabel] = useState(safeStr(comp.label));
  const [dirty, setDirty] = useState(false);

  async function patch(values: Record<string, unknown>) {
    try {
      await cvUpdate("cv_competencies", comp.id, values);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function move(dir: -1 | 1) {
    const other = siblings[index + dir];
    if (!other) return;
    try {
      await swapOrder("cv_competencies", comp, other, index, index + dir);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reorder failed");
    }
  }

  return (
    <Panel style={{ padding: 12 }}>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            setDirty(true);
          }}
          onBlur={() => {
            if (!dirty) return;
            setDirty(false);
            patch({ label });
          }}
          className="bg-transparent outline-none text-[13px] px-2 py-1 flex-1 min-w-[180px]"
          style={{ color: "#F0F0FF", border: "1px solid #1E1E2E", borderRadius: 4 }}
        />
        <SelectInput
          value={safeStr(comp.competency_group) || "commercial"}
          options={[
            { value: "commercial", label: "commercial" },
            { value: "technical", label: "technical" },
          ]}
          onChange={(v) => patch({ competency_group: v })}
        />
        <Action onClick={() => move(-1)} disabled={index === 0} title="Move up">
          ↑
        </Action>
        <Action onClick={() => move(1)} disabled={index === siblings.length - 1} title="Move down">
          ↓
        </Action>
        <Action
          color="#F87171"
          onClick={async () => {
            try {
              await cvDelete("cv_competencies", comp.id);
              onChanged();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Delete failed");
            }
          }}
        >
          Delete
        </Action>
      </div>
      <div className="mt-2">
        <TagEditor tags={safeTags(comp.tags)} onChange={(next) => patch({ tags: next })} />
      </div>
    </Panel>
  );
}
