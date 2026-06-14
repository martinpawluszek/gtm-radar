import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  { value: "build_log", label: "Build log" },
  { value: "gtm_opinion", label: "GTM opinion" },
  { value: "ai_workflow", label: "AI workflow" },
  { value: "founder_operator", label: "Founder operator" },
  { value: "tool_stack", label: "Tool stack" },
];

const CATEGORY_LABEL: Record<Category, string> = {
  build_log: "Build log",
  gtm_opinion: "GTM opinion",
  ai_workflow: "AI workflow",
  founder_operator: "Founder operator",
  tool_stack: "Tool stack",
  reply: "Reply",
};

const STATUS_LABEL: Record<ItemStatus, string> = {
  idea: "Idea",
  drafted: "Drafted",
  posted: "Posted",
  archived: "Archived",
};

const TYPE_LABEL: Record<ItemType, string> = {
  post_idea: "Post idea",
  reply_opportunity: "Reply opportunity",
};

const STATUS_DESCRIPTION: Record<ItemStatus, string> = {
  idea: "Captured but not drafted or posted.",
  drafted: "Draft exists or is in progress, but not counted as published.",
  posted: "Counted as published in weekly stats based on Posted date.",
  archived: "Hidden from active workflow.",
};

// Convert ISO timestamp to value usable by <input type="datetime-local"> in the user's local timezone.
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Convert a datetime-local string back to an ISO string. Empty -> null.
function localInputToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

const DAYS = [
  { v: 1, l: "Monday" },
  { v: 2, l: "Tuesday" },
  { v: 3, l: "Wednesday" },
  { v: 4, l: "Thursday" },
  { v: 5, l: "Friday" },
  { v: 6, l: "Saturday" },
  { v: 7, l: "Sunday" },
];

type TabKey = "ideas" | "replies" | "posted" | "archived" | "settings" | "style";

const TABS: { key: TabKey; label: string; showCount: boolean }[] = [
  { key: "ideas", label: "Ideas", showCount: true },
  { key: "replies", label: "Replies", showCount: true },
  { key: "posted", label: "Posted", showCount: true },
  { key: "archived", label: "Archived", showCount: true },
  { key: "settings", label: "Settings", showCount: false },
  { key: "style", label: "Style Guide", showCount: false },
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

function promptFor(it: Item): string {
  return it.item_type === "reply_opportunity" ? buildCommentPrompt(it) : buildPostPrompt(it);
}

// ---------- Page ----------
function LinkedInPresencePage() {
  const [tab, setTab] = useState<TabKey>("ideas");

  const { data: status } = useQuery({
    queryKey: ["lp-weekly-status"],
    queryFn: fetchWeeklyStatus,
  });

  const { data: allItems = [] } = useQuery({
    queryKey: ["lp-items"],
    queryFn: fetchItems,
  });

  const counts = useMemo(() => {
    const active = (t: ItemType) =>
      allItems.filter(
        (i) => i.item_type === t && i.status !== "posted" && i.status !== "archived",
      ).length;
    return {
      ideas: active("post_idea"),
      replies: active("reply_opportunity"),
      posted: allItems.filter((i) => i.status === "posted").length,
      archived: allItems.filter((i) => i.status === "archived").length,
    };
  }, [allItems]);

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
        className="flex items-center gap-2 px-3 flex-wrap"
        style={{
          background: "#111118",
          border: "1px solid #1E1E2E",
          borderRadius: 6,
          minHeight: 48,
          paddingTop: 6,
          paddingBottom: 6,
        }}
      >
        {TABS.map((t) => {
          const countLabel = t.showCount
            ? ` (${counts[t.key as "ideas" | "replies" | "posted" | "archived"]})`
            : "";
          return (
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
              {countLabel}
            </button>
          );
        })}
      </div>

      {tab === "ideas" && <ItemsTab kind="post_idea" />}
      {tab === "replies" && <ItemsTab kind="reply_opportunity" />}
      {tab === "posted" && <ItemsTab kind="posted" />}
      {tab === "archived" && <ItemsTab kind="archived" />}
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

// ---------- Items Tab (unified) ----------
type TabKind = "post_idea" | "reply_opportunity" | "posted" | "archived";

function ItemsTab({ kind }: { kind: TabKind }) {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["lp-items"],
    queryFn: fetchItems,
  });

  const [creating, setCreating] = useState<null | "post_idea" | "reply_opportunity">(null);
  const [openItemId, setOpenItemId] = useState<string | null>(null);

  const list = useMemo(() => {
    if (kind === "post_idea") {
      return items.filter(
        (i) => i.item_type === "post_idea" && i.status !== "posted" && i.status !== "archived",
      );
    }
    if (kind === "reply_opportunity") {
      return items.filter(
        (i) =>
          i.item_type === "reply_opportunity" &&
          i.status !== "posted" &&
          i.status !== "archived",
      );
    }
    if (kind === "posted") {
      return items
        .filter((i) => i.status === "posted")
        .sort((a, b) => (b.posted_at ?? "").localeCompare(a.posted_at ?? ""));
    }
    return items.filter((i) => i.status === "archived");
  }, [items, kind]);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["lp-items"] });
    qc.invalidateQueries({ queryKey: ["lp-weekly-status"] });
  }

  const openItem = openItemId ? items.find((i) => i.id === openItemId) ?? null : null;

  // Auto-close detail modal if the item disappears (e.g. status change moves it out of view but we still want detail visible)
  useEffect(() => {
    if (openItemId && !items.some((i) => i.id === openItemId)) setOpenItemId(null);
  }, [items, openItemId]);

  const header = (() => {
    if (kind === "post_idea") return { count: `${list.length} active idea${list.length === 1 ? "" : "s"}`, cta: "+ New idea", create: "post_idea" as const };
    if (kind === "reply_opportunity") return { count: `${list.length} active reply opportunit${list.length === 1 ? "y" : "ies"}`, cta: "+ New reply", create: "reply_opportunity" as const };
    if (kind === "posted") return { count: `${list.length} posted`, cta: null, create: null };
    return { count: `${list.length} archived`, cta: null, create: null };
  })();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div className="text-sm" style={{ color: "#8B8B9E" }}>
          {header.count}
        </div>
        {header.cta && (
          <button
            onClick={() => setCreating(header.create!)}
            className="px-3 py-1.5 text-[13px] font-medium"
            style={{
              color: "#00D4FF",
              background: "rgba(0,212,255,0.1)",
              border: "1px solid rgba(0,212,255,0.25)",
              borderRadius: 4,
              fontFamily: MONO,
            }}
          >
            {header.cta}
          </button>
        )}
      </div>

      {isLoading ? (
        <Panel><p className="text-sm" style={{color:"#8B8B9E"}}>Loading…</p></Panel>
      ) : list.length === 0 ? (
        <Panel><p className="text-sm" style={{color:"#8B8B9E"}}>Nothing here yet.</p></Panel>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {list.map((it) => (
            <ItemCard
              key={it.id}
              item={it}
              onOpen={() => setOpenItemId(it.id)}
            />
          ))}
        </div>
      )}

      {creating === "post_idea" && (
        <Modal title="New LinkedIn idea" onClose={() => setCreating(null)}>
          <PostIdeaForm
            initial={null}
            onClose={() => setCreating(null)}
            onSaved={() => { refresh(); setCreating(null); }}
          />
        </Modal>
      )}
      {creating === "reply_opportunity" && (
        <Modal title="New reply opportunity" onClose={() => setCreating(null)}>
          <ReplyForm
            initial={null}
            onClose={() => setCreating(null)}
            onSaved={() => { refresh(); setCreating(null); }}
          />
        </Modal>
      )}

      {openItem && (
        <DetailModal
          item={openItem}
          onClose={() => setOpenItemId(null)}
          onChanged={refresh}
        />
      )}
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
      <NumberField label="Weekly posts goal" value={current.weekly_posts_goal} onChange={(v) => setForm((f) => ({ ...f, weekly_posts_goal: v }))} />
      <NumberField label="Weekly comments goal" value={current.weekly_comments_goal} onChange={(v) => setForm((f) => ({ ...f, weekly_comments_goal: v }))} />
      <NumberField label="Weekly ideas goal" value={current.weekly_ideas_goal} onChange={(v) => setForm((f) => ({ ...f, weekly_ideas_goal: v }))} />
      <SelectField
        label="Reminder day"
        value={String(current.reminder_day)}
        options={DAYS.map((d) => ({ value: String(d.v), label: d.l }))}
        onChange={(v) => setForm((f) => ({ ...f, reminder_day: Number(v) }))}
      />
      <SelectField
        label="Reminder threshold"
        value={current.reminder_threshold}
        options={[{ value: "behind", label: "behind" }, { value: "zero_activity", label: "zero_activity" }]}
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
function ItemCard({ item, onOpen }: { item: Item; onOpen: () => void }) {
  const isReply = item.item_type === "reply_opportunity";
  const title = item.improved_title || item.raw_input.slice(0, 120);

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="cursor-pointer transition-colors hover:bg-[#15151F]"
      style={{
        background: "#111118",
        border: "1px solid #1E1E2E",
        borderRadius: 6,
        padding: 16,
      }}
    >
      <div className="flex items-center gap-2 mb-2 text-[11px]" style={{ fontFamily: MONO }}>
        {item.category && <Tag color="#00D4FF">{CATEGORY_LABEL[item.category]}</Tag>}
        <Tag color={statusColor(item.status)}>{STATUS_LABEL[item.status]}</Tag>
        <span style={{ color: "#8B8B9E", marginLeft: "auto" }}>
          {item.status === "posted" && item.posted_at
            ? new Date(item.posted_at).toLocaleDateString()
            : new Date(item.created_at).toLocaleDateString()}
        </span>
      </div>

      {isReply && (item.target_person || item.target_company) && (
        <div className="text-[12px] mb-1" style={{ color: "#8B8B9E", fontFamily: MONO }}>
          {item.target_person}{item.target_person && item.target_company ? " · " : ""}{item.target_company}
        </div>
      )}

      <div className="text-sm font-medium" style={{ color: "#F0F0FF" }}>
        {isReply ? item.raw_input.slice(0, 240) : title}
        {isReply && item.raw_input.length > 240 && <span style={{ color: "#8B8B9E" }}>…</span>}
      </div>

      {item.final_text && (
        <pre className="text-[12px] whitespace-pre-wrap mt-2 font-sans" style={{ color: "#8B8B9E" }}>
          {item.final_text.slice(0, 200)}{item.final_text.length > 200 ? "…" : ""}
        </pre>
      )}
    </div>
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

// ---------- Detail Modal ----------
function DetailModal({
  item,
  onClose,
  onChanged,
}: {
  item: Item;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState(false);

  async function update(patch: Partial<Item>, successMessage: string) {
    if (busy) return;
    setBusy(true);
    const { error } = await gtmSupabase
      .from("linkedin_presence_items" as never)
      .update({ ...patch, updated_at: new Date().toISOString() } as never)
      .eq("id", item.id);
    setBusy(false);
    if (error) { toast.error(error.message || "Update failed"); return; }
    toast.success(successMessage);
    onChanged();
  }

  const title = item.improved_title || item.raw_input.slice(0, 140);

  if (editing) {
    return (
      <Modal title={item.item_type === "reply_opportunity" ? "Edit reply opportunity" : "Edit idea"} onClose={() => setEditing(false)}>
        {item.item_type === "reply_opportunity" ? (
          <ReplyForm
            initial={item}
            onClose={() => setEditing(false)}
            onSaved={() => { onChanged(); setEditing(false); }}
          />
        ) : (
          <PostIdeaForm
            initial={item}
            onClose={() => setEditing(false)}
            onSaved={() => { onChanged(); setEditing(false); }}
          />
        )}
      </Modal>
    );
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex flex-col gap-3 text-sm" style={{ color: "#F0F0FF" }}>
        <div className="flex items-center gap-2 text-[11px]" style={{ fontFamily: MONO }}>
          <Tag color="#00D4FF">{TYPE_LABEL[item.item_type]}</Tag>
          {item.category && <Tag color="#8B8B9E">{CATEGORY_LABEL[item.category]}</Tag>}
          <Tag color={statusColor(item.status)}>{STATUS_LABEL[item.status]}</Tag>
        </div>

        {item.item_type === "reply_opportunity" ? (
          <>
            <Field label="LinkedIn post text">
              <pre className="whitespace-pre-wrap font-sans text-sm" style={{ color: "#F0F0FF" }}>{item.raw_input}</pre>
            </Field>
            {item.source_url && (
              <Field label="Post URL">
                <a href={item.source_url} target="_blank" rel="noreferrer" style={{ color: "#00D4FF" }}>{item.source_url}</a>
              </Field>
            )}
            {item.target_person && <Field label="Person"><div>{item.target_person}</div></Field>}
            {item.target_company && <Field label="Company"><div>{item.target_company}</div></Field>}
            {item.final_text && (
              <Field label="Final comment text">
                <pre className="whitespace-pre-wrap font-sans text-sm" style={{ color: "#F0F0FF" }}>{item.final_text}</pre>
              </Field>
            )}
          </>
        ) : (
          <>
            <Field label="Rough idea">
              <pre className="whitespace-pre-wrap font-sans text-sm" style={{ color: "#F0F0FF" }}>{item.raw_input}</pre>
            </Field>
            {item.improved_title && <Field label="Better title"><div>{item.improved_title}</div></Field>}
            {item.angle && <Field label="Angle"><div>{item.angle}</div></Field>}
            {item.final_text && (
              <Field label="Final post text">
                <pre className="whitespace-pre-wrap font-sans text-sm" style={{ color: "#F0F0FF" }}>{item.final_text}</pre>
              </Field>
            )}
          </>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Created"><div style={{ color: "#8B8B9E" }}>{new Date(item.created_at).toLocaleString()}</div></Field>
          <Field label="Posted">
            <div style={{ color: "#8B8B9E" }}>
              {item.posted_at ? new Date(item.posted_at).toLocaleString() : "—"}
            </div>
          </Field>
          <Field label="Last updated">
            <div style={{ color: "#8B8B9E" }}>
              {item.updated_at ? new Date(item.updated_at).toLocaleString() : "—"}
            </div>
          </Field>
        </div>

        <div
          className="text-[12px]"
          style={{
            color: "#8B8B9E",
            background: "#0D0D14",
            border: "1px solid #1E1E2E",
            borderRadius: 4,
            padding: "8px 10px",
          }}
        >
          <span style={{ color: statusColor(item.status), fontFamily: MONO, marginRight: 6 }}>
            {STATUS_LABEL[item.status]}:
          </span>
          {STATUS_DESCRIPTION[item.status]}
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t" style={{ borderColor: "#1E1E2E" }}>
          <Action onClick={() => setEditing(true)} disabled={busy}>Edit</Action>
          <Action onClick={() => copyText(promptFor(item))} color="#00D4FF">Copy prompt</Action>
          {item.status !== "drafted" && (
            <Action
              onClick={() => update({ status: "drafted" }, "Marked as drafted")}
              disabled={busy}
            >
              {item.status === "posted" ? "Move back to drafted" : "Mark as drafted"}
            </Action>
          )}
          {item.status !== "posted" && (
            <Action
              onClick={() =>
                update(
                  { status: "posted", posted_at: item.posted_at ?? new Date().toISOString() },
                  "Marked as posted",
                )
              }
              color="#10B981"
              disabled={busy}
            >
              Mark as posted
            </Action>
          )}
          {item.status === "archived" ? (
            <Action
              onClick={() => update({ status: "idea" }, "Restored")}
              color="#10B981"
              disabled={busy}
            >
              Restore
            </Action>
          ) : (
            <Action onClick={() => setConfirmArchive(true)} color="#8B8B9E" disabled={busy}>
              Archive
            </Action>
          )}
          <div style={{ marginLeft: "auto" }}>
            <Action onClick={onClose}>Close</Action>
          </div>
        </div>
      </div>

      {confirmArchive && (
        <ConfirmDialog
          title="Archive this item?"
          confirmLabel="Archive"
          onCancel={() => setConfirmArchive(false)}
          onConfirm={async () => {
            setConfirmArchive(false);
            await update({ status: "archived" }, "Archived");
          }}
        />
      )}
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase" style={{ color: "#8B8B9E", fontFamily: MONO }}>{label}</span>
      {children}
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
  const [final_text, setFinalText] = useState(initial?.final_text ?? "");
  const [createdAt, setCreatedAt] = useState<string>(isoToLocalInput(initial?.created_at));
  const [postedAt, setPostedAt] = useState<string>(isoToLocalInput(initial?.posted_at));
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!raw_input.trim()) { toast.error("Rough idea is required"); return; }
    setSaving(true);
    const payload: Record<string, unknown> = {
      item_type: "post_idea",
      raw_input: raw_input.trim(),
      improved_title: improved_title.trim() || null,
      angle: angle.trim() || null,
      category: category || null,
      final_text: final_text.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (initial) {
      const newCreated = localInputToIso(createdAt);
      if (newCreated) payload.created_at = newCreated;
      payload.posted_at = localInputToIso(postedAt);
    } else {
      payload.status = "idea";
    }
    const { error } = initial
      ? await gtmSupabase.from("linkedin_presence_items" as never).update(payload as never).eq("id", initial.id)
      : await gtmSupabase.from("linkedin_presence_items" as never).insert(payload as never);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    onSaved();
  }

  return (
    <FormShell
      onClose={onClose}
      onSave={save}
      saving={saving}
      saveLabel={initial ? "Save" : "Save idea"}
      subtitle={initial ? undefined : "Capture the rough thought. It does not need to be polished yet."}
    >
      <TextAreaField
        label="Rough idea *"
        value={raw_input}
        onChange={setRaw}
        rows={4}
        placeholder="Write the rough thought. Example: I moved location scoring from frontend logic into backend rules."
      />
      <TextField
        label="Better title"
        value={improved_title}
        onChange={setTitle}
        placeholder="Optional. Example: The source of truth matters more than the prompt."
      />
      <TextAreaField
        label="Angle"
        value={angle}
        onChange={setAngle}
        rows={2}
        placeholder="Optional. What makes this worth posting?"
      />
      <SelectField
        label="Category"
        value={category}
        options={[{ value: "", label: "—" }, ...POST_CATEGORIES.map(c => ({ value: c.value, label: c.label }))]}
        onChange={(v) => setCategory(v as Category | "")}
      />
      {initial && (
        <>
          <TextAreaField
            label="Final post text"
            value={final_text}
            onChange={setFinalText}
            rows={6}
            placeholder="Paste the final version of the post here once it is ready."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DateTimeField
              label="Created date"
              value={createdAt}
              onChange={setCreatedAt}
              hint="Used for backfilling when you capture an idea late."
            />
            <DateTimeField
              label="Posted date"
              value={postedAt}
              onChange={setPostedAt}
              hint="Leave empty if not posted yet. Used when backfilling a post you already published."
            />
          </div>
        </>
      )}
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
  const [createdAt, setCreatedAt] = useState<string>(isoToLocalInput(initial?.created_at));
  const [postedAt, setPostedAt] = useState<string>(isoToLocalInput(initial?.posted_at));
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!raw_input.trim()) { toast.error("LinkedIn post text is required"); return; }
    setSaving(true);
    const payload: Record<string, unknown> = {
      item_type: "reply_opportunity",
      raw_input: raw_input.trim(),
      source_url: source_url.trim() || null,
      target_person: target_person.trim() || null,
      target_company: target_company.trim() || null,
      category: "reply",
      updated_at: new Date().toISOString(),
    };
    if (initial) {
      const newCreated = localInputToIso(createdAt);
      if (newCreated) payload.created_at = newCreated;
      payload.posted_at = localInputToIso(postedAt);
    } else {
      payload.status = "idea";
    }
    const { error } = initial
      ? await gtmSupabase.from("linkedin_presence_items" as never).update(payload as never).eq("id", initial.id)
      : await gtmSupabase.from("linkedin_presence_items" as never).insert(payload as never);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    onSaved();
  }

  return (
    <FormShell
      onClose={onClose}
      onSave={save}
      saving={saving}
      saveLabel={initial ? "Save" : "Save reply"}
      subtitle={initial ? undefined : "Paste a LinkedIn post you may want to answer. The app will give you a clean prompt to generate a sharp comment outside the app."}
    >
      <TextAreaField
        label="LinkedIn post text *"
        value={raw_input}
        onChange={setRaw}
        rows={5}
        placeholder="Paste the post text here. It can be rough. You do not need to clean it."
      />
      <TextField
        label="Post URL"
        value={source_url}
        onChange={setUrl}
        placeholder="Optional. Paste the LinkedIn post URL."
      />
      <TextField
        label="Person"
        value={target_person}
        onChange={setPerson}
        placeholder="Optional. Who posted it?"
      />
      <TextField
        label="Company"
        value={target_company}
        onChange={setCompany}
        placeholder="Optional. Their company."
      />
      {initial && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <DateTimeField
            label="Created date"
            value={createdAt}
            onChange={setCreatedAt}
            hint="Used for backfilling when you capture an item late."
          />
          <DateTimeField
            label="Posted date"
            value={postedAt}
            onChange={setPostedAt}
            hint="Leave empty if not posted yet. Used when backfilling a comment you already published."
          />
        </div>
      )}
    </FormShell>
  );
}

// ---------- Modal + primitives ----------
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0D0D14",
          border: "1px solid #1E1E2E",
          borderRadius: 8,
          padding: 20,
          width: "100%",
          maxWidth: 640,
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold" style={{ color: "#F0F0FF", fontFamily: MONO }}>{title}</div>
          <button
            onClick={onClose}
            className="text-[11px]"
            style={{ color: "#8B8B9E", fontFamily: MONO }}
          >
            close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ConfirmDialog({
  title, confirmLabel, onCancel, onConfirm,
}: { title: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0D0D14",
          border: "1px solid #1E1E2E",
          borderRadius: 8,
          padding: 20,
          width: "100%",
          maxWidth: 380,
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        <div className="text-sm font-semibold mb-4" style={{ color: "#F0F0FF", fontFamily: MONO }}>{title}</div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-[13px]"
            style={{ color: "#8B8B9E", border: "1px solid #1E1E2E", borderRadius: 4, fontFamily: MONO }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-[13px] font-medium"
            style={{
              color: "#F59E0B",
              background: "rgba(245,158,11,0.1)",
              border: "1px solid rgba(245,158,11,0.3)",
              borderRadius: 4,
              fontFamily: MONO,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormShell({
  onClose, onSave, saving, saveLabel = "Save", subtitle, children,
}: { onClose: () => void; onSave: () => void; saving: boolean; saveLabel?: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      {subtitle && (
        <p className="text-[12px]" style={{ color: "#8B8B9E" }}>
          {subtitle}
        </p>
      )}
      {children}
      <div className="flex gap-2 pt-1 justify-end">
        <button
          onClick={onClose}
          className="px-4 py-1.5 text-[13px]"
          style={{ color: "#8B8B9E", border: "1px solid #1E1E2E", borderRadius: 4, fontFamily: MONO }}
        >Cancel</button>
        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-1.5 text-[13px] font-medium disabled:opacity-50"
          style={{
            color: "#00D4FF",
            background: "rgba(0,212,255,0.1)",
            border: "1px solid rgba(0,212,255,0.25)",
            borderRadius: 4,
            fontFamily: MONO,
          }}
        >{saving ? "Saving…" : saveLabel}</button>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase" style={{ color: "#8B8B9E", fontFamily: MONO }}>{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent outline-none text-sm px-2 py-1.5"
        style={{ color: "#F0F0FF", border: "1px solid #1E1E2E", borderRadius: 4, fontFamily: MONO }}
      />
    </label>
  );
}

function TextAreaField({ label, value, onChange, rows = 3, placeholder }: { label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase" style={{ color: "#8B8B9E", fontFamily: MONO }}>{label}</span>
      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent outline-none text-sm px-2 py-1.5"
        style={{ color: "#F0F0FF", border: "1px solid #1E1E2E", borderRadius: 4, fontFamily: MONO }}
      />
    </label>
  );
}

function DateTimeField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase" style={{ color: "#8B8B9E", fontFamily: MONO }}>{label}</span>
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent outline-none text-sm px-2 py-1.5"
        style={{ color: "#F0F0FF", border: "1px solid #1E1E2E", borderRadius: 4, fontFamily: MONO, colorScheme: "dark" }}
      />
      {hint && (
        <span className="text-[11px]" style={{ color: "#8B8B9E" }}>{hint}</span>
      )}
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
