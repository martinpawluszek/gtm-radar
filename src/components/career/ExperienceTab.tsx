import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  byOrder,
  cvDelete,
  cvInsert,
  cvKey,
  cvList,
  cvUpdate,
  formatPeriod,
  nextOrder,
  safeStr,
  safeTags,
  swapOrder,
  type CvBullet,
  type CvExperience,
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
  Toggle,
} from "./ui";

const SENSITIVITY_OPTIONS = [
  { value: "cv_ok", label: "cv_ok" },
  { value: "cv_only", label: "cv_only" },
  { value: "excluded", label: "excluded" },
];

function sensitivityColor(s: string): string {
  if (s === "excluded") return "#F87171";
  if (s === "cv_only") return "#F59E0B";
  return "#10B981";
}

export function ExperienceTab() {
  const qc = useQueryClient();

  const { data: experiences = [], isLoading: expLoading } = useQuery({
    queryKey: cvKey("cv_experiences"),
    queryFn: () => cvList<CvExperience>("cv_experiences", { column: "display_order" }),
  });
  const { data: bullets = [], isLoading: bulletsLoading } = useQuery({
    queryKey: cvKey("cv_bullets"),
    queryFn: () => cvList<CvBullet>("cv_bullets", { column: "display_order" }),
  });

  const refreshExp = () => qc.invalidateQueries({ queryKey: cvKey("cv_experiences") });
  const refreshBullets = () => qc.invalidateQueries({ queryKey: cvKey("cv_bullets") });

  const ordered = useMemo(() => [...experiences].sort(byOrder), [experiences]);
  const crossCutting = useMemo(
    () => bullets.filter((b) => !b.experience_id).sort(byOrder),
    [bullets],
  );

  const addExperience = useMutation({
    mutationFn: () =>
      cvInsert<CvExperience>("cv_experiences", {
        company: "New employer",
        role_title: "Role title",
        display_order: nextOrder(experiences),
      }),
    onSuccess: () => {
      refreshExp();
      toast.success("Experience added.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const move = useMutation({
    mutationFn: async ({ index, dir }: { index: number; dir: -1 | 1 }) => {
      const a = ordered[index];
      const b = ordered[index + dir];
      if (!a || !b) return;
      await swapOrder("cv_experiences", a, b, index, index + dir);
    },
    onSuccess: refreshExp,
    onError: (e: Error) => toast.error(e.message),
  });

  if (expLoading || bulletsLoading) return <Empty>Loading…</Empty>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm" style={{ color: "#8B8B9E" }}>
          {ordered.length} role{ordered.length === 1 ? "" : "s"} · {bullets.length} bullet
          {bullets.length === 1 ? "" : "s"}
        </p>
        <PrimaryButton onClick={() => addExperience.mutate()} disabled={addExperience.isPending}>
          + New experience
        </PrimaryButton>
      </div>

      <CrossCuttingGroup
        bullets={crossCutting}
        allBullets={bullets}
        onChanged={refreshBullets}
      />

      {ordered.length === 0 ? (
        <Empty>No experience rows yet.</Empty>
      ) : (
        ordered.map((exp, i) => (
          <ExperienceCard
            key={exp.id}
            exp={exp}
            index={i}
            total={ordered.length}
            bullets={bullets.filter((b) => b.experience_id === exp.id).sort(byOrder)}
            allBullets={bullets}
            onMove={(dir) => move.mutate({ index: i, dir })}
            onChanged={refreshExp}
            onBulletsChanged={refreshBullets}
          />
        ))
      )}
    </div>
  );
}

function CrossCuttingGroup({
  bullets,
  allBullets,
  onChanged,
}: {
  bullets: CvBullet[];
  allBullets: CvBullet[];
  onChanged: () => void;
}) {
  return (
    <Panel style={{ borderColor: "rgba(0,212,255,0.2)" }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="text-sm font-semibold" style={{ color: "#00D4FF", fontFamily: MONO }}>
            Cross-cutting
          </div>
          <p className="text-[12px] mt-0.5" style={{ color: "#8B8B9E" }}>
            Bullets not tied to a single employer.
          </p>
        </div>
        <AddBulletButton experienceId={null} siblings={allBullets} onChanged={onChanged} />
      </div>

      <BulletList bullets={bullets} allBullets={allBullets} onChanged={onChanged} />
    </Panel>
  );
}

function ExperienceCard({
  exp,
  index,
  total,
  bullets,
  allBullets,
  onMove,
  onChanged,
  onBulletsChanged,
}: {
  exp: CvExperience;
  index: number;
  total: number;
  bullets: CvBullet[];
  allBullets: CvBullet[];
  onMove: (dir: -1 | 1) => void;
  onChanged: () => void;
  onBulletsChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CvExperience>(exp);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function startEdit() {
    setDraft(exp);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      await cvUpdate("cv_experiences", exp.id, {
        company: draft.company,
        company_blurb: draft.company_blurb,
        role_title: draft.role_title,
        location: draft.location,
        start_date: draft.start_date || null,
        end_date: draft.end_date || null,
        is_current: !!draft.is_current,
        always_include: !!draft.always_include,
      });
      setEditing(false);
      onChanged();
      toast.success("Experience saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    try {
      await cvDelete("cv_experiences", exp.id);
      onChanged();
      onBulletsChanged();
      toast.success("Experience deleted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <Panel>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm font-semibold" style={{ color: "#F0F0FF", fontFamily: MONO }}>
            {safeStr(exp.role_title) || "Untitled role"}
            <span style={{ color: "#8B8B9E" }}> · {safeStr(exp.company) || "—"}</span>
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: "#8B8B9E", fontFamily: MONO }}>
            {formatPeriod(exp)}
            {exp.location ? ` · ${safeStr(exp.location)}` : ""}
          </div>
          {safeStr(exp.company_blurb) && (
            <p className="text-[12px] mt-1.5" style={{ color: "#C0C0D0" }}>
              {safeStr(exp.company_blurb)}
            </p>
          )}
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {exp.is_current && <Chip color="#10B981">Current</Chip>}
            {exp.always_include && <Chip color="#00D4FF">Always include</Chip>}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <Action onClick={() => onMove(-1)} disabled={index === 0} title="Move up">
            ↑
          </Action>
          <Action onClick={() => onMove(1)} disabled={index === total - 1} title="Move down">
            ↓
          </Action>
          <Action onClick={() => (editing ? setEditing(false) : startEdit())} color="#00D4FF">
            {editing ? "Close" : "Edit"}
          </Action>
          <Action onClick={() => setConfirmDelete(true)} color="#F87171">
            Delete
          </Action>
        </div>
      </div>

      {confirmDelete && (
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-[12px]" style={{ color: "#F59E0B" }}>
            Delete this experience and unlink its bullets?
          </span>
          <Action onClick={() => setConfirmDelete(false)}>Cancel</Action>
          <Action onClick={remove} color="#F87171">
            Confirm delete
          </Action>
        </div>
      )}

      {editing && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <LabeledField label="Company">
            <TextInput
              value={safeStr(draft.company)}
              onChange={(v) => setDraft({ ...draft, company: v })}
            />
          </LabeledField>
          <LabeledField label="Role title">
            <TextInput
              value={safeStr(draft.role_title)}
              onChange={(v) => setDraft({ ...draft, role_title: v })}
            />
          </LabeledField>
          <LabeledField label="Location">
            <TextInput
              value={safeStr(draft.location)}
              onChange={(v) => setDraft({ ...draft, location: v })}
            />
          </LabeledField>
          <LabeledField label="Start date">
            <TextInput
              value={safeStr(draft.start_date)}
              placeholder="2021-04 or Apr 2021"
              onChange={(v) => setDraft({ ...draft, start_date: v })}
            />
          </LabeledField>
          <LabeledField label="End date">
            <TextInput
              value={safeStr(draft.end_date)}
              placeholder="leave blank if current"
              onChange={(v) => setDraft({ ...draft, end_date: v })}
            />
          </LabeledField>
          <div className="flex items-end gap-2">
            <Toggle
              checked={!!draft.is_current}
              onChange={(v) => setDraft({ ...draft, is_current: v })}
              label="Current"
            />
            <Toggle
              checked={!!draft.always_include}
              onChange={(v) => setDraft({ ...draft, always_include: v })}
              label="Always include"
            />
          </div>
          <div className="md:col-span-2">
            <LabeledField label="Company blurb">
              <TextAreaInput
                value={safeStr(draft.company_blurb)}
                onChange={(v) => setDraft({ ...draft, company_blurb: v })}
                rows={2}
              />
            </LabeledField>
          </div>
          <div className="md:col-span-2 flex justify-end gap-2">
            <Action onClick={() => setEditing(false)}>Cancel</Action>
            <PrimaryButton onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save experience"}
            </PrimaryButton>
          </div>
        </div>
      )}

      <div className="mt-4 pt-3" style={{ borderTop: "1px solid #1E1E2E" }}>
        <div className="flex items-center justify-between gap-2">
          <SectionLabel>Bullets ({bullets.length})</SectionLabel>
          <AddBulletButton
            experienceId={exp.id}
            siblings={allBullets}
            onChanged={onBulletsChanged}
          />
        </div>
        <BulletList bullets={bullets} allBullets={allBullets} onChanged={onBulletsChanged} />
      </div>
    </Panel>
  );
}

function AddBulletButton({
  experienceId,
  siblings,
  onChanged,
}: {
  experienceId: string | null;
  siblings: CvBullet[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Action
      color="#00D4FF"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await cvInsert("cv_bullets", {
            experience_id: experienceId,
            text: "",
            tags: [],
            is_core: false,
            sensitivity: "cv_ok",
            display_order: nextOrder(
              siblings.filter((b) => b.experience_id === experienceId),
            ),
          });
          onChanged();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Could not add bullet");
        } finally {
          setBusy(false);
        }
      }}
    >
      + Bullet
    </Action>
  );
}

function BulletList({
  bullets,
  allBullets,
  onChanged,
}: {
  bullets: CvBullet[];
  allBullets: CvBullet[];
  onChanged: () => void;
}) {
  if (bullets.length === 0) {
    return (
      <p className="text-[12px] mt-2" style={{ color: "#8B8B9E" }}>
        No bullets yet.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2 mt-2">
      {bullets.map((b, i) => (
        <BulletRow
          key={b.id}
          bullet={b}
          index={i}
          total={bullets.length}
          siblings={bullets}
          allBullets={allBullets}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}

function BulletRow({
  bullet,
  index,
  total,
  siblings,
  onChanged,
}: {
  bullet: CvBullet;
  index: number;
  total: number;
  siblings: CvBullet[];
  allBullets: CvBullet[];
  onChanged: () => void;
}) {
  const [text, setText] = useState(safeStr(bullet.text));
  const [dirty, setDirty] = useState(false);
  const tags = safeTags(bullet.tags);
  const sensitivity = safeStr(bullet.sensitivity) || "cv_ok";

  async function patch(values: Record<string, unknown>) {
    try {
      await cvUpdate("cv_bullets", bullet.id, values);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function move(dir: -1 | 1) {
    const other = siblings[index + dir];
    if (!other) return;
    try {
      await swapOrder("cv_bullets", bullet, other, index, index + dir);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reorder failed");
    }
  }

  return (
    <div
      className="flex flex-col gap-2 p-2.5"
      style={{ background: "#0D0D14", border: "1px solid #1E1E2E", borderRadius: 4 }}
    >
      <textarea
        value={text}
        rows={2}
        placeholder="Bullet text"
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
        onBlur={() => {
          if (!dirty) return;
          setDirty(false);
          patch({ text });
        }}
        className="bg-transparent outline-none text-sm w-full"
        style={{ color: "#F0F0FF", border: "none", resize: "vertical" }}
      />

      <TagEditor tags={tags} onChange={(next) => patch({ tags: next })} />

      <div className="flex items-center gap-1.5 flex-wrap">
        <Toggle
          checked={!!bullet.is_core}
          onChange={(v) => patch({ is_core: v })}
          label="Core"
        />
        <span
          className="px-2 py-0.5 text-[11px]"
          style={{
            color: sensitivityColor(sensitivity),
            border: `1px solid ${sensitivityColor(sensitivity)}44`,
            borderRadius: 999,
            fontFamily: MONO,
          }}
        >
          {sensitivity}
        </span>
        <SelectInput
          value={sensitivity}
          options={SENSITIVITY_OPTIONS}
          onChange={(v) => patch({ sensitivity: v })}
        />
        <div className="ml-auto flex items-center gap-1.5">
          <Action onClick={() => move(-1)} disabled={index === 0} title="Move up">
            ↑
          </Action>
          <Action onClick={() => move(1)} disabled={index === total - 1} title="Move down">
            ↓
          </Action>
          <Action
            color="#F87171"
            onClick={async () => {
              try {
                await cvDelete("cv_bullets", bullet.id);
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
    </div>
  );
}
