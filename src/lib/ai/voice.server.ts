import { createParser } from "eventsource-parser";

import { VOICE_LANGUAGES, parseVoiceMeta, type AudioFormat, type VoiceTranscript } from "@/lib/voice";

// Audio-understanding model: transcribes verbatim in the original language/dialect (incl. Karakalpak)
// and reports the language and its own certainty, which the agent uses to avoid acting on misheard words.
export const VOICE_MODEL = "google/gemini-4-argon";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export class VoiceError extends Error {
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
  required: ["transcript", "language", "dialect", "confidence", "unclear_parts"],
  properties: {
    transcript: { type: "string" },
    language: { type: "string", enum: [...VOICE_LANGUAGES] },
    dialect: { type: ["string", "null"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    unclear_parts: { type: "array", items: { type: "string" } },
  },
} as const;

function systemPrompt(companyName: string) {
  return `You transcribe customer voice messages sent to ${companyName || "an online store"} in Uzbekistan.

Write down EXACTLY what was said, in the ORIGINAL language and dialect.
- Do NOT translate. Do NOT convert Karakalpak, Kazakh or dialect words into standard Uzbek.
- Languages you may hear: Uzbek (any regional dialect — Tashkent, Fergana, Khorezm, Bukhara/Samarkand, Surkhandarya, Kashkadarya), Karakalpak, Russian, Kazakh, Tajik, English, often mixed.
- Script: Uzbek in Uzbek Latin (o', g', sh, ch); Karakalpak in Karakalpak Latin (á, ó, ú, ı, ǵ, ń); Kazakh and Russian in Cyrillic; Tajik in Cyrillic.
- Write numbers, prices, order numbers (like TM-1042) and phone numbers as digits.
- NEVER guess. If a word or number is inaudible or uncertain, write it as you best heard it followed by "(?)" and add it to unclear_parts.
- If there is no speech, return an empty transcript with confidence "low".

Fields:
- language: main language spoken (uz, kaa = Karakalpak, ru, kk, tg, en, mixed, unknown).
- dialect: Uzbek regional dialect name in Uzbek (e.g. "Xorazm shevasi") when clearly recognisable, otherwise null.
- confidence: "high" only when every word and every number is clear; "low" when noisy, cut off, or key words/numbers are uncertain.
- unclear_parts: the uncertain words or numbers (empty when everything is clear).`;
}

export async function transcribeVoice(params: {
  apiKey: string;
  audioBase64: string;
  format: AudioFormat;
  companyName: string;
  signal?: AbortSignal;
}): Promise<VoiceTranscript> {
  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: VOICE_MODEL,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt(params.companyName) },
        {
          role: "user",
          content: [
            { type: "text", text: "Transcribe this customer voice message." },
            { type: "input_audio", input_audio: { data: params.audioBase64, format: params.format } },
          ],
        },
      ],
      response_format: { type: "json_schema", json_schema: { name: "voice_transcript", strict: true, schema: SCHEMA } },
    }),
    ...(params.signal ? { signal: params.signal } : {}),
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    console.error("[voice] gateway error", response.status, detail.slice(0, 500));
    throw new VoiceError(friendlyVoiceError(response.status), response.status || 502);
  }

  let content = "";
  let streamError: string | null = null;
  const parser = createParser({
    onEvent(event) {
      if (event.data === "[DONE]") return;
      try {
        const json = JSON.parse(event.data) as {
          choices?: { delta?: { content?: string } }[];
          error?: { message?: string };
        };
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
    console.error("[voice] stream error", streamError);
    throw new VoiceError("Ovozli xabarni tushunib bo'lmadi. Qayta urinib ko'ring.", 502);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    throw new VoiceError("Ovozli xabarni tushunib bo'lmadi. Qayta yozib ko'ring.", 502);
  }
  const meta = parseVoiceMeta(parsed);
  const transcript = typeof parsed["transcript"] === "string" ? (parsed["transcript"] as string).trim() : "";
  if (!meta) throw new VoiceError("Ovozli xabarni tushunib bo'lmadi. Qayta yozib ko'ring.", 502);
  if (!transcript) throw new VoiceError("Ovozli xabarda nutq eshitilmadi. Qaytadan yozib ko'ring.", 422);
  return { transcript, meta };
}

export function friendlyVoiceError(status: number): string {
  if (status === 402) return "AI kreditlari tugadi. Workspace sozlamalarida kredit qo'shing.";
  if (status === 429) return "So'rovlar ko'payib ketdi. Birozdan so'ng qayta urinib ko'ring.";
  if (status === 403) return "AI xizmatidan foydalanish cheklangan (workspace sozlamalarini tekshiring).";
  if (status === 400) return "Bu audio faylni o'qib bo'lmadi. Boshqa formatda yoki qaytadan yozib ko'ring.";
  return "Ovozli xabarni tushunib bo'lmadi. Qayta urinib ko'ring.";
}
