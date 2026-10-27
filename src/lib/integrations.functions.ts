import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeLearnxBaseUrl } from "@/lib/learnx-rules";

export const getLearnxIntegration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("crm_integrations")
      .select("base_url, courses_count, last_synced_at, last_error")
      .eq("owner_id", context.userId)
      .eq("provider", "learnx")
      .maybeSingle();
    return data ?? null;
  });

export const connectLearnx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ baseUrl: z.string().trim().min(8).max(300), apiKey: z.string().trim().min(16).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { fetchLearnxCatalog, LearnxError } = await import("@/lib/learnx.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const baseUrl = normalizeLearnxBaseUrl(data.baseUrl);
    if (!baseUrl) return { ok: false as const, error: "bad_url" as const };
    try {
      const courses = await fetchLearnxCatalog(baseUrl, data.apiKey);
      const { error } = await supabaseAdmin.from("crm_integrations").upsert({
        owner_id: context.userId,
        provider: "learnx",
        base_url: baseUrl,
        api_key: data.apiKey,
        courses_count: courses.length,
        last_synced_at: new Date().toISOString(),
        last_error: null,
      });
      if (error) throw new Error(`Saqlab bo'lmadi: ${error.message}`);
      return { ok: true as const, courses: courses.length };
    } catch (e) {
      if (e instanceof LearnxError) {
        console.error("[learnx] connect failed", e.message);
        return { ok: false as const, error: e.kind, detail: e.message };
      }
      throw e;
    }
  });

export const disconnectLearnx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("crm_integrations").delete().eq("owner_id", context.userId).eq("provider", "learnx");
    return { ok: true };
  });
