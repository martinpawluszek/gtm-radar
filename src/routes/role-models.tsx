import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Linkedin, MapPin, Award } from "lucide-react";
import { toast } from "sonner";
import { gtmSupabase } from "@/lib/gtmSupabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/role-models")({
  head: () => ({ meta: [{ title: "Role Models — GTM Intelligence" }] }),
  component: RoleModelsPage,
});

// ---------- Types ----------
type Category = "current" | "aspirational";
type EducationType = "technical" | "business" | "mixed" | "other" | "unknown";
type RealismVerdict = "reach" | "realistic" | "safe" | "unassessed";

type ExperienceEntry = { title?: string; company?: string; dates?: string; description?: string };
type EducationEntry = { school?: string; degree?: string; dates?: string };
type CertificationEntry = { name?: string; issuer?: string; date?: string };
type LanguageEntry = { language?: string; level?: string };

type RoleModel = {
  id: string;
  name: string;
  linkedin_url: string | null;
  category: Category;
  target_title: string | null;
  role_title: string | null;
  current_company: string | null;
  headline: string | null;
  location: string | null;
  about_text: string | null;
  experience: ExperienceEntry[] | null;
  education: EducationEntry[] | null;
  education_type: EducationType | null;
  certifications: CertificationEntry[] | null;
  skills: string[] | null;
  languages: LanguageEntry[] | null;
  posting_style_notes: string | null;
  source_note: string | null;
  realism_verdict: RealismVerdict | null;
  realism_assessment: string | null;
  captured_at: string | null;
  created_at: string;
  updated_at: string;
};

// ---------- Constants ----------
const MONO = "var(--font-mono)";
const BG = "#0A0A0F";
const CARD = "#111118";
const BORDER = "#1E1E2E";
const PRIMARY = "#00D4FF";
const VIOLET = "#7C3AED";
const SUCCESS = "#10B981";
const WARNING = "#F59E0B";
const TEXT = "#F0F0FF";
const MUTED = "#8B8B9E";

const REALISM_META: Record<RealismVerdict, { label: string; color: string }> = {
  realistic: { label: "Realistic", color: SUCCESS },
  reach: { label: "Reach", color: WARNING },
  safe: { label: "Safe", color: "#3B82F6" },
  unassessed: { label: "Unassessed", color: MUTED },
};

const EDU_LABEL: Record<EducationType, string> = {
  technical: "Technical",
  business: "Business",
  mixed: "Mixed",
  other: "Other",
  unknown: "Unknown",
};

// ---------- Helpers ----------
function safeArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? (p as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

async function fetchRoleModels(): Promise<RoleModel[]> {
  const { data, error } = await gtmSupabase
    .from("role_model_profiles" as never)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as RoleModel[];
}

// ---------- Page ----------
function RoleModelsPage() {
  const qc = useQueryClient();
  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["role-model-profiles"],
    queryFn: fetchRoleModels,
  });

  const [tab, setTab] = useState<Category>("current");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const selected = profiles.find((p) => p.id === selectedId) ?? null;

  const currentCount = profiles.filter((p) => p.category === "current").length;
  const aspirationalCount = profiles.filter((p) => p.category === "aspirational").length;
  const rows = useMemo(
    () => profiles.filter((p) => p.category === tab),
    [profiles, tab],
  );

  const eduBreakdown = useMemo(() => {
    const m = new Map<EducationType, number>();
    profiles.forEach((p) => {
      const k = p.education_type ?? "unknown";
      m.set(k, (m.get(k) ?? 0) + 1);
    });
    return (["business", "technical", "mixed", "other", "unknown"] as EducationType[])
      .filter((k) => (m.get(k) ?? 0) > 0)
      .map((k) => `${m.get(k)} ${k}`)
      .join(" / ");
  }, [profiles]);

  const realismBreakdown = useMemo(() => {
    const m = new Map<RealismVerdict, number>();
    profiles.forEach((p) => {
      const k = p.realism_verdict ?? "unassessed";
      m.set(k, (m.get(k) ?? 0) + 1);
    });
    return (["realistic", "reach", "safe", "unassessed"] as RealismVerdict[])
      .map((k) => `${m.get(k) ?? 0} ${k}`)
      .join(" / ");
  }, [profiles]);

  if (isLoading) {
    return (
      <div className="space-y-4" style={{ marginTop: -8 }}>
        <div style={{ color: MUTED }}>Loading…</div>
      </div>
    );
  }

  const TABS: Array<{ key: Category; label: string; badge: number }> = [
    { key: "current", label: "Current", badge: currentCount },
    { key: "aspirational", label: "Aspirational", badge: aspirationalCount },
  ];

  return (
    <div className="space-y-4 min-w-0" style={{ marginTop: -8 }}>
      {/* Header */}
      <div className="grid items-center gap-3" style={{ gridTemplateColumns: "1fr auto" }}>
        <h2 className="text-xl font-semibold" style={{ color: TEXT, fontFamily: MONO }}>
          Role Models
        </h2>
        <Button
          onClick={() => setAddOpen(true)}
          variant="outline"
          style={{
            borderColor: "rgba(0,212,255,0.4)",
            color: PRIMARY,
            background: "transparent",
          }}
        >
          <Plus size={14} /> Add Profile
        </Button>
      </div>

      {/* Summary stats */}
      <div
        className="flex items-center gap-8 px-5 py-3 flex-wrap"
        style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6 }}
      >
        <Stat label="Total Profiles" value={profiles.length} />
        <Stat label="Education" value={eduBreakdown || "—"} color={VIOLET} small />
        <Stat label="Realism" value={realismBreakdown} color={SUCCESS} small />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b" style={{ borderColor: BORDER }}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="px-4 py-2 text-sm font-medium transition-colors cursor-pointer inline-flex items-center gap-2"
              style={{
                color: active ? PRIMARY : MUTED,
                borderBottom: `2px solid ${active ? PRIMARY : "transparent"}`,
                marginBottom: -1,
              }}
            >
              {t.label}
              <span
                className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 text-[10px] font-semibold rounded"
                style={{
                  background: active ? "rgba(0,212,255,0.18)" : "rgba(255,255,255,0.06)",
                  color: active ? PRIMARY : MUTED,
                  fontFamily: MONO,
                }}
              >
                {t.badge}
              </span>
            </button>
          );
        })}
      </div>

      {/* List */}
      <div
        style={{
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        {rows.length === 0 ? (
          <div className="py-16 text-center text-sm" style={{ color: MUTED }}>
            {tab === "current"
              ? "No current-role benchmarks yet. Add a profile to start the library."
              : "No aspirational targets yet. Add a profile to define the long-term bar."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr
                className="text-left"
                style={{
                  color: MUTED,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Company</th>
                <th className="px-4 py-2 font-medium">Education</th>
                <th className="px-4 py-2 font-medium">Realism</th>
                <th className="px-4 py-2 font-medium text-right">LinkedIn</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const verdict = p.realism_verdict ?? "unassessed";
                const meta = REALISM_META[verdict];
                return (
                  <tr
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className="cursor-pointer transition-colors"
                    style={{ borderTop: `1px solid ${BORDER}` }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "rgba(255,255,255,0.02)")
                    }
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td className="px-4 py-3">
                      <span style={{ color: TEXT, fontWeight: 500 }}>{p.name}</span>
                    </td>
                    <td className="px-4 py-3" style={{ color: MUTED }}>
                      {p.role_title ?? p.target_title ?? "—"}
                    </td>
                    <td className="px-4 py-3" style={{ color: TEXT }}>
                      {p.current_company ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {p.education_type && p.education_type !== "unknown" ? (
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={{
                            background: "rgba(124,58,237,0.15)",
                            color: VIOLET,
                            fontFamily: MONO,
                          }}
                        >
                          {EDU_LABEL[p.education_type].toUpperCase()}
                        </span>
                      ) : (
                        <span style={{ color: MUTED }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded"
                        style={{
                          background: `${meta.color}1F`,
                          color: meta.color,
                          fontFamily: MONO,
                        }}
                      >
                        {meta.label.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end">
                        {p.linkedin_url ? (
                          <a
                            href={p.linkedin_url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{ color: MUTED }}
                          >
                            <Linkedin size={14} />
                          </a>
                        ) : (
                          <span style={{ color: MUTED }}>—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail panel */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent
          side="right"
          className="overflow-y-auto"
          style={{
            background: BG,
            borderColor: BORDER,
            color: TEXT,
            width: 520,
            maxWidth: "100vw",
          }}
        >
          {selected && <ProfilePanel profile={selected} />}
        </SheetContent>
      </Sheet>

      {/* Add Profile modal */}
      <AddProfileModal
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={() => qc.invalidateQueries({ queryKey: ["role-model-profiles"] })}
      />
    </div>
  );
}

// ---------- Small components ----------
function Stat({
  label,
  value,
  color = TEXT,
  small = false,
}: {
  label: string;
  value: number | string;
  color?: string;
  small?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wider" style={{ color: MUTED }}>
        {label}
      </span>
      <span
        className={small ? "text-sm font-semibold" : "text-lg font-semibold"}
        style={{ color, fontFamily: MONO }}
      >
        {value}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="text-[11px] uppercase tracking-wider mb-2"
        style={{ color: MUTED }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

// ---------- Detail panel ----------
function ProfilePanel({ profile: p }: { profile: RoleModel }) {
  const verdict = p.realism_verdict ?? "unassessed";
  const meta = REALISM_META[verdict];
  const experience = safeArray<ExperienceEntry>(p.experience);
  const education = safeArray<EducationEntry>(p.education);
  const certifications = safeArray<CertificationEntry>(p.certifications);
  const languages = safeArray<LanguageEntry>(p.languages);
  const skills = Array.isArray(p.skills) ? p.skills : [];

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-lg font-semibold" style={{ color: TEXT }}>
            {p.name}
          </span>
          {p.linkedin_url && (
            <a href={p.linkedin_url} target="_blank" rel="noreferrer" style={{ color: MUTED }}>
              <Linkedin size={15} />
            </a>
          )}
        </div>
        {p.headline && (
          <div className="mt-1 text-sm" style={{ color: TEXT }}>
            {p.headline}
          </div>
        )}
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {p.location && (
            <span
              className="inline-flex items-center gap-1 text-[11px]"
              style={{ color: MUTED, fontFamily: MONO }}
            >
              <MapPin size={11} /> {p.location}
            </span>
          )}
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded"
            style={{
              background: p.category === "current" ? "rgba(0,212,255,0.15)" : "rgba(124,58,237,0.15)",
              color: p.category === "current" ? PRIMARY : VIOLET,
              fontFamily: MONO,
            }}
          >
            {p.category === "current" ? "CURRENT" : "ASPIRATIONAL"}
          </span>
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded"
            style={{ background: `${meta.color}1F`, color: meta.color, fontFamily: MONO }}
          >
            {meta.label.toUpperCase()}
          </span>
        </div>
        {(p.role_title || p.current_company) && (
          <div className="mt-2 text-[13px]" style={{ color: MUTED }}>
            {[p.role_title, p.current_company].filter(Boolean).join(" · ")}
          </div>
        )}
        {p.target_title && (
          <div className="mt-1 text-[12px]" style={{ color: MUTED, fontFamily: MONO }}>
            Benchmark for: <span style={{ color: TEXT }}>{p.target_title}</span>
          </div>
        )}
      </div>

      {/* About */}
      {p.about_text && (
        <Section title="About">
          <p className="text-sm whitespace-pre-wrap" style={{ color: TEXT }}>
            {p.about_text}
          </p>
        </Section>
      )}

      {/* Experience timeline */}
      {experience.length > 0 && (
        <Section title="Experience">
          <div className="space-y-3" style={{ borderLeft: `2px solid ${BORDER}`, paddingLeft: 14 }}>
            {experience.map((e, i) => (
              <div key={i}>
                <div className="text-sm font-medium" style={{ color: TEXT }}>
                  {e.title ?? "—"}
                </div>
                <div className="text-[12px]" style={{ color: MUTED }}>
                  {[e.company, e.dates].filter(Boolean).join(" · ")}
                </div>
                {e.description && (
                  <div className="mt-1 text-[12px] whitespace-pre-wrap" style={{ color: MUTED }}>
                    {e.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Education */}
      {education.length > 0 && (
        <Section title="Education">
          <div className="space-y-2">
            {p.education_type && p.education_type !== "unknown" && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded inline-block mb-1"
                style={{
                  background: "rgba(124,58,237,0.15)",
                  color: VIOLET,
                  fontFamily: MONO,
                }}
              >
                {EDU_LABEL[p.education_type].toUpperCase()}
              </span>
            )}
            {education.map((e, i) => (
              <div key={i}>
                <div className="text-sm font-medium" style={{ color: TEXT }}>
                  {e.school ?? "—"}
                </div>
                <div className="text-[12px]" style={{ color: MUTED }}>
                  {[e.degree, e.dates].filter(Boolean).join(" · ")}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Certifications */}
      {certifications.length > 0 && (
        <Section title="Licenses & Certifications">
          <div className="space-y-2">
            {certifications.map((c, i) => (
              <div key={i} className="flex items-start gap-2">
                <Award size={13} style={{ color: MUTED, marginTop: 2, flexShrink: 0 }} />
                <div>
                  <div className="text-sm" style={{ color: TEXT }}>
                    {c.name ?? "—"}
                  </div>
                  <div className="text-[12px]" style={{ color: MUTED }}>
                    {[c.issuer, c.date].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Skills */}
      {skills.length > 0 && (
        <Section title="Skills">
          <div className="flex flex-wrap gap-1">
            {skills.map((s) => (
              <span
                key={s}
                className="text-[11px] px-2 py-0.5 rounded"
                style={{ background: "rgba(255,255,255,0.06)", color: TEXT }}
              >
                {s}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Languages */}
      {languages.length > 0 && (
        <Section title="Languages">
          <div className="flex flex-wrap gap-1">
            {languages.map((l, i) => (
              <span
                key={i}
                className="text-[11px] px-2 py-0.5 rounded"
                style={{ background: "rgba(255,255,255,0.06)", color: TEXT }}
              >
                {l.language}
                {l.level ? <span style={{ color: MUTED }}> · {l.level}</span> : null}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Posting style */}
      {p.posting_style_notes && (
        <Section title="Posting Style">
          <p className="text-sm whitespace-pre-wrap" style={{ color: TEXT }}>
            {p.posting_style_notes}
          </p>
        </Section>
      )}

      {/* Realism assessment */}
      {p.realism_assessment && (
        <div
          className="p-3 rounded"
          style={{
            background: `${meta.color}0F`,
            border: `1px solid ${meta.color}40`,
          }}
        >
          <div
            className="text-[11px] uppercase tracking-wider mb-2"
            style={{ color: meta.color }}
          >
            Realism Assessment
          </div>
          <p className="text-sm whitespace-pre-wrap" style={{ color: TEXT }}>
            {p.realism_assessment}
          </p>
        </div>
      )}

      {/* Source footer */}
      {(p.source_note || p.captured_at) && (
        <div
          className="pt-3 text-[11px]"
          style={{ borderTop: `1px solid ${BORDER}`, color: MUTED, fontFamily: MONO }}
        >
          {p.source_note && <div>Source: {p.source_note}</div>}
          {p.captured_at && <div>Captured: {fmtDate(p.captured_at)}</div>}
        </div>
      )}
    </div>
  );
}

// ---------- Add Profile modal ----------
function AddProfileModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [category, setCategory] = useState<Category>("current");
  const [targetTitle, setTargetTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName("");
    setLinkedin("");
    setCategory("current");
    setTargetTitle("");
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const { error } = await gtmSupabase.from("role_model_profiles" as never).insert({
        name: name.trim(),
        linkedin_url: linkedin.trim() || null,
        category,
        target_title: targetTitle.trim() || null,
      } as never);
      if (error) throw error;
      toast.success("Profile queued");
      reset();
      onOpenChange(false);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{ background: BG, borderColor: BORDER, color: TEXT, maxWidth: 520 }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: TEXT }}>Add Role Model Profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ background: CARD, borderColor: BORDER, color: TEXT }}
            />
          </div>
          <div>
            <Label>LinkedIn URL</Label>
            <Input
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
              placeholder="https://www.linkedin.com/in/…"
              style={{ background: CARD, borderColor: BORDER, color: TEXT }}
            />
          </div>
          <div>
            <Label>Category *</Label>
            <div className="flex gap-2">
              {(["current", "aspirational"] as Category[]).map((c) => {
                const active = category === c;
                const color = c === "current" ? PRIMARY : VIOLET;
                return (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className="flex-1 px-3 py-2 text-sm font-medium transition-colors cursor-pointer"
                    style={{
                      background: active ? `${color}1F` : CARD,
                      border: `1px solid ${active ? color : BORDER}`,
                      color: active ? color : MUTED,
                      borderRadius: 6,
                    }}
                  >
                    {c === "current" ? "Current" : "Aspirational"}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label>Target Title</Label>
            <Input
              value={targetTitle}
              onChange={(e) => setTargetTitle(e.target.value)}
              placeholder="e.g. Senior Product Manager"
              style={{ background: CARD, borderColor: BORDER, color: TEXT }}
            />
          </div>
          <div
            className="p-3 text-[12px] rounded"
            style={{
              background: "rgba(245,158,11,0.08)",
              border: "1px solid rgba(245,158,11,0.25)",
              color: WARNING,
            }}
          >
            Structured details (Experience, Certifications, etc.) get filled in via Claude after
            this — this just queues the profile.
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              style={{ color: MUTED }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              style={{ background: PRIMARY, color: "#000" }}
            >
              {saving ? "Saving…" : "Add Profile"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: MUTED }}>
      {children}
    </div>
  );
}
