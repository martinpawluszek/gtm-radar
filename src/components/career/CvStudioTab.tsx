import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Action,
  LabeledField,
  MONO,
  Panel,
  PrimaryButton,
  SectionLabel,
  TextInput,
  Chip,
} from "@/components/career/ui";
import { cvKey, cvList, type CvExperience, type CvProfile } from "@/lib/career";
import {
  buildCvDocxBlob,
  buildCvPrintHtml,
  buildFileBasename,
  downloadBlob,
  printCvPdf,
  validateDocxForAts,
  type AtsFinding,
  type CvContact,
  type ExperienceMeta,
} from "@/lib/cvExport";
import {
  finalizeGeneration,
  generateTailoredCv,
  jdContextSnippet,
  logCvEdit,
  saveFinalJson,
  textList,
  type CvGeneration,
  type CvOutput,
} from "@/lib/cvStudio";


// ---------- Inline editable text ----------
function Editable({
  value,
  onSave,
  multiline = true,
  placeholder = "(empty)",
  size = 13,
}: {
  value: string;
  onSave: (next: string) => void;
  multiline?: boolean;
  placeholder?: string;
  size?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next !== (value ?? "").trim()) onSave(next);
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        title="Click to edit"
        className="text-left w-full hover:opacity-80"
        style={{ color: value ? "#F0F0FF" : "#8B8B9E", fontSize: size, lineHeight: 1.5 }}
      >
        {value || placeholder}
      </button>
    );
  }

  const shared = {
    autoFocus: true,
    value: draft,
    onBlur: commit,
    className: "bg-transparent outline-none w-full",
    style: {
      color: "#F0F0FF",
      border: "1px solid #2A2A3E",
      borderRadius: 4,
      padding: "6px 8px",
      fontSize: size,
      lineHeight: 1.5,
    } as React.CSSProperties,
  };

  return multiline ? (
    <textarea
      {...shared}
      rows={Math.max(2, Math.ceil(draft.length / 90))}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
    />
  ) : (
    <input
      {...shared}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
    />
  );
}

function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>{title}</SectionLabel>
      {children}
    </div>
  );
}

function ChipRow({ items, color }: { items: string[]; color: string }) {
  if (items.length === 0)
    return (
      <span className="text-[11px]" style={{ color: "#8B8B9E", fontFamily: MONO }}>
        none
      </span>
    );
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t) => (
        <Chip key={t} color={color}>
          {t}
        </Chip>
      ))}
    </div>
  );
}

// ---------- Main tab ----------
export function CvStudioTab({
  initialCompany = "",
  initialJd = "",
  postingId = null,
}: {
  initialCompany?: string;
  initialJd?: string;
  postingId?: string | null;
}) {
  const [company, setCompany] = useState(initialCompany);
  const [jd, setJd] = useState(initialJd);
  const [running, setRunning] = useState(false);
  const [gen, setGen] = useState<CvGeneration | null>(null);
  const [cv, setCv] = useState<CvOutput | null>(null);
  const [finalized, setFinalized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<"docx" | "pdf" | null>(null);
  const [atsFindings, setAtsFindings] = useState<AtsFinding[]>([]);

  const { data: profileRows = [] } = useQuery({
    queryKey: cvKey("cv_profile"),
    queryFn: () => cvList<CvProfile>("cv_profile"),
  });
  const profile = profileRows[0] ?? null;

  const { data: experiences = [] } = useQuery({
    queryKey: cvKey("cv_experiences"),
    queryFn: () => cvList<CvExperience>("cv_experiences"),
  });


  useEffect(() => {
    setCompany(initialCompany);
    setJd(initialJd);
  }, [initialCompany, initialJd]);

  async function run() {
    if (!company.trim() || !jd.trim()) {
      toast.error("Company name and job description are both required");
      return;
    }
    setRunning(true);
    setGen(null);
    setCv(null);
    setFinalized(false);
    try {
      const g = await generateTailoredCv({
        jd_text: jd,
        company_name: company.trim(),
        posting_id: postingId,
      });
      setGen(g);
      setCv((g.final_json ?? g.output_json ?? {}) as CvOutput);
      setFinalized(g.status === "finalized");
      toast.success("Tailored CV generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setRunning(false);
    }
  }

  // Apply an edit: update local state, log it, persist final_json.
  async function applyEdit(fieldRef: string, aiText: string, nextText: string, mutate: (draft: CvOutput) => void) {
    if (!gen || !cv) return;
    const next = structuredClone(cv) as CvOutput;
    mutate(next);
    setCv(next);
    try {
      await logCvEdit({
        generation_id: gen.id,
        field_ref: fieldRef,
        ai_text: aiText ?? "",
        martin_text: nextText,
        jd_context: jdContextSnippet(company, jd),
      });
      await saveFinalJson(gen.id, next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save edit");
    }
  }

  async function saveAll() {
    if (!gen || !cv) return;
    setSaving(true);
    try {
      await saveFinalJson(gen.id, cv);
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function finalize() {
    if (!gen || !cv) return;
    setSaving(true);
    try {
      await finalizeGeneration(gen.id, cv);
      setFinalized(true);
      toast.success("Marked as finalized");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not finalize");
    } finally {
      setSaving(false);
    }
  }

  // ---------- Export ----------
  const contact: CvContact = {
    full_name: profile?.full_name ?? null,
    location: profile?.location ?? null,
    phone: profile?.phone ?? null,
    email: profile?.email ?? null,
    linkedin_url: profile?.linkedin_url ?? null,
    citizenship:
      (profile as unknown as { citizenship?: string | null } | null)?.citizenship ?? null,
  };

  const experienceMeta: Record<string, ExperienceMeta> = {};
  for (const e of experiences) {
    experienceMeta[e.id] = {
      start_date: e.start_date,
      end_date: e.end_date,
      is_current: e.is_current,
      location: e.location,
    };
  }

  function baseName(): string {
    return buildFileBasename(
      (gen as unknown as { file_basename?: string | null } | null)?.file_basename,
      gen?.company_name ?? company,
      profile?.full_name,
    );
  }

  // Exporting a file means the CV is done being edited — promote a draft to
  // "finalized" (never downgrade an already-sent generation).
  async function markExported() {
    if (!gen || !cv) return;
    if (finalized || (gen.status ?? "draft") !== "draft") return;
    try {
      await finalizeGeneration(gen.id, cv);
      setFinalized(true);
    } catch {
      /* export already succeeded; status bookkeeping is best-effort */
    }
  }

  async function exportDocx() {
    if (!cv) return;
    setExporting("docx");
    setAtsFindings([]);
    try {
      const blob = await buildCvDocxBlob({ cv, contact, experienceMeta });
      const findings = await validateDocxForAts(blob);
      setAtsFindings(findings);
      if (findings.some((f) => f.level === "critical")) {
        toast.error("ATS check failed — download blocked. See findings below.");
        return;
      }
      downloadBlob(blob, `${baseName()}.docx`);
      if (findings.length > 0) toast.warning("Downloaded with warnings — see ATS check below.");
      else toast.success("DOCX downloaded — ATS check passed");
      void markExported();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "DOCX export failed");
    } finally {
      setExporting(null);
    }
  }

  function exportPdf() {
    if (!cv) return;
    setExporting("pdf");
    try {
      const name = baseName();
      printCvPdf(buildCvPrintHtml({ cv, contact, experienceMeta, title: `${name}.pdf` }));
      toast.success("Print dialog opened — choose “Save as PDF”");
      void markExported();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF export failed");
    } finally {
      setExporting(null);
    }
  }

  const covered = textList(cv?.keyword_coverage?.covered);
  const missing = textList(cv?.keyword_coverage?.missing);
  const gaps = textList(cv?.gaps);


  return (
    <div className="flex flex-col gap-4">
      {/* Input */}
      <Panel>
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "#F0F0FF", fontFamily: MONO }}>
              CV Studio
            </h2>
            <p className="text-[12px] mt-1" style={{ color: "#8B8B9E" }}>
              Paste a job description to generate a tailored CV from your career bank. Generation
              runs a real AI call and takes 10–30 seconds.
            </p>
          </div>

          <LabeledField label="Company">
            <TextInput value={company} onChange={setCompany} placeholder="Company name" />
          </LabeledField>

          <LabeledField label="Job description">
            <textarea
              value={jd}
              rows={10}
              placeholder="Paste the full job description here…"
              onChange={(e) => setJd(e.target.value)}
              className="bg-transparent outline-none text-[13px] px-2 py-1.5 w-full"
              style={{ color: "#F0F0FF", border: "1px solid #1E1E2E", borderRadius: 4 }}
            />
          </LabeledField>

          <div className="flex items-center gap-2">
            <PrimaryButton onClick={run} disabled={running}>
              {running ? "Generating… (10–30s)" : "Generate tailored CV"}
            </PrimaryButton>
            {running && (
              <span className="text-[11px]" style={{ color: "#8B8B9E", fontFamily: MONO }}>
                Reading career bank, rules and past edits…
              </span>
            )}
          </div>
        </div>
      </Panel>

      {gen && cv && (
        <>
          {/* Gaps */}
          {gaps.length > 0 && (
            <Panel style={{ border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.05)" }}>
              <SectionLabel>Gaps — not backed by anything in your career bank</SectionLabel>
              <ul className="mt-2 flex flex-col gap-1">
                {gaps.map((g) => (
                  <li key={g} className="text-[12px]" style={{ color: "#F0F0FF" }}>
                    • {g}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {/* Keyword coverage */}
          <Panel>
            <div className="flex flex-col gap-3">
              <SectionLabel>Keyword coverage</SectionLabel>
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px]" style={{ color: "#10B981", fontFamily: MONO }}>
                  Covered ({covered.length})
                </span>
                <ChipRow items={covered} color="#10B981" />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px]" style={{ color: "#F59E0B", fontFamily: MONO }}>
                  Missing ({missing.length})
                </span>
                <ChipRow items={missing} color="#F59E0B" />
              </div>
            </div>
          </Panel>

          {/* Document preview */}
          <Panel>
            <div className="flex flex-col gap-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <SectionLabel>Arrangement</SectionLabel>
                  <div className="text-[13px] mt-1" style={{ color: "#F0F0FF" }}>
                    {cv.arrangement ?? "—"}
                  </div>
                  {cv.arrangement_reason && (
                    <div className="text-[11px] mt-1" style={{ color: "#8B8B9E" }}>
                      {cv.arrangement_reason}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Action onClick={saveAll} disabled={saving}>
                    {saving ? "Saving…" : "Save"}
                  </Action>
                  <Action onClick={exportDocx} disabled={exporting !== null} color="#00D4FF">
                    {exporting === "docx" ? "Checking…" : "Download DOCX"}
                  </Action>
                  <Action onClick={exportPdf} disabled={exporting !== null} color="#00D4FF">
                    {exporting === "pdf" ? "Opening…" : "Download PDF"}
                  </Action>
                  <Action onClick={finalize} disabled={saving || finalized} color="#10B981">
                    {finalized ? "Finalized" : "Mark finalized"}
                  </Action>
                </div>
              </div>

              {atsFindings.length > 0 && (
                <div
                  style={{
                    border: `1px solid ${
                      atsFindings.some((f) => f.level === "critical")
                        ? "rgba(239,68,68,0.35)"
                        : "rgba(245,158,11,0.35)"
                    }`,
                    background: atsFindings.some((f) => f.level === "critical")
                      ? "rgba(239,68,68,0.05)"
                      : "rgba(245,158,11,0.05)",
                    borderRadius: 6,
                    padding: 12,
                  }}
                >
                  <SectionLabel>
                    {atsFindings.some((f) => f.level === "critical")
                      ? "ATS check failed — download blocked"
                      : "ATS check passed with warnings"}
                  </SectionLabel>
                  <ul className="mt-2 flex flex-col gap-2">
                    {atsFindings.map((f) => (
                      <li key={f.label}>
                        <div
                          className="text-[12px] font-semibold"
                          style={{ color: f.level === "critical" ? "#EF4444" : "#F59E0B" }}
                        >
                          [{f.level}] {f.label}
                        </div>
                        <div className="text-[11px]" style={{ color: "#8B8B9E" }}>
                          {f.detail}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}


              <DocSection title="Summary">
                <Editable
                  value={cv.summary ?? ""}
                  onSave={(next) =>
                    applyEdit("summary", cv.summary ?? "", next, (d) => {
                      d.summary = next;
                    })
                  }
                />
              </DocSection>

              <DocSection title="Competencies">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px]" style={{ color: "#8B8B9E", fontFamily: MONO }}>
                      Commercial
                    </span>
                    <ChipRow items={textList(cv.competencies?.commercial)} color="#00D4FF" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px]" style={{ color: "#8B8B9E", fontFamily: MONO }}>
                      Technical
                    </span>
                    <ChipRow items={textList(cv.competencies?.technical)} color="#00D4FF" />
                  </div>
                </div>
              </DocSection>

              <DocSection title="Experience">
                <div className="flex flex-col gap-4">
                  {(cv.experience ?? []).map((exp, ei) => (
                    <div key={`${exp.experience_id ?? "exp"}-${ei}`} className="flex flex-col gap-2">
                      <div className="text-[13px] font-semibold" style={{ color: "#F0F0FF" }}>
                        {exp.role_title ?? "—"}
                        <span style={{ color: "#8B8B9E", fontWeight: 400 }}>
                          {exp.company ? ` · ${exp.company}` : ""}
                        </span>
                      </div>
                      <div className="flex flex-col gap-2 pl-3">
                        {(exp.bullets ?? []).map((b, bi) => (
                          <div key={`${b.bullet_id ?? "b"}-${bi}`} className="flex items-start gap-2">
                            <span style={{ color: "#8B8B9E", fontSize: 13, lineHeight: 1.5 }}>•</span>
                            <div className="flex-1 min-w-0">
                              <Editable
                                value={b.text ?? ""}
                                onSave={(next) =>
                                  applyEdit(
                                    `experience[${ei}].bullets[${bi}]`,
                                    b.text ?? "",
                                    next,
                                    (d) => {
                                      const bullet = d.experience?.[ei]?.bullets?.[bi];
                                      if (bullet) bullet.text = next;
                                    },
                                  )
                                }
                              />
                              {b.is_reworded && (
                                <span
                                  className="text-[10px]"
                                  style={{ color: "#F59E0B", fontFamily: MONO }}
                                >
                                  reworded
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {(cv.experience ?? []).length === 0 && (
                    <span className="text-[12px]" style={{ color: "#8B8B9E" }}>
                      No experience selected.
                    </span>
                  )}
                </div>
              </DocSection>

              <DocSection title="Built">
                <div className="flex flex-col gap-3">
                  {(cv.built ?? []).map((p, pi) => (
                    <div key={`${p.project_id ?? "p"}-${pi}`} className="flex flex-col gap-1">
                      <div className="text-[13px] font-semibold" style={{ color: "#F0F0FF" }}>
                        {p.name ?? "—"}
                      </div>
                      <Editable
                        value={p.description ?? ""}
                        size={12}
                        onSave={(next) =>
                          applyEdit(`built[${pi}].description`, p.description ?? "", next, (d) => {
                            const proj = d.built?.[pi];
                            if (proj) proj.description = next;
                          })
                        }
                      />
                    </div>
                  ))}
                  {(cv.built ?? []).length === 0 && (
                    <span className="text-[12px]" style={{ color: "#8B8B9E" }}>
                      No projects selected.
                    </span>
                  )}
                </div>
              </DocSection>

              {(["education", "programs", "languages"] as const).map((key) => {
                const items = textList(cv[key]);
                if (items.length === 0) return null;
                return (
                  <DocSection key={key} title={key}>
                    <ul className="flex flex-col gap-1">
                      {items.map((it) => (
                        <li key={it} className="text-[12px]" style={{ color: "#F0F0FF" }}>
                          • {it}
                        </li>
                      ))}
                    </ul>
                  </DocSection>
                );
              })}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
