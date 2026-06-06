import { createServerFn } from "@tanstack/react-start";

export const draftOutreachMessage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    const o = d as { prompt?: string };
    if (!o?.prompt || typeof o.prompt !== "string") throw new Error("prompt required");
    if (o.prompt.length > 8000) throw new Error("prompt too long");
    return { prompt: o.prompt };
  })
  .handler(async ({ data }) => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        "ANTHROPIC_API_KEY is not configured. Add it in your project settings to enable Claude drafting.",
      );
    }
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: data.prompt }],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Claude API ${res.status}: ${body.slice(0, 400)}`);
    }
    const j = (await res.json()) as { content?: Array<{ text?: string }> };
    const text = j.content?.map((c) => c.text ?? "").join("") ?? "";
    return { text };
  });
