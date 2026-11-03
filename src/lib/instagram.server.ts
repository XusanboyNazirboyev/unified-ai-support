// Server-only: talks to the Instagram Graph API with each workspace's own token and has the AI look at new posts.

import {
  canAnalyze,
  INSTAGRAM_GRAPH,
  INSTAGRAM_MEDIA_FIELDS,
  instagramShortcode,
  MAX_ANALYSIS_ATTEMPTS,
  parseInstagramMedia,
  parseInstagramMediaList,
  pickAnalysisSource,
  previewImageUrl,
  tokenNeedsRefresh,
  type AnalysisSource,
  type InstagramMediaItem,
} from "@/lib/instagram-rules";
import { maxBytesFor } from "@/lib/media";

export class InstagramError extends Error {
  constructor(
    message: string,
    public kind: "invalid_token" | "failed",
  ) {
    super(message);
  }
}

async function graphGet(path: string, token: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`${INSTAGRAM_GRAPH}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  } catch (e) {
    throw new InstagramError(`Instagram bilan bog'lanib bo'lmadi: ${e instanceof Error ? e.message : ""}`, "failed");
  }
  const text = await response.text();
  if (!response.ok) {
    console.error(`[instagram] ${path} failed [${response.status}]: ${text.slice(0, 400)}`);
    const tokenProblem = response.status === 401 || /OAuthException|access token|code":190/i.test(text);
    throw new InstagramError(`Instagram xatosi [${response.status}]: ${text.slice(0, 300)}`, tokenProblem ? "invalid_token" : "failed");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new InstagramError("Instagram JSON qaytarmadi", "failed");
  }
}

export async function fetchInstagramProfile(token: string): Promise<{ id: string; username: string }> {
  const json = (await graphGet("/me", token, { fields: "user_id,username" })) as Record<string, unknown>;
  const id = String(json["user_id"] ?? json["id"] ?? "");
  const username = typeof json["username"] === "string" ? json["username"] : "";
  if (!id || !username) throw new InstagramError("Instagram akkaunt ma'lumoti kelmadi", "invalid_token");
  return { id, username };
}

export async function fetchRecentMedia(token: string, limit = 25): Promise<InstagramMediaItem[]> {
  const json = await graphGet("/me/media", token, { fields: INSTAGRAM_MEDIA_FIELDS, limit: String(limit) });
  const list = parseInstagramMediaList(json);
  if (!list) throw new InstagramError("Instagram postlar ro'yxatini qaytarmadi", "failed");
  return list;
}

async function fetchMediaItem(token: string, mediaId: string): Promise<InstagramMediaItem> {
  const json = await graphGet(`/${encodeURIComponent(mediaId)}`, token, { fields: INSTAGRAM_MEDIA_FIELDS });
  const item = parseInstagramMedia(json);
  if (!item) throw new InstagramError("Post topilmadi", "failed");
  return item;
}

/** Extends a long-lived token by another 60 days; returns null when Instagram refuses (token stays as is). */
async function refreshToken(token: string): Promise<string | null> {
  try {
    const url = new URL("https://graph.instagram.com/refresh_access_token");
    url.searchParams.set("grant_type", "ig_refresh_token");
    url.searchParams.set("access_token", token);
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      console.error(`[instagram] token refresh failed [${response.status}]: ${(await response.text()).slice(0, 300)}`);
      return null;
    }
    const json = (await response.json()) as { access_token?: string };
    return json.access_token ?? null;
  } catch (e) {
    console.error("[instagram] token refresh error", e);
    return null;
  }
}

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export async function loadInstagramAccount(ownerId: string) {
  const db = await admin();
  const { data } = await db
    .from("instagram_accounts")
    .select("owner_id, ig_user_id, username, access_token, token_refreshed_at, last_synced_at, last_error")
    .eq("owner_id", ownerId)
    .maybeSingle();
  return data;
}

/** Pulls the latest posts into the workspace: new ones wait for the AI, existing ones get fresh captions. */
export async function syncInstagramPosts(ownerId: string): Promise<{ total: number; pending: number }> {
  const db = await admin();
  const account = await loadInstagramAccount(ownerId);
  if (!account) throw new InstagramError("Instagram ulanmagan", "failed");
  let token = account.access_token;
  if (tokenNeedsRefresh(account.token_refreshed_at)) {
    const fresh = await refreshToken(token);
    if (fresh) {
      token = fresh;
      await db
        .from("instagram_accounts")
        .update({ access_token: fresh, token_refreshed_at: new Date().toISOString() })
        .eq("owner_id", ownerId);
    }
  }
  try {
    const items = await fetchRecentMedia(token);
    if (items.length) {
      const { error } = await db.from("instagram_posts").upsert(
        items.map((m) => ({
          owner_id: ownerId,
          media_id: m.id,
          media_type: m.mediaType,
          caption: m.caption,
          permalink: m.permalink,
          shortcode: instagramShortcode(m.permalink),
          thumbnail_url: previewImageUrl(m),
          posted_at: m.timestamp,
        })),
        { onConflict: "owner_id,media_id" },
      );
      if (error) throw new Error(`Postlarni saqlab bo'lmadi: ${error.message}`);
    }
    await db
      .from("instagram_accounts")
      .update({ last_synced_at: new Date().toISOString(), last_error: null })
      .eq("owner_id", ownerId);
    const { count } = await db
      .from("instagram_posts")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId)
      .eq("status", "pending");
    return { total: items.length, pending: count ?? 0 };
  } catch (e) {
    await db
      .from("instagram_accounts")
      .update({ last_error: e instanceof Error ? e.message.slice(0, 300) : "xato" })
      .eq("owner_id", ownerId);
    throw e;
  }
}

async function download(url: string, maxBytes: number): Promise<{ bytes: Uint8Array; mime: string } | "too_large"> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Faylni yuklab bo'lmadi [${response.status}]`);
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    await response.body?.cancel();
    return "too_large";
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) return "too_large";
  const mime = (response.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
  return { bytes, mime };
}

function defaultMime(kind: "photo" | "video", mime: string) {
  if (kind === "video") return mime.startsWith("video/") ? mime : "video/mp4";
  return mime.startsWith("image/") ? mime : "image/jpeg";
}

/**
 * Has the AI look at one post and stores what it saw. Claims the post first so two runs never analyse it twice.
 * Returns the new status, or null when the post was not available for analysis.
 */
export async function analyzeInstagramPost(ownerId: string, postId: string): Promise<"analyzed" | "failed" | "pending" | null> {
  const db = await admin();
  const { data: post } = await db
    .from("instagram_posts")
    .select("id, media_id, caption, status, attempts, analyzing_at")
    .eq("owner_id", ownerId)
    .eq("id", postId)
    .maybeSingle();
  if (!post || !canAnalyze(post)) return null;

  const { data: claimed } = await db
    .from("instagram_posts")
    .update({ status: "analyzing", attempts: post.attempts + 1, analyzing_at: new Date().toISOString() })
    .eq("id", post.id)
    .eq("attempts", post.attempts)
    .select("id")
    .maybeSingle();
  if (!claimed) return null;

  const attempts = post.attempts + 1;
  try {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI kaliti sozlanmagan");
    const account = await loadInstagramAccount(ownerId);
    if (!account) throw new Error("Instagram ulanmagan");
    const { data: settings } = await db.from("agent_settings").select("company_name").eq("owner_id", ownerId).maybeSingle();

    // Stored media links expire, so fetch fresh ones right before looking.
    const item = await fetchMediaItem(account.access_token, post.media_id);
    let source: AnalysisSource | null = pickAnalysisSource(item);
    if (!source) throw new Error("Postda ko'rib bo'ladigan rasm yoki video yo'q");
    let file = await download(source.url, maxBytesFor(source.kind));
    if (file === "too_large" && source.kind === "video") {
      const cover = item.thumbnailUrl ?? item.children.find((c) => c.thumbnailUrl)?.thumbnailUrl ?? null;
      if (!cover) throw new Error("Video juda katta (20 MB dan ortiq) va muqova rasmi yo'q");
      source = { kind: "photo", url: cover, from: "cover" };
      file = await download(cover, maxBytesFor("photo"));
    }
    if (file === "too_large") throw new Error("Fayl juda katta");

    const { analyzeMedia } = await import("@/lib/ai/media.server");
    const { bytesToBase64 } = await import("@/lib/telegram.server");
    const meta = await analyzeMedia({
      apiKey,
      base64: bytesToBase64(file.bytes),
      mime: defaultMime(source.kind, file.mime),
      kind: source.kind,
      caption: item.caption ?? post.caption ?? "",
      companyName: settings?.company_name ?? "",
      audience: "post",
    });
    await db
      .from("instagram_posts")
      .update({
        status: "analyzed",
        analysis: meta,
        analyzed_from: source.from,
        analysis_error: null,
        analyzed_at: new Date().toISOString(),
        caption: item.caption ?? post.caption,
        thumbnail_url: previewImageUrl(item),
      })
      .eq("id", post.id);
    return "analyzed";
  } catch (e) {
    const message = e instanceof Error ? e.message : "xato";
    console.error("[instagram] analysis failed", post.id, message);
    const status = attempts >= MAX_ANALYSIS_ATTEMPTS ? "failed" : "pending";
    await db.from("instagram_posts").update({ status, analysis_error: message.slice(0, 300) }).eq("id", post.id);
    return status;
  }
}

/** Analyses up to `max` waiting posts, newest first (or the given ones first). */
export async function analyzeWaitingPosts(ownerId: string, max: number, preferIds: string[] = []): Promise<number> {
  const db = await admin();
  const { data } = await db
    .from("instagram_posts")
    .select("id, status, attempts, analyzing_at")
    .eq("owner_id", ownerId)
    .in("status", ["pending", "analyzing"])
    .order("posted_at", { ascending: false })
    .limit(30);
  const waiting = (data ?? []).filter((p) => canAnalyze(p));
  waiting.sort((a, b) => Number(preferIds.includes(b.id)) - Number(preferIds.includes(a.id)));
  let done = 0;
  for (const p of waiting.slice(0, max)) {
    if ((await analyzeInstagramPost(ownerId, p.id)) === "analyzed") done++;
  }
  return done;
}
