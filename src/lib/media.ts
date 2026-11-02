// Browser-safe rules for customer photos and videos, shared by the upload UI, the analysis route, the agent and tests.

import { VOICE_LANGUAGES, type VoiceLanguage } from "@/lib/voice";

export type MediaKind = "photo" | "video";
export type MediaConfidence = "high" | "medium" | "low";

/** What the vision model saw. Stored with the message; the agent reads it through formatMediaForAgent. */
export type MediaMeta = {
  kind: MediaKind;
  description: string;
  product: string | null;
  visible_text: string[];
  speech: string | null;
  language: VoiceLanguage;
  confidence: MediaConfidence;
};

/** Photos are sent inline to the model; Telegram bots can download files up to 20 MB. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 20 * 1024 * 1024;

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/3gpp", "video/mpeg"];

/** Decides whether an uploaded file is a supported photo or video, from its MIME type or name. */
export function mediaKindFromFile(mime: string, name = ""): { kind: MediaKind; mime: string } | null {
  const type = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  if (PHOTO_TYPES.includes(type)) return { kind: "photo", mime: type };
  if (VIDEO_TYPES.includes(type)) return { kind: "video", mime: type };
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "jpg" || ext === "jpeg") return { kind: "photo", mime: "image/jpeg" };
  if (ext === "png") return { kind: "photo", mime: "image/png" };
  if (ext === "webp") return { kind: "photo", mime: "image/webp" };
  if (ext === "mp4" || ext === "m4v") return { kind: "video", mime: "video/mp4" };
  if (ext === "mov") return { kind: "video", mime: "video/quicktime" };
  if (ext === "webm") return { kind: "video", mime: "video/webm" };
  return null;
}

export function maxBytesFor(kind: MediaKind): number {
  return kind === "photo" ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES;
}

/** The agent must ask the customer to confirm the product before quoting a price for it. */
export function mediaNeedsConfirmation(meta: MediaMeta): boolean {
  return meta.confidence !== "high" || !meta.product;
}

const CONF_UZ: Record<MediaConfidence, string> = { high: "aniq", medium: "o'rtacha", low: "past" };

/** Text the agent sees for a photo/video: what was visible, the product guess and how sure it is, then the caption. */
export function formatMediaForAgent(caption: string, meta: MediaMeta | null): string {
  const label = meta?.kind === "video" ? "Video" : "Rasm";
  if (!meta) return `[${label} — AI ko'ra olmadi]\n${caption}`.trim();
  const head = [`aniqlik: ${CONF_UZ[meta.confidence]}`];
  if (mediaNeedsConfirmation(meta)) head.push("TASDIQLASH KERAK");
  const lines = [
    `[${label} — AI ko'rib chiqdi; ${head.join("; ")}]`,
    `Ko'rinishi: ${meta.description}`,
    `Mahsulot: ${meta.product ?? "aniqlanmadi"}`,
  ];
  if (meta.visible_text.length) lines.push(`Ko'rinib turgan yozuvlar: ${meta.visible_text.join("; ")}`);
  if (meta.speech) lines.push(`Videodagi gap: ${meta.speech}`);
  if (caption.trim()) lines.push(`Mijoz yozgan izoh: ${caption.trim()}`);
  return lines.join("\n");
}

/** Short line for chat lists: the caption, or what the photo/video shows. */
export function mediaPreview(caption: string, meta: MediaMeta | null): string {
  const icon = meta?.kind === "video" ? "🎬" : "📷";
  return `${icon} ${caption.trim() || meta?.product || meta?.description || ""}`.trim();
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Safely reads media metadata stored as JSON; returns null for anything malformed. */
export function parseMediaMeta(value: unknown): MediaMeta | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const kind = v["kind"] === "photo" || v["kind"] === "video" ? v["kind"] : null;
  const confidence = ["high", "medium", "low"].includes(v["confidence"] as string) ? (v["confidence"] as MediaConfidence) : null;
  const description = str(v["description"]);
  if (!kind || !confidence || !description) return null;
  const language = VOICE_LANGUAGES.includes(v["language"] as VoiceLanguage) ? (v["language"] as VoiceLanguage) : "unknown";
  return {
    kind,
    description: description.slice(0, 1000),
    product: str(v["product"])?.slice(0, 200) ?? null,
    visible_text: Array.isArray(v["visible_text"])
      ? (v["visible_text"] as unknown[]).map(str).filter((t): t is string => !!t).slice(0, 20).map((t) => t.slice(0, 200))
      : [],
    speech: str(v["speech"])?.slice(0, 2000) ?? null,
    language,
    confidence,
  };
}
