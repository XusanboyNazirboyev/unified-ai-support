// Pure, browser-safe business rules shared by the AI agent, the inbox and tests.

export type Channel = "telegram" | "instagram" | "whatsapp";

export const CHANNELS: Channel[] = ["telegram", "instagram", "whatsapp"];

export const CHANNEL_LABELS: Record<Channel, string> = {
  telegram: "Telegram",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
};

export const KB_CATEGORIES = [
  { value: "faq", label: "FAQ" },
  { value: "narxlar", label: "Narxlar" },
  { value: "qoidalar", label: "Qoidalar" },
  { value: "hujjat", label: "Hujjatlar" },
] as const;

export const ORDER_STATUSES = [
  "yangi",
  "to'lov kutilmoqda",
  "tayyorlanmoqda",
  "yo'lda",
  "yetkazildi",
  "bekor qilindi",
] as const;

/** Lowercase and unify the many apostrophe variants used in Uzbek Latin text. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ʻʼ‘’`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns the first handover keyword found in the customer's message, or null.
 * Matching is case-insensitive and apostrophe-insensitive.
 */
export function detectHandoverKeyword(message: string, keywords: string[]): string | null {
  const text = normalizeText(message);
  for (const raw of keywords) {
    const keyword = normalizeText(raw);
    if (keyword.length > 0 && text.includes(keyword)) return raw;
  }
  return null;
}

/** Keeps only digits and compares the last 9 digits (Uzbek numbers without +998). */
export function normalizePhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.slice(-9);
}

export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  return na.length === 9 && na === nb;
}

export function normalizeOrderNumber(value: string | null | undefined): string {
  return (value ?? "").toUpperCase().replace(/\s+/g, "").replace(/^#/, "");
}

export type KbArticleLite = { id: string; title: string; category: string; content: string };

const STOP_WORDS = new Set([
  "va", "bilan", "uchun", "qanday", "qancha", "bormi", "mi", "bu", "u", "men", "siz", "sizlar",
  "the", "and", "for", "what", "how", "is", "are", "bo'ladimi", "kerak", "nima", "qachon",
]);

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/[^a-zа-яё0-9'ʻ]+/i)
    .map((t) => t.replace(/^'+|'+$/g, ""))
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

/**
 * Ranks knowledge-base articles by keyword overlap with the query.
 * Title matches weigh 3x; tokens also match by 4-letter prefix to tolerate Uzbek suffixes
 * (e.g. "yetkazib" ~ "yetkazish").
 */
export function rankKbArticles<T extends KbArticleLite>(query: string, articles: T[], limit = 3): T[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const scored = articles.map((article) => {
    const titleTokens = tokenize(article.title);
    const bodyTokens = tokenize(article.content);
    let score = 0;
    for (const token of tokens) {
      const prefix = token.slice(0, Math.min(5, token.length));
      if (titleTokens.some((t) => t === token || t.startsWith(prefix))) score += 3;
      if (bodyTokens.some((t) => t === token)) score += 2;
      else if (bodyTokens.some((t) => t.startsWith(prefix))) score += 1;
    }
    return { article, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.article);
}

export function formatSum(value: number | string, currency = "UZS"): string {
  const n = typeof value === "string" ? Number(value) : value;
  const formatted = Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return currency === "UZS" ? `${formatted} so'm` : `${formatted} ${currency}`;
}

export type MessageSource = { type: "kb" | "crm" | "instagram"; label: string };

/**
 * Why the agent wants to transfer a chat to a human.
 * - customer_asked: the customer explicitly asked for a person / operator
 * - customer_agreed: the agent offered an operator and the customer said yes
 * - complaint: complaint, defect, refund dispute or an upset customer
 * - info_missing: the agent simply could not find the answer
 */
export const HANDOVER_KINDS = ["customer_asked", "customer_agreed", "complaint", "info_missing"] as const;
export type HandoverKind = (typeof HANDOVER_KINDS)[number];

/**
 * The agent answers as much as it can itself: missing information alone never transfers the chat.
 * It must first share what it knows and offer an operator; the transfer happens once the customer agrees.
 */
export function isHandoverAllowed(kind: HandoverKind): boolean {
  return kind !== "info_missing";
}
