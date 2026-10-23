import { describe, expect, it } from "vitest";

import { LOCALES, resolveLocale, translate } from "@/lib/i18n/locales";
import { uz } from "@/lib/i18n/messages/uz";

const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join(",");

describe("interface languages", () => {
  it("offers Uzbek, Russian and English", () => {
    expect(LOCALES.map((l) => l.code)).toEqual(["uz", "ru", "en"]);
  });

  it("defaults to Uzbek for an unknown or missing choice", () => {
    expect(resolveLocale("de")).toBe("uz");
    expect(resolveLocale(null)).toBe("uz");
  });

  it("accepts browser-style codes like ru-RU", () => {
    expect(resolveLocale("ru-RU")).toBe("ru");
  });

  it("every language translates every text with the same placeholders", () => {
    for (const locale of LOCALES) {
      for (const key of Object.keys(uz) as (keyof typeof uz)[]) {
        const text = locale.messages[key];
        expect(text, `${locale.code}: ${key}`).toBeTruthy();
        expect(placeholders(text), `${locale.code}: ${key}`).toBe(placeholders(uz[key]));
      }
    }
  });

  it("fills placeholders", () => {
    expect(translate("ru", "crm.ordersTab", { n: 5 })).toBe("Заказы (5)");
    expect(translate("en", "inbox.waiting", { n: 2 })).toBe("2 waiting for an operator");
  });
});
