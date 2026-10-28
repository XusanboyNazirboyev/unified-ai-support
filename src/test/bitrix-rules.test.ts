import { describe, expect, it } from "vitest";

import {
  bitrixPhoneVariants,
  dealForAgent,
  dealNumberMatches,
  dealStageEntity,
  formatBitrixAmount,
  parseBitrixWebhook,
  parseDuplicateIds,
} from "@/lib/bitrix-rules";

describe("Bitrix24 webhook URL", () => {
  it("accepts a normal webhook and hides the secret from the portal address", () => {
    expect(parseBitrixWebhook("https://shop.bitrix24.kz/rest/1/abc123def456/")).toEqual({
      portal: "https://shop.bitrix24.kz",
      webhook: "https://shop.bitrix24.kz/rest/1/abc123def456/",
    });
  });
  it("ignores a method name pasted after the webhook", () => {
    expect(parseBitrixWebhook("https://crm.example.uz/rest/7/q1w2e3r4t5y6/profile.json")?.webhook).toBe(
      "https://crm.example.uz/rest/7/q1w2e3r4t5y6/",
    );
  });
  it("rejects http and plain portal addresses", () => {
    expect(parseBitrixWebhook("http://shop.bitrix24.kz/rest/1/abc123def456/")).toBeNull();
    expect(parseBitrixWebhook("https://shop.bitrix24.kz/")).toBeNull();
  });
});

describe("Bitrix24 phone search", () => {
  it("tries +998, 998 and local forms for an Uzbek number", () => {
    expect(bitrixPhoneVariants("90 123 45 67")).toEqual(["90 123 45 67", "+998901234567", "998901234567", "901234567"]);
  });
  it("reads duplicate search results, including the empty [] answer", () => {
    expect(parseDuplicateIds({ CONTACT: [12, 15] }, "CONTACT")).toEqual(["12", "15"]);
    expect(parseDuplicateIds([], "CONTACT")).toEqual([]);
  });
});

describe("Bitrix24 deals for the agent", () => {
  it("uses the pipeline's stage name and exact amount", () => {
    const deal = { ID: "120", STAGE_ID: "C2:PREPARATION", CATEGORY_ID: "2", OPPORTUNITY: "1200000.00", CURRENCY_ID: "UZS" };
    const view = dealForAgent(deal, [{ STATUS_ID: "C2:PREPARATION", NAME: "Hujjatlar tayyorlanmoqda", SEMANTICS: null }]);
    expect(view.stage).toBe("Hujjatlar tayyorlanmoqda");
    expect(view.state).toBe("jarayonda");
    expect(view.amount).toBe("1 200 000 so'm");
  });
  it("finds stage names of non-default pipelines", () => {
    expect(dealStageEntity("0")).toBe("DEAL_STAGE");
    expect(dealStageEntity("2")).toBe("DEAL_STAGE_2");
  });
  it("hides a zero amount instead of saying 0 so'm", () => {
    expect(formatBitrixAmount("0.00", "UZS")).toBeNull();
  });
  it("matches a typed deal number to the deal", () => {
    expect(dealNumberMatches("#120", "120")).toBe(true);
    expect(dealNumberMatches("12", "120")).toBe(false);
  });
});
