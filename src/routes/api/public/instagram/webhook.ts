import { createFileRoute } from "@tanstack/react-router";

import { describeSharedPost, parseInstagramWebhook, type InstagramIncoming } from "@/lib/instagram-rules";
import { maxBytesFor, type MediaMeta } from "@/lib/media";
import { MAX_VOICE_BYTES, type VoiceMeta } from "@/lib/voice";

// Instagram Direct messages for every connected workspace. Meta signs each delivery with the app secret;
// the workspace is found by the Instagram account id the message was sent to.
export const Route = createFileRoute("/api/public/instagram/webhook")({
  server: {
    handlers: {
      // Meta's one-time check when the webhook address is saved in the app settings.
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const expected = process.env["INSTAGRAM_WEBHOOK_VERIFY_TOKEN"] ?? "";
        const token = url.searchParams.get("hub.verify_token") ?? "";
        if (url.searchParams.get("hub.mode") === "subscribe" && expected && token === expected) {
          return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const { instagramAppConfig, verifyWebhookSignature } = await import("@/lib/instagram.server");
        const app = instagramAppConfig();
        if (!app) return new Response("Not configured", { status: 503 });
        const raw = await request.text();
        if (!(await verifyWebhookSignature(raw, request.headers.get("x-hub-signature-256"), app.appSecret))) {
          return new Response("Invalid signature", { status: 401 });
        }
        let json: unknown = null;
        try {
          json = JSON.parse(raw);
        } catch {
          return Response.json({ ok: true, ignored: true });
        }
        const messages = parseInstagramWebhook(json);
        for (const message of messages) {
          try {
            await processMessage(message);
          } catch (e) {
            console.error("[instagram] message processing failed", message.mid, e instanceof Error ? e.message : e);
          }
        }
        // Always acknowledge a verified delivery so Meta does not resend it endlessly; errors are logged.
        return Response.json({ ok: true, processed: messages.length });
      },
    },
  },
});

async function processMessage(incoming: InstagramIncoming) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ig = await import("@/lib/instagram.server");

  const { data: account } = await supabaseAdmin
    .from("instagram_accounts")
    .select("owner_id, access_token")
    .eq("ig_user_id", incoming.accountId)
    .maybeSingle();
  if (!account) return;
  const ownerId = account.owner_id;

  // Instagram retries deliveries: handle each message once.
  const { error: dupError } = await supabaseAdmin.from("instagram_message_events").insert({ mid: incoming.mid, owner_id: ownerId });
  if (dupError) {
    if (dupError.code === "23505") return;
    throw new Error(`Xabarni qayd etib bo'lmadi: ${dupError.message}`);
  }

  let { data: conversation } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("channel", "instagram")
    .eq("external_chat_id", incoming.senderId)
    .maybeSingle();
  if (!conversation) {
    const sender = await ig.fetchInstagramSender(account.access_token, incoming.senderId);
    let customerId: string | null = null;
    if (sender.username && /^[A-Za-z0-9._]{1,40}$/.test(sender.username)) {
      const { data: match } = await supabaseAdmin
        .from("crm_customers")
        .select("id")
        .eq("owner_id", ownerId)
        .or(`instagram_handle.ilike.${sender.username},instagram_handle.ilike.@${sender.username}`)
        .limit(1)
        .maybeSingle();
      customerId = match?.id ?? null;
    }
    const { data: created, error } = await supabaseAdmin
      .from("conversations")
      .insert({
        owner_id: ownerId,
        channel: "instagram",
        contact_name: sender.name ?? (sender.username ? `@${sender.username}` : "Instagram mijoz"),
        contact_handle: sender.username ? `@${sender.username}` : null,
        customer_id: customerId,
        external_chat_id: incoming.senderId,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(`Suhbat yaratilmadi: ${error?.message ?? ""}`);
    conversation = created;
  }

  const lines: string[] = incoming.text ? [incoming.text] : [];
  let voice: VoiceMeta | null = null;
  let media: MediaMeta | null = null;
  const apiKey = process.env["LOVABLE_API_KEY"];
  const { data: settings } = await supabaseAdmin.from("agent_settings").select("company_name").eq("owner_id", ownerId).maybeSingle();
  const companyName = settings?.company_name ?? "";
  const { bytesToBase64 } = await import("@/lib/telegram.server");

  for (const att of incoming.attachments) {
    if (att.type === "audio" && att.url && apiKey && !voice) {
      try {
        const file = await ig.downloadInstagramFile(att.url, MAX_VOICE_BYTES);
        if (file === "too_large") throw new Error("too large");
        const { transcribeVoice } = await import("@/lib/ai/voice.server");
        const result = await transcribeVoice({ apiKey, audioBase64: bytesToBase64(file.bytes), format: "m4a", companyName });
        lines.push(result.transcript.trim() || "[Ovozli xabar: nutq eshitilmadi]");
        voice = result.meta;
      } catch (e) {
        console.error("[instagram] voice failed", e);
        lines.push("[Mijoz ovozli xabar yubordi, lekin uni eshitib bo'lmadi. Matn bilan yozishini so'rang.]");
      }
    } else if ((att.type === "image" || att.type === "video") && att.url && apiKey && !media) {
      const kind = att.type === "video" ? "video" : "photo";
      try {
        const file = await ig.downloadInstagramFile(att.url, maxBytesFor(kind));
        if (file === "too_large") throw new Error("too large");
        const { analyzeMedia } = await import("@/lib/ai/media.server");
        media = await analyzeMedia({
          apiKey,
          base64: bytesToBase64(file.bytes),
          mime: kind === "video" ? (file.mime.startsWith("video/") ? file.mime : "video/mp4") : file.mime.startsWith("image/") ? file.mime : "image/jpeg",
          kind,
          caption: incoming.text ?? "",
          companyName,
        });
      } catch (e) {
        console.error("[instagram] media failed", e);
        lines.push(`[Mijoz ${kind === "video" ? "video" : "rasm"} yubordi, lekin uni ko'rib bo'lmadi. Mahsulot nomini yozishini so'rang.]`);
      }
    } else if (["ig_reel", "reel", "share", "ig_post", "story_mention"].includes(att.type)) {
      let ownPermalink: string | null = null;
      if (att.mediaId) {
        const { data: post } = await supabaseAdmin
          .from("instagram_posts")
          .select("permalink")
          .eq("owner_id", ownerId)
          .eq("media_id", att.mediaId)
          .maybeSingle();
        ownPermalink = post?.permalink ?? null;
      }
      lines.push(describeSharedPost(att, ownPermalink));
    } else {
      lines.push("[Mijoz stiker yoki boshqa turdagi fayl yubordi]");
    }
  }
  const text = lines.join("\n").trim() || (media ? "" : "[Bo'sh xabar]");

  const { handleIncoming } = await import("@/lib/inbox.server");
  const result = await handleIncoming(supabaseAdmin, ownerId, conversation.id, text, voice, media);
  if (result.reply) {
    try {
      await ig.sendInstagramText(account.access_token, incoming.senderId, result.reply);
    } catch (e) {
      console.error("[instagram] reply send failed", e);
      if (result.replyMessageId) {
        await supabaseAdmin
          .from("messages")
          .update({ delivery_error: e instanceof Error ? e.message : "Instagram'ga yuborilmadi" })
          .eq("id", result.replyMessageId);
      }
    }
  }
}
