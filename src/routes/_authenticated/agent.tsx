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
  return (
    <div>
      <PageHeader
        title="AI agent"
        description="Agent qanday gapirishini, qachon operatorga uzatishini sozlang va jonli efirga chiqarishdan oldin xavfsiz sinov chatida tekshiring."
      />
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
    if (error) return toast.error(error.message);
    toast.success("Sozlamalar saqlandi");
    queryClient.invalidateQueries({ queryKey: ["agent_settings"] });
  }

  async function toggleLive(next: boolean) {
    const { error } = await supabase
      .from("agent_settings")
      .update({ is_live: next })
      .eq("owner_id", settings?.owner_id ?? "");
    if (error) return toast.error(error.message);
    toast.success(next ? "Agent jonli efirda — mijozlarga avtomatik javob beradi" : "Agent o'chirildi");
    queryClient.invalidateQueries({ queryKey: ["agent_settings"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-ink p-5 text-ink-foreground">
        <div>
          <div className="font-display text-lg font-semibold">Jonli efir</div>
          <p className="mt-1 text-sm text-ink-foreground/70">
            {settings?.is_live
              ? "Agent Inbox'dagi yangi xabarlarga avtomatik javob bermoqda."
              : "O'chiq: yangi xabarlar operatorni kutadi. Avval sinov chatida tekshiring."}
          </p>
        </div>
        <Switch checked={settings?.is_live ?? false} onCheckedChange={toggleLive} aria-label="Jonli efir" />
      </div>

      <div className="space-y-4 rounded-2xl border bg-card p-5">
        <h2 className="font-display text-lg font-semibold">Shaxsiyat</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="agent_name">Agent ismi</Label>
            <Input id="agent_name" value={form.agent_name} onChange={(e) => setForm({ ...form, agent_name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company_name">Kompaniya nomi</Label>
            <Input
              id="company_name"
              value={form.company_name}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Ohang</Label>
          <Select value={form.tone} onValueChange={(v) => setForm({ ...form, tone: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="samimiy">Samimiy — iliq va do'stona</SelectItem>
              <SelectItem value="rasmiy">Rasmiy — hurmat bilan, "Siz"</SelectItem>
              <SelectItem value="qisqa">Qisqa — 1–2 gapda</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="instructions">Qo'shimcha ko'rsatmalar</Label>
          <Textarea
            id="instructions"
            rows={5}
            value={form.instructions}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
            placeholder="Masalan: har doim promo kodni eslatib o'ting"
          />
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border bg-card p-5">
        <h2 className="font-display text-lg font-semibold">Operatorga uzatish va xavfsizlik</h2>
        <div className="space-y-1.5">
          <Label htmlFor="keywords">Kalit so'zlar (vergul bilan)</Label>
          <Input id="keywords" value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} />
          <p className="text-xs text-muted-foreground">
            Mijoz shu so'zlardan birini yozsa, suhbat darhol operatorga o'tadi. Javob bazada bo'lmasa, agent ham o'zi
            uzatadi.
          </p>
        </div>
        <div className="flex items-start justify-between gap-4 rounded-xl bg-muted p-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="size-4" /> Mijozni tasdiqlash
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Noma'lum kontaktga buyurtma va shaxsiy ma'lumotni faqat telefon + buyurtma raqami mos kelganda beradi.
            </p>
          </div>
          <Switch
            checked={form.require_verification}
            onCheckedChange={(v) => setForm({ ...form, require_verification: v })}
            aria-label="Mijozni tasdiqlash"
          />
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saqlanmoqda..." : "Saqlash"}
        </Button>
      </div>
    </div>
  );
}

const TOOL_TITLES: Record<string, string> = {
  search_knowledge_base: "Bilimlar bazasidan qidirish",
  verify_customer: "Mijozni CRMda tasdiqlash",
  get_customer_profile: "CRM: mijoz profili",
  get_orders: "CRM: buyurtmalar",
  handover_to_human: "Operatorga uzatish",
};

function sourcesFromParts(message: UIMessage) {
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
        sources.push({ icon: "crm", label: `Buyurtma ${o.order_number}` });
    }
    if ((name === "verify_customer" && out?.["verified"]) || (name === "get_customer_profile" && out?.["identified"])) {
      sources.push({ icon: "crm", label: "Mijoz profili" });
    }
    if (name === "handover_to_human") sources.push({ icon: "handover", label: "Operatorga uzatildi" });
  }
  return sources.filter((s, i) => sources.findIndex((x) => x.label === s.label) === i);
}

const SUGGESTIONS = [
  "Toshkentga yetkazib berish qancha turadi?",
  "TM-1042 buyurtmam qayerda?",
  "iPhone 16 narxi qancha, nasiyaga bo'ladimi?",
  "Konditsionerni o'rnatib berasizlarmi?",
];

function TestChat() {
  const { data: customers } = useSuspenseQuery(customersQuery);
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
      if (msg.includes("402")) toast.error("AI kreditlari tugadi. Workspace sozlamalarida kredit qo'shing.");
      else if (msg.includes("429")) toast.error("So'rovlar ko'payib ketdi, birozdan so'ng urinib ko'ring.");
      else toast.error(msg.length < 200 && msg ? msg : "Agent javob bera olmadi");
    },
  });

  const busy = status === "submitted" || status === "streaming";
  const personaCustomer = customers.find((c) => c.id === persona);

  function reset() {
    stop();
    setMessages([]);
  }

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
          <div className="font-display font-semibold leading-tight">Xavfsiz sinov chati</div>
          <div className="text-xs text-muted-foreground">Mijozlarga ko'rinmaydi · saqlangan sozlamalar bilan</div>
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
            <SelectItem value="unknown">Noma'lum mijoz</SelectItem>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.full_name} (CRM)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" onClick={reset} aria-label="Chatni tozalash">
          <RotateCcw className="size-4" />
        </Button>
      </div>

      {personaCustomer && (
        <div className="flex items-center gap-2 border-b bg-secondary px-4 py-2 text-xs">
          <UserCheck className="size-3.5" /> {CHANNEL_LABELS[channel]} akkaunti orqali aniqlangan mijoz:{" "}
          <b>{personaCustomer.full_name}</b>
        </div>
      )}

      <Conversation className="flex-1">
        <ConversationContent className="px-4">
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<img src={logo} alt="" width={56} height={56} className="size-14" />}
              title="Agentni sinab ko'ring"
              description="Mijoz kabi yozing. Har bir javob ostida qaysi bilim yoki CRM yozuvidan foydalanilgani ko'rinadi."
            >
              <div className="mt-2 flex flex-col items-center gap-3">
                <img src={logo} alt="" width={56} height={56} className="size-14" />
                <div className="font-display text-lg font-semibold">Agentni sinab ko'ring</div>
                <p className="max-w-sm text-center text-sm text-muted-foreground">
                  Mijoz kabi yozing. Har bir javob ostida qaysi bilim yoki CRM yozuvidan foydalanilgani ko'rinadi.
                </p>
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
              const sources = message.role === "assistant" ? sourcesFromParts(message) : [];
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
                        return message.role === "user" ? (
                          <p key={i} className="whitespace-pre-wrap">
                            {part.text}
                          </p>
                        ) : (
                          <MessageResponse key={i}>{part.text}</MessageResponse>
                        );
                      }
                      if (part.type.startsWith("tool-")) {
                        const tp = part as ToolPart;
                        const name = tp.type.slice(5);
                        return (
                          <Tool key={i} defaultOpen={false} className="mb-0">
                            <ToolHeader
                              type={tp.type as `tool-${string}`}
                              state={tp.state}
                              title={TOOL_TITLES[name] ?? name}
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
                      <Shimmer className="text-sm">Manbalar tekshirilmoqda...</Shimmer>
                    )}
                    {sources.length > 0 && hasText && (
                      <div className="flex flex-wrap items-center gap-1.5 border-t pt-2">
                        <span className="text-[11px] font-medium text-muted-foreground">Manbalar:</span>
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
                <Shimmer className="text-sm">O'ylamoqda...</Shimmer>
              </MessageContent>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t p-3">
        <PromptInput onSubmit={(msg) => submit(msg.text)}>
          <PromptInputTextarea placeholder="Mijoz sifatida yozing..." autoFocus />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} onStop={stop} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
