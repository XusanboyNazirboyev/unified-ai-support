import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ExternalLink, FlaskConical } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { ChannelIcon } from "@/components/channel-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CHANNEL_LABELS, CHANNELS, type Channel } from "@/lib/agent-rules";
import { simulateNewConversation } from "@/lib/inbox.functions";
import { channelsQuery } from "@/lib/queries";
import { connectTelegramBot, disconnectTelegramBot, getTelegramBot } from "@/lib/telegram.functions";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import type { VoiceTranscript } from "@/lib/voice";
import { VoiceRecordButton } from "@/components/voice-input";
import { InstagramConnect } from "@/components/instagram-connect";

export const Route = createFileRoute("/_authenticated/channels")({
  head: () => ({
    meta: [
      { title: "Kanallar — Javobchi" },
      { name: "description", content: "Telegram, Instagram va WhatsApp kanallarini ulash va sinov xabarlari yuborish." },
      { property: "og:title", content: "Kanallar — Javobchi" },
      { property: "og:description", content: "Telegram, Instagram va WhatsApp kanallari holati." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(channelsQuery),
  component: ChannelsPage,
});

const REQUIREMENTS = {
  telegram: "channels.req.telegram",
  instagram: "channels.req.instagram",
  whatsapp: "channels.req.whatsapp",
} as const satisfies Record<Channel, string>;

const COLORS: Record<Channel, string> = {
  telegram: "bg-telegram",
  instagram: "bg-instagram",
  whatsapp: "bg-whatsapp",
};

function ChannelsPage() {
  const { data: connections } = useSuspenseQuery(channelsQuery);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const simulate = useServerFn(simulateNewConversation);
  const { t } = useI18n();
  const [form, setForm] = useState({
    channel: "telegram" as Channel,
    contactName: "Dilshod Karimov",
    contactHandle: "@dilshod_k",
    text: "Salom, TM-1042 buyurtmam qachon yetib keladi?",
  });
  const [sending, setSending] = useState(false);

  async function send(voice?: VoiceTranscript) {
    const text = voice ? voice.transcript : form.text;
    if (!form.contactName.trim() || !text.trim()) { toast.error(t("channels.needNameText")); return; }
    setSending(true);
    try {
      const result = await simulate({
        data: {
          channel: form.channel,
          contactName: form.contactName,
          contactHandle: form.contactHandle.trim() || null,
          text,
          voice: voice?.meta ?? null,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (result.outcome === "ai_error") toast.error(result.message ?? t("common.aiError"));
      else if (result.outcome === "agent_offline") toast.info(t("channels.offline"));
      else toast.success(result.outcome === "handover" ? t("channels.handedOver") : t("channels.aiReplied"));
      navigate({ to: "/inbox", search: { c: result.conversationId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("channels.failed"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={t("channels.title")}
        description={t("channels.description")}
      />
      <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="space-y-4">
          {CHANNELS.map((ch) => {
            const conn = connections.find((c) => c.channel === ch);
            const status = conn?.status ?? "disconnected";
            return (
              <div key={ch} className="flex flex-col gap-4 rounded-2xl border bg-card p-5 sm:flex-row sm:items-center">
                <div className={cn("grid size-12 shrink-0 place-items-center rounded-xl text-primary-foreground", COLORS[ch])}>
                  <ChannelIcon channel={ch} className="size-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-lg font-semibold">{CHANNEL_LABELS[ch]}</span>
                    {status === "connected" ? (
                      <Badge className="bg-success text-primary-foreground">{t("channels.connected")}</Badge>
                    ) : status === "demo" ? (
                      <Badge variant="secondary">{t("channels.demo")}</Badge>
                    ) : (
                      <Badge variant="outline">{t("channels.disconnected")}</Badge>
                    )}
                    {conn?.account_name && <span className="text-sm text-muted-foreground">{conn.account_name}</span>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{t(REQUIREMENTS[ch])}</p>
                  {ch === "telegram" && <TelegramConnect />}
                  {ch === "instagram" && <InstagramConnect />}
                </div>
              </div>
            );
          })}
          <div className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">
            {t("channels.howTo")}
          </div>
        </div>

        <div className="h-fit space-y-4 rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <FlaskConical className="size-5 text-primary" />
            <h2 className="font-display text-lg font-semibold">{t("channels.simTitle")}</h2>
          </div>
          <p className="text-sm text-muted-foreground">{t("channels.simText")}</p>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
            {CHANNELS.map((ch) => (
              <button
                key={ch}
                onClick={() => setForm({ ...form, channel: ch })}
                className={cn(
                  "flex items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium",
                  form.channel === ch ? "bg-card shadow-sm" : "text-muted-foreground",
                )}
              >
                <ChannelIcon channel={ch} className="size-3.5" /> {CHANNEL_LABELS[ch]}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sim-name">{t("channels.simName")}</Label>
              <Input id="sim-name" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sim-handle">{form.channel === "whatsapp" ? t("channels.simPhone") : t("channels.simUsername")}</Label>
              <Input
                id="sim-handle"
                value={form.contactHandle}
                onChange={(e) => setForm({ ...form, contactHandle: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sim-text">{t("channels.simMessage")}</Label>
            <Textarea id="sim-text" rows={3} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
          </div>
          <p className="text-xs text-muted-foreground">{t("channels.simTip")}</p>
          <div className="flex items-center gap-2">
            <Button className="flex-1" onClick={() => void send()} disabled={sending}>
              {sending ? t("channels.sending") : t("channels.send")}
            </Button>
            <VoiceRecordButton allowUpload disabled={sending} onTranscribed={(v) => send(v)} />
          </div>
          <p className="text-xs text-muted-foreground">{t("channels.voiceTip")}</p>
        </div>
      </div>
    </div>
  );
}

const TG_ERRORS = {
  invalid_token: "channels.tg.err.invalid_token",
  no_public_url: "channels.tg.err.no_public_url",
  bot_in_use: "channels.tg.err.bot_in_use",
  telegram_failed: "channels.tg.err.telegram_failed",
} as const;

function TelegramConnect() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const fetchBot = useServerFn(getTelegramBot);
  const connect = useServerFn(connectTelegramBot);
  const disconnect = useServerFn(disconnectTelegramBot);
  const { data: bot, isLoading } = useQuery({ queryKey: ["telegram_bot"], queryFn: () => fetchBot() });
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["telegram_bot"] }),
      queryClient.invalidateQueries({ queryKey: ["channel_connections"] }),
    ]);
  }

  async function onConnect() {
    if (!token.trim()) return;
    setBusy(true);
    try {
      const res = await connect({ data: { token: token.trim(), origin: window.location.origin } });
      if (res.ok) {
        toast.success(t("channels.tg.connectedOk", { name: res.username }));
        setToken("");
      } else {
        toast.error(t(TG_ERRORS[res.error as keyof typeof TG_ERRORS] ?? "channels.tg.err.telegram_failed"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("channels.failed"));
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  async function onDisconnect() {
    if (!window.confirm(t("channels.tg.disconnectConfirm"))) return;
    setBusy(true);
    try {
      await disconnect();
      toast.success(t("channels.tg.disconnectedOk"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("channels.failed"));
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  if (isLoading) return null;

  if (bot) {
    return (
      <div className="mt-3 space-y-3 rounded-xl bg-muted/60 p-3 text-sm">
        <p>{t("channels.tg.live")}</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="secondary">
            <a href={`https://t.me/${bot.bot_username}`} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" /> {t("channels.tg.openBot")} @{bot.bot_username}
            </a>
          </Button>
          <Button size="sm" variant="outline" onClick={() => void onDisconnect()} disabled={busy}>
            {t("channels.tg.disconnect")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl bg-muted/60 p-3 text-sm">
      <p className="font-medium">{t("channels.tg.title")}</p>
      <ol className="space-y-1 text-muted-foreground">
        <li>{t("channels.tg.step1")}</li>
        <li>{t("channels.tg.step2")}</li>
        <li>{t("channels.tg.step3")}</li>
      </ol>
      <div className="space-y-1.5">
        <Label htmlFor="tg-token">{t("channels.tg.tokenLabel")}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="tg-token"
            type="password"
            autoComplete="off"
            placeholder="123456789:AA..."
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <Button onClick={() => void onConnect()} disabled={busy || !token.trim()}>
            {busy ? t("channels.tg.connecting") : t("channels.tg.connect")}
          </Button>
        </div>
      </div>
    </div>
  );
}
