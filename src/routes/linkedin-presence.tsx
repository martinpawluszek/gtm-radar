import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { gtmSupabase } from "@/lib/gtmSupabase";

const MONO = "var(--font-mono)";

export const Route = createFileRoute("/linkedin-presence")({
  head: () => ({ meta: [{ title: "LinkedIn Presence — GTM Intelligence" }] }),
  component: LinkedInPresencePage,
});

// ---------- Types ----------
type ItemStatus = "idea" | "drafted" | "posted" | "archived";
type ItemType = "post_idea" | "reply_opportunity";
type Category =
  | "build_log"
  | "gtm_opinion"
  | "ai_workflow"
  | "founder_operator"
  | "tool_stack"
  | "reply";

type Item = {
  id: string;
  item_type: ItemType;
  raw_input: string;
  improved_title: string | null;
  angle: string | null;
  category: Category | null;
  status: ItemStatus;
  source_url: string | null;
  target_person: string | null;
  target_company: string | null;
  final_text: string | null;
  posted_at: string | null;
  created_at: string;
  updated_at: string | null;
};

type Goal = {
  id: string;
  weekly_posts_goal: number;
  weekly_comments_goal: number;
  weekly_ideas_goal: number;
  reminder_day: number;
  reminder_threshold: "behind" | "zero_activity";
  is_active: boolean;
};

type WeeklyStatus = {
  goal_id: string;
  weekly_posts_goal: number;
  weekly_comments_goal: number;
  weekly_ideas_goal: number;
  reminder_day: number;
  reminder_threshold: "behind" | "zero_activity";
  posts_published: number;
  comments_posted: number;
  ideas_saved: number;
  posts_behind: boolean;
  comments_behind: boolean;
  ideas_behind: boolean;
  is_behind: boolean;
  notification_title: string;
  notification_body: string;
};

const POST_CATEGORIES: { value: Category; label: string }[] = [
  { value: "build_log", label: "build_log" },
  { value: "gtm_opinion", label: "gtm_opinion" },
  { value: "ai_workflow", label: "ai_workflow" },
  { value: "founder_operator", label: "founder_operator" },
  { value: "tool_stack", label: "tool_stack" },
];

const DAYS = [
  { v: 1, l: "Monday" },
  { v: 2, l: "Tuesday" },
  { v: 3, l: "Wednesday" },
  { v: 4, l: "Thursday" },
  { v: 5, l: "Friday" },
  { v: 6, l: "Saturday" },
  { v: 7, l: "Sunday" },
];

type TabKey = "ideas" | "replies" | "posted" | "settings" | "style";

const TABS: { key: TabKey; label: string }[] = [
  { key: "ideas", label: "Ideas" },
  { key: "replies", label: "Replies" },
  { key: "posted", label: "Posted" },
  { key: "settings", label: "Settings" },
  { key: "style", label: "Style Guide" },
];

// ---------- Data ----------
async function fetchItems(): Promise<Item[]> {
  const { data, error } = await gtmSupabase
    .from("linkedin_presence_items" as never)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Item[];
}

async function fetchWeeklyStatus(): Promise<WeeklyStatus | null> {
  const { data, error } = await gtmSupabase
    .from("linkedin_presence_weekly_status" as never)
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as WeeklyStatus | null;
}

async function fetchActiveGoal(): Promise<Goal | null> {
  const { data, error } = await gtmSupabase
    .from("linkedin_presence_goals" as never)
    .select("*")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as Goal | null;
}

// ---------- Prompts ----------
function buildPostPrompt(it: Item): string {
  return `Write a LinkedIn post in my voice.

Context:
I am a founder and CRO building practical GTM systems with Lovable, Supabase, n8n and Claude.
I want to sound sharp, useful and understated.
Not like a LinkedIn influencer.

Topic:
${it.raw_input}

Title or improved angle:
${it.improved_title ?? ""}

Angle:
${it.angle ?? ""}

Rules:

Few words, right words

No em dashes

No emojis unless truly necessary

No hype

No fake vulnerability

No "5 lessons"

No "game changer"

No "I'm excited to share"

No engagement bait

No obvious AI phrasing

Keep it under 180 words

Make it sound like I wrote it myself`;
}

function buildCommentPrompt(it: Item): string {
  return `Help me write a LinkedIn comment.

Original post:
${it.raw_input}

My context:
I am a founder/CRO working on GTM, AI workflows, B2B SaaS, sales systems and internal tools.

Style:
Cool, concise, thoughtful.
Not cringe.
Not trying too hard.
No em dashes.
No influencer language.
No emojis unless needed.

Give me 3 comment options:

Agree and add something useful

Slightly challenge the point

Add a practical operator example

Each comment should be under 45 words.`;
}

async function copyText(text: string, successMessage = "Prompt copied.") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Copy failed";
    toast.error(msg);
  }
}

// ---------- Page ----------
function LinkedInPresencePage() {
  const [tab, setTab] = useState<TabKey>("ideas");

  const { data: status } = useQuery({
    queryKey: ["lp-weekly-status"],
    queryFn: fetchWeeklyStatus,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1
          className="text-lg font-semibold tracking-tight"
          style={{ color: "#F0F0FF", fontFamily: MONO }}
        >
          LinkedIn Presence
        </h1>
        <p className="text-sm mt-1" style={{ color: "#8B8B9E" }}>
          Stay consistent without grinding. Capture ideas, draft prompts, track weekly goals.
        </p>
      </div>

      <WeeklyStatusSection status={status ?? null} />

      <div
        className="flex items-center gap-2 px-3"
        style={{
          background: "#111118",
          border: "1px solid #1E1E2E",
          borderRadius: 6,
          height: 48,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-3 py-1 text-[13px] font-medium transition-colors"
            style={{
              color: tab === t.key ? "#00D4FF" : "#8B8B9E",
              background: tab === t.key ? "rgba(0,212,255,0.1)" : "transparent",
              borderRadius: 4,
              border:
                tab === t.key ? "1px solid rgba(0,212,255,0.25)" : "1px solid transparent",
              fontFamily: MONO,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "ideas" && <IdeasTab />}
      {tab === "replies" && <RepliesTab />}
      {tab === "posted" && <PostedTab />}
      {tab === "settings" && <SettingsTab />}
      {tab === "style" && <StyleGuideTab />}
    </div>
  );
}

// ---------- Weekly Status ----------
function WeeklyStatusSection({ status }: { status: WeeklyStatus | null }) {
  if (!status) {
    return (
      <Panel>
        <p className="text-sm" style={{ color: "#8B8B9E" }}>
          No weekly status yet.
        </p>
      </Panel>
    );
  }

  const isBehind = status.is_behind;
  const accent = isBehind ? "#F59E0B" : "#10B981";
  const bg = isBehind ? "rgba(245,158,11,0.06)" : "rgba(16,185,129,0.06)";
  const border = isBehind ? "rgba(245,158,11,0.3)" : "rgba(16,185,129,0.3)";

  return (
    <div className="flex flex-col gap-4">
      <div
        style={{
          background: bg,
          border: `1px solid ${border}`,
          borderRadius: 6,
          padding: 20,
        }}
      >
        <div
          className="text-sm font-semibold"
          style={{ color: accent, fontFamily: MONO, marginBottom: 8 }}
        >
          {status.notification_title}
        </div>
        <pre
          className="text-sm whitespace-pre-wrap font-sans"
          style={{ color: "#F0F0FF", margin: 0 }}
        >
          {status.notification_body}
        </pre>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <ProgressCard
          label="Posts published"
          current={status.posts_published}
          goal={status.weekly_posts_goal}
          behind={status.posts_behind}
        />
        <ProgressCard
          label="Comments posted"
          current={status.comments_posted}
          goal={status.weekly_comments_goal}
          behind={status.comments_behind}
        />
        <ProgressCard
          label="Ideas saved"
          current={status.ideas_saved}
          goal={status.weekly_ideas_goal}
          behind={status.ideas_behind}
        />
      </div>
    </div>
  );
}

function ProgressCard({
  label,
  current,
  goal,
  behind,
}: {
  label: string;
  current: number;
  goal: number;
  behind: boolean;
}) {
  const pct = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;
  const accent = behind ? "#F59E0B" : "#10B981";
  return (
    <div
      style={{
        background: "#111118",
        border: "1px solid #1E1E2E",
        borderRadius: 6,
        padding: 16,
      }}
    >
      <div className="text-[11px] uppercase" style={{ color: "#8B8B9E", fontFamily: MONO }}>
        {label}
      </div>
      <div
        className="text-lg font-semibold mt-1"
        style={{ color: "#F0F0FF", fontFamily: MONO }}
      >
        {current}
        <span style={{ color: "#8B8B9E" }}> / {goal}</span>
      </div>
      <div
        style={{
          marginTop: 10,
          height: 4,
          background: "#1E1E2E",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div style={{ width: `${pct}%`, height: "100%", background: accent }} />
      </div>
    </div>
  );
}

// ---------- Ideas Tab ----------
function IdeasTab() {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["lp-items"],
    queryFn: fetchItems,
  });
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);

  const list = useMemo(
    () =>
      items.filter(
        (i) =>
          i.item_type === "post_idea" &&
          i.status !== "posted" &&
          i.status !== "archived",
      ),
    [items],
  );

  function refresh() {
    qc.invalidateQueries({ queryKey: ["lp-items"] });
    qc.invalidateQueries({ queryKey: ["lp-weekly-status"] });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div className="text-sm" style={{ color: "#8B8B9E" }}>
          {list.length} active idea{list.length === 1 ? "" : "s"}
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="px-3 py-1.5 text-[13px] font-medium"
          style={{
            color: "#00D4FF",
            background: "rgba(0,212,255,0.1)",
            border: "1px solid rgba(0,212,255,0.25)",
            borderRadius: 4,
            fontFamily: MONO,
          }}
        >
          + New idea
        </button>
      </div>

      {(showForm || editing) && (
        <PostIdeaForm
          initial={editing}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={() => {
            refresh();
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}

      {isLoading ? (
        <Panel><p className="text-sm" style={{color:"#8B8B9E"}}>Loading…</p></Panel>
      ) : list.length === 0 ? (
        <Panel><p className="text-sm" style={{color:"#8B8B9E"}}>No ideas yet.</p></Panel>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {list.map((it) => (
            <ItemCard
              key={it.id}
              item={it}
              onEdit={() => setEditing(it)}
              onChanged={refresh}
              copyAction={{ successMessage: "Prompt copied.", prompt: () => buildPostPrompt(it) }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Replies Tab ----------
function RepliesTab() {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["lp-items"],
    queryFn: fetchItems,
  });
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);

  const list = useMemo(
    () =>
      items.filter(
        (i) =>
          i.item_type === "reply_opportunity" &&
          i.status !== "posted" &&
          i.status !== "archived",
      ),
    [items],
  );

  function refresh() {
    qc.invalidateQueries({ queryKey: ["lp-items"] });
    qc.invalidateQueries({ queryKey: ["lp-weekly-status"] });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div className="text-sm" style={{ color: "#8B8B9E" }}>
          {list.length} active reply opportunit{list.length === 1 ? "y" : "ies"}
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="px-3 py-1.5 text-[13px] font-medium"
          style={{
            color: "#00D4FF",
            background: "rgba(0,212,255,0.1)",
            border: "1px solid rgba(0,212,255,0.25)",
            borderRadius: 4,
            fontFamily: MONO,
          }}
        >
          + New reply opportunity
        </button>
      </div>

      {(showForm || editing) && (
        <ReplyForm
          initial={editing}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={() => {
            refresh();
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}

      {isLoading ? (
        <Panel><p className="text-sm" style={{color:"#8B8B9E"}}>Loading…</p></Panel>
      ) : list.length === 0 ? (
        <Panel><p className="text-sm" style={{color:"#8B8B9E"}}>No reply opportunities yet.</p></Panel>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {list.map((it) => (
            <ItemCard
              key={it.id}
              item={it}
              variant="reply"
              onEdit={() => setEditing(it)}
              onChanged={refresh}
              copyAction={{ successMessage: "Prompt copied.", prompt: () => buildCommentPrompt(it) }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Posted Tab ----------
function PostedTab() {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["lp-items"],
    queryFn: fetchItems,
  });

  const list = useMemo(
    () =>
      items
        .filter((i) => i.status === "posted")
        .sort((a, b) => (b.posted_at ?? "").localeCompare(a.posted_at ?? "")),
    [items],
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");

  async function saveFinal(id: string) {
    const { error } = await gtmSupabase
      .from("linkedin_presence_items" as never)
      .update({ final_text: draftText, updated_at: new Date().toISOString() } as never)
      .eq("id", id);
    if (error) { toast.error("Save failed"); return; }
    toast.success("Saved");
    setEditingId(null);
    qc.invalidateQueries({ queryKey: ["lp-items"] });
  }

  async function moveBackToDrafted(id: string) {
    const { error } = await gtmSupabase
      .from("linkedin_presence_items" as never)
      .update({ status: "drafted", posted_at: null, updated_at: new Date().toISOString() } as never)
      .eq("id", id);
    if (error) { toast.error("Update failed"); return; }
    toast.success("Moved back to drafted");
    qc.invalidateQueries({ queryKey: ["lp-items"] });
    qc.invalidateQueries({ queryKey: ["lp-weekly-status"] });
  }

  if (isLoading) return <Panel><p className="text-sm" style={{color:"#8B8B9E"}}>Loading…</p></Panel>;
  if (list.length === 0) return <Panel><p className="text-sm" style={{color:"#8B8B9E"}}>Nothing posted yet.</p></Panel>;

  return (
    <div className="flex flex-col gap-3">
      {list.map((it) => {
        const editing = editingId === it.id;
        const title = it.improved_title || it.raw_input.slice(0, 120);
        return (
          <div
            key={it.id}
            style={{
              background: "#111118",
              border: "1px solid #1E1E2E",
              borderRadius: 6,
              padding: 16,
            }}
          >
            <div className="flex items-center gap-2 mb-2 text-[11px]" style={{ fontFamily: MONO }}>
              <Tag color="#00D4FF">{it.item_type}</Tag>
              {it.category && <Tag color="#8B8B9E">{it.category}</Tag>}
              <span style={{ color: "#8B8B9E", marginLeft: "auto" }}>
                {it.posted_at ? new Date(it.posted_at).toLocaleString() : ""}
              </span>
            </div>
            <div className="text-sm font-medium" style={{ color: "#F0F0FF" }}>{title}</div>

            {editing ? (
              <div className="mt-3 flex flex-col gap-2">
                <textarea
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  rows={6}
                  className="w-full text-sm bg-transparent outline-none p-2"
                  style={{ color: "#F0F0FF", border: "1px solid #1E1E2E", borderRadius: 4, fontFamily: MONO }}
                />
                <div className="flex gap-2">
                  <button onClick={() => saveFinal(it.id)} className="px-3 py-1 text-[12px]"
                    style={{ color: "#10B981", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 4, fontFamily: MONO }}>
                    Save
                  </button>
                  <button onClick={() => setEditingId(null)} className="px-3 py-1 text-[12px]"
                    style={{ color: "#8B8B9E", border: "1px solid #1E1E2E", borderRadius: 4, fontFamily: MONO }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {it.final_text && (
                  <pre className="text-sm whitespace-pre-wrap mt-2 font-sans" style={{ color: "#C0C0D0" }}>
                    {it.final_text}
                  </pre>
                )}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => { setEditingId(it.id); setDraftText(it.final_text ?? ""); }}
                    className="px-3 py-1 text-[12px]"
                    style={{ color: "#8B8B9E", border: "1px solid #1E1E2E", borderRadius: 4, fontFamily: MONO }}
                  >
                    Edit final text
                  </button>
                  <button
                    onClick={() => moveBackToDrafted(it.id)}
                    className="px-3 py-1 text-[12px]"
                    style={{ color: "#F59E0B", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 4, fontFamily: MONO }}
                  >
                    Move back to drafted
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- Settings Tab ----------
function SettingsTab() {
  const qc = useQueryClient();
  const { data: goal, isLoading } = useQuery({
    queryKey: ["lp-active-goal"],
    queryFn: fetchActiveGoal,
  });

  const [form, setForm] = useState<Partial<Goal>>({});
  const current = { ...goal, ...form } as Goal;

  const save = useMutation({
    mutationFn: async () => {
      if (!goal?.id) throw new Error("No active goal row");
      const { error } = await gtmSupabase
        .from("linkedin_presence_goals" as never)
        .update({
          weekly_posts_goal: current.weekly_posts_goal,
          weekly_comments_goal: current.weekly_comments_goal,
          weekly_ideas_goal: current.weekly_ideas_goal,
          reminder_day: current.reminder_day,
          reminder_threshold: current.reminder_threshold,
        } as never)
        .eq("id", goal.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Settings saved");
      setForm({});
      qc.invalidateQueries({ queryKey: ["lp-active-goal"] });
      qc.invalidateQueries({ queryKey: ["lp-weekly-status"] });
    },
    onError: (e: Error) => toast.error(e.message || "Save failed"),
  });

  if (isLoading) return <Panel><p className="text-sm" style={{color:"#8B8B9E"}}>Loading…</p></Panel>;
  if (!goal) return <Panel><p className="text-sm" style={{color:"#8B8B9E"}}>No active goal row found.</p></Panel>;

  return (
    <div
      className="flex flex-col gap-4"
      style={{
        background: "#111118",
        border: "1px solid #1E1E2E",
        borderRadius: 6,
        padding: 20,
        maxWidth: 560,
      }}
    >
      <NumberField
        label="Weekly posts goal"
        value={current.weekly_posts_goal}
        onChange={(v) => setForm((f) => ({ ...f, weekly_posts_goal: v }))}
      />
      <NumberField
        label="Weekly comments goal"
        value={current.weekly_comments_goal}
        onChange={(v) => setForm((f) => ({ ...f, weekly_comments_goal: v }))}
      />
      <NumberField
        label="Weekly ideas goal"
        value={current.weekly_ideas_goal}
        onChange={(v) => setForm((f) => ({ ...f, weekly_ideas_goal: v }))}
      />
      <SelectField
        label="Reminder day"
        value={String(current.reminder_day)}
        options={DAYS.map((d) => ({ value: String(d.v), label: d.l }))}
        onChange={(v) => setForm((f) => ({ ...f, reminder_day: Number(v) }))}
      />
      <SelectField
        label="Reminder threshold"
        value={current.reminder_threshold}
        options={[
          { value: "behind", label: "behind" },
          { value: "zero_activity", label: "zero_activity" },
        ]}
        onChange={(v) => setForm((f) => ({ ...f, reminder_threshold: v as Goal["reminder_threshold"] }))}
      />
      <div className="flex gap-2 pt-2">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="px-4 py-1.5 text-[13px] font-medium"
          style={{
            color: "#00D4FF",
            background: "rgba(0,212,255,0.1)",
            border: "1px solid rgba(0,212,255,0.25)",
            borderRadius: 4,
            fontFamily: MONO,
          }}
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ---------- Style Guide Tab ----------
function StyleGuideTab() {
  return (
    <div
      className="flex flex-col gap-5"
      style={{
        background: "#111118",
        border: "1px solid #1E1E2E",
        borderRadius: 6,
        padding: 24,
        color: "#C0C0D0",
        maxWidth: 760,
        lineHeight: 1.6,
      }}
    >
      <Section title="Voice">
        <Bullets items={["Short", "Specific", "Calm", "Operator-like", "Slightly dry", "No forced inspiration"]} />
      </Section>
      <Section title="Avoid">
        <Bullets items={[
          "Em dashes",
          "\"Game changer\"",
          "\"Excited to share\"",
          "\"Here are 5 lessons\"",
          "\"This changed how I think about...\"",
          "\"Most people don't realize...\"",
          "\"Hot take\"",
          "Too many emojis",
          "Fake humility",
          "Overexplaining",
        ]} />
      </Section>
      <Section title="Good post shape">
        <pre className="whitespace-pre-wrap text-sm font-sans" style={{ color: "#F0F0FF" }}>
{`Observation.
Specific example.
Why it matters.
Small closing thought.`}
        </pre>
      </Section>
      <Section title="Example">
        <pre className="whitespace-pre-wrap text-sm font-sans" style={{ color: "#F0F0FF" }}>
{`Most GTM teams do not need more dashboards.

They need better decision surfaces.

A dashboard tells you what happened.
A decision surface tells you what to do next.

That difference matters more once AI enters the workflow.`}
        </pre>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[12px] uppercase mb-2" style={{ color: "#00D4FF", fontFamily: MONO }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-5 text-sm" style={{ color: "#F0F0FF" }}>
      {items.map((i) => <li key={i}>{i}</li>)}
    </ul>
  );
}

// ---------- ItemCard ----------
function ItemCard({
  item,
  onEdit,
  onChanged,
  copyAction,
  variant,
}: {
  item: Item;
  onEdit: () => void;
  onChanged: () => void;
  copyAction: { successMessage: string; prompt: () => string };
  variant?: "reply";
}) {
  const [busy, setBusy] = useState(false);

  async function updateStatus(patch: Partial<Item>, successMessage: string) {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await gtmSupabase
        .from("linkedin_presence_items" as never)
        .update({ ...patch, updated_at: new Date().toISOString() } as never)
        .eq("id", item.id);
      if (error) {
        toast.error(error.message || "Update failed");
        return;
      }
      toast.success(successMessage);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  const title = item.improved_title || item.raw_input.slice(0, 120);

  return (
    <div
      style={{
        background: "#111118",
        border: "1px solid #1E1E2E",
        borderRadius: 6,
        padding: 16,
      }}
    >
      <div className="flex items-center gap-2 mb-2 text-[11px]" style={{ fontFamily: MONO }}>
        {item.category && <Tag color="#00D4FF">{item.category}</Tag>}
        <Tag color={statusColor(item.status)}>{item.status}</Tag>
        <span style={{ color: "#8B8B9E", marginLeft: "auto" }}>
          {new Date(item.created_at).toLocaleDateString()}
        </span>
      </div>

      {variant === "reply" && (item.target_person || item.target_company) && (
        <div className="text-[12px] mb-1" style={{ color: "#8B8B9E", fontFamily: MONO }}>
          {item.target_person}{item.target_person && item.target_company ? " · " : ""}{item.target_company}
        </div>
      )}

      <div className="text-sm font-medium" style={{ color: "#F0F0FF" }}>
        {variant === "reply" ? item.raw_input.slice(0, 240) : title}
      </div>
      {variant === "reply" && item.raw_input.length > 240 && (
        <span style={{ color: "#8B8B9E" }}>…</span>
      )}
      {item.source_url && (
        <a href={item.source_url} target="_blank" rel="noreferrer"
          className="text-[12px] mt-1 inline-block" style={{ color: "#00D4FF" }}>
          source ↗
        </a>
      )}

      <div className="flex flex-wrap gap-1.5 mt-3">
        <Action onClick={onEdit} disabled={busy}>Edit</Action>
        <Action
          onClick={() => updateStatus({ status: "drafted" }, "Marked as drafted")}
          disabled={busy}
        >
          Mark as drafted
        </Action>
        <Action
          onClick={() =>
            updateStatus(
              { status: "posted", posted_at: new Date().toISOString() },
              "Marked as posted",
            )
          }
          color="#10B981"
          disabled={busy}
        >
          Mark as posted
        </Action>
        <Action
          onClick={() => copyText(copyAction.prompt(), copyAction.successMessage)}
          color="#00D4FF"
        >
          Copy prompt
        </Action>
        <Action
          onClick={() => updateStatus({ status: "archived" }, "Archived")}
          color="#8B8B9E"
          disabled={busy}
        >
          Archive
        </Action>
      </div>
    </div>
  );
}

function Action({ children, onClick, color = "#C0C0D0", disabled = false }: { children: ReactNode; onClick: () => void; color?: string; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50"
      style={{
        color,
        background: "transparent",
        border: "1px solid #1E1E2E",
        borderRadius: 4,
        fontFamily: MONO,
      }}
    >
      {children}
    </button>
  );
}

function Tag({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span
      className="px-1.5 py-0.5 text-[10px] font-medium"
      style={{
        color,
        background: `${color}15`,
        border: `1px solid ${color}30`,
        borderRadius: 3,
        fontFamily: MONO,
      }}
    >
      {children}
    </span>
  );
}

function statusColor(s: ItemStatus): string {
  switch (s) {
    case "idea": return "#8B8B9E";
    case "drafted": return "#F59E0B";
    case "posted": return "#10B981";
    case "archived": return "#6B7280";
  }
}

// ---------- Forms ----------
function PostIdeaForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: Item | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [raw_input, setRaw] = useState(initial?.raw_input ?? "");
  const [improved_title, setTitle] = useState(initial?.improved_title ?? "");
  const [angle, setAngle] = useState(initial?.angle ?? "");
  const [category, setCategory] = useState<Category | "">((initial?.category as Category) ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!raw_input.trim()) { toast.error("raw_input is required"); return; }
    setSaving(true);
    const payload = {
      item_type: "post_idea",
      raw_input: raw_input.trim(),
      improved_title: improved_title.trim() || null,
      angle: angle.trim() || null,
      category: category || null,
      status: initial?.status ?? "idea",
      updated_at: new Date().toISOString(),
    };
    const { error } = initial
      ? await gtmSupabase.from("linkedin_presence_items" as never).update(payload as never).eq("id", initial.id)
      : await gtmSupabase.from("linkedin_presence_items" as never).insert(payload as never);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    onSaved();
  }

  return (
    <FormShell title={initial ? "Edit idea" : "New post idea"} onClose={onClose} onSave={save} saving={saving}>
      <TextAreaField label="raw_input *" value={raw_input} onChange={setRaw} rows={4} />
      <TextField label="improved_title" value={improved_title} onChange={setTitle} />
      <TextField label="angle" value={angle} onChange={setAngle} />
      <SelectField
        label="category"
        value={category}
        options={[{ value: "", label: "—" }, ...POST_CATEGORIES.map(c => ({ value: c.value, label: c.label }))]}
        onChange={(v) => setCategory(v as Category | "")}
      />
    </FormShell>
  );
}

function ReplyForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: Item | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [raw_input, setRaw] = useState(initial?.raw_input ?? "");
  const [source_url, setUrl] = useState(initial?.source_url ?? "");
  const [target_person, setPerson] = useState(initial?.target_person ?? "");
  const [target_company, setCompany] = useState(initial?.target_company ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!raw_input.trim()) { toast.error("raw_input is required"); return; }
    setSaving(true);
    const payload = {
      item_type: "reply_opportunity",
      raw_input: raw_input.trim(),
      source_url: source_url.trim() || null,
      target_person: target_person.trim() || null,
      target_company: target_company.trim() || null,
      category: "reply",
      status: initial?.status ?? "idea",
      updated_at: new Date().toISOString(),
    };
    const { error } = initial
      ? await gtmSupabase.from("linkedin_presence_items" as never).update(payload as never).eq("id", initial.id)
      : await gtmSupabase.from("linkedin_presence_items" as never).insert(payload as never);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    onSaved();
  }

  return (
    <FormShell title={initial ? "Edit reply opportunity" : "New reply opportunity"} onClose={onClose} onSave={save} saving={saving}>
      <TextAreaField label="raw_input * (post text you want to reply to)" value={raw_input} onChange={setRaw} rows={5} />
      <TextField label="source_url" value={source_url} onChange={setUrl} />
      <TextField label="target_person" value={target_person} onChange={setPerson} />
      <TextField label="target_company" value={target_company} onChange={setCompany} />
    </FormShell>
  );
}

// ---------- Form primitives ----------
function FormShell({
  title, onClose, onSave, saving, children,
}: { title: string; onClose: () => void; onSave: () => void; saving: boolean; children: ReactNode }) {
  return (
    <div
      className="flex flex-col gap-3"
      style={{
        background: "#111118",
        border: "1px solid #1E1E2E",
        borderRadius: 6,
        padding: 20,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold" style={{ color: "#F0F0FF", fontFamily: MONO }}>{title}</div>
        <button onClick={onClose} className="text-[11px]" style={{ color: "#8B8B9E", fontFamily: MONO }}>close</button>
      </div>
      {children}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-1.5 text-[13px] font-medium"
          style={{
            color: "#00D4FF",
            background: "rgba(0,212,255,0.1)",
            border: "1px solid rgba(0,212,255,0.25)",
            borderRadius: 4,
            fontFamily: MONO,
          }}
        >{saving ? "Saving…" : "Save"}</button>
        <button
          onClick={onClose}
          className="px-4 py-1.5 text-[13px]"
          style={{ color: "#8B8B9E", border: "1px solid #1E1E2E", borderRadius: 4, fontFamily: MONO }}
        >Cancel</button>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase" style={{ color: "#8B8B9E", fontFamily: MONO }}>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent outline-none text-sm px-2 py-1.5"
        style={{ color: "#F0F0FF", border: "1px solid #1E1E2E", borderRadius: 4, fontFamily: MONO }}
      />
    </label>
  );
}

function TextAreaField({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase" style={{ color: "#8B8B9E", fontFamily: MONO }}>{label}</span>
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent outline-none text-sm px-2 py-1.5"
        style={{ color: "#F0F0FF", border: "1px solid #1E1E2E", borderRadius: 4, fontFamily: MONO }}
      />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase" style={{ color: "#8B8B9E", fontFamily: MONO }}>{label}</span>
      <input
        type="number"
        min={0}
        value={value ?? 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="bg-transparent outline-none text-sm px-2 py-1.5"
        style={{ color: "#F0F0FF", border: "1px solid #1E1E2E", borderRadius: 4, fontFamily: MONO }}
      />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase" style={{ color: "#8B8B9E", fontFamily: MONO }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent outline-none text-sm px-2 py-1.5"
        style={{ color: "#F0F0FF", border: "1px solid #1E1E2E", borderRadius: 4, fontFamily: MONO, background: "#0D0D14" }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ background: "#0D0D14" }}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: "#111118",
        border: "1px solid #1E1E2E",
        borderRadius: 6,
        padding: 20,
      }}
    >
      {children}
    </div>
  );
}
