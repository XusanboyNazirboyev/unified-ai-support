import { Instagram, MessageCircle, Send } from "lucide-react";

import { CHANNEL_LABELS, type Channel } from "@/lib/agent-rules";
import { cn } from "@/lib/utils";

const ICONS = { telegram: Send, instagram: Instagram, whatsapp: MessageCircle } as const;

const COLORS: Record<Channel, string> = {
  telegram: "bg-telegram/12 text-telegram",
  instagram: "bg-instagram/12 text-instagram",
  whatsapp: "bg-whatsapp/12 text-whatsapp",
};

export function ChannelIcon({ channel, className }: { channel: Channel; className?: string }) {
  const Icon = ICONS[channel];
  return <Icon className={cn("size-4", className)} aria-hidden />;
}

export function ChannelBadge({ channel, className }: { channel: Channel; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        COLORS[channel],
        className,
      )}
    >
      <ChannelIcon channel={channel} className="size-3" />
      {CHANNEL_LABELS[channel]}
    </span>
  );
}

export function ChannelDot({ channel }: { channel: Channel }) {
  return (
    <span
      className={cn(
        "absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full ring-2 ring-card",
        channel === "telegram" && "bg-telegram",
        channel === "instagram" && "bg-instagram",
        channel === "whatsapp" && "bg-whatsapp",
      )}
    >
      <ChannelIcon channel={channel} className="size-2.5 text-primary-foreground" />
    </span>
  );
}
