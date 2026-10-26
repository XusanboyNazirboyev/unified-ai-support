import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizePhone } from "@/lib/agent-rules";
import { VOICE_LANGUAGES } from "@/lib/voice";
import { handleIncoming } from "@/lib/inbox.server";

export type { IncomingResult } from "@/lib/inbox.server";

const voiceSchema = z
  .object({
    language: z.enum(VOICE_LANGUAGES),
    dialect: z.string().max(80).nullable(),
    confidence: z.enum(["high", "medium", "low"]),
    unclear_parts: z.array(z.string().max(200)).max(20),
  })
  .nullable()
  .default(null);

export const processIncomingMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ conversationId: z.string().uuid(), text: z.string().trim().min(1).max(4000), voice: voiceSchema })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    return handleIncoming(context.supabase, context.userId, data.conversationId, data.text, data.voice);
  });

export const simulateNewConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        channel: z.enum(["telegram", "instagram", "whatsapp"]),
        contactName: z.string().trim().min(1).max(80),
        contactHandle: z.string().trim().max(80).nullable(),
        text: z.string().trim().min(1).max(4000),
        voice: voiceSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const handle = (data.contactHandle ?? "").replace(/^@/, "").toLowerCase();

    // Match the contact to a CRM customer by their channel identity.
    let customerId: string | null = null;
    if (handle) {
      const { data: customers } = await supabase
        .from("crm_customers")
        .select("id, telegram_username, instagram_handle, whatsapp_phone, phone")
        .eq("owner_id", userId);
      const match = (customers ?? []).find((c) => {
        if (data.channel === "telegram") return c.telegram_username?.toLowerCase() === handle;
        if (data.channel === "instagram") return c.instagram_handle?.toLowerCase() === handle;
        const n = normalizePhone(handle);
        return n.length === 9 && (normalizePhone(c.whatsapp_phone) === n || normalizePhone(c.phone) === n);
      });
      customerId = match?.id ?? null;
    }

    const { data: conversation, error } = await supabase
      .from("conversations")
      .insert({
        owner_id: userId,
        channel: data.channel,
        contact_name: data.contactName,
        contact_handle: data.contactHandle
          ? data.channel === "whatsapp"
            ? data.contactHandle
            : `@${handle}`
          : null,
        customer_id: customerId,
        last_message_preview: (data.voice ? `🎤 ${data.text}` : data.text).slice(0, 140),
      })
      .select("id")
      .single();
    if (error || !conversation) throw new Error(`Suhbatni yaratib bo'lmadi: ${error?.message ?? ""}`);

    const result = await handleIncoming(supabase, userId, conversation.id, data.text, data.voice);
    return { conversationId: conversation.id, ...result };
  });
