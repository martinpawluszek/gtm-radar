import { Pencil, ExternalLink, Briefcase } from "lucide-react";
import { Company, SCORE_DIMS, TIER_META, totalScore } from "@/lib/companies";

export function CompanyRow({ company, onEdit }: { company: Company; onEdit: (c: Company) => void }) {
  const tier = TIER_META[company.tier];
  const total = totalScore(company);
  const visibleTags = company.tags.slice(0, 3);
  const overflow = company.tags.length - visibleTags.length;

  return (
    <div
      className="group grid items-center gap-4 px-4 py-3 transition-colors"
      style={{
        gridTemplateColumns: "200px 60px 300px 80px 1fr 100px",
        borderBottom: "1px solid #1E1E2E",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {/* Name */}
      <div className="font-semibold truncate" style={{ color: "#F0F0FF" }}>{company.name}</div>

      {/* Tier badge */}
      <div>
        <span className="inline-block px-2 py-0.5 text-[10px] font-bold tracking-wider"
          style={{
            color: tier.color,
            background: `color-mix(in oklab, ${tier.color} 12%, transparent)`,
            border: `1px solid color-mix(in oklab, ${tier.color} 30%, transparent)`,
            borderRadius: 3,
            fontFamily: "var(--font-mono)",
          }}>
          {tier.short}
        </span>
      </div>

      {/* Score bars */}
      <div className="flex gap-1.5">
        {SCORE_DIMS.map((d) => {
          const v = company[d.key as keyof Company] as number;
          return (
            <div key={d.key} className="flex flex-col items-center gap-1" style={{ width: 40 }}>
              <div className="w-full" style={{ height: 4, background: "#1E1E2E", borderRadius: 2 }}>
                <div style={{ width: `${(v / 5) * 100}%`, height: "100%", background: tier.color, borderRadius: 2 }} />
              </div>
              <div className="text-[10px] leading-none" style={{ color: "#8B8B9E", fontFamily: "var(--font-mono)" }}>
                {d.label}{v}
              </div>
            </div>
          );
        })}
      </div>

      {/* Total */}
      <div className="text-2xl font-bold tabular-nums" style={{ color: "#00D4FF", fontFamily: "var(--font-mono)" }}>
        {total}<span className="text-xs" style={{ color: "#8B8B9E" }}>/25</span>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 overflow-hidden">
        {visibleTags.map((t) => (
          <span key={t} className="px-1.5 py-0.5 text-[10px]"
            style={{ background: "#1E1E2E", color: "#8B8B9E", borderRadius: 3 }}>
            {t}
          </span>
        ))}
        {overflow > 0 && (
          <span className="px-1.5 py-0.5 text-[10px]" style={{ color: "#8B8B9E", fontFamily: "var(--font-mono)" }}>
            +{overflow}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => onEdit(company)} className="p-1.5 hover:text-foreground" style={{ color: "#8B8B9E", borderRadius: 4 }} title="Edit">
          <Pencil size={14} />
        </button>
        {company.website && (
          <a href={company.website} target="_blank" rel="noreferrer" className="p-1.5 hover:text-foreground" style={{ color: "#8B8B9E", borderRadius: 4 }} title="Website">
            <ExternalLink size={14} />
          </a>
        )}
        {company.careers_url && (
          <a href={company.careers_url} target="_blank" rel="noreferrer" className="p-1.5 hover:text-foreground" style={{ color: "#8B8B9E", borderRadius: 4 }} title="Careers">
            <Briefcase size={14} />
          </a>
        )}
      </div>
    </div>
  );
}
