import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { gtmSupabase } from "@/lib/gtmSupabase";

const MONO = "var(--font-mono)";
const DISMISS_KEY = "lp.notification.dismissedOn";

type WeeklyStatus = {
  reminder_threshold: "behind" | "zero_activity";
  posts_published: number;
  comments_posted: number;
  ideas_saved: number;
  is_behind: boolean;
  notification_title: string | null;
  notification_body: string | null;
};

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function fetchWeeklyStatus(): Promise<WeeklyStatus | null> {
  const { data, error } = await gtmSupabase
    .from("linkedin_presence_weekly_status" as never)
    .select(
      "reminder_threshold, posts_published, comments_posted, ideas_saved, is_behind, notification_title, notification_body",
    )
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as WeeklyStatus | null;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [dismissedOn, setDismissedOn] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(DISMISS_KEY);
  });
  const ref = useRef<HTMLDivElement | null>(null);

  const { data: status } = useQuery({
    // Distinct from the LinkedIn Presence page cache (["lp-weekly-status"]) which
    // selects "*". This one selects a narrow column subset, so it gets its own key.
    queryKey: ["bell:lp-weekly-status"],
    queryFn: fetchWeeklyStatus,
  });

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const shouldAlert = (() => {
    if (!status) return false;
    if (status.reminder_threshold === "zero_activity") {
      return (
        (status.posts_published ?? 0) +
          (status.comments_posted ?? 0) +
          (status.ideas_saved ?? 0) ===
        0
      );
    }
    return !!status.is_behind;
  })();

  const today = todayIso();
  const dismissed = dismissedOn === today;
  const badge = shouldAlert && !dismissed;

  function dismissForToday() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_KEY, today);
    }
    setDismissedOn(today);
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="flex items-center justify-center transition-colors"
        style={{
          width: 30,
          height: 30,
          borderRadius: 4,
          background: open ? "rgba(255,255,255,0.05)" : "transparent",
          border: "1px solid #1E1E2E",
          color: badge ? "#00D4FF" : "#8B8B9E",
          position: "relative",
        }}
      >
        <Bell size={15} strokeWidth={1.75} />
        {badge && (
          <span
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#F59E0B",
              boxShadow: "0 0 0 1.5px #0A0A0F",
            }}
          />
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 320,
            background: "#0D0D14",
            border: "1px solid #1E1E2E",
            borderRadius: 6,
            padding: 14,
            boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            zIndex: 60,
            fontFamily: MONO,
          }}
        >
          <div className="text-[11px] uppercase mb-2" style={{ color: "#8B8B9E" }}>
            LinkedIn Presence
          </div>
          {!status ? (
            <p className="text-[12px]" style={{ color: "#8B8B9E" }}>No status yet.</p>
          ) : (
            <>
              <div
                className="text-[13px] font-semibold mb-1.5"
                style={{ color: badge ? "#F59E0B" : "#10B981" }}
              >
                {status.notification_title ?? (badge ? "Behind on weekly goals" : "On track")}
              </div>
              {status.notification_body && (
                <pre
                  className="text-[12px] whitespace-pre-wrap font-sans"
                  style={{ color: "#F0F0FF", margin: 0, marginBottom: 10 }}
                >
                  {status.notification_body}
                </pre>
              )}
              <div className="flex items-center justify-between gap-2 pt-2 border-t" style={{ borderColor: "#1E1E2E" }}>
                <Link
                  to="/linkedin-presence"
                  onClick={() => setOpen(false)}
                  className="text-[11px]"
                  style={{ color: "#00D4FF" }}
                >
                  Go to LinkedIn Presence →
                </Link>
                {badge && (
                  <button
                    onClick={dismissForToday}
                    className="text-[11px]"
                    style={{ color: "#8B8B9E" }}
                  >
                    Dismiss for today
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
