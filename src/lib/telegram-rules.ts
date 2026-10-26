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
  hasOtherMedia: boolean;
};

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

  return {
    updateId: u.update_id,
    chatId: String(m.chat.id),
    contactName: name || (username ? `@${username}` : `Telegram ${m.chat.id}`),
    username,
    text: rawText === "/start" ? "Salom!" : rawText || null,
    voice: audio ? { fileId: audio.file_id, fileSize: audio.file_size ?? null, mime: audio.mime_type ?? null } : null,
    hasOtherMedia: Boolean(m.photo || m.document || m.sticker || m.video),
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
