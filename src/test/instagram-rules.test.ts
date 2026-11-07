import { describe, expect, it } from "vitest";

import {
  canAnalyze,
  findInstagramPosts,
  instagramShortcode,
  MAX_ANALYSIS_ATTEMPTS,
  normalizeInstagramToken,
  parseInstagramMediaList,
  pickAnalysisSource,
  postForAgent,
  tokenNeedsRefresh,
  type StoredPost,
} from "@/lib/instagram-rules";

const graph = {
  data: [
    {
      id: "1",
      media_type: "VIDEO",
      caption: "Yangi iPhone 17 Pro keldi!",
      media_url: "https://cdn/v.mp4",
      thumbnail_url: "https://cdn/v.jpg",
      permalink: "https://www.instagram.com/reel/DAbc123xyz/",
      timestamp: "2026-11-01T10:00:00+0000",
    },
    {
      id: "2",
      media_type: "CAROUSEL_ALBUM",
      caption: null,
      permalink: "https://www.instagram.com/p/CXyz987/",
      children: { data: [{ media_type: "VIDEO", thumbnail_url: "https://cdn/c.jpg" }, { media_type: "IMAGE", media_url: "https://cdn/c2.jpg" }] },
    },
    { id: "3", media_type: "STORY" },
  ],
};

function post(over: Partial<StoredPost>): StoredPost {
  return {
    id: "p",
    media_type: "IMAGE",
    caption: null,
    permalink: null,
    shortcode: null,
    posted_at: "2026-11-01T10:00:00Z",
    status: "analyzed",
    analysis: null,
    analyzed_from: "image",
    admin_note: null,
    attempts: 1,
    analyzing_at: null,
    ...over,
  };
}

describe("Instagram media list", () => {
  it("keeps posts, reels and carousels and drops unknown types", () => {
    const items = parseInstagramMediaList(graph);
    expect(items?.map((i) => i.id)).toEqual(["1", "2"]);
    expect(items?.[1]?.children).toHaveLength(2);
  });

  it("rejects a response without a data list", () => {
    expect(parseInstagramMediaList({ error: { message: "x" } })).toBeNull();
  });
});

describe("what the AI looks at", () => {
  const [reel, carousel] = parseInstagramMediaList(graph)!;
  it("watches a reel's video", () => {
    expect(pickAnalysisSource(reel!)).toEqual({ kind: "video", url: "https://cdn/v.mp4", from: "video" });
  });
  it("falls back to a video's cover when the video link is missing", () => {
    expect(pickAnalysisSource(carousel!)).toEqual({ kind: "photo", url: "https://cdn/c.jpg", from: "cover" });
  });
});

describe("Instagram links", () => {
  it("reads the post code from post and reel links", () => {
    expect(instagramShortcode("https://www.instagram.com/reel/DAbc123xyz/?igsh=abc")).toBe("DAbc123xyz");
    expect(instagramShortcode("instagram.com/p/CXyz987")).toBe("CXyz987");
    expect(instagramShortcode("https://example.com/p/CXyz987")).toBeNull();
  });
});

describe("finding the post a customer asks about", () => {
  const phone = post({
    id: "a",
    caption: "Yangi iPhone 17 Pro keldi!",
    shortcode: "DAbc123xyz",
    analysis: { kind: "video", description: "Qora rangli smartfon ko'rsatilgan", product: "Apple iPhone 17 Pro", visible_text: ["15 900 000 so'm"], speech: null, language: "unknown", confidence: "high" },
  });
  const dress = post({ id: "b", caption: "Yozgi ko'ylaklar kolleksiyasi", shortcode: "CXyz987" });

  it("a shared link picks exactly that post", () => {
    expect(findInstagramPosts([phone, dress], "bu qancha", "https://www.instagram.com/p/CXyz987/").map((p) => p.id)).toEqual(["b"]);
  });

  it("matches words from what the AI saw in the video", () => {
    expect(findInstagramPosts([phone, dress], "smartfon narxi", null)[0]?.id).toBe("a");
  });

  it("tells the agent when only the caption is known", () => {
    expect(postForAgent(dress).ai_analysis).toBeNull();
    expect(postForAgent(dress).note).toBeTruthy();
    expect(postForAgent(phone).ai_analysis?.text_in_post).toEqual(["15 900 000 so'm"]);
  });
});

describe("analysis queue", () => {
  const now = Date.parse("2026-11-03T10:00:00Z");
  it("analyses new posts", () => {
    expect(canAnalyze({ status: "pending", attempts: 0, analyzing_at: null }, now)).toBe(true);
  });
  it("stops after the retry limit", () => {
    expect(canAnalyze({ status: "pending", attempts: MAX_ANALYSIS_ATTEMPTS, analyzing_at: null }, now)).toBe(false);
  });
  it("does not take over a post that is being watched right now", () => {
    expect(canAnalyze({ status: "analyzing", attempts: 1, analyzing_at: "2026-11-03T09:58:00Z" }, now)).toBe(false);
    expect(canAnalyze({ status: "analyzing", attempts: 1, analyzing_at: "2026-11-03T09:50:00Z" }, now)).toBe(true);
  });
});

describe("token", () => {
  it("accepts a Meta token and rejects junk", () => {
    expect(normalizeInstagramToken("  IGAA" + "x".repeat(60) + " ")).toBe("IGAA" + "x".repeat(60));
    expect(normalizeInstagramToken("my password")).toBeNull();
  });
  it("is refreshed once it is a week old", () => {
    const now = Date.parse("2026-11-10T00:00:00Z");
    expect(tokenNeedsRefresh("2026-11-02T00:00:00Z", now)).toBe(true);
    expect(tokenNeedsRefresh("2026-11-05T00:00:00Z", now)).toBe(false);
  });
});

import {
  base64UrlEncode,
  buildInstagramAuthorizeUrl,
  decodeStateBody,
  describeSharedPost,
  encodeStateBody,
  parseInstagramWebhook,
  splitInstagramText,
  splitSignedRequest,
} from "@/lib/instagram-rules";

describe("one-click connect", () => {
  it("asks Instagram for profile and Direct message permissions", () => {
    const url = new URL(buildInstagramAuthorizeUrl("123", "https://x.app/api/public/instagram/oauth-callback", "s.t"));
    expect(url.searchParams.get("scope")).toBe("instagram_business_basic,instagram_business_manage_messages");
    expect(url.searchParams.get("redirect_uri")).toBe("https://x.app/api/public/instagram/oauth-callback");
  });

  it("a connect link expires after its time", () => {
    const body = encodeStateBody({ userId: "u1", origin: "https://x.app", expiresAt: 2000, nonce: "n" });
    expect(decodeStateBody(body, 1000)?.userId).toBe("u1");
    expect(decodeStateBody(body, 3000)).toBeNull();
  });
});

describe("Instagram Direct webhook", () => {
  const delivery = {
    object: "instagram",
    entry: [
      {
        id: "17841400000000000",
        messaging: [
          { sender: { id: "999" }, recipient: { id: "17841400000000000" }, timestamp: 1, message: { mid: "m1", text: "Salom, narxi qancha?" } },
          { sender: { id: "17841400000000000" }, recipient: { id: "999" }, message: { mid: "m2", text: "echo", is_echo: true } },
          { sender: { id: "999" }, recipient: { id: "17841400000000000" }, read: { mid: "m1" } },
          {
            sender: { id: "999" },
            recipient: { id: "17841400000000000" },
            message: { mid: "m3", attachments: [{ type: "ig_reel", payload: { reel_video_id: "555", title: "Yangi quloqchin", url: "https://cdn/r.mp4" } }] },
          },
        ],
      },
    ],
  };

  it("keeps customer messages and skips the business's own echoes and read receipts", () => {
    const msgs = parseInstagramWebhook(delivery);
    expect(msgs.map((m) => m.mid)).toEqual(["m1", "m3"]);
    expect(msgs[0]).toMatchObject({ accountId: "17841400000000000", senderId: "999", text: "Salom, narxi qancha?" });
  });

  it("reads a shared reel so it can be matched to the business's own post", () => {
    const att = parseInstagramWebhook(delivery)[1]!.attachments[0]!;
    expect(att.mediaId).toBe("555");
    expect(describeSharedPost(att, "https://www.instagram.com/reel/ABC123/")).toContain("https://www.instagram.com/reel/ABC123/");
  });

  it("ignores deliveries that are not from Instagram", () => {
    expect(parseInstagramWebhook({ object: "page", entry: [] })).toEqual([]);
  });
});

describe("Direct reply length", () => {
  it("splits replies into messages of at most 1000 characters without losing text", () => {
    const text = Array.from({ length: 60 }, (_, i) => `Gap raqami ${i}, bu yerda narx va shartlar haqida.`).join(" ");
    const parts = splitInstagramText(text);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 1000)).toBe(true);
    expect(parts.join(" ").replace(/\s+/g, " ")).toBe(text.replace(/\s+/g, " "));
  });
});

describe("Meta deletion callbacks", () => {
  it("reads the Instagram user from a signed request", () => {
    const payload = base64UrlEncode(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: 42 }));
    expect(splitSignedRequest(`sig.${payload}`)?.data.user_id).toBe("42");
    expect(splitSignedRequest("garbage")).toBeNull();
  });
});

import { instagramTokenKind, pickLinkedInstagramAccount } from "@/lib/instagram-rules";

describe("pasted Instagram tokens", () => {
  const tok = "IGAA" + "x".repeat(150);
  it("accepts a token pasted with Bearer, quotes or line breaks", () => {
    expect(normalizeInstagramToken(`Bearer "${tok.slice(0, 80)}\n${tok.slice(80)}"`)).toBe(tok);
  });
  it("tells Facebook tokens (EAA…) from Instagram tokens (IGAA…)", () => {
    expect(instagramTokenKind("EAAB" + "y".repeat(100))).toBe("facebook");
    expect(instagramTokenKind(tok)).toBe("instagram");
  });
  it("finds the Instagram account linked to a Facebook Page", () => {
    const json = { data: [{ id: "p1" }, { id: "p2", instagram_business_account: { id: "1784", username: "shop" } }] };
    expect(pickLinkedInstagramAccount(json)).toEqual({ id: "1784", username: "shop" });
    expect(pickLinkedInstagramAccount({ data: [{ id: "p1" }] })).toBeNull();
  });
});
