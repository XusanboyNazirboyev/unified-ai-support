import { splitTelegramText } from "@/lib/telegram-rules";

const API = "https://api.telegram.org";

export class TelegramError extends Error {
  constructor(
    message: string,
    public code: number,
  ) {
    super(message);
  }
}

export async function tgCall<T = unknown>(token: string, method: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => null)) as
    | { ok: true; result: T }
    | { ok: false; error_code?: number; description?: string }
    | null;
  if (!json || !json.ok) {
    const code = json && !json.ok ? (json.error_code ?? response.status) : response.status;
    const description = json && !json.ok ? (json.description ?? "") : "";
    throw new TelegramError(`Telegram ${method} [${code}]: ${description}`, code);
  }
  return json.result;
}

export async function sendTelegramText(token: string, chatId: string, text: string) {
  for (const part of splitTelegramText(text)) {
    await tgCall(token, "sendMessage", { chat_id: chatId, text: part });
  }
}

/** Downloads a Telegram file (voice note) with a hard size limit. */
export async function downloadTelegramFile(token: string, fileId: string, maxBytes: number): Promise<Uint8Array> {
  const file = await tgCall<{ file_path?: string; file_size?: number }>(token, "getFile", { file_id: fileId });
  if (!file.file_path) throw new TelegramError("Telegram fayl yo'li qaytarmadi", 400);
  if (file.file_size && file.file_size > maxBytes) throw new TelegramError("Fayl juda katta", 413);
  const response = await fetch(`${API}/file/bot${token}/${file.file_path}`);
  if (!response.ok || !response.body) throw new TelegramError(`Faylni yuklab bo'lmadi [${response.status}]`, response.status);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new TelegramError("Fayl juda katta", 413);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

export function randomSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
