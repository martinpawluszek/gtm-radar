import { Pencil, ExternalLink, Briefcase } from "lucide-react";
import { Company, SCORE_DIMS, TIER_META, totalScore } from "@/lib/companies";

export function CompanyRow({ company, onEdit }: { company: Company; onEdit: (c: Company) => void }) {
  const tier = TIER_META[company.tier];
  const total = totalScore(company);
  const visibleTags = company.tags.slice(0, 3);
  const overflow = company.tags.length - visibleTags.length;

  return (
    <div
      className="company-row group flex items-center gap-4 transition-colors"
      style={{
        height: 48,
        paddingLeft: 16,
        paddingRight: 16,
        borderBottom: "1px solid #1E1E2E",
      }}
    >
      {/* Name */}
      <div
        className="font-bold truncate"
        style={{ width: 200, color: "#F0F0FF", fontSize: 14 }}
      >
        {company.name}
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
