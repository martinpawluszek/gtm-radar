import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { gtmSupabase } from "@/lib/gtmSupabase";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { DEFAULT_SYSTEM_TEMPLATE, DEFAULT_USER_TEMPLATE, applyTemplate } from "@/routes/postings";

const MONO = "var(--font-mono)";

type PromptRow = {
  id: string;
  system_template: string | null;
  user_template: string | null;
  use_custom: boolean | null;
};

async function fetchPromptRow(): Promise<PromptRow | null> {
  const { data, error } = await gtmSupabase
    .from("role_criteria" as never)
    .select("id, system_template, user_template, use_custom")
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as PromptRow) ?? null;
}

const SAMPLE_VARS: Record<string, string> = {
  background: "[candidate background summary]",
  weights: "Comp 25%, Role-Profile Fit 30%, Seniority 20%, Location 15%, Competition 10%",
  rubric: "[full rubric — 5 params × 5 levels]",
  disqualifiers: "- Junior/associate titles\n- Excluded locations\n- Off-language roles",
  bonuses: "- LatAm exposure (+0.5)\n- AI-native product (+0.5)",
  titles: "- Head of Sales (weight: 0.90)\n- Enterprise AE (weight: 0.85)",
  company: "Name: Example Corp\nTier: t1\nBrand: 4/5, AI: 5/5, ...",
  feedback: "\n\n# Calibration from user feedback\n[recent feedback summary]",
  title: "[posting title]",
  location: "[posting location]",
  jd: "[full job description text]",
};

export function ScoringPromptTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["role-criteria-prompt"], queryFn: fetchPromptRow });

  const [useCustom, setUseCustom] = useState(false);
  const [systemTpl, setSystemTpl] = useState("");
  const [userTpl, setUserTpl] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!data) return;
    setUseCustom(!!data.use_custom);
    setSystemTpl(data.system_template ?? "");
    setUserTpl(data.user_template ?? "");
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!data?.id) throw new Error("No active role_criteria row");
      const { error } = await gtmSupabase
        .from("role_criteria" as never)
        .update({
          system_template: systemTpl,
          user_template: userTpl,
          use_custom: useCustom,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["role-criteria-prompt"] });
      toast.success("Scoring prompt saved");
    },
    onError: (e: Error) => toast.error(e.message || "Save failed"),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  const compiled = applyTemplate(systemTpl || DEFAULT_SYSTEM_TEMPLATE, SAMPLE_VARS);

  return (
    <div className="flex flex-col gap-4">
      {/* Toggle */}
      <div
        className="flex items-start justify-between gap-4"
        style={{ background: "#111118", border: "1px solid #1E1E2E", borderRadius: 6, padding: 20 }}
      >
        <div className="flex-1">
          <h2 className="text-sm font-semibold" style={{ color: "#F0F0FF", fontFamily: MONO }}>
            Use custom scoring prompt
          </h2>
          <p className="text-xs mt-1" style={{ color: "#8B8B9E" }}>
            When OFF, scoring uses the built-in default prompt. Turn ON to use your edited version
            below. After turning ON, score one posting to sanity-check.
          </p>
        </div>
        <Switch checked={useCustom} onCheckedChange={setUseCustom} />
      </div>

      {/* Legend */}
      <div
        style={{
          background: "#111118",
          border: "1px solid #1E1E2E",
          borderRadius: 6,
          padding: 16,
          fontFamily: MONO,
          fontSize: 12,
          color: "#8B8B9E",
        }}
      >
        <div style={{ color: "#F0F0FF", marginBottom: 6 }}>Available placeholders</div>
        <div>
          <span style={{ color: "#00D4FF" }}>System:</span>{" "}
          {"{{background}} {{weights}} {{rubric}} {{disqualifiers}} {{bonuses}} {{titles}} {{company}} {{feedback}}"}
        </div>
        <div className="mt-1">
          <span style={{ color: "#00D4FF" }}>User:</span> {"{{title}} {{location}} {{jd}}"}
        </div>
        <div className="mt-2" style={{ color: "#6B6B7E" }}>
          These are filled automatically at scoring time — leave them in place.
        </div>
      </div>

      {/* System prompt */}
      <PromptEditor
        label="System prompt"
        value={systemTpl}
        onChange={setSystemTpl}
        onLoadDefault={() => setSystemTpl(DEFAULT_SYSTEM_TEMPLATE)}
        placeholder="Empty — click 'Load built-in default' to start from the current default prompt."
      />

      {/* User prompt */}
      <PromptEditor
        label="User prompt"
        value={userTpl}
        onChange={setUserTpl}
        onLoadDefault={() => setUserTpl(DEFAULT_USER_TEMPLATE)}
        placeholder="Empty — click 'Load built-in default' to start from the current default prompt."
      />

      {/* Compiled preview */}
      <Collapsible open={previewOpen} onOpenChange={setPreviewOpen}>
        <div style={{ background: "#111118", border: "1px solid #1E1E2E", borderRadius: 6 }}>
          <CollapsibleTrigger asChild>
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-left"
              style={{ color: "#F0F0FF", fontFamily: MONO, fontSize: 13 }}
            >
              <span>Compiled preview (system) — with sample values</span>
              <ChevronDown
                size={16}
                style={{
                  transform: previewOpen ? "rotate(180deg)" : "rotate(0)",
                  transition: "transform 0.15s",
                  color: "#8B8B9E",
                }}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre
              className="px-4 pb-4 whitespace-pre-wrap"
              style={{ fontFamily: MONO, fontSize: 11, color: "#B8B8C8", lineHeight: 1.5 }}
            >
              {compiled}
            </pre>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* Save */}
      <div className="flex justify-end">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          style={{ background: "#00D4FF", color: "#0A0A0F", fontFamily: MONO }}
        >
          {saveMutation.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function PromptEditor({
  label,
  value,
  onChange,
  onLoadDefault,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onLoadDefault: () => void;
  placeholder: string;
}) {
  return (
    <div style={{ background: "#111118", border: "1px solid #1E1E2E", borderRadius: 6, padding: 16 }}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold" style={{ color: "#F0F0FF", fontFamily: MONO }}>
          {label}
        </h3>
        {!value.trim() && (
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadDefault}
            style={{
              background: "transparent",
              border: "1px solid #1E1E2E",
              color: "#00D4FF",
              fontFamily: MONO,
              fontSize: 11,
            }}
          >
            Load built-in default
          </Button>
        )}
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          minHeight: 320,
          background: "#0A0A0F",
          border: "1px solid #1E1E2E",
          color: "#F0F0FF",
          fontFamily: MONO,
          fontSize: 12,
          lineHeight: 1.55,
        }}
      />
    </div>
  );
}
