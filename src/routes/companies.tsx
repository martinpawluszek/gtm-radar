import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { gtmSupabase, gtmSupabaseInfo } from "@/lib/gtmSupabase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Company, CompanyInsert, TIER_META, TIER_ORDER, Tier, totalScore,
} from "@/lib/companies";
import { CompanyRow } from "@/components/companies/CompanyRow";
import { CompanyModal } from "@/components/companies/CompanyModal";

export const Route = createFileRoute("/companies")({
  head: () => ({ meta: [{ title: "Companies — GTM Intelligence" }] }),
  component: CompaniesPage,
});

type SortKey = "total" | "name" | "brand" | "ai" | "shot";

type CompaniesQueryDebug = {
  query: string;
  projectRef: string;
  url: string;
  status: number;
  statusText: string;
  count: number;
  rawData: RawCompany[];
  data: Company[];
  error: null | {
    message: string;
    code?: string;
    details?: string;
    hint?: string;
  };
};

type RawCompany = Company & {
  loc_score?: number | null;
  total_score?: number | null;
};

function toCompanyWritePayload(data: CompanyInsert) {
  const { location_score, ...rest } = data;
  return {
    ...rest,
    tags: data.tags ?? [],
    loc_score: location_score ?? 0,
  };
}

const SORT_LABEL: Record<SortKey, string> = {
  total: "Total Score",
  name: "Name A-Z",
  brand: "Brand",
  ai: "AI Score",
  shot: "Shot",
};

const TIER_FILTERS: Array<{ value: "all" | Tier; label: string }> = [
  { value: "all", label: "All" },
  { value: "god", label: "God" },
  { value: "t1", label: "T1" },
  { value: "t2", label: "T2" },
  { value: "t3", label: "T3" },
  { value: "excluded", label: "Excluded" },
];

async function fetchCompanies(): Promise<CompaniesQueryDebug> {
  const query = 'gtmSupabase.from("companies").select("*", { count: "exact" })';
  const { data, error, count, status, statusText } = await gtmSupabase
    .from("companies")
    .select("*", { count: "exact" });
  const rows = (data ?? []) as RawCompany[];
  const normalized = rows.map((company) => ({
    ...company,
    location_score: company.location_score ?? company.loc_score ?? 0,
  })) as Company[];

  return {
    query,
    projectRef: gtmSupabaseInfo.projectRef,
    url: gtmSupabaseInfo.url,
    status,
    statusText,
    count: count ?? rows.length,
    rawData: rows,
    data: normalized,
    error: error
      ? {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      }
      : null,
  };
}

function CompaniesPage() {
  const qc = useQueryClient();
  const { data: queryDebug, isLoading, error } = useQuery({
    queryKey: ["companies"],
    queryFn: fetchCompanies,
  });

  const companies = queryDebug?.data ?? [];
  const loadError = queryDebug?.error?.message ?? (error as Error | null)?.message;

  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<"all" | Tier>("all");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>("total");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (data: CompanyInsert) => {
      const payload = toCompanyWritePayload(data);
      if (editing?.id) {
        const { error } = await gtmSupabase.from("companies").update(payload as never).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await gtmSupabase.from("companies").insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      toast.success(editing ? "Company updated" : "Company added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await gtmSupabase.from("companies").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["companies"] });
      const prev = qc.getQueryData<CompaniesQueryDebug>(["companies"]);
      qc.setQueryData<CompaniesQueryDebug>(["companies"], (old) => old
        ? { ...old, count: Math.max(0, old.count - 1), data: old.data.filter((c) => c.id !== id) }
        : old);
      return { prev };
    },
    onError: (e: Error, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["companies"], ctx.prev);
      toast.error(e.message);
    },
    onSuccess: () => toast.success("Company deleted"),
  });

  const filtered = useMemo(() => {
    const list = companies;
    const q = search.trim().toLowerCase();
    return list.filter((c) => {
      if (tierFilter !== "all" && c.tier !== tierFilter) return false;
      if (activeTags.length > 0) {
        const tags = c.tags ?? [];
        if (!activeTags.every((t) => tags.includes(t))) return false;
      }
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.notes ?? "").toLowerCase().includes(q)
      );
    });
  }, [companies, search, tierFilter, activeTags]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      switch (sort) {
        case "name": return a.name.localeCompare(b.name);
        case "brand": return b.brand_score - a.brand_score;
        case "ai": return b.ai_score - a.ai_score;
        case "shot": return b.shot_score - a.shot_score;
        default: return totalScore(b) - totalScore(a);
      }
    });
    return list;
  }, [filtered, sort]);

  const grouped = useMemo(() => {
    const map: Record<Tier, Company[]> = { god: [], t1: [], t2: [], t3: [], excluded: [] };
    for (const c of sorted) map[c.tier].push(c);
    return map;
  }, [sorted]);

  const total = companies.length;
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of companies) for (const t of c.tags ?? []) if (t) set.add(t);
    return Array.from(set).sort();
  }, [companies]);
  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (c: Company) => { setEditing(c); setModalOpen(true); };
  const toggleTag = (t: string) =>
    setActiveTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  return (
    <div className="space-y-5 min-w-0">
      {/* Page header */}
      <div className="grid items-center gap-3" style={{ gridTemplateColumns: "1fr auto" }}>
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-xl font-semibold" style={{ color: "#F0F0FF", fontFamily: "var(--font-mono)" }}>
            Companies
          </h2>
          <span className="px-2 py-0.5 text-xs"
            style={{ background: "#111118", border: "1px solid #1E1E2E", color: "#8B8B9E", borderRadius: 3, fontFamily: "var(--font-mono)" }}>
            {total}
          </span>
        </div>
        <Button onClick={openAdd} variant="outline"
          style={{ borderColor: "rgba(0,212,255,0.4)", color: "#00D4FF", background: "transparent" }}>
          <Plus size={14} /> Add Company
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative flex-1 min-w-0" style={{ maxWidth: 280 }}>
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#8B8B9E" }} />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search companies..."
            className="pl-8"
            style={{ background: "#111118", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
          />
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {TIER_FILTERS.map((f) => {
            const active = tierFilter === f.value;
            return (
              <button key={f.value} onClick={() => setTierFilter(f.value)}
                className="px-2 py-1 text-xs font-medium transition-colors"
                style={{
                  borderRadius: 3,
                  fontFamily: "var(--font-mono)",
                  background: active ? "#00D4FF" : "transparent",
                  color: active ? "#0A0A0F" : "#8B8B9E",
                  border: `1px solid ${active ? "#00D4FF" : "#1E1E2E"}`,
                }}>
                {f.label}
              </button>
            );
          })}
        </div>
        <div className="flex-shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm"
                style={{ background: "#111118", border: "1px solid #1E1E2E", color: "#F0F0FF" }}>
                Sort: {SORT_LABEL[sort]} <ChevronDown size={12} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <DropdownMenuItem key={k} onClick={() => setSort(k)}>{SORT_LABEL[k]}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Body */}
      {loadError ? (
        <div className="p-6 text-sm" style={{ color: "#EF4444", background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6 }}>
          Failed to load companies: {loadError}
        </div>
      ) : isLoading ? (
        <SkeletonList />
      ) : total === 0 ? (
        <EmptyState
          title="No companies yet."
          subtitle="Add your first one to get started."
          actionLabel="Add Company"
          onAction={openAdd}
        />
      ) : sorted.length === 0 ? (
        <EmptyState
          title="No companies match your search"
          subtitle="Try adjusting your filters."
          actionLabel="Clear filters"
          onAction={() => { setSearch(""); setTierFilter("all"); }}
        />
      ) : (
        <div className="space-y-0">
          {TIER_ORDER.map((t) => {
            const list = grouped[t];
            if (list.length === 0) return null;
            const meta = TIER_META[t];
            const isCollapsed = !!collapsed[t];
            return (
              <section key={t}>
                <button
                  onClick={() => setCollapsed((p) => ({ ...p, [t]: !p[t] }))}
                  className="w-full flex items-center justify-between"
                  style={{
                    height: 36,
                    paddingLeft: 16,
                    paddingRight: 16,
                    background: "#0D0D14",
                    borderBottom: "1px solid #1E1E2E",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="font-bold uppercase"
                      style={{
                        color: meta.color,
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        letterSpacing: "0.1em",
                      }}
                    >
                      {meta.label}
                    </span>
                    <span style={{ color: "#8B8B9E", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                      {list.length}
                    </span>
                  </div>
                  <ChevronDown
                    size={14}
                    style={{
                      color: "#8B8B9E",
                      transform: isCollapsed ? "rotate(-90deg)" : "none",
                      transition: "transform 150ms",
                    }}
                  />
                </button>
                {!isCollapsed && (
                  <div>
                    {list.map((c) => <CompanyRow key={c.id} company={c} onEdit={openEdit} />)}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}


      <CompanyModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initial={editing}
        onSave={(d) => saveMutation.mutateAsync(d)}
        onDelete={(id) => deleteMutation.mutateAsync(id)}
      />
    </div>
  );
}


function SkeletonList() {
  return (
    <div style={{ background: "#111118", border: "1px solid #1E1E2E", borderTop: "1px solid rgba(0,212,255,0.2)", borderRadius: 6 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="grid gap-4 px-4 py-3 animate-pulse"
          style={{ gridTemplateColumns: "200px 60px 300px 80px 1fr 100px", borderBottom: "1px solid #1E1E2E" }}>
          <div className="h-4" style={{ background: "#1E1E2E", borderRadius: 3 }} />
          <div className="h-4 w-12" style={{ background: "#1E1E2E", borderRadius: 3 }} />
          <div className="h-4" style={{ background: "#1E1E2E", borderRadius: 3 }} />
          <div className="h-6 w-12" style={{ background: "#1E1E2E", borderRadius: 3 }} />
          <div className="h-4" style={{ background: "#1E1E2E", borderRadius: 3 }} />
          <div className="h-4" style={{ background: "#1E1E2E", borderRadius: 3 }} />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ title, subtitle, actionLabel, onAction }: { title: string; subtitle: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-2"
      style={{ background: "#111118", border: "1px solid #1E1E2E", borderTop: "1px solid rgba(0,212,255,0.2)", borderRadius: 6 }}>
      <p style={{ color: "#F0F0FF", fontFamily: "var(--font-mono)" }}>{title}</p>
      <p className="text-sm" style={{ color: "#8B8B9E" }}>{subtitle}</p>
      <Button onClick={onAction} variant="outline" className="mt-3"
        style={{ borderColor: "rgba(0,212,255,0.4)", color: "#00D4FF" }}>
        {actionLabel}
      </Button>
    </div>
  );
}
