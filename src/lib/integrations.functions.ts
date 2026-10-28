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

export const getBitrixIntegration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("crm_integrations")
      .select("base_url, last_synced_at")
      .eq("owner_id", context.userId)
      .eq("provider", "bitrix24")
      .maybeSingle();
    // Only the portal address goes to the browser; the webhook (secret) stays on the server.
    return data ? { portal: data.base_url, last_synced_at: data.last_synced_at } : null;
  });

export const connectBitrix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ webhookUrl: z.string().trim().min(20).max(400) }).parse(input))
  .handler(async ({ data, context }) => {
    const { parseBitrixWebhook } = await import("@/lib/bitrix-rules");
    const { verifyBitrix, BitrixError } = await import("@/lib/bitrix.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const parsed = parseBitrixWebhook(data.webhookUrl);
    if (!parsed) return { ok: false as const, error: "bad_url" as const };
    try {
      const counts = await verifyBitrix(parsed.webhook);
      const { error } = await supabaseAdmin.from("crm_integrations").upsert({
        owner_id: context.userId,
        provider: "bitrix24",
        base_url: parsed.portal,
        api_key: parsed.webhook,
        courses_count: null,
        last_synced_at: new Date().toISOString(),
        last_error: null,
      });
      if (error) throw new Error(`Saqlab bo'lmadi: ${error.message}`);
      return { ok: true as const, ...counts };
    } catch (e) {
      if (e instanceof BitrixError) {
        console.error("[bitrix] connect failed", e.message);
        return { ok: false as const, error: e.kind, detail: e.message };
      }
      throw e;
    }
  });

export const disconnectBitrix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("crm_integrations").delete().eq("owner_id", context.userId).eq("provider", "bitrix24");
    return { ok: true };
  });
