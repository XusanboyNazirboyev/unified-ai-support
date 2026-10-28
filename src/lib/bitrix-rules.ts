// Pure helpers for the Bitrix24 CRM integration (no I/O, unit-tested).

/**
 * Parses a Bitrix24 incoming-webhook URL such as
 * "https://shop.bitrix24.kz/rest/1/abc123def456/" (a trailing method like "profile.json" is ignored).
 * Returns the portal origin (safe to show) and the canonical webhook base (secret), or null.
 */
export function parseBitrixWebhook(input: string): { portal: string; webhook: string } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const m = url.pathname.match(/^\/rest\/(\d+)\/([A-Za-z0-9]{8,64})(?:\/|$)/);
  if (!m) return null;
  return { portal: `https://${url.host}`, webhook: `https://${url.host}/rest/${m[1]}/${m[2]}/` };
}

/** Phone spellings to try in Bitrix24 duplicate search (Uzbek numbers get +998 / 998 / 9-digit forms). */
export function bitrixPhoneVariants(phone: string): string[] {
  const raw = phone.trim();
  const digits = raw.replace(/\D/g, "");
  const out = new Set<string>();
  if (raw) out.add(raw);
  if (digits.length === 9) {
    out.add(`+998${digits}`);
    out.add(`998${digits}`);
    out.add(digits);
  } else if (digits.length === 12 && digits.startsWith("998")) {
    out.add(`+${digits}`);
    out.add(digits);
    out.add(digits.slice(3));
  } else if (digits.length >= 7) {
    out.add(`+${digits}`);
    out.add(digits);
  }
  return [...out];
}

/** True when the phone has enough digits to be a real number. */
export function isUsablePhone(phone: string): boolean {
  return phone.replace(/\D/g, "").length >= 9;
}

/** Bitrix24 returns `{ CONTACT: [ids] }` or `[]` when nothing matched. */
export function parseDuplicateIds(result: unknown, entity: "CONTACT" | "LEAD"): string[] {
  if (!result || typeof result !== "object" || Array.isArray(result)) return [];
  const ids = (result as Record<string, unknown>)[entity];
  return Array.isArray(ids) ? ids.map((id) => String(id)) : [];
}

export type BitrixStage = { STATUS_ID: string; NAME: string; SEMANTICS?: string | null };
export type BitrixDeal = {
  ID: string;
  TITLE?: string | null;
  STAGE_ID?: string | null;
  CATEGORY_ID?: string | null;
  OPPORTUNITY?: string | number | null;
  CURRENCY_ID?: string | null;
  CLOSEDATE?: string | null;
  DATE_CREATE?: string | null;
  CLOSED?: string | null;
};
export type BitrixLead = {
  ID: string;
  TITLE?: string | null;
  STATUS_ID?: string | null;
  STATUS_SEMANTIC_ID?: string | null;
  OPPORTUNITY?: string | number | null;
  CURRENCY_ID?: string | null;
  DATE_CREATE?: string | null;
};

/** The status-list entity that holds the stage names of a deal pipeline. */
export function dealStageEntity(categoryId: string | null | undefined): string {
  const id = String(categoryId ?? "0");
  return id === "0" || id === "" ? "DEAL_STAGE" : `DEAL_STAGE_${id}`;
}

export function stageState(semantics: string | null | undefined): string {
  if (semantics === "S") return "muvaffaqiyatli yakunlangan";
  if (semantics === "F") return "yopilgan (bekor qilingan)";
  return "jarayonda";
}

export function formatBitrixAmount(amount: string | number | null | undefined, currency: string | null | undefined): string | null {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  const text = Math.round(n).toLocaleString("en-US").replace(/,/g, " ");
  const cur = (currency ?? "UZS").toUpperCase();
  return cur === "UZS" ? `${text} so'm` : `${text} ${cur}`;
}

const day = (v: string | null | undefined) => (v ? v.slice(0, 10) : null);

/** Agent-ready view of a deal: real stage name from the pipeline, exact amount and dates. */
export function dealForAgent(deal: BitrixDeal, stages: BitrixStage[]) {
  const stage = stages.find((s) => s.STATUS_ID === deal.STAGE_ID);
  return {
    deal_number: deal.ID,
    title: deal.TITLE ?? null,
    stage: stage?.NAME ?? deal.STAGE_ID ?? null,
    state: stageState(stage?.SEMANTICS ?? (deal.CLOSED === "Y" ? "F" : null)),
    amount: formatBitrixAmount(deal.OPPORTUNITY, deal.CURRENCY_ID),
    close_date: day(deal.CLOSEDATE),
    created: day(deal.DATE_CREATE),
  };
}

/** Agent-ready view of a lead (application): only its status and dates. */
export function leadForAgent(lead: BitrixLead, statuses: BitrixStage[]) {
  const status = statuses.find((s) => s.STATUS_ID === lead.STATUS_ID);
  return {
    application_number: lead.ID,
    title: lead.TITLE ?? null,
    status: status?.NAME ?? lead.STATUS_ID ?? null,
    state: stageState(status?.SEMANTICS ?? lead.STATUS_SEMANTIC_ID ?? null),
    created: day(lead.DATE_CREATE),
  };
}

export function personName(p: { NAME?: string | null; SECOND_NAME?: string | null; LAST_NAME?: string | null }): string {
  return [p.NAME, p.LAST_NAME].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
}

/** Deal number the customer typed ("#120", "120", "D-120") matches a Bitrix deal ID. */
export function dealNumberMatches(typed: string | null | undefined, dealId: string): boolean {
  const digits = (typed ?? "").replace(/\D/g, "");
  return digits.length > 0 && digits.replace(/^0+/, "") === dealId.replace(/^0+/, "");
}
