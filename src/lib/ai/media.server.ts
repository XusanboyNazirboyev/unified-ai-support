import { createParser } from "eventsource-parser";

import { VOICE_LANGUAGES } from "@/lib/voice";
import { parseMediaMeta, type MediaKind, type MediaMeta } from "@/lib/media";

// Vision model for customer photos and videos: describes what is visible, names the product only when it can
// really be recognised, and reports its own certainty so the agent confirms instead of quoting a wrong price.
export const MEDIA_MODEL = "google/gemini-4-argon";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export class MediaError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["description", "product", "visible_text", "speech", "language", "confidence"],
  properties: {
    description: { type: "string" },
    product: { type: ["string", "null"] },
    visible_text: { type: "array", items: { type: "string" } },
    speech: { type: ["string", "null"] },
    language: { type: "string", enum: [...VOICE_LANGUAGES] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
} as const;

function systemPrompt(companyName: string, kind: MediaKind) {
  return `A customer of ${companyName || "a business"} in Uzbekistan sent a ${kind === "video" ? "video" : "photo"} in a chat.
Look at it carefully and report ONLY what is really visible${kind === "video" ? " or audible" : ""}. Never invent.

Fields:
- description: 1-3 short sentences in Uzbek Latin — what is shown (item, colour, condition, packaging, screen, damage, document...). If the customer seems to show a problem (broken item, wrong item, error on screen), say so.
- product: the exact brand and model ONLY when you can actually read or clearly recognise it (logo, label, box text, distinctive design), e.g. "Samsung Galaxy A56". If you only know the type, write the type ("simsiz quloqchin", "kir yuvish mashinasi"). Null if no product.
- visible_text: important text visible in the image/video exactly as written — model names, prices, order numbers, phone numbers, error messages. Copy digits exactly. Empty when none.
- speech: ${kind === "video" ? "what people say in the video, verbatim in the original language/dialect (Uzbek, Karakalpak, Russian...), numbers as digits; mark uncertain words with (?). Null if nobody speaks." : "always null for photos."}
- language: main spoken language (uz, kaa = Karakalpak, ru, kk, tg, en, mixed, unknown); "unknown" when there is no speech.
- confidence: "high" only when the product and every number you report are clearly readable; "medium" when the type is clear but the exact model is a best guess; "low" when blurry, dark, too far or partly hidden.`;
}

/** For the business's own Instagram posts: a fuller catalogue-style description the agent can answer from later. */
function postSystemPrompt(companyName: string, kind: MediaKind) {
  return `${companyName || "A business"} in Uzbekistan published this ${kind === "video" ? "video (reel)" : "photo"} on its own Instagram account to advertise products or services.
Customers will later ask the support agent about it ("videodagi telefon qancha?", "postdagi ko'ylak bormi?"). Describe it so the agent can answer. Report ONLY what is really visible${kind === "video" ? " or audible" : ""}. Never invent features, prices or models.

Fields:
- description: 2-6 sentences in Uzbek Latin — every product or service shown (type, brand, colour, size/volume, quantity, key features shown or said), the offer or promotion if any, and anything a buyer would ask about.
- product: the main product(s) with exact brand and model ONLY when readable or clearly recognisable; several products separated by "; ". If only the type is known, write the type. Null if no product.
- visible_text: all important text exactly as written — product names, prices with currency, discounts, dates, phone numbers, addresses. Copy digits exactly. Empty when none.
- speech: ${kind === "video" ? "what is said in the video, verbatim in the original language/dialect, numbers as digits; mark uncertain words with (?). Null if nobody speaks." : "always null for photos."}
- language: main spoken language (uz, kaa = Karakalpak, ru, kk, tg, en, mixed, unknown); "unknown" when there is no speech.
- confidence: "high" only when the product and every number you report are clearly readable or audible; "medium" when the type is clear but the exact model is a best guess; "low" when blurry, dark or unclear.`;
}

export async function analyzeMedia(params: {
  apiKey: string;
  base64: string;
  mime: string;
  kind: MediaKind;
  caption: string;
  companyName: string;
  /** "post" = the business's own Instagram post; default "customer" = a photo/video a customer sent. */
  audience?: "customer" | "post";
  signal?: AbortSignal;
}): Promise<MediaMeta> {
  const isPost = params.audience === "post";
  const dataUrl = `data:${params.mime};base64,${params.base64}`;
  const mediaPart =
    params.kind === "video"
      ? { type: "video_url", video_url: { url: dataUrl } }
      : { type: "image_url", image_url: { url: dataUrl } };
  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: MEDIA_MODEL,
      stream: true,
      messages: [
        {
          role: "system",
          content: isPost ? postSystemPrompt(params.companyName, params.kind) : systemPrompt(params.companyName, params.kind),
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: params.caption.trim()
                ? `${isPost ? "Post caption written by the business" : "Customer's caption"}: "${params.caption.trim().slice(0, isPost ? 2200 : 500)}"`
                : "No caption was written.",
            },
            mediaPart,
          ],
        },
      ],
      response_format: { type: "json_schema", json_schema: { name: "media_analysis", strict: true, schema: SCHEMA } },
    }),
    ...(params.signal ? { signal: params.signal } : {}),
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    console.error("[media] gateway error", response.status, detail.slice(0, 500));
    throw new MediaError(friendlyMediaError(response.status, params.kind), response.status || 502);
  }

  let content = "";
  let streamError: string | null = null;
  const parser = createParser({
    onEvent(event) {
      if (event.data === "[DONE]") return;
      try {
        const json = JSON.parse(event.data) as { choices?: { delta?: { content?: string } }[]; error?: { message?: string } };
        if (json.error) streamError = json.error.message ?? "stream error";
        content += json.choices?.[0]?.delta?.content ?? "";
      } catch {
        // ignore keep-alive / non-JSON events
      }
    },
  });
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    parser.feed(value);
  }
  if (streamError) {
    console.error("[media] stream error", streamError);
    throw new MediaError(friendlyMediaError(502, params.kind), 502);
  }
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    // handled below
  }
  const meta = parseMediaMeta({ ...parsed, kind: params.kind });
  if (!meta) throw new MediaError(friendlyMediaError(502, params.kind), 502);
  return meta;
}

export function friendlyMediaError(status: number, kind: MediaKind): string {
  if (status === 402) return "AI kreditlari tugadi. Workspace sozlamalarida kredit qo'shing.";
  if (status === 429) return "So'rovlar ko'payib ketdi. Birozdan so'ng qayta urinib ko'ring.";
  if (status === 403) return "AI xizmatidan foydalanish cheklangan (workspace sozlamalarini tekshiring).";
  if (status === 400) return kind === "video" ? "Bu videoni o'qib bo'lmadi. Boshqa formatda (mp4) yuborib ko'ring." : "Bu rasmni o'qib bo'lmadi. JPG yoki PNG yuborib ko'ring.";
  return kind === "video" ? "Videoni ko'rib bo'lmadi. Qayta urinib ko'ring." : "Rasmni ko'rib bo'lmadi. Qayta urinib ko'ring.";
}
