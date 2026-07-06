// Server-side AI provider router.
// Reads the current user's AI credentials from user_profiles (GTM Supabase)
// and dispatches to the right provider. Never falls back to a shared key.

import { gtmSupabase } from "@/lib/gtmSupabase";

export type AiProvider = "anthropic" | "openai" | "gemini";

export type AiConfig = {
  provider: AiProvider;
  apiKey: string;
  model: string;
};

export const DEFAULT_MODEL: Record<AiProvider, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o",
  gemini: "gemini-1.5-pro",
};

// Returns the saved API key for the given provider, or "" if none is saved.
// Never returned to the client.
export async function loadSavedApiKey(provider: AiProvider): Promise<string> {
  const { data, error } = await gtmSupabase
    .from("user_profiles" as never)
    .select("ai_provider, ai_api_key")
    .is("user_id", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to load AI config: ${error.message}`);
  const row = (data ?? null) as {
    ai_provider?: string | null;
    ai_api_key?: string | null;
  } | null;
  if ((row?.ai_provider ?? "anthropic") !== provider) return "";
  return row?.ai_api_key?.trim() ?? "";
}

// Loads the AI config for the "current" user. There is no auth yet, so we read
// the single seed profile row (user_id IS NULL). This is written to be easy to
// scope to an authenticated user later.
export async function loadUserAiConfig(): Promise<AiConfig> {
  const { data, error } = await gtmSupabase
    .from("user_profiles" as never)
    .select("ai_provider, ai_api_key, ai_model")
    .is("user_id", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to load AI config: ${error.message}`);
  const row = (data ?? null) as {
    ai_provider?: string | null;
    ai_api_key?: string | null;
    ai_model?: string | null;
  } | null;
  const apiKey = row?.ai_api_key?.trim() ?? "";
  if (!apiKey) {
    throw new Error("No AI API key configured. Add your key in Settings.");
  }
  const provider = (row?.ai_provider ?? "anthropic") as AiProvider;
  if (!["anthropic", "openai", "gemini"].includes(provider)) {
    throw new Error(`Unsupported AI provider: ${provider}`);
  }
  const model = row?.ai_model?.trim() || DEFAULT_MODEL[provider];
  return { provider, apiKey, model };
}

export type AiCallInput = {
  system?: string;
  user: string;
  maxTokens?: number;
};

// Dispatches a single-turn completion to the configured provider and returns
// the text response. Callers should treat the return value as opaque text.
export async function callUserAi(input: AiCallInput): Promise<{ text: string }> {
  const cfg = await loadUserAiConfig();
  const maxTokens = input.maxTokens ?? 1000;

  if (cfg.provider === "anthropic") {
    const body: Record<string, unknown> = {
      model: cfg.model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: input.user }],
    };
    if (input.system) body.system = input.system;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const b = await res.text();
      throw new Error(`Anthropic API ${res.status}: ${b.slice(0, 400)}`);
    }
    const j = (await res.json()) as { content?: Array<{ text?: string }> };
    return { text: j.content?.map((c) => c.text ?? "").join("") ?? "" };
  }

  if (cfg.provider === "openai") {
    const messages: Array<{ role: string; content: string }> = [];
    if (input.system) messages.push({ role: "system", content: input.system });
    messages.push({ role: "user", content: input.user });
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: maxTokens,
        messages,
      }),
    });
    if (!res.ok) {
      const b = await res.text();
      throw new Error(`OpenAI API ${res.status}: ${b.slice(0, 400)}`);
    }
    const j = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return { text: j.choices?.[0]?.message?.content ?? "" };
  }

  // gemini
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    cfg.model,
  )}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: input.user }] }],
    generationConfig: { maxOutputTokens: maxTokens },
  };
  if (input.system) {
    body.systemInstruction = { role: "system", parts: [{ text: input.system }] };
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const b = await res.text();
    throw new Error(`Gemini API ${res.status}: ${b.slice(0, 400)}`);
  }
  const j = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text =
    j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return { text };
}
