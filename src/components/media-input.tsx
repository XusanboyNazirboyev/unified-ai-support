import { useRef, useState } from "react";
import { Clapperboard, ImageIcon, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import { maxBytesFor, mediaKindFromFile, mediaNeedsConfirmation, type MediaMeta } from "@/lib/media";

export async function requestMediaAnalysis(file: File, caption = ""): Promise<MediaMeta> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("caption", caption);
  const response = await fetch("/api/media-analyze", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const json = (await response.json().catch(() => null)) as { meta?: MediaMeta; error?: string } | null;
  if (!response.ok || !json?.meta) throw new Error(json?.error ?? "");
  return json.meta;
}

/** Paperclip-style button: picks a photo/video, lets the AI look at it and hands back what it saw. */
export function MediaUploadButton({
  onAnalyzed,
  disabled,
  className,
}: {
  onAnalyzed: (meta: MediaMeta, file: File) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function process(file: File) {
    const type = mediaKindFromFile(file.type, file.name);
    if (!type) {
      toast.error(t("media.unsupported"));
      return;
    }
    if (file.size > maxBytesFor(type.kind)) {
      toast.error(t("media.tooLarge"));
      return;
    }
    setBusy(true);
    try {
      await onAnalyzed(await requestMediaAnalysis(file), file);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : t("media.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,.mov,.mp4"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void process(file);
        }}
      />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={className}
        disabled={disabled || busy}
        onClick={() => fileRef.current?.click()}
        aria-label={t("media.upload")}
        title={busy ? t("media.analyzing") : t("media.uploadTitle")}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
      </Button>
    </>
  );
}

/** What the AI saw in a customer's photo/video: kind, product and certainty, then the description. */
export function MediaSummary({ meta, previewUrl, className }: { meta: MediaMeta; previewUrl?: string | null; className?: string }) {
  const { t } = useI18n();
  const warn = mediaNeedsConfirmation(meta);
  const Icon = meta.kind === "video" ? Clapperboard : ImageIcon;
  return (
    <div className={cn("space-y-1", className)}>
      {previewUrl &&
        (meta.kind === "video" ? (
          <video src={previewUrl} controls className="max-h-48 rounded-lg" />
        ) : (
          <img src={previewUrl} alt={meta.product ?? meta.description} className="max-h-48 rounded-lg object-contain" />
        ))}
      <span className={cn("inline-flex flex-wrap items-center gap-1 text-[10px] font-medium", warn ? "text-warning-foreground" : "opacity-80")}>
        <Icon className="size-3" /> {meta.kind === "video" ? t("media.video") : t("media.photo")}
        {" · "}
        {meta.product ? t("media.product", { name: meta.product }) : t("media.noProduct")}
        {" · "}
        {warn ? t("media.needsConfirm") : t(`media.conf.${meta.confidence}` as const)}
      </span>
      <p className="text-xs opacity-90">{meta.description}</p>
      {meta.speech && <p className="text-xs italic opacity-80">{t("media.speech", { text: meta.speech })}</p>}
    </div>
  );
}
