import { createServerFn } from "@tanstack/react-start";

// Returns the current user's AI config WITHOUT ever sending the API key to the
// browser. Used by the Settings page to show provider/model + a "key saved"
// indicator.
export const getUserAiConfigPublic = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    const o = (d ?? {}) as { accessToken?: string };
    return { accessToken: typeof o.accessToken === "string" ? o.accessToken : "" };
  })
  .handler(async ({ data }) => {
    const { loadPublicAiConfig } = await import("@/lib/aiProvider.server");
    return loadPublicAiConfig(data.accessToken || undefined);
  });

// Verifies a provider/model/key combo actually works by making the smallest
// possible real call. Never throws for auth/quota/network failures — returns
// { ok: false, error }. Never echoes the key back to the caller.
export const testAiCredentials = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    const o = (d ?? {}) as {
      provider?: string;
      model?: string;
      apiKey?: string;
      accessToken?: string;
    };
    const provider = o.provider;
    if (provider !== "anthropic" && provider !== "openai" && provider !== "gemini") {
      throw new Error("provider required");
    }
    return {
      provider: provider as "anthropic" | "openai" | "gemini",
      model: typeof o.model === "string" ? o.model.trim() : "",
      apiKey: typeof o.apiKey === "string" ? o.apiKey.trim() : "",
      accessToken: typeof o.accessToken === "string" ? o.accessToken : "",
    };
  })
  .handler(async ({ data }) => {
    const { DEFAULT_MODEL, loadSavedApiKey } = await import("@/lib/aiProvider.server");
    let apiKey = data.apiKey;
    if (!apiKey) {
      try {
        apiKey = await loadSavedApiKey(data.provider, data.accessToken || undefined);
      } catch (e) {
        return { ok: false as const, error: (e as Error).message };
      }
    }
    if (!apiKey) {
      return {
        ok: false as const,
        error: "No API key to test. Enter a key or save one first.",
      };
    }
    const model = data.model || DEFAULT_MODEL[data.provider];

    try {
      let status: number;
      let bodyText: string;
      if (data.provider === "anthropic") {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model,
            max_tokens: 5,
            messages: [{ role: "user", content: "ping" }],
          }),
        });
        status = res.status;
        bodyText = await res.text();
      } else if (data.provider === "openai") {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model,
            max_tokens: 5,
            messages: [{ role: "user", content: "ping" }],
          }),
        });
        status = res.status;
        bodyText = await res.text();
      } else {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          model,
        )}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "ping" }] }],
            generationConfig: { maxOutputTokens: 5 },
          }),
        });
        status = res.status;
        bodyText = await res.text();
      }

      if (status >= 200 && status < 300) return { ok: true as const };

      const snippet = bodyText.slice(0, 300).replace(/\s+/g, " ").trim();
      const lower = snippet.toLowerCase();
      let msg: string;
      if (status === 401 || status === 403) {
        msg = `Invalid API key (${status}).`;
      } else if (status === 429) {
        msg = "Rate limited (429) — key works but you're being throttled.";
      } else if (
        status === 402 ||
        lower.includes("credit") ||
        lower.includes("billing") ||
        lower.includes("quota") ||
        lower.includes("insufficient")
      ) {
        msg = "Key is valid but the account is out of credit/quota.";
      } else if (
        status === 404 ||
        (lower.includes("model") && (lower.includes("not found") || lower.includes("does not exist")))
      ) {
        msg = "Model not found — check the model name.";
      } else {
        msg = `HTTP ${status}`;
      }
      return { ok: false as const, error: snippet ? `${msg} ${snippet}` : msg };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message || "Network error" };
    }
  });
