import { createFileRoute } from "@tanstack/react-router";

import { MediaError, analyzeMedia } from "@/lib/ai/media.server";
import { bytesToBase64 } from "@/lib/telegram.server";
import { getUserClientFromRequest } from "@/lib/supabase-user.server";
import { MAX_VIDEO_BYTES, maxBytesFor, mediaKindFromFile } from "@/lib/media";

async function handleAnalyze(request: Request): Promise<Response> {
  const user = await getUserClientFromRequest(request);
  if (!user) return Response.json({ error: "Avval tizimga kiring" }, { status: 401 });

  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return Response.json({ error: "AI sozlanmagan" }, { status: 500 });

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_VIDEO_BYTES + 64 * 1024) {
    return Response.json({ error: "Fayl juda katta (video ko'pi bilan 20 MB, rasm 10 MB)" }, { status: 413 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const caption = String(form?.get("caption") ?? "").slice(0, 1000);
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Fayl topilmadi" }, { status: 400 });
  const type = mediaKindFromFile(file.type, file.name);
  if (!type) return Response.json({ error: "Faqat rasm (jpg, png, webp) yoki video (mp4, mov, webm) yuboring" }, { status: 400 });
  if (file.size > maxBytesFor(type.kind)) {
    return Response.json({ error: "Fayl juda katta (video ko'pi bilan 20 MB, rasm 10 MB)" }, { status: 413 });
  }

  const { data: settings } = await user.supabase
    .from("agent_settings")
    .select("company_name")
    .eq("owner_id", user.userId)
    .maybeSingle();

  try {
    const meta = await analyzeMedia({
      apiKey,
      base64: bytesToBase64(new Uint8Array(await file.arrayBuffer())),
      mime: type.mime,
      kind: type.kind,
      caption,
      companyName: settings?.company_name ?? "",
      signal: request.signal,
    });
    return Response.json({ meta }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    if (error instanceof MediaError) return Response.json({ error: error.message }, { status: error.status });
    console.error("[media-analyze]", error);
    return Response.json({ error: "Faylni ko'rib bo'lmadi" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/media-analyze")({
  server: {
    handlers: {
      POST: ({ request }) => handleAnalyze(request),
    },
  },
});
