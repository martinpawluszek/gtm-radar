import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BuiltTab } from "@/components/career/BuiltTab";
import { CredentialsTab } from "@/components/career/CredentialsTab";
import { CvStudioTab } from "@/components/career/CvStudioTab";
import { ExperienceTab } from "@/components/career/ExperienceTab";
import { ProfileCard } from "@/components/career/ProfileCard";
import { RulesTab } from "@/components/career/RulesTab";
import { StoriesTab } from "@/components/career/StoriesTab";
import { MONO } from "@/components/career/ui";
import { gtmSupabase } from "@/lib/gtmSupabase";

type CareerSearch = { tab?: string; posting?: string };

export const Route = createFileRoute("/career")({
  validateSearch: (search: Record<string, unknown>): CareerSearch => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
    posting: typeof search.posting === "string" ? search.posting : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Career — GTM Intelligence" },
      {
        name: "description",
        content:
          "Manage your full career history: experience, bullets, projects, stories, credentials and CV generation rules.",
      },
      { property: "og:title", content: "Career — GTM Intelligence" },
      {
        property: "og:description",
        content: "Experience, projects, STAR stories, credentials and CV rules in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CareerPage,
  errorComponent: CareerError,
  notFoundComponent: () => (
    <div style={{ padding: 24, color: "#F0F0FF", fontFamily: MONO }}>Not found.</div>
  ),
});

function CareerError({ error, reset }: { error: Error; reset: () => void }) {
  console.error("[career] route error:", error);
  return (
    <div style={{ padding: 24, color: "#F0F0FF", fontFamily: MONO, maxWidth: 640 }}>
      <h1 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Career couldn't load</h1>
      <p style={{ color: "#8B8B9E", fontSize: 13, marginBottom: 12 }}>
        {error?.message ?? "Unknown error"}
      </p>
      <button
        onClick={() => reset()}
        style={{
          background: "#1E1E2E",
          color: "#F0F0FF",
          border: "1px solid #2A2A3E",
          padding: "6px 12px",
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </div>
  );
}

type TabKey = "experience" | "built" | "stories" | "credentials" | "rules" | "cv-studio";

const TABS: { key: TabKey; label: string }[] = [
  { key: "experience", label: "Experience" },
  { key: "built", label: "Built" },
  { key: "stories", label: "Stories" },
  { key: "credentials", label: "Credentials & Skills" },
  { key: "rules", label: "Rules" },
  { key: "cv-studio", label: "CV Studio" },
];

type PostingSeed = { jd_full: string | null; company_name: string | null };

async function fetchPostingSeed(id: string): Promise<PostingSeed> {
  const { data, error } = await gtmSupabase
    .from("job_postings" as never)
    .select("jd_full,company_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  const row = data as unknown as { jd_full: string | null; company_id: string | null } | null;
  if (!row) return { jd_full: null, company_name: null };
  let companyName: string | null = null;
  if (row.company_id) {
    const { data: c } = await gtmSupabase
      .from("companies" as never)
      .select("name")
      .eq("id", row.company_id)
      .maybeSingle();
    companyName = (c as unknown as { name: string | null } | null)?.name ?? null;
  }
  return { jd_full: row.jd_full, company_name: companyName };
}

function CareerPage() {
  const search = Route.useSearch();
  const [tab, setTab] = useState<TabKey>(
    TABS.some((t) => t.key === search.tab) ? (search.tab as TabKey) : "experience",
  );

  const postingId = search.posting ?? null;
  const { data: seed } = useQuery({
    queryKey: ["career:posting-seed", postingId],
    queryFn: () => fetchPostingSeed(postingId as string),
    enabled: !!postingId,
  });


  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1
          className="text-lg font-semibold tracking-tight"
          style={{ color: "#F0F0FF", fontFamily: MONO }}
        >
          Career
        </h1>
        <p className="text-sm mt-1" style={{ color: "#8B8B9E" }}>
          Your full career history in one place — the source material for tailored CVs and cover
          letters.
        </p>
      </div>

      <ProfileCard />

      <div
        className="flex items-center gap-2 px-3 flex-wrap"
        style={{
          background: "#111118",
          border: "1px solid #1E1E2E",
          borderRadius: 6,
          minHeight: 48,
          paddingTop: 6,
          paddingBottom: 6,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-3 py-1 text-[13px] font-medium transition-colors"
            style={{
              color: tab === t.key ? "#00D4FF" : "#8B8B9E",
              background: tab === t.key ? "rgba(0,212,255,0.1)" : "transparent",
              borderRadius: 4,
              border: tab === t.key ? "1px solid rgba(0,212,255,0.25)" : "1px solid transparent",
              fontFamily: MONO,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "experience" && <ExperienceTab />}
      {tab === "built" && <BuiltTab />}
      {tab === "stories" && <StoriesTab />}
      {tab === "credentials" && <CredentialsTab />}
      {tab === "rules" && <RulesTab />}
      {tab === "cv-studio" && (
        <CvStudioTab
          initialCompany={seed?.company_name ?? ""}
          initialJd={seed?.jd_full ?? ""}
          postingId={postingId}
        />
      )}
    </div>
  );
}

