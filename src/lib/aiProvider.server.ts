// Server-side AI provider router.
// Reads the current user's AI credentials from user_profiles (GTM Supabase)
// and dispatches to the right provider. Never falls back to a shared key.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { gtmSupabase } from "@/lib/gtmSupabase";
import type { Database } from "@/integrations/supabase/types";

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

const GTM_URL =
  (typeof process !== "undefined" && process.env?.VITE_GTM_SUPABASE_URL) ||
  "https://ljdpqsoiktoluwtgodmc.supabase.co";
const GTM_ANON =
  (typeof process !== "undefined" && process.env?.VITE_GTM_SUPABASE_PUBLISHABLE_KEY) ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqZHBxc29pa3RvbHV3dGdvZG1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NjA5NzMsImV4cCI6MjA5NjMzNjk3M30.ZtSAQH5UX3zZQSJZ8boOzXaKCFf63PuCthycOM_HDv0";

// Builds a gtm client scoped to the given user's access token, so RLS applies
// as that user. When no token is provided, returns the shared anon client and
// the caller must use the pre-auth fallback (user_id IS NULL) query path.
function clientFor(accessToken: string | undefined): {
  client: SupabaseClient<Database>;
  scoped: boolean;
} {
  if (accessToken && accessToken.trim() !== "") {
    return {
      scoped: true,
      client: createClient<Database>(GTM_URL, GTM_ANON, {
        auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      }),
    };
  }
  return { scoped: false, client: gtmSupabase as unknown as SupabaseClient<Database> };
}

// Returns the saved API key for the given provider, or "" if none is saved.
// Never returned to the client.
export async function loadSavedApiKey(
  provider: AiProvider,
  accessToken?: string,
): Promise<string> {
  const { client, scoped } = clientFor(accessToken);
  const q = client
    .from("user_profiles" as never)
    .select("ai_provider, ai_api_key")
    .order("created_at")
    .limit(1);
  const { data, error } = await (scoped ? q.maybeSingle() : q.is("user_id", null).maybeSingle());
  if (error) throw new Error(`Failed to load AI config: ${error.message}`);
  const row = (data ?? null) as {
    ai_provider?: string | null;
    ai_api_key?: string | null;
  } | null;
  if ((row?.ai_provider ?? "anthropic") !== provider) return "";
  return row?.ai_api_key?.trim() ?? "";
}

// Loads the AI config for the current user. When accessToken is passed the
// query is RLS-scoped to that user's row; otherwise falls back to the seed
// row (user_id IS NULL) so the app keeps working pre-login.
export async function loadUserAiConfig(accessToken?: string): Promise<AiConfig> {
  const { client, scoped } = clientFor(accessToken);
  const q = client
    .from("user_profiles" as never)
    .select("ai_provider, ai_api_key, ai_model")
    .order("created_at")
    .limit(1);
  const { data, error } = await (scoped ? q.maybeSingle() : q.is("user_id", null).maybeSingle());
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

// Reads provider + model + has_ai_key for the settings screen without ever
// returning the key itself.
export async function loadPublicAiConfig(accessToken?: string): Promise<{
  ai_provider: AiProvider;
  ai_model: string | null;
  has_ai_key: boolean;
}> {
  const { client, scoped } = clientFor(accessToken);
  const q = client
    .from("user_profiles" as never)
    .select("ai_provider, ai_model, ai_api_key")
    .order("created_at")
    .limit(1);
  const { data, error } = await (scoped ? q.maybeSingle() : q.is("user_id", null).maybeSingle());
  if (error) throw new Error(error.message);
  const row = (data ?? null) as {
    ai_provider?: string | null;
    ai_model?: string | null;
    ai_api_key?: string | null;
  } | null;
  return {
    ai_provider: (row?.ai_provider ?? "anthropic") as AiProvider,
    ai_model: row?.ai_model ?? null,
    has_ai_key: !!row?.ai_api_key && row.ai_api_key.trim().length > 0,
  };
}

export type AiCallInput = {
  system?: string;
  user: string;
  maxTokens?: number;
};

// Dispatches a single-turn completion to the configured provider and returns
// the text response. Callers should treat the return value as opaque text.
export async function callUserAi(
  input: AiCallInput,
  accessToken?: string,
): Promise<{ text: string }> {
  const cfg = await loadUserAiConfig(accessToken);
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
