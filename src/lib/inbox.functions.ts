import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ModelMessage } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { detectHandoverKeyword, normalizePhone } from "@/lib/agent-rules";
import { formatVoiceForAgent, parseVoiceMeta, VOICE_LANGUAGES, type VoiceMeta } from "@/lib/voice";
import {
  buildAgentTools,
  buildInstructions,
  friendlyAiError,
  loadAgentSettings,
  runAgent,
  type AgentRunState,
} from "@/lib/ai/agent.server";

type Supa = SupabaseClient<Database>;

export type IncomingResult = {
  outcome: "ai_replied" | "handover" | "waiting_operator" | "agent_offline" | "ai_error";
  message?: string;
};

async function handleIncoming(
  supabase: Supa,
  userId: string,
  conversationId: string,
  text: string,
  voice: VoiceMeta | null = null,
): Promise<IncomingResult> {
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle();
  if (convError || !conversation) throw new Error("Suhbat topilmadi");

  const receivedAt = Date.now();
  const { error: insertError } = await supabase.from("messages").insert({
    owner_id: userId,
    conversation_id: conversationId,
    role: "customer",
    content: text,
    is_voice: voice !== null,
    voice_meta: voice,
  });
  if (insertError) throw new Error(`Xabarni saqlab bo'lmadi: ${insertError.message}`);

  await supabase
    .from("conversations")
    .update({
      last_message_preview: (voice ? `🎤 ${text}` : text).slice(0, 140),
      last_message_at: new Date().toISOString(),
      unread_count: conversation.unread_count + 1,
      status: conversation.status === "resolved" ? "open" : conversation.status,
    })
    .eq("id", conversationId);

  if (conversation.mode === "human") return { outcome: "waiting_operator" };

  const settings = await loadAgentSettings(supabase, userId);
  if (!settings.is_live) return { outcome: "agent_offline" };

  const keyword = detectHandoverKeyword(text, settings.handover_keywords);
  if (keyword) {
    await handOver(supabase, userId, conversationId, `Mijoz "${keyword}" deb yozdi`);
    return { outcome: "handover" };
  }

  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI sozlanmagan");

  const { data: history } = await supabase
    .from("messages")
    .select("role, content, is_voice, voice_meta")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(30);
  const modelMessages: ModelMessage[] = (history ?? [])
    .reverse()
    .filter((m) => m.role !== "system")
    .map((m) =>
      m.role === "customer"
        ? {
            role: "user" as const,
            content: m.is_voice ? formatVoiceForAgent(m.content, parseVoiceMeta(m.voice_meta)) : m.content,
          }
        : { role: "assistant" as const, content: m.content },
    );

  let customer = null;
  if (conversation.customer_id) {
    const { data } = await supabase.from("crm_customers").select("*").eq("id", conversation.customer_id).maybeSingle();
    customer = data;
  }

  const state: AgentRunState = { sources: [], handoverReason: null, customerId: customer?.id ?? null };
  const tools = buildAgentTools(supabase, userId, settings, state);

  let replyText = "";
  try {
    const { result } = runAgent({
      apiKey,
      initialRunId: undefined,
      instructions: buildInstructions(settings, { channel: conversation.channel, customer }),
      messages: modelMessages,
      tools,
    });
    replyText = (await result.text).trim();
  } catch (error) {
    console.error("[inbox] AI error", error);
    return { outcome: "ai_error", message: friendlyAiError(error) };
  }

  if (replyText) {
    const { error } = await supabase.from("messages").insert({
      owner_id: userId,
      conversation_id: conversationId,
      role: "ai",
      content: replyText,
      sources: state.sources,
      response_ms: Date.now() - receivedAt,
    });
    if (error) throw new Error(`AI javobini saqlab bo'lmadi: ${error.message}`);
  }

  // Link a customer that the agent verified during this turn.
  if (state.customerId && !conversation.customer_id) {
    await supabase.from("conversations").update({ customer_id: state.customerId }).eq("id", conversationId);
  }

  if (state.handoverReason) {
    await handOver(supabase, userId, conversationId, state.handoverReason, replyText);
    return { outcome: "handover" };
  }

  await supabase
    .from("conversations")
    .update({
      last_message_preview: (replyText || text).slice(0, 140),
      last_message_at: new Date().toISOString(),
      unread_count: 0,
    })
    .eq("id", conversationId);
  return { outcome: "ai_replied" };
}

async function handOver(supabase: Supa, userId: string, conversationId: string, reason: string, preview?: string) {
  await supabase.from("messages").insert({
    owner_id: userId,
    conversation_id: conversationId,
    role: "system",
    content: `Suhbat operatorga uzatildi: ${reason}`,
  });
  await supabase
    .from("conversations")
    .update({
      mode: "human",
      status: "pending",
      handover_reason: reason,
      last_message_at: new Date().toISOString(),
      ...(preview ? { last_message_preview: preview.slice(0, 140) } : {}),
    })
    .eq("id", conversationId);
}

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
