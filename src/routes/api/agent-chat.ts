import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, type UIMessage } from "ai";
import { z } from "zod";

import {
  buildAgentTools,
  buildInstructions,
  friendlyAiError,
  loadAgentSettings,
  runAgent,
  type AgentRunState,
} from "@/lib/ai/agent.server";
import { getLovableAiGatewayRunId, withLovableAiGatewayRunIdHeader } from "@/lib/ai/run-id.server";
import { getUserClientFromRequest } from "@/lib/supabase-user.server";
import { formatVoiceForAgent, parseVoiceMeta } from "@/lib/voice";

const bodySchema = z.object({
  messages: z.array(z.any()).min(1).max(60),
  customerId: z.string().uuid().nullable().optional(),
  channel: z.enum(["telegram", "instagram", "whatsapp"]).optional(),
});

async function handleTestChat(request: Request): Promise<Response> {
  const user = await getUserClientFromRequest(request);
  if (!user) return Response.json({ error: "Avval tizimga kiring" }, { status: 401 });

  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return Response.json({ error: "AI sozlanmagan" }, { status: 500 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Noto'g'ri so'rov" }, { status: 400 });

  const { supabase, userId } = user;
  const messages = parsed.data.messages as UIMessage[];
  // Voice notes arrive as transcripts with metadata; the agent sees them with a voice marker.
  const agentMessages = messages.map((m) => {
    const raw = m.role === "user" ? (m.metadata as { voice?: unknown } | undefined)?.voice : undefined;
    if (!raw) return m;
    const meta = parseVoiceMeta(raw);
    return {
      ...m,
      parts: m.parts.map((p) => (p.type === "text" ? { ...p, text: formatVoiceForAgent(p.text, meta) } : p)),
    };
  });
  const channel = parsed.data.channel ?? "telegram";

  const settings = await loadAgentSettings(supabase, userId);

  let customer = null;
  if (parsed.data.customerId) {
    const { data } = await supabase
      .from("crm_customers")
      .select("*")
      .eq("id", parsed.data.customerId)
      .maybeSingle();
    customer = data;
  }

  const state: AgentRunState = { sources: [], handoverReason: null, customerId: customer?.id ?? null };
  const tools = buildAgentTools(supabase, userId, settings, state);
  const { result, runIdFetch } = runAgent({
    apiKey,
    initialRunId: getLovableAiGatewayRunId(request),
    instructions: buildInstructions(settings, { channel, customer }),
    messages: await convertToModelMessages(agentMessages),
    tools,
    abortSignal: request.signal,
  });

  return withLovableAiGatewayRunIdHeader(
    result.toUIMessageStreamResponse({
      originalMessages: messages,
      sendReasoning: true,
      onError: (error) => {
        console.error("[agent-chat]", error);
        return friendlyAiError(error);
      },
    }),
    runIdFetch,
    { "Cache-Control": "no-store" },
  );
}

export const Route = createFileRoute("/api/agent-chat")({
  server: {
    handlers: {
      POST: ({ request }) => handleTestChat(request),
    },
  },
});
