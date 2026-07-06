import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X, Plus } from "lucide-react";
import { toast } from "sonner";
import { gtmSupabase } from "@/lib/gtmSupabase";
import { getUserAiConfigPublic } from "@/lib/aiConfig.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  default_posting_lifespan_days: number | null;
};

async function loadProfile(): Promise<UserProfile | null> {
  const { data, error } = await gtmSupabase
    .from("user_profiles" as never)
    .select(
      "id, display_name, background_summary, target_role_types, target_seniority, target_locations, target_comp_min, target_comp_max, languages, skills, weekly_posting_cap, agent_enabled, default_posting_lifespan_days",
    )
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

  const getAiCfg = useServerFn(getUserAiConfigPublic);
  const { data: aiCfg } = useQuery({
    queryKey: ["user-ai-config"],
    queryFn: () => getAiCfg(),
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
          default_posting_lifespan_days: form.default_posting_lifespan_days,
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
        <label style={LABEL}>Default posting lifespan (days)</label>
        <Input
          type="number"
          value={form.default_posting_lifespan_days ?? ""}
          onChange={(e) =>
            set(
              "default_posting_lifespan_days",
              e.target.value === "" ? null : Number(e.target.value),
            )
          }
          style={{
            background: "#0A0A0F",
            border: "1px solid #1E1E2E",
            color: "#F0F0FF",
            maxWidth: 200,
          }}
        />
        <div style={HELP}>
          If a posting has no deadline, treat it as expired this many days after it was posted.
        </div>

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

      <AiProviderCard aiCfg={aiCfg} onSaved={() => qc.invalidateQueries({ queryKey: ["user-ai-config"] })} profileId={form.id} />



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

// ---------- AI Provider card ----------

type AiProvider = "anthropic" | "openai" | "gemini";
type AiCfg = {
  ai_provider: AiProvider;
  ai_model: string | null;
  has_ai_key: boolean;
};

const MODEL_PLACEHOLDER: Record<AiProvider, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o",
  gemini: "gemini-1.5-pro",
};

const PROVIDER_LABEL: Record<AiProvider, string> = {
  anthropic: "Claude (Anthropic)",
  openai: "OpenAI",
  gemini: "Google Gemini",
};

function AiProviderCard({
  aiCfg,
  onSaved,
  profileId,
}: {
  aiCfg: AiCfg | undefined;
  onSaved: () => void;
  profileId: string;
}) {
  const [provider, setProvider] = useState<AiProvider>("anthropic");
  const [model, setModel] = useState("");
  const [newKey, setNewKey] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (aiCfg) {
      setProvider(aiCfg.ai_provider);
      setModel(aiCfg.ai_model ?? "");
    }
  }, [aiCfg]);

  async function saveAi(opts?: { removeKey?: boolean }) {
    setBusy(true);
    try {
      const patch: Record<string, unknown> = {
        ai_provider: provider,
        ai_model: model.trim() === "" ? null : model.trim(),
        updated_at: new Date().toISOString(),
      };
      if (opts?.removeKey) {
        patch.ai_api_key = null;
      } else if (newKey.trim() !== "") {
        patch.ai_api_key = newKey.trim();
      }
      const { error } = await gtmSupabase
        .from("user_profiles" as never)
        .update(patch as never)
        .eq("id", profileId);
      if (error) throw error;
      setNewKey("");
      toast.success(opts?.removeKey ? "API key removed" : "AI settings saved");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const hasKey = !!aiCfg?.has_ai_key;

  return (
    <div style={CARD}>
      <div style={{ ...SECTION_LABEL, marginBottom: 14 }}>AI Provider</div>

      <label style={LABEL}>Provider</label>
      <Select value={provider} onValueChange={(v) => setProvider(v as AiProvider)}>
        <SelectTrigger
          style={{
            background: "#0A0A0F",
            border: "1px solid #1E1E2E",
            color: "#F0F0FF",
            maxWidth: 320,
          }}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="anthropic">{PROVIDER_LABEL.anthropic}</SelectItem>
          <SelectItem value="openai">{PROVIDER_LABEL.openai}</SelectItem>
          <SelectItem value="gemini">{PROVIDER_LABEL.gemini}</SelectItem>
        </SelectContent>
      </Select>

      <div style={{ height: 16 }} />
      <label style={LABEL}>Model</label>
      <Input
        value={model}
        onChange={(e) => setModel(e.target.value)}
        placeholder={MODEL_PLACEHOLDER[provider]}
        style={{
          background: "#0A0A0F",
          border: "1px solid #1E1E2E",
          color: "#F0F0FF",
          maxWidth: 320,
        }}
      />
      <div style={HELP}>Leave blank to use the provider default.</div>

      <div style={{ height: 16 }} />
      <label style={LABEL}>API key</label>
      <div style={{ marginBottom: 6, fontSize: 12, fontFamily: MONO }}>
        {hasKey ? (
          <span style={{ color: "#10B981" }}>✓ Key saved</span>
        ) : (
          <span style={{ color: "#8B8B9E" }}>No key set</span>
        )}
      </div>
      <Input
        type="password"
        value={newKey}
        onChange={(e) => setNewKey(e.target.value)}
        placeholder={hasKey ? "Enter a new key to replace…" : "Paste your API key"}
        autoComplete="new-password"
        style={{
          background: "#0A0A0F",
          border: "1px solid #1E1E2E",
          color: "#F0F0FF",
          maxWidth: 520,
        }}
      />
      <div style={HELP}>
        Your key is stored securely and only ever used to run YOUR scoring and outreach
        drafting. It is never shown to other users and never sent back to your browser.
      </div>

      <div style={{ height: 16 }} />
      <div className="flex gap-2">
        <Button
          onClick={() => saveAi()}
          disabled={busy}
          style={{ background: "#00D4FF", color: "#0A0A0F" }}
        >
          {busy ? "Saving…" : "Save AI settings"}
        </Button>
        {hasKey && (
          <Button
            onClick={() => saveAi({ removeKey: true })}
            disabled={busy}
            variant="outline"
            style={{ background: "#0A0A0F", border: "1px solid #1E1E2E", color: "#F0F0FF" }}
          >
            Remove key
          </Button>
        )}
      </div>
    </div>
  );
}
