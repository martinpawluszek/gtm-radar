import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn as useSF } from "@tanstack/react-start";
import { ChevronDown, Plus, X, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { gtmSupabase } from "@/lib/gtmSupabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TIER_META, type Tier } from "@/lib/companies";
import { scoreJobPosting } from "@/lib/scorePosting.functions";

export const Route = createFileRoute("/postings")({
  head: () => ({ meta: [{ title: "Postings Inbox — GTM Intelligence" }] }),
  component: PostingsPage,
});

const MONO = "var(--font-mono)";

// ---------- Types ----------
type PostingStatus = "new" | "saved" | "dismissed" | "applied";
type TierFilter = "all" | Tier;

type ParamKey = "comp" | "fit" | "seniority" | "location" | "competition";
const PARAM_KEYS: ParamKey[] = ["comp", "fit", "seniority", "location", "competition"];
const PARAM_LABEL: Record<ParamKey, string> = {
  comp: "Comp",
  fit: "Fit",
  seniority: "Seniority",
  location: "Location",
  competition: "Competition",
};

type ParameterScore = { score: number; rationale: string };
type AiRationale = {
  parameter_scores?: Record<string, ParameterScore>;
  bonuses_applied?: Array<{ name: string; value: number } | string>;
  summary?: string;
};

type Posting = {
  id: string;
  company_id: string | null;
  title: string;
  location: string | null;
  jd_full: string | null;
  jd_url: string | null;
  source: string | null;
  scraped_at: string;
  ai_company_score: number | null;
  ai_role_score: number | null;
  ai_composite_score: number | null;
  ai_rationale: AiRationale | null;
  disqualified: boolean;
  disqualifier_reason: string | null;
  martin_feedback_score: number | null;
  martin_feedback_comment: string | null;
  martin_feedback_overrides: Record<string, { score: number; reason: string }> | null;
  status: PostingStatus;
  created_at: string;
  updated_at: string;
  title_signal: string | null;
};

type CompanyLite = {
  id: string;
  name: string;
  tier: Tier;
  brand_score: number;
  ai_score: number;
  shot_score: number;
  comp_score: number;
  location_score: number;
  notes: string | null;
};

type TitleEntry = { title: string; weight: number; applied_count: number; dismissed_count: number };
type RoleCriteria = {
  id: string;
  weights: Record<string, number>;
  rubric: Record<string, Record<string, string>>;
  disqualifiers: string[];
  bonuses: Array<{ id: string; name: string; value: number }>;
  target_titles: TitleEntry[];
};

// ---------- Helpers ----------
function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86400000);
  if (d === 0) {
    const h = Math.floor(ms / 3600000);
    if (h === 0) {
      const m = Math.floor(ms / 60000);
      return `${Math.max(1, m)}m ago`;
    }
    return `${h}h ago`;
  }
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

function scoreColor(score: number | null | undefined): string {
  if (score == null) return "#8B8B9E";
  if (score >= 20) return "#10B981";
  if (score >= 16) return "#00D4FF";
  if (score >= 12) return "#F59E0B";
  return "#EF4444";
}

const STATUS_META: Record<PostingStatus, { label: string; color: string }> = {
  new: { label: "New", color: "#00D4FF" },
  saved: { label: "Saved", color: "#7C3AED" },
  applied: { label: "Applied", color: "#10B981" },
  dismissed: { label: "Dismissed", color: "#8B8B9E" },
};

// ---------- Data ----------
async function fetchPostings(): Promise<Posting[]> {
  const { data, error } = await gtmSupabase
    .from("job_postings" as never)
    .select("*")
    .order("ai_composite_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Posting[];
}

async function fetchCompanies(): Promise<CompanyLite[]> {
  const { data, error } = await gtmSupabase
    .from("companies")
    .select("id,name,tier,brand_score,ai_score,shot_score,comp_score,location_score,notes")
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as CompanyLite[];
}

async function fetchActiveCriteria(): Promise<RoleCriteria | null> {
  const { data, error } = await gtmSupabase
    .from("role_criteria" as never)
    .select("*")
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as RoleCriteria) ?? null;
}

// ---------- Prompt builder ----------
function buildSystemPrompt(criteria: RoleCriteria, company: CompanyLite | null): string {
  const rubricText = PARAM_KEYS.map((k) => {
    const r = criteria.rubric?.[k === "fit" ? "role_fit" : k] ?? criteria.rubric?.[k] ?? {};
    const lines = [1, 2, 3, 4, 5].map((n) => `  ${n} — ${r[String(n)] ?? "—"}`).join("\n");
    return `${PARAM_LABEL[k]}:\n${lines}`;
  }).join("\n\n");

  const disqualifiers =
    criteria.disqualifiers?.length > 0
      ? criteria.disqualifiers.map((d) => `- ${d}`).join("\n")
      : "(none)";

  const bonuses =
    criteria.bonuses?.length > 0
      ? criteria.bonuses.map((b) => `- ${b.name} (+${b.value})`).join("\n")
      : "(none)";

  const titles =
    criteria.target_titles?.length > 0
      ? criteria.target_titles
          .map((t) => `- ${t.title} (weight: ${t.weight.toFixed(2)})`)
          .join("\n")
      : "(none)";

  const companyContext = company
    ? `Name: ${company.name}\nTier: ${company.tier}\nBrand: ${company.brand_score}/5, AI: ${company.ai_score}/5, Shot: ${company.shot_score}/5, Comp: ${company.comp_score}/5, Location: ${company.location_score}/5\nNotes: ${company.notes ?? "(none)"}`
    : "Company not matched in database.";

  return `You are scoring a job posting for Martin Pawluszek, a senior GTM and enterprise sales professional targeting roles at top AI and tech companies.

# Step 1 — Semantic Relevance Check
Is the core work described in this JD commercial GTM, enterprise sales, business development, revenue leadership, or strategic partnerships? If NO, set disqualified=true with reason "Not a commercial GTM role" and skip parameter scoring.

# Role Criteria (PRIMARY FRAMEWORK)
Weights: Comp Potential 20%, Role-Profile Fit 25%, Seniority Fit 15%, Location 10%, Competition Level 10%.

Scoring rubric per parameter (1-5):
${rubricText}

Disqualifiers (auto-reject):
${disqualifiers}

Bonuses:
${bonuses}

# Title Signal Library (SOFT HINTS — not a filter)
These title patterns have been relevant historically, with learned weights from past behavior (higher weight = stronger signal):
${titles}
Use as weak prior only. Always read the full JD — a non-matching title with a relevant JD scores normally.

# Company Context
${companyContext}`;
}

function buildUserPrompt(title: string, location: string, jd: string): string {
  return `Score this posting:
Title: ${title}
Location: ${location}
Job Description: ${jd}

Respond in this exact JSON format with no other text:
{
  "disqualified": false,
  "disqualifier_reason": null,
  "parameter_scores": {
    "comp": {"score": 4, "rationale": "one sentence"},
    "fit": {"score": 4, "rationale": "one sentence"},
    "seniority": {"score": 4, "rationale": "one sentence"},
    "location": {"score": 4, "rationale": "one sentence"},
    "competition": {"score": 4, "rationale": "one sentence"}
  },
  "bonuses_applied": [],
  "final_score": 18.5,
  "title_signal": "matching",
  "summary": "one sentence verdict"
}`;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/```$/g, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Could not parse JSON from Claude response");
  }
}

// ---------- Page ----------
function PostingsPage() {
  const qc = useQueryClient();
  const { data: postings = [], isLoading } = useQuery({
    queryKey: ["postings"],
    queryFn: fetchPostings,
  });
  const { data: companies = [] } = useQuery({
    queryKey: ["companies-lite-postings"],
    queryFn: fetchCompanies,
  });

  const companyMap = useMemo(() => {
    const m = new Map<string, CompanyLite>();
    companies.forEach((c) => m.set(c.id, c));
    return m;
  }, [companies]);

  const [statusFilter, setStatusFilter] = useState<"all" | PostingStatus>("all");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [tierOpen, setTierOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const selected = postings.find((p) => p.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    return postings.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (tierFilter !== "all") {
        const c = p.company_id ? companyMap.get(p.company_id) : null;
        if (!c || c.tier !== tierFilter) return false;
      }
      return true;
    });
  }, [postings, statusFilter, tierFilter, companyMap]);

  return (
    <div className="space-y-4 min-w-0" style={{ marginTop: -8 }}>
      {/* Page header */}
      <div className="grid items-start gap-3" style={{ gridTemplateColumns: "1fr auto" }}>
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold" style={{ color: "#F0F0FF", fontFamily: MONO }}>
            Postings Inbox
          </h2>
          <p style={{ color: "#8B8B9E", fontSize: 12 }}>
            AI-scored job postings. Review, give feedback, move to pipeline.
          </p>
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          style={{ background: "#00D4FF", color: "#0A0A0F" }}
        >
          <Plus size={14} /> Add Posting
        </Button>
      </div>

      {/* Filter bar */}
      <div
        className="flex items-center gap-3 px-3"
        style={{
          background: "#111118",
          border: "1px solid #1E1E2E",
          borderRadius: 6,
          height: 48,
        }}
      >
        <div className="flex items-center gap-1">
          {(["all", "new", "saved", "dismissed", "applied"] as const).map((s) => (
            <FilterPill
              key={s}
              active={statusFilter === s}
              onClick={() => setStatusFilter(s)}
              label={s === "all" ? "All" : STATUS_META[s].label}
            />
          ))}
        </div>
        <div style={{ width: 1, height: 20, background: "#1E1E2E" }} />
        <div className="relative">
          <button
            onClick={() => setTierOpen((v) => !v)}
            className="flex items-center gap-2 px-3"
            style={{
              height: 28,
              background: "#0A0A0F",
              border: "1px solid #1E1E2E",
              borderRadius: 4,
              color: "#F0F0FF",
              fontSize: 12,
              fontFamily: MONO,
            }}
          >
            {tierFilter === "all" ? "All Tiers" : TIER_META[tierFilter].label}
            <ChevronDown size={12} />
          </button>
          {tierOpen && (
            <div
              className="absolute left-0 mt-1 z-10 p-1"
              style={{
                background: "#111118",
                border: "1px solid #1E1E2E",
                borderRadius: 6,
                minWidth: 140,
              }}
            >
              {(["all", "god", "t1", "t2", "t3"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTierFilter(t);
                    setTierOpen(false);
                  }}
                  className="w-full text-left px-2 py-1.5"
                  style={{
                    color: "#F0F0FF",
                    fontSize: 12,
                    fontFamily: MONO,
                    borderRadius: 3,
                    background: tierFilter === t ? "rgba(0,212,255,0.1)" : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (tierFilter !== t)
                      e.currentTarget.style.background = "rgba(0,212,255,0.06)";
                  }}
                  onMouseLeave={(e) => {
                    if (tierFilter !== t) e.currentTarget.style.background = "transparent";
                  }}
                >
                  {t === "all" ? "All Tiers" : TIER_META[t].label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="ml-auto" style={{ color: "#8B8B9E", fontFamily: MONO, fontSize: 11 }}>
          {filtered.length} of {postings.length}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ color: "#8B8B9E" }}>Loading…</div>
      ) : postings.length === 0 ? (
        <div
          className="flex items-center justify-center"
          style={{
            height: 240,
            background: "#111118",
            border: "1px solid #1E1E2E",
            borderRadius: 6,
          }}
        >
          <p className="text-sm" style={{ color: "#8B8B9E" }}>
            No postings yet. Click &apos;Add Posting&apos; to score your first role.
          </p>
        </div>
      ) : (
        <PostingsTable
          rows={filtered}
          companyMap={companyMap}
          onRowClick={setSelectedId}
          onChanged={() => qc.invalidateQueries({ queryKey: ["postings"] })}
        />
      )}

      {/* Side panel */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent
          side="right"
          className="p-0 overflow-y-auto"
          style={{
            background: "#0A0A0F",
            border: "none",
            borderLeft: "1px solid #1E1E2E",
            width: 480,
            maxWidth: "100vw",
          }}
        >
          {selected && (
            <DetailPanel
              posting={selected}
              company={selected.company_id ? companyMap.get(selected.company_id) ?? null : null}
              onClose={() => setSelectedId(null)}
              onChanged={() => qc.invalidateQueries({ queryKey: ["postings"] })}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Add modal */}
      <AddPostingModal
        open={addOpen}
        onOpenChange={setAddOpen}
        companies={companies}
        onAdded={() => qc.invalidateQueries({ queryKey: ["postings"] })}
      />
    </div>
  );
}

// ---------- Filter pill ----------
function FilterPill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3"
      style={{
        height: 28,
        borderRadius: 4,
        border: "1px solid",
        borderColor: active ? "rgba(0,212,255,0.4)" : "transparent",
        background: active ? "rgba(0,212,255,0.1)" : "transparent",
        color: active ? "#00D4FF" : "#8B8B9E",
        fontFamily: MONO,
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
    >
      {label}
    </button>
  );
}

// ---------- Tier badge ----------
function TierBadge({ tier }: { tier: Tier }) {
  const m = TIER_META[tier];
  return (
    <span
      className="inline-flex items-center justify-center font-bold tracking-wider"
      style={{
        fontSize: 10,
        padding: "1px 6px",
        color: m.color,
        background: `color-mix(in oklab, ${m.color} 12%, transparent)`,
        border: `1px solid color-mix(in oklab, ${m.color} 30%, transparent)`,
        borderRadius: 3,
        fontFamily: MONO,
      }}
    >
      {m.short}
    </span>
  );
}

function StatusPill({ status }: { status: PostingStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      className="inline-flex items-center justify-center font-medium uppercase"
      style={{
        fontSize: 10,
        padding: "2px 8px",
        color: m.color,
        background: `color-mix(in oklab, ${m.color} 12%, transparent)`,
        border: `1px solid color-mix(in oklab, ${m.color} 30%, transparent)`,
        borderRadius: 3,
        fontFamily: MONO,
        letterSpacing: "0.06em",
      }}
    >
      {m.label}
    </span>
  );
}

// ---------- Table ----------
function PostingsTable({
  rows,
  companyMap,
  onRowClick,
  onChanged,
}: {
  rows: Posting[];
  companyMap: Map<string, CompanyLite>;
  onRowClick: (id: string) => void;
  onChanged: () => void;
}) {
  return (
    <div
      style={{
        background: "#111118",
        border: "1px solid #1E1E2E",
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      <div
        className="grid items-center px-3"
        style={{
          gridTemplateColumns: "minmax(180px,1.4fr) minmax(180px,1.6fr) 140px 80px 100px 90px 240px",
          height: 36,
          background: "#0D0D14",
          borderBottom: "1px solid #1E1E2E",
          color: "#8B8B9E",
          fontFamily: MONO,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          gap: 12,
        }}
      >
        <span>Company</span>
        <span>Role</span>
        <span>Location</span>
        <span className="text-right">AI Score</span>
        <span>Status</span>
        <span>Added</span>
        <span className="text-right">Actions</span>
      </div>
      {rows.map((p) => (
        <PostingRow
          key={p.id}
          posting={p}
          company={p.company_id ? companyMap.get(p.company_id) ?? null : null}
          onClick={() => onRowClick(p.id)}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}

function PostingRow({
  posting,
  company,
  onClick,
  onChanged,
}: {
  posting: Posting;
  company: CompanyLite | null;
  onClick: () => void;
  onChanged: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="company-row grid items-center px-3 cursor-pointer"
      style={{
        gridTemplateColumns: "minmax(180px,1.4fr) minmax(180px,1.6fr) 140px 80px 100px 90px 240px",
        height: 48,
        borderBottom: "1px solid #1E1E2E",
        color: "#F0F0FF",
        fontSize: 13,
        gap: 12,
      }}
    >
      <div className="flex items-center gap-2 truncate">
        {company && <TierBadge tier={company.tier} />}
        <span className="truncate">{company?.name ?? "—"}</span>
      </div>
      <div className="truncate">{posting.title}</div>
      <div className="truncate" style={{ color: "#8B8B9E" }}>
        {posting.location ?? "—"}
      </div>
      <div
        className="text-right tabular-nums"
        style={{
          fontFamily: MONO,
          fontSize: 13,
          fontWeight: 600,
          color: scoreColor(posting.ai_composite_score),
        }}
      >
        {posting.ai_composite_score != null ? posting.ai_composite_score.toFixed(1) : "—"}
      </div>
      <div>
        <StatusPill status={posting.status} />
      </div>
      <div style={{ color: "#8B8B9E", fontFamily: MONO, fontSize: 11 }}>
        {relativeTime(posting.scraped_at ?? posting.created_at)}
      </div>
      <RowActions posting={posting} company={company} onChanged={onChanged} />
    </div>
  );
}

async function setPostingStatus(id: string, status: PostingStatus) {
  const { error } = await gtmSupabase
    .from("job_postings" as never)
    .update({ status, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) throw error;
}

async function applyPosting(posting: Posting) {
  const now = new Date().toISOString();
  const { error: appErr } = await gtmSupabase
    .from("applications" as never)
    .insert({
      posting_id: posting.id,
      company_id: posting.company_id,
      role_title: posting.title,
      status: "applied",
      applied_at: now,
      last_status_change: now,
      contacts: [],
    } as never);
  if (appErr) throw appErr;
  await setPostingStatus(posting.id, "applied");
  await bumpTitleSignalOnApply(posting.title);
}

async function bumpTitleSignalOnApply(title: string) {
  const c = await fetchActiveCriteria();
  if (!c) return;
  const titles = [...(c.target_titles ?? [])];
  const idx = titles.findIndex((t) => t.title.toLowerCase() === title.toLowerCase());
  if (idx >= 0) {
    const t = titles[idx];
    const applied_count = t.applied_count + 1;
    const weight = Math.max(0.1, 1.0 + (applied_count - t.dismissed_count) * 0.2);
    titles[idx] = { ...t, applied_count, weight };
  } else {
    titles.push({ title, applied_count: 1, dismissed_count: 0, weight: 1.2 });
  }
  await gtmSupabase
    .from("role_criteria" as never)
    .update({ target_titles: titles, updated_at: new Date().toISOString() } as never)
    .eq("id", c.id);
}

async function bumpTitleFromFeedback(title: string, rating: number) {
  if (rating === 3) return;
  const c = await fetchActiveCriteria();
  if (!c) return;
  const titles = [...(c.target_titles ?? [])];
  const idx = titles.findIndex((t) => t.title.toLowerCase() === title.toLowerCase());
  const positive = rating >= 4;
  if (idx < 0) return;
  const t = titles[idx];
  const applied_count = positive ? Math.round((t.applied_count + 0.5) * 10) / 10 : t.applied_count;
  const dismissed_count = positive
    ? t.dismissed_count
    : Math.round((t.dismissed_count + 0.5) * 10) / 10;
  const weight = Math.max(0.1, 1.0 + (applied_count - dismissed_count) * 0.2);
  titles[idx] = { ...t, applied_count, dismissed_count, weight };
  await gtmSupabase
    .from("role_criteria" as never)
    .update({ target_titles: titles, updated_at: new Date().toISOString() } as never)
    .eq("id", c.id);
}

function RowActions({
  posting,
  company: _company,
  onChanged,
}: {
  posting: Posting;
  company: CompanyLite | null;
  onChanged: () => void;
}) {
  const m = useMutation({
    mutationFn: async (action: "save" | "dismiss" | "apply") => {
      if (action === "apply") await applyPosting(posting);
      else await setPostingStatus(posting.id, action === "save" ? "saved" : "dismissed");
    },
    onSuccess: (_d, action) => {
      onChanged();
      toast.success(
        action === "apply" ? "Moved to Applications" : action === "save" ? "Saved" : "Dismissed",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div className="flex items-center justify-end gap-1" onClick={stop}>
      <Button
        size="sm"
        variant="outline"
        disabled={m.isPending || posting.status === "saved"}
        onClick={() => m.mutate("save")}
        style={{
          height: 26,
          padding: "0 10px",
          border: "1px solid #1E1E2E",
          color: "#8B8B9E",
          background: "transparent",
          fontSize: 11,
        }}
      >
        Save
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={m.isPending || posting.status === "dismissed"}
        onClick={() => m.mutate("dismiss")}
        style={{
          height: 26,
          padding: "0 10px",
          border: "1px solid rgba(239,68,68,0.3)",
          color: "#EF4444",
          background: "transparent",
          fontSize: 11,
        }}
      >
        Dismiss
      </Button>
      <Button
        size="sm"
        disabled={m.isPending || posting.status === "applied"}
        onClick={() => m.mutate("apply")}
        style={{
          height: 26,
          padding: "0 10px",
          background: "#00D4FF",
          color: "#0A0A0F",
          fontSize: 11,
        }}
      >
        Apply
      </Button>
    </div>
  );
}

// ---------- Detail Panel ----------
function DetailPanel({
  posting,
  company,
  onClose,
  onChanged,
}: {
  posting: Posting;
  company: CompanyLite | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [jdOpen, setJdOpen] = useState(false);
  const [overridesOpen, setOverridesOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(posting.martin_feedback_score ?? null);
  const [comment, setComment] = useState(posting.martin_feedback_comment ?? "");
  const [overrides, setOverrides] = useState<
    Record<string, { score: string; reason: string }>
  >(() => {
    const init: Record<string, { score: string; reason: string }> = {};
    PARAM_KEYS.forEach((k) => {
      const v = posting.martin_feedback_overrides?.[k];
      init[k] = { score: v ? String(v.score) : "", reason: v?.reason ?? "" };
    });
    return init;
  });
  const [savingFb, setSavingFb] = useState(false);

  useEffect(() => {
    setRating(posting.martin_feedback_score ?? null);
    setComment(posting.martin_feedback_comment ?? "");
    const init: Record<string, { score: string; reason: string }> = {};
    PARAM_KEYS.forEach((k) => {
      const v = posting.martin_feedback_overrides?.[k];
      init[k] = { score: v ? String(v.score) : "", reason: v?.reason ?? "" };
    });
    setOverrides(init);
  }, [posting.id]);

  const finalScore = posting.ai_composite_score;
  const params = posting.ai_rationale?.parameter_scores ?? {};
  const bonuses = posting.ai_rationale?.bonuses_applied ?? [];
  const summary = posting.ai_rationale?.summary;

  async function saveFeedback() {
    if (rating == null) {
      toast.error("Give an overall rating first");
      return;
    }
    setSavingFb(true);
    try {
      const overridePayload: Record<string, { score: number; reason: string }> = {};
      PARAM_KEYS.forEach((k) => {
        const v = overrides[k];
        if (v && v.score.trim() !== "") {
          const n = Number(v.score);
          if (!Number.isNaN(n) && n >= 1 && n <= 5) {
            overridePayload[k] = { score: n, reason: v.reason };
          }
        }
      });
      const { error: upErr } = await gtmSupabase
        .from("job_postings" as never)
        .update({
          martin_feedback_score: rating,
          martin_feedback_overrides: Object.keys(overridePayload).length
            ? overridePayload
            : null,
          martin_feedback_comment: comment || null,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", posting.id);
      if (upErr) throw upErr;
      const { error: logErr } = await gtmSupabase
        .from("feedback_log" as never)
        .insert({
          posting_id: posting.id,
          posting_title: posting.title,
          ai_score: posting.ai_composite_score,
          ai_rationale_snapshot: posting.ai_rationale ?? null,
          martin_score: rating,
          martin_overrides: Object.keys(overridePayload).length ? overridePayload : null,
          comment: comment || null,
          used_in_prompt: false,
        } as never);
      if (logErr) throw logErr;
      await bumpTitleFromFeedback(posting.title, rating);
      toast.success("Feedback saved");
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingFb(false);
    }
  }

  const actionMut = useMutation({
    mutationFn: async (action: "save" | "dismiss" | "apply") => {
      if (action === "apply") await applyPosting(posting);
      else await setPostingStatus(posting.id, action === "save" ? "saved" : "dismissed");
    },
    onSuccess: (_d, action) => {
      onChanged();
      toast.success(
        action === "apply" ? "Moved to Applications" : action === "save" ? "Saved" : "Dismissed",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col" style={{ minHeight: "100vh" }}>
      {/* Header */}
      <div
        className="flex items-start justify-between px-5 pt-5 pb-4"
        style={{ borderBottom: "1px solid #1E1E2E" }}
      >
        <div className="flex flex-col gap-1.5 min-w-0">
          <div style={{ color: "#F0F0FF", fontSize: 18, fontWeight: 600 }} className="truncate">
            {posting.title}
          </div>
          <div className="flex items-center gap-2">
            {company && <TierBadge tier={company.tier} />}
            <span style={{ color: "#8B8B9E", fontSize: 13 }} className="truncate">
              {company?.name ?? "Unknown company"}
            </span>
          </div>
          <div style={{ color: "#8B8B9E", fontSize: 12, fontFamily: MONO }}>
            {posting.location ?? "—"}
          </div>
          {posting.jd_url && (
            <a
              href={posting.jd_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1"
              style={{ color: "#00D4FF", fontSize: 12 }}
            >
              View original posting <ExternalLink size={11} />
            </a>
          )}
          <div className="pt-1">
            <StatusPill status={posting.status} />
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ color: "#8B8B9E", padding: 4 }}
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      {/* Scoring */}
      <Section title="AI Scoring Breakdown">
        {posting.ai_composite_score == null && !posting.disqualified ? (
          <div style={{ color: "#8B8B9E", fontSize: 13 }}>Scoring in progress…</div>
        ) : posting.disqualified ? (
          <div
            className="px-3 py-2"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 6,
              color: "#EF4444",
              fontSize: 13,
            }}
          >
            Disqualified: {posting.disqualifier_reason ?? "No reason given"}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-end gap-4">
              <div className="flex flex-col">
                <span
                  className="uppercase"
                  style={{
                    color: "#8B8B9E",
                    fontSize: 10,
                    fontFamily: MONO,
                    letterSpacing: "0.08em",
                  }}
                >
                  Final
                </span>
                <span
                  className="font-bold tabular-nums"
                  style={{ color: scoreColor(finalScore), fontFamily: MONO, fontSize: 28 }}
                >
                  {finalScore != null ? finalScore.toFixed(1) : "—"}
                  <span style={{ fontSize: 14, color: "#8B8B9E" }}> / 25</span>
                </span>
              </div>
              <div className="flex flex-col">
                <span
                  className="uppercase"
                  style={{
                    color: "#8B8B9E",
                    fontSize: 10,
                    fontFamily: MONO,
                    letterSpacing: "0.08em",
                  }}
                >
                  Company
                </span>
                <span
                  className="font-bold tabular-nums"
                  style={{ color: "#F0F0FF", fontFamily: MONO, fontSize: 20 }}
                >
                  {posting.ai_company_score ?? "—"}
                </span>
              </div>
              {posting.title_signal && (
                <TitleSignalBadge signal={posting.title_signal} />
              )}
            </div>
            <div className="flex flex-col" style={{ border: "1px solid #1E1E2E", borderRadius: 6 }}>
              {PARAM_KEYS.map((k, i) => {
                const ps = params[k] as ParameterScore | undefined;
                return (
                  <div
                    key={k}
                    className="flex items-start gap-3 px-3 py-2"
                    style={{
                      borderTop: i === 0 ? undefined : "1px solid #1E1E2E",
                      fontSize: 12,
                    }}
                  >
                    <span
                      style={{
                        color: "#8B8B9E",
                        fontFamily: MONO,
                        fontSize: 11,
                        minWidth: 80,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {PARAM_LABEL[k]}
                    </span>
                    <span
                      className="tabular-nums"
                      style={{
                        color: "#F0F0FF",
                        fontFamily: MONO,
                        fontWeight: 600,
                        minWidth: 18,
                      }}
                    >
                      {ps?.score ?? "—"}
                    </span>
                    <span style={{ color: "#F0F0FF" }} className="flex-1">
                      {ps?.rationale ?? "—"}
                    </span>
                  </div>
                );
              })}
            </div>
            {bonuses.length > 0 && (
              <div style={{ color: "#8B8B9E", fontSize: 12 }}>
                <span style={{ fontFamily: MONO, textTransform: "uppercase", fontSize: 10 }}>
                  Bonuses:{" "}
                </span>
                {bonuses
                  .map((b) =>
                    typeof b === "string" ? b : `${b.name} (+${b.value})`,
                  )
                  .join(", ")}
              </div>
            )}
            {summary && (
              <div
                className="italic"
                style={{
                  color: "#F0F0FF",
                  fontSize: 13,
                  borderLeft: "2px solid rgba(0,212,255,0.4)",
                  paddingLeft: 10,
                }}
              >
                {summary}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Feedback */}
      <Section title="Your Feedback">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label style={{ color: "#8B8B9E", fontSize: 11, fontFamily: MONO }}>
              Your overall rating
            </label>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setRating(n)}
                  className="tabular-nums"
                  style={{
                    width: 36,
                    height: 32,
                    borderRadius: 4,
                    border: "1px solid",
                    borderColor: rating === n ? "rgba(0,212,255,0.5)" : "#1E1E2E",
                    background: rating === n ? "rgba(0,212,255,0.12)" : "#111118",
                    color: rating === n ? "#00D4FF" : "#F0F0FF",
                    fontFamily: MONO,
                    fontWeight: 600,
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setOverridesOpen((v) => !v)}
            className="text-left"
            style={{
              color: "#00D4FF",
              fontSize: 12,
              fontFamily: MONO,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Override AI scoring {overridesOpen ? "↑" : "↓"}
          </button>
          {overridesOpen && (
            <div className="flex flex-col gap-2">
              {PARAM_KEYS.map((k) => (
                <div key={k} className="grid items-center gap-2" style={{ gridTemplateColumns: "80px 60px 1fr" }}>
                  <span style={{ color: "#8B8B9E", fontSize: 11, fontFamily: MONO }}>
                    {PARAM_LABEL[k]}
                  </span>
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    placeholder="1-5"
                    value={overrides[k]?.score ?? ""}
                    onChange={(e) =>
                      setOverrides((o) => ({
                        ...o,
                        [k]: { ...o[k], score: e.target.value },
                      }))
                    }
                    style={{
                      background: "#111118",
                      border: "1px solid #1E1E2E",
                      color: "#F0F0FF",
                      fontFamily: MONO,
                      height: 32,
                    }}
                  />
                  <Input
                    placeholder="Why did you change this?"
                    value={overrides[k]?.reason ?? ""}
                    onChange={(e) =>
                      setOverrides((o) => ({
                        ...o,
                        [k]: { ...o[k], reason: e.target.value },
                      }))
                    }
                    style={{
                      background: "#111118",
                      border: "1px solid #1E1E2E",
                      color: "#F0F0FF",
                      height: 32,
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          <Textarea
            placeholder="Any notes on this role or the AI scoring..."
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            style={{ background: "#111118", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
          />

          <div>
            <Button
              onClick={saveFeedback}
              disabled={savingFb}
              style={{ background: "#00D4FF", color: "#0A0A0F" }}
            >
              {savingFb ? "Saving…" : "Save Feedback"}
            </Button>
          </div>
        </div>
      </Section>

      {/* Actions */}
      <Section title="Actions">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={actionMut.isPending || posting.status === "dismissed"}
            onClick={() => actionMut.mutate("dismiss")}
            style={{
              border: "1px solid rgba(239,68,68,0.3)",
              color: "#EF4444",
              background: "transparent",
            }}
          >
            Dismiss
          </Button>
          <Button
            variant="outline"
            disabled={actionMut.isPending || posting.status === "saved"}
            onClick={() => actionMut.mutate("save")}
            style={{ border: "1px solid #1E1E2E", color: "#8B8B9E", background: "transparent" }}
          >
            Save for Later
          </Button>
          <Button
            disabled={actionMut.isPending || posting.status === "applied"}
            onClick={() => actionMut.mutate("apply")}
            style={{ background: "#00D4FF", color: "#0A0A0F" }}
          >
            Apply
          </Button>
        </div>
      </Section>

      {/* JD */}
      <Section title="">
        <button
          onClick={() => setJdOpen((v) => !v)}
          className="text-left w-full"
          style={{
            color: "#00D4FF",
            fontSize: 12,
            fontFamily: MONO,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          View full job description {jdOpen ? "↑" : "↓"}
        </button>
        {jdOpen && (
          <div
            className="mt-2 px-3 py-2 whitespace-pre-wrap"
            style={{
              background: "#0D0D14",
              border: "1px solid #1E1E2E",
              borderRadius: 6,
              maxHeight: 360,
              overflowY: "auto",
              color: "#F0F0FF",
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {posting.jd_full ?? "(no description)"}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4" style={{ borderBottom: "1px solid #1E1E2E" }}>
      {title && (
        <div
          className="uppercase mb-3"
          style={{
            color: "#8B8B9E",
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: "0.1em",
          }}
        >
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

function TitleSignalBadge({ signal }: { signal: string }) {
  const s = signal.toLowerCase();
  const meta =
    s === "matching" || s === "match"
      ? { label: "Title match", color: "#10B981" }
      : s.startsWith("partial")
        ? { label: "Partial match", color: "#F59E0B" }
        : { label: "No title match", color: "#8B8B9E" };
  return (
    <span
      className="inline-flex items-center font-medium uppercase"
      style={{
        fontSize: 10,
        padding: "3px 8px",
        color: meta.color,
        background: `color-mix(in oklab, ${meta.color} 12%, transparent)`,
        border: `1px solid color-mix(in oklab, ${meta.color} 30%, transparent)`,
        borderRadius: 3,
        fontFamily: MONO,
        letterSpacing: "0.06em",
      }}
    >
      {meta.label}
    </span>
  );
}

// ---------- Add Posting Modal ----------
function AddPostingModal({
  open,
  onOpenChange,
  companies,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companies: CompanyLite[];
  onAdded: () => void;
}) {
  const score = useSF(scoreJobPosting);
  const [companyId, setCompanyId] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [companyOpen, setCompanyOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [jdUrl, setJdUrl] = useState("");
  const [jdFull, setJdFull] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setCompanyId("");
      setCompanySearch("");
      setTitle("");
      setLocation("");
      setJdUrl("");
      setJdFull("");
    }
  }, [open]);

  const selectedCompany = companies.find((c) => c.id === companyId) ?? null;
  const filteredCompanies = companies.filter((c) =>
    c.name.toLowerCase().includes(companySearch.toLowerCase()),
  );

  async function submit() {
    if (!companyId) return toast.error("Company is required");
    if (!title.trim()) return toast.error("Role title is required");
    if (!location.trim()) return toast.error("Location is required");
    if (!jdFull.trim()) return toast.error("Job description is required");

    setBusy(true);
    try {
      const company = companies.find((c) => c.id === companyId) ?? null;
      const companyScore = company
        ? (company.brand_score ?? 0) +
          (company.ai_score ?? 0) +
          (company.shot_score ?? 0) +
          (company.comp_score ?? 0) +
          (company.location_score ?? 0)
        : null;

      const now = new Date().toISOString();
      const { data: ins, error: insErr } = await gtmSupabase
        .from("job_postings" as never)
        .insert({
          company_id: companyId,
          title: title.trim(),
          location: location.trim(),
          jd_url: jdUrl.trim() || null,
          jd_full: jdFull,
          source: "manual",
          status: "new",
          scraped_at: now,
          ai_company_score: companyScore,
        } as never)
        .select("id")
        .single();
      if (insErr || !ins) throw insErr ?? new Error("Insert failed");
      const postingId = (ins as { id: string }).id;

      // Build prompts
      const criteria = await fetchActiveCriteria();
      if (!criteria) throw new Error("No active role_criteria row found");
      const system = buildSystemPrompt(criteria, company);
      const user = buildUserPrompt(title.trim(), location.trim(), jdFull);

      const res = await score({ data: { system, user } });
      const parsed = extractJson(res.text) as {
        disqualified?: boolean;
        disqualifier_reason?: string | null;
        parameter_scores?: Record<string, ParameterScore>;
        bonuses_applied?: unknown[];
        final_score?: number;
        title_signal?: string;
        summary?: string;
      };

      const finalScore = typeof parsed.final_score === "number" ? parsed.final_score : null;
      const rationale: AiRationale = {
        parameter_scores: parsed.parameter_scores,
        bonuses_applied: (parsed.bonuses_applied ?? []) as AiRationale["bonuses_applied"],
        summary: parsed.summary,
      };

      const { error: upErr } = await gtmSupabase
        .from("job_postings" as never)
        .update({
          ai_role_score: finalScore,
          ai_composite_score: finalScore,
          ai_rationale: rationale,
          disqualified: parsed.disqualified ?? false,
          disqualifier_reason: parsed.disqualifier_reason ?? null,
          title_signal: parsed.title_signal ?? null,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", postingId);
      if (upErr) throw upErr;

      toast.success("Posting scored");
      onAdded();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{
          background: "#0D0D14",
          border: "1px solid #1E1E2E",
          color: "#F0F0FF",
          maxWidth: 560,
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: "#F0F0FF", fontFamily: MONO }}>Add Posting</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label style={{ color: "#8B8B9E", fontSize: 11, fontFamily: MONO }}>Company</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setCompanyOpen((v) => !v)}
                className="w-full flex items-center justify-between px-3"
                style={{
                  height: 36,
                  background: "#111118",
                  border: "1px solid #1E1E2E",
                  borderRadius: 6,
                  color: selectedCompany ? "#F0F0FF" : "#8B8B9E",
                  fontSize: 13,
                }}
              >
                <span className="flex items-center gap-2 truncate">
                  {selectedCompany ? (
                    <>
                      {selectedCompany.name} <TierBadge tier={selectedCompany.tier} />
                    </>
                  ) : (
                    "Select company"
                  )}
                </span>
                <ChevronDown size={12} />
              </button>
              {companyOpen && (
                <div
                  className="absolute left-0 right-0 mt-1 z-10 p-2"
                  style={{
                    background: "#111118",
                    border: "1px solid #1E1E2E",
                    borderRadius: 6,
                    maxHeight: 260,
                    overflowY: "auto",
                  }}
                >
                  <Input
                    placeholder="Search..."
                    value={companySearch}
                    onChange={(e) => setCompanySearch(e.target.value)}
                    autoFocus
                    style={{
                      background: "#0A0A0F",
                      border: "1px solid #1E1E2E",
                      color: "#F0F0FF",
                      marginBottom: 6,
                    }}
                  />
                  {filteredCompanies.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCompanyId(c.id);
                        setCompanyOpen(false);
                        setCompanySearch("");
                      }}
                      className="w-full flex items-center justify-between px-2 py-1.5 text-left"
                      style={{ color: "#F0F0FF", fontSize: 13, borderRadius: 3 }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "rgba(0,212,255,0.08)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <span className="truncate">{c.name}</span>
                      <TierBadge tier={c.tier} />
                    </button>
                  ))}
                  {filteredCompanies.length === 0 && (
                    <div className="px-2 py-1.5" style={{ color: "#8B8B9E", fontSize: 12 }}>
                      No matches
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <Field label="Role title">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Enterprise Account Executive"
              style={{ background: "#111118", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
            />
          </Field>
          <Field label="Location">
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Berlin / Remote EU"
              style={{ background: "#111118", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
            />
          </Field>
          <Field label="JD URL (optional)">
            <Input
              value={jdUrl}
              onChange={(e) => setJdUrl(e.target.value)}
              placeholder="https://..."
              style={{ background: "#111118", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
            />
          </Field>
          <Field label="Job Description">
            <Textarea
              value={jdFull}
              onChange={(e) => setJdFull(e.target.value)}
              rows={10}
              placeholder="Paste the full job description here..."
              style={{ background: "#111118", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
              style={{ border: "1px solid #1E1E2E", color: "#8B8B9E", background: "transparent" }}
            >
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={busy}
              style={{ background: "#00D4FF", color: "#0A0A0F" }}
            >
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner /> Scoring…
                </span>
              ) : (
                "Save & Score with AI"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label style={{ color: "#8B8B9E", fontSize: 11, fontFamily: MONO }}>{label}</label>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <span
      style={{
        width: 12,
        height: 12,
        borderRadius: "50%",
        border: "2px solid rgba(10,10,15,0.3)",
        borderTopColor: "#0A0A0F",
        display: "inline-block",
        animation: "spin 0.7s linear infinite",
      }}
    />
  );
}
