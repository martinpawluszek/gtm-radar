import { createServerFn } from "@tanstack/react-start";

export const scoreJobPosting = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    const o = d as { system?: string; user?: string; accessToken?: string };
    if (!o?.system || typeof o.system !== "string") throw new Error("system required");
    if (!o?.user || typeof o.user !== "string") throw new Error("user required");
    if (o.system.length > 20000 || o.user.length > 30000) throw new Error("prompt too long");
    return {
      system: o.system,
      user: o.user,
      accessToken: typeof o.accessToken === "string" ? o.accessToken : "",
    };
  })
  .handler(async ({ data }) => {
    const { callUserAi } = await import("@/lib/aiProvider.server");
    return callUserAi(
      { system: data.system, user: data.user, maxTokens: 1000 },
      data.accessToken || undefined,
    );
  });
