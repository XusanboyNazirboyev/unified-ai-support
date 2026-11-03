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
  const docs = posts.map((p) => ({ post: p, ...searchText(p) }));
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
