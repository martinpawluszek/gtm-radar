import { createServerFn } from "@tanstack/react-start";

export const draftOutreachMessage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    const o = d as { prompt?: string };
    if (!o?.prompt || typeof o.prompt !== "string") throw new Error("prompt required");
    if (o.prompt.length > 8000) throw new Error("prompt too long");
    return { prompt: o.prompt };
  })
  .handler(async ({ data }) => {
    const { callUserAi } = await import("@/lib/aiProvider.server");
    return callUserAi({ user: data.prompt, maxTokens: 1000 });
  });
