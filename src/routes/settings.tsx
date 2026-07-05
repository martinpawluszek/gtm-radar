import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Plus } from "lucide-react";
import { toast } from "sonner";
import { gtmSupabase } from "@/lib/gtmSupabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — GTM Intelligence" }] }),
  component: SettingsPage,
});

const MONO = "var(--font-mono)";
const CARD: React.CSSProperties = {
  background: "#111118",
  border: "1px solid #1E1E2E",
  borderRadius: 6,
  padding: 20,
  marginBottom: 16,
};
const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#8B8B9E",
  fontFamily: MONO,
  fontWeight: 600,
};
const HELP: React.CSSProperties = { fontSize: 11, color: "#8B8B9E", marginTop: 6 };
const LABEL: React.CSSProperties = {
  fontSize: 12,
  color: "#F0F0FF",
  fontWeight: 500,
  marginBottom: 6,
  display: "block",
};

type LanguageEntry = { language: string; level: string };
type UserProfile = {
  id: string;
  display_name: string | null;
  background_summary: string | null;
  target_role_types: string[] | null;
  target_seniority: string | null;
  target_locations: string[] | null;
  target_comp_min: number | null;
  target_comp_max: number | null;
  languages: LanguageEntry[] | null;
  skills: string | null;
  weekly_posting_cap: number | null;
  agent_enabled: boolean | null;
};

async function loadProfile(): Promise<UserProfile | null> {
  const { data, error } = await gtmSupabase
    .from("user_profiles" as never)
    .select("*")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as UserProfile) ?? null;
}

function SettingsPage() {
  const qc = useQueryClient();
  const { data: profile, isLoading, error } = useQuery({
    queryKey: ["user-profile"],
    queryFn: loadProfile,
  });

  const [form, setForm] = useState<UserProfile | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) setForm(profile);
  }, [profile]);

  if (isLoading) {
    return <div style={{ color: "#8B8B9E", fontSize: 13 }}>Loading profile…</div>;
  }
  if (error) {
    return (
      <div style={{ color: "#EF4444", fontSize: 13 }}>
        Failed to load user profile: {(error as Error).message}
      </div>
    );
  }
  if (!form) {
    return <div style={{ color: "#8B8B9E", fontSize: 13 }}>No user profile row found.</div>;
  }

  const set = <K extends keyof UserProfile>(k: K, v: UserProfile[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const { error } = await gtmSupabase
        .from("user_profiles" as never)
        .update({
          display_name: form.display_name,
          background_summary: form.background_summary,
          target_role_types: form.target_role_types ?? [],
          target_seniority: form.target_seniority,
          target_locations: form.target_locations ?? [],
          target_comp_min: form.target_comp_min,
          target_comp_max: form.target_comp_max,
          languages: form.languages ?? [],
          skills: form.skills,
          weekly_posting_cap: form.weekly_posting_cap,
          agent_enabled: form.agent_enabled ?? false,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", form.id);
      if (error) throw error;
      toast.success("Profile saved");
      qc.invalidateQueries({ queryKey: ["user-profile"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 min-w-0" style={{ marginTop: -8, maxWidth: 900 }}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "#F0F0FF", fontFamily: MONO }}>
            Settings
          </h2>
          <p style={{ color: "#8B8B9E", fontSize: 12, marginTop: 4 }}>
            Your profile drives AI scoring and agent behavior.
          </p>
        </div>
        <Button
          onClick={save}
          disabled={saving}
          style={{ background: "#00D4FF", color: "#0A0A0F" }}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      <div style={CARD}>
        <div style={{ ...SECTION_LABEL, marginBottom: 14 }}>Identity</div>
        <label style={LABEL}>Display name</label>
        <Input
          value={form.display_name ?? ""}
          onChange={(e) => set("display_name", e.target.value)}
          style={{ background: "#0A0A0F", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
        />
      </div>

      <div style={CARD}>
        <div style={{ ...SECTION_LABEL, marginBottom: 14 }}>Background</div>
        <label style={LABEL}>Background summary</label>
        <Textarea
          value={form.background_summary ?? ""}
          onChange={(e) => set("background_summary", e.target.value)}
          rows={8}
          style={{ background: "#0A0A0F", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
        />
        <div style={HELP}>
          Used by the AI when it scores your job postings. Describe your experience, industries,
          and what makes you a strong fit.
        </div>
      </div>

      <div style={CARD}>
        <div style={{ ...SECTION_LABEL, marginBottom: 14 }}>Targets</div>

        <label style={LABEL}>Target role types</label>
        <TagList
          values={form.target_role_types ?? []}
          onChange={(v) => set("target_role_types", v)}
          placeholder="Add role type…"
        />

        <div style={{ height: 16 }} />
        <label style={LABEL}>Target seniority</label>
        <Input
          value={form.target_seniority ?? ""}
          onChange={(e) => set("target_seniority", e.target.value)}
          style={{ background: "#0A0A0F", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
        />

        <div style={{ height: 16 }} />
        <label style={LABEL}>Target locations</label>
        <TagList
          values={form.target_locations ?? []}
          onChange={(v) => set("target_locations", v)}
          placeholder="Add location…"
        />

        <div style={{ height: 16 }} />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label style={LABEL}>Target comp min (EUR)</label>
            <Input
              type="number"
              value={form.target_comp_min ?? ""}
              onChange={(e) =>
                set("target_comp_min", e.target.value === "" ? null : Number(e.target.value))
              }
              style={{ background: "#0A0A0F", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
            />
          </div>
          <div>
            <label style={LABEL}>Target comp max (EUR)</label>
            <Input
              type="number"
              value={form.target_comp_max ?? ""}
              onChange={(e) =>
                set("target_comp_max", e.target.value === "" ? null : Number(e.target.value))
              }
              style={{ background: "#0A0A0F", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
            />
          </div>
        </div>
      </div>

      <div style={CARD}>
        <div style={{ ...SECTION_LABEL, marginBottom: 14 }}>Languages</div>
        <LanguageList
          values={form.languages ?? []}
          onChange={(v) => set("languages", v)}
        />
      </div>

      <div style={CARD}>
        <div style={{ ...SECTION_LABEL, marginBottom: 14 }}>Skills</div>
        <Textarea
          value={form.skills ?? ""}
          onChange={(e) => set("skills", e.target.value)}
          rows={5}
          style={{ background: "#0A0A0F", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
        />
      </div>

      <div style={CARD}>
        <div style={{ ...SECTION_LABEL, marginBottom: 14 }}>Agent</div>
        <label style={LABEL}>Weekly posting cap</label>
        <Input
          type="number"
          value={form.weekly_posting_cap ?? ""}
          onChange={(e) =>
            set("weekly_posting_cap", e.target.value === "" ? null : Number(e.target.value))
          }
          style={{
            background: "#0A0A0F",
            border: "1px solid #1E1E2E",
            color: "#F0F0FF",
            maxWidth: 200,
          }}
        />
        <div style={HELP}>Safety limit — the most AI scorings allowed per week.</div>

        <div style={{ height: 20 }} />
        <div className="flex items-center gap-3">
          <Switch
            checked={!!form.agent_enabled}
            onCheckedChange={(v) => set("agent_enabled", v)}
          />
          <div>
            <div style={{ fontSize: 13, color: "#F0F0FF" }}>Agent enabled</div>
            <div style={HELP}>Let the automated agent gather new job leads for you.</div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={save}
          disabled={saving}
          style={{ background: "#00D4FF", color: "#0A0A0F" }}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function TagList({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");
  function add() {
    const v = input.trim();
    if (!v) return;
    if (values.includes(v)) {
      setInput("");
      return;
    }
    onChange([...values, v]);
    setInput("");
  }
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 px-2 py-1"
            style={{
              background: "rgba(0,212,255,0.08)",
              border: "1px solid rgba(0,212,255,0.25)",
              borderRadius: 4,
              color: "#F0F0FF",
              fontSize: 12,
              fontFamily: MONO,
            }}
          >
            {v}
            <button
              onClick={() => onChange(values.filter((x) => x !== v))}
              style={{ color: "#8B8B9E", display: "inline-flex" }}
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          style={{ background: "#0A0A0F", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
        />
        <Button
          type="button"
          onClick={add}
          variant="outline"
          style={{ background: "#0A0A0F", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
        >
          <Plus size={14} /> Add
        </Button>
      </div>
    </div>
  );
}

function LanguageList({
  values,
  onChange,
}: {
  values: LanguageEntry[];
  onChange: (v: LanguageEntry[]) => void;
}) {
  function update(i: number, patch: Partial<LanguageEntry>) {
    onChange(values.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  return (
    <div className="flex flex-col gap-2">
      {values.map((row, i) => (
        <div key={i} className="flex gap-2 items-center">
          <Input
            value={row.language}
            onChange={(e) => update(i, { language: e.target.value })}
            placeholder="Language"
            style={{ background: "#0A0A0F", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
          />
          <Input
            value={row.level}
            onChange={(e) => update(i, { level: e.target.value })}
            placeholder="Level (e.g. C2)"
            style={{
              background: "#0A0A0F",
              border: "1px solid #1E1E2E",
              color: "#F0F0FF",
              maxWidth: 160,
            }}
          />
          <button
            onClick={() => onChange(values.filter((_, idx) => idx !== i))}
            style={{ color: "#8B8B9E", padding: 6 }}
            aria-label="Remove language"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange([...values, { language: "", level: "" }])}
          style={{ background: "#0A0A0F", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
        >
          <Plus size={14} /> Add language
        </Button>
      </div>
    </div>
  );
}
