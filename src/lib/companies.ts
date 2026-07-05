import type { Database } from "@/integrations/supabase/types";

type BaseCompany = Database["public"]["Tables"]["companies"]["Row"];
type BaseInsert = Database["public"]["Tables"]["companies"]["Insert"];

export type AtsType =
  | "greenhouse"
  | "ashby"
  | "lever"
  | "amazon"
  | "workday"
  | "generic_scraper"
  | "unknown"
  | "private"
  | "custom"
  | null;

export type Company = BaseCompany & {
  is_active?: boolean | null;
  ats_type?: AtsType;
  ats_slug?: string | null;
};

export type CompanyInsert = BaseInsert & {
  is_active?: boolean | null;
  ats_type?: AtsType;
  ats_slug?: string | null;
};
export type Tier = "god" | "t1" | "t2" | "t3" | "excluded";

const KNOWN_ATS: Record<string, string> = {
  greenhouse: "Greenhouse",
  ashby: "Ashby",
  lever: "Lever",
  amazon: "Amazon",
  workday: "Workday",
};

export type SourceBadge = {
  label: string;
  variant: "connected" | "warning" | "muted";
};

export function sourceBadge(ats: AtsType | undefined): SourceBadge {
  if (ats && KNOWN_ATS[ats]) return { label: `Via ${KNOWN_ATS[ats]}`, variant: "connected" };
  if (ats === "generic_scraper") return { label: "Needs scraper", variant: "warning" };
  return { label: "Not configured", variant: "muted" };
}

export const TIER_ORDER: Tier[] = ["god", "t1", "t2", "t3", "excluded"];

export const TIER_META: Record<Tier, { label: string; short: string; color: string }> = {
  god: { label: "GOD TIER", short: "GOD", color: "#F59E0B" },
  t1: { label: "TIER 1", short: "T1", color: "#00D4FF" },
  t2: { label: "TIER 2", short: "T2", color: "#7C3AED" },
  t3: { label: "TIER 3", short: "T3", color: "#8B8B9E" },
  excluded: { label: "EXCLUDED", short: "EXC", color: "rgba(239,68,68,0.6)" },
};

export const SCORE_DIMS = [
  { key: "brand_score", label: "B", full: "Brand" },
  { key: "ai_score", label: "A", full: "AI" },
  { key: "shot_score", label: "S", full: "Shot" },
  { key: "comp_score", label: "C", full: "Comp" },
  { key: "location_score", label: "L", full: "Location" },
] as const;

export const totalScore = (c: Company) =>
  (c.brand_score ?? 0) + (c.ai_score ?? 0) + (c.shot_score ?? 0) + (c.comp_score ?? 0) + (c.location_score ?? 0);

export const SCORE_RUBRIC: Record<string, Record<number, string>> = {
  brand_score: {
    1: "Unknown — no brand recognition",
    2: "Niche awareness in industry",
    3: "Known within tech/GTM circles",
    4: "Strong reputation, opens many doors",
    5: "Recognized globally, opens doors everywhere",
  },
  ai_score: {
    1: "No AI focus",
    2: "Exploring AI peripherally",
    3: "AI-enabled product features",
    4: "AI-native product, core to value prop",
    5: "Frontier AI lab or category leader",
  },
  shot_score: {
    1: "Very long shot — unlikely fit",
    2: "Stretch — would need a strong angle",
    3: "Plausible — competitive but realistic",
    4: "Good shot — meaningful overlap",
    5: "Strong shot — clear fit, warm path",
  },
  comp_score: {
    1: "Below market significantly",
    2: "Below market",
    3: "At market rate",
    4: "Above market, generous equity",
    5: "Top of market, elite compensation",
  },
  location_score: {
    1: "Bad location / strict on-site mismatch",
    2: "Requires relocation",
    3: "Hybrid in another city",
    4: "Remote-friendly or close hybrid",
    5: "Ideal location or fully remote",
  },
};
