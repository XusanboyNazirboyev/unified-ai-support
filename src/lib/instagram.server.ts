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
    .select("owner_id, ig_user_id, username, access_token, token_refreshed_at, last_synced_at, last_error, messaging_enabled")
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

// ---------- One-click connect, Direct messages, Meta callbacks ----------

export function instagramAppConfig(): { appId: string; appSecret: string } | null {
  const appId = process.env["INSTAGRAM_APP_ID"]?.trim();
  const appSecret = process.env["INSTAGRAM_APP_SECRET"]?.trim();
  return appId && appSecret ? { appId, appSecret } : null;
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
}

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const toB64Url = (b: Uint8Array) => {
  let bin = "";
  for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signState(body: string, secret: string): Promise<string> {
  return `${body}.${toB64Url(await hmac(secret, body))}`;
}

/** Returns the unsigned body when the signature is valid. */
export async function verifyState(state: string, secret: string): Promise<string | null> {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  return safeEqual(sig, toB64Url(await hmac(secret, body))) ? body : null;
}

/** Checks Meta's `X-Hub-Signature-256: sha256=<hex>` over the raw request body. */
export async function verifyWebhookSignature(rawBody: string, header: string | null, secret: string): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  return safeEqual(header.slice(7), toHex(await hmac(secret, rawBody)));
}

export async function verifySignedRequest(signature: string, payload: string, secret: string): Promise<boolean> {
  return safeEqual(signature, toB64Url(await hmac(secret, payload)));
}

/** Turns the login code into a long-lived (60-day) token. */
export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<{ token: string; scopes: string | null }> {
  const app = instagramAppConfig();
  if (!app) throw new InstagramError("Meta ilova kalitlari sozlanmagan", "failed");
  const form = new URLSearchParams({
    client_id: app.appId,
    client_secret: app.appSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: form, signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[instagram] code exchange failed [${res.status}]: ${text.slice(0, 400)}`);
    throw new InstagramError(`Instagram kirishni tasdiqlamadi [${res.status}]`, "invalid_token");
  }
  const short = JSON.parse(text) as { access_token?: string; permissions?: string | string[] };
  if (!short.access_token) throw new InstagramError("Instagram token bermadi", "invalid_token");
  const scopes = Array.isArray(short.permissions) ? short.permissions.join(",") : (short.permissions ?? null);

  const longUrl = new URL("https://graph.instagram.com/access_token");
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", app.appSecret);
  longUrl.searchParams.set("access_token", short.access_token);
  const longRes = await fetch(longUrl, { signal: AbortSignal.timeout(15000) });
  const longText = await longRes.text();
  if (!longRes.ok) {
    console.error(`[instagram] long-lived exchange failed [${longRes.status}]: ${longText.slice(0, 400)}`);
    throw new InstagramError(`Uzoq muddatli token olinmadi [${longRes.status}]`, "failed");
  }
  const long = JSON.parse(longText) as { access_token?: string };
  if (!long.access_token) throw new InstagramError("Uzoq muddatli token kelmadi", "failed");
  return { token: long.access_token, scopes };
}

/** Asks Instagram to send this account's Direct messages to our webhook. False when the permission is missing. */
async function subscribeToMessages(token: string): Promise<boolean> {
  try {
    const url = new URL(`${INSTAGRAM_GRAPH}/me/subscribed_apps`);
    url.searchParams.set("subscribed_fields", "messages");
    url.searchParams.set("access_token", token);
    const res = await fetch(url, { method: "POST", signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[instagram] subscribe failed [${res.status}]: ${text.slice(0, 400)}`);
      return false;
    }
    return /"success"\s*:\s*true/.test(text);
  } catch (e) {
    console.error("[instagram] subscribe error", e);
    return false;
  }
}

/** Saves a workspace's Instagram account (from one-click login or a pasted token), turns on Direct and fetches posts. */
export async function saveConnectedAccount(
  ownerId: string,
  token: string,
  scopes: string | null,
): Promise<{ ok: true; username: string; total: number; messaging: boolean } | { ok: false; error: "in_use" }> {
  const db = await admin();
  const profile = await fetchInstagramProfile(token);
  const { data: other } = await db
    .from("instagram_accounts")
    .select("owner_id")
    .eq("ig_user_id", profile.id)
    .neq("owner_id", ownerId)
    .maybeSingle();
  if (other) return { ok: false, error: "in_use" };
  const messaging = await subscribeToMessages(token);
  const { error } = await db.from("instagram_accounts").upsert({
    owner_id: ownerId,
    ig_user_id: profile.id,
    username: profile.username,
    access_token: token,
    token_refreshed_at: new Date().toISOString(),
    last_error: null,
    messaging_enabled: messaging,
    scopes,
  });
  if (error) throw new Error(`Saqlab bo'lmadi: ${error.message}`);
  await db.from("channel_connections").upsert({
    owner_id: ownerId,
    channel: "instagram",
    status: messaging ? "connected" : "demo",
    account_name: `@${profile.username}`,
    updated_at: new Date().toISOString(),
  });
  const synced = await syncInstagramPosts(ownerId);
  return { ok: true, username: profile.username, total: synced.total, messaging };
}

/** Removes a workspace's Instagram connection and everything synced from it. */
export async function removeInstagramAccount(ownerId: string) {
  const db = await admin();
  await db.from("instagram_posts").delete().eq("owner_id", ownerId);
  await db.from("instagram_accounts").delete().eq("owner_id", ownerId);
  await db.from("channel_connections").upsert({
    owner_id: ownerId,
    channel: "instagram",
    status: "disconnected",
    account_name: null,
    updated_at: new Date().toISOString(),
  });
}

export async function sendInstagramText(token: string, recipientId: string, text: string) {
  const { splitInstagramText } = await import("@/lib/instagram-rules");
  for (const part of splitInstagramText(text)) {
    const res = await fetch(`${INSTAGRAM_GRAPH}/me/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: recipientId }, message: { text: part } }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[instagram] send failed [${res.status}]: ${body.slice(0, 400)}`);
      const outsideWindow = /2534022|outside of allowed window|24/.test(body) && /window/i.test(body);
      throw new Error(
        outsideWindow
          ? "Instagram faqat mijozning oxirgi xabaridan keyin 24 soat ichida javob yuborishga ruxsat beradi"
          : `Instagram'ga yuborilmadi [${res.status}]`,
      );
    }
  }
}

/** Customer's name and username (allowed once they have written to the business). */
export async function fetchInstagramSender(token: string, igsid: string): Promise<{ name: string | null; username: string | null }> {
  try {
    const json = (await graphGet(`/${encodeURIComponent(igsid)}`, token, { fields: "name,username" })) as Record<string, unknown>;
    return {
      name: typeof json["name"] === "string" && json["name"].trim() ? json["name"].trim() : null,
      username: typeof json["username"] === "string" ? json["username"] : null,
    };
  } catch {
    return { name: null, username: null };
  }
}

export async function downloadInstagramFile(url: string, maxBytes: number) {
  return download(url, maxBytes);
}
