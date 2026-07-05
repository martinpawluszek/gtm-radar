import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueries, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Minus, ExternalLink, Linkedin } from "lucide-react";
import { toast } from "sonner";
import { gtmSupabase } from "@/lib/gtmSupabase";
import { TIER_META, type Tier } from "@/lib/companies";
import { Button } from "@/components/ui/button";
import {
  computeWeeks,
  currentWeekOf,
  useProjectStartDate,
  type LpGoal,
  type LpItem,
  type WeekStat,
} from "@/lib/linkedinProgress";

type AbStats = {
  invitesSent: number;
  invitesAccepted: number;
  acceptRate: number;
  messagesSent: number;
  activeConv: number;
  callsSched: number;
  positive: number;
};

const MONO = "var(--font-mono)";
const BG = "#0A0A0F";
const CARD = "#111118";
const BORDER = "#1E1E2E";
const CYAN = "#00D4FF";
const VIOLET = "#7C3AED";
const SUCCESS = "#10B981";
const WARNING = "#F59E0B";
const DANGER = "#EF4444";
const MUTED = "#8B8B9E";
const TEXT = "#F0F0FF";

// ---------- helpers ----------
function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  if (days < 30) return `${days}d ago`;
  const mo = Math.floor(days / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.floor((Date.now() - t) / 86400000);
}

function scoreColor(s: number | null | undefined): string {
  if (s == null) return MUTED;
  if (s >= 20) return SUCCESS;
  if (s >= 16) return CYAN;
  if (s >= 12) return WARNING;
  return DANGER;
}

function pct(num: number, den: number) {
  if (!den) return 0;
  return Math.round((num / den) * 100);
}

// ---------- safe queries (treat missing tables/columns as empty) ----------
async function safeSelect<T = any>(table: string, q: (b: any) => any): Promise<T[]> {
  try {
    const builder = q(gtmSupabase.from(table as never).select("*"));
    const { data, error } = await builder;
    if (error) {
      console.warn(`[dashboard] ${table}:`, error.message);
      return [];
    }
    return (data ?? []) as T[];
  } catch (e) {
    console.warn(`[dashboard] ${table} threw:`, e);
    return [];
  }
}

// ---------- types ----------
type ApplicationRow = {
  id: string;
  posting_id: string | null;
  company_id: string | null;
  role_title: string;
  status: string;
  applied_at: string | null;
  last_status_change: string | null;
  created_at: string;
};
type HistoryRow = {
  id: string;
  application_id: string;
  from_status: string | null;
  to_status: string;
  changed_at: string;
};
type PostingRow = {
  id: string;
  company_id: string | null;
  title: string;
  status: string;
  source: string | null;
  scraped_at: string | null;
  created_at: string;
  ai_composite_score: number | null;
};
type CompanyRow = { id: string; name: string; tier: Tier };
type TargetRow = {
  id: string;
  name: string;
  current_company_id: string | null;
  group_name: string;
  status: string;
  source: string | null;
  updated_at: string;
  // V2 cols (may not exist)
  suggested_at?: string | null;
  invite_sent_at?: string | null;
  invite_accepted_at?: string | null;
};
type ActivityRow = { id: string; target_id: string; activity_type: string; occurred_at: string };
type FeedbackRow = {
  id: string;
  posting_id: string;
  ai_score: number | null;
  martin_score: number | null;
  martin_overrides: Record<string, { score: number; reason?: string }> | null;
  ai_rationale_snapshot: { parameter_scores?: Record<string, { score: number }> } | null;
  created_at: string;
};

// ---------- nav helper ----------
function openInRoute(route: "postings" | "applications" | "outreach", id: string) {
  try {
    sessionStorage.setItem(`dashboard:open:${route}`, id);
  } catch {}
}

// ---------- card primitives ----------
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 6,
        padding: 16,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="uppercase"
      style={{
        color: MUTED,
        fontFamily: MONO,
        fontSize: 11,
        letterSpacing: "0.08em",
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function TierBadge({ tier }: { tier: Tier }) {
  const m = TIER_META[tier];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 6px",
        border: `1px solid ${m.color}`,
        color: m.color,
        fontFamily: MONO,
        fontSize: 10,
        borderRadius: 3,
        letterSpacing: "0.05em",
      }}
    >
      {m.short}
    </span>
  );
}

function Trend({ curr, prev }: { curr: number; prev: number }) {
  if (prev === 0 && curr === 0) {
    return (
      <span style={{ color: MUTED, fontFamily: MONO, fontSize: 11 }}>—</span>
    );
  }
  if (prev === 0 && curr > 0) {
    return (
      <span style={{ color: SUCCESS, fontFamily: MONO, fontSize: 11 }}>New</span>
    );
  }
  if (curr === prev) {
    return (
      <span style={{ color: MUTED, fontFamily: MONO, fontSize: 11, display: "inline-flex", gap: 3, alignItems: "center" }}>
        <Minus size={11} /> 0%
      </span>
    );
  }
  const up = curr > prev;
  const change = Math.round(((curr - prev) / prev) * 100);
  return (
    <span
      style={{
        color: up ? SUCCESS : DANGER,
        fontFamily: MONO,
        fontSize: 11,
        display: "inline-flex",
        gap: 3,
        alignItems: "center",
      }}
    >
      {up ? <ArrowUp size={11} /> : <ArrowDown size={11} />} {Math.abs(change)}%
    </span>
  );
}

// ---------- main page ----------
export function DashboardPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const queries = useQueries({
    queries: [
      { queryKey: ["dash:applications"], queryFn: () => safeSelect<ApplicationRow>("applications", (b) => b) },
      { queryKey: ["dash:companies"], queryFn: () => safeSelect<CompanyRow>("companies", (b) => b.select("id,name,tier")) },
      { queryKey: ["dash:targets"], queryFn: () => safeSelect<TargetRow>("outreach_targets", (b) => b) },
      { queryKey: ["dash:activity"], queryFn: () => safeSelect<ActivityRow>("outreach_activity", (b) => b) },
      { queryKey: ["dash:history"], queryFn: () => safeSelect<HistoryRow>("application_status_history", (b) => b) },
      { queryKey: ["dash:feedback"], queryFn: () => safeSelect<FeedbackRow>("feedback_log", (b) => b) },
    ],
  });

  const [appsQ, companiesQ, targetsQ, activityQ, historyQ, feedbackQ] = queries;
  const apps = (appsQ.data ?? []) as ApplicationRow[];
  const companies = (companiesQ.data ?? []) as CompanyRow[];
  const targets = (targetsQ.data ?? []) as TargetRow[];
  const activity = (activityQ.data ?? []) as ActivityRow[];
  const history = (historyQ.data ?? []) as HistoryRow[];
  const feedback = (feedbackQ.data ?? []) as FeedbackRow[];

  // ---------- targeted job_postings queries (server-side; avoids 1k row cap) ----------
  const postingsWeekQ = useQuery({
    queryKey: ["dash:postings-week"],
    queryFn: async () => {
      const nowMs = Date.now();
      const d7 = new Date(nowMs - 7 * 86400000).toISOString();
      const d14 = new Date(nowMs - 14 * 86400000).toISOString();
      const curr = await gtmSupabase
        .from("job_postings" as never)
        .select("id", { count: "exact", head: true })
        .gte("created_at", d7);
      const prev = await gtmSupabase
        .from("job_postings" as never)
        .select("id", { count: "exact", head: true })
        .gte("created_at", d14)
        .lt("created_at", d7);
      return { curr: curr.count ?? 0, prev: prev.count ?? 0 };
    },
  });

  const topPostingsQ = useQuery({
    queryKey: ["dash:postings-top"],
    queryFn: async () => {
      const { data, error } = await gtmSupabase
        .from("job_postings" as never)
        .select("id,company_id,title,status,ai_composite_score,created_at,source,scraped_at")
        .eq("status", "new")
        .not("ai_composite_score", "is", null)
        .order("ai_composite_score", { ascending: false, nullsFirst: false })
        .limit(10);
      if (error) {
        console.warn("[dashboard] top postings:", error.message);
        return [] as PostingRow[];
      }
      return (data ?? []) as unknown as PostingRow[];
    },
  });

  const scorerRunQ = useQuery({
    queryKey: ["dash:postings-scorer"],
    queryFn: async () => {
      const { data, error } = await gtmSupabase
        .from("job_postings" as never)
        .select("scraped_at")
        .neq("source", "manual")
        .not("scraped_at", "is", null)
        .order("scraped_at", { ascending: false })
        .limit(1);
      if (error || !data || !data.length) return { lastRun: null as string | null, thisRunCount: 0 };
      const lastRun = (data[0] as { scraped_at: string | null }).scraped_at;
      if (!lastRun) return { lastRun: null, thisRunCount: 0 };
      const dayStart = new Date(lastRun.slice(0, 10) + "T00:00:00.000Z").toISOString();
      const c = await gtmSupabase
        .from("job_postings" as never)
        .select("id", { count: "exact", head: true })
        .gte("created_at", dayStart);
      return { lastRun, thisRunCount: c.count ?? 0 };
    },
  });

  const topPostings = (topPostingsQ.data ?? []) as PostingRow[];
  const weekPostings = postingsWeekQ.data ?? { curr: 0, prev: 0 };
  const scorerRun = scorerRunQ.data ?? { lastRun: null as string | null, thisRunCount: 0 };

  const companyMap = useMemo(() => {
    const m = new Map<string, CompanyRow>();
    companies.forEach((c) => m.set(c.id, c));
    return m;
  }, [companies]);

  const lastActivityByTarget = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of activity) {
      const prev = m.get(a.target_id);
      if (!prev || new Date(a.occurred_at) > new Date(prev)) m.set(a.target_id, a.occurred_at);
    }
    return m;
  }, [activity]);

  // ---------- Section 1: Needs Attention ----------
  const aboutToGhost = apps.filter((a) => {
    if (a.status !== "applied" || !a.applied_at) return false;
    const d = daysSince(a.applied_at);
    return d >= 14 && d <= 20;
  });
  const highScoreUnactioned = topPostings
    .filter((p) => (p.ai_composite_score ?? 0) >= 16)
    .slice(0, 5);
  const newSuggested = targets.filter((t) => t.status === "suggested");
  const warmGoingCold = targets.filter((t) => {
    if (t.group_name !== "b_warm" || t.status !== "engaging") return false;
    const last = lastActivityByTarget.get(t.id);
    return last ? daysSince(last) > 7 : true;
  });

  const hasAttention =
    aboutToGhost.length || highScoreUnactioned.length || newSuggested.length || warmGoingCold.length;

  // ---------- Section 2: Agent Activity ----------
  const lastPostingRun = scorerRun.lastRun;
  const postingsThisRun = scorerRun.thisRunCount;

  const agentTargets = targets.filter((t) => t.source === "agent_talent_scout");
  const lastScoutRun = agentTargets.reduce<string | null>((acc, t) => {
    const ts = t.suggested_at ?? null;
    if (!ts) return acc;
    return !acc || new Date(ts) > new Date(acc) ? ts : acc;
  }, null);
  const lastScoutDay = lastScoutRun ? lastScoutRun.slice(0, 10) : null;
  const scoutThisRun = lastScoutDay
    ? agentTargets.filter((t) => (t.suggested_at ?? "").slice(0, 10) === lastScoutDay).length
    : 0;

  // ---------- Section 3: This Week ----------
  const now = Date.now();
  const D7 = 7 * 86400000;
  const inLast7 = (iso: string | null | undefined) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return now - t <= D7 && now - t >= 0;
  };
  const inPrev7 = (iso: string | null | undefined) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return now - t > D7 && now - t <= 2 * D7;
  };

  // Stage advancement: applications only (net forward progress).
  const APP_RANK: Record<string, number> = {
    applied: 0,
    screening: 1,
    interview_1: 2,
    interview_2: 3,
    final: 4,
    offer: 5,
  };
  const TERMINAL = new Set(["rejected", "ghosted"]);
  function appAdvancementInWindow(inWindow: (iso: string | null) => boolean): number {
    const byApp = new Map<string, HistoryRow[]>();
    for (const h of history) {
      const arr = byApp.get(h.application_id) ?? [];
      arr.push(h);
      byApp.set(h.application_id, arr);
    }
    let count = 0;
    for (const a of apps) {
      const rows = (byApp.get(a.id) ?? []).slice().sort(
        (x, y) => new Date(x.changed_at).getTime() - new Date(y.changed_at).getTime(),
      );
      // Build sequence of (status, time) the app ever held: start with applied at applied_at, then each to_status at changed_at; include current status.
      const seq: { status: string; t: string | null }[] = [];
      if (a.applied_at) seq.push({ status: "applied", t: a.applied_at });
      for (const r of rows) seq.push({ status: r.to_status, t: r.changed_at });
      if (!seq.length || seq[seq.length - 1].status !== a.status) {
        seq.push({ status: a.status, t: a.last_status_change ?? a.applied_at });
      }
      let maxRank = -Infinity;
      let firstReachedAt: string | null = null;
      for (const s of seq) {
        if (TERMINAL.has(s.status)) continue;
        const r = APP_RANK[s.status];
        if (r == null) continue;
        if (r > maxRank) {
          maxRank = r;
          firstReachedAt = s.t;
        }
      }
      if (maxRank > 0 && inWindow(firstReachedAt)) count++;
    }
    return count;
  }
  const inLast7Win = (iso: string | null) => inLast7(iso);
  const inPrev7Win = (iso: string | null) => inPrev7(iso);

  const wk = {
    postingsCurr: postings.filter((p) => inLast7(p.created_at)).length,
    postingsPrev: postings.filter((p) => inPrev7(p.created_at)).length,
    appsCurr: apps.filter((a) => inLast7(a.applied_at)).length,
    appsPrev: apps.filter((a) => inPrev7(a.applied_at)).length,
    outreachCurr: activity.filter((a) => inLast7(a.occurred_at)).length,
    outreachPrev: activity.filter((a) => inPrev7(a.occurred_at)).length,
    stagesCurr: appAdvancementInWindow(inLast7Win),
    stagesPrev: appAdvancementInWindow(inPrev7Win),
  };

  // ---------- Section 4a: Application Funnel ----------
  const STAGES: { key: string; label: string }[] = [
    { key: "applied", label: "Applied" },
    { key: "screening", label: "Screening" },
    { key: "interview_1", label: "Interview 1" },
    { key: "interview_2", label: "Interview 2" },
    { key: "final", label: "Final" },
    { key: "offer", label: "Offer" },
  ];
  const stageCounts = STAGES.map((s) => ({
    ...s,
    count: apps.filter((a) => a.status === s.key).length,
  }));
  const totalApps = apps.length;
  const beyondApplied = apps.filter((a) => !["applied"].includes(a.status)).length;
  const inInterviewOrLater = apps.filter((a) =>
    ["interview_1", "interview_2", "final", "offer"].includes(a.status),
  ).length;
  const offers = apps.filter((a) => a.status === "offer").length;

  // ---------- Section 4b: Outreach A/B ----------
  function groupStats(group: "a_cold" | "b_warm") {
    const ts = targets.filter((t) => t.group_name === group);
    const targetIds = new Set(ts.map((t) => t.id));
    const invitesSent = ts.filter((t) => (t as any).invite_sent_at).length;
    const invitesAccepted = ts.filter((t) => (t as any).invite_accepted_at).length;
    const messagesSent = activity.filter(
      (a) => a.activity_type === "message_sent" && targetIds.has(a.target_id),
    ).length;
    const activeConv = ts.filter((t) => t.status === ("active_conversation" as any)).length;
    const callsSched = ts.filter((t) => t.status === "call_scheduled").length;
    const positive = ts.filter((t) =>
      ["recommended_us", "call_scheduled"].includes(t.status),
    ).length;
    const acceptRate = invitesSent > 0 ? Math.round((invitesAccepted / invitesSent) * 100) : 0;
    return { invitesSent, invitesAccepted, acceptRate, messagesSent, activeConv, callsSched, positive };
  }
  const aStats = groupStats("a_cold");
  const bStats = groupStats("b_warm");

  // ---------- Section 5: by tier ----------
  const TIERS: Tier[] = ["god", "t1", "t2", "t3"];
  const tierRows = TIERS.map((tier) => {
    const tierApps = apps.filter((a) => {
      const c = a.company_id ? companyMap.get(a.company_id) : null;
      return c?.tier === tier;
    });
    const sent = tierApps.length;
    const resp = tierApps.filter(
      (a) => !["applied", "rejected", "ghosted"].includes(a.status),
    ).length;
    const inv = tierApps.filter((a) =>
      ["screening", "interview_1", "interview_2", "final"].includes(a.status),
    ).length;
    const off = tierApps.filter((a) => a.status === "offer").length;
    const rate = sent > 0 ? Math.round((resp / sent) * 100) : null;
    return { tier, sent, resp, inv, off, rate };
  });

  // ---------- Section 6a: AI calibration ----------
  const aiStats = useMemo(() => {
    if (!feedback.length) return null;
    const overridden = feedback.filter(
      (f) => f.martin_overrides && Object.keys(f.martin_overrides).length > 0,
    );
    const overrideRate = Math.round((overridden.length / feedback.length) * 100);
    let totalGap = 0;
    let gapCount = 0;
    const paramCount: Record<string, number> = {};
    for (const f of overridden) {
      const claudeScores = f.ai_rationale_snapshot?.parameter_scores ?? {};
      for (const [k, v] of Object.entries(f.martin_overrides ?? {})) {
        paramCount[k] = (paramCount[k] ?? 0) + 1;
        const cs = claudeScores[k]?.score;
        if (typeof cs === "number" && typeof v?.score === "number") {
          totalGap += v.score - cs;
          gapCount++;
        }
      }
    }
    const avgGap = gapCount > 0 ? Math.round((totalGap / gapCount) * 10) / 10 : 0;
    const mostOverridden =
      Object.entries(paramCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
    return { total: feedback.length, overrideRate, avgGap, mostOverridden };
  }, [feedback]);

  // ---------- Section 6b: Top opportunities ----------
  const topOpps = postings
    .filter((p) => p.status === "new")
    .sort((a, b) => (b.ai_composite_score ?? 0) - (a.ai_composite_score ?? 0))
    .slice(0, 5);

  // ---------- mutations for top opps ----------
  const applyMut = useMutation({
    mutationFn: async (p: PostingRow) => {
      const nowIso = new Date().toISOString();
      const { error: e1 } = await gtmSupabase.from("applications" as never).insert({
        posting_id: p.id,
        company_id: p.company_id,
        role_title: p.title,
        status: "applied",
        applied_at: nowIso,
        last_status_change: nowIso,
        contacts: [],
      } as never);
      if (e1) throw e1;
      const { error: e2 } = await gtmSupabase
        .from("job_postings" as never)
        .update({ status: "applied", updated_at: nowIso } as never)
        .eq("id", p.id);
      if (e2) throw e2;
      await bumpTitleWeight(p.title, +1);
    },
    onSuccess: () => {
      toast.success("Moved to Applications");
      qc.invalidateQueries({ queryKey: ["dash:postings"] });
      qc.invalidateQueries({ queryKey: ["dash:applications"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dismissMut = useMutation({
    mutationFn: async (p: PostingRow) => {
      const { error } = await gtmSupabase
        .from("job_postings" as never)
        .update({ status: "dismissed", updated_at: new Date().toISOString() } as never)
        .eq("id", p.id);
      if (error) throw error;
      await bumpTitleWeight(p.title, -1);
    },
    onSuccess: () => {
      toast.success("Dismissed");
      qc.invalidateQueries({ queryKey: ["dash:postings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div style={{ background: BG, color: TEXT }} className="space-y-4">
      {/* Page header */}
      <div style={{ marginTop: -8 }}>
        <h1 style={{ color: TEXT, fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>
          Dashboard
        </h1>
        <div style={{ color: MUTED, fontSize: 13, marginTop: 2 }}>
          Your job search at a glance.
        </div>
      </div>

      {/* SECTION 1 */}
      <Card>
        <SectionTitle>Needs Attention</SectionTitle>
        {!hasAttention ? (
          <div style={{ color: MUTED, fontSize: 13, padding: "12px 0" }}>All caught up. Nice.</div>
        ) : (
          <div className="space-y-4">
            {aboutToGhost.length > 0 && (
              <AttentionSection
                count={aboutToGhost.length}
                label="applications about to auto-ghost"
                color={WARNING}
              >
                {aboutToGhost.map((a) => {
                  const c = a.company_id ? companyMap.get(a.company_id) : null;
                  const days = 21 - daysSince(a.applied_at);
                  return (
                    <AttentionRow
                      key={a.id}
                      onClick={() => {
                        openInRoute("applications", a.id);
                        navigate({ to: "/applications" });
                      }}
                      left={
                        <>
                          <span style={{ color: TEXT, fontSize: 13 }}>{c?.name ?? "—"}</span>
                          <span style={{ color: MUTED, fontSize: 12 }}> · {a.role_title}</span>
                        </>
                      }
                      right={
                        <span style={{ color: WARNING, fontFamily: MONO, fontSize: 11 }}>
                          {days}d until auto-ghost
                        </span>
                      }
                    />
                  );
                })}
              </AttentionSection>
            )}

            {highScoreUnactioned.length > 0 && (
              <AttentionSection
                count={highScoreUnactioned.length}
                label="high-score postings to review"
                color={CYAN}
              >
                {highScoreUnactioned.map((p) => {
                  const c = p.company_id ? companyMap.get(p.company_id) : null;
                  return (
                    <AttentionRow
                      key={p.id}
                      onClick={() => {
                        openInRoute("postings", p.id);
                        navigate({ to: "/postings" });
                      }}
                      left={
                        <>
                          <span style={{ color: TEXT, fontSize: 13 }}>{c?.name ?? "—"}</span>
                          <span style={{ color: MUTED, fontSize: 12 }}> · {p.title}</span>
                        </>
                      }
                      right={
                        <span
                          style={{
                            color: scoreColor(p.ai_composite_score),
                            fontFamily: MONO,
                            fontSize: 12,
                          }}
                        >
                          {(p.ai_composite_score ?? 0).toFixed(1)}
                        </span>
                      }
                    />
                  );
                })}
              </AttentionSection>
            )}

            {newSuggested.length > 0 && (
              <AttentionSection
                count={newSuggested.length}
                label="new candidates suggested for outreach"
                color={VIOLET}
              >
                <AttentionRow
                  onClick={() => navigate({ to: "/outreach" })}
                  left={<span style={{ color: MUTED, fontSize: 12 }}>Review in Outreach</span>}
                  right={<ExternalLink size={13} color={MUTED} />}
                />
              </AttentionSection>
            )}

            {warmGoingCold.length > 0 && (
              <AttentionSection
                count={warmGoingCold.length}
                label="warm targets going cold"
                color={WARNING}
              >
                {warmGoingCold.map((t) => {
                  const c = t.current_company_id ? companyMap.get(t.current_company_id) : null;
                  const last = lastActivityByTarget.get(t.id);
                  const d = last ? daysSince(last) : daysSince(t.updated_at);
                  return (
                    <AttentionRow
                      key={t.id}
                      onClick={() => {
                        openInRoute("outreach", t.id);
                        navigate({ to: "/outreach" });
                      }}
                      left={
                        <>
                          <span style={{ color: TEXT, fontSize: 13 }}>{t.name}</span>
                          {c && (
                            <span style={{ color: MUTED, fontSize: 12 }}> · {c.name}</span>
                          )}
                        </>
                      }
                      right={
                        <span style={{ color: WARNING, fontFamily: MONO, fontSize: 11 }}>
                          {d}d since last activity
                        </span>
                      }
                    />
                  );
                })}
              </AttentionSection>
            )}
          </div>
        )}
      </Card>

      {/* SECTION 1.5 — LinkedIn Presence */}
      <LinkedInPresenceCard />

      {/* SECTION 2 */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Card>
          <SectionTitle>Posting Scorer</SectionTitle>
          {lastPostingRun ? (
            <>
              <div style={{ color: TEXT, fontFamily: MONO, fontSize: 18 }}>
                {relativeTime(lastPostingRun)}
              </div>
              <div style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>
                <span style={{ fontFamily: MONO, color: CYAN }}>{postingsThisRun}</span> new this run
              </div>
            </>
          ) : (
            <div style={{ color: MUTED, fontSize: 13 }}>Agents not yet active</div>
          )}
        </Card>
        <Card>
          <SectionTitle>Talent Scout</SectionTitle>
          {lastScoutRun ? (
            <>
              <div style={{ color: TEXT, fontFamily: MONO, fontSize: 18 }}>
                {relativeTime(lastScoutRun)}
              </div>
              <div style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>
                <span style={{ fontFamily: MONO, color: VIOLET }}>{scoutThisRun}</span> new candidates suggested
              </div>
            </>
          ) : (
            <div style={{ color: MUTED, fontSize: 13 }}>Agents not yet active</div>
          )}
        </Card>
      </div>

      {/* SECTION 3 */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <StatCard label="Postings Added" curr={wk.postingsCurr} prev={wk.postingsPrev} />
        <StatCard label="Applications Submitted" curr={wk.appsCurr} prev={wk.appsPrev} />
        <StatCard label="Outreach Activity" curr={wk.outreachCurr} prev={wk.outreachPrev} />
        <StatCard label="Stage Advancements" curr={wk.stagesCurr} prev={wk.stagesPrev} note="(applications only)" />
      </div>

      {/* SECTION 4 */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Card>
          <SectionTitle>Application Funnel</SectionTitle>
          <div className="space-y-2">
            {stageCounts.map((s) => {
              const max = Math.max(...stageCounts.map((x) => x.count), 1);
              const w = (s.count / max) * 100;
              return (
                <div key={s.key} className="grid items-center gap-2" style={{ gridTemplateColumns: "100px 1fr 36px" }}>
                  <div style={{ color: MUTED, fontSize: 12 }}>{s.label}</div>
                  <div style={{ height: 14, background: "#0D0D14", borderRadius: 3, overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${w}%`,
                        height: "100%",
                        background: s.key === "offer" ? SUCCESS : CYAN,
                        opacity: s.count === 0 ? 0.2 : 1,
                      }}
                    />
                  </div>
                  <div style={{ color: TEXT, fontFamily: MONO, fontSize: 12, textAlign: "right" }}>
                    {s.count}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="grid gap-2 mt-4" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            <FunnelRate label="Response" value={pct(beyondApplied, totalApps)} />
            <FunnelRate label="Interview" value={pct(inInterviewOrLater, totalApps)} />
            <FunnelRate label="Offer" value={pct(offers, totalApps)} />
          </div>
        </Card>

        <Card>
          <SectionTitle>Outreach A/B Test</SectionTitle>
          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <AbColumn
              title="Group A: Cold"
              color={CYAN}
              stats={aStats}
              highlight={aStats.acceptRate >= bStats.acceptRate && aStats.invitesSent > 0}
            />
            <AbColumn
              title="Group B: Warm"
              color={VIOLET}
              stats={bStats}
              highlight={bStats.acceptRate > aStats.acceptRate}
            />
          </div>
        </Card>
      </div>

      {/* SECTION 5 */}
      <Card>
        <SectionTitle>Where the Heat Is (by Tier)</SectionTitle>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: MUTED, fontSize: 11, textAlign: "left" }}>
                <th style={{ padding: "8px 6px" }}>Tier</th>
                <th style={{ padding: "8px 6px", textAlign: "right" }}>Apps Sent</th>
                <th style={{ padding: "8px 6px", textAlign: "right" }}>Responses</th>
                <th style={{ padding: "8px 6px", textAlign: "right" }}>In Interview</th>
                <th style={{ padding: "8px 6px", textAlign: "right" }}>Offers</th>
                <th style={{ padding: "8px 6px", textAlign: "right" }}>Response Rate</th>
              </tr>
            </thead>
            <tbody>
              {tierRows.map((r) => (
                <tr key={r.tier} style={{ borderTop: `1px solid ${BORDER}` }}>
                  <td style={{ padding: "10px 6px" }}>
                    <TierBadge tier={r.tier} />
                  </td>
                  <td style={cellNum(r.sent)}>{r.sent || "—"}</td>
                  <td style={cellNum(r.resp)}>{r.resp || "—"}</td>
                  <td style={cellNum(r.inv)}>{r.inv || "—"}</td>
                  <td style={cellNum(r.off)}>{r.off || "—"}</td>
                  <td style={cellNum(r.rate ?? 0)}>
                    {r.rate == null ? "—" : `${r.rate}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* SECTION 6 */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Card>
          <SectionTitle>AI Calibration</SectionTitle>
          {!aiStats ? (
            <div style={{ color: MUTED, fontSize: 13 }}>
              Calibration data will appear after your first feedback. Score a posting and override a
              parameter to see this come to life.
            </div>
          ) : (
            (() => {
              const orRate = aiStats.overrideRate;
              const orColor = orRate < 30 ? SUCCESS : orRate <= 50 ? WARNING : DANGER;
              const gap = aiStats.avgGap;
              const gapColor = gap > 0 ? SUCCESS : gap < 0 ? DANGER : TEXT;
              const gapArrow = gap > 0 ? "↑" : gap < 0 ? "↓" : "→";
              const gapVal = gap === 0 ? "0" : `${gapArrow} ${gap > 0 ? "+" : ""}${gap}`;
              return (
                <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <CalCell label="Total feedback" value={String(aiStats.total)} />
                  <CalCell label="Override rate" value={`${orRate}%`} color={orColor} />
                  <CalCell label="Avg score gap" value={gapVal} color={gapColor} />
                  <CalCell label="Most overridden" valuePill={aiStats.mostOverridden} />
                </div>
              );
            })()
          )}
        </Card>

        <Card>
          <SectionTitle>Top Opportunities</SectionTitle>
          {topOpps.length === 0 ? (
            <div style={{ color: MUTED, fontSize: 13 }}>No new postings to review.</div>
          ) : (
            <div className="space-y-2">
              {topOpps.map((p) => {
                const c = p.company_id ? companyMap.get(p.company_id) : null;
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      openInRoute("postings", p.id);
                      navigate({ to: "/postings" });
                    }}
                    className="cursor-pointer"
                    style={{
                      border: `1px solid ${BORDER}`,
                      borderRadius: 4,
                      padding: 10,
                      background: "#0D0D14",
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div className="flex items-center gap-2">
                        {c && <TierBadge tier={c.tier} />}
                        <span style={{ color: TEXT, fontSize: 13, fontWeight: 500 }}>
                          {c?.name ?? "—"}
                        </span>
                        <span
                          style={{
                            color: scoreColor(p.ai_composite_score),
                            fontFamily: MONO,
                            fontSize: 12,
                          }}
                        >
                          {(p.ai_composite_score ?? 0).toFixed(1)}
                        </span>
                      </div>
                      <div
                        style={{
                          color: MUTED,
                          fontSize: 12,
                          marginTop: 2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.title}
                      </div>
                    </div>
                    <div
                      className="flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        size="sm"
                        disabled={applyMut.isPending}
                        onClick={() => applyMut.mutate(p)}
                        style={{
                          height: 26,
                          padding: "0 10px",
                          background: CYAN,
                          color: "#001018",
                          border: "none",
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        Apply
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={dismissMut.isPending}
                        onClick={() => dismissMut.mutate(p)}
                        style={{
                          height: 26,
                          padding: "0 10px",
                          border: `1px solid rgba(239,68,68,0.3)`,
                          color: DANGER,
                          background: "transparent",
                          fontSize: 11,
                        }}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function cellNum(_v: number): React.CSSProperties {
  return {
    padding: "10px 6px",
    textAlign: "right",
    color: TEXT,
    fontFamily: MONO,
    fontSize: 12,
  };
}

function AttentionSection({
  count,
  label,
  color,
  children,
}: {
  count: number;
  label: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          color,
          fontSize: 12,
          fontFamily: MONO,
          marginBottom: 6,
          letterSpacing: "0.02em",
        }}
      >
        {count} {label}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function AttentionRow({
  left,
  right,
  onClick,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="cursor-pointer"
      style={{
        background: "#0D0D14",
        border: `1px solid ${BORDER}`,
        borderRadius: 4,
        padding: "8px 10px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
      }}
    >
      <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {left}
      </div>
      <div style={{ flexShrink: 0 }}>{right}</div>
    </div>
  );
}

function StatCard({ label, curr, prev, note }: { label: string; curr: number; prev: number; note?: string }) {
  return (
    <Card>
      <SectionTitle>{label}</SectionTitle>
      <div style={{ color: TEXT, fontFamily: MONO, fontSize: 26, fontWeight: 600 }}>{curr}</div>
      {note && (
        <div style={{ color: MUTED, fontSize: 10, fontFamily: MONO, marginTop: 2 }}>{note}</div>
      )}
      <div className="flex items-center gap-2 mt-1">
        <Trend curr={curr} prev={prev} />
        {!(prev === 0 && curr === 0) && (
          <span style={{ color: MUTED, fontSize: 11, fontFamily: MONO }}>vs last week: {prev}</span>
        )}
      </div>
    </Card>
  );
}

function FunnelRate({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        border: `1px solid ${BORDER}`,
        borderRadius: 4,
        padding: "8px 10px",
        background: "#0D0D14",
      }}
    >
      <div style={{ color: MUTED, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label} Rate
      </div>
      <div style={{ color: TEXT, fontFamily: MONO, fontSize: 16, marginTop: 2 }}>{value}%</div>
    </div>
  );
}

function AbColumn({
  title,
  color,
  stats,
  highlight,
}: {
  title: string;
  color: string;
  stats: AbStats;
  highlight: boolean;
}) {
  return (
    <div
      style={{
        border: `1px solid ${highlight ? CYAN : BORDER}`,
        borderRadius: 4,
        padding: 10,
        background: "#0D0D14",
      }}
    >
      <div
        style={{
          color,
          fontFamily: MONO,
          fontSize: 11,
          letterSpacing: "0.05em",
          marginBottom: 8,
        }}
      >
        {title.toUpperCase()}
      </div>
      <AbRow label="Invites Sent" v={stats.invitesSent} />
      <AbRow label="Invites Accepted" v={stats.invitesAccepted} />
      <AbRow label="Acceptance Rate" v={`${stats.acceptRate}%`} />
      <AbRow label="Messages Sent" v={stats.messagesSent} />
      <AbRow label="Active Conversations" v={stats.activeConv} />
      <AbRow label="Calls Scheduled" v={stats.callsSched} />
      <AbRow label="Positive Outcomes" v={stats.positive} />
    </div>
  );
}

function AbRow({ label, v }: { label: string; v: number | string }) {
  return (
    <div
      className="flex items-center justify-between"
      style={{ padding: "4px 0", borderTop: `1px solid ${BORDER}` }}
    >
      <span style={{ color: MUTED, fontSize: 11 }}>{label}</span>
      <span style={{ color: TEXT, fontFamily: MONO, fontSize: 12 }}>{v}</span>
    </div>
  );
}

function CalCell({
  label,
  value,
  valuePill,
  color,
}: {
  label: string;
  value?: string;
  valuePill?: string;
  color?: string;
}) {
  return (
    <div
      style={{
        background: "#0D0D14",
        border: `1px solid ${BORDER}`,
        borderRadius: 4,
        padding: "10px 12px",
      }}
    >
      <div
        className="uppercase"
        style={{
          color: MUTED,
          fontSize: 10,
          fontFamily: MONO,
          letterSpacing: "0.06em",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {valuePill ? (
        <span
          style={{
            display: "inline-block",
            padding: "3px 8px",
            border: `1px solid ${BORDER}`,
            background: BG,
            color: TEXT,
            fontFamily: MONO,
            fontSize: 12,
            borderRadius: 999,
          }}
        >
          {valuePill}
        </span>
      ) : (
        <div
          style={{
            color: color ?? TEXT,
            fontFamily: MONO,
            fontSize: 20,
            fontWeight: 600,
          }}
        >
          {value}
        </div>
      )}
    </div>
  );
}

function CalRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      className="flex items-center justify-between"
      style={{
        background: "#0D0D14",
        border: `1px solid ${BORDER}`,
        borderRadius: 4,
        padding: "8px 10px",
      }}
    >
      <span style={{ color: MUTED, fontSize: 12 }}>{label}</span>
      <span style={{ color: color ?? TEXT, fontFamily: MONO, fontSize: 13 }}>{value}</span>
    </div>
  );
}

// ---------- bump title weight (replicated from postings logic) ----------
async function bumpTitleWeight(title: string, delta: 1 | -1) {
  const { data, error } = await gtmSupabase
    .from("role_criteria" as never)
    .select("*")
    .eq("is_active", true)
    .maybeSingle();
  if (error || !data) return;
  const c = data as any;
  const titles = [...(c.target_titles ?? [])];
  const idx = titles.findIndex(
    (t: any) => t.title.toLowerCase() === title.toLowerCase(),
  );
  if (idx >= 0) {
    const t = titles[idx];
    const applied_count = delta === 1 ? t.applied_count + 1 : t.applied_count;
    const dismissed_count = delta === -1 ? t.dismissed_count + 1 : t.dismissed_count;
    const weight = Math.max(0.1, 1.0 + (applied_count - dismissed_count) * 0.2);
    titles[idx] = { ...t, applied_count, dismissed_count, weight };
  } else if (delta === 1) {
    titles.push({ title, applied_count: 1, dismissed_count: 0, weight: 1.2 });
  } else {
    titles.push({ title, applied_count: 0, dismissed_count: 1, weight: 0.8 });
  }
  await gtmSupabase
    .from("role_criteria" as never)
    .update({ target_titles: titles, updated_at: new Date().toISOString() } as never)
    .eq("id", c.id);
}

// ---------- LinkedIn Presence Dashboard Card ----------
function LinkedInPresenceCard() {
  const navigate = useNavigate();
  const itemsQ = useQuery({
    queryKey: ["lp-items"],
    queryFn: async () => {
      const { data, error } = await gtmSupabase
        .from("linkedin_presence_items" as never)
        .select("id,item_type,status,posted_at,created_at");
      if (error) {
        console.warn("[dashboard:lp] items:", error.message);
        return [] as LpItem[];
      }
      return ((data ?? []) as unknown as LpItem[]);
    },
  });
  const goalQ = useQuery({
    queryKey: ["lp-active-goal"],
    queryFn: async () => {
      const { data, error } = await gtmSupabase
        .from("linkedin_presence_goals" as never)
        .select("*")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn("[dashboard:lp] goal:", error.message);
        return null;
      }
      return (data ?? null) as unknown as (LpGoal & { id: string }) | null;
    },
  });

  const { value: startDate } = useProjectStartDate();
  const weeks = useMemo(
    () => computeWeeks(itemsQ.data ?? [], goalQ.data ?? null, startDate),
    [itemsQ.data, goalQ.data, startDate],
  );
  const current = currentWeekOf(weeks);

  const goToPresence = () => navigate({ to: "/linkedin-presence" });

  const headerRight = (
    <button
      onClick={goToPresence}
      className="text-[11px] flex items-center gap-1 cursor-pointer"
      style={{
        color: CYAN,
        fontFamily: MONO,
        background: "rgba(0,212,255,0.08)",
        border: "1px solid rgba(0,212,255,0.25)",
        borderRadius: 4,
        padding: "4px 8px",
      }}
    >
      Open <ExternalLink size={12} />
    </button>
  );

  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Linkedin size={14} style={{ color: CYAN }} />
          <SectionTitle>LinkedIn Presence</SectionTitle>
        </div>
        {headerRight}
      </div>

      {!current ? (
        <div style={{ color: MUTED, fontSize: 13, padding: "8px 0" }}>
          {goalQ.isLoading || itemsQ.isLoading
            ? "Loading…"
            : !goalQ.data
              ? "No LinkedIn goal configured."
              : !startDate
                ? "Set a project start date in LinkedIn Presence → Settings to begin tracking."
                : "No active week yet."}
        </div>
      ) : (
        <LpCurrentWeek week={current} onOpen={goToPresence} />
      )}
    </Card>
  );
}

function LpCurrentWeek({
  week,
  onOpen,
}: {
  week: WeekStat;
  onOpen: () => void;
}) {
  const w = week;
  const onTrack = w.all_goals_met;
  const someActivity = w.total_activity > 0;
  const statusLabel = onTrack ? "On track" : someActivity ? "Behind" : "No activity yet";
  const statusColor = onTrack ? SUCCESS : someActivity ? WARNING : MUTED;
  const statusBg = onTrack
    ? "rgba(16,185,129,0.08)"
    : someActivity
      ? "rgba(245,158,11,0.08)"
      : "rgba(139,139,158,0.08)";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div style={{ color: TEXT, fontFamily: MONO, fontSize: 13 }}>
          Week <span style={{ color: CYAN }}>{w.week_number}</span>
          <span style={{ color: MUTED }}> · {w.week_start} → {w.week_end}</span>
        </div>
        <span
          style={{
            color: statusColor,
            background: statusBg,
            border: `1px solid ${statusColor}40`,
            borderRadius: 4,
            padding: "2px 8px",
            fontFamily: MONO,
            fontSize: 11,
          }}
        >
          {statusLabel}
        </span>
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <LpMetric label="Posts" curr={w.posts_published} goal={w.weekly_posts_goal} met={w.posts_goal_met} />
        <LpMetric label="Comments" curr={w.comments_posted} goal={w.weekly_comments_goal} met={w.comments_goal_met} />
        <LpMetric label="Ideas" curr={w.ideas_saved} goal={w.weekly_ideas_goal} met={w.ideas_goal_met} />
      </div>

      <div className="flex justify-between items-center">
        <div style={{ color: MUTED, fontSize: 11, fontFamily: MONO }}>
          {w.completion_percent}% of weekly goal
        </div>
        <button
          onClick={onOpen}
          className="text-[12px] cursor-pointer"
          style={{
            color: CYAN,
            fontFamily: MONO,
            background: "transparent",
            border: "none",
          }}
        >
          Go to LinkedIn Presence →
        </button>
      </div>
    </div>
  );
}

function LpMetric({
  label,
  curr,
  goal,
  met,
}: {
  label: string;
  curr: number;
  goal: number;
  met: boolean;
}) {
  const pctVal = goal > 0 ? Math.min(100, Math.round((curr / goal) * 100)) : 0;
  const accent = met ? SUCCESS : WARNING;
  return (
    <div
      style={{
        background: "#0D0D14",
        border: `1px solid ${BORDER}`,
        borderRadius: 4,
        padding: "8px 10px",
      }}
    >
      <div style={{ color: MUTED, fontSize: 10, fontFamily: MONO, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ color: TEXT, fontFamily: MONO, fontSize: 16, marginTop: 2 }}>
        {curr}
        <span style={{ color: MUTED }}> / {goal}</span>
      </div>
      <div
        style={{
          marginTop: 6,
          height: 3,
          background: "#1E1E2E",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div style={{ width: `${pctVal}%`, height: "100%", background: accent }} />
      </div>
    </div>
  );
}
