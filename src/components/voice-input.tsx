import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import {
  MAX_VOICE_BYTES,
  MAX_VOICE_SECONDS,
  voiceNeedsConfirmation,
  type VoiceMeta,
  type VoiceTranscript,
} from "@/lib/voice";
import { recordWav, type WavRecording } from "@/lib/voice-recorder";

class TooLargeError extends Error {}

export async function requestTranscription(file: File): Promise<VoiceTranscript> {
  if (file.size > MAX_VOICE_BYTES) throw new TooLargeError("too_large");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const form = new FormData();
  form.append("file", file, file.name);
  const response = await fetch("/api/voice-transcribe", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const json = (await response.json().catch(() => null)) as (VoiceTranscript & { error?: string }) | null;
  if (!response.ok || !json || json.error) throw new Error(json?.error ?? "");
  return json;
}

function mmss(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Mic button: records, transcribes and hands back the transcript with its language and certainty. */
export function VoiceRecordButton({
  onTranscribed,
  disabled,
  allowUpload = false,
  className,
}: {
  onTranscribed: (result: VoiceTranscript) => void | Promise<void>;
  disabled?: boolean;
  allowUpload?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [seconds, setSeconds] = useState(0);
  const recRef = useRef<WavRecording | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      recRef.current?.cancel();
    },
    [],
  );

  async function process(file: File) {
    setState("transcribing");
    try {
      await onTranscribed(await requestTranscription(file));
    } catch (e) {
      if (e instanceof TooLargeError) toast.error(t("voice.tooLarge"));
      else toast.error(e instanceof Error && e.message ? e.message : t("voice.failed"));
    } finally {
      setState("idle");
    }
  }

  async function start() {
    try {
      recRef.current = await recordWav();
    } catch {
      toast.error(t("voice.micDenied"));
      return;
    }
    setSeconds(0);
    setState("recording");
    timerRef.current = window.setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_VOICE_SECONDS) void stop();
        return s + 1;
      });
    }, 1000);
  }

  async function stop() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    const rec = recRef.current;
    recRef.current = null;
    if (!rec) return;
    try {
      await process(await rec.stop());
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : t("voice.recordFailed"));
      setState("idle");
    }
  }

  function cancel() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    recRef.current?.cancel();
    recRef.current = null;
    setState("idle");
  }

  if (state === "recording") {
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        <span className="flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
          <span className="size-2 animate-pulse rounded-full bg-destructive" />
          {mmss(seconds)}
        </span>
        <Button type="button" size="icon" variant="ghost" onClick={cancel} aria-label={t("voice.cancel")}>
          <X className="size-4" />
        </Button>
        <Button type="button" size="icon" variant="destructive" onClick={() => void stop()} aria-label={t("voice.send")}>
          <Square className="size-3.5 fill-current" />
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {allowUpload && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.ogg,.opus,.m4a,.mp3,.wav,.webm"
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
            disabled={disabled || state !== "idle"}
            onClick={() => fileRef.current?.click()}
            aria-label={t("voice.upload")}
            title={t("voice.uploadTitle")}
          >
            <Upload className="size-4" />
          </Button>
        </>
      )}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled={disabled || state !== "idle"}
        onClick={() => void start()}
        aria-label={t("voice.record")}
        title={t("voice.record")}
      >
        {state === "transcribing" ? <Loader2 className="size-4 animate-spin" /> : <Mic className="size-4" />}
      </Button>
    </div>
  );
}

/** Small label under a voice message: language, dialect and how sure the transcription is. */
export function VoiceBadge({ meta, className }: { meta: VoiceMeta | null; className?: string }) {
  const { t } = useI18n();
  const warn = meta ? voiceNeedsConfirmation(meta) : false;
  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center gap-1 text-[10px] font-medium",
        warn ? "text-warning-foreground" : "opacity-80",
        className,
      )}
      title={meta?.unclear_parts.length ? t("voice.unclear", { parts: meta.unclear_parts.join(", ") }) : undefined}
    >
      <Mic className="size-3" /> {t("voice.badge")}
      {meta && (
        <>
          {" · "}
          {t(`voice.lang.${meta.language}` as const)}
          {meta.dialect ? ` (${meta.dialect})` : ""}
          {" · "}
          {warn ? t("voice.needsConfirm") : t(`voice.conf.${meta.confidence}` as const)}
        </>
      )}
    </span>
  );
}
