import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNowStrict, isToday } from "date-fns";
import { enUS, ru, uz, type Locale as DateLocale } from "date-fns/locale";
import {
  Bot,
  CheckCheck,
  Database,
  BookOpen,
  Headset,
  MessageSquareDashed,
  Search,
  SendHorizonal,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { ChannelBadge, ChannelDot } from "@/components/channel-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CHANNEL_LABELS, CHANNELS, formatSum, type Channel, type MessageSource } from "@/lib/agent-rules";
import { processIncomingMessage } from "@/lib/inbox.functions";
import { sendOperatorMessage } from "@/lib/telegram.functions";
import {
  conversationsQuery,
  customersQuery,
  messagesQuery,
  ordersQuery,
  type Conversation as Conv,
  type Message,
} from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/locales";
import { parseVoiceMeta, type VoiceMeta, type VoiceTranscript } from "@/lib/voice";
import { VoiceBadge, VoiceRecordButton } from "@/components/voice-input";
import { MediaSummary } from "@/components/media-input";
import { parseMediaMeta } from "@/lib/media";

type StatusFilter = "all" | "pending" | "open" | "resolved";

export const Route = createFileRoute("/_authenticated/inbox")({
  validateSearch: (search: Record<string, unknown>) => ({
    c: typeof search["c"] === "string" ? (search["c"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Inbox — Javobchi" },
      { name: "description", content: "Telegram, Instagram va WhatsApp suhbatlari bitta oynada." },
      { property: "og:title", content: "Inbox — Javobchi" },
      { property: "og:description", content: "Barcha kanallardagi mijoz suhbatlari bitta joyda." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(conversationsQuery),
  component: InboxPage,
});

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const DATE_LOCALES: Record<Locale, DateLocale> = { uz, ru, en: enUS };

function shortTime(iso: string, locale: Locale) {
  const d = new Date(iso);
  return isToday(d) ? format(d, "HH:mm") : formatDistanceToNowStrict(d, { locale: DATE_LOCALES[locale], addSuffix: false });
}

function InboxPage() {
  const { c: selectedId } = Route.useSearch();
  const navigate = useNavigate({ from: "/inbox" });
  const queryClient = useQueryClient();
  const { t, locale } = useI18n();
  const { data: conversations } = useSuspenseQuery(conversationsQuery);
  const [channel, setChannel] = useState<Channel | "all">("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const ch = supabase
      .channel("inbox-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const convId = (payload.new as { conversation_id?: string }).conversation_id;
        if (convId) queryClient.invalidateQueries({ queryKey: ["messages", convId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [queryClient]);

  const filtered = useMemo(
    () =>
      conversations.filter(
        (c) =>
          (channel === "all" || c.channel === channel) &&
          (status === "all" || c.status === status) &&
          (!search ||
            c.contact_name.toLowerCase().includes(search.toLowerCase()) ||
            (c.last_message_preview ?? "").toLowerCase().includes(search.toLowerCase())),
      ),
    [conversations, channel, status, search],
  );

  const counts = {
    all: conversations.length,
    pending: conversations.filter((c) => c.status === "pending").length,
    open: conversations.filter((c) => c.status === "open").length,
    resolved: conversations.filter((c) => c.status === "resolved").length,
  };

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex h-[calc(100vh-7rem)] md:h-screen">
      {/* Conversation list */}
      <section className={cn("flex w-full flex-col border-r bg-card md:w-80 lg:w-96", selected && "hidden md:flex")}>
        <div className="space-y-3 border-b p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">{t("inbox.title")}</h1>
            <span className="text-xs text-muted-foreground">{t("inbox.waiting", { n: counts.pending })}</span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder={t("inbox.searchPlaceholder")}
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["all", ...CHANNELS] as const).map((ch) => (
              <button
                key={ch}
                onClick={() => setChannel(ch)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  channel === ch ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
                )}
              >
                {ch === "all" ? t("common.all") : CHANNEL_LABELS[ch]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-4 rounded-lg bg-muted p-0.5 text-[11px] font-medium">
            {(
              [
                ["all", "inbox.filter.all"],
                ["pending", "inbox.filter.pending"],
                ["open", "inbox.filter.open"],
                ["resolved", "inbox.filter.resolved"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setStatus(key)}
                className={cn(
                  "rounded-md px-1 py-1.5 transition-colors",
                  status === key ? "bg-card shadow-sm" : "text-muted-foreground",
                )}
              >
                {t(label)} <span className="text-muted-foreground">{counts[key]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">{t("inbox.empty")}</div>
          )}
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => navigate({ search: { c: c.id } })}
              className={cn(
                "flex w-full gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-muted/60",
                c.id === selectedId && "bg-secondary",
              )}
            >
              <div className="relative shrink-0">
                <div className="grid size-10 place-items-center rounded-full bg-muted font-display text-sm font-bold">
                  {initials(c.contact_name)}
                </div>
                <ChannelDot channel={c.channel} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{c.contact_name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{shortTime(c.last_message_at, locale)}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.last_message_preview}</p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  {c.mode === "ai" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent/50 px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
                      <Bot className="size-3" /> AI
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning/30 px-1.5 py-0.5 text-[10px] font-semibold text-warning-foreground">
                      <Headset className="size-3" /> {t("common.operator")}
                    </span>
                  )}
                  {c.status === "resolved" && (
                    <span className="text-[10px] font-medium text-muted-foreground">{t("inbox.filter.resolved")}</span>
                  )}
                  {c.unread_count > 0 && (
                    <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                      {c.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Thread */}
      {selected ? (
        <Thread key={selected.id} conversation={selected} onBack={() => navigate({ search: { c: undefined } })} />
      ) : (
        <div className="hidden flex-1 flex-col items-center justify-center gap-3 bg-grid text-center md:flex">
          <MessageSquareDashed className="size-10 text-muted-foreground" />
          <p className="font-display text-lg font-semibold">{t("inbox.pickTitle")}</p>
          <p className="max-w-xs text-sm text-muted-foreground">{t("inbox.pickText")}</p>
        </div>
      )}
    </div>
  );
}

function SourceChips({ sources }: { sources: MessageSource[] }) {
  if (!sources.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap justify-end gap-1">
      {sources.map((s) => (
        <span
          key={`${s.type}-${s.label}`}
          className="inline-flex items-center gap-1 rounded-md border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground"
        >
          {s.type === "kb" ? <BookOpen className="size-3" /> : <Database className="size-3" />}
          {s.label}
        </span>
      ))}
    </div>
  );
}

function MessageRow({ message }: { message: Message }) {
  const { t } = useI18n();
  const time = format(new Date(message.created_at), "HH:mm");
  if (message.role === "system") {
    return (
      <div className="flex justify-center">
        <span className="rounded-full bg-warning/25 px-3 py-1 text-[11px] font-medium text-warning-foreground">
          {message.content}
        </span>
      </div>
    );
  }
  if (message.role === "customer") {
    return (
      <div className="flex max-w-[80%] flex-col items-start">
        <div className="rounded-2xl rounded-bl-sm border bg-card px-3.5 py-2.5 text-sm shadow-sm">
          {message.is_voice && <VoiceBadge meta={parseVoiceMeta(message.voice_meta)} className="mb-1 text-muted-foreground" />}
          {(() => {
            const media = message.media_kind ? parseMediaMeta(message.media_meta) : null;
            return media ? <MediaSummary meta={media} className="mb-1 text-muted-foreground" /> : null;
          })()}
          {message.content && <p className="whitespace-pre-wrap">{message.content}</p>}
        </div>
        <span className="mt-1 text-[10px] text-muted-foreground">{time}</span>
      </div>
    );
  }
  const isAi = message.role === "ai";
  const sources = Array.isArray(message.sources) ? (message.sources as MessageSource[]) : [];
  return (
    <div className="ml-auto flex max-w-[80%] flex-col items-end">
      <div
        className={cn(
          "whitespace-pre-wrap rounded-2xl rounded-br-sm px-3.5 py-2.5 text-sm",
          isAi ? "bg-primary text-primary-foreground" : "bg-ink text-ink-foreground",
        )}
      >
        {message.content}
      </div>
      <span className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
        {isAi ? <Bot className="size-3" /> : <Headset className="size-3" />}
        {isAi ? t("common.aiAgent") : t("common.operator")} · {time}
        {isAi && message.response_ms != null && ` · ${(message.response_ms / 1000).toFixed(1)} s`}
      </span>
      {message.delivery_error && (
        <span className="text-[10px] font-medium text-destructive" title={message.delivery_error}>
          {t("inbox.notDeliveredShort")}
        </span>
      )}
      {isAi && <SourceChips sources={sources} />}
    </div>
  );
}

function Thread({ conversation, onBack }: { conversation: Conv; onBack: () => void }) {
  const queryClient = useQueryClient();
  const { data: messages = [], isLoading } = useQuery(messagesQuery(conversation.id));
  const processIncoming = useServerFn(processIncomingMessage);
  const sendOperator = useServerFn(sendOperatorMessage);
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [asCustomer, setAsCustomer] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (conversation.unread_count > 0) {
      supabase
        .from("conversations")
        .update({ unread_count: 0 })
        .eq("id", conversation.id)
        .then(() => queryClient.invalidateQueries({ queryKey: ["conversations"] }));
    }
  }, [conversation.id, conversation.unread_count, queryClient]);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["conversations"] }),
      queryClient.invalidateQueries({ queryKey: ["messages", conversation.id] }),
    ]);

  async function updateConversation(patch: Partial<Conv>, okText: string) {
    const { error } = await supabase.from("conversations").update(patch).eq("id", conversation.id);
    if (error) toast.error(error.message);
    else toast.success(okText);
    await refresh();
  }

  async function sendCustomerVoice({ transcript, meta }: VoiceTranscript) {
    if (busy) return;
    setBusy(true);
    try {
      await runIncoming(transcript, meta);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.sendFailed"));
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  async function runIncoming(value: string, voice: VoiceMeta | null) {
    const result = await processIncoming({ data: { conversationId: conversation.id, text: value, voice } });
    const notes: Record<string, string> = {
      handover: t("inbox.outcome.handover"),
      waiting_operator: t("inbox.outcome.waiting"),
      agent_offline: t("inbox.outcome.offline"),
    };
    if (result.outcome === "ai_error") toast.error(result.message ?? t("common.aiError"));
    else if (notes[result.outcome]) toast.info(notes[result.outcome]);
  }

  async function send() {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setText("");
    try {
      if (asCustomer) {
        await runIncoming(value, null);
      } else {
        const res = await sendOperator({ data: { conversationId: conversation.id, text: value } });
        if (!res.delivered) toast.error(t("inbox.notDelivered", { error: res.deliveryError ?? "" }));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.sendFailed"));
      setText(value);
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  return (
    <div className="flex min-w-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b bg-card px-4 py-3">
          <Button variant="ghost" size="sm" className="md:hidden" onClick={onBack}>
            ←
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-display font-semibold">{conversation.contact_name}</span>
              <ChannelBadge channel={conversation.channel} />
            </div>
            <div className="text-xs text-muted-foreground">
              {conversation.contact_handle ?? t("inbox.contact")}
              {conversation.handover_reason && conversation.mode === "human" && (
                <> · {t("inbox.handoverReason", { reason: conversation.handover_reason })}</>
              )}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex rounded-lg border p-0.5 text-xs font-medium">
              <button
                onClick={() =>
                  conversation.mode !== "ai" &&
                  updateConversation({ mode: "ai", status: "open", handover_reason: null }, t("inbox.aiBack"))
                }
                className={cn(
                  "flex items-center gap-1 rounded-md px-2.5 py-1.5",
                  conversation.mode === "ai" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                <Bot className="size-3.5" /> AI
              </button>
              <button
                onClick={() =>
                  conversation.mode !== "human" &&
                  updateConversation(
                    { mode: "human", status: "pending", handover_reason: t("inbox.operatorTook") },
                    t("inbox.movedToOperator"),
                  )
                }
                className={cn(
                  "flex items-center gap-1 rounded-md px-2.5 py-1.5",
                  conversation.mode === "human" ? "bg-ink text-ink-foreground" : "text-muted-foreground",
                )}
              >
                <Headset className="size-3.5" /> {t("common.operator")}
              </button>
            </div>
            {conversation.status !== "resolved" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateConversation({ status: "resolved" }, t("inbox.resolved"))}
              >
                <CheckCheck className="size-4" /> {t("inbox.resolve")}
              </Button>
            )}
          </div>
        </header>

        <Conversation className="flex-1 bg-muted/40">
          <ConversationContent className="gap-4 px-4 py-6 md:px-8">
            {isLoading && <Shimmer>{t("common.loading")}</Shimmer>}
            {messages.map((m) => (
              <MessageRow key={m.id} message={m} />
            ))}
            {busy && asCustomer && (
              <div className="ml-auto text-xs">
                <Shimmer>{t("inbox.aiTyping")}</Shimmer>
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="border-t bg-card p-3">
          <div className="mb-2 flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">{t("inbox.sendAs")}</span>
            <button
              onClick={() => setAsCustomer(false)}
              className={cn(
                "flex items-center gap-1 rounded-full border px-2.5 py-1",
                !asCustomer && "border-foreground bg-foreground text-background",
              )}
            >
              <Headset className="size-3" /> {t("inbox.asOperator")}
            </button>
            <button
              onClick={() => setAsCustomer(true)}
              className={cn(
                "flex items-center gap-1 rounded-full border px-2.5 py-1",
                asCustomer && "border-foreground bg-foreground text-background",
              )}
            >
              <UserRound className="size-3" /> {t("inbox.asCustomer")}
            </button>
          </div>
          <div className="flex items-end gap-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={2}
              placeholder={
                asCustomer
                  ? t("inbox.placeholderCustomer")
                  : t("inbox.placeholderOperator")
              }
              className="min-h-[52px] resize-none"
            />
            {asCustomer && <VoiceRecordButton allowUpload disabled={busy} onTranscribed={sendCustomerVoice} />}
            <Button size="icon" onClick={() => void send()} disabled={busy || !text.trim()} aria-label={t("common.send")}>
              <SendHorizonal className="size-4" />
            </Button>
          </div>
        </div>
      </section>

      <CustomerPanel customerId={conversation.customer_id} />
    </div>
  );
}

function CustomerPanel({ customerId }: { customerId: string | null }) {
  const { t, orderStatus } = useI18n();
  const { data: customers = [] } = useQuery(customersQuery);
  const { data: orders = [] } = useQuery(ordersQuery);
  const customer = customers.find((c) => c.id === customerId);
  const customerOrders = orders.filter((o) => o.customer_id === customerId);

  return (
    <aside className="hidden w-72 shrink-0 overflow-y-auto border-l bg-card p-4 xl:block">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Database className="size-4" /> {t("inbox.crmTitle")}
      </h2>
      {!customer ? (
        <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
          {t("inbox.crmUnknown")}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl bg-secondary p-3">
            <div className="font-display font-semibold">{customer.full_name}</div>
            <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              <div>{customer.phone}</div>
              {customer.email && <div>{customer.email}</div>}
              <div>{customer.city}</div>
            </div>
            <Badge variant="outline" className="mt-2">
              {customer.segment}
            </Badge>
            {customer.notes && <p className="mt-2 text-xs">{customer.notes}</p>}
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("inbox.orders")}</div>
            <div className="space-y-2">
              {customerOrders.length === 0 && <div className="text-xs text-muted-foreground">{t("inbox.noOrders")}</div>}
              {customerOrders.map((o) => (
                <div key={o.id} className="rounded-lg border p-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{o.order_number}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {orderStatus(o.status)}
                    </Badge>
                  </div>
                  <div className="mt-1 text-muted-foreground">{o.items}</div>
                  <div className="mt-1 font-medium">{formatSum(o.total, o.currency)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
