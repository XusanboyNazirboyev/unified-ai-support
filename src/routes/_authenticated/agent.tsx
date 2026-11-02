import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useMemo, useRef, useState } from "react";
import { BookOpen, Database, Headset, RotateCcw, ShieldCheck, UserCheck } from "lucide-react";
import { toast } from "sonner";

import logo from "@/assets/javobchi-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput, type ToolPart } from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CHANNEL_LABELS, CHANNELS, type Channel } from "@/lib/agent-rules";
import { customersQuery, settingsQuery } from "@/lib/queries";
import { parseVoiceMeta } from "@/lib/voice";
import { VoiceBadge, VoiceRecordButton } from "@/components/voice-input";
import { MediaSummary, MediaUploadButton } from "@/components/media-input";
import { mediaPreview, parseMediaMeta } from "@/lib/media";
import { useI18n } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/locales";

export const Route = createFileRoute("/_authenticated/agent")({
  head: () => ({
    meta: [
      { title: "AI agent va sinov chati — Javobchi" },
      { name: "description", content: "AI agent sozlamalari va jonli efirdan oldin xavfsiz sinov chati." },
      { property: "og:title", content: "AI agent — Javobchi" },
      { property: "og:description", content: "Agentni sozlang va javob manbalarini ko'rib sinang." },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(settingsQuery),
      context.queryClient.ensureQueryData(customersQuery),
    ]),
  component: AgentPage,
});

function AgentPage() {
  const { t } = useI18n();
  return (
    <div>
      <PageHeader title={t("agent.title")} description={t("agent.description")} />
      <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <SettingsForm />
        <TestChat />
      </div>
    </div>
  );
}

function SettingsForm() {
  const queryClient = useQueryClient();
  const { data: settings } = useSuspenseQuery(settingsQuery);
  const { t } = useI18n();
  const [form, setForm] = useState({
    agent_name: settings?.agent_name ?? "Malika",
    company_name: settings?.company_name ?? "",
    tone: settings?.tone ?? "samimiy",
    instructions: settings?.instructions ?? "",
    keywords: (settings?.handover_keywords ?? []).join(", "),
    require_verification: settings?.require_verification ?? true,
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("agent_settings")
      .update({
        agent_name: form.agent_name.trim() || "Agent",
        company_name: form.company_name.trim(),
        tone: form.tone,
        instructions: form.instructions,
        handover_keywords: form.keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
        require_verification: form.require_verification,
        updated_at: new Date().toISOString(),
      })
      .eq("owner_id", settings?.owner_id ?? "");
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("agent.saved"));
    queryClient.invalidateQueries({ queryKey: ["agent_settings"] });
  }

  async function toggleLive(next: boolean) {
    const { error } = await supabase
      .from("agent_settings")
      .update({ is_live: next })
      .eq("owner_id", settings?.owner_id ?? "");
    if (error) { toast.error(error.message); return; }
    toast.success(next ? t("agent.wentLive") : t("agent.turnedOff"));
    queryClient.invalidateQueries({ queryKey: ["agent_settings"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-ink p-5 text-ink-foreground">
        <div>
          <div className="font-display text-lg font-semibold">{t("agent.liveTitle")}</div>
          <p className="mt-1 text-sm text-ink-foreground/70">
            {settings?.is_live ? t("agent.liveOn") : t("agent.liveOff")}
          </p>
        </div>
        <Switch checked={settings?.is_live ?? false} onCheckedChange={toggleLive} aria-label={t("agent.liveTitle")} />
      </div>

      <div className="space-y-4 rounded-2xl border bg-card p-5">
        <h2 className="font-display text-lg font-semibold">{t("agent.personality")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="agent_name">{t("agent.name")}</Label>
            <Input id="agent_name" value={form.agent_name} onChange={(e) => setForm({ ...form, agent_name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company_name">{t("agent.company")}</Label>
            <Input
              id="company_name"
              value={form.company_name}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{t("agent.tone")}</Label>
          <Select value={form.tone} onValueChange={(v) => setForm({ ...form, tone: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="samimiy">{t("agent.tone.samimiy")}</SelectItem>
              <SelectItem value="rasmiy">{t("agent.tone.rasmiy")}</SelectItem>
              <SelectItem value="qisqa">{t("agent.tone.qisqa")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="instructions">{t("agent.instructions")}</Label>
          <Textarea
            id="instructions"
            rows={5}
            value={form.instructions}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
            placeholder={t("agent.instructionsPlaceholder")}
          />
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border bg-card p-5">
        <h2 className="font-display text-lg font-semibold">{t("agent.handoverTitle")}</h2>
        <div className="space-y-1.5">
          <Label htmlFor="keywords">{t("agent.keywords")}</Label>
          <Input id="keywords" value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} />
          <p className="text-xs text-muted-foreground">{t("agent.keywordsHint")}</p>
        </div>
        <div className="flex items-start justify-between gap-4 rounded-xl bg-muted p-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="size-4" /> {t("agent.verifyTitle")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("agent.verifyText")}</p>
          </div>
          <Switch
            checked={form.require_verification}
            onCheckedChange={(v) => setForm({ ...form, require_verification: v })}
            aria-label={t("agent.verifyTitle")}
          />
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </div>
  );
}

const TOOL_TITLES: Record<string, MessageKey> = {
  search_knowledge_base: "agent.tool.search_knowledge_base",
  verify_customer: "agent.tool.verify_customer",
  get_customer_profile: "agent.tool.get_customer_profile",
  get_orders: "agent.tool.get_orders",
  handover_to_human: "agent.tool.handover_to_human",
  get_course_catalog: "agent.tool.get_course_catalog",
  bitrix24_find_customer: "agent.tool.bitrix24_find_customer",
  bitrix24_save_lead: "agent.tool.bitrix24_save_lead",
};

function sourcesFromParts(message: UIMessage, t: ReturnType<typeof useI18n>["t"]) {
  const sources: { icon: "kb" | "crm" | "handover"; label: string }[] = [];
  for (const part of message.parts) {
    if (!part.type.startsWith("tool-")) continue;
    const tp = part as ToolPart;
    if (tp.state !== "output-available") continue;
    const name = tp.type.slice(5);
    const out = tp.output as Record<string, unknown> | undefined;
    if (name === "search_knowledge_base" && Array.isArray(out?.["articles"])) {
      for (const a of out["articles"] as { title: string }[]) sources.push({ icon: "kb", label: a.title });
    }
    if (name === "get_orders" && Array.isArray(out?.["orders"])) {
      for (const o of out["orders"] as { order_number: string }[])
        sources.push({ icon: "crm", label: t("agent.sourceOrder", { n: o.order_number }) });
    }
    if ((name === "verify_customer" && out?.["verified"]) || (name === "get_customer_profile" && out?.["identified"])) {
      sources.push({ icon: "crm", label: t("agent.sourceProfile") });
    }
    if (name === "handover_to_human" && out?.["transferred"])
      sources.push({ icon: "handover", label: t("agent.sourceHandover") });
  }
  return sources.filter((s, i) => sources.findIndex((x) => x.label === s.label) === i);
}

const SUGGESTIONS = [
  "Toshkentga yetkazib berish qancha turadi?",
  "TM-1042 buyurtmam qayerda?",
  "Menga iPhone 17 Pro kerak",
  "Сколько стоит iPhone 16, можно в рассрочку?",
  "Do you deliver to Samarkand?",
  "Assalawma áleykum, Nókiske jetkizip beresiz be? Qansha turadı?",
  "Mani zakazim qachon kelarkan, aka? Xorazmga boramisila?",
];

function TestChat() {
  const { data: customers } = useSuspenseQuery(customersQuery);
  const { t } = useI18n();
  const [persona, setPersona] = useState<string>("unknown");
  const [channel, setChannel] = useState<Channel>("telegram");
  const contextRef = useRef({ persona, channel });
  contextRef.current = { persona, channel };

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/agent-chat",
        headers: async (): Promise<Record<string, string>> => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        body: () => ({
          customerId: contextRef.current.persona === "unknown" ? null : contextRef.current.persona,
          channel: contextRef.current.channel,
        }),
      }),
    [],
  );

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    transport,
    onError: (error) => {
      const msg = error.message || "";
      if (msg.includes("402")) toast.error(t("ai.noCredits"));
      else if (msg.includes("429")) toast.error(t("ai.rateLimited"));
      else toast.error(msg.length < 200 && msg ? msg : t("ai.failed"));
    },
  });

  const busy = status === "submitted" || status === "streaming";
  const personaCustomer = customers.find((c) => c.id === persona);

  function reset() {
    stop();
    setMessages([]);
  }

  // Local previews of photos/videos sent in this test chat (never uploaded anywhere besides the AI check).
  const previewsRef = useRef(new Map<string, string>());

  function submit(text: string) {
    const value = text.trim();
    if (!value || busy) return;
    sendMessage({ text: value });
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] min-h-[560px] flex-col overflow-hidden rounded-2xl border bg-card xl:sticky xl:top-6">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <img src={logo} alt="" width={32} height={32} className="size-8" />
        <div className="mr-auto">
          <div className="font-display font-semibold leading-tight">{t("test.title")}</div>
          <div className="text-xs text-muted-foreground">{t("test.subtitle")}</div>
        </div>
        <Select
          value={channel}
          onValueChange={(v) => {
            setChannel(v as Channel);
          }}
        >
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHANNELS.map((c) => (
              <SelectItem key={c} value={c}>
                {CHANNEL_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={persona}
          onValueChange={(v) => {
            setPersona(v);
            reset();
          }}
        >
          <SelectTrigger className="h-8 w-48 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unknown">{t("test.unknownCustomer")}</SelectItem>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.full_name} (CRM)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" onClick={reset} aria-label={t("test.reset")}>
          <RotateCcw className="size-4" />
        </Button>
      </div>

      {personaCustomer && (
        <div className="flex items-center gap-2 border-b bg-secondary px-4 py-2 text-xs">
          <UserCheck className="size-3.5" /> {t("test.identified", { channel: CHANNEL_LABELS[channel] })}{" "}
          <b>{personaCustomer.full_name}</b>
        </div>
      )}

      <Conversation className="flex-1">
        <ConversationContent className="px-4">
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<img src={logo} alt="" width={56} height={56} className="size-14" />}
              title={t("test.emptyTitle")}
              description={t("test.emptyText")}
            >
              <div className="mt-2 flex flex-col items-center gap-3">
                <img src={logo} alt="" width={56} height={56} className="size-14" />
                <div className="font-display text-lg font-semibold">{t("test.emptyTitle")}</div>
                <p className="max-w-sm text-center text-sm text-muted-foreground">{t("test.emptyText")}</p>
                <div className="mt-2 flex max-w-md flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => submit(s)}
                      className="rounded-full border bg-background px-3 py-1.5 text-xs hover:bg-muted"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </ConversationEmptyState>
          ) : (
            messages.map((message) => {
              const sources = message.role === "assistant" ? sourcesFromParts(message, t) : [];
              const hasText = message.parts.some((p) => p.type === "text" && p.text.length > 0);
              return (
                <Message key={message.id} from={message.role}>
                  <MessageContent
                    className={
                      message.role === "user"
                        ? "group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground"
                        : undefined
                    }
                  >
                    {message.parts.map((part, i) => {
                      if (part.type === "text") {
                        const meta = message.metadata as { voice?: unknown; media?: unknown; previewId?: string } | undefined;
                        const voice = parseVoiceMeta(meta?.voice);
                        const media = parseMediaMeta(meta?.media);
                        if (message.role === "user" && media) {
                          return (
                            <MediaSummary
                              key={i}
                              meta={media}
                              previewUrl={(meta?.previewId ? previewsRef.current.get(meta.previewId) : null) ?? null}
                            />
                          );
                        }
                        return message.role === "user" ? (
                          <div key={i} className="space-y-1">
                            {voice && <VoiceBadge meta={voice} />}
                            <p className="whitespace-pre-wrap">{part.text}</p>
                          </div>
                        ) : (
                          <MessageResponse key={i}>{part.text}</MessageResponse>
                        );
                      }
                      if (part.type.startsWith("tool-")) {
                        const tp = part as ToolPart;
                        const name = tp.type.slice(5);
                        const titleKey = TOOL_TITLES[name];
                        return (
                          <Tool key={i} defaultOpen={false} className="mb-0">
                            <ToolHeader
                              type={tp.type as `tool-${string}`}
                              state={tp.state}
                              title={titleKey ? t(titleKey) : name}
                            />
                            <ToolContent>
                              <ToolInput input={tp.input} />
                              <ToolOutput output={tp.output} errorText={tp.errorText} />
                            </ToolContent>
                          </Tool>
                        );
                      }
                      return null;
                    })}
                    {message.role === "assistant" && !hasText && busy && (
                      <Shimmer className="text-sm">{t("test.checking")}</Shimmer>
                    )}
                    {sources.length > 0 && hasText && (
                      <div className="flex flex-wrap items-center gap-1.5 border-t pt-2">
                        <span className="text-[11px] font-medium text-muted-foreground">{t("test.sources")}</span>
                        {sources.map((s) => (
                          <span
                            key={s.label}
                            className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px]"
                          >
                            {s.icon === "kb" ? (
                              <BookOpen className="size-3" />
                            ) : s.icon === "crm" ? (
                              <Database className="size-3" />
                            ) : (
                              <Headset className="size-3" />
                            )}
                            {s.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </MessageContent>
                </Message>
              );
            })
          )}
          {status === "submitted" && (
            <Message from="assistant">
              <MessageContent>
                <Shimmer className="text-sm">{t("test.thinking")}</Shimmer>
              </MessageContent>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t p-3">
        <PromptInput onSubmit={(msg) => submit(msg.text)}>
          <PromptInputTextarea placeholder={t("test.placeholder")} autoFocus />
          <PromptInputFooter className="justify-between">
            <div className="flex items-center gap-1">
              <VoiceRecordButton
                allowUpload
                disabled={busy}
                onTranscribed={({ transcript, meta }) => {
                  if (busy) return;
                  sendMessage({ text: transcript, metadata: { voice: meta } });
                }}
              />
              <MediaUploadButton
                disabled={busy}
                onAnalyzed={(meta, file) => {
                  if (busy) return;
                  const previewId = crypto.randomUUID();
                  previewsRef.current.set(previewId, URL.createObjectURL(file));
                  sendMessage({ text: mediaPreview("", meta), metadata: { media: meta, previewId } });
                }}
              />
            </div>
            <PromptInputSubmit status={status} onStop={stop} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
