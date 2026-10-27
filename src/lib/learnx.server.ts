import { LEARNX_CATALOG_PATH, parseLearnxCatalog, type LearnxCourse } from "@/lib/learnx-rules";

export class LearnxError extends Error {
  constructor(
    message: string,
    public kind: "unreachable" | "unauthorized" | "bad_response",
  ) {
    super(message);
  }
}

export async function fetchLearnxCatalog(baseUrl: string, apiKey: string): Promise<LearnxCourse[]> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${LEARNX_CATALOG_PATH}`, {
      headers: { "X-Api-Key": apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    throw new LearnxError(`learnX serveriga ulanib bo'lmadi: ${e instanceof Error ? e.message : ""}`, "unreachable");
  }
  if (response.status === 401 || response.status === 403) {
    throw new LearnxError(`learnX kalitni qabul qilmadi [${response.status}]`, "unauthorized");
  }
  const text = await response.text();
  if (!response.ok) throw new LearnxError(`learnX xatosi [${response.status}]: ${text.slice(0, 200)}`, "bad_response");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new LearnxError("learnX JSON qaytarmadi", "bad_response");
  }
  const courses = parseLearnxCatalog(json);
  if (!courses) throw new LearnxError("learnX javobida kurslar ro'yxati yo'q", "bad_response");
  return courses;
}

export async function loadLearnxIntegration(ownerId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("crm_integrations")
    .select("base_url, api_key")
    .eq("owner_id", ownerId)
    .eq("provider", "learnx")
    .maybeSingle();
  return data;
}
