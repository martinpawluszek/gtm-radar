import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { gtmSupabase } from "@/lib/gtmSupabase";
import { Skeleton } from "@/components/ui/skeleton";

const MONO = "var(--font-mono)";

export type RuleType = "accept" | "maybe" | "hard";
export type Scope = "remote" | "country" | "city" | "region" | "raw_pattern";
export type RemoteScope =
  | "anywhere"
  | "europe"
  | "eu"
  | "us"
  | "hybrid"
  | "onsite"
  | "unknown";
export type MatchMode = "contains" | "equals" | "regex";

export type LocationRule = {
  id: string;
  pattern: string;
  rule_type: RuleType;
  reason: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
  location_score: number | null;
  priority: number;
  notes: string | null;
  scope: Scope | null;
  country: string | null;
  city: string | null;
  region: string | null;
  remote_scope: RemoteScope | null;
  match_mode: MatchMode;
};

type DraftRule = {
  id?: string;
  pattern: string;
  rule_type: RuleType;
  location_score: number | null;
  scope: Scope | null;
  country: string;
  city: string;
  region: string;
  remote_scope: RemoteScope | null;
  match_mode: MatchMode;
  priority: number;
  reason: string;
  notes: string;
  is_active: boolean;
  // UI-only: true when user manually overrode an auto-derived value
  _advancedDirty: {
    rule_type?: boolean;
    scope?: boolean;
    remote_scope?: boolean;
    region?: boolean;
    match_mode?: boolean;
    priority?: boolean;
    reason?: boolean;
  };
};

const EMPTY_DRAFT: DraftRule = {
  pattern: "",
  rule_type: "accept",
  location_score: null,
  scope: null,
  country: "",
  city: "",
  region: "",
  remote_scope: null,
  match_mode: "equals",
  priority: 100,
  reason: "",
  notes: "",
  is_active: true,
  _advancedDirty: {},
};

// ---------- Country list ----------
const COUNTRIES: string[] = [
  "Australia",
  "Belgium",
  "Brazil",
  "Canada",
  "Colombia",
  "Denmark",
  "France",
  "Germany",
  "India",
  "Ireland",
  "Israel",
  "Italy",
  "Japan",
  "Mexico",
  "Morocco",
  "Netherlands",
  "New Zealand",
  "Poland",
  "Saudi Arabia",
  "Serbia",
  "Singapore",
  "South Korea",
  "Spain",
  "Sweden",
  "Switzerland",
  "Turkey",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
];

// Aliases → canonical
const COUNTRY_ALIASES: Record<string, string> = {
  usa: "United States",
  us: "United States",
  "u.s.": "United States",
  "u.s.a.": "United States",
  america: "United States",
  "united states of america": "United States",
  uk: "United Kingdom",
  "u.k.": "United Kingdom",
  britain: "United Kingdom",
  "great britain": "United Kingdom",
  england: "United Kingdom",
  uae: "United Arab Emirates",
  "u.a.e.": "United Arab Emirates",
  turkiye: "Turkey",
  türkiye: "Turkey",
  holland: "Netherlands",
  "the netherlands": "Netherlands",
  korea: "South Korea",
  "republic of korea": "South Korea",
  nz: "New Zealand",
};

function normalizeCountry(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  if (COUNTRY_ALIASES[lower]) return COUNTRY_ALIASES[lower];
  const found = COUNTRIES.find((c) => c.toLowerCase() === lower);
  return found ?? null;
}

const COUNTRY_REGION: Record<string, string> = {
  Germany: "Europe",
  France: "Europe",
  Spain: "Europe",
  Netherlands: "Europe",
  Poland: "Europe",
  Ireland: "Europe",
  Sweden: "Europe",
  Switzerland: "Europe",
  Denmark: "Europe",
  Belgium: "Europe",
  Italy: "Europe",
  Serbia: "Europe",
  "United Kingdom": "Europe",
  "United States": "North America",
  Canada: "North America",
  Mexico: "North America",
  Colombia: "LATAM",
  Brazil: "LATAM",
  India: "APAC",
  Japan: "APAC",
  "South Korea": "APAC",
  Singapore: "APAC",
  Australia: "Oceania",
  "New Zealand": "Oceania",
  "Saudi Arabia": "Middle East",
  "United Arab Emirates": "Middle East",
  Israel: "Middle East",
  Morocco: "Africa",
};

// ---------- Derivation ----------
function ruleTypeFromScore(score: number | null): RuleType {
  if (score === 1) return "hard";
  if (score === 2 || score === 3) return "maybe";
  return "accept"; // 4, 5, or null default
}

function scoreMeaning(score: number | null): string {
  switch (score) {
    case 1: return "Reject";
    case 2: return "Weak";
    case 3: return "Possible";
    case 4: return "Good";
    case 5: return "Ideal";
    default: return "—";
  }
}

function scoreLabel(score: number): string {
  switch (score) {
    case 1: return "1 — Reject / hard no";
    case 2: return "2 — Weak fit";
    case 3: return "3 — Possible / friction";
    case 4: return "4 — Good fit";
    case 5: return "5 — Ideal fit";
    default: return String(score);
  }
}

function scoreDescription(score: number | null): string {
  switch (score) {
    case 5: return "Best possible location, e.g. Berlin or fully remote anywhere.";
    case 4: return "Strong practical fit, e.g. target European cities or remote Europe.";
    case 3: return "Potentially interesting but has location friction.";
    case 2: return "Unlikely, but not an automatic rejection.";
    case 1: return "Hard-no location; can be dismissed automatically.";
    default: return "";
  }
}

// Best-to-worst order for dropdowns
const SCORE_ORDER = [5, 4, 3, 2, 1] as const;

function suggestedReason(score: number | null): string {
  switch (score) {
    case 1: return "Hard-no location";
    case 2: return "Low location fit";
    case 3: return "Location friction";
    case 4: return "Strong location fit";
    case 5: return "Best location fit";
    default: return "";
  }
}

function deriveRemoteScope(pattern: string): RemoteScope | null {
  const p = pattern.toLowerCase();
  if (/\b(worldwide|anywhere)\b/.test(p)) return "anywhere";
  if (/\bremote\s*(eu|europe)\b/.test(p) || /\b(eu|europe)\s*remote\b/.test(p)) return "europe";
  if (/\bremote\s*us\b/.test(p) || /\bus\s*remote\b/.test(p) || /united states,\s*remote/.test(p))
    return "us";
  if (/\bremote\b/.test(p)) return "unknown";
  return null;
}

function deriveRegionFromPattern(pattern: string): string | null {
  const p = pattern.toLowerCase();
  if (/\bemea\b/.test(p)) return "EMEA";
  if (/\bapac\b/.test(p)) return "APAC";
  if (/\blatam\b/.test(p)) return "LATAM";
  if (/\beurope\b/.test(p)) return "Europe";
  return null;
}

function deriveScope(d: DraftRule): Scope {
  const p = d.pattern.toLowerCase();
  if (/\b(remote|worldwide|anywhere)\b/.test(p)) {
    if (/\b(emea|apac|latam|europe)\b/.test(p)) return "region";
    return "remote";
  }
  if (/\b(emea|apac|latam)\b/.test(p)) return "region";
  if (d.city.trim()) return "city";
  if (d.country.trim()) return "country";
  return "raw_pattern";
}

function derivePriorityFromScope(s: Scope): number {
  switch (s) {
    case "remote": return 5;
    case "city": return 10;
    case "region": return 20;
    case "country": return 30;
    case "raw_pattern":
    default: return 100;
  }
}

// Parse "Spain, Madrid" / "Madrid, Spain" / "Madrid" etc.
function inferCountryCity(location: string): { country: string; city: string } {
  const parts = location.split(/[,/|]/).map((s) => s.trim()).filter(Boolean);
  let country = "";
  let city = "";
  if (parts.length === 0) return { country, city };
  // Find any part that normalizes to a country
  let countryIdx = -1;
  for (let i = 0; i < parts.length; i++) {
    const n = normalizeCountry(parts[i]);
    if (n) {
      country = n;
      countryIdx = i;
      break;
    }
  }
  if (countryIdx >= 0) {
    // city = first non-country, non-"remote" looking part
    for (let i = 0; i < parts.length; i++) {
      if (i === countryIdx) continue;
      const v = parts[i];
      if (/^(remote|hybrid|onsite|worldwide|anywhere)$/i.test(v)) continue;
      if (normalizeCountry(v)) continue;
      city = v;
      break;
    }
  } else if (parts.length === 1) {
    // single token: leave city/country empty; user can fill
  }
  return { country, city };
}

// ---------- Data ----------
async function fetchLocationRules(): Promise<LocationRule[]> {
  const { data, error } = await gtmSupabase
    .from("location_filter_rules" as never)
    .select("*");
  if (error) throw error;
  const rows = (data ?? []) as unknown as LocationRule[];
  const ruleTypeOrder: Record<RuleType, number> = { hard: 0, maybe: 1, accept: 2 };
  return [...rows].sort((a, b) => {
    const sa = a.location_score ?? -Infinity;
    const sb = b.location_score ?? -Infinity;
    if (sa !== sb) return sb - sa;
    const ra = ruleTypeOrder[a.rule_type] ?? 99;
    const rb = ruleTypeOrder[b.rule_type] ?? 99;
    if (ra !== rb) return ra - rb;
    if (a.priority !== b.priority) return a.priority - b.priority;
    const ca = (a.country ?? "").localeCompare(b.country ?? "");
    if (ca !== 0) return ca;
    const ci = (a.city ?? "").localeCompare(b.city ?? "");
    if (ci !== 0) return ci;
    return (a.pattern ?? "").localeCompare(b.pattern ?? "");
  });
}

function draftToRow(d: DraftRule) {
  // Apply auto-derivation for any field the user did not explicitly override
  const dirty = d._advancedDirty;
  const rule_type = dirty.rule_type ? d.rule_type : ruleTypeFromScore(d.location_score);
  const scope = dirty.scope ? d.scope : deriveScope(d);
  const remote_scope = dirty.remote_scope ? d.remote_scope : deriveRemoteScope(d.pattern);
  let region: string | null = null;
  if (dirty.region) {
    region = d.region.trim() || null;
  } else {
    region =
      deriveRegionFromPattern(d.pattern) ??
      (d.country.trim() ? COUNTRY_REGION[d.country.trim()] ?? null : null);
  }
  const match_mode = dirty.match_mode ? d.match_mode : d.match_mode; // default already set by caller
  const priority = dirty.priority
    ? d.priority
    : derivePriorityFromScope(scope ?? "raw_pattern");
  const reason = dirty.reason
    ? (d.reason.trim() || null)
    : (d.reason.trim() || suggestedReason(d.location_score) || null);

  return {
    pattern: d.pattern.trim(),
    rule_type,
    location_score: d.location_score,
    scope,
    country: d.country.trim() || null,
    city: d.city.trim() || null,
    region,
    remote_scope,
    match_mode,
    priority,
    reason,
    notes: d.notes.trim() || null,
    is_active: d.is_active,
  };
}

async function insertRule(d: DraftRule) {
  const { error } = await gtmSupabase
    .from("location_filter_rules" as never)
    .insert(draftToRow(d) as never);
  if (error) throw error;
}

async function updateRule(id: string, d: DraftRule) {
  const { error } = await gtmSupabase
    .from("location_filter_rules" as never)
    .update({ ...draftToRow(d), updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) throw error;
}

async function setActive(id: string, is_active: boolean) {
  const { error } = await gtmSupabase
    .from("location_filter_rules" as never)
    .update({ is_active, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) throw error;
}

async function deleteRule(id: string) {
  const { error } = await gtmSupabase
    .from("location_filter_rules" as never)
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ---------- Theme ----------
const BG = "#111118";
const BG_DEEP = "#0A0A0F";
const BORDER = "#1E1E2E";
const TEXT = "#F0F0FF";
const MUTED = "#8B8B9E";
const CYAN = "#00D4FF";

const RULE_TYPES: RuleType[] = ["accept", "maybe", "hard"];
const SCOPES: Scope[] = ["remote", "country", "city", "region", "raw_pattern"];
const REMOTE_SCOPES: RemoteScope[] = [
  "anywhere",
  "europe",
  "eu",
  "us",
  "hybrid",
  "onsite",
  "unknown",
];
const MATCH_MODES: MatchMode[] = ["contains", "equals", "regex"];

function ruleTypeBadge(t: RuleType) {
  if (t === "accept") return { bg: "rgba(34,197,94,0.15)", color: "#22C55E" };
  if (t === "maybe") return { bg: "rgba(249,158,11,0.15)", color: "#F59E0B" };
  return { bg: "rgba(239,68,68,0.15)", color: "#EF4444" };
}

function Badge({
  children,
  color,
  bg,
}: {
  children: React.ReactNode;
  color: string;
  bg: string;
}) {
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 text-[11px] font-medium uppercase"
      style={{ color, background: bg, borderRadius: 3, fontFamily: MONO, letterSpacing: 0.3 }}
    >
      {children}
    </span>
  );
}

function fieldStyle(): React.CSSProperties {
  return {
    background: BG_DEEP,
    border: `1px solid ${BORDER}`,
    borderRadius: 4,
    color: TEXT,
    fontFamily: MONO,
    fontSize: 13,
    padding: "6px 8px",
    outline: "none",
    width: "100%",
  };
}

// ---------- Main ----------
export function LocationTab() {
  const qc = useQueryClient();
  const { data: rules = [], isLoading, error } = useQuery({
    queryKey: ["location-filter-rules"],
    queryFn: fetchLocationRules,
  });

  const [search, setSearch] = useState("");
  const [scoreFilter, setScoreFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<DraftRule>(EMPTY_DRAFT);
  const [editId, setEditId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<LocationRule | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rules.filter((r) => {
      if (scoreFilter !== "all") {
        if (scoreFilter === "unscored") {
          if (r.location_score !== null) return false;
        } else if (String(r.location_score) !== scoreFilter) return false;
      }
      if (typeFilter !== "all" && r.rule_type !== typeFilter) return false;
      if (activeFilter === "active" && !r.is_active) return false;
      if (activeFilter === "inactive" && r.is_active) return false;
      if (q) {
        const hay = [r.pattern, r.country, r.city, r.region, r.reason, r.notes]
          .map((v) => (v ?? "").toLowerCase())
          .join(" \u0000 ");
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rules, search, scoreFilter, typeFilter, activeFilter]);

  const insertMut = useMutation({
    mutationFn: insertRule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["location-filter-rules"] });
      qc.invalidateQueries({ queryKey: ["job-postings-locations"] });
      toast.success("Saved");
      setModalOpen(false);
    },
    onError: (e: Error) => {
      setFormError(e.message || "Save failed");
      toast.error("Save failed — try again");
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: DraftRule }) => updateRule(id, draft),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["location-filter-rules"] });
      qc.invalidateQueries({ queryKey: ["job-postings-locations"] });
      toast.success("Saved");
      setModalOpen(false);
    },
    onError: (e: Error) => {
      setFormError(e.message || "Save failed");
      toast.error("Save failed — try again");
    },
  });
  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      setActive(id, is_active),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["location-filter-rules"] });
      qc.invalidateQueries({ queryKey: ["job-postings-locations"] });
      toast.success("Saved");
    },
    onError: () => toast.error("Save failed — try again"),
  });
  const deleteMut = useMutation({
    mutationFn: deleteRule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["location-filter-rules"] });
      qc.invalidateQueries({ queryKey: ["job-postings-locations"] });
      toast.success("Saved");
      setConfirmDelete(null);
    },
    onError: () => toast.error("Save failed — try again"),
  });

  function openAdd() {
    setDraft({ ...EMPTY_DRAFT, _advancedDirty: {} });
    setEditId(null);
    setFormError("");
    setModalOpen(true);
  }
  function openEdit(r: LocationRule) {
    // Treat existing values as user-set (dirty) so editing doesn't silently overwrite them
    setDraft({
      id: r.id,
      pattern: r.pattern ?? "",
      rule_type: r.rule_type,
      location_score: r.location_score,
      scope: r.scope,
      country: r.country ?? "",
      city: r.city ?? "",
      region: r.region ?? "",
      remote_scope: r.remote_scope,
      match_mode: r.match_mode,
      priority: r.priority ?? 100,
      reason: r.reason ?? "",
      notes: r.notes ?? "",
      is_active: r.is_active,
      _advancedDirty: {
        rule_type: true,
        scope: true,
        remote_scope: true,
        region: true,
        match_mode: true,
        priority: true,
        reason: !!r.reason,
      },
    });
    setEditId(r.id);
    setFormError("");
    setModalOpen(true);
  }

  function submit() {
    if (!draft.pattern.trim()) {
      setFormError("Match text is required");
      return;
    }
    if (draft.location_score === null) {
      setFormError("Location score is required");
      return;
    }
    setFormError("");
    if (editId) updateMut.mutate({ id: editId, draft });
    else insertMut.mutate(draft);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters bar */}
      <div
        className="flex flex-wrap items-center gap-2 p-3"
        style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 6 }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search match text, country, city, reason, notes..."
          style={{ ...fieldStyle(), flex: "1 1 260px", minWidth: 200 }}
        />
        <FilterSelect
          label="Score"
          value={scoreFilter}
          onChange={setScoreFilter}
          options={[
            { value: "all", label: "All" },
            { value: "5", label: "5 — Ideal" },
            { value: "4", label: "4 — Good" },
            { value: "3", label: "3 — Possible" },
            { value: "2", label: "2 — Weak" },
            { value: "1", label: "1 — Reject" },
            { value: "unscored", label: "Unscored" },
          ]}
        />
        <FilterSelect
          label="Type"
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: "all", label: "All" },
            ...RULE_TYPES.map((t) => ({ value: t, label: t })),
          ]}
        />
        <FilterSelect
          label="Status"
          value={activeFilter}
          onChange={setActiveFilter}
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]}
        />
        <button
          onClick={openAdd}
          className="px-3 py-1.5 text-[12px] font-semibold transition-colors"
          style={{
            background: CYAN,
            color: "#000",
            borderRadius: 4,
            fontFamily: MONO,
            cursor: "pointer",
          }}
        >
          + Add Rule
        </button>
      </div>

      {/* Table */}
      <div
        style={{
          background: BG,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table
            className="w-full text-[12px]"
            style={{ borderCollapse: "collapse", fontFamily: MONO, color: TEXT }}
          >
            <thead>
              <tr style={{ background: BG_DEEP, color: MUTED, textAlign: "left" }}>
                {[
                  "Score",
                  "Meaning",
                  "Match text",
                  "Country",
                  "City",
                  "Type",
                  "Matching",
                  "Active",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-2 py-2 text-[11px] uppercase tracking-wide font-medium whitespace-nowrap"
                    style={{ borderBottom: `1px solid ${BORDER}` }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((__, j) => (
                      <td
                        key={j}
                        className="px-2 py-2"
                        style={{ borderBottom: `1px solid ${BORDER}` }}
                      >
                        <Skeleton style={{ height: 16, width: "80%" }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center" style={{ color: "#EF4444" }}>
                    Failed to load: {(error as Error).message}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center" style={{ color: MUTED }}>
                    No rules match the current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const rt = ruleTypeBadge(r.rule_type);
                  return (
                    <tr
                      key={r.id}
                      style={{
                        opacity: r.is_active ? 1 : 0.55,
                        borderBottom: `1px solid ${BORDER}`,
                      }}
                      title={
                        [
                          r.priority != null ? `priority ${r.priority}` : null,
                          r.region ? `region ${r.region}` : null,
                          r.remote_scope ? `remote ${r.remote_scope}` : null,
                          r.scope ? `scope ${r.scope}` : null,
                          r.notes ? `notes: ${r.notes}` : null,
                          r.reason ? `reason: ${r.reason}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      }
                    >
                      <td className="px-2 py-1.5">
                        {r.location_score ?? <span style={{ color: MUTED }}>—</span>}
                      </td>
                      <td className="px-2 py-1.5" style={{ color: MUTED }}>
                        {scoreMeaning(r.location_score)}
                      </td>
                      <td
                        className="px-2 py-1.5"
                        style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}
                        title={r.pattern}
                      >
                        {r.pattern}
                      </td>
                      <td className="px-2 py-1.5">{r.country ?? ""}</td>
                      <td className="px-2 py-1.5">{r.city ?? ""}</td>
                      <td className="px-2 py-1.5">
                        <Badge color={rt.color} bg={rt.bg}>
                          {r.rule_type}
                        </Badge>
                      </td>
                      <td className="px-2 py-1.5" style={{ color: MUTED }}>
                        {r.match_mode}
                      </td>
                      <td className="px-2 py-1.5">
                        {r.is_active ? (
                          <Badge color={CYAN} bg="rgba(0,212,255,0.12)">
                            on
                          </Badge>
                        ) : (
                          <Badge color={MUTED} bg="rgba(139,139,158,0.12)">
                            off
                          </Badge>
                        )}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <RowAction onClick={() => openEdit(r)}>Edit</RowAction>
                        <RowAction
                          onClick={() =>
                            toggleMut.mutate({ id: r.id, is_active: !r.is_active })
                          }
                        >
                          {r.is_active ? "Deactivate" : "Reactivate"}
                        </RowAction>
                        <RowAction onClick={() => setConfirmDelete(r)} color="#EF4444">
                          Delete
                        </RowAction>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div
          className="px-3 py-2 text-[11px]"
          style={{ borderTop: `1px solid ${BORDER}`, color: MUTED, fontFamily: MONO }}
        >
          {filtered.length} of {rules.length} rules · hover a row to see priority, region,
          remote scope, and notes
        </div>
      </div>

      {/* Unrated Job Locations */}
      <UnratedLocations
        rules={rules}
        onRate={(location) => {
          const { country, city } = inferCountryCity(location);
          setDraft({
            ...EMPTY_DRAFT,
            pattern: location,
            country,
            city,
            match_mode: "equals",
            is_active: true,
            _advancedDirty: {},
          });
          setEditId(null);
          setFormError("");
          setModalOpen(true);
        }}
      />

      {/* Modal */}
      {modalOpen && (
        <Modal onClose={() => setModalOpen(false)}>
          <RuleForm
            draft={draft}
            setDraft={setDraft}
            onSubmit={submit}
            onCancel={() => setModalOpen(false)}
            error={formError}
            isPending={insertMut.isPending || updateMut.isPending}
            title={editId ? "Edit location rule" : "Add location rule"}
          />
        </Modal>
      )}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)}>
          <div className="flex flex-col gap-4" style={{ minWidth: 360 }}>
            <h3 className="text-sm font-semibold" style={{ color: TEXT, fontFamily: MONO }}>
              Delete rule?
            </h3>
            <p className="text-[13px]" style={{ color: MUTED }}>
              This will permanently delete the rule for match text{" "}
              <span style={{ color: TEXT, fontFamily: MONO }}>"{confirmDelete.pattern}"</span>.
              This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 text-[12px]"
                style={{
                  background: "transparent",
                  color: MUTED,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 4,
                  fontFamily: MONO,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMut.mutate(confirmDelete.id)}
                disabled={deleteMut.isPending}
                className="px-3 py-1.5 text-[12px] font-semibold"
                style={{
                  background: "#EF4444",
                  color: "#fff",
                  borderRadius: 4,
                  fontFamily: MONO,
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function RowAction({
  children,
  onClick,
  color = CYAN,
}: {
  children: React.ReactNode;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="text-[11px] px-1.5 py-0.5 mr-1"
      style={{
        color,
        background: "transparent",
        border: `1px solid ${BORDER}`,
        borderRadius: 3,
        fontFamily: MONO,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label
      className="flex items-center gap-1.5 text-[11px]"
      style={{ color: MUTED, fontFamily: MONO }}
    >
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...fieldStyle(), padding: "4px 6px", width: "auto", fontSize: 12 }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ background: BG_DEEP }}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: BG,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          padding: 24,
          maxWidth: 720,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span
        className="text-[11px] uppercase tracking-wide"
        style={{ color: MUTED, fontFamily: MONO }}
      >
        {label}
      </span>
      {children}
      {hint && (
        <span className="text-[11px]" style={{ color: MUTED }}>
          {hint}
        </span>
      )}
    </label>
  );
}

function RuleForm({
  draft,
  setDraft,
  onSubmit,
  onCancel,
  error,
  isPending,
  title,
}: {
  draft: DraftRule;
  setDraft: (d: DraftRule) => void;
  onSubmit: () => void;
  onCancel: () => void;
  error: string;
  isPending: boolean;
  title: string;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  function up<K extends keyof DraftRule>(k: K, v: DraftRule[K]) {
    setDraft({ ...draft, [k]: v });
  }
  function markDirty(k: keyof DraftRule["_advancedDirty"]) {
    setDraft({ ...draft, _advancedDirty: { ...draft._advancedDirty, [k]: true } });
  }

  // Live preview of auto-derived values (what will be saved)
  const previewRow = useMemo(() => draftToRow(draft), [draft]);

  // Keep reason auto-suggested when user hasn't edited it
  useEffect(() => {
    if (!draft._advancedDirty.reason) {
      const suggested = suggestedReason(draft.location_score);
      if (draft.reason !== suggested) {
        setDraft({ ...draft, reason: suggested });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.location_score]);

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold" style={{ color: TEXT, fontFamily: MONO }}>
        {title}
      </h3>

      <div
        className="text-[11px] flex flex-col gap-1 p-2.5"
        style={{
          borderLeft: `2px solid ${CYAN}`,
          background: "rgba(0,212,255,0.05)",
          color: MUTED,
          borderRadius: 3,
        }}
      >
        <span>Pick a location score from 1 to 5. The rule type is set automatically.</span>
        <span>
          Match text is what we look for in job locations. Country and city help organize the
          rule.
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Match text *" hint="What we look for inside the job location string.">
          <input
            value={draft.pattern}
            onChange={(e) => up("pattern", e.target.value)}
            style={fieldStyle()}
            placeholder="e.g. Spain, Madrid"
          />
        </Field>

        <Field
          label="Location score *"
          hint={scoreDescription(draft.location_score) || "Pick 1 (reject) to 5 (ideal)."}
        >
          <select
            value={draft.location_score ?? ""}
            onChange={(e) => {
              const v = e.target.value === "" ? null : Number(e.target.value);
              setDraft({ ...draft, location_score: v });
            }}
            style={fieldStyle()}
          >
            <option value="">— Select score —</option>
            {SCORE_ORDER.map((n) => (
              <option key={n} value={n}>
                {scoreLabel(n)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Country">
          <select
            value={draft.country}
            onChange={(e) => up("country", e.target.value)}
            style={fieldStyle()}
          >
            <option value="">—</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <Field label="City">
          <input
            value={draft.city}
            onChange={(e) => up("city", e.target.value)}
            style={fieldStyle()}
            placeholder="optional"
          />
        </Field>

        <div className="col-span-2">
          <Field label="Reason" hint="Auto-suggested from score. Edit to override.">
            <input
              value={draft.reason}
              onChange={(e) => {
                markDirty("reason");
                setDraft({ ...draft, reason: e.target.value, _advancedDirty: { ...draft._advancedDirty, reason: true } });
              }}
              style={fieldStyle()}
              placeholder={suggestedReason(draft.location_score) || "optional"}
            />
          </Field>
        </div>

        <div className="col-span-2">
          <Field label="Notes">
            <textarea
              value={draft.notes}
              onChange={(e) => up("notes", e.target.value)}
              style={{ ...fieldStyle(), minHeight: 70, resize: "vertical" }}
            />
          </Field>
        </div>

        <Field label="Active">
          <label
            className="flex items-center gap-2 text-[13px]"
            style={{ color: TEXT, fontFamily: MONO }}
          >
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={(e) => up("is_active", e.target.checked)}
            />
            {draft.is_active ? "Active" : "Inactive"}
          </label>
        </Field>
      </div>

      {/* Auto-derived preview */}
      <div
        className="text-[11px] p-2.5"
        style={{
          background: BG_DEEP,
          border: `1px solid ${BORDER}`,
          borderRadius: 4,
          color: MUTED,
          fontFamily: MONO,
        }}
      >
        Will save as:{" "}
        <span style={{ color: TEXT }}>type {previewRow.rule_type}</span>
        {" · "}
        <span style={{ color: TEXT }}>scope {previewRow.scope ?? "—"}</span>
        {" · "}
        <span style={{ color: TEXT }}>matching {previewRow.match_mode}</span>
        {" · "}
        <span style={{ color: TEXT }}>priority {previewRow.priority}</span>
        {previewRow.region ? (
          <>
            {" · "}
            <span style={{ color: TEXT }}>region {previewRow.region}</span>
          </>
        ) : null}
        {previewRow.remote_scope ? (
          <>
            {" · "}
            <span style={{ color: TEXT }}>remote {previewRow.remote_scope}</span>
          </>
        ) : null}
      </div>

      {/* Advanced */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-[11px] px-2 py-1"
          style={{
            background: "transparent",
            color: MUTED,
            border: `1px solid ${BORDER}`,
            borderRadius: 4,
            fontFamily: MONO,
            cursor: "pointer",
          }}
        >
          {showAdvanced ? "▾ Hide advanced options" : "▸ Show advanced options"}
        </button>
        {showAdvanced && (
          <div className="mt-3 flex flex-col gap-3">
            <div
              className="text-[11px] p-2.5"
              style={{
                borderLeft: `2px solid #F59E0B`,
                background: "rgba(249,158,11,0.05)",
                color: MUTED,
                borderRadius: 3,
              }}
            >
              Advanced fields control how rules match jobs. Most users should not need to edit
              these.
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rule type">
                <select
                  value={draft.rule_type}
                  onChange={(e) => {
                    markDirty("rule_type");
                    setDraft({
                      ...draft,
                      rule_type: e.target.value as RuleType,
                      _advancedDirty: { ...draft._advancedDirty, rule_type: true },
                    });
                  }}
                  style={fieldStyle()}
                >
                  {RULE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Location type (scope)">
                <select
                  value={draft.scope ?? ""}
                  onChange={(e) => {
                    const v = e.target.value === "" ? null : (e.target.value as Scope);
                    setDraft({
                      ...draft,
                      scope: v,
                      _advancedDirty: { ...draft._advancedDirty, scope: true },
                    });
                  }}
                  style={fieldStyle()}
                >
                  <option value="">— auto —</option>
                  {SCOPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Remote scope">
                <select
                  value={draft.remote_scope ?? ""}
                  onChange={(e) => {
                    const v =
                      e.target.value === "" ? null : (e.target.value as RemoteScope);
                    setDraft({
                      ...draft,
                      remote_scope: v,
                      _advancedDirty: { ...draft._advancedDirty, remote_scope: true },
                    });
                  }}
                  style={fieldStyle()}
                >
                  <option value="">— auto —</option>
                  {REMOTE_SCOPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Region">
                <input
                  value={draft.region}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      region: e.target.value,
                      _advancedDirty: { ...draft._advancedDirty, region: true },
                    })
                  }
                  style={fieldStyle()}
                  placeholder="auto"
                />
              </Field>
              <Field label="Matching (match mode)">
                <select
                  value={draft.match_mode}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      match_mode: e.target.value as MatchMode,
                      _advancedDirty: { ...draft._advancedDirty, match_mode: true },
                    })
                  }
                  style={fieldStyle()}
                >
                  {MATCH_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Priority">
                <input
                  type="number"
                  value={draft.priority}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      priority: Number(e.target.value),
                      _advancedDirty: { ...draft._advancedDirty, priority: true },
                    })
                  }
                  style={fieldStyle()}
                />
              </Field>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="text-[12px]" style={{ color: "#EF4444", fontFamily: MONO }}>
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-[12px]"
          style={{
            background: "transparent",
            color: MUTED,
            border: `1px solid ${BORDER}`,
            borderRadius: 4,
            fontFamily: MONO,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          onClick={onSubmit}
          disabled={isPending}
          className="px-3 py-1.5 text-[12px] font-semibold"
          style={{
            background: CYAN,
            color: "#000",
            borderRadius: 4,
            fontFamily: MONO,
            cursor: "pointer",
          }}
        >
          {isPending ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

// ---------- Unrated ----------
type JobPostingRow = {
  location: string | null;
  title: string | null;
  disqualified: boolean | null;
};

type UnratedRow = {
  location: string;
  job_count: number;
  example_titles: string[];
};

async function fetchJobLocations(activeOnly: boolean): Promise<JobPostingRow[]> {
  const all: JobPostingRow[] = [];
  const PAGE = 1000;
  let from = 0;
  for (;;) {
    let q = gtmSupabase
      .from("job_postings" as never)
      .select("location, title, disqualified")
      .not("location", "is", null)
      .range(from, from + PAGE - 1);
    if (activeOnly) q = q.eq("disqualified", false);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as unknown as JobPostingRow[];
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
    if (from > 50000) break;
  }
  return all;
}

function matchesAnyRule(loc: string, rules: LocationRule[]): boolean {
  const lower = loc.toLowerCase();
  const trimmedLower = lower.trim();
  for (const r of rules) {
    if (!r.is_active) continue;
    const pat = (r.pattern ?? "").toString();
    if (!pat) continue;
    const pLower = pat.toLowerCase();
    if (r.match_mode === "equals") {
      if (trimmedLower === pLower.trim()) return true;
    } else if (r.match_mode === "regex") {
      try {
        if (new RegExp(pLower).test(lower)) return true;
      } catch {
        // ignore bad regex
      }
    } else {
      if (lower.includes(pLower)) return true;
    }
  }
  return false;
}

function UnratedLocations({
  rules,
  onRate,
}: {
  rules: LocationRule[];
  onRate: (location: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);

  const { data: jobs = [], isLoading, error } = useQuery({
    queryKey: ["job-postings-locations", activeOnly],
    queryFn: () => fetchJobLocations(activeOnly),
  });

  const unrated: UnratedRow[] = useMemo(() => {
    const groups = new Map<string, { count: number; titles: string[] }>();
    for (const j of jobs) {
      const raw = (j.location ?? "").toString();
      const loc = raw.trim();
      if (!loc) continue;
      if (matchesAnyRule(loc, rules)) continue;
      let g = groups.get(loc);
      if (!g) {
        g = { count: 0, titles: [] };
        groups.set(loc, g);
      }
      g.count += 1;
      if (g.titles.length < 3 && j.title) {
        if (!g.titles.includes(j.title)) g.titles.push(j.title);
      }
    }
    const out: UnratedRow[] = [];
    groups.forEach((v, k) => {
      out.push({ location: k, job_count: v.count, example_titles: v.titles });
    });
    out.sort((a, b) => {
      if (b.job_count !== a.job_count) return b.job_count - a.job_count;
      return a.location.localeCompare(b.location);
    });
    return out;
  }, [jobs, rules]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return unrated;
    return unrated.filter((r) => r.location.toLowerCase().includes(q));
  }, [unrated, search]);

  return (
    <div
      style={{
        background: BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      <div
        className="flex flex-wrap items-center gap-2 p-3"
        style={{ borderBottom: `1px solid ${BORDER}` }}
      >
        <h3
          className="text-[12px] font-semibold uppercase tracking-wide"
          style={{ color: TEXT, fontFamily: MONO, marginRight: 8 }}
        >
          Unrated Job Locations
        </h3>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search location..."
          style={{ ...fieldStyle(), flex: "1 1 220px", minWidth: 180 }}
        />
        <label
          className="flex items-center gap-1.5 text-[11px]"
          style={{ color: MUTED, fontFamily: MONO }}
        >
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
          />
          Active jobs only
        </label>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table
          className="w-full text-[12px]"
          style={{ borderCollapse: "collapse", fontFamily: MONO, color: TEXT }}
        >
          <thead>
            <tr style={{ background: BG_DEEP, color: MUTED, textAlign: "left" }}>
              {["Location", "Jobs", "Example titles", ""].map((h) => (
                <th
                  key={h}
                  className="px-2 py-2 text-[11px] uppercase tracking-wide font-medium whitespace-nowrap"
                  style={{ borderBottom: `1px solid ${BORDER}` }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 4 }).map((__, j) => (
                    <td
                      key={j}
                      className="px-2 py-2"
                      style={{ borderBottom: `1px solid ${BORDER}` }}
                    >
                      <Skeleton style={{ height: 16, width: "80%" }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center" style={{ color: "#EF4444" }}>
                  Failed to load job locations: {(error as Error).message}
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center" style={{ color: MUTED }}>
                  No unrated locations.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.location} style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <td className="px-2 py-1.5" title={r.location}>
                    {r.location}
                  </td>
                  <td className="px-2 py-1.5">{r.job_count}</td>
                  <td className="px-2 py-1.5" style={{ color: MUTED }}>
                    {r.example_titles.join(", ") || "—"}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <RowAction onClick={() => onRate(r.location)}>Rate location</RowAction>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div
        className="px-3 py-2 text-[11px]"
        style={{ borderTop: `1px solid ${BORDER}`, color: MUTED, fontFamily: MONO }}
      >
        {filtered.length} of {unrated.length} unrated locations
        {" · "}Rating a location creates a new rule in the database. Future jobs with matching
        locations will no longer appear as unrated.
      </div>
    </div>
  );
}
