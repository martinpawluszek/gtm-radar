import { gtmSupabase } from "@/lib/gtmSupabase";

export type CvOutputBullet = { bullet_id?: string | null; text?: string | null; is_reworded?: boolean | null };

export type CvOutputExperience = {
  experience_id?: string | null;
  company?: string | null;
  role_title?: string | null;
  bullets?: CvOutputBullet[] | null;
};

export type CvOutputProject = {
  project_id?: string | null;
  name?: string | null;
  description?: string | null;
};

export type CvOutput = {
  arrangement?: string | null;
  arrangement_reason?: string | null;
  summary?: string | null;
  competencies?: { commercial?: string[] | null; technical?: string[] | null } | null;
  experience?: CvOutputExperience[] | null;
  built?: CvOutputProject[] | null;
  education?: string[] | null;
  programs?: string[] | null;
  languages?: string[] | null;
  keyword_coverage?: { covered?: string[] | null; missing?: string[] | null } | null;
  gaps?: string[] | null;
};

export type CvGeneration = {
  id: string;
  company_name: string | null;
  posting_id: string | null;
  application_id: string | null;
  arrangement: string | null;
  status: string | null;
  output_json: CvOutput | null;
  final_json: CvOutput | null;
  created_at?: string | null;
};

export async function generateTailoredCv(input: {
  jd_text: string;
  company_name: string;
  posting_id?: string | null;
  application_id?: string | null;
  arrangement?: string | null;
}): Promise<CvGeneration> {
  const { data, error } = await gtmSupabase.functions.invoke("generate-tailored-cv", {
    body: {
      jd_text: input.jd_text,
      company_name: input.company_name,
      posting_id: input.posting_id ?? null,
      application_id: input.application_id ?? null,
      arrangement: input.arrangement ?? null,
    },
  });

  // Supabase wraps non-2xx responses in a FunctionsHttpError; try to read the body message.
  if (error) {
    let message = error.message;
    const ctx = (error as unknown as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const body = (await ctx.json()) as { error?: string };
        if (body?.error) message = body.error;
      } catch {
        /* keep original message */
      }
    }
    throw new Error(message);
  }

  const payload = data as { generation?: CvGeneration; error?: string } | null;
  if (!payload) throw new Error("Empty response from generator");
  if (payload.error) throw new Error(payload.error);
  if (!payload.generation) throw new Error("Generator returned no CV");
  return payload.generation;
}

export function jdContextSnippet(companyName: string, jdText: string): string {
  return `${companyName} — ${(jdText ?? "").slice(0, 200)}`;
}

export async function logCvEdit(entry: {
  generation_id: string;
  field_ref: string;
  ai_text: string;
  martin_text: string;
  jd_context: string;
}): Promise<void> {
  const { error } = await gtmSupabase.from("cv_edit_log" as never).insert(entry as never);
  if (error) throw error;
}

export async function saveFinalJson(generationId: string, finalJson: CvOutput): Promise<void> {
  const { error } = await gtmSupabase
    .from("cv_generations" as never)
    .update({ final_json: finalJson } as never)
    .eq("id", generationId);
  if (error) throw error;
}

export async function finalizeGeneration(generationId: string, finalJson: CvOutput): Promise<void> {
  const { error } = await gtmSupabase
    .from("cv_generations" as never)
    .update({ final_json: finalJson, status: "finalized" } as never)
    .eq("id", generationId);
  if (error) throw error;
}

export function textList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
}
