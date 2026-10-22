import { describe, expect, it } from "vitest";

import { audioFormatFromFile, formatVoiceForAgent, parseVoiceMeta, voiceNeedsConfirmation } from "@/lib/voice";

describe("voice messages", () => {
  it("labels a Karakalpak voice note so the agent replies in Karakalpak", () => {
    const text = formatVoiceForAgent("Meniń TM-1042 buyırtpam qashan keledi?", {
      language: "kaa",
      dialect: null,
      confidence: "high",
      unclear_parts: [],
    });
    expect(text).toContain("til: Qoraqalpoq");
    expect(text).not.toContain("TASDIQLASH KERAK");
    expect(text.endsWith("Meniń TM-1042 buyırtpam qashan keledi?")).toBe(true);
  });

  it("asks for confirmation when a number was not heard clearly", () => {
    const meta = { language: "uz" as const, dialect: "Xorazm shevasi", confidence: "high" as const, unclear_parts: ["TM-25?9"] };
    expect(voiceNeedsConfirmation(meta)).toBe(true);
    expect(formatVoiceForAgent("Mani TM-25?9 buyurtmam", meta)).toContain("TASDIQLASH KERAK");
  });

  it("asks for confirmation when transcription certainty is low", () => {
    expect(voiceNeedsConfirmation({ language: "ru", dialect: null, confidence: "low", unclear_parts: [] })).toBe(true);
  });

  it("does not ask for confirmation for a clear message", () => {
    expect(voiceNeedsConfirmation({ language: "uz", dialect: null, confidence: "high", unclear_parts: [] })).toBe(false);
  });

  it("accepts Telegram/WhatsApp voice note formats", () => {
    expect(audioFormatFromFile("audio/ogg", "voice.ogg")).toBe("ogg");
    expect(audioFormatFromFile("", "PTT-20261022.opus")).toBe("ogg");
    expect(audioFormatFromFile("audio/mp4", "note.m4a")).toBe("m4a");
    expect(audioFormatFromFile("application/pdf", "doc.pdf")).toBeNull();
  });

  it("rejects malformed stored voice data", () => {
    expect(parseVoiceMeta({ language: "xx", confidence: "high" })).toBeNull();
    expect(parseVoiceMeta(null)).toBeNull();
  });
});
