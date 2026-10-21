import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { FlaskConical } from "lucide-react";
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
import { cn } from "@/lib/utils";

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

const REQUIREMENTS: Record<Channel, string> = {
  telegram: "@BotFather orqali yaratilgan bot kerak. Bot ulanganda xabarlar Inbox'ga to'g'ridan-to'g'ri tushadi.",
  instagram: "Instagram Business akkaunt va Meta'ning ruxsati (app review) kerak. Direct xabarlar Inbox'ga keladi.",
  whatsapp: "WhatsApp Business akkaunt va telefon raqami kerak. Meta tasdig'idan so'ng ulanadi.",
};

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
  const [form, setForm] = useState({
    channel: "telegram" as Channel,
    contactName: "Dilshod Karimov",
    contactHandle: "@dilshod_k",
    text: "Salom, TM-1042 buyurtmam qachon yetib keladi?",
  });
  const [sending, setSending] = useState(false);

  async function send() {
    if (!form.contactName.trim() || !form.text.trim()) { toast.error("Ism va xabarni kiriting"); return; }
    setSending(true);
    try {
      const result = await simulate({
        data: {
          channel: form.channel,
          contactName: form.contactName,
          contactHandle: form.contactHandle.trim() || null,
          text: form.text,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (result.outcome === "ai_error") toast.error(result.message ?? "AI xatosi");
      else if (result.outcome === "agent_offline") toast.info("Agent o'chiq — xabar operatorni kutmoqda");
      else toast.success(result.outcome === "handover" ? "Xabar operatorga uzatildi" : "AI agent javob berdi");
      navigate({ to: "/inbox", search: { c: result.conversationId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Yuborilmadi");
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Kanallar"
        description="Mijozlar yozadigan messenjerlar. Hozir demo rejimida ishlayapti — haqiqiy akkauntlarni ulash keyingi bosqich."
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
                      <Badge className="bg-success text-primary-foreground">Ulangan</Badge>
                    ) : status === "demo" ? (
                      <Badge variant="secondary">Demo rejim</Badge>
                    ) : (
                      <Badge variant="outline">Ulanmagan</Badge>
                    )}
                    {conn?.account_name && <span className="text-sm text-muted-foreground">{conn.account_name}</span>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{REQUIREMENTS[ch]}</p>
                </div>
              </div>
            );
          })}
          <div className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">
            Haqiqiy kanallarni ulash uchun: Telegram — bot tokeni, WhatsApp — Business akkaunt, Instagram — Meta
            Business ruxsati. Ulangandan so'ng xabarlar avtomatik Inbox'ga tushadi va AI agent xuddi sinovdagidek javob
            beradi.
          </div>
        </div>

        <div className="h-fit space-y-4 rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <FlaskConical className="size-5 text-primary" />
            <h2 className="font-display text-lg font-semibold">Kiruvchi xabarni sinash</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Mijoz kanaldan yozganini simulyatsiya qiling. Xabar Inbox'ga tushadi va agent jonli efirda bo'lsa, darhol
            javob beradi.
          </p>
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
              <Label htmlFor="sim-name">Mijoz ismi</Label>
              <Input id="sim-name" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sim-handle">{form.channel === "whatsapp" ? "Telefon" : "Username"}</Label>
              <Input
                id="sim-handle"
                value={form.contactHandle}
                onChange={(e) => setForm({ ...form, contactHandle: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sim-text">Xabar</Label>
            <Textarea id="sim-text" rows={3} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
          </div>
          <p className="text-xs text-muted-foreground">
            Maslahat: username CRM'dagi mijozga mos kelsa (masalan @dilshod_k), agent uni avtomatik taniydi.
          </p>
          <Button className="w-full" onClick={send} disabled={sending}>
            {sending ? "Agent javob bermoqda..." : "Xabar yuborish"}
          </Button>
        </div>
      </div>
    </div>
  );
}
