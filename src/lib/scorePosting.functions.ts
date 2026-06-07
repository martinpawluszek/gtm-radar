import { createServerFn } from "@tanstack/react-start";

export const scoreJobPosting = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    const o = d as { system?: string; user?: string };
    if (!o?.system || typeof o.system !== "string") throw new Error("system required");
    if (!o?.user || typeof o.user !== "string") throw new Error("user required");
    if (o.system.length > 20000 || o.user.length > 30000) throw new Error("prompt too long");
    return { system: o.system, user: o.user };
  })
  .handler(async ({ data }) => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY is not configured.");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: data.system,
        messages: [{ role: "user", content: data.user }],
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
