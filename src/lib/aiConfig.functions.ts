import { createServerFn } from "@tanstack/react-start";

// Returns the current user's AI config WITHOUT ever sending the API key to the
// browser. Used by the Settings page to show provider/model + a "key saved"
// indicator.
export const getUserAiConfigPublic = createServerFn({ method: "GET" }).handler(async () => {
  const { gtmSupabase } = await import("@/lib/gtmSupabase");
  const { data, error } = await gtmSupabase
    .from("user_profiles" as never)
    .select("ai_provider, ai_model, ai_api_key")
    .is("user_id", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = (data ?? null) as {
    ai_provider?: string | null;
    ai_model?: string | null;
    ai_api_key?: string | null;
  } | null;
  return {
    ai_provider: (row?.ai_provider ?? "anthropic") as "anthropic" | "openai" | "gemini",
    ai_model: row?.ai_model ?? null,
    has_ai_key: !!row?.ai_api_key && row.ai_api_key.trim().length > 0,
  };
});
