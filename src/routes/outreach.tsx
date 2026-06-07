import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  X,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Linkedin,
  Search,
  Sparkles,
  ThumbsUp,
  MessageSquare,
  Send,
  Inbox,
  Phone,
  Copy,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { gtmSupabase } from "@/lib/gtmSupabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { TIER_META, type Tier } from "@/lib/companies";
import { draftOutreachMessage } from "@/lib/outreachAi.functions";

export const Route = createFileRoute("/outreach")({
  head: () => ({ meta: [{ title: "Outreach — GTM Intelligence" }] }),
  component: OutreachPage,
});

// ---------- Types ----------
type Group = "a_cold" | "b_warm";
type ActiveStatus =
  | "invite_sent"
  | "invite_accepted"
  | "engaging"
  | "ready_to_message"
  | "message_sent"
  | "active_conversation"
  | "call_scheduled";
type TerminalStatus =
  | "invite_ignored"
  | "no_response"
  | "asked_to_stop"
  | "recommended_us"
  | "do_not_contact"
  | "dismissed"
  | "suggested";
type AnyStatus = ActiveStatus | TerminalStatus;
type ActivityType =
  | "engagement_like"
  | "engagement_comment"
  | "invite_sent"
  | "message_sent"
  | "response_received"
  | "call_scheduled";

type Target = {
  id: string;
  name: string;
  linkedin_url: string | null;
  current_company_id: string | null;
  role: string | null;
  group_name: Group;
  status: AnyStatus;
  source: string | null;
  tags: string[] | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  ai_rationale?: string | null;
  ai_recommended_group?: Group | null;
  ai_suggested_angle?: string | null;
  hiring_decision_proximity?: number | null;
  warmth_potential?: number | null;
  suggested_at?: string | null;
  invite_sent_at?: string | null;
  invite_accepted_at?: string | null;
  dismissed_reason?: string | null;
};

type Activity = {
  id: string;
  target_id: string;
  activity_type: ActivityType;
  content: string | null;
  linked_post_url: string | null;
  occurred_at: string;
};

type CompanyLite = { id: string; name: string; tier: Tier };

// ---------- Constants ----------
const A_PIPELINE: ActiveStatus[] = [
  "invite_sent",
  "invite_accepted",
  "message_sent",
  "active_conversation",
  "call_scheduled",
];
const B_PIPELINE: ActiveStatus[] = [
  "invite_sent",
  "invite_accepted",
  "engaging",
  "ready_to_message",
  "message_sent",
  "active_conversation",
  "call_scheduled",
];
const TERMINAL_STATES: TerminalStatus[] = [
  "invite_ignored",
  "no_response",
  "asked_to_stop",
  "recommended_us",
  "do_not_contact",
];

const STATUS_LABEL: Record<AnyStatus, string> = {
  suggested: "Suggested",
  invite_sent: "Invite Sent",
  invite_accepted: "Invite Accepted",
  engaging: "Engaging",
  ready_to_message: "Ready to Message",
  message_sent: "Message Sent",
  active_conversation: "Active Conversation",
  call_scheduled: "Call Scheduled",
  invite_ignored: "Invite Ignored",
  no_response: "No Response",
  asked_to_stop: "Asked to Stop",
  recommended_us: "Recommended Us",
  do_not_contact: "Do Not Contact",
  dismissed: "Dismissed",
};

const ACTIVITY_LABEL: Record<ActivityType, string> = {
  engagement_like: "Liked post",
  engagement_comment: "Commented",
  invite_sent: "Invite sent",
  message_sent: "Message sent",
  response_received: "Response received",
  call_scheduled: "Call scheduled",
};

const ACTIVITY_ICON: Record<ActivityType, typeof ThumbsUp> = {
  engagement_like: ThumbsUp,
  engagement_comment: MessageSquare,
  invite_sent: Send,
  message_sent: Send,
  response_received: Inbox,
  call_scheduled: Phone,
};

const MONO = "var(--font-mono)";
const BG = "#0A0A0F";
const CARD = "#111118";
const BORDER = "#1E1E2E";
const PRIMARY = "#00D4FF";
const VIOLET = "#7C3AED";
const SUCCESS = "#10B981";
const SUCCESS_BRIGHT = "#34D399";
const WARNING = "#F59E0B";
const DANGER = "#EF4444";
const TEXT = "#F0F0FF";
const MUTED = "#8B8B9E";

function statusColor(s: AnyStatus): string {
  switch (s) {
    case "suggested":
      return MUTED;
    case "invite_sent":
      return MUTED;
    case "invite_accepted":
      return PRIMARY;
    case "engaging":
    case "message_sent":
    case "ready_to_message":
      return VIOLET;
    case "active_conversation":
      return SUCCESS;
    case "call_scheduled":
      return SUCCESS_BRIGHT;
    case "invite_ignored":
    case "no_response":
    case "asked_to_stop":
    case "dismissed":
      return MUTED;
    case "recommended_us":
      return SUCCESS;
    case "do_not_contact":
      return DANGER;
  }
}

function validNextStatuses(group: Group, current: AnyStatus): AnyStatus[] {
  const pipe = group === "a_cold" ? A_PIPELINE : B_PIPELINE;
  const idx = pipe.indexOf(current as ActiveStatus);
  const forward: AnyStatus[] = idx >= 0 ? pipe.slice(idx + 1) : [...pipe];
  // Terminal states always available (no backwards moves)
  return [...forward, ...TERMINAL_STATES];
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------- Data ----------
async function fetchTargets(): Promise<Target[]> {
  const { data, error } = await gtmSupabase
    .from("outreach_targets" as never)
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Target[];
}

async function fetchAllActivity(): Promise<Activity[]> {
  const { data, error } = await gtmSupabase
    .from("outreach_activity" as never)
    .select("*")
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Activity[];
}

async function fetchCompaniesLite(): Promise<CompanyLite[]> {
  const { data, error } = await gtmSupabase
    .from("companies")
    .select("id,name,tier")
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as CompanyLite[];
}

// ---------- Page ----------
function OutreachPage() {
  const qc = useQueryClient();

  // Auto-invite-ignored: runs once per session before first render of data.
  // Rolls any invite_sent older than 21 days into invite_ignored and logs activity.
  const [autoRan, setAutoRan] = useState(false);
  useEffect(() => {
    if (autoRan) return;
    setAutoRan(true);
    (async () => {
      try {
        const cutoff = new Date(Date.now() - 21 * 86400000).toISOString();
        const { data: stale } = await gtmSupabase
          .from("outreach_targets" as never)
          .select("id")
          .eq("status", "invite_sent")
          .lt("invite_sent_at", cutoff);
        const rows = (stale ?? []) as { id: string }[];
        if (rows.length === 0) return;
        const now = new Date().toISOString();
        for (const r of rows) {
          await gtmSupabase
            .from("outreach_targets" as never)
            .update({ status: "invite_ignored", updated_at: now } as never)
            .eq("id", r.id);
          await gtmSupabase
            .from("outreach_activity" as never)
            .insert({
              target_id: r.id,
              activity_type: "invite_sent",
              content: "Auto-moved to invite_ignored after 21 days without acceptance",
              occurred_at: now,
            } as never);
        }
        qc.invalidateQueries({ queryKey: ["outreach_targets"] });
        qc.invalidateQueries({ queryKey: ["outreach_activity"] });
      } catch {
        // best-effort
      }
    })();
  }, [autoRan, qc]);

  const { data: targets = [], isLoading } = useQuery({
    queryKey: ["outreach_targets"],
    queryFn: fetchTargets,
  });
  const { data: activity = [] } = useQuery({
    queryKey: ["outreach_activity"],
    queryFn: fetchAllActivity,
  });
  const { data: companies = [] } = useQuery({
    queryKey: ["companies-lite"],
    queryFn: fetchCompaniesLite,
  });

  const companyMap = useMemo(() => {
    const m = new Map<string, CompanyLite>();
    companies.forEach((c) => m.set(c.id, c));
    return m;
  }, [companies]);

  const activityByTarget = useMemo(() => {
    const m = new Map<string, Activity[]>();
    for (const a of activity) {
      const arr = m.get(a.target_id) ?? [];
      arr.push(a);
      m.set(a.target_id, arr);
    }
    return m;
  }, [activity]);

  type Tab = "suggested" | "a_cold" | "b_warm";
  const [tab, setTab] = useState<Tab>("a_cold");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [abOpen, setAbOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<AnyStatus | "all">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    try {
      const id = sessionStorage.getItem("dashboard:open:outreach");
      if (id) {
        sessionStorage.removeItem("dashboard:open:outreach");
        setSelectedId(id);
      }
    } catch {}
  }, []);

  const selected = targets.find((t) => t.id === selectedId) ?? null;

  // ---------- Stats ----------
  const stats = useMemo(() => {
    const total = targets.length;
    const aCold = targets.filter((t) => t.group_name === "a_cold").length;
    const bWarm = targets.filter((t) => t.group_name === "b_warm").length;
    const responded = targets.filter(
      (t) => t.status === "active_conversation" || t.status === "call_scheduled",
    ).length;
    const calls = targets.filter((t) => t.status === "call_scheduled").length;
    const responseRate = total > 0 ? Math.round((responded / total) * 100) : 0;
    return { total, aCold, bWarm, responseRate, calls };
  }, [targets]);

  const suggestedTargets = useMemo(
    () => targets.filter((t) => t.status === "suggested"),
    [targets],
  );

  const dismissedTargets = useMemo(
    () => targets.filter((t) => t.status === "dismissed"),
    [targets],
  );
  const dncTargets = useMemo(
    () => targets.filter((t) => t.status === "do_not_contact"),
    [targets],
  );

  // ---------- Active group rows ----------
  const groupTargets = useMemo(
    () =>
      tab === "suggested"
        ? []
        : targets.filter((t) => t.group_name === tab && t.status !== "suggested"),
    [targets, tab],
  );
  const pipeline = tab === "b_warm" ? B_PIPELINE : A_PIPELINE;

  const stageCounts = useMemo(() => {
    const m = new Map<ActiveStatus, number>();
    pipeline.forEach((s) => m.set(s, 0));
    groupTargets.forEach((t) => {
      if ((pipeline as readonly string[]).includes(t.status)) {
        m.set(t.status as ActiveStatus, (m.get(t.status as ActiveStatus) ?? 0) + 1);
      }
    });
    return m;
  }, [groupTargets, pipeline]);

  const filteredRows = useMemo(() => {
    return groupTargets.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [groupTargets, statusFilter, search]);

  // ---------- Mutations ----------
  const moveStatus = useMutation({
    mutationFn: async ({
      target,
      to,
    }: {
      target: Target;
      to: AnyStatus;
    }) => {
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = { status: to, updated_at: now };
      if (to === "invite_sent" && !target.invite_sent_at) patch.invite_sent_at = now;
      if (to === "invite_accepted") patch.invite_accepted_at = now;
      const { error } = await gtmSupabase
        .from("outreach_targets" as never)
        .update(patch as never)
        .eq("id", target.id);
      if (error) throw error;
      const map: Partial<Record<AnyStatus, ActivityType>> = {
        invite_sent: "invite_sent",
        message_sent: "message_sent",
        active_conversation: "response_received",
        call_scheduled: "call_scheduled",
      };
      const at = map[to];
      if (at) {
        await gtmSupabase
          .from("outreach_activity" as never)
          .insert({
            target_id: target.id,
            activity_type: at,
            occurred_at: now,
          } as never);
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["outreach_targets"] });
      qc.invalidateQueries({ queryKey: ["outreach_activity"] });
      toast.success(`Moved to ${STATUS_LABEL[vars.to]}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const logActivity = useMutation({
    mutationFn: async (v: {
      target_id: string;
      activity_type: ActivityType;
      content: string | null;
      linked_post_url: string | null;
      occurred_at: string;
    }) => {
      const { error } = await gtmSupabase.from("outreach_activity" as never).insert(v as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outreach_activity"] });
      toast.success("Activity logged");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateTarget = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Target> }) => {
      const { error } = await gtmSupabase
        .from("outreach_targets" as never)
        .update({ ...patch, updated_at: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["outreach_targets"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-4" style={{ marginTop: -8 }}>
        <div style={{ color: MUTED }}>Loading…</div>
      </div>
    );
  }

  const TABS: Array<{ key: Tab; label: string; badge?: number }> = [
    { key: "suggested", label: "Suggested", badge: suggestedTargets.length },
    { key: "a_cold", label: "Group A: Cold" },
    { key: "b_warm", label: "Group B: Warm" },
  ];

  return (
    <div className="space-y-4 min-w-0" style={{ marginTop: -8 }}>
      {/* Header */}
      <div className="grid items-center gap-3" style={{ gridTemplateColumns: "1fr auto" }}>
        <h2 className="text-xl font-semibold" style={{ color: TEXT, fontFamily: MONO }}>
          Outreach Tracker
        </h2>
        <Button
          onClick={() => setAddOpen(true)}
          variant="outline"
          style={{
            borderColor: "rgba(0,212,255,0.4)",
            color: PRIMARY,
            background: "transparent",
          }}
        >
          <Plus size={14} /> Add Target
        </Button>
      </div>

      {/* Summary stats */}
      <div
        className="flex items-center gap-8 px-5 py-3"
        style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6 }}
      >
        <Stat label="Total" value={stats.total} />
        <Stat label="Group A (Cold)" value={stats.aCold} color={PRIMARY} />
        <Stat label="Group B (Warm)" value={stats.bWarm} color={VIOLET} />
        <Stat label="Response Rate" value={`${stats.responseRate}%`} color={SUCCESS} />
        <Stat label="Calls Scheduled" value={stats.calls} color={PRIMARY} />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b" style={{ borderColor: BORDER }}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                setStatusFilter("all");
              }}
              className="px-4 py-2 text-sm font-medium transition-colors cursor-pointer inline-flex items-center gap-2"
              style={{
                color: active ? PRIMARY : MUTED,
                borderBottom: `2px solid ${active ? PRIMARY : "transparent"}`,
                marginBottom: -1,
              }}
            >
              {t.label}
              {typeof t.badge === "number" && (
                <span
                  className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 text-[10px] font-semibold rounded"
                  style={{
                    background: active ? "rgba(0,212,255,0.18)" : "rgba(255,255,255,0.06)",
                    color: active ? PRIMARY : MUTED,
                    fontFamily: MONO,
                  }}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "suggested" ? (
        <SuggestedTab
          targets={suggestedTargets}
          companies={companyMap}
          onUpdate={(id, patch) => updateTarget.mutate({ id, patch })}
        />
      ) : (
        <>
          {/* Pipeline header */}
          <div
            className="flex items-center gap-6 px-4 py-3 flex-wrap"
            style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6 }}
          >
            {pipeline.map((s) => (
              <div key={s} className="flex items-center gap-2">
                <span
                  className="text-[10px] font-semibold tracking-wider uppercase"
                  style={{ color: MUTED }}
                >
                  {STATUS_LABEL[s]}
                </span>
                <span
                  className="inline-flex items-center justify-center min-w-[24px] h-5 px-1.5 text-xs font-semibold rounded"
                  style={{
                    background: "rgba(0,212,255,0.12)",
                    color: PRIMARY,
                    fontFamily: MONO,
                  }}
                >
                  {stageCounts.get(s) ?? 0}
                </span>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search
                size={14}
                style={{ position: "absolute", left: 10, top: 11, color: MUTED }}
              />
              <Input
                placeholder="Search by name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 w-64"
                style={{ background: CARD, borderColor: BORDER, color: TEXT }}
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  style={{ background: CARD, borderColor: BORDER, color: TEXT }}
                >
                  Status: {statusFilter === "all" ? "All" : STATUS_LABEL[statusFilter]}
                  <ChevronDown size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                style={{ background: CARD, borderColor: BORDER, color: TEXT }}
              >
                <DropdownMenuItem onClick={() => setStatusFilter("all")}>All</DropdownMenuItem>
                {pipeline.map((s) => (
                  <DropdownMenuItem key={s} onClick={() => setStatusFilter(s)}>
                    {STATUS_LABEL[s]}
                  </DropdownMenuItem>
                ))}
                {TERMINAL_STATES.map((s) => (
                  <DropdownMenuItem key={s} onClick={() => setStatusFilter(s)}>
                    {STATUS_LABEL[s]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Table */}
          <div
            style={{
              background: CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            {filteredRows.length === 0 ? (
              <div className="py-16 text-center text-sm" style={{ color: MUTED }}>
                {groupTargets.length === 0
                  ? tab === "a_cold"
                    ? "No cold outreach targets yet. Add a target to start the A/B test."
                    : "No warm outreach targets yet. Add a target to start building rapport."
                  : "No targets match these filters."}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="text-left"
                    style={{
                      color: MUTED,
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Company</th>
                    <th className="px-4 py-2 font-medium">Role</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Last activity</th>
                    <th className="px-4 py-2 font-medium">Tags</th>
                    <th className="px-4 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((t) => {
                    const acts = activityByTarget.get(t.id) ?? [];
                    const last = acts[0]?.occurred_at ?? null;
                    const days = daysSince(last);
                    const dayColor =
                      days === null ? MUTED : days > 14 ? DANGER : days > 7 ? WARNING : TEXT;
                    const co = t.current_company_id ? companyMap.get(t.current_company_id) : null;
                    const engagementCount =
                      t.status === "engaging"
                        ? acts.filter(
                            (a) =>
                              a.activity_type === "engagement_like" ||
                              a.activity_type === "engagement_comment",
                          ).length
                        : 0;
                    return (
                      <tr
                        key={t.id}
                        onClick={() => setSelectedId(t.id)}
                        className="cursor-pointer transition-colors"
                        style={{ borderTop: `1px solid ${BORDER}` }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "rgba(255,255,255,0.02)")
                        }
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span style={{ color: TEXT, fontWeight: 500 }}>{t.name}</span>
                            {t.linkedin_url && (
                              <a
                                href={t.linkedin_url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                style={{ color: MUTED }}
                              >
                                <Linkedin size={13} />
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3" style={{ color: TEXT }}>
                          {co ? (
                            <div className="flex items-center gap-2">
                              <span>{co.name}</span>
                              <TierBadge tier={co.tier} />
                            </div>
                          ) : (
                            <span style={{ color: MUTED }}>—</span>
                          )}
                        </td>
                        <td className="px-4 py-3" style={{ color: MUTED }}>
                          {t.role ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <StatusPill status={t.status} />
                            {engagementCount > 0 && (
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                                style={{
                                  background: "rgba(124,58,237,0.15)",
                                  color: VIOLET,
                                  fontFamily: MONO,
                                }}
                              >
                                {engagementCount} eng
                              </span>
                            )}
                          </div>
                        </td>
                        <td
                          className="px-4 py-3"
                          style={{ color: dayColor, fontFamily: MONO, fontSize: 12 }}
                        >
                          {days === null ? "—" : `${days}d`}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {(t.tags ?? []).slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="text-[10px] px-1.5 py-0.5 rounded"
                                style={{ background: "rgba(255,255,255,0.05)", color: MUTED }}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId(t.id);
                              }}
                              style={{
                                borderColor: "rgba(0,212,255,0.4)",
                                color: PRIMARY,
                                background: "transparent",
                                height: 26,
                              }}
                            >
                              Draft
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId(t.id);
                              }}
                              style={{ color: MUTED, height: 26 }}
                            >
                              Log
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Archived section */}
      <div
        style={{
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <button
          onClick={() => setArchivedOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 cursor-pointer"
          style={{ color: TEXT }}
        >
          <span className="text-sm font-semibold inline-flex items-center gap-2">
            Archived
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
              style={{ background: "rgba(255,255,255,0.06)", color: MUTED, fontFamily: MONO }}
            >
              {dismissedTargets.length + dncTargets.length}
            </span>
          </span>
          {archivedOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        {archivedOpen && (
          <div style={{ borderTop: `1px solid ${BORDER}` }}>
            <ArchivedList
              title="Dismissed"
              rows={dismissedTargets}
              companyMap={companyMap}
              onSelect={setSelectedId}
            />
            <ArchivedList
              title="Do Not Contact"
              rows={dncTargets}
              companyMap={companyMap}
              onSelect={setSelectedId}
            />
          </div>
        )}
      </div>

      {/* A/B Test Results */}
      <div
        style={{
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <button
          onClick={() => setAbOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 cursor-pointer"
          style={{ color: TEXT }}
        >
          <span className="text-sm font-semibold">A/B Test Results</span>
          {abOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        {abOpen && <ABTable targets={targets} activity={activity} />}
      </div>

      {/* Detail panel */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent
          side="right"
          className="overflow-y-auto"
          style={{
            background: BG,
            borderColor: BORDER,
            color: TEXT,
            width: 460,
            maxWidth: "100vw",
          }}
        >
          {selected && (
            <TargetPanel
              target={selected}
              company={
                selected.current_company_id
                  ? companyMap.get(selected.current_company_id) ?? null
                  : null
              }
              companies={companies}
              activity={activityByTarget.get(selected.id) ?? []}
              onMove={(to) => moveStatus.mutate({ target: selected, to })}
              onLog={(v) => logActivity.mutate({ ...v, target_id: selected.id })}
              onPatch={(patch) => updateTarget.mutate({ id: selected.id, patch })}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Add Target modal */}
      <AddTargetModal
        open={addOpen}
        onOpenChange={setAddOpen}
        companies={companies}
        onCreated={() => qc.invalidateQueries({ queryKey: ["outreach_targets"] })}
      />
    </div>
  );
}


// ---------- Small components ----------
function Stat({
  label,
  value,
  color = TEXT,
}: {
  label: string;
  value: number | string;
  color?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wider" style={{ color: MUTED }}>
        {label}
      </span>
      <span className="text-lg font-semibold" style={{ color, fontFamily: MONO }}>
        {value}
      </span>
    </div>
  );
}

function TierBadge({ tier }: { tier: Tier }) {
  const meta = TIER_META[tier];
  return (
    <span
      className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
      style={{
        background: `${meta.color}22`,
        color: meta.color,
        fontFamily: MONO,
      }}
    >
      {meta.short}
    </span>
  );
}

function StatusPill({ status }: { status: AnyStatus }) {
  const c = statusColor(status);
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded"
      style={{ background: `${c}1F`, color: c, fontFamily: MONO }}
    >
      {STATUS_LABEL[status].toUpperCase()}
    </span>
  );
}

// ---------- A/B table ----------
function ABTable({ targets, activity }: { targets: Target[]; activity: Activity[] }) {
  const calc = (group: Group) => {
    const ts = targets.filter((t) => t.group_name === group);
    const ids = new Set(ts.map((t) => t.id));
    const invitesSent = ts.filter(
      (t) =>
        t.status === "invite_sent" ||
        t.status === "invite_accepted" ||
        t.status === "engaging" ||
        t.status === "ready_to_message" ||
        t.status === "message_sent" ||
        t.status === "active_conversation" ||
        t.status === "call_scheduled" ||
        t.status === "invite_ignored" ||
        t.status === "no_response" ||
        t.status === "asked_to_stop" ||
        t.status === "recommended_us",
    ).length;
    const invitesAccepted = ts.filter(
      (t) =>
        t.status === "invite_accepted" ||
        t.status === "engaging" ||
        t.status === "ready_to_message" ||
        t.status === "message_sent" ||
        t.status === "active_conversation" ||
        t.status === "call_scheduled",
    ).length;
    const messages = activity.filter(
      (a) => ids.has(a.target_id) && a.activity_type === "message_sent",
    ).length;
    const responded = ts.filter(
      (t) => t.status === "active_conversation" || t.status === "call_scheduled",
    ).length;
    const calls = ts.filter((t) => t.status === "call_scheduled").length;
    const acceptRate =
      invitesSent > 0 ? Math.round((invitesAccepted / invitesSent) * 100) : 0;
    const rr = ts.length > 0 ? Math.round((responded / ts.length) * 100) : 0;
    const cr = messages > 0 ? Math.round((calls / messages) * 100) : 0;
    return { total: ts.length, invitesSent, invitesAccepted, messages, responded, calls, acceptRate, rr, cr };
  };
  const a = calc("a_cold");
  const b = calc("b_warm");
  const rows: Array<[string, number | string, number | string]> = [
    ["Total targets", a.total, b.total],
    ["Invites sent", a.invitesSent, b.invitesSent],
    ["Invites accepted", a.invitesAccepted, b.invitesAccepted],
    ["Accept rate", `${a.acceptRate}%`, `${b.acceptRate}%`],
    ["Messages sent", a.messages, b.messages],
    ["Active conversations", a.responded, b.responded],
    ["Response rate", `${a.rr}%`, `${b.rr}%`],
    ["Calls scheduled", a.calls, b.calls],
    ["Call conversion rate", `${a.cr}%`, `${b.cr}%`],
  ];

  return (
    <table className="w-full text-sm" style={{ borderTop: `1px solid ${BORDER}` }}>
      <thead>
        <tr style={{ color: MUTED, fontSize: 11, textTransform: "uppercase" }}>
          <th className="px-4 py-2 text-left font-medium">Metric</th>
          <th className="px-4 py-2 text-left font-medium" style={{ color: PRIMARY }}>
            Group A: Cold
          </th>
          <th className="px-4 py-2 text-left font-medium" style={{ color: VIOLET }}>
            Group B: Warm
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, av, bv]) => (
          <tr key={label} style={{ borderTop: `1px solid ${BORDER}` }}>
            <td className="px-4 py-2" style={{ color: TEXT }}>
              {label}
            </td>
            <td className="px-4 py-2" style={{ color: TEXT, fontFamily: MONO }}>
              {av}
            </td>
            <td className="px-4 py-2" style={{ color: TEXT, fontFamily: MONO }}>
              {bv}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------- Detail panel ----------
function TargetPanel({
  target,
  company,
  companies,
  activity,
  onMove,
  onLog,
  onPatch,
}: {
  target: Target;
  company: CompanyLite | null;
  companies: CompanyLite[];
  activity: Activity[];
  onMove: (to: AnyStatus) => void;
  onLog: (v: {
    activity_type: ActivityType;
    content: string | null;
    linked_post_url: string | null;
    occurred_at: string;
  }) => void;
  onPatch: (patch: Partial<Target>) => void;
}) {
  const validNext = validNextStatuses(target.group_name, target.status);


  const [logOpen, setLogOpen] = useState(false);
  const [logType, setLogType] = useState<ActivityType>("engagement_like");
  const [logContent, setLogContent] = useState("");
  const [logUrl, setLogUrl] = useState("");
  const [logDate, setLogDate] = useState(todayISO());

  const [notes, setNotes] = useState(target.notes ?? "");
  const [newTag, setNewTag] = useState("");

  const [draft, setDraft] = useState("");
  const [drafting, setDrafting] = useState(false);
  const draftFn = useServerFn(draftOutreachMessage);

  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState(target.name);
  const [editRole, setEditRole] = useState(target.role ?? "");
  const [editLinkedin, setEditLinkedin] = useState(target.linkedin_url ?? "");
  const [editCompanyId, setEditCompanyId] = useState<string | null>(target.current_company_id);
  const [editCompanySearch, setEditCompanySearch] = useState("");
  const [editCompanyOpen, setEditCompanyOpen] = useState(false);
  const [editSource, setEditSource] = useState(target.source ?? "");

  const editFilteredCompanies = useMemo(
    () =>
      companies
        .filter((c) => c.name.toLowerCase().includes(editCompanySearch.toLowerCase()))
        .slice(0, 8),
    [companies, editCompanySearch],
  );
  const editSelectedCompany = editCompanyId
    ? companies.find((c) => c.id === editCompanyId) ?? null
    : null;

  const enterEdit = () => {
    setEditName(target.name);
    setEditRole(target.role ?? "");
    setEditLinkedin(target.linkedin_url ?? "");
    setEditCompanyId(target.current_company_id);
    setEditCompanySearch("");
    setEditSource(target.source ?? "");
    setEditMode(true);
  };

  const handleSaveEdit = () => {
    const patch: Partial<Target> = {};
    if (editName.trim() !== target.name) patch.name = editName.trim();
    if (editRole.trim() !== (target.role ?? "")) patch.role = editRole.trim() || null;
    if (editLinkedin.trim() !== (target.linkedin_url ?? ""))
      patch.linkedin_url = editLinkedin.trim() || null;
    if (editCompanyId !== target.current_company_id) patch.current_company_id = editCompanyId;
    if (editSource.trim() !== (target.source ?? "")) patch.source = editSource.trim() || null;
    if (Object.keys(patch).length > 0) {
      onPatch(patch);
    }
    setEditMode(false);
  };

  const handleCancelEdit = () => {
    setEditMode(false);
  };

  const buildPrompt = () => {
    const recent = activity
      .slice(0, 3)
      .map(
        (a) =>
          `- ${ACTIVITY_LABEL[a.activity_type]} (${fmtDate(a.occurred_at)})${
            a.content ? `: ${a.content.slice(0, 200)}` : ""
          }`,
      )
      .join("\n");
    const groupLine =
      target.group_name === "a_cold"
        ? "cold outreach, no prior interaction"
        : "warm, Martin has been engaging with their content — reference this naturally";
    return `You are writing a LinkedIn message for Martin Pawluszek. 

Before you write anything, read this: the messages you have been writing are too long, too structured, and sound like cover letters. They list credentials. They follow a formula. Real outreach does not do this. A good outreach message sounds like something a confident person typed in 90 seconds because they had one specific reason to reach out.

WHAT MARTIN DOES NOT WANT:
- Any version of: "My background: [list of things]"
- Any version of: "I cofounded / I grew / I built [resume summary]"
- Opening with "I"
- The phrase "what's next"
- The phrase "actively looking"
- The phrase "caught my attention"
- The phrase "would love to"
- Listing multiple credentials in sequence
- A structured message with a hook, then background, then ask
- Anything that sounds like it was drafted carefully

WHAT MARTIN WANTS:
- One specific hook based on something real in the notes. If notes mention a post they made, use that. If notes mention a hiring signal, reference it briefly. If notes are sparse, skip the hook and be direct about who he is in one sentence.
- Maximum one sentence of Martin's background. Pick the single most relevant thing to this specific person. Not two things. One.
- A low-pressure ask for 15 minutes. That is the only goal of this message.
- Tone: like a peer reaching out to another peer. Not a candidate messaging a gatekeeper. Not a vendor pitching. A person.

MARTIN'S BACKGROUND (do not recite this — use it only to pick one relevant detail):
Cofounder and CRO. Built a B2B SaaS platform from zero to $2M ARR in five years, selling to CTOs across LatAm and the US. Before that: Deputy Director of Sales at EMnify (Berlin IoT SaaS), BD at predict.io (ML company, Berlin). Builds AI tools internally. Multilingual. Now looking at senior GTM and enterprise sales roles at AI and tech companies. Berlin-based.

TARGET PERSON:
Name: ${target.name}
Role: ${target.role ?? "Unknown"} at ${company ? company.name : "Unknown"} (Tier: ${company ? company.tier : "Unknown"})
Martin's notes on this person: ${target.notes || "None"}
Recent activity: ${recent || "None"}

GROUP: ${groupLine}

LENGTH: 50 to 75 words. Hard limit. If you go over, cut. Do not pad to reach 50 either.

OUTPUT: Only the message. No "Here's a draft", no word count, no dashes, no subject line. Just the message text.`;
  };

  const handleDraft = async () => {
    setDrafting(true);
    try {
      const res = await draftFn({ data: { prompt: buildPrompt() } });
      setDraft(res.text);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      toast.error(msg);
    } finally {
      setDrafting(false);
    }
  };

  const handleCopyAndOpen = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
    if (target.linkedin_url) window.open(target.linkedin_url, "_blank");
  };

  const removeTag = (tag: string) => {
    const next = (target.tags ?? []).filter((t) => t !== tag);
    onPatch({ tags: next });
  };
  const addTag = () => {
    const v = newTag.trim();
    if (!v) return;
    const current = target.tags ?? [];
    if (current.includes(v)) return;
    onPatch({ tags: [...current, v] });
    setNewTag("");
  };

  return (
    <div className="space-y-6 pt-4">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          {!editMode ? (
            <h3 className="text-xl font-semibold" style={{ color: TEXT }}>
              {target.name}
            </h3>
          ) : (
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="flex-1 mr-2"
              style={{ background: CARD, borderColor: BORDER, color: TEXT }}
            />
          )}
          {!editMode && (
            <Button
              size="sm"
              variant="ghost"
              onClick={enterEdit}
              style={{ color: MUTED, height: 26 }}
            >
              <Pencil size={12} /> Edit
            </Button>
          )}
        </div>
        {!editMode ? (
          <>
            <div className="flex items-center gap-2 text-sm" style={{ color: MUTED }}>
              <span>{target.role ?? "—"}</span>
              {company && (
                <>
                  <span>·</span>
                  <span style={{ color: TEXT }}>{company.name}</span>
                  <TierBadge tier={company.tier} />
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {target.linkedin_url && (
                <a
                  href={target.linkedin_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs inline-flex items-center gap-1"
                  style={{ color: PRIMARY }}
                >
                  <Linkedin size={12} /> LinkedIn <ExternalLink size={10} />
                </a>
              )}
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded"
                style={{
                  background:
                    target.group_name === "a_cold"
                      ? "rgba(0,212,255,0.15)"
                      : "rgba(124,58,237,0.15)",
                  color: target.group_name === "a_cold" ? PRIMARY : VIOLET,
                  fontFamily: MONO,
                }}
              >
                {target.group_name === "a_cold" ? "A: COLD" : "B: WARM"}
              </span>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <Input
              placeholder="Role / Title"
              value={editRole}
              onChange={(e) => setEditRole(e.target.value)}
              style={{ background: CARD, borderColor: BORDER, color: TEXT }}
            />
            <Input
              placeholder="LinkedIn URL"
              value={editLinkedin}
              onChange={(e) => setEditLinkedin(e.target.value)}
              style={{ background: CARD, borderColor: BORDER, color: TEXT }}
            />
            <div className="relative">
              <Input
                value={editSelectedCompany ? editSelectedCompany.name : editCompanySearch}
                onChange={(e) => {
                  setEditCompanyId(null);
                  setEditCompanySearch(e.target.value);
                  setEditCompanyOpen(true);
                }}
                onFocus={() => setEditCompanyOpen(true)}
                placeholder="Search companies (optional)…"
                style={{ background: CARD, borderColor: BORDER, color: TEXT }}
              />
              {editCompanyOpen && editCompanySearch && !editSelectedCompany && (
                <div
                  className="absolute z-10 w-full mt-1 max-h-60 overflow-auto"
                  style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6 }}
                >
                  {editFilteredCompanies.map((c) => (
                    <button
                      key={c.id}
                      className="w-full text-left px-3 py-2 flex items-center justify-between text-sm cursor-pointer"
                      style={{ color: TEXT }}
                      onClick={() => {
                        setEditCompanyId(c.id);
                        setEditCompanyOpen(false);
                        setEditCompanySearch("");
                      }}
                    >
                      <span>{c.name}</span>
                      <TierBadge tier={c.tier} />
                    </button>
                  ))}
                  {editFilteredCompanies.length === 0 && (
                    <div className="px-3 py-2 text-xs" style={{ color: MUTED }}>
                      No matches
                    </div>
                  )}
                </div>
              )}
              {editSelectedCompany && (
                <button
                  onClick={() => {
                    setEditCompanyId(null);
                    setEditCompanySearch("");
                  }}
                  className="absolute right-2 top-2"
                  style={{ color: MUTED }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <Input
              placeholder="Source"
              value={editSource}
              onChange={(e) => setEditSource(e.target.value)}
              style={{ background: CARD, borderColor: BORDER, color: TEXT }}
            />
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                onClick={handleSaveEdit}
                style={{ background: PRIMARY, color: "#000" }}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCancelEdit}
                style={{ borderColor: BORDER, color: TEXT, background: "transparent" }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Status */}
      <Section title="Status">
        <div className="flex items-center gap-3">
          <StatusPill status={target.status} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                disabled={validNext.length === 0}
                style={{ background: CARD, borderColor: BORDER, color: TEXT }}
              >
                Move to <ChevronDown size={12} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              style={{ background: CARD, borderColor: BORDER, color: TEXT }}
            >
              {validNext.map((s) => {
                const isTerminal = (TERMINAL_STATES as readonly string[]).includes(s);
                return (
                  <DropdownMenuItem
                    key={s}
                    onClick={() => {
                      if (isTerminal) {
                        const ok = window.confirm(
                          `Move to ${STATUS_LABEL[s]}? This cannot be undone.`,
                        );
                        if (!ok) return;
                      }
                      onMove(s);
                    }}
                    style={isTerminal ? { color: MUTED } : undefined}
                  >
                    {STATUS_LABEL[s]}
                  </DropdownMenuItem>
                );
              })}

            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Section>

      {/* Activity Log */}
      <Section
        title="Activity Log"
        right={
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLogOpen((v) => !v)}
            style={{
              borderColor: "rgba(0,212,255,0.4)",
              color: PRIMARY,
              background: "transparent",
              height: 26,
            }}
          >
            <Plus size={12} /> Log
          </Button>
        }
      >
        {logOpen && (
          <div
            className="space-y-2 p-3 mb-3"
            style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6 }}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full justify-between"
                  style={{ background: BG, borderColor: BORDER, color: TEXT }}
                >
                  {ACTIVITY_LABEL[logType]} <ChevronDown size={12} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent style={{ background: CARD, borderColor: BORDER, color: TEXT }}>
                {(Object.keys(ACTIVITY_LABEL) as ActivityType[]).map((k) => (
                  <DropdownMenuItem key={k} onClick={() => setLogType(k)}>
                    {ACTIVITY_LABEL[k]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Textarea
              placeholder="Content (optional)"
              value={logContent}
              onChange={(e) => setLogContent(e.target.value)}
              style={{ background: BG, borderColor: BORDER, color: TEXT }}
              rows={2}
            />
            <Input
              placeholder="Post URL (optional)"
              value={logUrl}
              onChange={(e) => setLogUrl(e.target.value)}
              style={{ background: BG, borderColor: BORDER, color: TEXT }}
            />
            <Input
              type="date"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              style={{ background: BG, borderColor: BORDER, color: TEXT }}
            />
            <Button
              size="sm"
              className="w-full"
              style={{ background: PRIMARY, color: "#000" }}
              onClick={() => {
                onLog({
                  activity_type: logType,
                  content: logContent.trim() || null,
                  linked_post_url: logUrl.trim() || null,
                  occurred_at: new Date(logDate).toISOString(),
                });
                setLogContent("");
                setLogUrl("");
                setLogOpen(false);
              }}
            >
              Save
            </Button>
          </div>
        )}
        {activity.length === 0 ? (
          <div className="text-xs" style={{ color: MUTED }}>
            No activity logged yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {activity.map((a) => {
              const Icon = ACTIVITY_ICON[a.activity_type];
              return (
                <li
                  key={a.id}
                  className="p-2 flex gap-2"
                  style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6 }}
                >
                  <Icon size={14} style={{ color: MUTED, marginTop: 2 }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium" style={{ color: TEXT }}>
                        {ACTIVITY_LABEL[a.activity_type]}
                      </span>
                      <span
                        className="text-[10px]"
                        style={{ color: MUTED, fontFamily: MONO }}
                      >
                        {fmtDate(a.occurred_at)}
                      </span>
                    </div>
                    {a.content && (
                      <div className="text-xs mt-1" style={{ color: MUTED }}>
                        {a.content}
                      </div>
                    )}
                    {a.linked_post_url && (
                      <a
                        href={a.linked_post_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] inline-flex items-center gap-1 mt-1"
                        style={{ color: PRIMARY }}
                      >
                        View post <ExternalLink size={9} />
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* Draft message */}
      <Section title="Draft Message">
        <Button
          size="sm"
          onClick={handleDraft}
          disabled={drafting}
          style={{ background: PRIMARY, color: "#000" }}
        >
          <Sparkles size={12} /> {drafting ? "Drafting…" : "Draft with Claude"}
        </Button>
        {draft && (
          <div className="space-y-2 mt-3">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              style={{ background: CARD, borderColor: BORDER, color: TEXT }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopyAndOpen}
              style={{ borderColor: BORDER, color: TEXT, background: CARD }}
            >
              <Copy size={12} /> Copy + open LinkedIn
            </Button>
          </div>
        )}
      </Section>

      {/* Notes */}
      <Section title="Notes">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if ((notes ?? "") !== (target.notes ?? "")) onPatch({ notes });
          }}
          rows={4}
          placeholder="Notes…"
          style={{ background: CARD, borderColor: BORDER, color: TEXT }}
        />
      </Section>

      {/* Tags */}
      <Section title="Tags">
        <div className="flex flex-wrap gap-1 mb-2">
          {(target.tags ?? []).map((tag) => (
            <span
              key={tag}
              className="text-[11px] px-2 py-0.5 rounded inline-flex items-center gap-1"
              style={{ background: "rgba(255,255,255,0.06)", color: TEXT }}
            >
              {tag}
              <button onClick={() => removeTag(tag)} style={{ color: MUTED }}>
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
        <Input
          placeholder="Add tag, press enter"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          style={{ background: CARD, borderColor: BORDER, color: TEXT }}
        />
      </Section>

      {/* Source */}
      <Section title="Source">
        <div className="text-xs" style={{ color: MUTED }}>
          {target.source || "—"}
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: MUTED }}
        >
          {title}
        </h4>
        {right}
      </div>
      {children}
    </div>
  );
}

// ---------- Add Target Modal ----------
function AddTargetModal({
  open,
  onOpenChange,
  companies,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companies: CompanyLite[];
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companySearch, setCompanySearch] = useState("");
  const [companyOpen, setCompanyOpen] = useState(false);
  const [role, setRole] = useState("");
  const [group, setGroup] = useState<Group>("a_cold");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);

  const filteredCompanies = useMemo(
    () =>
      companies
        .filter((c) => c.name.toLowerCase().includes(companySearch.toLowerCase()))
        .slice(0, 8),
    [companies, companySearch],
  );
  const selectedCompany = companyId ? companies.find((c) => c.id === companyId) ?? null : null;

  const reset = () => {
    setName("");
    setLinkedin("");
    setCompanyId(null);
    setCompanySearch("");
    setRole("");
    setGroup("a_cold");
    setSource("");
    setNotes("");
    setTags([]);
    setTagInput("");
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const { error } = await gtmSupabase.from("outreach_targets" as never).insert({
        name: name.trim(),
        linkedin_url: linkedin.trim() || null,
        current_company_id: companyId,
        role: role.trim() || null,
        group_name: group,
        status: group === "a_cold" ? "to_message" : "to_engage",
        source: source.trim() || null,
        notes: notes.trim() || null,
        tags,
      } as never);
      if (error) throw error;
      toast.success("Target added");
      onCreated();
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add target");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{ background: BG, borderColor: BORDER, color: TEXT, maxWidth: 520 }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: TEXT }}>Add Outreach Target</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ background: CARD, borderColor: BORDER, color: TEXT }}
            />
          </div>
          <div>
            <Label>LinkedIn URL</Label>
            <Input
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
              placeholder="https://linkedin.com/in/…"
              style={{ background: CARD, borderColor: BORDER, color: TEXT }}
            />
          </div>
          <div>
            <Label>Company</Label>
            <div className="relative">
              <Input
                value={selectedCompany ? selectedCompany.name : companySearch}
                onChange={(e) => {
                  setCompanyId(null);
                  setCompanySearch(e.target.value);
                  setCompanyOpen(true);
                }}
                onFocus={() => setCompanyOpen(true)}
                placeholder="Search companies (optional)…"
                style={{ background: CARD, borderColor: BORDER, color: TEXT }}
              />
              {companyOpen && companySearch && !selectedCompany && (
                <div
                  className="absolute z-10 w-full mt-1 max-h-60 overflow-auto"
                  style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6 }}
                >
                  {filteredCompanies.map((c) => (
                    <button
                      key={c.id}
                      className="w-full text-left px-3 py-2 flex items-center justify-between text-sm cursor-pointer"
                      style={{ color: TEXT }}
                      onClick={() => {
                        setCompanyId(c.id);
                        setCompanyOpen(false);
                        setCompanySearch("");
                      }}
                    >
                      <span>{c.name}</span>
                      <TierBadge tier={c.tier} />
                    </button>
                  ))}
                  {filteredCompanies.length === 0 && (
                    <div className="px-3 py-2 text-xs" style={{ color: MUTED }}>
                      No matches
                    </div>
                  )}
                </div>
              )}
              {selectedCompany && (
                <button
                  onClick={() => {
                    setCompanyId(null);
                    setCompanySearch("");
                  }}
                  className="absolute right-2 top-2"
                  style={{ color: MUTED }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          <div>
            <Label>Role / Title</Label>
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={{ background: CARD, borderColor: BORDER, color: TEXT }}
            />
          </div>
          <div>
            <Label>Group *</Label>
            <div className="flex gap-2">
              {(["a_cold", "b_warm"] as Group[]).map((g) => {
                const active = group === g;
                const color = g === "a_cold" ? PRIMARY : VIOLET;
                return (
                  <button
                    key={g}
                    onClick={() => setGroup(g)}
                    className="flex-1 px-3 py-2 text-sm font-medium transition-colors cursor-pointer"
                    style={{
                      background: active ? `${color}1F` : CARD,
                      border: `1px solid ${active ? color : BORDER}`,
                      color: active ? color : MUTED,
                      borderRadius: 6,
                    }}
                  >
                    {g === "a_cold" ? "Group A: Cold" : "Group B: Warm"}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label>Source</Label>
            <Input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="How did you find them?"
              style={{ background: CARD, borderColor: BORDER, color: TEXT }}
            />
          </div>
          <div>
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1 mb-2">
              {tags.map((t) => (
                <span
                  key={t}
                  className="text-[11px] px-2 py-0.5 rounded inline-flex items-center gap-1"
                  style={{ background: "rgba(255,255,255,0.06)", color: TEXT }}
                >
                  {t}
                  <button
                    onClick={() => setTags(tags.filter((x) => x !== t))}
                    style={{ color: MUTED }}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const v = tagInput.trim();
                  if (v && !tags.includes(v)) setTags([...tags, v]);
                  setTagInput("");
                }
              }}
              placeholder="Add tag, press enter"
              style={{ background: CARD, borderColor: BORDER, color: TEXT }}
            />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              style={{ background: CARD, borderColor: BORDER, color: TEXT }}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            style={{ borderColor: BORDER, color: TEXT, background: "transparent" }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            style={{ background: PRIMARY, color: "#000" }}
          >
            {saving ? "Saving…" : "Add Target"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[11px] uppercase tracking-wider mb-1"
      style={{ color: MUTED }}
    >
      {children}
    </div>
  );
}
