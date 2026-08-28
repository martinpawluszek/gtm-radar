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
  orderOf,
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
  return "#6E9E88";
}

type CompanyGroup = {
  key: string;
  company: string;
  blurb: string;
  roles: CvExperience[];
  bulletCount: number;
  minOrder: number;
};

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

  const ordered = useMemo(
    () => (Array.isArray(experiences) ? [...experiences] : []).sort(byOrder),
    [experiences],
  );
  const allBullets = useMemo(() => (Array.isArray(bullets) ? bullets : []), [bullets]);
  const crossCutting = useMemo(
    () => allBullets.filter((b) => !b.experience_id).sort(byOrder),
    [allBullets],
  );

  const groups = useMemo<CompanyGroup[]>(() => {
    const map = new Map<string, CompanyGroup>();
    ordered.forEach((exp, i) => {
      const company = safeStr(exp.company) || "Unknown employer";
      const key = company.toLowerCase();
      const existing = map.get(key);
      const count = allBullets.filter((b) => b.experience_id === exp.id).length;
      if (existing) {
        existing.roles.push(exp);
        existing.bulletCount += count;
        existing.minOrder = Math.min(existing.minOrder, orderOf(exp) || i);
        if (!existing.blurb) existing.blurb = safeStr(exp.company_blurb);
      } else {
        map.set(key, {
          key,
          company,
          blurb: safeStr(exp.company_blurb),
          roles: [exp],
          bulletCount: count,
          minOrder: orderOf(exp) || i,
        });
      }
    });
    return [...map.values()].sort((a, b) => a.minOrder - b.minOrder);
  }, [ordered, allBullets]);

  const addExperience = useMutation({
    mutationFn: () =>
      cvInsert<CvExperience>("cv_experiences", {
        company: "New employer",
        role_title: "Role title",
        display_order: nextOrder(ordered),
      }),
    onSuccess: () => {
      refreshExp();
      toast.success("Experience added.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const move = useMutation({
    mutationFn: async ({ id, dir }: { id: string; dir: -1 | 1 }) => {
      const index = ordered.findIndex((e) => e.id === id);
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
          {groups.length} employer{groups.length === 1 ? "" : "s"} · {ordered.length} role
          {ordered.length === 1 ? "" : "s"} · {allBullets.length} bullet
          {allBullets.length === 1 ? "" : "s"}
        </p>
        <PrimaryButton onClick={() => addExperience.mutate()} disabled={addExperience.isPending}>
          + New experience
        </PrimaryButton>
      </div>

      {groups.length === 0 ? (
        <Empty>No experience rows yet.</Empty>
      ) : (
        groups.map((g) => (
          <CompanyBlock
            key={g.key}
            group={g}
            allBullets={allBullets}
            canMove={(id, dir) => {
              const i = ordered.findIndex((e) => e.id === id);
              return i >= 0 && !!ordered[i + dir];
            }}
            onMove={(id, dir) => move.mutate({ id, dir })}
            onChanged={refreshExp}
            onBulletsChanged={refreshBullets}
          />
        ))
      )}

      <CrossCuttingGroup
        bullets={crossCutting}
        allBullets={allBullets}
        onChanged={refreshBullets}
      />
    </div>
  );
}

function CompanyBlock({
  group,
  allBullets,
  canMove,
  onMove,
  onChanged,
  onBulletsChanged,
}: {
  group: CompanyGroup;
  allBullets: CvBullet[];
  canMove: (id: string, dir: -1 | 1) => boolean;
  onMove: (id: string, dir: -1 | 1) => void;
  onChanged: () => void;
  onBulletsChanged: () => void;
}) {
  return (
    <Panel>
      <div className="min-w-0">
        <div className="text-base font-semibold" style={{ color: "#F0F0FF", fontFamily: MONO }}>
          {group.company}
        </div>
        {group.blurb && (
          <p className="text-[12px] mt-1 max-w-3xl" style={{ color: "#8B8B9E" }}>
            {group.blurb}
          </p>
        )}
        <div className="text-[11px] mt-1" style={{ color: "#8B8B9E", fontFamily: MONO }}>
          {group.roles.length} role{group.roles.length === 1 ? "" : "s"} · {group.bulletCount} bullet
          {group.bulletCount === 1 ? "" : "s"}
        </div>
      </div>

      <div className="flex flex-col gap-3 mt-3">
        {group.roles.map((exp) => (
          <RoleRow
            key={exp.id}
            exp={exp}
            bullets={allBullets.filter((b) => b.experience_id === exp.id).sort(byOrder)}
            allBullets={allBullets}
            canMove={canMove}
            onMove={onMove}
            onChanged={onChanged}
            onBulletsChanged={onBulletsChanged}
          />
        ))}
      </div>
    </Panel>
  );
}

function RoleRow({
  exp,
  bullets,
  allBullets,
  canMove,
  onMove,
  onChanged,
  onBulletsChanged,
}: {
  exp: CvExperience;
  bullets: CvBullet[];
  allBullets: CvBullet[];
  canMove: (id: string, dir: -1 | 1) => boolean;
  onMove: (id: string, dir: -1 | 1) => void;
  onChanged: () => void;
  onBulletsChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CvExperience>(exp);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expanded, setExpanded] = useState(false);

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
    <div
      className="p-3"
      style={{ background: "#0D0D14", border: "1px solid #1E1E2E", borderRadius: 4 }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm font-medium" style={{ color: "#F0F0FF", fontFamily: MONO }}>
            {safeStr(exp.role_title) || "Untitled role"}
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: "#8B8B9E", fontFamily: MONO }}>
            {formatPeriod(exp) || "—"}
            {exp.location ? ` · ${safeStr(exp.location)}` : ""}
          </div>
          {(exp.is_current || exp.always_include) && (
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              {exp.is_current && <Chip color="#10B981">Current</Chip>}
              {exp.always_include && <Chip color="#00D4FF">Always include</Chip>}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <Action onClick={() => onMove(exp.id, -1)} disabled={!canMove(exp.id, -1)} title="Move up">
            ↑
          </Action>
          <Action
            onClick={() => onMove(exp.id, 1)}
            disabled={!canMove(exp.id, 1)}
            title="Move down"
          >
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
            Delete this role and unlink its bullets?
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

      <div className="mt-3 pt-2" style={{ borderTop: "1px solid #1E1E2E" }}>
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-[12px] flex items-center gap-1.5"
            style={{ color: "#8B8B9E", fontFamily: MONO, background: "transparent" }}
          >
            <span style={{ display: "inline-block", width: 10 }}>{expanded ? "▾" : "▸"}</span>
            {bullets.length} bullet{bullets.length === 1 ? "" : "s"}
          </button>
          {expanded && (
            <AddBulletButton
              experienceId={exp.id}
              siblings={allBullets}
              onChanged={onBulletsChanged}
            />
          )}
        </div>
        {expanded && (
          <BulletList bullets={bullets} onChanged={onBulletsChanged} />
        )}
      </div>
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
  const [expanded, setExpanded] = useState(false);
  return (
    <Panel style={{ borderColor: "rgba(0,212,255,0.2)" }}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm font-semibold" style={{ color: "#00D4FF", fontFamily: MONO }}>
            Cross-cutting
          </div>
          <p className="text-[12px] mt-0.5" style={{ color: "#8B8B9E" }}>
            Not tied to one employer — pulled in when a JD calls for it.
          </p>
        </div>
        {expanded && (
          <AddBulletButton experienceId={null} siblings={allBullets} onChanged={onChanged} />
        )}
      </div>

      <div className="mt-2">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[12px] flex items-center gap-1.5"
          style={{ color: "#8B8B9E", fontFamily: MONO, background: "transparent" }}
        >
          <span style={{ display: "inline-block", width: 10 }}>{expanded ? "▾" : "▸"}</span>
          {bullets.length} bullet{bullets.length === 1 ? "" : "s"}
        </button>
        {expanded && <BulletList bullets={bullets} onChanged={onChanged} />}
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
            display_order: nextOrder(siblings.filter((b) => b.experience_id === experienceId)),
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

function BulletList({ bullets, onChanged }: { bullets: CvBullet[]; onChanged: () => void }) {
  if (!bullets || bullets.length === 0) {
    return (
      <p className="text-[12px] mt-2" style={{ color: "#8B8B9E" }}>
        No bullets yet.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5 mt-2">
      {bullets.map((b, i) => (
        <BulletRow
          key={b.id}
          bullet={b}
          index={i}
          total={bullets.length}
          siblings={bullets}
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
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(safeStr(bullet.text));
  const [saving, setSaving] = useState(false);
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

  if (!editing) {
    return (
      <div className="flex items-start gap-2 py-1">
        <span style={{ color: "#3A3A4E", fontFamily: MONO }} className="text-[13px] leading-5">
          •
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] leading-5" style={{ color: "#C0C0D0" }}>
            {safeStr(bullet.text) || "(empty bullet)"}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {bullet.is_core && (
              <span className="text-[10px]" style={{ color: "#8B8B9E", fontFamily: MONO }}>
                core
              </span>
            )}
            <Chip color={sensitivityColor(sensitivity)}>{sensitivity}</Chip>
            {tags.length > 0 && (
              <span className="text-[10px]" style={{ color: "#8B8B9E", fontFamily: MONO }}>
                {tags.join(" · ")}
              </span>
            )}
          </div>
        </div>
        <Action
          color="#8B8B9E"
          onClick={() => {
            setText(safeStr(bullet.text));
            setEditing(true);
          }}
        >
          Edit
        </Action>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-2 p-2.5"
      style={{ background: "#111118", border: "1px solid #1E1E2E", borderRadius: 4 }}
    >
      <SectionLabel>Bullet</SectionLabel>
      <TextAreaInput value={text} rows={3} placeholder="Bullet text" onChange={setText} />

      <TagEditor tags={tags} onChange={(next) => patch({ tags: next })} />

      <div className="flex items-center gap-1.5 flex-wrap">
        <Toggle checked={!!bullet.is_core} onChange={(v) => patch({ is_core: v })} label="Core" />
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

      <div className="flex justify-end gap-2">
        <Action onClick={() => setEditing(false)}>Cancel</Action>
        <PrimaryButton
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await patch({ text });
            setSaving(false);
            setEditing(false);
          }}
        >
          {saving ? "Saving…" : "Save bullet"}
        </PrimaryButton>
      </div>
    </div>
  );
}
