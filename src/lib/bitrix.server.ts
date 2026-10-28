import {
  bitrixPhoneVariants,
  dealForAgent,
  dealStageEntity,
  leadForAgent,
  parseDuplicateIds,
  personName,
  type BitrixDeal,
  type BitrixLead,
  type BitrixStage,
} from "@/lib/bitrix-rules";

export class BitrixError extends Error {
  constructor(
    message: string,
    public kind: "unreachable" | "unauthorized" | "no_crm_access" | "bad_response",
  ) {
    super(message);
  }
}

/** Calls one Bitrix24 REST method through the workspace's incoming webhook. */
export async function callBitrix<T = unknown>(webhook: string, method: string, params: Record<string, unknown> = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${webhook}${method}.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    throw new BitrixError(`Bitrix24 ga ulanib bo'lmadi: ${e instanceof Error ? e.message : ""}`, "unreachable");
  }
  const text = await response.text();
  let json: { result?: unknown; error?: string; error_description?: string } | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  const code = json?.error ?? "";
  if (code === "insufficient_scope" || code === "ERROR_METHOD_NOT_FOUND") {
    throw new BitrixError(`Bitrix24 ${method}: ${code}`, "no_crm_access");
  }
  if (response.status === 401 || response.status === 403 || code === "INVALID_CREDENTIALS" || code === "invalid_token") {
    throw new BitrixError(`Bitrix24 webhookni qabul qilmadi [${response.status}] ${code}`, "unauthorized");
  }
  if (!response.ok || !json || code) {
    throw new BitrixError(
      `Bitrix24 xatosi [${response.status}] ${method}: ${code} ${json?.error_description ?? text.slice(0, 200)}`,
      "bad_response",
    );
  }
  return json.result as T;
}

/** Checks the webhook can read CRM data; returns contact and deal counts. */
export async function verifyBitrix(webhook: string) {
  const [contacts, deals] = await Promise.all([
    fetch(`${webhook}crm.contact.list.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ select: ["ID"] }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => null),
    callBitrix<unknown[]>(webhook, "crm.deal.list", { select: ["ID"] }),
  ]);
  void contacts;
  // Second call reads the `total` field that `result` alone hides.
  const totals = await Promise.all(
    ["crm.contact.list", "crm.deal.list"].map(async (m) => {
      const r = await fetch(`${webhook}${m}.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ select: ["ID"] }),
        signal: AbortSignal.timeout(8000),
      });
      const j = (await r.json().catch(() => ({}))) as { total?: number; result?: unknown[] };
      return typeof j.total === "number" ? j.total : (j.result?.length ?? 0);
    }),
  );
  void deals;
  return { contacts: totals[0] ?? 0, deals: totals[1] ?? 0 };
}

async function findIds(webhook: string, entity: "CONTACT" | "LEAD", phone: string) {
  const result = await callBitrix(webhook, "crm.duplicate.findbycomm", {
    entity_type: entity,
    type: "PHONE",
    values: bitrixPhoneVariants(phone).slice(0, 20),
  });
  return parseDuplicateIds(result, entity);
}

async function statuses(webhook: string, entityId: string): Promise<BitrixStage[]> {
  try {
    return (await callBitrix<BitrixStage[]>(webhook, "crm.status.list", { filter: { ENTITY_ID: entityId } })) ?? [];
  } catch {
    return [];
  }
}

/** Finds a person by phone in Bitrix24: their contact name, recent deals with stage names, and open applications (leads). */
export async function findBitrixCustomer(webhook: string, phone: string) {
  const [contactIds, leadIds] = await Promise.all([findIds(webhook, "CONTACT", phone), findIds(webhook, "LEAD", phone)]);

  const contacts = await Promise.all(
    contactIds.slice(0, 2).map((id) =>
      callBitrix<{ ID: string; NAME?: string; LAST_NAME?: string }>(webhook, "crm.contact.get", { id }),
    ),
  );
  const dealLists = await Promise.all(
    contactIds.slice(0, 2).map((id) =>
      callBitrix<BitrixDeal[]>(webhook, "crm.deal.list", {
        filter: { CONTACT_ID: id },
        select: ["ID", "TITLE", "STAGE_ID", "CATEGORY_ID", "OPPORTUNITY", "CURRENCY_ID", "CLOSEDATE", "DATE_CREATE", "CLOSED"],
        order: { ID: "DESC" },
      }),
    ),
  );
  const deals = dealLists.flat().slice(0, 10);
  const categories = [...new Set(deals.map((d) => dealStageEntity(d.CATEGORY_ID)))];
  const stages = (await Promise.all(categories.map((c) => statuses(webhook, c)))).flat();

  const leads = await Promise.all(
    leadIds.slice(0, 3).map((id) => callBitrix<BitrixLead & { NAME?: string; LAST_NAME?: string }>(webhook, "crm.lead.get", { id })),
  );
  const leadStatuses = leads.length ? await statuses(webhook, "STATUS") : [];

  const name = contacts.map(personName).find(Boolean) ?? leads.map(personName).find(Boolean) ?? null;
  return {
    found: contacts.length > 0 || leads.length > 0,
    name,
    deals: deals.map((d) => dealForAgent(d, stages)),
    dealIds: deals.map((d) => d.ID),
    applications: leads.map((l) => leadForAgent(l, leadStatuses)),
  };
}

/** Saves a new application (lead) — or adds a comment to the existing one for this phone instead of duplicating it. */
export async function saveBitrixLead(
  webhook: string,
  input: { name: string; phone: string; interest: string; channel: string },
): Promise<{ created: boolean; id: string }> {
  const comment = `Javobchi (${input.channel}): ${input.interest}`;
  const existing = await findIds(webhook, "LEAD", input.phone);
  const existingId = existing[0];
  if (existingId) {
    await callBitrix(webhook, "crm.timeline.comment.add", {
      fields: { ENTITY_ID: Number(existingId), ENTITY_TYPE: "lead", COMMENT: `Yangi so'rov — ${comment}` },
    }).catch((e) => console.error("[bitrix] comment failed", e));
    return { created: false, id: existingId };
  }
  const id = await callBitrix<number>(webhook, "crm.lead.add", {
    fields: {
      TITLE: `Javobchi: ${input.interest}`.slice(0, 250),
      NAME: input.name,
      PHONE: [{ VALUE: input.phone, VALUE_TYPE: "MOBILE" }],
      COMMENTS: comment,
      SOURCE_DESCRIPTION: `Javobchi — ${input.channel}`,
    },
    params: { REGISTER_SONET_EVENT: "Y" },
  });
  return { created: true, id: String(id) };
}

export async function loadBitrixWebhook(ownerId: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("crm_integrations")
    .select("api_key")
    .eq("owner_id", ownerId)
    .eq("provider", "bitrix24")
    .maybeSingle();
  return data?.api_key ?? null;
}
