import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidBotToken, publicWebhookBase, TELEGRAM_WEBHOOK_PATH } from "@/lib/telegram-rules";

export const getTelegramBot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("telegram_bots")
      .select("bot_username, webhook_url, created_at")
      .eq("owner_id", context.userId)
      .maybeSingle();
    return data ?? null;
  });

export const connectTelegramBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().trim().min(10).max(100), origin: z.string().url().max(300) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tgCall, randomSecret, TelegramError } = await import("@/lib/telegram.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = data.token.trim();
    if (!isValidBotToken(token)) return { ok: false as const, error: "invalid_token" };
    const base = publicWebhookBase(data.origin);
    if (!base) return { ok: false as const, error: "no_public_url" };

    let bot: { id: number; username?: string };
    try {
      bot = await tgCall(token, "getMe");
    } catch (e) {
      console.error("[telegram] getMe failed", e);
      return { ok: false as const, error: e instanceof TelegramError && e.code === 401 ? "invalid_token" : "telegram_failed" };
    }

    // Another workspace already uses this bot: Telegram allows only one webhook per bot.
    const { data: other } = await supabaseAdmin
      .from("telegram_bots")
      .select("owner_id")
      .eq("bot_id", bot.id)
      .neq("owner_id", context.userId)
      .maybeSingle();
    if (other) return { ok: false as const, error: "bot_in_use" };

    const secret = randomSecret();
    const webhookUrl = `${base}${TELEGRAM_WEBHOOK_PATH}`;
    try {
      await tgCall(token, "setWebhook", {
        url: webhookUrl,
        secret_token: secret,
        allowed_updates: ["message"],
        drop_pending_updates: true,
      });
    } catch (e) {
      console.error("[telegram] setWebhook failed", e);
      return { ok: false as const, error: "telegram_failed" };
    }

    const username = bot.username ?? String(bot.id);
    const { error } = await supabaseAdmin.from("telegram_bots").upsert({
      owner_id: context.userId,
      bot_token: token,
      bot_id: bot.id,
      bot_username: username,
      webhook_secret: secret,
      webhook_url: webhookUrl,
    });
    if (error) throw new Error(`Botni saqlab bo'lmadi: ${error.message}`);

    await context.supabase.from("channel_connections").upsert({
      owner_id: context.userId,
      channel: "telegram",
      status: "connected",
      account_name: `@${username}`,
      updated_at: new Date().toISOString(),
    });
    return { ok: true as const, username };
  });

export const disconnectTelegramBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { tgCall } = await import("@/lib/telegram.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: bot } = await supabaseAdmin
      .from("telegram_bots")
      .select("bot_token")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (bot) {
      await tgCall(bot.bot_token, "deleteWebhook", {}).catch((e) => console.error("[telegram] deleteWebhook", e));
      await supabaseAdmin.from("telegram_bots").delete().eq("owner_id", context.userId);
    }
    await context.supabase.from("channel_connections").upsert({
      owner_id: context.userId,
      channel: "telegram",
      status: "disconnected",
      account_name: null,
      updated_at: new Date().toISOString(),
    });
    return { ok: true };
  });

/** Operator reply from the Inbox: saved, and delivered to the customer's real chat when the channel is connected. */
export const sendOperatorMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ conversationId: z.string().uuid(), text: z.string().trim().min(1).max(4000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id, channel, external_chat_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convError || !conversation) throw new Error("Suhbat topilmadi");

    const { data: lastCustomer } = await supabase
      .from("messages")
      .select("created_at")
      .eq("conversation_id", conversation.id)
      .eq("role", "customer")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let deliveryError: string | null = null;
    if (conversation.channel === "telegram" && conversation.external_chat_id) {
      const { sendTelegramText } = await import("@/lib/telegram.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: bot } = await supabaseAdmin
        .from("telegram_bots")
        .select("bot_token")
        .eq("owner_id", userId)
        .maybeSingle();
      if (!bot) deliveryError = "Telegram bot ulanmagan";
      else {
        try {
          await sendTelegramText(bot.bot_token, conversation.external_chat_id, data.text);
        } catch (e) {
          console.error("[telegram] operator send failed", e);
          deliveryError = e instanceof Error ? e.message : "Telegram'ga yuborilmadi";
        }
      }
    }
    if (conversation.channel === "instagram" && conversation.external_chat_id) {
      const { loadInstagramAccount, sendInstagramText } = await import("@/lib/instagram.server");
      const account = await loadInstagramAccount(userId);
      if (!account?.messaging_enabled) deliveryError = "Instagram Direct ulanmagan";
      else {
        try {
          await sendInstagramText(account.access_token, conversation.external_chat_id, data.text);
        } catch (e) {
          console.error("[instagram] operator send failed", e);
          deliveryError = e instanceof Error ? e.message : "Instagram'ga yuborilmadi";
        }
      }
    }

    const { error } = await supabase.from("messages").insert({
      owner_id: userId,
      conversation_id: conversation.id,
      role: "operator",
      content: data.text,
      delivery_error: deliveryError,
      response_ms: lastCustomer ? Date.now() - new Date(lastCustomer.created_at).getTime() : null,
    });
    if (error) throw new Error(`Xabarni saqlab bo'lmadi: ${error.message}`);
    await supabase
      .from("conversations")
      .update({
        mode: "human",
        status: "open",
        last_message_preview: data.text.slice(0, 140),
        last_message_at: new Date().toISOString(),
      })
      .eq("id", conversation.id);
    return { delivered: deliveryError === null, deliveryError };
  });
