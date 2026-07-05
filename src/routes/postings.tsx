import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn as useSF } from "@tanstack/react-start";
import { ChevronDown, ChevronLeft, ChevronRight, Plus, X, ExternalLink, Sparkles, AlertTriangle } from "lucide-react";
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
type PostingStatus = "new" | "saved" | "dismissed" | "applied" | "reviewed" | "expired";
type TierFilter = "all" | Tier;
type CompanyFilter = "all" | string;

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
  posted_at: string | null;
  deadline_at: string | null;
};

type CompanyLite = {
  id: string;
  name: string;
  tier: Tier;
  brand_score: number;
  ai_score: number;
  shot_score: number;
  comp_score: number;
  loc_score: number;
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
  system_template?: string | null;
  user_template?: string | null;
  use_custom?: boolean | null;
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

function ageDays(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function effectiveExpiry(p: {
  deadline_at: string | null;
  posted_at: string | null;
  created_at: string;
}, lifespanDays: number): number {
  if (p.deadline_at) return new Date(p.deadline_at).getTime();
  const base = new Date(p.posted_at ?? p.created_at).getTime();
  return base + lifespanDays * 86400000;
}

function shortAge(iso: string): string {
  const d = ageDays(iso);
  if (d <= 0) return "today";
  if (d < 30) return `${d}d old`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo old`;
  return `${Math.floor(d / 365)}y old`;
}

function deadlineIndicator(deadlineIso: string): { text: string; color: string } {
  const ms = new Date(deadlineIso).getTime() - Date.now();
  const d = Math.ceil(ms / 86400000);
  if (d < 0) return { text: "closed", color: "#6B7280" };
  if (d === 0) return { text: "closes today", color: "#EF4444" };
  if (d <= 3) return { text: `closes in ${d}d`, color: "#EF4444" };
  if (d <= 7) return { text: `closes in ${d}d`, color: "#F59E0B" };
  return { text: `closes in ${d}d`, color: "#8B8B9E" };
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
  reviewed: { label: "Reviewed", color: "#00D4FF" },
  saved: { label: "Saved", color: "#7C3AED" },
  applied: { label: "Applied", color: "#10B981" },
  dismissed: { label: "Dismissed", color: "#8B8B9E" },
  expired: { label: "Expired", color: "#6B7280" },
};

// ---------- Data ----------
type ListFilters = {
  status: PostingStatus;
  tier: TierFilter;
  companyId: CompanyFilter;
  unscoredOnly: boolean;
};

const LIST_COLUMNS =
  "id,company_id,title,location,source,scraped_at,ai_company_score,ai_role_score,ai_composite_score,ai_rationale,disqualified,disqualifier_reason,martin_feedback_score,martin_feedback_comment,martin_feedback_overrides,title_signal,posted_at,deadline_at,status,created_at,updated_at";

async function fetchPostingsPage(
  filters: ListFilters,
  tierCompanyIds: string[] | null,
  page: number,
  pageSize: number,
): Promise<{ rows: Posting[]; total: number }> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let q = gtmSupabase
    .from("job_postings" as never)
    .select(LIST_COLUMNS, { count: "exact" })
    .eq("status", filters.status);
  if (filters.unscoredOnly && filters.status === "new") {
    q = q.is("ai_composite_score", null);
  }
  if (filters.tier !== "all") {
    if (!tierCompanyIds || tierCompanyIds.length === 0) return { rows: [], total: 0 };
    q = q.in("company_id", tierCompanyIds);
  }
  if (filters.companyId !== "all") {
    q = q.eq("company_id", filters.companyId);
  }
  q = q
    .order("ai_composite_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, to);
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as unknown as Posting[], total: count ?? 0 };
}

async function fetchPostingCounts(): Promise<{ newCount: number; unscoredCount: number }> {
  const [a, b] = await Promise.all([
    gtmSupabase
      .from("job_postings" as never)
      .select("id", { count: "exact", head: true })
      .eq("status", "new"),
    gtmSupabase
      .from("job_postings" as never)
      .select("id", { count: "exact", head: true })
      .eq("status", "new")
      .is("ai_composite_score", null),
  ]);
  return { newCount: a.count ?? 0, unscoredCount: b.count ?? 0 };
}

async function fetchUnscoredCountFiltered(
  tierCompanyIds: string[] | null,
  companyId: CompanyFilter,
): Promise<number> {
  let q = gtmSupabase
    .from("job_postings" as never)
    .select("id", { count: "exact", head: true })
    .eq("status", "new")
    .is("ai_composite_score", null);
  if (tierCompanyIds) {
    if (tierCompanyIds.length === 0) return 0;
    q = q.in("company_id", tierCompanyIds);
  }
  if (companyId !== "all") q = q.eq("company_id", companyId);
  const { count } = await q;
  return count ?? 0;
}

async function fetchUnscoredTargets(
  tierCompanyIds: string[] | null,
  companyId: CompanyFilter,
  max: number,
): Promise<Posting[]> {
  let q = gtmSupabase
    .from("job_postings" as never)
    .select("id,company_id,title,location,jd_full,deadline_at,status")
    .eq("status", "new")
    .is("ai_composite_score", null);
  if (tierCompanyIds) {
    if (tierCompanyIds.length === 0) return [];
    q = q.in("company_id", tierCompanyIds);
  }
  if (companyId !== "all") q = q.eq("company_id", companyId);
  q = q.order("created_at", { ascending: false }).limit(max);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as Posting[];
}

async function fetchPostingById(id: string): Promise<Posting | null> {
  const { data, error } = await gtmSupabase
    .from("job_postings" as never)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Posting) ?? null;
}

async function fetchCompanies(): Promise<CompanyLite[]> {
  const res = await gtmSupabase
    .from("companies")
    .select("id,name,tier,brand_score,ai_score,shot_score,comp_score,loc_score,notes")
    .order("name", { ascending: true });
  // eslint-disable-next-line no-console
  console.log("[postings] fetchCompanies response", res);
  if (res.error) throw res.error;
  return (res.data ?? []) as unknown as CompanyLite[];
}

async function fetchDistinctLocations(): Promise<string[]> {
  const { data, error } = await gtmSupabase
    .from("job_postings" as never)
    .select("location")
    .not("location", "is", null)
    .order("location");
  if (error) throw error;
  const seen = new Set<string>();
  for (const row of (data ?? []) as { location: string | null }[]) {
    const raw = row.location ?? "";
    // Split comma-separated stored values so each city is its own suggestion
    for (const part of raw.split(",")) {
      const v = part.trim();
      if (v) seen.add(v);
    }
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

function toTitleCase(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function normalizeLocationInput(s: string): string {
  // Preserve comma separation, title-case each segment, drop empties
  return s
    .split(",")
    .map((p) => toTitleCase(p))
    .filter(Boolean)
    .join(", ");
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
const WEIGHT_LABELS: Record<string, string> = {
  comp: "Comp Potential",
  role_fit: "Role-Profile Fit",
  fit: "Role-Profile Fit",
  seniority: "Seniority Fit",
  location: "Location",
  competition: "Competition Level",
};

function formatWeights(weights: Record<string, number> | null | undefined): string {
  if (!weights) return "(weights not configured)";
  const order = ["comp", "role_fit", "seniority", "location", "competition"];
  const parts: string[] = [];
  for (const k of order) {
    const v = weights[k];
    if (typeof v === "number") {
      parts.push(`${WEIGHT_LABELS[k] ?? k} ${Math.round(v * 100)}%`);
    }
  }
  for (const [k, v] of Object.entries(weights)) {
    if (order.includes(k)) continue;
    if (typeof v === "number") parts.push(`${WEIGHT_LABELS[k] ?? k} ${Math.round(v * 100)}%`);
  }
  return parts.join(", ");
}

type FeedbackContext = { text: string; ids: string[] };

async function fetchFeedbackContext(): Promise<FeedbackContext> {
  const { data, error } = await gtmSupabase
    .from("feedback_log" as never)
    .select("id,posting_title,ai_score,martin_score,martin_overrides,comment,created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error || !data) return { text: "", ids: [] };
  const rows = data as unknown as Array<{
    id: string;
    posting_title: string | null;
    ai_score: number | null;
    martin_score: number | null;
    martin_overrides: Record<string, { score: number; reason: string }> | null;
    comment: string | null;
  }>;
  const overrideLines: string[] = [];
  const overallLines: string[] = [];
  const ids: string[] = [];
  for (const r of rows) {
    ids.push(r.id);
    const title = (r.posting_title ?? "untitled").replace(/"/g, "'");
    if (r.martin_overrides && Object.keys(r.martin_overrides).length > 0) {
      for (const [param, v] of Object.entries(r.martin_overrides)) {
        const label = PARAM_LABEL[param as ParamKey] ?? param;
        const reason = (v.reason ?? "").trim().slice(0, 220);
        overrideLines.push(
          `- "${title}": AI scored ${label} differently; user corrected ${label} to ${v.score}.${reason ? ` Reason: ${reason}` : ""}`,
        );
      }
    } else if (r.martin_score != null) {
      const cmt = (r.comment ?? "").trim().slice(0, 200);
      const ai = r.ai_score != null ? r.ai_score.toFixed(1) : "—";
      overallLines.push(
        `- "${title}": AI scored ${ai}, user rated it ${r.martin_score}/5.${cmt ? ` ${cmt}` : ""}`,
      );
    }
  }
  const parts: string[] = [];
  if (overrideLines.length) parts.push("Parameter-level corrections:\n" + overrideLines.join("\n"));
  if (overallLines.length) parts.push("Overall ratings:\n" + overallLines.join("\n"));
  let text = parts.join("\n\n");
  const MAX = 3500;
  if (text.length > MAX) text = text.slice(0, MAX) + "\n…(truncated)";
  return { text, ids };
}

async function markFeedbackUsed(ids: string[]) {
  if (ids.length === 0) return;
  try {
    await gtmSupabase
      .from("feedback_log" as never)
      .update({ used_in_prompt: true } as never)
      .in("id", ids);
  } catch {
    // best effort
  }
}

export const DEFAULT_SYSTEM_TEMPLATE = `{{background}}

You are an expert technical recruiter and career strategist scoring ONE job posting for this candidate. Decide how strongly he should prioritize applying, so the highest-scoring postings are genuinely his best opportunities. Be rigorous and calibrated: most scraped postings are NOT a fit and should score low or be disqualified. Reserve high scores for real matches.

# Candidate priorities (in order)
1. Future career optionality (brand + trajectory that opens doors)
2. Compensation — target €150K+ total; Enterprise AE is his highest-comp path
3. Prestige / brand recognition
He is a founder-operator who is genuinely excellent at enterprise/technical sales — not a typical salesperson. Strongest for: selling technical products to CTOs/VPs Eng/product teams, building GTM from scratch, outbound motion, international/LatAm expansion, and AI-native or infrastructure/API/devtools/IoT/telco companies. Weaker for: pure SMB/velocity/inbound sales, roles that assume a deep structured enterprise-sales playbook at massive scale, or roles needing vertical expertise he lacks (legal, defense, regulated healthcare). His deal sizes were mid-market (up to ~$40K MRR) with technical buyers; his background reads somewhat telco and he is actively pivoting into AI/tech.

# Step 1 — Relevance gate (do this FIRST)
Decide if the core work is commercial GTM: enterprise/mid-market sales, business development, strategic partnerships, revenue leadership, or GTM/commercial strategy. If the role is primarily engineering, research, product management, design, data science, customer support, recruiting, finance, or content marketing, set "disqualified": true and "disqualifier_reason": "Not a commercial GTM role". Never score an off-profile role highly just because the company is prestigious.

# Step 2 — Hard disqualifiers (auto-reject: set disqualified=true with the matching reason)
{{disqualifiers}}
Apply literally, but avoid false positives: disqualify on language ONLY if the role requires working primarily in a language other than English or Spanish (a nice-to-have language is fine); disqualify junior/associate/SDR/BDR/coordinator TITLES even at great companies; disqualify roles based only in excluded locations with no remote or accepted-city option.

# Step 3 — Score each parameter 1–5 from concrete JD evidence (not the title alone)
Weights: {{weights}}.
Rubric:
{{rubric}}

Scoring discipline:
- Comp: infer realistic total OTE from role type + company tier + market, not only any stated range.
- Role-Profile Fit: reward technical/enterprise sales to CTOs/product, GTM-building, outbound, IoT/telco/API/devtools/AI, LatAm/international; lower it for SMB/inbound-only or roles that assume big-company structured-playbook experience he lacks.
- Seniority: right level = Senior IC, Lead, Head of, Manager/Director of a function, or Enterprise-level IC; far-too-senior (VP/C-level at a large company) scores low.
- Location: score the ROLE's city/remote policy per the rubric.
- Competition: LOWER competition = HIGHER score. Niche roles, less-known companies, or rare skill-match (LatAm/technical/multilingual edge) score high; marquee roles at Anthropic/OpenAI/Stripe score low.

# Step 4 — Bonuses (add only when clearly justified by the JD)
{{bonuses}}

# Step 5 — Final score (compute it, do not estimate)
final_score = ( sum of each parameter_score × its weight ) × 5, then add every applicable bonus value. Because the weights sum to 1.0, the weighted average is 1–5 and ×5 puts the base on a 0–25 scale comparable to the company score; bonuses are added on top. Round to one decimal.

# Title signal (soft prior only — never overrides the JD)
{{titles}}
Return "title_signal" as one of: "strong" (title closely matches a high-weight target title), "matching" (clearly a relevant commercial title), "weak" (commercial but off-target), or "off" (not a commercial title). Always read the full JD regardless of title.

# Company context
{{company}}
Use company tier/scores to inform Comp, Competition, and brand — but do NOT inflate a poor-fit role because the company is strong.{{feedback}}`;

export const DEFAULT_USER_TEMPLATE = `Score this job posting for the candidate.

Title: {{title}}
Location: {{location}}
Job Description:
{{jd}}

Work through the 5 steps internally, then respond with ONLY this JSON (no prose before or after, no markdown fences):
{
  "disqualified": false,
  "disqualifier_reason": null,
  "parameter_scores": {
    "comp": {"score": 4, "rationale": "<=15 words citing JD evidence"},
    "fit": {"score": 4, "rationale": "<=15 words"},
    "seniority": {"score": 4, "rationale": "<=15 words"},
    "location": {"score": 4, "rationale": "<=15 words"},
    "competition": {"score": 4, "rationale": "<=15 words"}
  },
  "bonuses_applied": [{"name": "exact bonus name", "value": 0.5}],
  "final_score": 18.5,
  "title_signal": "matching",
  "summary": "one-sentence verdict: the single most important reason to apply or skip",
  "deadline": null
}

Rules:
- parameter_scores keys must be exactly comp, fit, seniority, location, competition; each score an integer 1-5.
- If disqualified is true, still fill parameter_scores with your best estimate and compute final_score normally, but summary must state the disqualifier.
- bonuses_applied lists only bonuses you actually applied, each with its exact name and numeric value from the bonus list; use [] if none.
- final_score must equal the Step 5 computation, rounded to one decimal.
- For "deadline": only if the JD explicitly states an application deadline/closing date, return ISO YYYY-MM-DD; otherwise null. Do not guess.`;

export function applyTemplate(tpl: string, vars: Record<string, string>): string {
  let out = tpl;
  for (const [k, v] of Object.entries(vars)) out = out.split(`{{${k}}}`).join(v ?? "");
  return out;
}

function buildSystemPrompt(

  criteria: RoleCriteria,
  company: CompanyLite | null,
  backgroundSummary?: string | null,
  feedbackContext?: string,
): string {
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
    ? `Name: ${company.name}\nTier: ${company.tier}\nBrand: ${company.brand_score}/5, AI: ${company.ai_score}/5, Shot: ${company.shot_score}/5, Comp: ${company.comp_score}/5, Location: ${company.loc_score}/5\nNotes: ${company.notes ?? "(none)"}`
    : "Company not matched in database.";

  const bg = (backgroundSummary ?? "").trim();
  const opener = bg
    ? `You are scoring a job posting for a candidate with the following background:\n${bg}`
    : `You are scoring a job posting for a senior commercial / GTM professional.`;

  const fb = (feedbackContext ?? "").trim();
  const feedbackSection = fb
    ? `\n\n# Calibration from the user's past feedback (secondary signal — tendencies, NOT hard rules; the Role Criteria above remain the primary framework)\n${fb}\nUse these to calibrate borderline judgments; do not let them override the Role Criteria.`
    : "";

  if (criteria.use_custom && criteria.system_template && criteria.system_template.trim()) {
    return applyTemplate(criteria.system_template, {
      background: opener,
      weights: formatWeights(criteria.weights),
      rubric: rubricText,
      disqualifiers,
      bonuses,
      titles,
      company: companyContext,
      feedback: feedbackSection,
    });
  }

  return `${opener}


You are an expert technical recruiter and career strategist scoring ONE job posting for this candidate. Decide how strongly he should prioritize applying, so the highest-scoring postings are genuinely his best opportunities. Be rigorous and calibrated: most scraped postings are NOT a fit and should score low or be disqualified. Reserve high scores for real matches.

# Candidate priorities (in order)
1. Future career optionality (brand + trajectory that opens doors)
2. Compensation — target €150K+ total; Enterprise AE is his highest-comp path
3. Prestige / brand recognition
He is a founder-operator who is genuinely excellent at enterprise/technical sales — not a typical salesperson. Strongest for: selling technical products to CTOs/VPs Eng/product teams, building GTM from scratch, outbound motion, international/LatAm expansion, and AI-native or infrastructure/API/devtools/IoT/telco companies. Weaker for: pure SMB/velocity/inbound sales, roles that assume a deep structured enterprise-sales playbook at massive scale, or roles needing vertical expertise he lacks (legal, defense, regulated healthcare). His deal sizes were mid-market (up to ~$40K MRR) with technical buyers; his background reads somewhat telco and he is actively pivoting into AI/tech.

# Step 1 — Relevance gate (do this FIRST)
Decide if the core work is commercial GTM: enterprise/mid-market sales, business development, strategic partnerships, revenue leadership, or GTM/commercial strategy. If the role is primarily engineering, research, product management, design, data science, customer support, recruiting, finance, or content marketing, set "disqualified": true and "disqualifier_reason": "Not a commercial GTM role". Never score an off-profile role highly just because the company is prestigious.

# Step 2 — Hard disqualifiers (auto-reject: set disqualified=true with the matching reason)
${disqualifiers}
Apply literally, but avoid false positives: disqualify on language ONLY if the role requires working primarily in a language other than English or Spanish (a nice-to-have language is fine); disqualify junior/associate/SDR/BDR/coordinator TITLES even at great companies; disqualify roles based only in excluded locations with no remote or accepted-city option.

# Step 3 — Score each parameter 1–5 from concrete JD evidence (not the title alone)
Weights: ${formatWeights(criteria.weights)}.
Rubric:
${rubricText}

Scoring discipline:
- Comp: infer realistic total OTE from role type + company tier + market, not only any stated range.
- Role-Profile Fit: reward technical/enterprise sales to CTOs/product, GTM-building, outbound, IoT/telco/API/devtools/AI, LatAm/international; lower it for SMB/inbound-only or roles that assume big-company structured-playbook experience he lacks.
- Seniority: right level = Senior IC, Lead, Head of, Manager/Director of a function, or Enterprise-level IC; far-too-senior (VP/C-level at a large company) scores low.
- Location: score the ROLE's city/remote policy per the rubric.
- Competition: LOWER competition = HIGHER score. Niche roles, less-known companies, or rare skill-match (LatAm/technical/multilingual edge) score high; marquee roles at Anthropic/OpenAI/Stripe score low.

# Step 4 — Bonuses (add only when clearly justified by the JD)
${bonuses}

# Step 5 — Final score (compute it, do not estimate)
final_score = ( sum of each parameter_score × its weight ) × 5, then add every applicable bonus value. Because the weights sum to 1.0, the weighted average is 1–5 and ×5 puts the base on a 0–25 scale comparable to the company score; bonuses are added on top. Round to one decimal.

# Title signal (soft prior only — never overrides the JD)
${titles}
Return "title_signal" as one of: "strong" (title closely matches a high-weight target title), "matching" (clearly a relevant commercial title), "weak" (commercial but off-target), or "off" (not a commercial title). Always read the full JD regardless of title.

# Company context
${companyContext}
Use company tier/scores to inform Comp, Competition, and brand — but do NOT inflate a poor-fit role because the company is strong.${feedbackSection}`;

}

function buildUserPrompt(title: string, location: string, jd: string, criteria?: RoleCriteria): string {
  if (criteria?.use_custom && criteria.user_template && criteria.user_template.trim()) {
    return applyTemplate(criteria.user_template, { title, location, jd });
  }
  return `Score this job posting for the candidate.


Title: ${title}
Location: ${location}
Job Description:
${jd}

Work through the 5 steps internally, then respond with ONLY this JSON (no prose before or after, no markdown fences):
{
  "disqualified": false,
  "disqualifier_reason": null,
  "parameter_scores": {
    "comp": {"score": 4, "rationale": "<=15 words citing JD evidence"},
    "fit": {"score": 4, "rationale": "<=15 words"},
    "seniority": {"score": 4, "rationale": "<=15 words"},
    "location": {"score": 4, "rationale": "<=15 words"},
    "competition": {"score": 4, "rationale": "<=15 words"}
  },
  "bonuses_applied": [{"name": "exact bonus name", "value": 0.5}],
  "final_score": 18.5,
  "title_signal": "matching",
  "summary": "one-sentence verdict: the single most important reason to apply or skip",
  "deadline": null
}

Rules:
- parameter_scores keys must be exactly comp, fit, seniority, location, competition; each score an integer 1-5.
- If disqualified is true, still fill parameter_scores with your best estimate and compute final_score normally, but summary must state the disqualifier.
- bonuses_applied lists only bonuses you actually applied, each with its exact name and numeric value from the bonus list; use [] if none.
- final_score must equal the Step 5 computation, rounded to one decimal.
- For "deadline": only if the JD explicitly states an application deadline/closing date, return ISO YYYY-MM-DD; otherwise null. Do not guess.`;
}

function computeFinalScore(
  parameterScores: Record<string, { score?: number }> | undefined,
  bonusesApplied: Array<{ value?: number }> | undefined,
  weights: Record<string, number> | null | undefined,
  fallback: number | null,
): number | null {
  const keys = ["comp", "fit", "seniority", "location", "competition"] as const;
  const w: Record<string, number> = {
    comp: 0.25, fit: 0.3, seniority: 0.2, location: 0.15, competition: 0.1,
    ...(weights ?? {}),
  };
  let sum = 0;
  for (const k of keys) {
    const s = parameterScores?.[k]?.score;
    if (typeof s !== "number") return fallback;
    sum += s * (typeof w[k] === "number" ? w[k] : 0);
  }
  let score = sum * 5;
  for (const b of bonusesApplied ?? []) {
    if (typeof b?.value === "number") score += b.value;
  }
  return Math.round(score * 10) / 10;
}


function parseDeadline(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  const d = new Date(s.length === 10 ? `${s}T23:59:59Z` : s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
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

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-lite-postings"],
    queryFn: fetchCompanies,
  });

  const companyMap = useMemo(() => {
    const m = new Map<string, CompanyLite>();
    companies.forEach((c) => m.set(c.id, c));
    return m;
  }, [companies]);

  const { data: lifespanDays = 30 } = useQuery({
    queryKey: ["user-profile-lifespan"],
    queryFn: async () => {
      const { data } = await gtmSupabase
        .from("user_profiles" as never)
        .select("default_posting_lifespan_days")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      const v = (data as { default_posting_lifespan_days?: number | null } | null)
        ?.default_posting_lifespan_days;
      return typeof v === "number" && v > 0 ? v : 30;
    },
  });

  // Filters — default view is "New"
  const [statusFilter, setStatusFilter] = useState<PostingStatus>("new");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [tierOpen, setTierOpen] = useState(false);
  const [companyFilter, setCompanyFilter] = useState<CompanyFilter>("all");
  const [companyOpen, setCompanyOpen] = useState(false);
  const [unscoredOnly, setUnscoredOnly] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

  useEffect(() => {
    setPage(1);
  }, [statusFilter, tierFilter, companyFilter, unscoredOnly, pageSize]);

  const tierCompanyIds = useMemo(() => {
    if (tierFilter === "all") return null;
    return companies.filter((c) => c.tier === tierFilter).map((c) => c.id);
  }, [companies, tierFilter]);

  const companiesForFilter = useMemo(() => {
    const base =
      tierFilter === "all" ? companies : companies.filter((c) => c.tier === tierFilter);
    return [...base].sort((a, b) => a.name.localeCompare(b.name));
  }, [companies, tierFilter]);

  const listFilters: ListFilters = {
    status: statusFilter,
    tier: tierFilter,
    companyId: companyFilter,
    unscoredOnly,
  };

  const { data: pageData, isLoading, isFetching } = useQuery({
    queryKey: [
      "postings",
      { statusFilter, tierFilter, companyFilter, unscoredOnly, page, pageSize },
    ],
    queryFn: () => fetchPostingsPage(listFilters, tierCompanyIds, page, pageSize),
    placeholderData: (prev) => prev,
  });
  const rows = pageData?.rows ?? [];
  const total = pageData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIdx = total === 0 ? 0 : (page - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, total);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const { data: counts } = useQuery({
    queryKey: ["postings-counts"],
    queryFn: fetchPostingCounts,
    staleTime: 30_000,
  });

  const { data: unscoredForButton = 0 } = useQuery({
    queryKey: ["postings-unscored-count", { tierFilter, companyFilter }],
    queryFn: () => fetchUnscoredCountFiltered(tierCompanyIds, companyFilter),
    staleTime: 15_000,
  });

  // Auto-expire once per mount (server-side)
  const [expiredRan, setExpiredRan] = useState(false);
  useEffect(() => {
    if (expiredRan || !lifespanDays) return;
    setExpiredRan(true);
    (async () => {
      try {
        const now = new Date().toISOString();
        const cutoff = new Date(Date.now() - lifespanDays * 86400000).toISOString();
        await gtmSupabase
          .from("job_postings" as never)
          .update({ status: "expired", updated_at: now } as never)
          .in("status", ["new", "reviewed"])
          .not("deadline_at", "is", null)
          .lt("deadline_at", now);
        await gtmSupabase
          .from("job_postings" as never)
          .update({ status: "expired", updated_at: now } as never)
          .in("status", ["new", "reviewed"])
          .is("deadline_at", null)
          .or(
            `posted_at.lt.${cutoff},and(posted_at.is.null,created_at.lt.${cutoff})`,
          );
        qc.invalidateQueries({ queryKey: ["postings"] });
        qc.invalidateQueries({ queryKey: ["postings-counts"] });
        qc.invalidateQueries({ queryKey: ["postings-unscored-count"] });
      } catch {
        // best effort
      }
    })();
  }, [lifespanDays, expiredRan, qc]);

  useEffect(() => {
    try {
      const id = sessionStorage.getItem("dashboard:open:postings");
      if (id) {
        sessionStorage.removeItem("dashboard:open:postings");
        setSelectedId(id);
      }
    } catch {}
  }, []);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["postings"] });
    qc.invalidateQueries({ queryKey: ["postings-counts"] });
    qc.invalidateQueries({ queryKey: ["postings-unscored-count"] });
    if (selectedId) qc.invalidateQueries({ queryKey: ["posting", selectedId] });
  };

  const emptyMessage =
    unscoredOnly && statusFilter === "new"
      ? "No unscored postings right now. New leads arrive from the daily agent."
      : statusFilter === "dismissed"
        ? "Nothing dismissed."
        : statusFilter === "saved"
          ? "Nothing saved yet."
          : statusFilter === "applied"
            ? "Nothing applied yet."
            : statusFilter === "expired"
              ? "Nothing expired."
              : statusFilter === "new"
                ? "No new postings right now."
                : "No postings match these filters.";

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
            {counts && (
              <span style={{ marginLeft: 8, fontFamily: MONO }}>
                · New:{" "}
                <b style={{ color: "#00D4FF" }}>{counts.newCount.toLocaleString()}</b> ·
                Unscored:{" "}
                <b style={{ color: "#F59E0B" }}>{counts.unscoredCount.toLocaleString()}</b>
              </span>
            )}
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
          {(["new", "saved", "applied", "dismissed", "expired"] as const).map((s) => (
            <FilterPill
              key={s}
              active={statusFilter === s}
              onClick={() => {
                setStatusFilter(s);
                setCompanyFilter("all");
                if (s !== "new") setUnscoredOnly(false);
              }}
              label={STATUS_META[s].label}
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
                >
                  {t === "all" ? "All Tiers" : TIER_META[t].label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative">
          <button
            onClick={() => setCompanyOpen((v) => !v)}
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
            {companyFilter === "all"
              ? "All Companies"
              : companiesForFilter.find((c) => c.id === companyFilter)?.name ??
                companyMap.get(companyFilter)?.name ??
                "All Companies"}
            <ChevronDown size={12} />
          </button>
          {companyOpen && (
            <div
              className="absolute left-0 mt-1 z-10 p-1"
              style={{
                background: "#111118",
                border: "1px solid #1E1E2E",
                borderRadius: 6,
                minWidth: 220,
                maxHeight: 300,
                overflowY: "auto",
              }}
            >
              <button
                onClick={() => {
                  setCompanyFilter("all");
                  setCompanyOpen(false);
                }}
                className="w-full text-left px-2 py-1.5"
                style={{
                  color: "#F0F0FF",
                  fontSize: 12,
                  fontFamily: MONO,
                  borderRadius: 3,
                  background: companyFilter === "all" ? "rgba(0,212,255,0.1)" : "transparent",
                }}
              >
                All Companies
              </button>
              {companiesForFilter.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setCompanyFilter(c.id);
                    setCompanyOpen(false);
                  }}
                  className="w-full text-left px-2 py-1.5"
                  style={{
                    color: "#F0F0FF",
                    fontSize: 12,
                    fontFamily: MONO,
                    borderRadius: 3,
                    background: companyFilter === c.id ? "rgba(0,212,255,0.1)" : "transparent",
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ width: 1, height: 20, background: "#1E1E2E" }} />
        <button
          onClick={() => statusFilter === "new" && setUnscoredOnly((v) => !v)}
          disabled={statusFilter !== "new"}
          className="flex items-center gap-1.5 px-2.5"
          style={{
            height: 28,
            background: unscoredOnly ? "rgba(245,158,11,0.12)" : "#0A0A0F",
            border: `1px solid ${unscoredOnly ? "rgba(245,158,11,0.4)" : "#1E1E2E"}`,
            borderRadius: 4,
            color: unscoredOnly ? "#F59E0B" : "#F0F0FF",
            fontSize: 12,
            fontFamily: MONO,
            opacity: statusFilter === "new" ? 1 : 0.4,
            cursor: statusFilter === "new" ? "pointer" : "not-allowed",
          }}
        >
          Unscored
        </button>
        <Button
          onClick={() => setBatchOpen(true)}
          disabled={unscoredForButton === 0}
          className="h-7"
          style={{
            background: unscoredForButton === 0 ? "#1E1E2E" : "#00D4FF",
            color: unscoredForButton === 0 ? "#8B8B9E" : "#0A0A0F",
            fontFamily: MONO,
            fontSize: 12,
          }}
        >
          <Sparkles size={13} /> Score {unscoredForButton.toLocaleString()} with AI
        </Button>
        <div className="ml-auto" style={{ color: "#8B8B9E", fontFamily: MONO, fontSize: 11 }}>
          {isFetching && !isLoading && <span style={{ marginRight: 8 }}>updating…</span>}
          {total === 0
            ? "0"
            : `${(startIdx + 1).toLocaleString()}–${endIdx.toLocaleString()} of ${total.toLocaleString()}`}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div
          className="flex items-center justify-center"
          style={{
            height: 240,
            background: "#111118",
            border: "1px solid #1E1E2E",
            borderRadius: 6,
            color: "#8B8B9E",
          }}
        >
          Loading postings…
        </div>
      ) : total === 0 ? (
        <div
          className="flex items-center justify-center px-6 text-center"
          style={{
            height: 240,
            background: "#111118",
            border: "1px solid #1E1E2E",
            borderRadius: 6,
          }}
        >
          <p className="text-sm" style={{ color: "#8B8B9E" }}>
            {emptyMessage}
          </p>
        </div>
      ) : (
        <>
          <PostingsTable
            rows={rows}
            companyMap={companyMap}
            onRowClick={setSelectedId}
            onChanged={invalidateAll}
          />
          <PaginationBar
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            totalItems={total}
            startIdx={startIdx}
            endIdx={endIdx}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        </>
      )}

      {/* Side panel */}
      <Sheet open={!!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent
          side="right"
          className="p-0"
          style={{
            background: "#0A0A0F",
            border: "none",
            borderLeft: "1px solid #1E1E2E",
            width: "max(560px, 40vw)",
            maxWidth: "100vw",
          }}
        >
          {selectedId && (
            <DetailPanel
              postingId={selectedId}
              companyMap={companyMap}
              onClose={() => setSelectedId(null)}
              onChanged={invalidateAll}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Add modal */}
      <AddPostingModal
        open={addOpen}
        onOpenChange={setAddOpen}
        companies={companies}
        onAdded={() => {
          invalidateAll();
          qc.invalidateQueries({ queryKey: ["job-posting-locations"] });
        }}
      />

      {/* Batch score dialog */}
      <BatchScoreDialog
        open={batchOpen}
        onOpenChange={setBatchOpen}
        tierCompanyIds={tierCompanyIds}
        companyFilter={companyFilter}
        companyMap={companyMap}
        expectedCount={unscoredForButton}
        onDone={invalidateAll}
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

// ---------- Pagination ----------
function PaginationBar({
  page,
  totalPages,
  pageSize,
  pageSizeOptions,
  totalItems,
  startIdx,
  endIdx,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  pageSizeOptions: number[];
  totalItems: number;
  startIdx: number;
  endIdx: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}) {
  const pages: number[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    if (page <= 4) {
      pages.push(1, 2, 3, 4, 5, -1, totalPages);
    } else if (page >= totalPages - 3) {
      pages.push(1, -1, totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    } else {
      pages.push(1, -1, page - 1, page, page + 1, -1, totalPages);
    }
  }

  return (
    <div
      className="flex items-center justify-between px-3 py-2"
      style={{
        background: "#111118",
        border: "1px solid #1E1E2E",
        borderTop: "none",
        borderRadius: "0 0 6px 6px",
        fontFamily: MONO,
        fontSize: 12,
      }}
    >
      <div className="flex items-center gap-2" style={{ color: "#8B8B9E" }}>
        <span>Rows:</span>
        <div className="flex items-center gap-1">
          {pageSizeOptions.map((opt) => (
            <button
              key={opt}
              onClick={() => onPageSizeChange(opt)}
              className="px-2"
              style={{
                height: 24,
                borderRadius: 3,
                border: "1px solid",
                borderColor: pageSize === opt ? "rgba(0,212,255,0.4)" : "transparent",
                background: pageSize === opt ? "rgba(0,212,255,0.1)" : "transparent",
                color: pageSize === opt ? "#00D4FF" : "#8B8B9E",
                fontSize: 11,
                fontFamily: MONO,
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      <div style={{ color: "#8B8B9E" }}>
        {totalItems === 0
          ? "0 of 0"
          : `${(startIdx + 1).toLocaleString()}–${endIdx.toLocaleString()} of ${totalItems.toLocaleString()} postings`}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex items-center justify-center"
          style={{
            width: 28,
            height: 28,
            borderRadius: 4,
            border: "1px solid #1E1E2E",
            background: "transparent",
            color: page <= 1 ? "#4A4A5A" : "#F0F0FF",
            cursor: page <= 1 ? "not-allowed" : "pointer",
          }}
        >
          <ChevronLeft size={14} />
        </button>

        {pages.map((p, i) =>
          p === -1 ? (
            <span key={`ellipsis-${i}`} className="px-1" style={{ color: "#4A4A5A" }}>
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className="inline-flex items-center justify-center"
              style={{
                width: 28,
                height: 28,
                borderRadius: 4,
                border: "1px solid",
                borderColor: page === p ? "rgba(0,212,255,0.4)" : "#1E1E2E",
                background: page === p ? "rgba(0,212,255,0.1)" : "transparent",
                color: page === p ? "#00D4FF" : "#F0F0FF",
                fontSize: 11,
                fontFamily: MONO,
                cursor: "pointer",
              }}
            >
              {p}
            </button>
          ),
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="inline-flex items-center justify-center"
          style={{
            width: 28,
            height: 28,
            borderRadius: 4,
            border: "1px solid #1E1E2E",
            background: "transparent",
            color: page >= totalPages ? "#4A4A5A" : "#F0F0FF",
            cursor: page >= totalPages ? "not-allowed" : "pointer",
          }}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
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
      <div style={{ color: "#8B8B9E", fontFamily: MONO, fontSize: 11, lineHeight: 1.35 }}>
        <div>{relativeTime(posting.posted_at ?? posting.scraped_at ?? posting.created_at)}</div>
        <div style={{ fontSize: 10, color: "#6B7280" }}>
          {shortAge(posting.posted_at ?? posting.scraped_at ?? posting.created_at)}
          {posting.deadline_at && (
            <>
              {" · "}
              <span style={{ color: deadlineIndicator(posting.deadline_at).color }}>
                {deadlineIndicator(posting.deadline_at).text}
              </span>
            </>
          )}
        </div>
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
    onError: (e: Error) => {
      toast.error(e.message);
    },
    onSuccess: (_d, action) => {
      toast.success(
        action === "apply" ? "Moved to Applications" : action === "save" ? "Saved" : "Dismissed",
      );
    },
    onSettled: () => onChanged(),
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
  postingId,
  companyMap,
  onClose,
  onChanged,
}: {
  postingId: string;
  companyMap: Map<string, CompanyLite>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { data: posting, isLoading } = useQuery({
    queryKey: ["posting", postingId],
    queryFn: () => fetchPostingById(postingId),
  });
  if (isLoading || !posting) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ height: "100vh", color: "#8B8B9E" }}
      >
        {isLoading ? "Loading posting…" : "Posting not found."}
      </div>
    );
  }
  const company = posting.company_id ? companyMap.get(posting.company_id) ?? null : null;
  return (
    <DetailPanelInner
      posting={posting}
      company={company}
      onClose={onClose}
      onChanged={onChanged}
    />
  );
}

function DetailPanelInner({
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
    onError: (e: Error) => {
      toast.error(e.message);
    },
    onSuccess: (_d, action) => {
      toast.success(
        action === "apply" ? "Moved to Applications" : action === "save" ? "Saved" : "Dismissed",
      );
    },
    onSettled: () => onChanged(),
  });

  return (
    <div className="flex flex-col overflow-y-auto" style={{ height: "100vh" }}>
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
          <div style={{ color: "#6B7280", fontSize: 11, fontFamily: MONO }}>
            Posted {relativeTime(posting.posted_at ?? posting.scraped_at ?? posting.created_at)}
            {" · "}
            {shortAge(posting.posted_at ?? posting.scraped_at ?? posting.created_at)}
            {posting.deadline_at && (
              <>
                {" · "}
                <span style={{ color: deadlineIndicator(posting.deadline_at).color }}>
                  {deadlineIndicator(posting.deadline_at).text}
                </span>
              </>
            )}
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
            <div
              className="flex flex-col gap-2 p-3"
              style={{
                background: "#0D0D14",
                border: "1px solid #1E1E2E",
                borderRadius: 6,
              }}
            >
              {PARAM_KEYS.map((k) => (
                <div
                  key={k}
                  className="grid items-center gap-2"
                  style={{ gridTemplateColumns: "96px 64px minmax(0,1fr)" }}
                >
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
                        [k]: { score: e.target.value, reason: o[k]?.reason ?? "" },
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
                    placeholder="Why did you change this score?"
                    value={overrides[k]?.reason ?? ""}
                    onChange={(e) =>
                      setOverrides((o) => ({
                        ...o,
                        [k]: { score: o[k]?.score ?? "", reason: e.target.value },
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
          (company.loc_score ?? 0)
        : null;

      const now = new Date().toISOString();
      const { data: ins, error: insErr } = await gtmSupabase
        .from("job_postings" as never)
        .insert({
          company_id: companyId,
          title: title.trim(),
          location: normalizeLocationInput(location),
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
      const { data: profile } = await gtmSupabase
        .from("user_profiles" as never)
        .select("background_summary")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      const backgroundSummary =
        (profile as { background_summary?: string | null } | null)?.background_summary ?? null;
      const feedback = await fetchFeedbackContext();
      const system = buildSystemPrompt(criteria, company, backgroundSummary, feedback.text);
      const user = buildUserPrompt(title.trim(), normalizeLocationInput(location), jdFull, criteria);

      const res = await score({ data: { system, user } });
      const parsed = extractJson(res.text) as {
        disqualified?: boolean;
        disqualifier_reason?: string | null;
        parameter_scores?: Record<string, ParameterScore>;
        bonuses_applied?: unknown[];
        final_score?: number;
        title_signal?: string;
        summary?: string;
        deadline?: string | null;
      };

      const finalScore = computeFinalScore(
        parsed.parameter_scores,
        parsed.bonuses_applied as Array<{ value?: number }> | undefined,
        criteria.weights,
        typeof parsed.final_score === "number" ? parsed.final_score : null,
      );

      const rationale: AiRationale = {
        parameter_scores: parsed.parameter_scores,
        bonuses_applied: (parsed.bonuses_applied ?? []) as AiRationale["bonuses_applied"],
        summary: parsed.summary,
      };
      const parsedDeadline = parseDeadline(parsed.deadline);

      const updatePayload: Record<string, unknown> = {
        ai_role_score: finalScore,
        ai_composite_score: finalScore,
        ai_rationale: rationale,
        disqualified: parsed.disqualified ?? false,
        disqualifier_reason: parsed.disqualifier_reason ?? null,
        title_signal: parsed.title_signal ?? null,
        updated_at: new Date().toISOString(),
      };
      if (parsedDeadline) updatePayload.deadline_at = parsedDeadline;

      const { error: upErr } = await gtmSupabase
        .from("job_postings" as never)
        .update(updatePayload as never)
        .eq("id", postingId);
      if (upErr) throw upErr;
      await markFeedbackUsed(feedback.ids);

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
            <LocationAutocomplete value={location} onChange={setLocation} />
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

function LocationAutocomplete({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { data: locations = [] } = useQuery({
    queryKey: ["job-posting-locations"],
    queryFn: fetchDistinctLocations,
  });
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);

  // Match against the last comma-separated segment so "San Francisco, ny" suggests New York
  const segments = value.split(",");
  const lastSeg = (segments[segments.length - 1] ?? "").trim().toLowerCase();
  const matches = useMemo(() => {
    const base = lastSeg
      ? locations.filter(
          (l) => l.toLowerCase().includes(lastSeg) && l.toLowerCase() !== lastSeg,
        )
      : locations;
    return base.slice(0, 8);
  }, [locations, lastSeg]);

  const showDropdown = open && focused && matches.length > 0;

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setFocused(true);
          setOpen(true);
        }}
        onBlur={() => {
          // delay to allow click on suggestion
          setTimeout(() => setFocused(false), 120);
        }}
        placeholder="e.g. Berlin / Remote EU"
        style={{ background: "#111118", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
      />
      {showDropdown && (
        <div
          className="absolute left-0 right-0 mt-1 z-10 p-1"
          style={{
            background: "#111118",
            border: "1px solid #1E1E2E",
            borderRadius: 6,
            maxHeight: 220,
            overflowY: "auto",
          }}
        >
          {matches.map((loc) => (
            <button
              key={loc}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                const parts = value.split(",");
                parts[parts.length - 1] = parts.length > 1 ? ` ${loc}` : loc;
                onChange(parts.join(","));
                setOpen(false);
              }}
              className="w-full text-left px-2 py-1.5"
              style={{ color: "#F0F0FF", fontSize: 13, borderRadius: 3 }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "rgba(0,212,255,0.08)")
              }
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {loc}
            </button>
          ))}
        </div>
      )}
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

// ---------- Batch Score Dialog ----------
const BATCH_MAX = 300;

function BatchScoreDialog({
  open,
  onOpenChange,
  tierCompanyIds,
  companyFilter,
  companyMap,
  expectedCount,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tierCompanyIds: string[] | null;
  companyFilter: CompanyFilter;
  companyMap: Map<string, CompanyLite>;
  expectedCount: number;
  onDone: () => void;
}) {
  const score = useSF(scoreJobPosting);
  const [phase, setPhase] = useState<"confirm" | "running" | "done">("confirm");
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(0);
  const [succeeded, setSucceeded] = useState(0);
  const [weeklyCap, setWeeklyCap] = useState<number | null>(null);
  const [scoredThisWeek, setScoredThisWeek] = useState<number>(0);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [targets, setTargets] = useState<Posting[]>([]);
  const [runTotal, setRunTotal] = useState(0);

  const plannedBatch = Math.min(expectedCount, BATCH_MAX);
  const roughCost = (plannedBatch * 0.01).toFixed(2);

  useEffect(() => {
    if (!open) {
      setPhase("confirm");
      setProgress(0);
      setFailed(0);
      setSucceeded(0);
      setTargets([]);
      setRunTotal(0);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingMeta(true);
      try {
        const { data: profile } = await gtmSupabase
          .from("user_profiles" as never)
          .select("weekly_posting_cap")
          .order("created_at")
          .limit(1)
          .maybeSingle();
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { count } = await gtmSupabase
          .from("job_postings" as never)
          .select("id", { count: "exact", head: true })
          .not("ai_composite_score", "is", null)
          .gte("updated_at", since);
        if (cancelled) return;
        setWeeklyCap(
          (profile as { weekly_posting_cap?: number | null } | null)?.weekly_posting_cap ?? null,
        );
        setScoredThisWeek(count ?? 0);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const overCap =
    weeklyCap != null && weeklyCap > 0 && scoredThisWeek + plannedBatch > weeklyCap;

  async function runOne(
    posting: Posting,
    criteria: RoleCriteria,
    backgroundSummary: string | null,
    feedbackText: string,
  ) {
    const company = posting.company_id ? companyMap.get(posting.company_id) ?? null : null;
    const system = buildSystemPrompt(criteria, company, backgroundSummary, feedbackText);
    const user = buildUserPrompt(posting.title, posting.location ?? "", posting.jd_full ?? "");
    const res = await score({ data: { system, user } });
    const parsed = extractJson(res.text) as {
      disqualified?: boolean;
      disqualifier_reason?: string | null;
      parameter_scores?: Record<string, ParameterScore>;
      bonuses_applied?: unknown[];
      final_score?: number;
      title_signal?: string;
      summary?: string;
      deadline?: string | null;
    };
    const finalScore = computeFinalScore(
      parsed.parameter_scores,
      parsed.bonuses_applied as Array<{ value?: number }> | undefined,
      criteria.weights,
      typeof parsed.final_score === "number" ? parsed.final_score : null,
    );

    const rationale: AiRationale = {
      parameter_scores: parsed.parameter_scores,
      bonuses_applied: (parsed.bonuses_applied ?? []) as AiRationale["bonuses_applied"],
      summary: parsed.summary,
    };
    const disqualified = !!parsed.disqualified;
    const parsedDeadline = parseDeadline(parsed.deadline);
    const updatePayload: Record<string, unknown> = {
      ai_role_score: finalScore,
      ai_composite_score: finalScore,
      ai_rationale: rationale,
      title_signal: parsed.title_signal ?? null,
      disqualified,
      disqualifier_reason: parsed.disqualifier_reason ?? null,
      status: disqualified ? "dismissed" : "new",
      updated_at: new Date().toISOString(),
    };
    if (parsedDeadline && !posting.deadline_at) updatePayload.deadline_at = parsedDeadline;
    const { error } = await gtmSupabase
      .from("job_postings" as never)
      .update(updatePayload as never)
      .eq("id", posting.id);
    if (error) throw error;
  }

  async function run() {
    setPhase("running");
    setProgress(0);
    setSucceeded(0);
    setFailed(0);

    let criteria: RoleCriteria | null = null;
    let backgroundSummary: string | null = null;
    let feedback: FeedbackContext = { text: "", ids: [] };
    let fetched: Posting[] = [];
    try {
      fetched = await fetchUnscoredTargets(tierCompanyIds, companyFilter, BATCH_MAX);
      setTargets(fetched);
      setRunTotal(fetched.length);
      if (fetched.length === 0) {
        toast.message("No unscored postings match the current filter.");
        setPhase("done");
        return;
      }
      criteria = await fetchActiveCriteria();
      if (!criteria) throw new Error("No active role_criteria row found");
      const { data: profile } = await gtmSupabase
        .from("user_profiles" as never)
        .select("background_summary")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      backgroundSummary =
        (profile as { background_summary?: string | null } | null)?.background_summary ?? null;
      feedback = await fetchFeedbackContext();
    } catch (e) {
      toast.error(`Setup failed: ${(e as Error).message}`);
      setPhase("confirm");
      return;
    }

    let ok = 0;
    let bad = 0;
    for (let i = 0; i < fetched.length; i++) {
      const p = fetched[i];
      setProgress(i + 1);
      try {
        await runOne(p, criteria, backgroundSummary, feedback.text);
        ok++;
        setSucceeded(ok);
      } catch {
        try {
          await runOne(p, criteria, backgroundSummary, feedback.text);
          ok++;
          setSucceeded(ok);
        } catch {
          bad++;
          setFailed(bad);
        }
      }
    }

    if (ok > 0) await markFeedbackUsed(feedback.ids);
    if (bad === 0) toast.success(`Scored ${ok} posting${ok === 1 ? "" : "s"}`);
    else toast.message(`Scored ${ok}, ${bad} failed`);
    onDone();
    setPhase("done");
  }

  const missingJd = useMemo(
    () => targets.filter((t) => !t.jd_full || t.jd_full.trim().length === 0).length,
    [targets],
  );
  const pct = runTotal === 0 ? 0 : Math.round((progress / runTotal) * 100);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (phase === "running") return;
        onOpenChange(v);
      }}
    >
      <DialogContent
        style={{
          background: "#111118",
          border: "1px solid #1E1E2E",
          color: "#F0F0FF",
          maxWidth: 480,
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ fontFamily: MONO, color: "#F0F0FF" }}>
            {phase === "confirm"
              ? "Score postings with AI"
              : phase === "running"
                ? "Scoring…"
                : "Batch complete"}
          </DialogTitle>
        </DialogHeader>

        {phase === "confirm" && (
          <div className="flex flex-col gap-3" style={{ fontSize: 13 }}>
            <div>
              About to score <b>{plannedBatch.toLocaleString()}</b> posting
              {plannedBatch === 1 ? "" : "s"} with Claude.
              {expectedCount > BATCH_MAX && (
                <span style={{ color: "#8B8B9E" }}>
                  {" "}
                  ({expectedCount.toLocaleString()} unscored total; capped per run at {BATCH_MAX})
                </span>
              )}
            </div>
            <div style={{ color: "#8B8B9E", fontSize: 12 }}>
              Uses Claude API credits — rough estimate: <b>~${roughCost}</b> ($0.01 per posting).
            </div>
            {loadingMeta ? (
              <div style={{ color: "#8B8B9E", fontSize: 12 }}>Checking weekly cap…</div>
            ) : weeklyCap != null && weeklyCap > 0 ? (
              <div
                className="flex items-start gap-2 px-3 py-2"
                style={{
                  background: overCap ? "rgba(245,158,11,0.08)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${overCap ? "rgba(245,158,11,0.4)" : "#1E1E2E"}`,
                  borderRadius: 4,
                  color: overCap ? "#F59E0B" : "#8B8B9E",
                  fontSize: 12,
                }}
              >
                {overCap && <AlertTriangle size={14} style={{ marginTop: 1 }} />}
                <div>
                  Scored in last 7 days: <b>{scoredThisWeek}</b> / cap <b>{weeklyCap}</b>.{" "}
                  {overCap
                    ? `Running this batch (${plannedBatch}) would exceed your weekly cap. You can proceed — it's a soft ceiling.`
                    : `After this batch: ${scoredThisWeek + plannedBatch} / ${weeklyCap}.`}
                </div>
              </div>
            ) : null}

            <div className="flex justify-end gap-2 mt-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                style={{ background: "#0A0A0F", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
              >
                Cancel
              </Button>
              <Button
                onClick={run}
                disabled={plannedBatch === 0}
                style={{ background: "#00D4FF", color: "#0A0A0F" }}
              >
                <Sparkles size={13} /> Score {plannedBatch.toLocaleString()} with AI
              </Button>
            </div>
          </div>
        )}

        {phase === "running" && (
          <div className="flex flex-col gap-3" style={{ fontSize: 13 }}>
            <div style={{ fontFamily: MONO }}>
              Scoring {Math.min(progress, runTotal)} of {runTotal}…
            </div>
            <div
              style={{
                height: 6,
                background: "#1E1E2E",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: "#00D4FF",
                  transition: "width 200ms linear",
                }}
              />
            </div>
            <div style={{ color: "#8B8B9E", fontSize: 12, fontFamily: MONO }}>
              {succeeded} ok · {failed} failed
              {missingJd > 0 && (
                <span style={{ marginLeft: 8 }}>
                  · {missingJd} without JD (scored on title/company only)
                </span>
              )}
            </div>
          </div>
        )}

        {phase === "done" && (
          <div className="flex flex-col gap-3" style={{ fontSize: 13 }}>
            <div>
              Scored <b style={{ color: "#10B981" }}>{succeeded}</b>
              {failed > 0 && (
                <>
                  {" "}
                  · <b style={{ color: "#EF4444" }}>{failed}</b> failed
                </>
              )}
              .
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => onOpenChange(false)}
                style={{ background: "#00D4FF", color: "#0A0A0F" }}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
