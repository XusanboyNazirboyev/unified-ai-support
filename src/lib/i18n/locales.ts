// Browser-safe language registry. To add a language: create messages/<code>.ts typed as Messages
// and add one entry to LOCALES — every screen picks it up automatically.
import { en } from "./messages/en";
import { ru } from "./messages/ru";
import { uz, type MessageKey, type Messages } from "./messages/uz";

export type { MessageKey, Messages };

export const LOCALES = [
  { code: "uz", label: "O'zbekcha", short: "UZ", messages: uz },
  { code: "ru", label: "Русский", short: "RU", messages: ru },
  { code: "en", label: "English", short: "EN", messages: en },
] as const satisfies readonly { code: string; label: string; short: string; messages: Messages }[];

export type Locale = (typeof LOCALES)[number]["code"];

export const DEFAULT_LOCALE: Locale = "uz";
export const LOCALE_STORAGE_KEY = "javobchi_lang";

/** Returns a supported locale code, falling back to Uzbek for anything unknown. */
export function resolveLocale(value: string | null | undefined): Locale {
  const code = (value ?? "").toLowerCase().split(/[-_]/)[0];
  return LOCALES.find((l) => l.code === code)?.code ?? DEFAULT_LOCALE;
}

export type TranslateParams = Record<string, string | number>;

/** Looks up a text in the chosen language (Uzbek if missing) and fills {placeholders}. */
export function translate(locale: Locale, key: MessageKey, params?: TranslateParams): string {
  const dict: Messages = LOCALES.find((l) => l.code === locale)?.messages ?? uz;
  const text = dict[key] || uz[key] || key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] !== undefined ? String(params[name]) : match,
  );
}

/** Order statuses are stored in Uzbek; this maps each stored value to its display text key. */
export const ORDER_STATUS_KEYS: Record<string, MessageKey> = {
  yangi: "order.new",
  "to'lov kutilmoqda": "order.awaitingPayment",
  tayyorlanmoqda: "order.preparing",
  "yo'lda": "order.onTheWay",
  yetkazildi: "order.delivered",
  "bekor qilindi": "order.cancelled",
};
