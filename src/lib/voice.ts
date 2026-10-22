// Browser-safe voice-message rules shared by the recorder UI, the transcription route, the agent and tests.

export const VOICE_LANGUAGES = ["uz", "kaa", "ru", "kk", "tg", "en", "mixed", "unknown"] as const;
export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<VoiceLanguage, string> = {
  uz: "O'zbek",
  kaa: "Qoraqalpoq",
  ru: "Rus",
  kk: "Qozoq",
  tg: "Tojik",
  en: "Ingliz",
  mixed: "Aralash",
  unknown: "Noma'lum",
};

export type VoiceConfidence = "high" | "medium" | "low";

export const CONFIDENCE_LABELS: Record<VoiceConfidence, string> = {
  high: "aniq",
  medium: "o'rtacha",
  low: "past",
};

export type VoiceMeta = {
  language: VoiceLanguage;
  dialect: string | null;
  confidence: VoiceConfidence;
  unclear_parts: string[];
};

export type VoiceTranscript = { transcript: string; meta: VoiceMeta };

/** Largest audio file accepted for transcription (inline audio is sent base64 to the model). */
export const MAX_VOICE_BYTES = 10 * 1024 * 1024;
/** Recordings auto-stop after this many seconds. */
export const MAX_VOICE_SECONDS = 180;

export type AudioFormat = "wav" | "mp3" | "webm" | "m4a" | "ogg" | "aac" | "flac";

/** Maps an uploaded file's MIME type / name to the container format the model expects. */
export function audioFormatFromFile(mime: string, name = ""): AudioFormat | null {
  const type = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (type === "audio/wav" || type === "audio/x-wav" || type === "audio/wave" || ext === "wav") return "wav";
  if (type === "audio/mpeg" || type === "audio/mp3" || ext === "mp3") return "mp3";
  if (type === "audio/ogg" || type === "audio/opus" || ext === "ogg" || ext === "oga" || ext === "opus") return "ogg";
  if (type === "audio/webm" || type === "video/webm" || ext === "webm") return "webm";
  if (type === "audio/mp4" || type === "audio/x-m4a" || type === "audio/m4a" || ext === "m4a" || ext === "mp4") return "m4a";
  if (type === "audio/aac" || ext === "aac") return "aac";
  if (type === "audio/flac" || type === "audio/x-flac" || ext === "flac") return "flac";
  return null;
}

/** A voice transcript must be confirmed with the customer before it is acted on. */
export function voiceNeedsConfirmation(meta: VoiceMeta): boolean {
  return meta.confidence === "low" || meta.unclear_parts.length > 0 || meta.language === "unknown";
}

/** Text the agent sees for a voice message: a marker with language and certainty, then the transcript. */
export function formatVoiceForAgent(transcript: string, meta: VoiceMeta | null): string {
  if (!meta) return `[Ovozli xabar — avtomatik transkript]\n${transcript}`;
  const parts = [
    `til: ${LANGUAGE_LABELS[meta.language]}${meta.dialect ? ` (${meta.dialect})` : ""}`,
    `aniqlik: ${CONFIDENCE_LABELS[meta.confidence]}`,
  ];
  if (meta.unclear_parts.length > 0) parts.push(`noaniq joylar: ${meta.unclear_parts.join("; ")}`);
  if (voiceNeedsConfirmation(meta)) parts.push("TASDIQLASH KERAK");
  return `[Ovozli xabar — avtomatik transkript; ${parts.join("; ")}]\n${transcript}`;
}

/** Safely reads voice metadata stored as JSON; returns null for anything malformed. */
export function parseVoiceMeta(value: unknown): VoiceMeta | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const language = VOICE_LANGUAGES.includes(v["language"] as VoiceLanguage) ? (v["language"] as VoiceLanguage) : null;
  const confidence = ["high", "medium", "low"].includes(v["confidence"] as string)
    ? (v["confidence"] as VoiceConfidence)
    : null;
  if (!language || !confidence) return null;
  return {
    language,
    confidence,
    dialect: typeof v["dialect"] === "string" && v["dialect"] ? (v["dialect"] as string) : null,
    unclear_parts: Array.isArray(v["unclear_parts"])
      ? (v["unclear_parts"] as unknown[]).filter((p): p is string => typeof p === "string")
      : [],
  };
}
