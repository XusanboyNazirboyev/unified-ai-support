import { describe, expect, it } from "vitest";

import { formatMediaForAgent, mediaKindFromFile, mediaNeedsConfirmation, parseMediaMeta, type MediaMeta } from "@/lib/media";
import { parseTelegramUpdate } from "@/lib/telegram-rules";

const clear: MediaMeta = {
  kind: "photo",
  description: "Qora rangli smartfon qutisi",
  product: "Samsung Galaxy A56",
  visible_text: ["Galaxy A56", "8/256GB"],
  speech: null,
  language: "unknown",
  confidence: "high",
};

describe("customer photos and videos", () => {
  it("asks to confirm when the product is a guess or not recognised", () => {
    expect(mediaNeedsConfirmation(clear)).toBe(false);
    expect(mediaNeedsConfirmation({ ...clear, confidence: "medium" })).toBe(true);
    expect(mediaNeedsConfirmation({ ...clear, product: null })).toBe(true);
  });
  it("tells the agent what was seen, with the confirm flag and the caption", () => {
    const text = formatMediaForAgent("narxi qancha?", { ...clear, confidence: "low" });
    expect(text).toContain("TASDIQLASH KERAK");
    expect(text).toContain("Mahsulot: Samsung Galaxy A56");
    expect(text).toContain("Mijoz yozgan izoh: narxi qancha?");
  });
  it("accepts photos and videos and rejects other files", () => {
    expect(mediaKindFromFile("image/jpeg")?.kind).toBe("photo");
    expect(mediaKindFromFile("", "clip.MOV")?.kind).toBe("video");
    expect(mediaKindFromFile("application/pdf", "a.pdf")).toBeNull();
  });
  it("rejects stored media info without a description", () => {
    expect(parseMediaMeta({ kind: "photo", confidence: "high", description: "" })).toBeNull();
  });
});

describe("Telegram photos and videos", () => {
  const base = { update_id: 5, message: { chat: { id: 7, type: "private", first_name: "Ali" } } };
  it("takes the largest photo size and keeps the caption", () => {
    const u = parseTelegramUpdate({
      ...base,
      message: { ...base.message, caption: "bu bormi?", photo: [{ file_id: "s", file_size: 1000 }, { file_id: "l", file_size: 90000 }] },
    });
    expect(u?.media).toEqual({ kind: "photo", fileId: "l", fileSize: 90000, mime: "image/jpeg" });
    expect(u?.text).toBe("bu bormi?");
  });
  it("reads round video notes as videos", () => {
    const u = parseTelegramUpdate({ ...base, message: { ...base.message, video_note: { file_id: "v", file_size: 300000 } } });
    expect(u?.media?.kind).toBe("video");
  });
});
