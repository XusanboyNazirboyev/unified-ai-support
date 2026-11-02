import { createFileRoute } from "@tanstack/react-router";

import { parseTelegramUpdate } from "@/lib/telegram-rules";
import { MAX_VOICE_BYTES } from "@/lib/voice";
import { maxBytesFor, type MediaMeta } from "@/lib/media";

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!/^[a-f0-9]{64}$/.test(secret)) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: bot } = await supabaseAdmin
          .from("telegram_bots")
          .select("owner_id, bot_token, webhook_secret")
          .eq("webhook_secret", secret)
          .maybeSingle();
        if (!bot || !safeEqual(bot.webhook_secret, secret)) return new Response("Unauthorized", { status: 401 });
        const ownerId = bot.owner_id;

        const update = await request.json().catch(() => null);
        const incoming = parseTelegramUpdate(update);
        if (!incoming) return Response.json({ ok: true, ignored: true });

        // Telegram retries deliveries: process each update once.
        const { error: dupError } = await supabaseAdmin
          .from("telegram_updates")
          .insert({ owner_id: ownerId, update_id: incoming.updateId });
        if (dupError) {
          if (dupError.code === "23505") return Response.json({ ok: true, duplicate: true });
          console.error("[telegram] update log failed", dupError);
          return new Response("Storage error", { status: 500 });
        }

        const { tgCall, sendTelegramText, downloadTelegramFile, bytesToBase64 } = await import("@/lib/telegram.server");
        const { handleIncoming } = await import("@/lib/inbox.server");

        try {
          await tgCall(bot.bot_token, "sendChatAction", { chat_id: incoming.chatId, action: "typing" }).catch(() => {});

          // Find or create the conversation for this Telegram chat.
          let { data: conversation } = await supabaseAdmin
            .from("conversations")
            .select("id")
            .eq("owner_id", ownerId)
            .eq("channel", "telegram")
            .eq("external_chat_id", incoming.chatId)
            .maybeSingle();
          if (!conversation) {
            let customerId: string | null = null;
            if (incoming.username) {
              const { data: match } = await supabaseAdmin
                .from("crm_customers")
                .select("id")
                .eq("owner_id", ownerId)
                .ilike("telegram_username", incoming.username)
                .limit(1)
                .maybeSingle();
              customerId = match?.id ?? null;
            }
            const { data: created, error } = await supabaseAdmin
              .from("conversations")
              .insert({
                owner_id: ownerId,
                channel: "telegram",
                contact_name: incoming.contactName,
                contact_handle: incoming.username ? `@${incoming.username}` : null,
                customer_id: customerId,
                external_chat_id: incoming.chatId,
              })
              .select("id")
              .single();
            if (error || !created) throw new Error(`Suhbat yaratilmadi: ${error?.message ?? ""}`);
            conversation = created;
          }

          let text = incoming.text;
          let voice = null;
          if (incoming.voice) {
            const apiKey = process.env["LOVABLE_API_KEY"];
            if (!apiKey) throw new Error("AI sozlanmagan");
            const { transcribeVoice } = await import("@/lib/ai/voice.server");
            const { data: settings } = await supabaseAdmin
              .from("agent_settings")
              .select("company_name")
              .eq("owner_id", ownerId)
              .maybeSingle();
            const bytes = await downloadTelegramFile(bot.bot_token, incoming.voice.fileId, MAX_VOICE_BYTES);
            const result = await transcribeVoice({
              apiKey,
              audioBase64: bytesToBase64(bytes),
              format: incoming.voice.mime?.includes("mpeg") ? "mp3" : "ogg",
              companyName: settings?.company_name ?? "",
            });
            text = result.transcript.trim() || "[Ovozli xabar: nutq eshitilmadi]";
            voice = result.meta;
          }
          let media: MediaMeta | null = null;
          if (incoming.media) {
            const limit = maxBytesFor(incoming.media.kind);
            const isVideo = incoming.media.kind === "video";
            if (incoming.media.fileSize && incoming.media.fileSize > limit) {
              text = `${text ? `${text}\n` : ""}[Mijoz juda katta ${isVideo ? "video" : "rasm"} yubordi — ko'rib bo'lmadi. Undan qisqaroq video, rasm yoki mahsulot nomini so'rang.]`;
            } else {
              const apiKey = process.env["LOVABLE_API_KEY"];
              if (!apiKey) throw new Error("AI sozlanmagan");
              const { analyzeMedia } = await import("@/lib/ai/media.server");
              const { data: settings } = await supabaseAdmin
                .from("agent_settings")
                .select("company_name")
                .eq("owner_id", ownerId)
                .maybeSingle();
              try {
                const bytes = await downloadTelegramFile(bot.bot_token, incoming.media.fileId, limit);
                media = await analyzeMedia({
                  apiKey,
                  base64: bytesToBase64(bytes),
                  mime: incoming.media.mime,
                  kind: incoming.media.kind,
                  caption: text ?? "",
                  companyName: settings?.company_name ?? "",
                });
              } catch (e) {
                console.error("[telegram] media analysis failed", e);
                text = `${text ? `${text}\n` : ""}[Mijoz ${isVideo ? "video" : "rasm"} yubordi, lekin uni ko'rib bo'lmadi. Mahsulot nomini yozishini yoki boshqa rasm yuborishini so'rang.]`;
              }
            }
          }
          if (!text && !media) text = incoming.hasOtherMedia ? "[Mijoz matnsiz fayl yoki stiker yubordi]" : "[Bo'sh xabar]";

          const result = await handleIncoming(supabaseAdmin, ownerId, conversation.id, text ?? "", voice, media);
          if (result.reply) {
            try {
              await sendTelegramText(bot.bot_token, incoming.chatId, result.reply);
            } catch (e) {
              console.error("[telegram] reply send failed", e);
              if (result.replyMessageId) {
                await supabaseAdmin
                  .from("messages")
                  .update({ delivery_error: e instanceof Error ? e.message : "Telegram'ga yuborilmadi" })
                  .eq("id", result.replyMessageId);
              }
            }
          }
          return Response.json({ ok: true, outcome: result.outcome });
        } catch (e) {
          // Acknowledge so Telegram does not resend endlessly; the error is logged for the owner.
          console.error("[telegram] processing failed", e);
          return Response.json({ ok: false });
        }
      },
    },
  },
});
