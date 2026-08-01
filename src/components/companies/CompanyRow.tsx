import { Pencil, ExternalLink, Briefcase, Radar } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { gtmSupabase } from "@/lib/gtmSupabase";
import { Company, SCORE_DIMS, TIER_META, totalScore, sourcingBadge, SourcingBadge } from "@/lib/companies";

const SOURCING_STYLES: Record<SourcingBadge["variant"], React.CSSProperties> = {
  ready: { color: "#00D4FF", background: "rgba(0,212,255,0.10)", border: "1px solid rgba(0,212,255,0.30)" },
  discovering: { color: "#F59E0B", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)" },
  unreachable: { color: "#EF4444", background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.30)" },
  not_configured: { color: "#8B8B9E", background: "#1E1E2E", border: "1px solid #1E1E2E" },
};

function SourcingBadgeChip({ company }: { company: Company }) {
  const b = sourcingBadge(company);
  return (
    <span
      className={`whitespace-nowrap${b.variant === "discovering" ? " animate-pulse" : ""}`}
      title={company.sourcing_note ?? company.ats_type ?? "not configured"}
      style={{
        ...SOURCING_STYLES[b.variant],
        fontSize: 10,
        padding: "2px 6px",
        borderRadius: 3,
        fontFamily: "var(--font-mono)",
      }}
    >
      {b.label}
    </span>
  );
}


export function CompanyRow({ company, onEdit }: { company: Company; onEdit: (c: Company) => void }) {
  const tier = TIER_META[company.tier];
  const total = totalScore(company);
  const visibleTags = company.tags.slice(0, 3);
  const overflow = company.tags.length - visibleTags.length;
  const isActive = company.is_active !== false;

  const qc = useQueryClient();
  const toggleActive = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await gtmSupabase
        .from("companies")
        .update({ is_active: next } as never)
        .eq("id", company.id);
      if (error) throw error;
    },
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: ["companies"] });
      const prev = qc.getQueryData<{ data: Company[] } & Record<string, unknown>>(["companies"]);
      if (prev?.data) {
        qc.setQueryData(["companies"], {
          ...prev,
          data: prev.data.map((c) => (c.id === company.id ? { ...c, is_active: next } : c)),
        });
      }
      return { prev };
    },
    onError: (e: Error, _next, ctx) => {
      if (ctx?.prev) qc.setQueryData(["companies"], ctx.prev);
      toast.error(`Could not update: ${e.message}`);
    },
    onSuccess: (_d, next) => {
      toast.success(next ? "Resumed" : "Paused");
      qc.invalidateQueries({ queryKey: ["companies"] });
    },
  });

  const patchCache = (patch: Partial<Company>) => {
    const prev = qc.getQueryData<{ data: Company[] } & Record<string, unknown>>(["companies"]);
    if (prev?.data) {
      qc.setQueryData(["companies"], {
        ...prev,
        data: prev.data.map((c) => (c.id === company.id ? { ...c, ...patch } : c)),
      });
    }
  };

  const discover = useMutation({
    mutationFn: async () => {
      patchCache({ sourcing_status: "discovering", sourcing_note: null });
      await gtmSupabase
        .from("companies")
        .update({ sourcing_status: "discovering" } as never)
        .eq("id", company.id);

      try {
        const { data, error } = await gtmSupabase.functions.invoke("detect-ats", {
          body: { name: company.name, careers_url: company.careers_url || undefined },
        });
        if (error) throw error;
        if (!data || (data as { error?: string }).error) {
          throw new Error((data as { error?: string })?.error ?? "Detection failed");
        }
        const r = data as {
          ats_type: string;
          ats_slug: string | null;
          confidence: "high" | "medium" | "none";
          note: string;
        };
        const status = r.confidence === "none" ? "unreachable" : "ready";
        const note = !company.careers_url && status === "unreachable" ? "No careers URL set" : r.note;
        const { error: upErr } = await gtmSupabase
          .from("companies")
          .update({
            ats_type: r.ats_type,
            ats_slug: r.ats_slug,
            sourcing_status: status,
            sourcing_checked_at: new Date().toISOString(),
            sourcing_note: note,
          } as never)
          .eq("id", company.id);
        if (upErr) throw upErr;
        return { status, note };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Discovery failed";
        await gtmSupabase
          .from("companies")
          .update({
            sourcing_status: "unreachable",
            sourcing_checked_at: new Date().toISOString(),
            sourcing_note: company.careers_url ? msg : "No careers URL set",
          } as never)
          .eq("id", company.id);
        throw new Error(msg);
      }
    },
    onError: (e: Error) => {
      toast.error(`Discovery failed: ${e.message}`);
      qc.invalidateQueries({ queryKey: ["companies"] });
    },
    onSuccess: (r) => {
      if (r.status === "ready") toast.success("Source ready");
      else toast.error(r.note || "Unreachable");
      qc.invalidateQueries({ queryKey: ["companies"] });
    },
  });



  return (
    <div
      className="company-row group flex items-center gap-4 transition-colors"
      style={{
        height: 48,
        paddingLeft: 16,
        paddingRight: 16,
        borderBottom: "1px solid #1E1E2E",
        opacity: isActive ? 1 : 0.5,
      }}
    >
      {/* Active toggle */}
      <div style={{ width: 36 }} className="flex justify-center">
        <Switch
          checked={isActive}
          onCheckedChange={(v) => toggleActive.mutate(v)}
          aria-label={isActive ? "Pause company" : "Resume company"}
          title={isActive ? "Active — pause getting postings" : "Paused — resume getting postings"}
        />
      </div>

      {/* Name */}
      <div
        className="font-bold truncate flex items-center gap-2"
        style={{ width: 200, color: "#F0F0FF", fontSize: 14 }}
      >
        <span className="truncate">{company.name}</span>
        {!isActive && (
          <span
            style={{
              fontSize: 9,
              color: "#F59E0B",
              background: "rgba(245,158,11,0.10)",
              border: "1px solid rgba(245,158,11,0.30)",
              padding: "1px 5px",
              borderRadius: 3,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.08em",
            }}
          >
            PAUSED
          </span>
        )}
      </div>

      {/* Tier badge */}
      <div style={{ width: 50 }} className="flex justify-center">
        <span
          className="inline-flex items-center justify-center font-bold tracking-wider"
          style={{
            width: 50,
            fontSize: 11,
            padding: "2px 0",
            color: tier.color,
            background: `color-mix(in oklab, ${tier.color} 12%, transparent)`,
            border: `1px solid color-mix(in oklab, ${tier.color} 30%, transparent)`,
            borderRadius: 3,
            fontFamily: "var(--font-mono)",
          }}
        >
          {tier.short}
        </span>
      </div>

      {/* Sourcing badge */}
      <div className="flex-shrink-0 flex items-center gap-1">
        <SourcingBadgeChip company={company} />
        <button
          type="button"
          onClick={() => discover.mutate()}
          disabled={discover.isPending}
          className="p-1 disabled:opacity-40"
          title="Discover job postings for this company"
          style={{ color: "#8B8B9E" }}
        >
          <Radar size={14} />
        </button>
      </div>


      {/* Score bars */}
      <div className="flex gap-2">
        {SCORE_DIMS.map((d) => {
          const v = company[d.key as keyof Company] as number;
          return (
            <div key={d.key} className="flex flex-col items-center gap-1" style={{ width: 36 }}>
              <div className="w-full" style={{ height: 3, background: "#1E1E2E", borderRadius: 2 }}>
                <div style={{ width: `${(v / 5) * 100}%`, height: "100%", background: tier.color, borderRadius: 2 }} />
              </div>
              <div
                className="leading-none"
                style={{ fontSize: 10, color: "#8B8B9E", fontFamily: "var(--font-mono)" }}
              >
                {d.label} <span style={{ color: tier.color }}>{v}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Total */}
      <div
        className="font-bold tabular-nums flex items-baseline gap-1"
        style={{ color: "#00D4FF", fontFamily: "var(--font-mono)", fontSize: 18, width: 70 }}
      >
        {total}
        <span style={{ color: "#8B8B9E", fontSize: 11, fontWeight: 400 }}>/25</span>
      </div>

      {/* Tags */}
      <div className="flex flex-1 items-center gap-1 overflow-hidden">
        {visibleTags.map((t) => (
          <span
            key={t}
            className="whitespace-nowrap"
            style={{
              background: "#1E1E2E",
              color: "#8B8B9E",
              fontSize: 10,
              padding: "2px 6px",
              borderRadius: 3,
            }}
          >
            {t}
          </span>
        ))}
        {overflow > 0 && (
          <span style={{ color: "#8B8B9E", fontSize: 10, fontFamily: "var(--font-mono)" }}>
            +{overflow}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="company-row-actions flex justify-end gap-1 opacity-0 transition-opacity">
        <button onClick={() => onEdit(company)} className="company-row-action p-1" title="Edit" style={{ color: "#8B8B9E" }}>
          <Pencil size={14} />
        </button>
        {company.website && (
          <a href={company.website} target="_blank" rel="noreferrer" className="company-row-action p-1" title="Website" style={{ color: "#8B8B9E" }}>
            <ExternalLink size={14} />
          </a>
        )}
        {company.careers_url && (
          <a href={company.careers_url} target="_blank" rel="noreferrer" className="company-row-action p-1" title="Careers" style={{ color: "#8B8B9E" }}>
            <Briefcase size={14} />
          </a>
        )}
      </div>
    </div>
  );
}
