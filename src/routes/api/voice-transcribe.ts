import { createFileRoute } from "@tanstack/react-router";

import { VoiceError, transcribeVoice } from "@/lib/ai/voice.server";
import { getUserClientFromRequest } from "@/lib/supabase-user.server";
import { MAX_VOICE_BYTES, audioFormatFromFile } from "@/lib/voice";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function handleTranscribe(request: Request): Promise<Response> {
  const user = await getUserClientFromRequest(request);
  if (!user) return Response.json({ error: "Avval tizimga kiring" }, { status: 401 });

  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return Response.json({ error: "AI sozlanmagan" }, { status: 500 });

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_VOICE_BYTES + 64 * 1024) {
    return Response.json({ error: "Audio juda katta (ko'pi bilan 10 MB / 3 daqiqa)" }, { status: 413 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Audio fayl topilmadi" }, { status: 400 });
  }
  if (file.size < 1024) return Response.json({ error: "Yozuv juda qisqa. Qaytadan yozib ko'ring." }, { status: 400 });
  if (file.size > MAX_VOICE_BYTES) {
    return Response.json({ error: "Audio juda katta (ko'pi bilan 10 MB / 3 daqiqa)" }, { status: 413 });
  }
  const format = audioFormatFromFile(file.type, file.name);
  if (!format) {
    return Response.json({ error: "Bu audio formati qo'llab-quvvatlanmaydi (wav, mp3, ogg, m4a, webm)" }, { status: 400 });
  }

  const { data: settings } = await user.supabase
    .from("agent_settings")
    .select("company_name")
    .eq("owner_id", user.userId)
    .maybeSingle();

  try {
    const result = await transcribeVoice({
      apiKey,
      audioBase64: toBase64(new Uint8Array(await file.arrayBuffer())),
      format,
      companyName: settings?.company_name ?? "",
      signal: request.signal,
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    if (error instanceof VoiceError) return Response.json({ error: error.message }, { status: error.status });
    console.error("[voice-transcribe]", error);
    return Response.json({ error: "Ovozli xabarni tushunib bo'lmadi" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/voice-transcribe")({
  server: {
    handlers: {
      POST: ({ request }) => handleTranscribe(request),
    },
  },
});
