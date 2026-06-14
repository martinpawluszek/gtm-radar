// Shared LinkedIn Presence weekly-progress logic.
// Single source of truth used by both the LinkedIn Presence page (Progress tab,
// Settings, weekly status) and the main Dashboard card.
//
// The project_start_date is stored in localStorage because the existing
// linkedin_presence_goals schema cannot be extended from this app (the
// constraint says no schema changes / no new tables).

import { useQuery, useQueryClient } from "@tanstack/react-query";

export const LP_START_DATE_KEY = "lp.project_start_date";
export const LP_START_DATE_QK = ["lp-project-start-date"] as const;

export type LpItem = {
  id: string;
  item_type: "post_idea" | "reply_opportunity";
  status: "idea" | "drafted" | "posted" | "archived";
  posted_at: string | null;
  created_at: string;
};

export type LpGoal = {
  weekly_posts_goal: number;
  weekly_comments_goal: number;
  weekly_ideas_goal: number;
};

export type WeekStat = {
  week_number: number; // 1-based, week 1 = week of project start
  week_start: string; // yyyy-mm-dd (Monday, local)
  week_end: string; // yyyy-mm-dd (next Monday, exclusive)
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
export function readProjectStartDate(): string | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(LP_START_DATE_KEY);
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export function writeProjectStartDate(value: string | null) {
  if (typeof window === "undefined") return;
  if (value) window.localStorage.setItem(LP_START_DATE_KEY, value);
  else window.localStorage.removeItem(LP_START_DATE_KEY);
}

export function useProjectStartDate() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: LP_START_DATE_QK,
    queryFn: async () => readProjectStartDate(),
    staleTime: Infinity,
  });
  const set = (value: string | null) => {
    writeProjectStartDate(value);
    qc.setQueryData(LP_START_DATE_QK, value);
    // Recompute weekly progress everywhere it's derived from the start date.
    qc.invalidateQueries({ queryKey: ["lp-weekly-progress"] });
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

// Monday of the week containing d (local time). JS getDay: 0=Sun..6=Sat.
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
  // endIso is exclusive (next Monday); show inclusive Sunday for readability.
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
  // Default: start from current week if no project start configured.
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
      // Posted items count toward posts/comments based on posted_at.
      if (it.status === "posted" && it.posted_at) {
        const pAt = new Date(it.posted_at);
        if (pAt >= cursor && pAt < nextMonday) {
          if (it.item_type === "post_idea") posts++;
          else if (it.item_type === "reply_opportunity") comments++;
        }
      }
      // Ideas saved counted by created_at, excluding archived.
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

  // Latest first.
  return weeks.reverse();
}

export function currentWeekOf(weeks: WeekStat[]): WeekStat | null {
  return weeks.find((w) => w.is_current) ?? null;
}
