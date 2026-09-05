import { useEffect } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Building2,
  Sliders,
  SlidersHorizontal,
  Inbox,
  Kanban,
  Users,
  Linkedin,
  BriefcaseBusiness,
  Settings,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { gtmSupabase } from "@/lib/gtmSupabase";
import { useGtmAuth } from "@/lib/gtmAuth";
import { NotificationBell } from "@/components/NotificationBell";

type NavItem = { to: string; label: string; icon: LucideIcon };

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/companies", label: "Companies", icon: Building2 },
  { to: "/role-criteria", label: "Role Criteria", icon: Sliders },
  { to: "/parameters", label: "Parameters", icon: SlidersHorizontal },
  { to: "/postings", label: "Postings", icon: Inbox },
  { to: "/applications", label: "Applications", icon: Kanban },
  { to: "/outreach", label: "Outreach", icon: Users },
  { to: "/linkedin-presence", label: "LinkedIn Presence", icon: Linkedin },
  { to: "/career", label: "Career", icon: BriefcaseBusiness },
  { to: "/role-models", label: "Role Models", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings },
];

function formatDate() {
  return new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function FullScreenLoader() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "#0A0A0F", color: "#8B8B9E", fontFamily: "var(--font-mono)", fontSize: 12 }}
    >
      Loading…
    </div>
  );
}

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { loading, session } = useGtmAuth();

  const isLoginPage = pathname === "/login";
  const isPublicPage = isLoginPage || pathname === "/reset-password";

  // Guard: redirect based on session state.
  useEffect(() => {
    if (loading) return;
    if (!session && !isPublicPage) {
      navigate({ to: "/login", replace: true });
    } else if (session && isLoginPage) {
      navigate({ to: "/", replace: true });
    }
  }, [loading, session, isLoginPage, isPublicPage, navigate]);

  if (loading) return <FullScreenLoader />;

  // Public pages: render without the sidebar/header chrome.
  if (isPublicPage) {
    return (
      <div style={{ background: "#0A0A0F", minHeight: "100vh" }}>
        <Outlet />
      </div>
    );
  }

  // Not signed in on a protected route — show loader until the redirect effect fires.
  if (!session) return <FullScreenLoader />;

  const current = NAV.find((n) => (n.to === "/" ? pathname === "/" : pathname.startsWith(n.to)));
  const hideHeaderTitle =
    pathname === "/" ||
    pathname.startsWith("/companies") ||
    pathname.startsWith("/role-criteria") ||
    pathname.startsWith("/parameters") ||
    pathname.startsWith("/applications") ||
    pathname.startsWith("/outreach");
  const pageTitle = hideHeaderTitle ? "" : current?.label ?? "GTM Intelligence";

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await gtmSupabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  const userEmail = session.user.email ?? "signed in";

  return (
    <div className="min-h-screen flex w-full noise-overlay" style={{ background: "#0A0A0F" }}>
      {/* Sidebar */}
      <aside
        className="fixed inset-y-0 left-0 z-20 flex flex-col"
        style={{
          width: 220,
          background: "#0D0D14",
          borderRight: "1px solid #1E1E2E",
        }}
      >
        {/* Logo */}
        <div className="h-14 flex items-center gap-2.5 px-5 border-b" style={{ borderColor: "#1E1E2E" }}>
          <span
            className="pulse-dot inline-block rounded-full"
            style={{ width: 8, height: 8, background: "#00D4FF" }}
          />
          <span
            className="font-bold tracking-tight"
            style={{ color: "#00D4FF", fontSize: 15, fontFamily: "var(--font-mono)" }}
          >
            GTM Intel
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-2 flex flex-col gap-0.5">
          {NAV.map((item) => {
            const isActive =
              item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className="group relative flex items-center gap-3 px-3 py-2 text-[13px] font-medium transition-colors"
                style={{
                  color: isActive ? "#00D4FF" : "#8B8B9E",
                  background: isActive ? "rgba(0,212,255,0.08)" : "transparent",
                  borderLeft: `2px solid ${isActive ? "#00D4FF" : "transparent"}`,
                  borderRadius: 4,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = "#F0F0FF";
                    e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = "#8B8B9E";
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                <Icon size={16} strokeWidth={1.75} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User / sign out */}
        <div
          className="px-3 py-3 border-t flex flex-col gap-2"
          style={{ borderColor: "#1E1E2E", fontFamily: "var(--font-mono)" }}
        >
          <div
            className="px-1 text-[11px] truncate"
            style={{ color: "#F0F0FF" }}
            title={userEmail}
          >
            {userEmail}
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 px-2 py-1.5 text-[11px] transition-colors"
            style={{
              color: "#8B8B9E",
              border: "1px solid #1E1E2E",
              borderRadius: 4,
              background: "transparent",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#F0F0FF";
              e.currentTarget.style.background = "rgba(255,255,255,0.03)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#8B8B9E";
              e.currentTarget.style.background = "transparent";
            }}
          >
            <LogOut size={12} strokeWidth={1.75} />
            <span>Sign out</span>
          </button>
        </div>

        {/* Footer */}
        <div
          className="px-4 py-3 border-t text-[11px] flex items-center justify-between"
          style={{ borderColor: "#1E1E2E", color: "#8B8B9E", fontFamily: "var(--font-mono)" }}
        >
          <span>{formatDate()}</span>
          <span
            className="px-1.5 py-0.5"
            style={{
              border: "1px solid #1E1E2E",
              borderRadius: 3,
              color: "#8B8B9E",
            }}
          >
            v1.0
          </span>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col" style={{ marginLeft: 220 }}>
        {/* Header */}
        <header
          className="sticky top-0 z-10 flex items-center justify-between px-6"
          style={{
            height: 56,
            background: "#0A0A0F",
            borderBottom: "1px solid #1E1E2E",
          }}
        >
          <h1 className="text-sm font-medium" style={{ color: "#F0F0FF" }}>
            {pageTitle}
          </h1>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium"
              style={{
                color: "#10B981",
                background: "rgba(16,185,129,0.08)",
                border: "1px solid rgba(16,185,129,0.25)",
                borderRadius: 4,
                fontFamily: "var(--font-mono)",
              }}
            >
              <span
                className="inline-block rounded-full"
                style={{ width: 6, height: 6, background: "#10B981" }}
              />
              Connected
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-6 relative min-w-0" style={{ background: "#0A0A0F" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
