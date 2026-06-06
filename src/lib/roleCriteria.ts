export type ParamKey = "comp" | "role_fit" | "seniority" | "location" | "competition";

export const PARAMS: Array<{ key: ParamKey; label: string }> = [
  { key: "comp", label: "Comp Potential" },
  { key: "role_fit", label: "Role-Profile Fit" },
  { key: "seniority", label: "Seniority Fit" },
  { key: "location", label: "Location" },
  { key: "competition", label: "Competition Level" },
];

export type Weights = Record<ParamKey, number>;
export type Rubric = Record<ParamKey, Record<1 | 2 | 3 | 4 | 5, string>>;
export type Bonus = { id: string; name: string; value: number };

export type RoleCriteria = {
  id: string;
  version: number;
  is_active: boolean;
  target_titles: string[];
  excluded_titles: string[];
  weights: Weights;
  rubric: Rubric;
  disqualifiers: string[];
  bonuses: Bonus[];
  created_at?: string;
  updated_at?: string;
};

export const DEFAULT_WEIGHTS: Weights = {
  comp: 0.2,
  role_fit: 0.25,
  seniority: 0.2,
  location: 0.15,
  competition: 0.2,
};

const blankRubric = (a: string, b: string, c: string, d: string, e: string) => ({
  1: a, 2: b, 3: c, 4: d, 5: e,
});

export const DEFAULT_RUBRIC: Rubric = {
  comp: blankRubric(
    "Far below market",
    "Below market",
    "At market",
    "Above market with equity upside",
    "Top of market, elite package",
  ),
  role_fit: blankRubric(
    "Off-profile",
    "Adjacent profile, would need a stretch",
    "Plausible fit",
    "Strong fit on most dimensions",
    "Perfect fit — built for this role",
  ),
  seniority: blankRubric(
    "Wrong level by 2+ steps",
    "One level off",
    "Right level, lighter scope",
    "Right level and scope",
    "Right level with stretch upside",
  ),
  location: blankRubric(
    "Strict onsite mismatch",
    "Requires relocation",
    "Hybrid in another city",
    "Remote-friendly or near hybrid",
    "Ideal location or fully remote",
  ),
  competition: blankRubric(
    "Hyper-competitive, hundreds of applicants",
    "Very competitive",
    "Competitive but realistic",
    "Limited competition",
    "Little to no competition",
  ),
};

export const DEFAULT_CRITERIA: Omit<RoleCriteria, "id" | "version" | "is_active"> = {
  target_titles: [],
  excluded_titles: [],
  weights: DEFAULT_WEIGHTS,
  rubric: DEFAULT_RUBRIC,
  disqualifiers: [],
  bonuses: [],
};

export const sumWeights = (w: Weights) =>
  Math.round((w.comp + w.role_fit + w.seniority + w.location + w.competition) * 100) / 100;

export const ROLE_CRITERIA_SQL = `create table public.role_criteria (
  id uuid primary key default gen_random_uuid(),
  version int not null default 1,
  is_active boolean not null default true,
  target_titles text[] not null default '{}',
  excluded_titles text[] not null default '{}',
  weights jsonb not null default '{}'::jsonb,
  rubric jsonb not null default '{}'::jsonb,
  disqualifiers text[] not null default '{}',
  bonuses jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.role_criteria enable row level security;
create policy "Public read role_criteria" on public.role_criteria for select using (true);
create policy "Public insert role_criteria" on public.role_criteria for insert with check (true);
create policy "Public update role_criteria" on public.role_criteria for update using (true) with check (true);`;
