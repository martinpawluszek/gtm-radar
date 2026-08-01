import { useEffect, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Company, CompanyInsert, SCORE_DIMS, SCORE_RUBRIC, TIER_META, TIER_ORDER, Tier, AtsType,
  sourcingBadge, SourcingBadge,
} from "@/lib/companies";
import { gtmSupabase } from "@/lib/gtmSupabase";

const SOURCING_STYLES: Record<SourcingBadge["variant"], React.CSSProperties> = {
  ready: { color: "#00D4FF", background: "rgba(0,212,255,0.10)", border: "1px solid rgba(0,212,255,0.30)" },
  discovering: { color: "#F59E0B", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)" },
  unreachable: { color: "#EF4444", background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.30)" },
  not_configured: { color: "#8B8B9E", background: "#1E1E2E", border: "1px solid #1E1E2E" },
};

const ATS_OPTIONS: Exclude<AtsType, null>[] = [
  "greenhouse", "ashby", "lever", "amazon", "workday", "apple", "google", "microsoft",
  "generic_scraper", "private", "unknown", "custom",
];


type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Company | null;
  onSave: (data: CompanyInsert) => Promise<void> | void;
  onDelete?: (id: string) => Promise<void> | void;
};

const emptyForm: CompanyInsert = {
  name: "",
  website: "",
  careers_url: "",
  tier: "t3",
  notes: "",
  brand_score: 3,
  ai_score: 3,
  shot_score: 3,
  comp_score: 3,
  location_score: 3,
  tags: [],
  excluded_reason: "",
  is_active: true,
};

export function CompanyModal({ open, onOpenChange, initial, onSave, onDelete }: Props) {
  const [form, setForm] = useState<CompanyInsert>(emptyForm);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);

  const [detecting, setDetecting] = useState(false);
  const [detectResult, setDetectResult] = useState<{ note: string; confidence: "high" | "medium" | "none" } | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(initial ? { ...(initial as CompanyInsert), is_active: (initial as Company).is_active !== false } : { ...emptyForm });
    setTagInput("");
    setDetectResult(null);
  }, [open, initial]);

  const set = <K extends keyof CompanyInsert>(k: K, v: CompanyInsert[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    const tags = form.tags ?? [];
    if (tags.includes(t)) { setTagInput(""); return; }
    set("tags", [...tags, t]);
    setTagInput("");
  };

  const onTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); addTag(); }
  };

  const handleSave = async () => {
    if (!form.name?.trim()) return;
    setSaving(true);
    try { await onSave(form); onOpenChange(false); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!initial?.id || !onDelete) return;
    if (!confirm(`Delete "${initial.name}"?`)) return;
    await onDelete(initial.id);
    onOpenChange(false);
  };

  const handleDetect = async () => {
    if (!form.name?.trim()) return;
    setDetecting(true);
    setDetectResult(null);
    setForm((p) => ({ ...p, sourcing_status: "discovering", sourcing_note: null }));
    try {
      const { data, error } = await gtmSupabase.functions.invoke("detect-ats", {
        body: { name: form.name.trim(), careers_url: form.careers_url || undefined },
      });
      if (error) throw error;
      if (!data || (data as { error?: string }).error) {
        throw new Error((data as { error?: string })?.error ?? "Detection failed");
      }
      const r = data as { ats_type: string; ats_slug: string | null; confidence: "high" | "medium" | "none"; note: string };
      const status = r.confidence === "none" ? "unreachable" : "ready";
      const note = !form.careers_url && status === "unreachable" ? "No careers URL set" : r.note;
      setForm((p) => ({
        ...p,
        ats_type: r.ats_type as AtsType,
        ats_slug: r.ats_slug,
        sourcing_status: status,
        sourcing_checked_at: new Date().toISOString(),
        sourcing_note: note,
      }));
      setDetectResult({ note, confidence: r.confidence });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Discover postings failed";
      setForm((p) => ({
        ...p,
        sourcing_status: "unreachable",
        sourcing_checked_at: new Date().toISOString(),
        sourcing_note: form.careers_url ? msg : "No careers URL set",
      }));
      toast.error(msg);
    } finally {
      setDetecting(false);
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        style={{ background: "#111118", border: "1px solid #1E1E2E", borderTop: "1px solid rgba(0,212,255,0.2)", color: "#F0F0FF", borderRadius: 6 }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: "#F0F0FF", fontFamily: "var(--font-mono)" }}>
            {initial ? "Edit Company" : "Add Company"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 mt-2">
          <div className="col-span-2">
            <Label>Name</Label>
            <Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="Acme Inc." />
          </div>
          <div>
            <Label>Website</Label>
            <Input value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
          </div>
          <div>
            <Label>Careers URL</Label>
            <Input value={form.careers_url ?? ""} onChange={(e) => set("careers_url", e.target.value)} placeholder="https://" />
          </div>
          <div>
            <Label>Tier</Label>
            <Select value={form.tier ?? "t3"} onValueChange={(v) => set("tier", v as Tier)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIER_ORDER.map((t) => (
                  <SelectItem key={t} value={t}>{TIER_META[t].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={onTagKey} placeholder="Type & Enter" />
              <Button type="button" variant="outline" onClick={addTag}>Add</Button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(form.tags ?? []).map((t) => (
                <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px]"
                  style={{ background: "#1E1E2E", color: "#8B8B9E", borderRadius: 3 }}>
                  {t}
                  <button type="button" onClick={() => set("tags", (form.tags ?? []).filter((x) => x !== t))} className="hover:text-foreground">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          </div>
          <div className="col-span-2">
            <Label>Notes</Label>
            <Textarea rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </div>

          {form.tier === "excluded" && (
            <div className="col-span-2">
              <Label>Excluded Reason</Label>
              <Input value={form.excluded_reason ?? ""} onChange={(e) => set("excluded_reason", e.target.value)} />
            </div>
          )}

          {/* Active + Source */}
          <div className="col-span-2 space-y-3 mt-2 pt-3" style={{ borderTop: "1px solid #1E1E2E" }}>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-[13px]">Active — receiving job postings</Label>
                <p className="text-[11px]" style={{ color: "#8B8B9E" }}>
                  Pause to stop pulling new job postings from this company.
                </p>
              </div>
              <Switch
                checked={form.is_active !== false}
                onCheckedChange={(v) => set("is_active", v)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[13px]">Source</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDetect}
                  disabled={detecting || !form.name?.trim()}
                >
                  {detecting ? "Discovering…" : "Discover Postings"}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px]" style={{ color: "#8B8B9E" }}>ats_type</Label>
                  <Select
                    value={(form.ats_type ?? "") as string}
                    onValueChange={(v) => set("ats_type", v as AtsType)}
                  >
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {ATS_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px]" style={{ color: "#8B8B9E" }}>ats_slug</Label>
                  <Input
                    value={form.ats_slug ?? ""}
                    onChange={(e) => set("ats_slug", e.target.value || null)}
                    placeholder="—"
                  />
                </div>
              </div>
              {detectResult && (
                <p
                  className="text-[12px]"
                  style={{
                    fontFamily: "var(--font-mono)",
                    color:
                      detectResult.confidence === "high"
                        ? "#00D4FF"
                        : detectResult.confidence === "medium"
                        ? "#F59E0B"
                        : "#8B8B9E",
                  }}
                >
                  {detectResult.note}
                </p>
              )}
            </div>
          </div>


          <div className="col-span-2 space-y-3 mt-2 pt-3" style={{ borderTop: "1px solid #1E1E2E" }}>
            <div className="text-xs uppercase tracking-wider" style={{ color: "#8B8B9E", fontFamily: "var(--font-mono)" }}>
              Scores
            </div>
            {SCORE_DIMS.map((d) => {
              const val = (form[d.key as keyof CompanyInsert] as number) ?? 3;
              return (
                <div key={d.key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-[13px]">{d.full}</Label>
                    <span style={{ color: "#00D4FF", fontFamily: "var(--font-mono)", fontWeight: 600 }}>{val}</span>
                  </div>
                  <Slider min={1} max={5} step={1} value={[val]}
                    onValueChange={([v]) => set(d.key as keyof CompanyInsert, v as never)} />
                  <p className="text-[11px]" style={{ color: "#8B8B9E" }}>{SCORE_RUBRIC[d.key][val]}</p>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="mt-4 flex justify-between sm:justify-between">
          <div>
            {initial && onDelete && (
              <Button variant="ghost" onClick={handleDelete} style={{ color: "#EF4444" }}>Delete</Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name?.trim()}
              style={{ background: "#00D4FF", color: "#0A0A0F" }}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
