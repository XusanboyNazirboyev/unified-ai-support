import { describe, expect, it } from "vitest";

import {
  detectHandoverKeyword,
  isHandoverAllowed,
  phonesMatch,
  normalizeOrderNumber,
  rankKbArticles,
} from "@/lib/agent-rules";

describe("handover keywords", () => {
  const keywords = ["operator", "odam bilan", "menejer"];

  it("hands over when the customer asks for an operator", () => {
    expect(detectHandoverKeyword("Operator bilan gaplashmoqchiman", keywords)).toBe("operator");
  });

  it("does not hand over for a normal question", () => {
    expect(detectHandoverKeyword("Yetkazib berish necha kun?", keywords)).toBeNull();
  });
});

describe("customer verification", () => {
  it("matches a phone written with or without +998", () => {
    expect(phonesMatch("+998 90 123 45 67", "901234567")).toBe(true);
  });

  it("rejects a different phone", () => {
    expect(phonesMatch("+998901234567", "+998935556677")).toBe(false);
  });

  it("normalizes order numbers like '#tm-1042'", () => {
    expect(normalizeOrderNumber("#tm-1042")).toBe("TM-1042");
  });
});

describe("knowledge base search", () => {
  const articles = [
    { id: "1", title: "Yetkazib berish shartlari", category: "faq", content: "Toshkent bo'ylab 1 kun ichida." },
    { id: "2", title: "To'lov usullari", category: "faq", content: "Click, Payme, Uzum Nasiya." },
  ];

  it("finds the delivery article for a delivery question", () => {
    expect(rankKbArticles("Yetkazib berish qancha vaqt oladi?", articles)[0]?.id).toBe("1");
  });

  it("finds the payment article for a Payme question", () => {
    expect(rankKbArticles("Payme orqali to'lasam bo'ladimi", articles)[0]?.id).toBe("2");
  });
});

describe("operator handover", () => {
  it("does not transfer just because the answer is missing", () => {
    expect(isHandoverAllowed("info_missing")).toBe(false);
  });

  it("transfers when the customer asks for a person", () => {
    expect(isHandoverAllowed("customer_asked")).toBe(true);
  });

  it("transfers when the customer accepts the operator offer", () => {
    expect(isHandoverAllowed("customer_agreed")).toBe(true);
  });

  it("transfers on a complaint", () => {
    expect(isHandoverAllowed("complaint")).toBe(true);
  });
});
