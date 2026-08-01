import { gtmSupabase } from "@/lib/gtmSupabase";

// ---------- Types ----------
export type CvProfile = {
  id: string;
  full_name: string | null;
  location: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  languages: unknown;
};

export type CvExperience = {
  id: string;
  company: string | null;
  company_blurb: string | null;
  role_title: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean | null;
  always_include: boolean | null;
  display_order: number | null;
};

export type Sensitivity = "cv_ok" | "cv_only" | "excluded";

export type CvBullet = {
  id: string;
  experience_id: string | null;
  text: string | null;
  tags: string[] | null;
  is_core: boolean | null;
  sensitivity: string | null;
  display_order: number | null;
};

export type CvProject = {
  id: string;
  name: string | null;
  org: string | null;
  year: string | null;
  description: string | null;
  stack: string | null;
  tags: string[] | null;
  status: string | null;
  hold_reason: string | null;
  display_order: number | null;
};

export type CvCredential = {
  id: string;
  kind: string | null;
  title: string | null;
  org: string | null;
  years: string | null;
  detail: string | null;
  status: string | null;
  display_order: number | null;
};

export type CvCompetency = {
  id: string;
  competency_group: string | null;
  label: string | null;
  tags: string[] | null;
  display_order: number | null;
};

export type CvStory = {
  id: string;
  title: string | null;
  situation: string | null;
  action: string | null;
  result: string | null;
  lesson: string | null;
  tags: string[] | null;
  experience_id: string | null;
};

export type CvRule = {
  id: string;
  kind: string | null;
  title: string | null;
  body: string | null;
  is_active: boolean | null;
  display_order: number | null;
};

export type CvTable =
  | "cv_profile"
  | "cv_experiences"
  | "cv_bullets"
  | "cv_projects"
  | "cv_credentials"
  | "cv_competencies"
  | "cv_stories"
  | "cv_rules";

export const cvKey = (table: CvTable) => [`cv:${table}`] as const;

// ---------- Generic data access ----------
export async function cvList<T>(
  table: CvTable,
  order?: { column: string; ascending?: boolean },
): Promise<T[]> {
  let q = gtmSupabase.from(table as never).select("*");
  if (order) q = q.order(order.column, { ascending: order.ascending ?? true, nullsFirst: false });
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as T[];
}

export async function cvInsert<T>(table: CvTable, values: Record<string, unknown>): Promise<T> {
  const { data, error } = await gtmSupabase
    .from(table as never)
    .insert(values as never)
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as T;
}

export async function cvUpdate(
  table: CvTable,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await gtmSupabase
    .from(table as never)
    .update(patch as never)
    .eq("id", id);
  if (error) throw error;
}

export async function cvDelete(table: CvTable, id: string): Promise<void> {
  const { error } = await gtmSupabase.from(table as never).delete().eq("id", id);
  if (error) throw error;
}

// ---------- Helpers ----------
export function safeStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function safeTags(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((t): t is string => typeof t === "string") : [];
}

export function orderOf(v: { display_order: number | null } | undefined): number {
  return typeof v?.display_order === "number" ? v.display_order : 0;
}

export function byOrder<T extends { display_order: number | null }>(a: T, b: T): number {
  return orderOf(a) - orderOf(b);
}

// Swap display_order between two rows (used for up/down reordering).
export async function swapOrder(
  table: CvTable,
  a: { id: string; display_order: number | null },
  b: { id: string; display_order: number | null },
  aIndex: number,
  bIndex: number,
): Promise<void> {
  const aOrder = typeof a.display_order === "number" ? a.display_order : aIndex;
  const bOrder = typeof b.display_order === "number" ? b.display_order : bIndex;
  const nextA = aOrder === bOrder ? bIndex : bOrder;
  const nextB = aOrder === bOrder ? aIndex : aOrder;
  await cvUpdate(table, a.id, { display_order: nextA });
  await cvUpdate(table, b.id, { display_order: nextB });
}

export function nextOrder(rows: { display_order: number | null }[]): number {
  return rows.reduce((max, r) => Math.max(max, orderOf(r)), 0) + 1;
}

export function formatPeriod(exp: CvExperience): string {
  const start = safeStr(exp.start_date);
  const end = exp.is_current ? "Present" : safeStr(exp.end_date);
  if (!start && !end) return "";
  return `${start || "?"} — ${end || "?"}`;
}
