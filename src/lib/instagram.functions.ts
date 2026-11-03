import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeInstagramToken } from "@/lib/instagram-rules";

/** Account status for the Channels page. The token never leaves the server. */
export const getInstagramAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadInstagramAccount } = await import("@/lib/instagram.server");
    const account = await loadInstagramAccount(context.userId);
    return account
      ? { username: account.username, last_synced_at: account.last_synced_at, last_error: account.last_error }
      : null;
  });

export const connectInstagram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ token: z.string().trim().min(20).max(800) }).parse(input))
  .handler(async ({ data, context }) => {
    const { fetchInstagramProfile, syncInstagramPosts, InstagramError } = await import("@/lib/instagram.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = normalizeInstagramToken(data.token);
    if (!token) return { ok: false as const, error: "invalid_token" as const };
    try {
      const profile = await fetchInstagramProfile(token);
      const { data: other } = await supabaseAdmin
        .from("instagram_accounts")
        .select("owner_id")
        .eq("ig_user_id", profile.id)
        .neq("owner_id", context.userId)
        .maybeSingle();
      if (other) return { ok: false as const, error: "in_use" as const };
      const { error } = await supabaseAdmin.from("instagram_accounts").upsert({
        owner_id: context.userId,
        ig_user_id: profile.id,
        username: profile.username,
        access_token: token,
        token_refreshed_at: new Date().toISOString(),
        last_error: null,
      });
      if (error) throw new Error(`Saqlab bo'lmadi: ${error.message}`);
      const synced = await syncInstagramPosts(context.userId);
      return { ok: true as const, username: profile.username, ...synced };
    } catch (e) {
      if (e instanceof InstagramError) {
        return { ok: false as const, error: e.kind, detail: e.message };
      }
      throw e;
    }
  });

export const disconnectInstagram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("instagram_posts").delete().eq("owner_id", context.userId);
    await supabaseAdmin.from("instagram_accounts").delete().eq("owner_id", context.userId);
    return { ok: true };
  });

export const syncInstagramNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { syncInstagramPosts, InstagramError } = await import("@/lib/instagram.server");
    try {
      return { ok: true as const, ...(await syncInstagramPosts(context.userId)) };
    } catch (e) {
      if (e instanceof InstagramError) return { ok: false as const, error: e.kind, detail: e.message };
      throw e;
    }
  });

/** Has the AI watch one waiting post; the page calls it repeatedly so each video gets its own request. */
export const analyzeNextInstagramPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { analyzeWaitingPosts } = await import("@/lib/instagram.server");
    const { canAnalyze } = await import("@/lib/instagram-rules");
    const done = await analyzeWaitingPosts(context.userId, 1);
    const { data } = await context.supabase
      .from("instagram_posts")
      .select("status, attempts, analyzing_at")
      .eq("owner_id", context.userId)
      .in("status", ["pending", "analyzing"]);
    return { done, remaining: (data ?? []).filter((p) => canAnalyze(p)).length };
  });

export const retryInstagramPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { analyzeInstagramPost } = await import("@/lib/instagram.server");
    await supabaseAdmin
      .from("instagram_posts")
      .update({ status: "pending", attempts: 0, analysis_error: null })
      .eq("owner_id", context.userId)
      .eq("id", data.id)
      .neq("status", "analyzing");
    const status = await analyzeInstagramPost(context.userId, data.id);
    return { status };
  });
