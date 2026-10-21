import { createOpenAI } from "@ai-sdk/openai";
import { stepCountIs, streamText, tool, type ModelMessage } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Tables } from "@/integrations/supabase/types";
import {
  formatSum,
  normalizeOrderNumber,
  phonesMatch,
  rankKbArticles,
  type MessageSource,
} from "@/lib/agent-rules";
import { createLovableAiGatewayRunIdFetch } from "./run-id.server";

export const AGENT_MODEL = "openai/gpt-6-astra";
const GATEWAY_BASE_URL = "https://ai.gateway.lovable.dev/v1";

type Supa = SupabaseClient<Database>;
export type AgentSettings = Tables<"agent_settings">;
type Customer = Tables<"crm_customers">;

export type AgentRunState = {
  sources: MessageSource[];
  handoverReason: string | null;
  customerId: string | null;
};

const TONE_GUIDE: Record<string, string> = {
  samimiy: "warm, friendly and polite, like a helpful shop assistant",
  rasmiy: "formal and respectful (use 'Siz'), concise",
  qisqa: "very short and to the point, 1-2 sentences",
};

export async function loadAgentSettings(supabase: Supa, ownerId: string): Promise<AgentSettings> {
  const { data, error } = await supabase
    .from("agent_settings")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(`Agent sozlamalarini o'qib bo'lmadi: ${error.message}`);
  if (data) return data;
  const { data: created, error: insertError } = await supabase
    .from("agent_settings")
    .insert({ owner_id: ownerId })
    .select("*")
    .single();
  if (insertError) throw new Error(`Agent sozlamalarini yaratib bo'lmadi: ${insertError.message}`);
  return created;
}

export function buildInstructions(
  settings: AgentSettings,
  opts: { channel: string; customer: Customer | null },
): string {
  const tone = TONE_GUIDE[settings.tone] ?? TONE_GUIDE["samimiy"];
  const customerLine = opts.customer
    ? `The customer has been identified from their ${opts.channel} account as ${opts.customer.full_name}. You may use get_customer_profile and get_orders directly for this customer.`
    : `The customer is NOT identified yet. Before sharing any order or personal data, ask for their phone number${
        settings.require_verification ? " AND an order number" : ""
      } and call verify_customer.`;

  return [
    `You are ${settings.agent_name}, the customer support AI agent of ${settings.company_name}. You answer customers in ${opts.channel} chats.`,
    `Tone: ${tone}.`,
    "Language: reply in the customer's language (Uzbek Latin by default, Russian or English if they write so).",
    "",
    "Hard rules:",
    "1. General questions (delivery, payment, prices, returns, warranty, address, promotions) — ALWAYS call search_knowledge_base first and answer ONLY from the returned articles. Never invent prices, dates, conditions or phone numbers.",
    "2. Orders, order status, delivery date and personal data — use the CRM tools (get_customer_profile, get_orders). Never guess an order status.",
    "3. Never reveal data of any customer other than the verified one.",
    "4. If the knowledge base and CRM do not contain the answer, say you will connect a human operator and call handover_to_human. Also hand over for complaints, refunds disputes, or when the customer is upset or asks for a person.",
    "5. Messenger style: short paragraphs, no tables, no headings, at most one emoji. Use prices exactly as written in the knowledge base.",
    "",
    customerLine,
    settings.instructions ? `\nCompany instructions from the business owner:\n${settings.instructions}` : "",
  ].join("\n");
}

export function buildAgentTools(supabase: Supa, ownerId: string, settings: AgentSettings, state: AgentRunState) {
  const addSource = (source: MessageSource) => {
    if (!state.sources.some((s) => s.type === source.type && s.label === source.label)) {
      state.sources.push(source);
    }
  };

  const notIdentified = {
    identified: false,
    instruction: settings.require_verification
      ? "Mijoz aniqlanmagan. Telefon raqami va buyurtma raqamini so'rang, keyin verify_customer chaqiring."
      : "Mijoz aniqlanmagan. Telefon raqamini so'rang, keyin verify_customer chaqiring.",
  };

  return {
    search_knowledge_base: tool({
      description:
        "Search the company knowledge base (FAQ, prices, rules, documents). Use for every general question before answering.",
      inputSchema: z.object({
        query: z.string().describe("The customer's question or key words, in the customer's language"),
      }),
      execute: async ({ query }) => {
        const { data, error } = await supabase
          .from("kb_articles")
          .select("id, title, category, content")
          .eq("owner_id", ownerId);
        if (error) return { found: false, error: "Bilimlar bazasini o'qib bo'lmadi" };
        const articles = data ?? [];
        const ranked = rankKbArticles(query, articles, 3);
        ranked.forEach((a) => addSource({ type: "kb", label: a.title }));
        if (ranked.length === 0) {
          return {
            found: false,
            note: "Hech narsa topilmadi. Boshqa kalit so'z bilan qayta qidiring yoki operatorga uzating.",
            available_topics: articles.map((a) => a.title),
          };
        }
        return {
          found: true,
          articles: ranked.map((a) => ({ title: a.title, category: a.category, content: a.content })),
        };
      },
    }),

    verify_customer: tool({
      description:
        "Identify the customer in the CRM by phone number (and order number when verification is required). Call before sharing order or personal data with an unidentified customer.",
      inputSchema: z.object({
        phone: z.string().describe("Customer phone number as they wrote it"),
        order_number: z.string().nullable().describe("Order number like TM-1042, or null if not given"),
      }),
      execute: async ({ phone, order_number }) => {
        const { data: customers, error } = await supabase
          .from("crm_customers")
          .select("id, full_name, phone, whatsapp_phone")
          .eq("owner_id", ownerId);
        if (error) return { verified: false, error: "CRM bilan bog'lanib bo'lmadi" };
        const match = (customers ?? []).find(
          (c) => phonesMatch(c.phone, phone) || phonesMatch(c.whatsapp_phone, phone),
        );
        if (!match) return { verified: false, reason: "Bu telefon raqami bilan mijoz topilmadi" };
        if (settings.require_verification) {
          if (!order_number) return { verified: false, reason: "Tasdiqlash uchun buyurtma raqami kerak" };
          const { data: order } = await supabase
            .from("crm_orders")
            .select("id")
            .eq("customer_id", match.id)
            .eq("order_number", normalizeOrderNumber(order_number))
            .maybeSingle();
          if (!order) return { verified: false, reason: "Telefon va buyurtma raqami mos kelmadi" };
        }
        state.customerId = match.id;
        addSource({ type: "crm", label: `Mijoz: ${match.full_name}` });
        return { verified: true, full_name: match.full_name };
      },
    }),

    get_customer_profile: tool({
      description: "Get the identified customer's CRM profile (name, phone, city, segment).",
      inputSchema: z.object({}),
      execute: async () => {
        if (!state.customerId) return notIdentified;
        const { data, error } = await supabase
          .from("crm_customers")
          .select("full_name, phone, email, city, segment, notes")
          .eq("id", state.customerId)
          .maybeSingle();
        if (error || !data) return { identified: false, error: "Mijoz CRMda topilmadi" };
        addSource({ type: "crm", label: `Mijoz: ${data.full_name}` });
        return { identified: true, profile: data };
      },
    }),

    get_orders: tool({
      description:
        "Get the identified customer's orders from the CRM with status, items, total and expected delivery date.",
      inputSchema: z.object({
        order_number: z.string().nullable().describe("A specific order number like TM-1042, or null for all orders"),
      }),
      execute: async ({ order_number }) => {
        if (!state.customerId) return notIdentified;
        let query = supabase
          .from("crm_orders")
          .select("order_number, status, items, total, currency, delivery_address, expected_delivery, created_at")
          .eq("customer_id", state.customerId)
          .order("created_at", { ascending: false })
          .limit(10);
        if (order_number) query = query.eq("order_number", normalizeOrderNumber(order_number));
        const { data, error } = await query;
        if (error) return { error: "Buyurtmalarni o'qib bo'lmadi" };
        if (!data || data.length === 0) {
          return { orders: [], note: order_number ? "Bu raqamli buyurtma ushbu mijozda topilmadi" : "Buyurtmalar yo'q" };
        }
        data.forEach((o) => addSource({ type: "crm", label: `Buyurtma ${o.order_number}` }));
        return {
          today: new Date().toISOString().slice(0, 10),
          orders: data.map((o) => ({ ...o, total_formatted: formatSum(o.total, o.currency) })),
        };
      },
    }),

    handover_to_human: tool({
      description:
        "Transfer the conversation to a human operator when the answer is not in the knowledge base/CRM, or the customer asks for a person, complains or is upset.",
      inputSchema: z.object({
        reason: z.string().describe("Short reason in Uzbek for the operator"),
      }),
      execute: async ({ reason }) => {
        state.handoverReason = reason;
        return { ok: true, note: "Operator xabardor qilindi. Mijozga operator tez orada javob berishini ayting." };
      },
    }),
  };
}

export function runAgent(params: {
  apiKey: string;
  initialRunId: string | undefined;
  instructions: string;
  messages: ModelMessage[];
  tools: ReturnType<typeof buildAgentTools>;
  abortSignal?: AbortSignal;
}) {
  const runIdFetch = createLovableAiGatewayRunIdFetch(params.initialRunId);
  const provider = createOpenAI({
    baseURL: GATEWAY_BASE_URL,
    apiKey: params.apiKey,
    headers: { "Lovable-API-Key": params.apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
  const result = streamText({
    model: provider.responses(AGENT_MODEL),
    instructions: params.instructions,
    messages: params.messages,
    tools: params.tools,
    stopWhen: stepCountIs(6),
    ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  return { result, runIdFetch };
}

export function friendlyAiError(error: unknown): string {
  const status =
    typeof error === "object" && error !== null && "statusCode" in error
      ? Number((error as { statusCode?: number }).statusCode)
      : undefined;
  if (status === 402) return "AI kreditlari tugadi. Workspace sozlamalarida kredit qo'shing.";
  if (status === 429) return "So'rovlar ko'payib ketdi. Birozdan so'ng qayta urinib ko'ring.";
  if (status === 403) return "AI xizmatidan foydalanish cheklangan (workspace sozlamalarini tekshiring).";
  return "AI javob bera olmadi. Qayta urinib ko'ring.";
}
