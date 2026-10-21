import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { format, subDays } from "date-fns";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Bot, Clock, Headset, MessagesSquare } from "lucide-react";

import { PageHeader } from "@/components/app-shell";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { CHANNEL_LABELS, CHANNELS, type MessageSource } from "@/lib/agent-rules";
import { analyticsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Tahlillar — Javobchi" },
      { name: "description", content: "Javob berish tezligi, AI hal qilgan suhbatlar ulushi va kanallar bo'yicha statistika." },
      { property: "og:title", content: "Tahlillar — Javobchi" },
      { property: "og:description", content: "AI agent samaradorligi va javob tezligi." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(analyticsQuery),
  component: AnalyticsPage,
});

const chartConfig = {
  telegram: { label: "Telegram", color: "var(--telegram)" },
  instagram: { label: "Instagram", color: "var(--instagram)" },
  whatsapp: { label: "WhatsApp", color: "var(--whatsapp)" },
} satisfies ChartConfig;

function formatDuration(ms: number) {
  if (!ms) return "—";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 60_000)} daq`;
}

function AnalyticsPage() {
  const { data } = useSuspenseQuery(analyticsQuery);

  const stats = useMemo(() => {
    const { conversations, messages } = data;
    const aiMsgs = messages.filter((m) => m.role === "ai" && m.response_ms != null);
    const opMsgs = messages.filter((m) => m.role === "operator" && m.response_ms != null);
    const avg = (arr: typeof messages) =>
      arr.length ? arr.reduce((s, m) => s + (m.response_ms ?? 0), 0) / arr.length : 0;
    const total = conversations.length;
    const aiOnly = conversations.filter((c) => c.mode === "ai").length;
    const handed = total - aiOnly;

    const channelOf = new Map(conversations.map((c) => [c.id, c.channel]));
    const days = Array.from({ length: 14 }, (_, i) => format(subDays(new Date(), 13 - i), "yyyy-MM-dd"));
    const daily = days.map((day) => {
      const row: Record<string, string | number> = { day: format(new Date(day), "dd.MM") };
      for (const ch of CHANNELS) row[ch] = 0;
      return row;
    });
    for (const m of messages) {
      if (m.role !== "customer") continue;
      const idx = days.indexOf(m.created_at.slice(0, 10));
      const ch = channelOf.get(m.conversation_id);
      const row = idx >= 0 ? daily[idx] : undefined;
      if (row && ch) row[ch] = Number(row[ch] ?? 0) + 1;
    }

    const sourceCounts = new Map<string, number>();
    for (const m of aiMsgs) {
      for (const s of (Array.isArray(m.sources) ? m.sources : []) as MessageSource[]) {
        const key = `${s.type === "kb" ? "Baza" : "CRM"} · ${s.type === "crm" && s.label.startsWith("Buyurtma") ? "Buyurtma holati" : s.label}`;
        sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1);
      }
    }
    const topSources = [...sourceCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const byChannel = CHANNELS.map((ch) => ({ ch, n: conversations.filter((c) => c.channel === ch).length }));

    return {
      total,
      messages: messages.length,
      aiRate: total ? Math.round((aiOnly / total) * 100) : 0,
      handed,
      aiAvg: avg(aiMsgs),
      opAvg: avg(opMsgs),
      daily,
      topSources,
      byChannel,
    };
  }, [data]);

  const kpis = [
    { icon: MessagesSquare, label: "Suhbatlar (14 kun)", value: String(stats.total), hint: `${stats.messages} ta xabar` },
    { icon: Bot, label: "AI o'zi hal qilgan", value: `${stats.aiRate}%`, hint: `${stats.handed} ta operatorga uzatildi` },
    { icon: Clock, label: "AI o'rtacha javob vaqti", value: formatDuration(stats.aiAvg), hint: "mijoz xabaridan javobgacha" },
    { icon: Headset, label: "Operator o'rtacha javobi", value: formatDuration(stats.opAvg), hint: "inson operator" },
  ];

  const maxSource = stats.topSources[0]?.[1] ?? 1;

  return (
    <div>
      <PageHeader title="Tahlillar" description="So'nggi 14 kun: javob tezligi, AI samaradorligi va kanallar." />
      <div className="space-y-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-2xl border bg-card p-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <k.icon className="size-4" /> {k.label}
              </div>
              <div className="mt-2 font-display text-3xl font-bold">{k.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{k.hint}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="rounded-2xl border bg-card p-5">
            <h2 className="font-display text-lg font-semibold">Kunlik kiruvchi xabarlar</h2>
            <ChartContainer config={chartConfig} className="mt-4 h-72 w-full">
              <BarChart data={stats.daily}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} fontSize={11} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="telegram" stackId="a" fill="var(--color-telegram)" />
                <Bar dataKey="instagram" stackId="a" fill="var(--color-instagram)" />
                <Bar dataKey="whatsapp" stackId="a" fill="var(--color-whatsapp)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border bg-card p-5">
              <h2 className="font-display text-lg font-semibold">Kanallar ulushi</h2>
              <div className="mt-4 space-y-3">
                {stats.byChannel.map(({ ch, n }) => (
                  <div key={ch}>
                    <div className="flex justify-between text-sm">
                      <span>{CHANNEL_LABELS[ch]}</span>
                      <span className="font-medium">{n}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${ch === "telegram" ? "bg-telegram" : ch === "instagram" ? "bg-instagram" : "bg-whatsapp"}`}
                        style={{ width: `${stats.total ? (n / stats.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border bg-card p-5">
              <h2 className="font-display text-lg font-semibold">Eng ko'p ishlatilgan manbalar</h2>
              <div className="mt-4 space-y-2.5">
                {stats.topSources.map(([label, n]) => (
                  <div key={label} className="text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="truncate">{label}</span>
                      <span className="font-medium">{n}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${(n / maxSource) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
