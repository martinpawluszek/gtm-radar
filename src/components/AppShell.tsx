import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Building2,
  Sliders,
  Inbox,
  Kanban,
  Users,
  type LucideIcon,
} from "lucide-react";

type NavItem = { to: string; label: string; icon: LucideIcon };

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/companies", label: "Companies", icon: Building2 },
  { to: "/role-criteria", label: "Role Criteria", icon: Sliders },
  { to: "/postings", label: "Postings", icon: Inbox },
  { to: "/applications", label: "Applications", icon: Kanban },
  { to: "/outreach", label: "Outreach", icon: Users },
];

function formatDate() {
  return new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const current = NAV.find((n) => (n.to === "/" ? pathname === "/" : pathname.startsWith(n.to)));
  const hideHeaderTitle =
    pathname === "/" ||
    pathname.startsWith("/companies") ||
    pathname.startsWith("/role-criteria") ||
    pathname.startsWith("/applications") ||
    pathname.startsWith("/outreach");
  const pageTitle = hideHeaderTitle ? "" : current?.label ?? "GTM Intelligence";

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
        </header>

        {/* Content */}
        <main className="flex-1 p-6 relative min-w-0" style={{ background: "#0A0A0F" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
