import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { toast } from "sonner";
import { gtmSupabase } from "@/lib/gtmSupabase";
import { Skeleton } from "@/components/ui/skeleton";

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

// ---------- Types ----------
type PreFilterRule = {
  id: string;
  keyword: string;
  filter_tier: "hard" | "soft";
  is_active: boolean;
  created_at: string;
};

// ---------- Data ----------
async function fetchRules(): Promise<PreFilterRule[]> {
  const { data, error } = await gtmSupabase
    .from("pre_filter_rules" as never)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PreFilterRule[];
}

async function addRule(keyword: string, filter_tier: "hard" | "soft"): Promise<void> {
  const { error } = await gtmSupabase
    .from("pre_filter_rules" as never)
    .insert({ keyword: keyword.trim(), filter_tier, is_active: true } as never);
  if (error) throw error;
}

async function deactivateRule(id: string): Promise<void> {
  const { error } = await gtmSupabase
    .from("pre_filter_rules" as never)
    .update({ is_active: false } as never)
    .eq("id", id);
  if (error) throw error;
}

type CommercialOverride = {
  id: string;
  keyword: string;
  is_active: boolean;
  created_at: string;
};

async function fetchOverrides(): Promise<CommercialOverride[]> {
  const { data, error } = await gtmSupabase
    .from("commercial_overrides" as never)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as CommercialOverride[];
}

async function addOverride(keyword: string): Promise<void> {
  const { error } = await gtmSupabase
    .from("commercial_overrides" as never)
    .insert({ keyword: keyword.trim(), is_active: true } as never);
  if (error) throw error;
}

async function deactivateOverride(id: string): Promise<void> {
  const { error } = await gtmSupabase
    .from("commercial_overrides" as never)
    .update({ is_active: false } as never)
    .eq("id", id);
  if (error) throw error;
}

async function fetchExcludedTitles(): Promise<{ id: string; titles: string[] }> {
  const { data, error } = await gtmSupabase
    .from("role_criteria" as never)
    .select("id, excluded_titles")
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  const row = data as unknown as { id: string; excluded_titles: string[] } | null;
  return { id: row?.id ?? "", titles: row?.excluded_titles ?? [] };
}

async function updateExcludedTitles(id: string, titles: string[]): Promise<void> {
  const { error } = await gtmSupabase
    .from("role_criteria" as never)
    .update({ excluded_titles: titles, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) throw error;
}

// ---------- Components ----------
function ParametersPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("keyword-filters");

  const { data: allRules = [] } = useQuery({
    queryKey: ["pre-filter-rules"],
    queryFn: fetchRules,
  });
  const { data: allOverrides = [] } = useQuery({
    queryKey: ["commercial-overrides"],
    queryFn: fetchOverrides,
  });
  const { data: excludedData } = useQuery({
    queryKey: ["excluded-titles"],
    queryFn: fetchExcludedTitles,
  });

  const keywordCount = allRules.filter((r) => r.is_active).length;
  const overrideCount = allOverrides.filter((o) => o.is_active).length;
  const excludedCount = excludedData?.titles.length ?? 0;

  function tabLabel(key: TabKey): string {
    const base = TABS.find((t) => t.key === key)?.label ?? key;
    const count =
      key === "keyword-filters"
        ? keywordCount
        : key === "commercial-overrides"
          ? overrideCount
          : excludedCount;
    return `${base} (${count})`;
  }

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
            {tabLabel(t.key)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "keyword-filters" && <KeywordFiltersTab />}
      {activeTab === "commercial-overrides" && <CommercialOverridesTab />}
      {activeTab === "excluded-titles" && <ExcludedTitlesTab />}
    </div>
  );
}

function PlaceholderCard({ text }: { text: string }) {
  return (
    <div
      className="flex items-center justify-center"
      style={{
        background: "#111118",
        border: "1px solid #1E1E2E",
        borderRadius: 6,
        minHeight: 320,
      }}
    >
      <p className="text-sm" style={{ color: "#8B8B9E", fontFamily: MONO }}>
        {text}
      </p>
    </div>
  );
}

function KeywordFiltersTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [hardInput, setHardInput] = useState("");
  const [softInput, setSoftInput] = useState("");
  const [hardError, setHardError] = useState("");
  const [softError, setSoftError] = useState("");

  useEffect(() => {
    setSearch("");
    setHardInput("");
    setSoftInput("");
    setHardError("");
    setSoftError("");
  }, []);

  const { data: allRules = [], isLoading } = useQuery({
    queryKey: ["pre-filter-rules"],
    queryFn: fetchRules,
  });

  const activeRules = useMemo(
    () => allRules.filter((r) => r.is_active),
    [allRules],
  );

  const filteredRules = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activeRules;
    return activeRules.filter((r) => r.keyword.toLowerCase().includes(q));
  }, [activeRules, search]);

  const hardRules = useMemo(
    () => filteredRules.filter((r) => r.filter_tier === "hard"),
    [filteredRules],
  );
  const softRules = useMemo(
    () => filteredRules.filter((r) => r.filter_tier === "soft"),
    [filteredRules],
  );

  const addMutation = useMutation({
    mutationFn: ({ keyword, tier }: { keyword: string; tier: "hard" | "soft" }) =>
      addRule(keyword, tier),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pre-filter-rules"] });
      toast.success("Saved");
    },
    onError: () => {
      toast.error("Save failed — try again");
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateRule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pre-filter-rules"] });
      toast.success("Saved");
    },
    onError: () => {
      toast.error("Save failed — try again");
    },
  });

  function handleAdd(tier: "hard" | "soft") {
    const input = tier === "hard" ? hardInput : softInput;
    const setError = tier === "hard" ? setHardError : setSoftError;
    const setInput = tier === "hard" ? setHardInput : setSoftInput;

    const trimmed = input.trim();
    if (!trimmed) {
      setError("Keyword cannot be empty");
      return;
    }

    const exists = allRules.some(
      (r) => r.keyword.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exists) {
      setError("Keyword already exists");
      return;
    }

    setError("");
    addMutation.mutate(
      { keyword: trimmed, tier },
      {
        onSuccess: () => {
          setInput("");
        },
        onError: (err: Error) => {
          if (err.message?.includes("duplicate") || err.message?.includes("unique")) {
            setError("Keyword already exists");
          }
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <div
        className="flex items-center gap-3 px-3"
        style={{
          background: "#111118",
          border: "1px solid #1E1E2E",
          borderRadius: 6,
          height: 48,
        }}
      >
        <span style={{ color: "#8B8B9E", fontFamily: MONO, fontSize: 12 }}>
          Search
        </span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter keywords..."
          className="flex-1 bg-transparent outline-none text-sm"
          style={{ color: "#F0F0FF", fontFamily: MONO }}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="flex items-center justify-center"
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              color: "#8B8B9E",
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Panels */}
      <div className="grid grid-cols-2 gap-4">
        <TierPanel
          tier="hard"
          label="Hard Tier"
          description="Blocked regardless of role context. No exceptions."
          rules={hardRules}
          isLoading={isLoading}
          inputValue={hardInput}
          onInputChange={setHardInput}
          error={hardError}
          onAdd={() => handleAdd("hard")}
          onRemove={(id) => deactivateMutation.mutate(id)}
          isPending={addMutation.isPending || deactivateMutation.isPending}
        />
        <TierPanel
          tier="soft"
          label="Soft Tier"
          description="Blocked unless title also contains a commercial override word."
          rules={softRules}
          isLoading={isLoading}
          inputValue={softInput}
          onInputChange={setSoftInput}
          error={softError}
          onAdd={() => handleAdd("soft")}
          onRemove={(id) => deactivateMutation.mutate(id)}
          isPending={addMutation.isPending || deactivateMutation.isPending}
        />
      </div>
    </div>
  );
}

function TierPanel({
  tier,
  label,
  description,
  rules,
  isLoading,
  inputValue,
  onInputChange,
  error,
  onAdd,
  onRemove,
  isPending,
}: {
  tier: "hard" | "soft";
  label: string;
  description: string;
  rules: PreFilterRule[];
  isLoading: boolean;
  inputValue: string;
  onInputChange: (v: string) => void;
  error: string;
  onAdd: () => void;
  onRemove: (id: string) => void;
  isPending: boolean;
}) {
  const borderAccent = tier === "hard" ? "#7C3AED" : "#00D4FF";

  return (
    <div
      className="flex flex-col"
      style={{
        background: "#111118",
        border: "1px solid #1E1E2E",
        borderRadius: 6,
        padding: 20,
        gap: 16,
      }}
    >
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <h2
            className="text-sm font-semibold tracking-tight"
            style={{ color: "#F0F0FF", fontFamily: MONO }}
          >
            {label}
          </h2>
          <span
            className="text-[11px] font-medium px-2 py-0.5"
            style={{
              color: borderAccent,
              background: `${borderAccent}15`,
              borderRadius: 4,
              fontFamily: MONO,
            }}
          >
            {rules.length}
          </span>
        </div>
        <p className="text-xs mt-1" style={{ color: "#8B8B9E" }}>
          {description}
        </p>
      </div>

      {/* Pill list */}
      <div
        className="flex flex-wrap gap-2"
        style={{
          maxHeight: 320,
          overflowY: "auto",
          minHeight: 80,
        }}
      >
        {isLoading ? (
          <>
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton
                key={i}
                className="rounded-md"
                style={{ width: 80 + Math.random() * 60, height: 28 }}
              />
            ))}
          </>
        ) : rules.length === 0 ? (
          <div
            className="w-full flex items-center justify-center"
            style={{ minHeight: 80 }}
          >
            <span className="text-xs" style={{ color: "#8B8B9E", fontFamily: MONO }}>
              No active keywords
            </span>
          </div>
        ) : (
          rules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[13px]"
              style={{
                background: "#0A0A0F",
                border: "1px solid #1E1E2E",
                borderRadius: 4,
                color: "#F0F0FF",
                fontFamily: MONO,
              }}
            >
              <span>{rule.keyword}</span>
              <button
                onClick={() => onRemove(rule.id)}
                disabled={isPending}
                className="flex items-center justify-center ml-0.5"
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  color: "#8B8B9E",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#EF4444";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "#8B8B9E";
                }}
              >
                <X size={12} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add row */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <input
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onAdd();
            }}
            placeholder="Add keyword..."
            disabled={isPending}
            className="flex-1 px-2.5 py-1.5 text-[13px] outline-none"
            style={{
              background: "#0A0A0F",
              border: "1px solid #1E1E2E",
              borderRadius: 4,
              color: "#F0F0FF",
              fontFamily: MONO,
            }}
          />
          <button
            onClick={onAdd}
            disabled={isPending}
            className="px-3 py-1.5 text-[13px] font-medium transition-colors"
            style={{
              background: isPending ? "#1E1E2E" : "rgba(0,212,255,0.1)",
              border: isPending ? "1px solid #1E1E2E" : "1px solid rgba(0,212,255,0.25)",
              borderRadius: 4,
              color: isPending ? "#8B8B9E" : "#00D4FF",
              fontFamily: MONO,
              cursor: isPending ? "not-allowed" : "pointer",
            }}
          >
            Add
          </button>
        </div>
        {error && (
          <span className="text-xs" style={{ color: "#EF4444", fontFamily: MONO }}>
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

function CommercialOverridesTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");

  const { data: allOverrides = [], isLoading } = useQuery({
    queryKey: ["commercial-overrides"],
    queryFn: fetchOverrides,
  });

  const activeOverrides = useMemo(
    () => allOverrides.filter((o) => o.is_active),
    [allOverrides],
  );

  const filteredOverrides = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activeOverrides;
    return activeOverrides.filter((o) => o.keyword.toLowerCase().includes(q));
  }, [activeOverrides, search]);

  const addMutation = useMutation({
    mutationFn: addOverride,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commercial-overrides"] });
      toast.success("Saved");
    },
    onError: () => {
      toast.error("Save failed — try again");
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateOverride,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commercial-overrides"] });
      toast.success("Saved");
    },
    onError: () => {
      toast.error("Save failed — try again");
    },
  });

  function handleAdd() {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setError("Keyword cannot be empty");
      return;
    }

    const exists = allOverrides.some(
      (o) => o.keyword.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exists) {
      setError("Keyword already exists");
      return;
    }

    setError("");
    addMutation.mutate(trimmed, {
      onSuccess: () => {
        setInputValue("");
      },
      onError: (err: Error) => {
        if (err.message?.includes("duplicate") || err.message?.includes("unique")) {
          setError("Keyword already exists");
        }
      },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Info box */}
      <div
        className="px-4 py-3 text-sm"
        style={{
          background: "#111118",
          border: "1px solid #1E1E2E",
          borderLeft: "2px solid #00D4FF",
          borderRadius: 6,
          color: "#F0F0FF",
        }}
      >
        These words protect soft-tier blocks from being over-aggressive. If a job title hits a
        soft-blocked keyword but also contains one of these words, it passes through to Claude.
        Example: &apos;Enterprise Data Engineer&apos; is blocked by &apos;enterprise&apos; — but
        &apos;Enterprise Account Executive&apos; passes because &apos;account executive&apos; is here.
      </div>

      {/* Card */}
      <div
        className="flex flex-col"
        style={{
          background: "#111118",
          border: "1px solid #1E1E2E",
          borderRadius: 6,
          padding: 20,
          gap: 16,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2
            className="text-sm font-semibold tracking-tight"
            style={{ color: "#F0F0FF", fontFamily: MONO }}
          >
            Override Words
          </h2>
          <span
            className="text-[11px] font-medium px-2 py-0.5"
            style={{
              color: "#00D4FF",
              background: "rgba(0,212,255,0.1)",
              borderRadius: 4,
              fontFamily: MONO,
            }}
          >
            {activeOverrides.length} active
          </span>
        </div>
        <p className="text-xs" style={{ color: "#8B8B9E" }}>
          {activeOverrides.length === 1
            ? "1 active override word"
            : `${activeOverrides.length} active override words`}
        </p>

        {/* Search */}
        <div
          className="flex items-center gap-3 px-3"
          style={{
            background: "#0A0A0F",
            border: "1px solid #1E1E2E",
            borderRadius: 4,
            height: 40,
          }}
        >
          <span style={{ color: "#8B8B9E", fontFamily: MONO, fontSize: 12 }}>
            Search
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter override words..."
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: "#F0F0FF", fontFamily: MONO }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="flex items-center justify-center"
              style={{ width: 20, height: 20, borderRadius: 4, color: "#8B8B9E" }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Pill list */}
        <div
          className="flex flex-wrap gap-2"
          style={{ maxHeight: 320, overflowY: "auto", minHeight: 80 }}
        >
          {isLoading ? (
            <>
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="rounded-md"
                  style={{ width: 80 + Math.random() * 60, height: 28 }}
                />
              ))}
            </>
          ) : filteredOverrides.length === 0 ? (
            <div className="w-full flex items-center justify-center" style={{ minHeight: 80 }}>
              <span className="text-xs" style={{ color: "#8B8B9E", fontFamily: MONO }}>
                No active override words
              </span>
            </div>
          ) : (
            filteredOverrides.map((o) => (
              <div
                key={o.id}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[13px]"
                style={{
                  background: "#0A0A0F",
                  border: "1px solid #1E1E2E",
                  borderRadius: 4,
                  color: "#F0F0FF",
                  fontFamily: MONO,
                }}
              >
                <span>{o.keyword}</span>
                <button
                  onClick={() => deactivateMutation.mutate(o.id)}
                  disabled={deactivateMutation.isPending}
                  className="flex items-center justify-center ml-0.5"
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 3,
                    color: "#8B8B9E",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#EF4444";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#8B8B9E";
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Add row */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
              placeholder="Add override word..."
              disabled={addMutation.isPending}
              className="flex-1 px-2.5 py-1.5 text-[13px] outline-none"
              style={{
                background: "#0A0A0F",
                border: "1px solid #1E1E2E",
                borderRadius: 4,
                color: "#F0F0FF",
                fontFamily: MONO,
              }}
            />
            <button
              onClick={handleAdd}
              disabled={addMutation.isPending}
              className="px-3 py-1.5 text-[13px] font-medium transition-colors"
              style={{
                background: addMutation.isPending ? "#1E1E2E" : "rgba(0,212,255,0.1)",
                border: addMutation.isPending ? "1px solid #1E1E2E" : "1px solid rgba(0,212,255,0.25)",
                borderRadius: 4,
                color: addMutation.isPending ? "#8B8B9E" : "#00D4FF",
                fontFamily: MONO,
                cursor: addMutation.isPending ? "not-allowed" : "pointer",
              }}
            >
              Add
            </button>
          </div>
          {error && (
            <span className="text-xs" style={{ color: "#EF4444", fontFamily: MONO }}>
              {error}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ExcludedTitlesTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");

  const { data: excludedData, isLoading } = useQuery({
    queryKey: ["excluded-titles"],
    queryFn: fetchExcludedTitles,
  });

  const titles = useMemo(() => excludedData?.titles ?? [], [excludedData]);
  const rowId = excludedData?.id ?? "";

  const filteredTitles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return titles;
    return titles.filter((t) => t.toLowerCase().includes(q));
  }, [titles, search]);

  const updateMutation = useMutation({
    mutationFn: ({ id, newTitles }: { id: string; newTitles: string[] }) =>
      updateExcludedTitles(id, newTitles),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["excluded-titles"] });
      toast.success("Saved");
    },
    onError: () => {
      toast.error("Save failed — try again");
    },
  });

  function handleRemove(titleToRemove: string) {
    if (!rowId) return;
    const newTitles = titles.filter((t) => t !== titleToRemove);
    updateMutation.mutate({ id: rowId, newTitles });
  }

  function handleAdd() {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setError("Title cannot be empty");
      return;
    }

    const exists = titles.some(
      (t) => t.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exists) {
      setError("Title already exists");
      return;
    }

    setError("");
    if (!rowId) return;
    const newTitles = [...titles, trimmed];
    updateMutation.mutate(
      { id: rowId, newTitles },
      {
        onSuccess: () => {
          setInputValue("");
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Info box */}
      <div
        className="px-4 py-3 text-sm"
        style={{
          background: "#111118",
          border: "1px solid #1E1E2E",
          borderLeft: "2px solid #00D4FF",
          borderRadius: 6,
          color: "#F0F0FF",
        }}
      >
        Hard disqualifiers applied before keyword filters and before Claude. Any job title
        matching one of these strings is rejected immediately.
      </div>

      {/* Card */}
      <div
        className="flex flex-col"
        style={{
          background: "#111118",
          border: "1px solid #1E1E2E",
          borderRadius: 6,
          padding: 20,
          gap: 16,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2
            className="text-sm font-semibold tracking-tight"
            style={{ color: "#F0F0FF", fontFamily: MONO }}
          >
            Excluded Titles
          </h2>
          <span
            className="text-[11px] font-medium px-2 py-0.5"
            style={{
              color: "#00D4FF",
              background: "rgba(0,212,255,0.1)",
              borderRadius: 4,
              fontFamily: MONO,
            }}
          >
            {titles.length}
          </span>
        </div>
        <p className="text-xs" style={{ color: "#8B8B9E" }}>
          {titles.length === 1 ? "1 excluded title" : `${titles.length} excluded titles`}
        </p>

        {/* Search */}
        <div
          className="flex items-center gap-3 px-3"
          style={{
            background: "#0A0A0F",
            border: "1px solid #1E1E2E",
            borderRadius: 4,
            height: 40,
          }}
        >
          <span style={{ color: "#8B8B9E", fontFamily: MONO, fontSize: 12 }}>
            Search
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter excluded titles..."
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: "#F0F0FF", fontFamily: MONO }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="flex items-center justify-center"
              style={{ width: 20, height: 20, borderRadius: 4, color: "#8B8B9E" }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Pill list */}
        <div
          className="flex flex-wrap gap-2"
          style={{ maxHeight: 320, overflowY: "auto", minHeight: 80 }}
        >
          {isLoading ? (
            <>
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="rounded-md"
                  style={{ width: 80 + Math.random() * 60, height: 28 }}
                />
              ))}
            </>
          ) : filteredTitles.length === 0 ? (
            <div className="w-full flex items-center justify-center" style={{ minHeight: 80 }}>
              <span className="text-xs" style={{ color: "#8B8B9E", fontFamily: MONO }}>
                No excluded titles
              </span>
            </div>
          ) : (
            filteredTitles.map((title) => (
              <div
                key={title}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[13px]"
                style={{
                  background: "#0A0A0F",
                  border: "1px solid #1E1E2E",
                  borderRadius: 4,
                  color: "#F0F0FF",
                  fontFamily: MONO,
                }}
              >
                <span>{title}</span>
                <button
                  onClick={() => handleRemove(title)}
                  disabled={updateMutation.isPending}
                  className="flex items-center justify-center ml-0.5"
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 3,
                    color: "#8B8B9E",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#EF4444";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#8B8B9E";
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Add row */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
              placeholder="Add excluded title..."
              disabled={updateMutation.isPending}
              className="flex-1 px-2.5 py-1.5 text-[13px] outline-none"
              style={{
                background: "#0A0A0F",
                border: "1px solid #1E1E2E",
                borderRadius: 4,
                color: "#F0F0FF",
                fontFamily: MONO,
              }}
            />
            <button
              onClick={handleAdd}
              disabled={updateMutation.isPending}
              className="px-3 py-1.5 text-[13px] font-medium transition-colors"
              style={{
                background: updateMutation.isPending ? "#1E1E2E" : "rgba(0,212,255,0.1)",
                border: updateMutation.isPending ? "1px solid #1E1E2E" : "1px solid rgba(0,212,255,0.25)",
                borderRadius: 4,
                color: updateMutation.isPending ? "#8B8B9E" : "#00D4FF",
                fontFamily: MONO,
                cursor: updateMutation.isPending ? "not-allowed" : "pointer",
              }}
            >
              Add
            </button>
          </div>
          {error && (
            <span className="text-xs" style={{ color: "#EF4444", fontFamily: MONO }}>
              {error}
            </span>
          )}
        </div>

        {/* Link to Role Criteria */}
        <div className="pt-2">
          <Link
            to="/role-criteria"
            className="text-[13px] transition-colors hover:underline"
            style={{ color: "#00D4FF", fontFamily: MONO }}
          >
            Edit full Role Criteria →
          </Link>
        </div>
      </div>
    </div>
  );
}
