// Pure Telegram helpers (no I/O) so they can be unit-tested.

/** Telegram bot tokens look like "123456789:AA...". */
export function isValidBotToken(token: string): boolean {
  return /^\d{5,15}:[A-Za-z0-9_-]{30,60}$/.test(token.trim());
}

/**
 * Telegram must reach the webhook without a login wall. The editor preview host
 * (id-preview--<id>.<host>) is auth-protected, so it is mapped to the public dev host
 * (project--<id>-dev.<host>). Other https origins (published site, custom domain) are used as is.
 * Returns null when the origin cannot be reached by Telegram (http, localhost).
 */
export function publicWebhookBase(origin: string): string | null {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const preview = url.hostname.match(/^id-preview--([a-z0-9-]+)\.(.+)$/i);
  if (preview) return `https://project--${preview[1]}-dev.${preview[2]}`;
  return `https://${url.host}`;
}

export const TELEGRAM_WEBHOOK_PATH = "/api/public/telegram/webhook";

export type TelegramIncoming = {
  updateId: number;
  chatId: string;
  contactName: string;
  username: string | null;
  text: string | null;
  voice: { fileId: string; fileSize: number | null; mime: string | null } | null;
  /** Photo or video the customer sent (largest photo size that fits the download limit). */
  media: { kind: "photo" | "video"; fileId: string; fileSize: number | null; mime: string } | null;
  hasOtherMedia: boolean;
};

type TgFile = { file_id: string; file_size?: number; mime_type?: string };
type TgPhotoSize = TgFile & { width?: number; height?: number };

const PHOTO_LIMIT = 10 * 1024 * 1024;

function pickMedia(m: TgMessage): TelegramIncoming["media"] {
  if (Array.isArray(m.photo) && m.photo.length > 0) {
    const sizes = (m.photo as TgPhotoSize[]).filter((p) => p && typeof p.file_id === "string");
    const fitting = sizes.filter((p) => !p.file_size || p.file_size <= PHOTO_LIMIT);
    const best = (fitting.length ? fitting : sizes).at(-1);
    if (best) return { kind: "photo", fileId: best.file_id, fileSize: best.file_size ?? null, mime: "image/jpeg" };
  }
  const video = (m.video ?? m.video_note ?? m.animation) as TgFile | undefined;
  if (video && typeof video.file_id === "string") {
    return { kind: "video", fileId: video.file_id, fileSize: video.file_size ?? null, mime: video.mime_type ?? "video/mp4" };
  }
  const doc = m.document as TgFile | undefined;
  const docMime = doc?.mime_type?.toLowerCase() ?? "";
  if (doc && typeof doc.file_id === "string" && /^image\/(jpeg|png|webp)$/.test(docMime)) {
    return { kind: "photo", fileId: doc.file_id, fileSize: doc.file_size ?? null, mime: docMime };
  }
  if (doc && typeof doc.file_id === "string" && /^video\/(mp4|quicktime|webm)$/.test(docMime)) {
    return { kind: "video", fileId: doc.file_id, fileSize: doc.file_size ?? null, mime: docMime };
  }
  return null;
}

type TgUser = { first_name?: string; last_name?: string; username?: string };
type TgMessage = {
  chat?: { id?: number; type?: string; first_name?: string; last_name?: string; username?: string; title?: string };
  from?: TgUser;
  text?: string;
  caption?: string;
  voice?: { file_id: string; file_size?: number; mime_type?: string };
  audio?: { file_id: string; file_size?: number; mime_type?: string };
  photo?: unknown[];
  document?: unknown;
  sticker?: unknown;
  video?: unknown;
  video_note?: unknown;
  animation?: unknown;
};

/** Extracts what the inbox needs from a Telegram update. Only private chats are handled. */
export function parseTelegramUpdate(update: unknown): TelegramIncoming | null {
  if (typeof update !== "object" || update === null) return null;
  const u = update as { update_id?: unknown; message?: TgMessage };
  if (typeof u.update_id !== "number" || !u.message) return null;
  const m = u.message;
  if (typeof m.chat?.id !== "number" || m.chat.type !== "private") return null;

  const person = m.from ?? m.chat;
  const name = [person.first_name, person.last_name].filter(Boolean).join(" ").trim();
  const username = person.username ?? null;
  const rawText = (m.text ?? m.caption ?? "").trim();
  const audio = m.voice ?? m.audio ?? null;
  const media = pickMedia(m);

  return {
    updateId: u.update_id,
    chatId: String(m.chat.id),
    contactName: name || (username ? `@${username}` : `Telegram ${m.chat.id}`),
    username,
    text: rawText === "/start" ? "Salom!" : rawText || null,
    voice: audio ? { fileId: audio.file_id, fileSize: audio.file_size ?? null, mime: audio.mime_type ?? null } : null,
    media,
    hasOtherMedia: !media && Boolean(m.photo || m.document || m.sticker || m.video || m.video_note || m.animation),
  };
}

/** Telegram limits messages to 4096 characters. */
export function splitTelegramText(text: string, limit = 4096): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit);
    if (cut < limit / 2) cut = rest.lastIndexOf(" ", limit);
    if (cut < limit / 2) cut = limit;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}
