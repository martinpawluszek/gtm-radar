// Shared LinkedIn Presence weekly-progress logic.
// Single source of truth used by both the LinkedIn Presence page (Progress tab,
// Settings, weekly status) and the main Dashboard card.
//
// project_start_date now lives in the DB on the active
// public.linkedin_presence_goals row. A one-time migration copies any legacy
// localStorage value into the DB the first time this hook runs.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gtmSupabase } from "@/lib/gtmSupabase";

export const LP_START_DATE_KEY = "lp.project_start_date";
export const LP_START_DATE_QK = ["lp-project-start-date"] as const;

export type LpItem = {
  id: string;
  item_type: "post_idea" | "reply_opportunity";
  status: "idea" | "drafted" | "prompt_ready" | "posted" | "archived";
  posted_at: string | null;
  created_at: string;
};

export type LpGoal = {
  weekly_posts_goal: number;
  weekly_comments_goal: number;
  weekly_ideas_goal: number;
  project_start_date?: string | null;
};

export type WeekStat = {
  week_number: number;
  week_start: string;
  week_end: string;
  posts_published: number;
  comments_posted: number;
  ideas_saved: number;
  weekly_posts_goal: number;
  weekly_comments_goal: number;
  weekly_ideas_goal: number;
  posts_goal_met: boolean;
  comments_goal_met: boolean;
  ideas_goal_met: boolean;
  all_goals_met: boolean;
  total_activity: number;
  completion_percent: number;
  is_current: boolean;
};

// ---------- storage ----------
function readLegacyLocal(): string | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(LP_START_DATE_KEY);
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function clearLegacyLocal() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LP_START_DATE_KEY);
}

async function fetchActiveGoalRow(): Promise<{
  id: string;
  project_start_date: string | null;
} | null> {
  const { data, error } = await gtmSupabase
    .from("linkedin_presence_goals" as never)
    .select("id, project_start_date")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as { id: string; project_start_date: string | null } | null;
}

async function writeStartDate(goalId: string, value: string | null): Promise<void> {
  const { error } = await gtmSupabase
    .from("linkedin_presence_goals" as never)
    .update({ project_start_date: value } as never)
    .eq("id", goalId);
  if (error) throw error;
}

export function useProjectStartDate() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: LP_START_DATE_QK,
    queryFn: async (): Promise<string | null> => {
      const row = await fetchActiveGoalRow();
      if (!row) return null;
      // One-time migration: DB null + legacy localStorage value -> write to DB.
      if (!row.project_start_date) {
        const legacy = readLegacyLocal();
        if (legacy) {
          try {
            await writeStartDate(row.id, legacy);
            clearLegacyLocal();
            qc.invalidateQueries({ queryKey: ["lp-active-goal"] });
            return legacy;
          } catch {
            return legacy;
          }
        }
      }
      return row.project_start_date ?? null;
    },
    staleTime: 60_000,
  });

  const mut = useMutation({
    mutationFn: async (value: string | null) => {
      const row = await fetchActiveGoalRow();
      if (!row) throw new Error("No active LinkedIn goal row");
      await writeStartDate(row.id, value);
      return value;
    },
    onSuccess: (value) => {
      qc.setQueryData(LP_START_DATE_QK, value);
      qc.invalidateQueries({ queryKey: ["lp-active-goal"] });
      qc.invalidateQueries({ queryKey: ["lp-weekly-progress"] });
      qc.invalidateQueries({ queryKey: ["lp-weekly-status"] });
    },
  });

  const set = (value: string | null) => {
    mut.mutate(value);
  };

  return { value: query.data ?? null, set };
}

// ---------- date helpers ----------
function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function mondayOf(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = out.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  out.setDate(out.getDate() + diff);
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() + n);
  return out;
}

export function formatWeekRange(startIso: string, endIso: string): string {
  const fmt = (iso: string) =>
    parseIsoDate(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const end = parseIsoDate(endIso);
  end.setDate(end.getDate() - 1);
  return `${fmt(startIso)} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

// ---------- core computation ----------
export function computeWeeks(
  items: LpItem[],
  goal: LpGoal | null,
  startDateIso: string | null,
  now: Date = new Date(),
): WeekStat[] {
  if (!goal) return [];
  const startDate = startDateIso ? parseIsoDate(startDateIso) : now;
  const firstMonday = mondayOf(startDate);
  const currentMonday = mondayOf(now);

  if (currentMonday < firstMonday) return [];

  const weeks: WeekStat[] = [];
  let cursor = firstMonday;
  let weekNumber = 1;

  while (cursor <= currentMonday) {
    const nextMonday = addDays(cursor, 7);
    const startIso = toIsoDate(cursor);
    const endIso = toIsoDate(nextMonday);

    let posts = 0;
    let comments = 0;
    let ideas = 0;

    for (const it of items) {
      if (it.status === "posted" && it.posted_at) {
        const pAt = new Date(it.posted_at);
        if (pAt >= cursor && pAt < nextMonday) {
          if (it.item_type === "post_idea") posts++;
          else if (it.item_type === "reply_opportunity") comments++;
        }
      }
      if (it.item_type === "post_idea" && it.status !== "archived" && it.created_at) {
        const cAt = new Date(it.created_at);
        if (cAt >= cursor && cAt < nextMonday) ideas++;
      }
    }

    const postsGoal = goal.weekly_posts_goal ?? 0;
    const commentsGoal = goal.weekly_comments_goal ?? 0;
    const ideasGoal = goal.weekly_ideas_goal ?? 0;
    const totalGoal = postsGoal + commentsGoal + ideasGoal;
    const totalActivity = posts + comments + ideas;
    const completion =
      totalGoal > 0 ? Math.min(100, Math.round((totalActivity / totalGoal) * 100)) : 0;
    const postsMet = posts >= postsGoal;
    const commentsMet = comments >= commentsGoal;
    const ideasMet = ideas >= ideasGoal;

    weeks.push({
      week_number: weekNumber,
      week_start: startIso,
      week_end: endIso,
      posts_published: posts,
      comments_posted: comments,
      ideas_saved: ideas,
      weekly_posts_goal: postsGoal,
      weekly_comments_goal: commentsGoal,
      weekly_ideas_goal: ideasGoal,
      posts_goal_met: postsMet,
      comments_goal_met: commentsMet,
      ideas_goal_met: ideasMet,
      all_goals_met: postsMet && commentsMet && ideasMet,
      total_activity: totalActivity,
      completion_percent: completion,
      is_current: cursor.getTime() === currentMonday.getTime(),
    });

    cursor = nextMonday;
    weekNumber++;
  }

  return weeks.reverse();
}

export function currentWeekOf(weeks: WeekStat[]): WeekStat | null {
  return weeks.find((w) => w.is_current) ?? null;
}
