import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

const MONO = "var(--font-mono)";

export const Route = createFileRoute("/parameters")({
  head: () => ({ meta: [{ title: "Filters & Rules — GTM Intelligence" }] }),
  component: ParametersPage,
});

type TabKey = "keyword-filters" | "commercial-overrides" | "excluded-titles";

const TABS: { key: TabKey; label: string }[] = [
  { key: "keyword-filters", label: "Keyword Filters" },
  { key: "commercial-overrides", label: "Commercial Overrides" },
  { key: "excluded-titles", label: "Excluded Titles" },
];

function ParametersPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("keyword-filters");

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1
          className="text-lg font-semibold tracking-tight"
          style={{ color: "#F0F0FF", fontFamily: MONO }}
        >
          Filters & Rules
        </h1>
        <p className="text-sm mt-1" style={{ color: "#8B8B9E" }}>
          Control what the Posting Scorer sees before Claude. Changes take effect on the next agent run.
        </p>
      </div>

      {/* Tabs */}
      <div
        className="flex items-center gap-2 px-3"
        style={{
          background: "#111118",
          border: "1px solid #1E1E2E",
          borderRadius: 6,
          height: 48,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className="px-3 py-1 text-[13px] font-medium transition-colors"
            style={{
              color: activeTab === t.key ? "#00D4FF" : "#8B8B9E",
              background: activeTab === t.key ? "rgba(0,212,255,0.1)" : "transparent",
              borderRadius: 4,
              border: activeTab === t.key ? "1px solid rgba(0,212,255,0.25)" : "1px solid transparent",
              fontFamily: MONO,
            }}
            onMouseEnter={(e) => {
              if (activeTab !== t.key) {
                e.currentTarget.style.color = "#F0F0FF";
                e.currentTarget.style.background = "rgba(255,255,255,0.03)";
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== t.key) {
                e.currentTarget.style.color = "#8B8B9E";
                e.currentTarget.style.background = "transparent";
              }
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div
        style={{
          background: "#111118",
          border: "1px solid #1E1E2E",
          borderRadius: 6,
          minHeight: 320,
        }}
        className="flex items-center justify-center"
      >
        <p className="text-sm" style={{ color: "#8B8B9E", fontFamily: MONO }}>
          {activeTab === "keyword-filters" && "Keyword Filters content coming soon."}
          {activeTab === "commercial-overrides" && "Commercial Overrides content coming soon."}
          {activeTab === "excluded-titles" && "Excluded Titles content coming soon."}
        </p>
      </div>
    </div>
  );
}
