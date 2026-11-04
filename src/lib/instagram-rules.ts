// Pure, browser-safe rules for the business's own Instagram posts: reading the Graph API response,
// choosing what the AI looks at, matching a customer's question or shared link to a post, and what the agent sees.

import { rankKbArticles } from "@/lib/agent-rules";
import { parseMediaMeta, type MediaMeta } from "@/lib/media";

export const INSTAGRAM_GRAPH = "https://graph.instagram.com/v23.0";
export const INSTAGRAM_MEDIA_FIELDS =
  "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url,thumbnail_url}";

/** A failed post is retried this many times, then left for the owner to retry by hand. */
export const MAX_ANALYSIS_ATTEMPTS = 3;
/** An analysis that started but never finished (crash, timeout) may be taken over after this long. */
export const STALE_ANALYSIS_MS = 5 * 60 * 1000;
/** Long-lived Instagram tokens expire after 60 days; refresh them weekly. */
export const TOKEN_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

export type InstagramMediaType = "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";

export type InstagramChild = { mediaType: InstagramMediaType; mediaUrl: string | null; thumbnailUrl: string | null };

export type InstagramMediaItem = {
  id: string;
  mediaType: InstagramMediaType;
  caption: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  permalink: string | null;
  timestamp: string | null;
  children: InstagramChild[];
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const mediaType = (v: unknown): InstagramMediaType | null =>
  v === "IMAGE" || v === "VIDEO" || v === "CAROUSEL_ALBUM" ? v : null;

/** Tokens from Meta's "Generate token" button: long, no spaces. Returns the trimmed token or null. */
export function normalizeInstagramToken(value: string): string | null {
  const token = value.trim();
  return /^[A-Za-z0-9_\-.|]{40,700}$/.test(token) ? token : null;
}

/** Reads one media object of the Graph API; null when it has no id or an unknown type. */
export function parseInstagramMedia(value: unknown): InstagramMediaItem | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const id = str(v["id"]);
  const type = mediaType(v["media_type"]);
  if (!id || !type) return null;
  const rawChildren = (v["children"] as { data?: unknown } | undefined)?.data;
  const children: InstagramChild[] = Array.isArray(rawChildren)
    ? rawChildren
        .map((c) => {
          const cv = (c ?? {}) as Record<string, unknown>;
          const ct = mediaType(cv["media_type"]);
          return ct ? { mediaType: ct, mediaUrl: str(cv["media_url"]), thumbnailUrl: str(cv["thumbnail_url"]) } : null;
        })
        .filter((c): c is InstagramChild => !!c)
    : [];
  return {
    id,
    mediaType: type,
    caption: str(v["caption"])?.slice(0, 2200) ?? null,
    mediaUrl: str(v["media_url"]),
    thumbnailUrl: str(v["thumbnail_url"]),
    permalink: str(v["permalink"]),
    timestamp: str(v["timestamp"]),
    children,
  };
}

/** Reads `GET /me/media`; returns null when the response is not a media list. */
export function parseInstagramMediaList(json: unknown): InstagramMediaItem[] | null {
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return null;
  return data.map(parseInstagramMedia).filter((m): m is InstagramMediaItem => !!m);
}

/** The picture shown in the posts list: the image itself, a video's cover, or a carousel's first item. */
export function previewImageUrl(item: InstagramMediaItem): string | null {
  if (item.mediaType === "IMAGE") return item.mediaUrl;
  if (item.mediaType === "VIDEO") return item.thumbnailUrl;
  const first = item.children[0];
  if (!first) return item.thumbnailUrl ?? item.mediaUrl;
  return first.mediaType === "VIDEO" ? first.thumbnailUrl : first.mediaUrl;
}

export type AnalysisSource = { kind: "photo" | "video"; url: string; from: "image" | "video" | "cover" };

/**
 * What the AI should look at: a reel's video (falling back to its cover when the video URL is missing),
 * an image, or a carousel's first item.
 */
export function pickAnalysisSource(item: InstagramMediaItem): AnalysisSource | null {
  const one = (type: InstagramMediaType, url: string | null, thumb: string | null): AnalysisSource | null => {
    if (type === "VIDEO") {
      if (url) return { kind: "video", url, from: "video" };
      return thumb ? { kind: "photo", url: thumb, from: "cover" } : null;
    }
    return url ? { kind: "photo", url, from: "image" } : null;
  };
  if (item.mediaType !== "CAROUSEL_ALBUM") return one(item.mediaType, item.mediaUrl, item.thumbnailUrl);
  for (const child of item.children) {
    const source = one(child.mediaType, child.mediaUrl, child.thumbnailUrl);
    if (source) return source;
  }
  return item.mediaUrl ? { kind: "photo", url: item.mediaUrl, from: "image" } : null;
}

/** Post code from an Instagram link: instagram.com/p/CODE, /reel/CODE, /reels/CODE, /tv/CODE. */
export function instagramShortcode(link: string | null | undefined): string | null {
  if (!link) return null;
  const m = /instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,40})/i.exec(link);
  return m?.[1] ?? null;
}

export type StoredPost = {
  id: string;
  media_type: string;
  caption: string | null;
  permalink: string | null;
  shortcode: string | null;
  posted_at: string | null;
  status: string;
  analysis: unknown;
  analyzed_from: string | null;
  admin_note: string | null;
  attempts: number;
  analyzing_at: string | null;
};

/** Whether a post may be (re)analysed now: new, interrupted long ago, or failed with retries left. */
export function canAnalyze(post: Pick<StoredPost, "status" | "attempts" | "analyzing_at">, now = Date.now()): boolean {
  if (post.attempts >= MAX_ANALYSIS_ATTEMPTS) return false;
  if (post.status === "pending") return true;
  if (post.status === "analyzing") {
    const started = post.analyzing_at ? Date.parse(post.analyzing_at) : 0;
    return now - started > STALE_ANALYSIS_MS;
  }
  return false;
}

export function tokenNeedsRefresh(refreshedAt: string, now = Date.now()): boolean {
  return now - Date.parse(refreshedAt) > TOKEN_REFRESH_MS;
}

function searchText(post: StoredPost): { title: string; content: string } {
  const meta = parseMediaMeta(post.analysis);
  const caption = post.caption ?? "";
  return {
    title: [meta?.product, caption.split("\n")[0]].filter(Boolean).join(" — "),
    content: [caption, post.admin_note, meta?.description, meta?.visible_text.join(" "), meta?.speech]
      .filter(Boolean)
      .join("\n"),
  };
}

/**
 * Finds the posts a customer asks about. A shared link wins outright; otherwise posts are ranked by the
 * same keyword overlap as the knowledge base over the caption, the owner's note and what the AI saw.
 */
export function findInstagramPosts<T extends StoredPost>(posts: T[], query: string, link: string | null, limit = 3): T[] {
  const code = instagramShortcode(link) ?? instagramShortcode(query);
  if (code) {
    const exact = posts.filter((p) => p.shortcode === code);
    if (exact.length) return exact;
  }
  const docs = posts.map((p) => ({ id: p.id, category: "instagram", post: p, ...searchText(p) }));
  return rankKbArticles(query, docs, limit).map((d) => d.post);
}

const CONF_UZ = { high: "aniq", medium: "o'rtacha", low: "past" } as const;

/** What the agent receives for one post. Unanalysed posts carry only the caption and say so. */
export function postForAgent(post: StoredPost) {
  const meta: MediaMeta | null = parseMediaMeta(post.analysis);
  return {
    type: post.media_type === "VIDEO" ? "reels/video" : post.media_type === "CAROUSEL_ALBUM" ? "karusel" : "rasm",
    posted: post.posted_at?.slice(0, 10) ?? null,
    link: post.permalink,
    caption: post.caption,
    owner_note: post.admin_note,
    ai_analysis: meta
      ? {
          seen_from: post.analyzed_from === "cover" ? "faqat muqova rasmi (video ko'rilmadi)" : post.analyzed_from === "video" ? "video" : "rasm",
          what_is_shown: meta.description,
          product: meta.product,
          text_in_post: meta.visible_text,
          speech_in_video: meta.speech,
          certainty: CONF_UZ[meta.confidence],
        }
      : null,
    note: meta ? undefined : "AI bu postni hali ko'rib chiqmagan — faqat izoh matniga tayaning.",
  };
}

// ---------- One-click connect (Instagram Login) and Direct messages ----------

/** Permissions Javobchi asks for: profile + posts, and reading/answering Direct messages. */
export const INSTAGRAM_SCOPES = ["instagram_business_basic", "instagram_business_manage_messages"] as const;
export const INSTAGRAM_OAUTH_CALLBACK_PATH = "/api/public/instagram/oauth-callback";
export const INSTAGRAM_WEBHOOK_PATH = "/api/public/instagram/webhook";
export const INSTAGRAM_DEAUTHORIZE_PATH = "/api/public/instagram/deauthorize";
export const INSTAGRAM_DATA_DELETION_PATH = "/api/public/instagram/data-deletion";
/** Instagram rejects Direct messages longer than this many characters. */
export const INSTAGRAM_MAX_TEXT = 1000;
/** A connect link is valid for this long. */
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export function buildInstagramAuthorizeUrl(appId: string, redirectUri: string, state: string): string {
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("enable_fb_login", "0");
  url.searchParams.set("force_authentication", "1");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
  url.searchParams.set("state", state);
  return url.toString();
}

export type OAuthState = { userId: string; origin: string; expiresAt: number; nonce: string };

export function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): string | null {
  try {
    const b64 = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
    const bin = atob(b64);
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

/** The unsigned part of the connect-link state (the server appends an HMAC signature). */
export function encodeStateBody(state: OAuthState): string {
  return base64UrlEncode(JSON.stringify({ u: state.userId, o: state.origin, e: state.expiresAt, n: state.nonce }));
}

/** Reads the unsigned state part; null when malformed or expired. Check the signature separately. */
export function decodeStateBody(body: string, now = Date.now()): OAuthState | null {
  const text = base64UrlDecode(body);
  if (!text) return null;
  try {
    const v = JSON.parse(text) as { u?: unknown; o?: unknown; e?: unknown; n?: unknown };
    if (typeof v.u !== "string" || typeof v.o !== "string" || typeof v.e !== "number" || typeof v.n !== "string") return null;
    if (v.e < now) return null;
    return { userId: v.u, origin: v.o, expiresAt: v.e, nonce: v.n };
  } catch {
    return null;
  }
}

export type InstagramAttachment = {
  type: string;
  url: string | null;
  /** For a shared reel/post: the media id, which matches our own posts when the customer shares one of them. */
  mediaId: string | null;
  title: string | null;
};

export type InstagramIncoming = {
  accountId: string;
  senderId: string;
  mid: string;
  text: string | null;
  attachments: InstagramAttachment[];
  timestamp: number | null;
};

/**
 * Reads an Instagram webhook delivery into customer messages. Skips echoes (messages the business sent),
 * read receipts, reactions and deleted messages.
 */
export function parseInstagramWebhook(json: unknown): InstagramIncoming[] {
  const body = json as { object?: unknown; entry?: unknown } | null;
  if (!body || body.object !== "instagram" || !Array.isArray(body.entry)) return [];
  const out: InstagramIncoming[] = [];
  for (const entry of body.entry as Record<string, unknown>[]) {
    const accountId = str(entry?.["id"]);
    const events = Array.isArray(entry?.["messaging"]) ? (entry["messaging"] as Record<string, unknown>[]) : [];
    for (const ev of events) {
      const message = ev["message"] as Record<string, unknown> | undefined;
      if (!message || message["is_echo"] || message["is_deleted"] || message["is_unsupported"]) continue;
      const senderId = str((ev["sender"] as Record<string, unknown> | undefined)?.["id"]);
      const recipientId = str((ev["recipient"] as Record<string, unknown> | undefined)?.["id"]);
      const mid = str(message["mid"]);
      const account = accountId ?? recipientId;
      if (!senderId || !mid || !account || senderId === account) continue;
      const attachments: InstagramAttachment[] = Array.isArray(message["attachments"])
        ? (message["attachments"] as Record<string, unknown>[]).map((a) => {
            const payload = (a?.["payload"] ?? {}) as Record<string, unknown>;
            return {
              type: str(a?.["type"]) ?? "unknown",
              url: str(payload["url"]),
              mediaId: str(payload["reel_video_id"]) ?? str(payload["ig_post_media_id"]) ?? null,
              title: str(payload["title"])?.slice(0, 500) ?? null,
            };
          })
        : [];
      out.push({
        accountId: account,
        senderId,
        mid,
        text: str(message["text"])?.slice(0, 4000) ?? null,
        attachments,
        timestamp: typeof ev["timestamp"] === "number" ? (ev["timestamp"] as number) : null,
      });
    }
  }
  return out;
}

/** Splits a long reply into Instagram-sized messages, preferring paragraph and sentence breaks. */
export function splitInstagramText(text: string, max = INSTAGRAM_MAX_TEXT): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"));
    if (cut < max * 0.5) cut = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? ")) + 1;
    if (cut < max * 0.5) cut = window.lastIndexOf(" ");
    if (cut <= 0) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/** Line the agent sees when the customer shares a post/reel in Direct. `ownPermalink` is set when it is one of ours. */
export function describeSharedPost(att: InstagramAttachment, ownPermalink: string | null): string {
  const what = att.type === "ig_reel" || att.type === "reel" ? "reels" : att.type === "story_mention" ? "storis" : "post";
  const link = ownPermalink ?? att.url;
  const parts = [`[Mijoz Instagram ${what}ini ulashdi${ownPermalink ? " (bu kompaniyaning o'z posti)" : ""}`];
  if (link) parts.push(`havola: ${link}`);
  if (att.title) parts.push(`izohi: "${att.title}"`);
  return `${parts.join("; ")}]`;
}

/** Splits Meta's `signed_request` (deauthorize / data deletion callbacks) into its signature and payload. */
export function splitSignedRequest(value: string): { signature: string; payload: string; data: { user_id?: string } } | null {
  const [signature, payload] = value.split(".");
  if (!signature || !payload) return null;
  const text = base64UrlDecode(payload);
  if (!text) return null;
  try {
    const data = JSON.parse(text) as { user_id?: unknown; algorithm?: unknown };
    if (typeof data.algorithm === "string" && data.algorithm.toUpperCase() !== "HMAC-SHA256") return null;
    return { signature, payload, data: { user_id: data.user_id != null ? String(data.user_id) : undefined } };
  } catch {
    return null;
  }
}
