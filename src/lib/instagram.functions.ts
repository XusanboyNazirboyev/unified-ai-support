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
      ? {
          username: account.username,
          last_synced_at: account.last_synced_at,
          last_error: account.last_error,
          messaging_enabled: account.messaging_enabled,
        }
      : null;
  });

export const connectInstagram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ token: z.string().trim().min(20).max(800) }).parse(input))
  .handler(async ({ data, context }) => {
    const { saveConnectedAccount, InstagramError } = await import("@/lib/instagram.server");
    const token = normalizeInstagramToken(data.token);
    if (!token) return { ok: false as const, error: "invalid_token" as const };
    try {
      return await saveConnectedAccount(context.userId, token, null);
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
    const { removeInstagramAccount } = await import("@/lib/instagram.server");
    await removeInstagramAccount(context.userId);
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

/** One-click connect: the Instagram login link (null when the platform's Meta app keys are not set yet). */
export const getInstagramLoginUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ origin: z.string().url().max(300) }).parse(input))
  .handler(async ({ data, context }) => {
    const { instagramAppConfig, signState } = await import("@/lib/instagram.server");
    const { buildInstagramAuthorizeUrl, encodeStateBody, INSTAGRAM_OAUTH_CALLBACK_PATH, OAUTH_STATE_TTL_MS } = await import(
      "@/lib/instagram-rules"
    );
    const { publicWebhookBase } = await import("@/lib/telegram-rules");
    const app = instagramAppConfig();
    if (!app) return { ok: false as const, error: "not_configured" as const };
    const base = publicWebhookBase(data.origin);
    if (!base) return { ok: false as const, error: "no_public_url" as const };
    const body = encodeStateBody({
      userId: context.userId,
      origin: new URL(data.origin).origin,
      expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
      nonce: crypto.randomUUID(),
    });
    const state = await signState(body, app.appSecret);
    return { ok: true as const, url: buildInstagramAuthorizeUrl(app.appId, `${base}${INSTAGRAM_OAUTH_CALLBACK_PATH}`, state) };
  });

/** Addresses the platform owner pastes into the Meta app settings. */
export const getInstagramSetupInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ origin: z.string().url().max(300) }).parse(input))
  .handler(async ({ data }) => {
    const { instagramAppConfig } = await import("@/lib/instagram.server");
    const rules = await import("@/lib/instagram-rules");
    const { publicWebhookBase } = await import("@/lib/telegram-rules");
    const base = publicWebhookBase(data.origin) ?? new URL(data.origin).origin;
    return {
      oneClick: !!instagramAppConfig(),
      verifyTokenSet: !!process.env["INSTAGRAM_WEBHOOK_VERIFY_TOKEN"],
      redirectUri: `${base}${rules.INSTAGRAM_OAUTH_CALLBACK_PATH}`,
      webhookUrl: `${base}${rules.INSTAGRAM_WEBHOOK_PATH}`,
      deauthorizeUrl: `${base}${rules.INSTAGRAM_DEAUTHORIZE_PATH}`,
      dataDeletionUrl: `${base}${rules.INSTAGRAM_DATA_DELETION_PATH}`,
      privacyUrl: `${base}/privacy`,
    };
  });
